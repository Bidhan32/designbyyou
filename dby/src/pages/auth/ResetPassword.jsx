"use strict";

/*
=========================================================
DesignByYou Reset Password Page
OTP Password Recovery
Version 2.0
=========================================================
*/

import React, { useEffect, useState } from "react";

import { Link, useLocation, useNavigate } from "react-router-dom";

import { CheckCircle2, Hash, Loader2, Lock, Mail } from "lucide-react";

import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";

/*=========================================================
Configuration
=========================================================*/

const MIN_PASSWORD_LENGTH = 8;

const MAX_PASSWORD_LENGTH = 128;

/*=========================================================
Reset Password
=========================================================*/

const ResetPassword = () => {
  const location = useLocation();

  const navigate = useNavigate();

  /*=====================================================
    Resolve Email

    Navigation state is preferred.

    sessionStorage allows this page to survive a hard
    browser refresh.
    =====================================================*/

  const navigationEmail = location.state?.email;

  const storedEmail = sessionStorage.getItem("pending_password_reset_email");

  const initialEmail = String(navigationEmail || storedEmail || "")
    .trim()
    .toLowerCase();

  const [formData, setFormData] = useState({
    email: initialEmail,

    otp: "",

    newPassword: "",

    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  /*=====================================================
    Persist Password Reset Email
    =====================================================*/

  useEffect(() => {
    if (navigationEmail) {
      const normalizedEmail = String(navigationEmail).trim().toLowerCase();

      sessionStorage.setItem("pending_password_reset_email", normalizedEmail);

      setFormData((current) => ({
        ...current,

        email: normalizedEmail,
      }));
    }
  }, [navigationEmail]);

  /*=====================================================
    Redirect After Success
    =====================================================*/

  useEffect(() => {
    if (!success) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      navigate("/login", {
        replace: true,
      });
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [success, navigate]);

  /*=====================================================
    Input Change
    =====================================================*/

  const handleChange = (event) => {
    const { name, value } = event.target;

    let nextValue = value;

    /*
        OTP is strictly six numeric digits.
        */

    if (name === "otp") {
      nextValue = value.replace(/\D/g, "").slice(0, 6);
    }

    setFormData((current) => ({
      ...current,

      [name]: nextValue,
    }));

    if (error) {
      setError("");
    }
  };

  /*=====================================================
    Reset Password
    =====================================================*/

  const handleReset = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    const email = formData.email.trim().toLowerCase();

    const otp = formData.otp.trim();

    const newPassword = formData.newPassword;

    /*-------------------------------------------------
        Email
        -------------------------------------------------*/

    if (!email) {
      setError("Please enter the email address used for the password reset.");

      return;
    }

    /*-------------------------------------------------
        OTP
        -------------------------------------------------*/

    if (!/^\d{6}$/.test(otp)) {
      setError("Please enter the 6-digit reset code.");

      return;
    }

    /*-------------------------------------------------
        Password Length

        Matches backend:
        minimum 8
        maximum 128
        -------------------------------------------------*/

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      );

      return;
    }

    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`);

      return;
    }

    /*-------------------------------------------------
        Password Confirmation
        -------------------------------------------------*/

    if (newPassword !== formData.confirmPassword) {
      setError("Passwords do not match.");

      return;
    }

    setLoading(true);

    try {
      const { data } = await API.post("/auth/reset-password", {
        email,
        otp,
        newPassword,
      });

      if (data?.status !== "success") {
        throw new Error("Invalid password reset response.");
      }

      /*-------------------------------------------------
            Clear Reset State
            -------------------------------------------------*/

      sessionStorage.removeItem("pending_password_reset_email");

      /*
            Password reset increments token_version on the
            backend.

            Any existing browser JWT is now stale/revoked.

            Remove it immediately instead of waiting for a
            future API request to discover SESSION_REVOKED.
            */

      localStorage.removeItem("token");

      localStorage.removeItem("user");

      /*
            Keep AuthContext synchronized without importing
            it directly.

            AuthContext listens for this event.
            */

      window.dispatchEvent(
        new CustomEvent("auth:session-invalidated", {
          detail: {
            code: "PASSWORD_RESET",

            message: "Password changed successfully.",
          },
        }),
      );

      setSuccess(true);
    } catch (err) {
      const status = err.response?.status;

      const code = err.response?.data?.code;

      const backendMessage = err.response?.data?.message;

      /*-------------------------------------------------
            Reset Attempt Rate Limit
            -------------------------------------------------*/

      if (status === 429 || code === "PASSWORD_RESET_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many password-reset attempts. Please wait before trying again.",
        );

        return;
      }

      /*-------------------------------------------------
            Invalid / Expired OTP or Password Validation
            -------------------------------------------------*/

      if (status === 400) {
        setError(backendMessage || "Invalid or expired reset code.");

        return;
      }

      /*-------------------------------------------------
            Network Failure
            -------------------------------------------------*/

      if (!err.response) {
        setError(
          "Unable to connect to the server. Please check your connection and try again.",
        );

        return;
      }

      if (import.meta.env.DEV) {
        console.error("Password reset failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }

      setError(backendMessage || "Password reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /*=====================================================
    Success Screen
    =====================================================*/

  if (success) {
    return (
      <AuthLayout title="Password Reset" subtitle="Access restored.">
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle2
            className="text-green-500 mb-4"
            size={50}
            aria-hidden="true"
          />

          <p className="text-sm font-medium text-gray-600">
            Password updated successfully. Redirecting to sign in...
          </p>
        </div>
      </AuthLayout>
    );
  }

  /*=====================================================
    Reset Form
    =====================================================*/

  return (
    <AuthLayout
      title="Finalize Reset"
      subtitle="Enter the code sent to your email and choose a new password."
    >
      <form onSubmit={handleReset} className="space-y-4" noValidate>
        {/*=========================================
                Email

                Unlike the old hidden-only field, this is
                visible so the flow remains recoverable if
                router/session state is missing.
                =========================================*/}

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
            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
            required
          />
        </div>

        {/*=========================================
                OTP
                =========================================*/}

        <div className="relative">
          <Hash
            className="absolute left-4 top-3.5 text-gray-400"
            size={18}
            aria-hidden="true"
          />

          <input
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-Digit Reset Code"
            value={formData.otp}
            onChange={handleChange}
            disabled={loading}
            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
            required
          />
        </div>

        {/*=========================================
                New Password
                =========================================*/}

        <div className="relative">
          <Lock
            className="absolute left-4 top-3.5 text-gray-400"
            size={18}
            aria-hidden="true"
          />

          <input
            name="newPassword"
            type="password"
            placeholder="New Password"
            value={formData.newPassword}
            onChange={handleChange}
            disabled={loading}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
            required
          />
        </div>

        {/*=========================================
                Confirm Password
                =========================================*/}

        <div className="relative">
          <Lock
            className="absolute left-4 top-3.5 text-gray-400"
            size={18}
            aria-hidden="true"
          />

          <input
            name="confirmPassword"
            type="password"
            placeholder="Confirm New Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            disabled={loading}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
            required
          />
        </div>

        <p className="text-[10px] text-gray-400 px-1">
          Your new password must contain at least {MIN_PASSWORD_LENGTH}{" "}
          characters.
        </p>

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
          className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-black/5 flex justify-center items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} aria-hidden="true" />

              <span>Updating Password...</span>
            </>
          ) : (
            "Save New Password"
          )}
        </button>

        {/*=========================================
                Recovery Links
                =========================================*/}

        <div className="text-center space-y-3 pt-2">
          <Link
            to="/forgot-password"
            className="block text-xs text-[#D4AF37] hover:underline font-medium"
          >
            Request a new reset code
          </Link>

          <Link
            to="/login"
            className="block text-xs text-gray-400 hover:text-black transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
