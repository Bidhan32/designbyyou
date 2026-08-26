"use strict";

/*
=========================================================
DesignByYou Authentication Controller
Registration, Verification, Login, Session & Recovery
Version 3.2
=========================================================
*/

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

const sendEmail = require("../utils/sendmail");

const {
  otpTemplate,
  passwordResetOtpTemplate,
} = require("../utils/emailtemplate");

/*=========================================================
Configuration
=========================================================*/

const PUBLIC_REGISTRATION_ROLES = new Set(["designer", "creator"]);

const OTP_EXPIRY_MINUTES = 10;

const BCRYPT_ROUNDS = 12;

const MIN_PASSWORD_LENGTH = 8;

const MAX_PASSWORD_LENGTH = 128;

/*=========================================================
General Helpers
=========================================================*/

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOtp(value) {
  return String(value || "").trim();
}

function optionalText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function isValidEmail(email) {
  if (typeof email !== "string" || email.length < 3 || email.length > 254) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== "string") {
    return {
      valid: false,
      message: "Password is required.",
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  return {
    valid: true,
    message: null,
  };
}

/*=========================================================
Secure OTP Helpers
=========================================================*/

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateOtpExpiry() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

/*
=========================================================
OTP Secret

Production should use OTP_SECRET.

During local development only, JWT_SECRET may temporarily
act as the fallback so development does not immediately
break while the environment is being configured.
=========================================================
*/

function getOtpSecret() {
  const otpSecret = String(process.env.OTP_SECRET || "").trim();

  if (otpSecret) {
    return otpSecret;
  }

  const environment = String(process.env.NODE_ENV || "development")
    .trim()
    .toLowerCase();

  if (environment !== "production") {
    const fallbackSecret = String(process.env.JWT_SECRET || "").trim();

    if (fallbackSecret) {
      console.warn(
        "WARNING: OTP_SECRET is not configured. JWT_SECRET is being used as the OTP HMAC secret in development.",
      );

      return fallbackSecret;
    }
  }

  throw new Error("OTP_SECRET is not configured.");
}

function hashOtp(otp) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(String(otp))
    .digest("hex");
}

/*=========================================================
JWT Helpers
=========================================================*/

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return secret;
}

function signToken(id, role, tokenVersion) {
  return jwt.sign(
    {
      id,
      role,
      tokenVersion,
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",

      algorithm: "HS256",
    },
  );
}

/*=========================================================
1. REGISTER
=========================================================*/

