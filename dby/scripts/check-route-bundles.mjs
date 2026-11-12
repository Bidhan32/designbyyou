import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = path.join(root, "dist/.vite/manifest.json");
assert.ok(fs.existsSync(manifestPath), "Run npm run build before checking route bundles.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
assert.ok(entry, "Application entry is missing from the build manifest.");

function staticDependencies(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  assert.ok(manifest[key], `Missing built dependency: ${key}`);
  seen.add(key);
  for (const dependency of manifest[key].imports || []) staticDependencies(dependency, seen);
  return seen;
}

const startup = staticDependencies(entry);
const routerSource = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const lazyPaths = [...routerSource.matchAll(/lazy\(\(\) => import\("(\.\/(?:pages|Layouts)\/[^\"]+)"\)\)/g)]
  .map((match) => match[1]);
assert.ok(lazyPaths.length > 0, "No deferred routes were found.");
const dynamicEntries = new Set(manifest[entry].dynamicImports);
for (const source of lazyPaths) {
  const sourcePath = `src/${source.slice(2)}.jsx`;
  const name = path.basename(source);
  const key = Object.keys(manifest).find((key) => key === sourcePath ||
    (manifest[key].isDynamicEntry && manifest[key].name === name));
  assert.ok(key && dynamicEntries.has(key), `Route is not emitted as a deferred import: ${source}`);
  assert.ok(!startup.has(key), `Route was pulled into startup downloads: ${source}`);
}

function size(keys) {
  let bytes = 0;
  let gzip = 0;
  for (const key of keys) {
    const code = fs.readFileSync(path.join(root, "dist", manifest[key].file));
    bytes += code.length;
    gzip += gzipSync(code).length;
  }
  return { bytes, gzip };
}

const initial = size(startup);
// Leave room for normal shell changes while preventing a return to the monolith.
assert.ok(initial.bytes < 500_000, `Startup JS exceeds its 500 KB budget: ${initial.bytes} bytes`);
const login = size(staticDependencies("src/pages/auth/Login.jsx"));
console.log(`PASS: ${lazyPaths.length} page/layout chunks deferred; startup JS ${(initial.bytes / 1000).toFixed(1)} KB (${(initial.gzip / 1000).toFixed(1)} KB gzip).`);
console.log(`Direct login JS including shared imports: ${(login.bytes / 1000).toFixed(1)} KB (${(login.gzip / 1000).toFixed(1)} KB gzip).`);
