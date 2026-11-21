-- Tester funds expire with the UTC month. Only the regular allowance rolls over.
ALTER TABLE public.free_ai_credit_months
    ADD COLUMN tester_bonus integer NOT NULL DEFAULT 0 CHECK (tester_bonus >= 0),
    DROP CONSTRAINT free_ai_credit_months_allowance_check,
    ADD CHECK (allowance - tester_bonus BETWEEN 50 AND 55);

CREATE OR REPLACE FUNCTION public.ai_image_balance(member uuid, reserve_image boolean)
RETURNS TABLE(available integer, paid_period timestamptz, free_month date)
LANGUAGE plpgsql AS $$
DECLARE
    current_month date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
    PERFORM 1 FROM public.users WHERE id=member FOR UPDATE;
    -- A crashed synchronous worker can never deliver its result.
    UPDATE public.ai_image_reservations SET status='failed'
      WHERE creator_id=member AND tool IN ('booking_tryon','background_remover')
        AND status='reserved' AND created_at < now()-interval '30 minutes';
    SELECT p.granted+p.carried-p.spent,p.period_start INTO available,paid_period
      FROM public.membership_ai_credit_periods p
      WHERE p.user_id=member AND p.period_start<=now() AND p.period_end>now();
    IF FOUND THEN
        IF reserve_image AND available>=10 THEN
            UPDATE public.membership_ai_credit_periods SET spent=spent+10
              WHERE user_id=member AND period_start=paid_period;
        END IF;
    ELSE
        free_month := current_month;
        INSERT INTO public.free_ai_credit_months(user_id,month_start,allowance)
          SELECT member,current_month,50+coalesce((
            SELECT CASE WHEN month_start=(current_month-interval '1 month')::date
                        THEN greatest(0,allowance-tester_bonus-allocated)/10 ELSE 5 END
            FROM public.free_ai_credit_months WHERE user_id=member AND month_start<current_month
            ORDER BY month_start DESC LIMIT 1),0)
          ON CONFLICT DO NOTHING;
        SELECT f.allowance-f.allocated INTO available FROM public.free_ai_credit_months f
          WHERE f.user_id=member AND f.month_start=current_month;
        IF reserve_image AND available>=10 THEN
            UPDATE public.free_ai_credit_months SET allocated=allocated+10
              WHERE user_id=member AND month_start=current_month;
        END IF;
    END IF;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_text_image_credits() RETURNS trigger LANGUAGE plpgsql AS $$
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
            next_allowance := 50 + greatest(0, free_source.allowance - free_source.tester_bonus - free_source.allocated) / 10;
            UPDATE public.free_ai_credit_months SET allowance = next_allowance + tester_bonus
            WHERE user_id = OLD.creator_id AND month_start = (free_source.month_start + interval '1 month')::date
                AND allowance <> next_allowance + tester_bonus RETURNING * INTO free_source;
            EXIT WHEN NOT FOUND;
        END LOOP;
    END IF;
    NEW.credits_used := 0;
    RETURN NEW;
END;
$$;
