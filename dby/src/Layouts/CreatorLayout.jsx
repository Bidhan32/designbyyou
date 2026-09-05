"use strict";

/*
=========================================================
DesignByYou
Creator Layout
Version 3.4
=========================================================

Architecture:

App.jsx
    ↓
ProtectedRoute requiredRole="creator"
    ↓
CreatorLayout
    ↓
Creator Pages

=========================================================
RESPONSIBILITIES
=========================================================

CreatorLayout owns:

- global Creator navigation
- desktop navigation
- mobile/tablet drawer
- account menu
- quick "New Commission" access
- Wallet & Billing access
- Fashion Persona / Avatar Studio access
- Creator Studio access
- Creator Sketch Studio access
- shared Creator profile identity
- Creator reward points display
- theme toggle
- logout
- Creator account status display

CreatorLayout does NOT duplicate:

- JWT validation
- role validation
- login redirects
- avatar/profile-picture preference resolution

Those remain responsibilities of:

ProtectedRoute
AuthContext
ProfileIdentity

=========================================================
CREATOR REWARD POINTS
=========================================================

Creator reward points are stored server-side in:

creator_profiles.xp_points

The layout retrieves the authoritative total through:

GET /api/v1/auth/me

The total is displayed in:

- desktop navbar
- desktop account dropdown
- mobile navbar
- mobile account drawer

The layout also listens for:

creator-reward-updated

This allows booking completion to update the navbar
immediately without requiring logout or page reload.

=========================================================
PROFILE IDENTITY
=========================================================

ProfileIdentity decides between:

1. Fashion Persona
   when:
       avatar_config.useAsProfilePicture === true

2. Standard profile image

3. Initials

CreatorLayout therefore does NOT render its own account
avatar implementation.

=========================================================
CANONICAL CREATOR ROUTES
=========================================================

Discovery
    /creator/showcase

Designer directory
    /creator/directory

Bookings
    /creator/bookings

New commission
    /creator/bookings/new

Creator Studio
    /creator/upload

Creator Sketch Studio / Fashion Editor
    /creator/fashion-editor

Fashion Editor belongs ONLY to Creator accounts.

Creator cloud projects use:

    /api/v1/creators/editor-projects
    /api/v1/creators/editor-projects/:projectId

The Creator Sketch Studio now supports:

- new editor projects
- cloud project creation
- cloud project loading
- cloud project saving
- optimistic version protection
- local project files
- PNG export

Creator Showcase publishing from the Fashion Editor remains
a separate workflow and is not exposed by this layout.

Profile
    /creator/profile

Settings
    /creator/settings

Wallet & Billing
    /creator/wallet

Fashion Persona
    /creator/avatar-studio

=========================================================
*/

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Link, Outlet, useLocation } from "react-router-dom";

