/**
 * Public-only Apex website hostname on Cloudflare Pages.
 * Keep the existing Worker, Access-protected staff paths and intake webhook
 * on their current hostname. The binding is internal to Cloudflare.
 */
const ALLOWED = new Map([
  ['/api/book/config', 'GET'],
  ['/api/book/location', 'POST'],
  ['/api/book', 'POST'],
]);

function denial(status, message, allow) {
  const headers = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (allow) headers.set('Allow', allow);
  return new Response(message, {status, headers});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Never permit URL-encoded separators or ambiguous path spellings
    // through this restricted proxy.
    if (path.includes('%') || path.includes('\\') || path.includes('//')) {
      return denial(404, 'Not found');
    }

    // Staff routing is independently gated and requires the Access assertion
    // for the existing Apex Staff application. The backend *cryptographically*
    // validates its signature, issuer, audience and exact email allowlist.
    // Never expose this route before the Pages hostname is Access-protected.
    const staffPath = path === '/staff' || path.startsWith('/staff/');
    let allowedMethod;
    if (staffPath) {
      if (env.APEX_STAFF_PAGES_ENABLED !== 'true') return denial(404, 'Not found');
      if (method !== 'GET' && method !== 'POST')
        return denial(405, 'Method not allowed', 'GET, POST');
      const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
      if (!assertion || assertion.length > 8192 || assertion.split('.').length !== 3)
        return denial(403, 'Forbidden');
      allowedMethod = method;
    } else if (path === '/' || path.startsWith('/site/') || path === '/book' || path === '/book/' || path.startsWith('/book/')) {
      allowedMethod = 'GET';
    } else {
      allowedMethod = ALLOWED.get(path);
    }

    if (!allowedMethod) return denial(404, 'Not found');
    if (method !== allowedMethod) return denial(405, 'Method not allowed', allowedMethod);
    if (!env.APEX_BACKEND || typeof env.APEX_BACKEND.fetch !== 'function') {
      return denial(503, 'Booking preview unavailable');
    }

    // Forward the same public hostname to the existing Worker so its strict
    // Origin comparisons and relative URLs work without opening up CORS.
    const forwarded = new Request(url, request);
    const headers = new Headers(forwarded.headers);
    for (const name of [
      'cookie', 'authorization', 'x-forwarded-host', 'x-forwarded-proto',
    ]) headers.delete(name);
    // Preserve only signed staff Access assertions. Public routes must never
    // forward identity headers to the booking or location endpoints.
    if (!staffPath) headers.delete('cf-access-jwt-assertion');

    const response = await env.APEX_BACKEND.fetch(new Request(forwarded, {headers}));
    if (staffPath) {
      const protectedHeaders = new Headers(response.headers);
      protectedHeaders.set('Cache-Control', 'private, no-store');
      protectedHeaders.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(response.body, {status:response.status, headers:protectedHeaders});
    }
    // During the staged release (or Worker rollback), the older Worker only serves /book.
    if (path === '/' && response.status === 404) {
      await response.body?.cancel();
      url.pathname = '/book';
      return env.APEX_BACKEND.fetch(new Request(url, {headers}));
    }
    return response;
  },
};
