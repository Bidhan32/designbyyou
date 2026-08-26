"use strict";

/*
=========================================================
FashionVision Designer Finance Routes
Wallet, Earnings, Stripe Connect and Withdrawals
Version 3.6
=========================================================

Responsibilities:

1. Designer wallet overview
2. Earnings/credit ledger
3. Stripe Connect payout accounts
4. Stripe Connect onboarding/status
5. Designer payout requests
6. Stripe bank-payout recovery/retry
7. Pending payout cancellation
8. Designer wallet deposits
9. Wallet-deposit reconciliation
10. Financial request rate limiting

Stripe withdrawal architecture:

Internal wallet
      ↓
ONE Stripe Transfer
      ↓
Connected Stripe balance
      ↓
ONE OR MORE bank payout attempts

Example:

designer_payout_request
      │
      └── tr_123
            │
            ├── attempt 1 → po_111 → failed
            └── attempt 2 → po_222 → paid

A replacement bank payout NEVER creates another tr_ Transfer
for the same withdrawal request.

=========================================================
RATE LIMITING
=========================================================

User-triggered external financial actions are protected by
application-level rate limiting.

Currently:

Stripe Connect onboarding
→ stripeConnectFinancialLimiter

Designer payout creation
→ designerPayoutLimiter

Designer bank-payout retry
→ designerPayoutLimiter

Designer wallet deposit creation
→ designerWalletDepositLimiter

IMPORTANT:

Rate limiting does NOT replace:

- authentication
- designer authorization
- admin approval
- email verification
- client_request_id idempotency
- PostgreSQL row locking
- Stripe idempotency
- webhook signature verification
- durable payout attempt tracking

Stripe webhook endpoints must NEVER use these HTTP
financial-action limiters.

=========================================================
*/

const express = require("express");

const designerFinanceController = require("../controllers/designerFinanceController");

