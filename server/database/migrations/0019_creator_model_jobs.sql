CREATE TABLE public.creator_model_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    request_key uuid NOT NULL,
    provider_id text,
    next_check timestamptz NOT NULL DEFAULT now(),
    model_asset text,
    status text NOT NULL DEFAULT 'submitting'
        CHECK (status IN ('submitting','processing','saving','completed','failed')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (creator_id, request_key)
);
CREATE UNIQUE INDEX creator_model_active ON public.creator_model_jobs (creator_id)
    WHERE status IN ('submitting','processing','saving');
CREATE INDEX creator_model_history ON public.creator_model_jobs (creator_id, created_at DESC);
CREATE TRIGGER model_credit AFTER INSERT OR UPDATE OF status OR DELETE ON public.creator_model_jobs
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();
