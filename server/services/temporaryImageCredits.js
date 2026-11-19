"use strict";

const { randomUUID } = require("node:crypto");
const db = require("../config/db");

// These tools return temporary results directly, without a persistent job row.
async function generateTemporaryImage(creatorId, tool, requestKey, generate) {
  const id = requestKey || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw Object.assign(new Error("Invalid image request key."), { httpStatus: 400, code: "INVALID_REQUEST_KEY" });
  }
  const key = [creatorId, tool, id];
  try {
    await db.query("SELECT public.reserve_ai_image($1,$2,$3)", key);
  } catch (err) {
    if (err.code === "DB402") throw Object.assign(new Error(err.message), { httpStatus: 402, code: "INSUFFICIENT_AI_CREDITS" });
    if (err.code === "23505") throw Object.assign(new Error("This image request was already submitted."), { httpStatus: 409, code: "DUPLICATE_IMAGE_REQUEST" });
    throw err;
  }
  const settle = status => db.query(
    "UPDATE public.ai_image_reservations SET status=$4 WHERE creator_id=$1 AND tool=$2 AND image_id=$3 AND status='reserved'",
    [...key, status]);
  try {
    const result = await generate();
    if (!(await settle("completed")).rowCount) throw new Error("Image reservation expired.");
    return result;
  } catch (err) {
    await settle("failed");
    throw err;
  }
}

module.exports = { generateTemporaryImage };
