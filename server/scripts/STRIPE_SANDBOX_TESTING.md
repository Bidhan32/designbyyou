# Booking payments: offline checks and real Stripe sandbox suite

From `server`:

```powershell
npm run test:payments
npm run test:stripe:sandbox
```

The first command is offline: real controller logic and Stripe signature verification, with database/provider dependencies isolated. It tests rejected metadata and amounts, late events, refund boundaries, and all five designer commission tiers. It does not prove PostgreSQL concurrency or network payment behavior.

The second command makes real Stripe **test-mode** API calls. It requires the configured test secret key, network access to Stripe, local HTTP sockets, and a PostgreSQL user allowed to create databases. Live and unknown keys are refused before any provider/database side effects, and the retrieved balance must report `livemode=false`.

It restores the verified baseline into a randomly named `dby_stripe_test_...` database, seeds three synthetic users, loads the real application with its database pool isolated from the normal server, and listens only on an ephemeral localhost port. Normal application tables/rows are not modified. Signing secrets and JWT keys are ephemeral process values; `.env` is not rewritten, no emails are sent, and no public endpoint is created.

Coverage includes concurrent identical bookings, changed/foreign request-key rejection, exact payment totals, unpaid/unauthorized verification, signed/raw-body webhook checks, an injected database failure followed by retry of the same event, parallel and distinct-event replays, prototype/final milestones, parallel release, the Silver threshold, creator reward idempotency, completed-booking refund review, parallel funded cancellation, full refunds, late refund/payment events, unpaid cancellation, card decline, and acceptance before payment.

Webhook delivery is deliberately explicit: the suite locally signs snapshots of actual Stripe sandbox objects and posts them through the actual HTTP webhook router. It tests handler behavior, rollback, signatures, and replay safety; it does **not** validate Stripe's outbound delivery, a deployed HTTPS endpoint, Dashboard retry scheduling, frontend Payment Element interactions, or completion of a 3DS challenge. The simulated refund-after-completion event is a state-machine safety test, not an actual external refund.

The normal booking-creation rate limiter remains enabled. This is a small scenario suite, not a load test. Stripe-only test resources may remain in the account's test history. Cleanup attempts to refund succeeded payments or cancel unused PaymentIntents **created by this run only**, closes the local listener, and drops only its generated database. A cleanup failure exits nonzero and records affected test IDs/database names for review.

Results are written to the ignored `server/stripe-sandbox-report.json`; the report contains test object IDs, pass/fail outcomes, and cleanup status, but no API keys, signing secrets, JWTs, or PaymentIntent client secrets. A passing offline test or network preflight failure must not be reported as a passing sandbox suite. After the sandbox suite passes, test a Stripe CLI/deployed endpoint delivery separately with the appropriate endpoint signing secret.

An external refund after a completed booking now returns `manualReconciliationRequired` and preserves completed accounting. This flag and reason are stored through the webhook's ignored-event journal entry; it does not automatically debit earnings that might already have been paid out. Administrative reconciliation is still required for that case.

References: [Stripe testing](https://docs.stripe.com/testing), [automated testing](https://docs.stripe.com/automated-testing), [webhooks](https://docs.stripe.com/webhooks), and [stripe-node webhook testing](https://github.com/stripe/stripe-node#webhook-signing).

## Stripe-originated local delivery

After the sandbox suite passes, run `npm run test:stripe:delivery` from `server`.
This uses `server/stripe.exe` when present, otherwise `stripe` on PATH. Set
`STRIPE_CLI_PATH` to an installed executable if needed. CLI execution must be
allowed by your computer's application policy. It supplies the existing test key
only through the child process environment, does not rewrite CLI login settings,
and captures the listener signing secret internally without printing it.

The command restores a separate disposable database and starts the real backend
on a private localhost port. It confirms one real test booking, waits up to 60
seconds for a Stripe-generated `payment_intent.succeeded` forwarded by the CLI,
and verifies its processed journal entry, escrow balance, and single ledger entry.
It then checks concurrent browser-style verification cannot credit it again.
There is no locally fabricated webhook in this check. The CLI is scoped to this
event type but can receive other test activity on the same account; all handling
in this process uses only the disposable database.

Cleanup stops the CLI/server, refunds this run's payment (or cancels an unpaid
intent), and drops the generated database. Ctrl+C requests cleanup; forcibly
terminating the process can prevent it. Results and cleanup outcomes are saved
to ignored `server/stripe-delivery-report.json`. A failure to launch/connect the
CLI or receive the event fails the check. This does not test a deployed HTTPS
endpoint, Stripe retry scheduling, or interactive browser/3DS completion.

CLI references: [listen](https://github.com/stripe/stripe-cli/wiki/listen-command)
and [environment authentication](https://github.com/stripe/stripe-cli/wiki/using-stripe-api-keys).

## Interactive browser checkout

Run `npm run test:stripe:browser` from `server`. Both server and frontend
dependencies must already be installed. `dby/.env` (or Vite's normal development
environment) needs a `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` matching the server's
Stripe test account; the existing `VITE_STRIPE_PUBLIC_KEY` fallback is accepted.
Before creating a database, the command creates an unconfirmed test PaymentIntent
and checks that the selected frontend publishable key can retrieve it using its
client secret, then cancels it. This checks account/sandbox compatibility, not
just the `pk_test_`/`sk_test_` prefixes. A mismatch stops setup with instructions
to obtain the matching publishable key from Stripe; credentials are never printed.
The probe is tracked for cleanup if retrieval fails. It is never confirmed or charged.

The command refuses non-test keys, restores a separate database, seeds a verified
creator and approved designer, and starts the actual backend and Vite frontend
on localhost ports. It overrides the frontend API URL in memory. Existing
servers, environment files, and application databases are untouched.

Open the private URL printed in PowerShell and follow its checklist. A temporary
Vite middleware sets the synthetic creator's short-lived token on this isolated
frontend origin. It is defined only in the script, not in the production app.
Treat that URL as private. The session uses the real booking form, Stripe card
element, and normal backend verification route. This stage does not run a CLI
listener: it specifically checks browser reconciliation after Stripe.js payment.
Use only booking checkout during the session; other payment products are outside
its resource tracking and cleanup.

The checklist covers Visa success, decline then retry on the same booking, 3DS
success, challenge cancellation/failure, and refresh before payment. Test card
numbers come from [Stripe testing](https://docs.stripe.com/testing):
`4242 4242 4242 4242`, `4000 0000 0000 9995`, and `4000 0000 0000 3220`.
Use a future expiry, any three-digit CVC, and different future deadlines for
distinct bookings. Record what you see, especially booking IDs before/after a
retry or refresh. Do not call UI behavior passed just because setup succeeded.

Keep PowerShell running. Close checkout tabs, then press Ctrl+C once and allow
cleanup to finish (there is also a 45-minute limit). It records booking state and
escrow ledger counts, retrieves provider status and successful charge 3DS details,
refunds only intents created through this run's booking flow, cancels unused
intents, and removes the disposable database. Forced termination can prevent
cleanup. The ignored `server/stripe-browser-report.json` contains observations
and cleanup results, never JWTs, client secrets, or API keys. Its normal final
result is `manual_review_required`, not an automatic UI test pass.