exports.register = async (req, res) => {
  let client = null;

  let transactionStarted = false;

  try {
    const body = req.body || {};

    const role = normalizeRole(body.role);

    const fullName = String(body.full_name || "").trim();

    const email = normalizeEmail(body.email);

    const password = body.password;

    const confirmPassword = body.confirm_password;

    /*-------------------------------------------------
    Public Registration Role Security
    -------------------------------------------------*/

    if (!PUBLIC_REGISTRATION_ROLES.has(role)) {
      return res.status(400).json({
        status: "error",

        message: "Invalid account type.",
      });
    }

    /*-------------------------------------------------
    Full Name Validation
    -------------------------------------------------*/

    if (!fullName) {
      return res.status(400).json({
        status: "error",

        message: "Full name is required.",
      });
    }

    if (fullName.length > 150) {
      return res.status(400).json({
        status: "error",

        message: "Full name is too long.",
      });
    }

    /*-------------------------------------------------
    Email Validation
    -------------------------------------------------*/

    if (!isValidEmail(email)) {
      return res.status(400).json({
        status: "error",

        message: "Please provide a valid email address.",
      });
    }

    /*-------------------------------------------------
    Password Validation
    -------------------------------------------------*/

    const passwordValidation = validatePassword(password);

    if (!passwordValidation.valid) {
      return res.status(400).json({
        status: "error",

        message: passwordValidation.message,
      });
    }

    if (typeof confirmPassword !== "string" || password !== confirmPassword) {
      return res.status(400).json({
        status: "error",

        message: "Passwords do not match.",
      });
    }

    /*-------------------------------------------------
    Existing Account Check
    -------------------------------------------------*/

    const existingUser = await db.query(
      `
          SELECT
            id

          FROM users

          WHERE
            LOWER(email) =
              LOWER($1)

          LIMIT 1
        `,
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: "error",

        message: "An account with this email already exists.",
      });
    }

    /*-------------------------------------------------
    Hash Password
    -------------------------------------------------*/

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    /*-------------------------------------------------
    Generate Verification OTP

    Raw OTP is sent by email.
    Only the HMAC value is stored in PostgreSQL.
    -------------------------------------------------*/

    const verificationOtp = generateOtp();

    const verificationOtpHash = hashOtp(verificationOtp);

    const verificationOtpExpires = generateOtpExpiry();

    /*-------------------------------------------------
    PostgreSQL Transaction

    db is a pg Pool. All registration transaction
    queries therefore use one checked-out connection.
    -------------------------------------------------*/

    client = await db.connect();

    await client.query("BEGIN");

    transactionStarted = true;

    /*-------------------------------------------------
    Approval Policy

    Designer -> pending
    Creator  -> approved
    -------------------------------------------------*/

    const approvalStatus = role === "designer" ? "pending" : "approved";

    /*-------------------------------------------------
    Create User
    -------------------------------------------------*/

    const newUser = await client.query(
      `
          INSERT INTO users (
            id,
            full_name,
            email,
            password_hash,
            role,

            is_email_verified,

            email_verification_otp_hash,
            email_verification_otp_expires_at,

            password_reset_otp_hash,
            password_reset_otp_expires_at,

            token_version,

            approval_status,
            profile_image_url,

            created_at,
            updated_at
          )

          VALUES (
            uuid_generate_v4(),
            $1,
            $2,
            $3,
            $4,

            FALSE,

            $5,
            $6,

            NULL,
            NULL,

            0,

            $7,
            $8,

            NOW(),
            NOW()
          )

          RETURNING
            id,
            full_name,
            email,
            role,
            approval_status,
            is_email_verified,
            token_version
        `,
      [
        fullName,
        email,
        hashedPassword,
        role,

        verificationOtpHash,
        verificationOtpExpires,

        approvalStatus,

        req.file ? req.file.path : null,
      ],
    );

    const createdUser = newUser.rows[0];

    const userId = createdUser.id;

    /*=================================================
    DESIGNER PROFILE
    =================================================*/

    if (role === "designer") {
      await client.query(
        `
          INSERT INTO designer_profiles (
            user_id,
            portfolio_url,
            bio,
            address_line,
            city,
            country,
            tier,
            xp_points,
            commission_rate,
            avg_rating,
            total_completed_bookings
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'bronze',
            0,
            10.00,
            0.0,
            0
          )
        `,
        [
          userId,

          optionalText(body.portfolio_url),

          optionalText(body.bio),

          optionalText(body.address_line),

          optionalText(body.city),

          optionalText(body.country),
        ],
      );

      await client.query(
        `
          INSERT INTO designer_wallets (
            user_id,
            available_balance,
            pending_escrow_balance
          )

          VALUES (
            $1,
            0.00,
            0.00
          )
        `,
        [userId],
      );
    }

    /*=================================================
    CREATOR PROFILE
    =================================================*/

    if (role === "creator") {
      await client.query(
        `
          INSERT INTO creator_profiles (
            id,
            user_id,
            company_name,
            preferred_category,
            created_at,
            updated_at
          )

          VALUES (
            uuid_generate_v4(),
            $1,
            $2,
            $3,
            NOW(),
            NOW()
          )
        `,
        [
          userId,

          optionalText(body.company_name),

          optionalText(body.preferred_category),
        ],
      );
    }

    /*-------------------------------------------------
    Commit Registration
    -------------------------------------------------*/

    await client.query("COMMIT");

    transactionStarted = false;

    /*
    Release the PostgreSQL connection before waiting for
    the external SMTP provider.
    */

    client.release();

    client = null;

    /*-------------------------------------------------
    Send Verification Email

    Registration remains successful if SMTP temporarily
    fails. The account already exists and the user can
    request another code through /resend-otp.
    -------------------------------------------------*/

    try {
      await sendEmail({
        email,

        subject: "Verify your DesignByYou account",

        html: otpTemplate(fullName, verificationOtp),
      });
    } catch (emailError) {
      console.error("Registration verification email failed:", {
        userId,

        message: emailError.message,
      });
    }

    return res.status(201).json({
      status: "success",

      message: "Registration successful. Please verify your email.",

      userId,

      role,

      approvalStatus,
    });
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Registration rollback failed:", rollbackError);
      }
    }

    /*
    PostgreSQL unique constraint violation.
    */

    if (error?.code === "23505") {
      return res.status(409).json({
        status: "error",

        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      status: "error",

      message: "Registration failed.",
    });
  } finally {
    client?.release?.();
  }
};

