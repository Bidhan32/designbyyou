"use strict";

/*
=========================================================
DesignByYou Email Service
Nodemailer SMTP Transport
Version 2.0
=========================================================
*/

const nodemailer = require("nodemailer");

/*=========================================================
Environment Helpers
=========================================================*/

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function getEmailPort() {
  const value = Number(process.env.EMAIL_PORT || 465);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("EMAIL_PORT is invalid.");
  }

  return value;
}

/*=========================================================
Create Transport
=========================================================*/

function createTransporter() {
  const host = String(process.env.EMAIL_HOST || "smtp.gmail.com").trim();

  const port = getEmailPort();

  const user = getRequiredEnv("EMAIL_USER");

  const password = getRequiredEnv("EMAIL_PASS");

  return nodemailer.createTransport({
    host,

    port,

    /*
        Port 465 uses implicit TLS.
        Port 587 normally starts insecure and upgrades
        through STARTTLS.
        */
    secure: port === 465,

    auth: {
      user,
      pass: password,
    },

    connectionTimeout: 10000,

    greetingTimeout: 10000,

    socketTimeout: 20000,
  });
}

/*=========================================================
Send Email
=========================================================*/

async function sendEmail(options) {
  if (!options || !options.email || !options.subject || !options.html) {
    throw new Error("Email recipient, subject and HTML content are required.");
  }

  const transporter = createTransporter();

  const emailUser = getRequiredEnv("EMAIL_USER");

  const fromAddress = String(process.env.EMAIL_FROM || emailUser).trim();

  const mailOptions = {
    from: `"DesignByYou" <${fromAddress}>`,

    to: String(options.email).trim(),

    subject: String(options.subject).trim(),

    html: options.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV !== "production") {
      console.log("Email sent:", {
        recipient: mailOptions.to,

        messageId: info.messageId,
      });
    }

    return info;
  } catch (error) {
    console.error("Email delivery failed:", {
      recipient: mailOptions.to,

      message: error.message,
    });

    throw new Error("Email could not be sent.");
  }
}

module.exports = sendEmail;
