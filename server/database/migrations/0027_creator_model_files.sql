CREATE TABLE public.creator_model_files (
    job_id uuid PRIMARY KEY REFERENCES public.creator_model_jobs(id) ON DELETE CASCADE,
    glb bytea NOT NULL
);
