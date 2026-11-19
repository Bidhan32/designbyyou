CREATE TABLE public.membership_plan_versions (
    tier text NOT NULL CHECK (tier IN ('free','basic','pro','enterprise')),
    version integer NOT NULL CHECK (version > 0),
    monthly_price_usd_cents integer CHECK (monthly_price_usd_cents >= 0),
    monthly_ai_credits integer CHECK (monthly_ai_credits >= 0),
    booking_fee_usd_cents integer NOT NULL CHECK (booking_fee_usd_cents >= 0),
    rewards_per_100_usd integer CHECK (rewards_per_100_usd >= 0),
    alteration_limit integer CHECK (alteration_limit >= 0),
    purchase_discount_percent integer CHECK (purchase_discount_percent BETWEEN 0 AND 100),
    PRIMARY KEY (tier, version),
    CHECK (tier = 'enterprise' OR (
        monthly_price_usd_cents IS NOT NULL AND monthly_ai_credits IS NOT NULL
        AND rewards_per_100_usd IS NOT NULL AND alteration_limit IS NOT NULL
        AND purchase_discount_percent IS NOT NULL
    ))
);

INSERT INTO public.membership_plan_versions
    (tier, version, monthly_price_usd_cents, monthly_ai_credits, booking_fee_usd_cents,
     rewards_per_100_usd, alteration_limit, purchase_discount_percent)
VALUES
    ('free', 1, 0, 50, 500, 1, 1, 0),
    ('basic', 1, 3000, 1500, 0, 3, 2, 5),
    ('pro', 1, 6000, 4500, 0, 5, 3, 15),
    ('enterprise', 1, NULL, NULL, 0, NULL, NULL, NULL);

CREATE TABLE public.membership_ai_credit_periods (
    user_id uuid NOT NULL REFERENCES public.users(id),
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL CHECK (period_end > period_start),
    tier text NOT NULL,
    plan_version integer NOT NULL,
    stripe_invoice_id text NOT NULL UNIQUE CHECK (length(trim(stripe_invoice_id)) > 0),
    granted integer NOT NULL CHECK (granted >= 0),
    carried integer NOT NULL CHECK (carried >= 0),
    spent integer NOT NULL DEFAULT 0 CHECK (spent BETWEEN 0 AND granted + carried),
    PRIMARY KEY (user_id, period_start),
    FOREIGN KEY (tier, plan_version) REFERENCES public.membership_plan_versions(tier, version)
);

-- Late invoices can increase the rollover already recorded for later periods.
CREATE FUNCTION public.grant_paid_ai_credit_period(
    member_id uuid, member_tier text, member_version integer,
    starts_at timestamptz, ends_at timestamptz, invoice_id text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    prior public.membership_ai_credit_periods%ROWTYPE;
    allowance integer;
    rollover integer := 0;
BEGIN
    IF member_tier NOT IN ('basic','pro') THEN
        RAISE EXCEPTION 'A standard paid monthly plan is required';
    END IF;
    PERFORM 1 FROM public.users WHERE id = member_id FOR UPDATE;
    SELECT * INTO prior FROM public.membership_ai_credit_periods WHERE stripe_invoice_id = invoice_id;
    IF FOUND THEN
        IF (prior.user_id, prior.tier, prior.plan_version, prior.period_start, prior.period_end)
           IS DISTINCT FROM (member_id, member_tier, member_version, starts_at, ends_at) THEN
            RAISE EXCEPTION 'Credit invoice already recorded with different terms';
        END IF;
        RETURN;
    END IF;
    SELECT monthly_ai_credits INTO STRICT allowance FROM public.membership_plan_versions
        WHERE tier = member_tier AND version = member_version;
    IF EXISTS (SELECT 1 FROM public.membership_ai_credit_periods WHERE user_id = member_id
               AND period_start < ends_at AND period_end > starts_at) THEN
        RAISE EXCEPTION 'Credit period overlaps a recorded period';
    END IF;
    SELECT * INTO prior FROM public.membership_ai_credit_periods WHERE user_id = member_id
        AND period_end = starts_at FOR UPDATE;
    IF FOUND THEN
        rollover := (prior.granted + prior.carried - prior.spent) / 10;
    END IF;
    INSERT INTO public.membership_ai_credit_periods
        (user_id, period_start, period_end, tier, plan_version, stripe_invoice_id, granted, carried)
    VALUES (member_id, starts_at, ends_at, member_tier, member_version, invoice_id, allowance, rollover);
    rollover := (allowance + rollover) / 10;
    LOOP
        UPDATE public.membership_ai_credit_periods SET carried = rollover
            WHERE user_id = member_id AND period_start = ends_at AND carried <> rollover
            RETURNING * INTO prior;
        EXIT WHEN NOT FOUND;
        ends_at := prior.period_end;
        rollover := (prior.granted + prior.carried - prior.spent) / 10;
    END LOOP;
END;
$$;
