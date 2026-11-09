"use strict";
/*
=========================================================
DesignByYou Verify OTP Page
Email Verification
Version 2.1 - Recover missing registration email
=========================================================
*/
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";
/*=========================================================
Configuration
=========================================================*/
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const PENDING_EMAIL_KEY = "pending_verification_email";
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

function readStoredEmail() {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function saveStoredEmail(value) {
  try {
    if (value) sessionStorage.setItem(PENDING_EMAIL_KEY, value);
    else sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Recovery still works without sessionStorage.
  }
}

/*=========================================================
Verify OTP
=========================================================*/
const VerifyOTP = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationEmail = location.state?.email;
  const [email, setEmail] = useState(() =>
    normalizeEmail(navigationEmail || readStoredEmail()),
  );
  const inputRefs = useRef([]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  /*=====================================================
    Keep incoming registration/login email after navigation.
    Direct visits work too: the user can type their email.
    =====================================================*/
  useEffect(() => {
    if (!navigationEmail) return;
    const nextEmail = normalizeEmail(navigationEmail);
    const restoredEmail = normalizeEmail(readStoredEmail());
    // After manually correcting an email, respect it on a page refresh.
    if (restoredEmail && restoredEmail !== nextEmail) return;
    setEmail(nextEmail);
    setOtp(Array(OTP_LENGTH).fill(""));
    saveStoredEmail(nextEmail);
  }, [navigationEmail]);

  const handleEmailChange = (event) => {
    const nextEmail = event.target.value;
    setEmail(nextEmail);
    setOtp(Array(OTP_LENGTH).fill(""));
    clearMessages();
    saveStoredEmail(normalizeEmail(nextEmail));
  };
  /*=====================================================
    Resend Cooldown Timer
    =====================================================*/
  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [resendCooldown]);
  /*=====================================================
    Helpers
    =====================================================*/
  const clearSessionEmail = () => {
    saveStoredEmail("");
  };
  const focusInput = (index) => {
    inputRefs.current[index]?.focus();
  };
  const clearMessages = () => {
    setError("");
    setSuccessMessage("");
  };
  /*=====================================================
    Handle Single OTP Digit
    =====================================================*/
  const handleChange = (event, index) => {
    clearMessages();
    /*
        Strip all non-numeric characters.
        This also handles some mobile keyboards that may
        insert unexpected text.
        */
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) {
      setOtp((current) => {
        const updated = [...current];
        updated[index] = "";
        return updated;
      });
      return;
    }
    /*
        If multiple digits arrive in one change event,
        distribute them across the OTP boxes.
        */
    if (digits.length > 1) {
      const incoming = digits.slice(0, OTP_LENGTH - index).split("");
      setOtp((current) => {
        const updated = [...current];
        incoming.forEach((digit, offset) => {
          updated[index + offset] = digit;
        });
        return updated;
      });
      const nextIndex = Math.min(index + incoming.length, OTP_LENGTH - 1);
      window.setTimeout(() => focusInput(nextIndex), 0);
      return;
    }
    setOtp((current) => {
      const updated = [...current];
      updated[index] = digits[0];
      return updated;
    });
    if (index < OTP_LENGTH - 1) {
      window.setTimeout(() => focusInput(index + 1), 0);
    }
  };
  /*=====================================================
    Handle Keyboard Navigation
    =====================================================*/
  const handleKeyDown = (event, index) => {
    if (event.key === "Backspace") {
      if (otp[index]) {
        setOtp((current) => {
          const updated = [...current];
          updated[index] = "";
          return updated;
        });
        return;
      }
      if (index > 0) {
        setOtp((current) => {
          const updated = [...current];
          updated[index - 1] = "";
          return updated;
        });
        window.setTimeout(() => focusInput(index - 1), 0);
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusInput(index + 1);
    }
  };
  /*=====================================================
    Handle OTP Paste
    =====================================================*/
  const handlePaste = (event) => {
    event.preventDefault();
    clearMessages();
    const pastedDigits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pastedDigits) {
      return;
    }
    const updated = Array(OTP_LENGTH).fill("");
    pastedDigits.split("").forEach((digit, index) => {
      updated[index] = digit;
    });
    setOtp(updated);
    const focusIndex = Math.min(pastedDigits.length, OTP_LENGTH) - 1;
    window.setTimeout(() => focusInput(Math.max(focusIndex, 0)), 0);
  };
  /*=====================================================
    Verify OTP
    =====================================================*/
  const handleVerify = async (event) => {
    event.preventDefault();
    if (loading || resendLoading) {
      return;
    }
    clearMessages();
    const otpCode = otp.join("");
    if (!isValidEmail(email)) {
      setError("Enter the email address you originally registered with.");
      return;
    }
    if (!/^\d{6}$/.test(otpCode)) {
      setError("Please enter all 6 digits.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await API.post("/auth/verify-otp", {
        email: normalizeEmail(email),
        otp: otpCode,
      });
      if (data?.status !== "success") {
        throw new Error("Invalid verification response.");
      }
      clearSessionEmail();
      setSuccessMessage(data?.message || "Email verified successfully.");
      /*
            Small delay gives the user visual confirmation
            before moving to login.
            */
      window.setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 900);
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const backendMessage = err.response?.data?.message;
      if (status === 429 || code === "OTP_VERIFY_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many verification attempts. Please wait before trying again.",
        );
        return;
      }
      if (status === 400) {
        setError(backendMessage || "Invalid or expired verification code.");
        return;
      }
      if (!err.response) {
        setError(
          "Unable to connect to the server. Please check your connection and try again.",
        );
        return;
      }
      if (import.meta.env.DEV) {
        console.error("OTP verification failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }
      setError(
        backendMessage || "Unable to verify the code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  /*=====================================================
    Resend Verification OTP
    =====================================================*/
  const handleResendCode = async () => {
    if (loading || resendLoading || resendCooldown > 0) {
      return;
    }
    clearMessages();
    if (!isValidEmail(email)) {
      setError("Enter your registered email address before requesting a new code.");
      return;
    }
    setResendLoading(true);
    try {
      const { data } = await API.post("/auth/resend-otp", {
        email: normalizeEmail(email),
      });
      setOtp(Array(OTP_LENGTH).fill(""));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setSuccessMessage(
        data?.message ||
          "If this email still needs verification, a code has been requested. Check your inbox and spam folder.",
      );
      window.setTimeout(() => focusInput(0), 0);
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const backendMessage = err.response?.data?.message;
      if (status === 429 || code === "OTP_RESEND_RATE_LIMITED") {
        setError(
          backendMessage ||
            "Too many verification-code requests. Please wait before requesting another code.",
        );
        return;
      }
      if (!err.response) {
        setError(
          "Unable to connect to the server. Please check your connection and try again.",
        );
        return;
      }
      if (import.meta.env.DEV) {
        console.error("OTP resend failed:", {
          status,
          code,
          message: backendMessage || err.message,
        });
      }
      setError(backendMessage || "Unable to resend the verification code.");
    } finally {
      setResendLoading(false);
    }
  };
  /*=====================================================
    Return to sign-in instead of trapping existing users
    in registration's duplicate-email response.
    =====================================================*/
  const handleBack = () => {
    clearSessionEmail();
    navigate("/login", {
      replace: true,
    });
  };
  /*=====================================================
    Render
    =====================================================*/
  return (
    <AuthLayout
      title="Verify Identity"
      subtitle={
        isValidEmail(email)
          ? `Enter the verification code for ${normalizeEmail(email)}.`
          : "Enter your registered email to finish verification."
      }
      step="02"
    >
      <div className="space-y-8">
        {/*=========================================
                Icon
                =========================================*/}
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck
              className="text-[#D4AF37]"
              size={32}
              aria-hidden="true"
            />
          </div>
        </div>
        {location.state?.message && (
          <p
            role="status"
            className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-3 text-center text-xs leading-5 text-slate-700"
          >
            {String(location.state.message).slice(0, 350)}
          </p>
        )}
        {/*=========================================
                OTP Form
                =========================================*/}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="verification-email"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Registered email address
            </label>
            <div className="relative">
              <Mail
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
              />
              <input
                id="verification-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={handleEmailChange}
                disabled={loading || resendLoading}
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Use the same email you used when registering. If you did not receive
              a code or it expired, request a new one below.
            </p>
          </div>
          <div
            className="flex justify-between gap-2 sm:gap-4"
            onPaste={handlePaste}
          >
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={digit}
                disabled={loading}
                onChange={(event) => handleChange(event, index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={(event) => event.target.select()}
                aria-label={`OTP digit ${index + 1}`}
                className="w-10 h-12 sm:w-14 sm:h-16 text-center text-xl font-bold bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all disabled:opacity-60"
              />
            ))}
          </div>
          {/*=====================================
                    Error
                    =====================================*/}
          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl text-center font-medium"
            >
              {error}
            </div>
          )}
          {/*=====================================
                    Success
                    =====================================*/}
          {successMessage && (
            <div
              role="status"
              className="bg-green-50 border border-green-100 text-green-700 text-xs p-3 rounded-xl text-center font-medium"
            >
              {successMessage}
            </div>
          )}
          {/*=====================================
                    Verify Button
                    =====================================*/}
          <button
            type="submit"
            disabled={loading || resendLoading || !isValidEmail(email) || otp.join("").length !== OTP_LENGTH}
            className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl font-semibold tracking-wide hover:bg-black transition-all shadow-lg shadow-black/10 flex justify-center items-center gap-2 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2
                  className="animate-spin"
                  size={20}
                  aria-hidden="true"
                />
                <span>Verifying...</span>
              </>
            ) : (
              "Verify & Activate"
            )}
          </button>
        </form>
        {/*=========================================
                Actions
                =========================================*/}
        <div className="text-center space-y-4">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || resendLoading || resendCooldown > 0 || !isValidEmail(email)}
            className="text-xs text-gray-400 hover:text-[#D4AF37] uppercase tracking-widest font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendLoading
              ? "Sending..."
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend Code"}
          </button>
          <button
            type="button"
            onClick={handleBack}
            disabled={loading || resendLoading}
            className="flex items-center justify-center gap-2 text-sm text-gray-500 w-full hover:text-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to sign in
          </button>
          <p className="text-[11px] leading-5 text-slate-500">
            If your email is already verified, sign in or reset your password.
            A resend request does not confirm whether an account exists.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};
export default VerifyOTP;
