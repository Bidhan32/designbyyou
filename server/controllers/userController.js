"use strict";

/*
=========================================================
DesignByYou / FashionVision
User Controller
Profile, Public Identity and Account Security
Version 4.0
=========================================================

Responsibilities:

1. Safe public user/network data
2. Safe public Creator/Designer profiles
3. Authenticated account profile updates
4. Creator profile preferences
5. Designer profile preferences
6. Standard profile-image updates
7. Password updates
8. Session revocation after password changes

=========================================================
IMPORTANT SECURITY RULES
=========================================================

PUBLIC RESPONSES

Never expose:

- email
- password_hash
- token_version
- Stripe IDs
- payout information
- private finance data
- authentication secrets


PROFILE IMAGE

The standard profile image is independent from the shared
Fashion Persona system.

Fashion Persona data belongs under:

/avatar/*

This controller therefore does NOT accept an arbitrary
remote_avatar_url from the browser.


PASSWORD CHANGE

A successful password change increments token_version.

That deliberately invalidates all JWTs issued with the
previous token version, including the current session.

The frontend should redirect the user to sign in again
after a successful password change.
=========================================================
*/

const db = require("../config/db");

const bcrypt = require("bcryptjs");

/*=========================================================
Configuration
=========================================================*/

const BCRYPT_ROUNDS = 12;

const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_MAX_LENGTH = 128;

const MAX_NAME_LENGTH = 120;

const MAX_COMPANY_LENGTH = 160;

const MAX_CATEGORY_LENGTH = 120;

const MAX_DIMENSIONS_LENGTH = 120;

const MAX_BIO_LENGTH = 5000;

const MAX_LOCATION_LENGTH = 160;

const MAX_GUIDELINES_LENGTH = 5000;

/*=========================================================
General Helpers
=========================================================*/

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

/*=========================================================
Body Text Parser
=========================================================

Distinguishes between:

field omitted
    → preserve existing DB value

field sent as ""
    → clear nullable DB value

field sent with text
    → replace existing DB value
=========================================================*/

function parseBodyText(body, key, { maxLength, multiline = false }) {
  if (!hasOwn(body, key)) {
    return {
      provided: false,

      value: null,

      error: null,
    };
  }

  const raw = body[key];

  if (raw === null || raw === undefined) {
    return {
      provided: true,

      value: null,

      error: null,
    };
  }

  if (typeof raw !== "string") {
    return {
      provided: true,

      value: null,

      error: `${key} must be text.`,
    };
  }

  let value = raw.replace(/\0/g, "");

  if (multiline) {
    value = value.replace(/\r\n/g, "\n").trim();
  } else {
    value = value.replace(/\s+/g, " ").trim();
  }

  if (value.length > maxLength) {
    return {
      provided: true,

      value: null,

      error: `${key} must not exceed ${maxLength} characters.`,
    };
  }

  return {
    provided: true,

    value: value || null,

    error: null,
  };
}

/*=========================================================
HTTP Error Helper
=========================================================*/

function sendError(res, statusCode, message, code = null) {
  return res.status(statusCode).json({
    status: "error",

    ...(code
      ? {
          code,
        }
      : {}),

    message,
  });
}

/*=========================================================
Transaction Rollback Helper
=========================================================*/

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch {
    /*
    Preserve original failure.
    */
  }
}

/*=========================================================
Profile Image Helper
=========================================================*/

function getUploadedProfileImage(req) {
  if (!req?.file) {
    return null;
  }

  const value = req.file.path || req.file.secure_url || req.file.url || null;

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
}

/*=========================================================
Private Authenticated Profile Loader
=========================================================*/

