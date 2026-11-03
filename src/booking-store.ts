import type { IntakeRequest } from './intake.ts';
import { IntakeError, fingerprintIntake } from './intake.ts';

export interface QueryResult<T = Record<string, unknown>> { rows: T[]; rowCount: number | null }
export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}
export interface DbPool { connect(): Promise<DbClient> }
export type SavedBooking = { bookingId: string; created: boolean; status: 'requested' | string };

type IdRow = { id: string };
type Existing = {
  id: string; status: string; external_response_id: string;
  customer_name: string; email: string | null; phone: string | null; pet_name: string;
  start_date: string; end_date: string; accommodation_type: string | null;
};

function requiredRow<T>(result: QueryResult<T>, label: string): T {
  if (!result.rows[0]) throw new Error(`Missing database result: ${label}`);
  return result.rows[0];
}

/** All changes happen in one transaction; unique form ID makes concurrent retries safe. */
export async function saveBooking(pool: DbPool, input: IntakeRequest): Promise<SavedBooking> {
  const tx = await pool.connect();
  let committed = false;
  try {
    await tx.query('BEGIN');
    const event = await tx.query<IdRow>(
      'INSERT INTO public.form_ingestion_events(source, external_submission_id) VALUES ($1, $2) ON CONFLICT (source, external_submission_id) DO NOTHING RETURNING id',
      [input.source, input.externalResponseId]
    );
    if (event.rowCount === 0) {
      const existing = requiredRow(await tx.query<Existing>(`
        SELECT b.id, b.status, b.external_submission_id AS external_response_id,
               c.full_name AS customer_name, c.email, c.phone, p.name AS pet_name,
               b.start_date::text AS start_date, b.end_date::text AS end_date,
               b.accommodation_type
        FROM public.form_ingestion_events e
        JOIN public.booking_requests b ON b.id=e.booking_id
        JOIN public.customers c ON c.id=b.customer_id
        JOIN public.booking_pets bp ON bp.booking_id=b.id
        JOIN public.pets p ON p.id=bp.pet_id
        WHERE e.source=$1 AND e.external_submission_id=$2
        LIMIT 1
      `, [input.source, input.externalResponseId]), 'existing booking');
      // An edited upstream response must not silently rewrite a reviewed booking.
      const original: IntakeRequest = {
        source:'google_form', externalResponseId:existing.external_response_id,
        customerName:existing.customer_name, email:existing.email ?? undefined,
        phone:existing.phone ?? undefined, petName:existing.pet_name,
        startDate:existing.start_date, endDate:existing.end_date,
        accommodationType:existing.accommodation_type ?? undefined
      };
      if (fingerprintIntake(original) !== fingerprintIntake(input)) {
        throw new IntakeError('Submission ID was reused with changed booking details; manual review required', 409);
      }
      await tx.query('COMMIT');
      committed = true;
      return {bookingId:existing.id, created:false, status:existing.status};
    }

    const customer = requiredRow(await tx.query<IdRow>(
      'INSERT INTO public.customers(full_name,email,phone) VALUES ($1,$2,$3) RETURNING id',
      [input.customerName, input.email ?? null, input.phone ?? null]
    ), 'customer');
    const pet = requiredRow(await tx.query<IdRow>(
      'INSERT INTO public.pets(customer_id,name) VALUES ($1,$2) RETURNING id',
      [customer.id, input.petName]
    ), 'pet');
    const booking = requiredRow(await tx.query<IdRow>(
      `INSERT INTO public.booking_requests
         (customer_id,source,external_submission_id,start_date,end_date,accommodation_type,status)
        VALUES ($1,$2,$3,$4,$5,$6,'requested') RETURNING id`,
      [customer.id,input.source,input.externalResponseId,input.startDate,input.endDate,input.accommodationType ?? null]
    ), 'booking');
    await tx.query(
      'INSERT INTO public.booking_pets(booking_id,pet_id) VALUES ($1,$2)',
      [booking.id,pet.id]
    );
    await tx.query(
      'UPDATE public.form_ingestion_events SET booking_id=$1 WHERE id=$2',
      [booking.id,event.rows[0].id]
    );
    await tx.query('COMMIT');
    committed=true;
    return {bookingId:booking.id,created:true,status:'requested'};
  } catch (error) {
    if (!committed) {
      try { await tx.query('ROLLBACK'); } catch { /* original error takes precedence */ }
    }
    throw error;
  } finally {
    tx.release();
  }
}
