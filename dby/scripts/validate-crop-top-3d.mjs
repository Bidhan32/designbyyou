import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOTHING_TEMPLATES, getClothingTemplate } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig, validateGarmentCatalog } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = getClothingTemplate('crop-top');
assert(template && template.id === 'crop-top');
const expected = new Set(template.colourRegions.map(r=>r.id));
assert.equal(expected.size, 10, 'Crop top must have ten unique editable 2D regions');
assert(CLOTHING_TEMPLATES.length>=10, 'Expected at least 10 total 2D templates');
assert(CLOTHING_TEMPLATES.filter(t=>t.has3D).length>=10, 'Expected at least 10 registered 3D garments');
assert(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0)>=109);
const catalog = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(catalog.valid, catalog.errors.join('; '));
const modelUrl = getGarment3DConfig('crop-top')?.url;
assert.equal(modelUrl,'/models/garments/DBY_SketchfabAthleticCropTop_10Regions.glb');
const file = path.join(BASE,'public',modelUrl.substring(1));
const buf = fs.readFileSync(file);
assert.equal(buf.toString('ascii',0,4),'glTF','Invalid GLB magic');
assert.equal(buf.readUInt32LE(4),2,'Expected glTF v2');
assert.equal(buf.readUInt32LE(8),buf.length,'GLB header length does not match file size');
const jsonSize=buf.readUInt32LE(12);
assert.equal(buf.toString('ascii',16,20),'JSON','Expected GLB JSON chunk');
const doc=JSON.parse(buf.toString('utf8',20,20+jsonSize));
const meshStats=new Map();
for (const node of doc.nodes || []) {
 if (typeof node.mesh !== 'number') continue;
 const mesh=doc.meshes[node.mesh];
 const name=node.name;
 if (!expected.has(name)) continue;
 let faces=0;
 for (const prim of mesh.primitives || []) {
  assert.equal(prim.mode ?? 4, 4,`Non-triangle primitive in ${name}`);
  assert(typeof prim.attributes?.NORMAL === 'number',`Normals missing: ${name}`);
  assert(typeof prim.attributes?.TEXCOORD_0 === 'number',`UVs missing: ${name}`);
  assert(typeof prim.indices === 'number',`Indices missing: ${name}`);
  faces += doc.accessors[prim.indices].count/3;
 }
 assert(faces>=100,`${name} does not contain sufficient triangles`);
 assert(!meshStats.has(name),`Duplicate region node ${name}`);
 meshStats.set(name,faces);
}
assert.deepEqual(new Set(meshStats.keys()),expected,`Missing region nodes: ${[...expected].filter(x=>!meshStats.has(x))}`);
const sum=[...meshStats.values()].reduce((a,b)=>a+b,0);
assert(sum>=33000 && sum<=40000,`Unexpected triangle total: ${sum}`);
assert(buf.length<4*1024*1024,'Crop top GLB exceeds 4 MiB');
console.log(`[PASS] Crop Top: ${meshStats.size}/10 editable GLB regions; ${sum.toLocaleString()} triangles; ${(buf.length/2**20).toFixed(2)} MiB`);
for (const [name, count] of meshStats) console.log(`  ${name.padEnd(23)} ${count.toLocaleString()} triangles`);
console.log(`[PASS] Catalog: ${CLOTHING_TEMPLATES.length} 2D templates, ${CLOTHING_TEMPLATES.filter(t=>t.has3D).length} 3D models, ${CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0)} editable 2D regions.`);
console.log('[PASS] All source UVs and normals are present in the export.');
