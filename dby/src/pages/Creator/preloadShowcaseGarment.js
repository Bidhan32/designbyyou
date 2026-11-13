import { useGLTF } from "@react-three/drei";
import { getGarment3DConfig } from "../sketches/templates/GarmentTemplateRegistry.js";

export function preloadShowcaseGarment(model) {
  const config = getGarment3DConfig(model);
  if (config?.url) useGLTF.preload(config.url);
}
