import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, Sparkles, User } from "lucide-react";

import API from "../../api/axios";

import { FashionPersonaAvatarCircle } from "./FashionPersonaAvatar";

/* =========================================================
   DesignByYou
   Profile Identity
   Version 2.0

   Shared identity resolver for:

   - Designer navbar
   - Creator navbar
   - Designer profile
   - Creator profile
   - Booking cards
   - Directory cards
   - Chat
   - Marketplace profile cards

   Identity priority:

   1. Fashion Persona
      ONLY when:
      - avatar exists
      - avatar loaded successfully
      - useAsProfilePicture === true

   2. Standard profile image

   3. Initials

   IMPORTANT
   ---------------------------------------------------------

   Fashion Persona and normal profile images remain separate.

   Avatar Studio stores the profile-picture preference inside:

       avatar_config.useAsProfilePicture

   This component can resolve avatar data from:

   1. Parent supplied avatar
   2. user.avatar
   3. user.avatar_config
   4. /avatar/me
   5. /avatars/:userId

   This is important because AuthContext/user data may already
   contain the current avatar configuration before the API
   request finishes.
   ========================================================= */

/* =========================================================
   Helpers
   ========================================================= */

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
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

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/* =========================================================
   Backend Origin
   ========================================================= */

function getBackendOrigin() {
  const configured = cleanText(
    import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      API.defaults.baseURL,
  );

  if (/^https?:\/\//i.test(configured)) {
    return configured.replace(/\/api(?:\/v\d+)?\/?$/i, "").replace(/\/+$/, "");
  }

  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return "http://localhost:8080";
  }

  return typeof window !== "undefined" ? window.location.origin : "";
}

/* =========================================================
   Media URL Resolver
   ========================================================= */

function resolveMediaUrl(value) {
  const path = cleanText(value);

  if (!path) {
    return "";
  }

  if (path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path
      .replace("localhost:5000", "localhost:8080")
      .replace("localhost:8000", "localhost:8080")
      .replace(/\\/g, "/");
  }

  const origin = getBackendOrigin();

  const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!origin) {
    return `/${cleanPath}`;
  }

  return `${origin}/${cleanPath}`;
}

/* =========================================================
   Initials
   ========================================================= */

