import assert from "node:assert/strict";
import { CLOTHING_TEMPLATES, getClothingTemplate, getClothingTemplateArtworkBox,
  createClothingTemplateSvg, createClothingTemplateMetadata, getClothingTemplateColourRegions }
  from "../src/pages/sketches/templates/ClothingTemplates.js";
import { validateGarmentCatalog, getGarment3DConfig, filterGarmentTemplates }
  from "../src/pages/sketches/templates/GarmentTemplateRegistry.js";

const originalIds = ["tshirt", "oversized-tshirt", "polo", "shirt", "hoodie", "dress", "pants", "skirt"];
const newId = "long-sleeve-tshirt";
const catalog = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(catalog.valid, `Catalog: ${catalog.errors.join('; ')}`);
assert(CLOTHING_TEMPLATES.length >= 9, "Expected at least nine 2D templates");
assert(CLOTHING_TEMPLATES.filter(t => t.has3D).length >= 9, "Expected at least nine registered 3D models");
assert(CLOTHING_TEMPLATES.reduce((n, t) => n + t.colourRegions.length, 0) >= 99, "Expected at least 99 total editable regions");
for (const id of originalIds) {
  assert(getClothingTemplate(id), `Existing template lost: ${id}`);
  assert(getGarment3DConfig(id)?.url, `Existing 3D config lost: ${id}`);
}
const t = getClothingTemplate(newId);
assert(t && t.dualView && t.editableColours && t.editableArtwork);
assert.equal(t.has3D, true, "Long-Sleeve 3D should be registered");
assert(getGarment3DConfig(newId)?.url?.endsWith("DBY_SketchfabLongSleeveTShirt_12Regions.glb"));
const regions = getClothingTemplateColourRegions(newId);
assert.equal(regions.length, 12);
assert.equal(new Set(regions.map(r => r.id)).size, 12);
const svg = createClothingTemplateSvg(newId);
assert(svg.includes('data-clothing-view="front"') && svg.includes('data-clothing-view="back"'));
for (const { id, view } of regions) {
  assert.equal(svg.split(`data-clothing-region="${id}"`).length-1, 1, `Expected one editable shape for ${id}`);
  assert(getClothingTemplateArtworkBox(newId, id)?.width > 0, `Missing artwork box: ${id}`);
  assert(t.defaultColours[id], `Missing color: ${id}`);
  assert(["front", "back"].includes(view));
}
const colorVariant = createClothingTemplateSvg(newId, { frontBody: "#ff0000" });
assert(colorVariant.includes('fill="#ff0000"'));
const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+hUk/qAAAAABJRU5ErkJggg==";
const artVariant = createClothingTemplateSvg(newId, {}, {frontBody:{source:dataUrl, scale:0.7}});
assert(artVariant.includes('data-clothing-artwork-region="frontBody"'));
assert.equal(createClothingTemplateMetadata(newId)?.clothingTemplateId, newId);
assert(filterGarmentTemplates(CLOTHING_TEMPLATES, {query:"long sleeve"}).some(t=>t.id===newId));
assert(filterGarmentTemplates(CLOTHING_TEMPLATES, {mode:"3d"}).some(t=>t.id===newId));
console.log(`[PASS] ${CLOTHING_TEMPLATES.length} templates; ${CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0)} editable regions; ${CLOTHING_TEMPLATES.filter(t=>t.has3D).length} 3D registrations.`);
console.log("[PASS] Long-Sleeve T-Shirt: 12 regions, dual view, colors, SVG artwork and metadata.");
console.log("[PASS] Real Sketchfab-derived 3D Long-Sleeve is registered.");
