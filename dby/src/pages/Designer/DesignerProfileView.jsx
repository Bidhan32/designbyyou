import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Link, useNavigate, useParams } from "react-router-dom";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock3,
  Compass,
  Eye,
  FileImage,
  GitFork,
  Globe,
  ImageOff,
  Layers3,
  Loader2,
  Mail,
  MapPin,
  Palette,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UploadCloud,
  User,
  X,
  Zap,
} from "lucide-react";

import API from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

import FashionPersonaAvatar, {
  FashionPersonaDesignBadge,
} from "../avatar/FashionPersonaAvatar";

import ProfileIdentity from "../avatar/ProfileIdentity";

/* =========================================================
   DesignByYou
   Designer Profile View
   Version 3.1

   Integrated systems:
   - Designer profile
   - Inventory
   - Marketplace
   - Historical Fashion Editor metadata
   - Creator booking
   - Designer wallet
   - Shared Fashion Persona avatar
   - Shared profile-picture identity

   Profile picture priority:
   1. Fashion Persona when useAsProfilePicture = true
   2. Standard profile image
   3. Initials
   ========================================================= */

/* =========================================================
   API / Route Configuration
   ========================================================= */

const INVENTORY_ENDPOINT = "/designer/my-inventory";

const MARKETPLACE_ENDPOINT = "/marketplace";

const WALLET_ENDPOINT = "/designer-finance/wallet";

const MY_AVATAR_ENDPOINT = "/avatar/me";

const PUBLIC_AVATAR_ENDPOINT = "/avatars";

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

  const text = cleanText(value).toLowerCase();

  if (["true", "1", "yes", "on"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(text)) {
    return false;
  }

  return fallback;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function humanize(value, fallback = "Design") {
  const text = cleanText(value);

  if (!text) {
    return fallback;
  }

  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanText(tag)).filter(Boolean);
  }

  const text = cleanText(value);

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.map((tag) => cleanText(tag)).filter(Boolean);
    }
  } catch {
    // Continue.
  }

  const content =
    text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1) : text;

  return content
    .split(",")
    .map((tag) => tag.replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, toNumber(value, 0)));
}

function formatDate(value) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Recently published";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizeExternalUrl(value) {
  const url = cleanText(value);

  if (!url) {
    return "";
  }

  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/* =========================================================
   Media Helpers
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
    window.location.hostname === "localhost"
  ) {
    return "http://localhost:8080";
  }

  return typeof window !== "undefined" ? window.location.origin : "";
}

function resolveImageSrc(value) {
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

  return `${getBackendOrigin()}/${path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")}`;
}

function getErrorMessage(error, fallback) {
  if (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  ) {
    return "";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

/* =========================================================
   API Response Helpers
   ========================================================= */

function extractProfileObject(response) {
  const body = response?.data;

  const candidates = [
    body?.data?.user,
    body?.data?.profile,
    body?.user,
    body?.profile,
    body?.data,
    body,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate && typeof candidate === "object" && !Array.isArray(candidate),
    ) || null
  );
}

function extractAvatarObject(response) {
  const body = response?.data;

  const candidates = [body?.data?.avatar, body?.avatar, body?.data, body];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        (Object.prototype.hasOwnProperty.call(candidate, "avatar_config") ||
          Object.prototype.hasOwnProperty.call(candidate, "display_mode") ||
          Object.prototype.hasOwnProperty.call(candidate, "avatar_version") ||
          Object.prototype.hasOwnProperty.call(candidate, "exists")),
    ) || null
  );
}

function extractArray(response) {
  const body = response?.data;

  const candidates = [
    body?.data,
    body?.data?.designs,
    body?.data?.items,
    body?.data?.products,
    body?.designs,
    body?.items,
    body?.products,
    body?.results,
    body,
  ];

  return candidates.find(Array.isArray) || [];
}

/* =========================================================
   Design Normalization
   ========================================================= */

