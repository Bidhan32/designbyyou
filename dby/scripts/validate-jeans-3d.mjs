import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLOTHING_TEMPLATES,getClothingTemplate} from '../src/pages/sketches/templates/ClothingTemplates.js';
import {getGarment3DConfig,validateGarmentCatalog} from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const template=getClothingTemplate('jeans');
assert(template&&template.dualView&&template.editableColours&&template.editableArtwork);
const expected=new Set(template.colourRegions.map(r=>r.id));
assert.equal(expected.size,10);
assert.equal(CLOTHING_TEMPLATES.length,11);
assert.equal(CLOTHING_TEMPLATES.filter(t=>t.has3D).length,11);
assert.equal(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0),119);
const c=validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(c.valid,c.errors.join('; '));
const url=getGarment3DConfig('jeans')?.url;
assert.equal(url,'/models/garments/DBY_SketchfabGreyJeans_10Regions.glb');
const p=path.join(ROOT,'public',url.substring(1));
const buf=fs.readFileSync(p);
assert.equal(buf.toString('ascii',0,4),'glTF');
assert.equal(buf.readUInt32LE(4),2);
assert.equal(buf.readUInt32LE(8),buf.length);
const jsonSize=buf.readUInt32LE(12);
assert.equal(buf.toString('ascii',16,20),'JSON');
const doc=JSON.parse(buf.toString('utf8',20,20+jsonSize));
const stats=new Map();
for(const node of doc.nodes||[]){
 if(typeof node.mesh!=='number'||!expected.has(node.name))continue;
 assert(!stats.has(node.name),'Duplicate editable region node '+node.name);
 const mesh=doc.meshes[node.mesh];let triangles=0;
 for(const p of mesh.primitives||[]){
  assert.equal(p.mode??4,4,'Non-triangle primitive');
  assert(typeof p.attributes?.NORMAL==='number','Normals missing: '+node.name);
  assert(typeof p.attributes?.TEXCOORD_0==='number','UVs missing: '+node.name);
  assert(typeof p.indices==='number','Indices missing: '+node.name);
  triangles+=doc.accessors[p.indices].count/3;
 }
 assert(triangles>100,'Region contains too few triangles: '+node.name);
 stats.set(node.name,triangles);
}
assert.deepEqual(new Set(stats.keys()),expected);
const count=[...stats.values()].reduce((a,b)=>a+b,0);
assert.equal(count,9513,'Original source triangles should all be preserved exactly once');
assert(buf.length<2.5*2**20,'Model size should remain web-friendly');
console.log(`[PASS] Jeans: ${stats.size}/10 editable GLB regions, ${count.toLocaleString()} source triangles preserved, ${(buf.length/2**20).toFixed(2)} MiB`);
for(const [k,v] of stats)console.log(`  ${k.padEnd(24)} ${v.toLocaleString()} triangles`);
console.log('[PASS] Catalog: 11 2D templates, 11 3D registrations, 119 regions');
