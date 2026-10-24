import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const editorPath = path.join(root, "src/pages/sketches/editor/FashionEditor.jsx");
const modalPath = path.join(root, "src/pages/sketches/editor/GarmentTemplateBrowser.jsx");
const templatesPath = path.join(root, "src/pages/sketches/templates/ClothingTemplates.js");
const registryPath = path.join(root, "src/pages/sketches/templates/GarmentTemplateRegistry.js");
for (const file of [editorPath, modalPath, templatesPath, registryPath]) {
  assert.ok(fs.existsSync(file), `Required file missing: ${file}`);
}
const editor = fs.readFileSync(editorPath, "utf8");
const modal = fs.readFileSync(modalPath, "utf8");
assert.match(editor, /const \[garmentLibraryOpen, setGarmentLibraryOpen\] = useState\(false\)/);
assert.match(editor, /toolId === EDITOR_TOOLS\.CLOTHING[\s\S]*?setGarmentLibraryOpen\(true\)/);
assert.equal((editor.match(/onClick=\{handleEditorToolSelection\}/g) || []).length, 2,
  "Desktop and mobile clothing tool buttons must use the modal opener");
assert.equal((editor.match(/<GarmentTemplateBrowser\s/g) || []).length, 1,
  "Only one modal instance is permitted");
assert.match(editor, /<GarmentTemplateBrowser\s+open=\{garmentLibraryOpen\}[\s\S]*?onChoose=\{handleChooseClothingTemplate\}/);
assert.match(editor, /Browse garment library/);
assert.match(editor, /await ClothingTool\.queueAsset\(asset\)/);
assert.doesNotMatch(editor, /onClick=\{setActiveTool\}/);
for (const text of ['createPortal', 'aria-modal="true"', 'if (!open || typeof document === "undefined") return null',
  'renderGrid(true)', 'renderSelected(true)', 'Search garments', 'Favorites', 'Recent',
  'Place on canvas', 'requestClose', 'document.body.style.overflow']) {
  assert.ok(modal.includes(text), `Modal is missing: ${text}`);
}
assert.doesNotMatch(modal, /Open full garment catalog|setExpanded\(/,
  "Sidebar browsing must not be required");
const { CLOTHING_TEMPLATES } = await import(pathToFileURL(templatesPath).href);
const { validateGarmentCatalog, filterGarmentTemplates } = await import(pathToFileURL(registryPath).href);
const result = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert.equal(result.valid, true, result.errors.join("; "));
assert.ok(CLOTHING_TEMPLATES.length >= 11, "Expected all 11 garments");
assert.ok(filterGarmentTemplates(CLOTHING_TEMPLATES, {query: "jeans"}).some(t => t.id === "jeans"));
const total = CLOTHING_TEMPLATES.reduce((n,t)=>n+(t.colourRegions?.length||0),0);
console.log(`[PASS] Clicking Clothing opens a single modal on both desktop/mobile`);
console.log(`[PASS] Filtering, favorites, recent, selection, close/focus, placement queue retained`);
console.log(`[PASS] ${CLOTHING_TEMPLATES.length} registered garments / ${total} editable regions`);
console.log("[PASS] Validator finished. Also run npm run build and test in the browser.");
