// Stay Log Studio · template renderer
// Renders the approved post templates into real DOM. Supports exactly what the templates use:
//   {{path}} in text and attributes, <sc-if value="{{x}}">, <sc-for list="{{xs}}" as="x">.
// No eval, no innerHTML of user text: user words are only ever set as text or attribute values.

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

function lookup(scope, expr) {
  const e = expr.trim();
  if (e === 'true') return true;
  if (e === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
  const parts = e.split('.');
  let v = scope;
  for (const k of parts) {
    if (v == null) return undefined;
    v = v[k];
  }
  return v;
}

function interpolate(str, scope) {
  // a value that is exactly one token keeps its type (used by sc-if / sc-for)
  const whole = str.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
  if (whole) return lookup(scope, whole[1]);
  return str.replace(TOKEN, (_, ex) => {
    const v = lookup(scope, ex);
    return v == null ? '' : String(v);
  });
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return !!v && v !== 'false' && v !== '0';
}

function walk(node, scope, assetBase) {
  // returns an array of nodes to put in place of `node`
  if (node.nodeType === 3) {
    const t = node.nodeValue;
    if (t.indexOf('{{') < 0) return [node];
    node.nodeValue = String(interpolate(t, scope) ?? '');
    return [node];
  }
  if (node.nodeType !== 1) return [node];
  const tag = node.tagName.toLowerCase();

  if (tag === 'sc-if') {
    const ok = truthy(interpolate(node.getAttribute('value') || '', scope));
    if (!ok) return [];
    return children(node, scope, assetBase);
  }
  if (tag === 'sc-for') {
    const list = interpolate(node.getAttribute('list') || '', scope);
    const as = node.getAttribute('as') || 'item';
    const out = [];
    (Array.isArray(list) ? list : []).forEach((item, i) => {
      const inner = Object.assign(Object.create(scope), { [as]: item, index: i });
      const copy = node.cloneNode(true);
      out.push(...children(copy, inner, assetBase));
    });
    return out;
  }

  for (const attr of Array.from(node.attributes)) {
    let v = attr.value;
    if (v.indexOf('@ASSET@') >= 0) v = v.split('@ASSET@').join(assetBase);
    if (v.indexOf('{{') >= 0) v = interpolate(v, scope);
    if (attr.name.startsWith('hint-')) { node.removeAttribute(attr.name); continue; }
    if ((attr.name === 'src' || attr.name === 'href') && (v == null || v === '')) { node.removeAttribute(attr.name); continue; }
    if (typeof v === 'boolean') { if (v) node.setAttribute(attr.name, ''); else node.removeAttribute(attr.name); continue; }
    node.setAttribute(attr.name, v == null ? '' : String(v));
  }
  const kids = children(node, scope, assetBase);
  while (node.firstChild) node.removeChild(node.firstChild);
  kids.forEach((k) => node.appendChild(k));
  return [node];
}

function children(node, scope, assetBase) {
  const out = [];
  Array.from(node.childNodes).forEach((c) => out.push(...walk(c, scope, assetBase)));
  return out;
}

const parsed = new Map();
function parse(markup) {
  if (!parsed.has(markup)) {
    const t = document.createElement('template'); // inert: nothing loads until rendered
    t.innerHTML = markup;
    parsed.set(markup, t);
  }
  return parsed.get(markup).content.cloneNode(true);
}

/** Render one template (from templates.js) with props into a DocumentFragment. */
export function renderTemplate(tpl, props, assetBase) {
  const logic = new tpl.Logic(props);
  const vals = logic.renderVals();
  const frag = parse(tpl.markup);
  const out = document.createDocumentFragment();
  children(frag, vals, assetBase).forEach((n) => out.appendChild(n));
  return out;
}
