import {Client} from '@neondatabase/serverless';

const transitions={
  start_review:['requested','reviewing'],
  approve:['reviewing','approved'],
  decline:['reviewing','declined'],
  check_in:['approved','approved'],
  check_out:['approved','completed']
} as const;
export type StayAction=keyof typeof transitions;
export type StayEvent={
  revision:number;action:StayAction;prior_status:string;new_status:string;
  actor:string;recorded_at:string;reason:string|null;vaccination_attested:boolean;
};
type Decision={action:StayAction;revision:number;expectedStatus:string;reason:string|null;vaccinationAttested:boolean};
export class StayError extends Error {
  readonly status:number;
  constructor(message:string,status=409){super(message);this.status=status;}
}

export function availableStayActions(status:string,history:readonly StayEvent[]):StayAction[]{
  if(status==='requested')return ['start_review'];
  if(status==='reviewing')return ['approve','decline'];
  if(status==='approved')return history.some(event=>event.action==='check_in')?['check_out']:['check_in'];
  return [];
}

export function parseStayDecision(form:URLSearchParams):Decision {
  const keys=['action','revision','expectedStatus','reason','vaccinationAttested'];
  if([...form.keys()].some(key=>!keys.includes(key)||form.getAll(key).length!==1))
    throw new StayError('Unexpected stay action fields',400);
  const action=form.get('action')??'';
  const revision=form.get('revision')??'';
  const expectedStatus=form.get('expectedStatus')??'';
  const reason=form.get('reason')?.trim()||null;
  const vaccinationAttested=form.get('vaccinationAttested');
  if(!Object.hasOwn(transitions,action)||!/^\d{1,6}$/.test(revision)||
    expectedStatus!==transitions[action as StayAction][0]||
    (action==='decline')!==!!reason||reason&&(reason.length>250||/[\u0000-\u001f\u007f]/.test(reason))||
    (action==='approve'?vaccinationAttested!=='yes':vaccinationAttested!==null))
    throw new StayError('Check the stay action, decline reason or vaccination attestation',400);
  return {action:action as StayAction,revision:Number(revision),expectedStatus,reason,vaccinationAttested:vaccinationAttested==='yes'};
}

export type StayDb={query<T>(sql:string,params:unknown[]):Promise<{rows:T[]}>};
export async function readStayHistory(db:StayDb,id:string):Promise<StayEvent[]>{
  const result=await db.query<StayEvent>(
    'SELECT revision,action,prior_status,new_status,actor,recorded_at::text,reason,vaccination_attested '+
    'FROM public.booking_stay_history WHERE booking_id=$1 ORDER BY revision',[id]);
  return result.rows;
}

export async function applyStayDecision(db:StayDb,id:string,actor:string,decision:Decision):Promise<void>{
  const {rows:[booking]}=await db.query<{status:string}>(
    'SELECT status FROM public.booking_requests WHERE id=$1 FOR UPDATE',[id]);
  if(!booking)throw new StayError('Booking not found',404);
  const history=await readStayHistory(db,id);
  const last=history.at(-1);
  const replay=history.find(event=>event.revision===decision.revision+1);
  if(replay?.action===decision.action&&replay.actor===actor&&replay.prior_status===decision.expectedStatus&&
    replay.reason===decision.reason&&replay.vaccination_attested===decision.vaccinationAttested)return;
  if((last?.revision??0)!==decision.revision||booking.status!==decision.expectedStatus||
     !availableStayActions(booking.status,history).includes(decision.action))
    throw new StayError('Booking changed. Reload its details before recording an action.');
  const status=transitions[decision.action][1];
  await db.query('UPDATE public.booking_requests SET status=$2 WHERE id=$1',[id,status]);
  await db.query(
    'INSERT INTO public.booking_stay_history (booking_id,revision,action,prior_status,new_status,actor,reason,vaccination_attested) '+
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id,decision.revision+1,decision.action,booking.status,status,actor,decision.reason,decision.vaccinationAttested]);
}

export async function recordStayDecision(databaseUrl:string,id:string,actor:string,decision:Decision):Promise<void>{
  const db=new Client(databaseUrl);
  await db.connect();
  try{
    await db.query('BEGIN');
    try{
      await applyStayDecision(db,id,actor,decision);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
  }finally{await db.end();}
}
