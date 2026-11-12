# Creator subscription verification

Run `npm run test:subscriptions` from `server` for offline regressions (also part
of `npm test`). They verify open checkout reuse, expiration before plan replacement,
creator checkout locking/release, explicit customer ownership conflicts, blocking
subscription statuses, incomplete history rejection, supported price mapping,
and the entitlement state matrix. Current policy intentionally retains paid access
while `past_due`; `active` and `trialing` also have access. `unpaid`, `paused`,
`canceled`, `incomplete`, and `incomplete_expired` map to free access. Unknown prices
never grant paid access. Checkout completion alone cannot activate a tier.

New checkouts hold a per-creator PostgreSQL session advisory lock across their
provider preparation, not a transaction or wallet row lock. A competing request
gets `409 SUBSCRIPTION_CHECKOUT_IN_PROGRESS` and can retry. Matching open sessions
are reused even with a new request UUID. Changing the requested plan or configured
price expires the old session first. Ambiguous/multiple open sessions or truncated
provider history require reconciliation. Other apps/Dashboard actions can still
create subscriptions outside this lock; this is not an account-wide uniqueness
guarantee. Stripe remains the billing source of truth.

Run `npm run test:subscriptions:sandbox` for real Stripe test-mode API operations
and disposable PostgreSQL checks. No phone, Dashboard sign-in, publishable key,
or CLI is needed. It requires the same connectivity and disposable database
permissions as the other sandbox suites. It creates run-specific Stripe test
products, three recurring prices, customers, Checkout Sessions, subscriptions,
a Billing Portal session, and a test clock. The suite reads an existing active
test-mode portal configuration (the configured ID, otherwise the account default)
and never creates, changes, or deactivates that configuration. Existing price IDs
and portal configuration IDs are overridden only in this process. No account defaults
are changed and no production database rows are modified.

The suite checks authentication/email/role rules, concurrent checkout preparation,
open session reuse, plan replacement, subscription synchronization rollback/retry,
duplicate webhooks, API plan changes, scheduled/immediate cancellation, stale
payload resistance, trial conversion, a paid renewal, and a failed renewal with
the application's past-due grace policy. When necessary it explicitly finalizes
or pays a generated test invoice instead of waiting for background scheduling.
It marks the failed test invoice uncollectible and compares the stored state to
Stripe; account retry rules can change the resulting provider state. The offline
state matrix separately checks `unpaid` revokes access.

Webhooks are locally signed events through the real signature/raw-body router.
The subscription itself is refetched from Stripe before applying the state.
This does not test Stripe outbound delivery, hosted Checkout completion, hosted
portal plan-change/cancel interactions, proration policy, tax, invoice email
delivery, or 3DS. API plan changes are performed with proration disabled in the
isolated test scenario. The clock may take up to 90 seconds per advance and logs
progress; no ordinary billing cycle needs to pass in real time.

Cleanup expires owned open sessions, cancels owned subscriptions, refunds owned
test customer charges, removes test customers/clock, and archives this run's
prices/product. The pre-existing portal configuration is left unchanged. Test billing history
can remain in Stripe. Cleanup operates only on captured run resources and failures
are recorded. Do not forcibly terminate the command during cleanup.

Ignored `server/subscription-sandbox-report.json` records check names, test object
IDs and cleanup outcomes, not API keys, JWTs, or hosted session URLs. An injected
subscription-write failure is expected during rollback testing. Connectivity,
setup, checks, or cleanup failures cannot count as a passing suite.

For an older report whose only failure was deactivating a run-owned Billing Portal
configuration, run `npm run test:subscriptions:cleanup`. It verifies test mode and
ownership before retrying non-default configuration deactivation. If the recorded
configuration is the account default, it leaves it active and explicitly records
`retained_default_configuration`. A fully tested run can then be labeled
`passed_with_retained_test_configuration`, which is distinct from full cleanup.
It never changes the default configuration selection or creates another default.
It does not rerun payments, create a database, or touch unrelated configurations.

References: [Checkout listing](https://docs.stripe.com/api/checkout/sessions/list)
and [Stripe Billing testing](https://docs.stripe.com/billing/testing).
