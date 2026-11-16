import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CreatorVirtualTryOn = lazy(() => import("./CreatorVirtualTryOn"));

async function garmentFile(url, signal) {
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

function TryOnDialog({ imageUrl, renderSnapshot, onClose }) {
  const dialog = useRef(null);
  const [snapshot, setSnapshot] = useState(undefined);
  const [garment, setGarment] = useState(undefined);
  const failed = useCallback(() => setSnapshot(null), []);

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);

  const needsSnapshot = Boolean(renderSnapshot);
  useEffect(() => {
    if (!needsSnapshot || snapshot !== undefined) return;
    const timer = setTimeout(failed, 25000);
    return () => clearTimeout(timer);
  }, [needsSnapshot, snapshot, failed]);

  useEffect(() => {
    if (needsSnapshot && snapshot === undefined) return;
    const controller = new AbortController();
    const load = async () => {
      for (const url of new Set([snapshot, imageUrl].filter(Boolean))) {
        try {
          const file = await garmentFile(url, controller.signal);
          if (!controller.signal.aborted) setGarment(file);
          return;
        } catch { if (controller.signal.aborted) return; }
      }
      setGarment(null);
    };
    void load();
    return () => controller.abort();
  }, [snapshot, imageUrl, needsSnapshot]);

  return createPortal(
    <dialog ref={dialog} aria-label="Virtual try-on" onCancel={onClose}
      onKeyDown={event => event.stopPropagation()}
      className="fixed inset-0 m-auto max-h-[94dvh] w-[min(96vw,64rem)] overflow-y-auto overscroll-contain rounded-md border border-line bg-canvas p-0 text-ink backdrop:bg-black/60">
      <div className="sticky top-0 z-10 flex justify-end border-b border-line bg-surface px-3 py-2">
        <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1 text-sm">Close try-on</button>
      </div>
      {renderSnapshot && snapshot === undefined && <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0">
        <div className="h-[960px] w-[768px]"><Suspense fallback={null}>{renderSnapshot(setSnapshot, failed)}</Suspense></div>
      </div>}
      <Suspense fallback={<p role="status" className="p-4">Opening virtual try-on…</p>}>
        {garment === undefined ? <p role="status" className="p-4">Preparing garment image…</p> :
          <CreatorVirtualTryOn embedded initialGarment={garment} />}
      </Suspense>
    </dialog>, document.body);
}

export default function TryOnButton({ imageUrl, renderSnapshot, className, disabled }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" disabled={disabled} className={className} onClick={() => setOpen(true)}>Virtual try-on</button>
    {open && <TryOnDialog imageUrl={imageUrl} renderSnapshot={renderSnapshot} onClose={() => setOpen(false)} />}
  </>;
}
