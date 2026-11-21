"use strict";

const sharp = require("sharp");

const views = {
  "Text to Image": ["Result"],
  "Sketch to Image": ["Result"],
  "Background Remover": ["Result"],
  "Pattern Extractor": ["Result"],
  "Costume Extractor": ["Front View", "Back View", "Left Side", "Right Side"],
  "Multi-View Generator": ["Front", "Front (original)", "Right Side", "Back"],
  "Virtual Try-On": ["Result"],
  "Uploaded design": ["Result"],
  "Fashion Editor": ["Result"],
};

async function sanitizeReference(reference) {
  if (!reference || typeof reference.tool !== "string" || !Object.hasOwn(views, reference.tool)) return false;
  const { images } = reference;
  if (!Array.isArray(images) || !images.length || images.length > 4) return false;
  const labels = new Set();
  const cleanImages = [];
  for (const image of images) {
    if (!views[reference.tool].includes(image?.label) || labels.has(image.label)) return false;
    labels.add(image.label);
    const src = image.src;
    if (typeof src !== "string" || src.length > 380000) return false;
    const match = /^data:image\/(webp|png|jpe?g|avif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
    if (!match) return false;
    try {
      const [, format, payload] = match;
      const bytes = Buffer.from(payload, "base64");
      if ((format === "jpg" || format === "jpeg") && bytes.subarray(-2).toString("hex") !== "ffd9") return false;
      if (format === "webp" && (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
          bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8)) return false;
      if (format === "png" && (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
          bytes.subarray(-12).toString("hex") !== "0000000049454e44ae426082")) return false;
      const decoder = sharp(bytes, { limitInputPixels: 1280 * 1280, failOn: "warning" });
      const info = await decoder.metadata();
      const expectedFormat = { jpg: "jpeg", avif: "heif" }[format] || format;
      if (info.format !== expectedFormat || (format === "avif" && info.compression !== "av1") ||
          info.width > 1280 || info.height > 1280 || info.pages > 1) return false;
      // Decode and re-encode so the stored preview contains only rendered pixels.
      const cleaned = await decoder.rotate().webp({ quality: 82 }).toBuffer();
      const data = "data:image/webp;base64," + cleaned.toString("base64");
      if (data.length > 380000) return false;
      cleanImages.push({ label: image.label, src: data });
    } catch { return false; }
    if (Object.keys(image).length !== 2) return false;
  }
  return Object.keys(reference).length === 2 && { tool: reference.tool, images: cleanImages };
}

module.exports = { sanitizeReference };
