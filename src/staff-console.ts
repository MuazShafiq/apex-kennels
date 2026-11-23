import { BOOKING_STATUSES,type StaffBooking,type StaffFilter } from './staff-bookings.ts';

export type StaffPage = {demo:boolean;filter:StaffFilter;email?:string;selectedId?:string;now?:Date};

const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]??c));
const title=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
const dayFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',weekday:'short',day:'numeric',month:'short'});
const fullDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'});
const checkedIn=(row:StaffBooking)=>row.status==='approved'&&!!row.checkedInAt;

const styles=`
:root{font:15px/1.45 system-ui,sans-serif;color:#120709;background:#f2f8fc;--hair:#d3e3ec;--muted:#5b5156;--raven:#120709;--powder:#bfe3f4}
*{box-sizing:border-box}body{margin:0}.shell{min-height:100vh;background:linear-gradient(180deg,#eef6fa,#f2f8fc 400px)}a{color:inherit}a,button,input,select{outline-offset:4px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #9e122b}
nav{background:var(--raven);color:white;display:flex;align-items:center;gap:24px;padding:12px clamp(16px,4vw,64px);flex-wrap:wrap}nav a{min-height:44px;display:inline-flex;align-items:center;text-decoration:none}nav a[aria-current]{border-bottom:2px solid var(--powder)}.brand{font-weight:850;letter-spacing:.09em;gap:10px}.brand img{background:var(--powder);padding:4px;border-radius:8px}.who{margin-left:auto;overflow-wrap:anywhere}
main{padding:28px max(clamp(14px,3vw,48px),calc((100% - 1680px)/2))}.top{display:flex;align-items:end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:20px}
h1,h2,h3,p{margin:0}h1{font-size:clamp(32px,4vw,52px);line-height:.98;letter-spacing:-.055em}h1 span{color:#9e122b}.subtitle,.muted{color:var(--muted)}.subtitle{margin-top:8px}
form{display:flex;flex-wrap:wrap;gap:8px;min-width:0}input,select,button,.action{min-height:44px;border-radius:9px;font:inherit;padding:8px 12px;border:1px solid var(--hair);max-width:100%}input,select{background:white}button,.action{background:var(--raven);color:white;text-decoration:none;font-weight:700;cursor:pointer}
.week,.lane,.selected,.notice{background:white;border:1px solid var(--hair);border-radius:16px;padding:15px}.notice,.week{margin:0 0 20px}.week h2,.lane h2,.selected h2{font-size:17px;letter-spacing:-.025em}.week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:12px}.day{background:#eef6fa;border-radius:9px;padding:8px;min-width:0}.day b,.day span{display:block}.day span,.lane-count,.meta{font-size:12px;color:var(--muted)}
.run{display:grid;gap:18px;align-items:start}.lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.lane{min-width:0}.lane header{display:flex;gap:8px;justify-content:space-between;align-items:baseline;margin-bottom:12px}.lane-count{white-space:nowrap}.stay{display:block;padding:12px;margin-top:8px;border:1px solid var(--hair);border-radius:12px;background:#f6fafc;text-decoration:none;overflow-wrap:anywhere}.stay:hover,.stay[aria-current]{background:#eef6fa;border-color:#527489}.stay h3{font-size:18px}.meta{margin-top:4px}.chip{display:inline-block;padding:3px 7px;border-radius:6px;background:#e5edf2;font-size:12px;font-weight:750}.chip.in{background:#d7f0e6;color:#174a3b}.chip.review{background:#ffe9df;color:#861729}.test{background:#fff0d0;color:#6f4610}
.selected{overflow-wrap:anywhere;scroll-margin-top:12px}.selected p{margin:10px 0}.action{display:inline-flex;align-items:center}.foot{margin-top:16px;font-size:13px;color:var(--muted)}.empty{padding:12px 0;font-size:14px}
@media(min-width:1240px){.run{grid-template-columns:minmax(0,1fr) 344px}.selected{position:sticky;top:14px}}
@media(max-width:800px){.lanes{grid-template-columns:1fr}.selected{grid-row:1}.week-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:480px){nav{gap:8px 14px}.who{display:none}form input{flex:1 1 100%}.week-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

function weekStrip(rows:StaffBooking[],now:Date):string{
  const approved=rows.filter(row=>row.status==='approved'&&!row.isSynthetic);
  const midnight=Date.parse(dateKey.format(now)+'T00:00:00+05:00');
  const days=Array.from({length:7},(_,offset)=>{
    const day=new Date(midnight+offset*86_400_000);
    const key=dateKey.format(day);
    const arriving=approved.filter(row=>row.startDate===key&&!checkedIn(row));
    const departing=approved.filter(row=>row.endDate===key);
    const pins=arriving.filter(row=>row.transportService==='pickup'||row.transportService==='both').length
      +departing.filter(row=>row.transportService==='dropoff'||row.transportService==='both').length;
    return '<div class="day"><b>'+dayFormat.format(day)+'</b><span>'+arriving.length+' arrivals</span><span>'
      +departing.length+' departures</span>'+(pins?'<span>'+pins+' gate requests</span>':'')+'</div>';
  }).join('');
  return '<section class="week"><h2>Coming week</h2><div class="week-grid">'+days+'</div></section>';
}

export function renderStaffConsoleHtml(rows:StaffBooking[],page:StaffPage):string {
  const base=page.demo?'/demo/staff':'/staff';
  const now=page.now??new Date();
  const q=page.filter.query.toLowerCase();
  const visible=page.demo?rows.filter(row=>(page.filter.status==='all'||page.filter.status===row.status)
    &&(!q||(row.customerName+' '+row.petNames).toLowerCase().includes(q))):rows;
  const selected=visible.find(row=>row.id===page.selectedId);
  const href=(row:StaffBooking)=>page.demo?'/demo/draft':'/staff/booking?id='+encodeURIComponent(row.id);
  const status=(row:StaffBooking)=>checkedIn(row)?'Checked in':title(row.status);
  const card=(row:StaffBooking)=>{
    const query=new URLSearchParams({status:page.filter.status,q:page.filter.query,stay:row.id});
    const target=page.demo?href(row):base+'?'+query.toString()+'#selected-stay';
    return '<a class="stay" href="'+esc(target)+'"'+(selected?.id===row.id?' aria-current="true"':'')+'>'
      +'<span class="chip '+(checkedIn(row)?'in':row.status==='reviewing'?'review':'')+'">'+status(row)+'</span>'
      +(row.isSynthetic?' <span class="chip test">TEST RECORD</span>':'')
      +'<h3>'+esc(row.petNames||'Dog name missing')+'</h3><p>'+esc(row.customerName)+'</p>'
      +'<p class="meta">'+esc(row.startDate)+' → '+esc(row.endDate)+'</p></a>';
  };
  const review=visible.filter(row=>row.status==='requested'||row.status==='reviewing');
  const approved=visible.filter(row=>row.status==='approved');
  const closed=visible.filter(row=>['cancelled','declined','completed'].includes(row.status));
  const lane=(label:string,items:StaffBooking[])=>'<section class="lane"><header><h2>'+label+'</h2><span class="lane-count">'
    +items.length+(items.length===1?' stay':' stays')+'</span></header>'
    +(items.length?items.map(card).join(''):'<p class="muted empty">No matching stays.</p>')+'</section>';
  const option=(value:string)=>'<option value="'+value+'"'+(value===page.filter.status?' selected':'')+'>'+title(value)+'</option>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Apex Kennels | Run sheet</title><style>'+styles+'</style></head><body><div class="shell">'
    +'<nav aria-label="Staff sections"><a class="brand" href="'+base+'"><img src="/book/apex-dog-mark.svg" alt="" width="34" height="34">APEX KENNELS</a>'
    +'<a aria-current="page" href="'+base+'">Run sheet</a>'
    +(page.demo?'':'<a href="/staff/owner-alerts">Owner alerts</a><span class="who">Signed in: '+esc(page.email||'Staff')+'</span>')+'</nav>'
    +'<main>'+(page.demo?'<p class="notice"><strong>SYNTHETIC DEMO.</strong> All bookings and names are fictional.</p>':'')
    +'<div class="top"><div><h1>'+review.length+(review.length===1?' request':' requests')+' to review<span>.</span></h1>'
    +'<p class="subtitle">'+fullDate.format(now)+' · front desk</p></div>'
    +'<form action="'+base+'" method="get"><input aria-label="Search dog or owner" name="q" type="search" maxlength="80" placeholder="Search dog or owner" value="'+esc(page.filter.query)+'">'
    +'<select aria-label="Filter booking status" name="status">'+['all',...BOOKING_STATUSES].map(option).join('')+'</select><button type="submit">Filter</button></form></div>'
    +weekStrip(visible,now)+'<div class="run"><div class="lanes">'+lane('To review',review)+lane('Approved stays',approved)+lane('Closed',closed)
    +'</div><aside class="selected" id="selected-stay" aria-label="Selected stay">'
    +(selected?'<span class="chip">'+status(selected)+'</span><h2>'+esc(selected.petNames||'Dog name missing')+'</h2><p>'+esc(selected.customerName)
      +'<br>'+esc(selected.startDate)+' → '+esc(selected.endDate)+'</p>'
      +(selected.isSynthetic?'<p class="chip test">TEST RECORD · DO NOT CONTACT</p>':'')
      +'<p><a class="action" href="'+esc(href(selected))+'">View details</a></p>'
      :'<h2>Selected stay</h2><p class="muted">Select a stay to see its details.</p>')
    +'</aside></div><p class="foot">'+visible.length+' matching bookings shown · latest 50 maximum. Week counts cover the bookings shown.</p></main></div></body></html>';
}
