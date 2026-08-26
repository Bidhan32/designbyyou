"use strict";

/* =========================================================
   DesignByYou
   Avatar Provider Base Class
   Version 2.0

   PURPOSE
   ---------------------------------------------------------
   This is the provider-independent contract for every
   realistic / 3D avatar engine connected to DesignByYou.

   DesignByYou application code should NOT depend directly
   on Avaturn or any other specific provider.

   Provider implementations planned:

   - AvaturnProvider
   - Internal3DProvider
   - Future third-party providers

   This keeps these files provider-independent:

   - avatarController.js
   - avatarRoutes.js
   - AvatarStudio.jsx
   - AvatarRenderer.jsx
   - FashionPersona3D.jsx
   - ProfileIdentity.jsx

   IMPORTANT
   ---------------------------------------------------------
   This class does NOT call an external API.

   It only defines the interface every avatar provider
   should follow.
   ========================================================= */

class AvatarProvider {
  constructor(options = {}) {
    this.options = this.ensureObject(options);
  }

  /* =======================================================
     Provider Identity
     ======================================================= */

  get name() {
    return "unknown";
  }

  /* =======================================================
     Provider Capabilities

     Provider implementations can override this.

     This allows the frontend/backend to know what a
     particular avatar engine supports without hard-coding
     provider names.
     ======================================================= */

  get capabilities() {
    return {
      createFromPhoto: false,

      createFromMultiplePhotos: false,

      createManual: false,

      customization: false,

      bodyCustomization: false,

      faceCustomization: false,

      hairCustomization: false,

      clothingCustomization: false,

      accessoriesCustomization: false,

      modelExportGlb: false,

      modelExportVrm: false,

      previewGeneration: false,

      animation: false,

      providerSessions: false,

      webhooks: false,
    };
  }

  /* =======================================================
     Provider Configuration
     ======================================================= */

  isConfigured() {
    return false;
  }

  /* =======================================================
     Provider User

     Some providers maintain their own user identity.

     Expected normalized response:

     {
       providerUserId: "..."
       metadata: {}
     }
     ======================================================= */

  async createUser(_options = {}) {
    throw this.notImplemented("createUser");
  }

  /* =======================================================
     Provider Session

     Useful when a provider exposes an embedded editor or
     temporary authenticated customization session.

     Expected normalized result:

     {
       sessionId: "...",
       sessionUrl: "...",
       expiresAt: "...",
       metadata: {}
     }
     ======================================================= */

  async createSession(_options = {}) {
    throw this.notImplemented("createSession");
  }

  /* =======================================================
     Create Avatar From One Photo

     Some future providers may support a single selfie.

     Preferred input:

     {
       userId,
       providerUserId,

       photo: {
         path,
         buffer,
         mimeType,
         filename,
         size
       },

       bodyType,
       metadata
     }

     Providers requiring multiple photographs should
     override createFromPhotos() instead.

     This method remains in the contract so DesignByYou can
     support both kinds of avatar engines.
     ======================================================= */

  async createFromPhoto(_options = {}) {
    throw this.notImplemented("createFromPhoto");
  }

  /* =======================================================
     Create Avatar From Multiple Photos

     Used by providers requiring multiple face views.

     Recommended normalized input:

     {
       userId,
       providerUserId,

       photos: {
         front: {
           path,
           buffer,
           mimeType,
           filename,
           size
         },

         sideLeft: {
           path,
           buffer,
           mimeType,
           filename,
           size
         },

         sideRight: {
           path,
           buffer,
           mimeType,
           filename,
           size
         }
       },

       bodyType,

       metadata: {}
     }

     Expected normalized output:

     {
       provider: "provider_name",

       providerUserId: "...",

       providerAvatarId: "...",

       status:
         "uploading" |
         "processing" |
         "ready" |
         "failed",

       modelGlbUrl: null,

       modelVrmUrl: null,

       previewUrl: null,

       config: {},

       metadata: {}
     }
     ======================================================= */

  async createFromPhotos(_options = {}) {
    throw this.notImplemented("createFromPhotos");
  }

  /* =======================================================
     Create Avatar Manually

     Used when a provider allows avatar creation without
     face photographs.

     Example input:

     {
       userId,
       providerUserId,

       config: {
         skinTone,
         face,
         hair,
         body,
         ...
       },

       metadata: {}
     }
     ======================================================= */

  async createManual(_options = {}) {
    throw this.notImplemented("createManual");
  }

