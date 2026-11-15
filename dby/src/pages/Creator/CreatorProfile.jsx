"use strict";

/*
=========================================================
DesignByYou
Creator Profile
Version 3.3
=========================================================

PURPOSE
---------------------------------------------------------

Authenticated Creator profile / identity dashboard.

Sources of truth:

GET /auth/me
    → Creator account/profile data

GET /avatar/me
    → Creator Fashion Persona (only while SHOW_FASHION_PERSONA = true)

GET /p2p-bookings/pipeline
    → Creator contract statistics

GET /creators/studio/assets
    → Creator-owned Studio / Fashion Editor assets
      including both Public and Private saved creations

=========================================================
IMPORTANT
---------------------------------------------------------

This page represents the LOGGED-IN Creator.

It does NOT use:

GET /users/:id

and does not expose or depend on generic user records.

Public Creator profiles, if added later, should use a
separate dedicated public-safe backend endpoint.

=========================================================
VERSION 3.3
---------------------------------------------------------

- Keeps all Fashion Persona / avatar code in this file.
- Adds SHOW_FASHION_PERSONA as a temporary UI feature flag.
- When false, the page does not request /avatar/me.
- When false, Persona UI, Persona Configuration and Featured Design are hidden.
- When false, ProfileIdentity falls back to the normal Creator profile image / initials.
- Creator Identity expands to the full profile width while Persona is hidden.
- Keeps owner-only My Creations with All / Public / Private controls.
- Private creations never navigate through the public Showcase route.
=========================================================
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Globe2,
  Image as ImageIcon,
  Layers3,
  Loader2,
  LockKeyhole,
  Palette,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  UploadCloud,
  User,
  WalletCards,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import API from "../../api/axios";

import { useAuth } from "../../context/AuthContext.helpers.js";

import FashionPersonaAvatar, {
  FashionPersonaDesignBadge,
} from "../avatar/FashionPersonaAvatar";

import ProfileIdentity from "../avatar/ProfileIdentity";

/*=========================================================
Endpoints
=========================================================*/

const PROFILE_ENDPOINT = "/auth/me";

const AVATAR_ENDPOINT = "/avatar/me";

const BOOKINGS_ENDPOINT = "/p2p-bookings/pipeline";

const CREATOR_ASSETS_ENDPOINT = "/creators/studio/assets";

/*=========================================================
Temporary Feature Flags
=========================================================*/

/*
 * Keep every Fashion Persona / avatar implementation in this file,
 * but hide the feature from the Creator Profile for now.
 *
 * false:
 * - no /avatar/me request
 * - no Persona UI
 * - no Persona Configuration UI
 * - no Persona Featured Design UI
 * - normal profile image / initials are used
 *
 * true:
 * - restores the existing Persona behavior without re-adding code
 */
const SHOW_FASHION_PERSONA = false;

const CREATIONS_PAGE_SIZE = 12;

const CREATION_VISIBILITY_TABS = [
  {
    value: "all",
    label: "All",
  },
  {
    value: "public",
    label: "Public",
  },
  {
    value: "private",
    label: "Private",
  },
];

/*=========================================================
Booking Status
=========================================================*/

const TERMINAL_BOOKING_STATUSES = new Set([
  "completed",
  "delivered",
  "cancelled",
]);

const COMPLETED_BOOKING_STATUSES = new Set(["completed", "delivered"]);

