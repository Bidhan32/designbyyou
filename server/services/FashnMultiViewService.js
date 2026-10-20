"use strict";

/**
 * DesignByYou Multi-View service, FASHN Edit prototype.
 * Source and reference inputs reach FASHN as data URIs.
 * Inputs and outputs are stored as authenticated Cloudinary assets for private history.
 */
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

const FASHN_BASE = "https://api.fashn.ai/v1";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const VALID_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const VALID_FORMATS = new Set(["jpeg", "png", "webp"]);
const STORE_FOLDER = "designbyyou_ai/creator_multi_view";

class MultiViewError extends Error {
  constructor(message, status = 502, code = "MULTIVIEW_ERROR") {
    super(message);
    this.name = "MultiViewError";
    this.status = status;
    this.code = code;
  }
}

function apiKey() {
  const value = String(process.env.FASHN_API_KEY || "").trim();
  if (!value) throw new MultiViewError("FASHN is not configured.", 503, "PROVIDER_NOT_CONFIGURED");
  return value;
}

async function fashnJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${FASHN_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    if (e instanceof MultiViewError) throw e;
    throw new MultiViewError("FASHN did not respond in time.", 503, "PROVIDER_UNREACHABLE");
  }
  const maxBytes = 26 * 1024 * 1024;
  if (Number(response.headers.get("content-length") || 0) > maxBytes || !response.body) {
    throw new MultiViewError("FASHN response is invalid or too large.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new MultiViewError("FASHN response exceeded the limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new MultiViewError("FASHN returned invalid JSON."); }
  if (!response.ok) {
    const providerCode = typeof data?.error === "string" ? data.error : data?.error?.name;
    console.error("[MultiView] FASHN request rejected:", { status: response.status, providerCode });
    const http = response.status === 429 ? 429 : [401, 403].includes(response.status) ? 503 : 502;
    throw new MultiViewError("FASHN could not accept this view request.", http, "PROVIDER_REJECTED");
  }
  const header = response.headers.get("x-fashn-credits-used");
  const credits = header != null && Number.isFinite(Number(header)) ? Number(header) : null;
  return { data, credits };
}

async function prepareUpload(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length < 32 ||
      file.buffer.length > MAX_UPLOAD_BYTES || !VALID_MIME.has(file.mimetype)) {
    throw new MultiViewError("Upload a JPG, PNG, or WebP image up to 8 MB.", 400, "INVALID_IMAGE");
  }
  try {
    const pipeline = sharp(file.buffer, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await pipeline.metadata();
    if (!VALID_FORMATS.has(meta.format) || !meta.width || !meta.height ||
        meta.width < 128 || meta.height < 128 || meta.width > 9000 || meta.height > 9000) {
      throw new Error("Unsupported image format or size");
    }
    // JPEG uniform output; 1600px long dimension is adequate for 1K Edit input.
    const buffer = await pipeline.rotate().flatten({ background: "#ffffff" })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    if (buffer.length > 6 * 1024 * 1024) throw new Error("Normalized image exceeds size limit");
    return buffer;
  } catch {
    throw new MultiViewError("The image could not be processed. Try a different JPG, PNG or WebP.", 400, "INVALID_IMAGE");
  }
}

