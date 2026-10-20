"use strict";

/** DesignByYou – FASHN Edit / Sketch to Realistic Garment (prototype). */
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

const API = "https://api.fashn.ai/v1";
const OUTPUT_HOSTS = new Set(["cdn.fashn.ai", "media.fashn.ai"]);
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

class SketchProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "SketchProviderError";
    this.status = status;
  }
}

function getKey() {
  const key = String(process.env.FASHN_API_KEY || "").trim();
  if (!key) throw new SketchProviderError("FASHN_API_KEY is not configured.", 503);
  return key;
}

async function callFashn(path, init = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getKey()}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof SketchProviderError) throw error;
    throw new SketchProviderError("Could not reach FASHN in time.", 503);
  }
  const raw = await response.text();
  if (raw.length > 500000) throw new SketchProviderError("FASHN response was too large.");
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new SketchProviderError("FASHN returned invalid JSON."); }
  if (!response.ok) {
    const errorType = typeof data.error === "string" ? data.error : data.error?.name;
    const detail = String(data.message || data.error?.message || "Request rejected.").slice(0, 200);
    throw new SketchProviderError(`${errorType || "FASHN_ERROR"}: ${detail}`,
      response.status === 429 ? 429 : 502);
  }
  return { data, response };
}

/** Read and normalize an image before it is sent to FASHN or Cloudinary. */
async function normalizeSketch(file) {
  if (!file?.buffer || file.buffer.length < 20 || file.buffer.length > 6 * 1024 * 1024) {
    throw new SketchProviderError("Upload one sketch smaller than 6 MB.", 400);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    throw new SketchProviderError("Sketch must be JPG, PNG, or WebP.", 400);
  }
  try {
    const image = sharp(file.buffer, { limitInputPixels: 32_000_000 });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format) ||
        !meta.width || !meta.height ||
        meta.width < 128 || meta.height < 128 ||
        meta.width > 8000 || meta.height > 8000) {
      throw new Error("Unsupported sketch dimensions or image format");
    }
    // White background for transparent sketches; rotate according to EXIF.
    return await image.rotate().flatten({ background: "#ffffff" })
      .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  } catch {
    throw new SketchProviderError("The sketch image could not be processed.", 400);
  }
}

function uploadImage(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      ...options,
      resource_type: "image",
      secure: true,
    }, (error, result) => {
      if (error || !result?.secure_url || !result?.public_id) {
        reject(new SketchProviderError("Could not save image to Cloudinary.", 503));
        return;
      }
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.on("error", () => reject(new SketchProviderError("Cloudinary stream failed.", 503)));
    stream.end(buffer);
  });
}

async function saveSourceSketch(buffer, creatorId, jobId) {
  return uploadImage(buffer, {
    folder: "designbyyou_ai/sketch_to_image/inputs",
    public_id: `sketch_${creatorId}_${jobId}`,
    overwrite: false,
  });
}

async function deleteCloudinaryImage(publicId) {
  if (!publicId || !publicId.startsWith("designbyyou_ai/sketch_to_image/")) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: "image" }); }
  catch (err) { console.error("[SketchToImage] Cleanup failed:", err.message); }
}

async function startSketchEdit({ sketchBuffer, instruction, generationMode }) {
  const dataUri = `data:image/jpeg;base64,${sketchBuffer.toString("base64")}`;
  const { data } = await callFashn("/run", {
    method: "POST",
    body: JSON.stringify({
      model_name: "edit",
      inputs: {
        image: dataUri,
        prompt: instruction,
        resolution: "1k",
        generation_mode: generationMode,
        num_images: 1,
        output_format: "png",
        return_base64: false,
      },
    }),
  });
  if (typeof data.id !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id)) {
    throw new SketchProviderError("FASHN did not provide a valid prediction ID.");
  }
  return data.id;
}

async function getSketchStatus(predictionId) {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(predictionId)) {
    throw new SketchProviderError("Invalid provider prediction ID.", 400);
  }
  const { data, response } = await callFashn(`/status/${encodeURIComponent(predictionId)}`);
  const header = response.headers.get("x-fashn-credits-used");
  const credits = header !== null && Number.isFinite(Number(header)) ? Number(header) : null;
  return { ...data, credits };
}

function trustedOutputUrl(raw) {
  if (typeof raw !== "string") throw new SketchProviderError("FASHN did not return an output URL.");
  let url;
  try { url = new URL(raw); }
  catch { throw new SketchProviderError("Invalid FASHN output URL."); }
  if (url.protocol !== "https:" || !OUTPUT_HOSTS.has(url.hostname) ||
      url.port || url.username || url.password) {
    throw new SketchProviderError("Untrusted output URL returned by FASHN.");
  }
  return url.toString();
}

async function fetchOutputBytes(rawUrl) {
  let response;
  try {
    response = await fetch(trustedOutputUrl(rawUrl), {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch { throw new SketchProviderError("Generated output could not be downloaded.", 503); }
  if (!response.ok || !response.body) throw new SketchProviderError("Image download failed.", 503);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg"].includes(type)) {
    throw new SketchProviderError("Unexpected output image type.");
  }
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_DOWNLOAD_BYTES) throw new SketchProviderError("Generated output is too large.");
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new SketchProviderError("Generated output is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  const png = buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff &&
    buffer[1] === 0xd8 && buffer[2] === 0xff;
  if ((type === "image/png" && !png) || (type === "image/jpeg" && !jpeg)) {
    throw new SketchProviderError("Output image signature did not match its type.");
  }
  return buffer;
}

async function saveSketchOutput(fashnUrl, creatorId, jobId) {
  const buffer = await fetchOutputBytes(fashnUrl);
  return uploadImage(buffer, {
    folder: "designbyyou_ai/sketch_to_image/outputs",
    public_id: `render_${creatorId}_${jobId}`,
    overwrite: true,
  });
}

module.exports = {
  SketchProviderError,
  normalizeSketch,
  saveSourceSketch,
  deleteCloudinaryImage,
  startSketchEdit,
  getSketchStatus,
  saveSketchOutput,
};
