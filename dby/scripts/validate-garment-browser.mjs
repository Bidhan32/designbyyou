import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const browser = path.join(root, "src/pages/sketches/editor/GarmentTemplateBrowser.jsx");
const editor = path.join(root, "src/pages/sketches/editor/FashionEditor.jsx");
const registry = path.join(root, "src/pages/sketches/templates/GarmentTemplateRegistry.js");
const clothing = path.join(root, "src/pages/sketches/templates/ClothingTemplates.js");

for (const file of [browser, editor, registry, clothing]) {
  assert.ok(fs.existsSync(file), `Required file missing: ${file}`);
  console.log(`[PASS] ${path.basename(file)} is present`);
}
const source = fs.readFileSync(editor, "utf8");
const panel = fs.readFileSync(browser, "utf8");
assert.match(source, /import GarmentTemplateBrowser from "\.\/GarmentTemplateBrowser"/);
assert.match(source, /<GarmentTemplateBrowser\s+[\s\S]*?templates=\{CLOTHING_TEMPLATES\}/);
assert.match(source, /onChoose=\{handleChooseClothingTemplate\}/);
assert.match(source, /await ClothingTool\.queueAsset\(asset\)/);
assert.match(source, /return true;\s*}\s*catch \(error\)/);
assert.doesNotMatch(source, /CLOTHING_TEMPLATES\.map\(\(template\) =>/);
for (const feature of ['filterGarmentTemplates', 'GARMENT_CATEGORIES', 'createPortal', 'Place on canvas', 'aria-modal="true"', 'Favorites', 'Recent']) {
  assert.ok(panel.includes(feature), `Missing browser feature: ${feature}`);
}
console.log("[PASS] Selection is separate from queued placement; existing queue pipeline retained");
console.log("[PASS] Search, category, mode, favorites, recent, and full catalog UI are present");
const { CLOTHING_TEMPLATES } = await import(pathToFileURL(clothing).href);
const { validateGarmentCatalog, filterGarmentTemplates } = await import(pathToFileURL(registry).href);
const validation = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert.ok(validation.valid, validation.errors.join("; "));
assert.ok(CLOTHING_TEMPLATES.length >= 11, `Expected >= 11 garments, got ${CLOTHING_TEMPLATES.length}`);
assert.equal(filterGarmentTemplates(CLOTHING_TEMPLATES, { category: "tops" }).every((t) => t.category === "tops"), true);
assert.equal(filterGarmentTemplates(CLOTHING_TEMPLATES, { mode: "3d" }).every((t) => t.has3D), true);
assert.ok(filterGarmentTemplates(CLOTHING_TEMPLATES, { query: "jeans" }).some((t) => t.id === "jeans"));
console.log(`[PASS] ${CLOTHING_TEMPLATES.length} valid templates; search/category/mode filters consistent`);
console.log("Garment-browser structural validation passed. Run npm run build as the JSX compiler check.");
