DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'position_location') THEN
    CREATE TYPE public.position_location AS ENUM ('bank_one', 'bank_two');
  END IF;
END $$;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS location public.position_location;

ALTER TABLE public.positions
  ALTER COLUMN location SET DEFAULT 'bank_one';

UPDATE public.positions
SET location = 'bank_one'
WHERE location IS NULL;

ALTER TABLE public.positions
  ALTER COLUMN location SET NOT NULL;

ALTER TABLE public.position_plans
  ADD COLUMN IF NOT EXISTS location public.position_location;
