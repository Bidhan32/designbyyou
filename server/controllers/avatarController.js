"use strict";

const fs = require("fs");
const db = require("../config/db");

const {
  PROVIDERS,
  describeProviders,
  getAvatarProvider,
  requireConfiguredProvider,
} = require("../services/avatar/avatarProviderFactory");

/* =========================================================
   DesignByYou - Shared Avatar Controller
   Version 3.1 - Profile Identity Preference
   ========================================================= */

const SUPPORTED_ROLES = new Set(["creator", "designer"]);
const DISPLAY_MODES = new Set(["wear", "showcase"]);

const POSES = new Set([
  "standing",
  "confident",
  "hands-on-hips",
  "holding-sketchbook",
  "holding-tablet",
  "presenting-design",
  "walking",
  "seated",
]);

const BACKGROUND_THEMES = new Set([
  "studio",
  "digital-studio",
  "runway",
  "atelier",
  "minimal",
  "neon",
  "luxury",
  "street",
  "nature",
  "transparent",
]);

const GENERATION_STATUSES = new Set([
  "ready",
  "uploading",
  "processing",
  "failed",
]);

const AVATAR_SOURCES = new Set(["manual", "photo"]);

/* =========================================================
   Existing Fashion Persona 2D Defaults
   ========================================================= */

const DEFAULT_AVATAR_CONFIG = Object.freeze({
  avatarStyle: "fashion-persona",

  skinTone: "medium-2",

  faceShape: "oval",

  eyeStyle: "soft",

  eyeColor: "#3b2417",

  eyebrowStyle: "natural",

  hairStyle: "wavy-short",

  hairColor: "#17120f",

  facialHair: "none",

  glasses: "none",

  bodyType: "regular",

  expression: "friendly",

  topTemplate: "hoodie",

  topColor: "#6d28d9",

  bottomTemplate: "trousers",

  bottomColor: "#111827",

  shoes: "sneakers-white",

  accessory: "none",

  animation: "gentle-float",

  showDesignAura: true,

  showFeaturedCard: true,

  auraStyle: "soft-glow",

  auraPrimaryColor: "#8b5cf6",

  auraSecondaryColor: "#06b6d4",

  /*
   * Shared profile-identity preference.
   *
   * false:
   *   normal uploaded profile image remains preferred.
   *
   * true:
   *   Fashion Persona is preferred by ProfileIdentity.jsx.
   *
   * The uploaded profile image is never deleted or overwritten.
   */
  useAsProfilePicture: false,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const MAX_CONFIG_BYTES = 30_000;
const MAX_STRING_LENGTH = 300;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 6;

/* =========================================================
   General Helpers
   ========================================================= */

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function isUuid(value) {
  return UUID_PATTERN.test(cleanText(value));
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = cleanText(value).toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getAuthenticatedUserId(req) {
  return cleanText(req.user?.id || req.user?.user_id || req.user?._id);
}

function sendError(res, status, message, extra = undefined) {
  const payload = {
    success: false,

    message,
  };

  if (extra && isPlainObject(extra)) {
    Object.assign(payload, extra);
  }

  return res.status(status).json(payload);
}

function sendProviderError(res, error, fallbackMessage) {
  const status = Number(error?.statusCode || error?.status);

  const safeStatus =
    Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;

  const code = cleanText(error?.code);

  return sendError(
    res,
    safeStatus,
    cleanText(error?.message, fallbackMessage),
    code
      ? {
          code,
        }
      : undefined,
  );
}

function normalizeGenerationStatus(value, fallback = "ready") {
  const status = cleanText(value, fallback).toLowerCase();

  return GENERATION_STATUSES.has(status) ? status : fallback;
}

function normalizeAvatarSource(value, fallback = "manual") {
  const source = cleanText(value, fallback).toLowerCase();

  return AVATAR_SOURCES.has(source) ? source : fallback;
}

/* =========================================================
   URL Helpers
   ========================================================= */

function normalizePreviewUrl(value) {
  const url = cleanText(value);

  if (!url) {
    return null;
  }

  if (url.length > 4096) {
    throw new Error("Avatar preview URL is too long.");
  }

  if (/^(javascript|vbscript):/i.test(url)) {
    throw new Error("Avatar preview URL is invalid.");
  }

  const valid =
    url.startsWith("/") ||
    url.startsWith("data:image/") ||
    /^https?:\/\//i.test(url);

  if (!valid) {
    throw new Error(
      "Avatar preview URL must be an HTTP URL, image data URL, or server-relative path.",
    );
  }

  return url;
}

function normalizeModelUrl(value, label = "Avatar model URL") {
  const url = cleanText(value);

  if (!url) {
    return null;
  }

  if (url.length > 4096) {
    throw new Error(`${label} is too long.`);
  }

  if (/^(javascript|vbscript|data):/i.test(url)) {
    throw new Error(`${label} is invalid.`);
  }

  if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) {
    throw new Error(`${label} must be an HTTP URL or server-relative path.`);
  }

  return url;
}

function getUploadedPreviewUrl(req) {
  const file = req.file;

  if (!file) {
    return null;
  }

  const value =
    file.location || file.secure_url || file.url || file.path || file.filename;

  if (!value) {
    return null;
  }

  const normalized = String(value).replace(/\\/g, "/");

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }

  const uploadsIndex = normalized.toLowerCase().lastIndexOf("uploads/");

  if (uploadsIndex >= 0) {
    return `/${normalized.slice(uploadsIndex)}`;
  }

  return `/${normalized.replace(/^\/+/, "")}`;
}

/* =========================================================
   Avatar Configuration Validation
   ========================================================= */

function sanitizeValue(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new Error(`avatar_config may not exceed ${MAX_DEPTH} nested levels.`);
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(
        `Avatar configuration strings may not exceed ${MAX_STRING_LENGTH} characters.`,
      );
    }

    return value.trim();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("avatar_config contains an invalid number.");
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error(
        `Avatar configuration arrays may contain at most ${MAX_ARRAY_LENGTH} items.`,
      );
    }

    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length > MAX_OBJECT_KEYS) {
      throw new Error(
        `Avatar configuration objects may contain at most ${MAX_OBJECT_KEYS} keys.`,
      );
    }

    return entries.reduce((result, [key, nestedValue]) => {
      const normalizedKey = cleanText(key);

      if (!normalizedKey || BLOCKED_KEYS.has(normalizedKey)) {
        return result;
      }

      result[normalizedKey] = sanitizeValue(nestedValue, depth + 1);

      return result;
    }, {});
  }

  throw new Error("avatar_config contains an unsupported value.");
}

