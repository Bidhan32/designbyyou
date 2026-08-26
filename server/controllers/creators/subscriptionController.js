"use strict";

/*
=========================================================
DesignByYou
Creator Subscription Controller
Version 5.0
=========================================================

Responsibilities:

1. Read creator subscription status
2. Create/reuse Stripe Customer
3. Create trusted Stripe subscription Checkout Session
4. Create Stripe Billing Portal Session
5. Link completed Checkout Sessions
6. Synchronize Stripe Subscription objects
7. Reconcile subscription state from invoice events
8. Provide trusted internal webhook processors

=========================================================
IMPORTANT ARCHITECTURE
=========================================================

Subscriptions are PLATFORM Stripe subscriptions.

They are NOT:

- Stripe Connect subscriptions
- designer payouts
- creator wallet deposits
- creator wallet refunds

Creator Wallet is the frontend management surface, but:

Stripe remains the source of truth for billing state.

The frontend NEVER decides:

- Stripe Price IDs
- subscription activation
- subscription expiration
- renewal dates
- cancellation completion

The frontend only requests one trusted plan name:

monthly
quarterly
yearly

The backend maps that plan to a trusted environment
variable containing the Stripe Price ID.

=========================================================
WEBHOOK ARCHITECTURE
=========================================================

This controller intentionally DOES NOT expose a standalone
raw Stripe webhook HTTP handler.

Trusted internal processors exported at the bottom are
intended to be called from the application's centralized,
signature-verified Stripe webhook controller.

Do NOT expose those internal processors as ordinary HTTP
routes.
=========================================================
*/

const Stripe = require("stripe");
const db = require("../../config/db");

/*=========================================================
Configuration
=========================================================*/

const CREATOR_SUBSCRIPTION_PLANS = new Set(["monthly", "quarterly", "yearly"]);

const STRIPE_SUBSCRIPTION_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

/*
These statuses represent an existing Stripe subscription
that should normally be managed instead of creating a
second subscription.

Only:

canceled
incomplete_expired

are treated as terminal enough to allow a new Checkout
subscription.
*/
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);

/*
Legacy subscription_tier may still be used elsewhere in the
application for feature access.

Therefore we grant a paid tier only while the subscription
is in a state where access should reasonably remain active.

past_due is intentionally retained during Stripe's payment
retry/grace period.

Terminal/non-entitled states become:

subscription_tier = free
*/
const PAID_ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

let stripeClient = null;

/*=========================================================
General Helpers
=========================================================*/

function getStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();

  if (!secretKey) {
    const error = new Error("STRIPE_SECRET_KEY is not configured.");

    error.code = "STRIPE_NOT_CONFIGURED";

    error.statusCode = 503;

    throw error;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

function cleanText(value, maxLength = 255) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getAuthenticatedUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.userId || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function getStripeObjectId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }

  return null;
}

function createAppError(message, code, statusCode = 500) {
  const error = new Error(message);

  error.code = code;

  error.statusCode = statusCode;

  return error;
}

function sendError(res, statusCode, message, extra = {}) {
  return res.status(statusCode).json({
    status: statusCode >= 500 ? "error" : "fail",

    message,

    ...extra,
  });
}

function handleControllerError(res, error, fallbackMessage) {
  const statusCode = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;

  const code = cleanText(error?.code, 100) || undefined;

  return sendError(
    res,
    statusCode,
    statusCode >= 500 ? fallbackMessage : error.message || fallbackMessage,
    code
      ? {
          code,
        }
      : {},
  );
}

/*=========================================================
Plan Helpers
=========================================================*/

function normalizePlan(value) {
  const plan = cleanText(value, 30).toLowerCase();

  return CREATOR_SUBSCRIPTION_PLANS.has(plan) ? plan : null;
}

function getPlanPriceId(plan) {
  const envMap = {
    monthly: "CREATOR_SUBSCRIPTION_MONTHLY_PRICE_ID",

    quarterly: "CREATOR_SUBSCRIPTION_QUARTERLY_PRICE_ID",

    yearly: "CREATOR_SUBSCRIPTION_YEARLY_PRICE_ID",
  };

  const envName = envMap[plan];

  if (!envName) {
    return null;
  }

  const priceId = cleanText(process.env[envName], 255);

  if (!priceId || !priceId.startsWith("price_")) {
    return null;
  }

  return priceId;
}

