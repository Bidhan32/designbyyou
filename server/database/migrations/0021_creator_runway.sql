CREATE TABLE public.creator_runway_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  UNIQUE (creator_id, slot)
);
CREATE TABLE public.creator_runway_looks (
  photo_id uuid NOT NULL REFERENCES public.creator_runway_photos(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('editor', 'upload')),
  project_id uuid NOT NULL,
  version text NOT NULL,
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (photo_id, source, project_id, version)
);