  /* =======================================================
     Get Avatar
     ======================================================= */

  async getAvatar(_providerAvatarId, _options = {}) {
    throw this.notImplemented("getAvatar");
  }

  /* =======================================================
     Get Generation Status

     Provider implementation should normalize the status
     to one of the database-supported values:

     ready
     uploading
     processing
     failed
     ======================================================= */

  async getStatus(_providerAvatarId, _options = {}) {
    throw this.notImplemented("getStatus");
  }

  /* =======================================================
     Customization Information

     Retrieve the currently selected provider-side assets
     and avatar settings.

     Example output:

     {
       face: {},
       hair: {},
       body: {},
       clothing: {},
       accessories: {},
       metadata: {}
     }
     ======================================================= */

  async getCustomization(_providerAvatarId, _options = {}) {
    throw this.notImplemented("getCustomization");
  }

  /* =======================================================
     Available Customization Assets

     Allows AvatarStudio to eventually retrieve things such
     as:

     - hairstyles
     - hair colors
     - glasses
     - outfits
     - shoes
     - accessories
     - body presets
     - face options

     without hard-coding them in DesignByYou.
     ======================================================= */

  async getCustomizationAssets(_options = {}) {
    throw this.notImplemented("getCustomizationAssets");
  }

  /* =======================================================
     Update Avatar Customization

     Example:

     {
       face: {
         ...
       },

       hair: {
         ...
       },

       body: {
         ...
       },

       clothing: {
         ...
       },

       accessories: {
         ...
       }
     }
     ======================================================= */

  async updateCustomization(_providerAvatarId, _config = {}, _options = {}) {
    throw this.notImplemented("updateCustomization");
  }

  /* =======================================================
     Export 3D Model

     Provider result should ultimately be normalized into:

     {
       glbUrl: "...",
       vrmUrl: null,
       expiresAt: null,

       metadata: {}
     }

     DesignByYou may later download and store the model in
     its own object storage instead of relying permanently
     on provider-hosted URLs.
     ======================================================= */

  async exportModel(_providerAvatarId, _options = {}) {
    throw this.notImplemented("exportModel");
  }

  /* =======================================================
     Generate Portrait / Preview

     Used for:

     - navbar
     - profile identity
     - chat
     - bookings
     - directory cards
     - notifications

     The small portrait should be stored in:

     user_avatars.avatar_preview_url

     so those interfaces do NOT need to launch Three.js.
     ======================================================= */

  async generatePreview(_providerAvatarId, _options = {}) {
    throw this.notImplemented("generatePreview");
  }

  /* =======================================================
     Delete Avatar

     Removes provider-side avatar resources when supported.

     This does NOT automatically delete the DesignByYou
     database row. That remains controller/service logic.
     ======================================================= */

  async deleteAvatar(_providerAvatarId, _options = {}) {
    throw this.notImplemented("deleteAvatar");
  }

  /* =======================================================
     Webhook Verification

     Providers supporting asynchronous generation may send:

     avatar.ready
     avatar.failed
     export.ready
     etc.

     Provider-specific signature verification belongs in
     the provider implementation, not avatarController.js.
     ======================================================= */

  async verifyWebhook(_options = {}) {
    throw this.notImplemented("verifyWebhook");
  }

  /* =======================================================
     Parse Provider Webhook

     Expected normalized output:

     {
       eventType: "avatar.ready",

       providerUserId: null,

       providerAvatarId: "...",

       status: "ready",

       modelGlbUrl: null,

       modelVrmUrl: null,

       previewUrl: null,

       metadata: {}
     }
     ======================================================= */

  async parseWebhook(_options = {}) {
    throw this.notImplemented("parseWebhook");
  }

  /* =======================================================
     Normalize Avatar Result

     EVERY provider should eventually produce this common
     structure.

     The rest of DesignByYou should work only with this
     normalized result.
     ======================================================= */

  normalizeAvatarResult(data = {}) {
    const safeData = this.ensureObject(data);

    return {
      provider: this.cleanString(safeData.provider, this.getProviderName()),

      providerUserId: this.nullableString(
        safeData.providerUserId ?? safeData.provider_user_id,
      ),

      providerAvatarId: this.nullableString(
        safeData.providerAvatarId ?? safeData.provider_avatar_id,
      ),

      status: this.normalizeStatus(safeData.status),

      modelGlbUrl: this.nullableString(
        safeData.modelGlbUrl ?? safeData.model_glb_url,
      ),

      modelVrmUrl: this.nullableString(
        safeData.modelVrmUrl ?? safeData.model_vrm_url,
      ),

      previewUrl: this.nullableString(
        safeData.previewUrl ??
          safeData.avatarPreviewUrl ??
          safeData.avatar_preview_url,
      ),

      config: this.ensureObject(
        safeData.config ?? safeData.providerConfig ?? safeData.provider_config,
      ),

      metadata: this.ensureObject(
        safeData.metadata ?? safeData.modelMetadata ?? safeData.model_metadata,
      ),
    };
  }

