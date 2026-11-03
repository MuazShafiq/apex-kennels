import type { IncomingMessage, ServerResponse } from 'node:http';

/** Liveness only; intentionally does not wake the database or expose state. */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.statusCode = req.method === 'GET' ? 200 : 405;
  if (req.method !== 'GET') res.setHeader('Allow','GET');
  res.end(JSON.stringify(req.method === 'GET' ? {status:'ok',service:'apex-intake'} : {error:'Method not allowed'}));
}
