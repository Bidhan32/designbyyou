# Designer manual payout verification

Current application policy: all designers, including UAE designers, use manual
bank payouts. New Stripe Connect payouts and designer deposits are disabled.
Historical provider payouts are retained for reconciliation.

Run offline controller regressions with `npm run test:payouts` from `server`.
These also run under `npm test`. They check changed request details, idempotent
retries after bank replacement, transactional bank validation, and cancellation
guards. They do not prove database locking or external bank delivery.

Run `npm run test:payouts:sandbox` to exercise real PostgreSQL transactions and
the real HTTP authentication, designer finance, and Super Admin routes. It needs
the same database connectivity, verified baseline/snapshot, and CREATE DATABASE
permission as the previous Stripe sandbox suite. No Stripe Dashboard login,
phone, Stripe CLI, or external transfer is needed.

The suite restores a random disposable `dby_stripe_test_...` database using the
shared sandbox helper, seeds synthetic users and wallet balances, and generates
an ephemeral bank encryption key/JWT secret. The normal database and environment
files are untouched. Wallet starting balances are explicit accounting fixtures;
this suite does not independently prove booking earning provenance. Booking
completion/commission behavior remains covered by the booking payment suites.

Coverage includes:

- Anonymous/role rejection and verified/approved designer requirements.
- Universal manual routing and disabled Connect onboarding.
- Encrypted synthetic bank details and masked designer reads.
- Pending escrow exclusion and verified-bank requirements.
- Concurrent identical requests, changed amount/destination conflicts, and
  concurrent different requests that would overspend.
- Concurrent cancellation/failure with one wallet restoration.
- Admin-only processing/completion, explicit `funds_sent=false`, and rejection
  of restoration when an external transfer reference is present.
- Transaction failure after wallet/ledger writes followed by successful retry;
  one completion ledger entry and rejection of reused transfer references.
- Bank replacement preserving historical destinations and request retries.
- A controlled race that pauses payout bank validation, starts a bank edit,
  then verifies the edit preserves the destination attached by the payout.

No bank transfer is performed. Super Admin completion records synthetic transfer
references only inside the disposable database. Stripe dependencies are replaced
with a rejecting stub in the isolated module graph; this suite cannot certify
historical provider webhooks or actual bank settlement. Do not interpret its
completion responses as evidence of external money movement.

The command closes its HTTP server and removes its generated database in cleanup.
The ignored `server/payout-sandbox-report.json` contains check names and cleanup
outcomes, not bank details or credentials. A database connectivity/setup failure
is a failed run, not a skipped or passing suite. Allow normal cleanup to finish;
forcibly terminating Node can leave its disposable database behind.
