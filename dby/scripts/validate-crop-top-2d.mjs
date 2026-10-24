import assert from 'node:assert/strict';
import {
 CLOTHING_TEMPLATES, getClothingTemplate, getClothingTemplateColourRegions,
 getClothingTemplateArtworkBox, createClothingTemplateSvg,
 createClothingTemplateMetadata, normaliseClothingTemplateArtwork
} from '../src/pages/sketches/templates/ClothingTemplates.js';
import {
 validateGarmentCatalog, getGarment3DConfig, filterGarmentTemplates
} from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const originalIds = ['tshirt', 'oversized-tshirt', 'polo', 'long-sleeve-tshirt',
 'shirt','hoodie','dress','pants','skirt'];
const newId = 'crop-top';
const result = validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(result.valid, `Catalog validation: ${result.errors.join('; ')}`);
assert(CLOTHING_TEMPLATES.length >= 10, 'Expected Crop Top plus previous nine 2D templates');
assert(CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0) >= 109, 'Expected at least 109 regions');
assert(CLOTHING_TEMPLATES.filter(t=>t.has3D).length >= 9, 'Nine older 3D registrations should survive');
for (const id of originalIds) {
 assert(getClothingTemplate(id), `Missing old 2D template: ${id}`);
 assert(getGarment3DConfig(id)?.url, `Existing GLB registration lost: ${id}`);
}
const top = getClothingTemplate(newId);
assert(top?.dualView && top?.editableColours && top?.editableArtwork);
if (top.has3D) {
 assert(getGarment3DConfig(newId)?.url?.endsWith('.glb'), 'Crop Top 3D must have an actual GLB path');
} else {
 assert.equal(getGarment3DConfig(newId), null, '2D-only Crop Top must not claim a GLB');
}
assert.equal(top.category,'tops');
const regions = getClothingTemplateColourRegions(newId);
assert.equal(regions.length,10);
assert.equal(new Set(regions.map(r=>r.id)).size,10);
assert.equal(regions.filter(r=>r.view==='front').length,5);
assert.equal(regions.filter(r=>r.view==='back').length,5);
const svg = createClothingTemplateSvg(newId);
assert(svg.includes('data-clothing-view="front"') && svg.includes('data-clothing-view="back"'));
for (const region of regions) {
 assert.equal(svg.split(`data-clothing-region="${region.id}"`).length-1, 1, `${region.id} must render once`);
 const box=getClothingTemplateArtworkBox(newId, region.id);
 assert(box?.width>0 && box?.height>0,`Missing artwork box for ${region.id}`);
 assert(top.defaultColours[region.id]);
}
const recoloured = createClothingTemplateSvg(newId,{frontBody:'#38bdf8',backHem:'#f472b6'});
assert(recoloured.includes('fill="#38bdf8"') && recoloured.includes('fill="#f472b6"'));
const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+hUk/qAAAAABJRU5ErkJggg==';
const artwork = { frontBody:{source:dataUrl,scale:0.65,opacity:0.8} };
assert(createClothingTemplateSvg(newId,{},artwork).includes('data-clothing-artwork-region="frontBody"'));
assert(normaliseClothingTemplateArtwork(newId,artwork).frontBody);
assert.equal(createClothingTemplateMetadata(newId)?.clothingTemplateId,newId);
assert.equal(createClothingTemplateMetadata(newId)?.clothingTemplateVersion,4);
assert(filterGarmentTemplates(CLOTHING_TEMPLATES,{query:'crop'}).some(x=>x.id===newId));
assert.equal(filterGarmentTemplates(CLOTHING_TEMPLATES,{mode:'3d'}).some(x=>x.id===newId),top.has3D);
console.log(`[PASS] ${CLOTHING_TEMPLATES.length} templates; ${CLOTHING_TEMPLATES.reduce((n,t)=>n+t.colourRegions.length,0)} editable 2D regions; ${CLOTHING_TEMPLATES.filter(t=>t.has3D).length} registered 3D models.`);
console.log('[PASS] Crop Top: 10 regions, front/back SVG, colours, artwork, metadata, category/search.');
console.log(`[PASS] All nine previous GLB registrations remain. Crop Top status: ${top.has3D ? '3D registered' : '2D only'}.`);
