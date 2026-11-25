ALTER TABLE public.creator_runway_looks ADD COLUMN process_after timestamptz, ADD COLUMN process_error text;
CREATE INDEX runway_looks_due ON public.creator_runway_looks(process_after) WHERE process_after IS NOT NULL;
