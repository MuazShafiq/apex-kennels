import { timingSafeEqual } from 'node:crypto';
import { IntakeError, parseIntake, type IntakeRequest } from './intake.ts';
import { persistBookingWithNeon } from './neon-worker-db.ts';
import type { SavedBooking } from './booking-store.ts';

export type WorkerEnv = {
  DATABASE_URL?: string;
  INTAKE_API_SECRET?: string;
};

export type SaveIntake = (databaseUrl: string, input: IntakeRequest) => Promise<SavedBooking>;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function bearerAuthorized(header: string | null, configuredSecret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(configuredSecret, 'utf8');
  return expected.length >= 32 && provided.length === expected.length &&
    timingSafeEqual(provided, expected);
}

async function limitedJson(request: Request): Promise<unknown> {
  const limit = 16_384;
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > limit) {
    throw new IntakeError('Request too large', 413);
  }

  if (!request.body) throw new IntakeError('Invalid JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new IntakeError('Request too large', 413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Exported for request-level unit testing with injected fake persistence. */
export async function handleWorkerRequest(
  request: Request,
  env: WorkerEnv,
  persist: SaveIntake = persistBookingWithNeon,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/health') {
    if (request.method !== 'GET') return json({error:'Method not allowed'}, 405, {Allow:'GET'});
    return json({status:'ok',service:'apex-intake'});
  }
  if (path !== '/api/ingest') return json({error:'Not found'}, 404);

  if (request.method !== 'POST') return json({error:'Method not allowed'}, 405, {Allow:'POST'});
  if (!env.DATABASE_URL || !env.INTAKE_API_SECRET || env.INTAKE_API_SECRET.length < 32) {
    return json({error:'Service not configured'}, 503);
  }
  if (!bearerAuthorized(request.headers.get('authorization'), env.INTAKE_API_SECRET)) {
    return json({error:'Unauthorized'}, 401);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({error:'JSON required'}, 415);
  }

  try {
    const input = parseIntake(await limitedJson(request));
    const saved = await persist(env.DATABASE_URL, input);
    return json(saved, saved.created ? 201 : 200);
  } catch (error) {
    if (error instanceof IntakeError) return json({error:error.message}, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return json({error:'Invalid JSON'}, 400);
    }
    // No PII, Postgres errors, credential values or raw user input in public responses.
    return json({error:'Internal server error'}, 500);
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleWorkerRequest(request, env);
  },
};
