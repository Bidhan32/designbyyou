"use strict";

/*
=========================================================
DesignByYou Login Page
Authentication, Email Verification & Role Redirect
Version 2.1
=========================================================

Version 2.1:

- Creator email verification is enforced by the backend.
- EMAIL_NOT_VERIFIED redirects only that specific case
  to /verify-otp.
- Does NOT incorrectly redirect every HTTP 403 response
  to OTP verification.
- Preserves pending Designer login behavior.
- Preserves Creator, Designer and Superadmin redirects.
=========================================================
*/

import React, { useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

import API from "../../api/axios";

import AuthLayout from "../../Layouts/AuthLayout";

import { useAuth } from "../../context/AuthContext";

/*=========================================================
Login
=========================================================*/

const Login = () => {
  const navigate = useNavigate();

  const { login } = useAuth();

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  /*=====================================================
  Input Change
  =====================================================*/

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  /*=====================================================
  Login
  =====================================================*/

  const handleLogin = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    const email = formData.email.trim().toLowerCase();

    const password = formData.password;

    /*-------------------------------------------------
    Basic Validation
    -------------------------------------------------*/

    if (!email) {
      setError("Please enter your email address.");

      return;
    }

    if (!password) {
      setError("Please enter your password.");

      return;
    }

    setLoading(true);

    setError("");

    try {
      const { data } = await API.post("/auth/login", {
        email,
        password,
      });

      /*-------------------------------------------------
      Validate Login Response
      -------------------------------------------------*/

      if (data?.status !== "success" || !data?.token || !data?.user) {
        throw new Error("Invalid login response.");
      }

      /*-------------------------------------------------
      Save Authentication

      AuthContext stores:

      - JWT token
      - current user
      -------------------------------------------------*/

      login(data.user, data.token);

      /*-------------------------------------------------
      Clear Verification Trace

      A successful login means the account passed all
      login-level verification requirements.
      -------------------------------------------------*/

      sessionStorage.removeItem("pending_verification_email");

      /*-------------------------------------------------
      Role Redirect

      CREATOR:
      - Backend already guarantees verified email before
        a Creator reaches this point.

      DESIGNER:
      - Pending Designers may still sign in.
      - Approval-sensitive actions are protected by
        backend authorization middleware.

      SUPERADMIN:
      - Redirect directly to Superadmin dashboard.
      -------------------------------------------------*/

      const role = String(data.user.role || "")
        .trim()
        .toLowerCase();

      if (role === "creator") {
        navigate("/creator/showcase", {
          replace: true,
        });

        return;
      }

      if (role === "designer") {
        navigate("/designer/explore", {
          replace: true,
        });

        return;
      }

      if (role === "superadmin") {
        navigate("/superadmin/dashboard", {
          replace: true,
        });

        return;
      }

      navigate("/unauthorized", {
        replace: true,
      });
    } catch (err) {
      const status = err.response?.status;

      const responseData = err.response?.data;

      const code = String(responseData?.code || "")
        .trim()
        .toUpperCase();

      const backendMessage = responseData?.message;

      /*-------------------------------------------------
      Email Verification Required

      IMPORTANT:

      Only this explicit backend code redirects the user
      to OTP verification.

      Never redirect every HTTP 403 to /verify-otp.
      -------------------------------------------------*/

      if (status === 403 && code === "EMAIL_NOT_VERIFIED") {
        /*
        Keep the email available if the user refreshes
        the verification page.
        */

        sessionStorage.setItem("pending_verification_email", email);

        navigate("/verify-otp", {
          replace: true,

          state: {
            email,

            reason: "EMAIL_NOT_VERIFIED",

            message:
              backendMessage || "Please verify your email before signing in.",
          },
        });

        return;
      }

      /*-------------------------------------------------
      Login Rate Limit
      -------------------------------------------------*/

      if (status === 429 || code === "LOGIN_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many sign-in attempts. Please wait before trying again.",
        );

        return;
      }

      /*-------------------------------------------------
      Invalid Credentials
      -------------------------------------------------*/

      if (status === 401) {
        setError(backendMessage || "Invalid email or password.");

        return;
      }

      /*-------------------------------------------------
      Forbidden Account

      Other HTTP 403 responses must NOT be mistaken for
      email verification.

      Examples may include:

      - FORBIDDEN
      - ACCOUNT_PENDING_APPROVAL
      - ACCOUNT_REJECTED
      - ACCOUNT_SUSPENDED
      -------------------------------------------------*/

      if (status === 403) {
        setError(
          backendMessage || "This account cannot access the application.",
        );

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

      /*-------------------------------------------------
      Development Logging
      -------------------------------------------------*/

      if (import.meta.env.DEV) {
        console.error("Login failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }

      /*-------------------------------------------------
      Generic Failure
      -------------------------------------------------*/

      setError(backendMessage || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /*=====================================================
  Render
  =====================================================*/

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Access your design studio and the global marketplace."
    >
      <form onSubmit={handleLogin} className="space-y-6" noValidate>
        {/*=========================================
        Email
        =========================================*/}

        <div className="space-y-1">
          <label
            htmlFor="login-email"
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
              id="login-email"
              name="email"
              type="email"
              value={formData.email}
              placeholder="couture@designbyyou.com"
              autoComplete="email"
              inputMode="email"
              onChange={handleChange}
              disabled={loading}
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
              required
            />
          </div>
        </div>

        {/*=========================================
        Password
        =========================================*/}

        <div className="space-y-1">
          <div className="flex justify-between items-end mb-1">
            <label
              htmlFor="login-password"
              className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 ml-1"
            >
              Password
            </label>

            <Link
              to="/forgot-password"
              className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] hover:underline"
            >
              Forgot?
            </Link>
          </div>

          <div className="relative">
            <Lock
              className="absolute left-4 top-3.5 text-gray-400"
              size={18}
              aria-hidden="true"
            />

            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              placeholder="••••••••"
              autoComplete="current-password"
              onChange={handleChange}
              disabled={loading}
              className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all disabled:opacity-60"
              required
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              disabled={loading}
              className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

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
          className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-semibold tracking-wide hover:bg-black transition-all shadow-xl shadow-black/5 flex justify-center items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} aria-hidden="true" />

              <span>Signing In...</span>
            </>
          ) : (
            "Sign In to Studio"
          )}
        </button>

        {/*=========================================
        Registration
        =========================================*/}

        <div className="text-center pt-6 border-t border-gray-50">
          <p className="text-sm text-gray-500">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-[#D4AF37] font-bold hover:underline"
            >
              Join the Atelier
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Login;