  /* =======================================================
     Normalize Model Export Result
     ======================================================= */

  normalizeExportResult(data = {}) {
    const safeData = this.ensureObject(data);

    return {
      glbUrl: this.nullableString(
        safeData.glbUrl ??
          safeData.glb_url ??
          safeData.modelGlbUrl ??
          safeData.model_glb_url,
      ),

      vrmUrl: this.nullableString(
        safeData.vrmUrl ??
          safeData.vrm_url ??
          safeData.modelVrmUrl ??
          safeData.model_vrm_url,
      ),

      expiresAt: this.nullableString(safeData.expiresAt ?? safeData.expires_at),

      metadata: this.ensureObject(safeData.metadata),
    };
  }

  /* =======================================================
     Normalize Preview Result
     ======================================================= */

  normalizePreviewResult(data = {}) {
    const safeData = this.ensureObject(data);

    return {
      previewUrl: this.nullableString(
        safeData.previewUrl ??
          safeData.preview_url ??
          safeData.avatarPreviewUrl ??
          safeData.avatar_preview_url,
      ),

      width: this.nullableNumber(safeData.width),

      height: this.nullableNumber(safeData.height),

      mimeType: this.nullableString(safeData.mimeType ?? safeData.mime_type),

      metadata: this.ensureObject(safeData.metadata),
    };
  }

  /* =======================================================
     Normalize Webhook Result
     ======================================================= */

  normalizeWebhookResult(data = {}) {
    const safeData = this.ensureObject(data);

    return {
      eventType: this.cleanString(
        safeData.eventType ?? safeData.event_type,
        "unknown",
      ),

      provider: this.cleanString(safeData.provider, this.getProviderName()),

      providerUserId: this.nullableString(
        safeData.providerUserId ?? safeData.provider_user_id,
      ),

      providerAvatarId: this.nullableString(
        safeData.providerAvatarId ?? safeData.provider_avatar_id,
      ),

      status: this.normalizeStatus(safeData.status),

      modelGlbUrl: this.nullableString(
        safeData.modelGlbUrl ?? safeData.model_glb_url,
      ),

      modelVrmUrl: this.nullableString(
        safeData.modelVrmUrl ?? safeData.model_vrm_url,
      ),

      previewUrl: this.nullableString(
        safeData.previewUrl ?? safeData.preview_url,
      ),

      metadata: this.ensureObject(safeData.metadata),
    };
  }

  /* =======================================================
     Generation Status Normalization

     IMPORTANT:

     These MUST remain compatible with your PostgreSQL
     generation_status CHECK constraint:

     ready
     uploading
     processing
     failed
     ======================================================= */

  normalizeStatus(status) {
    const normalized = this.cleanString(status)
      .toLowerCase()
      .replace(/\s+/g, "_");

    const aliases = {
      ready: "ready",

      complete: "ready",
      completed: "ready",
      success: "ready",
      successful: "ready",
      succeeded: "ready",
      generated: "ready",
      finished: "ready",
      done: "ready",

      uploading: "uploading",

      upload: "uploading",

      uploaded: "processing",

      pending: "processing",

      queued: "processing",

      queue: "processing",

      processing: "processing",

      generating: "processing",

      generation: "processing",

      in_progress: "processing",

      working: "processing",

      started: "processing",

      failed: "failed",

      failure: "failed",

      error: "failed",

      rejected: "failed",

      cancelled: "failed",

      canceled: "failed",
    };

    const result = aliases[normalized];

    if (result) {
      return result;
    }

    /*
     * Unknown provider state should be considered
     * processing rather than incorrectly marking an avatar
     * ready or failed.
     */

    return "processing";
  }

  /* =======================================================
     Validate Creation Input

     Common validation that provider implementations can
     reuse.
     ======================================================= */

