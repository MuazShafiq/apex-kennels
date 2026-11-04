-- Forward-only migration, V1: full boarding Form capture.
-- Apply to Neon local-development branch first. DO NOT run on production until
-- rollout is approved, tested and synchronized with the Worker deployment.
-- Existing records and invoice/rate tables are preserved.
ALTER TABLE public.form_ingestion_events
  ADD COLUMN IF NOT EXISTS payload_fingerprint text;

CREATE TABLE IF NOT EXISTS public.booking_form_details (
  booking_id uuid PRIMARY KEY REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  owner_address text,
  pickup_dropoff_requested boolean,
  camera_cage_requested boolean,
  emergency_contact_phone text,
  pet_gender text,
  pet_age_description text,
  vaccination_status text,
  distemper_history text,
  veterinarian_phone text,
  personality_traits jsonb,
  special_instructions text,
  medication_feeding_instructions text,
  terms_accepted boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_traits_object CHECK (
    personality_traits IS NULL OR jsonb_typeof(personality_traits) = 'object'
  )
);
ALTER TABLE public.booking_form_details ENABLE ROW LEVEL SECURITY;
-- No public SELECT/INSERT/UPDATE/DELETE policies. The privileged backend is
-- the sole permitted writer. Do not expose this table through a public API.
