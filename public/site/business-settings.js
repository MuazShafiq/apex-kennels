const page = document.querySelector('.settings');
const form = page.querySelector('.settings-form');
const state = JSON.parse(page.dataset.state);
const status = page.querySelector('.settings-status');
const fixed = form.querySelector('#fixed-settings');
const bar = form.querySelector('.settings-bar');
const dialog = page.querySelector('#review-card');
const element = id => document.getElementById(id);
const value = id => element(id).value;
const number = id => element(id).valueAsNumber;
const money = new Intl.NumberFormat('en-PK');
const amounts = ['stdDaily','cameraDaily','packageDiscount'];
const numeric = [...amounts, 'kmPerLitre','markupPct','freshnessHours'];
const labels = {};
for (const label of form.querySelectorAll('label.settings-field')) {
  labels[label.htmlFor] = label.firstElementChild.textContent;
}
labels.fuelMode = 'Fuel price source';

function readCard() {
  const fuelMode = form.elements.fuelMode.value;
  return {
    ...Object.fromEntries(numeric.map(key => [key, number(key)])), fuelMode,
    fixedFuelPkr: fuelMode === 'fixed' ? number('fixedFuelPkr') : null,
    fixedUntil: fuelMode === 'fixed' ? value('fixedUntil') : null,
    fixedReason: fuelMode === 'fixed' ? value('fixedReason').trim() : null,
  };
}
function differences(card) {
  return Object.keys(state.card).filter(key => card[key] !== state.card[key]);
}
function validate(card, starts = state.today) {
  const errors = {};
  const checkNumber = key => {
    const field = element(key);
    if (!Number.isFinite(card[key])) errors[key] = 'Enter a number.';
    else if (field.validity.rangeUnderflow || field.validity.rangeOverflow) {
      errors[key] = 'Between ' + money.format(Number(field.min)) + ' and ' + money.format(Number(field.max)) + '.';
    } else if (field.validity.stepMismatch) {
      errors[key] = amounts.includes(key) ? 'Whole rupees only.' : {
        kmPerLitre:'Up to 1 decimal place.', fixedFuelPkr:'Up to 2 decimal places.',
      }[key] ?? 'Whole numbers only.';
    }
  };
  numeric.forEach(checkNumber);
  if (amounts.every(key => !errors[key])) {
    const limit = 30 * Math.min(card.stdDaily, card.cameraDaily);
    if (card.packageDiscount >= limit) {
      const cage = card.stdDaily <= card.cameraDaily ? 'standard' : 'camera-cage';
      errors.packageDiscount = 'Must be less than 30 days at the '+cage+' rate ('+money.format(limit)+'), so neither package price reaches zero.';
    }
  }
  if (card.fuelMode === 'fixed') {
    checkNumber('fixedFuelPkr');
    if (!card.fixedUntil) errors.fixedUntil = 'Choose an end date.';
    else if (card.fixedUntil < starts) errors.fixedUntil = 'The end date has passed.';
    if (/[\u0000-\u001f\u007f]/.test(card.fixedReason)) errors.fixedReason = 'Use plain text.';
    else if ([...card.fixedReason].length < 5) errors.fixedReason = 'Say why the published rate isn’t used.';
    else if ([...card.fixedReason].length > 120) errors.fixedReason = 'Keep it to 120 characters.';
  }
  return errors;
}
function showErrors(errors, changes) {
  for (const key of Object.keys(labels)) {
    const error = element(key + '-error');
    const field = element(key);
    if (!error || !field) continue;
    error.textContent = errors[key] ?? '';
    field.setAttribute('aria-invalid', String(!!errors[key]));
    field.classList.toggle('settings-changed', changes.includes(key));
  }
}
function render() {
  const card = readCard();
  const errors = validate(card);
  const changes = differences(card);
  fixed.hidden = card.fuelMode !== 'fixed';
  const invalidPackage = amounts.some(key => errors[key]);
  element('stdPackage').textContent = invalidPackage ? '—' : 'PKR ' + money.format(30 * card.stdDaily - card.packageDiscount);
  element('cameraPackage').textContent = invalidPackage ? '—' : 'PKR ' + money.format(30 * card.cameraDaily - card.packageDiscount);
  if (!bar) return;
  showErrors(errors,changes);
  const count = Object.keys(errors).length;
  bar.hidden = !changes.length;
  bar.querySelector('[role=status]').textContent = count
    ? 'Fix '+count+(count === 1 ? ' field' : ' fields')+' before publishing'
    : changes.length+(changes.length === 1 ? ' change' : ' changes')+' not published';
}

