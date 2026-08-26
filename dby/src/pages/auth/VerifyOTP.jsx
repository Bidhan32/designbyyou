"use strict";

/*
=========================================================
DesignByYou Verify OTP Page
Email Verification
Version 2.0
=========================================================
*/

import React, { useEffect, useRef, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";

/*=========================================================
Configuration
=========================================================*/

const OTP_LENGTH = 6;

const RESEND_COOLDOWN_SECONDS = 30;

/*=========================================================
Verify OTP
=========================================================*/

const VerifyOTP = () => {
  const navigate = useNavigate();

  const location = useLocation();

  const inputRefs = useRef([]);

  const [loading, setLoading] = useState(false);

  const [resendLoading, setResendLoading] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));

  /*=====================================================
    Resolve Email

    Priority:

    1. React Router navigation state
    2. sessionStorage fallback
    =====================================================*/

  const navigationEmail = location.state?.email;

  const storedEmail = sessionStorage.getItem("pending_verification_email");

  const email = String(navigationEmail || storedEmail || "")
    .trim()
    .toLowerCase();

  /*=====================================================
    Persist Email For Hard Refresh
    =====================================================*/

  useEffect(() => {
    if (navigationEmail) {
      sessionStorage.setItem(
        "pending_verification_email",
        String(navigationEmail).trim().toLowerCase(),
      );
    }
  }, [navigationEmail]);

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
    sessionStorage.removeItem("pending_verification_email");
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

    if (loading) {
      return;
    }

    clearMessages();

    const otpCode = otp.join("");

    if (!email) {
      setError(
        "Verification email information is missing. Please register again.",
      );

      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      setError("Please enter all 6 digits.");

      return;
    }

    setLoading(true);

    try {
      const { data } = await API.post("/auth/verify-otp", {
        email,
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
    if (resendLoading || resendCooldown > 0) {
      return;
    }

    clearMessages();

    if (!email) {
      setError("Email address is missing. Please register again.");

      return;
    }

    setResendLoading(true);

    try {
      const { data } = await API.post("/auth/resend-otp", {
        email,
      });

      setOtp(Array(OTP_LENGTH).fill(""));

      setResendCooldown(RESEND_COOLDOWN_SECONDS);

      setSuccessMessage(
        data?.message || "A new verification code has been sent.",
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
    Back To Registration
    =====================================================*/

  const handleBack = () => {
    clearSessionEmail();

    navigate("/register", {
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
        email
          ? `We've sent a 6-digit code to ${email}.`
          : "Enter the verification code sent to your email."
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

        {/*=========================================
                OTP Form
                =========================================*/}

        <form onSubmit={handleVerify} className="space-y-6">
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
            disabled={loading || otp.join("").length !== OTP_LENGTH}
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
            disabled={resendLoading || resendCooldown > 0 || !email}
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
            Back to registration
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};

export default VerifyOTP;
