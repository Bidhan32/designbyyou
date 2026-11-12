/** Validate Phase 4.7 leather coat from repo root or dby/. No external dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOTHING_TEMPLATES, getClothingTemplateArtworkBox, getClothingTemplateColourRegions, createClothingTemplateSvg } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig, validateGarmentCatalog } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const check=(val,message)=>{ console.log(`${val?'[PASS]':'[FAIL]'} ${message}`); if(!val)bad++;};
const id='leather-coat';
const template=CLOTHING_TEMPLATES.find(t=>t.id===id);
const regions=getClothingTemplateColourRegions(id);
const ids=regions.map(x=>x.id);
check(Boolean(template),'Leather coat template registered');
check(CLOTHING_TEMPLATES.length>=15,'Leather coat preserved in expanded garment catalog');
check(regions.length===13,'13 editable regions');
check(regions.filter(r=>r.view==='front').length===8,'8 front regions');
check(regions.filter(r=>r.view==='back').length===5,'5 back regions');
check(regions.every(r=>getClothingTemplateArtworkBox(id,r.id)?.width>0),'Artwork bounds for every region');
const svg=createClothingTemplateSvg(template);
check(ids.every(x=>svg.includes(`data-clothing-region="${x}"`)),'All GLB region IDs appear in 2D');
check(svg.includes('data-clothing-view="front"')&&svg.includes('data-clothing-view="back"'),'Both orthographic views present');
check(svg.includes('fill-rule="evenodd"'),'Supports traced contour cut-outs');
check(svg.includes('backUpper')&&svg.includes('backLower'),'Open-coat inner back visible in front drawing');
const entry=getGarment3DConfig(id);
const url=entry?.url;
check(url==='/models/garments/DBY_SourceLeatherLongCoat_13Regions.glb','Model URL bound to coat');
if (url) {
 const file=path.join(root,'public',url.slice(1));
 if (fs.existsSync(file)) {
  const buf=fs.readFileSync(file);
  const legal=buf.subarray(0,4).toString()==='glTF'&&buf.readUInt32LE(8)===buf.length&&buf.toString('ascii',16,20)==='JSON';
  check(legal,'GLB v2 header and byte length valid');
  if (legal) {
   const doc=JSON.parse(buf.toString('utf8',20,20+buf.readUInt32LE(12)));
   const found=new Set((doc.nodes||[]).filter(n=>Number.isInteger(n.mesh)).map(n=>n.name));
   check(ids.every(r=>found.has(r)),'All 13 region names backed by real GLB mesh nodes');
   check(found.size===13,'No unexpected editable 3D mesh region');
   check(buf.length < 2_000_000,'3D file below 2 MB');
  }
 } else check(false,'Converted leather-coat GLB present');
}
const catalog=validateGarmentCatalog(CLOTHING_TEMPLATES);
check(catalog.valid,'Full garment catalog structure valid');
if (bad) process.exitCode=1;
else console.log('\nPhase 4.7 leather coat passed: catalog, SVG, artwork bounds, and 3D mesh mapping.');
