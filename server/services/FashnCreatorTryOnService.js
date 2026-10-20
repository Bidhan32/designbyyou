"use strict";

/**
 * Standalone Creator Virtual Try-On, separate from booking virtual try-on.
 * Sensitive source photos stay in memory and are sent to FASHN as data URIs.
 * Only generated JPEG results are saved, as authenticated Cloudinary assets.
 */
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

const BASE = "https://api.fashn.ai/v1";
const MAX_SOURCE = 12 * 1024 * 1024;
const MAX_OUTPUT = 16 * 1024 * 1024;
const FORMATS = new Set(["jpeg", "png", "webp"]);
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

class TryOnServiceError extends Error {
  constructor(message, status = 502, code = "TRYON_PROVIDER_ERROR") {
    super(message);
    this.name = "TryOnServiceError";
    this.status = status;
    this.code = code;
  }
}

function getApiKey() {
  const key = String(process.env.FASHN_API_KEY || "").trim();
  if (!key) throw new TryOnServiceError("FASHN_API_KEY not configured.", 503, "PROVIDER_NOT_CONFIGURED");
  return key;
}

async function fetchJson(path, options = {}, maxBytes = 30 * 1024 * 1024) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method || "GET",
      redirect: "error",
      signal: AbortSignal.timeout(40000),
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (err) {
    if (err instanceof TryOnServiceError) throw err;
    throw new TryOnServiceError("FASHN did not respond in time.", 503, "PROVIDER_UNREACHABLE");
  }
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > maxBytes) throw new TryOnServiceError("FASHN response is too large.");
  if (!response.body) throw new TryOnServiceError("FASHN returned an empty response.");
  const reader = response.body.getReader();
  const parts = [];
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) {
        await reader.cancel();
        throw new TryOnServiceError("FASHN response exceeds the permitted size.");
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  let data;
  try { data = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new TryOnServiceError("FASHN returned invalid JSON."); }
  if (!response.ok) {
    const status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? 503 : 502);
    const providerCode = typeof data?.error === "string" ? data.error : data?.error?.name;
    console.error("[CreatorTryOn] Provider rejected request:", { httpStatus: response.status, providerCode });
    throw new TryOnServiceError("FASHN rejected the generation request.", status, "PROVIDER_REJECTED");
  }
  return { data, credits: Number(response.headers.get("x-fashn-credits-used")) || null };
}

async function prepareImage(file, kind) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length < 32 || file.buffer.length > MAX_SOURCE || !MIME.has(file.mimetype)) {
    throw new TryOnServiceError(`Upload a valid JPG, PNG or WebP ${kind} image (12 MB maximum).`, 400, "INVALID_IMAGE");
  }
  try {
    const image = sharp(file.buffer, { limitInputPixels: 32_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!FORMATS.has(meta.format) || !meta.width || !meta.height || meta.width < 128 || meta.height < 128 || meta.width > 9000 || meta.height > 9000) {
      throw new Error("Invalid image metadata");
    }
    const processed = await image.rotate().flatten({ background: "#ffffff" })
      .resize({ width: 1280, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 83, mozjpeg: true }).toBuffer();
    if (processed.length > 5 * 1024 * 1024) {
      throw new Error("Image too large after optimization");
    }
    return `data:image/jpeg;base64,${processed.toString("base64")}`;
  } catch {
    throw new TryOnServiceError(`Could not process the ${kind} image.`, 400, "INVALID_IMAGE");
  }
}

async function startPrediction({ personDataUri, garmentDataUri, category, mode, garmentPhotoType }) {
  const { data } = await fetchJson("/run", {
    method: "POST",
    body: {
      model_name: "tryon-v1.6",
      inputs: {
        model_image: personDataUri,
        garment_image: garmentDataUri,
        category,
        garment_photo_type: garmentPhotoType,
        mode,
        num_samples: 1,
        output_format: "jpeg",
        return_base64: true,
      },
    },
  }, 300_000);
  if (typeof data?.id !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id)) {
    throw new TryOnServiceError("FASHN did not return a valid prediction ID.");
  }
  return data.id;
}

async function getPrediction(predictionId) {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(predictionId)) {
    throw new TryOnServiceError("Invalid prediction ID.", 400);
  }
  return fetchJson(`/status/${encodeURIComponent(predictionId)}`);
}

function decodeOutput(output) {
  if (typeof output !== "string" || output.length > Math.ceil(MAX_OUTPUT * 4 / 3) + 100) {
    throw new TryOnServiceError("FASHN returned an invalid output image.");
  }
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(output);
  if (!match) throw new TryOnServiceError("FASHN output is not a supported base64 image.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 64 || buffer.length > MAX_OUTPUT) throw new TryOnServiceError("FASHN output size is invalid.");
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if ((match[1] === "jpeg" && !jpeg) || (match[1] === "png" && !png)) {
    throw new TryOnServiceError("FASHN output image signature is invalid.");
  }
  return buffer;
}

async function savePrivateResult(outputDataUri, creatorId, jobId) {
  const buffer = decodeOutput(outputDataUri);
  const jpeg = await sharp(buffer, { limitInputPixels: 32_000_000 })
    .rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Promise((resolve, reject) => {
    const uploader = cloudinary.uploader.upload_stream({
      resource_type: "image",
      type: "authenticated",
      folder: "designbyyou_ai/creator_virtual_tryon",
      public_id: `${creatorId}_${jobId}`,
      overwrite: false,
      format: "jpg",
    }, (err, result) => {
      if (err || !result?.public_id) {
        reject(new TryOnServiceError("Could not save the generated image securely.", 503, "STORAGE_FAILED"));
      } else {
        resolve(result.public_id);
      }
    });
    uploader.on("error", () => reject(new TryOnServiceError("Cloudinary upload stream failed.", 503, "STORAGE_FAILED")));
    uploader.end(jpeg);
  });
}

function signedResultUrls(publicId) {
  if (!publicId) return { image_url: null, download_url: null };
  // Short-lived URLs allow viewing without exposing public Cloudinary assets.
  const options = {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 900,
  };
  return {
    image_url: cloudinary.utils.private_download_url(publicId, "jpg", options),
    download_url: cloudinary.utils.private_download_url(publicId, "jpg", { ...options, attachment: true }),
  };
}

async function destroyResult(publicId) {
  if (!publicId || !publicId.startsWith("designbyyou_ai/creator_virtual_tryon/")) {
    throw new TryOnServiceError("Invalid stored image identifier.", 400);
  }
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
  if (!result || !["ok", "not found"].includes(result.result)) {
    throw new TryOnServiceError("Could not delete the stored image.", 503, "DELETE_FAILED");
  }
}

module.exports = {
  TryOnServiceError,
  prepareImage,
  startPrediction,
  getPrediction,
  savePrivateResult,
  signedResultUrls,
  destroyResult,
};
