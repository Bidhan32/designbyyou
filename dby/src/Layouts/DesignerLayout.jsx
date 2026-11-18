import RouteContent from "../components/RouteContent";
import useModalFocus from "../components/useModalFocus";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Link, Outlet, useLocation } from "react-router-dom";

import {
  Award,
  CalendarDays,
  ChevronDown,
  Compass,
  FolderOpen,
  Loader2,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  Sparkles,
  UploadCloud,
  User,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext.helpers.js";
import ThemeToggle from "../components/ThemeToggle";

import ProfileIdentity from "../pages/avatar/ProfileIdentity";

import API from "../api/axios";

/* =========================================================
   DesignByYou
   Designer Layout
   Version 6.2

   Identity Architecture
   ---------------------------------------------------------

   Saved Fashion Persona
          ↓
   ProfileIdentity.jsx
          ↓
   Primary designer identity

   Fallback:
   profile_image_url
          ↓
   initials

   Designer Tier Architecture
   ---------------------------------------------------------

   designer_profiles.total_completed_bookings
          ↓
   designer_profiles.tier
          ↓
   Bronze / Silver / Gold / Diamond

   Tier thresholds:

   0 - 4 completed bookings
       Bronze

   5 - 19 completed bookings
       Silver

   20 - 49 completed bookings
       Gold

   50+ completed bookings
       Diamond

   Tier information is displayed in:

   - desktop navbar
   - account dropdown
   - mobile navbar
   - mobile drawer

   /auth/me is used as the authoritative refresh source.

   Responsive Architecture
   ---------------------------------------------------------

   < 1024px
   Mobile / Tablet Drawer

   >= 1024px
   Laptop Navigation

   >= 1280px
   Full Desktop Labels

   Removed:
   - Workspace Hub navigation
   - Studio Panel
   - Secondary navigation
   - Legacy Studio Sketch
   - Designer Fashion Editor navigation
   ========================================================= */

/* =========================================================
   Navigation
   ========================================================= */

const PRIMARY_NAVIGATION = [
  {
    path: "/designer/explore",
    label: "Discover",
    laptopLabel: "Discover",
    icon: Compass,
  },

  {
    path: "/designer/inventory",
    label: "Portfolio",
    laptopLabel: "Portfolio",
    icon: Package,
  },



  {
    path: "/designer/bookings",
    label: "Bookings",
    laptopLabel: "Bookings",
    icon: CalendarDays,
  },
];

const SECONDARY_NAVIGATION = [
  {
    path: "/designer/avatar-studio",
    label: "Avatar Studio",
    laptopLabel: "Avatar",
    icon: Sparkles,
    accent: "violet",
  },
  {
    path: "/designer/wallet",
    label: "Earnings",
    icon: Wallet,
  },

  {
    path: "/designer/upload",
    label: "Add to portfolio",
    icon: UploadCloud,
  },

  {
    path: "/designer/profile-view",
    label: "Public Profile",
    icon: User,
  },
  { path: "/designer/projects", label: "My Projects", icon: FolderOpen },

  {
    path: "/designer/profile-settings",
    label: "Profile Settings",
    icon: Settings,
  },
];

/* =========================================================
   Helpers
   ========================================================= */

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function isRequestCanceled(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function normalizeCompletedBookings(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return null;
  }

  return Math.floor(count);
}

function normalizeDesignerTier(value) {
  const tier = normalize(value);

  if (["bronze", "silver", "gold", "diamond"].includes(tier)) {
    return tier;
  }

  return null;
}

function deriveDesignerTier(completedBookings) {
  const count = normalizeCompletedBookings(completedBookings);

  if (count === null) {
    return null;
  }

  if (count >= 50) {
    return "diamond";
  }

  if (count >= 20) {
    return "gold";
  }

  if (count >= 5) {
    return "silver";
  }

  return "bronze";
}

function getDesignerTierMeta(tier) {
  switch (normalizeDesignerTier(tier)) {
    case "diamond":
      return {
        key: "diamond",
        label: "Diamond",
        shortLabel: "Diamond",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        iconClass: "text-action",
        panelClass:
          "border-line bg-surface",
      };

    case "gold":
      return {
        key: "gold",
        label: "Gold",
        shortLabel: "Gold",
        badgeClass:
          "border-line bg-subtle text-action",
        iconClass: "text-action",
        panelClass:
          "border-line bg-surface",
      };

    case "silver":
      return {
        key: "silver",
        label: "Silver",
        shortLabel: "Silver",
        badgeClass:
          "border-line bg-subtle text-ink",
        iconClass: "text-muted",
        panelClass:
          "border-line bg-surface",
      };

    case "bronze":
      return {
        key: "bronze",
        label: "Bronze",
        shortLabel: "Bronze",
        badgeClass:
          "border-line bg-subtle text-action",
        iconClass: "text-action",
        panelClass:
          "border-line bg-surface",
      };

    default:
      return {
        key: null,
        label: "Tier unavailable",
        shortLabel: "Tier",
        badgeClass:
          "border-line bg-subtle text-muted",
        iconClass: "text-muted",
        panelClass:
          "border-line bg-canvas dark:bg-subtle",
      };
  }
}

function getDesignerTierProgress(completedBookings) {
  const count = normalizeCompletedBookings(completedBookings);

  if (count === null) {
    return {
      known: false,
      completedBookings: null,
      nextTier: null,
      target: null,
      remaining: null,
      progressPercent: 0,
      maxTier: false,
    };
  }

  if (count >= 50) {
    return {
      known: true,
      completedBookings: count,
      nextTier: null,
      target: 50,
      remaining: 0,
      progressPercent: 100,
      maxTier: true,
    };
  }

  if (count >= 20) {
    return {
      known: true,
      completedBookings: count,
      nextTier: "Diamond",
      target: 50,
      remaining: 50 - count,
      progressPercent: Math.min(100, Math.max(0, ((count - 20) / 30) * 100)),
      maxTier: false,
    };
  }

  if (count >= 5) {
    return {
      known: true,
      completedBookings: count,
      nextTier: "Gold",
      target: 20,
      remaining: 20 - count,
      progressPercent: Math.min(100, Math.max(0, ((count - 5) / 15) * 100)),
      maxTier: false,
    };
  }

  return {
    known: true,
    completedBookings: count,
    nextTier: "Silver",
    target: 5,
    remaining: 5 - count,
    progressPercent: Math.min(100, Math.max(0, (count / 5) * 100)),
    maxTier: false,
  };
}

/* =========================================================
   Route Matching

   Supports nested Designer routes such as:

   /designer/bookings/:id
   /designer/showcase/:slug
   ========================================================= */

function isPathActive(pathname, path) {
  if (pathname === path) {
    return true;
  }

  return pathname.startsWith(`${path}/`);
}

/* =========================================================
   Avatar API Response
   ========================================================= */

function extractAvatarPayload(response) {
  const body = response?.data;

  const candidates = [body?.data?.avatar, body?.avatar, body?.data, body];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        (Object.prototype.hasOwnProperty.call(candidate, "avatar_config") ||
          Object.prototype.hasOwnProperty.call(candidate, "exists") ||
          Object.prototype.hasOwnProperty.call(candidate, "avatar_version")),
    ) || null
  );
}

