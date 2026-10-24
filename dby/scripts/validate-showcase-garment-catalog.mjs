// Usage: node scripts/validate-showcase-garment-catalog.mjs
// Ensures public controller whitelist and front-end 3D registry match all 2D region IDs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/pages");
const root = path.resolve(frontend, "../../..");
const { CLOTHING_TEMPLATES } = await import(path.join(frontend, "sketches/templates/ClothingTemplates.js"));
const { getGarment3DConfig } = await import(path.join(frontend, "sketches/templates/GarmentTemplateRegistry.js"));
const controller = fs.readFileSync(path.join(root, "server/controllers/creators/creatorshowcaseController.js"), "utf8");
const begin = controller.indexOf("const SHOWCASE_3D_REGIONS_BY_MODEL = Object.freeze({");
const end = controller.indexOf("const SHOWCASE_3D_MODEL_IDS", begin);
assert.ok(begin !== -1 && end > begin, "Backend 3D garment allowlist not found");
const excerpt = controller.slice(begin, end);
let checked = 0;
for (const template of CLOTHING_TEMPLATES) {
  const cfg = getGarment3DConfig(template.id);
  if (!cfg?.url) continue;
  assert.match(cfg.url, /^\/models\/garments\/[a-zA-Z0-9_.-]+\.glb$/);
  const regionIds = template.colourRegions.map(r => r.id);
  const pattern = new RegExp(`\\"${template.id}\\"\\s*:\\s*Object\\.freeze\\(\\[([^\\]]+)\\]\\)`);
  const match = excerpt.match(pattern);
  assert.ok(match, `Missing backend model ${template.id}`);
  const backendIds = JSON.parse(`[${match[1]}]`);
  assert.deepEqual(backendIds, regionIds, `Backend/frontend regions diverged for ${template.id}`);
  const modelFile = path.join(root, "dby/public", cfg.url.replace(/^\//, ""));
  assert.ok(fs.existsSync(modelFile), `Missing model GLB: ${modelFile}`);
  checked++;
}
assert.match(controller, /ANY\(\$2::text\[\]\)/, "Public model filter must be parameterized");
console.log(`PASS: ${checked} Showcase 3D garments registered; region IDs and files match.`);
