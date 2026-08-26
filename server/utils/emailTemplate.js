"use strict";

/*
=========================================================
DesignByYou Authentication Email Templates
Version 2.0
=========================================================
*/

/*=========================================================
HTML Escape Helper
=========================================================*/

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*=========================================================
Email Verification OTP
=========================================================*/

exports.otpTemplate = (name, otp) => {
  const safeName = escapeHtml(name || "there");

  const safeOtp = escapeHtml(otp);

  return `
    <div
        style="
            font-family: Arial, Helvetica, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            border: 1px solid #eeeeee;
            border-radius: 8px;
            padding: 24px;
            color: #333333;
        "
    >
        <h2
            style="
                text-align: center;
                margin-top: 0;
            "
        >
            DesignByYou
        </h2>

        <p>Hi ${safeName},</p>

        <p>
            Thank you for joining DesignByYou.
            Use the verification code below to verify
            your email address:
        </p>

        <div
            style="
                background: #f4f4f4;
                padding: 20px;
                margin: 24px 0;
                text-align: center;
                font-size: 28px;
                font-weight: bold;
                letter-spacing: 6px;
                border-radius: 6px;
            "
        >
            ${safeOtp}
        </div>

        <p>
            This verification code expires in
            <strong>10 minutes</strong>.
        </p>

        <p>
            If you did not create a DesignByYou account,
            you can safely ignore this email.
        </p>

        <hr
            style="
                border: none;
                border-top: 1px solid #eeeeee;
                margin: 28px 0;
            "
        />

        <p
            style="
                font-size: 12px;
                color: #888888;
                text-align: center;
            "
        >
            &copy; 2026 DesignByYou.
            All Rights Reserved.
        </p>
    </div>
    `;
};

/*=========================================================
Password Reset OTP
=========================================================*/

exports.passwordResetOtpTemplate = (name, otp) => {
  const safeName = escapeHtml(name || "there");

  const safeOtp = escapeHtml(otp);

  return `
    <div
        style="
            font-family: Arial, Helvetica, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            border: 1px solid #eeeeee;
            border-radius: 8px;
            padding: 24px;
            color: #333333;
        "
    >
        <h2
            style="
                text-align: center;
                margin-top: 0;
            "
        >
            DesignByYou
        </h2>

        <p>Hi ${safeName},</p>

        <p>
            We received a request to reset the password
            for your DesignByYou account.
        </p>

        <p>
            Use the code below to continue:
        </p>

        <div
            style="
                background: #f4f4f4;
                padding: 20px;
                margin: 24px 0;
                text-align: center;
                font-size: 28px;
                font-weight: bold;
                letter-spacing: 6px;
                border-radius: 6px;
            "
        >
            ${safeOtp}
        </div>

        <p>
            This password reset code expires in
            <strong>10 minutes</strong>.
        </p>

        <p>
            If you did not request a password reset,
            ignore this email. Your password will remain
            unchanged.
        </p>

        <hr
            style="
                border: none;
                border-top: 1px solid #eeeeee;
                margin: 28px 0;
            "
        />

        <p
            style="
                font-size: 12px;
                color: #888888;
                text-align: center;
            "
        >
            &copy; 2026 DesignByYou.
            All Rights Reserved.
        </p>
    </div>
    `;
};