function extractAuthenticatedProfile(response) {
  const body = response?.data;

  const candidates = [body?.data?.user, body?.data, body?.user, body];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        (Object.prototype.hasOwnProperty.call(candidate, "id") ||
          Object.prototype.hasOwnProperty.call(candidate, "role")),
    ) || null
  );
}

/* =========================================================
   Laptop / Desktop Navigation Item
   ========================================================= */

function DesktopNavigationItem({ item, pathname }) {
  const Icon = item.icon;

  const active = isPathActive(pathname, item.path);

  let activeClass = `
    border-line bg-subtle text-ink
  `;

  let inactiveClass = `
    border-transparent text-muted hover:border-line hover:bg-subtle hover:text-ink
  `;

  let indicatorClass = "bg-action text-on-action";

  /* =======================================================
     Optional Gold Accent
     ======================================================= */

  if (item.accent === "gold") {
    activeClass = `
      border-line bg-subtle text-action
    `;

    inactiveClass = `
      border-transparent text-muted hover:border-line hover:bg-subtle hover:text-action
    `;
  }

  /* =======================================================
     Fashion Persona Violet Accent
     ======================================================= */

  if (item.accent === "violet") {
    activeClass = `
      border-line bg-subtle text-action
    `;

    inactiveClass = `
      border-transparent text-muted hover:border-line hover:bg-canvas hover:text-action dark:hover:bg-subtle
    `;

    indicatorClass = "bg-action text-on-action";
  }

  return (
    <Link
      to={item.path}
      title={item.label}
      className={`
        group relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold tracking-normal transition-all duration-300 xl:gap-2 xl:px-3 xl:text-xs xl:tracking-normal 2xl:px-3.5

        ${active ? activeClass : inactiveClass}
      `}
    >
      <Icon size={13} className="shrink-0" />

      <span className="xl:hidden">{item.laptopLabel}</span>

      <span className="hidden xl:inline">{item.label}</span>

      {active && (<span className={`absolute -bottom-[17px] left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full ${indicatorClass}`} />)}
    </Link>
  );
}

/* =========================================================
   Mobile Navigation Item
   ========================================================= */

