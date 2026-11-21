ALTER TABLE public.showcase_hero_settings ADD COLUMN campaign_looks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(campaign_looks) = 'array');
