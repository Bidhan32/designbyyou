/*
=========================================================
FashionVision AI
3D Garment Viewer
Version 2.0
=========================================================
*/

import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";

import * as THREE from "three";

import {
    Canvas
} from "@react-three/fiber";

import {
    Bounds,
    ContactShadows,
    Environment,
    OrbitControls,
    Preload
} from "@react-three/drei";

import {
    buildGarmentMesh,
    disposeGarmentMesh,
    getGarmentMeshSummary
} from "../../ai/geometry/MeshBuilder";

/*=========================================================
Default Viewer Mesh Options
=========================================================*/

export const DEFAULT_VIEWER_MESH_OPTIONS =
    Object.freeze({
        modelWidth: 3.2,
        modelHeight: 4.6,
        modelDepth: 0.16,

        fitScale: 0.88,

        color: "#7c3aed",
        secondaryColor: "#c4b5fd",

        roughness: 0.72,
        metalness: 0.05,

        wireframe: false,

        bevelEnabled: true,
        bevelSize: 0.02,
        bevelThickness: 0.02,
        bevelSegments: 2,

        centerModel: true
    });

const EMPTY_MESH_SUMMARY =
    Object.freeze({
        meshCount: 0,
        vertexCount: 0,
        triangleCount: 0,
        parts: []
    });

/*=========================================================
Object Validation
=========================================================*/

function isObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

/*=========================================================
Detect Serialized Garment Blueprint
=========================================================*/

function isGarmentBlueprint(
    value
) {
    if (!isObject(value)) {
        return false;
    }

    return Boolean(
        value.kind ===
            "fashionvision-garment-blueprint" ||
        Array.isArray(value.parts) ||
        value.constructionHints ||
        value.bounds
    );
}

/*=========================================================
Resolve Blueprint From Possible API Shapes
=========================================================*/

export function resolveViewerBlueprint(
    value
) {
    if (!isObject(value)) {
        return null;
    }

    const candidates = [
        value.garmentBlueprint,

        value.blueprint
            ?.garmentBlueprint,

        value.data
            ?.garmentBlueprint,

        value.result
            ?.garmentBlueprint,

        value.localBlueprint,

        value.blueprint,

        value
    ];

    const recognizedBlueprint =
        candidates.find(
            candidate =>
                isGarmentBlueprint(
                    candidate
                )
        );

    if (recognizedBlueprint) {
        return recognizedBlueprint;
    }

    /*
    Allow MeshBuilder to validate an unfamiliar server
    blueprint instead of rejecting it inside Viewer.
    */

    return value;
}

/*=========================================================
Find Reconstruction Method
=========================================================*/

function getReconstructionMethod(
    summary
) {
    if (
        !Array.isArray(
            summary?.parts
        )
    ) {
        return null;
    }

    const reconstructedPart =
        summary.parts.find(
            part =>
                part
                    ?.reconstructionMethod
        );

    return (
        reconstructedPart
            ?.reconstructionMethod ||
        null
    );
}

/*=========================================================
Calculate Dynamic Shadow Position
=========================================================*/

function calculateFloorPosition(
    object
) {
    if (!object?.isObject3D) {
        return -2.1;
    }

    object.updateMatrixWorld(
        true
    );

    const bounds =
        new THREE.Box3()
            .setFromObject(
                object
            );

    if (bounds.isEmpty()) {
        return -2.1;
    }

    return bounds.min.y - 0.035;
}

/*=========================================================
Viewer Error Boundary
=========================================================*/

class ViewerErrorBoundary extends React.Component {

    constructor(
        props
    ) {
        super(props);

        this.state = {
            error: null
        };
    }

    static getDerivedStateFromError(
        error
    ) {
        return {
            error
        };
    }

    componentDidCatch(
        error,
        errorInfo
    ) {
        console.error(
            "FashionVision Viewer crashed:",
            error,
            errorInfo
        );
    }

    componentDidUpdate(
        previousProps
    ) {
        if (
            previousProps.resetKey !==
                this.props.resetKey &&
            this.state.error
        ) {
            this.setState({
                error: null
            });
        }
    }

    render() {

        if (this.state.error) {
            return (
                <ViewerMessage
                    title="3D viewer failed"
                    description={
                        this.state.error
                            ?.message ||
                        "The WebGL scene could not be rendered."
                    }
                    tone="error"
                />
            );
        }

        return this.props.children;
    }

}

/*=========================================================
Build and Manage Three.js Garment Object
=========================================================*/

