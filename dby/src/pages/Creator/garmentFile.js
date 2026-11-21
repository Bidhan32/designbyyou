export default async function garmentFile(url, signal) {
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("Image unavailable");
  const blob = await response.blob();
  const extensions = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
  if (blob.size && blob.size <= 12 * 1024 * 1024 && extensions[blob.type]) {
    return new File([blob], "garment." + extensions[blob.type], { type: blob.type });
  }
  // Flatten other browser-readable image formats and resize large originals.
  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);
  try {
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!jpeg?.size) throw new Error("Image unavailable");
    return new File([jpeg], "garment.jpg", { type: jpeg.type });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