function sanitizeAvatarConfig(value) {
  if (!isPlainObject(value)) {
    throw new Error("avatar_config must be a JSON object.");
  }

  const size = Buffer.byteLength(JSON.stringify(value), "utf8");

  if (size > MAX_CONFIG_BYTES) {
    throw new Error(`avatar_config may not exceed ${MAX_CONFIG_BYTES} bytes.`);
  }

  return sanitizeValue(value);
}

/* =========================================================
   Profile Identity Preference

   IMPORTANT:
   ---------------------------------------------------------

   useAsProfilePicture is a DesignByYou presentation preference,
   not an Internal3D engine customization field.

   Fashion Persona 2D can store arbitrary JSON configuration
   directly, but Internal3D providers may normalize or discard
   keys they do not recognize.

   Therefore the controller owns this preference and reattaches
   it after provider normalization.

   This keeps:

   Avatar Studio
       ↓
   useAsProfilePicture = true
       ↓
   database avatar_config
       ↓
   GET /avatar/me
       ↓
   ProfileIdentity

   stable for BOTH avatar engines.
   ========================================================= */

function getProfilePicturePreference(config, fallback = false) {
  const safeConfig = safeObject(config);

  if (Object.prototype.hasOwnProperty.call(safeConfig, "useAsProfilePicture")) {
    return toBoolean(safeConfig.useAsProfilePicture, fallback);
  }

  if (
    Object.prototype.hasOwnProperty.call(safeConfig, "use_as_profile_picture")
  ) {
    return toBoolean(safeConfig.use_as_profile_picture, fallback);
  }

  return fallback;
}

function stripProfilePicturePreference(config) {
  const result = {
    ...safeObject(config),
  };

  delete result.useAsProfilePicture;
  delete result.use_as_profile_picture;

  return result;
}

function applyProfilePicturePreference(config, preference = false) {
  return {
    ...stripProfilePicturePreference(config),

    useAsProfilePicture: Boolean(preference),
  };
}

/* =========================================================
   Engine Configuration Helpers
   ========================================================= */

function normalizeConfigForEngine(engine, config) {
  const safeConfig = safeObject(config);

  const profilePicturePreference = getProfilePicturePreference(
    safeConfig,
    false,
  );

  const engineConfig = stripProfilePicturePreference(safeConfig);

  if (engine === PROVIDERS.INTERNAL_3D) {
    try {
      const provider = getAvatarProvider(PROVIDERS.INTERNAL_3D);

      const normalizedConfig =
        typeof provider.normalizeConfig === "function"
          ? provider.normalizeConfig(engineConfig)
          : engineConfig;

      return applyProfilePicturePreference(
        normalizedConfig,
        profilePicturePreference,
      );
    } catch (error) {
      console.warn(
        "Internal3D config normalization failed:",
        error?.message || error,
      );

      return applyProfilePicturePreference(
        engineConfig,
        profilePicturePreference,
      );
    }
  }

  return applyProfilePicturePreference(
    {
      ...DEFAULT_AVATAR_CONFIG,

      ...engineConfig,
    },
    profilePicturePreference,
  );
}

/* =========================================================
   User Helpers
   ========================================================= */

async function getUser(userId) {
  const result = await db.query(
    `
        SELECT
          id,
          role,
          full_name

        FROM users

        WHERE id = $1

        LIMIT 1
      `,
    [userId],
  );

  return result.rows[0] || null;
}

async function getIdentity(req) {
  const userId = getAuthenticatedUserId(req);

  if (!isUuid(userId)) {
    return {
      error: "Authenticated user ID is missing or invalid.",

      status: 401,
    };
  }

  const user = await getUser(userId);

  if (!user) {
    return {
      error: "Authenticated user account was not found.",

      status: 401,
    };
  }

  const role = cleanText(req.user?.role || user.role).toLowerCase();

  if (!SUPPORTED_ROLES.has(role)) {
    return {
      error:
        "Avatar Studio is available only to creator and designer accounts.",

      status: 403,
    };
  }

  return {
    userId,

    role,

    user,
  };
}

/* =========================================================
   Avatar Database Helper

   IMPORTANT:

   designs.high_res_file_url is intentionally never selected.
   ========================================================= */

