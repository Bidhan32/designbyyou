"use strict";
/*
=========================================================
DesignByYou Registration Page
Creator & Designer Registration
Version 2.1 - Resume verification for existing email
=========================================================
*/
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthField, AuthNotice, AuthSubmit } from "./AuthFields";
import { validEmail, passwordError } from "./authFlow";
import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";
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
  const [existingEmail, setExistingEmail] = useState("");
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
    if (name === "email") setExistingEmail("");
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
    Resume an existing registration without creating a
    duplicate account or sending an OTP automatically.
    The Verify page supports entering/correcting this email.
    =====================================================*/
  const handleContinueVerification = () => {
    if (loading) return;
    const email = String(existingEmail || formData.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter your registered email address first.");
      return;
    }
    try {
      sessionStorage.setItem("pending_verification_email", email);
    } catch {
      // Router state still carries the email when storage is unavailable.
    }
    navigate("/verify-otp", {
      state: {
        email,
        message:
          "If you have not verified this email yet, enter the latest code or request a new one below.",
      },
    });
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
    setExistingEmail("");
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
    if (!validEmail(email)) { setError("Enter a valid email address."); return; }
    const passwordIssue = passwordError(formData.password);
    if (passwordIssue) { setError(passwordIssue); return; }
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
      try {
        sessionStorage.setItem("pending_verification_email", email);
      } catch {
        // Navigation state will still carry the email.
      }
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
        setExistingEmail(email);
        setError(
          backendMessage ||
            "This email is already registered. Sign in, or continue email verification if you did not finish registration.",
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
  return <AuthLayout title="Create an account" subtitle="Choose how you want to use DesignByYou." step="1 of 2 · Account details">
    <form onSubmit={handleRegister} className="auth-form" noValidate aria-busy={loading}>
      <fieldset className="auth-roles" disabled={loading}><legend>I want to…</legend>
        <div className="auth-role-options">{ALLOWED_ROLES.map(role => <label className="auth-role" key={role}>
          <input type="radio" name="role" value={role} checked={formData.role === role} onChange={() => handleRoleChange(role)} />
          <strong>{role === "creator" ? "Create" : "Design for clients"}</strong>
          <span>{role === "creator" ? "Make designs and work with designers." : "Share a portfolio and accept bookings."}</span>
        </label>)}</div>
      </fieldset>
      {formData.role === "designer" && <p className="auth-help">Verify your email after signing up. Your designer account also needs approval before you can accept paid work.</p>}
      <AuthField id="register-name" label="Full name" name="full_name" value={formData.full_name} onChange={handleChange} autoComplete="name" maxLength={150} required disabled={loading} />
      <AuthField id="register-email" label="Email address" name="email" type="email" value={formData.email} onChange={handleChange} autoComplete="email" inputMode="email" placeholder="you@example.com" required disabled={loading} />
      <AuthField id="register-password" label="Password" name="password" type="password" value={formData.password} onChange={handleChange} autoComplete="new-password" hint="Use at least 8 characters. Longer passwords with uncommon words are easier to remember." required disabled={loading} />
      <AuthField id="register-confirm" label="Confirm password" name="confirm_password" type="password" value={formData.confirm_password} onChange={handleChange} autoComplete="new-password" required disabled={loading} />
      <details className="auth-details"><summary>Profile details (optional)</summary><div className="auth-stack">
        <p className="auth-help">You can add these now or complete your profile later.</p>
        <AuthField id="register-photo" label="Profile photo" type="file" name="profileImage" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleProfileImage} disabled={loading} hint="JPG or PNG, up to 5 MB." />
        {imagePreview && <img src={imagePreview} className="auth-preview" alt="Selected profile photo" />}
        {formData.role === "creator" ? <>
          <AuthField id="register-company" label="Company or brand" name="company_name" value={formData.company_name} onChange={handleChange} autoComplete="organization" disabled={loading} />
          <AuthField id="register-category" label="Design interests" name="preferred_category" value={formData.preferred_category} onChange={handleChange} placeholder="For example, streetwear" disabled={loading} />
        </> : <>
          <AuthField id="register-portfolio" label="Portfolio link" name="portfolio_url" type="url" value={formData.portfolio_url} onChange={handleChange} autoComplete="url" placeholder="https://" disabled={loading} />
          <AuthField id="register-address" label="Street address" name="address_line" value={formData.address_line} onChange={handleChange} autoComplete="street-address" disabled={loading} />
          <AuthField id="register-city" label="City" name="city" value={formData.city} onChange={handleChange} autoComplete="address-level2" disabled={loading} />
          <AuthField id="register-country" label="Country" name="country" value={formData.country} onChange={handleChange} autoComplete="country-name" disabled={loading} />
          <div className="auth-field"><label htmlFor="register-bio">About your work</label><textarea id="register-bio" name="bio" rows={3} className="auth-control" value={formData.bio} onChange={handleChange} disabled={loading} /></div>
        </>}
      </div></details>
      <AuthNotice error>{error}</AuthNotice>
      {existingEmail && <div className="auth-stack"><p className="auth-help">Already registered? Sign in, or finish verifying your email.</p>
        <div className="auth-row"><Link to="/login" state={{ email: existingEmail }} className="auth-link">Sign in</Link><button type="button" className="auth-link" disabled={loading} onClick={handleContinueVerification}>Verify email</button></div>
      </div>}
      <AuthSubmit busy={loading} busyLabel="Creating account…">Create account</AuthSubmit>
      <p className="auth-help">Next, enter the verification code sent to your email.</p>
      <p className="auth-divider">Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
    </form>
  </AuthLayout>;
};
export default Register;
