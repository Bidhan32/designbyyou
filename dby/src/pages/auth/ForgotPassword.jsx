"use strict";

/*
=========================================================
DesignByYou Forgot Password Page
Password Reset Request
Version 2.0
=========================================================
*/

import React, { useState } from "react";

import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthField, AuthNotice, AuthSubmit } from "./AuthFields";
import { validEmail, saveSession } from "./authFlow";

import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";

/*=========================================================
Forgot Password
=========================================================*/

const ForgotPassword = () => {
  const navigate = useNavigate();

  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  /*=====================================================
    Request Reset OTP
    =====================================================*/

  const handleRequestOTP = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!validEmail(normalizedEmail)) {
      setError("Enter a valid email address.");

      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await API.post("/auth/forgot-password", {
        email: normalizedEmail,
      });

      /*
            The backend intentionally returns a generic
            response regardless of whether the account
            exists.

            Never show "email not found" here.
            */

      if (data?.status !== "success") {
        throw new Error("Invalid password reset response.");
      }

      /*
            Preserve the email across:

            - navigation
            - hard refresh
            - accidental reload on reset page
            */

      saveSession("pending_password_reset_email", normalizedEmail);

      navigate("/reset-password", {
        replace: false,

        state: {
          email: normalizedEmail,
        },
      });
    } catch (err) {
      const status = err.response?.status;

      const code = err.response?.data?.code;

      const backendMessage = err.response?.data?.message;

      /*-------------------------------------------------
            Rate Limited
            -------------------------------------------------*/

      if (status === 429 || code === "PASSWORD_RESET_REQUEST_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many password-reset requests. Please wait before trying again.",
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
        console.error("Forgot password request failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }

      /*
            Keep the message generic.

            Do not reveal whether the email belongs to an
            existing account.
            */

      setError(
        "Unable to process the password reset request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  /*=====================================================
    Render
    =====================================================*/

  return <AuthLayout title="Forgot password?" subtitle="Enter your email to request a reset code.">
    <form onSubmit={handleRequestOTP} className="auth-form" noValidate aria-busy={loading}>
      <AuthField id="forgot-email" label="Email address" type="email" value={email} name="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required disabled={loading} onChange={event => { setEmail(event.target.value); setError(""); }} />
      <AuthNotice error>{error}</AuthNotice>
      <AuthSubmit busy={loading} busyLabel="Requesting code…">Send reset code</AuthSubmit>
      <p className="auth-help">If an account uses this email, you’ll receive a six-digit code. Check your spam folder too.</p>
      <p className="auth-divider"><Link to="/login" state={{ email }} className="auth-link">Back to sign in</Link></p>
    </form>
  </AuthLayout>;
};
export default ForgotPassword;
