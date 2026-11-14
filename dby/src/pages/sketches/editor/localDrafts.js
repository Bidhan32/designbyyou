let connection;
function open() {
  connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("dby-editor-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  }).catch(error => { connection = null; throw error; });
  return connection;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = operation(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || new Error("Draft storage failed"));
    tx.onerror = () => reject(tx.error);
  });
}
export const draftStorage = {
  put: row => transaction("readwrite", store => store.put(row)),
  remove: key => transaction("readwrite", store => store.delete(key)),
  async list(owner) {
    const rows = await transaction("readonly", store => store.getAll());
    return rows.filter(row => row.owner === owner && row.project?.document && Array.isArray(row.project.layers))
      .sort((a,b) => b.updatedAt-a.updatedAt);
  },
};

// Each editor instance owns its keys: two tabs cannot erase each other's drafts.
export function createDraftWriter({ owner, instance, storage = draftStorage, onError = () => {} }) {
  const latest = new Map();
  let queue = Promise.resolve();
  function enqueue(action) { queue = queue.then(action).catch(onError); return queue; }
  return {
    capture(state) {
      if (!owner || !state.persistence.dirty) return;
      const id = state.document.id;
      const row = { key: JSON.stringify([owner,instance,id]), owner, revision: state.revision, updatedAt: Date.now(),
        project: { schemaVersion: 2, document: state.document, layers: state.layers, objects: state.objects,
          activeLayerId: state.activeLayerId, symmetry: state.symmetry } };
      latest.set(id,row);
      // IndexedDB clones the immutable store snapshot inside the queued write.
      return enqueue(() => latest.get(id) === row ? storage.put(row) : undefined);
    },
    saved(id, revision) {
      const row = latest.get(id);
      if (!row || row.revision !== revision) return queue;
      latest.delete(id);
      return enqueue(() => storage.remove(row.key));
    },
    settled: () => queue,
  };
}