const ATTENTION_BOOKING_STATUSES = new Set([
  "awaiting_payment",
  "review_prototype",
  "review_final",
  "review",
  "refund_failed",
]);

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function normalizeStatus(value) {
  return cleanText(value).toLowerCase();
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = normalizeStatus(value);

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function humanize(value, fallback = "") {
  const text = cleanText(value);

  if (!text) {
    return fallback;
  }

  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isCancelledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function getErrorMessage(error, fallback) {
  if (isCancelledRequest(error)) {
    return "";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

/*=========================================================
Backend Media
=========================================================*/

function getBackendOrigin() {
  const configured = cleanText(
    API.defaults.baseURL || import.meta.env.VITE_API_URL || "",
  );

  if (/^https?:\/\//i.test(configured)) {
    try {
      const url = new URL(configured);

      return url.origin;
    } catch {
      return configured
        .replace(/\/api(?:\/v\d+)?\/?$/i, "")
        .replace(/\/+$/, "");
    }
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

function resolveImageSrc(value) {
  const path = cleanText(value);

  if (!path) {
    return "";
  }

  if (
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    /^https?:\/\//i.test(path)
  ) {
    return path.replace(/\\/g, "/");
  }

  const origin = getBackendOrigin();

  if (!origin) {
    return path;
  }

  return `${origin}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

/*=========================================================
Response Helpers
=========================================================*/

function extractProfileObject(response) {
  const body = response?.data;

  const candidates = [body?.user, body?.data?.user, body?.data, body];

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

function extractBookings(response) {
  const body = response?.data;

  if (Array.isArray(body?.data)) {
    return body.data;
  }

  if (Array.isArray(body?.bookings)) {
    return body.bookings;
  }

  if (Array.isArray(body)) {
    return body;
  }

  return [];
}

/*=========================================================
Creator Studio Assets
=========================================================*/

function normalizeCreatorAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  const id = cleanText(asset.id);

  if (!id) {
    return null;
  }

  const explicitVisibility = normalizeStatus(asset.visibility);

  const isPublic =
    explicitVisibility === "public"
      ? true
      : explicitVisibility === "private"
        ? false
        : toBoolean(asset.is_public, false);

  const category =
    asset.category &&
    typeof asset.category === "object" &&
    !Array.isArray(asset.category)
      ? {
          id: cleanText(asset.category.id),
          name: cleanText(asset.category.name),
          slug: cleanText(asset.category.slug),
          description: cleanText(asset.category.description),
        }
      : null;

  const tags = Array.isArray(asset.tags)
    ? asset.tags.map((tag) => cleanText(tag)).filter(Boolean)
    : [];

  return {
    id,

    ownerId: cleanText(asset.owner_id),

    title: cleanText(asset.title, "Untitled Creation"),

    slug: cleanText(asset.slug),

    description: cleanText(asset.description),

    previewUrl: resolveImageSrc(
      asset.preview_url ||
        asset.watermarked_preview_url ||
        asset.image_url ||
        asset.image,
    ),

    styleCategory: cleanText(asset.style_category),

    format: normalizeStatus(asset.format),

    category,

    tags,

    visibility: isPublic ? "public" : "private",

    isPublic,

    isPublished: toBoolean(asset.is_published, true),

    sourceType: normalizeStatus(asset.source_type || "upload"),

    editorProjectId: cleanText(asset.editor_project_id),

    isEditable: toBoolean(asset.is_editable, false),

    allowRemix: toBoolean(asset.allow_remix, false),

    originalDesignId: cleanText(asset.original_design_id),

    createdAt: asset.created_at || null,

    updatedAt: asset.updated_at || null,
  };
}

function extractCreatorAssets(response) {
  const body = response?.data || {};

  const rawAssets = Array.isArray(body?.data) ? body.data : [];

  const assets = rawAssets.map(normalizeCreatorAsset).filter(Boolean);

  const counts = {
    all: Math.max(0, Number(body?.counts?.all || 0) || 0),

    public: Math.max(0, Number(body?.counts?.public || 0) || 0),

    private: Math.max(0, Number(body?.counts?.private || 0) || 0),
  };

  const currentPage = Math.max(1, Number(body?.pagination?.page || 1) || 1);

  const limit = Math.max(
    1,
    Number(body?.pagination?.limit || CREATIONS_PAGE_SIZE) ||
      CREATIONS_PAGE_SIZE,
  );

  const total = Math.max(0, Number(body?.pagination?.total || 0) || 0);

  const totalPages = Math.max(
    0,
    Number(body?.pagination?.total_pages || 0) || 0,
  );

  return {
    assets,

    counts,

    pagination: {
      page: currentPage,

      limit,

      total,

      totalPages,

      hasMore: toBoolean(body?.pagination?.has_more, false),
    },
  };
}

/*=========================================================
Featured Design
=========================================================*/

function normalizeFeaturedDesign(design) {
  if (!design || typeof design !== "object") {
    return null;
  }

  const id = cleanText(design.id || design.design_id);

  if (!id) {
    return null;
  }

  const originalDesignId = cleanText(design.original_design_id);

  return {
    ...design,

    id,

    title: cleanText(design.title, "Featured Design"),

    slug: cleanText(design.slug),

    description: cleanText(design.description),

    image: resolveImageSrc(
      design.watermarked_preview_url ||
        design.preview_url ||
        design.image_url ||
        design.image,
    ),

    sourceType: normalizeStatus(design.source_type || "upload"),

    isEditable: toBoolean(design.is_editable, false),

    allowRemix: toBoolean(design.allow_remix, false),

    originalDesignId,

    isRemix: Boolean(originalDesignId),
  };
}

/*=========================================================
Avatar
=========================================================*/

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return null;
  }

  const config =
    avatar.avatar_config &&
    typeof avatar.avatar_config === "object" &&
    !Array.isArray(avatar.avatar_config)
      ? avatar.avatar_config
      : {};

  return {
    exists: toBoolean(avatar.exists, Boolean(avatar.id)),

    id: avatar.id || null,

    userId: cleanText(avatar.user_id || avatar.user?.id),

    config,

    /*
    Avatar Studio stores this preference inside
    avatar_config.

    ProfileIdentity reads it to decide whether the
    Fashion Persona or normal profile image wins.
    */

    useAsProfilePicture: toBoolean(
      avatar.useAsProfilePicture ??
        avatar.use_as_profile_picture ??
        config.useAsProfilePicture ??
        config.use_as_profile_picture,
      false,
    ),

    featuredDesignId: cleanText(avatar.featured_design_id),

    featuredDesign: normalizeFeaturedDesign(avatar.featured_design),

    displayMode: cleanText(avatar.display_mode, "showcase"),

    pose: cleanText(avatar.pose, "standing"),

    backgroundTheme: cleanText(avatar.background_theme, "studio"),

    previewUrl: resolveImageSrc(avatar.avatar_preview_url),

    isPublic: toBoolean(avatar.is_public, true),

    version: Math.max(1, Number(avatar.avatar_version || 1) || 1),

    createdAt: avatar.created_at || null,

    updatedAt: avatar.updated_at || null,
  };
}

/*=========================================================
Loading
=========================================================*/

function LoadingScreen() {
  return (
    <div
      className="
        flex min-h-[70vh] flex-col items-center justify-center gap-5 bg-canvas
      "
    >
      <div
        className="
          relative grid h-16 w-16 place-items-center rounded-md border border-line bg-subtle
        "
      >
        <Loader2
          size={27}
          className="
            animate-spin text-action
          "
        />
      </div>

      <span
        className="
          text-[11px] font-semibold uppercase tracking-normal text-muted
        "
      >
        Loading Creator Identity
      </span>
    </div>
  );
}

/*=========================================================
Creator Profile
=========================================================*/

export default function CreatorProfile() {
  const navigate = useNavigate();

  const { user: currentUser, setUser } = useAuth();

  const requestControllerRef = useRef(null);

  const creationsRequestControllerRef = useRef(null);

  /*
  =======================================================
  AUTH CONTEXT REFS

  IMPORTANT:

  Version 3.0 had:

      fetchProfile dependency:
          [currentUser, setUser]

  and inside fetchProfile:

      setUser(profileObject)

  That changed currentUser, recreated fetchProfile and
  retriggered the useEffect indefinitely.

  These refs keep the newest AuthContext values available
  without making fetchProfile depend on user object identity.
  =======================================================
  */

  const currentUserRef = useRef(currentUser);

  const setUserRef = useRef(setUser);

  /*=======================================================
  State
  =======================================================*/

  const [profile, setProfile] = useState(currentUser || null);

  const [avatar, setAvatar] = useState(null);

  const [avatarUnavailable, setAvatarUnavailable] = useState(false);

  const [bookings, setBookings] = useState([]);

  const [bookingsUnavailable, setBookingsUnavailable] = useState(false);

  const [creations, setCreations] = useState([]);

  const [creationCounts, setCreationCounts] = useState({
    all: 0,
    public: 0,
    private: 0,
  });

  const [creationVisibility, setCreationVisibility] = useState("all");

  const [creationsPage, setCreationsPage] = useState(1);

  const [creationsPagination, setCreationsPagination] = useState({
    page: 1,
    limit: CREATIONS_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const [creationsLoading, setCreationsLoading] = useState(true);

  const [creationsRefreshing, setCreationsRefreshing] = useState(false);

  const [creationsError, setCreationsError] = useState("");

  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState("");

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  /*=======================================================
  Keep Auth Context Refs Current

  This effect NEVER loads profile data.
  =======================================================*/

  useEffect(() => {
    currentUserRef.current = currentUser;

    setUserRef.current = setUser;
  }, [currentUser, setUser]);

  /*=======================================================
  Load Creator Profile

  IMPORTANT:

  This callback intentionally has an EMPTY dependency
  array.

  Everything from changing AuthContext that it needs is
  read through refs.

  Therefore setUser() cannot recreate this callback and
  cannot start another request loop.
  =======================================================*/

  const fetchProfile = useCallback(async ({ silent = false } = {}) => {
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

    setBookingsUnavailable(false);

    try {
      /*
       * Fashion Persona is temporarily hidden.
       *
       * Keep the request path and all avatar handling code available,
       * but do not call /avatar/me while the feature flag is disabled.
       */
      const avatarRequest = SHOW_FASHION_PERSONA
        ? API.get(AVATAR_ENDPOINT, {
            signal: controller.signal,
          })
        : Promise.resolve(null);

      const [profileResult, avatarResult, bookingsResult] =
        await Promise.allSettled([
          API.get(PROFILE_ENDPOINT, {
            signal: controller.signal,
          }),

          avatarRequest,

          API.get(BOOKINGS_ENDPOINT, {
            signal: controller.signal,
          }),
        ]);

      if (controller.signal.aborted) {
        return;
      }

      /*===============================================
          Profile - Primary
          ===============================================*/

      if (profileResult.status === "fulfilled") {
        const profileObject = extractProfileObject(profileResult.value);

        if (!profileObject) {
          throw new Error("Creator profile data was not returned.");
        }

        if (normalizeStatus(profileObject.role) !== "creator") {
          throw new Error("This account is not a Creator account.");
        }

        setProfile(profileObject);

        /*
            Keep AuthContext synchronized.

            IMPORTANT:
            setUser is accessed through a ref so the resulting
            currentUser update does NOT recreate fetchProfile.
            */

        const syncAuthUser = setUserRef.current;

        if (typeof syncAuthUser === "function") {
          syncAuthUser(profileObject);
        }
      } else {
        const fallbackUser = currentUserRef.current;

        if (fallbackUser && normalizeStatus(fallbackUser.role) === "creator") {
          /*
              Non-fatal network fallback.

              AuthContext came from the authenticated session
              bootstrap and remains preferable to generic
              browser storage.
              */

          setProfile(fallbackUser);
        } else {
          throw profileResult.reason;
        }
      }

      /*===============================================
          Avatar - Non-fatal
          ===============================================*/

      if (!SHOW_FASHION_PERSONA) {
        /*
         * Feature is intentionally dormant.
         * Keep avatar state empty so ProfileIdentity uses the normal
         * Creator profile image / initials.
         */
        setAvatar(null);
        setAvatarUnavailable(false);
      } else if (avatarResult.status === "fulfilled") {
        const avatarObject = extractAvatarObject(avatarResult.value);

        setAvatar(normalizeAvatar(avatarObject));
      } else {
        if (!isCancelledRequest(avatarResult.reason)) {
          setAvatarUnavailable(true);

          if (import.meta.env.DEV) {
            console.warn(
              "Creator Fashion Persona could not be loaded:",
              avatarResult.reason,
            );
          }
        }

        setAvatar(null);
      }

      /*===============================================
          Booking Statistics - Non-fatal
          ===============================================*/

      if (bookingsResult.status === "fulfilled") {
        setBookings(extractBookings(bookingsResult.value));
      } else {
        if (!isCancelledRequest(bookingsResult.reason)) {
          setBookingsUnavailable(true);

          if (import.meta.env.DEV) {
            console.warn(
              "Creator booking statistics could not be loaded:",
              bookingsResult.reason,
            );
          }
        }

        setBookings([]);
      }
    } catch (requestError) {
      if (controller.signal.aborted || isCancelledRequest(requestError)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error("Creator profile fetch failed:", requestError);
      }

      setError(
        getErrorMessage(
          requestError,
          "Your Creator profile could not be loaded.",
        ),
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;

        setLoading(false);

        setRefreshing(false);
      }
    }
  }, []);

  /*=======================================================
  Load Creator-Owned Creations

  This request is separate from /auth/me because the
  creation list is paginated and can change independently
  through the All / Public / Private tabs.
  =======================================================*/

  const fetchCreatorAssets = useCallback(
    async ({ page = 1, visibility = "all", silent = false } = {}) => {
      creationsRequestControllerRef.current?.abort();

      const controller = new AbortController();

      creationsRequestControllerRef.current = controller;

      if (silent) {
        setCreationsRefreshing(true);
      } else {
        setCreationsLoading(true);
      }

      setCreationsError("");

      try {
        const response = await API.get(CREATOR_ASSETS_ENDPOINT, {
          params: {
            page,
            limit: CREATIONS_PAGE_SIZE,
            visibility,
          },

          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const normalized = extractCreatorAssets(response);

        setCreations(normalized.assets);

        setCreationCounts(normalized.counts);

        setCreationsPagination(normalized.pagination);

        /*
         * If the current page becomes empty after changing
         * visibility, move back to the nearest valid page.
         *
         * The state change will trigger one clean reload.
         */
        if (
          normalized.pagination.totalPages > 0 &&
          page > normalized.pagination.totalPages
        ) {
          setCreationsPage(normalized.pagination.totalPages);
        } else if (normalized.pagination.totalPages === 0 && page !== 1) {
          setCreationsPage(1);
        }
      } catch (requestError) {
        if (controller.signal.aborted || isCancelledRequest(requestError)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator Studio assets could not be loaded:",
            requestError,
          );
        }

        setCreations([]);

        setCreationsError(
          getErrorMessage(
            requestError,
            "Your Creator creations could not be loaded.",
          ),
        );
      } finally {
        if (creationsRequestControllerRef.current === controller) {
          creationsRequestControllerRef.current = null;

          setCreationsLoading(false);

          setCreationsRefreshing(false);
        }
      }
    },
    [],
  );

  /*=======================================================
  Initial Profile Load

  fetchProfile is now stable, so this runs once for the
  component lifecycle rather than after every setUser().
  =======================================================*/

  useEffect(() => {
    void fetchProfile();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [fetchProfile]);

  /*=======================================================
  Creator Assets Load

  Changing the selected visibility tab or page triggers
  exactly one owner-only asset request.
  =======================================================*/

  useEffect(() => {
    void fetchCreatorAssets({
      page: creationsPage,
      visibility: creationVisibility,
    });

    return () => {
      creationsRequestControllerRef.current?.abort();
    };
  }, [creationVisibility, creationsPage, fetchCreatorAssets]);

  /*=======================================================
  Profile Data
  =======================================================*/

  const profileName = cleanText(profile?.full_name || profile?.name, "Creator");

  const email = cleanText(profile?.email);

  const companyName = cleanText(profile?.company_name);

  const preferredCategory = cleanText(profile?.preferred_category);

  const brandGuidelines = cleanText(profile?.brand_guidelines_summary);

  const defaultDimensions = cleanText(profile?.default_dimensions);

  const emailVerified = toBoolean(profile?.is_email_verified, false);

  const subscriptionTier = normalizeStatus(
    profile?.subscription_tier || "free",
  );

  const featuredDesign = avatar?.featuredDesign || null;

  const hasConfiguredPersona = Boolean(avatar?.exists);

  /*=======================================================
  Booking Statistics
  =======================================================*/

  const bookingStats = useMemo(() => {
    let active = 0;

    let completed = 0;

    let escrowProtected = 0;

    let actionRequired = 0;

    for (const booking of bookings) {
      const status = normalizeStatus(booking?.status);

      if (!TERMINAL_BOOKING_STATUSES.has(status)) {
        active += 1;
      }

      if (COMPLETED_BOOKING_STATUSES.has(status)) {
        completed += 1;
      }

      if (booking?.escrow_locked === true) {
        escrowProtected += 1;
      }

      if (ATTENTION_BOOKING_STATUSES.has(status)) {
        actionRequired += 1;
      }
    }

    return {
      total: bookings.length,

      active,

      completed,

      escrowProtected,

      actionRequired,
    };
  }, [bookings]);

  /*=======================================================
  Persona Summary
  =======================================================*/

  const personaSummary = useMemo(() => {
    if (!avatar) {
      return [];
    }

    return [
      {
        label: "Pose",

        value: humanize(avatar.pose, "Standing"),
      },

      {
        label: "Display",

        value: humanize(avatar.displayMode, "Showcase"),
      },

      {
        label: "Scene",

        value: humanize(avatar.backgroundTheme, "Studio"),
      },

      {
        label: "Visibility",

        value: avatar.isPublic ? "Public" : "Private",
      },
    ];
  }, [avatar]);

  /*=======================================================
  Featured Design
  =======================================================*/

  const handleFeaturedDesign = useCallback(() => {
    if (!featuredDesign) {
      return;
    }

    const identifier = featuredDesign.slug || featuredDesign.id;

    if (!identifier) {
      return;
    }

    navigate(`/creator/showcase/${encodeURIComponent(identifier)}`);
  }, [featuredDesign, navigate]);

  /*=======================================================
  My Creations Controls
  =======================================================*/

  const handleCreationVisibilityTab = useCallback((nextVisibility) => {
    const normalized = normalizeStatus(nextVisibility);

    if (!["all", "public", "private"].includes(normalized)) {
      return;
    }

    setCreationVisibility(normalized);

    setCreationsPage(1);
  }, []);

  const handlePreviousCreationsPage = useCallback(() => {
    setCreationsPage((currentPage) => Math.max(1, currentPage - 1));
  }, []);

  const handleNextCreationsPage = useCallback(() => {
    setCreationsPage((currentPage) => {
      if (
        creationsPagination.totalPages > 0 &&
        currentPage >= creationsPagination.totalPages
      ) {
        return currentPage;
      }

      return currentPage + 1;
    });
  }, [creationsPagination.totalPages]);

  const handleViewCreation = useCallback(
    (creation) => {
      if (!creation?.isPublic) {
        return;
      }

      const identifier = creation.slug || creation.id;

      if (!identifier) {
        return;
      }

      navigate(`/creator/showcase/${encodeURIComponent(identifier)}`);
    },
    [navigate],
  );

  const handleCreationVisibilityChange = useCallback(
    async (creation) => {
      const creationId = cleanText(creation?.id);

      if (!creationId || visibilityUpdatingId) {
        return;
      }

      const nextVisibility = creation?.isPublic ? "private" : "public";

      setVisibilityUpdatingId(creationId);

      setCreationsError("");

      try {
        await API.patch(
          `${CREATOR_ASSETS_ENDPOINT}/${encodeURIComponent(
            creationId,
          )}/visibility`,
          {
            visibility: nextVisibility,
          },
        );

        await fetchCreatorAssets({
          page: creationsPage,
          visibility: creationVisibility,
          silent: true,
        });
      } catch (requestError) {
        if (isCancelledRequest(requestError)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator asset visibility update failed:",
            requestError,
          );
        }

        setCreationsError(
          getErrorMessage(
            requestError,
            "The creation visibility could not be updated.",
          ),
        );
      } finally {
        setVisibilityUpdatingId("");
      }
    },
    [
      creationVisibility,
      creationsPage,
      fetchCreatorAssets,
      visibilityUpdatingId,
    ],
  );

  const handleRefreshAll = useCallback(async () => {
    await Promise.allSettled([
      fetchProfile({
        silent: true,
      }),

      fetchCreatorAssets({
        page: creationsPage,
        visibility: creationVisibility,
        silent: true,
      }),
    ]);
  }, [creationVisibility, creationsPage, fetchCreatorAssets, fetchProfile]);

  /*=======================================================
  Loading
  =======================================================*/

  if (loading && !profile) {
    return <LoadingScreen />;
  }

  /*=======================================================
  Fatal Error
  =======================================================*/

  if (!profile) {
    return (
      <div
        className="
          flex min-h-[70vh] items-center justify-center bg-canvas p-4 text-ink
        "
      >
        <div
          className="
            max-w-lg text-center
          "
        >
          <div
            className="
              mx-auto grid h-16 w-16 place-items-center rounded-md border border-line bg-canvas text-action dark:bg-subtle
            "
          >
            <AlertTriangle size={28} />
          </div>

          <h2
            className="
              mt-6 font-sans text-3xl
            "
          >
            {error || "Creator profile could not be loaded."}
          </h2>

          <p
            className="
              mt-3 text-sm leading-6 text-muted
            "
          >
            Retry the authenticated profile request or return to your Creator
            workspace.
          </p>

          <div
            className="
              mt-7 flex flex-col justify-center gap-3 sm:flex-row
            "
          >
            <button
              type="button"
              onClick={() => void fetchProfile()}
              className="
                inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-on-action
              "
            >
              <RefreshCw size={13} />
              Try Again
            </button>

            <button
              type="button"
              onClick={() => navigate("/creator/showcase")}
              className="
                h-9 rounded-md border border-line px-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted
              "
            >
              Creator Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative min-h-screen overflow-hidden bg-canvas pb-24 text-ink
      "
    >
      {/*===================================================
      Ambient Background
      ===================================================*/}

      <div
        className="
          pointer-events-none fixed inset-0 z-0 overflow-hidden
        "
      >


      </div>

      <div
        className="
          relative z-10 mx-auto max-w-[1400px] px-4 pt-9 sm:px-6 lg:px-10 lg:pt-12
        "
      >
        {/*=================================================
        Top Hero
        =================================================*/}

        <section
          className="
            relative mb-7 overflow-hidden rounded-md border border-line bg-subtle p-4 lg:p-4
          "
        >
          <div
            className="
              pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-subtle blur-[85px]
            "
          />

          <div
            className="
              relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between
            "
          >
            <div
              className="
                flex flex-col gap-6 sm:flex-row sm:items-center
              "
            >
              {/* ==========================================
                  Shared Profile Identity

                  ProfileIdentity chooses:

                  Persona when useAsProfilePicture = true
                  → normal profile image
                  → initials
                  ========================================== */}

              <div
                className="
                  relative h-28 w-28 shrink-0
                "
              >
                <div
                  className="
                    h-full w-full overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
                  "
                >
                  <ProfileIdentity
                    user={profile}
                    avatar={SHOW_FASHION_PERSONA ? avatar : null}
                    isOwnProfile
                    autoLoadAvatar={false}
                    size="2xl"
                    shape="rounded"
                    className="
                      h-full w-full border-0
                    "
                    ariaLabel={`${profileName} profile identity`}
                    title={`${profileName} profile`}
                  />
                </div>

                {emailVerified && (
                  <div
                    title="Email verified"
                    className="
                      absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full border-4 border-line bg-action text-on-action
                    "
                  >
                    <ShieldCheck size={15} />
                  </div>
                )}
              </div>

              <div>
                <div
                  className="
                    flex flex-wrap items-center gap-2
                  "
                >
                  <span
                    className="
                      rounded-md border border-line bg-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.17em] text-action
                    "
                  >
                    Creator
                  </span>

                  {emailVerified && (
                    <span
                      className="
                        inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-action dark:bg-subtle
                      "
                    >
                      <CheckCircle2 size={10} />
                      Email Verified
                    </span>
                  )}

                  <Link to="/creator/wallet#subscription" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs text-ink hover:bg-subtle">
                    Subscription · {humanize(subscriptionTier)}
                  </Link>
                </div>

                <h1
                  className="
                    mt-4 font-sans text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl
                  "
                >
                  {profileName}
                </h1>

                {email && (
                  <p
                    className="
                      mt-2 text-sm text-muted
                    "
                  >
                    {email}
                  </p>
                )}

                <p
                  className="
                    mt-4 max-w-2xl text-sm leading-7 text-muted
                  "
                >
                  {companyName
                    ? `Building creative projects through ${companyName}.`
                    : SHOW_FASHION_PERSONA
                      ? "Your personal Creator workspace for bookings, creative direction, and Fashion Persona identity."
                      : "Your personal Creator workspace for bookings, creative direction, and your creative library."}
                </p>
              </div>
            </div>

            {/* Actions */}

            <div
              className="
                flex flex-col gap-3 sm:flex-row
              "
            >
              <button
                type="button"
                onClick={() => void handleRefreshAll()}
                disabled={refreshing || creationsRefreshing}
                className="
                  inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted transition hover:border-line hover:text-action disabled:opacity-50 dark:bg-subtle
                "
              >
                <RefreshCw
                  size={14}
                  className={
                    refreshing || creationsRefreshing ? "animate-spin" : ""
                  }
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => navigate("/creator/settings")}
                className="
                  inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-action transition hover:-translate-y-0.5 hover:bg-action hover:text-on-action
                "
              >
                <Settings size={14} />
                Edit Profile
              </button>
            </div>
          </div>
        </section>

        {/*=================================================
        Error
        =================================================*/}

        {error && (
          <div
            role="alert"
            className="
              mb-7 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm text-action dark:bg-subtle
            "
          >
            <AlertTriangle
              size={17}
              className="
                mt-0.5 shrink-0
              "
            />

            <p>{error}</p>
          </div>
        )}

        {/*=================================================
        Contract Statistics
        =================================================*/}

        <section
          className="
            mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4
          "
        >
          {[
            {
              label: "Contracts",

              value: bookingsUnavailable ? "—" : bookingStats.total,

              helper: "All P2P bookings",

              icon: Briefcase,

              accent: "text-action",
            },

            {
              label: "Active",

              value: bookingsUnavailable ? "—" : bookingStats.active,

              helper: "Currently in workflow",

              icon: Clock3,

              accent: "text-action",
            },

            {
              label: "Escrow Protected",

              value: bookingsUnavailable ? "—" : bookingStats.escrowProtected,

              helper: "Contracts with secured funds",

              icon: ShieldCheck,

              accent: "text-action",
            },

            {
              label: "Completed",

              value: bookingsUnavailable ? "—" : bookingStats.completed,

              helper: "Finished bookings",

              icon: CheckCircle2,

              accent: "text-action",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className="
                    rounded-md border border-line bg-subtle p-4 transition hover:-translate-y-0.5 hover:border-line
                  "
              >
                <div
                  className="
                      flex items-start justify-between gap-4
                    "
                >
                  <div>
                    <p
                      className="
                          text-[11px] font-semibold uppercase tracking-[0.18em] text-muted
                        "
                    >
                      {item.label}
                    </p>

                    <p
                      className="
                          mt-3 font-sans text-4xl
                        "
                    >
                      {item.value}
                    </p>

                    <p
                      className="
                          mt-2 text-[10px] text-muted
                        "
                    >
                      {item.helper}
                    </p>
                  </div>

                  <div
                    className={`
                        grid h-11 w-11 place-items-center rounded-md border border-line bg-canvas dark:bg-subtle

                        ${item.accent}
                      `}
                  >
                    <Icon size={19} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/*=================================================
        Main Profile Grid
        =================================================*/}

        <section
          className={`
            grid gap-7

            ${
              SHOW_FASHION_PERSONA
                ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]"
                : "grid-cols-1"
            }
          `}
        >
          {/*===============================================
          Fashion Persona
          ===============================================*/}

          {SHOW_FASHION_PERSONA && (
            <div
              className="
              overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
            "
            >
              <div
                className="
                flex items-start justify-between gap-4 border-b border-line p-4
              "
              >
                <div>
                  <p
                    className="
                    inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-action
                  "
                  >
                    <Sparkles size={12} />
                    Fashion Persona
                  </p>

                  <h2
                    className="
                    mt-2 font-sans text-3xl
                  "
                  >
                    Visual identity
                  </h2>

                  <p
                    className="
                    mt-2 text-xs leading-5 text-muted
                  "
                  >
                    Your shared visual identity across DesignByYou.
                  </p>
                </div>

                {SHOW_FASHION_PERSONA && avatar && (
                  <span
                    className="
                    rounded-md border border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted dark:bg-subtle
                  "
                  >
                    V{avatar.version}
                  </span>
                )}
              </div>

              <div
                className="
                p-4
              "
              >
                {avatar ? (
                  <div
                    className="
                    overflow-hidden rounded-md border border-line bg-canvas
                  "
                  >
                    <FashionPersonaAvatar
                      config={avatar.config}
                      pose={avatar.pose}
                      backgroundTheme={avatar.backgroundTheme}
                      displayMode={avatar.displayMode}
                      featuredDesign={featuredDesign}
                      interactive={Boolean(featuredDesign)}
                      onFeaturedDesignClick={handleFeaturedDesign}
                      avatarLabel="Your Fashion Persona"
                      ariaLabel={`${profileName} Fashion Persona`}
                    />
                  </div>
                ) : (
                  <div
                    className="
                    flex min-h-[480px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-canvas px-7 text-center dark:bg-subtle
                  "
                  >
                    <Sparkles
                      size={30}
                      className="
                      text-muted
                    "
                    />

                    <h3
                      className="
                      mt-5 font-sans text-2xl
                    "
                    >
                      Fashion Persona unavailable
                    </h3>

                    <p
                      className="
                      mt-3 max-w-sm text-xs leading-6 text-muted
                    "
                    >
                      {avatarUnavailable
                        ? "The avatar service could not be reached. Your main Creator profile remains available."
                        : "Create a Fashion Persona to give your Creator identity a visual signature."}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/creator/avatar-studio")}
                  className="
                  mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-canvas text-[11px] font-semibold uppercase tracking-[0.17em] text-action transition hover:border-line hover:bg-subtle dark:hover:bg-action dark:hover:text-on-action
                "
                >
                  <Sparkles size={14} />

                  {hasConfiguredPersona
                    ? "Customize Persona"
                    : "Create Fashion Persona"}
                </button>
              </div>
            </div>
          )}

          {/*===============================================
          Creator Identity
          ===============================================*/}

          <div
            className="
              space-y-7
            "
          >
            {/* Brand Identity */}

            <article
              className="
                overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
              "
            >
              <div
                className="
                  flex items-center justify-between gap-4 border-b border-line p-4
                "
              >
                <div>
                  <p
                    className="
                      text-[11px] font-semibold uppercase tracking-normal text-action
                    "
                  >
                    Creator Identity
                  </p>

                  <h2
                    className="
                      mt-2 font-sans text-3xl
                    "
                  >
                    Creative profile
                  </h2>
                </div>

                <User
                  size={21}
                  className="
                    text-muted
                  "
                />
              </div>

              <div
                className="
                  grid gap-3 p-4 sm:grid-cols-2
                "
              >
                <ProfileField
                  icon={Briefcase}
                  label="Company / Brand"
                  value={companyName || "Not set"}
                />

                <ProfileField
                  icon={Tag}
                  label="Preferred Category"
                  value={
                    preferredCategory ? humanize(preferredCategory) : "Not set"
                  }
                />

                <ProfileField
                  icon={Layers3}
                  label="Default Dimensions"
                  value={defaultDimensions || "Not set"}
                />

                <ProfileField
                  icon={WalletCards}
                  label="Account Type"
                  value="Creator"
                />
              </div>

              <div
                className="
                  border-t border-line p-4
                "
              >
                <div
                  className="
                    flex items-start gap-3
                  "
                >
                  <div
                    className="
                      grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-canvas text-action dark:bg-subtle
                    "
                  >
                    <FileText size={15} />
                  </div>

                  <div>
                    <p
                      className="
                        text-[11px] font-semibold uppercase tracking-[0.16em] text-muted
                      "
                    >
                      Brand Direction
                    </p>

                    <p
                      className="
                        mt-2 text-sm leading-7 text-muted
                      "
                    >
                      {brandGuidelines ||
                        "No brand guidelines have been added yet. Add a short creative direction in Creator Settings to help keep future projects consistent."}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="
                  border-t border-line p-4
                "
              >
                <button
                  type="button"
                  onClick={() => navigate("/creator/settings")}
                  className="
                    inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-canvas text-[11px] font-semibold uppercase tracking-[0.17em] text-muted transition hover:border-line hover:text-action dark:bg-subtle
                  "
                >
                  <Settings size={13} />
                  Manage Creator Profile
                </button>
              </div>
            </article>

            {/* Action Required */}

            {bookingStats.actionRequired > 0 && (
              <button
                type="button"
                onClick={() => navigate("/creator/bookings")}
                className="
                  group flex w-full items-center gap-4 rounded-md border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-line
                "
              >
                <div
                  className="
                    grid h-12 w-12 shrink-0 place-items-center rounded-md bg-subtle text-action
                  "
                >
                  <Clock3 size={19} />
                </div>

                <div
                  className="
                    min-w-0 flex-1
                  "
                >
                  <p
                    className="
                      text-[11px] font-semibold uppercase tracking-[0.17em] text-action
                    "
                  >
                    Action Required
                  </p>

                  <h3
                    className="
                      mt-1 font-serif text-xl
                    "
                  >
                    {bookingStats.actionRequired} contract
                    {bookingStats.actionRequired === 1 ? "" : "s"} need your
                    attention
                  </h3>
                </div>

                <ArrowRight
                  size={17}
                  className="
                    shrink-0 text-action transition group-hover:translate-x-1
                  "
                />
              </button>
            )}
          </div>
        </section>

        {/*=================================================
        My Creations
        =================================================*/}

        <section
          className="
            mt-7 overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
          "
        >
          <div
            className="
              flex flex-col gap-5 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between
            "
          >
            <div>
              <p
                className="
                  inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-action
                "
              >
                <Layers3 size={12} />
                My Creations
              </p>

              <h2
                className="
                  mt-2 font-sans text-3xl
                "
              >
                Creator Studio library
              </h2>

              <p
                className="
                  mt-2 max-w-2xl text-xs leading-6 text-muted
                "
              >
                Manage your saved Creator Studio and Fashion Editor work.
                Private creations stay in your account and do not appear in the
                public Showcase.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void fetchCreatorAssets({
                  page: creationsPage,
                  visibility: creationVisibility,
                  silent: true,
                })
              }
              disabled={creationsRefreshing}
              className="
                inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-line px-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted transition hover:border-line hover:text-action disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              <RefreshCw
                size={12}
                className={creationsRefreshing ? "animate-spin" : ""}
              />
              Refresh Creations
            </button>
          </div>

          {/* Visibility Tabs */}

          <div
            className="
              flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between
            "
          >
            <div
              className="
                inline-flex w-full rounded-md border border-line bg-canvas p-1 sm:w-auto dark:bg-subtle
              "
            >
              {CREATION_VISIBILITY_TABS.map((tab) => {
                const active = creationVisibility === tab.value;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => handleCreationVisibilityTab(tab.value)}
                    className={`
                      flex-1 rounded-md px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition sm:flex-none

                      ${
                        active
                          ? "bg-surface text-action dark:bg-subtle"
                          : "text-muted hover:text-ink dark:hover:text-muted"
                      }
                    `}
                  >
                    {tab.label}

                    <span
                      className={`
                        ml-2 rounded-md px-2 py-0.5 text-[11px]

                        ${
                          active
                            ? "bg-subtle text-action"
                            : "bg-subtle text-muted"
                        }
                      `}
                    >
                      {creationCounts[tab.value] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="
                text-[11px] font-semibold uppercase tracking-[0.15em] text-muted
              "
            >
              {creationsPagination.total} result
              {creationsPagination.total === 1 ? "" : "s"}
            </div>
          </div>

          {/* Non-fatal Asset Error */}

          {creationsError && (
            <div
              role="alert"
              className="
                mx-5 mt-5 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-xs text-action dark:bg-subtle
              "
            >
              <AlertTriangle
                size={15}
                className="
                  mt-0.5 shrink-0
                "
              />

              <div
                className="
                  min-w-0 flex-1
                "
              >
                <p>{creationsError}</p>

                <button
                  type="button"
                  onClick={() =>
                    void fetchCreatorAssets({
                      page: creationsPage,
                      visibility: creationVisibility,
                    })
                  }
                  className="
                    mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] underline underline-offset-4
                  "
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Asset Grid */}

          <div className="p-4">
            {creationsLoading ? (
              <div
                className="
                  grid min-h-64 place-items-center rounded-md border border-dashed border-line bg-canvas dark:bg-subtle
                "
              >
                <div className="text-center">
                  <Loader2
                    size={24}
                    className="
                      mx-auto animate-spin text-action
                    "
                  />

                  <p
                    className="
                      mt-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted
                    "
                  >
                    Loading Creations
                  </p>
                </div>
              </div>
            ) : creations.length > 0 ? (
              <div
                className="
                  grid gap-5 sm:grid-cols-2 xl:grid-cols-3
                "
              >
                {creations.map((creation) => (
                  <CreationCard
                    key={creation.id}
                    creation={creation}
                    updating={visibilityUpdatingId === creation.id}
                    onToggleVisibility={() =>
                      void handleCreationVisibilityChange(creation)
                    }
                    onView={() => handleViewCreation(creation)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="
                  flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-line bg-canvas px-6 text-center dark:bg-subtle
                "
              >
                {creationVisibility === "private" ? (
                  <LockKeyhole
                    size={27}
                    className="
                      text-muted
                    "
                  />
                ) : creationVisibility === "public" ? (
                  <Globe2
                    size={27}
                    className="
                      text-muted
                    "
                  />
                ) : (
                  <ImageIcon
                    size={27}
                    className="
                      text-muted
                    "
                  />
                )}

                <h3
                  className="
                    mt-4 font-sans text-2xl
                  "
                >
                  {creationVisibility === "private"
                    ? "No private creations"
                    : creationVisibility === "public"
                      ? "No public creations"
                      : "No creations yet"}
                </h3>

                <p
                  className="
                    mt-2 max-w-md text-xs leading-6 text-muted
                  "
                >
                  {creationVisibility === "private"
                    ? "Creations you switch to Private will remain visible here but stay hidden from the public Showcase."
                    : creationVisibility === "public"
                      ? "Creations you make Public will appear here and may be available through the public Showcase."
                      : "Save work from Creator Studio or share a Fashion Editor project to build your creative library."}
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}

          {!creationsLoading && creationsPagination.totalPages > 1 && (
            <div
              className="
                flex flex-col gap-4 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between
              "
            >
              <p
                className="
                  text-[11px] font-semibold uppercase tracking-[0.15em] text-muted
                "
              >
                Page {creationsPagination.page} of{" "}
                {creationsPagination.totalPages}
              </p>

              <div
                className="
                  flex items-center gap-2
                "
              >
                <button
                  type="button"
                  onClick={handlePreviousCreationsPage}
                  disabled={
                    creationsLoading ||
                    creationsRefreshing ||
                    creationsPagination.page <= 1
                  }
                  className="
                    inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:border-line hover:text-action disabled:cursor-not-allowed disabled:opacity-40
                  "
                >
                  <ArrowLeft size={12} />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={handleNextCreationsPage}
                  disabled={
                    creationsLoading ||
                    creationsRefreshing ||
                    creationsPagination.page >= creationsPagination.totalPages
                  }
                  className="
                    inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-action transition hover:bg-action disabled:cursor-not-allowed disabled:opacity-40 hover:text-on-action
                  "
                >
                  Next
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/*=================================================
        Persona Configuration
        =================================================*/}

        {avatar && (
          <section
            className="
              mt-7 overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
            "
          >
            <div
              className="
                flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between
              "
            >
              <div>
                <p
                  className="
                    inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-action
                  "
                >
                  <Sparkles size={12} />
                  Persona Signature
                </p>

                <h2
                  className="
                    mt-2 font-sans text-2xl
                  "
                >
                  Presentation settings
                </h2>
              </div>

              <button
                type="button"
                onClick={() => navigate("/creator/avatar-studio")}
                className="
                  inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted transition hover:border-line hover:text-action
                "
              >
                Customize
                <ArrowRight size={12} />
              </button>
            </div>

            <div
              className="
                grid grid-cols-2 gap-3 p-4 lg:grid-cols-4
              "
            >
              {personaSummary.map((item) => (
                <div
                  key={item.label}
                  className="
                      rounded-md border border-line bg-canvas p-4 dark:bg-subtle
                    "
                >
                  <p
                    className="
                        text-[11px] font-semibold uppercase tracking-[0.16em] text-muted
                      "
                  >
                    {item.label}
                  </p>

                  <p
                    className="
                        mt-2 text-xs font-bold
                      "
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/*=================================================
        Featured Design
        =================================================*/}

        {SHOW_FASHION_PERSONA && featuredDesign && (
          <section
            className="
              mt-7 overflow-hidden rounded-md border border-line bg-surface p-4
            "
          >
            <div
              className="
                flex flex-col gap-6 sm:flex-row sm:items-center
              "
            >
              <div
                className="
                  h-24 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-canvas
                "
              >
                {featuredDesign.image ? (
                  <img
                    src={featuredDesign.image}
                    alt={featuredDesign.title}
                    loading="lazy"
                    className="
                      h-full w-full object-cover
                    "
                  />
                ) : (
                  <div
                    className="
                      flex h-full w-full items-center justify-center
                    "
                  >
                    <ImageIcon size={22} className="text-muted" />
                  </div>
                )}
              </div>

              <div
                className="
                  min-w-0 flex-1
                "
              >
                <p
                  className="
                    text-[11px] font-semibold uppercase tracking-[0.18em] text-action
                  "
                >
                  Persona Featured Design
                </p>

                <h2
                  className="
                    mt-2 font-sans text-2xl
                  "
                >
                  {featuredDesign.title}
                </h2>

                {featuredDesign.description && (
                  <p
                    className="
                      mt-2 line-clamp-2 max-w-2xl text-xs leading-5 text-muted
                    "
                  >
                    {featuredDesign.description}
                  </p>
                )}

                <div className="mt-3">
                  <FashionPersonaDesignBadge featuredDesign={featuredDesign} />
                </div>
              </div>

              <button
                type="button"
                onClick={handleFeaturedDesign}
                className="
                  inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-action transition hover:bg-action hover:text-on-action
                "
              >
                <Eye size={13} />
                View Design
              </button>
            </div>
          </section>
        )}

        {/*=================================================
        Workspace Shortcuts
        =================================================*/}

        <section
          className="
            mt-7 grid gap-4 sm:grid-cols-3
          "
        >
          <ProfileShortcut
            icon={Briefcase}
            title="Contracts"
            description="Review active bookings and milestones."
            onClick={() => navigate("/creator/bookings")}
          />

          <ProfileShortcut
            icon={Palette}
            title="Showcase"
            description="Explore public creative work."
            onClick={() => navigate("/creator/showcase")}
          />

          <ProfileShortcut
            icon={WalletCards}
            title="Wallet & Billing"
            description="Manage balances, billing and membership."
            onClick={() => navigate("/creator/wallet")}
          />
        </section>
      </div>
    </div>
  );
}

/*=========================================================
Creation Card
=========================================================*/

function CreationCard({
  creation,
  updating = false,
  onToggleVisibility,
  onView,
}) {
  const isPublic = Boolean(creation?.isPublic);

  const isFashionEditor =
    normalizeStatus(creation?.sourceType) === "fashion_editor";

  const sourceLabel = isFashionEditor ? "Fashion Editor" : "Studio Upload";

  const metadata = [
    creation?.format ? humanize(creation.format) : "",
    creation?.category?.name || "",
    creation?.styleCategory || "",
  ].filter(Boolean);

  return (
    <article
      className="
        group overflow-hidden rounded-md border border-line bg-surface transition hover:-translate-y-0.5 hover:border-line
      "
    >
      <div
        className="
          relative aspect-[4/3] overflow-hidden bg-subtle dark:bg-canvas
        "
      >
        {creation?.previewUrl ? (
          <img
            src={creation.previewUrl}
            alt={creation.title}
            loading="lazy"
            className="
              h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]
            "
          />
        ) : (
          <div
            className="
              flex h-full w-full items-center justify-center
            "
          >
            <ImageIcon
              size={28}
              className="
                text-muted
              "
            />
          </div>
        )}

        <div
          className="
            absolute left-3 top-3 flex flex-wrap gap-2
          "
        >
          <span
            className={`
              inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em]

              ${
                isPublic
                  ? "border-line bg-subtle text-action"
                  : "border-line bg-subtle text-muted dark:bg-black/60"
              }
            `}
          >
            {isPublic ? <Globe2 size={10} /> : <LockKeyhole size={10} />}

            {isPublic ? "Public" : "Private"}
          </span>

          <span
            className="
              inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-action
            "
          >
            {isFashionEditor ? (
              <Palette size={10} />
            ) : (
              <UploadCloud size={10} />
            )}

            {sourceLabel}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3
          className="
            truncate font-serif text-xl
          "
          title={creation?.title}
        >
          {creation?.title || "Untitled Creation"}
        </h3>

        {creation?.description ? (
          <p
            className="
              mt-2 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted
            "
          >
            {creation.description}
          </p>
        ) : (
          <p
            className="
              mt-2 min-h-10 text-[11px] leading-5 text-muted
            "
          >
            No description added.
          </p>
        )}

        {metadata.length > 0 && (
          <div
            className="
              mt-4 flex flex-wrap gap-2
            "
          >
            {metadata.slice(0, 3).map((item) => (
              <span
                key={item}
                className="
                  rounded-md border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted dark:bg-subtle
                "
              >
                {item}
              </span>
            ))}
          </div>
        )}

        {Array.isArray(creation?.tags) && creation.tags.length > 0 && (
          <div
            className="
              mt-4 flex flex-wrap gap-1.5
            "
          >
            {creation.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="
                  text-[11px] text-muted
                "
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="
            mt-5 flex flex-col gap-2 sm:flex-row
          "
        >
          <button
            type="button"
            onClick={onToggleVisibility}
            disabled={updating}
            className={`
              inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[11px] font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-50

              ${
                isPublic
                  ? "border border-line bg-canvas text-muted hover:border-line dark:bg-subtle"
                  : "bg-action text-on-action hover:bg-action hover:text-on-action"
              }
            `}
          >
            {updating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isPublic ? (
              <LockKeyhole size={12} />
            ) : (
              <Globe2 size={12} />
            )}

            {updating ? "Updating" : isPublic ? "Make Private" : "Make Public"}
          </button>

          {isPublic && (
            <button
              type="button"
              onClick={onView}
              className="
                inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:border-line hover:text-action
              "
            >
              <Eye size={12} />
              View
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/*=========================================================
Profile Field
=========================================================*/

function ProfileField({ icon: Icon, label, value }) {
  return (
    <div
      className="
        rounded-md border border-line bg-canvas p-4 dark:bg-subtle
      "
    >
      <div
        className="
          flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted
        "
      >
        <Icon
          size={12}
          className="
            text-action
          "
        />

        {label}
      </div>

      <p
        className="
          mt-3 truncate text-sm font-semibold text-ink dark:text-muted
        "
      >
        {value}
      </p>
    </div>
  );
}

/*=========================================================
Shortcut
=========================================================*/

function ProfileShortcut({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group flex items-center gap-4 rounded-md border border-line bg-subtle p-4 text-left transition hover:-translate-y-0.5 hover:border-line dark:bg-surface
      "
    >
      <div
        className="
          grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-subtle text-action
        "
      >
        <Icon size={17} />
      </div>

      <div
        className="
          min-w-0 flex-1
        "
      >
        <h3
          className="
            text-sm font-semibold
          "
        >
          {title}
        </h3>

        <p
          className="
            mt-1 text-[10px] leading-5 text-muted
          "
        >
          {description}
        </p>
      </div>

      <ArrowRight
        size={14}
        className="
          shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-action
        "
      />
    </button>
  );
}
