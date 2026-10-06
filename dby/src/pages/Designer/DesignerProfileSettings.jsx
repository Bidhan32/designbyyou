import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Camera,
  CheckCircle2,
  Compass,
  Eye,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import API from "../../api/axios";

import FashionPersonaAvatar from "../avatar/FashionPersonaAvatar";

/* =========================================================
   DesignByYou
   Designer Profile Settings
   Version 3.2

   Responsibilities:
   - Designer account information
   - Traditional profile photo
   - Fashion Persona preview
   - Private WhatsApp booking-contact preference
   - Responsive light / dark theme UI
   - Security
   - Booking / escrow ledger

   IMPORTANT:
   Fashion Persona customization lives ONLY in:
   /designer/avatar-studio

   WhatsApp contact data is private account data. It is not
   shown on the public Designer profile. Sharing with the
   other booking participant will be handled later by the
   dedicated P2P booking contact endpoint.
   ========================================================= */

/* =========================================================
   Endpoints
   ========================================================= */

const PROFILE_ENDPOINT = "/designer/update-profile";

const WHATSAPP_PROFILE_ENDPOINT = "/users/profile";

const PROFILE_REFRESH_ENDPOINT = "/auth/me";

const AVATAR_ENDPOINT = "/avatar/me";

const BOOKINGS_ENDPOINT = "/designer/my-bookings";

const SECURITY_ENDPOINT = "/users/security";

/* =========================================================
   WhatsApp
   ========================================================= */

const MAX_WHATSAPP_NUMBER_LENGTH = 16;

const WHATSAPP_E164_REGEX = /^\+[1-9][0-9]{7,14}$/;

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

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, toNumber(value, 0)));
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

function getTierCommissionPercent(tier) {
  const normalizedTier = cleanText(tier, "bronze").toLowerCase();

  const commissionByTier = {
    bronze: 10,
    silver: 15,
    gold: 20,
    platinum: 25,
    diamond: 30,
  };

  return commissionByTier[normalizedTier] ?? 10;
}

function isCancelledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
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

/* =========================================================
   Errors
   ========================================================= */

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

/* =========================================================
   API Helpers
   ========================================================= */

function extractObject(response) {
  const body = response?.data;

  const candidates = [
    body?.data?.user,
    body?.data?.profile,
    body?.data?.avatar,
    body?.user,
    body?.profile,
    body?.avatar,
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

function extractArray(response) {
  const body = response?.data;

  const candidates = [
    body?.data,
    body?.data?.bookings,
    body?.bookings,
    body?.items,
    body?.results,
    body,
  ];

  return candidates.find(Array.isArray) || [];
}

/* =========================================================
   Avatar Normalization
   ========================================================= */

function normalizeFeaturedDesign(design) {
  if (!design || typeof design !== "object") {
    return null;
  }

  const id = cleanText(design.id || design.design_id);

  if (!id) {
    return null;
  }

  return {
    ...design,

    id,

    title: cleanText(design.title, "Featured Design"),

    image: resolveImageSrc(
      design.watermarked_preview_url ||
        design.preview_url ||
        design.image_url ||
        design.image,
    ),

    sourceType: cleanText(design.source_type, "upload").toLowerCase(),

    source_type: cleanText(design.source_type, "upload").toLowerCase(),

    editorProjectId: cleanText(design.editor_project_id),

    editor_project_id: cleanText(design.editor_project_id),

    allowRemix: toBoolean(design.allow_remix, false),

    allow_remix: toBoolean(design.allow_remix, false),

    isEditable: toBoolean(design.is_editable, false),

    is_editable: toBoolean(design.is_editable, false),

    originalDesignId: cleanText(design.original_design_id),

    original_design_id: cleanText(design.original_design_id),
  };
}

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return null;
  }

  return {
    exists: Boolean(avatar.exists),

    id: avatar.id || null,

    config:
      avatar.avatar_config && typeof avatar.avatar_config === "object"
        ? avatar.avatar_config
        : {},

    featuredDesign: normalizeFeaturedDesign(avatar.featured_design),

    displayMode: cleanText(avatar.display_mode, "showcase"),

    pose: cleanText(avatar.pose, "standing"),

    backgroundTheme: cleanText(avatar.background_theme, "studio"),

    isPublic: toBoolean(avatar.is_public, true),

    version: Math.max(1, toNumber(avatar.avatar_version, 1)),
  };
}

/* =========================================================
   Main Component
   ========================================================= */