/*=========================================================
2. VERIFY EMAIL
=========================================================*/

exports.verifyEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    const otp = normalizeOtp(req.body?.otp);

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        status: "error",

        message: "Invalid or expired verification code.",
      });
    }

    const otpHash = hashOtp(otp);

    /*
    Atomic OTP consumption.

    If the verification succeeds, the OTP is immediately
    removed so it cannot be reused.
    */

    const result = await db.query(
      `
          UPDATE users

          SET
            is_email_verified =
              TRUE,

            email_verification_otp_hash =
              NULL,

            email_verification_otp_expires_at =
              NULL,

            updated_at =
              NOW()

          WHERE
            LOWER(email) =
              LOWER($1)

            AND
            is_email_verified
              IS NOT TRUE

            AND
            email_verification_otp_hash =
              $2

            AND
            email_verification_otp_expires_at >
              NOW()

          RETURNING
            id,
            email,
            role,
            approval_status
        `,
      [email, otpHash],
    );

    if (result.rows.length === 0) {
      /*
      Keep repeated verification requests friendly if
      the account is already verified.
      */

      const existing = await db.query(
        `
            SELECT
              is_email_verified

            FROM users

            WHERE
              LOWER(email) =
                LOWER($1)

            LIMIT 1
          `,
        [email],
      );

      if (existing.rows[0]?.is_email_verified === true) {
        return res.status(200).json({
          status: "success",

          message: "Email is already verified.",
        });
      }

      return res.status(400).json({
        status: "error",

        message: "Invalid or expired verification code.",
      });
    }

    return res.status(200).json({
      status: "success",

      message: "Email verified successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Email verification error:", error);

    return res.status(500).json({
      status: "error",

      message: "Email verification failed.",
    });
  }
};

/*=========================================================
3. RESEND EMAIL VERIFICATION OTP
=========================================================*/

