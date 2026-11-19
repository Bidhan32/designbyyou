CREATE TABLE public.free_ai_credit_months (
    user_id uuid NOT NULL REFERENCES public.users(id),
    month_start date NOT NULL,
    allowance integer NOT NULL CHECK (allowance BETWEEN 50 AND 55),
    allocated integer NOT NULL DEFAULT 0 CHECK (allocated BETWEEN 0 AND allowance),
    PRIMARY KEY (user_id, month_start)
);

-- Existing jobs have no reservation and can finish without a retroactive charge.
ALTER TABLE public.creator_text_to_image_jobs
    ADD COLUMN paid_credit_period timestamptz,
    ADD COLUMN free_credit_month date,
    ADD CONSTRAINT t2i_one_credit_source CHECK (num_nonnulls(paid_credit_period, free_credit_month) <= 1),
    ADD FOREIGN KEY (creator_id, paid_credit_period) REFERENCES public.membership_ai_credit_periods(user_id, period_start),
    ADD FOREIGN KEY (creator_id, free_credit_month) REFERENCES public.free_ai_credit_months(user_id, month_start);

-- The allocation counts against available funds while the job is active.
-- Success keeps the allocation. Failure releases it in the same transaction.
CREATE FUNCTION public.settle_text_image_credits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    source public.membership_ai_credit_periods%ROWTYPE;
    free_source public.free_ai_credit_months%ROWTYPE;
    next_allowance integer;
BEGIN
    IF OLD.paid_credit_period IS NULL AND OLD.free_credit_month IS NULL THEN RETURN NEW; END IF;
    IF OLD.status IN ('failed','completed') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Cannot reopen a settled generation';
    END IF;
    IF NEW.status = 'completed' THEN NEW.credits_used := 10; END IF;
    IF NEW.status <> 'failed' OR OLD.status = 'failed' THEN RETURN NEW; END IF;
    PERFORM 1 FROM public.users WHERE id = OLD.creator_id FOR UPDATE;
    IF OLD.paid_credit_period IS NOT NULL THEN
        UPDATE public.membership_ai_credit_periods SET spent = spent - 10
        WHERE user_id = OLD.creator_id AND period_start = OLD.paid_credit_period RETURNING * INTO STRICT source;
        LOOP
            next_allowance := (source.granted + source.carried - source.spent) / 10;
            UPDATE public.membership_ai_credit_periods SET carried = next_allowance
            WHERE user_id = OLD.creator_id AND period_start = source.period_end AND carried <> next_allowance
            RETURNING * INTO source;
            EXIT WHEN NOT FOUND;
        END LOOP;
    ELSE
        UPDATE public.free_ai_credit_months SET allocated = allocated - 10
        WHERE user_id = OLD.creator_id AND month_start = OLD.free_credit_month RETURNING * INTO STRICT free_source;
        LOOP
            next_allowance := 50 + (free_source.allowance - free_source.allocated) / 10;
            UPDATE public.free_ai_credit_months SET allowance = next_allowance
            WHERE user_id = OLD.creator_id AND month_start = (free_source.month_start + interval '1 month')::date
                AND allowance <> next_allowance RETURNING * INTO free_source;
            EXIT WHEN NOT FOUND;
        END LOOP;
    END IF;
    NEW.credits_used := 0;
    RETURN NEW;
END;
$$;
CREATE TRIGGER settle_text_image_credits BEFORE UPDATE OF status ON public.creator_text_to_image_jobs
FOR EACH ROW EXECUTE FUNCTION public.settle_text_image_credits();