const toDataUri = (buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`;

function cloudinaryUpload(buffer, publicId, overwrite = false) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: "image", type: "authenticated", public_id: publicId,
      format: "jpg", overwrite,
    }, (error, result) => {
      if (error || !result?.public_id) {
        return reject(new MultiViewError("Could not securely save an image.", 503, "STORAGE_FAILED"));
      }
      resolve(result.public_id);
    });
    stream.on("error", () => reject(new MultiViewError("Image upload failed.", 503, "STORAGE_FAILED")));
    stream.end(buffer);
  });
}

function storageId(creatorId, jobId, view) {
  return `${STORE_FOLDER}/${creatorId}/${jobId}/${view}`;
}

async function saveImage(buffer, creatorId, jobId, view) {
  return cloudinaryUpload(buffer, storageId(creatorId, jobId, view));
}

function signedUrls(publicId) {
  if (!publicId || !publicId.startsWith(`${STORE_FOLDER}/`)) {
    return { image_url: null, download_url: null };
  }
  const options = {
    resource_type: "image", type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 900,
  };
  return {
    image_url: cloudinary.utils.private_download_url(publicId, "jpg", options),
    download_url: cloudinary.utils.private_download_url(publicId, "jpg", { ...options, attachment: true }),
  };
}

function viewPrompt({ view, subjectType, keepBackground, instruction }) {
  // Garment-only mode is a product-only pipeline. In particular, NEVER treat
  // a photograph of somebody wearing a jacket as the final front product view.
  const product = subjectType === "garment";
  const design = "Preserve the original garment's fabric, color, check pattern, " +
    "collar, buttons, lapels, pockets, sleeve and cuff lengths, stitching, " +
    "seams, construction and silhouette. Do not redesign the item.";
  const productRules = [
    "Product catalog photography of ONE GARMENT ONLY, isolated and upright.",
    "Invisible ghost-mannequin apparel packshot; do not show the mannequin itself.",
    "ABSOLUTELY NO humans, faces, skin, hair, neck, hands, legs, trousers, " +
      "visible mannequin, torso, hanger, arms or other garments.",
    "Show the COMPLETE item with both sleeves, full hem, collar and cuffs " +
      "in frame. Do not crop, flatten or cut off parts of the garment.",
    "Same neutral pale-gray studio backdrop, soft diffuse lighting and " +
      "matching garment scale for every view.",
  ];

  if (product && view === "front") {
    return [
      "EXTRACT THE GARMENT FROM THE PERSON IN THE REFERENCE PHOTO.",
      "Remove the person completely, including the entire head, face, neck, " +
        "body, skin, hands and trousers. The person must NOT appear in the result.",
      "Reconstruct the garment as a clean, standalone FRONT-VIEW ecommerce " +
        "product photograph. Select the single main outer garment (for example, " +
        "the blazer or jacket), not the undershirt, trousers or whole outfit. " +
        "Present it in a natural upright ghost-mannequin shape.",
      ...productRules,
      design,
      "The image must show the actual front of the garment, not a human model.",
      instruction ? `Additional garment details: ${instruction}` : "",
    ].filter(Boolean).join(" ");
  }

  if (product) {
    const angle = view === "side"
      ? "EXACT RIGHT-SIDE PROFILE, 90 degrees from the front, with a side-on " +
        "outline and realistic garment thickness, both shoulder and hem correctly aligned"
      : "EXACT BACK VIEW, 180 degrees from the front, showing the complete rear " +
        "collar, shoulder seams, back panels, sleeves and full rear hem";
    return [
      "This is a matched-angle catalog PRODUCT VIEW of the SAME SINGLE GARMENT " +
        "shown in the source packshot, NOT a person or fashion model.",
      `Rotate the product to the ${angle}.`,
      ...productRules,
      design,
      "Keep the framing, garment scale, neutral background and lighting " +
        "consistent with the front packshot.",
      "Do not show the garment being worn by any person, even partially.",
      "Infer unseen rear details conservatively; do not invent decorative features.",
      instruction ? `Additional garment details: ${instruction}` : "",
    ].filter(Boolean).join(" ");
  }

  const angle = view === "side"
    ? "a strict 90-degree right-side profile"
    : "a strict 180-degree rear view";
  return [
    "This is a MULTI-VIEW FASHION PHOTO CONSISTENCY edit, not a redesign.",
    `Show the SAME person wearing the SAME garment from ${angle}.`,
    design,
    keepBackground
      ? "Keep the original scene, lighting and approximate framing."
      : "Use a neutral pale-gray studio background and consistent lighting.",
    "Do not change the person's clothing, size, accessories or garment texture.",
    instruction ? `Additional designer guidance: ${instruction}` : "",
  ].filter(Boolean).join(" ");
}

async function startView({ sourceBuffer, contextBuffer, view, subjectType, keepBackground, instruction, generationMode, seed }) {
  if (!["front", "side", "back"].includes(view) ||
    (view === "front" && subjectType !== "garment")) {
    throw new MultiViewError("Invalid view for this generation type.", 400);
  }
  const inputs = {
    image: toDataUri(sourceBuffer),
    prompt: viewPrompt({ view, subjectType, keepBackground, instruction }),
    resolution: "1k", generation_mode: generationMode,
    seed, num_images: 1, output_format: "jpeg", return_base64: true,
  };
  // Additional context is only used when creating the normalized front;
  // a model photo fed into subsequent edits could reintroduce the person.
  if (contextBuffer && (subjectType === "model" || view === "front")) {
    inputs.image_context = toDataUri(contextBuffer);
  }
  const { data } = await fashnJson("/run", { method: "POST", body: { model_name: "edit", inputs } });
  if (typeof data?.id !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id)) {
    throw new MultiViewError("FASHN did not return a prediction ID.");
  }
  return data.id;
}

// Fetch only a known, authenticated asset created inside this Creator's job.
// Used when continuing a multi-view set in a subsequent HTTP request.
async function readStoredImage(publicId, creatorId, jobId, view = "front") {
  if (publicId !== storageId(creatorId, jobId, view)) {
    throw new MultiViewError("Stored view reference is invalid.", 400, "INVALID_STORED_IMAGE");
  }
  const link = signedUrls(publicId).image_url;
  const url = new URL(link);
  if (url.protocol !== "https:" || url.hostname !== "api.cloudinary.com") {
    throw new MultiViewError("Stored image source is invalid.");
  }
  let response;
  try {
    response = await fetch(link, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new MultiViewError("Could not retrieve the normalized garment front.", 503, "STORAGE_READ_FAILED");
  }
  const max = 12 * 1024 * 1024;
  if (!response.ok || Number(response.headers.get("content-length") || 0) > max) {
    throw new MultiViewError("Could not retrieve the normalized garment front.", 503, "STORAGE_READ_FAILED");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new MultiViewError("Stored garment image is empty.");
  const chunks = [];
  let n = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > max) {
        await reader.cancel();
        throw new MultiViewError("Stored garment image exceeds the safety limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  try {
    return await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate().flatten({ background: "#f0f0f0" })
      .jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw new MultiViewError("The normalized garment image is invalid.", 503, "STORAGE_READ_FAILED");
  }
}

function predictionStatus(predictionId) {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(predictionId)) {
    throw new MultiViewError("Invalid prediction ID.", 400);
  }
  return fashnJson(`/status/${encodeURIComponent(predictionId)}`);
}

function decodeOutput(dataUri) {
  const match = typeof dataUri === "string" && dataUri.length < Math.ceil(MAX_OUTPUT_BYTES * 4 / 3) + 120
    ? /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri)
    : null;
  if (!match) throw new MultiViewError("FASHN returned an unsupported result image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 64 || bytes.length > MAX_OUTPUT_BYTES) throw new MultiViewError("FASHN image exceeds allowed size.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if ((match[1] === "jpeg" && !jpeg) || (match[1] === "png" && !png)) throw new MultiViewError("Invalid image signature.");
  return bytes;
}

async function saveOutput(dataUri, creatorId, jobId, view) {
  const original = decodeOutput(dataUri);
  const jpeg = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().jpeg({ quality: 91, mozjpeg: true }).toBuffer();
  return cloudinaryUpload(jpeg, storageId(creatorId, jobId, view), true);
}

async function destroyImage(publicId) {
  if (!publicId || !publicId.startsWith(`${STORE_FOLDER}/`)) return;
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
  if (result && !["ok", "not found"].includes(result.result)) {
    throw new MultiViewError("Cloudinary could not delete an image.", 503, "STORAGE_DELETE_FAILED");
  }
}

module.exports = {
  MultiViewError, prepareUpload, startView, predictionStatus,
  saveImage, saveOutput, signedUrls, destroyImage, readStoredImage,
};