function getInitials(name) {
  const words = cleanText(name).split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "DB";
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/* =========================================================
   Featured Design
   ========================================================= */

function normalizeFeaturedDesign(design) {
  if (!design || typeof design !== "object") {
    return null;
  }

  const id = cleanText(design.id || design.design_id);

  if (!id) {
    return null;
  }

  const resolvedImage = resolveMediaUrl(
    design.image ||
      design.watermarked_preview_url ||
      design.preview_url ||
      design.reference_image_url ||
      design.image_url,
  );

  const sourceType = cleanText(
    design.sourceType || design.source_type,
    "upload",
  ).toLowerCase();

  const editorProjectId = cleanText(
    design.editorProjectId || design.editor_project_id,
  );

  const originalDesignId = cleanText(
    design.originalDesignId || design.original_design_id,
  );

  const isEditable = toBoolean(design.isEditable ?? design.is_editable, false);

  const allowRemix = toBoolean(design.allowRemix ?? design.allow_remix, false);

  return {
    ...design,

    id,

    title: cleanText(design.title, "Featured Design"),

    slug: cleanText(design.slug),

    description: cleanText(design.description),

    image: resolvedImage,

    watermarked_preview_url: resolvedImage,

    sourceType,

    source_type: sourceType,

    editorProjectId,

    editor_project_id: editorProjectId,

    isEditable,

    is_editable: isEditable,

    allowRemix,

    allow_remix: allowRemix,

    originalDesignId,

    original_design_id: originalDesignId,
  };
}

/* =========================================================
   Normalize Avatar
   ========================================================= */

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return null;
  }

  /*
   * Avatar configuration can exist in several forms.
   *
   * Supported:
   *
   * avatar.avatar_config
   * avatar.config
   * avatar.avatarConfig
   */

  const rawConfig = isPlainObject(avatar.avatar_config)
    ? avatar.avatar_config
    : isPlainObject(avatar.avatarConfig)
      ? avatar.avatarConfig
      : isPlainObject(avatar.config)
        ? avatar.config
        : {};

  /*
   * The profile-picture preference can exist either:
   *
   * avatar.useAsProfilePicture
   * avatar.use_as_profile_picture
   * avatar.avatar_config.useAsProfilePicture
   * avatar.avatar_config.use_as_profile_picture
   */

  const useAsProfilePicture = toBoolean(
    avatar.useAsProfilePicture ??
      avatar.use_as_profile_picture ??
      avatar.use_as_profile_picture ??
      rawConfig.useAsProfilePicture ??
      rawConfig.use_as_profile_picture,
    false,
  );

  const rawFeaturedDesign =
    avatar.featured_design ||
    avatar.featuredDesign ||
    rawConfig.featured_design ||
    rawConfig.featuredDesign ||
    null;

  /*
   * If configuration exists but there is no explicit ID,
   * we still consider the avatar to exist when configuration
   * is present.
   */

  const hasConfig = Object.keys(rawConfig).length > 0;

  const exists = toBoolean(
    avatar.exists,
    Boolean(avatar.id || avatar.avatar_version || avatar.version || hasConfig),
  );

  return {
    exists,

    id: avatar.id || avatar.avatar_id || null,

    userId: cleanText(avatar.user_id || avatar.userId || avatar.user?.id),

    config: rawConfig,

    useAsProfilePicture,

    featuredDesignId: cleanText(
      avatar.featured_design_id ||
        avatar.featuredDesignId ||
        rawConfig.featured_design_id ||
        rawConfig.featuredDesignId,
    ),

    featuredDesign: normalizeFeaturedDesign(rawFeaturedDesign),

    displayMode: cleanText(
      avatar.display_mode ||
        avatar.displayMode ||
        rawConfig.display_mode ||
        rawConfig.displayMode,
      "showcase",
    ),

    pose: cleanText(avatar.pose || rawConfig.pose, "standing"),

    backgroundTheme: cleanText(
      avatar.background_theme ||
        avatar.backgroundTheme ||
        rawConfig.background_theme ||
        rawConfig.backgroundTheme,
      "studio",
    ),

    previewUrl: resolveMediaUrl(
      avatar.avatar_preview_url ||
        avatar.previewUrl ||
        avatar.preview_url ||
        rawConfig.avatar_preview_url ||
        rawConfig.previewUrl,
    ),

    isPublic: toBoolean(avatar.is_public ?? avatar.isPublic, true),

    version: Math.max(
      1,
      Number(avatar.avatar_version || avatar.version || 1) || 1,
    ),
  };
}

/* =========================================================
   Extract Avatar From User Object
   =========================================================

   IMPORTANT FIX

   CreatorLayout passes:

       user={user}

   The previous implementation did not inspect the user
   object for avatar configuration.

   This version does.

   Supported user structures:

       user.avatar

       user.avatar_config

       user.avatarConfig

       user.fashion_avatar

       user.fashionAvatar

       user.profile_avatar

       user.profileAvatar
   ========================================================= */

function extractAvatarFromUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  /*
   * Direct avatar object.
   */

  const directAvatarCandidates = [
    user.avatar,
    user.fashion_avatar,
    user.fashionAvatar,
    user.profile_avatar,
    user.profileAvatar,
  ];

  for (const candidate of directAvatarCandidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      const normalized = normalizeAvatar(candidate);

      if (normalized) {
        return normalized;
      }
    }
  }

  /*
   * Avatar config directly on user.
   */

  const configCandidates = [user.avatar_config, user.avatarConfig];

  for (const config of configCandidates) {
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return normalizeAvatar({
        exists: true,

        id: user.avatar_id || user.avatarId || null,

        user_id: user.id || user.user_id || user._id,

        avatar_config: config,

        useAsProfilePicture:
          config.useAsProfilePicture ?? config.use_as_profile_picture,

        featured_design: config.featured_design || config.featuredDesign,

        featured_design_id:
          config.featured_design_id || config.featuredDesignId,

        display_mode: config.display_mode || config.displayMode,

        pose: config.pose,

        background_theme: config.background_theme || config.backgroundTheme,

        avatar_version: config.avatar_version || config.version,
      });
    }
  }

  /*
   * Some APIs return:

       user.profile
       user.profile.avatar_config

   */

  const nestedProfile = user.profile;

  if (nestedProfile && typeof nestedProfile === "object") {
    const nestedConfig =
      nestedProfile.avatar_config || nestedProfile.avatarConfig;

    if (nestedConfig && typeof nestedConfig === "object") {
      return normalizeAvatar({
        exists: true,

        id: nestedProfile.avatar_id || nestedProfile.avatarId || null,

        user_id: user.id || user.user_id || user._id,

        avatar_config: nestedConfig,

        useAsProfilePicture:
          nestedConfig.useAsProfilePicture ??
          nestedConfig.use_as_profile_picture,

        featured_design:
          nestedConfig.featured_design || nestedConfig.featuredDesign,

        display_mode: nestedConfig.display_mode || nestedConfig.displayMode,

        pose: nestedConfig.pose,

        background_theme:
          nestedConfig.background_theme || nestedConfig.backgroundTheme,
      });
    }
  }

  return null;
}

/* =========================================================
   Extract Avatar Response
   ========================================================= */

function extractAvatarObject(response) {
  const body = response?.data;

  if (!body) {
    return null;
  }

  /*
   * Direct avatar candidates.
   */

  const candidates = [
    body?.data?.avatar,
    body?.avatar,

    body?.data?.fashion_avatar,
    body?.fashion_avatar,

    body?.data?.fashionAvatar,
    body?.fashionAvatar,

    body?.data?.profile_avatar,
    body?.profile_avatar,

    body?.data,
    body,
  ];

  const avatarCandidate = candidates.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (Object.prototype.hasOwnProperty.call(candidate, "avatar_config") ||
        Object.prototype.hasOwnProperty.call(candidate, "avatarConfig") ||
        Object.prototype.hasOwnProperty.call(candidate, "config") ||
        Object.prototype.hasOwnProperty.call(candidate, "avatar_version") ||
        Object.prototype.hasOwnProperty.call(candidate, "version") ||
        Object.prototype.hasOwnProperty.call(candidate, "exists") ||
        Object.prototype.hasOwnProperty.call(
          candidate,
          "useAsProfilePicture",
        ) ||
        Object.prototype.hasOwnProperty.call(
          candidate,
          "use_as_profile_picture",
        )),
  );

  if (avatarCandidate) {
    return avatarCandidate;
  }

  /*
   * Some backends return avatar_config directly:

       {
         data: {
           avatar_config: {...}
         }
       }

   Convert it into the normalized avatar structure.
   */

  const directConfig =
    body?.data?.avatar_config ||
    body?.data?.avatarConfig ||
    body?.avatar_config ||
    body?.avatarConfig;

  if (
    directConfig &&
    typeof directConfig === "object" &&
    !Array.isArray(directConfig)
  ) {
    return {
      exists: true,
      avatar_config: directConfig,

      useAsProfilePicture:
        directConfig.useAsProfilePicture ?? directConfig.use_as_profile_picture,

      featured_design:
        directConfig.featured_design || directConfig.featuredDesign,

      featured_design_id:
        directConfig.featured_design_id || directConfig.featuredDesignId,

      display_mode: directConfig.display_mode || directConfig.displayMode,

      pose: directConfig.pose,

      background_theme:
        directConfig.background_theme || directConfig.backgroundTheme,

      avatar_version: directConfig.avatar_version || directConfig.version,
    };
  }

  return null;
}

/* =========================================================
   Size Configuration
   ========================================================= */

const SIZE_MAP = {
  xs: {
    wrapper: "h-7 w-7",
    initials: "text-[8px]",
    icon: 12,
  },

  sm: {
    wrapper: "h-9 w-9",
    initials: "text-[10px]",
    icon: 14,
  },

  md: {
    wrapper: "h-11 w-11",
    initials: "text-[11px]",
    icon: 17,
  },

  lg: {
    wrapper: "h-14 w-14",
    initials: "text-sm",
    icon: 21,
  },

  xl: {
    wrapper: "h-20 w-20",
    initials: "text-lg",
    icon: 28,
  },

  "2xl": {
    wrapper: "h-28 w-28",
    initials: "text-2xl",
    icon: 38,
  },
};