function GarmentModel({
    blueprint,
    meshOptions,
    onBuildStateChange
}) {

    const [
        garmentObject,
        setGarmentObject
    ] = useState(null);

    useEffect(() => {

        let generatedObject =
            null;

        setGarmentObject(
            null
        );

        if (!blueprint) {

            onBuildStateChange({
                phase: "idle",
                message: "",
                summary: EMPTY_MESH_SUMMARY,
                reconstructionMethod: null,
                floorY: -2.1
            });

            return undefined;
        }

        onBuildStateChange({
            phase: "building",
            message:
                "Constructing garment mesh...",
            summary: EMPTY_MESH_SUMMARY,
            reconstructionMethod: null,
            floorY: -2.1
        });

        try {

            generatedObject =
                buildGarmentMesh(
                    blueprint,
                    meshOptions
                );

            const summary =
                getGarmentMeshSummary(
                    generatedObject
                );

            if (
                !generatedObject
                    ?.isObject3D ||
                summary.meshCount === 0
            ) {

                if (generatedObject) {
                    disposeGarmentMesh(
                        generatedObject
                    );
                }

                generatedObject =
                    null;

                onBuildStateChange({
                    phase: "empty",
                    message:
                        "No valid closed garment silhouette could be constructed.",
                    summary:
                        EMPTY_MESH_SUMMARY,
                    reconstructionMethod:
                        null,
                    floorY:
                        -2.1
                });

                return undefined;
            }

            generatedObject.updateMatrixWorld(
                true
            );

            const floorY =
                calculateFloorPosition(
                    generatedObject
                );

            const reconstructionMethod =
                getReconstructionMethod(
                    summary
                );

            setGarmentObject(
                generatedObject
            );

            onBuildStateChange({
                phase: "ready",
                message: "",
                summary,
                reconstructionMethod,
                floorY
            });

        } catch (error) {

            console.error(
                "FashionVision mesh construction failed:",
                error
            );

            if (generatedObject) {
                disposeGarmentMesh(
                    generatedObject
                );
            }

            generatedObject =
                null;

            onBuildStateChange({
                phase: "error",
                message:
                    error?.message ||
                    "The garment mesh could not be generated.",
                summary:
                    EMPTY_MESH_SUMMARY,
                reconstructionMethod:
                    null,
                floorY:
                    -2.1
            });
        }

        /*
        Dispose the old mesh whenever the blueprint changes
        or Viewer is removed.
        */

        return () => {

            if (generatedObject) {
                disposeGarmentMesh(
                    generatedObject
                );
            }

        };

    }, [
        blueprint,
        meshOptions,
        onBuildStateChange
    ]);

    if (!garmentObject) {
        return null;
    }

    return (
        <Bounds
            key={
                garmentObject.uuid
            }
            fit
            clip
            observe
            margin={1.25}
            maxDuration={0.65}
        >

            <primitive
                object={
                    garmentObject
                }

                /*
                Resource disposal is handled manually above.
                */

                dispose={null}
            />

        </Bounds>
    );

}

/*=========================================================
Viewer Overlay
=========================================================*/

function ViewerOverlay({
    buildState,
    showStats
}) {

    const {
        phase,
        message,
        summary,
        reconstructionMethod
    } = buildState;

    if (
        phase === "idle"
    ) {
        return (
            <ViewerMessage
                title="No garment preview"
                description="Draw a closed garment outline to generate its mesh."
            />
        );
    }

    if (
        phase === "building"
    ) {
        return (
            <ViewerMessage
                title="Building mesh"
                description="Converting the detected garment outline into 3D geometry."
                loading
            />
        );
    }

    if (
        phase === "empty"
    ) {
        return (
            <ViewerMessage
                title="Outline incomplete"
                description={
                    message ||
                    "Close the outer garment contour and try again."
                }
            />
        );
    }

    if (
        phase === "error"
    ) {
        return (
            <ViewerMessage
                title="Mesh generation failed"
                description={
                    message
                }
                tone="error"
            />
        );
    }

    if (
        phase !== "ready" ||
        !showStats
    ) {
        return null;
    }

    return (
        <div
            className="
                pointer-events-none
                absolute
                right-3
                top-3
                z-20
                rounded-xl
                border
                border-black/10
                bg-white/80
                px-3
                py-2
                shadow-lg
                backdrop-blur-md
            "
        >

            <div
                className="
                    flex
                    items-center
                    gap-2
                "
            >

                <span
                    className="
                        h-2
                        w-2
                        rounded-full
                        bg-emerald-500
                        shadow-[0_0_8px_rgba(16,185,129,0.8)]
                    "
                />

                <span
                    className="
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        text-black/60
                    "
                >
                    Mesh Ready
                </span>

            </div>

            <div
                className="
                    mt-2
                    flex
                    gap-3
                    font-mono
                    text-[9px]
                    text-black/45
                "
            >

                <span>
                    {summary.meshCount} mesh
                </span>

                <span>
                    {summary.triangleCount} triangles
                </span>

            </div>

            {reconstructionMethod && (

                <div
                    className="
                        mt-1
                        font-mono
                        text-[8px]
                        uppercase
                        tracking-wider
                        text-violet-600
                    "
                >
                    {reconstructionMethod}
                </div>

            )}

        </div>
    );

}

