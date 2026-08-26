import React, {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Canvas } from "@react-three/fiber";

import {
  Bounds,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";

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

export const INTERNAL3D_REQUIRED_MATERIALS = [
  "Skin",
  "Iris",
  "EyeWhite",
];

export const INTERNAL3D_REQUIRED_BONES = [
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

/*
 * Our first morph milestone.
 *
 * Do NOT try to build every morph immediately.
 *
 * Once these work, we expand the full system.
 */

export const INTERNAL3D_V1_REQUIRED_MORPHS = [
  "faceWidth_positive",
  "faceWidth_negative",

  "jawWidth_positive",
  "jawWidth_negative",

  "noseWidth_positive",
  "noseWidth_negative",

  "shoulderWidth_positive",
  "shoulderWidth_negative",
];

/* =========================================================
   Full Future Morph Standard
   ========================================================= */

export const INTERNAL3D_FULL_MORPH_STANDARD = [
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

/* =========================================================
   Helpers
   ========================================================= */

function cleanName(value, fallback = "Unnamed") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function uniqueSorted(values = []) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function normalizeComparableName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function containsCompatibleName(actualNames, requiredName) {
  const required = normalizeComparableName(requiredName);

  return actualNames.some(
    (actual) =>
      normalizeComparableName(actual) === required,
  );
}

function checkRequirements(actualNames, requiredNames) {
  return requiredNames.map((requiredName) => {
    const found = containsCompatibleName(
      actualNames,
      requiredName,
    );

    return {
      name: requiredName,
      found,
    };
  });
}

/* =========================================================
   GLB Inspection
   ========================================================= */

function inspectGLTF(gltf, modelUrl) {
  const meshEntries = [];

  const materialNames = [];

  const boneNames = [];

  const morphNames = [];

  let totalVertices = 0;
  let totalTriangles = 0;

  let meshCount = 0;
  let skinnedMeshCount = 0;

  gltf.scene.traverse((object) => {
    /* -----------------------------------------------------
       Bones
       ----------------------------------------------------- */

    if (object.isBone) {
      boneNames.push(
        cleanName(object.name, "UnnamedBone"),
      );
    }

    /* -----------------------------------------------------
       Meshes
       ----------------------------------------------------- */

    if (!object.isMesh) {
      return;
    }

    meshCount += 1;

    if (object.isSkinnedMesh) {
      skinnedMeshCount += 1;
    }

    const geometry = object.geometry;

    const meshMaterials = Array.isArray(
      object.material,
    )
      ? object.material
      : object.material
        ? [object.material]
        : [];

    const currentMaterialNames =
      meshMaterials.map((material) =>
        cleanName(
          material?.name,
          "UnnamedMaterial",
        ),
      );

    materialNames.push(
      ...currentMaterialNames,
    );

    /* -----------------------------------------------------
       Vertices
       ----------------------------------------------------- */

    const positionAttribute =
      geometry?.attributes?.position;

    const vertexCount =
      positionAttribute?.count || 0;

    totalVertices += vertexCount;

    /* -----------------------------------------------------
       Triangles
       ----------------------------------------------------- */

    let triangleCount = 0;

    if (geometry?.index?.count) {
      triangleCount =
        geometry.index.count / 3;
    } else if (vertexCount) {
      triangleCount =
        vertexCount / 3;
    }

    triangleCount =
      Math.floor(triangleCount);

    totalTriangles += triangleCount;

    /* -----------------------------------------------------
       Morph Targets
       ----------------------------------------------------- */

    const dictionary =
      object.morphTargetDictionary || {};

    const currentMorphNames =
      Object.keys(dictionary);

    morphNames.push(
      ...currentMorphNames,
    );

    /* -----------------------------------------------------
       Skeleton
       ----------------------------------------------------- */

    if (
      object.isSkinnedMesh &&
      object.skeleton?.bones
    ) {
      for (
        const bone of object.skeleton.bones
      ) {
        boneNames.push(
          cleanName(
            bone?.name,
            "UnnamedBone",
          ),
        );
      }
    }

    meshEntries.push({
      name: cleanName(
        object.name,
        "UnnamedMesh",
      ),

      type:
        object.isSkinnedMesh
          ? "SkinnedMesh"
          : "Mesh",

      skinned:
        Boolean(
          object.isSkinnedMesh,
        ),

      vertices:
        vertexCount,

      triangles:
        triangleCount,

      materials:
        currentMaterialNames,

      morphTargets:
        currentMorphNames,
    });
  });

  const uniqueMaterials =
    uniqueSorted(materialNames);

  const uniqueBones =
    uniqueSorted(boneNames);

  const uniqueMorphTargets =
    uniqueSorted(morphNames);

  const animations =
    (gltf.animations || []).map(
      (animation, index) => ({
        name: cleanName(
          animation.name,
          `Animation_${index + 1}`,
        ),

        duration:
          Number(
            animation.duration || 0,
          ).toFixed(2),
      }),
    );

  const materialRequirements =
    checkRequirements(
      uniqueMaterials,
      INTERNAL3D_REQUIRED_MATERIALS,
    );

  const boneRequirements =
    checkRequirements(
      uniqueBones,
      INTERNAL3D_REQUIRED_BONES,
    );

  const morphRequirements =
    checkRequirements(
      uniqueMorphTargets,
      INTERNAL3D_V1_REQUIRED_MORPHS,
    );

  const materialsReady =
    materialRequirements.every(
      (item) => item.found,
    );

  const skeletonReady =
    boneRequirements.every(
      (item) => item.found,
    );

  const morphsReady =
    morphRequirements.every(
      (item) => item.found,
    );

  return {
    modelUrl,

    sceneName:
      cleanName(
        gltf.scene?.name,
        "Scene",
      ),

    stats: {
      meshes:
        meshCount,

      skinnedMeshes:
        skinnedMeshCount,

      vertices:
        totalVertices,

      triangles:
        totalTriangles,

      materials:
        uniqueMaterials.length,

      bones:
        uniqueBones.length,

      morphTargets:
        uniqueMorphTargets.length,

      animations:
        animations.length,
    },

    meshes:
      meshEntries,

    materials:
      uniqueMaterials,

    bones:
      uniqueBones,

    morphTargets:
      uniqueMorphTargets,

    animations,

    requirements: {
      materials:
        materialRequirements,

      bones:
        boneRequirements,

      morphs:
        morphRequirements,
    },

    readiness: {
      materials:
        materialsReady,

      skeleton:
        skeletonReady,

      morphs:
        morphsReady,

      production:
        materialsReady &&
        skeletonReady &&
        morphsReady,
    },
  };
}

/* =========================================================
   Model Loader
   ========================================================= */

function InspectorModel({
  modelUrl,
  onReport,
}) {
  const gltf =
    useGLTF(modelUrl);

  const report =
    useMemo(
      () =>
        inspectGLTF(
          gltf,
          modelUrl,
        ),
      [
        gltf,
        modelUrl,
      ],
    );

  useEffect(() => {
    onReport?.(report);
  }, [
    report,
    onReport,
  ]);

  return (
    <Bounds
      fit
      clip
      observe
      margin={1.25}
    >
      <primitive
        object={
          gltf.scene
        }
      />
    </Bounds>
  );
}

/* =========================================================
   Loading UI
   ========================================================= */

function InspectorLoading() {
  return (
    <Html center>
      <div className="whitespace-nowrap rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm font-medium text-white shadow-xl">
        Loading Internal3D model...
      </div>
    </Html>
  );
}

/* =========================================================
   Error Boundary
   ========================================================= */

class InspectorErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(
    error,
  ) {
    return {
      error,
    };
  }

  componentDidCatch(
    error,
    info,
  ) {
    console.error(
      "Internal3D Model Inspector:",
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
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[450px] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-center">
            <p className="font-semibold text-red-300">
              Unable to load Internal3D model
            </p>

            <p className="mt-2 break-words text-sm text-red-200/70">
              {this.state.error?.message ||
                "Unknown GLB loading error."}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* =========================================================
   Status Components
   ========================================================= */

function StatusBadge({
  success,
  successText = "Ready",
  failureText = "Missing",
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1",
        "text-xs font-semibold",

        success
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-amber-500/15 text-amber-300",
      ].join(" ")}
    >
      {success
        ? `✓ ${successText}`
        : `✕ ${failureText}`}
    </span>
  );
}

function RequirementRow({
  item,
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-b-0">
      <code className="break-all text-xs text-slate-300">
        {item.name}
      </code>

      <span
        className={
          item.found
            ? "shrink-0 text-sm font-bold text-emerald-400"
            : "shrink-0 text-sm font-bold text-red-400"
        }
      >
        {item.found
          ? "✓"
          : "✕"}
      </span>
    </div>
  );
}

/* =========================================================
   Stats Card
   ========================================================= */

function StatCard({
  title,
  value,
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-xl font-bold text-white">
        {Number(
          value || 0,
        ).toLocaleString()}
      </p>
    </div>
  );
}

/* =========================================================
   Section
   ========================================================= */

function InspectorSection({
  title,
  badge,
  children,
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <h3 className="font-semibold text-white">
          {title}
        </h3>

        {badge}
      </div>

      <div className="p-5">
        {children}
      </div>
    </section>
  );
}

/* =========================================================
   Main Component
   ========================================================= */

export default function Internal3DModelInspector({
  modelUrl =
    "/avatars/internal3d/base/human-base.glb",

  height = 650,

  className = "",
}) {
  const [
    report,
    setReport,
  ] = useState(null);

  return (
    <div
      className={[
        "overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ===================================================
          Header
          =================================================== */}

      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
              DesignByYou Internal3D
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              Model Inspector
            </h2>

            <p className="mt-2 break-all text-xs text-slate-500">
              {modelUrl}
            </p>
          </div>

          {report && (
            <StatusBadge
              success={
                report
                  .readiness
                  .production
              }
              successText="V1 Standard Passed"
              failureText="Needs Work"
            />
          )}
        </div>
      </div>

      {/* ===================================================
          Model Preview
          =================================================== */}

      <InspectorErrorBoundary
        resetKey={
          modelUrl
        }
      >
        <div
          style={{
            height:
              typeof height ===
              "number"
                ? `${height}px`
                : height,
          }}
          className="relative bg-gradient-to-b from-slate-900 to-slate-950"
        >
          <Canvas
            shadows
            camera={{
              position: [
                0,
                1.4,
                3.8,
              ],

              fov: 32,

              near: 0.01,

              far: 100,
            }}
          >
            <ambientLight
              intensity={
                1.2
              }
            />

            <directionalLight
              position={[
                4,
                6,
                4,
              ]}
              intensity={
                2.2
              }
              castShadow
            />

            <directionalLight
              position={[
                -4,
                3,
                -2,
              ]}
              intensity={
                0.9
              }
            />

            <Suspense
              fallback={
                <InspectorLoading />
              }
            >
              <InspectorModel
                modelUrl={
                  modelUrl
                }
                onReport={
                  setReport
                }
              />
            </Suspense>

            <OrbitControls
              makeDefault
              enablePan={
                false
              }
              enableZoom
              minDistance={
                1
              }
              maxDistance={
                10
              }
            />
          </Canvas>

          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
            Drag to rotate · Scroll to zoom
          </div>
        </div>
      </InspectorErrorBoundary>

      {/* ===================================================
          Report
          =================================================== */}

      {report ? (
        <div className="space-y-6 p-6">
          {/* =================================================
              Statistics
              ================================================= */}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            <StatCard
              title="Meshes"
              value={
                report.stats.meshes
              }
            />

            <StatCard
              title="Skinned"
              value={
                report.stats
                  .skinnedMeshes
              }
            />

            <StatCard
              title="Vertices"
              value={
                report.stats
                  .vertices
              }
            />

            <StatCard
              title="Triangles"
              value={
                report.stats
                  .triangles
              }
            />

            <StatCard
              title="Materials"
              value={
                report.stats
                  .materials
              }
            />

            <StatCard
              title="Bones"
              value={
                report.stats.bones
              }
            />

            <StatCard
              title="Morphs"
              value={
                report.stats
                  .morphTargets
              }
            />

            <StatCard
              title="Animations"
              value={
                report.stats
                  .animations
              }
            />
          </div>

          {/* =================================================
              Readiness
              ================================================= */}

          <InspectorSection
            title="Internal3D V1 Readiness"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-slate-300">
                  Materials
                </p>

                <div className="mt-3">
                  <StatusBadge
                    success={
                      report
                        .readiness
                        .materials
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-slate-300">
                  Skeleton
                </p>

                <div className="mt-3">
                  <StatusBadge
                    success={
                      report
                        .readiness
                        .skeleton
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-slate-300">
                  V1 Morphs
                </p>

                <div className="mt-3">
                  <StatusBadge
                    success={
                      report
                        .readiness
                        .morphs
                    }
                  />
                </div>
              </div>
            </div>
          </InspectorSection>

          {/* =================================================
              Materials
              ================================================= */}

          <InspectorSection
            title="Required Materials"
            badge={
              <StatusBadge
                success={
                  report
                    .readiness
                    .materials
                }
              />
            }
          >
            {report.requirements.materials.map(
              (item) => (
                <RequirementRow
                  key={
                    item.name
                  }
                  item={
                    item
                  }
                />
              ),
            )}

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Detected materials
              </p>

              <div className="flex flex-wrap gap-2">
                {report.materials.length ? (
                  report.materials.map(
                    (material) => (
                      <code
                        key={
                          material
                        }
                        className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300"
                      >
                        {material}
                      </code>
                    ),
                  )
                ) : (
                  <p className="text-sm text-slate-500">
                    No named materials found.
                  </p>
                )}
              </div>
            </div>
          </InspectorSection>

          {/* =================================================
              Skeleton
              ================================================= */}

          <InspectorSection
            title="Required Skeleton"
            badge={
              <StatusBadge
                success={
                  report
                    .readiness
                    .skeleton
                }
              />
            }
          >
            <div className="grid gap-x-8 md:grid-cols-2">
              {report.requirements.bones.map(
                (item) => (
                  <RequirementRow
                    key={
                      item.name
                    }
                    item={
                      item
                    }
                  />
                ),
              )}
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Detected bones
              </p>

              {report.bones.length ? (
                <div className="flex flex-wrap gap-2">
                  {report.bones.map(
                    (bone) => (
                      <code
                        key={
                          bone
                        }
                        className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300"
                      >
                        {bone}
                      </code>
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-sm text-amber-300">
                    No skeleton detected.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    This model is currently not rigged.
                    Our next Blender milestone is
                    adding the humanoid armature and
                    skinning the body to it.
                  </p>
                </div>
              )}
            </div>
          </InspectorSection>

          {/* =================================================
              V1 Morph Targets
              ================================================= */}

          <InspectorSection
            title="Required V1 Morph Targets"
            badge={
              <StatusBadge
                success={
                  report
                    .readiness
                    .morphs
                }
              />
            }
          >
            <div className="grid gap-x-8 md:grid-cols-2">
              {report.requirements.morphs.map(
                (item) => (
                  <RequirementRow
                    key={
                      item.name
                    }
                    item={
                      item
                    }
                  />
                ),
              )}
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                All detected morph targets
              </p>

              {report.morphTargets.length ? (
                <div className="flex flex-wrap gap-2">
                  {report.morphTargets.map(
                    (morph) => (
                      <code
                        key={
                          morph
                        }
                        className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300"
                      >
                        {morph}
                      </code>
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-sm text-amber-300">
                    No morph targets detected.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    The GLB loads correctly, but the
                    face and body cannot be reshaped
                    yet.
                  </p>
                </div>
              )}
            </div>
          </InspectorSection>

          {/* =================================================
              Meshes
              ================================================= */}

          <InspectorSection
            title="Meshes"
          >
            <div className="space-y-3">
              {report.meshes.map(
                (
                  mesh,
                  index,
                ) => (
                  <div
                    key={`${mesh.name}-${index}`}
                    className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">
                          {mesh.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {mesh.type}
                        </p>
                      </div>

                      {mesh.skinned ? (
                        <StatusBadge
                          success
                          successText="Skinned"
                        />
                      ) : (
                        <StatusBadge
                          success={
                            false
                          }
                          failureText="Static Mesh"
                        />
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                      <div>
                        <span className="text-slate-500">
                          Vertices
                        </span>

                        <p className="mt-1 text-slate-300">
                          {mesh.vertices.toLocaleString()}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-500">
                          Triangles
                        </span>

                        <p className="mt-1 text-slate-300">
                          {mesh.triangles.toLocaleString()}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-500">
                          Materials
                        </span>

                        <p className="mt-1 text-slate-300">
                          {mesh.materials.length}
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-500">
                          Morphs
                        </span>

                        <p className="mt-1 text-slate-300">
                          {mesh.morphTargets.length}
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </InspectorSection>

          {/* =================================================
              Animations
              ================================================= */}

          <InspectorSection
            title="Animations"
          >
            {report.animations.length ? (
              <div className="space-y-2">
                {report.animations.map(
                  (animation) => (
                    <div
                      key={
                        animation.name
                      }
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3"
                    >
                      <code className="text-sm text-slate-300">
                        {animation.name}
                      </code>

                      <span className="text-xs text-slate-500">
                        {animation.duration}s
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No animations embedded in this GLB.
              </p>
            )}
          </InspectorSection>
        </div>
      ) : (
        <div className="p-6 text-sm text-slate-500">
          Inspecting model...
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Preloader
   ========================================================= */

export function preloadInternal3DModel(
  modelUrl =
    "/avatars/internal3d/base/human-base.glb",
) {
  useGLTF.preload(
    modelUrl,
  );
}