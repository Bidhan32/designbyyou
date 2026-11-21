import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.helpers.js";

export const destinations = {
  "fashion-editor": "Fashion Editor",
  upload: "Upload Your Creation",
  "text-to-image": "Text to Image · prompt with reference",
  "sketch-to-image": "Sketch to Image",
  "background-remover": "Background Remover",
  "costume-extractor": "Costume Extractor",
  "multi-view-generator": "Front, Side & Back Views",
  "virtual-try-on": "Virtual Try-On",
  "pattern-extractor": "Pattern Extractor",
  "image-to-3d": "Image to 3D",
};

// Keep private pixels within this tab. Only the random handoff ID enters history.
export function toolPath(key) {
  return (key === "fashion-editor" || key === "upload" ? "/creator/" : "/creator/tools/") + key;
}

let pending;
export async function prepareHandoff(src, owner, destination) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  // Reference prompts travel as base64 in a 2 MB JSON request. Other tools
  // receive multipart files. Preserve alpha and use the largest size that fits.
  const limit = destination === "text-to-image" ? 1400000 : 5000000;
  const canvas = document.createElement("canvas");
  let blob;
  for (const side of [2048, 1440, 1024, 768, 512]) {
    const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.94));
    if (blob && blob.size <= limit) break;
  }
  if (!blob || blob.size > limit) throw new Error("Image conversion failed");
  const file = new File([blob], blob.type === "image/png" ? "result.png" : "result.webp", { type: blob.type });
  const id = crypto.randomUUID();
  pending = { owner, destination, id, file };
  return id;
}

export function useToolHandoff(accept, ready = true) {
  const { user } = useAuth();
  const { pathname, state } = useLocation();
  useEffect(() => {
    if (!ready || !pending || pending.id !== state?.handoff || pending.owner !== user?.id ||
        pathname !== toolPath(pending.destination)) return;
    const { file } = pending;
    pending = null;
    accept(file);
  }, [user?.id, pathname, state, accept, ready]);
}