function normalizeDesign(item, index = 0) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const sourceType = cleanText(
    item.sourceType || item.source_type,
    "upload",
  ).toLowerCase();

  const editorProjectId = cleanText(
    item.editorProjectId || item.editor_project_id,
  );

  const isEditable = toBoolean(item.isEditable ?? item.is_editable, false);

  const originalDesignId = cleanText(
    item.originalDesignId || item.original_design_id,
  );

  const sourceProjectId = cleanText(
    item.sourceProjectId || item.source_project_id,
  );

  const isEditorDesign = Boolean(
    sourceType === "fashion_editor" && isEditable && editorProjectId,
  );

  const id = cleanText(
    item.id || item.design_id || item.slug || `design-${index}`,
  );

  return {
    raw: item,

    id,

    slug: cleanText(item.slug || item.id || item.design_id),

    ownerId: cleanText(
      item.ownerId || item.owner_id || item.designer_id || item.user_id,
    ),

    title: cleanText(item.title, "Untitled Design"),

    description: cleanText(
      item.description,
      "No concept description has been provided for this design.",
    ),

    image: resolveImageSrc(
      item.image ||
        item.watermarked_preview_url ||
        item.preview_url ||
        item.display_image_url ||
        item.image_url ||
        item.thumbnail_url,
    ),

    watermarked_preview_url:
      item.watermarked_preview_url || item.preview_url || item.image || null,

    category: humanize(
      item.style_category ||
        item.style_aesthetic ||
        item.category ||
        item.item_type,
      "Fashion Design",
    ),

    tags: parseTags(item.tags),

    price: Math.max(
      0,
      toNumber(item.discount_price || item.base_price || item.price, 0),
    ),

    sourceType,

    source_type: sourceType,

    editorProjectId,

    editor_project_id: editorProjectId,

    isEditable,

    is_editable: isEditable,

    allowRemix: toBoolean(item.allowRemix ?? item.allow_remix, false),

    allow_remix: toBoolean(item.allowRemix ?? item.allow_remix, false),

    originalDesignId,

    original_design_id: originalDesignId,

    isRemix: Boolean(
      isEditorDesign &&
      (originalDesignId || sourceProjectId || toBoolean(item.is_remix, false)),
    ),

    isEditorDesign,

    isPublic: toBoolean(item.isPublic ?? item.is_public, true),

    isPublished: toBoolean(item.isPublished ?? item.is_published, true),

    createdAt: item.published_at || item.created_at || item.updated_at || null,
  };
}

/* =========================================================
   Avatar Normalization
   ========================================================= */

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return null;
  }

  const featured = avatar.featured_design
    ? normalizeDesign(avatar.featured_design, 0)
    : null;

  const config =
    avatar.avatar_config &&
    typeof avatar.avatar_config === "object" &&
    !Array.isArray(avatar.avatar_config)
      ? avatar.avatar_config
      : {};

  return {
    exists: toBoolean(
      avatar.exists,
      Boolean(avatar.id || avatar.avatar_version || Object.keys(config).length),
    ),

    id: avatar.id || null,

    userId: cleanText(avatar.user_id || avatar.user?.id),

    config,

    useAsProfilePicture: toBoolean(
      avatar.useAsProfilePicture ??
        avatar.use_as_profile_picture ??
        config.useAsProfilePicture ??
        config.use_as_profile_picture,
      false,
    ),

    featuredDesignId: cleanText(avatar.featured_design_id),

    featuredDesign: featured,

    displayMode: cleanText(avatar.display_mode, "showcase"),

    pose: cleanText(avatar.pose, "standing"),

    backgroundTheme: cleanText(avatar.background_theme, "studio"),

    previewUrl: resolveImageSrc(avatar.avatar_preview_url),

    isPublic: toBoolean(avatar.is_public, true),

    version: Math.max(1, toNumber(avatar.avatar_version, 1)),

    createdAt: avatar.created_at || null,

    updatedAt: avatar.updated_at || null,
  };
}

/* =========================================================
   Designer Rank
   ========================================================= */

function getDesignerRank(completedCount = 0) {
  const count = Math.max(0, toNumber(completedCount, 0));

  if (count >= 50) {
    return {
      name: "Grand Visionary",

      className:
        "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200",
    };
  }

  if (count >= 20) {
    return {
      name: "Master Craftsman",

      className:
        "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#9A7618] dark:text-[#D4AF37]",
    };
  }

  if (count >= 5) {
    return {
      name: "Atelier Associate",

      className:
        "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70",
    };
  }

  return {
    name: "Visionary Apprentice",

    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  };
}

/* =========================================================
   Safe Image
   ========================================================= */

