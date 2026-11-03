import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { parseIntake, IntakeError } from './intake.ts';
import { saveBooking } from './booking-store.ts';
import { databasePool } from './pg-pool.ts';

type IncomingWithBody = IncomingMessage & { body?: unknown };

function authorized(header: string | undefined, configuredSecret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(configuredSecret, 'utf8');
  return expected.length >= 32 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readPayload(req: IncomingWithBody): Promise<unknown> {
  if (req.body !== undefined) {
    const serialized = JSON.stringify(req.body);
    if (!serialized || Buffer.byteLength(serialized) > 16_384) throw new IntakeError('Invalid JSON');
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (Buffer.byteLength(raw) > 16_384) throw new IntakeError('Request too large', 413);
  }
  return JSON.parse(raw);
}

/** Authenticated internal endpoint. No live Google Form is wired to this yet. */
export default async function handler(req: IncomingWithBody, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode=405; res.end(JSON.stringify({error:'Method not allowed'})); return;
  }
  if (!process.env.INTAKE_API_SECRET || !process.env.DATABASE_URL) {
    res.statusCode=503; res.end(JSON.stringify({error:'Service not configured'})); return;
  }
  if (!authorized(req.headers.authorization, process.env.INTAKE_API_SECRET)) {
    res.statusCode=401; res.end(JSON.stringify({error:'Unauthorized'})); return;
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    res.statusCode=415; res.end(JSON.stringify({error:'JSON required'})); return;
  }
  try {
    const payload = parseIntake(await readPayload(req));
    const saved = await saveBooking(databasePool(), payload);
    res.statusCode = saved.created ? 201 : 200;
    res.end(JSON.stringify(saved));
  } catch (error) {
    if (error instanceof IntakeError) {
      res.statusCode=error.status;
      res.end(JSON.stringify({error:error.message}));
      return;
    }
    if (error instanceof SyntaxError) {
      res.statusCode=400;
      res.end(JSON.stringify({error:'Invalid JSON'}));
      return;
    }
    // Avoid logging PII, DB credentials, or SQL errors to public responses.
    res.statusCode=500;
    res.end(JSON.stringify({error:'Internal server error'}));
  }
}
