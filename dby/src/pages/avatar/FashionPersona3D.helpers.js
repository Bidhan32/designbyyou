// Shared helpers and state kept separate from the React refresh boundary.
import { useGLTF } from "@react-three/drei";

function preloadFashionPersona3D(
  modelUrl =
    "/avatars/internal3d/base/human-base.glb",
) {
  if (!modelUrl) {
    return;
  }

  useGLTF.preload(
    modelUrl,
  );
}

export { preloadFashionPersona3D };
