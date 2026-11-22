"use strict";

const sharp = require("sharp");
const cloud = require("cloudinary").v2;
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const maxBytes = 96 * 1024 * 1024;
const align = n => Math.ceil(n / 4) * 4;
const localDirectory = path.resolve(__dirname, "../../.private-models");

function localModelPath(owner, jobId) {
  if (![owner, jobId].every(value => /^[a-f\d-]{36}$/i.test(value))) throw new Error("Invalid model identity");
  return path.join(localDirectory, owner, jobId + ".glb");
}

async function prepareModel(bytes) {
  if (bytes.length < 28 || bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error("Invalid GLB");
  if (bytes.length < 8 * 1024 * 1024) return bytes;
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString("utf8", 20, jsonEnd));
  if (bytes.toString("ascii", jsonEnd + 4, jsonEnd + 8) !== "BIN\0" || doc.buffers?.length !== 1) return bytes;
  const bin = bytes.subarray(jsonEnd + 8);
  const views = doc.bufferViews;
  const replacements = [];
  for (const image of doc.images || []) {
    const view = views[image.bufferView];
    if (!view || view.buffer !== 0 || view.byteLength < 1024 * 1024 ||
        !["image/png", "image/jpeg"].includes(image.mimeType)) continue;
    const start = view.byteOffset || 0;
    const end = start + view.byteLength;
    if (views.some(v => v !== view && (v.byteOffset || 0) < end && (v.byteOffset || 0) + v.byteLength > start) ||
        doc.images.some(i => i !== image && i.bufferView === image.bufferView)) continue;
    const input = sharp(bin.subarray(start, end), { limitInputPixels: 64 * 1024 * 1024 });
    const { isOpaque } = await input.stats();
    const texture = input.resize(2048, 2048, { fit: "inside", withoutEnlargement: true });
    const out = isOpaque ? await texture.jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer()
      : await texture.png().toBuffer();
    if (out.length >= view.byteLength) continue;
    if (isOpaque) image.mimeType = "image/jpeg";
    replacements.push({ view, start, end, out });
  }
  if (!replacements.length) return bytes;
  // Splice only the texture ranges. Keep every geometry byte and every subsequent view aligned.
  replacements.sort((a, b) => a.start - b.start);
  const chunks = [];
  let cursor = 0;
  for (const part of replacements) {
    const padding = (part.end - part.start - part.out.length) % 4;
    chunks.push(bin.subarray(cursor, part.start), part.out, Buffer.alloc(padding));
    part.removed = part.end - part.start - part.out.length - padding;
    part.view.byteLength = part.out.length;
    cursor = part.end;
  }
  chunks.push(bin.subarray(cursor));
  for (const view of views) {
    const offset = view.byteOffset || 0;
    view.byteOffset = replacements.reduce((n, r) => n - (r.end <= offset ? r.removed : 0), offset);
  }
  doc.buffers[0].byteLength -= replacements.reduce((n, r) => n + r.removed, 0);
  const binary = Buffer.concat(chunks);
  const json = Buffer.from(JSON.stringify(doc));
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(align(json.length), 12);
  header.writeUInt32LE(28 + align(json.length) + binary.length, 8);
  const binHeader = Buffer.from(bytes.subarray(jsonEnd, jsonEnd + 8));
  binHeader.writeUInt32LE(binary.length);
  return Buffer.concat([header, json, Buffer.alloc(align(json.length) - json.length, 32), binHeader, binary]);
}

async function storeModel(url, publicId, owner, jobId) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(90000) });
  if (!response.ok || !response.body) throw new Error("Model download failed");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Model exceeds download limit");
    chunks.push(chunk);
  }
  const file = await prepareModel(Buffer.concat(chunks));
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)) {
    const destination = localModelPath(owner, jobId);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temp = destination + "." + randomUUID();
    try {
      await fs.writeFile(temp, file, { flag: "wx", mode: 0o600 });
      await fs.rename(temp, destination);
    } finally { await fs.rm(temp, { force: true }); }
    return "local:" + jobId;
  }
  const cfg = cloud.config();
  const params = { timestamp: String(Math.floor(Date.now()/1000)), type: "authenticated", public_id: publicId, overwrite: "true" };
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("api_key", cfg.api_key);
  form.append("signature", cloud.utils.api_sign_request(params, cfg.api_secret));
  form.append("file", new Blob([file], { type: "model/gltf-binary" }), "model.glb");
  const upload = await fetch(cloud.utils.api_url("upload", { resource_type: "raw" }), {
    method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(90000),
  });
  if (!upload.ok) {
    // The model has already been generated. Pass its validated bytes to the
    // job worker for private database storage when raw uploads are forbidden.
    if (upload.status === 403 && owner && jobId) {
      await upload.body?.cancel();
      return file;
    }
    const detail = await upload.json().catch(() => ({}));
    const reason = String(detail.error?.message || "");
    const category = /size|too large/i.test(reason) ? "SIZE" : /folder|permission|allowed/i.test(reason) ? "PERMISSION" : "UPLOAD";
    throw Object.assign(new Error("Model upload failed"), { code: "CLOUDINARY_" + upload.status + "_" + category });
  }
  if ((await upload.json()).public_id !== publicId) throw new Error("Storage returned an unexpected model ID");
  return publicId;
}

module.exports = { storeModel, prepareModel, localModelPath };
