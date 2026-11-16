ALTER TABLE public.showcase_hero_settings ADD COLUMN revision integer NOT NULL DEFAULT 1;
INSERT INTO public.showcase_hero_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_activity
  DROP CONSTRAINT admin_activity_action_check,
  ALTER COLUMN target_id DROP NOT NULL,
  ADD CHECK (action IN ('designer_review','account_status','account_role','bank_verification','manual_payout','showcase_publish')),
  ADD CHECK ((action = 'showcase_publish') = (target_id IS NULL));
