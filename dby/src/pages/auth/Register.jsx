"use strict";

/*
=========================================================
DesignByYou Registration Page
Creator & Designer Registration
Version 2.0
=========================================================
*/

import React, { useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  Briefcase,
  Building,
  Camera,
  FileText,
  Globe,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";

import API from "../../api/axios";
import AuthLayout from "../../layouts/AuthLayout";

/*=========================================================
Configuration
=========================================================*/

const ALLOWED_ROLES = ["creator", "designer"];

const MIN_PASSWORD_LENGTH = 8;

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

/*=========================================================
Registration Page
=========================================================*/

const Register = () => {
  const navigate = useNavigate();

  const previewUrlRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [imagePreview, setImagePreview] = useState(null);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",

    role: "creator",

    /* Creator fields */
    company_name: "",
    preferred_category: "",

    /* Designer fields */
    portfolio_url: "",
    bio: "",
    address_line: "",
    city: "",
    country: "",

    /* Shared upload */
    profileImage: null,
  });

  /*=====================================================
    Cleanup Image Preview
    =====================================================*/

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  /*=====================================================
    Update Normal Field
    =====================================================*/

  const updateField = (name, value) => {
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  /*=====================================================
    Role Selection
    =====================================================*/

  const handleRoleChange = (role) => {
    if (!ALLOWED_ROLES.includes(role) || loading) {
      return;
    }

    setFormData((current) => ({
      ...current,
      role,
    }));

    setError("");
  };

  /*=====================================================
    Profile Image Selection
    =====================================================*/

  const handleProfileImage = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    /*-------------------------------------------------
        Match backend upload.js:

        allowed:
        - jpg/jpeg
        - png

        maximum:
        - 5 MB
        -------------------------------------------------*/

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      event.target.value = "";

      setError("Profile image must be a JPG, JPEG, or PNG file.");

      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      event.target.value = "";

      setError("Profile image must be 5 MB or smaller.");

      return;
    }

    /*
        Revoke the previous browser preview URL before
        creating another one.
        */

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);

    previewUrlRef.current = previewUrl;

    setImagePreview(previewUrl);

    setFormData((current) => ({
      ...current,
      profileImage: file,
    }));

    setError("");
  };

  /*=====================================================
    Normal Input Change
    =====================================================*/

  const handleChange = (event) => {
    const { name, value } = event.target;

    updateField(name, value);
  };

  /*=====================================================
    Registration
    =====================================================*/

  const handleRegister = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    /*-------------------------------------------------
        Normalize Common Input
        -------------------------------------------------*/

    const fullName = formData.full_name.trim();

    const email = formData.email.trim().toLowerCase();

    const role = String(formData.role || "")
      .trim()
      .toLowerCase();

    /*-------------------------------------------------
        Client Validation

        Backend remains authoritative.
        -------------------------------------------------*/

    if (!fullName) {
      setError("Please enter your full name.");

      return;
    }

    if (!ALLOWED_ROLES.includes(role)) {
      setError("Please select a valid account type.");

      return;
    }

    if (formData.password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      );

      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match.");

      return;
    }

    setLoading(true);

    try {
      /*-------------------------------------------------
            Build Multipart Request

            Only fields relevant to the selected account type
            are submitted.

            IMPORTANT:
            Do NOT manually set Content-Type here.

            The browser/Axios must generate the multipart
            boundary automatically.
            -------------------------------------------------*/

      const payload = new FormData();

      payload.append("full_name", fullName);

      payload.append("email", email);

      payload.append("password", formData.password);

      payload.append("confirm_password", formData.confirm_password);

      payload.append("role", role);

      if (formData.profileImage) {
        payload.append("profileImage", formData.profileImage);
      }

      /*=================================================
            CREATOR
            =================================================*/

      if (role === "creator") {
        payload.append("company_name", formData.company_name.trim());

        payload.append(
          "preferred_category",
          formData.preferred_category.trim(),
        );
      }

      /*=================================================
            DESIGNER
            =================================================*/

      if (role === "designer") {
        payload.append("portfolio_url", formData.portfolio_url.trim());

        payload.append("bio", formData.bio.trim());

        payload.append("address_line", formData.address_line.trim());

        payload.append("city", formData.city.trim());

        payload.append("country", formData.country.trim());
      }

      const { data } = await API.post("/auth/register", payload);

      /*-------------------------------------------------
            Validate Backend Response
            -------------------------------------------------*/

      if (data?.status !== "success") {
        throw new Error("Invalid registration response.");
      }

      /*
            Store the normalized email before navigation.

            VerifyOTP also receives navigation state, but
            sessionStorage allows the verification page to
            survive a hard browser refresh.
            */

      sessionStorage.setItem("pending_verification_email", email);

      navigate("/verify-otp", {
        replace: true,

        state: {
          email,
        },
      });
    } catch (err) {
      const status = err.response?.status;

      const responseData = err.response?.data;

      const code = responseData?.code;

      const backendMessage = responseData?.message;

      /*-------------------------------------------------
            Registration Rate Limit
            -------------------------------------------------*/

      if (status === 429 || code === "REGISTER_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many registration attempts. Please wait before trying again.",
        );

        return;
      }

      /*-------------------------------------------------
            Existing Account
            -------------------------------------------------*/

      if (status === 409) {
        setError(
          backendMessage || "An account with this email already exists.",
        );

        return;
      }

      /*-------------------------------------------------
            Validation Failure
            -------------------------------------------------*/

      if (status === 400) {
        setError(
          backendMessage || "Please check your registration information.",
        );

        return;
      }

      /*-------------------------------------------------
            Network Error
            -------------------------------------------------*/

      if (!err.response) {
        setError(
          "Unable to connect to the server. Please check your connection and try again.",
        );

        return;
      }

      if (import.meta.env.DEV) {
        console.error("Registration failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }

      setError(backendMessage || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /*=====================================================
    Render
    =====================================================*/

  return (
    <AuthLayout
      title="Create an Account"
      subtitle="Join our exclusive community of designers and creators."
      step="01"
    >
      <form
        onSubmit={handleRegister}
        className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar"
        noValidate
      >
        {/*=========================================
                Role Selection
                =========================================*/}

        <div className="flex gap-4 mb-6">
          {ALLOWED_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              disabled={loading}
              onClick={() => handleRoleChange(role)}
              className={`flex-1 py-2 rounded-xl border-2 transition-all capitalize font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                formData.role === role
                  ? "border-[#D4AF37] bg-[#D4AF37]/5 text-[#D4AF37]"
                  : "border-gray-100 text-gray-400 hover:border-gray-200"
              }`}
              aria-pressed={formData.role === role}
            >
              {role}
            </button>
          ))}
        </div>

        {/*=========================================
                Profile Image
                =========================================*/}

        <div className="flex flex-col items-center justify-center mb-6">
          <label className="relative cursor-pointer group">
            <div className="w-24 h-24 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group-hover:border-[#D4AF37] transition-all">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Profile preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera
                  className="text-gray-300 group-hover:text-[#D4AF37]"
                  size={32}
                  aria-hidden="true"
                />
              )}
            </div>

            <input
              type="file"
              name="profileImage"
              onChange={handleProfileImage}
              disabled={loading}
              className="hidden"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            />

            <div className="absolute bottom-0 right-0 p-1.5 bg-[#1A1A1A] rounded-full text-white shadow-lg">
              <FileText size={12} aria-hidden="true" />
            </div>
          </label>

          <span className="text-[10px] text-gray-400 mt-2 uppercase tracking-widest font-bold">
            Upload Portrait
          </span>

          <span className="text-[10px] text-gray-300 mt-1">
            JPG or PNG · Max 5 MB
          </span>
        </div>

        {/*=========================================
                Basic Information
                =========================================*/}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <User
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              name="full_name"
              type="text"
              placeholder="Full Name"
              value={formData.full_name}
              onChange={handleChange}
              disabled={loading}
              autoComplete="name"
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              required
            />
          </div>

          <div className="relative">
            <Mail
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              name="email"
              type="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              autoComplete="email"
              inputMode="email"
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              required
            />
          </div>
        </div>

        {/*=========================================
                Passwords
                =========================================*/}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Lock
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              name="password"
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              required
            />
          </div>

          <div className="relative">
            <Lock
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              name="confirm_password"
              type="password"
              placeholder="Confirm Password"
              value={formData.confirm_password}
              onChange={handleChange}
              disabled={loading}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              required
            />
          </div>
        </div>

        <p className="text-[10px] text-gray-400 px-1">
          Password must contain at least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {/*=========================================
                Creator Fields
                =========================================*/}

        {formData.role === "creator" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="relative">
              <Building
                className="absolute left-4 top-3.5 text-gray-400"
                size={18}
                aria-hidden="true"
              />

              <input
                name="company_name"
                type="text"
                placeholder="Company Name"
                value={formData.company_name}
                onChange={handleChange}
                disabled={loading}
                autoComplete="organization"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />
            </div>

            <div className="relative">
              <Briefcase
                className="absolute left-4 top-3.5 text-gray-400"
                size={18}
                aria-hidden="true"
              />

              <input
                name="preferred_category"
                type="text"
                placeholder="Preferred Category (e.g., Fashion, Tech)"
                value={formData.preferred_category}
                onChange={handleChange}
                disabled={loading}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />
            </div>
          </div>
        )}

        {/*=========================================
                Designer Fields
                =========================================*/}

        {formData.role === "designer" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="relative">
              <Globe
                className="absolute left-4 top-3.5 text-gray-400"
                size={18}
                aria-hidden="true"
              />

              <input
                name="portfolio_url"
                type="url"
                placeholder="Portfolio URL (e.g., Behance, Dribbble)"
                value={formData.portfolio_url}
                onChange={handleChange}
                disabled={loading}
                autoComplete="url"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />
            </div>

            <div className="relative">
              <Briefcase
                className="absolute left-4 top-3.5 text-gray-400"
                size={18}
                aria-hidden="true"
              />

              <input
                name="address_line"
                type="text"
                placeholder="Street Address"
                value={formData.address_line}
                onChange={handleChange}
                disabled={loading}
                autoComplete="street-address"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                name="city"
                type="text"
                placeholder="City"
                value={formData.city}
                onChange={handleChange}
                disabled={loading}
                autoComplete="address-level2"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />

              <input
                name="country"
                type="text"
                placeholder="Country"
                value={formData.country}
                onChange={handleChange}
                disabled={loading}
                autoComplete="country-name"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] disabled:opacity-60"
              />
            </div>

            <textarea
              name="bio"
              placeholder="Brief Professional Bio"
              value={formData.bio}
              onChange={handleChange}
              disabled={loading}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] resize-none disabled:opacity-60"
            />
          </div>
        )}

        {/*=========================================
                Error
                =========================================*/}

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl text-center font-medium animate-in fade-in zoom-in duration-300"
          >
            {error}
          </div>
        )}

        {/*=========================================
                Submit
                =========================================*/}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl font-semibold tracking-wide hover:bg-black transition-all shadow-lg shadow-black/10 flex justify-center items-center gap-2 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} aria-hidden="true" />

              <span>Creating Account...</span>
            </>
          ) : (
            "Request Access"
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Register;