exports.resendOtp = async (req, res) => {
  const genericResponse = {
    status: "success",

    message:
      "If email verification is required, a new verification code will be sent.",
  };

  try {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(200).json(genericResponse);
    }

    const userResult = await db.query(
      `
          SELECT
            id,
            full_name,
            is_email_verified

          FROM users

          WHERE
            LOWER(email) =
              LOWER($1)

          LIMIT 1
        `,
      [email],
    );

    /*
    Do not disclose whether the account exists.
    */

    if (userResult.rows.length === 0) {
      return res.status(200).json(genericResponse);
    }

    const user = userResult.rows[0];

    if (user.is_email_verified === true) {
      return res.status(200).json(genericResponse);
    }

    const verificationOtp = generateOtp();

    const verificationOtpHash = hashOtp(verificationOtp);

    const expires = generateOtpExpiry();

    /*
    Replace the previous verification OTP.

    The previous verification OTP immediately becomes
    invalid.
    */

    await db.query(
      `
        UPDATE users

        SET
          email_verification_otp_hash =
            $1,

          email_verification_otp_expires_at =
            $2,

          updated_at =
            NOW()

        WHERE
          id =
            $3
      `,
      [verificationOtpHash, expires, user.id],
    );

    try {
      await sendEmail({
        email,

        subject: "Your new DesignByYou verification code",

        html: otpTemplate(user.full_name, verificationOtp),
      });
    } catch (emailError) {
      /*
      Keep the outward response generic so the endpoint
      does not reveal account state through different
      responses.
      */

      console.error("Verification resend email failed:", {
        userId: user.id,

        message: emailError.message,
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Resend verification OTP error:", error);

    return res.status(500).json({
      status: "error",

      message: "Unable to process the verification request.",
    });
  }
};

/*=========================================================
4. LOGIN
=========================================================*/

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    const password = req.body?.password;

    /*
    Keep invalid username/email and invalid password
    responses identical.
    */

    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      password.length === 0
    ) {
      return res.status(401).json({
        status: "error",

        message: "Invalid email or password.",
      });
    }

    const initialCheck = await db.query(
      `
          SELECT
            id,
            role,
            password_hash,
            approval_status,
            is_email_verified,
            token_version

          FROM users

          WHERE
            LOWER(email) =
              LOWER($1)

          LIMIT 1
        `,
      [email],
    );

    const preUser = initialCheck.rows[0];

    if (!preUser || !preUser.password_hash) {
      return res.status(401).json({
        status: "error",

        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      preUser.password_hash,
    );

    if (!passwordMatches) {
      return res.status(401).json({
        status: "error",

        message: "Invalid email or password.",
      });
    }

    /*
    Account Policy

    DESIGNER:
    - May sign in while pending.
    - Approval-required actions are protected using
      requireApprovedAccount.
    - Sensitive actions may also require verified email.

    CREATOR:
    - Does not require administrator approval.
    - Sensitive actions may require verified email.
    */

    await db.query(
      `
        UPDATE users

        SET
          last_login =
            NOW(),

          updated_at =
            NOW()

        WHERE
          id =
            $1
      `,
      [preUser.id],
    );

    const role = normalizeRole(preUser.role);

    let userResult;

    /*=================================================
    DESIGNER
    =================================================*/

    if (role === "designer") {
      userResult = await db.query(
        `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.role,
              u.profile_image_url,
              u.approval_status,
              u.is_email_verified,

              u.subscription_tier,
              u.subscription_active_until,

              dp.portfolio_url,
              dp.bio,
              dp.address_line,
              dp.city,
              dp.country,
              dp.tier,
              dp.xp_points,
              dp.avg_rating,
              dp.total_completed_bookings,

              w.available_balance,
              w.pending_escrow_balance,
              w.pending_payout_balance

            FROM users u

            LEFT JOIN designer_profiles dp
              ON u.id =
                dp.user_id

            LEFT JOIN designer_wallets w
              ON u.id =
                w.user_id

            WHERE
              u.id =
                $1

            LIMIT 1
          `,
        [preUser.id],
      );
    } else if (role === "creator") {
      /*=================================================
      CREATOR
      =================================================*/

      userResult = await db.query(
        `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.role,
              u.profile_image_url,
              u.approval_status,
              u.is_email_verified,

              u.subscription_tier,
              u.subscription_active_until,

              cp.company_name,
              cp.preferred_category,
              cp.default_dimensions,
              cp.brand_guidelines_summary,
              COALESCE(
                cp.xp_points,
                0
              ) AS xp_points

            FROM users u

            LEFT JOIN creator_profiles cp
              ON u.id =
                cp.user_id

            WHERE
              u.id =
                $1

            LIMIT 1
          `,
        [preUser.id],
      );
    } else if (role === "admin" || role === "superadmin") {
      /*=================================================
      ADMIN / SUPERADMIN

      These roles may exist in PostgreSQL but can NEVER be
      created through public /register.
      =================================================*/

      userResult = await db.query(
        `
            SELECT
              id,
              full_name,
              email,
              role,
              profile_image_url,
              approval_status,
              is_email_verified,
              subscription_tier,
              subscription_active_until

            FROM users

            WHERE
              id =
                $1

            LIMIT 1
          `,
        [preUser.id],
      );
    } else {
      /*=================================================
      Unknown Role Protection
      =================================================*/

      console.error("Login rejected unknown role:", {
        userId: preUser.id,

        role: preUser.role,
      });

      return res.status(403).json({
        status: "error",

        message: "This account cannot access the application.",
      });
    }

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({
        status: "error",

        message: "Unable to load this account.",
      });
    }

    const token = signToken(
      preUser.id,
      role,
      Number(preUser.token_version ?? 0),
    );

    return res.status(200).json({
      status: "success",

      token,

      user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      status: "error",

      message: "An error occurred during login.",
    });
  }
};

