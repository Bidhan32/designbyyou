/**
 * DesignByYou — Real Sketchfab oversized T-Shirt check.
 * From dby/: node scripts/validate-oversized-tshirt.mjs
 * Uses only built-in Node APIs and the installed catalog modules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLOTHING_TEMPLATES, getClothingTemplate, getClothingTemplateArtworkBox,
  createClothingTemplateSvg, createClothingTemplateMetadata } from "../src/pages/sketches/templates/ClothingTemplates.js";
import { getGarment3DConfig, validateGarmentCatalog } from "../src/pages/sketches/templates/GarmentTemplateRegistry.js";

const garmentId = "oversized-tshirt";
const expectedUrl = "/models/garments/DBY_SketchfabOversizedTShirt_10Regions.glb";
const template = getClothingTemplate(garmentId);
const cfg = getGarment3DConfig(garmentId);
assert(template?.has3D && cfg?.url === expectedUrl, "Oversized T-Shirt 3D registration missing or old beta still registered");
const expected = template.colourRegions.map(r=>r.id);
assert.equal(expected.length, 10);
assert.equal(new Set(expected).size, 10);
assert(CLOTHING_TEMPLATES.length >= 8, "Polo and the other templates must remain registered");
assert(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0) >= 87);
assert(CLOTHING_TEMPLATES.find(t=>t.id==="polo")?.has3D, "Previously converted Polo 3D registration was lost");
const summary = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(summary.valid,`Catalog validation errors: ${summary.errors.join('; ')}`);
const svg = createClothingTemplateSvg(garmentId);
for (const id of expected) {
  assert(svg.includes(`data-clothing-region="${id}"`),`${id}: missing in 2D SVG`);
  assert(getClothingTemplateArtworkBox(garmentId,id)?.width>0,`${id}: missing 2D artwork box`);
}
assert(svg.includes('data-clothing-view="front"') && svg.includes('data-clothing-view="back"'));
assert.equal(createClothingTemplateMetadata(garmentId)?.clothingTemplateId,garmentId);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const filepath=path.resolve(directory, "."+cfg.url);
assert(filepath.startsWith(directory+path.sep),"Model URL traversal");
const b=readFileSync(filepath);
assert.equal(b.toString("ascii",0,4),"glTF");
assert.equal(b.readUInt32LE(4),2);
assert.equal(b.readUInt32LE(8),b.length);
assert.equal(b.toString("ascii",16,20),"JSON");
assert(b.length<5*1024*1024,"GLB exceeds 5 MiB target");
const chunkLen=b.readUInt32LE(12);
const gltf=JSON.parse(b.subarray(20,20+chunkLen).toString("utf8"));
assert.equal(gltf.asset?.version,"2.0");
assert.equal((gltf.images||[]).length,0,"Unexpected heavy embedded texture images");
const found=new Map();
for (const node of gltf.nodes||[]) {
  if (node.mesh===undefined || !expected.includes(node.name)) continue;
  assert(!found.has(node.name),`${node.name}: duplicate mesh node`);
  const mesh=gltf.meshes[node.mesh];
  assert(mesh?.primitives?.length,`${node.name}: missing mesh primitives`);
  let count=0;
  for(const p of mesh.primitives){
    assert.equal(p.mode??4,4,`${node.name}: only triangles supported`);
    assert(p.attributes?.POSITION!==undefined,`${node.name}: missing positions`);
    assert(p.attributes?.TEXCOORD_0!==undefined,`${node.name}: missing UVs`);
    const idx=gltf.accessors[p.indices];
    assert(idx?.count>0 && idx.count%3===0,`${node.name}: invalid indexed triangles`);
    count+=idx.count/3;
  }
  found.set(node.name,count);
}
assert.deepEqual([...expected].sort(),[...found.keys()].sort(),"3D regions do not match 2D");
const total=[...found.values()].reduce((a,b)=>a+b,0);
assert(total>=45000 && total<=100000,`Unexpected triangle count: ${total}`);
console.log(`[PASS] Real Sketchfab Oversized T-Shirt: ${found.size}/10 editable 3D regions, ${total.toLocaleString()} triangles, ${(b.length/1048576).toFixed(2)} MiB`);
for(const [key,count] of found) console.log(`  ${key.padEnd(22)} ${count.toLocaleString()} triangles`);
console.log("[PASS] Existing 2D region IDs, artwork boxes, metadata, eight garment registry entries, and Polo 3D registration retained.");
