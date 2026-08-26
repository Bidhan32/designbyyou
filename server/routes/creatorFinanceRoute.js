"use strict";

/*
=========================================================
DesignByYou / FashionVision
Creator Finance Routes
Version 4.4
=========================================================

Routes:

1. Creator financial summary
2. Creator transaction ledger
3. Creator Stripe wallet deposit
4. Withdraw unused creator wallet balance

=========================================================
CREATOR FINANCE SECURITY MODEL
=========================================================

All routes require:

- authentication
- creator role

Creator accounts DO NOT require admin approval.

This is intentionally different from designer finance.

=========================================================
NEW FINANCIAL ACTIONS
=========================================================

New creator wallet deposits require:

- verified email
- creator wallet deposit rate limiting

New creator unused-wallet withdrawals require:

- verified email
- creator wallet withdrawal rate limiting

IMPORTANT:

The creator wallet withdrawal endpoint also acts as a safe
reconciliation/replay endpoint for an EXISTING refund
request.

Because an existing request may already have:

- wallet funds reserved
- refund items created
- Stripe submissions in progress
- an uncertain Stripe result

requireVerifiedEmail is deliberately NOT attached directly
to the withdrawal route.

Instead the controller distinguishes:

NEW withdrawal
    → verified email required

EXISTING withdrawal/reconciliation
    → reconciliation remains available

This prevents already-reserved money from becoming stranded
if the creator's verification state changes after the
withdrawal was originally started.

=========================================================
CREATOR WALLET WITHDRAWAL ARCHITECTURE
=========================================================

This is NOT an earnings payout.

It returns UNUSED creator wallet value to the original
Stripe funding source.

Example:

Creator wallet deposit
        ↓
Stripe PaymentIntent pi_123
        ↓
Creator wallet credited
        ↓
Unused amount remains refundable
        ↓
Creator requests withdrawal
        ↓
creator_wallet_refund_request
        ↓
one or more refund items
        ↓
Stripe refund re_123
        ↓
original PaymentIntent funding source

A creator wallet refund must never be converted into a
designer-style Stripe Connect payout.

=========================================================
STRIPE REFUND SAFETY
=========================================================

The controller provides durable protection for:

- persistent refund request identity
- persistent refund item identity
- Stripe refund idempotency keys
- database row locking
- concurrent request serialization
- refund discovery before uncertain resubmission
- provider refund ID reconciliation
- duplicate webhook handling
- late refund failure restoration
- out-of-order webhook protection
- uncertain Stripe submission preservation

For uncertain Stripe v1 refund submissions, automatic blind
replay is intentionally bounded.

Once the safe automatic replay period has expired, the
controller requires reconciliation rather than blindly
issuing another Stripe refund POST with an old idempotency
identity.

=========================================================
RATE LIMITING
=========================================================

Financial rate limiting applies only to user-triggered HTTP
financial actions.

Currently:

Creator wallet deposit
→ creatorWalletDepositLimiter

Creator unused-wallet withdrawal/reconciliation
→ creatorWalletWithdrawalLimiter

IMPORTANT:

Rate limiting does NOT replace:

- authentication
- creator authorization
- email verification
- application idempotency
- PostgreSQL row locking
- Stripe idempotency
- Stripe object reconciliation
- webhook signature verification
- webhook event idempotency

Stripe webhook endpoints must NEVER use these finance HTTP
limiters.

=========================================================
*/

const express = require("express");

const creatorFinanceController = require("../controllers/creators/creatorFinanceController");

