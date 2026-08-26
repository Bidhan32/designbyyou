import React, {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";

import * as THREE from "three";

import {
  Canvas,
  useFrame,
} from "@react-three/fiber";

import {
  Bounds,
  Html,
  OrbitControls,
  useAnimations,
  useGLTF,
} from "@react-three/drei";

import {
  clone as cloneSkeleton,
} from "three/examples/jsm/utils/SkeletonUtils.js";

/* =========================================================
   DesignByYou
   Fashion Persona 3D
   Version 1.0

   Engine:
       internal_3d

   Responsibilities:
   ---------------------------------------------------------
   - Load shared human-base.glb
   - Apply face morph values
   - Apply body morph values
   - Apply appearance colors
   - Play available GLB animations
   - Provide lighting / camera / controls
   - Support avatar background themes

   Future:
   ---------------------------------------------------------
   - modular hair GLBs
   - modular clothing GLBs
   - modular accessories
   - Fashion Editor garments
   - selfie generated morph values
   - preview capture
   ========================================================= */

/* =========================================================
   Default Internal3D Config

   Mirrors the backend Internal3DProvider defaults.

   Keeping safe frontend defaults means the renderer can
   still display an avatar if some config properties are
   temporarily missing.
   ========================================================= */

export const DEFAULT_INTERNAL3D_CONFIG = Object.freeze({
  engineVersion: 1,

  schemaVersion: 1,

  face: {
    faceWidth: 0.5,
    faceHeight: 0.5,

    jawWidth: 0.5,
    jawShape: 0.5,

    cheekVolume: 0.5,

    chinWidth: 0.5,
    chinLength: 0.5,

    eyeSize: 0.5,
    eyeSpacing: 0.5,
    eyeHeight: 0.5,
    eyeTilt: 0.5,

    noseWidth: 0.5,
    noseLength: 0.5,
    noseBridge: 0.5,

    mouthWidth: 0.5,

    upperLip: 0.5,
    lowerLip: 0.5,
  },

  body: {
    frame: 0.5,

    height: 0.5,

    shoulderWidth: 0.5,

    chest: 0.5,

    waist: 0.5,

    hips: 0.5,

    muscularity: 0.25,

    armLength: 0.5,

    legLength: 0.5,
  },

  appearance: {
    skinTone: "#B98263",

    eyeColor: "#432918",

    hairColor: "#17120F",
  },

  hair: {
    asset: null,
  },

  outfit: {
    top: null,

    bottom: null,

    outerwear: null,

    shoes: null,
  },

  accessories: {
    glasses: null,

    headwear: null,

    earrings: null,

    necklace: null,
  },

  expression: "neutral",

  animation: "idle",
});

/* =========================================================
   Utility Helpers
   ========================================================= */

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function clamp01(value, fallback = 0.5) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return THREE.MathUtils.clamp(
    number,
    0,
    1,
  );
}

