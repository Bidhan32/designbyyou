"use strict";
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function issue(id, role, tokenVersion, secret) {
  const sid = crypto.randomUUID();
  // Preserve shorter configured lifetimes, but never exceed 24 hours.
  const candidate = jwt.sign({ id, role, tokenVersion, sid }, secret, {
    algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
  const claims = jwt.decode(candidate);
  const exp = Math.min(claims.exp, claims.iat + 86400);
  const token = jwt.sign({ ...claims, exp }, secret, { algorithm: "HS256" });
  await db.query(`INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,to_timestamp($3))`, [sid,id,exp]);
  return token;
}

async function check(sid, userId, touch = false) {
  if (!UUID.test(sid || "")) return null;
  // Guard the UPDATE itself: concurrent/late heartbeats cannot revive an expired session.
  const filter = `id=$1 AND user_id=$2 AND revoked_at IS NULL
    AND expires_at > clock_timestamp()
    AND last_active_at > clock_timestamp() - interval '5 hours'`;
  const result = await db.query(touch
    ? `UPDATE auth_sessions SET last_active_at=clock_timestamp() WHERE ${filter}
       RETURNING LEAST(expires_at,last_active_at + interval '5 hours') AS idle_expires_at, expires_at`
    : `SELECT LEAST(expires_at,last_active_at + interval '5 hours') AS idle_expires_at, expires_at
       FROM auth_sessions WHERE ${filter}`, [sid,userId]);
  return result.rows[0] || null;
}

async function activity(req, res, next) {
  try {
    const session = await check(req.auth.sessionId, req.user.id, true);
    if (!session) return res.status(401).json({ code: "SESSION_ENDED", message: "Your session ended. Please sign in again." });
    res.json({ status: "success", session });
  } catch (error) { next(error); }
}
async function status(req, res) {
  res.json({ status: "success", session: req.auth.session });
}
async function logout(req, res, next) {
  try {
    await db.query("UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND user_id=$2", [req.auth.sessionId,req.user.id]);
    res.json({ status: "success" });
  } catch (error) { next(error); }
}
module.exports = { issue, check, activity, status, logout };
