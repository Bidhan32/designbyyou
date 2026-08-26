"use strict";

/*
=========================================================
DesignByYou / FashionVision
Financial Rate Limit Middleware
Version 1.2
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

- wallet deposits should not consume withdrawal quota
- subscription Checkout should not consume wallet quota
- billing management should not consume subscription
  purchase quota
- designer payouts should remain isolated
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

Why a separate limiter?

Creating Stripe Checkout Sessions:

- calls Stripe
- creates short-lived external billing resources
- may initiate a recurring financial commitment
- must not consume Creator Wallet deposit quota
- must not share designer financial quotas

This limiter does NOT replace:

- authentication
- creator authorization
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

A creator with an existing recurring charge must retain
access to billing management.
=========================================================*/

const creatorSubscriptionPortalLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 20,
});

/*=========================================================
5. Designer Wallet Deposit Limiter
=========================================================

30 requests per 15 minutes.

Protects:

POST
/api/v1/designer-finance/wallet/deposit

Designer wallet deposits have their own quota so:

- deposit retries do not consume payout quota
- payout requests do not block deposits
- Stripe PaymentIntent creation is protected from flooding
=========================================================*/

const designerWalletDepositLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 30,
});

/*=========================================================
6. Designer Payout Limiter
=========================================================

10 requests per 15 minutes.

Protects user-triggered payout operations including:

POST
/api/v1/designer-finance/payouts

POST
/api/v1/designer-finance/payouts/:id/retry
=========================================================*/

const designerPayoutLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});

/*=========================================================
7. Stripe Connect Financial Action Limiter
=========================================================

10 requests per 15 minutes.

Protects authenticated user-triggered Stripe Connect
actions such as onboarding/session generation.

Never use this limiter on:

/api/v1/webhooks/stripe

/api/v1/webhooks/stripe/connect
=========================================================*/

const stripeConnectFinancialLimiter = createFinancialLimiter({
  windowMs: 15 * 60 * 1000,

  limit: 10,
});


/*
=========================================================
P2P Booking Creation Limiter
=========================================================

10 requests per 15 minutes.

Protects creation/retrieval of Stripe PaymentIntents for
new Creator-to-Designer bookings.

This limiter is separate from:

- wallet deposits
- wallet refunds
- subscription Checkout
- Designer payouts

Do NOT use on Stripe webhook routes.
=========================================================
*/

const p2pBookingCreateLimiter =
  createFinancialLimiter({
    windowMs:
      15 * 60 * 1000,

    limit: 10,
  });
/*=========================================================
Exports
=========================================================*/

module.exports = {
  creatorWalletDepositLimiter,

  creatorWalletWithdrawalLimiter,

  creatorSubscriptionCheckoutLimiter,

    p2pBookingCreateLimiter,

  creatorSubscriptionPortalLimiter,

  designerWalletDepositLimiter,

  designerPayoutLimiter,

  stripeConnectFinancialLimiter,
};
