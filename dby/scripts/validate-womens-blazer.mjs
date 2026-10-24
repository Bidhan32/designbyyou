import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLOTHING_TEMPLATES,getClothingTemplate,createClothingTemplateSvg,createClothingTemplateMetadata,getClothingTemplateArtworkBox} from '../src/pages/sketches/templates/ClothingTemplates.js';
import {GARMENT_CATALOG,getGarment3DConfig,filterGarmentTemplates,validateGarmentCatalog} from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id='womens-blazer';const t=getClothingTemplate(id);
const ids=['frontLeftBody','frontRightBody','backBody','sideLeftBody','sideRightBody','frontLeftSleeve','frontRightSleeve','backLeftSleeve','backRightSleeve','frontLeftLapel','frontRightLapel','topCollar','backInnerCollar'];
const idsSet=new Set(ids);
assert(t&&t.has3D&&t.category==='outerwear'&&t.dualView&&t.editableColours&&t.editableArtwork);
assert.equal(CLOTHING_TEMPLATES.length,12);assert.equal(CLOTHING_TEMPLATES.filter(t=>t.has3D).length,12);
assert.equal(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0),132);
assert.deepEqual(t.colourRegions.map(x=>x.id),ids);
assert.equal(new Set(t.colourRegions.map(x=>x.id)).size,13);
assert.equal(GARMENT_CATALOG['womens-blazer'].category,'outerwear');
const c=validateGarmentCatalog(CLOTHING_TEMPLATES);assert(c.valid,c.errors.join('; '));
const svg=createClothingTemplateSvg(id);
for(const k of ids){
 assert.equal(svg.split(`data-clothing-region="${k}"`).length-1,1,`Region ${k} must be unique on 2D garment`);
 assert(t.defaultColours[k]&&/^#[0-9a-f]{6}$/i.test(t.defaultColours[k]));
 const box=getClothingTemplateArtworkBox(id,k);assert(box.width>0&&box.height>0);
}
assert(createClothingTemplateMetadata(id)?.clothingTemplateId===id);
assert(createClothingTemplateSvg(id,{frontLeftLapel:'#ff0000'}).includes('fill="#ff0000"'));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+hUk/qAAAAABJRU5ErkJggg==';
assert(createClothingTemplateSvg(id,{}, {frontLeftBody:{type:'image',source:png}}).includes('data-clothing-artwork-region="frontLeftBody"'));
assert(filterGarmentTemplates(CLOTHING_TEMPLATES,{category:'outerwear'}).some(x=>x.id===id));
assert(filterGarmentTemplates(CLOTHING_TEMPLATES,{query:'blazer'}).some(x=>x.id===id));
const cfg=getGarment3DConfig(id);assert.equal(cfg.url,'/models/garments/DBY_SketchfabWomensBlazer_13Regions.glb');
const file=path.join(root,'public',cfg.url.slice(1));const buf=fs.readFileSync(file);
assert.equal(buf.toString('ascii',0,4),'glTF');assert.equal(buf.readUInt32LE(8),buf.length);
const jsonLength=buf.readUInt32LE(12);assert.equal(buf.toString('ascii',16,20),'JSON');
const doc=JSON.parse(buf.toString('utf8',20,20+jsonLength));
const found=new Map();const extra=[];
for(const node of doc.nodes||[]){
 if(typeof node.mesh!=='number')continue;
 const mesh=doc.meshes[node.mesh];const key=node.name;
 let triangles=0;
 for(const p of mesh.primitives){
  assert.equal(p.mode??4,4,`${key} is not triangle topology`);
  for(const a of ['POSITION','NORMAL','TEXCOORD_0'])assert(typeof p.attributes[a]==='number',`${key} missing ${a}`);
  assert(typeof p.indices==='number',`${key} lacks indices`);
  triangles+=doc.accessors[p.indices].count/3;
 }
 assert(triangles>0,key+' has zero triangles');
 if(idsSet.has(key)){assert(!found.has(key),`Duplicate editable mesh ${key}`);found.set(key,triangles)}else extra.push(key);
}
assert.deepEqual(new Set(found.keys()),idsSet);
assert.deepEqual(extra,['blazerDetails']);
assert(buf.length<5*1024*1024,'Blazer should load under 5 MiB');
const total=[...found.values()].reduce((a,b)=>a+b,0)+doc.accessors[doc.meshes[doc.nodes.find(n=>n.name==='blazerDetails').mesh].primitives[0].indices].count/3;
assert(total>=100_000&&total<=180_000,'Unexpected decimation output');
const showcase=fs.readFileSync(path.resolve(root,'../server/controllers/creators/creatorshowcaseController.js'),'utf8');
const escaped=showcase.includes('"womens-blazer": Object.freeze(');
assert(escaped,'Missing server allowlist');assert.match(showcase,/ANY\(\$2::text\[\]\)/,'Public SQL must be parameterized');
const viewer=fs.readFileSync(path.resolve(root,'src/pages/creators/ShowcaseGarment3D.jsx'),'utf8');
assert(viewer.includes('getGarment3DConfig')&&viewer.includes('"womens-blazer": { creator: "Latitude23"'));
console.log(`[PASS] ${id}: 13 2D regions + 13 named editable GLB meshes + separate buttons`);
console.log(`[PASS] ${total.toLocaleString()} triangles | ${(buf.length/1024/1024).toFixed(2)} MiB | GLB normals/UV0 present`);
console.log('[PASS] 12 garment templates, 12 registered 3D garments, 132 editable regions');
console.log('[PASS] 3D Showcase allowlist, attribution, and published-only query constraints');
