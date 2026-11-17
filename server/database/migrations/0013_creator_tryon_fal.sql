ALTER TABLE public.creator_virtual_tryon_jobs
    DROP CONSTRAINT creator_virtual_tryon_jobs_model_name_check,
    DROP CONSTRAINT creator_virtual_tryon_jobs_provider_check,
    ADD CONSTRAINT creator_tryon_provider_model_check CHECK (
        (provider = 'fashn' AND model_name = 'tryon-v1.6')
        OR (provider = 'fal' AND model_name = 'fal-ai/fashn/tryon/v1.6')
    );
