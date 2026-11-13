import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/Creator/showcaseThumbnailCache.js', import.meta.url), 'utf8');
const fresh = suffix => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${suffix}`);
const entries = new Map();
globalThis.window = { location: { origin: 'https://test.invalid' } };
globalThis.caches = { open: async () => ({
  match: async key => entries.get(key)?.clone(),
  put: async (key, response) => entries.set(key, response),
  delete: async key => entries.delete(key),
  keys: async () => [...entries.keys()],
}) };
const first = await fresh('first');
await first.saveThumbnail('design:version1', 'data:image/webp;base64,ONE');
const reloaded = await fresh('reload');
assert.equal(reloaded.peekThumbnail('design:version1'), null);
assert.equal(await reloaded.readThumbnail('design:version1'), 'data:image/webp;base64,ONE', 'A new page reuses stored 3D thumbnails');
assert.equal(await reloaded.readThumbnail('design:version2'), null, 'Republishing invalidates the previous thumbnail');
for (let i = 0; i < 90; i++) await first.saveThumbnail(`design:${i}`, 'data:image/webp;base64,ONE');
assert.equal(entries.size, 80, 'Persistent storage stays bounded');
globalThis.caches.open = async () => { throw new Error('Storage disabled'); };
assert.equal(await first.readThumbnail('uncached'), null);
await first.saveThumbnail('storage-unavailable', 'data:image/webp;base64,ONE');
assert.equal(first.peekThumbnail('storage-unavailable'), 'data:image/webp;base64,ONE');

const queue = first.createQueue(3);
let running = 0, maximum = 0;
const release = [];
const jobs = Array.from({ length: 8 }, () => queue(async () => {
  running++; maximum = Math.max(maximum, running);
  await new Promise(resolve => release.push(resolve));
  running--;
}));
await new Promise(resolve => setImmediate(resolve));
assert.equal(running, 3);
while (release.length) {
  release.splice(0).forEach(resolve => resolve());
  await new Promise(resolve => setImmediate(resolve));
}
await Promise.all(jobs);
assert.equal(maximum, 3, 'Downloads overlap without unbounded concurrency');
await assert.rejects(queue(() => { throw new Error('Request failed'); }));
assert.equal(await queue(() => 'recovered'), 'recovered');
console.log('PASS: persistent cache across reloads, version invalidation, storage limits/failure, bounded concurrent downloads and queue recovery.');
