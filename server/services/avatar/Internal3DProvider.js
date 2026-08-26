"use strict";

const AvatarProvider = require("./AvatarProvider");

/* =========================================================
   DesignByYou
   Internal 3D Avatar Provider
   Version 1.0

   PURPOSE
   ---------------------------------------------------------
   Local provider for the DesignByYou-owned 3D avatar engine.

   This provider:
   - does NOT call an external API
   - does NOT require API credentials
   - stores customization as JSON
   - uses one shared rigged GLB base model
   - uses morph targets for face/body customization
   - supports modular hair, clothing and accessories

   PostgreSQL persistence remains inside avatarController.js.
   Three.js rendering remains inside the frontend.
   ========================================================= */

/* =========================================================
   Engine Constants
   ========================================================= */

const ENGINE_NAME =
  "internal_3d";

const ENGINE_VERSION =
  1;

const RIG_VERSION =
  1;

const CONFIG_SCHEMA_VERSION =
  1;

/* =========================================================
   Shared Base Model

   Later our frontend will contain:

   public/
   └── avatars/
       └── internal3d/
           └── base/
               └── human-base.glb

   All users can share this same model.

   Their individual appearance lives in avatar_config.
   ========================================================= */

const DEFAULT_BASE_MODEL_URL =
  process.env.INTERNAL3D_BASE_MODEL_URL ||
  "/avatars/internal3d/base/human-base.glb";

/* =========================================================
   Validation
   ========================================================= */

const ASSET_ID_PATTERN =
  /^[a-z0-9][a-z0-9_-]{0,79}$/i;

const HEX_COLOR_PATTERN =
  /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/* =========================================================
   Supported Face Morph Parameters

   Every value uses:

       0.0 → minimum
       0.5 → neutral/default
       1.0 → maximum

   These will eventually map to GLB morph targets.
   ========================================================= */

const FACE_KEYS =
  Object.freeze([
    "faceWidth",

    "faceHeight",

    "jawWidth",

    "jawShape",

    "cheekVolume",

    "chinWidth",

    "chinLength",

    "eyeSize",

    "eyeSpacing",

    "eyeHeight",

    "eyeTilt",

    "noseWidth",

    "noseLength",

    "noseBridge",

    "mouthWidth",

    "upperLip",

    "lowerLip",
  ]);

/* =========================================================
   Supported Body Morph Parameters
   ========================================================= */

const BODY_KEYS =
  Object.freeze([
    "frame",

    "height",

    "shoulderWidth",

    "chest",

    "waist",

    "hips",

    "muscularity",

    "armLength",

    "legLength",
  ]);

/* =========================================================
   Default Internal3D Configuration

   This becomes the starting human.

   Avatar Studio will modify these values.
   ========================================================= */

const DEFAULT_INTERNAL3D_CONFIG =
  Object.freeze({
    engineVersion:
      ENGINE_VERSION,

    schemaVersion:
      CONFIG_SCHEMA_VERSION,

    /* -----------------------------------------------------
       Face
       ----------------------------------------------------- */

    face:
      Object.freeze({
        faceWidth: 0.5,

        faceHeight: 0.5,

        jawWidth: 0.5,

        jawShape: 0.5,

        cheekVolume: 0.5,

        chinWidth: 0.5,

        chinLength: 0.5,

        eyeSize: 0.5,

        eyeSpacing: 0.5,

        eyeHeight: 0.5,

        eyeTilt: 0.5,

        noseWidth: 0.5,

        noseLength: 0.5,

        noseBridge: 0.5,

        mouthWidth: 0.5,

        upperLip: 0.5,

        lowerLip: 0.5,
      }),

    /* -----------------------------------------------------
       Body
       ----------------------------------------------------- */

    body:
      Object.freeze({
        frame: 0.5,

        height: 0.5,

        shoulderWidth: 0.5,

        chest: 0.5,

        waist: 0.5,

        hips: 0.5,

        muscularity: 0.25,

        armLength: 0.5,

        legLength: 0.5,
      }),

    /* -----------------------------------------------------
       Appearance
       ----------------------------------------------------- */

    appearance:
      Object.freeze({
        skinTone:
          "#B98263",

        eyeColor:
          "#432918",

        hairColor:
          "#17120F",
      }),

    /* -----------------------------------------------------
       Hair
       ----------------------------------------------------- */

    hair:
      Object.freeze({
        asset: null,
      }),

    /* -----------------------------------------------------
       Outfit
       ----------------------------------------------------- */

    outfit:
      Object.freeze({
        top: null,

        bottom: null,

        outerwear: null,

        shoes: null,
      }),

    /* -----------------------------------------------------
       Accessories
       ----------------------------------------------------- */

    accessories:
      Object.freeze({
        glasses: null,

        headwear: null,

        earrings: null,

        necklace: null,
      }),

    /* -----------------------------------------------------
       Expression + Animation
       ----------------------------------------------------- */

    expression:
      "neutral",

    animation:
      "idle",
  });