const {
  protect,
  authorize,
  requireApprovedAccount,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const {
  designerWalletDepositLimiter,
  designerPayoutLimiter,
  stripeConnectFinancialLimiter,
} = require("../middlewares/financialRateLimitMiddleware");

const router = express.Router();

/*=========================================================
Global Designer Access

Every route below requires:

1. Authentication
2. Designer role

These rules apply before any finance route handler runs.
=========================================================*/

router.use(protect);

router.use(authorize("designer"));

/*=========================================================
Additional Financial Action Protection

Sensitive NEW designer financial actions additionally
require:

1. Approved designer account
2. Verified email

Designer policy:

DESIGNER
- email verification required
- admin approval required

Certain recovery/reconciliation endpoints intentionally do
not use these checks when money may already have been
collected or reserved and blocking reconciliation could
strand funds.
=========================================================*/

const secureFinancialAction = [requireApprovedAccount, requireVerifiedEmail];

/*=========================================================
1. Wallet Overview

Returns:

- available_balance
- pending_escrow_balance
- pending_payout_balance
- total_wallet_balance
- lifetime_earnings
- lifetime_deposits
- lifetime_withdrawn
- queued_payouts

GET
/api/v1/designer-finance/wallet

Security:

- authenticated user
- designer role
- read-only endpoint
=========================================================*/

router.get("/wallet", designerFinanceController.getWalletBalance);

/*=========================================================
2. Earnings and Credit Ledger

Returns designer credit transactions.

Supported transaction types currently include:

- escrow_release
- marketplace_purchase
- marketplace_sale
- wallet_deposit

Optional query parameters:

?page=1
&limit=25
&type=escrow_release
&search=booking-or-buyer

GET
/api/v1/designer-finance/ledger

Security:

- authenticated user
- designer role
- read-only endpoint
=========================================================*/

router.get("/ledger", designerFinanceController.getEarningsLedger);

/*=========================================================
3. Designer Payout Accounts

Returns payout accounts linked to the authenticated
designer.

Currently:

- Stripe Connect

The underlying table remains provider-neutral for future
providers.

GET
/api/v1/designer-finance/payout-accounts

Security:

- authenticated user
- designer role
- read-only endpoint
=========================================================*/

router.get("/payout-accounts", designerFinanceController.getPayoutAccounts);

/*=========================================================
4. Start or Resume Stripe Connect Onboarding

Creates a Stripe connected account if the designer does not
already have one.

The account reference is stored in:

designer_payout_accounts

Durable Stripe account creation/recovery is tracked through
the Stripe Connect operation/reconciliation workflow.

If an account already exists, onboarding is resumed instead
of intentionally creating another account.

If Stripe already reports the account payout-ready, the
controller returns the current synchronized account state
rather than unnecessarily generating another onboarding
link.

Sensitive external financial setup:

- Approved designer account required
- Verified email required
- Stripe Connect financial rate limiter applied

Middleware order:

protect
→ authorize("designer")
→ requireApprovedAccount
→ requireVerifiedEmail
→ stripeConnectFinancialLimiter
→ startStripeConnectOnboarding

POST
/api/v1/designer-finance/payout-accounts/stripe/connect

Optional body:

{
  "country": "US"
}
=========================================================*/

router.post(
  "/payout-accounts/stripe/connect",
  ...secureFinancialAction,
  stripeConnectFinancialLimiter,
  designerFinanceController.startStripeConnectOnboarding,
);

/*=========================================================
5. Refresh Stripe Connect Status

Retrieves the connected account directly from Stripe and
synchronizes designer_payout_accounts.

Checks can include:

- Connected-account state
- Recipient configuration
- Stripe transfer capability
- Stripe payout capability
- Blocking requirements
- Whether onboarding is still required

This endpoint refreshes/reads provider state.

GET
/api/v1/designer-finance/payout-accounts/stripe/status

Security:

- authenticated user
- designer role

No financial-action limiter is applied here because this is
a provider-state read/synchronization endpoint rather than
creation of a new external money movement.
=========================================================*/

router.get(
  "/payout-accounts/stripe/status",
  designerFinanceController.getStripeConnectStatus,
);

/*=========================================================
6. Payout Request History

Returns payout requests belonging only to the authenticated
designer.

Optional query parameters:

?page=1
&limit=25
&status=pending

Supported payout-request statuses:

- pending
- processing
- completed
- failed
- cancelled

The controller also includes payout-attempt data,
including:

- payout_attempt_count
- latest_payout_attempt
- bank_payout_recovery_required

Example response structure:

{
  "request_id": "...",
  "provider_transaction_id": "tr_...",
  "provider_payout_id": "po_...",
  "payout_attempt_count": 2,
  "latest_payout_attempt": {
    "attempt_number": 2,
    "provider_payout_id": "po_...",
    "status": "paid"
  }
}

GET
/api/v1/designer-finance/payouts

Security:

- authenticated user
- designer role
- read-only endpoint
=========================================================*/

router.get("/payouts", designerFinanceController.getPayoutHistory);

/*=========================================================
7. Create or Safely Resume Designer Withdrawal

Supported payout methods:

1. manual
2. stripe

=========================================================
MANUAL PAYOUT
=========================================================

For a NEW manual payout:

available_balance
        ↓
pending_payout_balance

The request remains:

pending

until the manual payout workflow handles it.

Example:

{
  "amount": 25,
  "payoutMethod": "manual",
  "destinationSummary": "Account ending 1234",
  "client_request_id": "UUID"
}

=========================================================
NEW STRIPE PAYOUT
=========================================================

For a NEW Stripe withdrawal:

1. Verify connected Stripe account

2. Verify Stripe transfer/payout readiness

3. Ensure connected-account payout schedule is manual

4. Serialize the payout request

5. Lock designer wallet

6. Check available_balance

7. Create designer_payout_requests row

8. Reserve wallet funds:

   available_balance
          ↓
   pending_payout_balance

9. Create exactly ONE platform -> connected account Transfer:

   tr_123

10. Save tr_123 as:

    provider_transaction_id

11. Remove the internal pending payout reservation after
    the Transfer succeeds because the funds have left the
    platform-side internal wallet accounting

12. Create designer_payout_attempts attempt #1 BEFORE the
    external bank payout API request

13. Create Stripe bank payout:

    po_111

14. Save po_111 on payout attempt #1

15. Stripe Connect webhook updates the exact payout attempt

=========================================================
SAME REQUEST / IDEMPOTENT CONTINUATION
=========================================================

For the SAME withdrawal while its initial Transfer or first
bank-payout submission is still being safely reconciled:

POST /payouts

must use:

the SAME client_request_id

The frontend MUST NOT generate another UUID for the same
withdrawal.

This prevents:

- another wallet reservation
- another designer_payout_requests row
- another Stripe Transfer

=========================================================
FAILED BANK PAYOUT
=========================================================

Once an actual Stripe bank payout exists and is definitively
failed/canceled:

DO NOT use a new withdrawal request.

Example:

tr_123 succeeded

po_111 failed

At this stage:

POST /payouts

will NOT automatically create po_222.

Instead use:

POST /payouts/:id/retry

That endpoint operates on the existing withdrawal.

=========================================================
UNKNOWN INITIAL STRIPE RESULT
=========================================================

If a Transfer or first bank payout result is uncertain, the
controller preserves the existing request/attempt.

Within the safe replay period, the same request can be
replayed using the same application/Stripe idempotency
identity.

Older uncertain operations may require reconciliation rather
than blind automatic resubmission.

=========================================================
NEW WITHDRAWAL
=========================================================

Every genuinely NEW withdrawal requires a NEW:

client_request_id UUID

Example:

{
  "amount": 25,
  "payoutMethod": "stripe",
  "client_request_id": "NEW-UUID"
}

=========================================================
SECURITY
=========================================================

Requires:

- authenticated designer
- approved designer account
- verified email
- designer payout rate limiter

Middleware order:

protect
→ authorize("designer")
→ requireApprovedAccount
→ requireVerifiedEmail
→ designerPayoutLimiter
→ requestPayout

POST
/api/v1/designer-finance/payouts
=========================================================*/

router.post(
  "/payouts",
  ...secureFinancialAction,
  designerPayoutLimiter,
  designerFinanceController.requestPayout,
);

/*=========================================================
8. Retry Existing Stripe Bank Payout

POST
/api/v1/designer-finance/payouts/:id/retry

This endpoint is for an EXISTING Stripe withdrawal.

It does NOT create a new withdrawal request.

It does NOT accept a new amount.

It does NOT reserve the designer wallet again.

It does NOT create another platform -> connected account
Stripe Transfer.

=========================================================
EXAMPLE
=========================================================

Original withdrawal:

designer_payout_request
      │
      └── tr_123
            │
            └── attempt #1
                    │
                    └── po_111
                          ↓
                        failed

Retry:

POST
/api/v1/designer-finance/payouts/<REQUEST_UUID>/retry

Result:

designer_payout_request
      │
      └── SAME tr_123
            │
            ├── attempt #1
            │      po_111
            │      failed
            │
            └── attempt #2
                   po_222
                   pending / paid

=========================================================
WHAT THE CONTROLLER DOES
=========================================================

Before creating a replacement payout, it:

1. Loads the existing designer payout request

2. Verifies ownership

3. Requires:

   payout_method = stripe
   provider = stripe

4. Requires the original:

   provider_transaction_id = tr_...

5. Loads the latest designer_payout_attempts row

6. If po_ exists, retrieves it from Stripe

7. Reconciles Stripe as the source of truth

8. If existing po_ is:

   paid
      → no retry

   pending
      → no retry

   in_transit
      → no retry

   failed
      → replacement may be created

   canceled
      → replacement may be created

9. Creates the next persistent payout attempt

10. Reuses the SAME original tr_ Transfer

11. Creates a NEW po_ bank payout

=========================================================
UNCERTAIN ATTEMPT WITHOUT po_
=========================================================

If an attempt exists but the application could not confirm
whether Stripe created the payout, the controller can safely
reuse the SAME payout-attempt ID and SAME idempotency key
while that replay is still considered safe.

It does NOT create a second attempt blindly.

=========================================================
SECURITY
=========================================================

This endpoint can initiate a NEW external Stripe bank payout
from funds already held on the connected Stripe account.

Therefore it requires:

- Approved designer account
- Verified email
- Designer payout rate limiter

The existing withdrawal must also belong to the
authenticated designer.

The rate limiter protects repeated user-triggered payout
recovery requests from hammering Stripe or PostgreSQL.

It does NOT replace the controller's durable payout-attempt
idempotency logic.

Middleware order:

protect
→ authorize("designer")
→ requireApprovedAccount
→ requireVerifiedEmail
→ designerPayoutLimiter
→ retryStripePayout

=========================================================
IMPORTANT
=========================================================

The frontend should NOT send:

- a new amount
- a new payout method
- a new client_request_id

The payout request UUID in:

:id

is the identity of the withdrawal being recovered.

=========================================================*/

router.post(
  "/payouts/:id/retry",
  ...secureFinancialAction,
  designerPayoutLimiter,
  designerFinanceController.retryStripePayout,
);

/*=========================================================
9. Cancel Pending Payout Request

Only an internally pending payout can be cancelled.

When allowed:

pending_payout_balance
        ↓
available_balance

A Stripe withdrawal normally changes to:

processing

before external Stripe processing begins.

Therefore a Stripe payout cannot be cancelled here after
external money movement has started.

=========================================================
WHY THIS ROUTE DOES NOT USE secureFinancialAction
=========================================================

This endpoint intentionally does NOT require current:

- account approval
- verified email

because the designer may need to recover already-reserved
INTERNAL wallet funds if account state changed after the
request was originally created.

The controller still strictly requires:

status = pending

before restoring the reservation.

=========================================================
RATE-LIMIT NOTE
=========================================================

designerPayoutLimiter is intentionally NOT attached here.

This endpoint restores an existing internal reservation and
does not create a new Stripe Transfer or bank payout.

The strict controller status check remains the primary
financial safety mechanism.

POST
/api/v1/designer-finance/payouts/:id/cancel
=========================================================*/

router.post(
  "/payouts/:id/cancel",
  designerFinanceController.cancelPayoutRequest,
);

/*=========================================================
10. Initialize Secure Designer Wallet Deposit

Creates a Stripe PaymentIntent for funding the designer's
internal wallet.

Sensitive NEW financial action:

- Approved account required
- Verified email required
- Designer wallet deposit rate limiter applied

Frontend receives:

- clientSecret
- paymentIntentId
- amount
- currency

A valid client_request_id UUID is required.

The SAME client_request_id must be used if creation of the
same PaymentIntent request is retried.

POST
/api/v1/designer-finance/wallet/deposit

Body:

{
  "amount": 20,
  "client_request_id": "UUID"
}

=========================================================
WHY THIS USES ITS OWN LIMITER
=========================================================

designerWalletDepositLimiter is independent from
designerPayoutLimiter because:

- deposits and payouts have different risk profiles
- deposit retries can legitimately occur more frequently
- payout quota exhaustion should not block deposits
- deposit quota exhaustion should not block payouts
- PaymentIntent creation deserves independent abuse control

Middleware order:

protect
→ authorize("designer")
→ requireApprovedAccount
→ requireVerifiedEmail
→ designerWalletDepositLimiter
→ createWalletDeposit
=========================================================*/

router.post(
  "/wallet/deposit",
  ...secureFinancialAction,
  designerWalletDepositLimiter,
  designerFinanceController.createWalletDeposit,
);

/*=========================================================
11. Verify and Credit Designer Wallet Deposit

Retrieves the PaymentIntent directly from Stripe.

The backend does NOT trust frontend claims for:

- amount
- currency
- payment status

Stripe's PaymentIntent is treated as the provider source of
truth.

The controller validates:

- PaymentIntent ID
- succeeded status
- designer metadata
- transaction purpose
- currency
- expected amount
- received amount
- existing transaction/idempotency state

=========================================================
WHY THIS ROUTE DOES NOT USE secureFinancialAction
=========================================================

If Stripe already collected the designer's money, the
backend must still be able to reconcile and credit that
successful payment even if the account's approval or email
verification state changed after payment.

=========================================================
WHY THIS ROUTE DOES NOT USE A FINANCIAL ACTION LIMITER
=========================================================

This route is reconciliation for a payment that may already
have been collected.

It must not be blocked in a way that could strand a
successful Stripe deposit.

POST
/api/v1/designer-finance/wallet/verify-deposit

Body:

{
  "paymentIntentId": "pi_..."
}
=========================================================*/

router.post(
  "/wallet/verify-deposit",
  designerFinanceController.verifyWalletDeposit,
);

/*=========================================================
Final Route Contract
=========================================================

READ OPERATIONS
---------------------------------------------------------

GET /wallet

GET /ledger

GET /payout-accounts

GET /payout-accounts/stripe/status

GET /payouts


NEW / EXTERNAL FINANCIAL ACTIONS
---------------------------------------------------------

POST /payout-accounts/stripe/connect
    → approved + verified required
    → stripeConnectFinancialLimiter

POST /payouts
    → approved + verified required
    → designerPayoutLimiter

POST /wallet/deposit
    → approved + verified required
    → designerWalletDepositLimiter


EXTERNAL PAYOUT RECOVERY
---------------------------------------------------------

POST /payouts/:id/retry
    → approved + verified required
    → designerPayoutLimiter
    → NEVER creates another tr_
    → NEVER reserves wallet again
    → can create next po_ attempt


INTERNAL RESERVED-FUND RECOVERY
---------------------------------------------------------

POST /payouts/:id/cancel
    → authenticated designer required
    → approval/email deliberately not required
    → no payout limiter
    → only pending internal requests


SUCCESSFUL DEPOSIT RECONCILIATION
---------------------------------------------------------

POST /wallet/verify-deposit
    → authenticated designer required
    → approval/email deliberately not required
    → financial-action limiter deliberately not required


WEBHOOKS
---------------------------------------------------------

Stripe webhook endpoints are not defined in this router.

Financial route limiters must NEVER be applied to:

/api/v1/webhooks/stripe

/api/v1/webhooks/stripe/connect
=========================================================*/

/*=========================================================
Export Router
=========================================================*/

module.exports = router;