async function getAvatarRow(userId, { publicDesignOnly = false } = {}) {
  const featuredDesignIdSelect = publicDesignOnly
    ? `
          CASE
            WHEN d.id IS NOT NULL
              THEN ua.featured_design_id
            ELSE NULL
          END AS featured_design_id
        `
    : `
          ua.featured_design_id
        `;

  const publicDesignJoin = publicDesignOnly
    ? `
          AND d.is_public = TRUE
          AND d.is_published = TRUE
        `
    : "";

  const result = await db.query(
    `
        SELECT
          ua.id,

          ua.user_id,

          ua.avatar_config,

          ${featuredDesignIdSelect},

          ua.display_mode,

          ua.pose,

          ua.background_theme,

          ua.avatar_preview_url,

          ua.is_public,

          ua.avatar_version,

          ua.avatar_engine,

          ua.avatar_source,

          ua.provider_user_id,

          ua.provider_avatar_id,

          ua.model_glb_url,

          ua.model_vrm_url,

          ua.provider_config,

          ua.model_metadata,

          ua.generation_status,

          ua.generation_error,

          ua.created_at,

          ua.updated_at,

          u.full_name,

          u.role,

          d.id
            AS design_id,

          d.owner_id
            AS design_owner_id,

          d.title
            AS design_title,

          d.slug
            AS design_slug,

          d.description
            AS design_description,

          d.watermarked_preview_url
            AS design_watermarked_preview_url,

          d.source_type
            AS design_source_type,

          d.editor_project_id
            AS design_editor_project_id,

          d.is_editable
            AS design_is_editable,

          d.allow_remix
            AS design_allow_remix,

          d.original_design_id
            AS design_original_design_id,

          d.is_public
            AS design_is_public,

          d.is_published
            AS design_is_published

        FROM user_avatars ua

        JOIN users u
          ON u.id =
            ua.user_id

        LEFT JOIN designs d
          ON d.id =
            ua.featured_design_id

          ${publicDesignJoin}

        WHERE ua.user_id =
          $1

        LIMIT 1
      `,
    [userId],
  );

  return result.rows[0] || null;
}

/* =========================================================
   Featured Design Normalizer
   ========================================================= */

function normalizeFeaturedDesign(row) {
  if (!row?.design_id) {
    return null;
  }

  return {
    id: row.design_id,

    owner_id: row.design_owner_id,

    title: row.design_title,

    slug: row.design_slug,

    description: row.design_description,

    watermarked_preview_url: row.design_watermarked_preview_url,

    /*
     * Safe frontend alias.
     *
     * There is no designs.preview_url column.
     */

    preview_url: row.design_watermarked_preview_url,

    source_type: row.design_source_type,

    editor_project_id: row.design_editor_project_id,

    is_editable: Boolean(row.design_is_editable),

    allow_remix: Boolean(row.design_allow_remix),

    original_design_id: row.design_original_design_id,

    is_public: Boolean(row.design_is_public),

    is_published: Boolean(row.design_is_published),
  };
}

/* =========================================================
   Avatar Normalizer
   ========================================================= */

function normalizeAvatar(row, fallback = {}, { publicView = false } = {}) {
  const user = fallback.user || {};

  const userId = row?.user_id || fallback.userId || user.id || null;

  const engine = cleanText(
    row?.avatar_engine,
    PROVIDERS.FASHION_PERSONA_2D,
  ).toLowerCase();

  const status = normalizeGenerationStatus(row?.generation_status, "ready");

  const avatarConfig = normalizeConfigForEngine(engine, row?.avatar_config);

  const useAsProfilePicture = getProfilePicturePreference(avatarConfig, false);

  const data = {
    exists: Boolean(row?.id),

    id: row?.id || null,

    user_id: userId,

    user: {
      id: userId,

      full_name: row?.full_name || user.full_name || null,

      role: row?.role || user.role || null,
    },

    avatar_engine: engine,

    avatar_source: normalizeAvatarSource(row?.avatar_source, "manual"),

    avatar_config: avatarConfig,

    /*
     * Convenience aliases for identity consumers.
     *
     * avatar_config remains the canonical persistence location.
     */

    useAsProfilePicture,

    use_as_profile_picture: useAsProfilePicture,

    featured_design_id: row?.featured_design_id || null,

    featured_design: normalizeFeaturedDesign(row),

    display_mode: row?.display_mode || "showcase",

    pose: row?.pose || "standing",

    background_theme: row?.background_theme || "studio",

    avatar_preview_url: row?.avatar_preview_url || null,

    is_public: row?.is_public ?? true,

    avatar_version: Number(row?.avatar_version || 1),

    generation_status: status,

    is_3d: engine !== PROVIDERS.FASHION_PERSONA_2D,

    is_ready: status === "ready",

    model_glb_url:
      status === "ready" || !publicView ? row?.model_glb_url || null : null,

    model_vrm_url:
      status === "ready" || !publicView ? row?.model_vrm_url || null : null,

    created_at: row?.created_at || null,

    updated_at: row?.updated_at || null,
  };

  /*
   * Internal bookkeeping remains private.
   */

  if (!publicView) {
    data.provider_user_id = row?.provider_user_id || null;

    data.provider_avatar_id = row?.provider_avatar_id || null;

    data.provider_config = safeObject(row?.provider_config);

    data.model_metadata = safeObject(row?.model_metadata);

    data.generation_error = row?.generation_error || null;
  }

  return data;
}

/* =========================================================
   Default 2D Avatar Row
   ========================================================= */

async function upsertDefaultAvatar(userId) {
  await db.query(
    `
      INSERT INTO user_avatars (
        user_id,

        avatar_config,

        display_mode,

        pose,

        background_theme,

        is_public,

        avatar_version,

        avatar_engine,

        avatar_source,

        provider_config,

        model_metadata,

        generation_status,

        created_at,

        updated_at
      )

      VALUES (
        $1,

        $2::jsonb,

        'showcase',

        'standing',

        'studio',

        TRUE,

        1,

        'fashion_persona_2d',

        'manual',

        '{}'::jsonb,

        '{}'::jsonb,

        'ready',

        NOW(),

        NOW()
      )

      ON CONFLICT (user_id)

      DO NOTHING
    `,
    [userId, JSON.stringify(DEFAULT_AVATAR_CONFIG)],
  );
}

/* =========================================================
   Internal3D Persistence
   ========================================================= */

