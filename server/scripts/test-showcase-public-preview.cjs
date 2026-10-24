"use strict";
// Lightweight backend security/behavior contract test; no DB needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../server/controllers/creators/creatorshowcaseController.js'), 'utf8');
const start = source.indexOf('const SHOWCASE_3D_REGIONS_BY_MODEL = Object.freeze({');
const bodyStart = source.indexOf('async function getPublicGarment3DPreview(designId) {');
const bodyEnd = source.indexOf('exports.getShowcaseItem =', bodyStart);
assert.ok(start >= 0 && bodyStart > start && bodyEnd > bodyStart);
const mapText = source.slice(start, source.indexOf('const SHOWCASE_3D_HEX =', start));
const functionText = source.slice(bodyStart, bodyEnd);
const calls = [];
let resultRow = null;
const context = {
  Object, Buffer, console,
  db: { query: async (...args) => {calls.push(args); return { rows: resultRow ? [resultRow] : [] };} },
  makePublic3DOverlay: async (source) => (typeof source === 'string' && source.startsWith('data:image/png;base64,') ? source : null),
  SHOWCASE_3D_HEX: /^#[0-9a-f]{6}$/i,
};
vm.createContext(context);
vm.runInContext(mapText + functionText + '\nthis.getPreview = getPublicGarment3DPreview; this.models = SHOWCASE_3D_MODEL_IDS;', context);
const modelIds = [...context.models];
assert.equal(modelIds.length,11);
(async()=>{
  // All public models are included in bound SQL filter without URL or project input.
  resultRow = {model:'jeans', colours: { frontLeftLeg:'#123456', backRightLeg:'not-hex', notARegion:'#111111' },
    artwork:{frontLeftLeg:{source:'data:image/png;base64,AA=='},other:{source:'data:image/png;base64,AA=='}},
    canvas_state:{secret:true}, clothingArtworkLayers:{secret:true}};
  const preview=await context.getPreview('00000000-0000-0000-0000-000000000001');
  assert.deepEqual(calls[0][1][1].slice().sort(),modelIds.slice().sort());
  assert.match(calls[0][0],/d\.is_public = TRUE/);
  assert.match(calls[0][0],/d\.is_published = TRUE/);
  assert.match(calls[0][0],/ANY\(\$2::text\[\]\)/);
  assert.equal(preview.model,'jeans');
  assert.equal(preview.colours.frontLeftLeg,'#123456');
  assert.equal(preview.colours.backRightLeg,'#ffffff');
  assert.equal(preview.artwork.frontLeftLeg.type,'image');
  assert.ok(!Object.hasOwn(preview.colours,'notARegion'));
  assert.ok(!Object.hasOwn(preview.artwork,'other'));
  assert.ok(!Object.hasOwn(preview,'canvas_state'));
  assert.ok(!Object.hasOwn(preview,'clothingArtworkLayers'));
  assert.ok(!Object.hasOwn(preview,'modelUrl'));
  resultRow={model:'unknown',colours:{},artwork:{}};
  assert.equal(await context.getPreview('00000000-0000-0000-0000-000000000001'), null);
  resultRow=null;
  assert.equal(await context.getPreview('00000000-0000-0000-0000-000000000001'), null);
  console.log('PASS: 11-model backend whitelist, published-only query, sanitized read-only Jeans preview and unknown-model rejection.');
})().catch((error)=>{console.error(error);process.exitCode=1;});