const ProfileSetting = () => {
  const navigate = useNavigate();

  const { user, setUser, logout } = useAuth();

  const fileInputRef = useRef(null);

  const avatarRequestRef = useRef(null);

  const bookingsRequestRef = useRef(null);

  /* =======================================================
     Navigation
     ======================================================= */

  const [activeTab, setActiveTab] = useState("identity");

  /* =======================================================
     Global Messages
     ======================================================= */

  const [successMessage, setSuccessMessage] = useState("");

  const [error, setError] = useState("");

  /* =======================================================
     Profile Save
     ======================================================= */

  const [profileSaving, setProfileSaving] = useState(false);

  /* =======================================================
     Security Save
     ======================================================= */

  const [securitySaving, setSecuritySaving] = useState(false);

  /* =======================================================
     Avatar
     ======================================================= */

  const [avatar, setAvatar] = useState(null);

  const [avatarLoading, setAvatarLoading] = useState(true);

  const [avatarError, setAvatarError] = useState("");

  /* =======================================================
     Bookings
     ======================================================= */

  const [bookings, setBookings] = useState([]);

  const [bookingsLoading, setBookingsLoading] = useState(false);

  /* =======================================================
     Profile Form
     ======================================================= */

  const [formData, setFormData] = useState({
    full_name: user?.full_name || "",

    email: user?.email || "",

    bio: user?.bio || "",

    portfolio_url: user?.portfolio_url || "",


    address_line: user?.address_line || "",

    city: user?.city || "",

    country: user?.country || "",

    whatsapp_number: user?.whatsapp_number || "",

    whatsapp_contact_enabled: toBoolean(user?.whatsapp_contact_enabled, false),
  });

  /* =======================================================
     Traditional Profile Photo
     ======================================================= */

  const [selectedProfileImage, setSelectedProfileImage] = useState(null);

  const [previewUrl, setPreviewUrl] = useState(
    resolveImageSrc(user?.profile_image_url || user?.profile_image || ""),
  );

  /* =======================================================
     Security Form
     ======================================================= */

  const [securityData, setSecurityData] = useState({
    current_password: "",

    new_password: "",

    confirm_password: "",
  });

  /* =======================================================
     Keep Form Synced with Auth User
     ======================================================= */

  useEffect(() => {
    if (!user) {
      return;
    }

    setFormData({
      full_name: user.full_name || "",

      email: user.email || "",

      bio: user.bio || "",

      portfolio_url: user.portfolio_url || "",


      address_line: user.address_line || "",

      city: user.city || "",

      country: user.country || "",

      whatsapp_number: user.whatsapp_number || "",

      whatsapp_contact_enabled: toBoolean(user.whatsapp_contact_enabled, false),
    });

    if (!selectedProfileImage) {
      setPreviewUrl(
        resolveImageSrc(user.profile_image_url || user.profile_image || ""),
      );
    }
  }, [user, selectedProfileImage]);

  /* =======================================================
     Clear Messages on Tab Change
     ======================================================= */

  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [activeTab]);

  /* =======================================================
     Load Fashion Persona
     ======================================================= */

  const loadAvatar = useCallback(async () => {
    avatarRequestRef.current?.abort();

    const controller = new AbortController();

    avatarRequestRef.current = controller;

    setAvatarLoading(true);

    setAvatarError("");

    try {
      const response = await API.get(AVATAR_ENDPOINT, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const avatarObject = extractObject(response);

      setAvatar(normalizeAvatar(avatarObject));
    } catch (requestError) {
      if (controller.signal.aborted || isCancelledRequest(requestError)) {
        return;
      }

      console.error("Failed to load Fashion Persona:", requestError);

      setAvatar(null);

      setAvatarError(
        getErrorMessage(requestError, "Fashion Persona could not be loaded."),
      );
    } finally {
      if (avatarRequestRef.current === controller) {
        avatarRequestRef.current = null;

        setAvatarLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAvatar();

    return () => {
      avatarRequestRef.current?.abort();
    };
  }, [loadAvatar]);

  /* =======================================================
     Load Booking Ledger
     ======================================================= */

  const loadBookings = useCallback(async () => {
    bookingsRequestRef.current?.abort();

    const controller = new AbortController();

    bookingsRequestRef.current = controller;

    setBookingsLoading(true);

    try {
      const response = await API.get(BOOKINGS_ENDPOINT, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setBookings(extractArray(response));
    } catch (requestError) {
      if (controller.signal.aborted || isCancelledRequest(requestError)) {
        return;
      }

      console.error("Failed to fetch project listings:", requestError);

      setBookings([]);
    } finally {
      if (bookingsRequestRef.current === controller) {
        bookingsRequestRef.current = null;

        setBookingsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "bookings") {
      return undefined;
    }

    void loadBookings();

    return () => {
      bookingsRequestRef.current?.abort();
    };
  }, [activeTab, loadBookings]);

  /* =======================================================
     Refresh Authenticated Designer
     ======================================================= */

  const refreshAuthenticatedDesigner = useCallback(async () => {
    const response = await API.get(PROFILE_REFRESH_ENDPOINT);

    const freshUser = extractObject(response);

    if (!freshUser || cleanText(freshUser.role).toLowerCase() !== "designer") {
      throw new Error(
        "The updated Designer profile could not be synchronized.",
      );
    }

    if (typeof setUser === "function") {
      setUser((previous) => ({
        ...(previous || {}),
        ...freshUser,
      }));
    }

    return freshUser;
  }, [setUser]);

  /* =======================================================
     Profile Form Change
     ======================================================= */

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;

    if (name === "whatsapp_number") {
      const normalizedNumber = value.replace(/\s+/g, "");

      setFormData((current) => ({
        ...current,

        whatsapp_number: normalizedNumber,

        ...(normalizedNumber
          ? {}
          : {
              whatsapp_contact_enabled: false,
            }),
      }));
    } else {
      setFormData((current) => ({
        ...current,

        [name]: value,
      }));
    }

    setError("");

    setSuccessMessage("");
  }, []);

  /* =======================================================
     WhatsApp Toggle
     ======================================================= */

  const handleWhatsAppToggle = useCallback(() => {
    const currentlyEnabled = toBoolean(
      formData.whatsapp_contact_enabled,
      false,
    );

    const nextEnabled = !currentlyEnabled;

    if (nextEnabled && !cleanText(formData.whatsapp_number)) {
      setError(
        "Add a WhatsApp number before enabling booking contact sharing.",
      );

      setSuccessMessage("");

      return;
    }

    setFormData((current) => ({
      ...current,

      whatsapp_contact_enabled: nextEnabled,
    }));

    setError("");

    setSuccessMessage("");
  }, [formData.whatsapp_contact_enabled, formData.whatsapp_number]);

  /* =======================================================
     Dirty State
     ======================================================= */

  const whatsappChanged = useMemo(() => {
    return (
      cleanText(formData.whatsapp_number) !==
        cleanText(user?.whatsapp_number) ||
      toBoolean(formData.whatsapp_contact_enabled, false) !==
        toBoolean(user?.whatsapp_contact_enabled, false)
    );
  }, [
    formData.whatsapp_contact_enabled,
    formData.whatsapp_number,
    user?.whatsapp_contact_enabled,
    user?.whatsapp_number,
  ]);

  const designerProfileChanged = useMemo(() => {
    if (selectedProfileImage) {
      return true;
    }

    return (
      cleanText(formData.full_name) !== cleanText(user?.full_name) ||
      cleanText(formData.email) !== cleanText(user?.email) ||
      cleanText(formData.bio) !== cleanText(user?.bio) ||
      cleanText(formData.portfolio_url) !== cleanText(user?.portfolio_url) ||
      cleanText(formData.address_line) !== cleanText(user?.address_line) ||
      cleanText(formData.city) !== cleanText(user?.city) ||
      cleanText(formData.country) !== cleanText(user?.country)
    );
  }, [formData, selectedProfileImage, user]);

  /* =======================================================
     Security Form Change
     ======================================================= */

  const handleSecurityChange = useCallback((event) => {
    const { name, value } = event.target;

    setSecurityData((current) => ({
      ...current,

      [name]: value,
    }));

    setError("");

    setSuccessMessage("");
  }, []);

  /* =======================================================
     Profile Image Selection
     ======================================================= */

  const handleProfileImageChange = useCallback((event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setError("Profile image must be JPG, PNG, or WEBP.");

      event.target.value = "";

      return;
    }

    const maxBytes = 5 * 1024 * 1024;

    if (file.size > maxBytes) {
      setError("Profile image must be 5MB or smaller.");

      event.target.value = "";

      return;
    }

    setSelectedProfileImage(file);

    setPreviewUrl(URL.createObjectURL(file));

    setError("");

    setSuccessMessage("");
  }, []);

  /* =======================================================
     Clean Blob Preview
     ======================================================= */

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /* =======================================================
     Profile Submit
     ======================================================= */

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (profileSaving) {
        return;
      }

      const whatsappNumber = String(formData.whatsapp_number || "").trim();

      const whatsappEnabled = toBoolean(
        formData.whatsapp_contact_enabled,
        false,
      );

      if (whatsappNumber && !WHATSAPP_E164_REGEX.test(whatsappNumber)) {
        setError(
          "WhatsApp number must use international format, for example +9779812345678.",
        );

        setSuccessMessage("");

        return;
      }

      if (whatsappEnabled && !whatsappNumber) {
        setError(
          "Add a WhatsApp number before enabling booking contact sharing.",
        );

        setSuccessMessage("");

        return;
      }

      if (!designerProfileChanged && !whatsappChanged) {
        setError("");

        setSuccessMessage("There are no profile changes to save.");

        return;
      }

      setProfileSaving(true);

      setError("");

      setSuccessMessage("");

      const dataToSend = new FormData();

      Object.entries(formData).forEach(([key, value]) => {
        /*
         * WhatsApp is handled by
         * /users/profile below.
         *
         * Do not send these fields to
         * the legacy Designer profile
         * endpoint.
         */
        if (
          key === "email" ||
          key === "whatsapp_number" ||
          key === "whatsapp_contact_enabled"
        ) {
          return;
        }

        if (value !== undefined && value !== null) {
          dataToSend.append(key, value);
        }
      });

      if (selectedProfileImage) {
        dataToSend.append("profile_image", selectedProfileImage);
      }

      try {
        /*
         * Existing Designer fields remain
         * on the existing Designer profile
         * endpoint.
         */
        let updatedUser = null;

        if (designerProfileChanged) {
          const response = await API.patch(PROFILE_ENDPOINT, dataToSend);

          updatedUser = extractObject(response);

          if (
            updatedUser &&
            typeof updatedUser === "object" &&
            !Array.isArray(updatedUser) &&
            typeof setUser === "function"
          ) {
            setUser((previous) => ({
              ...(previous || {}),

              ...updatedUser,
            }));

            const nextImage = resolveImageSrc(
              updatedUser.profile_image_url || updatedUser.profile_image,
            );

            if (nextImage) {
              setPreviewUrl(nextImage);
            }
          }
        }

        /*
         * WhatsApp preferences use the
         * shared authenticated profile
         * endpoint that already performs
         * E.164 + consent validation.
         */
        let whatsappUser = null;

        if (whatsappChanged) {
          const whatsappResponse = await API.put(WHATSAPP_PROFILE_ENDPOINT, {
            whatsapp_number: whatsappNumber,

            whatsapp_contact_enabled: whatsappEnabled,
          });

          whatsappUser = extractObject(whatsappResponse);

          if (
            whatsappUser &&
            typeof whatsappUser === "object" &&
            !Array.isArray(whatsappUser) &&
            typeof setUser === "function"
          ) {
            setUser((previous) => ({
              ...(previous || {}),

              ...whatsappUser,
            }));
          }
        }

        /*
         * Final authoritative session
         * synchronization.
         */
        try {
          await refreshAuthenticatedDesigner();
        } catch (refreshError) {
          if (!isCancelledRequest(refreshError)) {
            console.warn(
              "Designer profile saved but /auth/me refresh failed:",
              refreshError,
            );
          }
        }

        setSelectedProfileImage(null);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        setFormData((current) => ({
          ...current,

          whatsapp_number: whatsappUser?.whatsapp_number ?? whatsappNumber,

          whatsapp_contact_enabled:
            whatsappUser?.whatsapp_contact_enabled ?? whatsappEnabled,
        }));

        setSuccessMessage(
          "Your designer profile has been updated successfully.",
        );
      } catch (requestError) {
        console.error("Profile update failed:", requestError);

        setError(
          getErrorMessage(requestError, "Failed to save profile changes."),
        );
      } finally {
        setProfileSaving(false);
      }
    },
    [
      designerProfileChanged,
      formData,
      profileSaving,
      refreshAuthenticatedDesigner,
      selectedProfileImage,
      setUser,
      whatsappChanged,
    ],
  );

  /* =======================================================
     Security Submit
     ======================================================= */

  const handleSecuritySubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (securitySaving) {
        return;
      }

      if (securityData.new_password !== securityData.confirm_password) {
        setError("Your new passwords do not match.");

        return;
      }

      if (!securityData.current_password || !securityData.new_password) {
        setError("Current and new passwords are required.");

        return;
      }

      setSecuritySaving(true);

      setError("");

      setSuccessMessage("");

      try {
        await API.put(SECURITY_ENDPOINT, {
          currentPassword: securityData.current_password,

          newPassword: securityData.new_password,
        });

        setSecurityData({
          current_password: "",

          new_password: "",

          confirm_password: "",
        });

        setSuccessMessage(
          "Password updated. Signing you out securely...",
        );

        if (typeof logout === "function") {
          try {
            await Promise.resolve(logout());
          } catch (logoutError) {
            if (import.meta.env.DEV) {
              console.warn(
                "Local logout cleanup reported an error after password rotation:",
                logoutError,
              );
            }
          }
        }

        navigate("/login", {
          replace: true,
          state: {
            message:
              "Your password was changed successfully. Please sign in again.",
          },
        });
      } catch (requestError) {
        console.error("Password update failed:", requestError);

        setError(
          getErrorMessage(
            requestError,
            "Could not update your password. Please verify your current password.",
          ),
        );
      } finally {
        setSecuritySaving(false);
      }
    },
    [logout, navigate, securityData, securitySaving],
  );

  /* =======================================================
     Persona Information
     ======================================================= */

  const personaDetails = useMemo(() => {
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

  const whatsappEnabled = toBoolean(formData.whatsapp_contact_enabled, false);

  const tierCommissionPercent = getTierCommissionPercent(user?.tier);

  /* =======================================================
     Render
     ======================================================= */

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 pb-24 font-sans text-slate-950 selection:bg-[#D4AF37] selection:text-black sm:pb-32 dark:bg-[#030303] dark:text-white">
      {/* ===================================================
          Ambient Background
          =================================================== */}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute right-[-8%] top-[-12%] h-[46rem] w-[46rem] rounded-full bg-[#D4AF37]/10 blur-[180px] dark:bg-[#D4AF37]/5" />

        <div className="absolute -bottom-64 -left-64 h-[38rem] w-[38rem] rounded-full bg-violet-500/[0.05] blur-[180px] dark:bg-violet-600/[0.04]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1200px] space-y-7 px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12">
        {/* =================================================
            Header
            ================================================= */}

        <div className="relative flex flex-col items-start justify-between gap-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 dark:border-white/5 dark:bg-[#0a0a0a] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row dark:shadow-2xl md:items-center md:p-12">
          <div className="pointer-events-none absolute right-[10%] top-[-50%] rotate-12 text-slate-950 dark:text-white opacity-[0.03]">
            <Compass size={300} strokeWidth={0.5} />
          </div>

          <div className="relative z-10 space-y-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.4em] text-[#98751A] dark:text-[#D4AF37]">
              <Sparkles size={12} />
              Identity Engine
            </div>

            <h1 className="text-4xl font-light tracking-tight text-slate-950 dark:text-white drop-shadow-md md:text-5xl">
              <span className="font-serif">Studio</span>{" "}
              <span className="font-serif italic text-[#98751A] dark:text-[#D4AF37]">Settings</span>
            </h1>

            <p className="max-w-2xl text-[10px] font-bold uppercase leading-5 tracking-[0.2em] text-slate-500 dark:text-white/40">
              Manage your designer profile, Fashion Persona, private booking
              contact preferences, security configuration, and active contracts.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-4">
            {user?.tier && (
              <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.3em] text-[#98751A] dark:text-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                {user.tier} Tier
              </span>
            )}

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#111] px-4 py-2 shadow-inner">
              <ShieldCheck size={14} className="text-[#98751A] dark:text-[#D4AF37]" />

              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-white/50">
                {user?.role || "Designer"}
              </span>
            </div>
          </div>
        </div>

        {/* =================================================
            Main Settings Panel
            ================================================= */}

        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/5 dark:bg-[#0a0a0a] dark:shadow-2xl">
          {/* ===============================================
              Tabs
              =============================================== */}

          <div className="scrollbar-none flex gap-7 overflow-x-auto border-b border-slate-200/80 bg-slate-50/80 px-6 md:px-10 dark:border-white/5 dark:bg-[#111]/50">
            {[
              {
                id: "identity",

                icon: Sliders,

                label: "Profile Info",
              },

              {
                id: "security",

                icon: LockKeyhole,

                label: "Security",
              },

              {
                id: "bookings",

                icon: Briefcase,

                label: "Escrow Ledger",
              },
            ].map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex whitespace-nowrap border-b-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                    activeTab === tab.id
                      ? "border-[#D4AF37] text-[#98751A] dark:text-[#D4AF37]"
                      : "border-transparent text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/60"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon size={14} />

                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ===============================================
              IDENTITY TAB
              =============================================== */}

          {activeTab === "identity" && (
            <div className="space-y-10 p-6 sm:p-8 md:p-12">
              {/* ===========================================
                  Fashion Persona
                  =========================================== */}

              <section className="overflow-hidden rounded-[2rem] border border-violet-400/15 bg-violet-50/80 dark:bg-violet-500/[0.035]">
                <div className="flex flex-col gap-5 border-b border-slate-200/80 dark:border-white/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                      <Sparkles size={13} />
                      Fashion Persona
                    </div>

                    <h2 className="mt-2 font-serif text-2xl text-slate-950 dark:text-white">
                      Your visual identity
                    </h2>

                    <p className="mt-1 max-w-xl text-[10px] leading-5 text-slate-500 dark:text-white/30">
                      Your Fashion Persona is shared across your profile and
                      future community experiences. Customize it in Avatar
                      Studio.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void loadAvatar()}
                      disabled={avatarLoading}
                      title="Refresh Fashion Persona"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] text-slate-500 dark:text-white/30 transition hover:border-violet-400/30 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200 disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        className={avatarLoading ? "animate-spin" : ""}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/designer/avatar-studio")}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-[8px] font-black uppercase tracking-[0.16em] text-slate-950 dark:text-white transition hover:bg-violet-500"
                    >
                      <Sparkles size={13} />
                      Avatar Studio
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
                  <div>
                    {avatarLoading ? (
                      <div className="flex min-h-[340px] items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-black/30">
                        <Loader2
                          size={26}
                          className="animate-spin text-violet-700 dark:text-violet-300"
                        />
                      </div>
                    ) : avatar ? (
                      <FashionPersonaAvatar
                        config={avatar.config}
                        pose={avatar.pose}
                        backgroundTheme={avatar.backgroundTheme}
                        displayMode={avatar.displayMode}
                        featuredDesign={avatar.featuredDesign}
                        compact
                        minHeight="340px"
                        avatarLabel="Fashion Persona"
                        showFeaturedCard={true}
                        ariaLabel="Designer Fashion Persona preview"
                      />
                    ) : (
                      <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 px-6 text-center">
                        <Sparkles size={28} className="text-slate-300 dark:text-white/10" />

                        <p className="mt-4 text-sm font-bold text-slate-600 dark:text-white/60">
                          Persona unavailable
                        </p>

                        <p className="mt-2 max-w-sm text-xs leading-6 text-slate-400 dark:text-white/25">
                          {avatarError ||
                            "Open Avatar Studio to create your Fashion Persona."}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] ${
                          avatar?.isPublic
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                            : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/30"
                        }`}
                      >
                        {avatar?.isPublic ? (
                          <Globe size={10} />
                        ) : (
                          <Lock size={10} />
                        )}

                        {avatar
                          ? avatar.isPublic
                            ? "Public Persona"
                            : "Private Persona"
                          : "Not Loaded"}
                      </span>

                      {avatar && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/30">
                          Version {avatar.version}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-5 font-serif text-3xl text-slate-950 dark:text-white">
                      Fashion Persona
                    </h3>

                    <p className="mt-2 max-w-xl text-xs leading-6 text-slate-500 dark:text-white/30">
                      This is separate from your normal profile photo. Your
                      profile photo remains a standard account image while
                      Fashion Persona is your customizable character identity.
                    </p>

                    {avatar && (
                      <div className="mt-6 grid grid-cols-2 gap-3">
                        {personaDetails.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-white/[0.025] p-4"
                          >
                            <p className="text-[7px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-white/20">
                              {item.label}
                            </p>

                            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-white/60">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {avatar?.featuredDesign && (
                      <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200/80 dark:border-white/5 bg-slate-50 dark:bg-white/[0.025] p-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black">
                          {avatar.featuredDesign.image ? (
                            <img
                              src={avatar.featuredDesign.image}
                              alt={avatar.featuredDesign.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-white/15">
                              <Eye size={15} />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[7px] font-black uppercase tracking-[0.15em] text-violet-700 dark:text-violet-300">
                            Featured Design
                          </p>

                          <p className="mt-1 truncate text-xs font-bold text-slate-700 dark:text-white/65">
                            {avatar.featuredDesign.title}
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => navigate("/designer/avatar-studio")}
                      className="mt-6 inline-flex h-11 w-fit items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-5 text-[8px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200 transition hover:bg-violet-500 hover:text-white dark:hover:text-white"
                    >
                      Customize Fashion Persona
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </section>

              {/* ===========================================
                  Traditional Profile Information Form
                  =========================================== */}

              <form onSubmit={handleSubmit} className="space-y-10">
                {/* =========================================
                    Standard Profile Photo
                    ========================================= */}

                <section>
                  <div className="mb-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#98751A] dark:text-[#D4AF37]">
                      Account Photo
                    </p>

                    <h2 className="mt-2 font-serif text-2xl text-slate-950 dark:text-white">
                      Profile identity
                    </h2>

                    <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-white/30">
                      This image is your standard profile photo. It is
                      independent from your Fashion Persona.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-5 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D4AF37]/30 bg-slate-50 dark:bg-[#111] shadow-[0_0_30px_rgba(212,175,55,0.1)] transition duration-500 hover:shadow-[0_0_40px_rgba(212,175,55,0.25)]"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Profile"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <User size={40} className="text-slate-400 dark:text-white/20" />
                      )}

                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-[#D4AF37] opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                        <Camera size={23} />

                        <span className="mt-2 text-[7px] font-black uppercase tracking-[0.13em]">
                          Change Photo
                        </span>
                      </div>
                    </button>

                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] px-4 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/45 transition hover:border-[#D4AF37]/30 hover:text-[#98751A] dark:text-[#D4AF37] dark:hover:text-[#D4AF37]"
                      >
                        <Camera size={13} />
                        Select Profile Photo
                      </button>

                      <p className="mt-3 text-[9px] leading-5 text-slate-400 dark:text-white/25">
                        JPG, PNG or WEBP. Maximum 5MB.
                      </p>

                      {selectedProfileImage && (
                        <p className="mt-1 max-w-xs truncate text-[9px] text-emerald-700 dark:text-emerald-300/70">
                          {selectedProfileImage.name}
                        </p>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleProfileImageChange}
                      className="hidden"
                    />
                  </div>
                </section>

                {/* =========================================
                    Basic Profile Information
                    ========================================= */}

                <section className="border-t border-slate-200/80 dark:border-white/5 pt-8">
                  <h3 className="font-serif text-xl tracking-wide text-slate-950 dark:text-white">
                    Public Profile
                  </h3>

                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-white/25">
                    Information shown throughout your designer presence.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Full Name / Studio Name
                      </label>

                      <div className="relative">
                        <User
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <input
                          name="full_name"
                          type="text"
                          value={formData.full_name}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition focus:border-[#D4AF37]/50"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Communication Relay (Email)
                      </label>

                      <div className="relative">
                        <Mail
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <input
                          name="email"
                          type="email"
                          value={formData.email}
                          readOnly
                          aria-readonly="true"
                          className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 py-4 pl-12 pr-5 text-sm font-medium text-slate-500 shadow-inner outline-none dark:border-white/5 dark:bg-[#111] dark:text-white/45"
                          required
                        />
                      </div>

                      <p className="text-[9px] leading-5 text-slate-400 dark:text-white/25">
                        Your sign-in email is managed through account verification and cannot be changed here.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        External Portfolio Archive
                      </label>

                      <div className="relative">
                        <Globe
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <input
                          name="portfolio_url"
                          type="url"
                          placeholder="https://behance.net/yourname"
                          value={formData.portfolio_url}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-[#D4AF37]/50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Studio Biography
                      </label>

                      <div className="relative">
                        <FileText
                          className="absolute left-5 top-5 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <textarea
                          name="bio"
                          rows={5}
                          placeholder="Tell clients about your unique design style and background..."
                          value={formData.bio}
                          onChange={handleChange}
                          className="w-full resize-none rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 text-sm font-light leading-relaxed text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-[#D4AF37]/50"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* =========================================
                    WhatsApp Booking Contact
                    ========================================= */}

                <section className="border-t border-slate-200/80 dark:border-white/5 pt-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                        <MessageCircle size={13} />
                        WhatsApp Booking Contact
                      </div>

                      <h3 className="mt-2 font-serif text-xl tracking-wide text-slate-950 dark:text-white">
                        Private booking communication
                      </h3>

                      <p className="mt-2 max-w-2xl text-[10px] leading-5 text-slate-500 dark:text-white/30">
                        Your WhatsApp number is private account information. It
                        will only be eligible to be shared with the other
                        participant through an authorized booking after the
                        booking reaches an allowed contact state.
                      </p>
                    </div>

                    <span
                      className={`w-fit rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] ${
                        whatsappEnabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/30"
                      }`}
                    >
                      {whatsappEnabled ? "Sharing Enabled" : "Sharing Disabled"}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        WhatsApp Number
                      </label>

                      <div className="relative">
                        <MessageCircle
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <input
                          name="whatsapp_number"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={MAX_WHATSAPP_NUMBER_LENGTH}
                          placeholder="+9779812345678"
                          value={formData.whatsapp_number}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 font-mono text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-emerald-400/40"
                        />
                      </div>

                      <p className="text-[9px] leading-5 text-slate-400 dark:text-white/25">
                        Use international format with the country code, for
                        example +9779812345678. WhatsApp is optional.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] p-5 shadow-inner">
                      <div className="flex items-start justify-between gap-5">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-white/55">
                            Share with booking partners
                          </p>

                          <p className="mt-2 text-[9px] leading-5 text-slate-400 dark:text-white/25">
                            Turn this on only if you want your WhatsApp contact
                            to become available through eligible active
                            bookings.
                          </p>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={whatsappEnabled}
                          onClick={handleWhatsAppToggle}
                          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition ${
                            whatsappEnabled
                              ? "border-emerald-300 bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/25"
                              : "border-slate-300 bg-slate-200 dark:border-white/10 dark:bg-white/[0.06]"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full shadow transition-all ${
                              whatsappEnabled
                                ? "left-6 bg-emerald-600 dark:bg-emerald-300"
                                : "left-1 bg-white dark:bg-white/40"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/10 bg-amber-400/[0.04] p-3 text-[9px] leading-5 text-amber-700 dark:text-amber-100/55">
                        <Lock
                          size={13}
                          className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300/70"
                        />

                        <span>
                          This setting does not publish your number on your
                          profile, Showcase, Designer directory, or booking
                          ledger.
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* =========================================
                    Operational Parameters
                    ========================================= */}

                <section className="space-y-6 border-t border-slate-200/80 dark:border-white/5 pt-8">
                  <div>
                    <h3 className="font-serif text-xl tracking-wide text-slate-950 dark:text-white">
                      Operational Parameters
                    </h3>

                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-white/25">
                      Studio location and tier information.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Tier Commission
                      </label>

                      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/8 px-5 py-4 shadow-inner dark:border-[#D4AF37]/20 dark:bg-[#D4AF37]/10">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-semibold text-slate-700 dark:text-white/70">
                            {humanize(user?.tier, "Bronze")} tier
                          </span>

                          <span className="font-mono text-lg font-black text-[#98751A] dark:text-[#D4AF37]">
                            {tierCommissionPercent}%
                          </span>
                        </div>

                        <p className="mt-2 text-[9px] leading-5 text-slate-400 dark:text-white/25">
                          Commission is assigned automatically from your completed-booking tier and cannot be edited here.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Headquarters (Street)
                      </label>

                      <div className="relative">
                        <MapPin
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                          size={16}
                        />

                        <input
                          name="address_line"
                          type="text"
                          placeholder="123 Creative Studio Lane"
                          value={formData.address_line}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-[#D4AF37]/50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        City
                      </label>

                      <input
                        name="city"
                        type="text"
                        placeholder="Kathmandu"
                        value={formData.city}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] px-5 py-4 text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-[#D4AF37]/50"
                      />
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                        Region / Country
                      </label>

                      <input
                        name="country"
                        type="text"
                        placeholder="Nepal"
                        value={formData.country}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] px-5 py-4 text-sm font-medium text-slate-950 dark:text-white shadow-inner outline-none transition placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-[#D4AF37]/50"
                      />
                    </div>
                  </div>
                </section>

                {/* =========================================
                    Messages
                    ========================================= */}

                <div className="space-y-4 pt-2">
                  {error && (
                    <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 p-4 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-400 shadow-inner">
                      <AlertCircle size={16} className="shrink-0" />

                      {error}
                    </div>
                  )}

                  {successMessage && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 p-4 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400 shadow-inner">
                      <CheckCircle2 size={16} className="shrink-0" />

                      {successMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-5 text-[10px] font-black uppercase tracking-[0.3em] text-black shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 hover:bg-white disabled:border disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:disabled:border-white/5 dark:disabled:bg-[#111] dark:disabled:text-white/30"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Saving Profile
                      </>
                    ) : (
                      "Update Identity Database"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ===============================================
              SECURITY TAB
              =============================================== */}

          {activeTab === "security" && (
            <form
              onSubmit={handleSecuritySubmit}
              className="max-w-2xl space-y-8 p-6 sm:p-8 md:p-12"
            >
              <div className="space-y-2 border-b border-slate-200/80 dark:border-white/5 pb-6">
                <h3 className="font-serif text-2xl tracking-wide text-slate-950 dark:text-white">
                  Cryptographic Security
                </h3>

                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                  Maintain account integrity by updating your access code.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                    Current Access Code
                  </label>

                  <div className="relative">
                    <KeyRound
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30"
                      size={16}
                    />

                    <input
                      name="current_password"
                      type="password"
                      placeholder="••••••••"
                      value={securityData.current_password}
                      onChange={handleSecurityChange}
                      className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-4 pl-12 pr-5 font-mono text-sm text-slate-950 dark:text-white shadow-inner outline-none transition focus:border-[#D4AF37]/50"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 border-t border-slate-200/80 dark:border-white/5 pt-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                      New Access Code
                    </label>

                    <input
                      name="new_password"
                      type="password"
                      placeholder="••••••••"
                      value={securityData.new_password}
                      onChange={handleSecurityChange}
                      className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] px-5 py-4 font-mono text-sm text-slate-950 dark:text-white shadow-inner outline-none transition focus:border-[#D4AF37]/50"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                      Verify Access Code
                    </label>

                    <input
                      name="confirm_password"
                      type="password"
                      placeholder="••••••••"
                      value={securityData.confirm_password}
                      onChange={handleSecurityChange}
                      className="w-full rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] px-5 py-4 font-mono text-sm text-slate-950 dark:text-white shadow-inner outline-none transition focus:border-[#D4AF37]/50"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                {error && (
                  <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 p-4 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-400 shadow-inner">
                    <AlertCircle size={16} className="shrink-0" />

                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 p-4 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400 shadow-inner">
                    <CheckCircle2 size={16} className="shrink-0" />

                    {successMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={securitySaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-5 text-[10px] font-black uppercase tracking-[0.3em] text-black shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 hover:bg-white disabled:border disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:disabled:border-white/5 dark:disabled:bg-[#111] dark:disabled:text-white/30"
                >
                  {securitySaving ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Updating
                    </>
                  ) : (
                    "Initialize Security Update"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ===============================================
              BOOKING / ESCROW TAB
              =============================================== */}

          {activeTab === "bookings" && (
            <div className="space-y-8 p-6 sm:p-8 md:p-12">
              {/* ===========================================
                  Balance Summary
                  =========================================== */}

              <div className="grid grid-cols-1 rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] p-6 shadow-inner sm:grid-cols-2">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/5 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                      Liquid Capital
                    </p>

                    <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/20">
                      Ready for extraction
                    </p>
                  </div>

                  <span className="font-serif text-2xl tabular-nums text-slate-950 dark:text-white drop-shadow-md sm:text-3xl">
                    {formatMoney(user?.available_balance)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-4 sm:pl-6 sm:pt-0">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#98751A] dark:text-[#D4AF37]">
                      Vaulted Escrow
                    </p>

                    <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/20">
                      Secured in pipelines
                    </p>
                  </div>

                  <span className="font-serif text-2xl tabular-nums text-[#98751A] dark:text-[#D4AF37] drop-shadow-md sm:text-3xl">
                    {formatMoney(user?.pending_escrow_balance)}
                  </span>
                </div>
              </div>

              {/* ===========================================
                  Ledger Header
                  =========================================== */}

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#98751A] dark:text-[#D4AF37]">
                    Project Ledger
                  </p>

                  <h3 className="mt-1 font-serif text-2xl text-slate-950 dark:text-white">
                    Active and historical contracts
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => void loadBookings()}
                  disabled={bookingsLoading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] text-slate-500 dark:text-white/30 transition hover:border-[#D4AF37]/30 hover:text-[#98751A] dark:text-[#D4AF37] dark:hover:text-[#D4AF37] disabled:opacity-50"
                  title="Refresh contracts"
                >
                  <RefreshCw
                    size={14}
                    className={bookingsLoading ? "animate-spin" : ""}
                  />
                </button>
              </div>

              {/* ===========================================
                  Bookings
                  =========================================== */}

              {bookingsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-[#98751A] dark:text-[#D4AF37]" size={32} />
                </div>
              ) : bookings.length === 0 ? (
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] py-20 text-center shadow-inner">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-200/80 dark:border-white/5 bg-white dark:bg-[#030303]">
                    <Briefcase size={24} className="text-slate-400 dark:text-white/20" />
                  </div>

                  <div>
                    <h4 className="font-serif text-xl text-slate-800 dark:text-white/80">
                      Ledger Empty
                    </h4>

                    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-white/30">
                      No historical contracts or active pipelines found.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {bookings.map((contract, index) => {
                    const contractId = cleanText(
                      contract?.id ||
                        contract?.booking_id ||
                        `contract-${index}`,
                    );

                    const reference = contractId
                      ? contractId.slice(0, 8).toUpperCase()
                      : "UNKNOWN";

                    return (
                      <div
                        key={contractId || index}
                        className="group flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-white/5 dark:bg-[#111] p-6 shadow-lg transition-all duration-300 hover:border-[#D4AF37]/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/5 pb-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-lg border border-slate-200/80 dark:border-white/5 bg-white dark:bg-[#030303] px-3 py-1.5 font-mono text-[10px] font-bold text-slate-500 dark:text-white/30">
                              REF: {reference}
                            </span>

                            <span className="rounded-full border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-400">
                              {cleanText(contract?.status, "Active")}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
                              <Lock size={12} />
                              Vault Locked
                            </div>

                            <span className="font-serif text-2xl tabular-nums text-slate-950 dark:text-white drop-shadow-md">
                              {formatMoney(contract?.agreed_price)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 py-4">
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-white/40">
                            Contract Specifications
                          </h4>

                          <p className="text-xs font-light leading-relaxed text-slate-700 dark:text-white/70">
                            {cleanText(
                              contract?.brief_text || contract?.description,
                              "No custom specifications provided.",
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileSetting;
