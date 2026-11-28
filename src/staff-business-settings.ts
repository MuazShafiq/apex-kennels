import {createHmac, timingSafeEqual} from 'node:crypto';
import {karachiDay, scheduledCard, type CardDraft} from './rate-card.ts';
import {
  publishRateCard, readBusinessSettings, RateCardMutationError, withdrawRateCard,
} from './rate-card-store.ts';
import {maskedConfiguredPayment, type ApprovalConfig} from './invoice-approval.ts';
import {renderStaffNav, staffNavAssets} from './staff-navigation.ts';

type Settings = Awaited<ReturnType<typeof readBusinessSettings>>;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]!);
const asDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Karachi',
}).format(new Date(value));
const fields = [
  ['stdDaily','Standard boarding','PKR',500,50000,1],
  ['cameraDaily','Camera cage','PKR',500,50000,1],
  ['packageDiscount','30-day package discount','PKR',0,200000,1],
  ['kmPerLitre','Fuel economy','km/L',3,40,.1],
  ['markupPct','Markup on fuel cost','%',0,100,1],
  ['freshnessHours','Route and fuel freshness','hours',1,168,1],
  ['fixedFuelPkr','Fixed fuel price','PKR/L',100,1000,.01],
] as const;

export type BusinessSettingsDeps = {
  read?:typeof readBusinessSettings;
  publish?:typeof publishRateCard;
  withdraw?:typeof withdrawRateCard;
};

function csrf(request: Request): string {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  // The assertion remains private. The browser receives only a token scoped
  // to this action and this signed Access session.
  return assertion ? createHmac('sha256', assertion).update('apex-business-settings-csrf-v1').digest('hex') : '';
}

