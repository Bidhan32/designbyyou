// Shared helpers and state kept separate from the React refresh boundary.

const AVATAR_ENGINES = Object.freeze({
  FASHION_PERSONA_2D:
    "fashion_persona_2d",

  INTERNAL_3D:
    "internal_3d",
});

const DEFAULT_ENGINE =
  AVATAR_ENGINES.FASHION_PERSONA_2D;

const DEFAULT_BACKGROUND =
  "studio";

const DEFAULT_POSE =
  "standing";

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function cleanText(
  value,
  fallback = "",
) {
  const text =
    String(value ?? "")
      .trim();

  return text || fallback;
}

function toBoolean(
  value,
  fallback = false,
) {
  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    return value === 1;
  }

  const normalized =
    cleanText(value)
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function normalizeAvatarEngine(
  value,
) {
  const engine =
    cleanText(
      value,
      DEFAULT_ENGINE,
    )
      .toLowerCase()
      .replace(/\s+/g, "_");

  if (
    [
      "internal_3d",
      "internal3d",
      "internal-3d",
      "fashion_persona_3d",
      "fashion-persona-3d",
      "3d",
    ].includes(engine)
  ) {
    return AVATAR_ENGINES.INTERNAL_3D;
  }

  return AVATAR_ENGINES.FASHION_PERSONA_2D;
}

function getConfiguredBackendOrigin() {
  const env =
    typeof import.meta !== "undefined"
      ? import.meta.env || {}
      : {};

  const configured =
    cleanText(
      env.VITE_BACKEND_URL ||
        env.VITE_API_URL ||
        env.VITE_API_BASE_URL,
    );

  if (!configured) {
    return "";
  }

  try {
    const url =
      new URL(configured);

    return url.origin;
  } catch {
    return configured
      .replace(
        /\/api\/v1\/?$/i,
        "",
      )
      .replace(
        /\/+$/,
        "",
      );
  }
}

function resolveAvatarMediaUrl(
  value,
  {
    mediaBaseUrl = "",
  } = {},
) {
  const url =
    cleanText(value);

  if (!url) {
    return null;
  }

  /*
   * Already absolute or embedded.
   */

  if (
    /^https?:\/\//i.test(url) ||
    url.startsWith(
      "data:image/",
    ) ||
    url.startsWith(
      "blob:",
    )
  ) {
    return url;
  }

  /*
   * Internal3D assets live in Vite public/, so these URLs
   * should remain on the frontend origin.
   */

  if (
    url.startsWith(
      "/avatars/internal3d/",
    )
  ) {
    return url;
  }

  /*
   * Explicit media base wins.
   */

  const explicitBase =
    cleanText(
      mediaBaseUrl,
    )
      .replace(
        /\/+$/,
        "",
      );

  if (explicitBase) {
    return `${explicitBase}/${url.replace(
      /^\/+/,
      "",
    )}`;
  }

  /*
   * Backend-uploaded files.
   */

  if (
    url.startsWith(
      "/uploads/",
    )
  ) {
    const backendOrigin =
      getConfiguredBackendOrigin();

    if (backendOrigin) {
      return `${backendOrigin}${url}`;
    }
  }

  return url;
}

function normalizeAvatarForRendering(
  avatar,
) {
  const source =
    isPlainObject(avatar)
      ? avatar
      : {};

  const engine =
    normalizeAvatarEngine(
      source.avatar_engine ||
        source.avatarEngine,
    );

  return {
    ...source,

    avatar_engine:
      engine,

    avatar_config:
      isPlainObject(
        source.avatar_config,
      )
        ? source.avatar_config
        : isPlainObject(
              source.avatarConfig,
            )
          ? source.avatarConfig
          : {},

    display_mode:
      cleanText(
        source.display_mode ||
          source.displayMode,
        "showcase",
      ),

    pose:
      cleanText(
        source.pose,
        DEFAULT_POSE,
      ),

    background_theme:
      cleanText(
        source.background_theme ||
          source.backgroundTheme,
        DEFAULT_BACKGROUND,
      ),

    avatar_preview_url:
      source.avatar_preview_url ||
      source.avatarPreviewUrl ||
      null,

    model_glb_url:
      source.model_glb_url ||
      source.modelGlbUrl ||
      (
        engine ===
        AVATAR_ENGINES.INTERNAL_3D
          ? "/avatars/internal3d/base/human-base.glb"
          : null
      ),

    model_vrm_url:
      source.model_vrm_url ||
      source.modelVrmUrl ||
      null,

    featured_design:
      source.featured_design ||
      source.featuredDesign ||
      null,

    featured_design_id:
      source.featured_design_id ||
      source.featuredDesignId ||
      null,

    generation_status:
      cleanText(
        source.generation_status ||
          source.generationStatus,
        "ready",
      ),

    is_public:
      toBoolean(
        source.is_public ??
          source.isPublic,
        true,
      ),

    is_3d:
      engine ===
      AVATAR_ENGINES.INTERNAL_3D,
  };
}

function isInternal3DAvatar(
  avatar,
) {
  return (
    normalizeAvatarEngine(
      avatar?.avatar_engine ||
        avatar?.avatarEngine,
    ) ===
    AVATAR_ENGINES.INTERNAL_3D
  );
}

function hasAvatarPreview(
  avatar,
) {
  return Boolean(
    cleanText(
      avatar?.avatar_preview_url ||
        avatar?.avatarPreviewUrl,
    ),
  );
}

export { AVATAR_ENGINES, DEFAULT_ENGINE, DEFAULT_BACKGROUND, DEFAULT_POSE, isPlainObject, cleanText, toBoolean, normalizeAvatarEngine, getConfiguredBackendOrigin, resolveAvatarMediaUrl, normalizeAvatarForRendering, isInternal3DAvatar, hasAvatarPreview };
