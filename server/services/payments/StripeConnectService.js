"use strict";

/*
=========================================================
DesignByYou Stripe Connect Service
Stripe Accounts v2 Marketplace Integration
Version 1.2
=========================================================

Responsibilities:

1. Create a Stripe connected account for a designer
2. Create Stripe-hosted onboarding links
3. Retrieve connected-account status

Account-creation safety:

- Connected-account creation uses an explicit persistent
  Stripe idempotency key.
- The caller must persist that key BEFORE contacting Stripe.
- Retrying the same logical account-creation operation must
  use the SAME idempotency key and SAME request parameters.
- Bank details remain collected directly by Stripe.
- Live UAE connected-account creation is blocked unless
  explicitly enabled after the platform's UAE Connect
  configuration has been confirmed.

IMPORTANT:

The current Accounts v2 creation payload is intentionally
preserved for now.

Do NOT enable STRIPE_UAE_CONNECT_APPROVED until the exact
supported UAE account configuration has been confirmed.
=========================================================
*/

const Stripe = require("stripe");

/*=========================================================
Stripe Client
=========================================================*/

let stripeClient = null;

function getConfiguredStripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function getStripeClient() {
  const secretKey = getConfiguredStripeSecretKey();

  if (!secretKey) {
    const error = new Error("STRIPE_SECRET_KEY is not configured.");

    error.statusCode = 500;
    error.code = "STRIPE_SECRET_KEY_MISSING";

    throw error;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

/*=========================================================
Stripe Environment Helpers
=========================================================*/

function isLiveStripeKey() {
  const secretKey = getConfiguredStripeSecretKey();

  return secretKey.startsWith("sk_live_");
}

function isUaeConnectCreationApproved() {
  return (
    String(process.env.STRIPE_UAE_CONNECT_APPROVED || "")
      .trim()
      .toLowerCase() === "true"
  );
}

/*=========================================================
Validation Helpers
=========================================================*/

function cleanString(value, maxLength = 255) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = cleanString(value, 320).toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid designer email address is required.");

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_EMAIL";

    throw error;
  }

  return email;
}

function normalizeCountry(value) {
  const country = cleanString(value, 2).toUpperCase();

  if (!/^[A-Z]{2}$/.test(country)) {
    const error = new Error("A valid two-letter ISO country code is required.");

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_COUNTRY";

    throw error;
  }

  return country;
}

function normalizeDisplayName(value) {
  const displayName = cleanString(value, 100);

  if (!displayName) {
    const error = new Error("A designer display name is required.");

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_DISPLAY_NAME";

    throw error;
  }

  return displayName;
}

function normalizeAccountId(value) {
  const accountId = cleanString(value, 255);

  if (!accountId || !accountId.startsWith("acct_")) {
    const error = new Error("A valid Stripe connected account ID is required.");

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_ACCOUNT_ID";

    throw error;
  }

  return accountId;
}

function normalizeIdempotencyKey(value) {
  const key = cleanString(value, 255);

  if (!key) {
    const error = new Error(
      "A Stripe account-creation idempotency key is required.",
    );

    error.statusCode = 500;
    error.code = "STRIPE_CONNECT_IDEMPOTENCY_KEY_REQUIRED";

    throw error;
  }

  return key;
}

function normalizeInternalId(value, fieldName) {
  const id = cleanString(value, 100);

  if (!id) {
    const error = new Error(`${fieldName} is required.`);

    error.statusCode = 500;
    error.code = "STRIPE_CONNECT_INTERNAL_ID_REQUIRED";

    throw error;
  }

  return id;
}

function normalizeHttpUrl(value, fieldName) {
  const raw = cleanString(value, 2048);

  if (!raw) {
    const error = new Error(`${fieldName} is required.`);

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_URL";

    throw error;
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    const error = new Error(`${fieldName} must be a valid URL.`);

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_URL";

    throw error;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    const error = new Error(`${fieldName} must use HTTP or HTTPS.`);

    error.statusCode = 400;
    error.code = "INVALID_STRIPE_CONNECT_URL";

    throw error;
  }

  return parsed.toString();
}

/*=========================================================
Live UAE Account-Creation Safety
=========================================================*/

/**
 * Prevent accidental creation of a real UAE connected
 * account while the backend is using a live Stripe secret
 * key.
 *
 * This deliberately checks the actual Stripe key mode
 * rather than NODE_ENV.
 *
 * That matters because local development may still load
 * an sk_live_ key.
 */
function assertLiveUaeConnectCreationAllowed(country) {
  if (country !== "AE") {
    return;
  }

  if (!isLiveStripeKey()) {
    return;
  }

  if (isUaeConnectCreationApproved()) {
    return;
  }

  const error = new Error(
    "Live UAE Stripe Connect account creation is disabled until the platform's UAE Connect configuration has been approved.",
  );

  error.statusCode = 503;
  error.code = "STRIPE_UAE_CONNECT_APPROVAL_REQUIRED";

  throw error;
}

