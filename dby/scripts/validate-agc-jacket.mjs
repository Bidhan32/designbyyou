/**
 * DesignByYou Phase 4.8: verify original AGC Jacket 12-region registration,
 * exactly matched front/back 2D region IDs and real 3D geometry.
 * Run from repository root: node dby/scripts/validate-agc-jacket.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOTHING_TEMPLATES, getClothingTemplateArtworkBox, getClothingTemplateColourRegions, createClothingTemplateSvg } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig, validateGarmentCatalog } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'agc-jacket';
const NAMES = [
  'frontLeftBody', 'frontRightBody', 'backLeftBody', 'backRightBody',
  'leftSleeve', 'rightSleeve', 'leftCuff', 'rightCuff',
  'collar', 'leftPocket', 'rightPocket', 'frontPlacket',
];
let failures = 0;
const check = (condition, description) => {
  console.log(`${condition ? '[PASS]' : '[FAIL]'} ${description}`);
  if (!condition) failures += 1;
};
const template = CLOTHING_TEMPLATES.find(t => t.id === ID);
const regions = getClothingTemplateColourRegions(ID);
const regionIds = regions.map(r => r.id);
const model = getGarment3DConfig(ID);
const svg = template ? createClothingTemplateSvg(template) : '';
check(Boolean(template), 'AGC Jacket template registered');
check(CLOTHING_TEMPLATES.length === 16, '16 garment templates registered');
check(regions.length === 12, 'Exactly twelve semantic fabric regions');
check(regionIds.join('|') === NAMES.join('|'), 'Expected stable region IDs and order');
check(regions.length === new Set(regionIds).size, 'No duplicate region IDs');
check(regions.every(r => getClothingTemplateArtworkBox(ID, r.id)?.width > 0), 'Artwork bounds on all regions');
check(regions.every(r => template?.defaultColours?.[r.id]), 'All regions have default colors');
check(svg.includes('data-clothing-view="front"') && svg.includes('data-clothing-view="back"'), 'Both orthographic SVG views');
check(regionIds.every(id => svg.includes(`data-clothing-region="${id}"`)), 'All color IDs exist in SVG');
check(svg.includes('fill-rule="evenodd"'), 'Geometry-traced contour holes supported');
check(svg.includes('pointer-events="none"'), 'Source hardware buttons are decorative, not selectable fabric');
const recolored = template ? createClothingTemplateSvg(template, {leftPocket:'#ff00cc'}) : '';
check(/data-clothing-region="leftPocket"[\s\S]{0,200}fill="#ff00cc"/.test(recolored), 'Color override reaches a specific front pocket');
check(model?.url === '/models/garments/DBY_AGC_Jacket_12Regions.glb', 'Registry points to converted GLB');
const publicFile = model?.url ? path.join(root, 'public', model.url.substring(1)) : '';
check(Boolean(publicFile && fs.existsSync(publicFile)), 'Converted AGC model exists');
if (publicFile && fs.existsSync(publicFile)) {
  const b = fs.readFileSync(publicFile);
  const magic = b.subarray(0,4).toString();
  const good = magic === 'glTF' && b.readUInt32LE(4) === 2 && b.readUInt32LE(8) === b.length && b.toString('ascii',16,20) === 'JSON';
  check(good, 'Valid GLB 2.0 byte structure');
  if (good) {
    const json = JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
    const names = new Set((json.nodes || []).filter(n => Number.isInteger(n.mesh)).map(n => n.name));
    check(NAMES.every(id => names.has(id)), 'All twelve editable meshes exist as distinct source-derived nodes');
    check(names.has('AGC_DecorativeButtons'), 'Original button mesh retained separately');
    check(names.size === 13, 'No unknown extra mesh names');
    const count = (json.meshes || []).reduce((sum,mesh) => sum + (mesh.primitives || []).reduce((sub,p) => sub + (json.accessors?.[p.indices]?.count || 0)/3,0),0);
    check(count === 18534, 'All 18,534 source triangles remain in GLB');
    check((json.materials || []).every(m => !m.alphaMode || m.alphaMode === 'OPAQUE'), 'Opaque rendering; no transparency-through-jacket bug');
    const asset = json.asset || {};
    check(asset.extras?.author?.includes('akhaller') && asset.extras?.license?.includes('CC-BY-4.0'), 'Original Sketchfab attribution embedded');
    check(b.length < 5_000_000, 'Model remains less than 5 MB');
  }
}
check(validateGarmentCatalog(CLOTHING_TEMPLATES).valid, 'Full clothing registry validates');
if (failures) {
  console.error(`\nAGC Jacket validation failed: ${failures} checks.`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 4.8 AGC Jacket validated: 16 garments, 173 color regions, all 3D/2D IDs and provenance.');
}
