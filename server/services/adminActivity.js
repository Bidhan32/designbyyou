"use strict";
const db = require("../config/db");

async function record(client, actor, action, target, before, after) {
  if (before === after) return;
  await client.query(`INSERT INTO public.admin_activity
    (actor_id,actor_name,action,target_id,previous_value,new_value) VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.id, actor.fullName || "", action, target, before, after]);
}

async function list(req, res) {
  res.set("Cache-Control", "no-store");
  const { q = "", before, action = "" } = req.query;
  if (typeof q !== "string" || q.length > 120 ||
      !["","designer_review","account_status","account_role","bank_verification","manual_payout","showcase_publish"].includes(action) ||
      (before !== undefined && (typeof before !== "string" || !/^[1-9]\d{0,18}$/.test(before) || BigInt(before)>9223372036854775807n))) {
    return res.status(400).json({ message: "Invalid activity search." });
  }
  const { rows } = await db.query(`SELECT id, occurred_at, actor_id, actor_name, action, target_id, previous_value, new_value
    FROM public.admin_activity
    WHERE ($1::bigint IS NULL OR id < $1) AND ($2='' OR action=$2)
      AND ($3='' OR strpos(lower(actor_name),lower($3))>0 OR actor_id::text=lower($3) OR target_id::text=lower($3))
    ORDER BY id DESC LIMIT 26`, [before ?? null, action, q.trim()]);
  const data = rows.slice(0,25);
  return res.json({ data, next: rows.length > 25 ? data[24].id : null });
}
module.exports = { record, list };