function announceAndRefresh(message) {
  try { sessionStorage.setItem('apex-settings-message',message); } catch {}
  location.reload();
}
async function post(path, body) {
  const response = await fetch(path,{
    method:'POST',headers:{'Content-Type':'application/json','X-Apex-Settings-CSRF':page.dataset.csrf},
    body:JSON.stringify(body),
  });
  const data = await response.json();
  return {ok:response.ok,data};
}
form.addEventListener('submit',event=>event.preventDefault());
page.querySelector('h1').focus();
try {
  status.textContent = sessionStorage.getItem('apex-settings-message') ?? '';
  sessionStorage.removeItem('apex-settings-message');
} catch {}
render();

if (bar) {
  const publish = element('publish');
  const confirmation = element('confirm-card');
  const result = element('publish-result');
  const startChoices = [...dialog.querySelectorAll('[name=start]')];
  const date = element('starts');
  const dates = new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Karachi'});
  const startOfToday = Date.parse(state.today+'T00:00:00+05:00');
  const day = offset => new Date(startOfToday + (offset*24+5)*3600000).toISOString().slice(0,10);
  date.min = day(1);
  date.max = day(365);
  form.addEventListener('input',render);
  element('discard').addEventListener('click',()=>{
    form.reset();
    render();
    element('stdDaily').focus();
  });
  element('review').addEventListener('click',()=>{
    const card = readCard();
    const errors = validate(card);
    const first = Object.keys(errors)[0];
    if (first) {
      element(first)?.focus();
      return;
    }
    const changes = element('review-changes');
    changes.replaceChildren();
    const text = value => typeof value === 'number' ? money.format(value) : value ?? '—';
    for (const key of differences(card)) {
      const line = document.createElement('li');
      line.textContent = labels[key] + ' ' + text(state.card[key]) + ' → ' + text(card[key]);
      changes.append(line);
    }
    element('review-impact').textContent = state.impact.issued+' issued invoices unchanged · '
      +state.impact.saved+' saved estimates kept · '+state.impact.open+' open requests repriced';
    startChoices[0].checked = true;
    date.disabled = true;
    date.value = '';
    confirmation.checked = false;
    publish.setAttribute('aria-disabled','true');
    result.textContent = '';
    dialog.showModal();
  });
  for (const choice of startChoices) choice.addEventListener('change',()=>{
    date.disabled = startChoices[0].checked;
    if (!date.disabled) date.focus();
  });
  confirmation.addEventListener('change',()=>publish.setAttribute('aria-disabled',String(!confirmation.checked)));
  element('cancel').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>element('review').focus());
  publish.addEventListener('click',async()=>{
    if (!confirmation.checked || publish.disabled) return;
    const effectiveFrom = startChoices[0].checked ? 'now' : date.value;
    if (effectiveFrom !== 'now' && (!effectiveFrom || !date.validity.valid)) {
      result.textContent = effectiveFrom > date.max ? 'Choose a date within a year.' : 'Choose a date after today.';
      date.focus();
      return;
    }
    const card = readCard();
    const errors = validate(card,effectiveFrom === 'now'?state.today:effectiveFrom);
    if (Object.keys(errors).length) {
      result.textContent = Object.values(errors)[0];
      return;
    }
    publish.disabled = true;
    result.textContent = 'Publishing…';
    try {
      const {ok,data} = await post('/staff/settings/rate-cards',{
        expectedLatestVersion:state.latest,effectiveFrom,replacesScheduledVersion:state.scheduled,confirmed:true,card,
      });
      if (!ok) {
        result.textContent = Object.values(data.errors ?? {})[0] ?? data.error ?? 'Publishing is unavailable.';
        return;
      }
      announceAndRefresh('Rate card version '+data.version+(effectiveFrom==='now'
        ? ' published. Issued invoices and saved estimates are unchanged.'
        : ' scheduled for '+dates.format(new Date(data.effectiveFrom))+'. Nothing changes until then.'));
    } catch {
      result.textContent = 'Reload to check whether the rate card was published.';
    } finally { publish.disabled = false; }
  });
  const withdraw = element('withdraw-card');
  withdraw?.addEventListener('click',async()=>{
    if (!window.confirm('Withdraw this scheduled rate card? Its version stays in the history.')) return;
    withdraw.disabled = true;
    try {
      const {ok,data} = await post('/staff/settings/rate-cards/'+withdraw.dataset.version+'/withdraw',{});
      if (ok) announceAndRefresh('Rate card version '+data.version+' withdrawn.');
      else status.textContent = data.error ?? 'Withdrawal is unavailable.';
    } catch { status.textContent = 'Reload to check whether the rate card was withdrawn.'; }
    finally { withdraw.disabled = false; }
  });
}