/* =========================================================
   General Helpers
   ========================================================= */

function isPlainObject(
  value,
) {
  return Boolean(
    value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value,
      ) &&
      Object.getPrototypeOf(
        value,
      ) ===
        Object.prototype,
  );
}

/* =========================================================
   Clone Default Config

   We never directly mutate DEFAULT_INTERNAL3D_CONFIG.
   ========================================================= */

function cloneDefaultConfig() {
  return {
    engineVersion:
      DEFAULT_INTERNAL3D_CONFIG
        .engineVersion,

    schemaVersion:
      DEFAULT_INTERNAL3D_CONFIG
        .schemaVersion,

    face: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .face,
    },

    body: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .body,
    },

    appearance: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .appearance,
    },

    hair: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .hair,
    },

    outfit: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .outfit,
    },

    accessories: {
      ...DEFAULT_INTERNAL3D_CONFIG
        .accessories,
    },

    expression:
      DEFAULT_INTERNAL3D_CONFIG
        .expression,

    animation:
      DEFAULT_INTERNAL3D_CONFIG
        .animation,
  };
}

/* =========================================================
   Internal3D Provider
   ========================================================= */

class Internal3DProvider extends AvatarProvider {
  constructor(
    options = {},
  ) {
    super(options);

    /* -----------------------------------------------------
       Shared GLB model
       ----------------------------------------------------- */

    this.baseModelUrl =
      this.cleanString(
        options.baseModelUrl,
      ) ||
      this.cleanString(
        process.env
          .INTERNAL3D_BASE_MODEL_URL,
      ) ||
      DEFAULT_BASE_MODEL_URL;

    this.engineVersion =
      ENGINE_VERSION;

    this.rigVersion =
      RIG_VERSION;

    this.configSchemaVersion =
      CONFIG_SCHEMA_VERSION;
  }

  /* =======================================================
     Provider Identity
     ======================================================= */

  get name() {
    return ENGINE_NAME;
  }

  /* =======================================================
     Capabilities

     These tell Avatar Studio what this engine currently
     supports.

     Photo analysis, server-side preview generation and
     per-user GLB export will be added later.
     ======================================================= */

  get capabilities() {
    return {
      /* Creation */

      createFromPhoto:
        false,

      createFromMultiplePhotos:
        false,

      createManual:
        true,

      /* Customization */

      customization:
        true,

      bodyCustomization:
        true,

      faceCustomization:
        true,

      hairCustomization:
        true,

      clothingCustomization:
        true,

      accessoriesCustomization:
        true,

      /* Export */

      modelExportGlb:
        false,

      modelExportVrm:
        false,

      /* Preview */

      previewGeneration:
        false,

      /* Animation */

      animation:
        true,

      /* External-provider features */

      providerSessions:
        false,

      webhooks:
        false,

      externalApi:
        false,

      /* DesignByYou-specific */

      ownedByDesignByYou:
        true,

      engineType:
        "3d",

      sharedBaseModel:
        true,

      morphTargets:
        true,

      modularAssets:
        true,

      photoAnalysisPlanned:
        true,
    };
  }

  /* =======================================================
     Local Engine Configuration

     No external token/API key is required.

     The engine is considered configured when it has a
     base-model path.
     ======================================================= */

  isConfigured() {
    return Boolean(
      this.baseModelUrl,
    );
  }

  /* =======================================================
     CREATE MANUAL AVATAR

     Called when a user creates/customizes an Internal3D
     avatar manually.

     Example:

       provider.createManual({
         userId,
         config
       });

     No individual GLB is generated.

     modelGlbUrl points to the SHARED human-base.glb.
     ======================================================= */

