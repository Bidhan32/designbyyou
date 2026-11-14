import { useCallback, useEffect, useRef, useState } from "react";
import { createDraftWriter, draftStorage } from "./localDrafts";

export default function useDraftRecovery(store, owner, storage = draftStorage) {
  const writer = useRef(null);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const fail = () => { if(active) setError("Browser backup unavailable. Keep this tab open and download a copy before leaving."); };
    const current = createDraftWriter({ owner, instance: crypto.randomUUID(), storage, onError: fail });
    writer.current = current;
    storage.list(owner).then(rows => { if(active) setDrafts(rows); }).catch(fail);
    // A write on every document revision avoids waiting for a debounce at logout.
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.persistence.dirty && (state.revision !== previous.revision || !previous.persistence.dirty || state.document !== previous.document)) {
        void current.capture(state);
      }
    });
    return () => { active = false; unsubscribe(); writer.current = null; };
  }, [store, owner, storage]);
  const saved = useCallback((id, revision) => writer.current?.saved(id, revision), []);
  return { drafts, error, saved,
    async discard(row) {
      if (row.owner !== owner) return;
      try { await storage.remove(row.key); setDrafts(items => items.filter(item => item.key !== row.key)); }
      catch { setError("Could not remove the browser draft. Please try again."); }
    },
  };
}
