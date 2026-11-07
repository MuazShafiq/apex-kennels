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
  payload_fingerprint: string | null;
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
      'INSERT INTO public.form_ingestion_events(source, external_submission_id, payload_fingerprint) VALUES ($1, $2, $3) ON CONFLICT (source, external_submission_id) DO NOTHING RETURNING id',
      [input.source, input.externalResponseId, fingerprintIntake(input)]
    );
    if (event.rowCount === 0) {
      const existing = requiredRow(await tx.query<Existing>(`
        SELECT b.id, b.status, b.external_submission_id AS external_response_id,
               c.full_name AS customer_name, c.email, c.phone, p.name AS pet_name,
               b.start_date::text AS start_date, b.end_date::text AS end_date,
               b.accommodation_type, e.payload_fingerprint
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
        source:input.source, externalResponseId:existing.external_response_id,
        customerName:existing.customer_name, email:existing.email ?? undefined,
        phone:existing.phone ?? undefined, petName:existing.pet_name,
        startDate:existing.start_date, endDate:existing.end_date,
        accommodationType:existing.accommodation_type ?? undefined
      };
      const persistedDigest=existing.payload_fingerprint || fingerprintIntake(original);
      if (persistedDigest !== fingerprintIntake(input)) {
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
      'INSERT INTO public.pets(customer_id,name,breed) VALUES ($1,$2,$3) RETURNING id',
      [customer.id, input.petName, input.details?.breed ?? null]
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
    if (input.details) {
      const d=input.details;
      await tx.query(
        `INSERT INTO public.booking_form_details (
          booking_id, owner_address, pickup_dropoff_requested,
          camera_cage_requested, emergency_contact_phone,
          pet_gender, pet_age_description, vaccination_status,
          distemper_history, veterinarian_phone, personality_traits,
          special_instructions, medication_feeding_instructions, terms_accepted
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
        [booking.id,d.ownerAddress??null,d.pickupDropoffRequested??null,
         d.cameraCageRequested??null,d.emergencyContactPhone??null,
         d.gender??null,d.age??null,d.vaccinationStatus??null,
         d.distemperHistory??null,d.veterinarianPhone??null,
         d.personalityTraits?JSON.stringify(d.personalityTraits):null,
         d.specialInstructions??null,d.medicationFeedingInstructions??null,
         d.termsAccepted??null]
      );
    }
    // Only a deliberately checked website checkbox creates WhatsApp consent.
    // The original Google Form has no WhatsApp opt-in question, so those
    // records remain unconsented until independently confirmed.
    if (input.source==='website' && input.details?.whatsappInvoiceOptIn===true) {
      await tx.query(
        "INSERT INTO public.booking_whatsapp_consents "+
        "(booking_id,phone,consent_text_version,source) VALUES ($1,$2,$3,$4)",
        [booking.id,input.phone,'website-booking-v1','website']
      );
    }
    if (input.source === 'website' && input.transportLocation) {
      const point = input.transportLocation;
      await tx.query(
        'INSERT INTO public.booking_transport_locations (booking_id, latitude, longitude, service, customer_confirmed) VALUES ($1, $2, $3, $4, $5)',
        [booking.id, point.latitude, point.longitude, point.service, true]
      );
    }
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
