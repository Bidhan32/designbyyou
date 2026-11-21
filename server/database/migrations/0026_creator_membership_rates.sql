ALTER TABLE public.membership_plan_versions RENAME COLUMN rewards_per_100_usd TO rewards_per_1000_usd;
UPDATE public.membership_plan_versions SET rewards_per_1000_usd = rewards_per_1000_usd * 10;

UPDATE public.membership_plan_versions
SET monthly_price_usd_cents = 5000, purchase_discount_percent = 6, rewards_per_1000_usd = 5
WHERE tier = 'basic' AND version = 1;
UPDATE public.membership_plan_versions
SET monthly_price_usd_cents = 10000, purchase_discount_percent = 16, rewards_per_1000_usd = 10
WHERE tier = 'pro' AND version = 1;
UPDATE public.membership_plan_versions SET purchase_discount_percent = 35 WHERE tier = 'enterprise';

-- Carry existing fractional points into the finer units used for new bookings.
ALTER TABLE public.users DROP CONSTRAINT users_booking_reward_remainder_check;
ALTER TABLE public.users ADD CHECK (booking_reward_remainder BETWEEN 0 AND 99999);
UPDATE public.users SET booking_reward_remainder = booking_reward_remainder * 10
WHERE booking_reward_remainder <> 0;
