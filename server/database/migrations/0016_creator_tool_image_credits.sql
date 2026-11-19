-- One reservation per generated image. Both synchronous tools and durable jobs
-- settle through the same refund and rollover trigger as Text-to-Image.
CREATE TABLE public.ai_image_reservations (
    tool text NOT NULL,
    image_id uuid NOT NULL,
    creator_id uuid NOT NULL REFERENCES public.users(id),
    paid_credit_period timestamptz,
    free_credit_month date,
    credits_used integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','failed','completed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_id, tool, image_id),
    CHECK (num_nonnulls(paid_credit_period,free_credit_month) = 1),
    FOREIGN KEY (creator_id,paid_credit_period) REFERENCES public.membership_ai_credit_periods(user_id,period_start),
    FOREIGN KEY (creator_id,free_credit_month) REFERENCES public.free_ai_credit_months(user_id,month_start)
);
CREATE INDEX ai_image_reservations_job ON public.ai_image_reservations(tool,image_id);
CREATE TRIGGER settle_image_credit BEFORE UPDATE OF status ON public.ai_image_reservations
    FOR EACH ROW EXECUTE FUNCTION public.settle_text_image_credits();

-- Keep all tools on the same paid billing period or monthly free balance.
CREATE FUNCTION public.ai_image_balance(member uuid, reserve_image boolean)
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
                        THEN (allowance-allocated)/10 ELSE 5 END
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

CREATE FUNCTION public.reserve_ai_image(member uuid, tool_name text, image uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE funds record;
BEGIN
    SELECT * INTO funds FROM public.ai_image_balance(member,true);
    IF funds.available<10 THEN
        RAISE EXCEPTION USING ERRCODE='DB402', MESSAGE='Insufficient AI credits. Each generated image requires 10 credits.';
    END IF;
    INSERT INTO public.ai_image_reservations(creator_id,tool,image_id,paid_credit_period,free_credit_month)
      VALUES(member,tool_name,image,funds.paid_period,funds.free_month);
END;
$$;

CREATE FUNCTION public.track_ai_image() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member uuid;
BEGIN
    IF TG_OP='DELETE' THEN
        UPDATE public.ai_image_reservations SET status='failed'
          WHERE tool=TG_TABLE_NAME AND image_id=OLD.id AND status='reserved';
        RETURN OLD;
    END IF;
    IF TG_OP='INSERT' OR (OLD.status='pending' AND NEW.status='submitting') THEN
        IF TG_TABLE_NAME='creator_multi_view_images' THEN
            SELECT creator_id INTO STRICT member FROM public.creator_multi_view_jobs WHERE id=NEW.job_id;
        ELSIF TG_TABLE_NAME='creator_costume_extraction_views' THEN
            SELECT creator_id INTO STRICT member FROM public.creator_costume_extraction_jobs WHERE id=NEW.job_id;
        ELSE
            member := NEW.creator_id;
        END IF;
        PERFORM public.reserve_ai_image(member,TG_TABLE_NAME,NEW.id);
    ELSIF NEW.status IN ('completed','failed','submission_unknown') THEN
        UPDATE public.ai_image_reservations SET status=CASE WHEN NEW.status='completed' THEN 'completed' ELSE 'failed' END
          WHERE tool=TG_TABLE_NAME AND image_id=NEW.id AND status='reserved';
    ELSIF OLD.status='failed' AND NEW.status='saving' THEN
        -- Retrying storage can deliver a previously refunded image. Legacy jobs
        -- without a reservation are still free to finish.
        DELETE FROM public.ai_image_reservations WHERE tool=TG_TABLE_NAME AND image_id=NEW.id
          AND status='failed' RETURNING creator_id INTO member;
        IF FOUND THEN PERFORM public.reserve_ai_image(member,TG_TABLE_NAME,NEW.id); END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sketch_image_credit AFTER INSERT OR UPDATE OF status OR DELETE ON public.creator_sketch_to_image_jobs
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();
CREATE TRIGGER tryon_image_credit AFTER INSERT OR UPDATE OF status OR DELETE ON public.creator_virtual_tryon_jobs
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();
CREATE TRIGGER multi_view_credit AFTER INSERT OR UPDATE OF status OR DELETE ON public.creator_multi_view_images
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();
-- Drafts incur a charge only when the user submits an image for generation.
CREATE TRIGGER costume_view_credit AFTER UPDATE OF status OR DELETE ON public.creator_costume_extraction_views
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();
CREATE TRIGGER pattern_image_credit AFTER UPDATE OF status OR DELETE ON public.creator_pattern_extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION public.track_ai_image();

-- Cached Fashion Editor previews reuse the existing attempt without an INSERT.
ALTER TABLE public.fashion_preview_attempts ADD COLUMN credit_image_id uuid;
CREATE FUNCTION public.track_fashion_preview_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF EXISTS (SELECT 1 FROM public.users WHERE id=NEW.user_id AND role='creator') THEN
            NEW.credit_image_id := gen_random_uuid();
            PERFORM public.reserve_ai_image(NEW.user_id,'fashion_preview',NEW.credit_image_id);
        END IF;
    ELSIF TG_OP='DELETE' THEN
        UPDATE public.ai_image_reservations SET status='failed'
          WHERE tool='fashion_preview' AND image_id=OLD.credit_image_id AND status='reserved';
        RETURN OLD;
    ELSIF NEW.state IN ('complete','uncertain') THEN
        UPDATE public.ai_image_reservations SET status=CASE WHEN NEW.state='complete' THEN 'completed' ELSE 'failed' END
          WHERE tool='fashion_preview' AND image_id=NEW.credit_image_id AND status='reserved';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER fashion_preview_credit BEFORE INSERT OR UPDATE OF state OR DELETE ON public.fashion_preview_attempts
    FOR EACH ROW EXECUTE FUNCTION public.track_fashion_preview_credit();
