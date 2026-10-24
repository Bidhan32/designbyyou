import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getGarment3DConfig } from "../src/pages/sketches/templates/GarmentTemplateRegistry.js";
import { getClothingTemplateColourRegions } from "../src/pages/sketches/templates/ClothingTemplates.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelInfo = getGarment3DConfig("polo");
assert(modelInfo?.url === "/models/garments/DBY_SketchfabPolo_13Regions.glb",
  "Polo GLB registry URL is incorrect");
const file = path.resolve(here, "..", "public", modelInfo.url.slice(1));
const data = readFileSync(file);
assert.equal(data.toString("ascii",0,4),"glTF","Not a GLB");
assert.equal(data.readUInt32LE(4),2,"Unsupported GLB version");
assert.equal(data.readUInt32LE(8),data.length,"GLB byte-length mismatch");
const jsonLength = data.readUInt32LE(12);
assert.equal(data.toString("ascii",16,20),"JSON","Missing GLB JSON chunk");
const json = JSON.parse(data.subarray(20,20+jsonLength).toString("utf8"));
const byName = new Map();
for (const n of json.nodes || []) {
  if (!n?.name || n.mesh == null) continue;
  assert(!byName.has(n.name),`Duplicate region mesh: ${n.name}`);
  byName.set(n.name, n);
}
const regions = getClothingTemplateColourRegions("polo");
assert.equal(regions.length,13,"Polo 2D must have 13 editable regions");
const missing = regions.map(r=>r.id).filter(id=>!byName.has(id));
assert.deepEqual(missing,[],`Missing 3D mesh nodes: ${missing.join(", ")}`);
let regionTriangles=0;
for (const { id } of regions) {
  const mesh=json.meshes[byName.get(id).mesh];
  assert(mesh?.primitives?.length,`${id}: missing geometry primitives`);
  for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4,`${id}: triangles required`);
    assert(primitive.attributes?.POSITION !== undefined,`${id}: missing POSITION`);
    const a=json.accessors[primitive.indices];
    assert(a?.count > 0 && a.count % 3 === 0,`${id}: empty or invalid triangle index count`);
    regionTriangles += a.count/3;
  }
}
const expectedDecor = ["PocketDetail","ButtonsDetail","ButtonSeamsDetail"];
for (const detail of expectedDecor) assert(byName.has(detail),`Missing original decorative mesh: ${detail}`);
const total = [...byName.values()].reduce((sum,n) =>
 sum+json.meshes[n.mesh].primitives.reduce((s,p)=>s+(json.accessors[p.indices]?.count||0)/3,0),0);
assert.equal(total,49258,"Original source geometry should be retained without triangle loss");
console.log(`[PASS] Polo: ${regions.length}/13 editable mesh regions; ${regionTriangles} editable triangles; ${total} original triangles preserved; ${(data.length/1048576).toFixed(2)} MiB`);
console.log("[PASS] Decorative chest pocket and buttons retained; GLB v2 structure valid.");