/*=========================================================
Viewer Message
=========================================================*/

function ViewerMessage({
    title,
    description,
    loading = false,
    tone = "neutral"
}) {

    return (
        <div
            className="
                pointer-events-none
                absolute
                inset-0
                z-20
                flex
                items-center
                justify-center
                p-8
            "
        >

            <div
                className="
                    max-w-sm
                    rounded-2xl
                    border
                    border-black/10
                    bg-white/75
                    px-6
                    py-5
                    text-center
                    shadow-xl
                    backdrop-blur-xl
                "
            >

                {loading ? (

                    <div
                        className="
                            mx-auto
                            mb-3
                            h-7
                            w-7
                            animate-spin
                            rounded-full
                            border-2
                            border-violet-200
                            border-t-violet-600
                        "
                    />

                ) : (

                    <div
                        className={`
                            mx-auto
                            mb-3
                            flex
                            h-9
                            w-9
                            items-center
                            justify-center
                            rounded-full
                            ${
                                tone === "error"
                                    ? `
                                        bg-rose-100
                                        text-rose-600
                                    `
                                    : `
                                        bg-violet-100
                                        text-violet-600
                                    `
                            }
                        `}
                    >
                        ◇
                    </div>

                )}

                <h3
                    className={`
                        text-xs
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        ${
                            tone === "error"
                                ? "text-rose-600"
                                : "text-black/70"
                        }
                    `}
                >
                    {title}
                </h3>

                <p
                    className="
                        mt-2
                        text-[10px]
                        leading-relaxed
                        text-black/45
                    "
                >
                    {description}
                </p>

            </div>

        </div>
    );

}

/*=========================================================
WebGL Fallback
=========================================================*/

function WebGLFallback() {

    return (
        <ViewerMessage
            title="WebGL unavailable"
            description="Your browser or graphics device could not initialize the 3D renderer."
            tone="error"
        />
    );

}

/*=========================================================
Main Viewer
=========================================================*/

