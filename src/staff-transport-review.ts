import {isTransportServiceLocation} from './transport-service-area.ts';
import type {StaffInvoiceSource,StaffPackageChoice} from './staff-invoice-draft.ts';
import type {CoordinatedDraft} from './transport-quote-from-pins.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type StaffTransportSelection={
  bookingId:string;packageChoice:StaffPackageChoice;visit:'pickup'|'dropoff'|'both';
  customerPin:{lat:number;lon:number};
  customerConfirmed:boolean;kennelConfirmed:boolean;accessConfirmed:boolean;
  action:'quote'|'save';revision:number;
};

export function parseStaffTransportSelection(form:URLSearchParams):StaffTransportSelection{
  const allowed=new Set(['id','package','visit','latitude','longitude',
    'customerConfirmed','kennelConfirmed','accessConfirmed','action','revision']);
  if([...form.keys()].some(k=>!allowed.has(k))||
     [...allowed].some(k=>form.getAll(k).length>1))
    throw new Error('Invalid transport form fields');
  const required=(key:string):string=>{
    const v=form.get(key);
    if(!v)throw new Error('Missing '+key);
    return v;
  };
  const bookingId=required('id');
  if(!UUID.test(bookingId))throw new Error('Invalid booking reference');
  const packageChoice=required('package');
  if(packageChoice!=='daily'&&packageChoice!=='monthly')
    throw new Error('Invalid boarding rate selection');
  const visit=required('visit');
  if(visit!=='pickup'&&visit!=='dropoff'&&visit!=='both')
    throw new Error('Choose pickup, drop-off, or both');
  const coordinate=(key:string):number=>{
    const raw=required(key);
    if(!/^-?\d{1,3}(?:\.\d{1,10})?$/.test(raw))throw new Error('Invalid '+key);
    const value=Number(raw);
    if(!Number.isFinite(value))throw new Error('Invalid '+key);
    return value;
  };
  const lat=coordinate('latitude'),lon=coordinate('longitude');
  if(!isTransportServiceLocation(lat,lon))
    throw new Error('Customer pin is outside Islamabad / Rawalpindi transport coverage');
  const confirmed=(key:string):boolean=>{
    const value=form.get(key);
    if(value!==null&&value!=='yes')throw new Error('Invalid road confirmation');
    return value==='yes';
  };
  const action=required('action');
  if(action!=='quote'&&action!=='save')throw new Error('Invalid transport action');
  const rawRevision=required('revision');
  if(!/^(0|[1-9]\d{0,6})$/.test(rawRevision) || Number(rawRevision)>1000000)
    throw new Error('Invalid estimate revision');
  return {
    bookingId,packageChoice,visit,customerPin:{lat,lon},
    customerConfirmed:confirmed('customerConfirmed'),
    kennelConfirmed:confirmed('kennelConfirmed'),
    accessConfirmed:confirmed('accessConfirmed'),
    action,revision:Number(rawRevision)
  };
}
const esc=(s:string):string=>s.replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]??c));
const money=(n:number):string=>'Rs. '+n.toLocaleString('en-PK');
const layout=(title:string,body:string):string=>
  '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><title>'+esc(title)+' | Apex Kennels</title>'+
  '<style>:root{font:15px/1.55 Inter,system-ui,sans-serif;background:#f5f6f3;color:#17362a}'+
  '*{box-sizing:border-box}body{margin:0}.wrap{max-width:830px;margin:35px auto;padding:0 18px}'+
  'h1{font-size:clamp(28px,5vw,42px);letter-spacing:-.045em}h2{font-size:18px}'+
  '.panel{background:white;border:1px solid #d9e3da;border-radius:14px;padding:22px;margin:16px 0}'+
  'input,select,button{font:inherit}input[type=number],select{display:block;width:100%;padding:11px;border:1px solid #bbcfc1;border-radius:8px}'+
  'label{display:block;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}'+
  'button{border:0;background:#204b37;color:white;border-radius:8px;padding:12px 19px;cursor:pointer}'+
  'a{color:#245b43}.muted{color:#6b8074;font-size:13px}.warn{color:#8d4d20}.check{display:flex;gap:10px;align-items:start}'+
  '.check input{margin-top:5px}.result{font-size:22px;font-weight:750}.stat{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #e2e9e1;padding:9px 0}'+
  '@media(max-width:580px){.grid{grid-template-columns:1fr}.panel{padding:17px}}</style></head><body>'+
  '<main class="wrap">'+body+'</main></body></html>';
const hidden=(k:string,v:string|number|boolean):string=>'<input type="hidden" name="'+k+'" value="'+esc(String(v))+'">';

