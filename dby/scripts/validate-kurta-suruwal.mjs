/** Phase 4.5 Kurta+Suruwal geometry-locked catalog and GLB contract test.
 * Run: cd dby && node scripts/validate-kurta-suruwal.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLOTHING_TEMPLATES,createClothingTemplateSvg,createClothingTemplateMetadata,getClothingTemplateArtworkBox} from '../src/pages/sketches/templates/ClothingTemplates.js';
import {GARMENT_CATALOG,filterGarmentTemplates,validateGarmentCatalog} from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(fs.readFileSync(path.resolve(root,'scripts/kurta-suruwal-region-manifest.json'),'utf8'));
const expectedCounts={kurta:10,suruwal:6};
const expectedFiles={kurta:'DBY_Sketchfab_Kurta_10Regions.glb',suruwal:'DBY_Sketchfab_SlimSuruwal_6Regions.glb'};
assert.equal(CLOTHING_TEMPLATES.length,14,'Expected 12 preserved designs plus 2 new designs');
assert.equal(CLOTHING_TEMPLATES.filter(t=>t.has3D).length,14);
assert.equal(CLOTHING_TEMPLATES.reduce((sum,t)=>sum+t.colourRegions.length,0),148);
const valid=validateGarmentCatalog(CLOTHING_TEMPLATES);assert(valid.valid,valid.errors.join('; '));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+hUk/qAAAAABJRU5ErkJggg==';
const controller=fs.readFileSync(path.resolve(root,'../server/controllers/creators/creatorshowcaseController.js'),'utf8');
const viewer=fs.readFileSync(path.resolve(root,'src/pages/creators/ShowcaseGarment3D.jsx'),'utf8');
for(const [id,regionCount] of Object.entries(expectedCounts)){
 const t=CLOTHING_TEMPLATES.find(t=>t.id===id);assert(t&&t.has3D&&t.dualView&&t.editableColours&&t.editableArtwork);
 assert.equal(t.category,'traditional');assert.equal(t.colourRegions.length,regionCount);
 const ids=t.colourRegions.map(x=>x.id);assert.deepEqual(ids,source[id].regions);
 assert.equal(new Set(ids).size,ids.length);
 assert.equal(GARMENT_CATALOG[id].model3D.url,'/models/garments/'+expectedFiles[id]);
 assert.equal(createClothingTemplateMetadata(id).clothingTemplateId,id);
 assert(filterGarmentTemplates(CLOTHING_TEMPLATES,{category:'traditional'}).some(t=>t.id===id));
 const svg=createClothingTemplateSvg(id);assert.equal((svg.match(/data-clothing-view=/g)||[]).length,2);
 for(const region of ids){
   assert.equal(svg.split(`data-clothing-region="${region}"`).length-1,1,`Exact SVG region missing ${id}:${region}`);
   assert(svg.includes('fill="'+t.defaultColours[region]+'"'));
   const box=getClothingTemplateArtworkBox(id,region);assert(box.width>0&&box.height>0);
 }
 const changed=createClothingTemplateSvg(id,{[ids[0]]:'#123456'},{[ids[0]]:{source:png,type:'image'}});
 assert(changed.includes('fill="#123456"'));assert(changed.includes(`data-clothing-artwork-region="${ids[0]}"`));
 const rex = new RegExp(`"${id}"\\s*:\\s*Object\\.freeze\\((\\[[^\\]]+\\])\\)`);
 const match=controller.match(rex);assert(match,`Backend allowlist missing ${id}`);
 assert.deepEqual(JSON.parse(match[1]),ids);
 assert(viewer.includes(`${id}: { creator: "toorkhan"`));
 const bytes=fs.readFileSync(path.join(root,'public/models/garments',expectedFiles[id]));
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(bytes.toString('ascii',16,20),'JSON');
 const jsonBytes=bytes.readUInt32LE(12);const doc=JSON.parse(bytes.toString('utf8',20,20+jsonBytes));
 const found=new Map();
 for(const node of doc.nodes??[]){if(typeof node.mesh!=='number')continue;
   assert(!found.has(node.name),`duplicate GLB region ${node.name}`);const mesh=doc.meshes[node.mesh];
   let count=0;for(const p of mesh.primitives){
      assert.equal(p.mode??4,4);for(const attribute of ['POSITION','NORMAL','TEXCOORD_0'])assert(Number.isInteger(p.attributes[attribute]),node.name+' missing '+attribute);
      assert(Number.isInteger(p.indices));count+=doc.accessors[p.indices].count/3;
   }found.set(node.name,count);
 }
 assert.deepEqual(new Set(found.keys()),new Set(ids));
 for(const region of ids)assert.equal(found.get(region),source[id].audit[region].triangles,`GLB triangles differ ${id}:${region}`);
 assert.equal([...found.values()].reduce((a,b)=>a+b,0),source[id].triangles);
 console.log(`[PASS] ${id}: ${regionCount}/${regionCount} matching editable regions; ${source[id].triangles.toLocaleString()} triangles; ${(bytes.length/1024/1024).toFixed(2)} MiB`);
}
assert.match(controller,/ANY\(\$2::text\[\]\)/);
assert.match(controller,/d\.is_public = TRUE/);assert.match(controller,/d\.is_published = TRUE/);
assert.match(viewer,/getGarment3DConfig/);
console.log('[PASS] 14 garment templates, 14 registered 3D models, 148 2D editable regions; read-only Showcase allowlist and fixed attribution.');