  async createManual(
    options = {},
  ) {
    const context =
      this.validateCreationContext(
        options,
      );

    const config =
      this.normalizeConfig(
        context.config ||
          {},
      );

    return this.normalizeAvatarResult({
      provider:
        this.name,

      /*
       * Internal3D is local.
       *
       * There is no third-party provider user/avatar ID.
       */

      providerUserId:
        null,

      providerAvatarId:
        null,

      status:
        "ready",

      modelGlbUrl:
        this.baseModelUrl,

      modelVrmUrl:
        null,

      previewUrl:
        null,

      config,

      metadata: {
        ...this.ensureObject(
          context.metadata,
        ),

        engine:
          this.name,

        engineVersion:
          this.engineVersion,

        rigVersion:
          this.rigVersion,

        configSchemaVersion:
          this
            .configSchemaVersion,

        baseModelUrl:
          this.baseModelUrl,

        sharedBaseModel:
          true,

        local:
          true,

        externalApi:
          false,
      },
    });
  }

  /* =======================================================
     PHOTO CREATION

     Phase 2.

     Later this will use MediaPipe / face landmarks to
     produce Internal3D face morph values.

     We deliberately fail clearly for now rather than
     pretending photo analysis exists.
     ======================================================= */

  async createFromPhoto() {
    throw this.createProviderError(
      "Photo-based Internal3D face analysis has not been enabled yet.",
      {
        code:
          "INTERNAL_3D_PHOTO_ANALYSIS_NOT_READY",

        status:
          501,
      },
    );
  }

  /* =======================================================
     MULTIPLE PHOTOS

     Internal3D will initially use one selfie, so this
     follows the single-photo implementation.
     ======================================================= */

  async createFromPhotos() {
    return this.createFromPhoto();
  }

  /* =======================================================
     PROVIDER SESSION

     Internal3D does NOT need an embedded external avatar
     editor.

     DesignByYou Avatar Studio is the editor.
     ======================================================= */

  async createSession() {
    throw this.createProviderError(
      "Internal3D does not use external provider sessions. Use DesignByYou Avatar Studio instead.",
      {
        code:
          "INTERNAL_3D_SESSION_NOT_REQUIRED",

        status:
          409,
      },
    );
  }

  /* =======================================================
     GET AVATAR

     Because there is no remote avatar resource, the caller
     supplies its stored avatar_config.

     Example:

       provider.getAvatar(null, {
         config: dbAvatar.avatar_config
       });
     ======================================================= */

  async getAvatar(
    _providerAvatarId,
    options = {},
  ) {
    const config =
      this.normalizeConfig(
        options.config ||
          {},
      );

    return this.normalizeAvatarResult({
      provider:
        this.name,

      providerUserId:
        null,

      providerAvatarId:
        null,

      status:
        "ready",

      modelGlbUrl:
        this.baseModelUrl,

      modelVrmUrl:
        null,

      previewUrl:
        options.previewUrl ||
        null,

      config,

      metadata: {
        ...this.ensureObject(
          options.metadata,
        ),

        engine:
          this.name,

        engineVersion:
          this.engineVersion,

        rigVersion:
          this.rigVersion,

        configSchemaVersion:
          this
            .configSchemaVersion,

        baseModelUrl:
          this.baseModelUrl,

        sharedBaseModel:
          true,

        local:
          true,
      },
    });
  }

  /* =======================================================
     GET STATUS

     Internal3D has no asynchronous cloud generation during
     manual avatar creation.

     Therefore manual avatars are immediately ready.
     ======================================================= */

  async getStatus() {
    return {
      provider:
        this.name,

      status:
        "ready",

      ready:
        true,

      processing:
        false,

      failed:
        false,

      metadata: {
        engine:
          this.name,

        engineVersion:
          this.engineVersion,

        rigVersion:
          this.rigVersion,

        baseModelUrl:
          this.baseModelUrl,

        local:
          true,
      },
    };
  }

  /* =======================================================
     GET CUSTOMIZATION
     ======================================================= */

  async getCustomization(
    _providerAvatarId,
    options = {},
  ) {
    return {
      provider:
        this.name,

      config:
        this.normalizeConfig(
          options.config ||
            {},
        ),

      metadata: {
        engine:
          this.name,

        engineVersion:
          this.engineVersion,

        configSchemaVersion:
          this
            .configSchemaVersion,

        local:
          true,
      },
    };
  }