async function loadAuthenticatedProfile(client, userId) {
  const result = await client.query(
    `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.role,
          u.profile_image_url,
          u.approval_status,

          cp.company_name,
          cp.preferred_category,
          cp.default_dimensions,
          cp.brand_guidelines_summary,

          dp.bio,
          dp.city,
          dp.portfolio_url,
          dp.tier,
          dp.total_completed_bookings,
          dp.avg_rating

        FROM users u

        LEFT JOIN creator_profiles cp
          ON cp.user_id =
            u.id

        LEFT JOIN designer_profiles dp
          ON dp.user_id =
            u.id

        WHERE u.id =
          $1

        LIMIT 1
      `,
    [userId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  if (normalizeRole(row.role) === "creator") {
    return {
      id: row.id,

      full_name: row.full_name,

      email: row.email,

      role: row.role,

      profile_image_url: row.profile_image_url,

      approval_status: row.approval_status,

      company_name: row.company_name,

      preferred_category: row.preferred_category,

      default_dimensions: row.default_dimensions,

      brand_guidelines_summary: row.brand_guidelines_summary,
    };
  }

  if (normalizeRole(row.role) === "designer") {
    return {
      id: row.id,

      full_name: row.full_name,

      email: row.email,

      role: row.role,

      profile_image_url: row.profile_image_url,

      approval_status: row.approval_status,

      bio: row.bio,

      city: row.city,

      location: row.city,

      portfolio_url: row.portfolio_url,

      website: row.portfolio_url,

      tier: row.tier,

      total_completed_bookings: Number(row.total_completed_bookings || 0),

      avg_rating: Number(row.avg_rating || 0),
    };
  }

  /*
  Admin-style accounts can still update their basic
  name/photo through the shared profile endpoint without
  receiving Creator/Designer profile data.
  */

  return {
    id: row.id,

    full_name: row.full_name,

    email: row.email,

    role: row.role,

    profile_image_url: row.profile_image_url,

    approval_status: row.approval_status,
  };
}

/*=========================================================
1. Safe User Network

GET
/api/v1/users
=========================================================

Backward-compatible array response.

IMPORTANT:

This used to expose every user's email address.

It now returns only safe directory fields.

Unapproved Designer accounts are excluded server-side.

Creator accounts remain discoverable without requiring the
Creator admin-approval concept.
=========================================================*/

exports.getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
              u.id,
              u.role,
              u.full_name,
              u.profile_image_url,
              u.created_at,

              dp.bio
                AS designer_bio,

              dp.portfolio_url,

              dp.tier
                AS designer_tier,

              COALESCE(
                dp.avg_rating,
                0
              )
                AS avg_rating,

              COALESCE(
                dp.total_completed_bookings,
                0
              )
                AS total_completed_bookings,

              cp.company_name,

              cp.preferred_category

            FROM users u

            LEFT JOIN designer_profiles dp
              ON dp.user_id =
                u.id

            LEFT JOIN creator_profiles cp
              ON cp.user_id =
                u.id

            WHERE
              u.role IN (
                'creator',
                'designer'
              )

              AND (
                u.role <>
                  'designer'

                OR

                u.approval_status =
                  'approved'
              )

            ORDER BY
              CASE
                WHEN u.role =
                  'designer'
                  THEN
                    COALESCE(
                      dp.total_completed_bookings,
                      0
                    )

                ELSE 0
              END DESC,

              u.created_at DESC
          `,
    );

    /*
      Keep this endpoint's historical ARRAY response shape
      for older frontend consumers while removing private
      information.
      */

    const users = result.rows.map((user) => {
      const role = normalizeRole(user.role);

      const name = user.full_name || "Unnamed Account";

      if (role === "designer") {
        return {
          id: user.id,

          role: "designer",

          name,

          full_name: name,

          profile_image_url: user.profile_image_url,

          bio: user.designer_bio,

          designer_bio: user.designer_bio,

          portfolio_url: user.portfolio_url,

          tier: user.designer_tier,

          designer_tier: user.designer_tier,

          avg_rating: Number(user.avg_rating || 0),

          total_completed_bookings: Number(user.total_completed_bookings || 0),

          specification:
            user.designer_bio ||
            `${user.designer_tier || "Standard"} Tier Designer`,
        };
      }

      return {
        id: user.id,

        role: "creator",

        name,

        full_name: name,

        profile_image_url: user.profile_image_url,

        company_name: user.company_name,

        preferred_category: user.preferred_category,

        specification: user.company_name || "Brand Creator Platform Member",
      };
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error("User network query failed:", error);

    return sendError(res, 500, "The user network could not be loaded.");
  }
};

/*=========================================================
2. Safe Public User Profile

GET
/api/v1/users/:id
=========================================================

Public-safe response.

Never returns:

- email
- approval status
- password/authentication state
- Stripe information
- private Creator brand guidelines

Unapproved Designer profiles are not publicly exposed.
=========================================================*/

exports.getUserProfileById = async (req, res) => {
  const id = String(req.params?.id || "").trim();

  if (!isUuid(id)) {
    return sendError(res, 400, "Invalid profile ID format.");
  }

  try {
    const result = await db.query(
      `
            SELECT
              u.id,
              u.full_name,
              u.role,
              u.profile_image_url,
              u.created_at,

              dp.bio,
              dp.city,
              dp.portfolio_url,
              dp.tier,
              dp.total_completed_bookings,
              dp.avg_rating,

              cp.company_name,
              cp.preferred_category

            FROM users u

            LEFT JOIN designer_profiles dp
              ON dp.user_id =
                u.id

            LEFT JOIN creator_profiles cp
              ON cp.user_id =
                u.id

            WHERE
              u.id = $1

              AND
              u.role IN (
                'creator',
                'designer'
              )

              AND (
                u.role <>
                  'designer'

                OR

                u.approval_status =
                  'approved'
              )

            LIMIT 1
          `,
      [id],
    );

    const profile = result.rows[0];

    if (!profile) {
      return sendError(res, 404, "The requested profile was not found.");
    }

    const role = normalizeRole(profile.role);

    if (role === "designer") {
      return res.status(200).json({
        status: "success",

        data: {
          id: profile.id,

          full_name: profile.full_name,

          role: "designer",

          profile_image_url: profile.profile_image_url,

          created_at: profile.created_at,

          bio: profile.bio,

          city: profile.city,

          /*
              Compatibility alias for existing Designer
              public-profile UI.
              */

          location: profile.city,

          portfolio_url: profile.portfolio_url,

          website: profile.portfolio_url,

          tier: profile.tier,

          total_completed_bookings: Number(
            profile.total_completed_bookings || 0,
          ),

          avg_rating: Number(profile.avg_rating || 0),
        },
      });
    }

    return res.status(200).json({
      status: "success",

      data: {
        id: profile.id,

        full_name: profile.full_name,

        role: "creator",

        profile_image_url: profile.profile_image_url,

        created_at: profile.created_at,

        company_name: profile.company_name,

        preferred_category: profile.preferred_category,
      },
    });
  } catch (error) {
    console.error("Public user profile query failed:", error);

    return sendError(res, 500, "The requested profile could not be loaded.");
  }
};

/*=========================================================
3. Update Authenticated Profile

PUT
/api/v1/users/profile
=========================================================

Supports:

ALL ACCOUNT TYPES
---------------------------------------------------------

- full_name
- profile_image


CREATOR
---------------------------------------------------------

- company_name
- preferred_category
- default_dimensions
- brand_guidelines_summary


DESIGNER
---------------------------------------------------------

- bio
- location

=========================================================
TRANSACTION SAFETY
=========================================================

All related writes use one pg client:

BEGIN
→ users
→ role profile
→ final profile SELECT
→ COMMIT
=========================================================*/

exports.updateProfile = async (req, res) => {
  const userId = req?.user?.id;

  if (!userId || !isUuid(userId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  const body = req.body || {};

  /*=====================================================
    Parse Basic User Field
    =====================================================*/

  const fullName = parseBodyText(body, "full_name", {
    maxLength: MAX_NAME_LENGTH,
  });

  if (fullName.error) {
    return sendError(res, 400, fullName.error);
  }

  if (fullName.provided && !fullName.value) {
    return sendError(res, 400, "full_name cannot be empty.");
  }

  if (fullName.provided && fullName.value.length < 2) {
    return sendError(res, 400, "full_name must contain at least 2 characters.");
  }

  /*=====================================================
    Parse Creator Fields
    =====================================================*/

  const companyName = parseBodyText(body, "company_name", {
    maxLength: MAX_COMPANY_LENGTH,
  });

  const preferredCategory = parseBodyText(body, "preferred_category", {
    maxLength: MAX_CATEGORY_LENGTH,
  });

  const defaultDimensions = parseBodyText(body, "default_dimensions", {
    maxLength: MAX_DIMENSIONS_LENGTH,
  });

  const brandGuidelines = parseBodyText(body, "brand_guidelines_summary", {
    maxLength: MAX_GUIDELINES_LENGTH,

    multiline: true,
  });

  /*=====================================================
    Parse Designer Fields
    =====================================================*/

  const bio = parseBodyText(body, "bio", {
    maxLength: MAX_BIO_LENGTH,

    multiline: true,
  });

  const location = parseBodyText(body, "location", {
    maxLength: MAX_LOCATION_LENGTH,
  });

  const parsedFields = [
    companyName,

    preferredCategory,

    defaultDimensions,

    brandGuidelines,

    bio,

    location,
  ];

  const invalidField = parsedFields.find((field) => field.error);

  if (invalidField) {
    return sendError(res, 400, invalidField.error);
  }

  /*=====================================================
    Standard Uploaded Profile Image

    remote_avatar_url is intentionally NOT accepted.
    =====================================================*/

  const profileImageUrl = getUploadedProfileImage(req);

  const profileImageProvided = Boolean(profileImageUrl);

  let client = null;

  try {
    client = await db.connect();

    await client.query("BEGIN");

    /*===================================================
      Lock Current User / Obtain Authoritative Role
      ===================================================*/

    const accountResult = await client.query(
      `
            SELECT
              id,
              role

            FROM users

            WHERE id =
              $1

            FOR UPDATE
          `,
      [userId],
    );

    const account = accountResult.rows[0];

    if (!account) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The authenticated account no longer exists.");
    }

    const userRole = normalizeRole(account.role);

    /*===================================================
      Update Shared User Record
      ===================================================*/

    await client.query(
      `
          UPDATE users

          SET
            full_name =
              CASE
                WHEN $1::boolean
                  THEN $2
                ELSE full_name
              END,

            profile_image_url =
              CASE
                WHEN $3::boolean
                  THEN $4
                ELSE profile_image_url
              END,

            updated_at =
              NOW()

          WHERE id =
            $5
        `,
      [
        fullName.provided,

        fullName.value,

        profileImageProvided,

        profileImageUrl,

        userId,
      ],
    );

    /*===================================================
      Creator Profile
      ===================================================*/

    if (userRole === "creator") {
      const creatorFieldProvided =
        companyName.provided ||
        preferredCategory.provided ||
        defaultDimensions.provided ||
        brandGuidelines.provided;

      if (creatorFieldProvided) {
        /*
          UPSERT protects against an unexpectedly missing
          creator_profiles record while still preserving
          fields omitted by the request.
          */

        await client.query(
          `
              INSERT INTO creator_profiles (
                user_id,
                company_name,
                preferred_category,
                default_dimensions,
                brand_guidelines_summary,
                updated_at
              )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                NOW()
              )

              ON CONFLICT (
                user_id
              )

              DO UPDATE SET
                company_name =
                  CASE
                    WHEN $6::boolean
                      THEN
                        EXCLUDED.company_name
                    ELSE
                      creator_profiles.company_name
                  END,

                preferred_category =
                  CASE
                    WHEN $7::boolean
                      THEN
                        EXCLUDED.preferred_category
                    ELSE
                      creator_profiles.preferred_category
                  END,

                default_dimensions =
                  CASE
                    WHEN $8::boolean
                      THEN
                        EXCLUDED.default_dimensions
                    ELSE
                      creator_profiles.default_dimensions
                  END,

                brand_guidelines_summary =
                  CASE
                    WHEN $9::boolean
                      THEN
                        EXCLUDED.brand_guidelines_summary
                    ELSE
                      creator_profiles.brand_guidelines_summary
                  END,

                updated_at =
                  NOW()
            `,
          [
            userId,

            companyName.value,

            preferredCategory.value,

            defaultDimensions.value,

            brandGuidelines.value,

            companyName.provided,

            preferredCategory.provided,

            defaultDimensions.provided,

            brandGuidelines.provided,
          ],
        );
      }
    }

    /*===================================================
      Designer Profile
      ===================================================*/

    if (userRole === "designer") {
      const designerFieldProvided = bio.provided || location.provided;

      if (designerFieldProvided) {
        const designerUpdate = await client.query(
          `
                UPDATE designer_profiles

                SET
                  bio =
                    CASE
                      WHEN $1::boolean
                        THEN $2
                      ELSE bio
                    END,

                  city =
                    CASE
                      WHEN $3::boolean
                        THEN $4
                      ELSE city
                    END,

                  updated_at =
                    NOW()

                WHERE user_id =
                  $5

                RETURNING
                  user_id
              `,
          [bio.provided, bio.value, location.provided, location.value, userId],
        );

        if (designerUpdate.rows.length === 0) {
          throw new Error("The Designer profile record is missing.");
        }
      }
    }

    /*===================================================
      Return Fresh Private Profile
      ===================================================*/

    const updatedProfile = await loadAuthenticatedProfile(client, userId);

    if (!updatedProfile) {
      throw new Error("The updated profile could not be reloaded.");
    }

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Profile updated successfully.",

      data: updatedProfile,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Profile update failed:", error);

    return sendError(res, 500, "The profile could not be updated.");
  } finally {
    client?.release();
  }
};

/*=========================================================
4. Update Password

PUT
/api/v1/users/security
=========================================================

Body:

{
  "currentPassword": "...",
  "newPassword": "..."
}

SERVER RULES

- authenticated account required
- current password required
- new password required
- new password 8–128 characters
- new password must differ from current password
- current password must match stored hash
- bcrypt cost 12
- token_version increments after success

=========================================================
SESSION REVOCATION
=========================================================

After successful change:

token_version = token_version + 1

Any JWT issued with the previous version becomes invalid.

The frontend should clear local authentication and require
a new login.
=========================================================*/

exports.updateSecurity = async (req, res) => {
  const userId = req?.user?.id;

  if (!userId || !isUuid(userId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  const currentPassword = req.body?.currentPassword;

  const newPassword = req.body?.newPassword;

  /*
    Passwords are deliberately NOT trimmed.

    Spaces can legitimately be part of a password.
    */

  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    return sendError(res, 400, "Current password is required.");
  }

  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return sendError(res, 400, "New password is required.");
  }

  if (
    newPassword.length < PASSWORD_MIN_LENGTH ||
    newPassword.length > PASSWORD_MAX_LENGTH
  ) {
    return sendError(
      res,
      400,
      `New password must contain ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  /*
    Reasonable upper bound against pathological request
    bodies for the current-password comparison.
    */

  if (currentPassword.length > 512) {
    return sendError(res, 400, "Current password is invalid.");
  }

  let client = null;

  try {
    client = await db.connect();

    await client.query("BEGIN");

    /*
      Row lock prevents concurrent password changes from
      both validating against the same old password hash.
      */

    const userResult = await client.query(
      `
            SELECT
              id,
              password_hash,
              token_version

            FROM users

            WHERE id =
              $1

            FOR UPDATE
          `,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user) {
      await rollbackQuietly(client);

      return sendError(res, 404, "User not found.");
    }

    if (!user.password_hash) {
      await rollbackQuietly(client);

      return sendError(
        res,
        409,
        "This account does not currently have a password that can be changed through this form.",
        "PASSWORD_NOT_AVAILABLE",
      );
    }

    /*===================================================
      Verify Current Password
      ===================================================*/

    const currentMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!currentMatches) {
      await rollbackQuietly(client);

      return sendError(res, 401, "Current password is incorrect.");
    }

    /*===================================================
      Reject Same Password
      ===================================================*/

    const sameAsExisting = await bcrypt.compare(
      newPassword,
      user.password_hash,
    );

    if (sameAsExisting) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "Your new password must be different from your current password.",
      );
    }

    /*===================================================
      Hash New Password
      ===================================================*/

    const newHashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    /*===================================================
      Update Password + Revoke Existing JWTs
      ===================================================*/

    const updateResult = await client.query(
      `
            UPDATE users

            SET
              password_hash =
                $1,

              token_version =
                COALESCE(
                  token_version,
                  0
                ) + 1,

              updated_at =
                NOW()

            WHERE id =
              $2

            RETURNING
              token_version
          `,
      [newHashedPassword, userId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Password updated successfully. Please sign in again.",

      session_revoked: true,

      requires_reauthentication: true,

      token_version: updateResult.rows[0]?.token_version,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Password update failed:", error);

    return sendError(res, 500, "The password could not be updated.");
  } finally {
    client?.release();
  }
};