/*=========================================================
5. GET CURRENT SESSION (/me)
=========================================================*/

exports.getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: "error",

        message: "Authentication is required.",
      });
    }

    const userId = req.user.id;

    const role = normalizeRole(req.user.role);

    let result;

    /*=================================================
    DESIGNER
    =================================================*/

    if (role === "designer") {
      result = await db.query(
        `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.role,
              u.profile_image_url,
              u.approval_status,
              u.is_email_verified,

              u.subscription_tier,
              u.subscription_active_until,

              dp.portfolio_url,
              dp.bio,
              dp.address_line,
              dp.city,
              dp.country,
              dp.tier,
              dp.xp_points,
              dp.avg_rating,
              dp.total_completed_bookings,

              w.available_balance,
              w.pending_escrow_balance,
              w.pending_payout_balance

            FROM users u

            LEFT JOIN designer_profiles dp
              ON u.id =
                dp.user_id

            LEFT JOIN designer_wallets w
              ON u.id =
                w.user_id

            WHERE
              u.id =
                $1

            LIMIT 1
          `,
        [userId],
      );
    } else if (role === "creator") {
      /*=================================================
      CREATOR
      =================================================*/

      result = await db.query(
        `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.role,
              u.profile_image_url,
              u.approval_status,
              u.is_email_verified,

              u.subscription_tier,
              u.subscription_active_until,

              cp.company_name,
              cp.preferred_category,
              cp.default_dimensions,
              cp.brand_guidelines_summary,
              COALESCE(
                cp.xp_points,
                0
              ) AS xp_points

            FROM users u

            LEFT JOIN creator_profiles cp
              ON u.id =
                cp.user_id

            WHERE
              u.id =
                $1

            LIMIT 1
          `,
        [userId],
      );
    } else if (role === "admin" || role === "superadmin") {
      /*=================================================
      ADMIN / SUPERADMIN
      =================================================*/

      result = await db.query(
        `
            SELECT
              id,
              full_name,
              email,
              role,
              profile_image_url,
              approval_status,
              is_email_verified,
              subscription_tier,
              subscription_active_until

            FROM users

            WHERE
              id =
                $1

            LIMIT 1
          `,
        [userId],
      );
    } else {
      return res.status(403).json({
        status: "error",

        message: "This account cannot access the application.",
      });
    }

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        status: "error",

        message: "User session could not be restored.",
      });
    }

    return res.status(200).json({
      status: "success",

      data: user,
    });
  } catch (error) {
    console.error("Session sync error:", error);

    return res.status(500).json({
      status: "error",

      message: "Internal server error reading session data.",
    });
  }
};

/*=========================================================
6. FORGOT PASSWORD
=========================================================*/

