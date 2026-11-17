ALTER TABLE public.creator_pattern_extraction_jobs
    ADD COLUMN render_model text NOT NULL DEFAULT 'fashn/edit'
    CHECK (render_model IN ('fashn/edit', 'fal-ai/qwen-image-edit-2511'));
