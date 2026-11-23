UPDATE public.membership_plan_versions
SET rewards_per_1000_usd = 0
WHERE tier = 'free';