  /* =======================================================
     UPDATE CUSTOMIZATION

     Supports:

       replace = false
           merge patch into existing avatar

       replace = true
           create config from defaults + supplied config
     ======================================================= */

  async updateCustomization(
    _providerAvatarId,
    config = {},
    options = {},
  ) {
    const currentConfig =
      isPlainObject(
        options.currentConfig,
      )
        ? options.currentConfig
        : {};

    const replace =
      options.replace ===
      true;

    const nextConfig =
      replace
        ? this.normalizeConfig(
            config,
          )
        : this.mergeConfig(
            currentConfig,
            config,
          );

    return {
      provider:
        this.name,

      config:
        nextConfig,

      status:
        "ready",

      metadata: {
        ...this.ensureObject(
          options.metadata,
        ),

        engine:
          this.name,

        engineVersion:
          this.engineVersion,

        configSchemaVersion:
          this
            .configSchemaVersion,

        local:
          true,
      },
    };
  }

  /* =======================================================
     CUSTOMIZATION ASSET CATALOG

     We have not created our actual asset library yet.

     Later this can return entries like:

       hair_wavy_01
       hoodie_01
       trousers_01
       sneaker_01

     without changing Avatar Studio's provider interface.
     ======================================================= */

  async getCustomizationAssets() {
    return {
      provider:
        this.name,

      baseModelUrl:
        this.baseModelUrl,

      assets: {
        hair: [],

        tops: [],

        bottoms: [],

        outerwear: [],

        shoes: [],

        glasses: [],

        headwear: [],

        earrings: [],

        necklaces: [],
      },

      metadata: {
        engineVersion:
          this.engineVersion,

        rigVersion:
          this.rigVersion,

        catalogReady:
          false,
      },
    };
  }

  /* =======================================================
     MODEL EXPORT

     Internal3D currently works like:

       shared GLB
           +
       avatar_config

     We are NOT creating one duplicated GLB per user yet.

     Later we can implement an export/bake pipeline.
     ======================================================= */

  async exportModel() {
    throw this.createProviderError(
      "Per-user GLB export is not enabled for Internal3D yet. Internal3D currently uses one shared base GLB plus avatar configuration.",
      {
        code:
          "INTERNAL_3D_EXPORT_NOT_READY",

        status:
          501,
      },
    );
  }

  /* =======================================================
     PREVIEW GENERATION

     Initially the browser will render the avatar using
     Three.js.

     Later we can capture a portrait and upload it into:

       avatar_preview_url
     ======================================================= */

  async generatePreview() {
    throw this.createProviderError(
      "Server-side Internal3D portrait generation has not been enabled yet.",
      {
        code:
          "INTERNAL_3D_PREVIEW_NOT_READY",

        status:
          501,
      },
    );
  }

  /* =======================================================
     DELETE

     No third-party avatar exists to delete.

     Database deletion/reset stays in avatarController.
     ======================================================= */

  async deleteAvatar() {
    return {
      provider:
        this.name,

      deleted:
        true,

      remoteDeleteRequired:
        false,

      metadata: {
        local:
          true,
      },
    };
  }

  /* =======================================================
     WEBHOOKS

     Internal3D has no external provider.
     ======================================================= */

  async verifyWebhook() {
    return false;
  }

  async parseWebhook() {
    throw this.createProviderError(
      "Internal3D does not use provider webhooks.",
      {
        code:
          "INTERNAL_3D_WEBHOOK_NOT_SUPPORTED",

        status:
          405,
      },
    );
  }

  /* =======================================================
     NORMALIZE COMPLETE INTERNAL3D CONFIG

     Unknown top-level properties are deliberately ignored.

     Only known, validated Internal3D values become part of
     the canonical configuration.
     ======================================================= */

