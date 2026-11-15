"use strict";

const { createHash } = require("node:crypto");
const db = require("../../config/db");

function dailyLimit(name, fallback) {
  const raw = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`Invalid preview limit: ${name}`);
  }
  return Number(raw);
}

function deny(status, message) {
  return { status, message };
}

async function reserve(userId, input) {
  const personal = dailyLimit("FASHION_PREVIEW_USER_DAILY_LIMIT", 4);
  const global = dailyLimit("FASHION_PREVIEW_GLOBAL_DAILY_LIMIT", 50);
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Serialize only admission, across all API replicas. Release before provider I/O.
    await client.query("SELECT pg_advisory_xact_lock(763214091)");
    await client.query("DELETE FROM fashion_preview_attempts WHERE created_at <= clock_timestamp() - interval '24 hours'");
    const { rows: [previous] } = await client.query(
      "SELECT state, result FROM fashion_preview_attempts WHERE user_id=$1 AND fingerprint=$2",
      [userId, fingerprint],
    );
    let admission;
    if (previous?.state === "complete") {
      admission = { result: previous.result };
    } else if (previous) {
      admission = deny(409, previous.state === "pending"
        ? "This preview is processing. Check again shortly."
        : "The provider could not confirm this preview. Try again after 24 hours.");
    } else {
      const { rows: [usage] } = await client.query(
        `SELECT count(*) AS total, count(*) FILTER (WHERE user_id=$1) AS personal,
         count(*) FILTER (WHERE user_id=$1 AND state='pending') AS running FROM fashion_preview_attempts`,
        [userId],
      );
      if (Number(usage.running)) {
        admission = deny(409, "You already have a preview processing. Try again when it finishes.");
      } else if (Number(usage.personal) >= personal || Number(usage.total) >= global) {
        admission = deny(429, "The preview limit has been reached. Try again later.");
      } else {
        const { rows: [attempt] } = await client.query(
          "INSERT INTO fashion_preview_attempts(user_id,fingerprint) VALUES ($1,$2) RETURNING id",
          [userId, fingerprint],
        );
        admission = { id: attempt.id };
      }
    }
    await client.query("COMMIT");
    return admission;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function renderOnce(userId, input, generate) {
  const admission = await reserve(userId, input);
  if (!admission.id) return admission;
  try {
    const result = await generate(input);
    await db.query("UPDATE fashion_preview_attempts SET state='complete', result=$2 WHERE id=$1",
      [admission.id, result]);
    return { result };
  } catch (error) {
    await db.query("UPDATE fashion_preview_attempts SET state='uncertain' WHERE id=$1 AND state='pending'", [admission.id]);
    throw error;
  }
}

module.exports = { renderOnce };
