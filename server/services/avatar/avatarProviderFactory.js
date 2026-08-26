"use strict";

const AvatarProvider = require("./AvatarProvider");

/* =========================================================
   DesignByYou
   Avatar Provider Factory
   Version 2.0

   ACTIVE ARCHITECTURE
   ---------------------------------------------------------

   fashion_persona_2d
        Existing SVG / 2D fallback

   internal_3d
        DesignByYou owned 3D avatar engine
        Primary future engine

   avaturn
        Retired / no longer active

   IMPORTANT:
   AvaturnProvider.js is no longer required by this file.

   Internal3DProvider is loaded lazily so the backend can
   still start while we create that file next.
   ========================================================= */

/* =========================================================
   Avatar Engine Names

   These names match avatar_engine values stored in:

       public.user_avatars.avatar_engine
   ========================================================= */

const PROVIDERS = Object.freeze({
  FASHION_PERSONA_2D: "fashion_persona_2d",

  INTERNAL_3D: "internal_3d",

  /*
   * Kept only for backwards/database compatibility.
   *
   * We no longer instantiate an Avaturn provider.
   */

  AVATURN: "avaturn",
});

/* =========================================================
   Default Avatar Engine

   IMPORTANT:

   Keep the existing 2D engine as the system default until
   Internal3DProvider + FashionPersona3D are fully working.

   Later we can change:

       AVATAR_DEFAULT_PROVIDER=internal_3d

   without changing this source file.
   ========================================================= */

const DEFAULT_PROVIDER =
  PROVIDERS.FASHION_PERSONA_2D;

/* =========================================================
   Active Runtime Engines
   ========================================================= */

const ACTIVE_PROVIDER_NAMES = Object.freeze([
  PROVIDERS.FASHION_PERSONA_2D,
  PROVIDERS.INTERNAL_3D,
]);

/* =========================================================
   Database-Supported Engines

   This mirrors the avatar_engine values already allowed by
   your current PostgreSQL constraint.

   Avaturn remains here only because existing database rows
   or the current constraint may still contain "avaturn".
   ========================================================= */

const DATABASE_ENGINE_NAMES = Object.freeze([
  PROVIDERS.FASHION_PERSONA_2D,
  PROVIDERS.INTERNAL_3D,
  PROVIDERS.AVATURN,
]);

/* =========================================================
   Provider Aliases

   Generic "3d" and "realistic" now resolve to our own
   Internal3D engine instead of Avaturn.
   ========================================================= */

const PROVIDER_ALIASES = Object.freeze({
  /* -------------------------------------------------------
     Fashion Persona 2D
     ------------------------------------------------------- */

  fashion_persona:
    PROVIDERS.FASHION_PERSONA_2D,

  "fashion-persona":
    PROVIDERS.FASHION_PERSONA_2D,

  fashion_persona_2d:
    PROVIDERS.FASHION_PERSONA_2D,

  "fashion-persona-2d":
    PROVIDERS.FASHION_PERSONA_2D,

  persona_2d:
    PROVIDERS.FASHION_PERSONA_2D,

  "persona-2d":
    PROVIDERS.FASHION_PERSONA_2D,

  legacy:
    PROVIDERS.FASHION_PERSONA_2D,

  svg:
    PROVIDERS.FASHION_PERSONA_2D,

  "2d":
    PROVIDERS.FASHION_PERSONA_2D,

  /* -------------------------------------------------------
     DesignByYou Internal3D
     ------------------------------------------------------- */

  internal_3d:
    PROVIDERS.INTERNAL_3D,

  "internal-3d":
    PROVIDERS.INTERNAL_3D,

  internal3d:
    PROVIDERS.INTERNAL_3D,

  fashion_persona_3d:
    PROVIDERS.INTERNAL_3D,

  "fashion-persona-3d":
    PROVIDERS.INTERNAL_3D,

  persona_3d:
    PROVIDERS.INTERNAL_3D,

  "persona-3d":
    PROVIDERS.INTERNAL_3D,

  designbyyou_3d:
    PROVIDERS.INTERNAL_3D,

  "designbyyou-3d":
    PROVIDERS.INTERNAL_3D,

  realistic:
    PROVIDERS.INTERNAL_3D,

  realistic_3d:
    PROVIDERS.INTERNAL_3D,

  "realistic-3d":
    PROVIDERS.INTERNAL_3D,

  "3d":
    PROVIDERS.INTERNAL_3D,

  /* -------------------------------------------------------
     Retired Avaturn Alias

     Kept so old stored values can be recognized and
     rejected cleanly instead of being treated as unknown.
     ------------------------------------------------------- */

  avaturn:
    PROVIDERS.AVATURN,

  avaturn_3d:
    PROVIDERS.AVATURN,

  "avaturn-3d":
    PROVIDERS.AVATURN,
});