  normalizeConfig(
    input = {},
  ) {
    if (
      !isPlainObject(
        input,
      )
    ) {
      throw this.createProviderError(
        "Internal3D avatar configuration must be a JSON object.",
        {
          code:
            "INTERNAL_3D_CONFIG_INVALID",

          status:
            400,
        },
      );
    }

    const output =
      cloneDefaultConfig();

    /* -----------------------------------------------------
       Engine Version
       ----------------------------------------------------- */

    if (
      input.engineVersion !==
      undefined
    ) {
      const engineVersion =
        Number(
          input.engineVersion,
        );

      if (
        !Number.isInteger(
          engineVersion,
        ) ||
        engineVersion <
          1
      ) {
        throw this.createProviderError(
          "engineVersion must be a positive integer.",
          {
            code:
              "INTERNAL_3D_ENGINE_VERSION_INVALID",

            status:
              400,
          },
        );
      }

      output.engineVersion =
        engineVersion;
    }

    /* -----------------------------------------------------
       Schema Version
       ----------------------------------------------------- */

    if (
      input.schemaVersion !==
      undefined
    ) {
      const schemaVersion =
        Number(
          input.schemaVersion,
        );

      if (
        !Number.isInteger(
          schemaVersion,
        ) ||
        schemaVersion <
          1
      ) {
        throw this.createProviderError(
          "schemaVersion must be a positive integer.",
          {
            code:
              "INTERNAL_3D_SCHEMA_VERSION_INVALID",

            status:
              400,
          },
        );
      }

      output.schemaVersion =
        schemaVersion;
    }

    /* -----------------------------------------------------
       Face
       ----------------------------------------------------- */

    if (
      input.face !==
      undefined
    ) {
      output.face =
        this.normalizeSliderGroup(
          input.face,

          FACE_KEYS,

          output.face,

          "face",
        );
    }

    /* -----------------------------------------------------
       Body
       ----------------------------------------------------- */

    if (
      input.body !==
      undefined
    ) {
      output.body =
        this.normalizeSliderGroup(
          input.body,

          BODY_KEYS,

          output.body,

          "body",
        );
    }

    /* -----------------------------------------------------
       Appearance
       ----------------------------------------------------- */

    if (
      input.appearance !==
      undefined
    ) {
      if (
        !isPlainObject(
          input.appearance,
        )
      ) {
        throw this.createProviderError(
          "appearance must be a JSON object.",
          {
            code:
              "INTERNAL_3D_APPEARANCE_INVALID",

            status:
              400,
          },
        );
      }

      output.appearance = {
        skinTone:
          this.normalizeColor(
            input
              .appearance
              .skinTone,

            output
              .appearance
              .skinTone,

            "appearance.skinTone",
          ),

        eyeColor:
          this.normalizeColor(
            input
              .appearance
              .eyeColor,

            output
              .appearance
              .eyeColor,

            "appearance.eyeColor",
          ),

        hairColor:
          this.normalizeColor(
            input
              .appearance
              .hairColor,

            output
              .appearance
              .hairColor,

            "appearance.hairColor",
          ),
      };
    }

    /* -----------------------------------------------------
       Hair
       ----------------------------------------------------- */

    if (
      input.hair !==
      undefined
    ) {
      if (
        !isPlainObject(
          input.hair,
        )
      ) {
        throw this.createProviderError(
          "hair must be a JSON object.",
          {
            code:
              "INTERNAL_3D_HAIR_INVALID",

            status:
              400,
          },
        );
      }

      output.hair = {
        asset:
          this.normalizeAssetId(
            input
              .hair
              .asset,

            output
              .hair
              .asset,

            "hair.asset",
          ),
      };
    }

    /* -----------------------------------------------------
       Outfit
       ----------------------------------------------------- */

    if (
      input.outfit !==
      undefined
    ) {
      if (
        !isPlainObject(
          input.outfit,
        )
      ) {
        throw this.createProviderError(
          "outfit must be a JSON object.",
          {
            code:
              "INTERNAL_3D_OUTFIT_INVALID",

            status:
              400,
          },
        );
      }

      output.outfit = {
        top:
          this.normalizeAssetId(
            input
              .outfit
              .top,

            output
              .outfit
              .top,

            "outfit.top",
          ),

        bottom:
          this.normalizeAssetId(
            input
              .outfit
              .bottom,

            output
              .outfit
              .bottom,

            "outfit.bottom",
          ),

        outerwear:
          this.normalizeAssetId(
            input
              .outfit
              .outerwear,

            output
              .outfit
              .outerwear,

            "outfit.outerwear",
          ),

        shoes:
          this.normalizeAssetId(
            input
              .outfit
              .shoes,

            output
              .outfit
              .shoes,

            "outfit.shoes",
          ),
      };
    }

    /* -----------------------------------------------------
       Accessories
       ----------------------------------------------------- */

    if (
      input.accessories !==
      undefined
    ) {
      if (
        !isPlainObject(
          input.accessories,
        )
      ) {
        throw this.createProviderError(
          "accessories must be a JSON object.",
          {
            code:
              "INTERNAL_3D_ACCESSORIES_INVALID",

            status:
              400,
          },
        );
      }

      output.accessories = {
        glasses:
          this.normalizeAssetId(
            input
              .accessories
              .glasses,

            output
              .accessories
              .glasses,

            "accessories.glasses",
          ),

        headwear:
          this.normalizeAssetId(
            input
              .accessories
              .headwear,

            output
              .accessories
              .headwear,

            "accessories.headwear",
          ),

        earrings:
          this.normalizeAssetId(
            input
              .accessories
              .earrings,

            output
              .accessories
              .earrings,

            "accessories.earrings",
          ),

        necklace:
          this.normalizeAssetId(
            input
              .accessories
              .necklace,

            output
              .accessories
              .necklace,

            "accessories.necklace",
          ),
      };
    }

    /* -----------------------------------------------------
       Expression
       ----------------------------------------------------- */

    if (
      input.expression !==
      undefined
    ) {
      output.expression =
        this.normalizeSimpleToken(
          input.expression,

          output.expression,

          "expression",
        );
    }

    /* -----------------------------------------------------
       Animation
       ----------------------------------------------------- */

    if (
      input.animation !==
      undefined
    ) {
      output.animation =
        this.normalizeSimpleToken(
          input.animation,

          output.animation,

          "animation",
        );
    }

    return output;
  }

