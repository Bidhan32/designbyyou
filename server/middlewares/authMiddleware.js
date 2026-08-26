"use strict";

/*
=========================================================
DesignByYou Authentication Middleware
JWT Protection, Session Revocation & Authorization
Version 3.0
=========================================================

SECURITY MODEL
---------------------------------------------------------

protect:

1. extracts Bearer JWT
2. verifies HS256 signature
3. validates modern tokenVersion payload
4. loads CURRENT account state from PostgreSQL
5. checks session revocation
6. blocks suspended accounts globally
7. attaches trusted current account state

IMPORTANT:

Role, approval status and email verification are NEVER
trusted from the JWT.

They are loaded fresh from PostgreSQL on every protected
request.

=========================================================
ACCOUNT APPROVAL POLICY
---------------------------------------------------------

Creator:

- does NOT require Admin approval merely to use the app
- may have approval_status values that should not be used
  as a general Creator access gate
- sensitive financial actions enforce their own rules

Designer:

- may sign in while pending
- sensitive Designer actions may use:
  requireApprovedAccount
- approved status is required only where explicitly needed

=========================================================
GLOBAL SUSPENSION POLICY
---------------------------------------------------------

Suspension is different from normal approval state.

ANY account whose current database approval_status is:

suspended

is denied access to ALL protected application routes.

This applies regardless of role:

- Creator
- Designer
- Admin roles using this middleware

A JWT issued before suspension therefore becomes unusable
immediately on the next protected request.

=========================================================
SESSION REVOCATION
---------------------------------------------------------

users.token_version is compared with JWT tokenVersion.

Password reset or another explicit revocation action may
increment token_version, invalidating previously issued
JWTs immediately.
=========================================================
*/

const jwt = require("jsonwebtoken");

const db = require("../config/db");

/*=========================================================
Helpers
=========================================================*/

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getJwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function sendAuthError(res, status, code, message) {
  return res.status(status).json({
    status: "error",

    code,

    message,
  });
}

/*=========================================================
UUID Validation

Application user IDs are UUIDs.

This prevents malformed signed/legacy JWT subjects from
reaching PostgreSQL as invalid UUID query parameters.
=========================================================*/

function isUuid(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/*=========================================================
Extract Bearer Token
=========================================================*/

function extractBearerToken(req) {
  const authorization = req.headers.authorization;

  if (typeof authorization !== "string") {
    return null;
  }

  const parts = authorization.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    return null;
  }

  return parts[1];
}

/*=========================================================
Protect Authenticated Routes
=========================================================*/