/*=========================================================
1. Create Connected Account
=========================================================*/

/**
 * Creates a Stripe Accounts v2 connected account.
 *
 * The account is configured as a recipient because:
 *
 * Customer
 *    ↓
 * Platform receives payment
 *    ↓
 * Booking is fulfilled
 *    ↓
 * Platform transfers designer earnings
 *    ↓
 * Designer connected account
 *
 * IMPORTANT:
 *
 * idempotencyKey must come from a persistent database row.
 *
 * Never generate a fresh key merely because an HTTP
 * request was retried.
 *
 * @param {Object} options
 * @param {string} options.email
 * @param {string} options.displayName
 * @param {string} options.country
 * @param {string} options.designerId
 * @param {string} options.operationId
 * @param {string} options.idempotencyKey
 */
async function createConnectedAccount(options = {}) {
  const stripe = getStripeClient();

  const email = normalizeEmail(options.email);

  const displayName = normalizeDisplayName(options.displayName);

  const country = normalizeCountry(options.country);

  /*
   * =======================================================
   * CRITICAL LIVE UAE SAFETY GATE
   * =======================================================
   *
   * This runs BEFORE any Stripe connected-account creation
   * request is sent.
   *
   * NODE_ENV is intentionally not used as the protection
   * boundary because development machines can still have a
   * live Stripe secret key configured.
   */
  assertLiveUaeConnectCreationAllowed(country);

  const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);

  const designerId = normalizeInternalId(options.designerId, "Designer ID");

  const operationId = normalizeInternalId(
    options.operationId,
    "Stripe Connect operation ID",
  );

  /*
   * IMPORTANT:
   *
   * This Accounts v2 configuration is deliberately
   * preserved temporarily.
   *
   * The live UAE safety gate prevents this configuration
   * from creating a real UAE account until the supported
   * responsibility/dashboard configuration has been
   * explicitly confirmed.
   */
  const account = await stripe.v2.core.accounts.create(
    {
      contact_email: email,

      display_name: displayName,

      /*
       * Existing Accounts v2 dashboard configuration.
       *
       * Do not treat this configuration as approved for
       * live UAE connected-account creation simply because
       * the environment safety flag exists.
       */
      dashboard: "express",

      identity: {
        country: country.toLowerCase(),
      },

      /*
       * Existing marketplace responsibility model.
       *
       * Preserved until the final UAE-supported Stripe
       * Connect configuration is established.
       */
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },

      /*
       * Recipient configuration allows the connected
       * account to receive Transfers from the platform.
       */
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },

      /*
       * Stripe-side recovery breadcrumbs.
       *
       * These allow a Stripe account to be traced back to
       * the local designer and durable creation operation
       * if Stripe succeeds but local persistence fails.
       */
      metadata: {
        designbyyou_designer_id: designerId,
        designbyyou_connect_operation_id: operationId,
      },

      include: ["configuration.recipient", "identity", "requirements"],
    },

    /*
     * API v2 request options.
     *
     * Retrying the same durable creation operation must
     * always use exactly this persisted idempotency key.
     */
    {
      idempotencyKey,
    },
  );

  return account;
}

/*=========================================================
2. Create Stripe Hosted Onboarding Link
=========================================================*/

/**
 * Creates a temporary, single-use Stripe onboarding URL.
 *
 * Bank details and required connected-account information
 * are collected directly by Stripe.
 *
 * @param {Object} options
 * @param {string} options.accountId
 * @param {string} options.returnUrl
 * @param {string} options.refreshUrl
 */
async function createOnboardingLink(options = {}) {
  const stripe = getStripeClient();

  const accountId = normalizeAccountId(options.accountId);

  const returnUrl = normalizeHttpUrl(
    options.returnUrl,
    "Stripe Connect return URL",
  );

  const refreshUrl = normalizeHttpUrl(
    options.refreshUrl,
    "Stripe Connect refresh URL",
  );

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: accountId,

    use_case: {
      type: "account_onboarding",

      account_onboarding: {
        configurations: ["recipient"],

        /*
         * Ask Stripe onboarding to collect both currently
         * required and eventually due information where
         * supported.
         */
        collection_options: {
          fields: "eventually_due",
        },

        return_url: returnUrl,

        refresh_url: refreshUrl,
      },
    },
  });

  return accountLink;
}

/*=========================================================
3. Retrieve Connected Account
=========================================================*/

/**
 * Retrieves the current Stripe connected-account state.
 *
 * Accounts v2 can omit includable values unless they are
 * explicitly requested, so recipient configuration,
 * identity and requirements are included.
 *
 * @param {string} accountId
 */
async function getConnectedAccount(accountId) {
  const stripe = getStripeClient();

  const normalizedAccountId = normalizeAccountId(accountId);

  const account = await stripe.v2.core.accounts.retrieve(normalizedAccountId, {
    include: ["configuration.recipient", "identity", "requirements"],
  });

  return account;
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  createConnectedAccount,
  createOnboardingLink,
  getConnectedAccount,
};