function safeColor(value, fallback) {
  try {
    return new THREE.Color(
      value || fallback,
    );
  } catch {
    return new THREE.Color(
      fallback,
    );
  }
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/* =========================================================
   Avatar Config Merger
   ========================================================= */

function normalizeAvatarConfig(config) {
  const incoming =
    isObject(config)
      ? config
      : {};

  return {
    ...DEFAULT_INTERNAL3D_CONFIG,

    ...incoming,

    face: {
      ...DEFAULT_INTERNAL3D_CONFIG.face,

      ...(isObject(incoming.face)
        ? incoming.face
        : {}),
    },

    body: {
      ...DEFAULT_INTERNAL3D_CONFIG.body,

      ...(isObject(incoming.body)
        ? incoming.body
        : {}),
    },

    appearance: {
      ...DEFAULT_INTERNAL3D_CONFIG.appearance,

      ...(isObject(incoming.appearance)
        ? incoming.appearance
        : {}),
    },

    hair: {
      ...DEFAULT_INTERNAL3D_CONFIG.hair,

      ...(isObject(incoming.hair)
        ? incoming.hair
        : {}),
    },

    outfit: {
      ...DEFAULT_INTERNAL3D_CONFIG.outfit,

      ...(isObject(incoming.outfit)
        ? incoming.outfit
        : {}),
    },

    accessories: {
      ...DEFAULT_INTERNAL3D_CONFIG.accessories,

      ...(isObject(incoming.accessories)
        ? incoming.accessories
        : {}),
    },
  };
}

/* =========================================================
   Morph Target Configuration

   Our future Blender base model should ideally use paired
   shape keys.

   Example:

       jawWidth_positive
       jawWidth_negative

   or:

       jawWidth_wide
       jawWidth_narrow

   Slider behavior:

       0.0 = negative extreme
       0.5 = neutral
       1.0 = positive extreme

   We also support a single morph named simply:

       jawWidth

   for early/testing GLB models.
   ========================================================= */

const MORPH_KEYS = Object.freeze([
  /* Face */

  "faceWidth",
  "faceHeight",

  "jawWidth",
  "jawShape",

  "cheekVolume",

  "chinWidth",
  "chinLength",

  "eyeSize",
  "eyeSpacing",
  "eyeHeight",
  "eyeTilt",

  "noseWidth",
  "noseLength",
  "noseBridge",

  "mouthWidth",

  "upperLip",
  "lowerLip",

  /* Body */

  "frame",

  "height",

  "shoulderWidth",

  "chest",

  "waist",

  "hips",

  "muscularity",

  "armLength",

  "legLength",
]);

const POSITIVE_SUFFIXES = Object.freeze([
  "positive",
  "plus",
  "max",
  "large",
  "bigger",
  "wide",
  "wider",
  "long",
  "longer",
  "high",
  "higher",
  "up",
]);

const NEGATIVE_SUFFIXES = Object.freeze([
  "negative",
  "minus",
  "min",
  "small",
  "smaller",
  "narrow",
  "narrower",
  "short",
  "shorter",
  "low",
  "lower",
  "down",
]);

/* =========================================================
   Morph Target Helpers
   ========================================================= */

function findMorphIndex(
  dictionary,
  candidates,
) {
  if (
    !dictionary ||
    typeof dictionary !== "object"
  ) {
    return null;
  }

  const entries =
    Object.entries(dictionary);

  const normalizedCandidates =
    candidates.map(
      normalizeName,
    );

  for (
    const [
      morphName,
      index,
    ] of entries
  ) {
    const normalized =
      normalizeName(morphName);

    if (
      normalizedCandidates.includes(
        normalized,
      )
    ) {
      return index;
    }
  }

  return null;
}

function getPositiveMorphCandidates(key) {
  return POSITIVE_SUFFIXES.flatMap(
    (suffix) => [
      `${key}_${suffix}`,
      `${key}-${suffix}`,
      `${key}${suffix}`,
    ],
  );
}

function getNegativeMorphCandidates(key) {
  return NEGATIVE_SUFFIXES.flatMap(
    (suffix) => [
      `${key}_${suffix}`,
      `${key}-${suffix}`,
      `${key}${suffix}`,
    ],
  );
}

function applyMorphValue(
  mesh,
  key,
  sliderValue,
) {
  if (
    !mesh?.morphTargetDictionary ||
    !Array.isArray(
      mesh?.morphTargetInfluences,
    )
  ) {
    return;
  }

  const dictionary =
    mesh.morphTargetDictionary;

  const influences =
    mesh.morphTargetInfluences;

  const value =
    clamp01(sliderValue);

  /*
   * Convert:
   *
   * 0   -> -1
   * .5  ->  0
   * 1   -> +1
   */

  const signedValue =
    (value - 0.5) * 2;

  const positiveIndex =
    findMorphIndex(
      dictionary,
      getPositiveMorphCandidates(
        key,
      ),
    );

  const negativeIndex =
    findMorphIndex(
      dictionary,
      getNegativeMorphCandidates(
        key,
      ),
    );

  /*
   * Preferred configuration:
   *
   * key_positive
   * key_negative
   */

  if (
    positiveIndex !== null ||
    negativeIndex !== null
  ) {
    if (
      positiveIndex !== null
    ) {
      influences[
        positiveIndex
      ] =
        Math.max(
          0,
          signedValue,
        );
    }

    if (
      negativeIndex !== null
    ) {
      influences[
        negativeIndex
      ] =
        Math.max(
          0,
          -signedValue,
        );
    }

    return;
  }

  /*
   * Fallback for a single morph:
   *
   * jawWidth
   */

  const directIndex =
    findMorphIndex(
      dictionary,
      [
        key,
        `morph_${key}`,
        `shape_${key}`,
        `blend_${key}`,
      ],
    );

  if (
    directIndex !== null
  ) {
    influences[
      directIndex
    ] =
      signedValue;
  }
}

/* =========================================================
   Apply Complete Face + Body Config
   ========================================================= */

function applyMorphConfiguration(
  root,
  config,
) {
  if (!root) {
    return;
  }

  const values = {
    ...config.face,

    ...config.body,
  };

  root.traverse(
    (object) => {
      if (
        !object?.isMesh &&
        !object?.isSkinnedMesh
      ) {
        return;
      }

      if (
        !object.morphTargetDictionary ||
        !object.morphTargetInfluences
      ) {
        return;
      }

      MORPH_KEYS.forEach(
        (key) => {
          if (
            values[key] ===
            undefined
          ) {
            return;
          }

          applyMorphValue(
            object,
            key,
            values[key],
          );
        },
      );
    },
  );
}

/* =========================================================
   Material Identification

   Later our production GLB should use clean names such as:

       Skin
       Iris
       Hair

   For now we also support common naming variations.
   ========================================================= */

function looksLikeSkin(
  meshName,
  materialName,
) {
  const value =
    normalizeName(
      `${meshName} ${materialName}`,
    );

  return [
    "skin",
    "body",
    "headskin",
    "faceskin",
    "armskin",
    "legskin",
  ].some(
    (keyword) =>
      value.includes(
        keyword,
      ),
  );
}

function looksLikeHair(
  meshName,
  materialName,
) {
  const value =
    normalizeName(
      `${meshName} ${materialName}`,
    );

  return value.includes(
    "hair",
  );
}

function looksLikeIris(
  meshName,
  materialName,
) {
  const value =
    normalizeName(
      `${meshName} ${materialName}`,
    );

  return (
    value.includes(
      "iris",
    ) ||
    value.includes(
      "eyecolor",
    )
  );
}

/* =========================================================
   Material Color Application
   ========================================================= */

function applyMaterialColors(
  root,
  appearance,
) {
  if (!root) {
    return;
  }

  const skinColor =
    safeColor(
      appearance.skinTone,
      "#B98263",
    );

  const eyeColor =
    safeColor(
      appearance.eyeColor,
      "#432918",
    );

  const hairColor =
    safeColor(
      appearance.hairColor,
      "#17120F",
    );

  root.traverse(
    (object) => {
      if (
        !object?.isMesh &&
        !object?.isSkinnedMesh
      ) {
        return;
      }

      const materials =
        Array.isArray(
          object.material,
        )
          ? object.material
          : [
              object.material,
            ];

      materials.forEach(
        (material) => {
          if (
            !material ||
            !material.color
          ) {
            return;
          }

          const meshName =
            object.name || "";

          const materialName =
            material.name || "";

          if (
            looksLikeHair(
              meshName,
              materialName,
            )
          ) {
            material.color.copy(
              hairColor,
            );

            material.needsUpdate =
              true;

            return;
          }

          if (
            looksLikeIris(
              meshName,
              materialName,
            )
          ) {
            material.color.copy(
              eyeColor,
            );

            material.needsUpdate =
              true;

            return;
          }

          if (
            looksLikeSkin(
              meshName,
              materialName,
            )
          ) {
            material.color.copy(
              skinColor,
            );

            material.needsUpdate =
              true;
          }
        },
      );
    },
  );
}

/* =========================================================
   Enable Shadows
   ========================================================= */

function configureMeshes(root) {
  root?.traverse(
    (object) => {
      if (
        object?.isMesh ||
        object?.isSkinnedMesh
      ) {
        object.castShadow =
          true;

        object.receiveShadow =
          true;

        object.frustumCulled =
          true;
      }
    },
  );
}

/* =========================================================
   Clone Materials

   SkeletonUtils clones the skeleton correctly, but materials
   may still be shared between GLTF instances.

   We clone materials so changing one user's skin/hair color
   does not modify another avatar instance.
   ========================================================= */

function cloneMaterials(root) {
  root?.traverse(
    (object) => {
      if (
        !object?.isMesh &&
        !object?.isSkinnedMesh
      ) {
        return;
      }

      if (
        Array.isArray(
          object.material,
        )
      ) {
        object.material =
          object.material.map(
            (material) =>
              material?.clone
                ? material.clone()
                : material,
          );

        return;
      }

      if (
        object.material?.clone
      ) {
        object.material =
          object.material.clone();
      }
    },
  );
}

/* =========================================================
   Animation Helpers
   ========================================================= */

function findAnimationName(
  names,
  requested,
) {
  if (
    !Array.isArray(names) ||
    names.length === 0
  ) {
    return null;
  }

  const requestedNormalized =
    normalizeName(requested);

  if (requestedNormalized) {
    const exact =
      names.find(
        (name) =>
          normalizeName(name) ===
          requestedNormalized,
      );

    if (exact) {
      return exact;
    }

    const partial =
      names.find(
        (name) =>
          normalizeName(name).includes(
            requestedNormalized,
          ),
      );

    if (partial) {
      return partial;
    }
  }

  const idle =
    names.find(
      (name) =>
        normalizeName(name).includes(
          "idle",
        ),
    );

  return (
    idle ||
    names[0] ||
    null
  );
}

/* =========================================================
   Actual 3D Human Model
   ========================================================= */

export function FashionPersona3DModel({
  avatar,

  autoRotate = false,

  rotationSpeed = 0.12,

  scale = 1,

  position = [0, 0, 0],
}) {
  const groupRef =
    useRef(null);

  const modelUrl =
    avatar?.model_glb_url ||
    "/avatars/internal3d/base/human-base.glb";

  const config =
    useMemo(
      () =>
        normalizeAvatarConfig(
          avatar?.avatar_config,
        ),
      [
        avatar?.avatar_config,
      ],
    );

  const gltf =
    useGLTF(modelUrl);

  /*
   * SkeletonUtils is required for safe cloning of skinned
   * characters.
   */

  const clonedScene =
    useMemo(
      () => {
        const clone =
          cloneSkeleton(
            gltf.scene,
          );

        cloneMaterials(
          clone,
        );

        configureMeshes(
          clone,
        );

        return clone;
      },
      [
        gltf.scene,
      ],
    );

  const {
    actions,
    names,
  } =
    useAnimations(
      gltf.animations,
      clonedScene,
    );

  /* =======================================================
     Apply Morph Targets
     ======================================================= */

  useEffect(
    () => {
      applyMorphConfiguration(
        clonedScene,
        config,
      );
    },
    [
      clonedScene,
      config,
    ],
  );

  /* =======================================================
     Apply Skin / Eye / Hair Color
     ======================================================= */

  useEffect(
    () => {
      applyMaterialColors(
        clonedScene,
        config.appearance,
      );
    },
    [
      clonedScene,
      config.appearance,
    ],
  );

  /* =======================================================
     Animation
     ======================================================= */

  useEffect(
    () => {
      if (
        !actions ||
        !names?.length
      ) {
        return undefined;
      }

      const requestedAnimation =
        config.animation ||
        avatar?.animation ||
        avatar?.pose ||
        "idle";

      const animationName =
        findAnimationName(
          names,
          requestedAnimation,
        );

      if (
        !animationName
      ) {
        return undefined;
      }

      const action =
        actions[
          animationName
        ];

      if (!action) {
        return undefined;
      }

      Object.values(
        actions,
      ).forEach(
        (otherAction) => {
          if (
            otherAction &&
            otherAction !==
              action
          ) {
            otherAction.fadeOut(
              0.2,
            );
          }
        },
      );

      action
        .reset()
        .fadeIn(0.25)
        .play();

      return () => {
        action.fadeOut(
          0.2,
        );
      };
    },
    [
      actions,
      names,
      config.animation,
      avatar?.animation,
      avatar?.pose,
    ],
  );

  /* =======================================================
     Optional Subtle Rotation

     Avatar Studio can enable this when desired.
     ======================================================= */

  useFrame(
    (
      _state,
      delta,
    ) => {
      if (
        !autoRotate ||
        !groupRef.current
      ) {
        return;
      }

      groupRef.current.rotation.y +=
        delta *
        rotationSpeed;
    },
  );

  return (
    <group
      ref={groupRef}
      position={position}
      scale={scale}
      dispose={null}
    >
      <primitive
        object={clonedScene}
      />
    </group>
  );
}

/* =========================================================
   Loading Indicator
   ========================================================= */

function AvatarLoading() {
  return (
    <Html center>
      <div
        className="flex min-w-[180px] flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-5 py-4 text-center text-white shadow-2xl backdrop-blur-xl"
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white"
        />

        <div>
          <p
            className="text-sm font-semibold"
          >
            Loading Fashion Persona
          </p>

          <p
            className="mt-1 text-xs text-slate-400"
          >
            Preparing the 3D model...
          </p>
        </div>
      </div>
    </Html>
  );
}

/* =========================================================
   Missing Model State
   ========================================================= */

function MissingModel({
  message =
    "No Internal3D model is available.",
}) {
  return (
    <div
      className="flex h-full min-h-[320px] w-full items-center justify-center p-6"
    >
      <div
        className="max-w-sm rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-center text-white shadow-xl backdrop-blur-xl"
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl"
        >
          3D
        </div>

        <p
          className="font-semibold"
        >
          Fashion Persona 3D
        </p>

        <p
          className="mt-2 text-sm leading-6 text-slate-400"
        >
          {message}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Canvas Error Boundary

   Missing/corrupted GLB files should not crash the entire
   React page.
   ========================================================= */

class Avatar3DErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }

  componentDidCatch(
    error,
    info,
  ) {
    console.error(
      "FashionPersona3D render error:",
      error,
      info,
    );
  }

  componentDidUpdate(
    previousProps,
  ) {
    if (
      previousProps.resetKey !==
        this.props.resetKey &&
      this.state.error
    ) {
      this.setState({
        error: null,
      });
    }
  }

  render() {
    if (
      this.state.error
    ) {
      return (
        <MissingModel
          message={
            this.state.error
              ?.message ||
            "The 3D avatar model could not be loaded."
          }
        />
      );
    }

    return this.props.children;
  }
}

/* =========================================================
   Background Themes
   ========================================================= */

const BACKGROUND_STYLES = Object.freeze({
  studio: {
    background:
      "radial-gradient(circle at 50% 20%, #334155 0%, #0f172a 42%, #020617 100%)",
  },

  "digital-studio": {
    background:
      "radial-gradient(circle at 35% 25%, rgba(6,182,212,0.28), transparent 34%), radial-gradient(circle at 70% 40%, rgba(139,92,246,0.24), transparent 38%), #020617",
  },

  runway: {
    background:
      "linear-gradient(180deg, #18181b 0%, #09090b 55%, #020617 100%)",
  },

  atelier: {
    background:
      "linear-gradient(145deg, #292524 0%, #1c1917 45%, #0c0a09 100%)",
  },

  minimal: {
    background:
      "linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%)",
  },

  neon: {
    background:
      "radial-gradient(circle at 25% 20%, rgba(168,85,247,0.38), transparent 30%), radial-gradient(circle at 75% 30%, rgba(34,211,238,0.34), transparent 32%), #020617",
  },

  luxury: {
    background:
      "radial-gradient(circle at 50% 10%, #422006 0%, #1c1917 42%, #09090b 100%)",
  },

  street: {
    background:
      "linear-gradient(145deg, #3f3f46 0%, #18181b 50%, #09090b 100%)",
  },

  nature: {
    background:
      "radial-gradient(circle at 50% 20%, #3f6212 0%, #14532d 38%, #052e16 100%)",
  },

  transparent: {
    background:
      "transparent",
  },
});

function getBackgroundStyle(
  theme,
) {
  return (
    BACKGROUND_STYLES[
      theme
    ] ||
    BACKGROUND_STYLES.studio
  );
}

/* =========================================================
   Ground
   ========================================================= */

function AvatarGround({
  visible = true,
}) {
  if (!visible) {
    return null;
  }

  return (
    <mesh
      rotation={[
        -Math.PI / 2,
        0,
        0,
      ]}
      position={[
        0,
        -0.01,
        0,
      ]}
      receiveShadow
    >
      <circleGeometry
        args={[
          3.2,
          96,
        ]}
      />

      <meshStandardMaterial
        color="#111827"
        roughness={0.82}
        metalness={0.08}
        transparent
        opacity={0.34}
      />
    </mesh>
  );
}

/* =========================================================
   Main FashionPersona3D Component
   ========================================================= */

export default function FashionPersona3D({
  avatar,

  className = "",

  style = {},

  height = 560,

  interactive = true,

  autoRotate = false,

  rotationSpeed = 0.12,

  showGround = true,

  enableZoom = true,

  enablePan = false,

  minDistance = 1.8,

  maxDistance = 7,

  cameraPosition = [
    0,
    1.4,
    3.6,
  ],

  cameraFov = 32,

  modelScale = 1,

  modelPosition = [
    0,
    0,
    0,
  ],

  shadows = true,
}) {
  const modelUrl =
    avatar?.model_glb_url ||
    (
      avatar?.avatar_engine ===
      "internal_3d"
        ? "/avatars/internal3d/base/human-base.glb"
        : null
    );

  const backgroundTheme =
    avatar?.background_theme ||
    "studio";

  const isTransparent =
    backgroundTheme ===
    "transparent";

  const wrapperStyle = {
    position: "relative",

    width: "100%",

    height:
      typeof height ===
      "number"
        ? `${height}px`
        : height,

    overflow: "hidden",

    borderRadius:
      "1.5rem",

    ...getBackgroundStyle(
      backgroundTheme,
    ),

    ...style,
  };

  if (
    avatar?.avatar_engine &&
    avatar.avatar_engine !==
      "internal_3d"
  ) {
    return (
      <MissingModel
        message="This avatar is not using the Internal3D engine."
      />
    );
  }

  if (!modelUrl) {
    return (
      <MissingModel
        message="The Internal3D base model URL is missing."
      />
    );
  }

  return (
    <Avatar3DErrorBoundary
      resetKey={modelUrl}
    >
      <div
        className={className}
        style={wrapperStyle}
      >
        <Canvas
          shadows={shadows}
          dpr={[
            1,
            2,
          ]}
          gl={{
            antialias: true,

            alpha:
              isTransparent,

            powerPreference:
              "high-performance",
          }}
          camera={{
            position:
              cameraPosition,

            fov:
              cameraFov,

            near:
              0.05,

            far:
              100,
          }}
          onCreated={({
            gl,
          }) => {
            gl.outputColorSpace =
              THREE.SRGBColorSpace;

            gl.toneMapping =
              THREE.ACESFilmicToneMapping;

            gl.toneMappingExposure =
              1.05;

            gl.setClearAlpha(
              isTransparent
                ? 0
                : 1,
            );
          }}
        >
          {/* =================================================
              Lighting
              ================================================= */}

          <ambientLight
            intensity={1.1}
          />

          <hemisphereLight
            intensity={1.25}
            groundColor="#111827"
          />

          <directionalLight
            position={[
              4,
              7,
              4,
            ]}
            intensity={2.6}
            castShadow={shadows}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={20}
          />

          <directionalLight
            position={[
              -4,
              3,
              1,
            ]}
            intensity={1.1}
          />

          <pointLight
            position={[
              0,
              3.5,
              -3,
            ]}
            intensity={1.2}
          />

          {/* =================================================
              Character
              ================================================= */}

          <Suspense
            fallback={
              <AvatarLoading />
            }
          >
            <Bounds
              fit
              clip
              observe
              margin={1.3}
            >
              <FashionPersona3DModel
                avatar={{
                  ...avatar,

                  model_glb_url:
                    modelUrl,
                }}
                autoRotate={
                  autoRotate
                }
                rotationSpeed={
                  rotationSpeed
                }
                scale={
                  modelScale
                }
                position={
                  modelPosition
                }
              />

              <AvatarGround
                visible={
                  showGround &&
                  !isTransparent
                }
              />
            </Bounds>
          </Suspense>

          {/* =================================================
              Interaction
              ================================================= */}

          {interactive && (
            <OrbitControls
              makeDefault
              enableRotate
              enableZoom={
                enableZoom
              }
              enablePan={
                enablePan
              }
              minDistance={
                minDistance
              }
              maxDistance={
                maxDistance
              }
              minPolarAngle={
                Math.PI *
                0.15
              }
              maxPolarAngle={
                Math.PI *
                0.82
              }
              target={[
                0,
                1,
                0,
              ]}
              dampingFactor={
                0.07
              }
              enableDamping
            />
          )}
        </Canvas>

        {/* ===================================================
            Small Status Badge
            =================================================== */}

        <div
          className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-xl"
        >
          Fashion Persona 3D
        </div>
      </div>
    </Avatar3DErrorBoundary>
  );
}

/* =========================================================
   Preload Helper

   Call this only once human-base.glb actually exists.

   Example elsewhere:

       preloadFashionPersona3D();
   ========================================================= */

export function preloadFashionPersona3D(
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