exports.forgotPassword = async (req, res) => {
  /*
  Always return this outward response whether the account
  exists or not.
  */

  const genericResponse = {
    status: "success",

    message:
      "If an account exists for that email, a password reset code will be sent.",
  };

  try {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(200).json(genericResponse);
    }

    const userResult = await db.query(
      `
          SELECT
            id,
            full_name

          FROM users

          WHERE
            LOWER(email) =
              LOWER($1)

          LIMIT 1
        `,
      [email],
    );

    /*
    Do not disclose whether an account exists.
    */

    if (userResult.rows.length === 0) {
      return res.status(200).json(genericResponse);
    }

    const user = userResult.rows[0];

    const resetOtp = generateOtp();

    const resetOtpHash = hashOtp(resetOtp);

    const expires = generateOtpExpiry();

    await db.query(
      `
        UPDATE users

        SET
          password_reset_otp_hash =
            $1,

          password_reset_otp_expires_at =
            $2,

          updated_at =
            NOW()

        WHERE
          id =
            $3
      `,
      [resetOtpHash, expires, user.id],
    );

    /*
    Do not expose email delivery status through this
    endpoint because doing so could reveal whether the
    account exists.
    */

    try {
      await sendEmail({
        email,

        subject: "DesignByYou Password Reset Code",

        html: passwordResetOtpTemplate(user.full_name, resetOtp),
      });
    } catch (emailError) {
      console.error("Password reset email failed:", {
        userId: user.id,

        message: emailError.message,
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);

    /*
    Keep outward behavior generic to prevent account
    enumeration.
    */

    return res.status(200).json(genericResponse);
  }
};

/*=========================================================
7. RESET PASSWORD
=========================================================*/

exports.resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    const otp = normalizeOtp(req.body?.otp);

    const newPassword = req.body?.newPassword;

    /*-------------------------------------------------
    Input Validation
    -------------------------------------------------*/

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        status: "error",

        message: "Invalid or expired reset code.",
      });
    }

    const passwordValidation = validatePassword(newPassword);

    if (!passwordValidation.valid) {
      return res.status(400).json({
        status: "error",

        message: passwordValidation.message,
      });
    }

    const resetOtpHash = hashOtp(otp);

    /*-------------------------------------------------
    Find Account With Valid Reset OTP
    -------------------------------------------------*/

    const userResult = await db.query(
      `
          SELECT
            id,
            password_hash

          FROM users

          WHERE
            LOWER(email) =
              LOWER($1)

            AND
            password_reset_otp_hash =
              $2

            AND
            password_reset_otp_expires_at >
              NOW()

          LIMIT 1
        `,
      [email, resetOtpHash],
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",

        message: "Invalid or expired reset code.",
      });
    }

    const user = userResult.rows[0];

    /*-------------------------------------------------
    Prevent Reusing Current Password
    -------------------------------------------------*/

    if (user.password_hash) {
      const samePassword = await bcrypt.compare(
        newPassword,
        user.password_hash,
      );

      if (samePassword) {
        return res.status(400).json({
          status: "error",

          message:
            "Your new password must be different from your current password.",
        });
      }
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    /*-------------------------------------------------
    Atomic Password Reset

    - Change password
    - Consume reset OTP
    - Increment token_version

    Existing JWT sessions therefore become invalid.
    -------------------------------------------------*/

    const updateResult = await db.query(
      `
          UPDATE users

          SET
            password_hash =
              $1,

            password_reset_otp_hash =
              NULL,

            password_reset_otp_expires_at =
              NULL,

            token_version =
              token_version + 1,

            updated_at =
              NOW()

          WHERE
            id =
              $2

            AND
            password_reset_otp_hash =
              $3

            AND
            password_reset_otp_expires_at >
              NOW()

          RETURNING
            id,
            token_version
        `,
      [newPasswordHash, user.id, resetOtpHash],
    );

    if (updateResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",

        message: "Invalid or expired reset code.",
      });
    }

    return res.status(200).json({
      status: "success",

      message:
        "Password reset successful. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      status: "error",

      message: "Reset password failed.",
    });
  }
};

/*=========================================================
8. LEGACY SUPERADMIN SETUP DISABLED

There must be NO public auth route for creating an admin
or superadmin account.

The temporary stub remains only so an accidentally stale
route cannot perform privileged account creation.

Once you have confirmed no route references this function,
this export may be removed entirely.
=========================================================*/

exports.setupSuperadmin = (req, res) => {
  return res.status(404).json({
    status: "fail",

    message: "Not found.",
  });
};
