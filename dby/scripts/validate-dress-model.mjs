/**
 * DesignByYou Phase 4.2: zero-dependency Dress GLB compatibility test.
 * From dby/: node scripts/validate-dress-model.mjs
 * In addition, run the existing broader validate-garment-catalog.mjs --strict-glb.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClothingTemplate, getClothingTemplateArtworkBox } from '../src/pages/sketches/templates/ClothingTemplates.js';
import { getGarment3DConfig } from '../src/pages/sketches/templates/GarmentTemplateRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = getClothingTemplate('dress');
const config = getGarment3DConfig('dress');
function check(condition, message) { if (!condition) throw new Error(message); }
check(template?.id === 'dress', 'Dress 2D template missing');
check(config?.url?.startsWith('/models/garments/'), 'Dress 3D registry configuration missing');
const base = path.resolve(root, 'public');
const filename = path.resolve(base, config.url.slice(1));
check(filename.startsWith(base + path.sep), 'unsafe Dress GLB path');
const b = fs.readFileSync(filename);
check(b.toString('ascii', 0, 4) === 'glTF', 'not a GLB');
check(b.readUInt32LE(4) === 2, 'not GLB 2.0');
check(b.readUInt32LE(8) === b.length, 'GLB declared length mismatch');
check(b.toString('ascii', 16, 20) === 'JSON', 'missing GLB JSON chunk');
const len = b.readUInt32LE(12);
check(len > 0 && len + 20 <= b.length, 'corrupt GLB JSON chunk');
const doc = JSON.parse(b.toString('utf8', 20, 20+len));
check(doc.asset?.version === '2.0', 'not glTF v2');
check(Array.isArray(doc.scenes) && Array.isArray(doc.meshes), 'invalid GLB scene');
const scene = doc.scenes[doc.scene || 0];
check(Array.isArray(scene.nodes) && scene.nodes.length, 'missing default GLB scene');
const nodes = doc.nodes || [];
const meshes = doc.meshes || [];
const accessors = doc.accessors || [];
const byName = new Map();
function walk(index, parentName, visited) {
  check(index >= 0 && index < nodes.length, `bad node index: ${index}`);
  check(!visited.has(index), `cyclic node graph: ${index}`);
  const node = nodes[index];
  const ancestry = new Set(visited); ancestry.add(index);
  const regionName = node.name || parentName;
  if (Number.isInteger(node.mesh)) {
    const mesh = meshes[node.mesh];
    check(mesh?.primitives?.length > 0, `${regionName}: missing mesh geometry`);
    let triangles = 0;
    for (const primitive of mesh.primitives) {
      check(primitive.attributes?.POSITION !== undefined, `${regionName}: no POSITION geometry`);
      const count = accessors[primitive.indices]?.count || accessors[primitive.attributes.POSITION]?.count || 0;
      check(count >= 3, `${regionName}: empty primitive`);
      triangles += Math.floor(count/3);
    }
    check(!byName.has(regionName), `duplicated editable mesh: ${regionName}`);
    byName.set(regionName, triangles);
  }
  for (const child of node.children || []) walk(child, regionName, ancestry);
}
for (const nodeIndex of scene.nodes) walk(nodeIndex, '', new Set());
const expected = template.colourRegions.map(r => r.id);
check(expected.length === 12, `Dress should have 12 regions, found ${expected.length}`);
for (const id of expected) {
  check(byName.has(id), `GLB is missing editable Dress region: ${id}`);
  const box = getClothingTemplateArtworkBox('dress', id);
  check(box?.width > 0 && box?.height > 0, `2D artwork bounds missing: ${id}`);
}
const unexpected = [...byName.keys()].filter(id => !expected.includes(id));
check(unexpected.length === 0, `Unexpected mesh names: ${unexpected.join(', ')}`);
check(b.length < 3_000_000, `Dress model exceeds 3 MB: ${b.length}`);
console.log('Dress 2D + 3D compatibility validated.');
for (const id of expected) console.log(`  ${id.padEnd(22)} ${byName.get(id)} triangles`);
console.log(`12/12 regions, ${(b.length/1048576).toFixed(2)} MB, all saved IDs unchanged.`);
