import React, {
    useCallback,
    useRef,
    useState
} from "react";

import {
    createPortal
} from "react-dom";

import {
    useNavigate
} from "react-router-dom";

import {
    X,
    Compass,
    Undo,
    Trash2,
    Download,
    Loader2,
    Zap,
    PenTool,
    Layers,
    BrainCircuit,
    Box,
    Shirt
} from "lucide-react";

import DrawingCanvas from "./2d/DrawingCanvas";

import {
    Viewer
} from "./3d/Viewer";

import {
    useSketchStore
} from "./useSketchStore";

import API from "../../api/axios";

/*=========================================================
Canvas Settings
=========================================================*/

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/*=========================================================
Apparel Studio Canvas
=========================================================*/

export default function ApparelStudioCanvas({
    role = "designer"
}) {

    const navigate =
        useNavigate();

    /*
    DrawingCanvas passes this ref to the real Konva Stage.
    */

    const stageRef =
        useRef(null);

    /*=====================================================
    Zustand Store
    =====================================================*/

    const lines =
        useSketchStore(
            state => state.lines
        );

    const analyses =
        useSketchStore(
            state => state.analyses
        );

    const groups =
        useSketchStore(
            state => state.groups
        );

    const garment =
        useSketchStore(
            state => state.garment
        );

    const garmentBlueprint =
        useSketchStore(
            state => state.garmentBlueprint
        );

    /*
    Final server-generated blueprint used by Viewer.
    */

    const blueprint =
        useSketchStore(
            state => state.blueprint
        );

    const undo =
        useSketchStore(
            state => state.undo
        );

    const clearSketch =
        useSketchStore(
            state => state.clear
        );

    const setBlueprint =
        useSketchStore(
            state => state.setBlueprint
        );

    /*=====================================================
    Local Interface State
    =====================================================*/

    const [
        isSynthesizing,
        setIsSynthesizing
    ] = useState(false);

    const [
        statusMessage,
        setStatusMessage
    ] = useState("");

    /*=====================================================
    Stroke Recognition Summary
    =====================================================*/

    const lastAnalysis =
        analyses.length > 0
            ? analyses[
                analyses.length - 1
            ]
            : null;

    const lastDetectedShape =
        lastAnalysis
            ?.recognition
            ?.shape ||
        "none";

    const lastShapeConfidenceValue =
        Number(
            lastAnalysis
                ?.recognition
                ?.confidence
        );

    const formattedShapeConfidence =
        Number.isFinite(
            lastShapeConfidenceValue
        )
            ? `${Math.round(
                lastShapeConfidenceValue *
                100
            )}%`
            : "0%";

    /*=====================================================
    Garment Recognition Summary
    =====================================================*/

    const detectedGarmentType =
        garment?.garmentType ||
        "unknown";

    const garmentConfidenceValue =
        Number(
            garment?.confidence
        );

    const formattedGarmentConfidence =
        Number.isFinite(
            garmentConfidenceValue
        )
            ? `${Math.round(
                garmentConfidenceValue *
                100
            )}%`
            : "0%";

    const detectedPartCount =
        Array.isArray(
            garmentBlueprint?.parts
        )
            ? garmentBlueprint.parts.length
            : 0;

    const constructionHints =
        garmentBlueprint
            ?.constructionHints ||
        null;

    /*=====================================================
    Export Konva Canvas
    =====================================================*/

    const exportPngDataUrl =
        useCallback(() => {

            const stage =
                stageRef.current;

            if (!stage) {

                throw new Error(
                    "Drawing canvas is not ready."
                );

            }

            try {

                return stage.toDataURL({
                    pixelRatio: 2,
                    mimeType: "image/png"
                });

            } catch (error) {

                if (
                    error?.name ===
                    "SecurityError"
                ) {

                    throw new Error(
                        "The canvas contains an external image that prevents exporting."
                    );

                }

                throw error;

            }

        }, []);

    /*=====================================================
    Download PNG
    =====================================================*/

    const downloadCanvas =
        useCallback(() => {

            try {

                if (lines.length === 0) {

                    window.alert(
                        "Draw something before downloading."
                    );

                    return;

                }

                const dataUrl =
                    exportPngDataUrl();

                const link =
                    document.createElement(
                        "a"
                    );

                link.download =
                    `FashionVision-${Date.now()}.png`;

                link.href =
                    dataUrl;

                document.body.appendChild(
                    link
                );

                link.click();

                link.remove();

            } catch (error) {

                console.error(
                    "Canvas download failed:",
                    error
                );

                window.alert(
                    error?.message ||
                    "The canvas could not be downloaded."
                );

            }

        }, [
            exportPngDataUrl,
            lines.length
        ]);

    /*=====================================================
    Generate Procedural 3D Blueprint
    =====================================================*/

    const generateProceduralBlueprint =
        useCallback(async () => {

            if (lines.length === 0) {

                window.alert(
                    "Please draw a garment before building the 3D pattern."
                );

                return;

            }

            if (!garmentBlueprint) {

                window.alert(
                    "The garment blueprint is not ready yet. Complete the drawing and try again."
                );

                return;

            }

            setIsSynthesizing(true);

            setStatusMessage(
                "Analyzing garment structure..."
            );

            try {

                const sketchImage =
                    exportPngDataUrl();

                const response =
                    await API.post(
                        "/api/analyze-sketch",
                        {
                            /*
                            Visual representation.
                            */

                            image:
                                sketchImage,

                            /*
                            Original Konva stroke data.
                            */

                            vectors:
                                lines,

                            /*
                            Local recognition pipeline data.
                            */

                            analyses,

                            groups,

                            classification:
                                garment,

                            garmentBlueprint,

                            canvas: {
                                width:
                                    CANVAS_WIDTH,

                                height:
                                    CANVAS_HEIGHT
                            }
                        }
                    );

                const generatedBlueprint =
                    response
                        ?.data
                        ?.blueprint;

                if (!generatedBlueprint) {

                    throw new Error(
                        "The pattern engine did not return a valid 3D blueprint."
                    );

                }

                setBlueprint(
                    generatedBlueprint
                );

                setStatusMessage(
                    "3D pattern generated successfully."
                );

            } catch (error) {

                console.error(
                    "Blueprint generation failed:",
                    error
                );

                setStatusMessage(
                    "Blueprint generation failed."
                );

                window.alert(
                    error
                        ?.response
                        ?.data
                        ?.message ||
                    error?.message ||
                    "The procedural pattern could not be generated."
                );

            } finally {

                setIsSynthesizing(false);

            }

        }, [
            lines,
            analyses,
            groups,
            garment,
            garmentBlueprint,
            exportPngDataUrl,
            setBlueprint
        ]);

    /*=====================================================
    Clear Complete Document
    =====================================================*/

    const clearDocument =
        useCallback(() => {

            if (lines.length === 0)
                return;

            const confirmed =
                window.confirm(
                    "Clear the complete drawing, recognition data, and generated 3D pattern?"
                );

            if (!confirmed)
                return;

            clearSketch();

            setStatusMessage("");

        }, [
            clearSketch,
            lines.length
        ]);

    /*=====================================================
    Portal Safety
    =====================================================*/

    if (
        typeof document ===
        "undefined"
    ) {
        return null;
    }

   const localGarmentConfidence =
    Number(
        garment?.confidence
    );

const canPreviewLocalBlueprint =
    lines.length >= 3 &&
    garmentBlueprint &&
    garment?.garmentType !== "unknown" &&
    Number.isFinite(
        localGarmentConfidence
    ) &&
    localGarmentConfidence >= 0.45 &&
    garmentBlueprint
        ?.constructionHints
        ?.torso
        ?.present === true;

const activeViewerBlueprint =
    blueprint ||
    (
        canPreviewLocalBlueprint
            ? garmentBlueprint
            : null
    );

    /*=====================================================
    Render
    =====================================================*/

    return createPortal(

        <div
            className="
                fixed
                inset-0
                z-[99999]
                flex
                h-screen
                w-screen
                select-none
                flex-col
                overflow-hidden
                bg-[#030303]
                font-sans
                text-white
                selection:bg-[#D4AF37]
                selection:text-black
            "
        >

            {/* Background glow */}

            <div
                className="
                    pointer-events-none
                    absolute
                    left-[-10%]
                    top-[-20%]
                    z-0
                    h-[50vw]
                    w-[50vw]
                    rounded-full
                    bg-[#D4AF37]/5
                    blur-[150px]
                "
            />

            {/*=================================================
            Header
            =================================================*/}

            <header
                className="
                    relative
                    z-50
                    flex
                    h-20
                    w-full
                    shrink-0
                    items-center
                    justify-between
                    border-b
                    border-white/5
                    bg-[#0a0a0a]/90
                    px-8
                    shadow-2xl
                    backdrop-blur-xl
                "
            >

                <div
                    className="
                        flex
                        items-center
                        gap-4
                    "
                >

                    <button
                        type="button"
                        onClick={() =>
                            navigate(-1)
                        }
                        className="
                            rounded-full
                            bg-white/5
                            p-2
                            transition-colors
                            hover:bg-white/10
                        "
                        aria-label="Close studio"
                    >

                        <X
                            size={16}
                            className="text-white/60"
                        />

                    </button>

                    <div>

                        <div
                            className="
                                flex
                                items-center
                                gap-2
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-[0.4em]
                                text-[#D4AF37]
                            "
                        >

                            <Compass size={12} />

                            FashionVision AI

                        </div>

                        <h1
                            className="
                                text-lg
                                font-serif
                                tracking-wide
                                text-white
                            "
                        >

                            Apparel Studio

                            <span
                                className="
                                    ml-3
                                    text-[9px]
                                    font-sans
                                    font-bold
                                    uppercase
                                    tracking-widest
                                    text-white/30
                                "
                            >
                                {role}
                            </span>

                        </h1>

                    </div>

                </div>

                <div
                    className="
                        flex
                        items-center
                        gap-3
                    "
                >

                    {/* Download */}

                    <button
                        type="button"
                        onClick={
                            downloadCanvas
                        }
                        disabled={
                            lines.length === 0
                        }
                        className="
                            rounded-full
                            border
                            border-white/10
                            bg-white/5
                            p-2.5
                            text-white
                            transition-colors
                            hover:bg-white/10
                            disabled:cursor-not-allowed
                            disabled:opacity-30
                        "
                        title="Download PNG"
                    >

                        <Download size={14} />

                    </button>

                    {/* Build 3D */}

                    <button
                        type="button"
                        onClick={
                            generateProceduralBlueprint
                        }
                        disabled={
                            isSynthesizing ||
                            lines.length === 0 ||
                            !garmentBlueprint
                        }
                        className="
                            flex
                            items-center
                            gap-2
                            rounded-full
                            bg-emerald-600
                            px-5
                            py-2.5
                            text-[10px]
                            font-bold
                            uppercase
                            tracking-[0.2em]
                            text-white
                            shadow-[0_0_20px_rgba(16,185,129,0.3)]
                            transition-all
                            hover:bg-emerald-500
                            disabled:cursor-not-allowed
                            disabled:opacity-40
                        "
                    >

                        {isSynthesizing ? (

                            <Loader2
                                size={14}
                                className="animate-spin"
                            />

                        ) : (

                            <Zap size={14} />

                        )}

                        {isSynthesizing
                            ? "Building..."
                            : "Build 3D Pattern"}

                    </button>

                </div>

            </header>

            {/*=================================================
            Main Workspace
            =================================================*/}

            <div
                className="
                    relative
                    z-10
                    flex
                    h-full
                    flex-1
                    overflow-hidden
                "
            >

                {/*=================================================
                Left Toolbar
                =================================================*/}

                <aside
                    className="
                        flex
                        h-full
                        w-[90px]
                        shrink-0
                        flex-col
                        items-center
                        gap-3
                        border-r
                        border-white/5
                        bg-[#0a0a0a]
                        px-3
                        py-6
                        shadow-2xl
                    "
                >

                    <div
                        className="
                            mb-2
                            flex
                            h-11
                            w-11
                            items-center
                            justify-center
                            rounded-xl
                            bg-[#D4AF37]
                            text-black
                            shadow-[0_0_20px_rgba(212,175,55,0.25)]
                        "
                        title="Pen"
                    >

                        <PenTool size={17} />

                    </div>

                    <div
                        className="
                            my-2
                            h-px
                            w-10
                            bg-white/10
                        "
                    />

                    <button
                        type="button"
                        onClick={undo}
                        disabled={
                            lines.length === 0
                        }
                        className="
                            flex
                            w-full
                            justify-center
                            rounded-xl
                            py-3
                            text-white/50
                            transition-colors
                            hover:bg-white/5
                            hover:text-white
                            disabled:cursor-not-allowed
                            disabled:opacity-20
                        "
                        title="Undo"
                    >

                        <Undo size={17} />

                    </button>

                    <button
                        type="button"
                        onClick={
                            clearDocument
                        }
                        disabled={
                            lines.length === 0
                        }
                        className="
                            flex
                            w-full
                            justify-center
                            rounded-xl
                            py-3
                            text-rose-400/70
                            transition-colors
                            hover:bg-rose-500/10
                            hover:text-rose-400
                            disabled:cursor-not-allowed
                            disabled:opacity-20
                        "
                        title="Clear"
                    >

                        <Trash2 size={17} />

                    </button>

                </aside>

                {/*=================================================
                Split Workspace
                =================================================*/}

                <div
                    className="
                        flex
                        h-full
                        min-w-0
                        flex-1
                        overflow-hidden
                        bg-[#050505]
                    "
                >

                    {/* 2D Editor */}

                    <section
                        className="
                            relative
                            flex
                            min-w-0
                            w-1/2
                            items-center
                            justify-center
                            overflow-auto
                            border-r
                            border-white/5
                            p-4
                        "
                    >

                        <div
                            className="
                                absolute
                                left-4
                                top-4
                                z-10
                                rounded-md
                                border
                                border-[#D4AF37]/30
                                bg-[#0a0a0a]/80
                                px-3
                                py-1.5
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-[#D4AF37]
                                backdrop-blur-md
                            "
                        >
                            1. Vector Editor
                        </div>

                        <div>

                            <DrawingCanvas
                                stageRef={
                                    stageRef
                                }
                            />

                        </div>

                    </section>

                    {/* 3D Viewer */}

                    <section
                        className="
                            relative
                            flex
                            min-w-0
                            w-1/2
                            items-center
                            justify-center
                            overflow-hidden
                            bg-[#0a0a0a]
                        "
                    >

                        <div
                            className="
                                absolute
                                left-4
                                top-4
                                z-10
                                rounded-md
                                border
                                border-emerald-500/30
                                bg-[#050505]/80
                                px-3
                                py-1.5
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-emerald-400
                                backdrop-blur-md
                            "
                        >
                            2. Live 3D Mesh
                        </div>

                      {activeViewerBlueprint ? (

    <Viewer
        blueprint={
            activeViewerBlueprint
        }
    />

) : (

                            <div
                                className="
                                    flex
                                    flex-col
                                    items-center
                                    gap-4
                                    px-8
                                    text-center
                                    text-xs
                                    font-bold
                                    uppercase
                                    tracking-widest
                                    text-white/20
                                "
                            >

                                <Box
                                    size={36}
                                    className="opacity-30"
                                />

                                <span>
                                    Draw a garment and build its 3D pattern
                                </span>

                            </div>

                        )}

                    </section>

                </div>

                {/*=================================================
                Recognition Panel
                =================================================*/}

                <aside
                    className="
                        flex
                        h-full
                        w-72
                        shrink-0
                        flex-col
                        gap-6
                        overflow-y-auto
                        border-l
                        border-white/5
                        bg-[#0a0a0a]
                        p-5
                        shadow-2xl
                    "
                >

                    {/* Recognition summary */}

                    <section>

                        <h4
                            className="
                                mb-4
                                flex
                                items-center
                                gap-2
                                border-b
                                border-white/5
                                pb-3
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-[0.3em]
                                text-[#D4AF37]
                            "
                        >

                            <BrainCircuit size={13} />

                            AI Recognition

                        </h4>

                        <div
                            className="
                                space-y-3
                                rounded-xl
                                border
                                border-white/5
                                bg-white/[0.03]
                                p-4
                            "
                        >

                            <StatusRow
                                label="Strokes"
                                value={lines.length}
                            />

                            <StatusRow
                                label="Analyses"
                                value={analyses.length}
                            />

                            <StatusRow
                                label="Groups"
                                value={groups.length}
                            />

                            <StatusRow
                                label="Last shape"
                                value={
                                    lastDetectedShape
                                }
                            />

                            <StatusRow
                                label="Shape confidence"
                                value={
                                    formattedShapeConfidence
                                }
                            />

                            <div
                                className="
                                    my-2
                                    h-px
                                    bg-white/5
                                "
                            />

                            <StatusRow
                                label="Garment"
                                value={
                                    detectedGarmentType
                                }
                            />

                            <StatusRow
                                label="Garment confidence"
                                value={
                                    formattedGarmentConfidence
                                }
                            />

                            <StatusRow
                                label="Detected parts"
                                value={
                                    detectedPartCount
                                }
                            />

                        </div>

                    </section>

                    {/* Garment construction hints */}

                    <section>

                        <h4
                            className="
                                mb-4
                                flex
                                items-center
                                gap-2
                                border-b
                                border-white/5
                                pb-3
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-[0.3em]
                                text-white/40
                            "
                        >

                            <Shirt size={13} />

                            Garment Structure

                        </h4>

                        <div
                            className="
                                space-y-2
                                rounded-xl
                                border
                                border-white/5
                                bg-white/[0.03]
                                p-4
                            "
                        >

                            <StructureRow
                                label="Torso"
                                present={
                                    constructionHints
                                        ?.torso
                                        ?.present
                                }
                            />

                            <StructureRow
                                label="Neck"
                                present={
                                    constructionHints
                                        ?.neck
                                        ?.present
                                }
                            />

                            <StructureRow
                                label="Left sleeve"
                                present={
                                    constructionHints
                                        ?.sleeves
                                        ?.left
                                        ?.present
                                }
                            />

                            <StructureRow
                                label="Right sleeve"
                                present={
                                    constructionHints
                                        ?.sleeves
                                        ?.right
                                        ?.present
                                }
                            />

                            <StructureRow
                                label="Waist"
                                present={
                                    constructionHints
                                        ?.waist
                                        ?.present
                                }
                            />

                            <StructureRow
                                label="Hem"
                                present={
                                    constructionHints
                                        ?.hem
                                        ?.present
                                }
                            />

                            <StatusRow
                                label="Lower body"
                                value={
                                    constructionHints
                                        ?.lowerBody
                                        ?.mode ||
                                    "unknown"
                                }
                            />

                        </div>

                    </section>

                    {/* Groups */}

                    <section>

                        <h4
                            className="
                                mb-4
                                flex
                                items-center
                                gap-2
                                border-b
                                border-white/5
                                pb-3
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-[0.3em]
                                text-white/40
                            "
                        >

                            <Layers size={13} />

                            Current Groups

                        </h4>

                        {groups.length === 0 ? (

                            <p
                                className="
                                    text-[9px]
                                    uppercase
                                    leading-relaxed
                                    tracking-widest
                                    text-white/25
                                "
                            >
                                Draw strokes to generate recognition groups.
                            </p>

                        ) : (

                            <div className="space-y-2">

                                {groups.map(
                                    (
                                        group,
                                        index
                                    ) => {

                                        const strokeCount =
                                            Array.isArray(
                                                group.strokeIds
                                            )
                                                ? group
                                                    .strokeIds
                                                    .length
                                                : Array.isArray(
                                                    group.strokes
                                                )
                                                    ? group
                                                        .strokes
                                                        .length
                                                    : 0;

                                        const groupType =
                                            group
                                                ?.garment
                                                ?.garmentType ||
                                            group.type ||
                                            "unknown";

                                        const groupConfidenceValue =
                                            Number(
                                                group
                                                    ?.garment
                                                    ?.confidence ??
                                                group.confidence
                                            );

                                        const groupConfidence =
                                            Number.isFinite(
                                                groupConfidenceValue
                                            )
                                                ? `${Math.round(
                                                    groupConfidenceValue *
                                                    100
                                                )}%`
                                                : "0%";

                                        return (

                                            <div
                                                key={
                                                    group.id ||
                                                    `group-${index}`
                                                }
                                                className="
                                                    rounded-lg
                                                    border
                                                    border-white/5
                                                    bg-white/[0.03]
                                                    p-3
                                                "
                                            >

                                                <p
                                                    className="
                                                        text-[9px]
                                                        font-bold
                                                        uppercase
                                                        tracking-widest
                                                        text-emerald-400
                                                    "
                                                >
                                                    {group.id ||
                                                        `Group ${index + 1}`}
                                                </p>

                                                <p
                                                    className="
                                                        mt-2
                                                        text-[9px]
                                                        text-white/40
                                                    "
                                                >
                                                    {strokeCount} stroke(s)
                                                </p>

                                                <p
                                                    className="
                                                        mt-1
                                                        text-[9px]
                                                        capitalize
                                                        text-[#D4AF37]
                                                    "
                                                >
                                                    Type: {groupType}
                                                </p>

                                                <p
                                                    className="
                                                        mt-1
                                                        text-[9px]
                                                        text-white/30
                                                    "
                                                >
                                                    Confidence:{" "}
                                                    {groupConfidence}
                                                </p>

                                            </div>

                                        );

                                    }
                                )}

                            </div>

                        )}

                    </section>

                    {/* Status message */}

                    {statusMessage && (

                        <div
                            className={`
                                mt-auto
                                rounded-xl
                                border
                                p-4
                                text-[9px]
                                font-bold
                                uppercase
                                leading-relaxed
                                tracking-widest
                                ${
                                    statusMessage
                                        .toLowerCase()
                                        .includes(
                                            "failed"
                                        )
                                        ? `
                                            border-rose-500/20
                                            bg-rose-500/5
                                            text-rose-400
                                        `
                                        : `
                                            border-emerald-500/20
                                            bg-emerald-500/5
                                            text-emerald-400
                                        `
                                }
                            `}
                        >
                            {statusMessage}
                        </div>

                    )}

                </aside>

            </div>

        </div>,

        document.body

    );

}

/*=========================================================
Status Row
=========================================================*/

function StatusRow({
    label,
    value
}) {

    return (
        <div
            className="
                flex
                items-center
                justify-between
                gap-3
            "
        >

            <span
                className="
                    text-[9px]
                    uppercase
                    tracking-widest
                    text-white/35
                "
            >
                {label}
            </span>

            <span
                className="
                    max-w-[135px]
                    truncate
                    text-right
                    font-mono
                    text-[10px]
                    font-bold
                    capitalize
                    text-white
                "
                title={
                    String(value)
                }
            >
                {value}
            </span>

        </div>
    );

}

/*=========================================================
Structure Row
=========================================================*/

function StructureRow({
    label,
    present
}) {

    return (
        <div
            className="
                flex
                items-center
                justify-between
                gap-3
            "
        >

            <span
                className="
                    text-[9px]
                    uppercase
                    tracking-widest
                    text-white/35
                "
            >
                {label}
            </span>

            <span
                className={`
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-widest
                    ${
                        present
                            ? "text-emerald-400"
                            : "text-white/20"
                    }
                `}
            >
                {present
                    ? "Detected"
                    : "Not found"}
            </span>

        </div>
    );

}