  validateCreationContext(options = {}) {
    const safeOptions = this.ensureObject(options);

    const userId = this.cleanString(safeOptions.userId);

    if (!userId) {
      throw this.createProviderError(
        "A DesignByYou user ID is required to create an avatar.",
        {
          code: "AVATAR_USER_ID_REQUIRED",

          status: 400,
        },
      );
    }

    return {
      ...safeOptions,
      userId,
    };
  }

  /* =======================================================
     Validate Photo Object

     A photo may use either:

     - path
     - buffer

     depending on how multer/storage is configured.
     ======================================================= */

  validatePhoto(photo, { label = "photo", required = true } = {}) {
    if (!photo) {
      if (!required) {
        return null;
      }

      throw this.createProviderError(`${label} is required.`, {
        code: "AVATAR_PHOTO_REQUIRED",

        status: 400,

        details: {
          photo: label,
        },
      });
    }

    if (typeof photo !== "object") {
      throw this.createProviderError(`${label} is invalid.`, {
        code: "AVATAR_PHOTO_INVALID",

        status: 400,
      });
    }

    const path = this.nullableString(photo.path);

    const buffer = Buffer.isBuffer(photo.buffer) ? photo.buffer : null;

    if (!path && !buffer) {
      throw this.createProviderError(
        `${label} must contain a file path or buffer.`,
        {
          code: "AVATAR_PHOTO_DATA_MISSING",

          status: 400,

          details: {
            photo: label,
          },
        },
      );
    }

    return {
      path,

      buffer,

      mimeType: this.nullableString(photo.mimeType ?? photo.mimetype),

      filename: this.nullableString(photo.filename ?? photo.originalname),

      size: this.nullableNumber(photo.size),
    };
  }

  /* =======================================================
     Validate Multi-Photo Input

     Standard names used throughout DesignByYou:

     front
     sideLeft
     sideRight
     ======================================================= */

  validatePhotoSet(
    photos,
    {
      requireFront = true,

      requireSideLeft = true,

      requireSideRight = true,
    } = {},
  ) {
    const safePhotos = this.ensureObject(photos);

    return {
      front: this.validatePhoto(safePhotos.front, {
        label: "front photo",

        required: requireFront,
      }),

      sideLeft: this.validatePhoto(safePhotos.sideLeft ?? safePhotos.left, {
        label: "left side photo",

        required: requireSideLeft,
      }),

      sideRight: this.validatePhoto(safePhotos.sideRight ?? safePhotos.right, {
        label: "right side photo",

        required: requireSideRight,
      }),
    };
  }

  /* =======================================================
     Ensure Object
     ======================================================= */

  ensureObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value;
  }

  /* =======================================================
     Clean String
     ======================================================= */

  cleanString(value, fallback = "") {
    const text = String(value ?? "").trim();

    return text || fallback;
  }

  /* =======================================================
     Nullable String
     ======================================================= */

  nullableString(value) {
    const text = this.cleanString(value);

    return text || null;
  }

  /* =======================================================
     Nullable Number
     ======================================================= */

  nullableNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  /* =======================================================
     Provider Name

     Never allow error construction to crash because a
     provider forgot to implement its name getter.
     ======================================================= */

  getProviderName() {
    try {
      const value = this.cleanString(this.name);

      return value || this.constructor.name || "unknown";
    } catch {
      return this.constructor.name || "unknown";
    }
  }

  /* =======================================================
     Provider Error Builder
     ======================================================= */

  createProviderError(
    message,
    {
      code = "AVATAR_PROVIDER_ERROR",

      status = 500,

      provider = null,

      details = null,

      cause = null,
    } = {},
  ) {
    const error = new Error(
      this.cleanString(message, "Avatar provider error."),
    );

    error.name = "AvatarProviderError";

    error.code = this.cleanString(code, "AVATAR_PROVIDER_ERROR");

    error.status = Number.isInteger(Number(status)) ? Number(status) : 500;

    error.provider = this.cleanString(provider, this.getProviderName());

    if (details !== null && details !== undefined) {
      error.details = details;
    }

    if (cause) {
      error.cause = cause;
    }

    return error;
  }

  /* =======================================================
     Not Implemented
     ======================================================= */

  notImplemented(methodName) {
    return this.createProviderError(
      `${this.constructor.name}.${methodName}() is not implemented.`,
      {
        code: "AVATAR_PROVIDER_METHOD_NOT_IMPLEMENTED",

        status: 501,
      },
    );
  }
}

/* =========================================================
   Export
   ========================================================= */

module.exports = AvatarProvider;
