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

import { AuthField, AuthNotice, AuthSubmit } from "./AuthFields";
import { validEmail, passwordError, readSession, saveSession } from "./authFlow";

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

  const storedEmail = readSession("pending_password_reset_email");

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

      saveSession("pending_password_reset_email", normalizedEmail);

      setFormData((current) => ({
        ...current,

        email: normalizedEmail,
      }));
    }
  }, [navigationEmail]);

  /*=====================================================
    Redirect After Success
    =====================================================*/



  /*=====================================================
    Input Change
    =====================================================*/

  const handleChange = (event) => {
    const { name, value } = event.target;

    let nextValue = value;
    if (name === "email") {
      saveSession("pending_password_reset_email", value.trim().toLowerCase());
      navigate(location.pathname + location.search, { replace: true, state: { ...location.state, email: value } });
    }

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

    if (!validEmail(email)) {
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

    const issue = passwordError(newPassword);
    if (issue) { setError(issue); return; }
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

      saveSession("pending_password_reset_email", "");

      /*
            Password reset increments token_version on the
            backend.

            Any existing browser JWT is now stale/revoked.

            Remove it immediately instead of waiting for a
            future API request to discover SESSION_REVOKED.
            */

      try { localStorage.removeItem("token");

      localStorage.removeItem("user"); } catch { /* AuthContext is also notified below. */ }

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

  if (success) return <AuthLayout title="Password updated" subtitle="Sign in with your new password.">
    <div className="auth-stack"><AuthNotice>Your password has been changed. Previous sessions are no longer valid.</AuthNotice>
      <Link to="/login" replace state={{ email: formData.email }} className="auth-button">Continue to sign in</Link></div>
  </AuthLayout>;
  return <AuthLayout title="Reset your password" subtitle="Enter your reset code and choose a new password.">
    <form onSubmit={handleReset} className="auth-form" noValidate aria-busy={loading}>
      <p className="auth-help">If an account uses this email, a code was requested. Use the latest code from your inbox or spam folder.</p>
      <AuthField id="reset-email" label="Email address" name="email" type="email" value={formData.email} onChange={handleChange} autoComplete="email" inputMode="email" required disabled={loading} />
      <AuthField id="reset-code" label="Reset code" name="otp" value={formData.otp} onChange={handleChange} onPaste={event => { event.preventDefault(); const otp = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); setFormData(current => ({ ...current, otp })); setError(""); }} autoComplete="one-time-code" inputMode="numeric" maxLength={6} className="auth-code" hint="Enter the six-digit code. Codes expire after 10 minutes." required disabled={loading} />
      <AuthField id="reset-password" label="New password" name="newPassword" type="password" value={formData.newPassword} onChange={handleChange} autoComplete="new-password" hint="Use at least 8 characters and a password you haven’t used for this account." required disabled={loading} />
      <AuthField id="reset-confirm" label="Confirm new password" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} autoComplete="new-password" required disabled={loading} />
      <AuthNotice error>{error}</AuthNotice>
      <AuthSubmit busy={loading} busyLabel="Updating password…">Reset password</AuthSubmit>
      <div className="auth-row"><Link to="/forgot-password" state={{ email: formData.email }} className="auth-link">Request a new code</Link><Link to="/login" state={{ email: formData.email }} className="auth-link">Back to sign in</Link></div>
    </form>
  </AuthLayout>;
};
export default ResetPassword;