async function saveInternal3DAvatar(
  userId,
  result,
  source = "manual",
  profilePicturePreference = undefined,
) {
  const resolvedPreference =
    profilePicturePreference === undefined
      ? getProfilePicturePreference(result?.config, false)
      : toBoolean(profilePicturePreference, false);

  const config = sanitizeAvatarConfig(
    applyProfilePicturePreference(
      safeObject(result?.config),
      resolvedPreference,
    ),
  );

  const modelGlbUrl = normalizeModelUrl(
    result?.modelGlbUrl,
    "Internal3D base model URL",
  );

  const modelVrmUrl = normalizeModelUrl(
    result?.modelVrmUrl,
    "Internal3D VRM model URL",
  );

  const metadata = safeObject(result?.metadata);

  const avatarSource = normalizeAvatarSource(source, "manual");

  await db.query(
    `
      INSERT INTO user_avatars (
        user_id,

        avatar_config,

        display_mode,

        pose,

        background_theme,

        avatar_preview_url,

        is_public,

        avatar_version,

        avatar_engine,

        avatar_source,

        provider_user_id,

        provider_avatar_id,

        model_glb_url,

        model_vrm_url,

        provider_config,

        model_metadata,

        generation_status,

        generation_error,

        created_at,

        updated_at
      )

      VALUES (
        $1,

        $2::jsonb,

        'showcase',

        'standing',

        'studio',

        NULL,

        TRUE,

        1,

        'internal_3d',

        $3,

        NULL,

        NULL,

        $4,

        $5,

        '{}'::jsonb,

        $6::jsonb,

        'ready',

        NULL,

        NOW(),

        NOW()
      )

      ON CONFLICT (user_id)

      DO UPDATE SET

        avatar_config =
          EXCLUDED.avatar_config,

        avatar_engine =
          'internal_3d',

        avatar_source =
          EXCLUDED.avatar_source,

        provider_user_id =
          NULL,

        provider_avatar_id =
          NULL,

        model_glb_url =
          EXCLUDED.model_glb_url,

        model_vrm_url =
          EXCLUDED.model_vrm_url,

        provider_config =
          '{}'::jsonb,

        model_metadata =
          EXCLUDED.model_metadata,

        generation_status =
          'ready',

        generation_error =
          NULL,

        avatar_preview_url =
          CASE
            WHEN user_avatars.avatar_engine <> 'internal_3d'
              THEN NULL

            ELSE user_avatars.avatar_preview_url
          END,

        avatar_version =
          user_avatars.avatar_version + 1,

        updated_at =
          NOW()
    `,
    [
      userId,

      JSON.stringify(config),

      avatarSource,

      modelGlbUrl,

      modelVrmUrl,

      JSON.stringify(metadata),
    ],
  );
}

async function saveInternal3DConfig(
  userId,
  config,
  metadata = {},
  profilePicturePreference = undefined,
) {
  const resolvedPreference =
    profilePicturePreference === undefined
      ? getProfilePicturePreference(config, false)
      : toBoolean(profilePicturePreference, false);

  const safeConfig = sanitizeAvatarConfig(
    applyProfilePicturePreference(config, resolvedPreference),
  );

  await db.query(
    `
      UPDATE user_avatars

      SET
        avatar_config =
          $2::jsonb,

        model_metadata =
          $3::jsonb,

        generation_status =
          'ready',

        generation_error =
          NULL,

        avatar_version =
          avatar_version + 1,

        updated_at =
          NOW()

      WHERE user_id =
        $1

        AND avatar_engine =
          'internal_3d'
    `,
    [userId, JSON.stringify(safeConfig), JSON.stringify(safeObject(metadata))],
  );
}

/* =========================================================
   Legacy Upload Cleanup

   Temporary until avatarRoutes.js is updated.

   The current old route may still upload the former
   three-photo files. If that route is accidentally called,
   remove those temporary files before returning 410.
   ========================================================= */

async function cleanupUploadedFiles(req) {
  const paths = new Set();

  const addFile = (file) => {
    const filePath = cleanText(file?.path);

    if (filePath) {
      paths.add(filePath);
    }
  };

  if (req.file) {
    addFile(req.file);
  }

  if (Array.isArray(req.files)) {
    req.files.forEach(addFile);
  } else if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach(addFile);
      } else {
        addFile(value);
      }
    });
  }

  await Promise.all(
    [...paths].map(async (filePath) => {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.warn(
            "Legacy avatar upload cleanup failed:",
            error?.message || error,
          );
        }
      }
    }),
  );
}

/* =========================================================
   GET /api/v1/avatar/me
   ========================================================= */

exports.getMyAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const row = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      data: normalizeAvatar(row, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("getMyAvatar error:", error);

    return sendError(res, 500, "The avatar profile could not be loaded.");
  }
};

/* =========================================================
   PUT /api/v1/avatar/me

   Shared presentation endpoint.

   For Internal3D, avatar_config is validated through
   Internal3DProvider.

   For Fashion Persona 2D, existing merge behavior remains.
   ========================================================= */

