"use strict";

/*
=========================================================
DesignByYou
Creator Subscription Routes
Version 5.1
=========================================================

Responsibilities:

1. Read Creator subscription status
2. Start a new Stripe subscription Checkout
3. Open Stripe Billing Portal for existing billing
4. Apply dedicated subscription rate limiting
5. Keep subscription webhooks OUT of this router

=========================================================
SUBSCRIPTION ARCHITECTURE
=========================================================

Creator Wallet is the frontend management surface.

Public HTTP API:

GET
/api/v1/subscription/status

POST
/api/v1/subscription/create-checkout-session

POST
/api/v1/subscription/create-portal-session


Stripe webhook events are NOT handled here.

Subscription webhook processing must go through the
application's centralized, raw-body, signature-verified
Stripe webhook endpoint:

POST
/api/v1/webhooks/stripe

=========================================================
SECURITY MODEL
=========================================================

Every route in this file requires:

1. Authenticated user
2. Creator role

Creator accounts DO NOT require admin approval.

This intentionally differs from designer finance.

=========================================================
EMAIL VERIFICATION POLICY
=========================================================

NEW subscription Checkout:

    verified email required

Why?

Creating a subscription is a NEW recurring external
financial commitment.

---------------------------------------------------------

Billing Portal:

    verified email NOT required

Why?

An existing subscriber must remain able to:

- manage billing
- update payment methods
- review invoices
- cancel an existing subscription

even if the application's email-verification state later
changes.

Blocking management of an existing recurring charge could
strand the creator in an unwanted subscription.

---------------------------------------------------------

Subscription status:

    verified email NOT required

It is a read-only / reconciliation operation.

=========================================================
RATE LIMITING
=========================================================

Subscription Checkout:

creatorSubscriptionCheckoutLimiter

10 requests per 15 minutes.

---------------------------------------------------------

Billing Portal:

creatorSubscriptionPortalLimiter

20 requests per 15 minutes.

---------------------------------------------------------

Subscription status:

No financial-action limiter.

It is read-only and may legitimately be refreshed after:

- Stripe Checkout return
- Billing Portal return
- webhook propagation delay

=========================================================
IMPORTANT TRUST BOUNDARY
=========================================================

The frontend NEVER sends a Stripe Price ID.

Frontend sends:

{
  "plan": "monthly"
}

or:

{
  "plan": "quarterly"
}

or:

{
  "plan": "yearly"
}

The controller maps the trusted plan name to Stripe Price
IDs stored only in backend environment variables.

=========================================================
*/

const express = require("express");

const router = express.Router();

const subscriptionController = require("../controllers/creators/subscriptionController");

