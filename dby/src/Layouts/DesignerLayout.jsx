import React, { useCallback, useEffect, useRef, useState } from "react";

import { Link, Outlet, useLocation } from "react-router-dom";

import {
  Award,
  CalendarDays,
  ChevronDown,
  Compass,
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

import { useAuth } from "../context/AuthContext";
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
    label: "Exhibition",
    laptopLabel: "Explore",
    icon: Compass,
  },

  {
    path: "/designer/inventory",
    label: "Portfolio",
    laptopLabel: "Portfolio",
    icon: Package,
  },

  {
    path: "/designer/avatar-studio",
    label: "Avatar Studio",
    laptopLabel: "Avatar",
    icon: Sparkles,
    accent: "violet",
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
    path: "/designer/wallet",
    label: "Financial Wallet",
    icon: Wallet,
  },

  {
    path: "/designer/upload",
    label: "Upload Showcase",
    icon: UploadCloud,
  },

  {
    path: "/designer/profile-view",
    label: "Public Profile",
    icon: User,
  },

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
          "border-cyan-300/40 bg-cyan-50 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-200",
        iconClass: "text-cyan-600 dark:text-cyan-300",
        panelClass:
          "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white dark:border-cyan-300/15 dark:from-cyan-300/[0.08] dark:to-white/[0.02]",
      };

    case "gold":
      return {
        key: "gold",
        label: "Gold",
        shortLabel: "Gold",
        badgeClass:
          "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#8A6912] dark:border-[#D4AF37]/25 dark:bg-[#D4AF37]/10 dark:text-[#F0D783]",
        iconClass: "text-[#A27D17] dark:text-[#D4AF37]",
        panelClass:
          "border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-white dark:border-[#D4AF37]/20 dark:from-[#D4AF37]/10 dark:to-white/[0.02]",
      };

    case "silver":
      return {
        key: "silver",
        label: "Silver",
        shortLabel: "Silver",
        badgeClass:
          "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-300/20 dark:bg-slate-300/10 dark:text-slate-200",
        iconClass: "text-slate-500 dark:text-slate-300",
        panelClass:
          "border-slate-200 bg-gradient-to-br from-slate-100 to-white dark:border-slate-300/15 dark:from-slate-300/[0.08] dark:to-white/[0.02]",
      };

    case "bronze":
      return {
        key: "bronze",
        label: "Bronze",
        shortLabel: "Bronze",
        badgeClass:
          "border-amber-700/25 bg-amber-700/10 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
        iconClass: "text-amber-700 dark:text-amber-300",
        panelClass:
          "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-400/15 dark:from-amber-400/[0.07] dark:to-white/[0.02]",
      };

    default:
      return {
        key: null,
        label: "Tier unavailable",
        shortLabel: "Tier",
        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/35",
        iconClass: "text-slate-400 dark:text-white/30",
        panelClass:
          "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]",
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
    border-slate-200
    bg-slate-100
    text-slate-950

    dark:border-white/10
    dark:bg-white/[0.07]
    dark:text-white
  `;

  let inactiveClass = `
    border-transparent
    text-slate-500

    hover:border-slate-200
    hover:bg-slate-100
    hover:text-slate-950

    dark:text-white/40
    dark:hover:border-white/10
    dark:hover:bg-white/[0.05]
    dark:hover:text-white
  `;

  let indicatorClass = "bg-[#D4AF37]";

  /* =======================================================
     Optional Gold Accent
     ======================================================= */

  if (item.accent === "gold") {
    activeClass = `
      border-[#D4AF37]/35
      bg-[#D4AF37]/10
      text-[#87670E]

      dark:text-[#F0D783]
    `;

    inactiveClass = `
      border-transparent
      text-slate-500

      hover:border-[#D4AF37]/25
      hover:bg-[#D4AF37]/5
      hover:text-[#87670E]

      dark:text-white/40
      dark:hover:bg-[#D4AF37]/10
      dark:hover:text-[#F0D783]
    `;
  }

  /* =======================================================
     Fashion Persona Violet Accent
     ======================================================= */

  if (item.accent === "violet") {
    activeClass = `
      border-violet-400/30
      bg-violet-500/10
      text-violet-600

      dark:text-violet-200
    `;

    inactiveClass = `
      border-transparent
      text-slate-500

      hover:border-violet-300/25
      hover:bg-violet-50
      hover:text-violet-600

      dark:text-white/40
      dark:hover:bg-violet-500/10
      dark:hover:text-violet-200
    `;

    indicatorClass = "bg-violet-500";
  }

  return (
    <Link
      to={item.path}
      title={item.label}
      className={`
        group
        relative
        inline-flex
        h-10
        shrink-0
        items-center
        justify-center
        gap-1.5
        rounded-xl
        border
        px-2
        text-[8px]
        font-black
        uppercase
        tracking-[0.08em]
        transition-all
        duration-300

        xl:gap-2
        xl:px-3
        xl:text-[9px]
        xl:tracking-[0.12em]

        2xl:px-3.5

        ${active ? activeClass : inactiveClass}
      `}
    >
      <Icon size={13} className="shrink-0" />

      <span className="xl:hidden">{item.laptopLabel}</span>

      <span className="hidden xl:inline">{item.label}</span>

      {active && (
        <span
          className={`
            absolute
            -bottom-[17px]
            left-1/2
            h-0.5
            w-5
            -translate-x-1/2
            rounded-full
            ${indicatorClass}
          `}
        />
      )}
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
    "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8A6912] dark:text-[#F0D783]";

  let inactiveClass =
    "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100 dark:text-white/50 dark:hover:border-white/10 dark:hover:bg-white/[0.05] dark:hover:text-white";

  if (item.accent === "violet") {
    activeClass =
      "border-violet-400/30 bg-violet-500/10 text-violet-600 dark:text-violet-200";

    inactiveClass =
      "border-violet-300/10 text-violet-600 hover:border-violet-300/30 hover:bg-violet-50 dark:text-violet-300/70 dark:hover:bg-violet-500/10 dark:hover:text-violet-200";
  }

  return (
    <Link
      to={item.path}
      className={`
        flex
        min-h-12
        items-center
        gap-3
        rounded-xl
        border
        px-4
        py-3
        text-[10px]
        font-black
        uppercase
        tracking-[0.15em]
        transition-all

        ${active ? activeClass : inactiveClass}
      `}
    >
      <div
        className="
          flex
          h-8
          w-8
          shrink-0
          items-center
          justify-center
          rounded-lg
          bg-slate-100

          dark:bg-white/[0.04]
        "
      >
        <Icon size={14} />
      </div>

      <span className="min-w-0 flex-1">{item.label}</span>

      {active && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      )}
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
        className="
          flex
          min-h-11
          items-center
          gap-3
          rounded-xl
          px-3.5
          text-[9px]
          font-black
          uppercase
          tracking-[0.14em]
          text-violet-600
          transition-all

          hover:bg-violet-50

          dark:text-violet-300
          dark:hover:bg-violet-500/10
        "
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
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
      className="
        flex
        min-h-11
        items-center
        gap-3
        rounded-xl
        px-3.5
        text-[9px]
        font-black
        uppercase
        tracking-[0.14em]
        text-slate-600
        transition-all

        hover:bg-slate-50
        hover:text-slate-950

        dark:text-white/45
        dark:hover:bg-white/[0.05]
        dark:hover:text-white
      "
    >
      <div
        className="
          flex
          h-7
          w-7
          items-center
          justify-center
          rounded-lg
          bg-slate-100
          text-[#98761A]

          dark:bg-white/[0.04]
          dark:text-[#D4AF37]
        "
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

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
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
        className="
          sticky
          top-0
          z-50
          border-b
          border-slate-200/80
          bg-white/90
          shadow-[0_1px_20px_rgba(15,23,42,0.04)]
          backdrop-blur-2xl

          dark:border-white/[0.06]
          dark:bg-[#050505]/90
          dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]
        "
      >
        <div
          className="
            mx-auto
            flex
            h-[72px]
            w-full
            max-w-[1800px]
            items-center
            justify-between
            gap-3
            px-4

            sm:px-5

            lg:gap-2
            lg:px-4

            xl:gap-4
            xl:px-7

            2xl:px-10
          "
        >
          {/* ===============================================
              Logo
              =============================================== */}

          <Link
            to="/designer/explore"
            aria-label="DesignByYou"
            className="
              group
              flex
              min-w-0
              shrink-0
              items-center
              gap-2.5

              xl:gap-3
            "
          >
            <div
              className="
                relative
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                bg-[#D4AF37]
                text-xs
                font-black
                text-black
                shadow-[0_6px_20px_rgba(212,175,55,0.2)]
                transition-all
                duration-300

                group-hover:-translate-y-0.5
                group-hover:shadow-[0_9px_25px_rgba(212,175,55,0.3)]
              "
            >
              D
              <span className="absolute inset-x-0 top-0 h-px bg-white/60" />
            </div>

            <div className="min-w-0">
              <span
                className="
                  block
                  truncate
                  font-serif
                  text-[14px]
                  font-light
                  uppercase
                  tracking-[0.1em]
                  text-slate-950

                  dark:text-white

                  xl:text-base
                  xl:tracking-[0.15em]

                  2xl:text-lg
                "
              >
                DesignBy
                <span className="font-bold">You</span>
              </span>

              <span
                className="
                  hidden
                  text-[6px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-slate-400

                  dark:text-white/20

                  xl:block
                "
              >
                Designer Network
              </span>
            </div>
          </Link>

          {/* ===============================================
              Laptop + Desktop Navigation
              =============================================== */}

          <nav
            className="
              hidden
              min-w-0
              flex-1
              items-center
              justify-center
              gap-0

              lg:flex

              xl:gap-1
            "
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
            className="
              hidden
              shrink-0
              items-center
              gap-1

              lg:flex

              xl:gap-2
            "
          >
            {/* Wallet */}

            <Link
              to="/designer/wallet"
              title="Financial Wallet"
              aria-label="Financial Wallet"
              className={`
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-xl
                border
                transition-all

                ${
                  isPathActive(pathname, "/designer/wallet")
                    ? "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/30 hover:text-[#98761A] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/35 dark:hover:text-[#D4AF37]"
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
                inline-flex
                h-10
                shrink-0
                items-center
                justify-center
                gap-1.5
                rounded-xl
                border
                px-2.5
                transition-all

                disabled:cursor-wait
                disabled:opacity-70

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
                className="
                  text-[7px]
                  font-black
                  uppercase
                  tracking-[0.1em]

                  xl:text-[8px]
                  xl:tracking-[0.13em]
                "
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
                  flex
                  h-11
                  items-center
                  gap-1.5
                  rounded-full
                  border
                  py-1
                  pl-1
                  pr-2
                  transition-all

                  ${
                    dropdownOpen
                      ? "border-[#D4AF37]/30 bg-[#D4AF37]/5 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-[#D4AF37]/30 dark:border-white/10 dark:bg-white/[0.035]"
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
                  className="
                    hidden
                    max-w-[115px]
                    text-left

                    2xl:block
                  "
                >
                  <p className="truncate text-[10px] font-bold text-slate-900 dark:text-white">
                    {user?.full_name || "Designer"}
                  </p>

                  <p className="mt-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-white/25">
                    {designerTier ? `${tierMeta.label} Designer` : "Designer"}
                  </p>
                </div>

                <ChevronDown
                  size={12}
                  className={`
                    shrink-0
                    text-slate-400
                    transition-transform

                    dark:text-white/30

                    ${dropdownOpen ? "rotate-180 text-[#D4AF37]" : ""}
                  `}
                />
              </button>

              {/* ===========================================
                  Dropdown Menu
                  =========================================== */}

              {dropdownOpen && (
                <div
                  role="menu"
                  className="
                    absolute
                    right-0
                    top-[calc(100%+12px)]
                    w-[320px]
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white/95
                    p-2
                    shadow-[0_25px_70px_rgba(15,23,42,0.18)]
                    backdrop-blur-2xl

                    dark:border-white/10
                    dark:bg-[#0A0A0A]/95
                    dark:shadow-[0_25px_70px_rgba(0,0,0,0.65)]
                  "
                >
                  {/* =======================================
                      Identity Header
                      ======================================= */}

                  <div
                    className="
                      mb-2
                      flex
                      items-center
                      gap-3
                      rounded-xl
                      bg-slate-50
                      p-4

                      dark:bg-white/[0.035]
                    "
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
                      <p className="truncate font-serif text-sm text-slate-950 dark:text-white">
                        {user?.full_name || "Designer"}
                      </p>

                      <p className="mt-1 truncate text-[9px] text-slate-400 dark:text-white/30">
                        {user?.email || "Designer account"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span
                          className={`
                            inline-flex
                            items-center
                            gap-1.5
                            rounded-full
                            border
                            px-2
                            py-1
                            text-[7px]
                            font-black
                            uppercase
                            tracking-[0.12em]

                            ${tierMeta.badgeClass}
                          `}
                        >
                          <Award size={8} />

                          {designerTier
                            ? `${tierMeta.label} Designer`
                            : "Designer Tier"}
                        </span>

                        {identityAvatar?.exists && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
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
                      mb-2
                      rounded-xl
                      border
                      p-4

                      ${tierMeta.panelClass}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          flex
                          h-10
                          w-10
                          shrink-0
                          items-center
                          justify-center
                          rounded-xl
                          border
                          bg-white/70

                          dark:bg-black/20

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
                        <p className="text-[7px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                          Designer Level
                        </p>

                        <p className="mt-1 font-serif text-lg text-slate-950 dark:text-white">
                          {designerTier
                            ? `${tierMeta.label} Designer`
                            : "Tier unavailable"}
                        </p>

                        {tierProgress.known && (
                          <p className="mt-1 text-[9px] text-slate-500 dark:text-white/35">
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
                        className="
                          flex
                          h-8
                          w-8
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          border
                          border-slate-200
                          bg-white
                          text-slate-400
                          transition

                          hover:border-[#D4AF37]/30
                          hover:text-[#98761A]

                          disabled:opacity-50

                          dark:border-white/10
                          dark:bg-white/[0.04]
                          dark:text-white/30
                          dark:hover:text-[#D4AF37]
                        "
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
                          <div className="rounded-lg border border-cyan-200/70 bg-white/60 px-3 py-2 text-[8px] font-black uppercase tracking-[0.13em] text-cyan-700 dark:border-cyan-300/15 dark:bg-black/15 dark:text-cyan-200">
                            Highest Designer tier achieved
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/35">
                                Progress to {tierProgress.nextTier}
                              </p>

                              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/25">
                                {tierProgress.remaining} remaining
                              </p>
                            </div>

                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                              <div
                                className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                                style={{
                                  width: `${tierProgress.progressPercent}%`,
                                }}
                              />
                            </div>

                            <p className="mt-2 text-[8px] leading-4 text-slate-400 dark:text-white/25">
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

                  {/* Logout */}

                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={handleLogout}
                      role="menuitem"
                      className="
                        flex
                        min-h-11
                        w-full
                        items-center
                        gap-3
                        rounded-xl
                        px-3.5
                        text-left
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.14em]
                        text-rose-500
                        transition-all

                        hover:bg-rose-50

                        dark:hover:bg-rose-500/10
                      "
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
            className="
              flex
              shrink-0
              items-center
              gap-2

              lg:hidden
            "
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
                inline-flex
                h-10
                items-center
                justify-center
                gap-1.5
                rounded-xl
                border
                px-2.5
                transition

                disabled:opacity-60

                ${tierMeta.badgeClass}
              `}
            >
              {tierRefreshing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Award size={13} />
              )}

              <span className="text-[7px] font-black uppercase tracking-[0.1em]">
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
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                border
                transition-all

                ${
                  mobileMenuOpen
                    ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[#D4AF37]/30 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/55"
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
            onClick={() => setMobileMenuOpen(false)}
            className="
              absolute
              inset-0
              bg-slate-950/40
              backdrop-blur-sm

              dark:bg-black/65
            "
          />

          <aside
            className="
              absolute
              bottom-0
              right-0
              top-[72px]
              flex
              w-full
              max-w-[400px]
              flex-col
              border-l
              border-slate-200
              bg-white
              shadow-[-20px_0_70px_rgba(15,23,42,0.15)]

              dark:border-white/10
              dark:bg-[#080808]
              dark:shadow-[-20px_0_70px_rgba(0,0,0,0.65)]

              sm:w-[390px]
            "
          >
            {/* =============================================
                Identity
                ============================================= */}

            <div className="border-b border-slate-100 p-5 dark:border-white/[0.06]">
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
                  <p className="truncate font-serif text-base text-slate-950 dark:text-white">
                    {user?.full_name || "Designer"}
                  </p>

                  <p className="mt-1 truncate text-[9px] text-slate-400 dark:text-white/30">
                    {user?.email || "Designer account"}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
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

                        ${tierMeta.badgeClass}
                      `}
                    >
                      <Award size={8} />

                      {designerTier
                        ? `${tierMeta.label} Designer`
                        : "Designer Tier"}
                    </span>

                    {identityAvatar?.exists && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
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
                  mt-4
                  rounded-2xl
                  border
                  p-4

                  ${tierMeta.panelClass}
                `}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      flex
                      h-10
                      w-10
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      border
                      bg-white/70

                      dark:bg-black/20

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
                    <p className="text-[7px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                      Designer Level
                    </p>

                    <p className="mt-1 font-serif text-base text-slate-950 dark:text-white">
                      {designerTier
                        ? `${tierMeta.label} Designer`
                        : "Tier unavailable"}
                    </p>

                    {tierProgress.known && (
                      <p className="mt-1 text-[8px] text-slate-500 dark:text-white/35">
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/30"
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
                      <p className="text-[8px] font-black uppercase tracking-[0.13em] text-cyan-700 dark:text-cyan-200">
                        Highest Designer tier achieved
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/35">
                            Progress to {tierProgress.nextTier}
                          </p>

                          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/25">
                            {tierProgress.remaining} remaining
                          </p>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {/* Create */}

              <div className="mb-5">
                <p className="mb-2 px-2 text-[7px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/20">
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

              <div className="mb-5 border-t border-slate-100 pt-5 dark:border-white/[0.06]">
                <p className="mb-2 px-2 text-[7px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/20">
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

              <div className="border-t border-slate-100 pt-5 dark:border-white/[0.06]">
                <p className="mb-2 px-2 text-[7px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/20">
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
                    item={SECONDARY_NAVIGATION.find(
                      (item) => item.path === "/designer/profile-settings",
                    )}
                    pathname={pathname}
                  />
                </div>
              </div>
            </div>

            {/* =============================================
                Sign Out
                ============================================= */}

            <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.015]">
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
                  transition-all

                  hover:bg-rose-500
                  hover:text-white

                  dark:border-rose-500/20
                  dark:bg-rose-500/10
                  dark:text-rose-400
                "
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
      className="
        relative
        mt-auto
        overflow-hidden
        border-t
        border-slate-200
        bg-white

        dark:border-white/[0.06]
        dark:bg-[#030303]
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          bottom-0
          left-1/2
          h-px
          w-[70%]
          -translate-x-1/2
          bg-gradient-to-r
          from-transparent
          via-[#D4AF37]/30
          to-transparent
        "
      />

      <div
        className="
          mx-auto
          max-w-[1800px]
          px-5
          py-8

          sm:px-6

          lg:px-8

          2xl:px-10
        "
      >
        <div
          className="
            flex
            flex-col
            gap-7

            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >
          <div>
            <div className="flex items-center justify-center gap-2 lg:justify-start">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D4AF37] text-[9px] font-black text-black">
                D
              </div>

              <p className="font-serif text-sm uppercase tracking-[0.16em] text-slate-950 dark:text-white">
                DesignBy
                <span className="font-bold">You</span>
              </p>
            </div>

            <p
              className="
                mt-2
                max-w-lg
                text-center
                text-[8px]
                font-bold
                uppercase
                leading-5
                tracking-[0.14em]
                text-slate-400

                dark:text-white/25

                lg:text-left
              "
            >
              Fashion creation, collaboration and portfolio infrastructure for
              independent designers.
            </p>
          </div>

          <div
            className="
              flex
              flex-wrap
              items-center
              justify-center
              gap-x-5
              gap-y-3
              text-[8px]
              font-black
              uppercase
              tracking-[0.15em]
              text-slate-400

              dark:text-white/30
            "
          >
            <Link
              to="/designer/explore"
              className="transition hover:text-[#98761A] dark:hover:text-[#D4AF37]"
            >
              Exhibition
            </Link>

            <Link
              to="/designer/inventory"
              className="transition hover:text-[#98761A] dark:hover:text-[#D4AF37]"
            >
              Portfolio
            </Link>

            <Link
              to="/designer/avatar-studio"
              className="transition hover:text-violet-600 dark:hover:text-violet-300"
            >
              Avatar Studio
            </Link>

            <Link
              to="/designer/profile-view"
              className="transition hover:text-[#98761A] dark:hover:text-[#D4AF37]"
            >
              Profile
            </Link>
          </div>
        </div>

        <div
          className="
            mt-7
            flex
            flex-col
            gap-2
            border-t
            border-slate-100
            pt-5
            text-center

            dark:border-white/[0.05]

            sm:flex-row
            sm:items-center
            sm:justify-between
            sm:text-left
          "
        >
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/20">
            © {currentYear} DesignByYou
          </p>

          <p className="text-[7px] font-bold uppercase tracking-[0.14em] text-slate-300 dark:text-white/15">
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
      className="
        flex
        min-h-screen
        flex-col
        items-center
        justify-center
        bg-slate-50
        px-6

        dark:bg-[#030303]
      "
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          className="
            absolute
            inset-0
            animate-spin
            rounded-full
            border
            border-slate-200
            border-t-[#D4AF37]

            dark:border-white/10
            dark:border-t-[#D4AF37]
          "
        />

        <Loader2
          size={20}
          className="animate-spin text-[#B18A24] dark:text-[#D4AF37]"
        />
      </div>

      <p className="mt-5 text-[9px] font-black uppercase tracking-[0.22em] text-[#98761A] dark:text-[#D4AF37]">
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
      className="
        flex
        min-h-screen
        flex-col
        items-center
        justify-center
        bg-slate-50
        p-6
        text-center
        selection:bg-[#D4AF37]
        selection:text-black

        dark:bg-[#030303]
      "
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10">
        <Sparkles size={22} className="text-[#B18A24] dark:text-[#D4AF37]" />
      </div>

      <h1 className="mt-6 font-serif text-3xl font-light tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        Designer access{" "}
        <span className="italic text-[#B18A24] dark:text-[#D4AF37]">
          required
        </span>
      </h1>

      <p className="mt-4 max-w-md text-[10px] font-bold uppercase leading-6 tracking-[0.15em] text-slate-400 dark:text-white/30">
        This area is available only to authenticated designer accounts.
      </p>

      <Link
        to="/"
        className="
          mt-7
          inline-flex
          h-11
          items-center
          justify-center
          rounded-xl
          bg-[#D4AF37]
          px-6
          text-[9px]
          font-black
          uppercase
          tracking-[0.17em]
          text-black
          transition-all

          hover:bg-slate-950
          hover:text-white

          dark:hover:bg-white
          dark:hover:text-black
        "
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
      className="
        relative
        flex
        min-h-screen
        flex-col
        bg-slate-50
        text-slate-950
        antialiased
        selection:bg-[#D4AF37]
        selection:text-black

        dark:bg-[#030303]
        dark:text-white
      "
    >
      <DesignerNavbar user={user} logout={logout} />

      <main
        className="
          relative
          z-10
          mx-auto
          w-full
          max-w-[1800px]
          flex-1

          px-4
          py-5

          sm:px-6
          sm:py-7

          lg:px-7
          lg:py-8

          xl:px-8
          xl:py-10

          2xl:px-10
        "
      >
        <Outlet />
      </main>

      <DesignerFooter />
    </div>
  );
}
