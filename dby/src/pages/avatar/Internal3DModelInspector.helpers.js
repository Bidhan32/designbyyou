// Shared helpers and state kept separate from the React refresh boundary.
import { useGLTF } from "@react-three/drei";

/* =========================================================
   DesignByYou
   Internal3D Model Inspector
   Version 1.0

   PURPOSE
   ---------------------------------------------------------

   Development utility for inspecting any Internal3D GLB.

   It detects:

   - meshes
   - skinned meshes
   - materials
   - skeleton bones
   - animations
   - morph targets
   - vertex counts
   - triangle counts

   It also checks whether the model satisfies our
   DesignByYou Internal3D requirements.

   ========================================================= */

/* =========================================================
   Production Standards
   ========================================================= */

const INTERNAL3D_REQUIRED_MATERIALS = [
  "Skin",
  "Iris",
  "EyeWhite",
];

const INTERNAL3D_REQUIRED_BONES = [
  "Hips",

  "Spine",
  "Chest",

  "Neck",
  "Head",

  "LeftShoulder",
  "LeftUpperArm",
  "LeftForearm",
  "LeftHand",

  "RightShoulder",
  "RightUpperArm",
  "RightForearm",
  "RightHand",

  "LeftUpperLeg",
  "LeftLowerLeg",
  "LeftFoot",

  "RightUpperLeg",
  "RightLowerLeg",
  "RightFoot",
];

const INTERNAL3D_V1_REQUIRED_MORPHS = [
  "faceWidth_positive",
  "faceWidth_negative",

  "jawWidth_positive",
  "jawWidth_negative",

  "noseWidth_positive",
  "noseWidth_negative",

  "shoulderWidth_positive",
  "shoulderWidth_negative",
];

const INTERNAL3D_FULL_MORPH_STANDARD = [
  /* FACE */

  "faceWidth_positive",
  "faceWidth_negative",

  "faceHeight_positive",
  "faceHeight_negative",

  "jawWidth_positive",
  "jawWidth_negative",

  "jawShape_positive",
  "jawShape_negative",

  "cheekVolume_positive",
  "cheekVolume_negative",

  "chinWidth_positive",
  "chinWidth_negative",

  "chinLength_positive",
  "chinLength_negative",

  "eyeSize_positive",
  "eyeSize_negative",

  "eyeSpacing_positive",
  "eyeSpacing_negative",

  "eyeHeight_positive",
  "eyeHeight_negative",

  "eyeTilt_positive",
  "eyeTilt_negative",

  "noseWidth_positive",
  "noseWidth_negative",

  "noseLength_positive",
  "noseLength_negative",

  "noseBridge_positive",
  "noseBridge_negative",

  "mouthWidth_positive",
  "mouthWidth_negative",

  "upperLip_positive",
  "upperLip_negative",

  "lowerLip_positive",
  "lowerLip_negative",

  /* BODY */

  "frame_positive",
  "frame_negative",

  "height_positive",
  "height_negative",

  "shoulderWidth_positive",
  "shoulderWidth_negative",

  "chest_positive",
  "chest_negative",

  "waist_positive",
  "waist_negative",

  "hips_positive",
  "hips_negative",

  "muscularity_positive",
  "muscularity_negative",

  "armLength_positive",
  "armLength_negative",

  "legLength_positive",
  "legLength_negative",
];

function preloadInternal3DModel(
  modelUrl =
    "/avatars/internal3d/base/human-base.glb",
) {
  useGLTF.preload(
    modelUrl,
  );
}

export { INTERNAL3D_REQUIRED_MATERIALS, INTERNAL3D_REQUIRED_BONES, INTERNAL3D_V1_REQUIRED_MORPHS, INTERNAL3D_FULL_MORPH_STANDARD, preloadInternal3DModel };
