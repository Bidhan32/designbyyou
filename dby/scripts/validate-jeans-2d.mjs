import assert from 'node:assert/strict';
import {CLOTHING_TEMPLATES,getClothingTemplate,getClothingTemplateArtworkBox,createClothingTemplateSvg,createClothingTemplateMetadata} from '../src/pages/sketches/templates/ClothingTemplates.js';
import {getGarment3DConfig,validateGarmentCatalog,filterGarmentTemplates} from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';
const catalog=validateGarmentCatalog(CLOTHING_TEMPLATES);
assert(catalog.valid,catalog.errors.join('; '));
assert.equal(CLOTHING_TEMPLATES.length,11);
assert.equal(CLOTHING_TEMPLATES.filter(x=>x.has3D).length,11);
assert.equal(CLOTHING_TEMPLATES.reduce((n,x)=>n+x.colourRegions.length,0),119);
for (const id of ['tshirt','oversized-tshirt','polo','long-sleeve-tshirt','crop-top','shirt','hoodie','dress','pants','skirt']) {
 assert(getClothingTemplate(id));assert(getGarment3DConfig(id)?.url,`Missing old model for ${id}`);
}
const j=getClothingTemplate('jeans');
assert(j&&j.category==='bottoms'&&j.dualView&&j.editableColours&&j.editableArtwork&&j.has3D);
assert.equal(j.colourRegions.length,10);
assert.equal(j.colourRegions.filter(r=>r.view==='front').length,5);
assert.equal(j.colourRegions.filter(r=>r.view==='back').length,5);
const svg=createClothingTemplateSvg('jeans');
for(const reg of j.colourRegions){
 assert.equal(svg.split(`data-clothing-region="${reg.id}"`).length-1,1,`Missing 2D SVG region ${reg.id}`);
 assert(j.defaultColours[reg.id]);
 const box=getClothingTemplateArtworkBox('jeans',reg.id);
 assert(box?.width>0&&box?.height>0,`Missing artwork bounds for ${reg.id}`);
}
assert.equal(createClothingTemplateMetadata('jeans')?.clothingTemplateId,'jeans');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+hUk/qAAAAABJRU5ErkJggg==';
assert(createClothingTemplateSvg('jeans',{}, {frontLeftPocket:{type:'image',source:png,scale:.75}}).includes('data-clothing-artwork-region="frontLeftPocket"'));
assert(createClothingTemplateSvg('jeans',{frontRightLeg:'#ef4444'}).includes('fill="#ef4444"'));
assert(filterGarmentTemplates(CLOTHING_TEMPLATES,{category:'bottoms'}).some(x=>x.id==='jeans'));
console.log('[PASS] Jeans: ten editable dual-view 2D regions, artwork bounds, colors, SVG, metadata');
console.log('[PASS] Eleven templates, eleven 3D models, 119 2D editable regions; ten prior garments preserved');