function json(body: unknown, status = 200, headers: Record<string,string> = {}): Response {
  return Response.json(body, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}

function renderBusinessSettings(settings: Settings, email: string, token: string, canPublish: boolean, invoice: ApprovalConfig): string {
  const {now, current, cards, impact, highestReservedNumber} = settings;
  const scheduled = scheduledCard(cards, now);
  const floor = invoice.manualNumberFloor ?? '';
  const nextNumber = /^\d{4}$/.test(floor) ? Math.max(highestReservedNumber, Number(floor))+1 : null;
  const payment = maskedConfiguredPayment(invoice);
  const readOnly = canPublish ? '' : ' disabled';
  const input = (field: typeof fields[number]) => {
    const [key,label,unit,min,max,step] = field;
    return '<label class="settings-field" for="'+key+'"><span>'+label+'</span><span class="settings-control">'
      +'<input id="'+key+'" name="'+key+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'"'
      +' value="'+escapeHtml(current[key])+'" aria-describedby="'+key+'-error" required'+readOnly+'>'
      +'<span aria-hidden="true">'+unit+'</span></span><small id="'+key+'-error" class="settings-error"></small></label>';
  };
  const cardDraft:CardDraft = {
    stdDaily:current.stdDaily,cameraDaily:current.cameraDaily,packageDiscount:current.packageDiscount,
    kmPerLitre:current.kmPerLitre,markupPct:current.markupPct,freshnessHours:current.freshnessHours,
    fuelMode:current.fuelMode,fixedFuelPkr:current.fixedFuelPkr,fixedUntil:current.fixedUntil,fixedReason:current.fixedReason,
  };
  const state = {card:cardDraft,latest:Math.max(...cards.map(card=>card.version)),scheduled:scheduled?.version,today:karachiDay(now),impact};
  const history = cards.map(card => '<li><div><strong>Version '+card.version+'</strong>'
    +'<span class="settings-chip">'+(card.withdrawnAt?'Withdrawn':card.version===current.version?'In effect':card.version===scheduled?.version?'Scheduled':'Superseded')+'</span></div>'
    +'<p>'+escapeHtml(card.withdrawnAt?'Was to start '+asDate(card.effectiveFrom):asDate(card.effectiveFrom))+'</p>'
    +'<p>'+escapeHtml(card.summary)+'</p></li>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Business settings | Apex Kennels</title>'+staffNavAssets
    +'<link rel="stylesheet" href="/site/business-settings.css"><script defer src="/site/business-settings.js"></script></head><body>'
    +renderStaffNav('settings',true,email)
    +'<main class="settings" data-state="'+escapeHtml(JSON.stringify(state))+'" data-csrf="'+escapeHtml(token)+'">'
    +'<header class="settings-title"><h1 tabindex="-1">Business settings<span>.</span></h1>'
    +'<p>Rates, transport, invoices and access.</p><div class="settings-chip">Rate card v'+current.version+' in effect</div></header>'
    +'<p class="settings-status" role="status"></p>'
    +(canPublish?'':'<p class="settings-notice">Read-only. Only the owner can publish rate cards.</p>')
    +'<div class="settings-layout"><nav class="settings-sections" aria-label="Settings sections">'
    +'<a href="#rates">Rates &amp; packages</a><a href="#transport">Transport</a><a href="#invoices">Invoices &amp; payments</a>'
    +'<a href="#access">Access</a><a href="#history">Change history</a></nav>'
    +'<form class="settings-form" novalidate><section id="rates"><h2>Rates &amp; packages<span>.</span></h2>'
    +'<p>Per dog. Arrival and collection both count as billed days.</p><div class="settings-grid">'+fields.slice(0,3).map(input).join('')
    +'</div><p class="settings-derived" aria-live="polite">30-day package · Standard <output id="stdPackage"></output> · Camera <output id="cameraPackage"></output></p>'
    +'<p>Grooming is free.</p></section>'
    +'<section id="transport"><h2>Transport<span>.</span></h2><p>Both pickup and drop-off are full driving loops. Transport rounds up.</p>'
    +'<div class="settings-grid">'+fields.slice(3,6).map(input).join('')+'</div>'
    +'<fieldset'+readOnly+'><legend>Fuel price</legend><label><input type="radio" name="fuelMode" value="published"'
    +(current.fuelMode==='published'?' checked':'')+'> Published national petrol rate</label>'
    +'<label><input type="radio" name="fuelMode" value="fixed"'+(current.fuelMode==='fixed'?' checked':'')+'> Fixed price</label></fieldset>'
    +'<div class="settings-grid" id="fixed-settings"'+(current.fuelMode==='fixed'?'':' hidden')+'>'+input(fields[6])
    +'<label class="settings-field" for="fixedUntil"><span>End date</span><input id="fixedUntil" name="fixedUntil" type="date" min="'+state.today
    +'" value="'+escapeHtml(current.fixedUntil)+'" aria-describedby="fixedUntil-error"'+readOnly+'><small id="fixedUntil-error" class="settings-error"></small></label>'
    +'<label class="settings-field" for="fixedReason"><span>Reason</span><input id="fixedReason" name="fixedReason" type="text" maxlength="120" value="'
    +escapeHtml(current.fixedReason)+'" aria-describedby="fixedReason-error"'+readOnly+'><small id="fixedReason-error" class="settings-error"></small></label></div>'
    +'<p>Route points are managed by the developer and saved with each route.</p></section>'
    +'<section id="invoices"><h2>Invoices &amp; payments<span>.</span></h2><dl>'
    +'<dt>Next invoice number</dt><dd>'+(nextNumber===null?'Awaiting verified Canva sequence':nextNumber>9999?'Sequence exhausted':String(nextNumber).padStart(4,'0'))+'</dd>'
    +'<dt>Payment details</dt><dd>'+escapeHtml(payment??'Awaiting verified payment details')+'</dd>'
    +'<dt>WhatsApp invoice sending</dt><dd>'+(invoice.deliveryEnabled==='true'?'Enabled':'Off')+'</dd></dl></section>'
    +'<section id="access"><h2>Access<span>.</span></h2><p>Owner · Rate cards and invoice approval</p><p>Staff · Run sheet, estimates and Studio</p></section>'
    +'<section id="history"><h2>Change history<span>.</span></h2><ul class="settings-history">'+history+'</ul>'
    +(canPublish&&scheduled?'<button type="button" id="withdraw-card" data-version="'+scheduled.version+'">Withdraw version '+scheduled.version+'</button>':'')
    +'</section>'
    +(canPublish?'<div class="settings-bar" hidden><span role="status"></span><button type="button" id="discard">Discard</button>'
      +'<button type="button" id="review">Review and publish</button></div>':'')+'</form></div>'
    +(canPublish?'<dialog id="review-card" aria-labelledby="review-heading"><h2 id="review-heading">Review rate card<span>.</span></h2>'
      +'<ul id="review-changes"></ul><p id="review-impact"></p>'
      +(scheduled?'<p>Version '+scheduled.version+' scheduled for '+escapeHtml(asDate(scheduled.effectiveFrom))
        +' will be withdrawn when you publish this. Its version stays in the history.</p>':'')
      +'<fieldset><legend>When it takes effect</legend><label><input type="radio" name="start" value="now" checked> Now</label>'
      +'<label><input type="radio" name="start" value="date"> From a date</label><label for="starts">Effective date in Karachi</label><input id="starts" type="date" disabled></fieldset>'
      +'<label class="settings-check"><input id="confirm-card" type="checkbox"> I’ve checked these figures.</label>'
      +'<p id="publish-result" role="status"></p><div class="settings-dialog-actions"><button type="button" id="cancel">Cancel</button>'
      +'<button type="button" id="publish" aria-disabled="true">Publish</button></div></dialog>':'')
    +'</main></body></html>';
}

export async function handleBusinessSettings(
  request: Request, databaseUrl: string, actor: string, owner: boolean, recent: boolean,
  invoice: ApprovalConfig, readJson: (request:Request, limit?:number)=>Promise<unknown>,
  deps: BusinessSettingsDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const token = owner ? csrf(request) : '';
  if (url.pathname === '/staff/settings') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    try {
      const settings = await (deps.read ?? readBusinessSettings)(databaseUrl);
      return new Response(renderBusinessSettings(settings,actor,token,owner&&!!token,invoice),{headers:{
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      }});
    } catch { return json({error:'Business settings unavailable'},503); }
  }
  const publish = url.pathname === '/staff/settings/rate-cards';
  const withdrawal = /^\/staff\/settings\/rate-cards\/([1-9]\d{0,9})\/withdraw$/.exec(url.pathname);
  if (!publish && !withdrawal) return json({error:'Not found'},404);
  if (request.method !== 'POST') return json({error:'Method not allowed'},405,{Allow:'POST'});
  if (!owner || !recent) return json({error:'Sign in again as the owner to publish rates.'},403);
  const sent = request.headers.get('X-Apex-Settings-CSRF') ?? '';
  if (request.headers.get('Origin') !== url.origin || !token || !/^[a-f0-9]{64}$/.test(sent)
    || !timingSafeEqual(Buffer.from(sent),Buffer.from(token))) return json({error:'Reload Business settings and try again.'},403);
  if (request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase() !== 'application/json') {
    return json({error:'JSON required'},415);
  }
  let body:unknown;
  try { body = await readJson(request,4096); }
  catch { return json({error:'Check the publishing fields.'},422); }
  try {
    if (publish) return json(await (deps.publish ?? publishRateCard)(databaseUrl,actor,body));
    const version = Number(withdrawal![1]);
    if (version > 2147483647 || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
      return json({error:'Invalid withdrawal'},422);
    }
    return json(await (deps.withdraw ?? withdrawRateCard)(databaseUrl,actor,version));
  } catch (error) {
    if (error instanceof RateCardMutationError) return json({code:error.code,error:error.message,errors:error.fields},error.status);
    return json({error:'Business settings unavailable'},503);
  }
}
