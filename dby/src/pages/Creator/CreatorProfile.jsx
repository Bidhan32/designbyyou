"use strict";

/*
=========================================================
DesignByYou
Creator Profile
Version 3.1
=========================================================

PURPOSE
---------------------------------------------------------

Authenticated Creator profile / identity dashboard.

Sources of truth:

GET /auth/me
    → Creator account/profile data

GET /avatar/me
    → Creator Fashion Persona

GET /p2p-bookings/pipeline
    → Creator contract statistics

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
VERSION 3.1
---------------------------------------------------------

- Fixes repeated /auth/me, /avatar/me and pipeline requests.
- Keeps fetchProfile stable while AuthContext user changes.
- Uses ProfileIdentity for the main Creator profile picture.
- Reuses the avatar already loaded by this page.
- Does not overwrite profile_image_url.
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
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Palette,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  WalletCards,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import API from "../../api/axios";

import { useAuth } from "../../context/AuthContext";

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
        flex
        min-h-[70vh]
        flex-col
        items-center
        justify-center
        gap-5
        bg-slate-50

        dark:bg-[#030303]
      "
    >
      <div
        className="
          relative
          grid
          h-16
          w-16
          place-items-center
          rounded-2xl
          border
          border-[#D4AF37]/20
          bg-[#D4AF37]/10
        "
      >
        <Loader2
          size={27}
          className="
            animate-spin
            text-[#9B791D]

            dark:text-[#D4AF37]
          "
        />
      </div>

      <span
        className="
          text-[9px]
          font-black
          uppercase
          tracking-[0.25em]
          text-slate-400

          dark:text-white/30
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
      const [profileResult, avatarResult, bookingsResult] =
        await Promise.allSettled([
          API.get(PROFILE_ENDPOINT, {
            signal: controller.signal,
          }),

          API.get(AVATAR_ENDPOINT, {
            signal: controller.signal,
          }),

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

      if (avatarResult.status === "fulfilled") {
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
          flex
          min-h-[70vh]
          items-center
          justify-center
          bg-slate-50
          p-6
          text-slate-950

          dark:bg-[#030303]
          dark:text-white
        "
      >
        <div
          className="
            max-w-lg
            text-center
          "
        >
          <div
            className="
              mx-auto
              grid
              h-16
              w-16
              place-items-center
              rounded-2xl
              border
              border-rose-200
              bg-rose-50
              text-rose-500

              dark:border-rose-400/20
              dark:bg-rose-400/10
              dark:text-rose-300
            "
          >
            <AlertTriangle size={28} />
          </div>

          <h2
            className="
              mt-6
              font-serif
              text-3xl
            "
          >
            {error || "Creator profile could not be loaded."}
          </h2>

          <p
            className="
              mt-3
              text-sm
              leading-6
              text-slate-500

              dark:text-white/40
            "
          >
            Retry the authenticated profile request or return to your Creator
            workspace.
          </p>

          <div
            className="
              mt-7
              flex
              flex-col
              justify-center
              gap-3

              sm:flex-row
            "
          >
            <button
              type="button"
              onClick={() => void fetchProfile()}
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[#D4AF37]
                px-5
                text-[9px]
                font-black
                uppercase
                tracking-[0.17em]
                text-black
              "
            >
              <RefreshCw size={13} />
              Try Again
            </button>

            <button
              type="button"
              onClick={() => navigate("/creator/showcase")}
              className="
                h-11
                rounded-xl
                border
                border-slate-200
                px-5
                text-[9px]
                font-black
                uppercase
                tracking-[0.17em]
                text-slate-500

                dark:border-white/10
                dark:text-white/50
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
        relative
        min-h-screen
        overflow-hidden
        bg-slate-50
        pb-24
        text-slate-950

        dark:bg-[#030303]
        dark:text-white
      "
    >
      {/*===================================================
      Ambient Background
      ===================================================*/}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          overflow-hidden
        "
      >
        <div
          className="
            absolute
            -top-64
            left-1/2
            h-[42rem]
            w-[42rem]
            -translate-x-1/2
            rounded-full
            bg-[#D4AF37]/10
            blur-[170px]
          "
        />

        <div
          className="
            absolute
            -bottom-64
            -left-64
            h-[38rem]
            w-[38rem]
            rounded-full
            bg-violet-500/[0.05]
            blur-[170px]

            dark:bg-violet-500/[0.07]
          "
        />

        <div
          className="
            absolute
            inset-0
            bg-[linear-gradient(to_right,rgba(15,23,42,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.018)_1px,transparent_1px)]
            bg-[size:44px_44px]

            dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)]
          "
        />
      </div>

      <div
        className="
          relative
          z-10
          mx-auto
          max-w-[1400px]
          px-4
          pt-9

          sm:px-6

          lg:px-10
          lg:pt-12
        "
      >
        {/*=================================================
        Top Hero
        =================================================*/}

        <section
          className="
            relative
            mb-7
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200/80
            bg-white/90
            p-6
            shadow-[0_24px_80px_rgba(15,23,42,0.07)]
            backdrop-blur-xl

            sm:p-8

            lg:p-10

            dark:border-white/[0.06]
            dark:bg-[#090909]/90
            dark:shadow-[0_30px_100px_rgba(0,0,0,0.5)]
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              -right-24
              -top-24
              h-72
              w-72
              rounded-full
              bg-[#D4AF37]/12
              blur-[85px]
            "
          />

          <div
            className="
              relative
              z-10
              flex
              flex-col
              gap-8

              lg:flex-row
              lg:items-center
              lg:justify-between
            "
          >
            <div
              className="
                flex
                flex-col
                gap-6

                sm:flex-row
                sm:items-center
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
                  relative
                  h-28
                  w-28
                  shrink-0
                "
              >
                <div
                  className="
                    h-full
                    w-full
                    overflow-hidden
                    rounded-[1.75rem]
                    border
                    border-slate-200
                    bg-slate-100
                    shadow-lg

                    dark:border-white/10
                    dark:bg-[#111]
                  "
                >
                  <ProfileIdentity
                    user={profile}
                    avatar={avatar}
                    isOwnProfile
                    autoLoadAvatar={false}
                    size="2xl"
                    shape="rounded"
                    className="
                      h-full
                      w-full
                      border-0
                      shadow-none
                    "
                    ariaLabel={`${profileName} profile identity`}
                    title={`${profileName} profile`}
                  />
                </div>

                {emailVerified && (
                  <div
                    title="Email verified"
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

              <div>
                <div
                  className="
                    flex
                    flex-wrap
                    items-center
                    gap-2
                  "
                >
                  <span
                    className="
                      rounded-full
                      border
                      border-[#D4AF37]/30
                      bg-[#D4AF37]/10
                      px-3
                      py-1.5
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.17em]
                      text-[#927119]

                      dark:text-[#D4AF37]
                    "
                  >
                    Creator
                  </span>

                  {emailVerified && (
                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        border-emerald-200
                        bg-emerald-50
                        px-3
                        py-1.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                        text-emerald-700

                        dark:border-emerald-400/20
                        dark:bg-emerald-400/10
                        dark:text-emerald-300
                      "
                    >
                      <CheckCircle2 size={10} />
                      Email Verified
                    </span>
                  )}

                  {subscriptionTier !== "free" && (
                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        border-violet-200
                        bg-violet-50
                        px-3
                        py-1.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                        text-violet-700

                        dark:border-violet-400/20
                        dark:bg-violet-400/10
                        dark:text-violet-300
                      "
                    >
                      <Sparkles size={10} />

                      {humanize(subscriptionTier)}
                    </span>
                  )}
                </div>

                <h1
                  className="
                    mt-4
                    font-serif
                    text-4xl
                    font-light
                    tracking-tight

                    sm:text-5xl

                    lg:text-6xl
                  "
                >
                  {profileName}
                </h1>

                {email && (
                  <p
                    className="
                      mt-2
                      text-sm
                      text-slate-400

                      dark:text-white/30
                    "
                  >
                    {email}
                  </p>
                )}

                <p
                  className="
                    mt-4
                    max-w-2xl
                    text-sm
                    leading-7
                    text-slate-500

                    dark:text-white/42
                  "
                >
                  {companyName
                    ? `Building creative projects through ${companyName}.`
                    : "Your personal Creator workspace for commissions, creative direction, and Fashion Persona identity."}
                </p>
              </div>
            </div>

            {/* Actions */}

            <div
              className="
                flex
                flex-col
                gap-3

                sm:flex-row
              "
            >
              <button
                type="button"
                onClick={() =>
                  void fetchProfile({
                    silent: true,
                  })
                }
                disabled={refreshing}
                className="
                  inline-flex
                  h-12
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-slate-200
                  bg-white
                  px-5
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.17em]
                  text-slate-500
                  transition

                  hover:border-[#D4AF37]/40
                  hover:text-[#98751A]

                  disabled:opacity-50

                  dark:border-white/10
                  dark:bg-white/[0.04]
                  dark:text-white/50
                  dark:hover:text-[#D4AF37]
                "
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => navigate("/creator/settings")}
                className="
                  inline-flex
                  h-12
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-[#D4AF37]
                  px-6
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-black
                  shadow-[0_14px_35px_rgba(212,175,55,0.22)]
                  transition

                  hover:-translate-y-0.5
                  hover:bg-[#E4C65D]
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
              mb-7
              flex
              items-start
              gap-3
              rounded-2xl
              border
              border-amber-200
              bg-amber-50
              p-4
              text-sm
              text-amber-700

              dark:border-amber-400/20
              dark:bg-amber-400/10
              dark:text-amber-200
            "
          >
            <AlertTriangle
              size={17}
              className="
                mt-0.5
                shrink-0
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
            mb-7
            grid
            gap-4

            sm:grid-cols-2

            xl:grid-cols-4
          "
        >
          {[
            {
              label: "Contracts",

              value: bookingsUnavailable ? "—" : bookingStats.total,

              helper: "All P2P commissions",

              icon: Briefcase,

              accent: "text-[#98751A] dark:text-[#D4AF37]",
            },

            {
              label: "Active",

              value: bookingsUnavailable ? "—" : bookingStats.active,

              helper: "Currently in workflow",

              icon: Clock3,

              accent: "text-cyan-600 dark:text-cyan-300",
            },

            {
              label: "Escrow Protected",

              value: bookingsUnavailable ? "—" : bookingStats.escrowProtected,

              helper: "Contracts with secured funds",

              icon: ShieldCheck,

              accent: "text-emerald-600 dark:text-emerald-300",
            },

            {
              label: "Completed",

              value: bookingsUnavailable ? "—" : bookingStats.completed,

              helper: "Finished commissions",

              icon: CheckCircle2,

              accent: "text-violet-600 dark:text-violet-300",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className="
                    rounded-2xl
                    border
                    border-slate-200/80
                    bg-white/90
                    p-5
                    shadow-sm
                    backdrop-blur
                    transition

                    hover:-translate-y-0.5
                    hover:border-[#D4AF37]/25

                    dark:border-white/[0.06]
                    dark:bg-[#0A0A0A]/90
                  "
              >
                <div
                  className="
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                >
                  <div>
                    <p
                      className="
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.18em]
                          text-slate-400

                          dark:text-white/28
                        "
                    >
                      {item.label}
                    </p>

                    <p
                      className="
                          mt-3
                          font-serif
                          text-4xl
                        "
                    >
                      {item.value}
                    </p>

                    <p
                      className="
                          mt-2
                          text-[10px]
                          text-slate-400

                          dark:text-white/28
                        "
                    >
                      {item.helper}
                    </p>
                  </div>

                  <div
                    className={`
                        grid
                        h-11
                        w-11
                        place-items-center
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50

                        dark:border-white/10
                        dark:bg-white/[0.035]

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
          className="
            grid
            gap-7

            xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]
          "
        >
          {/*===============================================
          Fashion Persona
          ===============================================*/}

          <div
            className="
              overflow-hidden
              rounded-[2rem]
              border
              border-slate-200/80
              bg-white/90
              shadow-sm

              dark:border-white/[0.06]
              dark:bg-[#090909]
            "
          >
            <div
              className="
                flex
                items-start
                justify-between
                gap-4
                border-b
                border-slate-200
                p-6

                dark:border-white/[0.06]
              "
            >
              <div>
                <p
                  className="
                    inline-flex
                    items-center
                    gap-2
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-violet-600

                    dark:text-violet-300
                  "
                >
                  <Sparkles size={12} />
                  Fashion Persona
                </p>

                <h2
                  className="
                    mt-2
                    font-serif
                    text-3xl
                  "
                >
                  Visual identity
                </h2>

                <p
                  className="
                    mt-2
                    text-xs
                    leading-5
                    text-slate-500

                    dark:text-white/35
                  "
                >
                  Your shared visual identity across DesignByYou.
                </p>
              </div>

              {avatar && (
                <span
                  className="
                    rounded-full
                    border
                    border-slate-200
                    bg-slate-50
                    px-3
                    py-1.5
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.13em]
                    text-slate-400

                    dark:border-white/10
                    dark:bg-white/[0.035]
                    dark:text-white/30
                  "
                >
                  V{avatar.version}
                </span>
              )}
            </div>

            <div
              className="
                p-4

                sm:p-6
              "
            >
              {avatar ? (
                <div
                  className="
                    overflow-hidden
                    rounded-[1.75rem]
                    border
                    border-slate-200
                    bg-black
                    shadow-[0_25px_70px_rgba(0,0,0,0.25)]

                    dark:border-white/10
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
                    flex
                    min-h-[480px]
                    flex-col
                    items-center
                    justify-center
                    rounded-[1.75rem]
                    border
                    border-dashed
                    border-slate-200
                    bg-slate-50
                    px-7
                    text-center

                    dark:border-white/10
                    dark:bg-white/[0.02]
                  "
                >
                  <Sparkles
                    size={30}
                    className="
                      text-slate-300

                      dark:text-white/15
                    "
                  />

                  <h3
                    className="
                      mt-5
                      font-serif
                      text-2xl
                    "
                  >
                    Fashion Persona unavailable
                  </h3>

                  <p
                    className="
                      mt-3
                      max-w-sm
                      text-xs
                      leading-6
                      text-slate-500

                      dark:text-white/35
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
                  mt-4
                  inline-flex
                  h-12
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-violet-200
                  bg-violet-50
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.17em]
                  text-violet-700
                  transition

                  hover:border-violet-300
                  hover:bg-violet-100

                  dark:border-violet-400/20
                  dark:bg-violet-500/10
                  dark:text-violet-200
                  dark:hover:bg-violet-500
                  dark:hover:text-white
                "
              >
                <Sparkles size={14} />

                {hasConfiguredPersona
                  ? "Customize Persona"
                  : "Create Fashion Persona"}
              </button>
            </div>
          </div>

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
                overflow-hidden
                rounded-[2rem]
                border
                border-slate-200/80
                bg-white/90
                shadow-sm

                dark:border-white/[0.06]
                dark:bg-[#090909]
              "
            >
              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  border-b
                  border-slate-200
                  p-6

                  dark:border-white/[0.06]
                "
              >
                <div>
                  <p
                    className="
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.2em]
                      text-[#98751A]

                      dark:text-[#D4AF37]
                    "
                  >
                    Creator Identity
                  </p>

                  <h2
                    className="
                      mt-2
                      font-serif
                      text-3xl
                    "
                  >
                    Creative profile
                  </h2>
                </div>

                <User
                  size={21}
                  className="
                    text-slate-300

                    dark:text-white/20
                  "
                />
              </div>

              <div
                className="
                  grid
                  gap-3
                  p-6

                  sm:grid-cols-2
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
                  border-t
                  border-slate-200
                  p-6

                  dark:border-white/[0.06]
                "
              >
                <div
                  className="
                    flex
                    items-start
                    gap-3
                  "
                >
                  <div
                    className="
                      grid
                      h-9
                      w-9
                      shrink-0
                      place-items-center
                      rounded-xl
                      border
                      border-slate-200
                      bg-slate-50
                      text-[#98751A]

                      dark:border-white/10
                      dark:bg-white/[0.03]
                      dark:text-[#D4AF37]
                    "
                  >
                    <FileText size={15} />
                  </div>

                  <div>
                    <p
                      className="
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-slate-400

                        dark:text-white/28
                      "
                    >
                      Brand Direction
                    </p>

                    <p
                      className="
                        mt-2
                        text-sm
                        leading-7
                        text-slate-600

                        dark:text-white/45
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
                  border-t
                  border-slate-200
                  p-5

                  dark:border-white/[0.06]
                "
              >
                <button
                  type="button"
                  onClick={() => navigate("/creator/settings")}
                  className="
                    inline-flex
                    h-11
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.17em]
                    text-slate-500
                    transition

                    hover:border-[#D4AF37]/35
                    hover:text-[#98751A]

                    dark:border-white/10
                    dark:bg-white/[0.03]
                    dark:text-white/40
                    dark:hover:text-[#D4AF37]
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
                  group
                  flex
                  w-full
                  items-center
                  gap-4
                  rounded-[2rem]
                  border
                  border-violet-200
                  bg-gradient-to-br
                  from-violet-50
                  to-white
                  p-6
                  text-left
                  shadow-sm
                  transition

                  hover:-translate-y-0.5
                  hover:border-violet-300
                  hover:shadow-lg

                  dark:border-violet-400/15
                  dark:from-violet-500/[0.08]
                  dark:to-[#090909]
                "
              >
                <div
                  className="
                    grid
                    h-12
                    w-12
                    shrink-0
                    place-items-center
                    rounded-xl
                    bg-violet-100
                    text-violet-700

                    dark:bg-violet-500/10
                    dark:text-violet-300
                  "
                >
                  <Clock3 size={19} />
                </div>

                <div
                  className="
                    min-w-0
                    flex-1
                  "
                >
                  <p
                    className="
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.17em]
                      text-violet-600

                      dark:text-violet-300
                    "
                  >
                    Action Required
                  </p>

                  <h3
                    className="
                      mt-1
                      font-serif
                      text-xl
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
                    shrink-0
                    text-violet-400
                    transition

                    group-hover:translate-x-1
                  "
                />
              </button>
            )}
          </div>
        </section>

        {/*=================================================
        Persona Configuration
        =================================================*/}

        {avatar && (
          <section
            className="
              mt-7
              overflow-hidden
              rounded-[2rem]
              border
              border-slate-200/80
              bg-white/90
              shadow-sm

              dark:border-white/[0.06]
              dark:bg-[#090909]
            "
          >
            <div
              className="
                flex
                flex-col
                gap-4
                border-b
                border-slate-200
                p-6

                sm:flex-row
                sm:items-center
                sm:justify-between

                dark:border-white/[0.06]
              "
            >
              <div>
                <p
                  className="
                    inline-flex
                    items-center
                    gap-2
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-violet-600

                    dark:text-violet-300
                  "
                >
                  <Sparkles size={12} />
                  Persona Signature
                </p>

                <h2
                  className="
                    mt-2
                    font-serif
                    text-2xl
                  "
                >
                  Presentation settings
                </h2>
              </div>

              <button
                type="button"
                onClick={() => navigate("/creator/avatar-studio")}
                className="
                  inline-flex
                  h-10
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-slate-200
                  px-4
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-slate-500
                  transition

                  hover:border-violet-300
                  hover:text-violet-600

                  dark:border-white/10
                  dark:text-white/40
                  dark:hover:border-violet-400/30
                  dark:hover:text-violet-200
                "
              >
                Customize
                <ArrowRight size={12} />
              </button>
            </div>

            <div
              className="
                grid
                grid-cols-2
                gap-3
                p-6

                lg:grid-cols-4
              "
            >
              {personaSummary.map((item) => (
                <div
                  key={item.label}
                  className="
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-50
                      p-4

                      dark:border-white/[0.06]
                      dark:bg-white/[0.025]
                    "
                >
                  <p
                    className="
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-slate-400

                        dark:text-white/25
                      "
                  >
                    {item.label}
                  </p>

                  <p
                    className="
                        mt-2
                        text-xs
                        font-bold
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

        {featuredDesign && (
          <section
            className="
              mt-7
              overflow-hidden
              rounded-[2rem]
              border
              border-violet-200
              bg-gradient-to-br
              from-violet-50
              via-white
              to-white
              p-6
              shadow-sm

              sm:p-7

              dark:border-violet-400/15
              dark:from-violet-500/[0.07]
              dark:via-[#090909]
              dark:to-[#090909]
            "
          >
            <div
              className="
                flex
                flex-col
                gap-6

                sm:flex-row
                sm:items-center
              "
            >
              <div
                className="
                  h-24
                  w-24
                  shrink-0
                  overflow-hidden
                  rounded-2xl
                  border
                  border-slate-200
                  bg-black

                  dark:border-white/10
                "
              >
                {featuredDesign.image ? (
                  <img
                    src={featuredDesign.image}
                    alt={featuredDesign.title}
                    loading="lazy"
                    className="
                      h-full
                      w-full
                      object-cover
                    "
                  />
                ) : (
                  <div
                    className="
                      flex
                      h-full
                      w-full
                      items-center
                      justify-center
                    "
                  >
                    <ImageIcon size={22} className="text-white/20" />
                  </div>
                )}
              </div>

              <div
                className="
                  min-w-0
                  flex-1
                "
              >
                <p
                  className="
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-violet-600

                    dark:text-violet-300
                  "
                >
                  Persona Featured Design
                </p>

                <h2
                  className="
                    mt-2
                    font-serif
                    text-2xl
                  "
                >
                  {featuredDesign.title}
                </h2>

                {featuredDesign.description && (
                  <p
                    className="
                      mt-2
                      line-clamp-2
                      max-w-2xl
                      text-xs
                      leading-5
                      text-slate-500

                      dark:text-white/35
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
                  inline-flex
                  h-11
                  shrink-0
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-violet-600
                  px-5
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.16em]
                  text-white
                  transition

                  hover:bg-violet-700
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
            mt-7
            grid
            gap-4

            sm:grid-cols-3
          "
        >
          <ProfileShortcut
            icon={Briefcase}
            title="Contracts"
            description="Review active commissions and milestones."
            onClick={() => navigate("/creator/bookings")}
          />

          <ProfileShortcut
            icon={Palette}
            title="Showcase"
            description="Discover published designer work."
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
Profile Field
=========================================================*/

function ProfileField({ icon: Icon, label, value }) {
  return (
    <div
      className="
        rounded-2xl
        border
        border-slate-200
        bg-slate-50
        p-4

        dark:border-white/[0.06]
        dark:bg-white/[0.025]
      "
    >
      <div
        className="
          flex
          items-center
          gap-2
          text-[8px]
          font-black
          uppercase
          tracking-[0.16em]
          text-slate-400

          dark:text-white/25
        "
      >
        <Icon
          size={12}
          className="
            text-[#98751A]

            dark:text-[#D4AF37]
          "
        />

        {label}
      </div>

      <p
        className="
          mt-3
          truncate
          text-sm
          font-semibold
          text-slate-800

          dark:text-white/70
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
        group
        flex
        items-center
        gap-4
        rounded-2xl
        border
        border-slate-200/80
        bg-white/90
        p-5
        text-left
        shadow-sm
        transition

        hover:-translate-y-0.5
        hover:border-[#D4AF37]/35
        hover:shadow-lg

        dark:border-white/[0.06]
        dark:bg-[#090909]
      "
    >
      <div
        className="
          grid
          h-11
          w-11
          shrink-0
          place-items-center
          rounded-xl
          border
          border-[#D4AF37]/20
          bg-[#D4AF37]/10
          text-[#98751A]

          dark:text-[#D4AF37]
        "
      >
        <Icon size={17} />
      </div>

      <div
        className="
          min-w-0
          flex-1
        "
      >
        <h3
          className="
            text-sm
            font-semibold
          "
        >
          {title}
        </h3>

        <p
          className="
            mt-1
            text-[10px]
            leading-5
            text-slate-400

            dark:text-white/30
          "
        >
          {description}
        </p>
      </div>

      <ArrowRight
        size={14}
        className="
          shrink-0
          text-slate-300
          transition

          group-hover:translate-x-1
          group-hover:text-[#98751A]

          dark:text-white/15
          dark:group-hover:text-[#D4AF37]
        "
      />
    </button>
  );
}
