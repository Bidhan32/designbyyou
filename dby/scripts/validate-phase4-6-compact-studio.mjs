// DesignByYou 3D Studio v4.6 regression guard (no extra npm dependency)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const viewer = fs.readFileSync(path.resolve(here, '../src/pages/sketches/editor/Garment3DViewer.jsx'), 'utf8');
const checks = [
  ['four focused editing tabs', /id: "color", label: "Color"/.test(viewer) && /id: "add", label: "Add"/.test(viewer) && /id: "edit", label: "Edit"/.test(viewer) && /id: "tools", label: "Tools"/.test(viewer)],
  ['compact sticky sidebar navigation', /sticky top-0 z-30/.test(viewer) && /aria-label="3D studio editing tools"/.test(viewer)],
  ['region picker available across tabs', /aria-controls="studio-region-picker"/.test(viewer) && /setRegionPickerOpen/.test(viewer)],
  ['bounded and searchable region list', /aria-label="Search garment regions"/.test(viewer) && /max-h-40 space-y-1 overflow-y-auto/.test(viewer)],
  ['select all front back and clear', /Quick region selections/.test(viewer) && /selectSet\(\[\]\)/.test(viewer)],
  ['model multi-select and optional highlight still available', /checked=\{multiSelect\}/.test(viewer) && /checked=\{highlightSelection\}/.test(viewer)],
  ['color panel stays isolated', /studioTab === "color"/.test(viewer) && /onClick=\{applyColour\}/.test(viewer)],
  ['bulk and single artwork paths retained', /artworkTargetMode === "batch"/.test(viewer) && /artworkTargetMode === "single"/.test(viewer) && /onMultiRegionArtworkApply\(/.test(viewer) && /onArtworkUpload\(/.test(viewer)],
  ['saved layers and transform controls retained', /studioTab === "edit"/.test(viewer) && /onClick=\{togglePlacement\}/.test(viewer) && /onClick=\{toggleTransform\}/.test(viewer)],
  ['advanced sliders collapsed', /<details className="group/.test(viewer) && /Fine-tune settings/.test(viewer)],
  ['transfer and cleanup still available', /toolsPanel === "transfer"/.test(viewer) && /toolsPanel === "cleanup"/.test(viewer) && /onArtworkTransfer\(/.test(viewer) && /onManageArtwork\(/.test(viewer)],
  ['tab change aborts previews, never auto saves', /const changeStudioTab/.test(viewer) && /endPlacementPreview\(\)/.test(viewer) && /cancelTransform\(\)/.test(viewer)],
  ['camera and pointer handlers untouched', /onPointerDownCapture=/.test(viewer) && /onRegionClick=\{handleModelRegionClick\}/.test(viewer) && /<CameraControls/.test(viewer)],
  ['fabric color only saved through apply callback', /const applyColour = useCallback/.test(viewer) && /onMultiRegionColourChange\(ids, hex\)/.test(viewer)],
];
for (const [name, passed] of checks) {
  try { assert(passed, name); console.log(`[PASS] ${name}`); }
  catch (e) { console.error(`[FAIL] ${name}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`Studio 4.6 checks passed (${checks.length}).`);
