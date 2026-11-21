-- Run with psql after migration 0025. Set tester_email before including this file.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('dby.tester_email', :'tester_email', true);
DO $grant$
DECLARE
    tester uuid;
    funds record;
    top_up integer;
BEGIN
    SELECT id INTO STRICT tester FROM public.users
      WHERE lower(email)=lower(current_setting('dby.tester_email')) AND role='creator' FOR UPDATE;
    SELECT * INTO STRICT funds FROM public.ai_image_balance(tester,false);
    IF funds.paid_period IS NOT NULL THEN
        RAISE EXCEPTION 'This grant is only for a free creator';
    END IF;
    IF NOT EXISTS (SELECT FROM public.free_ai_credit_months WHERE user_id=tester AND tester_bonus>0) THEN
        top_up := greatest(0,2000-funds.available);
        UPDATE public.free_ai_credit_months
           SET tester_bonus=tester_bonus+top_up, allowance=allowance+top_up
         WHERE user_id=tester AND month_start=funds.free_month;
    END IF;
END
$grant$;
SELECT u.email, b.available AS available_ai_credits, b.free_month AS credit_month
FROM public.users u CROSS JOIN LATERAL public.ai_image_balance(u.id,false) b
WHERE lower(u.email)=lower(current_setting('dby.tester_email'));
COMMIT;