function MobileNavigationItem({ item, pathname }) {
  if (!item) {
    return null;
  }

  const Icon = item.icon;

  const active = isPathActive(pathname, item.path);

  let activeClass =
    "border-line bg-subtle text-action";

  let inactiveClass =
    "border-transparent text-muted hover:border-line hover:bg-subtle dark:hover:text-ink";

  if (item.accent === "violet") {
    activeClass =
      "border-line bg-subtle text-action";

    inactiveClass =
      "border-line text-action hover:border-line hover:bg-canvas dark:text-muted dark:hover:bg-subtle dark:hover:text-action";
  }

  return (
    <Link
      to={item.path}
      className={`
        flex min-h-9 items-center gap-3 rounded-md border px-4 py-3 text-xs font-semibold tracking-normal transition-all

        ${active ? activeClass : inactiveClass}
      `}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-subtle"
      >
        <Icon size={14} />
      </div>

      <span className="min-w-0 flex-1">{item.label}</span>

      {active && (<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />)}
    </Link>
  );
}

/* =========================================================
   Dropdown Link
   ========================================================= */

function DropdownLink({ to, icon: Icon, label, accent = "" }) {
  if (accent === "violet") {
    return (
      <Link
        to={to}
        role="menuitem"
        className="flex min-h-9 items-center gap-3 rounded-md px-3.5 text-xs font-semibold tracking-normal text-action transition-all hover:bg-canvas dark:hover:bg-subtle"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-subtle">
          <Icon size={13} />
        </div>

        {label}
      </Link>
    );
  }

  return (
    <Link
      to={to}
      role="menuitem"
      className="flex min-h-9 items-center gap-3 rounded-md px-3.5 text-xs font-semibold tracking-normal text-muted transition-all hover:bg-canvas hover:text-ink dark:hover:bg-subtle"
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-md bg-subtle text-action"
      >
        <Icon size={13} />
      </div>

      {label}
    </Link>
  );
}

/* =========================================================
   Designer Navbar
   ========================================================= */

