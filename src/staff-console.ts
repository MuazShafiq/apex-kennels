import type { StaffBooking, StaffFilter } from './staff-bookings.ts';
import { BOOKING_STATUSES } from './staff-bookings.ts';

export type StaffPage = {demo:boolean; filter:StaffFilter; email?:string};

function escapeHtml(value:string):string {
  return value.replace(/[&<>"']/g, c => c === '&' ? '&amp;'
    : c === '<' ? '&lt;' : c === '>' ? '&gt;'
    : c === '"' ? '&quot;' : '&#39;');
}
function title(value:string):string { return value.charAt(0).toUpperCase()+value.slice(1); }

const styles = [
  ':root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1b2d29;background:#f4f6f3}',
  '*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{font-size:14px}a{color:inherit;text-decoration:none}',
  '.shell{display:flex;min-height:100vh}.sidebar{width:236px;padding:34px 22px;background:#182e2b;color:#f6f5ee;display:flex;flex-direction:column;flex-shrink:0}',
  '.brand{font-size:19px;letter-spacing:.2em;font-weight:800}.under{font-size:10px;color:#a6bab2;letter-spacing:.21em;margin-top:2px}',
  '.secondarynav{display:block;margin:12px 0 0;color:#d5e5d9;padding:12px 15px;font-size:12px}.navlabel{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#a1b1a8;margin:70px 0 17px}.nav{background:#344e46;padding:15px;border-radius:9px;font-weight:700}',
  '.sidebarfoot{margin-top:auto;font-size:12px;color:#afc0b8;line-height:1.9;border-top:1px solid #3b544b;padding-top:22px}',
  'main{flex:1;padding:44px clamp(18px,4.6vw,72px);max-width:1600px;margin:0 auto;min-width:0}',
  '.top{display:flex;justify-content:space-between;color:#8a9a91;font-size:12px;margin-bottom:50px;gap:12px}',
  '.tag{font-size:10px;font-weight:800;letter-spacing:.1em;border-radius:40px;background:#e6efe8;color:#547362;padding:9px 12px;white-space:nowrap}',
  '.kicker{font-size:11px;font-weight:800;letter-spacing:.2em;color:#8da097}.heading{display:flex;justify-content:space-between;align-items:end;margin:13px 0 34px;gap:15px}',
  'h1{font-size:clamp(32px,4vw,48px);line-height:1;letter-spacing:-.055em;margin:0;font-weight:680}h2{margin:0;font-size:18px;letter-spacing:-.025em}',
  '.sub{font-size:13px;color:#819089;line-height:1.7;margin:15px 0 0}.hint{font-size:12px;color:#82938a}',
  '.notice{background:#fff0d7;border:1px solid #e8cb98;padding:17px 20px;border-radius:11px;color:#835b21;font-size:12px;margin-bottom:24px}',
  '.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-bottom:24px}',
  '.metric{padding:24px;background:#fff;border:1px solid #e3eae5;border-radius:14px}.metriclabel{font-size:12px;color:#81928a}.number{font-size:43px;font-weight:670;letter-spacing:-.06em;margin:14px 0 7px}.fine{font-size:11px;color:#95a19b}',
  '.panel{border:1px solid #e3eae5;background:#fff;border-radius:14px;overflow:hidden}',
  '.panelhead{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:25px}',
  'form{display:flex;gap:8px;flex-wrap:wrap}input,select{padding:11px 12px;border:1px solid #dce6de;background:#fbfcfa;border-radius:8px;font:inherit;color:#385247;font-size:12px}',
  'button{background:#234138;color:#fff;border:0;padding:11px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}',
  '.overflow{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:800px}',
  'thead{background:#f7f9f6}th{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#88988e;padding:16px 22px}',
  'td{border-top:1px solid #eef2ee;padding:19px 22px;vertical-align:middle;white-space:nowrap}',
  '.strong{font-weight:690;color:#293e35}.secondary{font-size:11px;color:#89998e;margin-top:6px}',
  '.action{color:#21664c;font-size:12px;font-weight:700;text-decoration:underline;text-underline-offset:4px}.state{display:inline-block;font-size:11px;font-weight:720;padding:8px 11px;border-radius:30px;background:#edf2ec;color:#597263}',
  '.testmark{font-size:9px;letter-spacing:.07em;color:#9c6b2c;background:#fff2d9;padding:4px 7px;border-radius:4px;margin-left:8px;font-weight:800}.requested{background:#fff2dc;color:#956e2b}.reviewing{background:#e9f0f8;color:#557a9c}.approved{background:#e6f3ea;color:#367552}',
  '.declined,.cancelled{background:#f8e9e9;color:#ac6161}.completed{background:#e7eeea;color:#3a7460}',
  '.panelbottom{border-top:1px solid #e9efea;padding:18px 25px;color:#93a19a;font-size:11px;display:flex;justify-content:space-between}',
  '.foot{margin-top:21px;color:#8e9a94;font-size:11px;line-height:1.8}',
  '@media(max-width:970px){.sidebar{width:140px;padding:28px 12px}.brand{font-size:15px}.nav{font-size:12px}.heading,.panelhead{align-items:start;flex-direction:column}main{padding:30px 18px}}',
  '@media(max-width:650px){.sidebar{display:none}main{padding:24px 13px}.metric{padding:13px}.number{font-size:32px}.metriclabel,.fine{font-size:10px}form input{max-width:155px}.panelhead{padding:20px}.heading{margin-bottom:24px}}',
  "/* Apex brand follows the actual Canva invoice: ink, periwinkle, powder blue. */\n:root{color:#1b1c2c;background:#f4faff}\nbody{background:#f4faff}\n.sidebar{background:#191b35;color:#f3f7ff;border-right:1px solid #333a68}\n.sidebar a{color:inherit}\n.brand-wrap{display:flex;align-items:center;gap:10px}\n.brand-mark{width:45px;height:42px;object-fit:contain;display:block;background:#ddf4ff;border-radius:9px;padding:5px}\n.brand{color:#fff;font-size:18px;letter-spacing:.12em}\n.under{color:#c2c9f4;letter-spacing:.14em}\n.navlabel{color:#aab3da}\n.nav{background:#3e4095}\n.secondarynav,.sidebarfoot{color:#c5cee7}\n.sidebarfoot{border-top-color:#373a60}\n.shell{background:linear-gradient(180deg,#ddf4ff 0,#f4faff 335px)}
main{background:transparent}\n.top{color:#56658a}\n.tag{background:#eff1ff;color:#40489b}\n.kicker{color:#3e4095}\nh1,h2{color:#191b2e}\n.sub,.hint{color:#69738e}\n.metric,.panel{border-color:#d1e0f3;box-shadow:0 10px 32px rgba(39,62,130,.03)}\n.metriclabel,.fine,.secondary,.foot{color:#68758f}\n.number,.strong{color:#242747}\n.panelhead{background:#fff}\ninput,select{border-color:#bfcee8;background:#faffff;color:#343b69}\nbutton{background:#3e4095}\nthead{background:#eff7ff}\nth{color:#52659a}\ntd{border-top-color:#e3edf8}\n.action{color:#3e4095}\n.state{background:#ecf1ff;color:#47518e}\n.reviewing{background:#e8edff;color:#3e4095}\n.approved{background:#e6f4ed;color:#336f52}\n.completed{background:#e8edf5;color:#536787}\n.panelbottom{border-top-color:#d8e5f5;color:#62718f}\na:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8393da;outline-offset:3px}\n.mobilebrand{display:none;align-items:center;gap:8px;margin-bottom:16px;color:#3e4095;font-weight:850;letter-spacing:.1em}\n.mobilebrand img{width:37px;height:33px}\n@media(max-width:650px){.mobilebrand{display:flex}.top{margin-bottom:30px}.cards{gap:8px}.metric{min-width:0}.metriclabel{font-size:10px}.number{font-size:29px}.panelbottom{flex-wrap:wrap;gap:5px}}\n@media(max-width:360px){main{padding:21px 11px}.metric{padding:10px}.number{font-size:26px}}\n"
].join('');

export function renderStaffConsoleHtml(rows:StaffBooking[], page:StaffPage):string {
  const base = page.demo ? '/demo/staff' : '/staff';
  const q = page.filter.query.toLowerCase();
  const visible = page.demo
    ? rows.filter(row => (page.filter.status === 'all' || row.status === page.filter.status)
      && (!q || (row.customerName + ' ' + row.petNames).toLowerCase().includes(q)))
    : rows;
  const statuses = ['all',...BOOKING_STATUSES].map(status =>
    '<option value="' + status + '"' + (status===page.filter.status?' selected':'') + '>'
      + title(status) + '</option>').join('');
  const tr = visible.map(row=>'<tr><td><div class="strong">'+escapeHtml(row.customerName)+(row.isSynthetic?'<span class="testmark">TEST RECORD</span>':'')+'</div><div class="secondary">'+escapeHtml(row.id.slice(0,8))+'</div></td>'
    + '<td><div class="strong">'+escapeHtml(row.petNames)+'</div><div class="secondary">'+escapeHtml(row.accommodationType||'Not assigned')+'</div></td>'
    + '<td><div>'+escapeHtml(row.startDate)+'</div><div class="secondary">to '+escapeHtml(row.endDate)+'</div></td>'
    + '<td><span class="state '+row.status+'">'+title(row.status)+'</span></td>'
    + '<td><div class="secondary">'+escapeHtml(row.email||row.phone||(page.demo?'Demo record':'No contact'))+'</div></td>'
    + '<td>'
    + '<a class="action" href="'+(page.demo?'/demo/draft':'/staff/booking?id='+encodeURIComponent(row.id))+'">'+(page.demo?'View example':'Review booking')+'</a></td></tr>').join('');
  const c = (status:string)=>visible.filter(row=>row.status===status).length;
  const metric=(label:string,value:number,note:string)=>'<article class="metric"><div class="metriclabel">'+label+'</div><div class="number">'+value+'</div><div class="fine">'+note+'</div></article>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>Apex Kennels | Booking operations</title><style>'+styles+'</style></head><body>'
    + '<div class="shell"><aside class="sidebar"><a href="'+base+'" class="brand-wrap"><img class="brand-mark" src="/book/apex-dog-mark.svg" alt="" width="45" height="42"><div><div class="brand">APEX</div><div class="under">KENNELS</div></div></a>'
    + '<div class="navlabel">Workspace</div><a class="nav" href="'+base+'">▦ &nbsp; Bookings</a>'
    + '<div class="sidebarfoot">Staff bookings</div></aside>'
    + '<main><div class="mobilebrand"><img src="/book/apex-dog-mark.svg" alt="" width="37" height="33">APEX KENNELS</div><div class="top"><span>Apex Kennels &nbsp; / &nbsp; Operations &nbsp; / &nbsp; Bookings</span><span class="tag">'+(page.demo?'SYNTHETIC DEMO':'STAFF · READ ONLY')+'</span></div>'
    + (page.demo?'<div class="notice"><strong>DEMO ONLY.</strong> All bookings and names below are synthetic. This preview uses no customer records, database, or automated invoicing.</div>':'')
    + '<div class="kicker">BOOKINGS</div><div class="heading"><div><h1>Booking requests</h1><p class="sub">Open a request to review the dog’s details and care needs.</p></div>'
    + '<div class="hint">'+(page.demo?'Illustrative preview':'Signed in: '+escapeHtml(page.email||'Staff'))+'</div></div>'
    + '<section class="cards">'+metric('Visible bookings',visible.length,'Latest 50 maximum')+metric('New requests',c('requested'),'Awaiting review')+metric('Under review',c('reviewing'),'Staff decision pending')+'</section>'
    + '<section class="panel"><div class="panelhead"><div><h2>Recent requests</h2></div>'
    + '<form action="'+base+'" method="get"><input aria-label="Search by customer or pet" name="q" type="search" maxlength="80" placeholder="Search owner or pet" value="'+escapeHtml(page.filter.query)+'">'
    + '<select aria-label="Filter booking status" name="status">'+statuses+'</select><button type="submit">Filter</button></form></div>'
    + '<div class="overflow"><table><thead><tr><th>Owner / reference</th><th>Dog / space</th><th>Boarding dates</th><th>Status</th><th>Contact</th><th>Action</th></tr></thead><tbody>'
    + (tr || '<tr><td colspan="6" style="padding:45px;text-align:center;color:#8d9d91">No matching bookings.</td></tr>')
    + '</tbody></table></div><div class="panelbottom"><span>'+visible.length+' requests · newest first</span></div></section>'
    + '<p class="foot">Estimates are for staff review, not payment. '+(page.demo?'':'<a href="/staff/location">Check a location from the old Google Form</a>')+'</p></main></div></body></html>';
}
