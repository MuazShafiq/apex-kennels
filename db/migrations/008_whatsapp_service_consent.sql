-- V10.6 requires the customer to affirm service consent explicitly.
-- v1 entries keep the meaning of the prior optional acknowledgement.
-- v2 text: I agree to receive booking updates and my approved invoice
-- from Apex Kennels on WhatsApp at the number provided.
-- Apply only as part of a separately authorized website release. No backfill.
BEGIN;
ALTER TABLE public.booking_whatsapp_consents
  DROP CONSTRAINT booking_whatsapp_consents_consent_text_version_check,
  ADD CONSTRAINT booking_whatsapp_consents_consent_text_version_check
    CHECK (consent_text_version IN ('website-booking-v1', 'website-booking-v2'));
COMMIT;
