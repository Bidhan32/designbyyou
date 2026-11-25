"use strict";

/**
 * Standalone Creator Virtual Try-On, separate from booking virtual try-on.
 * Sensitive source photos stay in memory and are sent to the provider as data URIs.
 * Only generated JPEG results are saved, as authenticated Cloudinary assets.
 */
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

const falTryOn = require("./ai/falTryOn");
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
  if ([401, 402, 403].includes(response.status)) {
    await response.body?.cancel();
    console.warn("[FASHN] Access denied", { status: response.status });
    throw new TryOnServiceError("The fitting provider is temporarily unavailable.", 503, "PROVIDER_ACCESS_DENIED");
  }
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
  return falTryOn.startPrediction({ personImage: personDataUri, garmentImage: garmentDataUri, category, mode, garmentPhotoType });
}

async function startRunwayPrediction(input) {
  if (process.env.FAL_KEY?.trim()) {
    try {
      return {provider:"fal",model:falTryOn.FAL_MODEL,id:await startPrediction(input)};
    } catch (err) {
      // Only switch on a definite access rejection. A timeout may already have started a job.
      if (![401,402,403].includes(err.status)) throw err;
      console.warn("[Runway] fal denied try-on submission",{status:err.status});
      if (!process.env.FASHN_API_KEY?.trim()) throw new TryOnServiceError("Runway provider access is unavailable.",503,"PROVIDER_ACCESS_DENIED");
    }
  }
  const {data}=await fetchJson("/run",{method:"POST",body:{model_name:"tryon-v1.6",inputs:{
    model_image:input.personDataUri,garment_image:input.garmentDataUri,category:input.category,
    garment_photo_type:input.garmentPhotoType,mode:input.mode,return_base64:true,output_format:"jpeg"
  }}});
  if(typeof data?.id!=="string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id))throw new TryOnServiceError("Invalid runway prediction ID.");
  return {provider:"fashn",model:"tryon-v1.6",id:data.id};
}

async function removeRunwayBackground(image) {
  const {removeBackground}=require("./FalBackgroundRemoverService");
  try {
    return await removeBackground(image);
  } catch(err) {
    if (!["PROVIDER_AUTH_ERROR","NOT_CONFIGURED"].includes(err.code) || !process.env.FASHN_API_KEY?.trim()) throw err;
  }
  const {data}=await fetchJson("/run",{method:"POST",body:{model_name:"background-remove",inputs:{image,return_base64:true}}});
  if(typeof data?.id!=="string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id))throw new TryOnServiceError("Invalid background removal ID.");
  const deadline=Date.now()+75000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,1500));
    const result=await getPrediction(data.id,"fashn");
    if(result.data.status==="failed")throw new TryOnServiceError("Runway background removal failed.");
    if(result.data.status==="completed"){
      const png = decodeOutput(result.data.output?.[0]);
      if (!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        throw new TryOnServiceError("Invalid background removal result.");
      }
      return { dataUri: "data:image/png;base64," + png.toString("base64") };
    }
  }
  throw new TryOnServiceError("Runway background removal timed out.",504);
}
async function getPrediction(predictionId, provider) {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(predictionId)) {
    throw new TryOnServiceError("Invalid prediction ID.", 400);
  }
  if (provider === "fal") {
    const data = await falTryOn.getPredictionStatus(predictionId);
    return { data, credits: null };
  }
  if (provider !== "fashn") throw new TryOnServiceError("Unknown try-on provider.");
  return fetchJson(`/status/${encodeURIComponent(predictionId)}`);
}

function decodeOutput(output) {
  if (typeof output !== "string" || output.length > Math.ceil(MAX_OUTPUT * 4 / 3) + 100) {
    throw new TryOnServiceError("FASHN returned an invalid output image.");
  }
  const match = /^(?:data:image\/(jpeg|jpg|png|webp);base64,)?([A-Za-z0-9+/]+={0,2})$/i.exec(output);
  if (!match) throw new TryOnServiceError("FASHN output is not a supported base64 image.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 64 || buffer.length > MAX_OUTPUT) throw new TryOnServiceError("FASHN output size is invalid.");
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const format = jpeg ? "jpeg" : png ? "png" : webp ? "webp" : null;
  if (!format || (match[1] && match[1].toLowerCase().replace("jpg", "jpeg") !== format)) {
    throw new TryOnServiceError("FASHN output image signature is invalid.");
  }
  return buffer;
}

async function savePrivateResult(outputDataUri, creatorId, jobId, weekly = false) {
  const buffer = decodeOutput(outputDataUri);
  const jpeg = await sharp(buffer, { limitInputPixels: 32_000_000 })
    .rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  let image = jpeg;
  if (weekly) {
    const {dataUri} = await removeRunwayBackground("data:image/jpeg;base64," + jpeg.toString("base64"));
    image = await require("./frameRunwayCutout")(Buffer.from(dataUri.split(",")[1],"base64"));
  }
  return new Promise((resolve, reject) => {
    const uploader = cloudinary.uploader.upload_stream({
      // The callback settles our promise. Disable the SDK's second rejection path.
      disable_promises: true,
      resource_type: "image",
      type: "authenticated",
      folder: "designbyyou_ai/creator_virtual_tryon",
      public_id: `${creatorId}_${jobId}${weekly ? "_framed_cutout" : ""}`,
      overwrite: false,
      format: weekly ? "webp" : "jpg",
    }, (err, result) => {
      if (err || !result?.public_id) {
        const failure = new TryOnServiceError("Could not save the generated image securely.", 503, "STORAGE_FAILED");
        failure.httpStatus = Number(err?.http_code) || undefined;
        reject(failure);
      } else {
        resolve(result.public_id);
      }
    });
    uploader.on("error", () => reject(new TryOnServiceError("Cloudinary upload stream failed.", 503, "STORAGE_FAILED")));
    uploader.end(image);
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
    image_url: cloudinary.utils.private_download_url(publicId, publicId.endsWith("_cutout") ? "webp" : "jpg", options),
    download_url: cloudinary.utils.private_download_url(publicId, publicId.endsWith("_cutout") ? "webp" : "jpg", { ...options, attachment: true }),
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
  FAL_MODEL: falTryOn.FAL_MODEL,
  TryOnServiceError,
  prepareImage,
  startPrediction,
  startRunwayPrediction, removeRunwayBackground,
  getPrediction,
  savePrivateResult,
  signedResultUrls,
  destroyResult,
};
