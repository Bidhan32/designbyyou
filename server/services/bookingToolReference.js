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
    if (typeof src !== "string" || src.length > 380000 || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return false;
    try {
      const bytes = Buffer.from(src.slice("data:image/webp;base64,".length), "base64");
      if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
          bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
      const decoder = sharp(bytes, { limitInputPixels: 1280 * 1280, failOn: "warning" });
      const info = await decoder.metadata();
      if (info.format !== "webp" || info.width > 1280 || info.height > 1280 || info.pages > 1) return false;
      // Decode and re-encode so the stored preview contains only rendered pixels.
      const cleaned = await decoder.webp({ quality: 82 }).toBuffer();
      const data = "data:image/webp;base64," + cleaned.toString("base64");
      if (data.length > 380000) return false;
      cleanImages.push({ label: image.label, src: data });
    } catch { return false; }
    if (Object.keys(image).length !== 2) return false;
  }
  return Object.keys(reference).length === 2 && { tool: reference.tool, images: cleanImages };
}

module.exports = { sanitizeReference };
