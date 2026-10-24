/**
 * DesignByYou Phase 4.1 garment library validator
 * Run from dby/: node scripts/validate-garment-catalog.mjs
 * Structural-only: node scripts/validate-garment-catalog.mjs --skip-model-files
 * Strict mesh validation: node scripts/validate-garment-catalog.mjs --strict-glb
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOTHING_TEMPLATES, createClothingTemplateSvg } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig, validateGarmentCatalog } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipModels = process.argv.includes('--skip-model-files');
const strictGlb = process.argv.includes('--strict-glb');
const result = validateGarmentCatalog(CLOTHING_TEMPLATES);
const errors = [...result.errors];
const warnings = [...result.warnings];

function readGlbModelNodes(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error('not a valid glTF 2.0 binary (.glb)');
  }
  const declaredLength = bytes.readUInt32LE(8);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString('ascii', 16, 20);
  if (declaredLength !== bytes.length || jsonType !== 'JSON' || jsonLength <= 0 || jsonLength + 20 > bytes.length) {
    throw new Error('invalid GLB header or JSON chunk');
  }
  const model = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim());
  return { model, byteLength: bytes.length };
}

function inspectMeshRegionNames(model, regionIds) {
  const nodes = Array.isArray(model.nodes) ? model.nodes : [];
  const regions = new Set(regionIds);
  const found = new Set();
  const rootIndices = new Set();
  const childIndices = new Set();
  for (const node of nodes) for (const i of node.children || []) childIndices.add(i);
  for (let i = 0; i < nodes.length; i++) if (!childIndices.has(i)) rootIndices.add(i);
  // Traverse inherited parent names in the same way the Three.js loader's scene hierarchy is used.
  function visit(index, inherited, ancestry) {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length || ancestry.has(index)) return;
    const node = nodes[index];
    const next = regions.has(node.name) ? node.name : inherited;
    if (next && Number.isInteger(node.mesh)) found.add(next);
    const stack = new Set(ancestry); stack.add(index);
    for (const child of node.children || []) visit(child, next, stack);
  }
  for (const i of rootIndices) visit(i, null, new Set());
  return { found, missing: regionIds.filter((id) => !found.has(id)) };
}

for (const template of CLOTHING_TEMPLATES) {
  const id = template.id;
  try {
    const svg = createClothingTemplateSvg(template);
    for (const region of template.colourRegions) {
      if (!svg.includes(`data-clothing-region="${region.id}"`)) {
        errors.push(`${id}: 2D SVG does not render ${region.id}`);
      }
    }
    if (!svg.startsWith('<svg')) errors.push(`${id}: 2D SVG has an unexpected root`);
  } catch (error) {
    errors.push(`${id}: SVG rendering failed: ${error.message}`);
  }
  const modelConfig = getGarment3DConfig(id);
  if (!modelConfig) {
    console.log(`[2D only] ${template.label} — ${template.colourRegions.length} regions`);
    continue;
  }
  if (skipModels) {
    console.log(`[2D + 3D registry] ${template.label} — ${template.colourRegions.length} regions`);
    continue;
  }
  const relativeFile = modelConfig.url.replace(/^\//, '');
  const filename = path.resolve(root, 'public', relativeFile);
  // A registry cannot load files from outside dby/public.
  if (!filename.startsWith(path.resolve(root, 'public') + path.sep)) {
    errors.push(`${id}: unsafe GLB path`);
    continue;
  }
  if (!fs.existsSync(filename)) {
    errors.push(`${id}: missing GLB at dby/public/${relativeFile}`);
    continue;
  }
  try {
    const { model, byteLength } = readGlbModelNodes(filename);
    const { found, missing } = inspectMeshRegionNames(model, template.colourRegions.map((r) => r.id));
    console.log(`[2D + 3D] ${template.label}: ${found.size}/${template.colourRegions.length} editable mesh regions, ${(byteLength / 1048576).toFixed(2)} MB`);
    if (missing.length) {
      const text = `${id}: GLB region names not matched: ${missing.join(', ')}. Check the 3D model in the editor.`;
      if (strictGlb) errors.push(text);
      else warnings.push(text);
    }
    if (byteLength > 20 * 1048576) warnings.push(`${id}: GLB exceeds 20 MB; consider optimizing for mobile.`);
  } catch (error) {
    errors.push(`${id}: invalid GLB: ${error.message}`);
  }
}
console.log(`\nGarments: ${CLOTHING_TEMPLATES.length}, 2D regions: ${CLOTHING_TEMPLATES.reduce((n, t) => n + t.colourRegions.length, 0)}, 3D registered: ${CLOTHING_TEMPLATES.filter(t => t.has3D).length}`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) {
  console.error(`\nValidation failed: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
}