function getPlanFromPriceId(priceId) {
  const normalizedPriceId = cleanText(priceId, 255);

  if (!normalizedPriceId) {
    return null;
  }

  for (const plan of CREATOR_SUBSCRIPTION_PLANS) {
    if (getPlanPriceId(plan) === normalizedPriceId) {
      return plan;
    }
  }

  return null;
}

/*=========================================================
Frontend URL
=========================================================*/

function getFrontendBaseUrl() {
  const configured = cleanText(
    process.env.FRONTEND_URL || process.env.CLIENT_URL,
    1000,
  );

  const candidate =
    configured ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

  if (!candidate) {
    throw createAppError(
      "Frontend URL is not configured.",
      "FRONTEND_URL_NOT_CONFIGURED",
      503,
    );
  }

  let parsed;

  try {
    parsed = new URL(candidate);
  } catch {
    throw createAppError(
      "Frontend URL configuration is invalid.",
      "INVALID_FRONTEND_URL",
      503,
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createAppError(
      "Frontend URL protocol is invalid.",
      "INVALID_FRONTEND_URL",
      503,
    );
  }

  return candidate.replace(/\/+$/, "");
}

/*=========================================================
Creator Database Helpers
=========================================================*/

async function loadCreator(queryable, creatorId) {
  const result = await queryable.query(
    `
        SELECT
          id,
          role,
          email,
          full_name,

          subscription_tier,
          subscription_status,
          subscription_active_until,
          subscription_cancel_at_period_end,
          subscription_current_period_start,

          stripe_customer_id,
          stripe_subscription_id,
          stripe_subscription_price_id

        FROM users

        WHERE id = $1
          AND role = 'creator'

        LIMIT 1
      `,
    [creatorId],
  );

  return result.rows[0] || null;
}

function serializeSubscriptionRow(
  row = {},
  { providerSync = "database" } = {},
) {
  const tier = normalizePlan(row.subscription_tier) || "free";

  const status = cleanText(row.subscription_status || "free", 50).toLowerCase();

  return {
    plan: tier,

    status,

    active_until: row.subscription_active_until || null,

    current_period_start: row.subscription_current_period_start || null,

    current_period_end: row.subscription_active_until || null,

    cancel_at_period_end: Boolean(row.subscription_cancel_at_period_end),

    is_active: tier !== "free" && PAID_ACCESS_STATUSES.has(status),

    needs_billing_attention: ["incomplete", "past_due", "unpaid"].includes(
      status,
    ),

    has_billing_profile: Boolean(row.stripe_customer_id),

    has_subscription: Boolean(row.stripe_subscription_id),

    can_manage_billing: Boolean(row.stripe_customer_id),

    provider_sync: providerSync,
  };
}

/*=========================================================
Stripe Subscription Shape Helpers
=========================================================*/

/*
Stripe's current API exposes billing-period timestamps on
subscription items.

Fallbacks to top-level fields remain for compatibility with
older Stripe API object shapes.
*/
function getSubscriptionPeriod(subscription) {
  const firstItem = subscription?.items?.data?.[0] || null;

  const startSeconds = Number(
    firstItem?.current_period_start ?? subscription?.current_period_start,
  );

  const endSeconds = Number(
    firstItem?.current_period_end ?? subscription?.current_period_end,
  );

  const start =
    Number.isFinite(startSeconds) && startSeconds > 0
      ? new Date(startSeconds * 1000)
      : null;

  const end =
    Number.isFinite(endSeconds) && endSeconds > 0
      ? new Date(endSeconds * 1000)
      : null;

  return {
    start,
    end,
  };
}

function getSubscriptionPriceId(subscription) {
  return (
    getStripeObjectId(subscription?.items?.data?.[0]?.price) ||
    getStripeObjectId(subscription?.items?.data?.[0]?.plan) ||
    null
  );
}

function normalizeStripeSubscriptionStatus(value) {
  const status = cleanText(value, 50).toLowerCase();

  return STRIPE_SUBSCRIPTION_STATUSES.has(status) ? status : null;
}

function getInvoiceSubscriptionId(invoice) {
  return (
    getStripeObjectId(invoice?.subscription) ||
    getStripeObjectId(invoice?.parent?.subscription_details?.subscription) ||
    null
  );
}

/*=========================================================
Stripe Customer Management
=========================================================*/

async function ensureStripeCustomer(creator) {
  const stripe = getStripeClient();

  const existingCustomerId = cleanText(creator?.stripe_customer_id, 255);

  /*
  Existing Stripe identity must be preserved.

  We deliberately do NOT silently replace a missing existing
  cus_ ID because that can hide:

  - wrong Stripe account
  - test/live mode mismatch
  - accidental customer deletion
  - corrupted local identity

  Those require reconciliation.
  */
  if (existingCustomerId) {
    if (!existingCustomerId.startsWith("cus_")) {
      throw createAppError(
        "The stored Stripe customer identity is invalid.",
        "STRIPE_CUSTOMER_RECONCILIATION_REQUIRED",
        409,
      );
    }

    let customer;

    try {
      customer = await stripe.customers.retrieve(existingCustomerId);
    } catch (error) {
      console.error("Stripe customer retrieval failed:", error);

      throw createAppError(
        "The Stripe billing profile could not be reconciled.",
        "STRIPE_CUSTOMER_RECONCILIATION_REQUIRED",
        409,
      );
    }

    if (customer?.deleted === true) {
      throw createAppError(
        "The Stripe billing profile has been deleted and requires reconciliation.",
        "STRIPE_CUSTOMER_RECONCILIATION_REQUIRED",
        409,
      );
    }

    /*
    Keep Stripe's billing identity aligned with the current
    account email/name.

    Metadata remains an additional reconciliation signal.
    */
    const update = {};

    if (creator.email && customer.email !== creator.email) {
      update.email = creator.email;
    }

    if (creator.full_name && customer.name !== creator.full_name) {
      update.name = creator.full_name;
    }

    if (
      customer.metadata?.user_id !== String(creator.id) ||
      customer.metadata?.customer_purpose !== "creator_subscription"
    ) {
      update.metadata = {
        ...(customer.metadata || {}),

        user_id: String(creator.id),

        account_role: "creator",

        customer_purpose: "creator_subscription",
      };
    }

    if (Object.keys(update).length > 0) {
      await stripe.customers.update(existingCustomerId, update);
    }

    return existingCustomerId;
  }

  /*
  Stable Stripe idempotency identity protects repeated
  customer creation attempts for the same creator.
  */
  const customer = await stripe.customers.create(
    {
      email: creator.email || undefined,

      name: creator.full_name || undefined,

      metadata: {
        user_id: String(creator.id),

        account_role: "creator",

        customer_purpose: "creator_subscription",
      },
    },
    {
      idempotencyKey: `creator-subscription-customer:${creator.id}`,
    },
  );

  if (!customer?.id || !customer.id.startsWith("cus_")) {
    throw new Error("Stripe returned an invalid customer identity.");
  }

  const updateResult = await db.query(
    `
        UPDATE users

        SET
          stripe_customer_id = $1,
          updated_at = NOW()

        WHERE id = $2
          AND role = 'creator'

          AND (
            stripe_customer_id IS NULL
            OR stripe_customer_id = $1
          )

        RETURNING
          stripe_customer_id
      `,
    [customer.id, creator.id],
  );

  if (updateResult.rows.length === 0) {
    /*
    Another request may have linked an identity concurrently.

    Reload instead of blindly overwriting.
    */
    const currentCreator = await loadCreator(db, creator.id);

    if (currentCreator?.stripe_customer_id) {
      return currentCreator.stripe_customer_id;
    }

    throw new Error("Stripe customer identity could not be persisted safely.");
  }

  return customer.id;
}

/*=========================================================
Resolve Subscription Owner
=========================================================*/

async function resolveCreatorForSubscription(queryable, subscription) {
  const subscriptionId = cleanText(subscription?.id, 255);

  const customerId = getStripeObjectId(subscription?.customer);

  const metadataUserId = cleanText(subscription?.metadata?.user_id, 100);

  let creator = null;

  if (isUuid(metadataUserId)) {
    creator = await loadCreator(queryable, metadataUserId);
  }

  /*
  Metadata should exist on subscriptions created by our
  Checkout flow.

  Customer/subscription lookup is a defensive fallback for
  Stripe events or older existing records.
  */
  if (!creator && customerId) {
    const result = await queryable.query(
      `
          SELECT
            id,
            role,
            email,
            full_name,

            subscription_tier,
            subscription_status,
            subscription_active_until,
            subscription_cancel_at_period_end,
            subscription_current_period_start,

            stripe_customer_id,
            stripe_subscription_id,
            stripe_subscription_price_id

          FROM users

          WHERE role = 'creator'
            AND stripe_customer_id = $1

          LIMIT 1
        `,
      [customerId],
    );

    creator = result.rows[0] || null;
  }

  if (!creator && subscriptionId) {
    const result = await queryable.query(
      `
          SELECT
            id,
            role,
            email,
            full_name,

            subscription_tier,
            subscription_status,
            subscription_active_until,
            subscription_cancel_at_period_end,
            subscription_current_period_start,

            stripe_customer_id,
            stripe_subscription_id,
            stripe_subscription_price_id

          FROM users

          WHERE role = 'creator'
            AND stripe_subscription_id = $1

          LIMIT 1
        `,
      [subscriptionId],
    );

    creator = result.rows[0] || null;
  }

  return creator;
}

/*=========================================================
Apply Stripe Subscription State

TRUSTED INTERNAL FUNCTION

This is the central subscription-state synchronizer.

It receives an already trusted Stripe Subscription object
and writes the provider state into PostgreSQL.

No frontend request can directly choose the values written
here.
=========================================================*/

async function applySubscriptionObjectInternal(subscription, queryable = db) {
  if (!subscription || subscription.object !== "subscription") {
    return {
      success: false,

      reason: "A valid Stripe Subscription object is required.",
    };
  }

  const subscriptionId = cleanText(subscription.id, 255);

  const customerId = getStripeObjectId(subscription.customer);

  const providerStatus = normalizeStripeSubscriptionStatus(subscription.status);

  if (
    !subscriptionId.startsWith("sub_") ||
    !customerId?.startsWith("cus_") ||
    !providerStatus
  ) {
    return {
      success: false,

      reason: "Stripe subscription identity or status is invalid.",
    };
  }

  const creator = await resolveCreatorForSubscription(queryable, subscription);

  if (!creator) {
    return {
      success: false,

      reason:
        "The Stripe subscription could not be linked to a creator account.",
    };
  }

  /*
  Never silently transfer a Stripe Customer identity between
  users.
  */
  if (creator.stripe_customer_id && creator.stripe_customer_id !== customerId) {
    return {
      success: false,

      reason:
        "Stripe subscription customer identity does not match the creator account.",
    };
  }

  /*
  Protect against accidentally overwriting one live
  subscription with another live subscription.

  A terminal old subscription may be replaced by a newly
  purchased subscription.
  */
  if (
    creator.stripe_subscription_id &&
    creator.stripe_subscription_id !== subscriptionId &&
    BLOCKING_SUBSCRIPTION_STATUSES.has(
      String(creator.subscription_status || "").toLowerCase(),
    )
  ) {
    return {
      success: false,

      reason:
        "A different non-terminal Stripe subscription is already linked to this creator.",
    };
  }

  const priceId = getSubscriptionPriceId(subscription);

  const mappedPlan = getPlanFromPriceId(priceId);

  const { start, end } = getSubscriptionPeriod(subscription);

  /*
  Unknown Stripe prices must never grant premium access.

  This protects against:

  - accidental Dashboard-created prices
  - wrong environment configuration
  - arbitrary subscription products
  */
  const localTier =
    mappedPlan && PAID_ACCESS_STATUSES.has(providerStatus)
      ? mappedPlan
      : "free";

  if (!mappedPlan && PAID_ACCESS_STATUSES.has(providerStatus)) {
    console.error(
      `Active Stripe subscription ${subscriptionId} uses an unrecognized creator subscription price: ${priceId || "none"}`,
    );
  }

  const result = await queryable.query(
    `
        UPDATE users

        SET
          stripe_customer_id =
            $1,

          stripe_subscription_id =
            $2,

          stripe_subscription_price_id =
            $3,

          subscription_tier =
            $4,

          subscription_status =
            $5,

          subscription_cancel_at_period_end =
            $6,

          subscription_current_period_start =
            $7,

          subscription_active_until =
            $8,

          updated_at =
            NOW()

        WHERE id =
          $9

          AND role =
            'creator'

        RETURNING
          id,
          subscription_tier,
          subscription_status,
          subscription_active_until,
          subscription_cancel_at_period_end,
          subscription_current_period_start,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_subscription_price_id
      `,
    [
      customerId,

      subscriptionId,

      priceId,

      localTier,

      providerStatus,

      Boolean(subscription.cancel_at_period_end),

      start,

      end,

      creator.id,
    ],
  );

  if (result.rows.length === 0) {
    return {
      success: false,

      reason: "Creator subscription state could not be persisted.",
    };
  }

  return {
    success: true,

    creatorId: creator.id,

    subscriptionId,

    customerId,

    priceId,

    plan: localTier,

    configuredPlan: mappedPlan,

    priceRecognized: Boolean(mappedPlan),

    providerStatus,

    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),

    currentPeriodStart: start,

    currentPeriodEnd: end,

    data: serializeSubscriptionRow(result.rows[0], {
      providerSync: "synchronized",
    }),
  };
}

