import { INTERNAL3D_REQUIRED_MATERIALS, INTERNAL3D_REQUIRED_BONES, INTERNAL3D_V1_REQUIRED_MORPHS } from "./Internal3DModelInspector.helpers.js";
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





/*
 * Our first morph milestone.
 *
 * Do NOT try to build every morph immediately.
 *
 * Once these work, we expand the full system.
 */



/* =========================================================
   Full Future Morph Standard
   ========================================================= */



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
      <div className="whitespace-nowrap rounded-md border border-line bg-subtle px-4 py-3 text-sm font-medium text-ink">
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
        <div className="flex h-full min-h-[450px] items-center justify-center p-4">
          <div className="max-w-md rounded-md border border-line bg-subtle p-4 text-center">
            <p className="font-semibold text-action">
              Unable to load Internal3D model
            </p>

            <p className="mt-2 break-words text-sm text-muted">
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
        "inline-flex items-center rounded-md px-2.5 py-1",
        "text-xs font-semibold",

        success
          ? "bg-subtle text-action"
          : "bg-subtle text-action",
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
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <code className="break-all text-xs text-muted">
        {item.name}
      </code>

      <span
        className={
          item.found
            ? "shrink-0 text-sm font-bold text-action"
            : "shrink-0 text-sm font-bold text-action"
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
    <div className="rounded-md border border-line bg-subtle p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {title}
      </p>

      <p className="mt-2 text-xl font-bold text-ink">
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
    <section className="rounded-md border border-line bg-subtle">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h3 className="font-semibold text-ink">
          {title}
        </h3>

        {badge}
      </div>

      <div className="p-4">
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
        "overflow-hidden rounded-md border border-line bg-surface text-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ===================================================
          Header
          =================================================== */}

      <div className="border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-action">
              DesignByYou Internal3D
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              Model Inspector
            </h2>

            <p className="mt-2 break-all text-xs text-muted">
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
          className="relative bg-surface"
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

          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-line bg-black/40 px-4 py-2 text-xs text-muted">
            Drag to rotate · Scroll to zoom
          </div>
        </div>
      </InspectorErrorBoundary>

      {/* ===================================================
          Report
          =================================================== */}

      {report ? (
        <div className="space-y-6 p-4">
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
              <div className="rounded-md border border-line bg-subtle p-4">
                <p className="text-sm font-medium text-muted">
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

              <div className="rounded-md border border-line bg-subtle p-4">
                <p className="text-sm font-medium text-muted">
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

              <div className="rounded-md border border-line bg-subtle p-4">
                <p className="text-sm font-medium text-muted">
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
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
                        className="rounded-md border border-line bg-subtle px-2 py-1 text-xs text-muted"
                      >
                        {material}
                      </code>
                    ),
                  )
                ) : (
                  <p className="text-sm text-muted">
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
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
                        className="rounded-md border border-line bg-subtle px-2 py-1 text-xs text-muted"
                      >
                        {bone}
                      </code>
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-line bg-subtle p-4">
                  <p className="text-sm text-action">
                    No skeleton detected.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted">
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
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
                        className="rounded-md border border-line bg-subtle px-2 py-1 text-xs text-muted"
                      >
                        {morph}
                      </code>
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-line bg-subtle p-4">
                  <p className="text-sm text-action">
                    No morph targets detected.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted">
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
                    className="rounded-md border border-line bg-subtle p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {mesh.name}
                        </p>

                        <p className="mt-1 text-xs text-muted">
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
                        <span className="text-muted">
                          Vertices
                        </span>

                        <p className="mt-1 text-muted">
                          {mesh.vertices.toLocaleString()}
                        </p>
                      </div>

                      <div>
                        <span className="text-muted">
                          Triangles
                        </span>

                        <p className="mt-1 text-muted">
                          {mesh.triangles.toLocaleString()}
                        </p>
                      </div>

                      <div>
                        <span className="text-muted">
                          Materials
                        </span>

                        <p className="mt-1 text-muted">
                          {mesh.materials.length}
                        </p>
                      </div>

                      <div>
                        <span className="text-muted">
                          Morphs
                        </span>

                        <p className="mt-1 text-muted">
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
                      className="flex items-center justify-between rounded-md border border-line bg-subtle px-4 py-3"
                    >
                      <code className="text-sm text-muted">
                        {animation.name}
                      </code>

                      <span className="text-xs text-muted">
                        {animation.duration}s
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No animations embedded in this GLB.
              </p>
            )}
          </InspectorSection>
        </div>
      ) : (
        <div className="p-4 text-sm text-muted">
          Inspecting model...
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Preloader
   ========================================================= */
