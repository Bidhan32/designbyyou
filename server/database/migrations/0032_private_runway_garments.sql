CREATE TABLE public.creator_runway_garments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 10),
  digest text NOT NULL,
  title text NOT NULL,
  image bytea NOT NULL,
  thumbnail bytea NOT NULL,
  UNIQUE (creator_id, slot),
  UNIQUE (creator_id, digest)
);