exports.updateMyAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const body = req.body || {};

    const current = await getAvatarRow(identity.userId);

    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

    if (
      !has("avatar_config") &&
      !has("display_mode") &&
      !has("pose") &&
      !has("background_theme") &&
      !has("is_public") &&
      !has("avatar_preview_url")
    ) {
      return sendError(res, 400, "No avatar fields were supplied for update.");
    }

    const engine = cleanText(
      current?.avatar_engine,
      PROVIDERS.FASHION_PERSONA_2D,
    ).toLowerCase();

    let avatarConfig = normalizeConfigForEngine(engine, current?.avatar_config);

    /*
     * Preserve the current identity preference unless the
     * incoming avatar_config explicitly changes it.
     */

    let profilePicturePreference = getProfilePicturePreference(
      avatarConfig,
      false,
    );

    /* -----------------------------------------------------
           Avatar Configuration
           ----------------------------------------------------- */

    if (has("avatar_config")) {
      let incomingConfig;

      try {
        incomingConfig = sanitizeAvatarConfig(body.avatar_config);
      } catch (error) {
        return sendError(res, 400, error.message);
      }

      const replace = toBoolean(body.replace_config, false);

      profilePicturePreference = getProfilePicturePreference(
        incomingConfig,
        profilePicturePreference,
      );

      if (engine === PROVIDERS.INTERNAL_3D) {
        try {
          const provider = requireConfiguredProvider(PROVIDERS.INTERNAL_3D);

          /*
           * Internal3D owns only engine customization.
           *
           * Do not send the DesignByYou profile-identity flag
           * through provider normalization because providers
           * may drop unknown keys.
           */

          const result = await provider.updateCustomization(
            null,

            stripProfilePicturePreference(incomingConfig),

            {
              currentConfig: stripProfilePicturePreference(avatarConfig),

              replace,
            },
          );

          avatarConfig = applyProfilePicturePreference(
            result.config,
            profilePicturePreference,
          );
        } catch (error) {
          return sendProviderError(
            res,
            error,
            "The Internal3D avatar configuration is invalid.",
          );
        }
      } else {
        const nextConfig = replace
          ? {
              ...DEFAULT_AVATAR_CONFIG,

              ...stripProfilePicturePreference(incomingConfig),
            }
          : {
              ...stripProfilePicturePreference(avatarConfig),

              ...stripProfilePicturePreference(incomingConfig),
            };

        avatarConfig = applyProfilePicturePreference(
          nextConfig,
          profilePicturePreference,
        );
      }
    }

    /* -----------------------------------------------------
           Display Mode
           ----------------------------------------------------- */

    const displayMode = has("display_mode")
      ? cleanText(body.display_mode).toLowerCase()
      : current?.display_mode || "showcase";

    if (!DISPLAY_MODES.has(displayMode)) {
      return sendError(
        res,
        400,
        'display_mode must be either "wear" or "showcase".',
      );
    }

    /* -----------------------------------------------------
           Pose
           ----------------------------------------------------- */

    const pose = has("pose")
      ? cleanText(body.pose).toLowerCase()
      : current?.pose || "standing";

    if (!POSES.has(pose)) {
      return sendError(
        res,
        400,
        `Unsupported pose. Allowed values: ${Array.from(POSES).join(", ")}.`,
      );
    }

    /* -----------------------------------------------------
           Background
           ----------------------------------------------------- */

    const backgroundTheme = has("background_theme")
      ? cleanText(body.background_theme).toLowerCase()
      : current?.background_theme || "studio";

    if (!BACKGROUND_THEMES.has(backgroundTheme)) {
      return sendError(
        res,
        400,
        `Unsupported background theme. Allowed values: ${Array.from(
          BACKGROUND_THEMES,
        ).join(", ")}.`,
      );
    }

    /* -----------------------------------------------------
           Visibility
           ----------------------------------------------------- */

    const isPublic = has("is_public")
      ? toBoolean(body.is_public, true)
      : (current?.is_public ?? true);

    /* -----------------------------------------------------
           Preview
           ----------------------------------------------------- */

    let previewUrl = current?.avatar_preview_url || null;

    if (has("avatar_preview_url")) {
      try {
        previewUrl = normalizePreviewUrl(body.avatar_preview_url);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
    }

    /*
     * Existing engine/model fields are deliberately
     * preserved on conflict.
     *
     * A brand-new row still starts with the current
     * Fashion Persona 2D fallback.
     */

    await db.query(
      `
          INSERT INTO user_avatars (
            user_id,

            avatar_config,

            display_mode,

            pose,

            background_theme,

            avatar_preview_url,

            is_public,

            avatar_version,

            avatar_engine,

            avatar_source,

            provider_config,

            model_metadata,

            generation_status,

            created_at,

            updated_at
          )

          VALUES (
            $1,

            $2::jsonb,

            $3,

            $4,

            $5,

            $6,

            $7,

            1,

            'fashion_persona_2d',

            'manual',

            '{}'::jsonb,

            '{}'::jsonb,

            'ready',

            NOW(),

            NOW()
          )

          ON CONFLICT (user_id)

          DO UPDATE SET

            avatar_config =
              EXCLUDED.avatar_config,

            display_mode =
              EXCLUDED.display_mode,

            pose =
              EXCLUDED.pose,

            background_theme =
              EXCLUDED.background_theme,

            avatar_preview_url =
              EXCLUDED.avatar_preview_url,

            is_public =
              EXCLUDED.is_public,

            avatar_version =
              user_avatars.avatar_version + 1,

            updated_at =
              NOW()
        `,
      [
        identity.userId,

        JSON.stringify(avatarConfig),

        displayMode,

        pose,

        backgroundTheme,

        previewUrl,

        isPublic,
      ],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(current ? 200 : 201).json({
      success: true,

      message: current
        ? "Avatar updated successfully."
        : "Avatar created successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("updateMyAvatar error:", error);

    return sendError(res, 500, "The avatar profile could not be updated.");
  }
};

/* =========================================================
   POST /api/v1/avatar/me/internal3d

   Creates or switches to Internal3D.
   ========================================================= */

exports.createInternal3DAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const current = await getAvatarRow(identity.userId);

    const rawConfig = req.body?.avatar_config ?? req.body?.config ?? {};

    let config;

    try {
      config = sanitizeAvatarConfig(rawConfig);
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    const profilePicturePreference = getProfilePicturePreference(
      config,
      getProfilePicturePreference(current?.avatar_config, false),
    );

    const provider = requireConfiguredProvider(PROVIDERS.INTERNAL_3D);

    const result = await provider.createManual({
      userId: identity.userId,

      config: stripProfilePicturePreference(config),

      metadata: {
        role: identity.role,

        createdBy: "designbyyou",
      },
    });

    await saveInternal3DAvatar(
      identity.userId,
      result,
      "manual",
      profilePicturePreference,
    );

    const updated = await getAvatarRow(identity.userId);

    const replacing = current?.avatar_engine === PROVIDERS.INTERNAL_3D;

    return res.status(replacing ? 200 : 201).json({
      success: true,

      message: replacing
        ? "Internal3D Fashion Persona replaced successfully."
        : "Internal3D Fashion Persona created successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("createInternal3DAvatar error:", error);

    return sendProviderError(
      res,
      error,
      "The Internal3D Fashion Persona could not be created.",
    );
  }
};

/* =========================================================
   GET /api/v1/avatar/me/internal3d
   ========================================================= */

exports.getMyInternal3DAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const row = await getAvatarRow(identity.userId);

    if (!row || row.avatar_engine !== PROVIDERS.INTERNAL_3D) {
      return sendError(
        res,
        404,
        "An Internal3D Fashion Persona has not been created yet.",
      );
    }

    return res.status(200).json({
      success: true,

      data: normalizeAvatar(row, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("getMyInternal3DAvatar error:", error);

    return sendError(res, 500, "The Internal3D avatar could not be loaded.");
  }
};

/* =========================================================
   PUT /api/v1/avatar/me/internal3d

   Deep-merges Internal3D configuration through
   Internal3DProvider.
   ========================================================= */

exports.updateInternal3DAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const current = await getAvatarRow(identity.userId);

    if (!current || current.avatar_engine !== PROVIDERS.INTERNAL_3D) {
      return sendError(
        res,
        409,
        "Create an Internal3D Fashion Persona before editing it.",
      );
    }

    const rawPatch = req.body?.avatar_config ?? req.body?.config;

    if (!isPlainObject(rawPatch)) {
      return sendError(res, 400, "avatar_config must be a JSON object.");
    }

    let patch;

    try {
      patch = sanitizeAvatarConfig(rawPatch);
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    const profilePicturePreference = getProfilePicturePreference(
      patch,
      getProfilePicturePreference(current.avatar_config, false),
    );

    const provider = requireConfiguredProvider(PROVIDERS.INTERNAL_3D);

    const result = await provider.updateCustomization(
      null,

      stripProfilePicturePreference(patch),

      {
        currentConfig: stripProfilePicturePreference(current.avatar_config),

        replace: toBoolean(req.body?.replace_config, false),

        metadata: {
          role: identity.role,
        },
      },
    );

    await saveInternal3DConfig(
      identity.userId,

      result.config,

      {
        ...safeObject(current.model_metadata),

        ...safeObject(result.metadata),
      },

      profilePicturePreference,
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Internal3D Fashion Persona updated successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("updateInternal3DAvatar error:", error);

    return sendProviderError(
      res,
      error,
      "The Internal3D Fashion Persona could not be updated.",
    );
  }
};

/* =========================================================
   GET /api/v1/avatar/internal3d/assets

   Returns Internal3D asset catalog.

   Currently empty until we add our real GLB assets.
   ========================================================= */

exports.getInternal3DAssets = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const provider = requireConfiguredProvider(PROVIDERS.INTERNAL_3D);

    const catalog = await provider.getCustomizationAssets();

    return res.status(200).json({
      success: true,

      data: catalog,
    });
  } catch (error) {
    console.error("getInternal3DAssets error:", error);

    return sendProviderError(
      res,
      error,
      "The Internal3D asset catalog could not be loaded.",
    );
  }
};

/* =========================================================
   POST /api/v1/avatar/me/internal3d/analyze-photo

   Phase 2 placeholder.

   MediaPipe/photo matching will be added after our manual
   3D avatar is actually rendering.
   ========================================================= */

exports.analyzeInternal3DPhoto = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    return sendError(
      res,
      501,
      "Internal3D selfie analysis is not enabled yet. Manual 3D customization is the current creation method.",
      {
        code: "INTERNAL_3D_PHOTO_ANALYSIS_NOT_READY",
      },
    );
  } catch (error) {
    console.error("analyzeInternal3DPhoto error:", error);

    return sendError(
      res,
      500,
      "The Internal3D photo request could not be handled.",
    );
  }
};

