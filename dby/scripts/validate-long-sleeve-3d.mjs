/**
 * DesignByYou Phase 4.2E — validate converted REAL Sketchfab Long Sleeve GLB.
 * Run from dby/: node scripts/validate-long-sleeve-3d.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOTHING_TEMPLATES, getClothingTemplate, getClothingTemplateArtworkBox,
  createClothingTemplateSvg, createClothingTemplateMetadata } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig, validateGarmentCatalog } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const ID='long-sleeve-tshirt';
const EXPECTED='/models/garments/DBY_SketchfabLongSleeveTShirt_12Regions.glb';
const template=getClothingTemplate(ID);
assert(template?.has3D && template?.model3D?.url===EXPECTED, 'Long Sleeve registry must point to real converted model');
assert.equal(getGarment3DConfig(ID)?.url,EXPECTED);
const names=template.colourRegions.map(x=>x.id);
assert.equal(names.length,12);
assert.equal(new Set(names).size,12);
const check=validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(check.valid,`Invalid catalog: ${check.errors.join('; ')}`);
for(const id of ['tshirt','oversized-tshirt','polo','shirt','hoodie','dress','pants','skirt']){
  assert(getClothingTemplate(id)?.has3D,`${id}: previously working 3D registration lost`);
}
const svg=createClothingTemplateSvg(ID);
for(const id of names){
  assert(svg.includes(`data-clothing-region="${id}"`),`${id}: missing SVG region`);
  assert(getClothingTemplateArtworkBox(ID,id)?.width>0,`${id}: missing artwork bounds`);
}
assert.equal(createClothingTemplateMetadata(ID)?.clothingTemplateId,ID);
const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const glbFile=path.resolve(publicDir,'.'+EXPECTED);
assert(glbFile.startsWith(publicDir+path.sep),'Unsafe GLB path');
const b=readFileSync(glbFile);
assert.equal(b.toString('ascii',0,4),'glTF','Not a GLB file');
assert.equal(b.readUInt32LE(4),2,'Invalid GLB version');
assert.equal(b.readUInt32LE(8),b.length,'GLB byte length mismatch');
const jsonLen=b.readUInt32LE(12);
assert.equal(b.toString('ascii',16,20),'JSON');
const gltf=JSON.parse(b.subarray(20,20+jsonLen).toString('utf8'));
assert.equal(gltf.asset?.version,'2.0');
assert.equal((gltf.images||[]).length,0,'Unexpected oversized embedded image textures');
assert(b.length<6*1048576,'Converted GLB exceeds 6 MiB');
const counts=new Map();
for(const node of gltf.nodes||[]){
  if(node.mesh===undefined)continue;
  assert(names.includes(node.name),`Unexpected mesh node: ${node.name}`);
  assert(!counts.has(node.name),`Duplicate node: ${node.name}`);
  const mesh=gltf.meshes[node.mesh];
  let total=0;
  for(const primitive of mesh?.primitives||[]){
    assert.equal(primitive.mode??4,4,`${node.name}: expected triangles`);
    assert(primitive.attributes?.POSITION!==undefined,`${node.name}: missing POSITION`);
    assert(primitive.attributes?.TEXCOORD_0!==undefined,`${node.name}: missing UVs`);
    assert(primitive.indices!==undefined,`${node.name}: missing indices`);
    const count=gltf.accessors[primitive.indices].count;
    assert(count>0 && count%3===0,`${node.name}: invalid face index count`);
    total+=count/3;
  }
  assert(total>0,`${node.name}: empty geometry`);
  counts.set(node.name,total);
}
assert.deepEqual([...counts.keys()].sort(),[...names].sort(),'GLB region names do not match 2D');
const triangles=[...counts.values()].reduce((a,b)=>a+b,0);
assert(triangles>=45000 && triangles<=125000,`Unexpected GLB triangle budget: ${triangles}`);
console.log(`[PASS] Long-Sleeve T-Shirt: ${counts.size}/12 editable GLB regions; ${triangles.toLocaleString()} triangles; ${(b.length/1048576).toFixed(2)} MiB`);
for(const id of names)console.log(`  ${id.padEnd(23)} ${counts.get(id).toLocaleString()} triangles`);
console.log(`[PASS] Catalog: ${CLOTHING_TEMPLATES.length} 2D templates; ${CLOTHING_TEMPLATES.filter(x=>x.has3D).length} 3D registrations; ${CLOTHING_TEMPLATES.reduce((s,x)=>s+x.colourRegions.length,0)} editable 2D regions`);