export const Viewer = ({
    blueprint,
    meshOptions,
    className = "",
    autoRotate = false,
    showStats = true
}) => {

    const resolvedBlueprint =
        useMemo(
            () =>
                resolveViewerBlueprint(
                    blueprint
                ),
            [
                blueprint
            ]
        );

    const resolvedMeshOptions =
        useMemo(
            () => ({
                ...DEFAULT_VIEWER_MESH_OPTIONS,
                ...(
                    isObject(meshOptions)
                        ? meshOptions
                        : {}
                )
            }),
            [
                meshOptions
            ]
        );

    const [
        buildState,
        setBuildState
    ] = useState({
        phase:
            resolvedBlueprint
                ? "building"
                : "idle",

        message: "",

        summary:
            EMPTY_MESH_SUMMARY,

        reconstructionMethod:
            null,

        floorY:
            -2.1
    });

    useEffect(() => {

        setBuildState({
            phase:
                resolvedBlueprint
                    ? "building"
                    : "idle",

            message: "",

            summary:
                EMPTY_MESH_SUMMARY,

            reconstructionMethod:
                null,

            floorY:
                -2.1
        });

    }, [
        resolvedBlueprint
    ]);

    const handleBuildStateChange =
        useCallback(
            nextState => {

                setBuildState(
                    nextState
                );

            },
            []
        );

    return (
        <div
            className={`
                relative
                h-full
                min-h-[420px]
                w-full
                overflow-hidden
                bg-[radial-gradient(circle_at_50%_32%,#ffffff_0%,#f4f4f6_48%,#e5e7eb_100%)]
                ${className}
            `}
        >

            <ViewerErrorBoundary
                resetKey={
                    resolvedBlueprint
                }
            >

                <Canvas
                    shadows

                    dpr={[
                        1,
                        1.75
                    ]}

                    camera={{
                        position: [
                            0,
                            0.25,
                            7
                        ],

                        fov:
                            38,

                        near:
                            0.05,

                        far:
                            100
                    }}

                    gl={{
                        antialias:
                            true,

                        alpha:
                            true,

                        powerPreference:
                            "high-performance"
                    }}

                    fallback={
                        <WebGLFallback />
                    }

                    onCreated={({
                        gl
                    }) => {

                        gl.outputColorSpace =
                            THREE.SRGBColorSpace;

                        gl.toneMapping =
                            THREE.ACESFilmicToneMapping;

                        gl.toneMappingExposure =
                            1.05;

                        gl.shadowMap.enabled =
                            true;

                        gl.shadowMap.type =
                            THREE.PCFSoftShadowMap;

                        gl.setClearColor(
                            0x000000,
                            0
                        );

                    }}
                >

                    {/* Soft base lighting */}

                    <ambientLight
                        intensity={
                            0.55
                        }
                    />

                    <hemisphereLight
                        color="#ffffff"
                        groundColor="#c4c7ce"
                        intensity={0.75}
                    />

                    {/* Main studio key light */}

                    <directionalLight
                        castShadow

                        position={[
                            4.5,
                            7,
                            5
                        ]}

                        intensity={
                            2
                        }

                        shadow-mapSize-width={
                            2048
                        }

                        shadow-mapSize-height={
                            2048
                        }

                        shadow-camera-near={
                            0.1
                        }

                        shadow-camera-far={
                            30
                        }

                        shadow-camera-left={
                            -6
                        }

                        shadow-camera-right={
                            6
                        }

                        shadow-camera-top={
                            6
                        }

                        shadow-camera-bottom={
                            -6
                        }

                        shadow-bias={
                            -0.00015
                        }
                    />

                    {/* Fill light */}

                    <directionalLight
                        position={[
                            -4,
                            2.5,
                            4
                        ]}

                        intensity={
                            0.75
                        }
                    />

                    {/* Rim light */}

                    <spotLight
                        position={[
                            0,
                            4,
                            -5
                        ]}

                        intensity={
                            1.25
                        }

                        angle={
                            Math.PI / 4
                        }

                        penumbra={
                            0.8
                        }

                        color={
                            "#ddd6fe"
                        }
                    />

                    <Suspense
                        fallback={
                            null
                        }
                    >

                        <GarmentModel
                            blueprint={
                                resolvedBlueprint
                            }

                            meshOptions={
                                resolvedMeshOptions
                            }

                            onBuildStateChange={
                                handleBuildStateChange
                            }
                        />

                        <Environment
                            preset="studio"
                            background={false}
                            blur={0.35}
                        />

                        <Preload all />

                    </Suspense>

                    {/* Dynamic ground shadow */}

                    {buildState.phase ===
                        "ready" && (

                        <ContactShadows
                            key={`
                                ${buildState.floorY}-
                                ${buildState.summary.meshCount}-
                                ${buildState.summary.triangleCount}
                            `}

                            position={[
                                0,
                                buildState.floorY,
                                0
                            ]}

                            opacity={
                                0.36
                            }

                            scale={
                                8
                            }

                            blur={
                                2.6
                            }

                            far={
                                5
                            }

                            resolution={
                                1024
                            }

                            frames={
                                1
                            }
                        />

                    )}

                    {/* Mouse and touch camera interaction */}

                    <OrbitControls
                        makeDefault

                        target={[
                            0,
                            0,
                            0
                        ]}

                        enablePan={
                            false
                        }

                        enableZoom

                        enableRotate

                        enableDamping

                        dampingFactor={
                            0.075
                        }

                        rotateSpeed={
                            0.7
                        }

                        zoomSpeed={
                            0.8
                        }

                        minDistance={
                            2
                        }

                        maxDistance={
                            15
                        }

                        minPolarAngle={
                            Math.PI *
                            0.12
                        }

                        maxPolarAngle={
                            Math.PI *
                            0.86
                        }

                        autoRotate={
                            autoRotate &&
                            buildState.phase ===
                                "ready"
                        }

                        autoRotateSpeed={
                            0.65
                        }
                    />

                </Canvas>

            </ViewerErrorBoundary>

            <ViewerOverlay
                buildState={
                    buildState
                }

                showStats={
                    showStats
                }
            />

            {/* Interaction help */}

            {buildState.phase ===
                "ready" && (

                <div
                    className="
                        pointer-events-none
                        absolute
                        bottom-3
                        left-1/2
                        z-10
                        -translate-x-1/2
                        rounded-full
                        border
                        border-black/10
                        bg-white/65
                        px-3
                        py-1.5
                        text-[8px]
                        font-bold
                        uppercase
                        tracking-[0.16em]
                        text-black/35
                        shadow-sm
                        backdrop-blur-md
                    "
                >
                    Drag to rotate · Scroll to zoom
                </div>

            )}

        </div>
    );

};

export default Viewer;