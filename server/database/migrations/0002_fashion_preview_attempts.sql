CREATE TABLE public.fashion_preview_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete', 'uncertain')),
  result jsonb,
  UNIQUE (user_id, fingerprint)
);
CREATE INDEX fashion_preview_created_idx ON public.fashion_preview_attempts(created_at);