/* =========================================================
   Fashion Persona 2D Provider

   Existing Fashion Persona SVG avatars do not require a
   remote API.

   This provider keeps the existing engine compatible with
   the common AvatarProvider architecture.
   ========================================================= */

class FashionPersona2DProvider extends AvatarProvider {
  constructor(options = {}) {
    super(options);
  }

  /* =======================================================
     Provider Identity
     ======================================================= */

  get name() {
    return PROVIDERS.FASHION_PERSONA_2D;
  }

  /* =======================================================
     Capabilities
     ======================================================= */

  get capabilities() {
    return {
      createFromPhoto: false,

      createFromMultiplePhotos: false,

      createManual: true,

      customization: true,

      bodyCustomization: true,

      faceCustomization: true,

      hairCustomization: true,

      clothingCustomization: true,

      accessoriesCustomization: true,

      modelExportGlb: false,

      modelExportVrm: false,

      previewGeneration: false,

      animation: true,

      providerSessions: false,

      webhooks: false,

      externalApi: false,

      ownedByDesignByYou: true,

      engineType: "2d",
    };
  }

  /* =======================================================
     Local engine is always configured.
     ======================================================= */

  isConfigured() {
    return true;
  }

  /* =======================================================
     Manual Creation

     Database persistence remains inside avatarController.
     ======================================================= */

  async createManual(options = {}) {
    const context =
      this.validateCreationContext(options);

    return this.normalizeAvatarResult({
      provider: this.name,

      providerUserId: null,

      providerAvatarId: null,

      status: "ready",

      modelGlbUrl: null,

      modelVrmUrl: null,

      previewUrl: null,

      config: this.ensureObject(
        context.config,
      ),

      metadata: {
        ...this.ensureObject(
          context.metadata,
        ),

        engine:
          PROVIDERS.FASHION_PERSONA_2D,

        engineVersion: 1,

        local: true,

        externalApi: false,
      },
    });
  }

  /* =======================================================
     Local Customization

     avatar_config is stored by avatarController.
     ======================================================= */

  async updateCustomization(
    _providerAvatarId,
    config = {},
    options = {},
  ) {
    return {
      config:
        this.ensureObject(config),

      metadata: {
        ...this.ensureObject(
          options.metadata,
        ),

        engine:
          PROVIDERS.FASHION_PERSONA_2D,

        local: true,
      },
    };
  }

  /* =======================================================
     Local Configuration Retrieval
     ======================================================= */

  async getCustomization(
    _providerAvatarId,
    options = {},
  ) {
    return {
      config:
        this.ensureObject(
          options.config,
        ),

      metadata: {
        engine:
          PROVIDERS.FASHION_PERSONA_2D,

        local: true,
      },
    };
  }

  /* =======================================================
     Local Avatar Status
     ======================================================= */

  async getStatus() {
    return {
      provider: this.name,

      status: "ready",

      ready: true,

      processing: false,

      failed: false,

      metadata: {
        local: true,
      },
    };
  }
}

/* =========================================================
   Provider Cache
   ========================================================= */

const providerCache =
  new Map();

/* =========================================================
   Internal3D Class Cache

   Internal3DProvider.js will be created next.

   Lazy loading is intentional.

   It means deleting AvaturnProvider.js does NOT prevent
   Node from starting before Internal3DProvider.js exists.
   ========================================================= */

let Internal3DProviderClass =
  null;

/* =========================================================
   General Helpers
   ========================================================= */