const {
  protect,
  authorize,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const {
  creatorWalletDepositLimiter,
  creatorWalletWithdrawalLimiter,
} = require("../middlewares/financialRateLimitMiddleware");

const router = express.Router();

/*=========================================================
Global Creator Access
=========================================================

Every route below requires:

1. Authenticated user
2. Creator role

Creator finance intentionally does NOT use:

requireApprovedAccount

because creator accounts do not require admin approval.
=========================================================*/

router.use(protect);

router.use(authorize("creator"));

/*=========================================================
New Financial Action Security
=========================================================

Used where route-level verified-email enforcement is safe.

Currently:

POST /wallet/deposit

The unused-wallet withdrawal route performs the NEW versus
EXISTING request distinction inside the controller and
therefore does not use this middleware directly.
=========================================================*/

const secureNewFinancialAction = [requireVerifiedEmail];

/*=========================================================
1. Creator Financial Summary
=========================================================

GET
/api/v1/creator-finance/summary

Returns the authenticated creator's finance overview.

Wallet balances:

- available_balance
- pending_escrow_balance
- pending_payout_balance
- pending_refund_balance
- total_wallet_balance

Lifetime wallet statistics:

- lifetime_deposited
- lifetime_spent
- lifetime_withdrawn
- lifetime_refunded

Booking / P2P statistics:

- locked_escrow_balance
- active_escrow_count
- total_p2p_charged
- total_p2p_refunded
- net_p2p_spend
- total_lifespan_spend

=========================================================
MARKETPLACE / STORE FINANCE POLICY
=========================================================

Direct marketplace/storefront sale accounting is not part
of the active creator finance flow.

The current controller therefore does NOT include direct
marketplace purchases when calculating creator spend.

For frontend backward compatibility, legacy response fields
may still be present:

- total_store_spend
- completed_store_orders

but the updated controller returns them as zero rather than
projecting direct marketplace/store financial activity.

=========================================================
SECURITY
=========================================================

Requires:

- authenticated user
- creator role

Does NOT require:

- admin approval
- verified email
- financial action limiter

because this is a read-only endpoint.
=========================================================*/

router.get("/summary", creatorFinanceController.getCreatorWalletSummary);

/*=========================================================
2. Creator Transaction Ledger
=========================================================

GET
/api/v1/creator-finance/ledger

Returns financial transaction history involving the
authenticated creator.

Optional query parameters:

?page=1
&limit=25
&type=escrow_lock
&provider=stripe
&search=designer

=========================================================
SUPPORTED TRANSACTION TYPES
=========================================================

Current creator finance ledger types:

- escrow_lock
- escrow_release
- refund
- booking_deposit
- wallet_deposit

Direct marketplace_purchase entries are intentionally not
part of the updated creator finance ledger.

=========================================================
SUPPORTED PAYMENT PROVIDERS
=========================================================

- stripe
- paypal

=========================================================
EXAMPLES
=========================================================

GET
/api/v1/creator-finance/ledger?page=1&limit=25

GET
/api/v1/creator-finance/ledger
  ?page=1
  &limit=25
  &type=wallet_deposit
  &provider=stripe

=========================================================
REFUND DIRECTION
=========================================================

The controller distinguishes two different uses of a
transaction_type = refund projection.

Booking / P2P refund received by creator:

    direction = credit

Unused creator wallet balance returned to the original
Stripe funding source:

    direction = debit

The controller identifies unused-wallet refund projections
through their creator_wallet_refund_request relationship.

=========================================================
CONTROLLER RESPONSIBILITIES
=========================================================

The controller handles:

- creator ownership filtering
- transaction filtering
- provider filtering
- search
- pagination
- counterparty information
- transaction direction
- normalized transaction labels
- booking-related transaction context
- creator wallet refund context

=========================================================
SECURITY
=========================================================

Requires:

- authenticated user
- creator role

Does NOT require:

- admin approval
- verified email
- financial action limiter

because this is a read-only endpoint.
=========================================================*/

router.get("/ledger", creatorFinanceController.getOutboundLedger);

/*=========================================================
3. Create Creator Wallet Deposit
=========================================================

POST
/api/v1/creator-finance/wallet/deposit

Creates or safely reuses a creator Stripe wallet-deposit
PaymentIntent.

Example request body:

{
  "amount": 50,
  "paymentProvider": "stripe",
  "client_request_id": "YOUR-UNIQUE-ID"
}

Alternatively:

Idempotency-Key: YOUR-UNIQUE-ID

=========================================================
FLOW
=========================================================

1. Creator is authenticated.

2. Creator role is required.

3. Verified email is required.

4. Deposit rate limiter is applied.

5. Backend creates or loads the persistent:

   creator_wallet_deposits

   row.

6. Backend validates idempotent replays against:

   - creator
   - amount
   - provider
   - currency

7. Backend creates or retrieves the Stripe PaymentIntent.

8. PaymentIntent metadata contains the persistent internal
   deposit identity.

9. The frontend receives:

   - clientSecret
   - paymentIntentId
   - deposit information
   - payment state

10. This HTTP endpoint does NOT credit the wallet directly.

11. Wallet credit occurs only after a trusted Stripe:

    payment_intent.succeeded

    event is validated and processed.

=========================================================
PAYMENTINTENT REPLAY SAFETY
=========================================================

If a persistent local deposit already contains:

provider_payment_id = pi_...

the controller retrieves that exact PaymentIntent rather
than creating another one.

If a local deposit exists but the PaymentIntent identity was
never persisted, the controller only permits automatic
Stripe creation/replay inside the conservative safe replay
period.

An old ambiguous creation state is not blindly recreated
forever.

=========================================================
WALLET CREDIT
=========================================================

After payment_intent.succeeded:

available_balance
    += deposit amount

lifetime_deposited
    += deposit amount

creator_wallet_deposits:
    status = succeeded
    credited_at = timestamp
    remaining_refundable_amount = deposit amount

A wallet_deposit transaction projection is inserted
idempotently.

=========================================================
SECURITY
=========================================================

Requires:

- authenticated creator
- verified email
- creator wallet deposit limiter

Does NOT require:

- admin approval

Middleware order:

protect
→ authorize("creator")
→ requireVerifiedEmail
→ creatorWalletDepositLimiter
→ createWalletDeposit
=========================================================*/

router.post(
  "/wallet/deposit",
  ...secureNewFinancialAction,
  creatorWalletDepositLimiter,
  creatorFinanceController.createWalletDeposit,
);

/*=========================================================
4. Withdraw Unused Creator Wallet Balance
=========================================================

POST
/api/v1/creator-finance/wallet/withdraw

Returns unused creator wallet value to its original Stripe
funding source.

IMPORTANT:

This is NOT:

- creator earnings payout
- designer payout
- Stripe Connect payout
- arbitrary cash withdrawal

The refundable amount must correspond to still-refundable
creator wallet deposits originally funded through Stripe.

=========================================================
EXAMPLE REQUEST
=========================================================

{
  "amount": 25,
  "client_request_id": "YOUR-UNIQUE-ID"
}

Alternatively:

Idempotency-Key: YOUR-UNIQUE-ID

=========================================================
NEW WITHDRAWAL FLOW
=========================================================

For a NEW client_request_id:

1. Authenticate creator.

2. Require creator role.

3. Controller requires verified email.

4. Controller locks the creator wallet.

5. Verify:

   available_balance >= requested amount

6. Load refundable Stripe-funded wallet deposits.

7. Verify:

   refundable deposit balance >= requested amount

8. Create:

   creator_wallet_refund_requests

9. Allocate the requested amount across one or more:

   creator_wallet_refund_items

10. Each refund item receives its own persistent internal
    Stripe idempotency key.

11. Reduce:

    creator_wallet_deposits.remaining_refundable_amount

    for each reserved allocation.

12. Move creator wallet funds:

    available_balance
        ↓
    pending_refund_balance

13. COMMIT the local reservation transaction.

14. Only after the database transaction is committed does
    the backend communicate with Stripe.

15. Each refund item creates or reconciles a Stripe:

    re_...

=========================================================
IMPORTANT DATABASE / STRIPE BOUNDARY
=========================================================

The controller intentionally does NOT keep PostgreSQL money
locks open while waiting for Stripe network requests.

The durable local refund request/items are committed before
external Stripe submission.

=========================================================
EXISTING WITHDRAWAL REPLAY / RECONCILIATION
=========================================================

For the SAME client_request_id:

The controller first loads the existing refund request.

It does NOT:

- create another refund request
- reserve wallet money again
- allocate refundable deposits again
- require current email verification again

Instead it reconciles the existing refund items.

=========================================================
REFUND ITEM STATES
=========================================================

Possible internal refund item statuses include:

- pending
- submitting
- processing
- status_unknown
- succeeded
- failed
- cancelled

=========================================================
SAFE REFUND SUBMISSION
=========================================================

Before a Stripe refund is submitted:

1. The item is persistent.

2. The Stripe idempotency key is persistent.

3. Submission attempt state is recorded.

If a previous refund submission may have succeeded but its
re_ ID was not persisted, the controller attempts Stripe
refund discovery before another refunds.create call.

=========================================================
UNKNOWN STRIPE RESULT
=========================================================

An uncertain Stripe result must NOT immediately restore the
creator's money.

Instead the refund item remains reserved and moves into a
reconciliation-safe state.

This prevents:

Stripe actually accepted refund
        +
application restored internal wallet
        =
double value for creator

=========================================================
OLD UNCERTAIN REFUND SUBMISSIONS
=========================================================

Automatic replay is intentionally bounded.

If:

- a refund submission previously occurred
- no provider_refund_id was persisted
- Stripe discovery does not find a matching refund
- the safe Stripe v1 automatic replay period has expired

the controller does NOT blindly submit another refund.

The item remains in a reconciliation-required/uncertain
state instead.

=========================================================
SUCCESSFUL STRIPE REFUND
=========================================================

On refund success:

pending_refund_balance
    -= amount

lifetime_withdrawn
    += amount

available_balance was already reduced during reservation,
so it is NOT reduced again.

The refund item becomes:

succeeded

A successful refund transaction projection is recorded
idempotently using the Stripe re_ ID.

=========================================================
FAILED / CANCELED REFUND BEFORE SUCCESS FINALIZATION
=========================================================

If Stripe definitively fails or cancels the refund while the
amount is still reserved:

available_balance
    += amount

pending_refund_balance
    -= amount

The original deposit's:

remaining_refundable_amount

is restored.

lifetime_withdrawn is NOT changed because success was never
finalized.

=========================================================
LATE STRIPE FAILURE AFTER EARLIER SUCCESS
=========================================================

Stripe refund state can change after an earlier success
projection.

If the application previously finalized a successful refund
and Stripe later reports a definitive failure:

available_balance
    += amount

lifetime_withdrawn
    -= amount

The deposit's refundable balance is restored.

The previously inserted successful refund transaction
projection is removed.

The creator_wallet_refund_items row remains the durable
provider-operation audit record.

=========================================================
OUT-OF-ORDER STRIPE EVENTS
=========================================================

The updated controller prevents stale non-terminal events
from downgrading a terminal refund state.

Examples:

succeeded
    ← stale pending event
    → remains succeeded

failed
    ← stale processing event
    → remains failed

Wallet accounting is therefore not repeated or reversed
because of stale event delivery.

=========================================================
EMAIL VERIFICATION POLICY
=========================================================

This route deliberately DOES NOT attach
requireVerifiedEmail.

Why?

The endpoint performs both:

A. NEW withdrawal initialization

and

B. EXISTING withdrawal reconciliation

Blocking the entire endpoint at middleware level could
strand money already reserved in:

pending_refund_balance

Therefore the controller performs:

existing request?
    YES
        → reconciliation permitted

    NO
        → require verified email
        → initialize NEW withdrawal

=========================================================
RATE LIMITING
=========================================================

creatorWalletWithdrawalLimiter applies to both:

- NEW withdrawal requests
- user-triggered reconciliation requests

This prevents repeated HTTP requests from excessively
calling database/Stripe reconciliation logic.

The limiter does not replace financial idempotency.

=========================================================
SECURITY
=========================================================

Always requires:

- authentication
- creator role

New withdrawal additionally requires:

- verified email, enforced inside controller

Does NOT require:

- admin approval

Middleware order:

protect
→ authorize("creator")
→ creatorWalletWithdrawalLimiter
→ withdrawUnusedBalance
=========================================================*/

router.post(
  "/wallet/withdraw",
  creatorWalletWithdrawalLimiter,
  creatorFinanceController.withdrawUnusedBalance,
);

/*=========================================================
Internal Finance Functions
=========================================================

The following exports from creatorFinanceController are
trusted internal functions and are intentionally NOT
exposed as normal creator-finance HTTP routes:

- processWalletDepositSucceededInternal
- processWalletRefundUpdatedInternal
- processWalletRefundFailedInternal

They are called by trusted Stripe webhook processing.

=========================================================
CREATOR WALLET DEPOSIT WEBHOOK
=========================================================

payment_intent.succeeded
        ↓
processWalletDepositSucceededInternal

The webhook processor validates:

- Stripe object
- transaction purpose
- creator identity
- deposit identity
- client request identity
- amount
- currency
- PaymentIntent identity
- credited state

Duplicate webhook delivery must not credit the wallet twice.

=========================================================
CREATOR WALLET REFUND WEBHOOK
=========================================================

refund.created
refund.updated
refund.failed
        ↓
processWalletRefundUpdatedInternal
or
processWalletRefundFailedInternal

Both delegate to the same trusted refund-state processor.

That processor owns:

- Stripe refund identity validation
- refund item locking
- refund request locking
- deposit locking
- provider state reconciliation
- success accounting
- failure restoration
- late failure reversal
- stale/out-of-order event protection
- idempotent duplicate handling

=========================================================
IMPORTANT
=========================================================

These trusted functions:

- must not be callable from the frontend
- must not receive normal route rate limiters
- must execute through the Stripe webhook's trusted
  signature-verified processing path

Stripe webhook endpoints are defined elsewhere.

=========================================================*/

/*=========================================================
Final Route Contract
=========================================================

READ OPERATIONS
---------------------------------------------------------

GET /summary

GET /ledger


NEW CREATOR WALLET FUNDING
---------------------------------------------------------

POST /wallet/deposit

Security:

- authenticated creator
- verified email
- creatorWalletDepositLimiter
- no admin approval


CREATOR UNUSED-BALANCE RETURN / RECONCILIATION
---------------------------------------------------------

POST /wallet/withdraw

Security:

- authenticated creator
- creatorWalletWithdrawalLimiter
- no admin approval

Controller rules:

NEW request
    → verified email required

EXISTING request
    → safe reconciliation allowed


WEBHOOKS
---------------------------------------------------------

Stripe webhook endpoints are NOT defined in this router.

Do not attach creator finance rate limiters to:

/api/v1/webhooks/stripe

or any Stripe webhook destination.

=========================================================
Export Router
=========================================================*/

module.exports = router;