const {
  protect,
  authorize,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const {
  creatorSubscriptionCheckoutLimiter,
  creatorSubscriptionPortalLimiter,
} = require("../middlewares/financialRateLimitMiddleware");

/*=========================================================
Global Creator Protection
=========================================================

Middleware order:

protect
    ↓
authorize("creator")
    ↓
route-specific security
    ↓
controller

All HTTP endpoints below therefore require:

- valid authenticated session
- current user role = creator

Creator admin approval is intentionally NOT required.
=========================================================*/

router.use(protect);

router.use(authorize("creator"));

/*=========================================================
1. Creator Subscription Status

GET
/api/v1/subscription/status

Returns the application's durable subscription state.

Typical response:

{
  "status": "success",

  "data": {
    "plan": "monthly",

    "status": "active",

    "active_until": "...",

    "current_period_start": "...",

    "current_period_end": "...",

    "cancel_at_period_end": false,

    "is_active": true,

    "needs_billing_attention": false,

    "has_billing_profile": true,

    "has_subscription": true,

    "can_manage_billing": true,

    "provider_sync": "database"
  }
}

=========================================================
OPTIONAL STRIPE REFRESH
=========================================================

GET
/api/v1/subscription/status?refresh=1

When a persisted Stripe Subscription ID exists, the
controller retrieves that exact Stripe Subscription and
synchronizes the local database before responding.

Useful after returning from:

- Stripe Checkout
- Stripe Billing Portal

=========================================================
IMPORTANT
=========================================================

The frontend must NOT treat:

?subscription=success

as proof that payment succeeded.

The correct flow is:

Stripe Checkout completes
        ↓
browser returns
        ↓
Creator Wallet sees return query parameter
        ↓
GET /subscription/status?refresh=1
        ↓
Stripe source of truth synchronized
        ↓
Creator Wallet displays current state

=========================================================
SECURITY
=========================================================

Requires:

- authenticated creator

Does NOT require:

- admin approval
- verified email
- financial-action rate limiter

because this is a read/reconciliation operation.
=========================================================*/

router.get("/status", subscriptionController.getSubscriptionStatus);

/*=========================================================
2. Start New Creator Subscription

POST
/api/v1/subscription/create-checkout-session

Body:

{
  "plan": "monthly"
}

Supported plans:

- monthly
- quarterly
- yearly

Optional Stripe API idempotency identity:

{
  "plan": "monthly",

  "client_request_id":
    "550e8400-e29b-41d4-a716-446655440000"
}

=========================================================
TRUST BOUNDARY
=========================================================

The browser MUST NOT send:

{
  "priceId": "price_..."
}

Instead:

frontend plan name
        ↓
subscriptionController
        ↓
trusted backend environment variable
        ↓
Stripe Price ID
        ↓
Stripe Checkout

Backend environment variables:

CREATOR_SUBSCRIPTION_MONTHLY_PRICE_ID

CREATOR_SUBSCRIPTION_QUARTERLY_PRICE_ID

CREATOR_SUBSCRIPTION_YEARLY_PRICE_ID

=========================================================
DUPLICATE SUBSCRIPTION PROTECTION
=========================================================

Before creating Checkout, the controller checks the
creator's persistent Stripe Customer for an existing
non-terminal subscription.

If one already exists:

HTTP 409

code:
CREATOR_SUBSCRIPTION_ALREADY_EXISTS

The frontend should then offer:

Manage Subscription

instead of opening another subscription Checkout.

=========================================================
SECURITY
=========================================================

Requires:

- authenticated creator
- verified email
- subscription Checkout rate limiter

Does NOT require:

- admin approval

Middleware order:

protect
→ authorize("creator")
→ requireVerifiedEmail
→ creatorSubscriptionCheckoutLimiter
→ createCheckoutSession

=========================================================
RATE LIMITING
=========================================================

10 requests per 15 minutes per authenticated user.

This protects:

- Stripe Checkout Session creation
- Stripe API traffic
- repeated subscription initialization attempts

It does NOT replace:

- verified email
- server-side Price ID mapping
- Stripe Customer reuse
- duplicate-subscription detection
- Stripe API idempotency
- webhook event idempotency
=========================================================*/

router.post(
  "/create-checkout-session",
  requireVerifiedEmail,
  creatorSubscriptionCheckoutLimiter,
  subscriptionController.createCheckoutSession,
);

/*=========================================================
3. Open Stripe Billing Portal

POST
/api/v1/subscription/create-portal-session

Creates a short-lived Stripe Billing Portal Session for
the authenticated creator's persistent Stripe Customer.

Creator Wallet uses the returned Stripe-hosted URL for:

- subscription management
- cancellation
- payment-method updates
- invoice access
- billing information
- supported plan changes configured in Stripe Portal

=========================================================
IMPORTANT
=========================================================

The application does NOT trust Billing Portal return
navigation as proof that subscription state changed.

Stripe performs the billing operation.

Then:

Stripe webhook
        ↓
centralized webhookController
        ↓
subscriptionController internal processor
        ↓
PostgreSQL subscription state

Creator Wallet may additionally request:

GET
/api/v1/subscription/status?refresh=1

after returning from the Billing Portal.

=========================================================
WHY VERIFIED EMAIL IS NOT REQUIRED
=========================================================

This endpoint manages EXISTING billing.

A Creator must retain the ability to:

- cancel
- manage payment details
- inspect billing
- resolve payment issues

even if:

is_email_verified = false

later changes.

Therefore verified email is deliberately NOT enforced here.

=========================================================
SECURITY
=========================================================

Requires:

- authenticated creator
- Billing Portal rate limiter

Does NOT require:

- admin approval
- current verified email

Middleware order:

protect
→ authorize("creator")
→ creatorSubscriptionPortalLimiter
→ createPortalSession

=========================================================
RATE LIMITING
=========================================================

20 requests per 15 minutes per authenticated user.

This prevents repeatedly creating unnecessary Stripe
Billing Portal sessions while still leaving enough room for
normal billing-management activity.
=========================================================*/

router.post(
  "/create-portal-session",
  creatorSubscriptionPortalLimiter,
  subscriptionController.createPortalSession,
);

/*=========================================================
NO STRIPE WEBHOOK ROUTE HERE
=========================================================

The OLD subscription architecture contained:

POST
/api/v1/subscription/webhook

with:

express.raw({
  type: "application/json"
})

That route has intentionally been removed.

=========================================================
WHY
=========================================================

DesignByYou already has a centralized Stripe webhook system.

Subscription events now use:

POST
/api/v1/webhooks/stripe

That endpoint already owns:

- Stripe raw request body
- Stripe signature verification
- stripe_webhook_events idempotency
- workflow dispatch
- transactional PostgreSQL processing
- retry behavior

=========================================================
SUBSCRIPTION WEBHOOK EVENTS
=========================================================

checkout.session.completed
    ↓
processCheckoutSessionCompletedInternal

customer.subscription.created
    ↓
processSubscriptionCreatedInternal

customer.subscription.updated
    ↓
processSubscriptionUpdatedInternal

customer.subscription.deleted
    ↓
processSubscriptionDeletedInternal

invoice.paid
    ↓
current Subscription reconciliation

invoice.payment_succeeded
    ↓
current Subscription reconciliation

invoice.payment_failed
    ↓
current Subscription reconciliation

=========================================================
IMPORTANT RAW BODY RULE
=========================================================

Only the centralized Stripe webhook route should use the
untouched raw request body required by:

stripe.webhooks.constructEvent(...)

Do NOT attach:

express.raw(...)

to this router.

Do NOT attach a subscription-specific webhook endpoint here.

Likewise, normal subscription HTTP routes should use the
application's normal JSON body parser.

=========================================================
DO NOT APPLY FINANCIAL LIMITERS TO WEBHOOKS
=========================================================

The following:

creatorSubscriptionCheckoutLimiter

creatorSubscriptionPortalLimiter

must NEVER be attached to:

/api/v1/webhooks/stripe

/api/v1/webhooks/stripe/connect

Stripe webhooks rely instead on:

- provider signature verification
- durable event idempotency
- trusted workflow reconciliation
=========================================================
TRUSTED INTERNAL CONTROLLER FUNCTIONS
=========================================================

These exports from subscriptionController are NOT HTTP
controllers and must NEVER be exposed directly to the
frontend:

- processCheckoutSessionCompletedInternal

- reconcileCheckoutSessionSubscriptionInternal

- processSubscriptionCreatedInternal

- processSubscriptionUpdatedInternal

- processSubscriptionDeletedInternal

- processInvoicePaidInternal

- processInvoicePaymentFailedInternal

- reconcileSubscriptionByIdInternal

- applySubscriptionObjectInternal

They are only for trusted backend processing.

=========================================================
Final Route Contract
=========================================================

READ / PROVIDER RECONCILIATION
---------------------------------------------------------

GET
/api/v1/subscription/status

GET
/api/v1/subscription/status?refresh=1

Requires:

- authenticated creator


NEW RECURRING SUBSCRIPTION
---------------------------------------------------------

POST
/api/v1/subscription/create-checkout-session

Requires:

- authenticated creator
- verified email
- creatorSubscriptionCheckoutLimiter

Body:

{
  "plan":
    "monthly | quarterly | yearly",

  "client_request_id":
    "optional UUID"
}


EXISTING BILLING MANAGEMENT
---------------------------------------------------------

POST
/api/v1/subscription/create-portal-session

Requires:

- authenticated creator
- creatorSubscriptionPortalLimiter

Verified email deliberately NOT required.


WEBHOOKS
---------------------------------------------------------

No webhook route exists here.

Subscription Stripe events use:

POST
/api/v1/webhooks/stripe


CONNECT WEBHOOK
---------------------------------------------------------

Designer connected-account payout events remain on:

POST
/api/v1/webhooks/stripe/connect

=========================================================
Export Router
=========================================================*/

module.exports = router;
