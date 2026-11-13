import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import API from "../../api/axios";

const GarmentPreview = lazy(() => import("./ShowcaseGarment3D"));
const thumbnails = new Map();
let pending = Promise.resolve();

// Share one rendering slot across the feed. Finished cards contain only an image.
function enqueue(task) {
  pending = pending.then(task, task).catch(() => {});
}

export default function ShowcaseThumbnail({ item }) {
  const host = useRef(null);
  const finish = useRef(null);
  const [preview, setPreview] = useState(null);
  const [image, setImage] = useState(null);
  const [fallback, setFallback] = useState(false);
  const slug = item.slug;
  const isGarment = item.source_type === "fashion_editor";
  const key = `${slug}:${item.updated_at || item.created_at}:${item.watermarked_preview_url}`;
  const captured = useCallback((url) => finish.current?.(url), []);
  const failed = useCallback(() => finish.current?.(null), []);

  useEffect(() => {
    if (!isGarment || !slug) return;
    let active = true;
    let queued = false;
    const controller = new AbortController();
    const schedule = () => {
      if (queued) return;
      queued = true;
      enqueue(async () => {
        if (!active) return;
        if (thumbnails.has(key)) {
          setImage(thumbnails.get(key));
          return;
        }
        let timeout;
        try {
          const response = await API.get(`/creator-showcase/item/${encodeURIComponent(slug)}`, {
            signal: controller.signal, timeout: 15000,
          });
          if (!active) return;
          const garment = response.data?.data?.preview_3d;
          if (!garment) { setFallback(true); return; }
          const result = await new Promise((resolve) => {
            finish.current = resolve;
            timeout = setTimeout(() => resolve(null), 20000);
            setPreview(garment);
          });
          if (!active) return;
          setPreview(null);
          if (result) {
            // Bound retained image memory when browsing many pages.
            if (thumbnails.size >= 80) thumbnails.delete(thumbnails.keys().next().value);
            thumbnails.set(key, result);
            setImage(result);
          } else setFallback(true);
        } catch {
          if (active) setFallback(true);
        } finally {
          clearTimeout(timeout);
          finish.current = null;
        }
      });
    };
    const observer = typeof IntersectionObserver === "undefined" ? null :
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { schedule(); observer.disconnect(); }
      }, { rootMargin: "200px" });
    if (observer && host.current) observer.observe(host.current);
    else schedule();
    return () => {
      active = false;
      observer?.disconnect();
      controller.abort();
      finish.current?.(null);
    };
  }, [isGarment, slug, key]);

  const source = image || ((!isGarment || fallback) ? item.watermarked_preview_url : null);
  return (
    <div ref={host} className="relative h-full w-full bg-slate-100 dark:bg-slate-800">
      {source ? <img src={source} alt={item.title || "Showcase design"}
        loading="lazy" decoding="async"
        className={`h-full w-full ${image ? "object-contain" : "object-cover"}`} /> :
        <div className="flex h-full items-center justify-center text-sm text-slate-500" role="status">
          {isGarment && !fallback ? "Preparing 3D preview…" : "Preview unavailable"}
        </div>}
      {preview && <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Suspense fallback={null}>
          <GarmentPreview preview={preview} onSnapshot={captured} onError={failed} />
        </Suspense>
      </div>}
    </div>
  );
}