/*=========================================================
Link Checkout Session

TRUSTED INTERNAL FUNCTION

checkout.session.completed proves that Checkout completed,
but this function deliberately does NOT grant subscription
access merely because the browser/payment flow completed.

It links:

creator
↔ Stripe Customer
↔ Stripe Subscription

Actual tier/status activation is synchronized from the
trusted Stripe Subscription object.
=========================================================*/

async function processCheckoutSessionCompletedInternal(
  session,
  queryable = db,
) {
  if (!session || session.object !== "checkout.session") {
    return {
      success: false,

      reason: "A valid Stripe Checkout Session is required.",
    };
  }

  if (session.mode !== "subscription") {
    return {
      success: true,

      ignored: true,

      reason: "Checkout Session is not a subscription session.",
    };
  }

  const referenceUserId = cleanText(session.client_reference_id, 100);

  const metadataUserId = cleanText(session.metadata?.user_id, 100);

  if (referenceUserId && metadataUserId && referenceUserId !== metadataUserId) {
    return {
      success: false,

      reason: "Checkout Session creator identities do not match.",
    };
  }

  const creatorId = metadataUserId || referenceUserId;

  if (!isUuid(creatorId)) {
    return {
      success: false,

      reason: "Checkout Session creator identity is invalid.",
    };
  }

  const customerId = getStripeObjectId(session.customer);

  const subscriptionId = getStripeObjectId(session.subscription);

  if (!customerId?.startsWith("cus_") || !subscriptionId?.startsWith("sub_")) {
    return {
      success: false,

      reason: "Checkout Session subscription identity is incomplete.",
    };
  }

  const creator = await loadCreator(queryable, creatorId);

  if (!creator) {
    return {
      success: false,

      reason: "Creator account was not found for the Checkout Session.",
    };
  }

  if (creator.stripe_customer_id && creator.stripe_customer_id !== customerId) {
    return {
      success: false,

      reason:
        "Checkout Session customer does not match the creator billing profile.",
    };
  }

  if (
    creator.stripe_subscription_id &&
    creator.stripe_subscription_id !== subscriptionId &&
    BLOCKING_SUBSCRIPTION_STATUSES.has(
      String(creator.subscription_status || "").toLowerCase(),
    )
  ) {
    return {
      success: false,

      reason: "Another non-terminal creator subscription is already linked.",
    };
  }

  const result = await queryable.query(
    `
        UPDATE users

        SET
          stripe_customer_id =
            $1,

          stripe_subscription_id =
            $2,

          updated_at =
            NOW()

        WHERE id =
          $3

          AND role =
            'creator'

        RETURNING
          id,
          stripe_customer_id,
          stripe_subscription_id
      `,
    [customerId, subscriptionId, creatorId],
  );

  if (result.rows.length === 0) {
    return {
      success: false,

      reason: "Checkout subscription identities could not be persisted.",
    };
  }

  return {
    success: true,

    creatorId,

    customerId,

    subscriptionId,
  };
}

