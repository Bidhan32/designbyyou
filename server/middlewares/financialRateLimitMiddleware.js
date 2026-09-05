"use strict";

/*
=========================================================
DesignByYou / FashionVision
Financial Rate Limit Middleware
Version 1.3
=========================================================

Purpose:

Protect sensitive user-triggered financial and billing
endpoints from excessive requests.

Primary rate-limit identity:

- authenticated user ID

Fallback identity:

- normalized client IP

IMPORTANT:

Do NOT apply these limiters to Stripe webhook routes.

Stripe webhooks must remain governed by:

- Stripe signature verification
- webhook event idempotency
- trusted provider reconciliation

=========================================================

CURRENT FINANCIAL MODEL
---------------------------------------------------------

CREATORS

Creator wallet funding
→ Stripe only
→ creatorWalletDepositLimiter

Creator unused-balance withdrawal/refund
→ Stripe refund workflow
→ creatorWalletWithdrawalLimiter

Creator subscriptions
→ Stripe Checkout / Billing Portal
→ dedicated subscription limiters


DESIGNERS

Designer wallet funding
→ DOES NOT EXIST

Designer balance
→ completed booking earnings
→ internal wallet

Designer withdrawal
→ verified manual bank payout
→ designerPayoutLimiter

Stripe Connect is disabled for NEW designer payouts.

Historical Stripe Connect compatibility endpoints may
remain temporarily, but they do not initiate new designer
financial movement.

=========================================================
*/

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/*=========================================================
Financial Rate Limit Key
=========================================================

Authenticated financial routes are primarily limited per
user account.

This prevents multiple authenticated users behind the same
public IP from sharing one financial request quota.

Example:

creator A
→ user:<creator-A-id>

creator B
→ user:<creator-B-id>

If no authenticated user identity is available, fall back
to the normalized client IP.

ipKeyGenerator() safely normalizes IPv6 addresses.

=========================================================*/

function financialRateLimitKey(req) {
  const userId = req.user?.id || req.user?.user_id || req.user?.userId;

  if (userId) {
    return `user:${String(userId).trim().toLowerCase()}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

/*=========================================================
Shared Response Handler
=========================================================*/

function financialRateLimitHandler(req, res) {
  return res.status(429).json({
    status: "error",

    code: "FINANCIAL_RATE_LIMIT_EXCEEDED",

    message:
      "Too many financial requests were made in a short period. Please wait and try again.",
  });
}

/*=========================================================
Shared Limiter Factory
=========================================================

All financial limiters use the same identity and response
format while keeping separate quotas.

Separate limiter instances are important because:

- Creator wallet deposits should not consume Creator
  withdrawal/refund quota.

- subscription Checkout should not consume Creator wallet
  quota.

- billing management should not consume subscription
  purchase quota.

- Designer withdrawals should remain isolated from Creator
  financial actions.

There is intentionally NO Designer wallet-deposit limiter
because Designers cannot fund their own wallets.

=========================================================*/

function createFinancialLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,

    limit,

    keyGenerator: financialRateLimitKey,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    handler: financialRateLimitHandler,
  });
}

/*=========================================================
1. Creator Wallet Deposit Limiter
=========================================================

30 requests per 15 minutes.

Protects:

POST
/api/v1/creator-finance/wallet/deposit

Allows reasonable room for:

- legitimate payment retries
- PaymentIntent recovery
- idempotent request replay

Creator wallet funding remains Stripe-only.

=========================================================*/

const creatorWalletDepositLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 30,
});

/*=========================================================
2. Creator Wallet Withdrawal / Refund Limiter
=========================================================

20 requests per 15 minutes.

Protects:

POST
/api/v1/creator-finance/wallet/withdraw

Allows reasonable room for:

- new unused-balance return requests
- idempotent retries
- Stripe refund reconciliation

=========================================================*/

const creatorWalletWithdrawalLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 20,
});

/*=========================================================
3. Creator Subscription Checkout Limiter
=========================================================

10 requests per 15 minutes.

Protects:

POST
/api/v1/subscription/create-checkout-session

Creating Stripe Checkout Sessions:

- calls Stripe
- creates short-lived external billing resources
- may initiate a recurring financial commitment
- must not consume Creator Wallet deposit quota
- must not share Designer financial quotas

This limiter does NOT replace:

- authentication
- Creator authorization
- verified-email enforcement
- trusted server-side plan mapping
- Stripe Customer reuse
- duplicate-subscription detection

=========================================================*/

const creatorSubscriptionCheckoutLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});

/*=========================================================
4. Creator Billing Portal Limiter
=========================================================

20 requests per 15 minutes.

Protects:

POST
/api/v1/subscription/create-portal-session

The Billing Portal does not itself guarantee a financial
state change, but each request creates a Stripe-hosted
Portal Session.

Creators need enough room to:

- manage their subscription
- update payment methods
- inspect invoices
- cancel billing
- return and reopen the Portal if necessary

Email verification is deliberately NOT part of this
limiter's responsibility.

A Creator with an existing recurring charge must retain
access to billing management.

=========================================================*/

const creatorSubscriptionPortalLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 20,
});

/*=========================================================
5. P2P Booking Creation Limiter
=========================================================

10 requests per 15 minutes.

Protects creation/retrieval of Stripe PaymentIntents for
new Creator-to-Designer bookings.

This limiter is separate from:

- Creator wallet deposits
- Creator wallet refunds
- Creator subscription Checkout
- Designer payouts

Do NOT use on Stripe webhook routes.

=========================================================*/

const p2pBookingCreateLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});

/*=========================================================
6. Designer Payout Limiter
=========================================================

10 requests per 15 minutes.

Protects:

POST
/api/v1/designer-finance/payouts

Current Designer withdrawal flow:

Designer available balance
      ↓
verified manual bank account
      ↓
manual payout request
      ↓
available_balance decreases
      ↓
pending_payout_balance increases
      ↓
Super Admin verification
      ↓
external bank transfer
      ↓
completed

This limiter protects creation of NEW withdrawal requests.

There is intentionally NO Designer wallet-deposit limiter.

=========================================================*/

const designerPayoutLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});

/*=========================================================
7. Stripe Connect Financial Action Limiter
Legacy Compatibility Export
=========================================================

10 requests per 15 minutes.

Stripe Connect is disabled for NEW Designer payouts.

This limiter is retained temporarily only for compatibility
with any older code that may still import it.

It must NEVER be applied to:

/api/v1/webhooks/stripe

/api/v1/webhooks/stripe/connect

Current Designer payout routes should use the manual payout
workflow instead of Stripe Connect.

This limiter can be removed entirely later after a global
code search confirms there are no remaining imports.

=========================================================*/

const stripeConnectFinancialLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});

/*=========================================================
Exports
=========================================================*/

module.exports = {
  creatorWalletDepositLimiter,

  creatorWalletWithdrawalLimiter,

  creatorSubscriptionCheckoutLimiter,

  creatorSubscriptionPortalLimiter,

  p2pBookingCreateLimiter,

  designerPayoutLimiter,

  /*
   * Legacy compatibility export.
   *
   * Remove later after confirming there are no remaining
   * imports anywhere in the backend.
   */
  stripeConnectFinancialLimiter,
};
