-- Preparation only. Do not apply to production until website cutover checks pass.
-- The live Google Form still has no WhatsApp-specific opt-in; it must remain
-- unconsented. This table stores ONLY explicit website opt-ins.
CREATE TABLE IF NOT EXISTS public.booking_whatsapp_consents (
  booking_id UUID PRIMARY KEY REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  phone TEXT NOT NULL CHECK (length(trim(phone)) BETWEEN 10 AND 40),
  consent_text_version TEXT NOT NULL CHECK (consent_text_version = 'website-booking-v1'),
  source TEXT NOT NULL CHECK (source = 'website'),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