exports.protect = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    return sendAuthError(
      res,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required. Please sign in.",
    );
  }

  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    console.error("JWT_SECRET is missing from environment variables.");

    return sendAuthError(
      res,
      500,
      "AUTH_SERVICE_UNAVAILABLE",
      "Authentication service is unavailable.",
    );
  }

  /*=====================================================
    1. VERIFY JWT SIGNATURE
    =====================================================*/

  let decoded;

  try {
    decoded = jwt.verify(token, jwtSecret, {
      /*
            authController signs application JWTs using
            HS256.

            Explicit verification prevents accepting an
            unexpected algorithm.
            */

      algorithms: ["HS256"],
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification failed:", error.message);
    }

    if (error.name === "TokenExpiredError") {
      return sendAuthError(
        res,
        401,
        "TOKEN_EXPIRED",
        "Your session has expired. Please sign in again.",
      );
    }

    if (error.name === "NotBeforeError") {
      return sendAuthError(
        res,
        401,
        "TOKEN_NOT_ACTIVE",
        "This authentication token is not active.",
      );
    }

    return sendAuthError(
      res,
      401,
      "INVALID_TOKEN",
      "The authentication token is invalid.",
    );
  }

  /*=====================================================
    2. VALIDATE JWT PAYLOAD
    =====================================================*/

  if (!decoded || typeof decoded !== "object") {
    return sendAuthError(
      res,
      401,
      "INVALID_TOKEN",
      "The authentication token is invalid.",
    );
  }

  /*
    Modern application tokens use:

    decoded.id

    userId/sub remain temporarily supported for older
    application JWT compatibility.
    */

  const rawUserId = decoded.id || decoded.userId || decoded.sub;

  const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";

  if (!userId || !isUuid(userId)) {
    return sendAuthError(
      res,
      401,
      "INVALID_TOKEN",
      "The authentication token is invalid.",
    );
  }

  /*
    Modern auth tokens include tokenVersion.

    Tokens without it predate session-revocation support
    and must be replaced with a fresh login.
    */

  if (decoded.tokenVersion === undefined || decoded.tokenVersion === null) {
    return sendAuthError(
      res,
      401,
      "SESSION_REFRESH_REQUIRED",
      "Your session must be refreshed. Please sign in again.",
    );
  }

  const tokenVersion = Number(decoded.tokenVersion);

  if (!Number.isInteger(tokenVersion) || tokenVersion < 0) {
    return sendAuthError(
      res,
      401,
      "INVALID_TOKEN",
      "The authentication token is invalid.",
    );
  }

  /*=====================================================
    3. LOAD CURRENT USER FROM DATABASE

    IMPORTANT:

    Never trust:

    - role
    - approval status
    - verification status
    - subscription information

    from JWT claims.

    Current PostgreSQL state is authoritative.
    =====================================================*/

  let userResult;

  try {
    userResult = await db.query(
      `
            SELECT
              id,
              role,
              full_name,
              email,
              profile_image_url,
              is_email_verified,
              approval_status,
              subscription_tier,
              subscription_active_until,
              token_version

            FROM users

            WHERE
              id = $1

            LIMIT 1
          `,
      [userId],
    );
  } catch (error) {
    console.error("Authentication database lookup failed:", error);

    return sendAuthError(
      res,
      500,
      "AUTH_SERVICE_UNAVAILABLE",
      "Authentication service is temporarily unavailable.",
    );
  }

  /*=====================================================
    4. ACCOUNT MUST STILL EXIST
    =====================================================*/

  if (userResult.rows.length === 0) {
    return sendAuthError(
      res,
      401,
      "ACCOUNT_NOT_FOUND",
      "The account associated with this session no longer exists.",
    );
  }

  const user = userResult.rows[0];

  /*=====================================================
    5. SESSION REVOCATION / TOKEN VERSION
    =====================================================*/

  const currentTokenVersion = Number(user.token_version ?? 0);

  if (!Number.isInteger(currentTokenVersion) || currentTokenVersion < 0) {
    console.error("Invalid token_version stored for user:", user.id);

    return sendAuthError(
      res,
      500,
      "AUTH_SERVICE_UNAVAILABLE",
      "Authentication service is temporarily unavailable.",
    );
  }

  /*
    Example:

    JWT tokenVersion       = 0
    database token_version = 1

                    ↓

    Session has been revoked.
    */

  if (tokenVersion !== currentTokenVersion) {
    return sendAuthError(
      res,
      401,
      "SESSION_REVOKED",
      "Your session is no longer valid. Please sign in again.",
    );
  }

  /*=====================================================
    6. GLOBAL ACCOUNT SUSPENSION

    CRITICAL SECURITY RULE
    -------------------------------------------------------

    Previously, suspended users were blocked only when a
    route also used:

    requireApprovedAccount

    That meant routes protected only by:

    protect
    authorize(...)

    could remain usable by a suspended account.

    Suspension is now enforced centrally.

    IMPORTANT:

    We deliberately DO NOT globally reject:

    pending
    rejected

    here.

    Those statuses remain controlled by the relevant
    feature-level approval policy.

    Only "suspended" is a universal protected-route block.
    =====================================================*/

  const approvalStatus = normalizeValue(user.approval_status);

  if (approvalStatus === "suspended") {
    return sendAuthError(
      res,
      403,
      "ACCOUNT_SUSPENDED",
      "Your account is suspended and cannot access this service.",
    );
  }

  /*=====================================================
    7. ATTACH TRUSTED CURRENT ACCOUNT STATE
    =====================================================*/

  req.user = {
    id: user.id,

    role: user.role,

    fullName: user.full_name,

    email: user.email,

    profileImageUrl: user.profile_image_url,

    isEmailVerified: user.is_email_verified === true,

    approvalStatus: user.approval_status,

    subscriptionTier: user.subscription_tier,

    subscriptionActiveUntil: user.subscription_active_until,

    tokenVersion: currentTokenVersion,
  };

  req.auth = {
    tokenIssuedAt: decoded.iat || null,

    tokenExpiresAt: decoded.exp || null,

    tokenVersion,
  };

  return next();
};

/*=========================================================
Role Authorization
=========================================================*/

exports.authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !req.user.id) {
      return sendAuthError(
        res,
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      );
    }

    const normalizedRoles = allowedRoles.map(normalizeValue).filter(Boolean);

    const currentRole = normalizeValue(req.user.role);

    if (!currentRole || !normalizedRoles.includes(currentRole)) {
      return sendAuthError(
        res,
        403,
        "FORBIDDEN",
        "You are not authorized to perform this action.",
      );
    }

    return next();
  };

/*=========================================================
Require Approved Account
=========================================================*/

exports.requireApprovedAccount = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return sendAuthError(
      res,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication is required.",
    );
  }

  const approvalStatus = normalizeValue(req.user.approvalStatus);

  if (approvalStatus === "approved") {
    return next();
  }

  /*
    Current database approval values:

    pending
    approved
    rejected
    suspended

    Note:

    "suspended" should normally never reach this middleware
    now because protect blocks it globally.

    The branch remains as defense-in-depth.
    */

  if (approvalStatus === "pending") {
    return sendAuthError(
      res,
      403,
      "ACCOUNT_PENDING_APPROVAL",
      "Your account is awaiting approval before you can use this feature.",
    );
  }

  if (approvalStatus === "rejected") {
    return sendAuthError(
      res,
      403,
      "ACCOUNT_REJECTED",
      "Your account is not approved to use this feature.",
    );
  }

  if (approvalStatus === "suspended") {
    return sendAuthError(
      res,
      403,
      "ACCOUNT_SUSPENDED",
      "Your account is suspended and cannot use this feature.",
    );
  }

  return sendAuthError(
    res,
    403,
    "ACCOUNT_NOT_APPROVED",
    "Your account must be approved before using this feature.",
  );
};

/*=========================================================
Require Verified Email
=========================================================*/

exports.requireVerifiedEmail = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return sendAuthError(
      res,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication is required.",
    );
  }

  if (req.user.isEmailVerified !== true) {
    return sendAuthError(
      res,
      403,
      "EMAIL_NOT_VERIFIED",
      "Please verify your email before using this feature.",
    );
  }

  return next();
};