export function renderStaffTransportForm(source:StaffInvoiceSource,
  packageChoice:StaffPackageChoice,revision:number):string{
  const location=source.transportLocation;
  const visit=location?.service??'';
  const option=(value:string,label:string)=>'<option value="'+value+'"'+
    (visit===value?' selected':'')+'>'+label+'</option>';
  return layout('Transport review',
    '<a href="/staff/draft?id='+encodeURIComponent(source.bookingId)+'">← Boarding estimate</a>'+
    '<h1>Price pickup & drop-off</h1>'+
    '<p class="muted">Staff estimate only. No customer message, invoice approval, or payment request.</p>'+
    '<section class="panel"><strong>'+esc(source.customerName)+'</strong> · '+esc(source.petNames)+
    '<p class="muted">Booking '+esc(source.bookingId.slice(0,8))+
    '. Confirm the exact drivable gate, not merely the address.</p>'+
    '<form action="/staff/transport" method="post">'+
    hidden('id',source.bookingId)+hidden('revision',revision)+hidden('action','quote')+
    '<label>Boarding rate<select name="package">'+
    '<option value="daily"'+(packageChoice==='daily'?' selected':'')+'>Daily</option>'+
    '<option value="monthly"'+(packageChoice==='monthly'?' selected':'')+'>30-day package</option></select></label>'+
    '<label>Service<select name="visit" required>'+
    '<option value="">Select service</option>'+option('pickup','Pickup')+
    option('dropoff','Drop-off')+option('both','Pickup and drop-off')+'</select></label>'+
    '<div class="grid">'+
    '<label>Customer gate latitude<input name="latitude" type="number" step="any" min="23" max="38" required value="'+
    (location?esc(String(location.latitude)):'')+'"></label>'+
    '<label>Customer gate longitude<input name="longitude" type="number" step="any" min="60" max="78" required value="'+
    (location?esc(String(location.longitude)):'')+'"></label></div>'+
    '<p class="muted">Use the customer-approved Maps pin or enter a staff-verified pin. '+
    'Old Google Form addresses are not precise enough to price automatically.</p>'+
    '<label class="check"><input type="checkbox" name="customerConfirmed" value="yes">I verified the customer gate and vehicle access</label>'+
    '<label class="check"><input type="checkbox" name="kennelConfirmed" value="yes">I verified the kennel entrance pin</label>'+
    '<label class="check"><input type="checkbox" name="accessConfirmed" value="yes">I verified the Bawli road-access waypoint</label>'+
    '<p class="muted">Each selected service requires kennel → customer → kennel. Two services = two complete loops. '+
    'The road approach must be checked before the number is used.</p>'+
    '<button type="submit">Calculate transport</button></form></section>'
  );
}

export function renderStaffTransportResult(
  source:StaffInvoiceSource,input:StaffTransportSelection,result:CoordinatedDraft
):string {
  const line=result.draft.quote.lines.find(l=>l.label==='Pet transport');
  const ready=result.route.ok&&result.fuelLookup==='CURRENT_NOTIFIED_RATE'&&!!line&&
    !!result.draft.fuelRateSnapshot&&
    input.customerConfirmed&&input.kennelConfirmed&&input.accessConfirmed;
  const route=result.route.ok?result.route.estimate:null;
  const warnings=[...result.draft.unresolved];
  if(!result.route.ok)warnings.push(result.route.detail);
  if(result.fuelLookup==='MANUAL_REVIEW_REQUIRED')warnings.push('Current petrol rate unavailable.');
  const issues=warnings.map(x=>'<li>'+esc(x)+'</li>').join('');
  const keys:Record<string,string|number|boolean>={
    id:input.bookingId,package:input.packageChoice,visit:input.visit,
    latitude:input.customerPin.lat,longitude:input.customerPin.lon,revision:input.revision
  };
  const flags=['customerConfirmed','kennelConfirmed','accessConfirmed'] as const;
  const replay=Object.entries(keys).map(([k,v])=>hidden(k,v)).join('')+
    flags.filter(k=>input[k]).map(k=>hidden(k,'yes')).join('')+hidden('action','save');
  return layout('Transport estimate',
    '<a href="/staff/transport?id='+encodeURIComponent(source.bookingId)+'">← Change transport details</a>'+
    '<h1>Transport estimate</h1><p>'+esc(source.customerName)+' · '+esc(source.petNames)+'</p>'+
    '<section class="panel"><div class="stat"><span>Boarding + requested extras</span><strong>'+
    money(result.draft.quote.lines.filter(l=>l.label!=='Pet transport')
      .reduce((total,l)=>total+l.totalPkr,0)-result.draft.quote.discounts.reduce((total,d)=>total+d.amountPkr,0))+
    '</strong></div>'+
    '<div class="stat"><span>Transport</span><strong>'+(line?money(line.totalPkr):'Not priced')+'</strong></div>'+
    '<div class="stat result"><span>Review total</span><strong>'+money(result.draft.quote.totalPkr)+'</strong></div>'+
    (route?'<p>One complete loop: '+esc(String(route.loopDistanceKm))+' km · '+
      route.plannedRoundTrips+' round trip(s) · Total '+esc(String(route.totalDrivenKm))+' km</p>':'')+
    '<p class="muted">Fuel-only charge at 12 km/L + 20% markup. Staff approval still required. '+
    'No customer invoice has been issued.</p></section>'+
    (issues?'<section class="panel"><h2>Review before final approval</h2><ul>'+issues+'</ul></section>':'')+
    (ready?'<form method="post" action="/staff/transport" class="panel">'+replay+
      '<p class="warn">Saving recalculates the route and fetches a fresh fuel rate. '+
      'The saved result is an internal estimate, not an issued invoice.</p>'+
      '<button type="submit">Save review-only estimate</button></form>':
      '<p class="warn">No estimate can be saved until the route and current fuel rate are verified.</p>')
  );
}
