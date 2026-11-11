-- Additive extension to the existing private confirmed-location record.
-- Existing rows remain unchanged: null secondary pin means same gate for Both.
-- Apply to development, then production, before deploying the new Worker.
ALTER TABLE public.booking_transport_locations
  ADD COLUMN IF NOT EXISTS dropoff_latitude double precision,
  ADD COLUMN IF NOT EXISTS dropoff_longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_transport_distinct_dropoff_valid'
      AND conrelid = 'public.booking_transport_locations'::regclass
  ) THEN
    ALTER TABLE public.booking_transport_locations
      ADD CONSTRAINT booking_transport_distinct_dropoff_valid CHECK (
        (dropoff_latitude IS NULL AND dropoff_longitude IS NULL)
        OR
        (dropoff_latitude IS NOT NULL AND dropoff_longitude IS NOT NULL
          AND service='both'
          AND dropoff_latitude BETWEEN 23 AND 38
          AND dropoff_longitude BETWEEN 60 AND 78)
      );
  END IF;
END $$;
