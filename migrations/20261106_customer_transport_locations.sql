-- Applied only when the new website booking endpoint is approved for release.
-- One customer-confirmed location per booking, kept private.
CREATE TABLE IF NOT EXISTS public.booking_transport_locations (
  booking_id uuid PRIMARY KEY REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN 23 AND 38),
  longitude double precision NOT NULL CHECK (longitude BETWEEN 60 AND 78),
  service text NOT NULL CHECK (service IN ('pickup','dropoff','both')),
  customer_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