/* =========================================================
   POST /api/v1/avatar/me/preview
   ========================================================= */

exports.updateAvatarPreview = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    let previewUrl = getUploadedPreviewUrl(req);

    if (!previewUrl) {
      try {
        previewUrl = normalizePreviewUrl(req.body?.avatar_preview_url);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
    }

    if (!previewUrl) {
      return sendError(
        res,
        400,
        "Provide an avatar preview upload or avatar_preview_url.",
      );
    }

    await upsertDefaultAvatar(identity.userId);

    await db.query(
      `
          UPDATE user_avatars

          SET
            avatar_preview_url =
              $2,

            avatar_version =
              avatar_version + 1,

            updated_at =
              NOW()

          WHERE user_id =
            $1
        `,
      [identity.userId, previewUrl],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Avatar preview updated successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("updateAvatarPreview error:", error);

    return sendError(res, 500, "The avatar preview could not be updated.");
  }
};

/* =========================================================
   DELETE /api/v1/avatar/me/preview
   ========================================================= */

exports.removeAvatarPreview = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    await upsertDefaultAvatar(identity.userId);

    await db.query(
      `
          UPDATE user_avatars

          SET
            avatar_preview_url =
              NULL,

            avatar_version =
              avatar_version + 1,

            updated_at =
              NOW()

          WHERE user_id =
            $1
        `,
      [identity.userId],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Avatar preview removed successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("removeAvatarPreview error:", error);

    return sendError(res, 500, "The avatar preview could not be removed.");
  }
};

