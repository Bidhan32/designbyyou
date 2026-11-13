import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import API from "../../api/axios";

import { createQueue, peekThumbnail, readThumbnail, saveThumbnail } from "./showcaseThumbnailCache";
const loadRenderer = () => import("./ShowcaseGarment3D");
const GarmentPreview = lazy(loadRenderer);
const download = createQueue(3);
const render = createQueue(1);
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
      void (async () => {
        if (!active) return;
        const cached = await readThumbnail(key);
        if (!active) return;
        if (cached) { setImage(cached); return; }
        let timeout;
        try {
          const response = await download(() => active ? API.get(`/creator-showcase/preview/${encodeURIComponent(slug)}`, {
            signal: controller.signal, timeout: 10000,
          }) : null);
          if (!active) return;
          const garment = response.data?.data?.preview_3d;
          if (!garment) { setFallback(true); return; }
          // Overlap model downloads with other cards, but keep GPU work serial.
          void loadRenderer().catch(() => {});
          void import("./preloadShowcaseGarment").then(module => {
            if (active) module.preloadShowcaseGarment(garment.model);
          }).catch(() => {});
          const result = await render(() => {
            if (!active) return null;
            const existing = peekThumbnail(key);
            if (existing) return existing;
            return new Promise((resolve) => {
            finish.current = resolve;
            timeout = setTimeout(() => resolve(null), 12000);
            setPreview(garment);
            });
          });
          if (!active) return;
          setPreview(null);
          if (result) {
            saveThumbnail(key, result);
            setImage(result);
          } else setFallback(true);
        } catch {
          if (active) setFallback(true);
        } finally {
          clearTimeout(timeout);
          finish.current = null;
        }
      })();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null :
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { schedule(); observer.disconnect(); }
      }, { rootMargin: "500px" });
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
          {isGarment && !fallback ? <><span aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-200 motion-reduce:animate-none dark:bg-slate-700" /><span className="relative">Loading preview…</span></> : "Preview unavailable"}
        </div>}
      {preview && <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-[400px] w-[320px] opacity-0">
        <Suspense fallback={null}>
          <GarmentPreview preview={preview} onSnapshot={captured} onError={failed} />
        </Suspense>
      </div>}
    </div>
  );
}
