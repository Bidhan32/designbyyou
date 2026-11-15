"use strict";

const crypto = require("node:crypto");
const db = require("../config/db");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const privileged = role => role === "admin" || role === "superadmin";

function keyFor(id) {
  let encoded;
  try {
    encoded = JSON.parse(process.env.ADMIN_TOTP_KEYS || "{}")?.[id];
  } catch {
    // Parser errors can contain a snippet of the deployment secret.
    return null;
  }
  if (typeof encoded !== "string" || !/^[A-Z2-7]{32}$/.test(encoded)) return null;
  const bits = [...encoded].map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  return Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
}

function tag(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function totp(key, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", key).update(counter).digest();
  const binary = digest.readUInt32BE(digest[19] & 15) & 0x7fffffff;
  return String(binary % 1000000).padStart(6, "0");
}

async function verify(id, code) {
  const key = keyFor(id);
  if (!key) return { status: 503, message: "Contact your administrator to set up your authenticator." };
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { status: 403, message: "Enter the six-digit code from your authenticator." };
  }
  // One persistent attempt budget per account across all sessions and API replicas.
  const attempt = await db.query(`
    INSERT INTO admin_mfa_attempts AS a (user_id, attempts) VALUES ($1,1)
    ON CONFLICT (user_id) DO UPDATE SET
      attempts=CASE WHEN a.window_start <= now()-interval '10 minutes' THEN 1 ELSE a.attempts+1 END,
      window_start=CASE WHEN a.window_start <= now()-interval '10 minutes' THEN now() ELSE a.window_start END
    WHERE a.attempts < 5 OR a.window_start <= now()-interval '10 minutes'
    RETURNING floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`, [id]);
  if (!attempt.rowCount) return { status: 429, message: "Too many verification attempts. Try again in ten minutes." };
  const current = Number(attempt.rows[0].step);
  for (const step of [current, current-1, current+1]) {
    if (!crypto.timingSafeEqual(Buffer.from(code), Buffer.from(totp(key, step)))) continue;
    const used = await db.query("UPDATE admin_mfa_attempts SET last_step=$2, attempts=0 WHERE user_id=$1 AND last_step<$2", [id,step]);
    if (used.rowCount) return { factor: tag(key) };
  }
  return { status: 403, message: "Enter a new code from your authenticator." };
}

function validSession(id, session) {
  const key = keyFor(id);
  return key && session.admin_factor_tag === tag(key);
}

function requireFresh(req, res, next) {
  if (req.auth.session.admin_fresh === true) return next();
  return res.status(403).json({ code: "ADMIN_STEP_UP_REQUIRED", message: "Verify with your authenticator to continue." });
}

async function refresh(req, res) {
  const result = await verify(req.user.id, req.body?.code);
  if (result.status) return res.status(result.status).json({ message: result.message });
  const updated = await db.query(`UPDATE auth_sessions SET admin_verified_at=clock_timestamp()
    WHERE id=$1 AND user_id=$2 AND admin_factor_tag=$3 AND revoked_at IS NULL`,
    [req.auth.sessionId, req.user.id, result.factor]);
  if (!updated.rowCount) return res.status(401).json({ code: "SESSION_ENDED", message: "Please sign in again." });
  res.json({ status: "success" });
}

module.exports = { privileged, verify, validSession, requireFresh, refresh, totp };