/*=========================================================
Find Existing Stripe Subscription

Used before creating Checkout.

This protects against duplicate subscriptions if the
database is stale but Stripe already has an existing
subscription for the customer's billing profile.
=========================================================*/

async function findBlockingStripeSubscription(customerId) {
  const stripe = getStripeClient();

  const response = await stripe.subscriptions.list({
    customer: customerId,

    status: "all",

    limit: 100,
  });

  const blocking = (response.data || []).filter((subscription) =>
    BLOCKING_SUBSCRIPTION_STATUSES.has(
      String(subscription.status || "").toLowerCase(),
    ),
  );

  if (blocking.length > 1) {
    throw createAppError(
      "Multiple active Stripe subscriptions were found for this creator. Billing reconciliation is required.",
      "MULTIPLE_CREATOR_SUBSCRIPTIONS",
      409,
    );
  }

  return blocking[0] || null;
}

/*=========================================================
1. Get Creator Subscription Status

GET
/api/v1/subscription/status

Optional:

?refresh=1

refresh=1 asks Stripe for the exact persisted subscription
and synchronizes the local database before responding.

If Stripe is temporarily unavailable, the endpoint still
returns the last durable database state and reports:

provider_sync = unavailable
=========================================================*/

exports.getSubscriptionStatus = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    let creator = await loadCreator(db, creatorId);

    if (!creator) {
      return sendError(res, 404, "Creator account was not found.");
    }

    let providerSync = "database";

    const shouldRefresh = ["1", "true", "yes"].includes(
      String(req.query?.refresh || "").toLowerCase(),
    );

    if (shouldRefresh && creator.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();

        const subscription = await stripe.subscriptions.retrieve(
          creator.stripe_subscription_id,
        );

        const applied = await applySubscriptionObjectInternal(subscription, db);

        if (applied?.success) {
          creator = await loadCreator(db, creatorId);

          providerSync = "synchronized";
        } else {
          console.error(
            "Creator subscription refresh could not be applied:",
            applied?.reason,
          );

          providerSync = "unavailable";
        }
      } catch (error) {
        /*
          Do NOT wipe a paid subscription merely because a
          provider read failed.

          This could represent:

          - temporary Stripe failure
          - network failure
          - wrong deployment key
          - test/live mode mismatch

          Durable local state remains available.
          */
        console.error("Creator subscription provider refresh failed:", error);

        providerSync = "unavailable";
      }
    }

    return res.status(200).json({
      status: "success",

      data: serializeSubscriptionRow(creator, {
        providerSync,
      }),
    });
  } catch (error) {
    console.error("Creator subscription status fetch failed:", error);

    return handleControllerError(
      res,
      error,
      "The creator subscription status could not be loaded.",
    );
  }
};

