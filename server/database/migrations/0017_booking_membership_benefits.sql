-- Existing bookings retain the terms offered at the time of checkout.
ALTER TABLE public.bookings ADD COLUMN membership_terms jsonb;
ALTER TABLE public.users ADD COLUMN booking_reward_remainder integer NOT NULL DEFAULT 0
    CHECK (booking_reward_remainder BETWEEN 0 AND 9999);

-- Assign a negotiated, versioned Enterprise plan to an individual creator.
CREATE TABLE public.creator_enterprise_terms (
    user_id uuid PRIMARY KEY REFERENCES public.users(id),
    tier text NOT NULL DEFAULT 'enterprise' CHECK (tier='enterprise'),
    plan_version integer NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
    FOREIGN KEY (tier,plan_version) REFERENCES public.membership_plan_versions(tier,version)
);

CREATE INDEX IF NOT EXISTS project_revisions_booking_idx ON public.project_revisions(booking_id);

-- A negotiated discount can leave less cash in escrow than the designer earned.
ALTER TABLE public.transactions
    ADD COLUMN platform_contribution numeric(15,2) NOT NULL DEFAULT 0
        CHECK (platform_contribution >= 0 AND (platform_contribution=0 OR transaction_type='escrow_release')),
    DROP CONSTRAINT transactions_amounts_balanced,
    ADD CONSTRAINT transactions_amounts_balanced CHECK
        (abs(gross_amount + platform_contribution - platform_fee_deducted - net_amount) <= 0.01);