/* =========================================================
   Profile Identity
   ========================================================= */

export default function ProfileIdentity({
  user = null,

  userId = "",

  avatar: suppliedAvatar = undefined,

  isOwnProfile = true,

  autoLoadAvatar = true,

  size = "sm",

  shape = "circle",

  className = "",

  imageClassName = "",

  personaClassName = "",

  showLoading = false,

  interactive = false,

  onClick,

  onAvatarLoaded,

  ariaLabel = "",

  title = "",
}) {
  /* =======================================================
     Resolve Avatar From User Immediately
     ======================================================= */

  const userAvatar = useMemo(() => extractAvatarFromUser(user), [user]);

  /*
   * Priority:

       suppliedAvatar
            ↓
       user avatar
            ↓
       null / API loading

   This is the key fix for CreatorLayout.
   */

  const initialAvatar = useMemo(() => {
    if (suppliedAvatar !== undefined) {
      return normalizeAvatar(suppliedAvatar);
    }

    return userAvatar;
  }, [suppliedAvatar, userAvatar]);

  /* =======================================================
     Internal Avatar State
     ======================================================= */

  const [loadedAvatar, setLoadedAvatar] = useState(initialAvatar);

  const [loading, setLoading] = useState(
    Boolean(autoLoadAvatar && suppliedAvatar === undefined && !initialAvatar),
  );

  const [avatarFailed, setAvatarFailed] = useState(false);

  const [imageFailed, setImageFailed] = useState(false);

  /* =======================================================
     Target User ID
     ======================================================= */

  const targetUserId = cleanText(
    userId || user?.id || user?._id || user?.user_id,
  );

  /* =======================================================
     Display Name
     ======================================================= */

  const displayName = cleanText(
    user?.full_name || user?.name || user?.username,
    "User",
  );

  /* =======================================================
     Normal Profile Image
     ======================================================= */

  const rawProfileImage =
    user?.profile_image_url ||
    user?.profileImageUrl ||
    user?.profile_image ||
    user?.avatar_url ||
    "";

  const profileImage = !imageFailed ? resolveMediaUrl(rawProfileImage) : "";

  /* =======================================================
     Synchronize User Avatar
     ======================================================= */

  useEffect(() => {
    /*
     * If parent explicitly supplied an avatar,
     * parent owns the avatar state.
     */

    if (suppliedAvatar !== undefined) {
      setLoadedAvatar(normalizeAvatar(suppliedAvatar));

      setAvatarFailed(false);

      setLoading(false);

      return;
    }

    /*
     * If user contains avatar data, use it immediately.

     * This prevents navbar/profile flickering and allows
     * CreatorLayout to display the current Fashion Persona
     * without waiting for another request.
     */

    if (userAvatar) {
      setLoadedAvatar(normalizeAvatar(userAvatar));

      setAvatarFailed(false);

      setLoading(false);
    }
  }, [suppliedAvatar, userAvatar]);

  /* =======================================================
     Reset Profile Image Failure
     ======================================================= */

  useEffect(() => {
    setImageFailed(false);
  }, [rawProfileImage]);

  /* =======================================================
     Reset Avatar State When User Changes
     ======================================================= */

  useEffect(() => {
    /*
     * When switching between accounts/profiles, do not
     * accidentally display the previous user's avatar.
     */

    if (!targetUserId && isOwnProfile) {
      return;
    }

    if (userAvatar && suppliedAvatar === undefined) {
      setLoadedAvatar(normalizeAvatar(userAvatar));

      setAvatarFailed(false);
    }
  }, [targetUserId, isOwnProfile, userAvatar, suppliedAvatar]);

  /* =======================================================
     Load Avatar
     ======================================================= */

  const loadAvatar = useCallback(
    async (signal) => {
      /*
       * Parent explicitly supplied avatar.
       */

      if (suppliedAvatar !== undefined) {
        return;
      }

      /*
       * If user already contains avatar data,
       * we still allow the canonical /avatar/me request
       * to refresh it.

       * This is important after saving changes in Avatar Studio.
       */

      if (!autoLoadAvatar) {
        setLoading(false);

        return;
      }

      /*
       * Public avatar lookup requires user ID.
       */

      if (!isOwnProfile && !targetUserId) {
        setLoadedAvatar(null);

        setAvatarFailed(true);

        setLoading(false);

        return;
      }

      setLoading(true);

      setAvatarFailed(false);

      try {
        const endpoint = isOwnProfile
          ? "/avatar/me"
          : `/avatars/${encodeURIComponent(targetUserId)}`;

        const response = await API.get(endpoint, {
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        const rawAvatar = extractAvatarObject(response);

        const normalized = normalizeAvatar(rawAvatar);

        /*
         * If backend returns a valid avatar,
         * it becomes the canonical current state.
         */

        if (normalized) {
          setLoadedAvatar(normalized);

          setAvatarFailed(false);

          if (typeof onAvatarLoaded === "function") {
            onAvatarLoaded(normalized);
          }
        } else {
          /*
           * If we already have a valid avatar from
           * the user object, don't destroy it simply
           * because the API response was empty.
           */

          if (!userAvatar) {
            setLoadedAvatar(null);

            setAvatarFailed(true);
          }
        }
      } catch (error) {
        if (
          signal?.aborted ||
          error?.code === "ERR_CANCELED" ||
          error?.name === "CanceledError" ||
          error?.name === "AbortError"
        ) {
          return;
        }

        const status = error?.response?.status;

        /*
         * A missing avatar is not a fatal profile error.
         */

        if (status !== 404) {
          console.warn("ProfileIdentity avatar load failed:", error);
        }

        /*
         * IMPORTANT:
         *
         * Do not destroy a valid avatar already
         * obtained from user/avatar_config.
         */

        if (!userAvatar) {
          setLoadedAvatar(null);

          setAvatarFailed(true);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [
      autoLoadAvatar,
      isOwnProfile,
      onAvatarLoaded,
      suppliedAvatar,
      targetUserId,
      userAvatar,
    ],
  );

  /* =======================================================
     Avatar Loading Effect
     ======================================================= */

  useEffect(() => {
    if (suppliedAvatar !== undefined || !autoLoadAvatar) {
      return undefined;
    }

    const controller = new AbortController();

    void loadAvatar(controller.signal);

    return () => {
      controller.abort();
    };
  }, [autoLoadAvatar, loadAvatar, suppliedAvatar]);

  /* =======================================================
     Normalized Avatar
     ======================================================= */

  const avatar = useMemo(
    () => (loadedAvatar ? normalizeAvatar(loadedAvatar) : null),
    [loadedAvatar],
  );

  /* =======================================================
     Profile Identity Preference
     ======================================================= */

  const hasFashionPersona = Boolean(avatar && avatar.exists && !avatarFailed);

  const wantsFashionPersonaAsProfilePicture = Boolean(
    hasFashionPersona && avatar.useAsProfilePicture,
  );

  /* =======================================================
     Size
     ======================================================= */

  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.sm;

  /* =======================================================
     Persona Avatar Size
     ======================================================= */

  const personaSize =
    size === "xs"
      ? 28
      : size === "sm"
        ? 36
        : size === "md"
          ? 44
          : size === "lg"
            ? 56
            : size === "xl"
              ? 80
              : 112;

  /* =======================================================
     Shape
     ======================================================= */

  const shapeClass =
    shape === "square"
      ? "rounded-xl"
      : shape === "rounded"
        ? "rounded-2xl"
        : "rounded-full";

  /* =======================================================
     Interactive Wrapper
     ======================================================= */

  const interactiveClass =
    typeof onClick === "function" || interactive
      ? "cursor-pointer transition duration-300 hover:scale-[1.04]"
      : "";

  /* =======================================================
     Shared Wrapper
     ======================================================= */

  const wrapperClass = `
    relative
    shrink-0
    overflow-hidden
    border
    border-slate-200
    bg-slate-100
    shadow-sm

    dark:border-white/10
    dark:bg-[#111]

    ${sizeConfig.wrapper}
    ${shapeClass}
    ${interactiveClass}
    ${className}
  `;

  /* =======================================================
     Loading Identity
     ======================================================= */

  if (loading && showLoading) {
    return (
      <div
        className={wrapperClass}
        aria-label={ariaLabel || `Loading ${displayName} identity`}
        title={title}
      >
        <div
          className="
            flex
            h-full
            w-full
            items-center
            justify-center
            bg-slate-100

            dark:bg-white/[0.035]
          "
        >
          <Loader2
            size={sizeConfig.icon}
            className="
              animate-spin
              text-[#B18A24]

              dark:text-[#D4AF37]
            "
          />
        </div>
      </div>
    );
  }

  /* =======================================================
     Fashion Persona
     ======================================================= */

  if (wantsFashionPersonaAsProfilePicture) {
    const content = (
      <div
        className={`
          relative
          h-full
          w-full
          ${personaClassName}
        `}
      >
        <FashionPersonaAvatarCircle
          config={avatar.config}
          pose={avatar.pose}
          backgroundTheme={avatar.backgroundTheme}
          displayMode={avatar.displayMode}
          featuredDesign={avatar.featuredDesign}
          size={personaSize}
          ariaLabel={`${displayName} Fashion Persona`}
          className="
            h-full
            w-full
          "
        />

        {/* ===============================================
            Persona Indicator
            =============================================== */}

        {size !== "xs" && size !== "sm" && (
          <span
            className="
                pointer-events-none
                absolute
                bottom-0.5
                right-0.5
                flex
                h-4
                w-4
                items-center
                justify-center
                rounded-full
                border
                border-white/60
                bg-violet-600
                text-white
                shadow

                dark:border-[#111]
              "
            title="Fashion Persona profile picture"
          >
            <Sparkles size={8} />
          </span>
        )}
      </div>
    );

    if (typeof onClick === "function") {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel || `${displayName} profile`}
          title={title}
          className={wrapperClass}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        className={wrapperClass}
        aria-label={ariaLabel || `${displayName} profile`}
        title={title}
      >
        {content}
      </div>
    );
  }

  /* =======================================================
     Normal Profile Image
     ======================================================= */

  if (profileImage) {
    const content = (
      <img
        src={profileImage}
        alt={ariaLabel || `${displayName} profile`}
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
        className={`
          h-full
          w-full
          object-cover
          ${imageClassName}
        `}
      />
    );

    if (typeof onClick === "function") {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel || `${displayName} profile`}
          title={title}
          className={wrapperClass}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        className={wrapperClass}
        aria-label={ariaLabel || `${displayName} profile`}
        title={title}
      >
        {content}
      </div>
    );
  }

  /* =======================================================
     Initials
     ======================================================= */

  const initialsContent = (
    <div
      className={`
        flex
        h-full
        w-full
        items-center
        justify-center
        bg-gradient-to-br
        from-[#D4AF37]/15
        via-slate-50
        to-violet-100
        font-black
        uppercase
        tracking-wide
        text-[#98761A]

        dark:from-[#D4AF37]/15
        dark:via-[#111]
        dark:to-violet-950/30
        dark:text-[#D4AF37]

        ${sizeConfig.initials}
      `}
    >
      {displayName ? getInitials(displayName) : <User size={sizeConfig.icon} />}
    </div>
  );

  if (typeof onClick === "function") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || `${displayName} profile`}
        title={title}
        className={wrapperClass}
      >
        {initialsContent}
      </button>
    );
  }

  return (
    <div
      className={wrapperClass}
      aria-label={ariaLabel || `${displayName} profile`}
      title={title}
    >
      {initialsContent}
    </div>
  );
}

/* =========================================================
   Compact Convenience Exports
   ========================================================= */

export function ProfileIdentitySmall(props) {
  return <ProfileIdentity {...props} size="sm" />;
}

export function ProfileIdentityMedium(props) {
  return <ProfileIdentity {...props} size="md" />;
}

export function ProfileIdentityLarge(props) {
  return <ProfileIdentity {...props} size="xl" />;
}