/*=========================================================
2. Create Subscription Checkout Session

POST
/api/v1/subscription/create-checkout-session

Body:

{
  "plan": "monthly"
}

Supported:

monthly
quarterly
yearly

Optional:

{
  "client_request_id": "UUID"
}

The optional client_request_id is used only as a Stripe API
idempotency identity for the Checkout Session creation.

=========================================================
SECURITY
=========================================================

The frontend NEVER sends a Stripe Price ID.

Frontend:
monthly

Backend:
CREATOR_SUBSCRIPTION_MONTHLY_PRICE_ID

This prevents arbitrary Price IDs from being supplied by a
browser.

Route middleware should enforce:

protect
→ authorize("creator")
→ requireVerifiedEmail
→ subscription limiter
→ createCheckoutSession
=========================================================*/

exports.createCheckoutSession = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const plan = normalizePlan(req.body?.plan);

  const clientRequestId = cleanText(
    req.body?.client_request_id || req.body?.clientRequestId,
    100,
  );

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!plan) {
    return sendError(res, 400, "A supported subscription plan is required.", {
      code: "INVALID_SUBSCRIPTION_PLAN",
    });
  }

  if (clientRequestId && !isUuid(clientRequestId)) {
    return sendError(
      res,
      400,
      "client_request_id must be a valid UUID when provided.",
      {
        code: "INVALID_CLIENT_REQUEST_ID",
      },
    );
  }

  const priceId = getPlanPriceId(plan);

  if (!priceId) {
    return sendError(
      res,
      503,
      "The selected subscription plan is not configured.",
      {
        code: "SUBSCRIPTION_PLAN_NOT_CONFIGURED",
      },
    );
  }

  try {
    const creator = await loadCreator(db, creatorId);

    if (!creator) {
      return sendError(res, 404, "Creator account was not found.");
    }

    const customerId = await ensureStripeCustomer(creator);

    /*
      Stripe is checked before creating Checkout.

      This prevents duplicate subscriptions even if a webhook
      has not yet synchronized the database.
      */
    const existingSubscription =
      await findBlockingStripeSubscription(customerId);

    if (existingSubscription) {
      const applied = await applySubscriptionObjectInternal(
        existingSubscription,
        db,
      );

      if (!applied?.success) {
        console.error(
          "Existing creator Stripe subscription could not be synchronized:",
          applied?.reason,
        );
      }

      return sendError(
        res,
        409,
        "A subscription already exists for this creator. Manage the existing subscription instead.",
        {
          code: "CREATOR_SUBSCRIPTION_ALREADY_EXISTS",

          manage_billing: true,
        },
      );
    }

    const stripe = getStripeClient();

    const baseUrl = getFrontendBaseUrl();

    const checkoutPayload = {
      mode: "subscription",

      customer: customerId,

      client_reference_id: String(creatorId),

      payment_method_types: ["card"],

      line_items: [
        {
          price: priceId,

          quantity: 1,
        },
      ],

      metadata: {
        transaction_purpose: "creator_subscription",

        user_id: String(creatorId),

        subscription_plan: plan,
      },

      /*
        Metadata copied onto the actual Stripe Subscription.

        This lets subscription webhooks independently resolve
        the correct creator.
        */
      subscription_data: {
        metadata: {
          transaction_purpose: "creator_subscription",

          user_id: String(creatorId),

          subscription_plan: plan,
        },
      },

      success_url: `${baseUrl}/creator/wallet?subscription=success&session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${baseUrl}/creator/wallet?subscription=cancelled`,
    };

    let session;

    if (clientRequestId) {
      session = await stripe.checkout.sessions.create(checkoutPayload, {
        idempotencyKey: `creator-subscription-checkout:${creatorId}:${clientRequestId}`,
      });
    } else {
      session = await stripe.checkout.sessions.create(checkoutPayload);
    }

    if (!session?.url) {
      throw new Error("Stripe Checkout did not return a hosted checkout URL.");
    }

    return res.status(201).json({
      status: "success",

      message: "Subscription checkout initialized successfully.",

      url: session.url,

      checkout_session_id: session.id,

      plan,
    });
  } catch (error) {
    console.error("Creator subscription Checkout creation failed:", error);

    return handleControllerError(
      res,
      error,
      "The subscription checkout could not be initialized.",
    );
  }
};

