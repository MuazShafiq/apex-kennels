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
  '.navlabel{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#a1b1a8;margin:70px 0 17px}.nav{background:#344e46;padding:15px;border-radius:9px;font-weight:700}',
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
  '.state{display:inline-block;font-size:11px;font-weight:720;padding:8px 11px;border-radius:30px;background:#edf2ec;color:#597263}',
  '.requested{background:#fff2dc;color:#956e2b}.reviewing{background:#e9f0f8;color:#557a9c}.approved{background:#e6f3ea;color:#367552}',
  '.declined,.cancelled{background:#f8e9e9;color:#ac6161}.completed{background:#e7eeea;color:#3a7460}',
  '.panelbottom{border-top:1px solid #e9efea;padding:18px 25px;color:#93a19a;font-size:11px;display:flex;justify-content:space-between}',
  '.foot{margin-top:21px;color:#8e9a94;font-size:11px;line-height:1.8}',
  '@media(max-width:970px){.sidebar{width:140px;padding:28px 12px}.brand{font-size:15px}.nav{font-size:12px}.heading,.panelhead{align-items:start;flex-direction:column}main{padding:30px 18px}}',
  '@media(max-width:650px){.sidebar{display:none}main{padding:24px 13px}.metric{padding:13px}.number{font-size:32px}.metriclabel,.fine{font-size:10px}form input{max-width:155px}.panelhead{padding:20px}.heading{margin-bottom:24px}}'
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
  const tr = visible.map(row=>'<tr><td><div class="strong">'+escapeHtml(row.customerName)+'</div><div class="secondary">'+escapeHtml(row.id.slice(0,8))+'</div></td>'
    + '<td><div class="strong">'+escapeHtml(row.petNames)+'</div><div class="secondary">'+escapeHtml(row.accommodationType||'Not assigned')+'</div></td>'
    + '<td><div>'+escapeHtml(row.startDate)+'</div><div class="secondary">to '+escapeHtml(row.endDate)+'</div></td>'
    + '<td><span class="state '+row.status+'">'+title(row.status)+'</span></td>'
    + '<td><div class="secondary">'+escapeHtml(row.email||row.phone||(page.demo?'Demo record':'No contact'))+'</div></td></tr>').join('');
  const c = (status:string)=>visible.filter(row=>row.status===status).length;
  const metric=(label:string,value:number,note:string)=>'<article class="metric"><div class="metriclabel">'+label+'</div><div class="number">'+value+'</div><div class="fine">'+note+'</div></article>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>Apex Kennels | Booking operations</title><style>'+styles+'</style></head><body>'
    + '<div class="shell"><aside class="sidebar"><a href="'+base+'"><div class="brand">APEX</div><div class="under">KENNELS</div></a>'
    + '<div class="navlabel">Workspace</div><a class="nav" href="'+base+'">▦ &nbsp; Bookings</a>'
    + '<div class="sidebarfoot">Operations console<br>Read-only foundation.<br>Pricing and invoices pending.</div></aside>'
    + '<main><div class="top"><span>Apex Kennels &nbsp; / &nbsp; Operations &nbsp; / &nbsp; Bookings</span><span class="tag">'+(page.demo?'SYNTHETIC DEMO':'STAFF · READ ONLY')+'</span></div>'
    + (page.demo?'<div class="notice"><strong>DEMO ONLY.</strong> All bookings and names below are synthetic. This preview uses no customer records, database, or automated invoicing.</div>':'')
    + '<div class="kicker">OPERATIONS / 01</div><div class="heading"><div><h1>Booking overview.</h1><p class="sub">Everything that came in, ready for review.<br>Submission does not mean acceptance.</p></div>'
    + '<div class="hint">'+(page.demo?'Illustrative preview':'Signed in: '+escapeHtml(page.email||'Staff'))+'</div></div>'
    + '<section class="cards">'+metric('Visible bookings',visible.length,'Latest 50 maximum')+metric('New requests',c('requested'),'Awaiting review')+metric('Under review',c('reviewing'),'Staff decision pending')+'</section>'
    + '<section class="panel"><div class="panelhead"><div><h2>Booking queue</h2><p class="sub">Read-only until staff approvals are configured.</p></div>'
    + '<form action="'+base+'" method="get"><input aria-label="Search by customer or pet" name="q" type="search" maxlength="80" placeholder="Search owner or pet" value="'+escapeHtml(page.filter.query)+'">'
    + '<select aria-label="Filter booking status" name="status">'+statuses+'</select><button type="submit">Filter</button></form></div>'
    + '<div class="overflow"><table><thead><tr><th>Customer / ID</th><th>Pet / type</th><th>Stay dates</th><th>Status</th><th>Contact</th></tr></thead><tbody>'
    + (tr || '<tr><td colspan="5" style="padding:45px;text-align:center;color:#8d9d91">No matching bookings.</td></tr>')
    + '</tbody></table></div><div class="panelbottom"><span>Showing '+visible.length+' entries, newest first</span><span>Read-only</span></div></section>'
    + '<p class="foot">Boarding rates, payment details, approval decisions and invoice sending are intentionally disabled until Apex confirms its rules.</p></main></div></body></html>';
}
