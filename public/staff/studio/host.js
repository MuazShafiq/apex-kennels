import {mountStudio} from './src/studio.js';

const root = document.getElementById('stay-log-studio');
const source = document.getElementById('rate-source');
const status = document.getElementById('studio-status');
document.querySelector('h1').focus();
let studio, version, refreshing;
function refreshRates() {
  if (refreshing) return refreshing;
  if (document.hidden) return Promise.resolve();
  refreshing = loadRates().finally(() => { refreshing = undefined; });
  return refreshing;
}
async function loadRates() {
  try {
    const response = await fetch('/staff/studio/bootstrap', {credentials: 'same-origin', cache: 'no-store'});
    if (!response.ok) throw new Error('rate-card');
    const {rates} = await response.json();
    if (studio && version !== rates.version) studio.setRates(rates);
    if (!studio) studio = mountStudio(root, {
      embedded: true, assetBase: '/staff/studio/assets/', rates,
      beforeExport: refreshRates,
      onExport({meta}) {
        // Only audit facts leave the device; no dog name, image, caption, filename or client identity.
        const {rateCard, kind, format, width, height, colourway, material, paw, consent, verified} = meta;
        void fetch('/staff/studio/audit', {
          method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type': 'application/json', 'X-Apex-Studio': 'export'},
          body: JSON.stringify({rateCard, kind, format, width, height, colourway, material, paw, consent, verified}),
        }).then(response => {
          if (!response.ok) throw new Error('audit');
          status.textContent = 'Export recorded.';
        }).catch(() => { status.textContent = 'The PNG was downloaded, but its audit record could not be saved. Try again when the connection returns.'; });
      },
    });
    version = rates.version;
    source.textContent = 'Fact prices from rate card v' + version;
    if (status.dataset.rateError) { status.textContent = ''; delete status.dataset.rateError; }
  } catch {
    status.dataset.rateError = 'true';
    status.textContent = 'Current prices are unavailable. Studio is paused. Reconnect to continue.';
    // Preserve the unsent photo and words while preventing exports based on stale prices.
    if (studio) studio.setAvailable(false);
  }
  if (studio && !status.dataset.rateError) studio.setAvailable(true);
}
await refreshRates();
const timer = setInterval(refreshRates, 15000);
document.addEventListener('visibilitychange', refreshRates);
window.addEventListener('focus', refreshRates);
window.addEventListener('pagehide', () => { clearInterval(timer); studio?.destroy(); }, {once: true});