import {
  AlertCircle,
  BadgeDollarSign,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Compass,
  CreditCard,
  FilePlus2,
  LogOut,
  Menu,
  Palette,
  PencilRuler,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import API from "../api/axios";

import ThemeToggle from "../components/ThemeToggle";

import ProfileIdentity from "../pages/avatar/ProfileIdentity";

/*=========================================================
Primary Navigation
=========================================================*/

const CREATOR_NAVIGATION = [
  {
    name: "Showcase",

    path: "/creator/showcase",

    icon: Compass,

    description: "Discover published creative and designer work.",
  },

  {
    name: "Directory",

    path: "/creator/directory",

    icon: Users,

    description: "Browse available designers.",
  },

  {
    name: "Bookings",

    path: "/creator/bookings",

    icon: Briefcase,

    description: "Track bookings and milestones.",
  },

  {
    name: "Sketch Studio",

    path: "/creator/fashion-editor",

    icon: PencilRuler,

    description: "Create fashion sketches in the professional 2D editor.",

    accent: "violet",
  },

  {
    name: "Studio",

    path: "/creator/upload",

    icon: Sliders,

    description: "Upload and organize creative work.",
  },
];

/*=========================================================
Account Navigation
=========================================================*/

const ACCOUNT_NAVIGATION = [
  {
    name: "Profile",

    path: "/creator/profile",

    icon: User,

    description: "View your Creator identity.",
  },

  {
    name: "Settings",

    path: "/creator/settings",

    icon: Settings,

    description: "Profile preferences and security.",
  },

  {
    name: "Wallet & Billing",

    path: "/creator/wallet",

    icon: Wallet,

    description: "Balances, billing and membership.",
  },

  {
    name: "Avatar Studio",

    path: "/creator/avatar-studio",

    icon: Palette,

    description: "Customize your Fashion Persona.",
  },
];

/*=========================================================
Quick Actions
=========================================================*/

const QUICK_ACTIONS = [
  {
    name: "New Booking",

    path: "/creator/bookings/new",

    icon: Plus,

    description: "Create a secure Designer contract.",
  },

  {
    name: "Find Designer",

    path: "/creator/directory",

    icon: Users,

    description: "Browse Designers available for work.",
  },

  {
    name: "Wallet",

    path: "/creator/wallet",

    icon: CreditCard,

    description: "Open Wallet & Billing.",
  },
];

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = normalize(value);

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

function normalizeRewardPoints(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.floor(number);
}

function isPathActive(pathname, path) {
  if (pathname === path) {
    return true;
  }

  /*
  New Commission is logically part of Bookings.

  /creator/bookings should therefore remain active while
  viewing:

  /creator/bookings/new
  /creator/bookings/:id

  This also allows:

  /creator/fashion-editor/:projectId

  to keep Sketch Studio active.
  */

  return pathname.startsWith(`${path}/`);
}

/*=========================================================
Creator Layout
=========================================================*/

export default function CreatorLayout() {
  const { user, logout } = useAuth();

  const location = useLocation();

  const pathname = location.pathname;

  const dropdownRef = useRef(null);

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /*
  Reward total starts from AuthContext when available.

  /auth/me remains the authoritative source and refreshes
  this value below.
  */
  const [rewardPoints, setRewardPoints] = useState(() =>
    normalizeRewardPoints(user?.xp_points),
  );

  const [rewardRefreshing, setRewardRefreshing] = useState(false);

  /*=======================================================
  Account Data
  =======================================================*/

  const creatorName = cleanText(user?.full_name, "Creator");

  const creatorEmail = cleanText(user?.email, "Creator account");

  const emailVerified = toBoolean(user?.is_email_verified, false);

  const subscriptionTier = normalize(user?.subscription_tier || "free");

  const hasPaidTier = subscriptionTier !== "free" && subscriptionTier !== "";

  /*=======================================================
  Creator Reward Points
  =======================================================*/

  const fetchCreatorRewardPoints = useCallback(
    async ({ silent = true } = {}) => {
      if (!user?.id) {
        setRewardPoints(0);

        return;
      }

      if (!silent) {
        setRewardRefreshing(true);
      }

      try {
        const response = await API.get("/auth/me");

        /*
        Support the normal auth/me response shape while
        remaining tolerant of a nested user response.
        */
        const profile =
          response?.data?.data?.user ||
          response?.data?.data ||
          response?.data?.user ||
          null;

        if (!profile) {
          return;
        }

        const role = normalize(profile.role);

        if (role && role !== "creator") {
          return;
        }

        setRewardPoints(normalizeRewardPoints(profile.xp_points));
      } catch (error) {
        /*
        Do not break Creator navigation if this lightweight
        reward refresh fails.

        AuthContext / ProtectedRoute still own authentication.
        */
        if (import.meta.env.DEV) {
          console.warn("Creator reward points could not be refreshed:", error);
        }
      } finally {
        if (!silent) {
          setRewardRefreshing(false);
        }
      }
    },
    [user?.id],
  );

  /*
  Keep the local reward value synchronized when AuthContext
  itself receives fresher user data.
  */
  useEffect(() => {
    if (user?.xp_points === undefined || user?.xp_points === null) {
      return;
    }

    setRewardPoints(normalizeRewardPoints(user.xp_points));
  }, [user?.xp_points]);

  /*
  Refresh points:

  - on first CreatorLayout mount
  - after Creator route navigation

  This ensures returning from a completed booking immediately
  loads the latest server-side total.
  */
  useEffect(() => {
    fetchCreatorRewardPoints();
  }, [fetchCreatorRewardPoints, pathname]);

  /*
  Refresh whenever the browser/app regains focus.

  Useful when a booking action or account update completes in
  another tab or after returning to the application.
  */
  useEffect(() => {
    const handleFocus = () => {
      fetchCreatorRewardPoints();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchCreatorRewardPoints();
      }
    };

    window.addEventListener("focus", handleFocus);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchCreatorRewardPoints]);

  /*
  Booking completion can dispatch:

  window.dispatchEvent(
    new CustomEvent("creator-reward-updated", {
      detail: {
        totalPoints: 24
      }
    })
  );

  If totalPoints is supplied, update immediately without an
  extra network request.

  Otherwise retrieve the authoritative total from /auth/me.
  */
  useEffect(() => {
    const handleCreatorRewardUpdated = (event) => {
      const eventTotal = event?.detail?.totalPoints;

      const parsedTotal = Number(eventTotal);

      if (
        eventTotal !== undefined &&
        eventTotal !== null &&
        Number.isFinite(parsedTotal) &&
        parsedTotal >= 0
      ) {
        setRewardPoints(normalizeRewardPoints(parsedTotal));

        return;
      }

      fetchCreatorRewardPoints();
    };

    window.addEventListener(
      "creator-reward-updated",
      handleCreatorRewardUpdated,
    );

    return () => {
      window.removeEventListener(
        "creator-reward-updated",
        handleCreatorRewardUpdated,
      );
    };
  }, [fetchCreatorRewardPoints]);

  /*=======================================================
  Close Menus After Navigation
  =======================================================*/

  useEffect(() => {
    setProfileDropdownOpen(false);

    setMobileMenuOpen(false);
  }, [pathname]);

  /*=======================================================
  Outside Click + Escape
  =======================================================*/

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileDropdownOpen(false);

        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);

      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /*=======================================================
  Prevent Body Scroll While Drawer Is Open
  =======================================================*/

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  /*=======================================================
  Logout
  =======================================================*/

  const handleLogout = async () => {
    setProfileDropdownOpen(false);

    setMobileMenuOpen(false);

    if (typeof logout !== "function") {
      return;
    }

    try {
      await Promise.resolve(logout());
    } catch (error) {
      /*
        AuthContext owns session cleanup and redirect logic.

        This catch prevents an optional backend logout
        request from creating an uncaught UI error.
      */

      if (import.meta.env.DEV) {
        console.warn("Creator logout reported an error:", error);
      }
    }
  };

  /*=======================================================
  Shared Creator Identity

  key includes pathname so leaving Avatar Studio after a
  successful save forces ProfileIdentity to read the current
  canonical avatar preference again.
  =======================================================*/

  const renderCreatorIdentity = (
    identitySize = "sm",
    identityKey = "identity",
  ) => (
    <ProfileIdentity
      key={`creator-${identityKey}-${identitySize}-${pathname}`}
      user={user}
      isOwnProfile
      autoLoadAvatar
      size={identitySize}
      shape="circle"
      showLoading={false}
      ariaLabel={`${creatorName} profile identity`}
    />
  );

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative
        flex
        min-h-screen
        flex-col
        bg-slate-50
        font-sans
        text-slate-900
        antialiased
        selection:bg-[#D4AF37]
        selection:text-black
        transition-colors
        duration-300

        dark:bg-[#030303]
        dark:text-white
      "
    >
      {/*===================================================
      Header
      ===================================================*/}

      <header
        className="
          sticky
          top-0
          z-50
          border-b
          border-slate-200/80
          bg-white/90
          shadow-sm
          backdrop-blur-xl
          transition-colors
          duration-300

          dark:border-white/[0.06]
          dark:bg-[#080808]/90
          dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]
        "
      >
        <div
          className="
            mx-auto
            flex
            h-20
            w-full
            max-w-[1800px]
            items-center
            justify-between
            gap-4
            px-4

            sm:px-6

            md:px-8

            lg:px-10

            xl:px-12
          "
        >
          {/*===============================================
          Brand
          ===============================================*/}

          <Link
            to="/creator/showcase"
            aria-label="DesignByYou Creator Hub"
            className="
              group
              flex
              min-w-0
              shrink-0
              items-center
              gap-3
            "
          >
            <div
              className="
                grid
                h-10
                w-10
                shrink-0
                place-items-center
                rounded-xl
                border
                border-slate-200
                bg-slate-100
                font-serif
                text-lg
                font-bold
                text-[#A27D17]
                shadow-inner
                transition

                group-hover:border-[#D4AF37]/50
                group-hover:bg-[#D4AF37]/10

                dark:border-white/10
                dark:bg-[#111]
                dark:text-[#D4AF37]
              "
            >
              D
            </div>

            <div
              className="
                min-w-0
                leading-tight
              "
            >
              <span
                className="
                  block
                  truncate
                  font-serif
                  text-sm
                  uppercase
                  tracking-[0.15em]
                  text-slate-900
                  transition

                  group-hover:text-[#A27D17]

                  dark:text-white
                  dark:group-hover:text-[#D4AF37]
                "
              >
                DESIGNBYYOU
              </span>

              <span
                className="
                  block
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.28em]
                  text-slate-400

                  dark:text-white/30
                "
              >
                Creator Hub
              </span>
            </div>
          </Link>

          {/*===============================================
          Desktop Navigation
          ===============================================*/}

          <nav
            aria-label="Creator navigation"
            className="
              hidden
              items-center
              gap-1
              rounded-full
              border
              border-slate-200
              bg-slate-100
              p-1
              shadow-inner

              dark:border-white/[0.06]
              dark:bg-[#111]

              lg:flex
            "
          >
            {CREATOR_NAVIGATION.map((item) => {
              const Icon = item.icon;

              if (item.disabled) {
                return (
                  <div
                    key={item.path}
                    aria-disabled="true"
                    title={`${item.description} ${item.status || ""}`.trim()}
                    className="
                      group
                      relative
                      flex
                      cursor-not-allowed
                      items-center
                      gap-2
                      rounded-full
                      border
                      border-violet-200/60
                      bg-violet-50/60
                      px-3.5
                      py-2.5
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.13em]
                      text-violet-500/60
                      opacity-80

                      dark:border-violet-400/10
                      dark:bg-violet-500/[0.06]
                      dark:text-violet-300/45

                      xl:px-5
                      xl:text-[9px]
                      xl:tracking-[0.18em]
                    "
                  >
                    <Icon
                      size={12}
                      aria-hidden="true"
                      className="text-violet-400/60 dark:text-violet-300/40"
                    />

                    {item.name}

                    <span
                      className="
                        absolute
                        -right-1
                        -top-2
                        rounded-full
                        border
                        border-violet-200
                        bg-white
                        px-1.5
                        py-0.5
                        text-[5px]
                        font-black
                        uppercase
                        tracking-[0.12em]
                        text-violet-500

                        dark:border-violet-400/20
                        dark:bg-[#111]
                        dark:text-violet-300/60
                      "
                    >
                      {item.status || "Soon"}
                    </span>
                  </div>
                );
              }

              const active = isPathActive(pathname, item.path);

              const sketchStudio = item.accent === "violet";

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.description}
                  className={`
                    flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    px-3.5
                    py-2.5
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.13em]
                    transition-all
                    duration-200

                    xl:px-5
                    xl:text-[9px]
                    xl:tracking-[0.18em]

                    ${
                      active && sketchStudio
                        ? `
                            border-violet-300
                            bg-violet-50
                            text-violet-700
                            shadow-sm

                            dark:border-violet-400/20
                            dark:bg-violet-500/10
                            dark:text-violet-200
                          `
                        : active
                          ? `
                              border-slate-200
                              bg-white
                              text-slate-900
                              shadow-sm

                              dark:border-white/[0.06]
                              dark:bg-white/10
                              dark:text-white
                            `
                          : sketchStudio
                            ? `
                                border-transparent
                                text-violet-500

                                hover:bg-violet-50
                                hover:text-violet-700

                                dark:text-violet-300/60
                                dark:hover:bg-violet-500/10
                                dark:hover:text-violet-200
                              `
                            : `
                                border-transparent
                                text-slate-500

                                hover:bg-slate-200
                                hover:text-slate-900

                                dark:text-white/40
                                dark:hover:bg-white/5
                                dark:hover:text-white
                              `
                    }
                  `}
                >
                  <Icon
                    size={12}
                    aria-hidden="true"
                    className={
                      active && sketchStudio
                        ? "text-violet-600 dark:text-violet-300"
                        : active
                          ? "text-[#A27D17] dark:text-[#D4AF37]"
                          : sketchStudio
                            ? "text-violet-400 dark:text-violet-300/50"
                            : "text-slate-400 dark:text-white/30"
                    }
                  />

                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/*===============================================
          Desktop Actions
          ===============================================*/}

          <div
            ref={dropdownRef}
            className="
              relative
              hidden
              shrink-0
              items-center
              gap-2

              lg:flex
            "
          >
            {/* New Commission */}

            <Link
              to="/creator/bookings/new"
              className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[#D4AF37]
                px-4
                text-[8px]
                font-black
                uppercase
                tracking-[0.14em]
                text-black
                shadow-[0_10px_25px_rgba(212,175,55,0.18)]
                transition

                hover:-translate-y-0.5
                hover:bg-[#E4C65D]
              "
            >
              <Plus size={13} />

              <span
                className="
                  hidden

                  xl:inline
                "
              >
                New Booking
              </span>
            </Link>

            <ThemeToggle />

            {/* Creator Reward Points */}

            <button
              type="button"
              onClick={() =>
                fetchCreatorRewardPoints({
                  silent: false,
                })
              }
              disabled={rewardRefreshing}
              title="Creator reward points"
              aria-label={`${rewardPoints} Creator reward points`}
              className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-[#D4AF37]/25
                bg-[#D4AF37]/10
                px-3
                text-[#98751A]
                transition

                hover:border-[#D4AF37]/50
                hover:bg-[#D4AF37]/15

                disabled:cursor-wait
                disabled:opacity-70

                dark:border-[#D4AF37]/20
                dark:bg-[#D4AF37]/10
                dark:text-[#E4C760]
              "
            >
              {rewardRefreshing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Sparkles
                  size={12}
                  className="text-[#B89122] dark:text-[#D4AF37]"
                />
              )}

              <span
                className="
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.12em]

                  xl:text-[9px]
                  xl:tracking-[0.15em]
                "
              >
                {rewardPoints}
                <span className="hidden 2xl:inline"> Points</span>
              </span>
            </button>

            {/* Membership */}

            {hasPaidTier && (
              <Link
                to="/creator/wallet"
                title="Creator membership"
                className="
                  hidden
                  items-center
                  gap-1.5
                  rounded-lg
                  border
                  border-[#D4AF37]/20
                  bg-[#D4AF37]/10
                  px-3
                  py-2
                  transition

                  hover:border-[#D4AF37]/40

                  2xl:flex
                "
              >
                <Sparkles size={10} className="text-[#D4AF37]" />

                <span
                  className="
                    text-[8px]
                    font-black
                    uppercase
                    tracking-widest
                    text-[#98751A]

                    dark:text-[#D4AF37]
                  "
                >
                  {humanize(subscriptionTier)}
                </span>
              </Link>
            )}

            {/* Account Button */}

            <button
              type="button"
              onClick={() => setProfileDropdownOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={profileDropdownOpen}
              aria-label="Open Creator account menu"
              className="
                flex
                items-center
                gap-2
                rounded-full
                border
                border-slate-200
                bg-slate-50
                p-1
                pr-2
                transition

                hover:border-[#D4AF37]/50
                hover:bg-white

                dark:border-white/10
                dark:bg-[#111]
                dark:hover:bg-white/[0.05]
              "
            >
              {renderCreatorIdentity("sm", "navbar")}

              <ChevronDown
                size={13}
                aria-hidden="true"
                className={`
                  text-slate-400
                  transition-transform

                  dark:text-white/30

                  ${
                    profileDropdownOpen
                      ? "rotate-180 text-[#A27D17] dark:text-[#D4AF37]"
                      : ""
                  }
                `}
              />
            </button>

            {/*=============================================
            Desktop Account Dropdown
            =============================================*/}

            {profileDropdownOpen && (
              <div
                role="menu"
                className="
                  absolute
                  right-0
                  top-14
                  mt-2
                  w-[310px]
                  overflow-hidden
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  shadow-[0_24px_70px_rgba(15,23,42,0.15)]

                  dark:border-white/10
                  dark:bg-[#0A0A0A]
                  dark:shadow-[0_24px_70px_rgba(0,0,0,0.75)]
                "
              >
                {/* Identity */}

                <div
                  className="
                    border-b
                    border-slate-100
                    p-4

                    dark:border-white/[0.06]
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      gap-3
                    "
                  >
                    {renderCreatorIdentity("lg", "dropdown")}

                    <div
                      className="
                        min-w-0
                        flex-1
                      "
                    >
                      <p
                        className="
                          truncate
                          font-serif
                          text-base
                          text-slate-950

                          dark:text-white
                        "
                      >
                        {creatorName}
                      </p>

                      <p
                        className="
                          mt-1
                          truncate
                          text-[10px]
                          text-slate-400

                          dark:text-white/30
                        "
                      >
                        {creatorEmail}
                      </p>
                    </div>
                  </div>

                  <div
                    className="
                      mt-4
                      flex
                      flex-wrap
                      gap-2
                    "
                  >
                    <span
                      className="
                        rounded-full
                        border
                        border-[#D4AF37]/20
                        bg-[#D4AF37]/10
                        px-2.5
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.13em]
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      "
                    >
                      Creator
                    </span>

                    {/* Reward Points */}

                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        border-[#D4AF37]/25
                        bg-[#D4AF37]/10
                        px-2.5
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.13em]
                        text-[#98751A]

                        dark:border-[#D4AF37]/20
                        dark:text-[#E4C760]
                      "
                    >
                      <Sparkles size={9} />
                      {rewardPoints} Reward Points
                    </span>

                    <span
                      className={`
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        px-2.5
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.13em]

                        ${
                          emailVerified
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
                        }
                      `}
                    >
                      {emailVerified ? (
                        <ShieldCheck size={9} />
                      ) : (
                        <AlertCircle size={9} />
                      )}

                      {emailVerified ? "Verified" : "Verify Email"}
                    </span>

                    {hasPaidTier && (
                      <span
                        className="
                          inline-flex
                          items-center
                          gap-1.5
                          rounded-full
                          border
                          border-violet-200
                          bg-violet-50
                          px-2.5
                          py-1
                          text-[7px]
                          font-black
                          uppercase
                          tracking-[0.13em]
                          text-violet-700

                          dark:border-violet-400/20
                          dark:bg-violet-400/10
                          dark:text-violet-300
                        "
                      >
                        <Sparkles size={9} />

                        {humanize(subscriptionTier)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reward Summary */}

                <div
                  className="
                    border-b
                    border-slate-100
                    p-2

                    dark:border-white/[0.06]
                  "
                >
                  <button
                    type="button"
                    onClick={() =>
                      fetchCreatorRewardPoints({
                        silent: false,
                      })
                    }
                    disabled={rewardRefreshing}
                    className="
                      flex
                      w-full
                      items-center
                      gap-3
                      rounded-xl
                      border
                      border-[#D4AF37]/20
                      bg-[#D4AF37]/5
                      px-3
                      py-3
                      text-left
                      transition

                      hover:border-[#D4AF37]/40
                      hover:bg-[#D4AF37]/10

                      disabled:opacity-70
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
                        bg-[#D4AF37]
                        text-black
                      "
                    >
                      {rewardRefreshing ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <Sparkles size={15} />
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
                          tracking-[0.16em]
                          text-[#98751A]

                          dark:text-[#D4AF37]
                        "
                      >
                        Creator Rewards
                      </p>

                      <p
                        className="
                          mt-1
                          text-sm
                          font-semibold
                          text-slate-950

                          dark:text-white
                        "
                      >
                        {rewardPoints} Points
                      </p>

                      <p
                        className="
                          mt-0.5
                          text-[9px]
                          text-slate-400

                          dark:text-white/30
                        "
                      >
                        Earned from completed bookings
                      </p>
                    </div>
                  </button>
                </div>

                {/* Quick Action */}

                <div
                  className="
                    border-b
                    border-slate-100
                    p-2

                    dark:border-white/[0.06]
                  "
                >
                  <Link
                    to="/creator/bookings/new"
                    role="menuitem"
                    className="
                      flex
                      items-center
                      gap-3
                      rounded-xl
                      bg-[#D4AF37]
                      px-4
                      py-3
                      text-black
                      transition

                      hover:bg-[#E4C65D]
                    "
                  >
                    <div
                      className="
                        grid
                        h-8
                        w-8
                        shrink-0
                        place-items-center
                        rounded-lg
                        bg-black/10
                      "
                    >
                      <FilePlus2 size={14} />
                    </div>

                    <div
                      className="
                        min-w-0
                        flex-1
                      "
                    >
                      <p
                        className="
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[0.15em]
                        "
                      >
                        New Commission
                      </p>

                      <p
                        className="
                          mt-0.5
                          text-[9px]
                          text-black/60
                        "
                      >
                        Start a secure Designer contract
                      </p>
                    </div>

                    <ChevronRight size={13} />
                  </Link>
                </div>

                {/* Account Links */}

                <div className="p-2">
                  {ACCOUNT_NAVIGATION.map((item) => {
                    const Icon = item.icon;

                    const active = isPathActive(pathname, item.path);

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        role="menuitem"
                        className={`
                          mb-1
                          flex
                          items-center
                          gap-3
                          rounded-xl
                          px-3
                          py-2.5
                          transition

                          ${
                            active
                              ? "bg-[#D4AF37]/10 text-[#98751A] dark:text-[#D4AF37]"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/[0.05] dark:hover:text-white"
                          }
                        `}
                      >
                        <div
                          className="
                            grid
                            h-8
                            w-8
                            shrink-0
                            place-items-center
                            rounded-lg
                            bg-slate-100

                            dark:bg-white/[0.04]
                          "
                        >
                          <Icon size={14} />
                        </div>

                        <div
                          className="
                            min-w-0
                            flex-1
                          "
                        >
                          <p
                            className="
                              text-[9px]
                              font-black
                              uppercase
                              tracking-[0.14em]
                            "
                          >
                            {item.name}
                          </p>

                          <p
                            className="
                              mt-0.5
                              truncate
                              text-[9px]
                              font-normal
                              normal-case
                              tracking-normal
                              text-slate-400

                              dark:text-white/25
                            "
                          >
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Logout */}

                <div
                  className="
                    border-t
                    border-slate-100
                    p-2

                    dark:border-white/[0.06]
                  "
                >
                  <button
                    type="button"
                    onClick={handleLogout}
                    role="menuitem"
                    className="
                      flex
                      w-full
                      items-center
                      gap-3
                      rounded-xl
                      px-3
                      py-2.5
                      text-rose-600
                      transition

                      hover:bg-rose-50

                      dark:text-rose-400
                      dark:hover:bg-rose-500/10
                    "
                  >
                    <div
                      className="
                        grid
                        h-8
                        w-8
                        place-items-center
                        rounded-lg
                        bg-rose-50

                        dark:bg-rose-500/10
                      "
                    >
                      <LogOut size={14} />
                    </div>

                    <span
                      className="
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                      "
                    >
                      Secure Logout
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/*===============================================
          Mobile Controls
          ===============================================*/}

          <div
            className="
              flex
              shrink-0
              items-center
              gap-2

              lg:hidden
            "
          >
            {/* Mobile Reward Points */}

            <button
              type="button"
              onClick={() =>
                fetchCreatorRewardPoints({
                  silent: false,
                })
              }
              disabled={rewardRefreshing}
              aria-label={`${rewardPoints} Creator reward points`}
              className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-1.5
                rounded-xl
                border
                border-[#D4AF37]/25
                bg-[#D4AF37]/10
                px-2.5
                text-[#98751A]

                dark:border-[#D4AF37]/20
                dark:text-[#E4C760]
              "
            >
              {rewardRefreshing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}

              <span
                className="
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.12em]
                "
              >
                {rewardPoints}
              </span>
            </button>

            <Link
              to="/creator/bookings/new"
              aria-label="Create new commission"
              className="
                grid
                h-10
                w-10
                place-items-center
                rounded-xl
                bg-[#D4AF37]
                text-black
                shadow-sm
              "
            >
              <Plus size={17} />
            </Link>

            <ThemeToggle />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen
                  ? "Close creator navigation"
                  : "Open creator navigation"
              }
              className={`
                grid
                h-10
                w-10
                place-items-center
                rounded-xl
                border
                transition

                ${
                  mobileMenuOpen
                    ? `
                        border-[#D4AF37]/40
                        bg-[#D4AF37]/10
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      `
                    : `
                        border-slate-200
                        bg-slate-50
                        text-slate-600

                        hover:border-[#D4AF37]/30

                        dark:border-white/10
                        dark:bg-white/[0.035]
                        dark:text-white/55
                      `
                }
              `}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/*===================================================
      Mobile / Tablet Drawer
      ===================================================*/}

      {mobileMenuOpen && (
        <div
          className="
            fixed
            inset-0
            z-[45]

            lg:hidden
          "
        >
          {/* Backdrop */}

          <button
            type="button"
            aria-label="Close creator navigation"
            onClick={() => setMobileMenuOpen(false)}
            className="
              absolute
              inset-0
              bg-slate-950/50
              backdrop-blur-sm

              dark:bg-black/70
            "
          />

          {/* Drawer */}

          <aside
            aria-label="Creator mobile navigation"
            className="
              absolute
              bottom-0
              right-0
              top-20
              flex
              w-full
              max-w-[420px]
              flex-col
              border-l
              border-slate-200
              bg-white
              shadow-[-20px_0_70px_rgba(15,23,42,0.18)]

              dark:border-white/10
              dark:bg-[#080808]
              dark:shadow-[-20px_0_70px_rgba(0,0,0,0.7)]

              sm:w-[400px]
            "
          >
            {/*=============================================
            Identity
            =============================================*/}

            <div
              className="
                border-b
                border-slate-100
                p-5

                dark:border-white/[0.06]
              "
            >
              <div
                className="
                  flex
                  items-center
                  gap-4
                "
              >
                {renderCreatorIdentity("lg", "mobile")}

                <div
                  className="
                    min-w-0
                    flex-1
                  "
                >
                  <p
                    className="
                      truncate
                      font-serif
                      text-lg
                      text-slate-950

                      dark:text-white
                    "
                  >
                    {creatorName}
                  </p>

                  <p
                    className="
                      mt-1
                      truncate
                      text-[9px]
                      text-slate-400

                      dark:text-white/30
                    "
                  >
                    {creatorEmail}
                  </p>

                  <div
                    className="
                      mt-2
                      flex
                      flex-wrap
                      gap-1.5
                    "
                  >
                    <span
                      className="
                        rounded-full
                        border
                        border-[#D4AF37]/20
                        bg-[#D4AF37]/10
                        px-2
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.12em]
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      "
                    >
                      Creator
                    </span>

                    {/* Mobile Reward Badge */}

                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1
                        rounded-full
                        border
                        border-[#D4AF37]/25
                        bg-[#D4AF37]/10
                        px-2
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.12em]
                        text-[#98751A]

                        dark:border-[#D4AF37]/20
                        dark:text-[#E4C760]
                      "
                    >
                      <Sparkles size={8} />
                      {rewardPoints} Points
                    </span>

                    <span
                      className={`
                        inline-flex
                        items-center
                        gap-1
                        rounded-full
                        border
                        px-2
                        py-1
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[0.12em]

                        ${
                          emailVerified
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
                        }
                      `}
                    >
                      {emailVerified ? (
                        <ShieldCheck size={8} />
                      ) : (
                        <AlertCircle size={8} />
                      )}

                      {emailVerified ? "Verified" : "Unverified"}
                    </span>

                    {hasPaidTier && (
                      <span
                        className="
                          inline-flex
                          items-center
                          gap-1
                          rounded-full
                          border
                          border-violet-200
                          bg-violet-50
                          px-2
                          py-1
                          text-[7px]
                          font-black
                          uppercase
                          tracking-[0.12em]
                          text-violet-700

                          dark:border-violet-400/20
                          dark:bg-violet-400/10
                          dark:text-violet-300
                        "
                      >
                        <Sparkles size={8} />

                        {humanize(subscriptionTier)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Reward Summary */}

              <button
                type="button"
                onClick={() =>
                  fetchCreatorRewardPoints({
                    silent: false,
                  })
                }
                disabled={rewardRefreshing}
                className="
                  mt-4
                  flex
                  w-full
                  items-center
                  gap-3
                  rounded-xl
                  border
                  border-[#D4AF37]/20
                  bg-[#D4AF37]/5
                  px-4
                  py-3
                  text-left
                  transition

                  hover:border-[#D4AF37]/40
                  hover:bg-[#D4AF37]/10

                  disabled:opacity-70
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
                    bg-[#D4AF37]
                    text-black
                  "
                >
                  {rewardRefreshing ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.16em]
                      text-[#98751A]

                      dark:text-[#D4AF37]
                    "
                  >
                    Creator Rewards
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      font-semibold
                      text-slate-950

                      dark:text-white
                    "
                  >
                    {rewardPoints} Points
                  </p>
                </div>
              </button>

              {/* New Commission */}

              <Link
                to="/creator/bookings/new"
                className="
                  mt-5
                  flex
                  min-h-12
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
                  shadow-[0_12px_30px_rgba(212,175,55,0.2)]
                  transition

                  hover:bg-[#E4C65D]
                "
              >
                <FilePlus2 size={14} />
                Start New Booking
              </Link>
            </div>

            {/*=============================================
            Scrollable Navigation
            =============================================*/}

            <div
              className="
                min-h-0
                flex-1
                overflow-y-auto
                overscroll-contain
                p-4

                sm:p-5
              "
            >
              {/* Quick Actions */}

              <NavigationSection label="Quick Actions">
                {QUICK_ACTIONS.map((item) => (
                  <MobileNavigationItem
                    key={item.path + item.name}
                    item={item}
                    pathname={pathname}
                    compact
                  />
                ))}
              </NavigationSection>

              {/* Creator Hub */}

              <NavigationSection label="Creator Hub">
                {CREATOR_NAVIGATION.map((item) => (
                  <MobileNavigationItem
                    key={item.path}
                    item={item}
                    pathname={pathname}
                  />
                ))}
              </NavigationSection>

              {/* Account */}

              <NavigationSection label="Account" bordered>
                {ACCOUNT_NAVIGATION.map((item) => (
                  <MobileNavigationItem
                    key={item.path}
                    item={item}
                    pathname={pathname}
                  />
                ))}
              </NavigationSection>

              {/* Helpful Wallet Card */}

              <Link
                to="/creator/wallet"
                className="
                  group
                  mt-5
                  block
                  overflow-hidden
                  rounded-2xl
                  border
                  border-[#D4AF37]/20
                  bg-gradient-to-br
                  from-[#D4AF37]/10
                  to-transparent
                  p-4
                  transition

                  hover:border-[#D4AF37]/40

                  dark:from-[#D4AF37]/10
                  dark:to-white/[0.01]
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
                      h-10
                      w-10
                      shrink-0
                      place-items-center
                      rounded-xl
                      bg-[#D4AF37]
                      text-black
                    "
                  >
                    <BadgeDollarSign size={17} />
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
                        tracking-[0.16em]
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      "
                    >
                      Wallet & Billing
                    </p>

                    <p
                      className="
                        mt-1
                        text-[10px]
                        leading-5
                        text-slate-500

                        dark:text-white/35
                      "
                    >
                      Manage wallet funds, billing history and Creator
                      membership.
                    </p>
                  </div>

                  <ChevronRight
                    size={14}
                    className="
                      mt-1
                      shrink-0
                      text-[#98751A]
                      transition

                      group-hover:translate-x-1

                      dark:text-[#D4AF37]
                    "
                  />
                </div>
              </Link>
            </div>

            {/*=============================================
            Logout
            =============================================*/}

            <div
              className="
                border-t
                border-slate-100
                bg-slate-50/70
                p-4

                dark:border-white/[0.06]
                dark:bg-white/[0.015]
              "
            >
              <button
                type="button"
                onClick={handleLogout}
                className="
                  flex
                  h-11
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-rose-200
                  bg-rose-50
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.16em]
                  text-rose-600
                  transition

                  hover:bg-rose-600
                  hover:text-white

                  dark:border-rose-500/20
                  dark:bg-rose-500/10
                  dark:text-rose-400
                  dark:hover:bg-rose-500
                  dark:hover:text-white
                "
              >
                <LogOut size={14} />
                Secure Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/*===================================================
      Routed Creator Page
      ===================================================*/}

      <main
        className="
          relative
          z-10
          w-full
          flex-1
        "
      >
        <Outlet />
      </main>
    </div>
  );
}

/*=========================================================
Navigation Section
=========================================================*/

function NavigationSection({ label, bordered = false, children }) {
  return (
    <section
      className={`
        mb-5

        ${
          bordered
            ? "border-t border-slate-100 pt-5 dark:border-white/[0.06]"
            : ""
        }
      `}
    >
      <p
        className="
          mb-2
          px-2
          text-[7px]
          font-black
          uppercase
          tracking-[0.22em]
          text-slate-400

          dark:text-white/20
        "
      >
        {label}
      </p>

      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/*=========================================================
Mobile Navigation Item
=========================================================*/

function MobileNavigationItem({ item, pathname, compact = false }) {
  if (!item) {
    return null;
  }

  const Icon = item.icon;

  /*
  Generic support for future intentionally disabled
  navigation items.

  Sketch Studio is active and does not enter this branch.
  */

  if (item.disabled) {
    return (
      <div
        aria-disabled="true"
        title={`${item.description || ""} ${item.status || ""}`.trim()}
        className={`
          relative
          flex
          cursor-not-allowed
          items-center
          gap-3
          rounded-xl
          border
          border-violet-200/60
          bg-violet-50/60
          px-3.5
          text-violet-500/65
          opacity-80

          dark:border-violet-400/10
          dark:bg-violet-500/[0.06]
          dark:text-violet-300/45

          ${compact ? "min-h-[50px] py-2.5" : "min-h-[58px] py-3"}
        `}
      >
        <div
          className="
            grid
            h-9
            w-9
            shrink-0
            place-items-center
            rounded-lg
            bg-violet-100

            dark:bg-violet-500/10
          "
        >
          <Icon size={15} />
        </div>

        <div
          className="
            min-w-0
            flex-1
          "
        >
          <div className="flex items-center gap-2">
            <p
              className="
                text-[9px]
                font-black
                uppercase
                tracking-[0.14em]
              "
            >
              {item.name}
            </p>

            <span
              className="
                rounded-full
                border
                border-violet-200
                bg-white
                px-1.5
                py-0.5
                text-[6px]
                font-black
                uppercase
                tracking-[0.1em]
                text-violet-500

                dark:border-violet-400/20
                dark:bg-[#111]
                dark:text-violet-300/60
              "
            >
              {item.status || "Soon"}
            </span>
          </div>

          {!compact && item.description && (
            <p
              className="
                mt-1
                truncate
                text-[9px]
                font-normal
                normal-case
                tracking-normal
                text-violet-400/70

                dark:text-violet-300/30
              "
            >
              {item.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  const active = isPathActive(pathname, item.path);

  const sketchStudio = item.accent === "violet";

  return (
    <Link
      to={item.path}
      className={`
        group
        flex
        items-center
        gap-3
        rounded-xl
        border
        px-3.5
        transition

        ${compact ? "min-h-[50px] py-2.5" : "min-h-[58px] py-3"}

        ${
          active && sketchStudio
            ? `
                border-violet-300
                bg-violet-50
                text-violet-700

                dark:border-violet-400/20
                dark:bg-violet-500/10
                dark:text-violet-200
              `
            : active
              ? `
                  border-[#D4AF37]/30
                  bg-[#D4AF37]/10
                  text-[#876810]

                  dark:text-[#F0D783]
                `
              : sketchStudio
                ? `
                    border-transparent
                    text-violet-600

                    hover:border-violet-200
                    hover:bg-violet-50

                    dark:text-violet-300/70
                    dark:hover:border-violet-400/20
                    dark:hover:bg-violet-500/10
                    dark:hover:text-violet-200
                  `
                : `
                    border-transparent
                    text-slate-600

                    hover:border-slate-200
                    hover:bg-slate-100

                    dark:text-white/50
                    dark:hover:border-white/10
                    dark:hover:bg-white/[0.05]
                    dark:hover:text-white
                  `
        }
      `}
    >
      <div
        className={`
          grid
          h-9
          w-9
          shrink-0
          place-items-center
          rounded-lg
          transition

          ${
            active && sketchStudio
              ? "bg-violet-500/10"
              : active
                ? "bg-[#D4AF37]/15"
                : sketchStudio
                  ? "bg-violet-50 group-hover:bg-violet-100 dark:bg-violet-500/[0.06] dark:group-hover:bg-violet-500/10"
                  : "bg-slate-100 group-hover:bg-white dark:bg-white/[0.04] dark:group-hover:bg-white/[0.07]"
          }
        `}
      >
        <Icon size={15} />
      </div>

      <div
        className="
          min-w-0
          flex-1
        "
      >
        <p
          className="
            text-[9px]
            font-black
            uppercase
            tracking-[0.14em]
          "
        >
          {item.name}
        </p>

        {!compact && item.description && (
          <p
            className={`
              mt-1
              truncate
              text-[9px]
              font-normal
              normal-case
              tracking-normal

              ${
                sketchStudio
                  ? "text-violet-400 dark:text-violet-300/40"
                  : "text-slate-400 dark:text-white/25"
              }
            `}
          >
            {item.description}
          </p>
        )}
      </div>

      {active ? (
        <span
          className="
            h-1.5
            w-1.5
            shrink-0
            rounded-full
            bg-current
          "
        />
      ) : (
        <ChevronRight
          size={13}
          className="
            shrink-0
            text-slate-300
            transition

            group-hover:translate-x-0.5

            dark:text-white/15
          "
        />
      )}
    </Link>
  );
}
