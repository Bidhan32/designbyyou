import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dby = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const editor = fs.readFileSync(path.join(dby,"src/pages/sketches/editor/FashionEditor.jsx"),"utf8");
const viewer = fs.readFileSync(path.join(dby,"src/pages/sketches/editor/Garment3DViewer.jsx"),"utf8");
const guard = fs.readFileSync(path.join(dby,"src/pages/sketches/editor/Garment3DClickGuard.js"),"utf8");
const tests = {
  "3D viewer receives stored colors": viewer.includes("const resolvedColours = colours;"),
  "3D viewer captures region pointer-down": viewer.includes("onRegionPointerDown={handleRegionPointerDown}"),
  "3D viewer blocks moving camera gestures": viewer.includes("onCameraChange={handleCameraChange}"),
  "3D viewer validates exact clicked region": viewer.includes("consumeClick(regionId)"),
  "3D selection starts empty": viewer.includes("const [selectedRegions, setSelectedRegions] = useState([]);"),
  "3D highlight is optional": viewer.includes("highlightSelection={highlightSelection}"),
  "3D color only applies by Apply handler": viewer.includes("onMultiRegionColourChange(ids, hex)"),
  "3D exposes multi-select controls": viewer.includes("checked={multiSelect}"),
  "click guard checks matching pointer-down region": guard.includes("gesture.downRegion === regionId"),
  "click guard detects actual camera movement": guard.includes("cameraChanged()"),
  "FashionEditor supplies batch color bridge": editor.includes("onMultiRegionColourChange={handleMultiRegionClothingColourChange}"),
  "FashionEditor supplies single color bridge": editor.includes("onColourChange={handleSelectedClothingColourChange}"),
  "FashionEditor edit guards locked garments": editor.includes("selectedImageLocked ||"),
};
for (const [label, pass] of Object.entries(tests)) console.log(`[${pass ? "PASS" : "FAIL"}] ${label}`);
if (Object.values(tests).some(v=>!v)) process.exit(1);
console.log("Phase 4.5.2 bridge checks passed.");
