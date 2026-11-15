"use strict";

/*
=========================================================
DesignByYou
Creator Settings
Version 4.3
=========================================================

Responsibilities:

1. Creator identity / brand preferences
2. Standard Creator profile image
3. Creator project defaults
4. Private WhatsApp booking-contact preferences
5. Fashion Persona code retained behind a temporary feature flag
6. Password / account security

=========================================================
DATA OWNERSHIP
=========================================================

Authenticated account state:
    AuthContext
    GET /auth/me

Creator profile updates:
    PUT /users/profile

Private WhatsApp preference:
    users.whatsapp_number
    users.whatsapp_contact_enabled
    saved through PUT /users/profile

Password updates:
    PUT /users/security

Fashion Persona:
    GET /avatar/me
    customization → /creator/avatar-studio

=========================================================
IMPORTANT
=========================================================

The standard profile image and Fashion Persona are
different concepts.

profile_image
    → compact account/profile image

Fashion Persona
    → customizable visual identity

This page does NOT write Fashion Persona configuration.

=========================================================
WHATSAPP PRIVACY
=========================================================

WhatsApp is optional. The number remains private account data.
Enabling sharing only records consent for a later authorized
booking-participant contact endpoint. This page never exposes
the number publicly.

=========================================================
TEMPORARY FASHION PERSONA FEATURE FLAG
=========================================================

Fashion Persona / Avatar code remains in this file so it can
be restored later without rebuilding the feature.

SHOW_FASHION_PERSONA = false

While disabled:
- /avatar/me is not requested by this page
- Avatar Studio entry points are hidden
- Fashion Persona status is hidden
- Fashion Persona preview is hidden
- Standard Creator profile image remains available

Changing the flag to true restores the existing settings UI.

=========================================================
PASSWORD / SESSION RULE
=========================================================

The backend increments token_version after a successful
password change.

Therefore ALL previously-issued JWTs become invalid,
including the current browser session.

After password update:

PUT /users/security
        ↓
token_version + 1
        ↓
logout()
        ↓
clear local authentication
        ↓
/login

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
  AlignLeft,
  ArrowRight,
  Briefcase,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  RefreshCw,
  Ruler,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import API from "../../api/axios";

import { useAuth } from "../../context/AuthContext.helpers.js";

import FashionPersonaAvatar from "../avatar/FashionPersonaAvatar";

/*=========================================================
Endpoints
=========================================================*/

const PROFILE_UPDATE_ENDPOINT = "/users/profile";

const PROFILE_REFRESH_ENDPOINT = "/auth/me";

const SECURITY_ENDPOINT = "/users/security";

const AVATAR_ENDPOINT = "/avatar/me";

/*=========================================================
Temporary Feature Flags
=========================================================*/

/*
 * Keep all Fashion Persona / Avatar implementation in this
 * file, but hide it from Creator Settings for now.
 *
 * false:
 * - do not request /avatar/me
 * - hide Avatar Studio buttons
 * - hide Persona status
 * - hide Persona preview / configuration
 *
 * true:
 * - restore the existing Persona settings UI
 */
const SHOW_FASHION_PERSONA = false;

/*=========================================================
Limits
=========================================================*/

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_MAX_LENGTH = 128;

const MAX_WHATSAPP_NUMBER_LENGTH = 16;

const WHATSAPP_E164_REGEX = /^\+[1-9][0-9]{7,14}$/;

/*=========================================================
Shared Input Style
=========================================================*/