/*=========================================================
3. Create Billing Portal Session

POST
/api/v1/subscription/create-portal-session

The Stripe Billing Portal is the preferred place for:

- subscription cancellation
- payment method updates
- invoices
- billing management
- plan management, when enabled in Stripe Portal settings

This endpoint does NOT itself cancel/change the
subscription.

Stripe performs those actions and webhook synchronization
updates the application afterward.
=========================================================*/

exports.createPortalSession = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const creator = await loadCreator(db, creatorId);

    if (!creator) {
      return sendError(res, 404, "Creator account was not found.");
    }

    const customerId = cleanText(creator.stripe_customer_id, 255);

    if (!customerId || !customerId.startsWith("cus_")) {
      return sendError(
        res,
        409,
        "No Stripe billing profile exists for this creator yet.",
        {
          code: "STRIPE_BILLING_PROFILE_NOT_FOUND",
        },
      );
    }

    const stripe = getStripeClient();

    const baseUrl = getFrontendBaseUrl();

    const payload = {
      customer: customerId,

      return_url: `${baseUrl}/creator/wallet`,
    };

    const portalConfigurationId = cleanText(
      process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,
      255,
    );

    if (portalConfigurationId) {
      payload.configuration = portalConfigurationId;
    }

    const session = await stripe.billingPortal.sessions.create(payload);

    if (!session?.url) {
      throw new Error("Stripe Billing Portal did not return a URL.");
    }

    return res.status(200).json({
      status: "success",

      url: session.url,
    });
  } catch (error) {
    console.error("Creator Billing Portal session creation failed:", error);

    return handleControllerError(
      res,
      error,
      "The billing portal could not be opened.",
    );
  }
};

