CREATE TABLE public.admin_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid NOT NULL,
  actor_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('designer_review','account_status','account_role','bank_verification','manual_payout')),
  target_id uuid NOT NULL,
  previous_value text,
  new_value text NOT NULL
);
CREATE INDEX admin_activity_target_idx ON public.admin_activity(target_id, id DESC);
CREATE INDEX admin_activity_actor_idx ON public.admin_activity(actor_id, id DESC);
