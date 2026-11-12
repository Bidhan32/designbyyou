const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Module = require("node:module");

// Load the real server modules with an isolated DB/Stripe dependency graph.
// The running development server and Node's shared require cache are untouched.
function isolatedServer({ db, stripe, secretKey, overrides = {} }) {
  const root = path.resolve(__dirname, "../..");
  const replacements = new Map(Object.entries(overrides).map(([relative, exported]) => [require.resolve(path.resolve(root, relative)), exported]));
  const cache = new Map();
  function StripeClient(key) {
    if (secretKey && key !== secretKey) throw new Error("Unexpected Stripe key in isolated server.");
    return stripe;
  }
  function load(filename) {
    filename = require.resolve(filename);
    if (filename === path.join(root, "config/db.js")) return db;
    if (replacements.has(filename)) return replacements.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const nativeRequire = Module.createRequire(filename);
    const module = { exports: {}, filename };
    cache.set(filename, module);
    function localRequire(request) {
      if (request === "stripe") return StripeClient;
      const resolved = nativeRequire.resolve(request);
      if (resolved.startsWith(root + path.sep) &&
          !resolved.startsWith(path.join(root, "node_modules") + path.sep) && /\.(?:js|cjs)$/.test(resolved)) {
        return load(resolved);
      }
      return nativeRequire(request);
    }
    localRequire.main = require.main;
    localRequire.resolve = nativeRequire.resolve;
    const compiled = vm.runInThisContext(Module.wrap(fs.readFileSync(filename, "utf8")), { filename });
    compiled.call(module.exports, module.exports, localRequire, module, filename, path.dirname(filename));
    return module.exports;
  }
  return { load: (relative) => load(path.resolve(root, relative)) };
}

function assertTestKey(key) {
  if (!/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(String(key || ""))) {
    throw new Error("Sandbox tests require a Stripe test key; live, missing, and unknown keys are refused.");
  }
}

module.exports = { isolatedServer, assertTestKey };
