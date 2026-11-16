/** Global Geoapify budget. Storage contains only a UTC day and a count, never locations or identities. */
export const LOCATION_SEARCH_DAILY_LIMIT=250;
// Keep this name, class and namespace stable across deploys/rollbacks. Resetting
// their identity would grant another same-day allowance. Stop search with the
// search-only kill switch; do not rotate the shared route provider key.
const OBJECT_NAME='search-v1';
const INTERNAL_URL='https://location-search-budget.internal/consume';
type Counter={day:string;count:number};
export type BudgetTransaction={get<T>(key:string):Promise<T|undefined>;put<T>(key:string,value:T):Promise<void>};
export type BudgetState={storage:{transaction<T>(callback:(transaction:BudgetTransaction)=>Promise<T>):Promise<T>}};
export type LocationSearchBudgetNamespace={idFromName(name:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}};
const answer=(success:boolean,status=200)=>Response.json({success},{status,headers:{'Cache-Control':'no-store'}});

/** Called only through the namespace binding. There is deliberately no public Worker route. */
export class LocationSearchBudget {
  private readonly state:BudgetState;
  private readonly now:()=>number;
  constructor(state:BudgetState,_env?:unknown,now:()=>number=Date.now){this.state=state;this.now=now;}
  async fetch(request:Request):Promise<Response>{
    if(request.method!=='POST'||request.url!==INTERNAL_URL)return answer(false,400);
    try{
      // workerd may represent an empty POST as an empty stream, unlike Node.
      // Read at most one chunk; any body data is outside the internal contract.
      if(request.body){const reader=request.body.getReader();const first=await reader.read();await reader.cancel();if(!first.done)return answer(false,400);}
      const day=new Date(this.now()).toISOString().slice(0,10);
      const success=await this.state.storage.transaction(async storage=>{
        const raw=await storage.get<unknown>('daily');
        const previous=raw as Counter|undefined;
        // A corrupt/future counter never silently grants a fresh budget.
        if(raw!==undefined&&(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==2||!Object.hasOwn(raw,'day')||!Object.hasOwn(raw,'count')||!/^\d{4}-\d{2}-\d{2}$/.test(previous!.day)||new Date(previous!.day+'T00:00:00Z').toISOString().slice(0,10)!==previous!.day||!Number.isSafeInteger(previous!.count)||previous!.count<0||previous!.count>LOCATION_SEARCH_DAILY_LIMIT||previous!.day>day))throw new Error('Invalid budget state');
        const count=previous?.day===day?previous.count:0;
        if(count>=LOCATION_SEARCH_DAILY_LIMIT)return false;
        await storage.put('daily',{day,count:count+1});return true;
      });
      return answer(success);
    }catch{return answer(false,503);}
  }
}

/** Reserve before provider work. No retries/refunds: uncertain consumption remains consumed. */
export async function consumeLocationSearchBudget(namespace?:LocationSearchBudgetNamespace):Promise<{success:boolean}>{
  if(!namespace)return {success:false};
  try{
    const stub=namespace.get(namespace.idFromName(OBJECT_NAME));
    const response=await stub.fetch(new Request(INTERNAL_URL,{method:'POST',signal:AbortSignal.timeout(4000)}));
    if(!response.ok)return {success:false};
    // Only the tiny internal contract is accepted; do not reflect storage failures.
    const raw=await response.text();if(raw.length>64)return {success:false};
    const result=JSON.parse(raw);
    return {success:result!==null&&typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).length===1&&result.success===true};
  }catch{return {success:false};}
}
