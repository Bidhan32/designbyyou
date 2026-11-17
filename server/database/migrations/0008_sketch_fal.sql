ALTER TABLE public.creator_sketch_to_image_jobs
    DROP CONSTRAINT creator_sketch_to_image_jobs_provider_check,
    DROP CONSTRAINT creator_sketch_to_image_jobs_model_name_check,
    DROP CONSTRAINT creator_sketch_to_image_jobs_generation_mode_check,
    ADD CONSTRAINT creator_sketch_provider_model_check CHECK (
        (provider = 'fashn' AND model_name = 'edit' AND generation_mode IN ('fast', 'balanced', 'quality'))
        OR (provider = 'fal' AND model_name = 'fal-ai/flux-pro/kontext' AND generation_mode = 'standard')
    );
