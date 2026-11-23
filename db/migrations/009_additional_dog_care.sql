-- Legacy and primary-dog care stays in booking_form_details.
BEGIN;
ALTER TABLE public.booking_pets
  ADD COLUMN care_details JSONB,
  ADD CONSTRAINT booking_pets_care_details_object
    CHECK (care_details IS NULL OR jsonb_typeof(care_details) = 'object');
COMMIT;
