ALTER TABLE public.creator_text_to_image_jobs
    DROP CONSTRAINT creator_text_to_image_jobs_provider_check,
    DROP CONSTRAINT creator_text_to_image_jobs_model_name_check,
    ADD CONSTRAINT creator_text_provider_model_check CHECK (
        (provider = 'fashn' AND model_name = 'model-create')
        OR (provider = 'fal' AND model_name = 'fal-ai/flux/dev')
    );
