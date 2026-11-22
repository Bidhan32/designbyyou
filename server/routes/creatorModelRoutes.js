"use strict";

const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const cloud = require("cloudinary").v2;
const { rateLimit } = require("express-rate-limit");
const db = require("../config/db");
const { protect, authorize, requireVerifiedEmail } = require("../middlewares/authMiddleware");
const { submitImage } = require("../services/ai/falImageQueue");
const { model, expire, synchronize } = require("../services/ai/modelJobs");
const { localModelPath } = require("../services/ai/modelStorage");


const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const router = express.Router();
router.use(protect, authorize("creator"), requireVerifiedEmail);
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const upload = multer({ storage: multer.memoryStorage(), limits: {
  files: 1, fields: 1, parts: 3, fileSize: 8 * 1024 * 1024, fieldSize: 64,
} }).single("image");

function present(row) {
  const job = { id: row.id, status: row.status, created_at: row.created_at };
  if (row.status === "completed") {
    if (row.model_asset === "local:" + row.id || row.model_asset === "db:" + row.id) {
      job.file_path = "/creator-tools/image-to-3d/jobs/" + row.id + "/file";
      return job;
    }
    const options = { resource_type: "raw", type: "authenticated", expires_at: Math.floor(Date.now()/1000) + 3600 };
    job.model_url = cloud.utils.private_download_url(row.model_asset, "", options);
    job.download_url = cloud.utils.private_download_url(row.model_asset, "", { ...options, attachment: true });
  }
  return job;
}


async function reserve(owner, key) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
    const existing = await client.query("SELECT * FROM creator_model_jobs WHERE creator_id=$1 AND request_key=$2", [owner, key]);
    if (existing.rowCount) { await client.query("COMMIT"); return { row: existing.rows[0] }; }
    const { rows: [counts] } = await client.query(`SELECT count(*) AS total,
      count(*) FILTER (WHERE status IN ('processing','saving','submitting')) AS active
      FROM creator_model_jobs WHERE creator_id=$1 AND created_at > now()-interval '24 hours'`, [owner]);
    if (+counts.active || +counts.total >= 4) throw Object.assign(new Error(+counts.active
      ? "You already have a model in progress." : "You have reached four model submissions in 24 hours."), { httpStatus: +counts.active ? 409 : 429 });
    const inserted = await client.query("INSERT INTO creator_model_jobs(creator_id,request_key) VALUES($1,$2) RETURNING *", [owner,key]);
    await client.query("COMMIT");
    return { row: inserted.rows[0], fresh: true };
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

router.post("/jobs", rateLimit({ windowMs: 60000, limit: 8, keyGenerator: req => req.user.id }),
  (req,res,next) => upload(req,res,err => err ? res.status(400).json({ message: "Upload one image up to 8 MB." }) : next()),
  async (req,res) => {
    const key = req.body?.request_key;
    if (!uuid.test(key) || !req.file) return res.status(400).json({ message: "Choose an image and supply a request key." });
    if (!process.env.FAL_KEY) return res.status(503).json({ message: "3D generation is unavailable." });
    let png;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 32000000 });
      const metadata = await image.metadata();
      if (!["jpeg","png","webp","heif","avif"].includes(metadata.format)) throw new Error();
      png = await image.rotate().resize(1280,1280,{ fit: "inside", withoutEnlargement: true }).png().toBuffer();
    } catch { return res.status(400).json({ message: "Use a JPG, JPEG, PNG, WebP or AVIF image under 32 megapixels." }); }
    await expire(req.user.id);
    const { row, fresh } = await reserve(req.user.id, key);
    if (!fresh) return res.json(present(row));
    let provider;
    try {
      provider = await submitImage(model, { input_image_url: "data:image/png;base64," + png.toString("base64"), face_count: 40000 }, { privateInputs: true });
    } catch {
      await db.query("UPDATE creator_model_jobs SET status='failed' WHERE id=$1 AND status='submitting'", [row.id]);
      return res.status(502).json({ message: "3D submission failed. Your reserved credits were released." });
    }
    const result = await db.query("UPDATE creator_model_jobs SET provider_id=$2,status='processing',updated_at=now() WHERE id=$1 AND status='submitting' RETURNING *", [row.id, provider]);
    res.status(202).json(present(result.rows[0]));
  });

router.get("/jobs", async (req,res) => {
  await expire(req.user.id);
  const result = await db.query("SELECT * FROM creator_model_jobs WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 30", [req.user.id]);
  res.json(result.rows.map(present));
});

router.get("/jobs/:id/file", async (req,res) => {
  if (!uuid.test(req.params.id)) return res.sendStatus(404);
  const { rows: [row] } = await db.query(`SELECT j.model_asset, f.glb FROM creator_model_jobs j
    LEFT JOIN creator_model_files f ON f.job_id=j.id
    WHERE j.id=$1 AND j.creator_id=$2 AND j.status='completed'`, [req.params.id, req.user.id]);
  if (row?.model_asset === "db:" + req.params.id && row.glb) {
    return res.type("model/gltf-binary").send(row.glb);
  }
  if (row?.model_asset !== "local:" + req.params.id) return res.sendStatus(404);
  res.type("model/gltf-binary").sendFile(localModelPath(req.user.id, req.params.id), { dotfiles: "allow", cacheControl: false });
});

router.get("/jobs/:id", async (req,res) => {
  if (!uuid.test(req.params.id)) return res.sendStatus(404);
  const args = [req.params.id,req.user.id];
  const owned = async () => (await db.query("SELECT * FROM creator_model_jobs WHERE id=$1 AND creator_id=$2", args)).rows[0];
  await expire(req.user.id);
  let row = await owned();
  if (!row) return res.sendStatus(404);
  if (row.status === "processing" || row.status === "saving") {
    try {
      await synchronize(row);
    } catch (err) {
      console.error("[Image to 3D] Retry pending", row.id, err.code || err.status || err.name);
    }
    row = await owned();
  }
  res.json(present(row));
});
router.use((err, _req,res,_next) => {
  const status = err.code === "DB402" ? 402 : err.httpStatus || 503;
  if (status >= 500) console.error("[Image to 3D]", err.code || err.name);
  res.status(status).json({ message: status < 500 ? err.message : "3D service temporarily unavailable. Check your model history." });
});
module.exports = router;
