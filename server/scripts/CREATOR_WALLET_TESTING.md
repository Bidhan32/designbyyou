# Creator wallet safety checks

From `server`, run `npm run test:creator-wallet` for offline regressions. These
also run under `npm test`. They check deposit INSERT conflicts, identity/amount/
currency validation, unpaid rejection, and credited-deposit idempotency. A losing
concurrent INSERT must validate the winning row before contacting Stripe.

Run `npm run test:creator-wallet:sandbox` for the real Stripe test-mode integration
suite. It uses the existing server test key and the same disposable-database
requirements as the booking suite. No Dashboard login, browser publishable key,
phone, or Stripe CLI is needed. Live/unknown keys are refused and balance mode
must be test before database creation. It does create Stripe test PaymentIntents
and refunds, which remain in the account's test history.

The command restores the verified baseline into its own randomly named database,
seeds synthetic users, and runs the actual application on a localhost port with
an isolated database/provider module graph. Environment overrides are process
only. Normal application rows and environment files are untouched.

Coverage includes authentication/role/email rules, Stripe-only deposits, request
reuse and changed amounts, unpaid deposits, webhook rollback/replay, one deposit
credit/ledger entry, concurrent identical refunds, FIFO splitting across real
funding sources, concurrent overspend prevention, foreign wallet isolation, stale
pending events after success, retrying an existing request after verification
changes, definitive pre-submission failure/restoration, lost response discovery,
and conservative replay windows for unlinked deposits and uncertain refunds.

Faults are explicit: a ledger error, a definitive refund creation error before
the provider call, a dropped response after a real Stripe refund, and an uncertain
connection error before submission are injected. This does not claim to reproduce
actual bank/card network refund failures. Webhook snapshots of real Stripe
objects are locally signed and sent through the real raw-body/signature handler;
this does not test Stripe outbound delivery or browser/3DS interaction.

The suite cleans up only PaymentIntents it created: unused intents are cancelled,
and successful payments are refunded for their remaining unrefunded amount.
Already pending/successful refunds are counted to avoid duplicate cleanup. The
local server is closed and only its generated database is dropped. Do not
forcibly terminate Node before cleanup finishes. Failures to connect, finish
checks, or clean up are failures, not passing/skipped checks.

The ignored `server/creator-wallet-sandbox-report.json` contains outcomes,
test resource IDs, and cleanup status, not keys/JWTs/client secrets. Expected
injected-failure console errors can appear during a successful run; use the final
suite result and cleanup report to assess it.
