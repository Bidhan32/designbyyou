import { useEffect, useRef } from "react";

// Save after a short pause, or at least every ten seconds while editing.
export default function useCloudAutosave({ dirty, revision, blocked, saving, failed, onSave, delay = 1500, maxWait = 10000, retryDelay = 15000 }) {
  const firstChange = useRef(null);
  const save = useRef(onSave);
  useEffect(() => { save.current = onSave; }, [onSave]);
  useEffect(() => {
    if (!dirty) { firstChange.current = null; return; }
    if (blocked || saving) return;
    firstChange.current ??= Date.now();
    const wait = failed ? retryDelay : Math.min(delay, Math.max(0, maxWait - (Date.now() - firstChange.current)));
    const timer = window.setTimeout(() => {
      firstChange.current = null;
      void save.current(null, { silent: true, automatic: true });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [dirty, revision, blocked, saving, failed, delay, maxWait, retryDelay]);
}