/* =========================================================
   PUT /api/v1/avatar/me/featured-design

   DESIGNER
   --------
   May feature a design they own.

   CREATOR
   -------
   May feature a design they own or a public+published design.
   ========================================================= */

exports.setFeaturedDesign = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const designId = cleanText(
      req.body?.featured_design_id || req.body?.design_id,
    );

    if (!isUuid(designId)) {
      return sendError(
        res,
        400,
        "A valid featured_design_id UUID is required.",
      );
    }

    const displayMode = cleanText(
      req.body?.display_mode,
      "showcase",
    ).toLowerCase();

    if (!DISPLAY_MODES.has(displayMode)) {
      return sendError(
        res,
        400,
        'display_mode must be either "wear" or "showcase".',
      );
    }

    const designResult = await db.query(
      `
            SELECT
              id,

              owner_id,

              title,

              watermarked_preview_url,

              source_type,

              editor_project_id,

              is_editable,

              allow_remix,

              original_design_id,

              is_public,

              is_published

            FROM designs

            WHERE id =
              $1

            LIMIT 1
          `,
      [designId],
    );

    const design = designResult.rows[0];

    if (!design) {
      return sendError(res, 404, "The selected featured design was not found.");
    }

    const ownsDesign = String(design.owner_id) === String(identity.userId);

    const publicAndPublished =
      design.is_public === true && design.is_published === true;

    if (identity.role === "designer" && !ownsDesign) {
      return sendError(
        res,
        403,
        "Designers may feature only designs that they own.",
      );
    }

    if (identity.role === "creator" && !ownsDesign && !publicAndPublished) {
      return sendError(
        res,
        403,
        "Creators may feature only public and published designs.",
      );
    }

    await upsertDefaultAvatar(identity.userId);

    await db.query(
      `
          UPDATE user_avatars

          SET
            featured_design_id =
              $2,

            display_mode =
              $3,

            avatar_version =
              avatar_version + 1,

            updated_at =
              NOW()

          WHERE user_id =
            $1
        `,
      [identity.userId, designId, displayMode],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Featured design linked to the avatar successfully.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("setFeaturedDesign error:", error);

    return sendError(res, 500, "The featured design could not be updated.");
  }
};

/* =========================================================
   DELETE /api/v1/avatar/me/featured-design
   ========================================================= */

exports.removeFeaturedDesign = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    await upsertDefaultAvatar(identity.userId);

    await db.query(
      `
          UPDATE user_avatars

          SET
            featured_design_id =
              NULL,

            display_mode =
              'showcase',

            avatar_version =
              avatar_version + 1,

            updated_at =
              NOW()

          WHERE user_id =
            $1
        `,
      [identity.userId],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Featured design removed from the avatar.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("removeFeaturedDesign error:", error);

    return sendError(res, 500, "The featured design could not be removed.");
  }
};

/* =========================================================
   GET /api/v1/avatars/:userId

   Public Security:
   - private avatar => 404
   - private/unpublished featured designs hidden
   - provider internals hidden
   - high_res_file_url is never selected
   ========================================================= */

exports.getPublicAvatar = async (req, res) => {
  try {
    const userId = cleanText(req.params?.userId || req.params?.id);

    if (!isUuid(userId)) {
      return sendError(res, 400, "A valid user ID is required.");
    }

    const user = await getUser(userId);

    if (!user) {
      return sendError(res, 404, "Avatar profile was not found.");
    }

    if (!SUPPORTED_ROLES.has(cleanText(user.role).toLowerCase())) {
      return sendError(res, 404, "Avatar profile was not found.");
    }

    const row = await getAvatarRow(userId, {
      publicDesignOnly: true,
    });

    if (row && row.is_public !== true) {
      return sendError(res, 404, "Avatar profile was not found.");
    }

    return res.status(200).json({
      success: true,

      data: normalizeAvatar(
        row,

        {
          userId,

          user,
        },

        {
          publicView: true,
        },
      ),
    });
  } catch (error) {
    console.error("getPublicAvatar error:", error);

    return sendError(
      res,
      500,
      "The public avatar profile could not be loaded.",
    );
  }
};

/* =========================================================
   POST /api/v1/avatar/me/reset

   Returns the account to the existing 2D Fashion Persona.
   Internal3D can be created again at any time.
   ========================================================= */

exports.resetMyAvatar = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    await db.query(
      `
          INSERT INTO user_avatars (
            user_id,

            avatar_config,

            featured_design_id,

            display_mode,

            pose,

            background_theme,

            avatar_preview_url,

            is_public,

            avatar_version,

            avatar_engine,

            avatar_source,

            provider_user_id,

            provider_avatar_id,

            model_glb_url,

            model_vrm_url,

            provider_config,

            model_metadata,

            generation_status,

            generation_error,

            created_at,

            updated_at
          )

          VALUES (
            $1,

            $2::jsonb,

            NULL,

            'showcase',

            'standing',

            'studio',

            NULL,

            TRUE,

            1,

            'fashion_persona_2d',

            'manual',

            NULL,

            NULL,

            NULL,

            NULL,

            '{}'::jsonb,

            '{}'::jsonb,

            'ready',

            NULL,

            NOW(),

            NOW()
          )

          ON CONFLICT (user_id)

          DO UPDATE SET

            avatar_config =
              EXCLUDED.avatar_config,

            featured_design_id =
              NULL,

            display_mode =
              'showcase',

            pose =
              'standing',

            background_theme =
              'studio',

            avatar_preview_url =
              NULL,

            is_public =
              TRUE,

            avatar_engine =
              'fashion_persona_2d',

            avatar_source =
              'manual',

            provider_user_id =
              NULL,

            provider_avatar_id =
              NULL,

            model_glb_url =
              NULL,

            model_vrm_url =
              NULL,

            provider_config =
              '{}'::jsonb,

            model_metadata =
              '{}'::jsonb,

            generation_status =
              'ready',

            generation_error =
              NULL,

            avatar_version =
              user_avatars.avatar_version + 1,

            updated_at =
              NOW()
        `,
      [identity.userId, JSON.stringify(DEFAULT_AVATAR_CONFIG)],
    );

    const updated = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      message: "Avatar reset to the default Fashion Persona.",

      data: normalizeAvatar(updated, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("resetMyAvatar error:", error);

    return sendError(res, 500, "The avatar could not be reset.");
  }
};

