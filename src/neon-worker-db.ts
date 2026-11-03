import { Client } from '@neondatabase/serverless';
import type { IntakeRequest } from './intake.ts';
import { saveBooking, type DbPool, type SavedBooking } from './booking-store.ts';

/**
 * One Neon WebSocket connection per incoming Worker request.
 * Keeping BEGIN/COMMIT on one client preserves transactional idempotency.
 * Never reuse a WebSocket client between Worker requests.
 */
export async function persistBookingWithNeon(
  databaseUrl: string,
  booking: IntakeRequest,
): Promise<SavedBooking> {
  const client = new Client(databaseUrl);
  await client.connect();
  try {
    const pool: DbPool = {
      async connect() {
        return {
          query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
            const result = await client.query(sql, params);
            return { rows: result.rows as T[], rowCount: result.rowCount };
          },
          // saveBooking owns the transaction; the request scope owns the socket.
          release() {}
        };
      }
    };
    return await saveBooking(pool, booking);
  } finally {
    await client.end();
  }
}