  /* =======================================================
     MERGE CONFIGURATION

     Deep merges known sections so changing hair doesn't
     accidentally reset the user's face/body.
     ======================================================= */

  mergeConfig(
    currentConfig = {},
    patch = {},
  ) {
    if (
      !isPlainObject(
        currentConfig,
      )
    ) {
      currentConfig = {};
    }

    if (
      !isPlainObject(
        patch,
      )
    ) {
      throw this.createProviderError(
        "Internal3D avatar configuration patch must be a JSON object.",
        {
          code:
            "INTERNAL_3D_CONFIG_PATCH_INVALID",

          status:
            400,
        },
      );
    }

    const current =
      this.normalizeConfig(
        currentConfig,
      );

    const merged = {
      ...current,

      ...patch,

      face: {
        ...current.face,

        ...(isPlainObject(
          patch.face,
        )
          ? patch.face
          : {}),
      },

      body: {
        ...current.body,

        ...(isPlainObject(
          patch.body,
        )
          ? patch.body
          : {}),
      },

      appearance: {
        ...current.appearance,

        ...(isPlainObject(
          patch.appearance,
        )
          ? patch.appearance
          : {}),
      },

      hair: {
        ...current.hair,

        ...(isPlainObject(
          patch.hair,
        )
          ? patch.hair
          : {}),
      },

      outfit: {
        ...current.outfit,

        ...(isPlainObject(
          patch.outfit,
        )
          ? patch.outfit
          : {}),
      },

      accessories: {
        ...current.accessories,

        ...(isPlainObject(
          patch.accessories,
        )
          ? patch.accessories
          : {}),
      },
    };

    return this.normalizeConfig(
      merged,
    );
  }

  /* =======================================================
     Slider Group Normalizer
     ======================================================= */

  normalizeSliderGroup(
    value,
    keys,
    fallback,
    label,
  ) {
    if (
      !isPlainObject(
        value,
      )
    ) {
      throw this.createProviderError(
        `${label} must be a JSON object.`,
        {
          code:
            "INTERNAL_3D_SLIDER_GROUP_INVALID",

          status:
            400,
        },
      );
    }

    const output = {
      ...fallback,
    };

    for (
      const key
      of keys
    ) {
      if (
        value[key] ===
        undefined
      ) {
        continue;
      }

      output[key] =
        this.normalizeSlider(
          value[key],

          fallback[key],

          `${label}.${key}`,
        );
    }

    return output;
  }

  /* =======================================================
     Slider Normalizer

     Every morph value must be:

       >= 0
       <= 1
     ======================================================= */

  normalizeSlider(
    value,
    fallback,
    label,
  ) {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return fallback;
    }