function DesignerNavbar({ user, logout }) {
  const location = useLocation();

  const pathname = location.pathname;

  const dropdownRef = useRef(null);

  const identityRequestRef = useRef(null);

  const tierRequestRef = useRef(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useModalFocus(mobileMenuOpen, () => setMobileMenuOpen(false));

  /* =======================================================
     Shared Fashion Persona
     ======================================================= */

  const [identityAvatar, setIdentityAvatar] = useState(null);

  const [identityLoaded, setIdentityLoaded] = useState(false);

  /* =======================================================
     Designer Tier / Booking Progress
     ======================================================= */

  const [designerTier, setDesignerTier] = useState(() => {
    return (
      normalizeDesignerTier(user?.tier) ||
      deriveDesignerTier(user?.total_completed_bookings)
    );
  });

  const [completedBookings, setCompletedBookings] = useState(() =>
    normalizeCompletedBookings(user?.total_completed_bookings),
  );

  const [tierRefreshing, setTierRefreshing] = useState(false);

  /* =======================================================
     Load Primary Identity
     ======================================================= */

  const loadIdentityAvatar = useCallback(async ({ silent = false } = {}) => {
    identityRequestRef.current?.abort();

    const controller = new AbortController();

    identityRequestRef.current = controller;

    try {
      const response = await API.get("/avatar/me", {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const avatar = extractAvatarPayload(response);

      setIdentityAvatar(avatar);

      setIdentityLoaded(true);
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }

      if (!silent) {
        console.warn("Designer Fashion Persona could not be loaded:", error);
      }

      setIdentityAvatar(null);

      setIdentityLoaded(true);
    } finally {
      if (identityRequestRef.current === controller) {
        identityRequestRef.current = null;
      }
    }
  }, []);

  /* =======================================================
     Load Designer Tier
     ======================================================= */

  const loadDesignerTier = useCallback(async ({ silent = true } = {}) => {
    tierRequestRef.current?.abort();

    const controller = new AbortController();

    tierRequestRef.current = controller;

    if (!silent) {
      setTierRefreshing(true);
    }

    try {
      const response = await API.get("/auth/me", {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const profile = extractAuthenticatedProfile(response);

      if (!profile) {
        return;
      }

      if (normalize(profile.role) !== "designer") {
        return;
      }

      const nextCompletedBookings = normalizeCompletedBookings(
        profile.total_completed_bookings,
      );

      const nextTier =
        normalizeDesignerTier(profile.tier) ||
        deriveDesignerTier(nextCompletedBookings);

      if (nextCompletedBookings !== null) {
        setCompletedBookings(nextCompletedBookings);
      }

      if (nextTier) {
        setDesignerTier(nextTier);
      }
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }

      if (!silent) {
        console.warn("Designer tier could not be refreshed:", error);
      }
    } finally {
      if (tierRequestRef.current === controller) {
        tierRequestRef.current = null;
      }

      if (!silent) {
        setTierRefreshing(false);
      }
    }
  }, []);

  /* =======================================================
     Synchronize AuthContext Tier
     ======================================================= */

  useEffect(() => {
    const authCompleted = normalizeCompletedBookings(
      user?.total_completed_bookings,
    );

    const authTier =
      normalizeDesignerTier(user?.tier) || deriveDesignerTier(authCompleted);

    if (authCompleted !== null) {
      setCompletedBookings(authCompleted);
    }

    if (authTier) {
      setDesignerTier(authTier);
    }
  }, [user?.tier, user?.total_completed_bookings]);

  /* =======================================================
     Initial Identity + Tier Load
     ======================================================= */

  useEffect(() => {
    void loadIdentityAvatar();

    void loadDesignerTier();

    return () => {
      identityRequestRef.current?.abort();

      tierRequestRef.current?.abort();
    };
  }, [loadIdentityAvatar, loadDesignerTier]);

  /* =======================================================
     Refresh After Route Changes
     ======================================================= */

  useEffect(() => {
    if (identityLoaded) {
      void loadIdentityAvatar({
        silent: true,
      });
    }

    void loadDesignerTier({
      silent: true,
    });
  }, [pathname, identityLoaded, loadIdentityAvatar, loadDesignerTier]);

  /* =======================================================
     Refresh Tier When App Regains Focus
     ======================================================= */

  useEffect(() => {
    const handleFocus = () => {
      void loadDesignerTier({
        silent: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadDesignerTier({
          silent: true,
        });
      }
    };

    window.addEventListener("focus", handleFocus);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadDesignerTier]);

  /* =======================================================
     Optional Tier Update Event

     Other Designer pages may dispatch:

     window.dispatchEvent(
       new CustomEvent("designer-tier-updated")
     )

     or:

     detail: {
       tier: "gold",
       totalCompletedBookings: 20
     }
     ======================================================= */

  useEffect(() => {
    const handleTierUpdated = (event) => {
      const eventCompleted = normalizeCompletedBookings(
        event?.detail?.totalCompletedBookings,
      );

      const eventTier =
        normalizeDesignerTier(event?.detail?.tier) ||
        deriveDesignerTier(eventCompleted);

      if (eventCompleted !== null) {
        setCompletedBookings(eventCompleted);
      }

      if (eventTier) {
        setDesignerTier(eventTier);

        return;
      }

      void loadDesignerTier({
        silent: true,
      });
    };

    window.addEventListener("designer-tier-updated", handleTierUpdated);

    return () => {
      window.removeEventListener("designer-tier-updated", handleTierUpdated);
    };
  }, [loadDesignerTier]);

  /* =======================================================
     Close Menus After Navigation
     ======================================================= */

  useEffect(() => {
    setDropdownOpen(false);

    setMobileMenuOpen(false);
  }, [pathname]);

  /* =======================================================
     Outside Click / Escape
     ======================================================= */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);

        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);

      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /* =======================================================
     Mobile Drawer Body Lock
     ======================================================= */

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileMenuOpen(false); };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [mobileMenuOpen]);

  /* =======================================================
     Dropdown Toggle
     ======================================================= */

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((current) => {
      const next = !current;

      if (next) {
        void loadIdentityAvatar({
          silent: true,
        });

        void loadDesignerTier({
          silent: true,
        });
      }

      return next;
    });
  }, [loadIdentityAvatar, loadDesignerTier]);

  /* =======================================================
     Mobile Drawer Toggle
     ======================================================= */

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((current) => {
      const next = !current;

      if (next) {
        void loadIdentityAvatar({
          silent: true,
        });

        void loadDesignerTier({
          silent: true,
        });
      }

      return next;
    });
  }, [loadIdentityAvatar, loadDesignerTier]);

  /* =======================================================
     Logout
     ======================================================= */

  const handleLogout = async () => {
    setDropdownOpen(false);

    setMobileMenuOpen(false);

    try {
      await logout();
    } catch (error) {
      console.error("Designer logout failed:", error);
    }
  };

  /* =======================================================
     Shared Display State
     ======================================================= */

  const sharedIdentityAvatar = identityLoaded ? identityAvatar : null;

  const tierMeta = getDesignerTierMeta(designerTier);

  const tierProgress = getDesignerTierProgress(completedBookings);

  /* =======================================================
     Render
     ======================================================= */

  return (
    <>
      {/* ===================================================
          Main Navigation
          =================================================== */}

      <header
        className="sticky top-0 z-50 border-b border-line bg-subtle"
      >
        <div
          className="mx-auto flex h-[72px] w-full max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-5 lg:gap-2 lg:px-4 xl:gap-4 xl:px-7 2xl:px-10"
        >
          {/* ===============================================
              Logo
              =============================================== */}

          <Link
            to="/designer/explore"
            aria-label="DesignByYou"
            className="group flex min-w-0 shrink-0 items-center gap-2.5 xl:gap-3"
          >
            <div
              className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-action text-xs font-semibold text-on-action transition-all duration-300 group-"
            >
              D
              
            </div>

            <div className="min-w-0">
              <span
                className="block truncate font-serif text-[14px] font-light tracking-normal text-ink xl:text-base xl:tracking-normal 2xl:text-lg"
              >
                DesignBy
                <span className="font-bold">You</span>
              </span>

              <span
                className="hidden text-[6px] font-semibold tracking-normal text-muted xl:block"
              >
                Designer Network
              </span>
            </div>
          </Link>

          {/* ===============================================
              Laptop + Desktop Navigation
              =============================================== */}

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0 lg:flex xl:gap-1"
          >
            {PRIMARY_NAVIGATION.map((item) => (
              <DesktopNavigationItem
                key={item.path}
                item={item}
                pathname={pathname}
              />
            ))}
          </nav>

          {/* ===============================================
              Laptop + Desktop Account Controls
              =============================================== */}

          <div
            className="hidden shrink-0 items-center gap-1 lg:flex xl:gap-2"
          >
            {/* Wallet */}

            <Link
              to="/designer/wallet"
              title="Financial Wallet"
              aria-label="Financial Wallet"
              className={`
                flex h-9 w-10 shrink-0 items-center justify-center rounded-md border transition-all

                ${
                  isPathActive(pathname, "/designer/wallet")
                    ? "border-line bg-subtle text-action"
                    : "border-line bg-canvas text-muted hover:border-line hover:text-action dark:bg-subtle"
                }
              `}
            >
              <Wallet size={15} />
            </Link>

            {/* Theme */}

            <ThemeToggle />

            {/* Designer Tier */}

            <button
              type="button"
              onClick={() =>
                void loadDesignerTier({
                  silent: false,
                })
              }
              disabled={tierRefreshing}
              title={
                designerTier
                  ? `${tierMeta.label} Designer`
                  : "Refresh Designer tier"
              }
              aria-label={
                designerTier
                  ? `${tierMeta.label} Designer tier`
                  : "Designer tier"
              }
              className={`
                inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 transition-all disabled:cursor-wait disabled:opacity-70

                ${tierMeta.badgeClass}

                xl:px-3
              `}
            >
              {tierRefreshing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Award size={13} className={tierMeta.iconClass} />
              )}

              <span
                className="text-xs font-semibold tracking-normal xl:text-xs xl:tracking-normal"
              >
                {tierMeta.shortLabel}

                <span className="hidden 2xl:inline"> Designer</span>
              </span>
            </button>

            {/* =============================================
                Account Dropdown
                ============================================= */}

            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={toggleDropdown}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className={`
                  flex h-9 items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 transition-all

                  ${
                    dropdownOpen
                      ? "border-line bg-subtle"
                      : "border-line bg-canvas hover:border-line dark:bg-subtle"
                  }
                `}
              >
                <ProfileIdentity
                  user={user}
                  avatar={sharedIdentityAvatar}
                  autoLoadAvatar={false}
                  isOwnProfile
                  size="sm"
                  ariaLabel="Designer profile identity"
                />

                <div
                  className="hidden max-w-[115px] text-left 2xl:block"
                >
                  <p className="truncate text-xs font-bold text-ink">
                    {user?.full_name || "Designer"}
                  </p>

                  <p className="mt-0.5 text-xs font-semibold tracking-normal text-muted">
                    {designerTier ? `${tierMeta.label} Designer` : "Designer"}
                  </p>
                </div>

                <ChevronDown
                  size={12}
                  className={`
                    shrink-0 text-muted transition-transform

                    ${dropdownOpen ? "rotate-180 text-action" : ""}
                  `}
                />
              </button>

              {/* ===========================================
                  Dropdown Menu
                  =========================================== */}

              {dropdownOpen && (
                <div
                  role="menu"
                  className="account-dropdown absolute right-0 flex flex-col top-[calc(100%+12px)] w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-line bg-subtle p-2"
                >
                <div className="account-menu-scroll">
                  {/* =======================================
                      Identity Header
                      ======================================= */}

                  <div
                    className="mb-2 flex items-center gap-3 rounded-md bg-canvas p-4 dark:bg-subtle"
                  >
                    <ProfileIdentity
                      user={user}
                      avatar={sharedIdentityAvatar}
                      autoLoadAvatar={false}
                      isOwnProfile
                      size="lg"
                      ariaLabel="Designer identity"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-sm text-ink">
                        {user?.full_name || "Designer"}
                      </p>

                      <p className="mt-1 truncate text-xs text-muted">
                        {user?.email || "Designer account"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span
                          className={`
                            inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold tracking-normal

                            ${tierMeta.badgeClass}
                          `}
                        >
                          <Award size={8} />

                          {designerTier
                            ? `${tierMeta.label} Designer`
                            : "Designer Tier"}
                        </span>

                        {identityAvatar?.exists && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-2 py-1 text-xs font-semibold tracking-normal text-action">
                            <Sparkles size={8} />
                            Fashion Persona
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* =======================================
                      Designer Tier Summary
                      ======================================= */}

                  <div
                    className={`
                      mb-2 rounded-md border p-4

                      ${tierMeta.panelClass}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-subtle

                          ${tierMeta.badgeClass}
                        `}
                      >
                        {tierRefreshing ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <Award size={17} className={tierMeta.iconClass} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold tracking-normal text-muted">
                          Designer Level
                        </p>

                        <p className="mt-1 font-serif text-lg text-ink">
                          {designerTier
                            ? `${tierMeta.label} Designer`
                            : "Tier unavailable"}
                        </p>

                        {tierProgress.known && (
                          <p className="mt-1 text-xs text-muted">
                            {tierProgress.completedBookings} completed booking
                            {tierProgress.completedBookings === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void loadDesignerTier({
                            silent: false,
                          })
                        }
                        disabled={tierRefreshing}
                        aria-label="Refresh Designer tier"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:border-line hover:text-action disabled:opacity-50 dark:bg-subtle"
                      >
                        <RefreshCw
                          size={12}
                          className={tierRefreshing ? "animate-spin" : ""}
                        />
                      </button>
                    </div>

                    {tierProgress.known && (
                      <div className="mt-4">
                        {tierProgress.maxTier ? (
                          <div className="rounded-md border border-line bg-subtle px-3 py-2 text-xs font-semibold tracking-normal text-action">
                            Highest Designer tier achieved
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold tracking-normal text-muted">
                                Progress to {tierProgress.nextTier}
                              </p>

                              <p className="text-xs font-semibold tracking-normal text-muted">
                                {tierProgress.remaining} remaining
                              </p>
                            </div>

                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
                              <div
                                className="h-full rounded-full bg-action transition-all duration-500 text-on-action"
                                style={{
                                  width: `${tierProgress.progressPercent}%`,
                                }}
                              />
                            </div>

                            <p className="mt-2 text-xs leading-4 text-muted">
                              Reach {tierProgress.target} completed bookings to
                              unlock the {tierProgress.nextTier} tier.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Avatar */}

                  <DropdownLink
                    to="/designer/avatar-studio"
                    icon={Sparkles}
                    label="Avatar Studio"
                    accent="violet"
                  />

                  {/* Profile */}

                  <DropdownLink
                    to="/designer/profile-view"
                    icon={User}
                    label="Public Profile"
                  />
                  <DropdownLink to="/designer/projects" icon={FolderOpen} label="My Projects" />

                  {/* Upload */}

                  <DropdownLink
                    to="/designer/upload"
                    icon={UploadCloud}
                    label="Upload Showcase"
                  />

                  {/* Settings */}

                  <DropdownLink
                    to="/designer/profile-settings"
                    icon={Settings}
                    label="Profile Settings"
                  />
                </div>


                  {/* Logout */}

                  <div className="shrink-0 mt-2 border-t border-line pt-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      role="menuitem"
                      className="flex min-h-9 w-full items-center gap-3 rounded-md px-3.5 text-left text-xs font-semibold tracking-normal text-action transition-all hover:bg-canvas dark:hover:bg-subtle"
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===============================================
              Phone / Tablet
              =============================================== */}

          <div
            className="flex shrink-0 items-center gap-2 lg:hidden"
          >
            {/* Mobile Tier Badge */}

            <button
              type="button"
              onClick={() =>
                void loadDesignerTier({
                  silent: false,
                })
              }
              disabled={tierRefreshing}
              aria-label={
                designerTier ? `${tierMeta.label} Designer` : "Designer tier"
              }
              className={`
                inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 transition disabled:opacity-60

                ${tierMeta.badgeClass}
              `}
            >
              {tierRefreshing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Award size={13} />
              )}

              <span className="text-xs font-semibold tracking-normal">
                {tierMeta.shortLabel}
              </span>
            </button>

            <ThemeToggle />

            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen
                  ? "Close designer navigation"
                  : "Open designer navigation"
              }
              className={`
                flex h-9 w-10 items-center justify-center rounded-md border transition-all

                ${
                  mobileMenuOpen
                    ? "border-line bg-subtle text-action"
                    : "border-line bg-canvas text-muted hover:border-line dark:bg-subtle"
                }
              `}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================
          Mobile / Tablet Drawer
          =================================================== */}

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[45] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            data-modal-backdrop=""
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-subtle dark:bg-black/65"
          />

          <aside
            ref={mobileMenuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Designer mobile navigation"
            tabIndex={-1}
            className="mobile-navigation absolute bottom-0 right-0 top-[72px] flex w-full max-w-[400px] flex-col border-l border-line bg-surface dark:bg-canvas sm:w-[390px]"
          >
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="min-h-9 shrink-0 self-end px-5 text-sm font-semibold">Close navigation</button>
            <div className="account-menu-scroll">
            {/* =============================================
                Identity
                ============================================= */}

            <div className="border-b border-line p-4">
              <div className="flex items-center gap-4">
                <ProfileIdentity
                  user={user}
                  avatar={sharedIdentityAvatar}
                  autoLoadAvatar={false}
                  isOwnProfile
                  size="lg"
                  ariaLabel="Designer profile identity"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-base text-ink">
                    {user?.full_name || "Designer"}
                  </p>

                  <p className="mt-1 truncate text-xs text-muted">
                    {user?.email || "Designer account"}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={`
                        inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold tracking-normal

                        ${tierMeta.badgeClass}
                      `}
                    >
                      <Award size={8} />

                      {designerTier
                        ? `${tierMeta.label} Designer`
                        : "Designer Tier"}
                    </span>

                    {identityAvatar?.exists && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle px-2 py-1 text-xs font-semibold tracking-normal text-action">
                        <Sparkles size={8} />
                        Fashion Persona
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ===========================================
                  Mobile Tier Summary
                  =========================================== */}

              <div
                className={`
                  mt-4 rounded-md border p-4

                  ${tierMeta.panelClass}
                `}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-subtle

                      ${tierMeta.badgeClass}
                    `}
                  >
                    {tierRefreshing ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Award size={17} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-normal text-muted">
                      Designer Level
                    </p>

                    <p className="mt-1 font-serif text-base text-ink">
                      {designerTier
                        ? `${tierMeta.label} Designer`
                        : "Tier unavailable"}
                    </p>

                    {tierProgress.known && (
                      <p className="mt-1 text-xs text-muted">
                        {tierProgress.completedBookings} completed booking
                        {tierProgress.completedBookings === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void loadDesignerTier({
                        silent: false,
                      })
                    }
                    disabled={tierRefreshing}
                    aria-label="Refresh Designer tier"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted disabled:opacity-50 dark:bg-subtle"
                  >
                    <RefreshCw
                      size={12}
                      className={tierRefreshing ? "animate-spin" : ""}
                    />
                  </button>
                </div>

                {tierProgress.known && (
                  <div className="mt-4">
                    {tierProgress.maxTier ? (
                      <p className="text-xs font-semibold tracking-normal text-action">
                        Highest Designer tier achieved
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold tracking-normal text-muted">
                            Progress to {tierProgress.nextTier}
                          </p>

                          <p className="text-xs font-semibold tracking-normal text-muted">
                            {tierProgress.remaining} remaining
                          </p>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
                          <div
                            className="h-full rounded-full bg-action transition-all duration-500 text-on-action"
                            style={{
                              width: `${tierProgress.progressPercent}%`,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* =============================================
                Navigation
                ============================================= */}

            <div className="p-4">
              {/* Create */}

              <div className="mb-5">
                <p className="mb-2 px-2 text-xs font-semibold tracking-normal text-muted">
                  Create
                </p>

                <div className="space-y-1.5">
                  <MobileNavigationItem
                    item={PRIMARY_NAVIGATION.find(
                      (item) => item.path === "/designer/avatar-studio",
                    )}
                    pathname={pathname}
                  />

                  <MobileNavigationItem
                    item={SECONDARY_NAVIGATION.find(
                      (item) => item.path === "/designer/upload",
                    )}
                    pathname={pathname}
                  />
                </div>
              </div>

              {/* Explore & Manage */}

              <div className="mb-5 border-t border-line pt-5">
                <p className="mb-2 px-2 text-xs font-semibold tracking-normal text-muted">
                  Explore & Manage
                </p>

                <div className="space-y-1.5">
                  {PRIMARY_NAVIGATION.filter(
                    (item) => item.path !== "/designer/avatar-studio",
                  ).map((item) => (
                    <MobileNavigationItem
                      key={item.path}
                      item={item}
                      pathname={pathname}
                    />
                  ))}

                  <MobileNavigationItem
                    item={SECONDARY_NAVIGATION.find(
                      (item) => item.path === "/designer/wallet",
                    )}
                    pathname={pathname}
                  />
                </div>
              </div>

              {/* Account */}

              <div className="border-t border-line pt-5">
                <p className="mb-2 px-2 text-xs font-semibold tracking-normal text-muted">
                  Account
                </p>

                <div className="space-y-1.5">
                  <MobileNavigationItem
                    item={SECONDARY_NAVIGATION.find(
                      (item) => item.path === "/designer/profile-view",
                    )}
                    pathname={pathname}
                  />
                  <MobileNavigationItem
                    item={SECONDARY_NAVIGATION.find((item) => item.path === "/designer/projects")}
                    pathname={pathname}
                  />

                  <MobileNavigationItem
                    item={SECONDARY_NAVIGATION.find(
                      (item) => item.path === "/designer/profile-settings",
                    )}
                    pathname={pathname}
                  />
                </div>
              </div>
            </div>

            </div>

            {/* =============================================
                Sign Out
                ============================================= */}

            <div className="shrink-0 border-t border-line bg-subtle p-4">
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-canvas text-xs font-semibold tracking-normal text-action transition-all hover:bg-action hover:text-on-action dark:bg-subtle"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/* =========================================================
   Footer
   ========================================================= */

function DesignerFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="relative mt-auto overflow-hidden border-t border-line bg-surface dark:bg-canvas"
    >
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-[70%] -translate-x-1/2 bg-surface"
      />

      <div
        className="mx-auto max-w-[1800px] px-5 py-8 sm:px-6 lg:px-8 2xl:px-10"
      >
        <div
          className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <div className="flex items-center justify-center gap-2 lg:justify-start">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-action text-xs font-semibold text-on-action">
                D
              </div>

              <p className="font-serif text-sm tracking-normal text-ink">
                DesignBy
                <span className="font-bold">You</span>
              </p>
            </div>

            <p
              className="mt-2 max-w-lg text-center text-xs font-bold leading-5 tracking-normal text-muted lg:text-left"
            >
              Fashion creation, collaboration and portfolio infrastructure for
              independent designers.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs font-semibold tracking-normal text-muted"
          >
            <Link
              to="/designer/explore"
              className="transition hover:text-action"
            >
              Exhibition
            </Link>

            <Link
              to="/designer/inventory"
              className="transition hover:text-action"
            >
              Portfolio
            </Link>

            <Link
              to="/designer/avatar-studio"
              className="transition hover:text-action"
            >
              Avatar Studio
            </Link>

            <Link
              to="/designer/profile-view"
              className="transition hover:text-action"
            >
              Profile
            </Link>
          </div>
        </div>

        <div
          className="mt-7 flex flex-col gap-2 border-t border-line pt-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
        >
          <p className="text-xs font-bold tracking-normal text-muted">
            © {currentYear} DesignByYou
          </p>

          <p className="text-xs font-bold tracking-normal text-muted">
            Designer Network
          </p>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================
   Loading
   ========================================================= */

function DesignerLoadingScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6"
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          className="absolute inset-0 animate-spin rounded-full border border-line border-t-[#D4AF37]"
        />

        <Loader2
          size={20}
          className="animate-spin text-action"
        />
      </div>

      <p className="mt-5 text-xs font-semibold tracking-normal text-action">
        Preparing Designer Experience
      </p>
    </div>
  );
}

/* =========================================================
   Access Restricted
   ========================================================= */

function DesignerAccessRestricted() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 text-center selection:bg-action selection:text-on-action"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-line bg-subtle">
        <Sparkles size={22} className="text-action" />
      </div>

      <h1 className="mt-6 font-semibold text-3xl tracking-tight text-ink sm:text-4xl">
        Designer access{" "}
        <span className="italic text-action">
          required
        </span>
      </h1>

      <p className="mt-4 max-w-md text-xs font-bold leading-6 tracking-normal text-muted">
        This area is available only to authenticated designer accounts.
      </p>

      <Link
        to="/"
        className="mt-7 inline-flex h-9 items-center justify-center rounded-md bg-action px-6 text-xs font-semibold tracking-normal text-on-action transition-all hover:bg-surface hover:text-ink"
      >
        Return Home
      </Link>
    </div>
  );
}

/* =========================================================
   Designer Layout
   ========================================================= */

export default function DesignerLayout() {
  const { user, loading, logout } = useAuth();

  /* =======================================================
     Auth Loading
     ======================================================= */

  if (loading) {
    return <DesignerLoadingScreen />;
  }

  /* =======================================================
     Designer Role Gate
     ======================================================= */

  if (!user || cleanText(user.role).toLowerCase() !== "designer") {
    return <DesignerAccessRestricted />;
  }

  /* =======================================================
     Main Layout
     ======================================================= */

  return (
    <div
      className="relative flex min-h-screen flex-col bg-canvas text-ink antialiased selection:bg-action selection:text-on-action"
    >
      <DesignerNavbar user={user} logout={logout} />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto w-full max-w-[1800px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-7 lg:py-8 xl:px-8 xl:py-10 2xl:px-10"
      >
        <RouteContent><Outlet /></RouteContent>
      </main>

      <DesignerFooter />
    </div>
  );
}
