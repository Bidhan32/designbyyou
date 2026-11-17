ALTER TABLE public.creator_multi_view_jobs
    ADD COLUMN render_model text NOT NULL DEFAULT 'fashn/edit'
    CHECK (render_model IN ('fashn/edit', 'fal-ai/qwen-image-edit-2511'));
