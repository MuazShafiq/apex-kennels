import {neon} from '@neondatabase/serverless';
import {readEffectiveRateCard} from './rate-card-store.ts';
import {renderStaffNav, staffNavAssets} from './staff-navigation.ts';

type StudioEnv = {DATABASE_URL?: string; ASSETS?: {fetch(request: Request): Promise<Response>}};
type StudioActor = {email: string; name?: string};
type StudioRates = {version: number; std: number; cam: number; pkgDisc: number};
export type StudioAudit = {
  rateCard: number | null; kind: string; format: string; width: 1080; height: number;
  colourway: string; material: string; paw: string; consent: boolean | null; verified: boolean | null;
};
export type StudioDependencies = {
  rates(url: string): Promise<StudioRates | null>;
  record(url: string, actor: string, meta: StudioAudit): Promise<boolean>;
};
type StudioAuditQuery = (statement: string, params: (string | number | null)[]) => Promise<boolean>;

export async function recordStudioExport(url: string, actor: string, meta: StudioAudit,
  execute: StudioAuditQuery = async (statement, params) => (await neon(url).query(statement, params)).length > 0
): Promise<boolean> {
  // A card can be superseded while a fact card is being rendered.
  return execute(`INSERT INTO public.business_audit(kind, actor, payload)
    SELECT 'studio.export', $1, $2::jsonb WHERE $3::integer IS NULL OR EXISTS (
      SELECT 1 FROM public.rate_cards WHERE version=$3 AND withdrawn_at IS NULL
      AND effective_from <= statement_timestamp()) RETURNING id`, [actor, JSON.stringify(meta), meta.rateCard]);
}

const defaults: StudioDependencies = {
  async rates(url) {
    const card = await readEffectiveRateCard(url);
    return card ? {version: card.version, std: card.stdDaily, cam: card.cameraDaily, pkgDisc: card.packageDiscount} : null;
  },
  record: recordStudioExport,
};
const security = {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {...security, 'Content-Type': 'application/json; charset=utf-8'},
});
const oneOf = (v: unknown, choices: string[]): v is string => typeof v === 'string' && choices.includes(v);

/** Validate export facts and deliberately omit private/client-controlled descriptive data. */
export function sanitizeStudioAudit(input: unknown): StudioAudit | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const m = input as Record<string, unknown>;
  const fact = m.kind === 'fact';
  if (!oneOf(m.kind, ['open', 'gate', 'note', 'fact'])
    || !oneOf(m.format, ['feed', 'story', 'square', 'reel'])
    || (m.format === 'reel' && !['open', 'gate'].includes(m.kind))
    || m.width !== 1080 || m.height !== ({feed: 1350, story: 1920, square: 1080, reel: 1920}[m.format])
    || !oneOf(m.colourway, ['Raven + Poppy', 'Raven + Powder', 'Powder + Coral'])
    || !oneOf(m.material, ['Cut', 'Coral silk', 'None'])
    || !oneOf(m.paw, ['none', 'painted', 'trace', 'wax', 'deboss'])
    || (fact ? !Number.isSafeInteger(m.rateCard) || Number(m.rateCard) < 1 || Number(m.rateCard) > 2147483647
      || m.consent !== null || m.verified !== null
      : m.rateCard !== null || m.consent !== true || m.verified !== true)) return null;
  return {
    rateCard: fact ? Number(m.rateCard) : null, kind: m.kind, format: m.format, width: 1080,
    height: Number(m.height), colourway: m.colourway, material: m.material, paw: m.paw,
    consent: fact ? null : true, verified: fact ? null : true,
  };
}

async function boundedBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('size'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

// Explicit asset allowlist: no path traversal, directory indexes, demo host or arbitrary static fetch.
const studioAsset = /^\/staff\/studio\/(?:host\.(?:js|css)|src\/(?:studio\.(?:js|css)|export\.js|image\.js|render\.js|templates\.js|vendor\/html-to-image\.js)|assets\/(?:fonts\/(?:InterTight-latin(?:-ext)?-wght|JetBrainsMono-latin-wght)\.woff2|img\/(?:apex-shepherd-mark\.svg|(?:cut-highlight|cut-powder-pigment|silk-corner-clean)\.png|(?:paw-deboss-raven|paw-painted-coral|paw-painted-powder|paw-trace-powder|paw-trace-raven|paw-wax-poppy|paw-wax-powder|paw-wax-raven|raven-grain-corner)\.webp)))$/;

/** Call only AFTER the existing verified staff Access authorization and rate-card feature gate. */
export async function handleStaffStudio(request: Request, env: StudioEnv, actor: StudioActor,
  deps: StudioDependencies = defaults): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/staff/studio' && !path.startsWith('/staff/studio/')) return null;
  if (!actor.email) return json({error: 'Forbidden'}, 403);
  if (path === '/staff/studio' && request.method === 'GET') {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stay Log Studio · Apex Kennels</title>${staffNavAssets}<link rel="stylesheet" href="/staff/studio/host.css"><link rel="stylesheet" href="/staff/studio/src/studio.css"></head><body>${renderStaffNav('studio', true, actor.email)}<main><h1 tabindex="-1">Stay Log Studio<span>.</span></h1><p class="subline">Make a post from the stay log. Photos stay on this device.</p><p id="rate-source" class="rate-source" role="status">Loading the current rate card…</p><p id="studio-status" role="status" aria-live="polite"></p><div id="stay-log-studio"></div></main><script type="module" src="/staff/studio/host.js"></script></body></html>`, {
      headers: {...security, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' blob: data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"},
    });
  }
  if (studioAsset.test(path) && ['GET', 'HEAD'].includes(request.method)) {
    if (!env.ASSETS) return json({error: 'Studio assets unavailable'}, 503);
    const response = await env.ASSETS.fetch(new Request(request.url, {method: request.method}));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(security)) headers.set(key, value);
    return new Response(response.body, {status: response.status, headers});
  }
  if (!env.DATABASE_URL) return json({error: 'Studio unavailable'}, 503);
  try {
    if (path === '/staff/studio/bootstrap' && request.method === 'GET') {
      const rates = await deps.rates(env.DATABASE_URL);
      if (!rates) return json({error: 'No published rate card. Ask the owner to publish rates before opening Studio.'}, 503);
      return json({rates});
    }
    if (path === '/staff/studio/audit' && request.method === 'POST') {
      if (request.headers.get('origin') !== new URL(request.url).origin
        || ![null, 'same-origin'].includes(request.headers.get('sec-fetch-site'))
        || request.headers.get('x-apex-studio') !== 'export') return json({error: 'Forbidden'}, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return json({error: 'JSON required'}, 415);
      let body: unknown;
      try { body = await boundedBody(request); } catch { return json({error: 'Invalid export metadata'}, 422); }
      const meta = sanitizeStudioAudit(body);
      if (!meta) return json({error: 'Invalid export metadata'}, 422);
      if (!await deps.record(env.DATABASE_URL, actor.email, meta)) return json({error: 'Rate card unavailable for this export'}, 409);
      return json({recorded: true});
    }
  } catch { return json({error: 'Studio unavailable. Try again.'}, 503); }
  return json({error: 'Not found'}, 404);
}