/* =========================================================
   GET /api/v1/avatar/providers
   ========================================================= */

exports.getAvatarProviders = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    return res.status(200).json({
      success: true,

      data: describeProviders(),
    });
  } catch (error) {
    console.error("getAvatarProviders error:", error);

    return sendError(res, 500, "Avatar engines could not be loaded.");
  }
};

/* =========================================================
   TEMPORARY LEGACY ROUTE COMPATIBILITY

   Your current avatarRoutes.js still references the older
   external-provider handlers.

   These exports keep Express from receiving undefined route
   callbacks until avatarRoutes.js is replaced next.

   They should be removed after the route migration.
   ========================================================= */

/* ---------------------------------------------------------
   Old:
   POST /api/v1/avatar/me/from-photo
   --------------------------------------------------------- */

exports.createAvatarFromPhotos = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    return sendError(
      res,
      410,
      "The external three-photo avatar route has been retired. Use Internal3D instead.",
      {
        code: "EXTERNAL_AVATAR_ROUTE_RETIRED",

        replacement: "/api/v1/avatar/me/internal3d",
      },
    );
  } finally {
    await cleanupUploadedFiles(req);
  }
};

/* ---------------------------------------------------------
   Old:
   GET /api/v1/avatar/me/generation-status

   Internal3D manual creation is synchronous/ready.
   This now simply returns current stored state.
   --------------------------------------------------------- */

exports.getAvatarGenerationStatus = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const row = await getAvatarRow(identity.userId);

    return res.status(200).json({
      success: true,

      data: normalizeAvatar(row, {
        userId: identity.userId,

        user: identity.user,
      }),
    });
  } catch (error) {
    console.error("getAvatarGenerationStatus error:", error);

    return sendError(res, 500, "Avatar status could not be loaded.");
  }
};

/* ---------------------------------------------------------
   Old external provider session
   --------------------------------------------------------- */

exports.createAvatarProviderSession = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    return sendError(
      res,
      410,
      "External provider sessions have been retired. Internal3D is edited directly in DesignByYou Avatar Studio.",
      {
        code: "EXTERNAL_AVATAR_SESSION_RETIRED",
      },
    );
  } catch (error) {
    console.error("createAvatarProviderSession error:", error);

    return sendError(
      res,
      500,
      "The avatar session request could not be handled.",
    );
  }
};

/* ---------------------------------------------------------
   Per-user GLB export

   Not available yet because Internal3D currently works as:

   shared human-base.glb
           +
   avatar_config
   --------------------------------------------------------- */

exports.exportAvatarModel = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const current = await getAvatarRow(identity.userId);

    if (!current || current.avatar_engine !== PROVIDERS.INTERNAL_3D) {
      return sendError(
        res,
        409,
        "Create an Internal3D Fashion Persona before requesting a 3D export.",
      );
    }

    return sendError(
      res,
      501,
      "Per-user GLB export is not enabled yet. Internal3D uses a shared base GLB plus avatar_config.",
      {
        code: "INTERNAL_3D_EXPORT_NOT_READY",

        model_glb_url: current.model_glb_url || null,
      },
    );
  } catch (error) {
    console.error("exportAvatarModel error:", error);

    return sendError(
      res,
      500,
      "The Internal3D export request could not be handled.",
    );
  }
};

/* ---------------------------------------------------------
   Automatic preview capture

   We will implement this after FashionPersona3D.jsx exists.
   --------------------------------------------------------- */

exports.generateProviderPreview = async (req, res) => {
  try {
    const identity = await getIdentity(req);

    if (identity.error) {
      return sendError(res, identity.status, identity.error);
    }

    const current = await getAvatarRow(identity.userId);

    if (!current || current.avatar_engine !== PROVIDERS.INTERNAL_3D) {
      return sendError(
        res,
        409,
        "Create an Internal3D Fashion Persona before generating its portrait.",
      );
    }

    return sendError(
      res,
      501,
      "Automatic Internal3D portrait generation is not enabled yet.",
      {
        code: "INTERNAL_3D_PREVIEW_NOT_READY",
      },
    );
  } catch (error) {
    console.error("generateProviderPreview error:", error);

    return sendError(
      res,
      500,
      "The Internal3D portrait request could not be handled.",
    );
  }
};

/* ---------------------------------------------------------
   Provider webhook retired.

   index.js no longer mounts this route.
   --------------------------------------------------------- */

exports.handleProviderWebhook = async (req, res) => {
  return sendError(
    res,
    410,
    "External avatar-provider webhooks are no longer used by DesignByYou Internal3D.",
    {
      code: "EXTERNAL_AVATAR_WEBHOOK_RETIRED",
    },
  );
};

/* =========================================================
   Exports for Tests / Avatar Studio
   ========================================================= */

exports.DEFAULT_AVATAR_CONFIG = DEFAULT_AVATAR_CONFIG;

exports.DISPLAY_MODES = Array.from(DISPLAY_MODES);

exports.POSES = Array.from(POSES);

exports.BACKGROUND_THEMES = Array.from(BACKGROUND_THEMES);

exports.GENERATION_STATUSES = Array.from(GENERATION_STATUSES);
