import assert from "node:assert/strict";
import { CLOTHING_TEMPLATES, getClothingTemplate, getClothingTemplateColourRegions,
  getClothingTemplateArtworkBox, createClothingTemplateSvg } from "../src/pages/sketches/templates/ClothingTemplates.js";
import { validateGarmentCatalog } from "../src/pages/sketches/templates/GarmentTemplateRegistry.js";

const result = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(result.valid, `Invalid garment catalog: ${result.errors.join("; ")}`);
assert(CLOTHING_TEMPLATES.length >= 8, "Polo requires the existing clothing templates");
assert(CLOTHING_TEMPLATES.filter(t => t.has3D).length >= 8, "Existing 3D models must remain registered");
assert(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0) >= 87, "Existing regions must remain registered");
const polo = getClothingTemplate("polo");
assert(polo?.has3D && polo?.model3D?.url?.endsWith("DBY_SketchfabPolo_13Regions.glb"), "Polo 3D registration missing");
const regions = getClothingTemplateColourRegions("polo");
assert.equal(regions.length,13,"Expected 13 polo regions");
const svg = createClothingTemplateSvg("polo");
for (const region of regions) {
  assert(svg.includes(`data-clothing-region="${region.id}"`), `Missing SVG region: ${region.id}`);
  assert(getClothingTemplateArtworkBox("polo",region.id), `Missing artwork bounds: ${region.id}`);
}
assert(getClothingTemplate("dress")?.model3D?.url?.includes("PuffSleeve"), "Puff Sleeve Dress must be preserved");
assert(getClothingTemplate("oversized-tshirt")?.model3D, "Oversized T-Shirt must be preserved");
console.log(`PASS: ${CLOTHING_TEMPLATES.length} templates / ${CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0)} editable 2D regions / ${CLOTHING_TEMPLATES.filter(t=>t.has3D).length} 3D registrations / 13 Polo 2D regions`);
