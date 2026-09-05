"use strict";

/*
=========================================================
FashionVision Bank Details Encryption Utility
Version 1.0
=========================================================

Purpose:

- Encrypt full designer bank payout details before storing
  them in PostgreSQL.
- Decrypt them later only inside trusted backend/admin
  workflows.
- Keep readable database columns limited to safe display
  metadata such as bank name and last four characters.

Algorithm:

AES-256-GCM

Environment:

BANK_DETAILS_ENCRYPTION_KEY

The environment value must be a base64-encoded 32-byte key.

Generate one with:

node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

Never commit the key to Git.
=========================================================
*/

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = 1;

function getEncryptionKey() {
  const configured = String(
    process.env.BANK_DETAILS_ENCRYPTION_KEY || "",
  ).trim();

  if (!configured) {
    const error = new Error(
      "BANK_DETAILS_ENCRYPTION_KEY is missing from the backend environment.",
    );

    error.code = "BANK_DETAILS_ENCRYPTION_KEY_MISSING";

    throw error;
  }

  let key;

  try {
    key = Buffer.from(configured, "base64");
  } catch {
    key = null;
  }

  if (!key || key.length !== 32) {
    const error = new Error(
      "BANK_DETAILS_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );

    error.code = "BANK_DETAILS_ENCRYPTION_KEY_INVALID";

    throw error;
  }

  return key;
}

function buildAdditionalAuthenticatedData({
  designerId,
  bankAccountId,
  version = VERSION,
}) {
  if (!designerId || !bankAccountId) {
    throw new Error(
      "designerId and bankAccountId are required for bank-detail encryption.",
    );
  }

  return Buffer.from(
    `designer-bank-details:v${version}:${designerId}:${bankAccountId}`,
    "utf8",
  );
}

function encryptBankDetails(
  details,
  {
    designerId,
    bankAccountId,
  },
) {
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(IV_BYTES);

  const aad = buildAdditionalAuthenticatedData({
    designerId,
    bankAccountId,
    version: VERSION,
  });

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  cipher.setAAD(aad);

  const plaintext = Buffer.from(JSON.stringify(details || {}), "utf8");

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    version: VERSION,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptBankDetails(
  encrypted,
  {
    designerId,
    bankAccountId,
  },
) {
  const version = Number(encrypted?.version || VERSION);

  if (version !== VERSION) {
    const error = new Error(
      `Unsupported bank-detail encryption version: ${version}.`,
    );

    error.code = "BANK_DETAILS_ENCRYPTION_VERSION_UNSUPPORTED";

    throw error;
  }

  const ciphertext = String(encrypted?.ciphertext || "").trim();
  const iv = String(encrypted?.iv || "").trim();
  const authTag = String(encrypted?.authTag || "").trim();

  if (!ciphertext || !iv || !authTag) {
    const error = new Error("Encrypted bank details are incomplete.");

    error.code = "BANK_DETAILS_ENCRYPTED_PAYLOAD_INVALID";

    throw error;
  }

  const key = getEncryptionKey();

  const aad = buildAdditionalAuthenticatedData({
    designerId,
    bankAccountId,
    version,
  });

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64"),
    );

    decipher.setAAD(aad);

    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString("utf8"));
  } catch (cause) {
    const error = new Error(
      "The encrypted bank details could not be authenticated or decrypted.",
    );

    error.code = "BANK_DETAILS_DECRYPTION_FAILED";
    error.cause = cause;

    throw error;
  }
}

module.exports = {
  encryptBankDetails,
  decryptBankDetails,
};