/*=========================================================
Reconcile Exact Stripe Subscription

TRUSTED INTERNAL FUNCTION

This performs:

Stripe GET sub_...
        ↓
applySubscriptionObjectInternal

Use it when an event gives us a subscription identity but
not the complete current Subscription object.

IMPORTANT:

This performs a Stripe network request.

Do not call it while intentionally holding PostgreSQL money
locks or other long-lived transaction locks.
=========================================================*/

async function reconcileSubscriptionByIdInternal(subscriptionId) {
  const normalizedId = cleanText(subscriptionId, 255);

  if (!normalizedId.startsWith("sub_")) {
    return {
      success: false,

      reason: "A valid Stripe subscription ID is required.",
    };
  }

  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.retrieve(normalizedId);

  return applySubscriptionObjectInternal(subscription, db);
}

/*=========================================================
Reconcile Subscription From Checkout

Useful after:

checkout.session.completed

First links the Checkout identities, then retrieves Stripe's
exact Subscription state.

This does NOT trust the Checkout query-string redirect.
=========================================================*/

async function reconcileCheckoutSessionSubscriptionInternal(session) {
  const linked = await processCheckoutSessionCompletedInternal(session, db);

  if (!linked?.success || linked?.ignored) {
    return linked;
  }

  return reconcileSubscriptionByIdInternal(linked.subscriptionId);
}

