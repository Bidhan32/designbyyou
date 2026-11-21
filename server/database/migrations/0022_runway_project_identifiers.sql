-- Fashion Editor uses bigint IDs while uploaded designs use UUIDs.
ALTER TABLE public.creator_runway_looks ALTER COLUMN project_id TYPE text USING project_id::text;