function cleanText(
  value,
  fallback = "",
) {
  const text = String(
    value ?? "",
  )
    .trim()
    .toLowerCase();

  return text || fallback;
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

/* =========================================================
   Normalize Provider / Engine Name
   ========================================================= */

function normalizeProviderName(
  value,
  fallback = DEFAULT_PROVIDER,
) {
  const raw =
    cleanText(value);

  if (!raw) {
    return fallback;
  }

  const normalized =
    raw
      .replace(/\s+/g, "_");

  return (
    PROVIDER_ALIASES[
      normalized
    ] ||
    normalized
  );
}

/* =========================================================
   Database Engine Validation
   ========================================================= */

function isDatabaseSupportedEngine(
  providerName,
) {
  const normalized =
    normalizeProviderName(
      providerName,
    );

  return DATABASE_ENGINE_NAMES.includes(
    normalized,
  );
}

/* =========================================================
   Active Runtime Provider Check

   Avaturn intentionally returns false.
   ========================================================= */

function isProviderSupported(
  providerName,
) {
  const normalized =
    normalizeProviderName(
      providerName,
    );

  return ACTIVE_PROVIDER_NAMES.includes(
    normalized,
  );
}

/* =========================================================
   Retired Provider Check
   ========================================================= */

function isRetiredProvider(
  providerName,
) {
  return (
    normalizeProviderName(
      providerName,
    ) ===
    PROVIDERS.AVATURN
  );
}

/* =========================================================
   Load Internal3D Provider

   The require happens here rather than at module startup.

   Once this file exists:

       services/avatar/Internal3DProvider.js

   this method will load it automatically.
   ========================================================= */

function loadInternal3DProvider() {
  if (
    Internal3DProviderClass
  ) {
    return Internal3DProviderClass;
  }

  try {
    // eslint-disable-next-line global-require
    Internal3DProviderClass =
      require("./Internal3DProvider");

    if (
      typeof Internal3DProviderClass !==
      "function"
    ) {
      Internal3DProviderClass =
        null;

      throw createFactoryError(
        "Internal3DProvider must export a provider class.",
        {
          code:
            "INTERNAL_3D_PROVIDER_INVALID",

          status: 500,

          provider:
            PROVIDERS.INTERNAL_3D,
        },
      );
    }

    return Internal3DProviderClass;
  } catch (error) {
    /*
     * Preserve our own factory errors.
     */

    if (
      error?.name ===
      "AvatarProviderFactoryError"
    ) {
      throw error;
    }

    /*
     * Internal3DProvider has not yet been created.
     */

    if (
      error?.code ===
        "MODULE_NOT_FOUND" &&
      String(
        error?.message || "",
      ).includes(
        "Internal3DProvider",
      )
    ) {
      throw createFactoryError(
        "The DesignByYou Internal3D engine has not been installed yet.",
        {
          code:
            "INTERNAL_3D_PROVIDER_NOT_INSTALLED",

          status: 501,

          provider:
            PROVIDERS.INTERNAL_3D,

          cause: error,
        },
      );
    }

    /*
     * Internal3DProvider exists but failed while loading.
     */

    throw createFactoryError(
      "The DesignByYou Internal3D engine could not be loaded.",
      {
        code:
          "INTERNAL_3D_PROVIDER_LOAD_FAILED",

        status: 500,

        provider:
          PROVIDERS.INTERNAL_3D,

        cause: error,
      },
    );
  }
}

/* =========================================================
   Get Default Provider

   Example .env later:

       AVATAR_DEFAULT_PROVIDER=internal_3d

   For now, if the env value is unsupported or still says
   "avaturn", safely fall back to Fashion Persona 2D.
   ========================================================= */

function getDefaultProviderName() {
  const configured =
    normalizeProviderName(
      process.env
        .AVATAR_DEFAULT_PROVIDER ||
        DEFAULT_PROVIDER,
    );

  if (
    ACTIVE_PROVIDER_NAMES.includes(
      configured,
    )
  ) {
    return configured;
  }

  return DEFAULT_PROVIDER;
}

/* =========================================================
   Provider Implemented Check

   Internal3D returns false until Internal3DProvider.js
   exists and can be loaded.
   ========================================================= */

function isProviderImplemented(
  providerName,
) {
  const normalized =
    normalizeProviderName(
      providerName,
    );

  if (
    normalized ===
    PROVIDERS.FASHION_PERSONA_2D
  ) {
    return true;
  }

  if (
    normalized ===
    PROVIDERS.INTERNAL_3D
  ) {
    try {
      loadInternal3DProvider();

      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/* =========================================================
   Create Provider

   This function always creates a fresh provider instance.
   ========================================================= */

function createAvatarProvider(
  providerName,
  options = {},
) {
  const normalized =
    normalizeProviderName(
      providerName,
      getDefaultProviderName(),
    );

  const safeOptions =
    isPlainObject(options)
      ? options
      : {};

  /* =======================================================
     Fashion Persona 2D
     ======================================================= */

  if (
    normalized ===
    PROVIDERS.FASHION_PERSONA_2D
  ) {
    return new FashionPersona2DProvider(
      safeOptions,
    );
  }

  /* =======================================================
     DesignByYou Internal3D
     ======================================================= */

  if (
    normalized ===
    PROVIDERS.INTERNAL_3D
  ) {
    const Internal3DProvider =
      loadInternal3DProvider();

    return new Internal3DProvider(
      safeOptions,
    );
  }

  /* =======================================================
     Retired Avaturn Engine

     This produces a clear error instead of:

         Cannot find module "./AvaturnProvider"
     ======================================================= */

  if (
    normalized ===
    PROVIDERS.AVATURN
  ) {
    throw createFactoryError(
      "Avaturn is no longer an active DesignByYou avatar engine.",
      {
        code:
          "AVATAR_PROVIDER_RETIRED",

        status: 410,

        provider:
          PROVIDERS.AVATURN,

        details: {
          replacement:
            PROVIDERS.INTERNAL_3D,
        },
      },
    );
  }

  /* =======================================================
     Unknown Provider
     ======================================================= */

  throw createFactoryError(
    `Unsupported avatar engine: ${normalized}`,
    {
      code:
        "AVATAR_PROVIDER_UNSUPPORTED",

      status: 400,

      provider:
        normalized,

      details: {
        supported:
          getActiveProviderNames(),
      },
    },
  );
}

/* =========================================================
   Get Avatar Provider

   Main provider resolver.

   Default instances are cached.

   Custom options bypass cache.
   ========================================================= */

function getAvatarProvider(
  providerName,
  options = {},
) {
  const normalized =
    normalizeProviderName(
      providerName,
      getDefaultProviderName(),
    );

  const safeOptions =
    isPlainObject(options)
      ? options
      : {};

  /* -------------------------------------------------------
     Custom configuration

     Do not cache because options may contain test-specific
     or engine-specific configuration.
     ------------------------------------------------------- */

  if (
    Object.keys(
      safeOptions,
    ).length > 0
  ) {
    return createAvatarProvider(
      normalized,
      safeOptions,
    );
  }

  /* -------------------------------------------------------
     Cached instance
     ------------------------------------------------------- */

  if (
    providerCache.has(
      normalized,
    )
  ) {
    return providerCache.get(
      normalized,
    );
  }

  const provider =
    createAvatarProvider(
      normalized,
    );

  providerCache.set(
    normalized,
    provider,
  );

  return provider;
}

/* =========================================================
   Get Provider From Avatar Row

   Supports:

       avatar.avatar_engine

   and:

       avatar.avatarEngine
   ========================================================= */

function getProviderForAvatar(
  avatar,
  options = {},
) {
  const record =
    isPlainObject(avatar)
      ? avatar
      : {};

  const engine =
    record.avatar_engine ||
    record.avatarEngine ||
    getDefaultProviderName();

  return getAvatarProvider(
    engine,
    options,
  );
}

/* =========================================================
   Require Configured Provider

   Internal engines generally return true because they do
   not rely on third-party credentials.
   ========================================================= */

function requireConfiguredProvider(
  providerName,
  options = {},
) {
  const provider =
    getAvatarProvider(
      providerName,
      options,
    );

  if (
    typeof provider
      .isConfigured ===
      "function" &&
    !provider.isConfigured()
  ) {
    throw createFactoryError(
      `Avatar engine "${provider.name}" is not configured.`,
      {
        code:
          "AVATAR_PROVIDER_NOT_CONFIGURED",

        status: 503,

        provider:
          provider.name,
      },
    );
  }

  return provider;
}

/* =========================================================
   Provider Capabilities
   ========================================================= */

function getProviderCapabilities(
  providerName,
) {
  const normalized =
    normalizeProviderName(
      providerName,
    );

  if (
    normalized ===
    PROVIDERS.AVATURN
  ) {
    return {
      provider:
        PROVIDERS.AVATURN,

      configured: false,

      active: false,

      retired: true,

      capabilities: {},
    };
  }

  try {
    const provider =
      getAvatarProvider(
        normalized,
      );

    return {
      provider:
        provider.name,

      configured:
        typeof provider
          .isConfigured ===
        "function"
          ? provider.isConfigured()
          : true,

      active: true,

      retired: false,

      capabilities:
        provider.capabilities ||
        {},
    };
  } catch (error) {
    return {
      provider:
        normalized,

      configured: false,

      active:
        isProviderSupported(
          normalized,
        ),

      retired:
        isRetiredProvider(
          normalized,
        ),

      capabilities: {},

      error:
        error?.message ||
        "Avatar engine unavailable.",

      code:
        error?.code ||
        null,
    };
  }
}

/* =========================================================
   Active Providers

   These are the engines Avatar Studio should display.
   ========================================================= */

function getActiveProviderNames() {
  return [
    ...ACTIVE_PROVIDER_NAMES,
  ];
}

/* =========================================================
   Implemented Provider Names

   Kept for backwards compatibility with existing code.

   Internal3D is considered part of the active architecture,
   even while the provider file is being created.
   ========================================================= */

function getImplementedProviderNames() {
  return getActiveProviderNames();
}

/* =========================================================
   Database-Supported Engines

   Avaturn remains here only because the existing database
   constraint may still allow it.
   ========================================================= */

function getDatabaseSupportedEngineNames() {
  return [
    ...DATABASE_ENGINE_NAMES,
  ];
}

/* =========================================================
   Describe Providers

   Used by:

       GET /api/v1/avatar/providers

   Only ACTIVE engines are returned.

   Avaturn is deliberately excluded from Avatar Studio.
   ========================================================= */

function describeProviders() {
  return getActiveProviderNames().map(
    (name) => {
      try {
        const provider =
          getAvatarProvider(
            name,
          );

        return {
          name:
            provider.name,

          configured:
            typeof provider
              .isConfigured ===
              "function"
              ? provider.isConfigured()
              : true,

          active: true,

          ownedByDesignByYou:
            true,

          capabilities:
            provider.capabilities ||
            {},
        };
      } catch (error) {
        return {
          name,

          configured: false,

          active: true,

          ownedByDesignByYou:
            true,

          capabilities: {},

          error:
            error?.message ||
            "Avatar engine unavailable.",

          code:
            error?.code ||
            null,
        };
      }
    },
  );
}

/* =========================================================
   Clear Provider Cache
   ========================================================= */

function clearProviderCache() {
  providerCache.clear();

  Internal3DProviderClass =
    null;
}

/* =========================================================
   Factory Error
   ========================================================= */

function createFactoryError(
  message,
  {
    code =
      "AVATAR_PROVIDER_FACTORY_ERROR",

    status = 500,

    provider = null,

    details = null,

    cause = null,
  } = {},
) {
  const error =
    new Error(
      String(
        message ||
          "Avatar provider factory error.",
      ),
    );

  error.name =
    "AvatarProviderFactoryError";

  error.code =
    String(
      code ||
        "AVATAR_PROVIDER_FACTORY_ERROR",
    );

  const numericStatus =
    Number(status);

  error.status =
    Number.isInteger(
      numericStatus,
    ) &&
    numericStatus >= 400 &&
    numericStatus <= 599
      ? numericStatus
      : 500;

  error.statusCode =
    error.status;

  error.provider =
    provider
      ? String(provider)
      : null;

  if (
    details !== null &&
    details !== undefined
  ) {
    error.details =
      details;
  }

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}

/* =========================================================
   Exports
   ========================================================= */

module.exports = {
  /* -------------------------------------------------------
     Constants
     ------------------------------------------------------- */

  PROVIDERS,

  DEFAULT_PROVIDER,

  ACTIVE_PROVIDER_NAMES,

  DATABASE_ENGINE_NAMES,

  /* -------------------------------------------------------
     Local Provider
     ------------------------------------------------------- */

  FashionPersona2DProvider,

  /* -------------------------------------------------------
     Main Factory
     ------------------------------------------------------- */

  getAvatarProvider,

  createAvatarProvider,

  getProviderForAvatar,

  requireConfiguredProvider,

  /* -------------------------------------------------------
     Engine Information
     ------------------------------------------------------- */

  normalizeProviderName,

  getDefaultProviderName,

  isProviderSupported,

  isProviderImplemented,

  isRetiredProvider,

  isDatabaseSupportedEngine,

  getProviderCapabilities,

  getActiveProviderNames,

  getImplementedProviderNames,

  getDatabaseSupportedEngineNames,

  describeProviders,

  /* -------------------------------------------------------
     Utilities
     ------------------------------------------------------- */

  clearProviderCache,

  createFactoryError,
};