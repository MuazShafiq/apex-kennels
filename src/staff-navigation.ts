const destinations = [
  ['run', '/staff', 'Run sheet'],
  ['alerts', '/staff/owner-alerts', 'Owner alerts'],
  ['studio', '/staff/studio', 'Stay Log Studio'],
  ['settings', '/staff/settings', 'Business settings'],
] as const;
type Destination = typeof destinations[number][0];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]!);

export const staffNavAssets = '<link rel="stylesheet" href="/site/staff-nav.css"><script defer src="/site/staff-nav.js"></script>';

export function renderStaffNav(active: Destination, showToolLinks: boolean, email?: string, demo = false): string {
  const home = demo ? '/demo/staff' : '/staff';
  const links = destinations.filter(([name]) => demo ? name === 'run' : showToolLinks || name === 'run' || name === 'alerts')
    .map(([name, path, text]) => '<a href="' + (name === 'run' ? home : path) + '"'
      + (name === active ? ' aria-current="page"' : '') + '>' + text + '</a>').join('');
  const identity = email ? '<span class="ak-st-who">Signed in: ' + escapeHtml(email) + '</span>' : '';
  return '<header class="ak-st-header"><a class="ak-st-logo" href="' + home + '" aria-label="Apex Kennels run sheet">'
    + '<span class="ak-st-badge" aria-hidden="true"></span><span class="ak-st-wordmark">APEX<span>KENNELS</span></span>'
    + '</a><nav class="ak-st-tabs" aria-label="Staff sections">' + links + '</nav>' + identity
    + '<details class="ak-st-menu"><summary aria-controls="ak-st-mobile" aria-expanded="false">Menu</summary>'
    + '<nav id="ak-st-mobile" aria-label="Staff sections">' + links + identity + '</nav></details></header>';
}
