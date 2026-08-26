import React, {
  Component,
  useMemo,
} from "react";

import FashionPersonaAvatar from "./FashionPersonaAvatar";
import FashionPersona3D from "./FashionPersona3D";

/* =========================================================
   DesignByYou
   Shared Avatar Renderer
   Version 1.0

   PURPOSE
   ---------------------------------------------------------

   One renderer for the entire application.

   avatar_engine:

       fashion_persona_2d
               ↓
       FashionPersonaAvatar.jsx

       internal_3d
               ↓
       FashionPersona3D.jsx

   Small UI surfaces may use avatar_preview_url instead of
   loading an interactive Three.js scene.

   Examples:

   Profile / Avatar Studio
       interactive 3D

   Navbar / Chat / Booking card
       saved avatar preview image

   ========================================================= */

export const AVATAR_ENGINES = Object.freeze({
  FASHION_PERSONA_2D:
    "fashion_persona_2d",

  INTERNAL_3D:
    "internal_3d",
});

/* =========================================================
   Render Modes
   ========================================================= */

export const AVATAR_RENDER_MODES = Object.freeze({
  AUTO: "auto",

  INTERACTIVE: "interactive",

  PREVIEW: "preview",
});

/* =========================================================
   Default Values
   ========================================================= */

const DEFAULT_ENGINE =
  AVATAR_ENGINES.FASHION_PERSONA_2D;

const DEFAULT_BACKGROUND =
  "studio";

const DEFAULT_POSE =
  "standing";

/* =========================================================
   Helpers
   ========================================================= */

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

/* =========================================================
   Engine Normalizer
   ========================================================= */

