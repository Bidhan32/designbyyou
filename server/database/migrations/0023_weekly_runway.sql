CREATE TABLE public.runway_weekly_designs (
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 6),
  id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image bytea NOT NULL,
  thumbnail bytea NOT NULL
);
ALTER TABLE public.creator_runway_looks DROP CONSTRAINT creator_runway_looks_source_check;
ALTER TABLE public.creator_runway_looks ADD CHECK (source IN ('editor','upload','weekly'));
ALTER TABLE public.creator_virtual_tryon_jobs ADD COLUMN weekly_runway boolean NOT NULL DEFAULT false;
