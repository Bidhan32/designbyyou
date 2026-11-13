const CACHE = "dby-showcase-front-v2";
const MAX_ENTRIES = 80;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const memory = new Map();

function address(key) {
  return new URL(`/__showcase_thumbnails/${encodeURIComponent(key)}`, window.location.origin).href;
}

export function rememberThumbnail(key, image) {
  if (memory.size >= MAX_ENTRIES) memory.delete(memory.keys().next().value);
  memory.set(key, image);
}

export function peekThumbnail(key) { return memory.get(key) || null; }

export async function readThumbnail(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(CACHE);
    const response = await cache.match(address(key));
    if (!response) return null;
    if (Date.now() - Number(response.headers.get("x-created-at")) > MAX_AGE) {
      await cache.delete(address(key));
      return null;
    }
    const image = await response.text();
    if (!image.startsWith("data:image/") || image.length > 300000) return null;
    rememberThumbnail(key, image);
    return image;
  } catch { return null; } // Storage disabled or quota exhausted: use the live preview.
}

let writes = Promise.resolve();
export function saveThumbnail(key, image) {
  rememberThumbnail(key, image);
  writes = writes.then(async () => {
    if (typeof caches === "undefined" || image.length > 300000) return;
    const cache = await caches.open(CACHE);
    await cache.put(address(key), new Response(image, { headers: { "x-created-at": String(Date.now()) } }));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map(entry => cache.delete(entry)));
  }).catch(() => {});
  return writes;
}

export function createQueue(limit) {
  let running = 0;
  const waiting = [];
  function drain() {
    while (running < limit && waiting.length) {
      const { task, resolve, reject } = waiting.shift();
      running++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { running--; drain(); });
    }
  }
  return task => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); drain(); });
}
