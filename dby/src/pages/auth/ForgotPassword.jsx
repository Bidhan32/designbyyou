"use strict";

/*
=========================================================
DesignByYou Forgot Password Page
Password Reset Request
Version 2.0
=========================================================
*/

import React, { useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { ArrowRight, Loader2, Mail } from "lucide-react";

import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";

/*=========================================================
Forgot Password
=========================================================*/

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");

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

    if (!normalizedEmail) {
      setError("Please enter your email address.");

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

      sessionStorage.setItem("pending_password_reset_email", normalizedEmail);

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

  return (
    <AuthLayout
      title="Lost your way?"
      subtitle="Enter your email and we'll send a 6-digit password reset code."
    >
      <form onSubmit={handleRequestOTP} className="space-y-6" noValidate>
        {/*=========================================
                Email
                =========================================*/}

        <div className="space-y-1">
          <label
            htmlFor="forgot-password-email"
            className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 ml-1"
          >
            Email Address
          </label>

          <div className="relative">
            <Mail
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              id="forgot-password-email"
              type="email"
              value={email}
              placeholder="couture@designbyyou.com"
              autoComplete="email"
              inputMode="email"
              disabled={loading}
              onChange={(event) => {
                setEmail(event.target.value);

                if (error) {
                  setError("");
                }
              }}
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
              required
            />
          </div>
        </div>

        {/*=========================================
                Privacy-Safe Explanation
                =========================================*/}

        <p className="text-xs text-gray-400 leading-relaxed text-center">
          If an account exists for this email, you'll receive a reset code
          shortly.
        </p>

        {/*=========================================
                Error
                =========================================*/}

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl text-center font-medium"
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
          className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-semibold hover:bg-black transition-all flex justify-center items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} aria-hidden="true" />

              <span>Sending...</span>
            </>
          ) : (
            <>
              Send Code
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>

        {/*=========================================
                Back To Login
                =========================================*/}

        <div className="text-center pt-2">
          <Link
            to="/login"
            className="text-xs text-gray-400 hover:text-[#D4AF37] font-medium transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
