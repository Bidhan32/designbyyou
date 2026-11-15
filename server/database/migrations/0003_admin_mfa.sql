ALTER TABLE public.auth_sessions ADD COLUMN admin_factor_tag text,
  ADD COLUMN admin_verified_at timestamptz;

CREATE TABLE public.admin_mfa_attempts (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  last_step bigint NOT NULL DEFAULT -1
);
