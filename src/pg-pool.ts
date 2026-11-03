import pg from 'pg';
import type { DbPool } from './booking-store.ts';

const { Pool } = pg;
let cachedPool: pg.Pool | undefined;

/** Runtime-only database access. Call exclusively from server handlers. */
export function databasePool(): DbPool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');
  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      application_name: 'apex-booking-api'
    });
    cachedPool.on('error', () => { /* do not log connection strings */ });
  }
  return cachedPool as unknown as DbPool;
}