    const number =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        number,
      )
    ) {
      throw this.createProviderError(
        `${label} must be a number between 0 and 1.`,
        {
          code:
            "INTERNAL_3D_SLIDER_INVALID",

          status:
            400,
        },
      );
    }

    if (
      number < 0 ||
      number > 1
    ) {
      throw this.createProviderError(
        `${label} must be between 0 and 1.`,
        {
          code:
            "INTERNAL_3D_SLIDER_OUT_OF_RANGE",

          status:
            400,
        },
      );
    }

    return Number(
      number.toFixed(4),
    );
  }

  /* =======================================================
     Color Normalizer

     Accepted:

       #RRGGBB
       #RRGGBBAA
     ======================================================= */

  normalizeColor(
    value,
    fallback,
    label,
  ) {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return fallback;
    }

    const color =
      this.cleanString(
        value,
      );

    if (
      !HEX_COLOR_PATTERN.test(
        color,
      )
    ) {
      throw this.createProviderError(
        `${label} must be a hexadecimal color such as #B98263.`,
        {
          code:
            "INTERNAL_3D_COLOR_INVALID",

          status:
            400,
        },
      );
    }

    return color.toUpperCase();
  }

  /* =======================================================
     Asset ID Normalizer

     Examples:

       hair_wavy_01
       hoodie_01
       trouser_01
       sneaker_01
       glasses_round_01

     No URLs/filesystem paths are accepted here.
     ======================================================= */

  normalizeAssetId(
    value,
    fallback = null,
    label = "asset",
  ) {
    if (
      value ===
      undefined
    ) {
      return fallback;
    }

    if (
      value ===
        null ||
      value ===
        ""
    ) {
      return null;
    }

    const assetId =
      this.cleanString(
        value,
      );

    if (
      !ASSET_ID_PATTERN.test(
        assetId,
      )
    ) {
      throw this.createProviderError(
        `${label} contains an invalid asset ID.`,
        {
          code:
            "INTERNAL_3D_ASSET_ID_INVALID",

          status:
            400,
        },
      );
    }

    return assetId;
  }

  /* =======================================================
     Simple Token Normalizer

     Used by:

       expression
       animation

     Examples:

       neutral
       smile
       confident
       idle
       walking
     ======================================================= */

  normalizeSimpleToken(
    value,
    fallback,
    label,
  ) {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return fallback;
    }

    const token =
      this.cleanString(
        value,
      );

    if (
      !ASSET_ID_PATTERN.test(
        token,
      )
    ) {
      throw this.createProviderError(
        `${label} contains an invalid value.`,
        {
          code:
            "INTERNAL_3D_TOKEN_INVALID",

          status:
            400,
        },
      );
    }

    return token;
  }

  /* =======================================================
     Provider Error Helper

     AvatarProvider already exposes createProviderError in
     our shared architecture.

     The fallback below keeps this provider defensive even
     if the base implementation changes later.
     ======================================================= */

  createProviderError(
    message,
    options = {},
  ) {
    if (
      typeof super
        .createProviderError ===
      "function"
    ) {
      return super.createProviderError(
        message,
        options,
      );
    }

    const error =
      new Error(
        message,
      );

    error.name =
      "Internal3DProviderError";

    error.code =
      options.code ||
      "INTERNAL_3D_ERROR";

    error.status =
      Number(
        options.status,
      ) ||
      500;

    error.statusCode =
      error.status;

    error.provider =
      this.name;

    if (
      options.details !==
      undefined
    ) {
      error.details =
        options.details;
    }

    return error;
  }
}

/* =========================================================
   Static Metadata

   This allows other backend modules/tests to inspect the
   engine without creating separate duplicated constants.
   ========================================================= */

Internal3DProvider.ENGINE_NAME =
  ENGINE_NAME;

Internal3DProvider.ENGINE_VERSION =
  ENGINE_VERSION;

Internal3DProvider.RIG_VERSION =
  RIG_VERSION;

Internal3DProvider.CONFIG_SCHEMA_VERSION =
  CONFIG_SCHEMA_VERSION;

Internal3DProvider.DEFAULT_BASE_MODEL_URL =
  DEFAULT_BASE_MODEL_URL;

Internal3DProvider.DEFAULT_INTERNAL3D_CONFIG =
  DEFAULT_INTERNAL3D_CONFIG;

Internal3DProvider.FACE_KEYS =
  FACE_KEYS;

Internal3DProvider.BODY_KEYS =
  BODY_KEYS;

/* =========================================================
   Export
   ========================================================= */

module.exports =
  Internal3DProvider;