/*=========================================================
Invoice Reconciliation

Stripe invoice object shapes have changed over API versions.

We support both:

invoice.subscription

and newer:

invoice.parent.subscription_details.subscription
=========================================================*/

async function reconcileInvoiceSubscriptionInternal(invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return {
      success: true,

      ignored: true,

      reason: "Invoice is not linked to a Stripe subscription.",
    };
  }

  return reconcileSubscriptionByIdInternal(subscriptionId);
}

/*=========================================================
Trusted Webhook Exports

These must NOT be exposed directly as ordinary HTTP routes.

Recommended centralized Stripe webhook routing:

checkout.session.completed
→ reconcileCheckoutSessionSubscriptionInternal

customer.subscription.created
→ processSubscriptionCreatedInternal

customer.subscription.updated
→ processSubscriptionUpdatedInternal

customer.subscription.deleted
→ processSubscriptionDeletedInternal

invoice.paid
→ processInvoicePaidInternal

invoice.payment_failed
→ processInvoicePaymentFailedInternal
=========================================================*/

exports.processCheckoutSessionCompletedInternal =
  processCheckoutSessionCompletedInternal;

exports.reconcileCheckoutSessionSubscriptionInternal =
  reconcileCheckoutSessionSubscriptionInternal;

exports.processSubscriptionCreatedInternal = async (
  subscription,
  queryable = db,
) => applySubscriptionObjectInternal(subscription, queryable);

exports.processSubscriptionUpdatedInternal = async (
  subscription,
  queryable = db,
) => applySubscriptionObjectInternal(subscription, queryable);

exports.processSubscriptionDeletedInternal = async (
  subscription,
  queryable = db,
) => applySubscriptionObjectInternal(subscription, queryable);

exports.processInvoicePaidInternal = async (invoice) =>
  reconcileInvoiceSubscriptionInternal(invoice);

exports.processInvoicePaymentFailedInternal = async (invoice) =>
  reconcileInvoiceSubscriptionInternal(invoice);

exports.reconcileSubscriptionByIdInternal = reconcileSubscriptionByIdInternal;

exports.applySubscriptionObjectInternal = applySubscriptionObjectInternal;

/*=========================================================
Purpose Constant

Useful for trusted webhook validation/logging.
=========================================================*/

exports.CREATOR_SUBSCRIPTION_PURPOSE = "creator_subscription";