export function normalizeAvatarEngine(
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

/* =========================================================
   Backend Origin

   avatar_preview_url may be:

       /uploads/avatars/avatar-preview-....jpg

   If frontend and backend run on different origins during
   development, this helper attempts to resolve that relative
   URL against the configured backend origin.

   Supported Vite env examples:

       VITE_API_URL=http://localhost:8080/api/v1

       VITE_BACKEND_URL=http://localhost:8080

   ========================================================= */

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

/* =========================================================
   Media URL Resolver
   ========================================================= */

export function resolveAvatarMediaUrl(
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

/* =========================================================
   Avatar Normalizer

   Provides a safe consistent object to either renderer.
   ========================================================= */

export function normalizeAvatarForRendering(
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

/* =========================================================
   Render Decision Helpers
   ========================================================= */

export function isInternal3DAvatar(
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

export function hasAvatarPreview(
  avatar,
) {
  return Boolean(
    cleanText(
      avatar?.avatar_preview_url ||
        avatar?.avatarPreviewUrl,
    ),
  );
}

function shouldUsePreview({
  avatar,

  mode,

  preferPreview,

  interactive,
}) {
  if (
    !hasAvatarPreview(
      avatar,
    )
  ) {
    return false;
  }

  if (
    mode ===
    AVATAR_RENDER_MODES.PREVIEW
  ) {
    return true;
  }

  if (
    mode ===
    AVATAR_RENDER_MODES.INTERACTIVE
  ) {
    return false;
  }

  /*
   * AUTO mode:
   *
   * Explicit preferPreview wins.
   *
   * Otherwise non-interactive small surfaces should use the
   * saved portrait rather than creating a WebGL scene.
   */

  if (
    preferPreview === true
  ) {
    return true;
  }

  if (
    preferPreview === false
  ) {
    return false;
  }

  return interactive === false;
}

/* =========================================================
   Preview Image
   ========================================================= */

function AvatarPreviewImage({
  avatar,

  className = "",

  style = {},

  mediaBaseUrl = "",

  alt,

  objectFit = "cover",

  rounded = false,

  onLoad,

  onError,
}) {
  const previewUrl =
    resolveAvatarMediaUrl(
      avatar
        ?.avatar_preview_url,
      {
        mediaBaseUrl,
      },
    );

  if (!previewUrl) {
    return null;
  }

  const userName =
    cleanText(
      avatar?.user
        ?.full_name,
      "Fashion Persona",
    );

  return (
    <img
      src={previewUrl}
      alt={
        alt ||
        `${userName} avatar`
      }
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
      onError={onError}
      className={className}
      style={{
        width: "100%",

        height: "100%",

        display: "block",

        objectFit,

        userSelect: "none",

        borderRadius:
          rounded
            ? "9999px"
            : undefined,

        ...style,
      }}
    />
  );
}

/* =========================================================
   Empty Avatar State
   ========================================================= */

function EmptyAvatar({
  className = "",

  style = {},

  height = 420,

  message =
    "Fashion Persona is not available.",
}) {
  return (
    <div
      className={[
        "flex items-center justify-center overflow-hidden",
        "rounded-3xl border border-white/10",
        "bg-slate-950/70 text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: "100%",

        height:
          typeof height ===
          "number"
            ? `${height}px`
            : height,

        ...style,
      }}
    >
      <div
        className="max-w-xs px-6 py-8 text-center"
      >
        <div
          className={[
            "mx-auto mb-4 flex h-14 w-14",
            "items-center justify-center rounded-2xl",
            "bg-white/10 text-sm font-bold",
          ].join(" ")}
        >
          DBY
        </div>

        <p
          className="text-sm font-semibold"
        >
          Fashion Persona
        </p>

        <p
          className="mt-2 text-xs leading-5 text-slate-400"
        >
          {message}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Renderer Error Boundary

   A broken model or legacy renderer should not crash the
   whole profile / studio / page.
   ========================================================= */

class AvatarRendererErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(
    error,
  ) {
    return {
      error,
    };
  }

  componentDidCatch(
    error,
    info,
  ) {
    console.error(
      "AvatarRenderer error:",
      error,
      info,
    );
  }

  componentDidUpdate(
    previousProps,
  ) {
    if (
      previousProps.resetKey !==
        this.props.resetKey &&
      this.state.error
    ) {
      this.setState({
        error: null,
      });
    }
  }

  render() {
    if (
      this.state.error
    ) {
      return (
        <EmptyAvatar
          className={
            this.props.className
          }
          style={
            this.props.style
          }
          height={
            this.props.height
          }
          message={
            this.state.error
              ?.message ||
            "The avatar could not be rendered."
          }
        />
      );
    }

    return this.props.children;
  }
}

/* =========================================================
   2D Fashion Persona Adapter

   Passing both the unified avatar object and common
   individual aliases makes this compatible with the current
   FashionPersonaAvatar component while we gradually migrate
   the rest of the frontend to AvatarRenderer.
   ========================================================= */

function FashionPersona2DAdapter({
  avatar,

  className,

  style,

  height,

  width,

  compact,

  circle,

  showDesign,

  ...props
}) {
  return (
    <FashionPersonaAvatar
      avatar={avatar}
      config={
        avatar.avatar_config
      }
      avatarConfig={
        avatar.avatar_config
      }
      featuredDesign={
        avatar.featured_design
      }
      featured_design={
        avatar.featured_design
      }
      displayMode={
        avatar.display_mode
      }
      display_mode={
        avatar.display_mode
      }
      pose={
        avatar.pose
      }
      backgroundTheme={
        avatar.background_theme
      }
      background_theme={
        avatar.background_theme
      }
      previewUrl={
        avatar.avatar_preview_url
      }
      avatar_preview_url={
        avatar.avatar_preview_url
      }
      compact={
        compact
      }
      circle={
        circle
      }
      showDesign={
        showDesign
      }
      className={
        className
      }
      style={{
        width:
          width ||
          "100%",

        height:
          height ||
          undefined,

        ...style,
      }}
      {...props}
    />
  );
}

/* =========================================================
   Main AvatarRenderer
   ========================================================= */

export default function AvatarRenderer({
  avatar,

  /* -------------------------------------------------------
     Rendering strategy
     ------------------------------------------------------- */

  mode =
    AVATAR_RENDER_MODES.AUTO,

  preferPreview,

  interactive = true,

  /* -------------------------------------------------------
     Layout
     ------------------------------------------------------- */

  className = "",

  style = {},

  height = 560,

  width = "100%",

  rounded = false,

  /* -------------------------------------------------------
     Preview image
     ------------------------------------------------------- */

  mediaBaseUrl = "",

  previewObjectFit =
    "cover",

  alt,

  /* -------------------------------------------------------
     2D options
     ------------------------------------------------------- */

  compact = false,

  circle = false,

  showDesign = true,

  /* -------------------------------------------------------
     3D options
     ------------------------------------------------------- */

  autoRotate = false,

  rotationSpeed = 0.12,

  showGround = true,

  enableZoom = true,

  enablePan = false,

  minDistance = 1.8,

  maxDistance = 7,

  cameraPosition = [
    0,
    1.4,
    3.6,
  ],

  cameraFov = 32,

  modelScale = 1,

  modelPosition = [
    0,
    0,
    0,
  ],

  shadows = true,

  /* -------------------------------------------------------
     Events
     ------------------------------------------------------- */

  onPreviewLoad,

  onPreviewError,

  /* -------------------------------------------------------
     Additional props forwarded to the 2D component
     ------------------------------------------------------- */

  ...rest
}) {
  const normalizedAvatar =
    useMemo(
      () =>
        normalizeAvatarForRendering(
          avatar,
        ),
      [
        avatar,
      ],
    );

  const engine =
    normalizedAvatar
      .avatar_engine;

  const usePreview =
    shouldUsePreview({
      avatar:
        normalizedAvatar,

      mode,

      preferPreview,

      interactive,
    });

  const resetKey = [
    engine,

    normalizedAvatar
      .avatar_version,

    normalizedAvatar
      .model_glb_url,

    normalizedAvatar
      .avatar_preview_url,
  ].join(":");

  /* =======================================================
     Saved Portrait / Preview Mode

     Preferred for:

       navbar
       chat list
       booking cards
       comments
       tiny profile circles

     No Three.js/WebGL is created here.
     ======================================================= */

  if (usePreview) {
    return (
      <AvatarRendererErrorBoundary
        resetKey={
          resetKey
        }
        className={
          className
        }
        style={
          style
        }
        height={
          height
        }
      >
        <div
          className={
            className
          }
          style={{
            position:
              "relative",

            width,

            height:
              typeof height ===
              "number"
                ? `${height}px`
                : height,

            overflow:
              "hidden",

            borderRadius:
              rounded ||
              circle
                ? "9999px"
                : undefined,

            ...style,
          }}
        >
          <AvatarPreviewImage
            avatar={
              normalizedAvatar
            }
            mediaBaseUrl={
              mediaBaseUrl
            }
            alt={
              alt
            }
            objectFit={
              previewObjectFit
            }
            rounded={
              rounded ||
              circle
            }
            onLoad={
              onPreviewLoad
            }
            onError={
              onPreviewError
            }
          />
        </div>
      </AvatarRendererErrorBoundary>
    );
  }

  /* =======================================================
     Internal3D
     ======================================================= */

  if (
    engine ===
    AVATAR_ENGINES.INTERNAL_3D
  ) {
    return (
      <AvatarRendererErrorBoundary
        resetKey={
          resetKey
        }
        className={
          className
        }
        style={
          style
        }
        height={
          height
        }
      >
        <FashionPersona3D
          avatar={
            normalizedAvatar
          }
          className={
            className
          }
          style={{
            width,

            ...style,
          }}
          height={
            height
          }
          interactive={
            interactive
          }
          autoRotate={
            autoRotate
          }
          rotationSpeed={
            rotationSpeed
          }
          showGround={
            showGround
          }
          enableZoom={
            enableZoom
          }
          enablePan={
            enablePan
          }
          minDistance={
            minDistance
          }
          maxDistance={
            maxDistance
          }
          cameraPosition={
            cameraPosition
          }
          cameraFov={
            cameraFov
          }
          modelScale={
            modelScale
          }
          modelPosition={
            modelPosition
          }
          shadows={
            shadows
          }
        />
      </AvatarRendererErrorBoundary>
    );
  }

  /* =======================================================
     Fashion Persona 2D Fallback

     Any unknown/legacy engine intentionally falls back to
     the already-working 2D Fashion Persona instead of
     leaving the user without an avatar.
     ======================================================= */

  return (
    <AvatarRendererErrorBoundary
      resetKey={
        resetKey
      }
      className={
        className
      }
      style={
        style
      }
      height={
        height
      }
    >
      <FashionPersona2DAdapter
        avatar={
          normalizedAvatar
        }
        className={
          className
        }
        style={
          style
        }
        width={
          width
        }
        height={
          height
        }
        compact={
          compact
        }
        circle={
          circle
        }
        showDesign={
          showDesign
        }
        {...rest}
      />
    </AvatarRendererErrorBoundary>
  );
}

/* =========================================================
   Convenience Components

   These make common use cases easier throughout the app.
   ========================================================= */

/* =========================================================
   Interactive Avatar

   Good for:
   - Avatar Studio
   - profile hero
   - showcase
   ========================================================= */

export function InteractiveAvatarRenderer(
  props,
) {
  return (
    <AvatarRenderer
      {...props}
      mode={
        AVATAR_RENDER_MODES.INTERACTIVE
      }
      interactive
      preferPreview={
        false
      }
    />
  );
}

/* =========================================================
   Avatar Portrait

   Good for:
   - navbar
   - chat
   - cards
   - profile circles

   If avatar_preview_url exists, no Three.js scene loads.

   If no preview exists, the renderer falls back to the
   actual 2D/3D engine.
   ========================================================= */

export function AvatarPortrait({
  size = 48,

  className = "",

  style = {},

  ...props
}) {
  return (
    <AvatarRenderer
      {...props}
      mode={
        AVATAR_RENDER_MODES.AUTO
      }
      interactive={
        false
      }
      preferPreview
      width={
        size
      }
      height={
        size
      }
      rounded
      circle
      showGround={
        false
      }
      enableZoom={
        false
      }
      enablePan={
        false
      }
      className={
        className
      }
      style={{
        width:
          typeof size ===
          "number"
            ? `${size}px`
            : size,

        height:
          typeof size ===
          "number"
            ? `${size}px`
            : size,

        borderRadius:
          "9999px",

        flexShrink:
          0,

        ...style,
      }}
    />
  );
}

/* =========================================================
   Compact Avatar

   Good for slightly larger non-interactive UI cards.
   ========================================================= */

export function CompactAvatarRenderer({
  height = 220,

  ...props
}) {
  return (
    <AvatarRenderer
      {...props}
      height={
        height
      }
      interactive={
        false
      }
      compact
      showGround={
        false
      }
    />
  );
}