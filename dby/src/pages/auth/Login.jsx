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
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthField, AuthNotice, AuthSubmit } from "./AuthFields";
import { validEmail, saveSession } from "./authFlow";
import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";
import { useAuth } from "../../context/AuthContext.helpers.js";
/*=========================================================
Login
=========================================================*/

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);


  const [error, setError] = useState(() => sessionStorage.getItem("session-ended") || "");
  const [formData, setFormData] = useState({
    email: location.state?.email || "",
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
  Recover an unfinished email verification.
  Password is not required to request a code, and the
  backend deliberately returns the same success message
  for unknown, verified and unverified email addresses.
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
    if (!validEmail(email)) {
      setError("Enter a valid email address.");
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
      saveSession("pending_verification_email", "");
      saveSession("pending_verification_login", "");
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
        saveSession("pending_verification_email", email);
        saveSession("pending_verification_login", JSON.stringify({ email, token: responseData.login_challenge || "" }));
        let message = "A verification code has been requested. Check your inbox and spam folder.";
        let codeRequested = false;
        try {
          const resend = await API.post("/auth/resend-otp", { email });
          if (resend.data?.status !== "success") throw new Error("Code request failed");
          codeRequested = true;
        } catch (resendError) {
          message = resendError.response?.data?.message || "We couldn’t request a code. Use Resend code below to try again.";
        }
        navigate("/verify-otp", {
          replace: true,
          state: {
            email,
            reason: "EMAIL_NOT_VERIFIED",
            codeRequested,
            message,
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
    <AuthLayout title="Sign in" subtitle="Continue to your designs and bookings.">
      <form onSubmit={handleLogin} className="auth-form" noValidate aria-busy={loading}>
        <AuthNotice>{location.state?.message}</AuthNotice>
        <AuthField id="login-email" label="Email address" name="email" type="email" value={formData.email}
          onChange={handleChange} autoComplete="email" inputMode="email" placeholder="you@example.com" required disabled={loading} />
        <AuthField id="login-password" label="Password" name="password" type="password" value={formData.password}
          onChange={handleChange} autoComplete="current-password" required disabled={loading}
          action={<Link className="auth-link" to="/forgot-password" state={{ email: formData.email }}>Forgot password?</Link>} />
        <AuthNotice error>{error}</AuthNotice>
        <AuthSubmit busy={loading} busyLabel="Signing in…">Sign in</AuthSubmit>
        <p className="auth-divider">New to DesignByYou? <Link to="/register" className="auth-link">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
};
export default Login;
