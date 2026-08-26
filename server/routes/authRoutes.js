"use strict";

/*
=========================================================
DesignByYou Authentication Routes
Registration, Verification, Login & Account Recovery
Version 2.0
=========================================================
*/

const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/authController");

const { uploadPreview } = require("../middlewares/upload");

const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

/*=========================================================
Rate Limit Response Helper
=========================================================*/

function rateLimitHandler(message, code) {
  return (req, res, next, options) => {
    return res.status(options.statusCode).json({
      status: "error",
      code,
      message,
    });
  };
}

/*=========================================================
Registration Rate Limiter

Protects against:

- automated account creation
- registration spam
- repeated Cloudinary uploads
- resource exhaustion

IMPORTANT:
This middleware runs BEFORE uploadPreview.single().
=========================================================*/

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 5,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many registration attempts. Please wait before trying again.",
    "REGISTER_RATE_LIMITED",
  ),
});

/*=========================================================
Login Rate Limiter

Limits repeated credential guessing from the same client.
=========================================================*/

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many sign-in attempts. Please wait before trying again.",
    "LOGIN_RATE_LIMITED",
  ),
});

/*=========================================================
Email Verification Rate Limiter

Limits brute-force attempts against six-digit OTP codes.
=========================================================*/

const verifyOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many verification attempts. Please wait before trying again.",
    "OTP_VERIFY_RATE_LIMITED",
  ),
});

/*=========================================================
Resend Verification OTP Rate Limiter

Prevents email flooding and excessive OTP generation.
=========================================================*/

const resendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 5,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many verification-code requests. Please wait before requesting another code.",
    "OTP_RESEND_RATE_LIMITED",
  ),
});

/*=========================================================
Forgot Password Rate Limiter

Prevents abuse of password-reset email delivery.
=========================================================*/

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 5,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many password-reset requests. Please wait before trying again.",
    "PASSWORD_RESET_REQUEST_RATE_LIMITED",
  ),
});

/*=========================================================
Reset Password Rate Limiter

Protects the password-reset OTP from brute-force attempts.
=========================================================*/

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  handler: rateLimitHandler(
    "Too many password-reset attempts. Please wait before trying again.",
    "PASSWORD_RESET_RATE_LIMITED",
  ),
});

/*=========================================================
Registration
=========================================================*/

router.post(
  "/register",

  /*
    IMPORTANT:
    Rate limiting comes before Cloudinary/Multer.

    An abusive request therefore cannot continuously upload
    files before being rejected.
    */

  registerLimiter,

  uploadPreview.single("profileImage"),

  authController.register,
);

/*=========================================================
Email Verification
=========================================================*/

router.post(
  "/verify-otp",

  verifyOtpLimiter,

  authController.verifyEmail,
);

/*=========================================================
Resend Email Verification Code
=========================================================*/

router.post(
  "/resend-otp",

  resendOtpLimiter,

  authController.resendOtp,
);

/*=========================================================
Login
=========================================================*/

router.post(
  "/login",

  loginLimiter,

  authController.login,
);

/*=========================================================
Forgot Password
=========================================================*/

router.post(
  "/forgot-password",

  forgotPasswordLimiter,

  authController.forgotPassword,
);

/*=========================================================
Reset Password
=========================================================*/

router.post(
  "/reset-password",

  resetPasswordLimiter,

  authController.resetPassword,
);

/*=========================================================
Session Recovery
=========================================================*/

router.get(
  "/me",

  protect,

  authController.getMe,
);

/*=========================================================
IMPORTANT SECURITY NOTE

There is intentionally NO route such as:

POST /setup-admin-fix
POST /create-superadmin

Administrator creation must never be exposed through the
public authentication router.
=========================================================*/

module.exports = router;
