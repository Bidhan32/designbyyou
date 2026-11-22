ALTER TABLE public.creator_runway_photos
  DROP CONSTRAINT creator_runway_photos_slot_check,
  ADD CONSTRAINT creator_runway_photos_slot_check CHECK (slot BETWEEN 1 AND 5),
  ADD COLUMN cutout bytea,
  ADD COLUMN thumbnail bytea;
