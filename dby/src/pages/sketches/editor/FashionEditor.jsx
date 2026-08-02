/*
=========================================================
FashionVision Professional 2D Editor
Main Editor Workspace
Version 1.0
=========================================================
*/

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import EditorCanvas from "./EditorCanvas";

import {
    BLEND_MODES,
    EDITOR_TOOLS,
    selectCanRedo,
    selectCanUndo,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const PROJECT_FILE_EXTENSION =
    ".fashionvision.json";

const DEFAULT_EXPORT_PIXEL_RATIO =
    2;

const WORKING_TOOLS = Object.freeze([
    {
        id:
            EDITOR_TOOLS.SELECT,

        label:
            "Select",

        symbol:
            "↖",

        shortcut:
            "V"
    },

    {
        id:
            EDITOR_TOOLS.PENCIL,

        label:
            "Pencil",

        symbol:
            "✎",

        shortcut:
            "P"
    },

    {
        id:
            EDITOR_TOOLS.PAN,

        label:
            "Pan",

        symbol:
            "✋",

        shortcut:
            "H"
    }
]);

const UPCOMING_TOOLS = Object.freeze([
    {
        id:
            EDITOR_TOOLS.BRUSH,

        label:
            "Brush",

        symbol:
            "🖌"
    },

    {
        id:
            EDITOR_TOOLS.ERASER,

        label:
            "Eraser",

        symbol:
            "◇"
    },

    {
        id:
            EDITOR_TOOLS.SHAPE,

        label:
            "Shape",

        symbol:
            "▢"
    },

    {
        id:
            EDITOR_TOOLS.FILL,

        label:
            "Fill",

        symbol:
            "◩"
    },

    {
        id:
            EDITOR_TOOLS.TEXT,

        label:
            "Text",

        symbol:
            "T"
    },

    {
        id:
            EDITOR_TOOLS.PATTERN,

        label:
            "Pattern",

        symbol:
            "❖"
    }
]);

/*=========================================================
General Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const numericValue =
        Number(value);

    return Number.isFinite(
        numericValue
    )
        ? numericValue
        : fallback;
}

function clamp(
    value,
    minimum,
    maximum
) {
    return Math.max(
        minimum,
        Math.min(
            maximum,
            numberOr(
                value,
                minimum
            )
        )
    );
}

function isFunction(
    value
) {
    return typeof value ===
        "function";
}

function sanitizeFileName(
    value,
    fallback =
        "fashion-design"
) {
    if (
        typeof value !==
            "string" ||
        !value.trim()
    ) {
        return fallback;
    }

    const cleaned =
        value
            .trim()
            .replace(
                /[<>:"/\\|?*\u0000-\u001F]/g,
                "-"
            )
            .replace(
                /\s+/g,
                "-"
            )
            .replace(
                /-+/g,
                "-"
            )
            .replace(
                /^-|-$|^\.+$/g,
                ""
            );

    return cleaned ||
        fallback;
}

function formatPercentage(
    value
) {
    return `${Math.round(
        numberOr(value, 0) *
        100
    )}%`;
}

function formatCoordinate(
    value
) {
    return Math.round(
        numberOr(value, 0)
    );
}

function formatObjectCount(
    count
) {
    return `${count} ${
        count === 1
            ? "object"
            : "objects"
    }`;
}

function getColorInputValue(
    color,
    fallback = "#111111"
) {
    if (
        typeof color ===
            "string" &&
        /^#[0-9a-f]{6}$/i.test(
            color
        )
    ) {
        return color;
    }

    if (
        typeof color ===
            "string" &&
        /^#[0-9a-f]{3}$/i.test(
            color
        )
    ) {
        return (
            "#" +
            color
                .slice(1)
                .split("")
                .map(
                    character =>
                        `${character}${character}`
                )
                .join("")
        );
    }

    return fallback;
}

/*=========================================================
Download Helpers
=========================================================*/

function downloadUrl(
    url,
    fileName
) {
    if (
        typeof window ===
            "undefined" ||
        typeof globalThis.document ===
            "undefined"
    ) {
        return;
    }

    const link =
        globalThis.document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        fileName;

    link.style.display =
        "none";

    globalThis.document.body.appendChild(
        link
    );

    link.click();

    link.remove();
}

function downloadTextFile(
    content,
    fileName,
    mimeType =
        "application/json"
) {
    const blob =
        new Blob(
            [
                content
            ],
            {
                type:
                    mimeType
            }
        );

    const objectUrl =
        URL.createObjectURL(
            blob
        );

    downloadUrl(
        objectUrl,
        fileName
    );

    window.setTimeout(
        () => {
            URL.revokeObjectURL(
                objectUrl
            );
        },
        1000
    );
}

/*=========================================================
Konva Export Helpers
=========================================================*/

function readNodeTransform(
    node
) {
    if (!node) {
        return null;
    }

    return {
        x:
            node.x(),

        y:
            node.y(),

        scaleX:
            node.scaleX(),

        scaleY:
            node.scaleY(),

        visible:
            node.visible()
    };
}

function restoreNodeTransform(
    node,
    snapshot
) {
    if (
        !node ||
        !snapshot
    ) {
        return;
    }

    node.position({
        x:
            snapshot.x,

        y:
            snapshot.y
    });

    node.scale({
        x:
            snapshot.scaleX,

        y:
            snapshot.scaleY
    });

    node.visible(
        snapshot.visible
    );
}

/*
Exports only the logical document area rather than the
whole grey editor workspace.
*/

function exportDocumentFromStage(
    stage,
    editorDocument,
    pixelRatio =
        DEFAULT_EXPORT_PIXEL_RATIO
) {
    if (
        !stage ||
        !isFunction(
            stage.toDataURL
        )
    ) {
        throw new Error(
            "The drawing canvas is unavailable."
        );
    }

    const backgroundLayer =
        stage.findOne(
            ".fashion-editor-background-layer"
        );

    const artworkLayer =
        stage.findOne(
            ".fashion-editor-artwork-layer"
        );

    const interactionLayer =
        stage.findOne(
            ".fashion-editor-interaction-layer"
        );

    const backgroundGroup =
        backgroundLayer
            ?.getChildren
            ?.()
            ?.[0] ||
        null;

    const artworkGroup =
        artworkLayer
            ?.getChildren
            ?.()
            ?.[0] ||
        null;

    const backgroundSnapshot =
        readNodeTransform(
            backgroundGroup
        );

    const artworkSnapshot =
        readNodeTransform(
            artworkGroup
        );

    const interactionVisibility =
        interactionLayer
            ?.visible
            ?.();

    try {
        if (backgroundGroup) {
            backgroundGroup.position({
                x: 0,
                y: 0
            });

            backgroundGroup.scale({
                x: 1,
                y: 1
            });
        }

        if (artworkGroup) {
            artworkGroup.position({
                x: 0,
                y: 0
            });

            artworkGroup.scale({
                x: 1,
                y: 1
            });
        }

        /*
        Do not include temporary strokes or interaction
        overlays in the final PNG.
        */

        interactionLayer?.visible(
            false
        );

        stage.batchDraw();

        return stage.toDataURL({
            x:
                0,

            y:
                0,

            width:
                Math.max(
                    1,
                    numberOr(
                        editorDocument
                            ?.width,
                        1200
                    )
                ),

            height:
                Math.max(
                    1,
                    numberOr(
                        editorDocument
                            ?.height,
                        1600
                    )
                ),

            pixelRatio:
                Math.max(
                    1,
                    numberOr(
                        pixelRatio,
                        DEFAULT_EXPORT_PIXEL_RATIO
                    )
                ),

            mimeType:
                "image/png",

            quality:
                1
        });
    } finally {
        restoreNodeTransform(
            backgroundGroup,
            backgroundSnapshot
        );

        restoreNodeTransform(
            artworkGroup,
            artworkSnapshot
        );

        if (
            interactionLayer &&
            interactionVisibility !==
                undefined
        ) {
            interactionLayer.visible(
                interactionVisibility
            );
        }

        stage.batchDraw();
    }
}

/*=========================================================
Reusable UI Components
=========================================================*/

function HeaderButton({
    children,
    onClick,
    disabled = false,
    active = false,
    title = ""
}) {
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            disabled={
                disabled
            }
            title={
                title
            }
            className={[
                "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition",

                active
                    ? "border-violet-400 bg-violet-500/20 text-violet-100"
                    : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white",

                disabled
                    ? "cursor-not-allowed opacity-40"
                    : ""
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {children}
        </button>
    );
}

function ToolButton({
    tool,
    active,
    disabled = false,
    onClick
}) {
    const title =
        disabled
            ? `${tool.label} — coming later`
            : `${tool.label}${
                tool.shortcut
                    ? ` (${tool.shortcut})`
                    : ""
            }`;

    return (
        <button
            type="button"
            title={
                title
            }
            aria-label={
                tool.label
            }
            aria-pressed={
                active
            }
            disabled={
                disabled
            }
            onClick={
                onClick
            }
            className={[
                "group relative flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition",

                active
                    ? "border-violet-400 bg-violet-500 text-white shadow-lg shadow-violet-950/40"
                    : "border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white",

                disabled
                    ? "cursor-not-allowed opacity-30"
                    : ""
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <span
                aria-hidden="true"
            >
                {tool.symbol}
            </span>

            <span
                className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl group-hover:block"
            >
                {title}
            </span>
        </button>
    );
}

function PanelSection({
    title,
    children,
    action = null
}) {
    return (
        <section
            className="border-b border-slate-800 px-4 py-4 last:border-b-0"
        >
            <div
                className="mb-3 flex items-center justify-between gap-3"
            >
                <h3
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"
                >
                    {title}
                </h3>

                {action}
            </div>

            {children}
        </section>
    );
}

function SmallIconButton({
    children,
    title,
    onClick,
    disabled = false,
    active = false
}) {
    return (
        <button
            type="button"
            title={
                title
            }
            aria-label={
                title
            }
            disabled={
                disabled
            }
            onClick={
                onClick
            }
            className={[
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs transition",

                active
                    ? "border-violet-400 bg-violet-500/20 text-violet-200"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white",

                disabled
                    ? "cursor-not-allowed opacity-35"
                    : ""
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {children}
        </button>
    );
}

/*=========================================================
Fashion Editor Component
=========================================================*/

function FashionEditor() {
    const stageRef =
        useRef(null);

    const fileInputRef =
        useRef(null);

    const noticeTimerRef =
        useRef(null);

    /*=====================================================
    Store State
    =====================================================*/

    const editorDocument =
        useFashionEditorStore(
            state =>
                state.document
        );

    const layers =
        useFashionEditorStore(
            state =>
                state.layers
        );

    const objects =
        useFashionEditorStore(
            state =>
                state.objects
        );

    const activeLayerId =
        useFashionEditorStore(
            state =>
                state.activeLayerId
        );

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
        );

    const selectedObjectIds =
        useFashionEditorStore(
            state =>
                state.selectedObjectIds
        );

    const brush =
        useFashionEditorStore(
            state =>
                state.brush
        );

    const colors =
        useFashionEditorStore(
            state =>
                state.colors
        );

    const viewport =
        useFashionEditorStore(
            state =>
                state.viewport
        );

    const ui =
        useFashionEditorStore(
            state =>
                state.ui
        );

    const persistence =
        useFashionEditorStore(
            state =>
                state.persistence
        );

    const canUndo =
        useFashionEditorStore(
            selectCanUndo
        );

    const canRedo =
        useFashionEditorStore(
            selectCanRedo
        );

    /*=====================================================
    Store Actions
    =====================================================*/

    const newDocument =
        useFashionEditorStore(
            state =>
                state.newDocument
        );

    const clearDocument =
        useFashionEditorStore(
            state =>
                state.clearDocument
        );

    const setDocumentName =
        useFashionEditorStore(
            state =>
                state.setDocumentName
        );

    const setDocumentBackground =
        useFashionEditorStore(
            state =>
                state
                    .setDocumentBackground
        );

    const loadProject =
        useFashionEditorStore(
            state =>
                state.loadProject
        );

    const getProjectData =
        useFashionEditorStore(
            state =>
                state.getProjectData
        );

    const markSaved =
        useFashionEditorStore(
            state =>
                state.markSaved
        );

    const setSaveError =
        useFashionEditorStore(
            state =>
                state.setSaveError
        );

    const setActiveTool =
        useFashionEditorStore(
            state =>
                state.setActiveTool
        );

    const setBrushSettings =
        useFashionEditorStore(
            state =>
                state.setBrushSettings
        );

    const setPrimaryColor =
        useFashionEditorStore(
            state =>
                state.setPrimaryColor
        );

    const setSecondaryColor =
        useFashionEditorStore(
            state =>
                state.setSecondaryColor
        );

    const swapColors =
        useFashionEditorStore(
            state =>
                state.swapColors
        );

    const setActiveLayer =
        useFashionEditorStore(
            state =>
                state.setActiveLayer
        );

    const addLayer =
        useFashionEditorStore(
            state =>
                state.addLayer
        );

    const duplicateLayer =
        useFashionEditorStore(
            state =>
                state.duplicateLayer
        );

    const deleteLayer =
        useFashionEditorStore(
            state =>
                state.deleteLayer
        );

    const renameLayer =
        useFashionEditorStore(
            state =>
                state.renameLayer
        );

    const toggleLayerVisibility =
        useFashionEditorStore(
            state =>
                state
                    .toggleLayerVisibility
        );

    const toggleLayerLock =
        useFashionEditorStore(
            state =>
                state.toggleLayerLock
        );

    const setLayerOpacity =
        useFashionEditorStore(
            state =>
                state.setLayerOpacity
        );

    const setLayerBlendMode =
        useFashionEditorStore(
            state =>
                state
                    .setLayerBlendMode
        );

    const moveLayer =
        useFashionEditorStore(
            state =>
                state.moveLayer
        );

    const beginHistoryTransaction =
        useFashionEditorStore(
            state =>
                state
                    .beginHistoryTransaction
        );

    const commitHistoryTransaction =
        useFashionEditorStore(
            state =>
                state
                    .commitHistoryTransaction
        );

    const undo =
        useFashionEditorStore(
            state =>
                state.undo
        );

    const redo =
        useFashionEditorStore(
            state =>
                state.redo
        );

    const zoomIn =
        useFashionEditorStore(
            state =>
                state.zoomIn
        );

    const zoomOut =
        useFashionEditorStore(
            state =>
                state.zoomOut
        );

    const fitDocumentToViewport =
        useFashionEditorStore(
            state =>
                state
                    .fitDocumentToViewport
        );

    const setUiState =
        useFashionEditorStore(
            state =>
                state.setUiState
        );

    /*=====================================================
    Local UI State
    =====================================================*/

    const [
        documentName,
        setDocumentNameInput
    ] = useState(
        editorDocument.name
    );

    const [
        pointerInformation,
        setPointerInformation
    ] = useState({
        documentPoint:
            null,

        insideDocument:
            false
    });

    const [
        rightPanelTab,
        setRightPanelTab
    ] = useState(
        "layers"
    );

    const [
        rightPanelOpen,
        setRightPanelOpen
    ] = useState(
        true
    );

    const [
        notice,
        setNotice
    ] = useState(null);

    const [
        errorMessage,
        setErrorMessage
    ] = useState(null);

    /*=====================================================
    Derived State
    =====================================================*/

    const activeLayer =
        useMemo(
            () =>
                layers.find(
                    layer =>
                        layer.id ===
                        activeLayerId
                ) ||
                null,
            [
                layers,
                activeLayerId
            ]
        );

    const displayedLayers =
        useMemo(
            () =>
                layers
                    .map(
                        (
                            layer,
                            index
                        ) => ({
                            layer,
                            originalIndex:
                                index
                        })
                    )
                    .reverse(),
            [
                layers
            ]
        );

    const objectCount =
        useMemo(
            () =>
                Object.keys(
                    objects
                ).length,
            [
                objects
            ]
        );

    const projectBaseName =
        useMemo(
            () =>
                sanitizeFileName(
                    editorDocument.name
                ),
            [
                editorDocument.name
            ]
        );

    /*=====================================================
    Notice Handling
    =====================================================*/

    const showNotice =
        useCallback(
            (
                message,
                type = "success"
            ) => {
                if (
                    noticeTimerRef.current
                ) {
                    window.clearTimeout(
                        noticeTimerRef.current
                    );
                }

                setNotice({
                    message,
                    type
                });

                noticeTimerRef.current =
                    window.setTimeout(
                        () => {
                            setNotice(
                                null
                            );
                        },
                        2600
                    );
            },
            []
        );

    useEffect(
        () => {
            return () => {
                if (
                    noticeTimerRef.current
                ) {
                    window.clearTimeout(
                        noticeTimerRef.current
                    );
                }
            };
        },
        []
    );

    /*=====================================================
    Sync Document Name
    =====================================================*/

    useEffect(
        () => {
            setDocumentNameInput(
                editorDocument.name
            );
        },
        [
            editorDocument.id,
            editorDocument.name
        ]
    );

    /*=====================================================
    Unsaved Changes Protection
    =====================================================*/

    useEffect(
        () => {
            if (
                !persistence.dirty
            ) {
                return undefined;
            }

            const handleBeforeUnload =
                event => {
                    event.preventDefault();

                    event.returnValue =
                        "";
                };

            window.addEventListener(
                "beforeunload",
                handleBeforeUnload
            );

            return () => {
                window.removeEventListener(
                    "beforeunload",
                    handleBeforeUnload
                );
            };
        },
        [
            persistence.dirty
        ]
    );

    /*=====================================================
    Document Name
    =====================================================*/

    const commitDocumentName =
        useCallback(
            () => {
                const nextName =
                    documentName.trim();

                if (!nextName) {
                    setDocumentNameInput(
                        editorDocument.name
                    );

                    return;
                }

                if (
                    nextName !==
                    editorDocument.name
                ) {
                    setDocumentName(
                        nextName
                    );
                }
            },
            [
                documentName,
                editorDocument.name,
                setDocumentName
            ]
        );

    const handleDocumentNameKeyDown =
        useCallback(
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    event.currentTarget.blur();
                }

                if (
                    event.key ===
                    "Escape"
                ) {
                    setDocumentNameInput(
                        editorDocument.name
                    );

                    event.currentTarget.blur();
                }
            },
            [
                editorDocument.name
            ]
        );

    /*=====================================================
    New and Clear
    =====================================================*/

    const handleNewDocument =
        useCallback(
            () => {
                if (
                    persistence.dirty &&
                    objectCount > 0
                ) {
                    const confirmed =
                        window.confirm(
                            "Create a new document? Unsaved changes in the current design will be lost."
                        );

                    if (!confirmed) {
                        return;
                    }
                }

                newDocument();

                setErrorMessage(
                    null
                );

                showNotice(
                    "New document created."
                );
            },
            [
                persistence.dirty,
                objectCount,
                newDocument,
                showNotice
            ]
        );

    const handleClearDocument =
        useCallback(
            () => {
                if (
                    objectCount === 0
                ) {
                    return;
                }

                const confirmed =
                    window.confirm(
                        "Clear every object from this document?"
                    );

                if (!confirmed) {
                    return;
                }

                clearDocument();

                showNotice(
                    "Document cleared."
                );
            },
            [
                objectCount,
                clearDocument,
                showNotice
            ]
        );

    /*=====================================================
    Save Project
    =====================================================*/

    const handleSaveProject =
        useCallback(
            projectOverride => {
                try {
                    const projectData =
                        projectOverride &&
                        typeof projectOverride ===
                            "object"
                            ? projectOverride
                            : getProjectData();

                    const serialized =
                        JSON.stringify(
                            projectData,
                            null,
                            2
                        );

                    downloadTextFile(
                        serialized,
                        `${projectBaseName}${PROJECT_FILE_EXTENSION}`,
                        "application/json"
                    );

                    markSaved();

                    setErrorMessage(
                        null
                    );

                    showNotice(
                        "Project file saved."
                    );
                } catch (error) {
                    const message =
                        error?.message ||
                        "The project could not be saved.";

                    setSaveError(
                        error
                    );

                    setErrorMessage(
                        message
                    );
                }
            },
            [
                getProjectData,
                projectBaseName,
                markSaved,
                setSaveError,
                showNotice
            ]
        );

    /*=====================================================
    Open Project
    =====================================================*/

    const handleOpenProjectClick =
        useCallback(
            () => {
                fileInputRef.current
                    ?.click
                    ?.();
            },
            []
        );

    const handleProjectFileChange =
        useCallback(
            async event => {
                const file =
                    event.target
                        .files
                        ?.[0];

                event.target.value =
                    "";

                if (!file) {
                    return;
                }

                if (
                    persistence.dirty &&
                    objectCount > 0
                ) {
                    const confirmed =
                        window.confirm(
                            "Open another project? Unsaved changes in the current design will be lost."
                        );

                    if (!confirmed) {
                        return;
                    }
                }

                try {
                    const text =
                        await file.text();

                    const project =
                        JSON.parse(
                            text
                        );

                    loadProject(
                        project
                    );

                    setErrorMessage(
                        null
                    );

                    showNotice(
                        "Project opened."
                    );
                } catch (error) {
                    const message =
                        error?.message ||
                        "The selected file is not a valid FashionVision project.";

                    setErrorMessage(
                        message
                    );
                }
            },
            [
                persistence.dirty,
                objectCount,
                loadProject,
                showNotice
            ]
        );

    /*=====================================================
    PNG Export
    =====================================================*/

    const handleExportPng =
        useCallback(
            () => {
                try {
                    const stage =
                        stageRef.current;

                    const dataUrl =
                        exportDocumentFromStage(
                            stage,
                            editorDocument,
                            DEFAULT_EXPORT_PIXEL_RATIO
                        );

                    downloadUrl(
                        dataUrl,
                        `${projectBaseName}.png`
                    );

                    setErrorMessage(
                        null
                    );

                    showNotice(
                        "High-resolution PNG exported."
                    );
                } catch (error) {
                    setErrorMessage(
                        error?.message ||
                        "The PNG could not be exported."
                    );
                }
            },
            [
                editorDocument,
                projectBaseName,
                showNotice
            ]
        );

    /*=====================================================
    Fit Document
    =====================================================*/

    const handleFitDocument =
        useCallback(
            () => {
                const stage =
                    stageRef.current;

                if (!stage) {
                    return;
                }

                fitDocumentToViewport(
                    stage.width(),
                    stage.height(),
                    56
                );
            },
            [
                fitDocumentToViewport
            ]
        );

    /*=====================================================
    Layer Operations
    =====================================================*/

    const handleAddLayer =
        useCallback(
            () => {
                addLayer();

                showNotice(
                    "Layer added."
                );
            },
            [
                addLayer,
                showNotice
            ]
        );

    const handleDeleteLayer =
        useCallback(
            layerId => {
                if (
                    layers.length <=
                    1
                ) {
                    showNotice(
                        "A document must contain at least one layer.",
                        "warning"
                    );

                    return;
                }

                const targetLayer =
                    layers.find(
                        layer =>
                            layer.id ===
                            layerId
                    );

                if (!targetLayer) {
                    return;
                }

                const hasObjects =
                    targetLayer
                        .objectIds
                        .length > 0;

                if (hasObjects) {
                    const confirmed =
                        window.confirm(
                            `Delete "${targetLayer.name}" and every object inside it?`
                        );

                    if (!confirmed) {
                        return;
                    }
                }

                deleteLayer(
                    layerId
                );
            },
            [
                layers,
                deleteLayer,
                showNotice
            ]
        );

    const moveLayerUp =
        useCallback(
            (
                layerId,
                currentIndex
            ) => {
                moveLayer(
                    layerId,
                    Math.min(
                        layers.length -
                        1,
                        currentIndex +
                        1
                    )
                );
            },
            [
                layers.length,
                moveLayer
            ]
        );

    const moveLayerDown =
        useCallback(
            (
                layerId,
                currentIndex
            ) => {
                moveLayer(
                    layerId,
                    Math.max(
                        0,
                        currentIndex -
                        1
                    )
                );
            },
            [
                moveLayer
            ]
        );

    /*=====================================================
    Pointer Position
    =====================================================*/

    const handlePointerPositionChange =
        useCallback(
            information => {
                setPointerInformation(
                    information
                );
            },
            []
        );

    /*=====================================================
    Render
    =====================================================*/

    return (
        <div
            className="flex h-screen w-full flex-col overflow-hidden bg-slate-950 text-slate-100"
        >
            {/*===========================================
            Hidden Project Input
            ===========================================*/}

            <input
                ref={fileInputRef}
                type="file"
                accept=".json,.fashionvision.json,application/json"
                onChange={
                    handleProjectFileChange
                }
                className="hidden"
            />

            {/*===========================================
            Header
            ===========================================*/}

            <header
                className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-4 shadow-lg backdrop-blur-xl"
            >
                <div
                    className="flex min-w-0 items-center gap-3"
                >
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-violet-950/40"
                    >
                        FV
                    </div>

                    <div
                        className="hidden shrink-0 sm:block"
                    >
                        <p
                            className="text-sm font-bold leading-none text-white"
                        >
                            FashionVision
                        </p>

                        <p
                            className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500"
                        >
                            2D Design Studio
                        </p>
                    </div>

                    <div
                        className="hidden h-8 w-px bg-slate-800 md:block"
                    />

                    <input
                        value={
                            documentName
                        }
                        onChange={
                            event =>
                                setDocumentNameInput(
                                    event.target.value
                                )
                        }
                        onBlur={
                            commitDocumentName
                        }
                        onKeyDown={
                            handleDocumentNameKeyDown
                        }
                        spellCheck={
                            false
                        }
                        aria-label="Document name"
                        className="min-w-0 max-w-[280px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-slate-200 outline-none transition hover:border-slate-700 focus:border-violet-500 focus:bg-slate-900"
                    />

                    <span
                        title={
                            persistence.dirty
                                ? "Unsaved changes"
                                : "Saved"
                        }
                        className={[
                            "hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block",

                            persistence.dirty
                                ? "bg-amber-400 shadow shadow-amber-400/50"
                                : "bg-emerald-400 shadow shadow-emerald-400/50"
                        ].join(" ")}
                    />
                </div>

                <div
                    className="flex shrink-0 items-center gap-2"
                >
                    <div
                        className="hidden items-center gap-2 xl:flex"
                    >
                        <HeaderButton
                            onClick={
                                handleNewDocument
                            }
                            title="Create a new document"
                        >
                            New
                        </HeaderButton>

                        <HeaderButton
                            onClick={
                                handleOpenProjectClick
                            }
                            title="Open a project file"
                        >
                            Open
                        </HeaderButton>

                        <HeaderButton
                            onClick={
                                handleSaveProject
                            }
                            title="Save project as JSON — Ctrl/Cmd + S"
                        >
                            Save
                        </HeaderButton>

                        <HeaderButton
                            onClick={
                                handleExportPng
                            }
                            title="Export the document as PNG"
                        >
                            Export PNG
                        </HeaderButton>
                    </div>

                    <div
                        className="hidden h-8 w-px bg-slate-800 lg:block"
                    />

                    <SmallIconButton
                        title="Undo — Ctrl/Cmd + Z"
                        disabled={
                            !canUndo
                        }
                        onClick={
                            undo
                        }
                    >
                        ↶
                    </SmallIconButton>

                    <SmallIconButton
                        title="Redo — Ctrl/Cmd + Shift + Z"
                        disabled={
                            !canRedo
                        }
                        onClick={
                            redo
                        }
                    >
                        ↷
                    </SmallIconButton>

                    <SmallIconButton
                        title="Toggle properties panel"
                        active={
                            rightPanelOpen
                        }
                        onClick={
                            () =>
                                setRightPanelOpen(
                                    value =>
                                        !value
                                )
                        }
                    >
                        ◫
                    </SmallIconButton>
                </div>
            </header>

            {/*===========================================
            Main Workspace
            ===========================================*/}

            <div
                className="flex min-h-0 flex-1"
            >
                {/*---------------------------------------
                Left Tool Bar
                ---------------------------------------*/}

                <aside
                    className="relative z-20 flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-slate-800 bg-slate-950 px-2 py-3 shadow-xl"
                >
                    {WORKING_TOOLS.map(
                        tool => (
                            <ToolButton
                                key={
                                    tool.id
                                }
                                tool={
                                    tool
                                }
                                active={
                                    activeTool ===
                                    tool.id
                                }
                                onClick={
                                    () =>
                                        setActiveTool(
                                            tool.id
                                        )
                                }
                            />
                        )
                    )}

                    <div
                        className="my-1 h-px w-8 bg-slate-800"
                    />

                    {UPCOMING_TOOLS.map(
                        tool => (
                            <ToolButton
                                key={
                                    tool.id
                                }
                                tool={
                                    tool
                                }
                                active={
                                    false
                                }
                                disabled
                            />
                        )
                    )}

                    <div
                        className="mt-auto flex flex-col gap-2"
                    >
                        <SmallIconButton
                            title={
                                ui.showGrid
                                    ? "Hide grid"
                                    : "Show grid"
                            }
                            active={
                                ui.showGrid
                            }
                            onClick={
                                () =>
                                    setUiState({
                                        showGrid:
                                            !ui.showGrid
                                    })
                            }
                        >
                            #
                        </SmallIconButton>

                        <SmallIconButton
                            title="Fit document to screen — 0"
                            onClick={
                                handleFitDocument
                            }
                        >
                            ⛶
                        </SmallIconButton>
                    </div>
                </aside>

                {/*---------------------------------------
                Canvas Area
                ---------------------------------------*/}

                <main
                    className="relative min-w-0 flex-1 overflow-hidden bg-slate-900"
                >
                    <EditorCanvas
                        ref={stageRef}
                        stageRef={
                            stageRef
                        }
                        className="h-full w-full"
                        minimumHeight={
                            0
                        }
                        autoFit
                        wheelZoom
                        clipToDocument
                        onPointerPositionChange={
                            handlePointerPositionChange
                        }
                        onSaveRequested={
                            handleSaveProject
                        }
                        onError={
                            error => {
                                setErrorMessage(
                                    error?.message ||
                                    "An editor error occurred."
                                );
                            }
                        }
                    />

                    {/* Canvas floating controls */}

                    <div
                        className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl"
                    >
                        <button
                            type="button"
                            onClick={
                                zoomOut
                            }
                            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                            title="Zoom out"
                        >
                            −
                        </button>

                        <button
                            type="button"
                            onClick={
                                handleFitDocument
                            }
                            className="pointer-events-auto min-w-[70px] rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            title="Fit document to screen"
                        >
                            {formatPercentage(
                                viewport.zoom
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={
                                zoomIn
                            }
                            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                            title="Zoom in"
                        >
                            +
                        </button>
                    </div>
                </main>

                {/*---------------------------------------
                Right Panel
                ---------------------------------------*/}

                {rightPanelOpen && (
                    <aside
                        className="relative z-20 hidden w-[320px] shrink-0 flex-col border-l border-slate-800 bg-slate-950 shadow-2xl lg:flex"
                    >
                        <div
                            className="flex h-12 shrink-0 border-b border-slate-800 p-1.5"
                        >
                            <button
                                type="button"
                                onClick={
                                    () =>
                                        setRightPanelTab(
                                            "layers"
                                        )
                                }
                                className={[
                                    "flex-1 rounded-lg text-xs font-semibold transition",

                                    rightPanelTab ===
                                    "layers"
                                        ? "bg-slate-800 text-white"
                                        : "text-slate-500 hover:text-slate-200"
                                ].join(" ")}
                            >
                                Layers
                            </button>

                            <button
                                type="button"
                                onClick={
                                    () =>
                                        setRightPanelTab(
                                            "properties"
                                        )
                                }
                                className={[
                                    "flex-1 rounded-lg text-xs font-semibold transition",

                                    rightPanelTab ===
                                    "properties"
                                        ? "bg-slate-800 text-white"
                                        : "text-slate-500 hover:text-slate-200"
                                ].join(" ")}
                            >
                                Properties
                            </button>
                        </div>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto"
                        >
                            {rightPanelTab ===
                            "layers" ? (
                                <>
                                    <PanelSection
                                        title="Layers"
                                        action={
                                            <SmallIconButton
                                                title="Add layer"
                                                onClick={
                                                    handleAddLayer
                                                }
                                            >
                                                +
                                            </SmallIconButton>
                                        }
                                    >
                                        <div
                                            className="space-y-2"
                                        >
                                            {displayedLayers.map(
                                                ({
                                                    layer,
                                                    originalIndex
                                                }) => {
                                                    const isActive =
                                                        layer.id ===
                                                        activeLayerId;

                                                    return (
                                                        <div
                                                            key={
                                                                layer.id
                                                            }
                                                            onClick={
                                                                () =>
                                                                    setActiveLayer(
                                                                        layer.id
                                                                    )
                                                            }
                                                            className={[
                                                                "group rounded-xl border p-2 transition",

                                                                isActive
                                                                    ? "border-violet-500/70 bg-violet-500/10"
                                                                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                                                            ].join(" ")}
                                                        >
                                                            <div
                                                                className="flex items-center gap-2"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    title={
                                                                        layer.visible
                                                                            ? "Hide layer"
                                                                            : "Show layer"
                                                                    }
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            toggleLayerVisibility(
                                                                                layer.id
                                                                            );
                                                                        }
                                                                    }
                                                                    className="flex h-8 w-8 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                                                                >
                                                                    {layer.visible
                                                                        ? "◉"
                                                                        : "○"}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    title={
                                                                        layer.locked
                                                                            ? "Unlock layer"
                                                                            : "Lock layer"
                                                                    }
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            toggleLayerLock(
                                                                                layer.id
                                                                            );
                                                                        }
                                                                    }
                                                                    className="flex h-8 w-8 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                                                                >
                                                                    {layer.locked
                                                                        ? "●"
                                                                        : "◌"}
                                                                </button>

                                                                <input
                                                                    value={
                                                                        layer.name
                                                                    }
                                                                    onClick={
                                                                        event =>
                                                                            event.stopPropagation()
                                                                    }
                                                                    onChange={
                                                                        event =>
                                                                            renameLayer(
                                                                                layer.id,
                                                                                event.target.value
                                                                            )
                                                                    }
                                                                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-200 outline-none focus:border-violet-500 focus:bg-slate-950"
                                                                    aria-label="Layer name"
                                                                />

                                                                <span
                                                                    className="text-[10px] text-slate-500"
                                                                >
                                                                    {
                                                                        layer
                                                                            .objectIds
                                                                            .length
                                                                    }
                                                                </span>
                                                            </div>

                                                            <div
                                                                className="mt-2 flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100"
                                                            >
                                                                <SmallIconButton
                                                                    title="Move layer upward"
                                                                    disabled={
                                                                        originalIndex >=
                                                                        layers.length -
                                                                            1
                                                                    }
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            moveLayerUp(
                                                                                layer.id,
                                                                                originalIndex
                                                                            );
                                                                        }
                                                                    }
                                                                >
                                                                    ↑
                                                                </SmallIconButton>

                                                                <SmallIconButton
                                                                    title="Move layer downward"
                                                                    disabled={
                                                                        originalIndex <=
                                                                        0
                                                                    }
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            moveLayerDown(
                                                                                layer.id,
                                                                                originalIndex
                                                                            );
                                                                        }
                                                                    }
                                                                >
                                                                    ↓
                                                                </SmallIconButton>

                                                                <SmallIconButton
                                                                    title="Duplicate layer"
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            duplicateLayer(
                                                                                layer.id
                                                                            );
                                                                        }
                                                                    }
                                                                >
                                                                    ⧉
                                                                </SmallIconButton>

                                                                <SmallIconButton
                                                                    title="Delete layer"
                                                                    disabled={
                                                                        layers.length <=
                                                                        1
                                                                    }
                                                                    onClick={
                                                                        event => {
                                                                            event.stopPropagation();

                                                                            handleDeleteLayer(
                                                                                layer.id
                                                                            );
                                                                        }
                                                                    }
                                                                >
                                                                    ×
                                                                </SmallIconButton>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            )}
                                        </div>
                                    </PanelSection>

                                    {activeLayer && (
                                        <PanelSection
                                            title="Active Layer"
                                        >
                                            <label
                                                className="block"
                                            >
                                                <div
                                                    className="mb-2 flex items-center justify-between text-xs text-slate-400"
                                                >
                                                    <span>
                                                        Opacity
                                                    </span>

                                                    <span>
                                                        {formatPercentage(
                                                            activeLayer.opacity
                                                        )}
                                                    </span>
                                                </div>

                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.01"
                                                    value={
                                                        activeLayer.opacity
                                                    }
                                                    onPointerDown={
                                                        () =>
                                                            beginHistoryTransaction(
                                                                "Change layer opacity"
                                                            )
                                                    }
                                                    onPointerUp={
                                                        commitHistoryTransaction
                                                    }
                                                    onBlur={
                                                        commitHistoryTransaction
                                                    }
                                                    onChange={
                                                        event =>
                                                            setLayerOpacity(
                                                                activeLayer.id,
                                                                Number(
                                                                    event.target.value
                                                                )
                                                            )
                                                    }
                                                    className="w-full accent-violet-500"
                                                />
                                            </label>

                                            <label
                                                className="mt-4 block"
                                            >
                                                <span
                                                    className="mb-2 block text-xs text-slate-400"
                                                >
                                                    Blend mode
                                                </span>

                                                <select
                                                    value={
                                                        activeLayer.blendMode
                                                    }
                                                    onChange={
                                                        event =>
                                                            setLayerBlendMode(
                                                                activeLayer.id,
                                                                event.target.value
                                                            )
                                                    }
                                                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500"
                                                >
                                                    {BLEND_MODES.map(
                                                        mode => (
                                                            <option
                                                                key={
                                                                    mode
                                                                }
                                                                value={
                                                                    mode
                                                                }
                                                            >
                                                                {mode}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </label>
                                        </PanelSection>
                                    )}
                                </>
                            ) : (
                                <>
                                    <PanelSection
                                        title="Pencil"
                                    >
                                        <label
                                            className="block"
                                        >
                                            <div
                                                className="mb-2 flex items-center justify-between text-xs text-slate-400"
                                            >
                                                <span>
                                                    Size
                                                </span>

                                                <span>
                                                    {numberOr(
                                                        brush.size,
                                                        4
                                                    ).toFixed(
                                                        1
                                                    )}{" "}
                                                    px
                                                </span>
                                            </div>

                                            <input
                                                type="range"
                                                min="0.5"
                                                max="80"
                                                step="0.5"
                                                value={
                                                    brush.size
                                                }
                                                onChange={
                                                    event =>
                                                        setBrushSettings({
                                                            size:
                                                                Number(
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                        })
                                                }
                                                className="w-full accent-violet-500"
                                            />
                                        </label>

                                        <label
                                            className="mt-4 block"
                                        >
                                            <div
                                                className="mb-2 flex items-center justify-between text-xs text-slate-400"
                                            >
                                                <span>
                                                    Opacity
                                                </span>

                                                <span>
                                                    {formatPercentage(
                                                        brush.opacity
                                                    )}
                                                </span>
                                            </div>

                                            <input
                                                type="range"
                                                min="0.01"
                                                max="1"
                                                step="0.01"
                                                value={
                                                    brush.opacity
                                                }
                                                onChange={
                                                    event =>
                                                        setBrushSettings({
                                                            opacity:
                                                                Number(
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                        })
                                                }
                                                className="w-full accent-violet-500"
                                            />
                                        </label>

                                        <label
                                            className="mt-4 block"
                                        >
                                            <div
                                                className="mb-2 flex items-center justify-between text-xs text-slate-400"
                                            >
                                                <span>
                                                    Smoothing
                                                </span>

                                                <span>
                                                    {formatPercentage(
                                                        brush.smoothing
                                                    )}
                                                </span>
                                            </div>

                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={
                                                    brush.smoothing
                                                }
                                                onChange={
                                                    event =>
                                                        setBrushSettings({
                                                            smoothing:
                                                                Number(
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                        })
                                                }
                                                className="w-full accent-violet-500"
                                            />
                                        </label>

                                        <div
                                            className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                                        >
                                            <span
                                                className="text-xs text-slate-400"
                                            >
                                                Pressure
                                            </span>

                                            <button
                                                type="button"
                                                onClick={
                                                    () =>
                                                        setBrushSettings({
                                                            pressureEnabled:
                                                                !brush.pressureEnabled
                                                        })
                                                }
                                                className={[
                                                    "rounded-full px-3 py-1 text-xs font-semibold transition",

                                                    brush.pressureEnabled
                                                        ? "bg-violet-500 text-white"
                                                        : "bg-slate-800 text-slate-400"
                                                ].join(" ")}
                                            >
                                                {brush.pressureEnabled
                                                    ? "On"
                                                    : "Off"}
                                            </button>
                                        </div>
                                    </PanelSection>

                                    <PanelSection
                                        title="Colours"
                                    >
                                        <div
                                            className="flex items-center gap-3"
                                        >
                                            <label
                                                className="relative block h-12 w-12 cursor-pointer overflow-hidden rounded-xl border-2 border-slate-600 shadow"
                                                title="Primary colour"
                                            >
                                                <input
                                                    type="color"
                                                    value={
                                                        getColorInputValue(
                                                            colors.primary
                                                        )
                                                    }
                                                    onChange={
                                                        event =>
                                                            setPrimaryColor(
                                                                event.target.value
                                                            )
                                                    }
                                                    className="absolute inset-[-8px] h-20 w-20 cursor-pointer border-0 bg-transparent"
                                                />
                                            </label>

                                            <label
                                                className="relative block h-10 w-10 cursor-pointer overflow-hidden rounded-xl border-2 border-slate-700 shadow"
                                                title="Secondary colour"
                                            >
                                                <input
                                                    type="color"
                                                    value={
                                                        getColorInputValue(
                                                            colors.secondary,
                                                            "#ffffff"
                                                        )
                                                    }
                                                    onChange={
                                                        event =>
                                                            setSecondaryColor(
                                                                event.target.value
                                                            )
                                                    }
                                                    className="absolute inset-[-8px] h-20 w-20 cursor-pointer border-0 bg-transparent"
                                                />
                                            </label>

                                            <SmallIconButton
                                                title="Swap primary and secondary colours"
                                                onClick={
                                                    swapColors
                                                }
                                            >
                                                ⇄
                                            </SmallIconButton>

                                            <div
                                                className="min-w-0 flex-1"
                                            >
                                                <input
                                                    value={
                                                        colors.primary
                                                    }
                                                    onChange={
                                                        event =>
                                                            setPrimaryColor(
                                                                event.target.value
                                                            )
                                                    }
                                                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-violet-500"
                                                    aria-label="Primary colour value"
                                                />
                                            </div>
                                        </div>

                                        {colors.recent.length >
                                            0 && (
                                            <div
                                                className="mt-4"
                                            >
                                                <p
                                                    className="mb-2 text-xs text-slate-500"
                                                >
                                                    Recent
                                                </p>

                                                <div
                                                    className="flex flex-wrap gap-2"
                                                >
                                                    {colors.recent
                                                        .slice(
                                                            0,
                                                            12
                                                        )
                                                        .map(
                                                            color => (
                                                                <button
                                                                    key={
                                                                        color
                                                                    }
                                                                    type="button"
                                                                    title={
                                                                        color
                                                                    }
                                                                    onClick={
                                                                        () =>
                                                                            setPrimaryColor(
                                                                                color
                                                                            )
                                                                    }
                                                                    style={{
                                                                        backgroundColor:
                                                                            color
                                                                    }}
                                                                    className="h-7 w-7 rounded-md border border-white/20 shadow transition hover:scale-110"
                                                                />
                                                            )
                                                        )}
                                                </div>
                                            </div>
                                        )}
                                    </PanelSection>

                                    <PanelSection
                                        title="Document"
                                    >
                                        <div
                                            className="grid grid-cols-2 gap-2"
                                        >
                                            <div
                                                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                                            >
                                                <span
                                                    className="block text-[10px] uppercase tracking-wider text-slate-500"
                                                >
                                                    Width
                                                </span>

                                                <strong
                                                    className="text-sm text-slate-200"
                                                >
                                                    {
                                                        editorDocument.width
                                                    }{" "}
                                                    px
                                                </strong>
                                            </div>

                                            <div
                                                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                                            >
                                                <span
                                                    className="block text-[10px] uppercase tracking-wider text-slate-500"
                                                >
                                                    Height
                                                </span>

                                                <strong
                                                    className="text-sm text-slate-200"
                                                >
                                                    {
                                                        editorDocument.height
                                                    }{" "}
                                                    px
                                                </strong>
                                            </div>
                                        </div>

                                        <label
                                            className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                                        >
                                            <span
                                                className="text-xs text-slate-400"
                                            >
                                                Background
                                            </span>

                                            <input
                                                type="color"
                                                value={
                                                    getColorInputValue(
                                                        editorDocument.background,
                                                        "#ffffff"
                                                    )
                                                }
                                                onChange={
                                                    event =>
                                                        setDocumentBackground(
                                                            event.target.value
                                                        )
                                                }
                                                className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent"
                                            />
                                        </label>
                                    </PanelSection>

                                    <PanelSection
                                        title="Selection"
                                    >
                                        <div
                                            className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                                        >
                                            <p
                                                className="text-sm font-semibold text-slate-200"
                                            >
                                                {
                                                    selectedObjectIds.length
                                                }{" "}
                                                selected
                                            </p>

                                            <p
                                                className="mt-1 text-xs leading-5 text-slate-500"
                                            >
                                                Use the Select
                                                tool to click and
                                                move completed
                                                pencil strokes.
                                            </p>
                                        </div>
                                    </PanelSection>
                                </>
                            )}
                        </div>

                        <div
                            className="shrink-0 border-t border-slate-800 p-3"
                        >
                            <button
                                type="button"
                                onClick={
                                    handleClearDocument
                                }
                                disabled={
                                    objectCount === 0
                                }
                                className="w-full rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:border-red-700 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                Clear document
                            </button>
                        </div>
                    </aside>
                )}
            </div>

            {/*===========================================
            Status Bar
            ===========================================*/}

            <footer
                className="relative z-30 flex h-8 shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-500"
            >
                <div
                    className="flex min-w-0 items-center gap-4"
                >
                    <span>
                        {pointerInformation
                            .insideDocument &&
                        pointerInformation
                            .documentPoint
                            ? `X ${formatCoordinate(
                                pointerInformation
                                    .documentPoint
                                    .x
                            )}  Y ${formatCoordinate(
                                pointerInformation
                                    .documentPoint
                                    .y
                            )}`
                            : "Outside canvas"}
                    </span>

                    <span
                        className="hidden sm:inline"
                    >
                        {
                            editorDocument.width
                        }{" "}
                        ×{" "}
                        {
                            editorDocument.height
                        }{" "}
                        px
                    </span>

                    <span
                        className="hidden md:inline"
                    >
                        {formatObjectCount(
                            objectCount
                        )}
                    </span>

                    <span
                        className="hidden lg:inline"
                    >
                        {
                            selectedObjectIds.length
                        }{" "}
                        selected
                    </span>
                </div>

                <div
                    className="flex shrink-0 items-center gap-4"
                >
                    <span
                        className="capitalize"
                    >
                        {activeTool}
                    </span>

                    <span>
                        {formatPercentage(
                            viewport.zoom
                        )}
                    </span>

                    <span
                        className={
                            persistence.dirty
                                ? "text-amber-400"
                                : "text-emerald-400"
                        }
                    >
                        {persistence.saving
                            ? "Saving…"
                            : persistence.dirty
                                ? "Unsaved"
                                : "Saved"}
                    </span>
                </div>
            </footer>

            {/*===========================================
            Notices
            ===========================================*/}

            {notice && (
                <div
                    className={[
                        "fixed bottom-12 left-1/2 z-[100] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl",

                        notice.type ===
                        "warning"
                            ? "border-amber-500/50 bg-amber-950/90 text-amber-200"
                            : "border-emerald-500/50 bg-emerald-950/90 text-emerald-200"
                    ].join(" ")}
                >
                    {notice.message}
                </div>
            )}

            {errorMessage && (
                <div
                    className="fixed right-4 top-20 z-[100] max-w-sm rounded-xl border border-red-500/50 bg-red-950/95 p-4 text-sm text-red-200 shadow-2xl backdrop-blur-xl"
                    role="alert"
                >
                    <div
                        className="flex items-start gap-3"
                    >
                        <div
                            className="min-w-0 flex-1"
                        >
                            <p
                                className="font-semibold"
                            >
                                Editor error
                            </p>

                            <p
                                className="mt-1 leading-5 text-red-300"
                            >
                                {errorMessage}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={
                                () =>
                                    setErrorMessage(
                                        null
                                    )
                            }
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-300 hover:bg-red-900"
                            aria-label="Close error"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FashionEditor;