const INPUT_CLASS = `
  h-[52px] w-full rounded-md border border-line bg-canvas px-4 text-sm outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:text-ink dark:focus:bg-subtle
`;

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

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
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
      return new URL(configured).origin;
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

  if (path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path.replace(/\\/g, "/");
  }

  const origin = getBackendOrigin();

  if (!origin) {
    return path;
  }

  return `${origin}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

/*=========================================================
Response Extraction
=========================================================*/

function extractUser(response) {
  const body = response?.data;

  const candidates = [body?.data?.user, body?.user, body?.data, body];

  return (
    candidates.find(
      (candidate) =>
        candidate && typeof candidate === "object" && !Array.isArray(candidate),
    ) || null
  );
}

function extractAvatar(response) {
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

    sourceType: normalize(design.source_type || "upload"),

    isEditable: toBoolean(design.is_editable, false),

    allowRemix: toBoolean(design.allow_remix, false),

    originalDesignId: cleanText(design.original_design_id),
  };
}

/*=========================================================
Avatar Normalization
=========================================================*/

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

/*=========================================================
Notice
=========================================================*/

function Notice({ type, children }) {
  const success = type === "success";

  const Icon = success ? CheckCircle2 : AlertTriangle;

  return (
    <div
      role={success ? "status" : "alert"}
      className={`
        flex items-start gap-3 rounded-md border p-4 text-sm leading-6

        ${
          success
            ? "border-line bg-canvas text-action dark:bg-subtle"
            : "border-line bg-canvas text-action dark:bg-subtle"
        }
      `}
    >
      <Icon
        size={17}
        className="
          mt-0.5 shrink-0
        "
      />

      <p>{children}</p>
    </div>
  );
}

/*=========================================================
Field Label
=========================================================*/

function FieldLabel({ icon: Icon, children }) {
  return (
    <span
      className="
        mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted
      "
    >
      <Icon
        size={13}
        className="
          text-action
        "
      />

      {children}
    </span>
  );
}

/*=========================================================
Password Field
=========================================================*/

function PasswordField({
  label,
  name,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder = "••••••••",
}) {
  return (
    <label className="block">
      <span
        className="
          mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.17em] text-muted
        "
      >
        {label}
      </span>

      <div className="relative">
        <KeyRound
          size={14}
          className="
            pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted
          "
        />

        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          maxLength={PASSWORD_MAX_LENGTH}
          className="
            h-[52px] w-full rounded-md border border-line bg-canvas pl-10 pr-12 text-sm outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:text-ink dark:placeholder:text-muted dark:focus:bg-subtle
          "
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          className="
            absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-subtle hover:text-ink
          "
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </label>
  );
}

/*=========================================================
Status Card
=========================================================*/

function StatusCard({ icon: Icon, label, value, helper, accent }) {
  const accentClass = {
    emerald: "text-action",

    amber: "text-action",

    violet: "text-action",

    gold: "text-action",
  }[accent];

  return (
    <article
      className="
        rounded-md border border-line bg-subtle p-4 transition hover:-translate-y-0.5 hover:border-line
      "
    >
      <div
        className="
          flex items-start justify-between gap-4
        "
      >
        <div className="min-w-0">
          <p
            className="
              text-[11px] font-semibold uppercase tracking-[0.18em] text-muted
            "
          >
            {label}
          </p>

          <p
            className="
              mt-3 truncate text-lg font-semibold
            "
          >
            {value}
          </p>

          <p
            className="
              mt-2 text-[11px] leading-4 text-muted
            "
          >
            {helper}
          </p>
        </div>

        <div
          className={`
            grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-canvas dark:bg-subtle

            ${accentClass}
          `}
        >
          <Icon size={18} />
        </div>
      </div>
    </article>
  );
}

/*=========================================================
Password Requirement
=========================================================*/

function PasswordRequirement({ passed, children }) {
  return (
    <div
      className={`
        flex items-center gap-2 text-[11px] font-semibold

        ${
          passed
            ? "text-action"
            : "text-muted"
        }
      `}
    >
      <CheckCircle2 size={12} />

      {children}
    </div>
  );
}

/*=========================================================
Creator Settings
=========================================================*/

export default function CreatorSettings() {
  const { user, setUser, logout } = useAuth();

  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  const avatarRequestRef = useRef(null);

  /*=======================================================
  Save State
  =======================================================*/

  const [profileSaving, setProfileSaving] = useState(false);

  const [securitySaving, setSecuritySaving] = useState(false);

  /*=======================================================
  Notices
  =======================================================*/

  const [profileSuccess, setProfileSuccess] = useState("");

  const [profileError, setProfileError] = useState("");

  const [securitySuccess, setSecuritySuccess] = useState("");

  const [securityError, setSecurityError] = useState("");

  /*=======================================================
  Fashion Persona
  =======================================================*/

  const [avatar, setAvatar] = useState(null);

  const [avatarLoading, setAvatarLoading] = useState(SHOW_FASHION_PERSONA);

  const [avatarError, setAvatarError] = useState("");

  /*=======================================================
  Creator Form
  =======================================================*/

  const [form, setForm] = useState({
    full_name: "",

    company_name: "",

    preferred_category: "",

    default_dimensions: "",

    brand_guidelines_summary: "",

    whatsapp_number: "",

    whatsapp_contact_enabled: false,
  });

  /*=======================================================
  Password Form
  =======================================================*/

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",

    newPassword: "",

    confirmPassword: "",
  });

  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,

    next: false,

    confirm: false,
  });

  /*=======================================================
  Profile Photo
  =======================================================*/

  const [profileImageFile, setProfileImageFile] = useState(null);

  const [profileImagePreview, setProfileImagePreview] = useState("");

  /*=======================================================
  Hydrate from AuthContext
  =======================================================*/

  const [formOwner, setFormOwner] = useState(null);
  if (user && formOwner !== user.id) {
    setFormOwner(user.id);
    setForm({
      full_name: user.full_name || "",

      company_name: user.company_name || "",

      preferred_category: user.preferred_category || "",

      default_dimensions: user.default_dimensions || "",

      brand_guidelines_summary: user.brand_guidelines_summary || "",

      whatsapp_number: user.whatsapp_number || "",

      whatsapp_contact_enabled: toBoolean(user.whatsapp_contact_enabled, false),
    });

    setProfileImagePreview(
      resolveImageSrc(user.profile_image_url || user.profile_image || ""),
    );
  }

  /*=======================================================
  Load Fashion Persona
  =======================================================*/

  const loadAvatar = useCallback(async () => {
    /*
     * Fashion Persona is intentionally dormant while the
     * temporary feature flag is disabled.
     *
     * Keep the loader intact so changing the flag back to
     * true restores the existing behavior.
     */
    if (!SHOW_FASHION_PERSONA) {
      avatarRequestRef.current?.abort();

      avatarRequestRef.current = null;

      setAvatar(null);

      setAvatarLoading(false);

      setAvatarError("");

      return;
    }

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

      setAvatar(normalizeAvatar(extractAvatar(response)));
    } catch (requestError) {
      if (controller.signal.aborted || isCancelledRequest(requestError)) {
        return;
      }

      if (requestError?.response?.status === 404) {
        setAvatar(null);

        setAvatarError("");

        return;
      }

      if (import.meta.env.DEV) {
        console.error("Creator Fashion Persona load failed:", requestError);
      }

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
    if (!SHOW_FASHION_PERSONA) {
      setAvatar(null);

      setAvatarLoading(false);

      setAvatarError("");

      return undefined;
    }

    void loadAvatar();

    return () => {
      avatarRequestRef.current?.abort();
    };
  }, [loadAvatar]);

  /*=======================================================
  Form State
  =======================================================*/

  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;

    setForm((current) => {
      const next = {
        ...current,

        [name]: value,
      };

      /*
       * A WhatsApp sharing preference cannot remain enabled
       * when the number has been cleared. Keep the client-side
       * state aligned with the backend invariant.
       */
      if (name === "whatsapp_number" && !String(value || "").trim()) {
        next.whatsapp_contact_enabled = false;
      }

      return next;
    });

    setProfileError("");

    setProfileSuccess("");
  }, []);

  const handleWhatsappToggle = useCallback(() => {
    setForm((current) => {
      const hasNumber = Boolean(cleanText(current.whatsapp_number));

      if (!hasNumber) {
        return {
          ...current,

          whatsapp_contact_enabled: false,
        };
      }

      return {
        ...current,

        whatsapp_contact_enabled: !current.whatsapp_contact_enabled,
      };
    });

    setProfileError("");

    setProfileSuccess("");
  }, []);

  const handlePasswordChange = useCallback((event) => {
    const { name, value } = event.target;

    setPasswordForm((current) => ({
      ...current,

      [name]: value,
    }));

    setSecurityError("");

    setSecuritySuccess("");
  }, []);

  /*=======================================================
  Profile Completeness
  =======================================================*/

  const profileCompleteness = useMemo(() => {
    const fields = [
      form.full_name,

      form.company_name,

      form.preferred_category,

      form.default_dimensions,

      form.brand_guidelines_summary,
    ];

    const completed = fields.filter((value) =>
      Boolean(cleanText(value)),
    ).length;

    return Math.round((completed / fields.length) * 100);
  }, [form]);

  /*=======================================================
  Dirty Profile
  =======================================================*/

  const profileChanged = useMemo(() => {
    if (profileImageFile) {
      return true;
    }

    return (
      cleanText(form.full_name) !== cleanText(user?.full_name) ||
      cleanText(form.company_name) !== cleanText(user?.company_name) ||
      cleanText(form.preferred_category) !==
        cleanText(user?.preferred_category) ||
      cleanText(form.default_dimensions) !==
        cleanText(user?.default_dimensions) ||
      cleanText(form.brand_guidelines_summary) !==
        cleanText(user?.brand_guidelines_summary) ||
      cleanText(form.whatsapp_number) !== cleanText(user?.whatsapp_number) ||
      Boolean(form.whatsapp_contact_enabled) !==
        toBoolean(user?.whatsapp_contact_enabled, false)
    );
  }, [form, profileImageFile, user]);

  /*=======================================================
  Profile Image Selection
  =======================================================*/

  const handleImageSelect = useCallback((event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setProfileSuccess("");

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      setProfileError("Profile image must be JPG, PNG, or WEBP.");

      event.target.value = "";

      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setProfileError("Profile image must be 5MB or smaller.");

      event.target.value = "";

      return;
    }

    setProfileError("");

    setProfileImageFile(file);

    setProfileImagePreview(URL.createObjectURL(file));
  }, []);

  /*=======================================================
  Blob Preview Cleanup
  =======================================================*/

  useEffect(() => {
    if (!profileImagePreview?.startsWith("blob:")) {
      return undefined;
    }

    const blobUrl = profileImagePreview;

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [profileImagePreview]);

  /*=======================================================
  Discard Selected Image
  =======================================================*/

  const discardSelectedImage = useCallback(() => {
    setProfileImageFile(null);

    setProfileImagePreview(
      resolveImageSrc(user?.profile_image_url || user?.profile_image || ""),
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setProfileError("");

    setProfileSuccess("");
  }, [user]);

  /*=======================================================
  Refresh Authenticated User
  =======================================================*/

  const refreshAuthenticatedUser = useCallback(async () => {
    const response = await API.get(PROFILE_REFRESH_ENDPOINT);

    const freshUser = extractUser(response);

    if (!freshUser || normalize(freshUser.role) !== "creator") {
      throw new Error("The updated Creator profile could not be synchronized.");
    }

    if (typeof setUser === "function") {
      setUser(freshUser);
    }

    return freshUser;
  }, [setUser]);

  /*=======================================================
  Save Creator Profile
  =======================================================*/

  const handleProfileSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (profileSaving) {
        return;
      }

      setProfileError("");

      setProfileSuccess("");

      const fullName = cleanText(form.full_name);

      const companyName = cleanText(form.company_name);

      const category = cleanText(form.preferred_category);

      const dimensions = cleanText(form.default_dimensions);

      const guidelines = cleanText(form.brand_guidelines_summary);

      const whatsappNumber = String(form.whatsapp_number || "").trim();

      const whatsappEnabled = Boolean(form.whatsapp_contact_enabled);

      if (fullName.length < 2) {
        setProfileError("Creator name must contain at least 2 characters.");

        return;
      }

      if (whatsappNumber && !WHATSAPP_E164_REGEX.test(whatsappNumber)) {
        setProfileError(
          "WhatsApp number must use international format, for example +9779812345678.",
        );

        return;
      }

      if (whatsappEnabled && !whatsappNumber) {
        setProfileError(
          "Add a WhatsApp number before enabling booking contact sharing.",
        );

        return;
      }

      setProfileSaving(true);

      try {
        const formData = new FormData();

        formData.append("full_name", fullName);

        formData.append("company_name", companyName);

        formData.append("preferred_category", category);

        formData.append("default_dimensions", dimensions);

        formData.append("brand_guidelines_summary", guidelines);

        formData.append("whatsapp_number", whatsappNumber);

        formData.append("whatsapp_contact_enabled", String(whatsappEnabled));

        if (profileImageFile) {
          formData.append("profile_image", profileImageFile);
        }

        const response = await API.put(PROFILE_UPDATE_ENDPOINT, formData);

        const updatedUser = extractUser(response);

        if (updatedUser && typeof setUser === "function") {
          setUser((previous) => ({
            ...(previous || {}),

            ...updatedUser,
          }));
        }

        let freshUser = null;

        try {
          freshUser = await refreshAuthenticatedUser();
        } catch (refreshError) {
          if (import.meta.env.DEV) {
            console.warn(
              "Profile saved but /auth/me refresh failed:",
              refreshError,
            );
          }
        }

        const finalUser = freshUser ||
          updatedUser || {
            ...user,

            full_name: fullName,

            company_name: companyName,

            preferred_category: category,

            default_dimensions: dimensions,

            brand_guidelines_summary: guidelines,

            whatsapp_number: whatsappNumber || null,

            whatsapp_contact_enabled: whatsappEnabled,
          };

        setForm({
          full_name: finalUser?.full_name || fullName,

          company_name: finalUser?.company_name || "",

          preferred_category: finalUser?.preferred_category || "",

          default_dimensions: finalUser?.default_dimensions || "",

          brand_guidelines_summary: finalUser?.brand_guidelines_summary || "",

          whatsapp_number: finalUser?.whatsapp_number || "",

          whatsapp_contact_enabled: toBoolean(
            finalUser?.whatsapp_contact_enabled,
            false,
          ),
        });

        const savedImage = resolveImageSrc(
          finalUser?.profile_image_url || finalUser?.profile_image || "",
        );

        setProfileImagePreview(savedImage);

        setProfileImageFile(null);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        setProfileSuccess("Creator profile updated successfully.");
      } catch (requestError) {
        if (import.meta.env.DEV) {
          console.error("Creator profile update failed:", requestError);
        }

        setProfileError(
          getErrorMessage(
            requestError,
            "Your Creator profile could not be updated.",
          ),
        );
      } finally {
        setProfileSaving(false);
      }
    },
    [
      form,
      profileImageFile,
      profileSaving,
      refreshAuthenticatedUser,
      setUser,
      user,
    ],
  );

  /*=======================================================
  Password Validation
  =======================================================*/

  const passwordChecks = useMemo(() => {
    const next = passwordForm.newPassword;

    return {
      hasRequiredLength:
        next.length >= PASSWORD_MIN_LENGTH &&
        next.length <= PASSWORD_MAX_LENGTH,

      different: Boolean(next) && next !== passwordForm.currentPassword,

      matches: Boolean(next) && next === passwordForm.confirmPassword,
    };
  }, [passwordForm]);

  /*=======================================================
  Save Password + Reauthenticate
  =======================================================*/

  const handleSecuritySubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (securitySaving) {
        return;
      }

      setSecurityError("");

      setSecuritySuccess("");

      const { currentPassword, newPassword, confirmPassword } = passwordForm;

      if (!currentPassword || !newPassword || !confirmPassword) {
        setSecurityError(
          "Current password, new password, and confirmation are required.",
        );

        return;
      }

      if (
        newPassword.length < PASSWORD_MIN_LENGTH ||
        newPassword.length > PASSWORD_MAX_LENGTH
      ) {
        setSecurityError(
          `New password must contain ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
        );

        return;
      }

      if (newPassword === currentPassword) {
        setSecurityError(
          "Your new password must be different from your current password.",
        );

        return;
      }

      if (newPassword !== confirmPassword) {
        setSecurityError("New passwords do not match.");

        return;
      }

      setSecuritySaving(true);

      try {
        const response = await API.put(SECURITY_ENDPOINT, {
          currentPassword,

          newPassword,
        });

        if (response?.data?.status !== "success") {
          throw new Error("The password update did not complete successfully.");
        }

        /*
          Clear sensitive form state immediately.

          The backend has now incremented token_version, so
          the JWT used for this request must no longer be
          treated as a valid session.
          */

        setPasswordForm({
          currentPassword: "",

          newPassword: "",

          confirmPassword: "",
        });

        setPasswordVisibility({
          current: false,

          next: false,

          confirm: false,
        });

        setSecuritySuccess("Password updated. Signing you out securely...");

        /*
          Use the centralized AuthContext logout path.

          Promise.resolve() supports either:
          - synchronous logout()
          - async logout()
          */

        if (typeof logout === "function") {
          try {
            await Promise.resolve(logout());
          } catch (logoutError) {
            /*
              The password change has already invalidated
              the token server-side.

              A logout implementation that makes a backend
              request may receive 401 because token_version
              changed. That must not prevent navigation to
              the login screen.
              */

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
        if (import.meta.env.DEV) {
          console.error("Creator security update failed:", requestError);
        }

        setSecurityError(
          getErrorMessage(requestError, "Your password could not be updated."),
        );
      } finally {
        setSecuritySaving(false);
      }
    },
    [logout, navigate, passwordForm, securitySaving],
  );

  /*=======================================================
  Persona Details
  =======================================================*/

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
        label: "Presentation",

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

  const emailVerified = toBoolean(user?.is_email_verified, false);

  const profileName = cleanText(form.full_name || user?.full_name, "Creator");

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
          relative z-10 mx-auto max-w-[1200px] px-4 pt-9 sm:px-6 lg:px-10 lg:pt-12
        "
      >
        {/*=================================================
        Hero
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
              relative z-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between
            "
          >
            <div>
              <p
                className="
                  inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-action
                "
              >
                <Sparkles size={12} />
                Creator Identity
              </p>

              <h1
                className="
                  mt-4 font-sans text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl
                "
              >
                Account &{" "}
                <span
                  className="
                    italic text-action
                  "
                >
                  Settings
                </span>
              </h1>

              <p
                className="
                  mt-5 max-w-2xl text-sm leading-7 text-muted
                "
              >
                Manage your Creator identity, project preferences, standard
                profile image, private WhatsApp booking contact
                {SHOW_FASHION_PERSONA ? ", Fashion Persona" : ""} and account
                security.
              </p>
            </div>

            <div
              className="
                flex flex-col gap-3 sm:flex-row
              "
            >
              <button
                type="button"
                onClick={() => navigate("/creator/profile")}
                className="
                  inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted transition hover:border-line hover:text-action dark:bg-subtle
                "
              >
                <User size={14} />
                View Profile
              </button>

              {SHOW_FASHION_PERSONA && (
                <button
                  type="button"
                  onClick={() => navigate("/creator/avatar-studio")}
                  className="
                    inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-on-action transition hover:-translate-y-0.5 hover:bg-action hover:text-on-action
                  "
                >
                  <Sparkles size={14} />
                  Avatar Studio
                </button>
              )}
            </div>
          </div>
        </section>

        {/*=================================================
        Status Cards
        =================================================*/}

        <section
          className={`
            mb-7 grid gap-4

            ${SHOW_FASHION_PERSONA ? "sm:grid-cols-3" : "sm:grid-cols-2"}
          `}
        >
          <StatusCard
            icon={Mail}
            label="Account Email"
            value={user?.email || "Unavailable"}
            helper={
              emailVerified
                ? "Verified email"
                : "Verification required for new financial actions"
            }
            accent={emailVerified ? "emerald" : "amber"}
          />

          <StatusCard
            icon={User}
            label="Profile Setup"
            value={`${profileCompleteness}%`}
            helper="Creator identity completeness"
            accent="gold"
          />

          {SHOW_FASHION_PERSONA && (
            <StatusCard
              icon={Sparkles}
              label="Fashion Persona"
              value={
                avatarLoading
                  ? "Loading"
                  : avatar
                    ? "Configured"
                    : "Not created"
              }
              helper={
                avatar
                  ? `${humanize(avatar.pose, "Standing")} · ${
                      avatar.isPublic ? "Public" : "Private"
                    }`
                  : "Optional visual identity"
              }
              accent="violet"
            />
          )}
        </section>

        {/*=================================================
        Creator Profile Form
        =================================================*/}

        <form
          onSubmit={handleProfileSubmit}
          className="
            mb-7 overflow-hidden rounded-md border border-line bg-subtle
          "
        >
          <div
            className="
              flex flex-col gap-5 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between lg:p-4
            "
          >
            <div>
              <p
                className="
                  text-[11px] font-semibold uppercase tracking-normal text-action
                "
              >
                Identity & Preferences
              </p>

              <h2
                className="
                  mt-2 font-sans text-3xl
                "
              >
                Creator profile
              </h2>

              <p
                className="
                  mt-2 max-w-xl text-xs leading-5 text-muted
                "
              >
                These details help keep your Creator workspace, communication
                preferences and future bookings consistent.
              </p>
            </div>

            {profileChanged && (
              <span
                className="
                  w-fit rounded-md border border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-action dark:bg-subtle
                "
              >
                Unsaved Changes
              </span>
            )}
          </div>

          <div
            className="
              grid gap-8 p-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:p-4
            "
          >
            {/*=============================================
            Profile Image
            =============================================*/}

            <div>
              <p
                className="
                  mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted
                "
              >
                Standard Profile Image
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="
                  group relative aspect-square w-full overflow-hidden rounded-md border border-line bg-subtle transition hover:border-line dark:bg-surface
                "
              >
                {profileImagePreview ? (
                  <img
                    src={profileImagePreview}
                    alt={`${profileName} profile preview`}
                    className="
                      h-full w-full object-cover
                    "
                  />
                ) : (
                  <div
                    className="
                      flex h-full w-full items-center justify-center text-muted
                    "
                  >
                    <User size={54} />
                  </div>
                )}

                <div
                  className="
                    absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100
                  "
                >
                  <div
                    className="
                      grid h-12 w-12 place-items-center rounded-full bg-action text-on-action
                    "
                  >
                    <Camera size={19} />
                  </div>
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="
                  mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-subtle text-[11px] font-semibold uppercase tracking-[0.16em] text-action transition hover:bg-action hover:text-on-action
                "
              >
                <Camera size={13} />
                Select Photo
              </button>

              {profileImageFile && (
                <div
                  className="
                    mt-3 flex items-center gap-2 rounded-md border border-line bg-canvas p-3 dark:bg-subtle
                  "
                >
                  <CheckCircle2
                    size={13}
                    className="
                      shrink-0 text-action
                    "
                  />

                  <span
                    className="
                      min-w-0 flex-1 truncate text-[11px] text-action
                    "
                  >
                    {profileImageFile.name}
                  </span>

                  <button
                    type="button"
                    onClick={discardSelectedImage}
                    aria-label="Discard selected image"
                    className="
                      grid h-7 w-7 shrink-0 place-items-center rounded-md text-action transition hover:bg-subtle
                    "
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <p
                className="
                  mt-3 text-[11px] leading-5 text-muted
                "
              >
                JPG, PNG or WEBP. Maximum 5 MB.
                {SHOW_FASHION_PERSONA
                  ? " This is separate from your Fashion Persona."
                  : " This is your standard Creator profile image."}
              </p>
            </div>

            {/*=============================================
            Fields
            =============================================*/}

            <div
              className="
                space-y-6
              "
            >
              {profileSuccess && (
                <Notice type="success">{profileSuccess}</Notice>
              )}

              {profileError && <Notice type="error">{profileError}</Notice>}

              <div
                className="
                  grid gap-5 md:grid-cols-2
                "
              >
                <label className="block">
                  <FieldLabel icon={User}>Creator Name</FieldLabel>

                  <input
                    type="text"
                    name="full_name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.full_name}
                    onChange={handleInputChange}
                    autoComplete="name"
                    placeholder="Your name"
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="block">
                  <FieldLabel icon={Briefcase}>Brand / Company</FieldLabel>

                  <input
                    type="text"
                    name="company_name"
                    maxLength={160}
                    value={form.company_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Atelier Studios"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <div
                className="
                  grid gap-5 md:grid-cols-2
                "
              >
                <label className="block">
                  <FieldLabel icon={Tag}>Preferred Category</FieldLabel>

                  <input
                    type="text"
                    name="preferred_category"
                    list="creator-category-options"
                    maxLength={120}
                    value={form.preferred_category}
                    onChange={handleInputChange}
                    placeholder="e.g. Streetwear"
                    className={INPUT_CLASS}
                  />

                  <datalist id="creator-category-options">
                    <option value="Streetwear" />
                    <option value="Avant-Garde" />
                    <option value="Minimalism" />
                    <option value="High-Fashion" />
                    <option value="Techwear" />
                    <option value="Sportswear" />
                    <option value="Formalwear" />
                    <option value="Accessories" />
                  </datalist>
                </label>

                <label className="block">
                  <FieldLabel icon={Ruler}>Default Dimensions</FieldLabel>

                  <input
                    type="text"
                    name="default_dimensions"
                    maxLength={120}
                    value={form.default_dimensions}
                    onChange={handleInputChange}
                    placeholder="e.g. 1920 × 1080 px or A4"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <label className="block">
                <FieldLabel icon={AlignLeft}>
                  Brand Guidelines Summary
                </FieldLabel>

                <textarea
                  name="brand_guidelines_summary"
                  rows={7}
                  maxLength={5000}
                  value={form.brand_guidelines_summary}
                  onChange={handleInputChange}
                  placeholder="Describe your visual direction, preferred colors, style language, audience, materials, restrictions, recurring themes, and anything designers should know..."
                  className="
                    w-full resize-y rounded-md border border-line bg-canvas p-4 text-sm leading-7 outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:text-ink dark:placeholder:text-muted dark:focus:bg-subtle
                  "
                />

                <div
                  className="
                    mt-2 flex justify-end text-[11px] font-mono text-muted
                  "
                >
                  {form.brand_guidelines_summary.length}
                  /5000
                </div>
              </label>

              {/*===========================================
              WhatsApp Booking Contact
              ===========================================*/}

              <section
                className="
                  overflow-hidden rounded-md border border-line bg-subtle
                "
              >
                <div
                  className="
                    flex items-start gap-4 border-b border-line p-4
                  "
                >
                  <div
                    className="
                      grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-action dark:bg-subtle
                    "
                  >
                    <MessageCircle size={17} />
                  </div>

                  <div className="min-w-0">
                    <p
                      className="
                        text-[11px] font-semibold uppercase tracking-[0.18em] text-action
                      "
                    >
                      WhatsApp Booking Contact
                    </p>

                    <p
                      className="
                        mt-2 max-w-2xl text-[10px] leading-5 text-muted
                      "
                    >
                      Optional. Your WhatsApp number remains private account
                      data. Sharing only gives your active booking partner
                      permission to access it through the protected booking
                      contact flow.
                    </p>
                  </div>
                </div>

                <div
                  className="
                    grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]
                  "
                >
                  <label className="block">
                    <FieldLabel icon={MessageCircle}>
                      WhatsApp Number
                    </FieldLabel>

                    <input
                      type="tel"
                      name="whatsapp_number"
                      value={form.whatsapp_number}
                      onChange={handleInputChange}
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={MAX_WHATSAPP_NUMBER_LENGTH}
                      placeholder="e.g. +9779812345678"
                      aria-describedby="creator-whatsapp-help"
                      className={INPUT_CLASS}
                    />

                    <p
                      id="creator-whatsapp-help"
                      className="
                        mt-2 text-[11px] leading-5 text-muted
                      "
                    >
                      Use international E.164 format with the country code and
                      no spaces or dashes. Example: +9779812345678.
                    </p>
                  </label>

                  <div
                    className="
                      flex items-center justify-between gap-4 rounded-md border border-line bg-surface p-4 dark:bg-subtle
                    "
                  >
                    <div className="min-w-0">
                      <p
                        className="
                          text-[11px] font-semibold uppercase tracking-[0.14em] text-ink dark:text-muted
                        "
                      >
                        Share with booking partners
                      </p>

                      <p
                        className="
                          mt-2 text-[11px] leading-5 text-muted
                        "
                      >
                        Your number stays hidden until an eligible booking has
                        been accepted. You can turn this off at any time.
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(form.whatsapp_contact_enabled)}
                      aria-label="Share WhatsApp with active booking partners"
                      onClick={handleWhatsappToggle}
                      disabled={!cleanText(form.whatsapp_number)}
                      className={`
                        relative h-7 w-12 shrink-0 rounded-md border transition

                        ${
                          form.whatsapp_contact_enabled
                            ? "border-line bg-action text-on-action"
                            : "border-line bg-subtle"
                        }

                        disabled:cursor-not-allowed disabled:opacity-40
                      `}
                    >
                      <span
                        className={`
                          absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform

                          ${
                            form.whatsapp_contact_enabled
                              ? "translate-x-6"
                              : "translate-x-0.5"
                          }
                        `}
                      />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div
            className="
              flex flex-col gap-4 border-t border-line bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between lg:px-8
            "
          >
            <div>
              <p
                className="
                  text-[11px] font-semibold uppercase tracking-[0.17em] text-muted
                "
              >
                Profile completion
              </p>

              <div
                className="
                  mt-2 flex items-center gap-3
                "
              >
                <div
                  className="
                    h-1.5 w-32 overflow-hidden rounded-full bg-subtle
                  "
                >
                  <div
                    className="
                      h-full rounded-full bg-surface transition-all
                    "
                    style={{
                      width: `${profileCompleteness}%`,
                    }}
                  />
                </div>

                <span
                  className="
                    font-mono text-[11px] text-muted
                  "
                >
                  {profileCompleteness}%
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={profileSaving || !profileChanged}
              className="
                inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-action transition hover:-translate-y-0.5 hover:bg-action disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted hover:text-on-action
              "
            >
              {profileSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}

              {profileSaving
                ? "Saving Changes"
                : profileChanged
                  ? "Save Profile"
                  : "Profile Saved"}
            </button>
          </div>
        </form>

        {/*=================================================
        Fashion Persona
        =================================================*/}

        {SHOW_FASHION_PERSONA && (
          <section
            className="
              mb-7 overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
            "
          >
            <div
              className="
              flex flex-col gap-5 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between lg:p-4
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
                  mt-2 max-w-xl text-xs leading-5 text-muted
                "
                >
                  Preview your shared Fashion Persona here. Customization
                  remains in Avatar Studio.
                </p>
              </div>

              <div
                className="
                flex gap-2
              "
              >
                <button
                  type="button"
                  onClick={() => void loadAvatar()}
                  disabled={avatarLoading}
                  aria-label="Refresh Fashion Persona"
                  className="
                  grid h-9 w-11 place-items-center rounded-md border border-line bg-canvas text-muted transition hover:border-line hover:text-action disabled:opacity-50 dark:bg-subtle
                "
                >
                  <RefreshCw
                    size={14}
                    className={avatarLoading ? "animate-spin" : ""}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/creator/avatar-studio")}
                  className="
                  inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-action transition hover:bg-action hover:text-on-action
                "
                >
                  <Palette size={13} />
                  Customize
                </button>
              </div>
            </div>

            <div
              className="
              grid gap-7 p-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)] lg:p-4
            "
            >
              <div>
                {avatarLoading ? (
                  <div
                    className="
                    flex min-h-[360px] items-center justify-center rounded-md border border-line bg-canvas dark:bg-subtle
                  "
                  >
                    <Loader2
                      size={26}
                      className="
                      animate-spin text-action
                    "
                    />
                  </div>
                ) : avatar ? (
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
                      featuredDesign={avatar.featuredDesign}
                      compact
                      minHeight="360px"
                      avatarLabel="Creator Fashion Persona"
                      showFeaturedCard
                      ariaLabel={`${profileName} Fashion Persona preview`}
                    />
                  </div>
                ) : (
                  <div
                    className="
                    flex min-h-[360px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-canvas px-6 text-center dark:bg-subtle
                  "
                  >
                    <Sparkles
                      size={29}
                      className="
                      text-muted
                    "
                    />

                    <h3
                      className="
                      mt-5 font-sans text-2xl
                    "
                    >
                      Create your Persona
                    </h3>

                    <p
                      className="
                      mt-3 max-w-sm text-xs leading-6 text-muted
                    "
                    >
                      {avatarError ||
                        "You have not created a Fashion Persona yet. Open Avatar Studio when you are ready."}
                    </p>
                  </div>
                )}
              </div>

              <div
                className="
                flex flex-col justify-center
              "
              >
                <div
                  className="
                  flex flex-wrap gap-2
                "
                >
                  {avatar && (
                    <>
                      <span
                        className={`
                        rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em]

                        ${
                          avatar.isPublic
                            ? "border-line bg-canvas text-action dark:bg-subtle"
                            : "border-line bg-canvas text-muted dark:bg-subtle"
                        }
                      `}
                      >
                        {avatar.isPublic ? "Public Persona" : "Private Persona"}
                      </span>

                      <span
                        className="
                        rounded-md border border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted dark:bg-subtle
                      "
                      >
                        Version {avatar.version}
                      </span>
                    </>
                  )}
                </div>

                <h3
                  className="
                  mt-5 font-sans text-3xl
                "
                >
                  A separate visual identity
                </h3>

                <p
                  className="
                  mt-3 max-w-xl text-sm leading-7 text-muted
                "
                >
                  Your Persona can carry appearance, pose, scene and a featured
                  design. Changing your normal profile photo does not overwrite
                  it.
                </p>

                {avatar && (
                  <div
                    className="
                    mt-6 grid grid-cols-2 gap-3
                  "
                  >
                    {personaDetails.map((item) => (
                      <div
                        key={item.label}
                        className="
                          rounded-md border border-line bg-canvas p-4 dark:bg-subtle
                        "
                      >
                        <p
                          className="
                            text-[11px] font-semibold uppercase tracking-[0.15em] text-muted
                          "
                        >
                          {item.label}
                        </p>

                        <p
                          className="
                            mt-2 text-xs font-semibold
                          "
                        >
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/creator/avatar-studio")}
                  className="
                  mt-6 inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-line bg-canvas px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-action transition hover:bg-subtle dark:hover:bg-action dark:hover:text-on-action
                "
                >
                  Open Avatar Studio
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </section>
        )}

        {/*=================================================
        Security
        =================================================*/}

        <form
          onSubmit={handleSecuritySubmit}
          className="
            overflow-hidden rounded-md border border-line bg-subtle dark:bg-surface
          "
        >
          <div
            className="
              flex items-start gap-4 border-b border-line p-4 lg:p-4
            "
          >
            <div
              className="
                grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-canvas text-action dark:bg-subtle
              "
            >
              <Lock size={18} />
            </div>

            <div>
              <p
                className="
                  text-[11px] font-semibold uppercase tracking-normal text-action
                "
              >
                Account Security
              </p>

              <h2
                className="
                  mt-2 font-sans text-3xl
                "
              >
                Change password
              </h2>

              <p
                className="
                  mt-2 max-w-xl text-xs leading-5 text-muted
                "
              >
                Changing your password securely ends all existing sessions. You
                will need to sign in again afterward.
              </p>
            </div>
          </div>

          <div
            className="
              p-4 lg:p-4
            "
          >
            {securitySuccess && (
              <div className="mb-6">
                <Notice type="success">{securitySuccess}</Notice>
              </div>
            )}

            {securityError && (
              <div className="mb-6">
                <Notice type="error">{securityError}</Notice>
              </div>
            )}

            <div
              className="
                space-y-5
              "
            >
              <PasswordField
                label="Current Password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                visible={passwordVisibility.current}
                onToggle={() =>
                  setPasswordVisibility((current) => ({
                    ...current,

                    current: !current.current,
                  }))
                }
                autoComplete="current-password"
              />

              <div
                className="
                  grid gap-5 md:grid-cols-2
                "
              >
                <PasswordField
                  label="New Password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  visible={passwordVisibility.next}
                  onToggle={() =>
                    setPasswordVisibility((current) => ({
                      ...current,

                      next: !current.next,
                    }))
                  }
                  autoComplete="new-password"
                />

                <PasswordField
                  label="Confirm New Password"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  visible={passwordVisibility.confirm}
                  onToggle={() =>
                    setPasswordVisibility((current) => ({
                      ...current,

                      confirm: !current.confirm,
                    }))
                  }
                  autoComplete="new-password"
                />
              </div>

              {passwordForm.newPassword && (
                <div
                  className="
                    grid gap-2 rounded-md border border-line bg-canvas p-4 sm:grid-cols-3 dark:bg-subtle
                  "
                >
                  <PasswordRequirement
                    passed={passwordChecks.hasRequiredLength}
                  >
                    8–128 characters
                  </PasswordRequirement>

                  <PasswordRequirement passed={passwordChecks.different}>
                    Different from current
                  </PasswordRequirement>

                  <PasswordRequirement passed={passwordChecks.matches}>
                    Confirmation matches
                  </PasswordRequirement>
                </div>
              )}
            </div>
          </div>

          <div
            className="
              flex flex-col gap-4 border-t border-line bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between lg:px-8
            "
          >
            <div
              className="
                flex items-start gap-3
              "
            >
              <ShieldCheck
                size={15}
                className="
                  mt-0.5 shrink-0 text-action
                "
              />

              <p
                className="
                  max-w-xl text-[10px] leading-5 text-muted
                "
              >
                A successful password change revokes every existing login
                session, including this one.
              </p>
            </div>

            <button
              type="submit"
              disabled={securitySaving}
              className="
                inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-canvas px-6 text-[11px] font-semibold uppercase tracking-[0.17em] text-action transition hover:bg-action hover:text-on-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle
              "
            >
              {securitySaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}

              {securitySaving ? "Updating Password" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