function SafeImage({ src, alt, className = "" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-slate-100 text-slate-300 dark:bg-white/[0.035] dark:text-white/15 ${className}`}
      >
        <ImageOff size={34} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/* =========================================================
   Source Badge
   ========================================================= */

function SourceBadge({ design }) {
  if (design.isEditorDesign) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-500/20 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-violet-50 backdrop-blur-md">
        {design.isRemix ? <GitFork size={10} /> : <Layers3 size={10} />}

        {design.isRemix ? "Editor Remix" : "Fashion Editor"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-md">
      <FileImage size={10} />
      Image Upload
    </span>
  );
}

/* =========================================================
   Loading
   ========================================================= */

function LoadingScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10">
        <Loader2 size={28} className="animate-spin text-[#D4AF37]" />
      </div>

      <p className="text-[9px] font-black uppercase tracking-[0.26em] text-[#A17E1F] dark:text-[#D4AF37]">
        Loading designer profile
      </p>
    </div>
  );
}

/* =========================================================
   Main Profile
   ========================================================= */

export default function ProfileView() {
  const { user: loggedUser } = useAuth();

  const { designerId } = useParams();

  const navigate = useNavigate();

  const requestControllerRef = useRef(null);

  /* =======================================================
     State
     ======================================================= */

  const [activeTab, setActiveTab] = useState("designs");

  const [profileData, setProfileData] = useState(null);

  const [avatarData, setAvatarData] = useState(null);

  const [avatarUnavailable, setAvatarUnavailable] = useState(false);

  const [userDesigns, setUserDesigns] = useState([]);

  const [availableBalance, setAvailableBalance] = useState(0);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [previewDesign, setPreviewDesign] = useState(null);

  /* =======================================================
     Viewer / Profile Identity
     ======================================================= */

  const loggedUserId = cleanText(
    loggedUser?.id || loggedUser?._id || loggedUser?.user_id,
  );

  const targetDesignerId = cleanText(designerId || loggedUserId);

  const isOwnProfile = Boolean(
    !designerId || (loggedUserId && targetDesignerId === loggedUserId),
  );

  const loggedRole = cleanText(loggedUser?.role).toLowerCase();

  const isCreator = loggedRole === "creator";

  /* =======================================================
     Fetch Profile
     ======================================================= */

  const fetchProfile = useCallback(
    async ({ silent = false } = {}) => {
      requestControllerRef.current?.abort();

      const controller = new AbortController();

      requestControllerRef.current = controller;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      setAvatarUnavailable(false);

      try {
        /* ===============================================
             OWN DESIGNER PROFILE
             =============================================== */

        if (isOwnProfile) {
          const [inventoryResult, walletResult, avatarResult] =
            await Promise.allSettled([
              API.get(INVENTORY_ENDPOINT, {
                signal: controller.signal,
              }),

              API.get(WALLET_ENDPOINT, {
                signal: controller.signal,
              }),

              API.get(MY_AVATAR_ENDPOINT, {
                signal: controller.signal,
              }),
            ]);

          if (controller.signal.aborted) {
            return;
          }

          if (inventoryResult.status === "rejected") {
            throw inventoryResult.reason;
          }

          const designs = extractArray(inventoryResult.value)
            .map(normalizeDesign)
            .filter(Boolean);

          setUserDesigns(designs);

          setProfileData(loggedUser || {});

          if (walletResult.status === "fulfilled") {
            const wallet = extractProfileObject(walletResult.value) || {};

            setAvailableBalance(
              toNumber(
                wallet?.available_balance ||
                  wallet?.balance ||
                  wallet?.cleared_balance,
                0,
              ),
            );
          } else {
            setAvailableBalance(toNumber(loggedUser?.available_balance, 0));
          }

          if (avatarResult.status === "fulfilled") {
            setAvatarData(
              normalizeAvatar(extractAvatarObject(avatarResult.value)),
            );
          } else {
            /*
             * Avatar failure should never destroy
             * the whole designer profile.
             */

            console.warn(
              "Designer avatar could not be loaded:",
              avatarResult.reason,
            );

            setAvatarData(null);

            setAvatarUnavailable(true);
          }
        } else {
          /* =============================================
               PUBLIC DESIGNER PROFILE
               ============================================= */

          const [profileResult, marketplaceResult, avatarResult] =
            await Promise.allSettled([
              API.get(`/users/${encodeURIComponent(targetDesignerId)}`, {
                signal: controller.signal,
              }),

              API.get(MARKETPLACE_ENDPOINT, {
                params: {
                  designer_id: targetDesignerId,
                },

                signal: controller.signal,
              }),

              API.get(
                `${PUBLIC_AVATAR_ENDPOINT}/${encodeURIComponent(
                  targetDesignerId,
                )}`,
                {
                  signal: controller.signal,
                },
              ),
            ]);

          if (controller.signal.aborted) {
            return;
          }

          if (profileResult.status === "rejected") {
            throw profileResult.reason;
          }

          const publicProfile = extractProfileObject(profileResult.value);

          if (!publicProfile) {
            throw new Error("The designer profile could not be found.");
          }

          let designs =
            marketplaceResult.status === "fulfilled"
              ? extractArray(marketplaceResult.value)
                  .map(normalizeDesign)
                  .filter(Boolean)
              : [];

          const hasOwnerIds = designs.some((design) => Boolean(design.ownerId));

          designs = designs.filter((design) => {
            const ownerMatches = hasOwnerIds
              ? design.ownerId === targetDesignerId
              : true;

            return ownerMatches && design.isPublic && design.isPublished;
          });

          /*
           * Preserve current showcase fallback.
           */

          if (designs.length === 0) {
            try {
              const fallbackResponse = await API.get("/showcase/pipeline", {
                params: {
                  designer_id: targetDesignerId,
                },

                signal: controller.signal,
              });

              designs = extractArray(fallbackResponse)
                .map(normalizeDesign)
                .filter(
                  (design) =>
                    Boolean(design) && design.isPublic && design.isPublished,
                );
            } catch (fallbackError) {
              if (!controller.signal.aborted) {
                console.warn("Public design fallback failed:", fallbackError);
              }
            }
          }

          setProfileData(publicProfile);

          setUserDesigns(designs);

          setAvailableBalance(0);

          /*
           * A public avatar may return 404 when the owner
           * has explicitly made it private. That should
           * NOT make the public profile fail.
           */

          if (avatarResult.status === "fulfilled") {
            setAvatarData(
              normalizeAvatar(extractAvatarObject(avatarResult.value)),
            );
          } else {
            setAvatarData(null);

            setAvatarUnavailable(true);

            const status = avatarResult.reason?.response?.status;

            if (status !== 404) {
              console.warn(
                "Public Fashion Persona could not be loaded:",
                avatarResult.reason,
              );
            }
          }
        }
      } catch (requestError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Error loading designer profile:", requestError);

        setError(
          getErrorMessage(
            requestError,
            "The designer profile could not be loaded.",
          ),
        );
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;

          setLoading(false);

          setRefreshing(false);
        }
      }
    },
    [isOwnProfile, loggedUser, targetDesignerId],
  );

  useEffect(() => {
    void fetchProfile();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [fetchProfile]);

  /* =======================================================
     Modal Keyboard Handling
     ======================================================= */

  useEffect(() => {
    if (!previewDesign) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setPreviewDesign(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewDesign]);

  /* =======================================================
     Derived Profile Data
     ======================================================= */

  const profileId = cleanText(
    profileData?.id ||
      profileData?._id ||
      profileData?.user_id ||
      targetDesignerId,
  );

  const profileName = cleanText(
    profileData?.full_name || profileData?.name || profileData?.username,
    "Visionary Designer",
  );

  const profileRole = humanize(profileData?.role, "Designer");

  const profilePicture = resolveImageSrc(
    profileData?.profile_image_url ||
      profileData?.profile_image ||
      profileData?.avatar_url ||
      profileData?.avatar,
  );

  const currentRank = getDesignerRank(
    profileData?.total_completed_bookings ||
      profileData?.completed_bookings ||
      profileData?.completed_count,
  );

  const rating = Math.min(
    5,
    Math.max(0, toNumber(profileData?.avg_rating || profileData?.rating, 0)),
  );

  const isVerified = toBoolean(
    profileData?.is_verified ||
      profileData?.verified ||
      profileData?.verification_status === "verified",
    false,
  );

  /*
   * Never expose private e-mail through this
   * component unless:
   *
   * - viewer owns the profile, OR
   * - profile explicitly allows public e-mail.
   */

  const publicEmail =
    isOwnProfile ||
    toBoolean(
      profileData?.show_email_publicly || profileData?.public_email,
      false,
    )
      ? cleanText(profileData?.email)
      : "";

  const portfolioUrl = normalizeExternalUrl(
    profileData?.portfolio_url ||
      profileData?.website_url ||
      profileData?.website,
  );

  const avatarFeaturedDesign = avatarData?.featuredDesign || null;

  const hasFashionPersona = Boolean(avatarData);

  const personaUsedAsProfilePicture = Boolean(
    avatarData?.exists &&
    (avatarData?.useAsProfilePicture ||
      toBoolean(
        avatarData?.config?.useAsProfilePicture ??
          avatarData?.config?.use_as_profile_picture,
        false,
      )),
  );

  /* =======================================================
     Portfolio Statistics
     ======================================================= */

  const statistics = useMemo(() => {
    const editorDesigns = userDesigns.filter(
      (design) => design.isEditorDesign,
    ).length;

    const manualUploads = userDesigns.filter(
      (design) => !design.isEditorDesign,
    ).length;

    const liveDesigns = userDesigns.filter(
      (design) => design.isPublic && design.isPublished,
    ).length;

    return {
      total: userDesigns.length,

      editorDesigns,

      manualUploads,

      liveDesigns,
    };
  }, [userDesigns]);

  /* =======================================================
     Design Actions
     ======================================================= */

  const openShowcase = useCallback(
    (design) => {
      const identifier = design?.slug || design?.id;

      if (identifier && design?.isPublic && design?.isPublished) {
        navigate(`/designer/showcase/${encodeURIComponent(identifier)}`);

        return;
      }

      setPreviewDesign(design);
    },
    [navigate],
  );

  const getDesignAction = useCallback(() => {
    if (!isOwnProfile && isCreator) {
      return {
        type: "book",

        label: "Book Concept",

        Icon: Zap,
      };
    }

    return {
      type: "view",

      label: "View Design",

      Icon: Eye,
    };
  }, [isCreator, isOwnProfile]);

  const performDesignAction = useCallback(
    (design) => {
      const action = getDesignAction(design);

      if (action.type === "book") {
        navigate(
          `/creator/bookings/new?designer_id=${encodeURIComponent(
            profileId,
          )}&design_id=${encodeURIComponent(design.id)}`,
        );

        return;
      }

      openShowcase(design);
    },
    [getDesignAction, navigate, openShowcase, profileId],
  );

  /* =======================================================
     Featured Design Actions
     ======================================================= */

  const handleFeaturedDesign = useCallback(() => {
    if (!avatarFeaturedDesign) {
      return;
    }

    const matchingDesign = userDesigns.find(
      (design) => design.id === avatarFeaturedDesign.id,
    );

    setPreviewDesign(matchingDesign || avatarFeaturedDesign);
  }, [avatarFeaturedDesign, userDesigns]);

  /* =======================================================
     Loading / Fatal Error
     ======================================================= */

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profileData && error) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-400/20 dark:bg-rose-400/10">
          <AlertTriangle
            size={34}
            className="mx-auto text-rose-600 dark:text-rose-300"
          />

          <h1 className="mt-5 text-xl font-bold text-rose-800 dark:text-rose-100">
            Profile unavailable
          </h1>

          <p className="mt-3 text-sm leading-7 text-rose-700/75 dark:text-rose-200/70">
            {error}
          </p>

          <button
            type="button"
            onClick={() => fetchProfile()}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-[9px] font-black uppercase tracking-[0.14em] text-white"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /* =======================================================
     Render
     ======================================================= */

  return (
    <div className="relative mx-auto max-w-[1500px] space-y-8 pb-20 text-slate-950 dark:text-white">
      {/* ===================================================
          Ambient Lighting
          =================================================== */}

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-52 -top-52 h-[40rem] w-[40rem] rounded-full bg-[#D4AF37]/10 blur-[180px]" />

        <div className="absolute -bottom-52 -left-52 h-[36rem] w-[36rem] rounded-full bg-violet-500/[0.06] blur-[180px]" />
      </div>

      {/* ===================================================
          PROFILE HERO
          =================================================== */}

      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#090909] sm:p-7 lg:p-8">
        <Compass
          size={420}
          strokeWidth={0.45}
          className="pointer-events-none absolute -right-24 -top-32 rotate-12 text-[#D4AF37] opacity-[0.035]"
        />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          {/* ===============================================
              Fashion Persona
              =============================================== */}

          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-violet-500 dark:text-violet-300">
                  <Sparkles size={12} />
                  Fashion Persona
                </p>

                <p className="mt-1 text-[10px] text-slate-400 dark:text-white/30">
                  Shared designer identity
                </p>
              </div>

              {avatarData && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.13em] text-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/30">
                  Version {avatarData.version}
                </span>
              )}
            </div>

            {hasFashionPersona ? (
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-black shadow-xl dark:border-white/10">
                <FashionPersonaAvatar
                  config={avatarData.config}
                  pose={avatarData.pose}
                  backgroundTheme={avatarData.backgroundTheme}
                  displayMode={avatarData.displayMode}
                  featuredDesign={avatarFeaturedDesign}
                  interactive={Boolean(avatarFeaturedDesign)}
                  onFeaturedDesignClick={handleFeaturedDesign}
                  avatarLabel={
                    isOwnProfile ? "Your Fashion Persona" : profileName
                  }
                  ariaLabel={`${profileName} Fashion Persona`}
                />
              </div>
            ) : (
              <div className="flex min-h-[500px] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50 px-6 text-center dark:border-white/10 dark:bg-white/[0.025]">
                {profilePicture ? (
                  <div className="h-28 w-28 overflow-hidden rounded-full border border-[#D4AF37]/30 shadow-lg">
                    <SafeImage
                      src={profilePicture}
                      alt={`${profileName} profile`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/15">
                    <User size={42} />
                  </div>
                )}

                <p className="mt-5 text-sm font-bold text-slate-700 dark:text-white/60">
                  Fashion Persona unavailable
                </p>

                <p className="mt-2 max-w-sm text-xs leading-6 text-slate-400 dark:text-white/30">
                  {isOwnProfile
                    ? "Your avatar could not be loaded. Open Avatar Studio to create or update your Fashion Persona."
                    : avatarUnavailable
                      ? "This designer's Fashion Persona is currently private or unavailable."
                      : "This designer has not configured a Fashion Persona yet."}
                </p>
              </div>
            )}

            {/* Avatar action */}

            {isOwnProfile && (
              <Link
                to="/designer/avatar-studio"
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/10 px-4 text-[8px] font-black uppercase tracking-[0.15em] text-violet-600 transition hover:bg-violet-500 hover:text-white dark:text-violet-200"
              >
                <Sparkles size={14} />
                Customize Avatar
              </Link>
            )}
          </div>

          {/* ===============================================
              Profile Information
              =============================================== */}

          <div className="flex flex-col justify-center">
            {/* =============================================
                Shared Designer Profile Identity

                ProfileIdentity chooses:

                Fashion Persona
                when useAsProfilePicture = true
                         ↓
                normal profile image
                         ↓
                initials

                avatarData is already loaded above, so this
                does NOT make another avatar API request.
                ============================================= */}

            <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative h-28 w-28 shrink-0">
                <ProfileIdentity
                  user={profileData}
                  userId={profileId}
                  avatar={avatarData}
                  isOwnProfile={isOwnProfile}
                  autoLoadAvatar={false}
                  size="2xl"
                  shape="rounded"
                  className="
                    h-full
                    w-full
                    border-[#D4AF37]/20
                    shadow-[0_18px_45px_rgba(0,0,0,0.18)]
                  "
                  ariaLabel={`${profileName} profile identity`}
                  title={`${profileName} profile`}
                />

                {isVerified && (
                  <div
                    title="Verified Designer"
                    className="
                      absolute
                      -bottom-2
                      -right-2
                      grid
                      h-9
                      w-9
                      place-items-center
                      rounded-full
                      border-4
                      border-white
                      bg-emerald-500
                      text-white
                      shadow-lg

                      dark:border-[#090909]
                    "
                  >
                    <ShieldCheck size={15} />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-violet-500 dark:text-violet-300">
                  Designer Identity
                </p>

                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400 dark:text-white/30">
                  {personaUsedAsProfilePicture
                    ? "Fashion Persona is being used as this Designer's profile picture."
                    : "Standard Designer profile identity."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-[#9A7618] dark:text-[#D4AF37]">
                <ShieldCheck size={11} />

                {isVerified ? `Verified ${profileRole}` : profileRole}
              </span>

              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.15em] ${currentRank.className}`}
              >
                <Award size={11} />

                {currentRank.name}
              </span>
            </div>

            <h1 className="mt-5 font-serif text-4xl tracking-[-0.035em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              {profileName}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 dark:text-white/40">
              {cleanText(
                profileData?.bio || profileData?.about,
                "Fashion designer and creative professional showcasing original concepts and visual design work.",
              )}
            </p>

            {/* Profile metadata */}

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 dark:text-white/35">
              {publicEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail
                    size={12}
                    className="text-[#A17E1F] dark:text-[#D4AF37]"
                  />

                  {publicEmail}
                </span>
              )}

              {(profileData?.city || profileData?.country) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin
                    size={12}
                    className="text-[#A17E1F] dark:text-[#D4AF37]"
                  />

                  {[profileData?.city, profileData?.country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}

              {rating > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[#A17E1F] dark:text-[#D4AF37]">
                  <Star size={12} fill="currentColor" />
                  {rating.toFixed(1)} / 5.0
                </span>
              )}
            </div>

            {/* Featured design summary */}

            {avatarFeaturedDesign && (
              <div className="mt-7 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/20 dark:bg-violet-500/[0.07]">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
                    <SafeImage
                      src={avatarFeaturedDesign.image}
                      alt={avatarFeaturedDesign.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[7px] font-black uppercase tracking-[0.17em] text-violet-500 dark:text-violet-300">
                      Persona Featured Design
                    </p>

                    <h2 className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">
                      {avatarFeaturedDesign.title}
                    </h2>

                    <div className="mt-2">
                      <FashionPersonaDesignBadge
                        featuredDesign={avatarFeaturedDesign}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFeaturedDesign}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-500 transition hover:bg-violet-500 hover:text-white dark:border-white/10 dark:bg-white/[0.05]"
                    title="View featured design"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Header Actions */}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {isOwnProfile ? (
                <>
                  <Link
                    to="/designer/upload"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-[#D4AF37]/50 hover:text-[#A17E1F] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:text-[#D4AF37]"
                  >
                    <UploadCloud size={15} />
                    Upload Design
                  </Link>

                  <Link
                    to="/designer/profile-settings"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#A17E1F] dark:border-white/10 dark:bg-white/[0.025] dark:text-white/50"
                  >
                    <User size={15} />
                    Edit Profile
                  </Link>

                  <Link
                    to="/designer/avatar-studio"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/10 px-5 text-[9px] font-black uppercase tracking-[0.16em] text-violet-600 transition hover:bg-violet-600 hover:text-white dark:text-violet-200"
                  >
                    <Sparkles size={15} />
                    Avatar Studio
                  </Link>
                </>
              ) : isCreator ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/creator/bookings/new?designer_id=${encodeURIComponent(
                        profileId,
                      )}`,
                    )
                  }
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-[#E2C45D] sm:col-span-2"
                >
                  <Zap size={15} />
                  Initiate Commission
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("designer-profile-showcase")
                      ?.scrollIntoView({
                        behavior: "smooth",

                        block: "start",
                      })
                  }
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-[#E2C45D] sm:col-span-2"
                >
                  <Palette size={15} />
                  Browse Portfolio
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================
          Non-fatal Profile Error
          =================================================== */}

      {error && profileData && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />

            <p className="text-sm leading-6">{error}</p>
          </div>

          <button
            type="button"
            onClick={() =>
              fetchProfile({
                silent: true,
              })
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-[8px] font-black uppercase tracking-[0.14em] text-white"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      )}

      {/* ===================================================
          MAIN CONTENT
          =================================================== */}

      <section className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* =================================================
            Metrics Sidebar
            ================================================= */}

        <aside className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#0A0A0A]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#A17E1F] dark:text-[#D4AF37]">
                Studio Metrics
              </p>

              <h2 className="mt-1 font-serif text-2xl text-slate-950 dark:text-white">
                Portfolio summary
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchProfile({
                  silent: true,
                })
              }
              disabled={refreshing}
              aria-label="Refresh profile"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-[#D4AF37] hover:text-[#A17E1F] disabled:opacity-50 dark:border-white/10 dark:text-white/30 dark:hover:text-[#D4AF37]"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {[
              ["Catalog Assets", statistics.total, ShoppingBag],

              ["Editor Designs", statistics.editorDesigns, Layers3],

              ["Image Uploads", statistics.manualUploads, FileImage],

              ["Live Showcase", statistics.liveDesigns, Eye],
            ].map(([label, value, Icon]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]"
              >
                <div className="flex items-center justify-between gap-3">
                  <Icon
                    size={15}
                    className="text-[#A17E1F] dark:text-[#D4AF37]"
                  />

                  <span className="font-serif text-3xl text-slate-950 dark:text-white">
                    {value}
                  </span>
                </div>

                <p className="mt-3 text-[7px] font-black uppercase tracking-[0.13em] text-slate-400 dark:text-white/30">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Fashion Persona status */}

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-400/20 dark:bg-violet-500/[0.07]">
            <div className="flex items-center gap-2">
              <Sparkles
                size={14}
                className="text-violet-500 dark:text-violet-300"
              />

              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
                Fashion Persona
              </p>
            </div>

            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white/70">
              {avatarData
                ? avatarData.isPublic
                  ? "Public Persona"
                  : "Private Persona"
                : "Unavailable"}
            </p>

            {avatarData && (
              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
                {humanize(avatarData.pose, "Standing")}

                {" · "}

                {humanize(avatarData.displayMode, "Showcase")}
              </p>
            )}

            {isOwnProfile && (
              <Link
                to="/designer/avatar-studio"
                className="mt-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300"
              >
                Customize Persona
                <ArrowRight size={12} />
              </Link>
            )}
          </div>

          {isOwnProfile && (
            <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-5">
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#9A7618] dark:text-[#D4AF37]/70">
                Available Capital
              </p>

              <p className="mt-2 font-serif text-3xl text-slate-950 dark:text-white">
                {formatMoney(availableBalance)}
              </p>

              <Link
                to="/designer/wallet"
                className="mt-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.14em] text-[#9A7618] hover:text-[#6E5310] dark:text-[#D4AF37]"
              >
                Open Wallet
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </aside>

        {/* =================================================
            Portfolio / Biography
            ================================================= */}

        <div
          id="designer-profile-showcase"
          className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0A0A0A] sm:p-7"
        >
          {/* Tabs */}

          <div className="flex gap-6 overflow-x-auto border-b border-slate-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab("designs")}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-4 text-[9px] font-black uppercase tracking-[0.18em] transition ${
                activeTab === "designs"
                  ? "border-[#D4AF37] text-slate-950 dark:text-white"
                  : "border-transparent text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/60"
              }`}
            >
              <Palette size={13} />
              Showcase
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("about")}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-4 text-[9px] font-black uppercase tracking-[0.18em] transition ${
                activeTab === "about"
                  ? "border-[#D4AF37] text-slate-950 dark:text-white"
                  : "border-transparent text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/60"
              }`}
            >
              <User size={13} />
              Profile Bio
            </button>
          </div>

          {/* ===============================================
              Designs Tab
              =============================================== */}

          {activeTab === "designs" ? (
            userDesigns.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center dark:border-white/10 dark:bg-white/[0.025]">
                <ShoppingBag
                  size={32}
                  className="text-slate-300 dark:text-white/15"
                />

                <h3 className="mt-5 font-serif text-2xl text-slate-900 dark:text-white">
                  No designs in this portfolio
                </h3>

                <p className="mt-2 max-w-md text-sm leading-7 text-slate-500 dark:text-white/35">
                  {isOwnProfile
                    ? "Upload a finished presentation image to build your profile."
                    : "This designer has not published any showcase designs yet."}
                </p>

                {isOwnProfile && (
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <Link
                      to="/designer/upload"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-600 dark:border-white/10 dark:text-white/50"
                    >
                      <UploadCloud size={14} />
                      Upload Design
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
                {userDesigns.map((design) => {
                  const action = getDesignAction(design);

                  const ActionIcon = action.Icon;

                  return (
                    <article
                      key={design.id}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-[#101010]"
                    >
                      {/* Image */}

                      <button
                        type="button"
                        onClick={() => setPreviewDesign(design)}
                        className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left dark:bg-black"
                      >
                        <SafeImage
                          src={design.image}
                          alt={design.title}
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/5" />

                        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
                          <SourceBadge design={design} />
                        </div>

                        <span className="absolute bottom-3 left-3 max-w-[65%] truncate rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.13em] text-white backdrop-blur-md">
                          {design.category}
                        </span>
                      </button>

                      {/* Details */}

                      <div className="p-5">
                        <h3 className="truncate font-serif text-xl text-slate-950 dark:text-white">
                          {design.title}
                        </h3>

                        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-white/40">
                          {design.description}
                        </p>

                        {design.tags.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {design.tags.slice(0, 3).map((tag) => (
                              <span
                                key={`${design.id}-${tag}`}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[7px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:bg-white/[0.05] dark:text-white/35"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-white/5 dark:text-white/30">
                          <span>{formatDate(design.createdAt)}</span>

                          <span className="inline-flex items-center gap-1.5">
                            {design.isPublished && design.isPublic ? (
                              <CheckCircle2
                                size={11}
                                className="text-emerald-500"
                              />
                            ) : (
                              <Clock3 size={11} className="text-amber-500" />
                            )}

                            {design.isPublished && design.isPublic
                              ? "Live"
                              : "Draft"}
                          </span>
                        </div>

                        {/* Actions */}

                        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                          <button
                            type="button"
                            onClick={() => performDesignAction(design)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-3 text-[8px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <ActionIcon size={13} />

                            {action.label}
                          </button>

                          <button
                            type="button"
                            onClick={() => openShowcase(design)}
                            aria-label={`View ${design.title}`}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-[#D4AF37] hover:text-[#A17E1F] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40 dark:hover:text-[#D4AF37]"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : (
            /* =============================================
               Biography Tab
               ============================================= */

            <div className="mt-6 space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.18em] text-[#A17E1F] dark:text-[#D4AF37]">
                  <Sparkles size={13} />
                  Artist Biography
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-slate-600 dark:text-white/50">
                  {cleanText(
                    profileData?.bio || profileData?.about,
                    "This designer has not added a public biography yet.",
                  )}
                </p>
              </section>

              {/* Fashion Persona Bio Card */}

              {avatarData && (
                <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-6 dark:border-violet-400/20 dark:bg-violet-500/[0.06]">
                  <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                    <Sparkles size={13} />
                    Fashion Persona
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Pose", humanize(avatarData.pose)],

                      ["Background", humanize(avatarData.backgroundTheme)],

                      ["Display", humanize(avatarData.displayMode)],

                      [
                        "Visibility",
                        avatarData.isPublic ? "Public" : "Private",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-violet-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                      >
                        <p className="text-[7px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-white/25">
                          {label}
                        </p>

                        <p className="mt-2 text-xs font-bold text-slate-800 dark:text-white/70">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {portfolioUrl && (
                <a
                  href={portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-[#D4AF37]/50 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#A17E1F] shadow-sm dark:bg-white/[0.05] dark:text-[#D4AF37]">
                    <Globe size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Visit External Portfolio
                    </p>

                    <p className="mt-1 truncate text-xs text-slate-400 dark:text-white/30">
                      {portfolioUrl}
                    </p>
                  </div>

                  <ArrowRight
                    size={14}
                    className="shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#A17E1F] dark:text-white/20 dark:group-hover:text-[#D4AF37]"
                  />
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================
          DESIGN PREVIEW MODAL
          =================================================== */}

      {previewDesign && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${previewDesign.title} preview`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewDesign(null);
            }
          }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-6"
        >
          <section className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A] text-white shadow-2xl">
            {/* Modal Header */}

            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <SourceBadge design={previewDesign} />

                <h2 className="mt-3 truncate text-xl font-bold">
                  {previewDesign.title}
                </h2>

                <p className="mt-1 text-xs text-white/35">
                  {previewDesign.category}

                  {" · "}

                  {formatDate(previewDesign.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewDesign(null)}
                aria-label="Close design preview"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal Body */}

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div className="flex min-h-[320px] max-h-[65vh] items-center justify-center">
                  <SafeImage
                    src={previewDesign.image}
                    alt={previewDesign.title}
                    className="max-h-[65vh] w-full object-contain"
                  />
                </div>
              </div>

              <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/55">
                {previewDesign.description}
              </p>

              {previewDesign.tags?.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {previewDesign.tags.map((tag) => (
                    <span
                      key={`${previewDesign.id}-modal-${tag}`}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-white/40"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setPreviewDesign(null)}
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-5 text-[9px] font-black uppercase tracking-[0.14em] text-white/60 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>

              {previewDesign.isPublic && previewDesign.isPublished && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDesign(null);

                    openShowcase(previewDesign);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-5 text-[9px] font-black uppercase tracking-[0.14em] text-[#F0D783] hover:bg-[#D4AF37]/20"
                >
                  <Eye size={14} />
                  Public Showcase
                </button>
              )}

              {getDesignAction(previewDesign).type !== "view" && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDesign(null);

                    performDesignAction(previewDesign);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 text-[9px] font-black uppercase tracking-[0.14em] text-black hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {React.createElement(getDesignAction(previewDesign).Icon, {
                    size: 14,
                  })}

                  {getDesignAction(previewDesign).label}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
