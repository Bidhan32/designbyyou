/*
=========================================================
FashionVision Professional Editor
Responsive Main Fashion Editor
Version 1.3
=========================================================
*/

import React, {
    memo,
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
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_COLOURS = Object.freeze([
    "#111111",
    "#ffffff",
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#78716c"
]);

const TOOL_DEFINITIONS = Object.freeze([
    {
        id: EDITOR_TOOLS.SELECT,
        label: "Select",
        shortcut: "V",
        symbol: "V",
        enabled: true
    },
    {
        id: EDITOR_TOOLS.PENCIL,
        label: "Pencil",
        shortcut: "P",
        symbol: "P",
        enabled: true
    },
    {
        id: EDITOR_TOOLS.ERASER,
        label: "Eraser",
        shortcut: "E",
        symbol: "E",
        enabled: true
    },
    {
        id: EDITOR_TOOLS.PAN,
        label: "Pan",
        shortcut: "H",
        symbol: "H",
        enabled: true
    },
    {
        id: EDITOR_TOOLS.BRUSH,
        label: "Brush",
        shortcut: "B",
        symbol: "B",
        enabled: false
    },
    {
        id: EDITOR_TOOLS.LINE,
        label: "Line",
        shortcut: "L",
        symbol: "L",
        enabled: false
    },
    {
        id: EDITOR_TOOLS.SHAPE,
        label: "Shape",
        shortcut: "S",
        symbol: "S",
        enabled: false
    },
    {
        id: EDITOR_TOOLS.FILL,
        label: "Fill",
        shortcut: "F",
        symbol: "F",
        enabled: false
    },
    {
        id: EDITOR_TOOLS.TEXT,
        label: "Text",
        shortcut: "T",
        symbol: "T",
        enabled: false
    }
]);

/*=========================================================
Helpers
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

function createSafeFilename(
    value,
    fallback = "fashion-design"
) {
    const text =
        typeof value === "string"
            ? value.trim()
            : "";

    const cleaned =
        text
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );

    return cleaned || fallback;
}

function downloadTextFile(
    filename,
    content,
    mimeType =
        "application/json"
) {
    const blob =
        new Blob(
            [content],
            {
                type:
                    `${mimeType};charset=utf-8`
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const anchor =
        globalThis.document
            .createElement("a");

    anchor.href =
        url;

    anchor.download =
        filename;

    globalThis.document
        .body
        .appendChild(anchor);

    anchor.click();
    anchor.remove();

    window.setTimeout(
        () => {
            URL.revokeObjectURL(
                url
            );
        },
        100
    );
}

function downloadDataUrl(
    filename,
    dataUrl
) {
    const anchor =
        globalThis.document
            .createElement("a");

    anchor.href =
        dataUrl;

    anchor.download =
        filename;

    globalThis.document
        .body
        .appendChild(anchor);

    anchor.click();
    anchor.remove();
}

function getFirstChild(node) {
    const children =
        node
            ?.getChildren
            ?.();

    if (!children) {
        return null;
    }

    if (
        typeof children.toArray ===
        "function"
    ) {
        return (
            children.toArray()[0] ||
            null
        );
    }

    try {
        return (
            Array.from(
                children
            )[0] ||
            null
        );
    } catch {
        return null;
    }
}

/*=========================================================
Media Query Hook
=========================================================*/

function useMediaQuery(query) {
    const [
        matches,
        setMatches
    ] = useState(false);

    useEffect(() => {
        if (
            typeof window ===
                "undefined" ||
            typeof window.matchMedia !==
                "function"
        ) {
            return undefined;
        }

        const mediaQuery =
            window.matchMedia(
                query
            );

        const updateMatch = () => {
            setMatches(
                mediaQuery.matches
            );
        };

        updateMatch();

        mediaQuery.addEventListener?.(
            "change",
            updateMatch
        );

        return () => {
            mediaQuery.removeEventListener?.(
                "change",
                updateMatch
            );
        };
    }, [query]);

    return matches;
}

/*=========================================================
Reusable Components
=========================================================*/

function HeaderButton({
    children,
    onClick,
    disabled = false,
    active = false,
    title = "",
    className = ""
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={[
                "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition",
                active
                    ? "border-violet-500 bg-violet-500 text-white"
                    : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700",
                disabled
                    ? "cursor-not-allowed opacity-40 hover:border-slate-700 hover:bg-slate-800"
                    : "",
                className
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
    onClick,
    horizontal = false
}) {
    return (
        <button
            type="button"
            disabled={
                !tool.enabled
            }
            onClick={() => {
                if (tool.enabled) {
                    onClick(
                        tool.id
                    );
                }
            }}
            title={
                tool.enabled
                    ? `${tool.label} (${tool.shortcut})`
                    : `${tool.label} — coming soon`
            }
            aria-pressed={
                active
            }
            className={[
                "group shrink-0 rounded-xl border transition",
                horizontal
                    ? "flex h-14 min-w-[58px] flex-col items-center justify-center px-2"
                    : "flex h-14 w-14 flex-col items-center justify-center",
                active
                    ? "border-violet-500 bg-violet-500 text-white shadow-lg shadow-violet-950/40"
                    : "border-transparent bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-white",
                !tool.enabled
                    ? "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-slate-900 hover:text-slate-400"
                    : ""
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <span className="text-sm font-black">
                {tool.symbol}
            </span>

            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider">
                {tool.label}
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
        <section className="border-b border-slate-800 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {title}
                </h3>

                {action}
            </div>

            {children}
        </section>
    );
}

function SliderField({
    label,
    value,
    minimum,
    maximum,
    step = 1,
    suffix = "",
    onChange,
    onStart = null,
    onEnd = null
}) {
    return (
        <label className="block">
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-300">
                    {label}
                </span>

                <span className="min-w-12 text-right text-xs font-semibold text-slate-100">
                    {value}
                    {suffix}
                </span>
            </div>

            <input
                type="range"
                min={minimum}
                max={maximum}
                step={step}
                value={value}
                onChange={event => {
                    onChange(
                        Number(
                            event.target.value
                        )
                    );
                }}
                onPointerDown={
                    onStart
                }
                onPointerUp={
                    onEnd
                }
                onPointerCancel={
                    onEnd
                }
                onBlur={
                    onEnd
                }
                className="h-1.5 w-full cursor-pointer accent-violet-500"
            />
        </label>
    );
}

function LayerNameField({
    layer,
    renameLayer
}) {
    const [
        name,
        setName
    ] = useState(
        layer.name
    );

    useEffect(() => {
        setName(
            layer.name
        );
    }, [
        layer.id,
        layer.name
    ]);

    const commitName =
        useCallback(() => {
            const cleanedName =
                name.trim();

            if (!cleanedName) {
                setName(
                    layer.name
                );

                return;
            }

            if (
                cleanedName !==
                layer.name
            ) {
                renameLayer(
                    layer.id,
                    cleanedName
                );
            }
        }, [
            name,
            layer.id,
            layer.name,
            renameLayer
        ]);

    return (
        <input
            value={name}
            onChange={event => {
                setName(
                    event.target.value
                );
            }}
            onBlur={
                commitName
            }
            onKeyDown={event => {
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
                    setName(
                        layer.name
                    );

                    event.currentTarget.blur();
                }
            }}
            onClick={event => {
                event.stopPropagation();
            }}
            className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-200 outline-none"
        />
    );
}

function DocumentNameField({
    documentData,
    setDocumentName
}) {
    const [
        name,
        setName
    ] = useState(
        documentData.name
    );

    useEffect(() => {
        setName(
            documentData.name
        );
    }, [
        documentData.id,
        documentData.name
    ]);

    const commitName =
        useCallback(() => {
            const cleanedName =
                name.trim();

            if (!cleanedName) {
                setName(
                    documentData.name
                );

                return;
            }

            if (
                cleanedName !==
                documentData.name
            ) {
                setDocumentName(
                    cleanedName
                );
            }
        }, [
            name,
            documentData.name,
            setDocumentName
        ]);

    return (
        <input
            value={name}
            onChange={event => {
                setName(
                    event.target.value
                );
            }}
            onBlur={
                commitName
            }
            onKeyDown={event => {
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
                    setName(
                        documentData.name
                    );

                    event.currentTarget.blur();
                }
            }}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-slate-200 outline-none transition hover:border-slate-700 focus:border-violet-500 focus:bg-slate-900 sm:text-sm"
            aria-label="Document name"
        />
    );
}

/*=========================================================
Fashion Editor
=========================================================*/

function FashionEditor() {
    const stageRef =
        useRef(null);

    const fileInputRef =
        useRef(null);

    const toastTimerRef =
        useRef(null);

    const isDesktopPanel =
        useMediaQuery(
            "(min-width: 1280px)"
        );

    /*=====================================================
    Store State
    =====================================================*/

    const documentData =
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

    const selectedObjectIds =
        useFashionEditorStore(
            state =>
                state.selectedObjectIds
        );

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
        );

    const brush =
        useFashionEditorStore(
            state =>
                state.brush
        );

    const eraser =
        useFashionEditorStore(
            state =>
                state.eraser
        );

    const colours =
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

    const history =
        useFashionEditorStore(
            state =>
                state.history
        );

    const persistence =
        useFashionEditorStore(
            state =>
                state.persistence
        );

    /*=====================================================
    Store Actions
    =====================================================*/

    const setActiveTool =
        useFashionEditorStore(
            state =>
                state.setActiveTool
        );

    const newDocument =
        useFashionEditorStore(
            state =>
                state.newDocument
        );

    const setDocumentName =
        useFashionEditorStore(
            state =>
                state.setDocumentName
        );

    const setDocumentBackground =
        useFashionEditorStore(
            state =>
                state.setDocumentBackground
        );

    const getProjectData =
        useFashionEditorStore(
            state =>
                state.getProjectData
        );

    const loadProject =
        useFashionEditorStore(
            state =>
                state.loadProject
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

    const setBrushSettings =
        useFashionEditorStore(
            state =>
                state.setBrushSettings
        );

    const setEraserSize =
        useFashionEditorStore(
            state =>
                state.setEraserSize
        );

    const setEraserMode =
        useFashionEditorStore(
            state =>
                state.setEraserMode
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

    const addLayer =
        useFashionEditorStore(
            state =>
                state.addLayer
        );

    const setActiveLayer =
        useFashionEditorStore(
            state =>
                state.setActiveLayer
        );

    const renameLayer =
        useFashionEditorStore(
            state =>
                state.renameLayer
        );

    const toggleLayerVisibility =
        useFashionEditorStore(
            state =>
                state.toggleLayerVisibility
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
                state.setLayerBlendMode
        );

    const moveLayer =
        useFashionEditorStore(
            state =>
                state.moveLayer
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

    const deleteObjects =
        useFashionEditorStore(
            state =>
                state.deleteObjects
        );

    const duplicateObjects =
        useFashionEditorStore(
            state =>
                state.duplicateObjects
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
                state.fitDocumentToViewport
        );

    const toggleGrid =
        useFashionEditorStore(
            state =>
                state.toggleGrid
        );

    const setUiState =
        useFashionEditorStore(
            state =>
                state.setUiState
        );

    const beginHistoryTransaction =
        useFashionEditorStore(
            state =>
                state.beginHistoryTransaction
        );

    const commitHistoryTransaction =
        useFashionEditorStore(
            state =>
                state.commitHistoryTransaction
        );

    /*=====================================================
    Local State
    =====================================================*/

    const [
        panelDrawerOpen,
        setPanelDrawerOpen
    ] = useState(false);

    const [
        mobileMenuOpen,
        setMobileMenuOpen
    ] = useState(false);

    const [
        pointerInformation,
        setPointerInformation
    ] = useState(null);

    const [
        toast,
        setToast
    ] = useState(null);

    const [
        editorError,
        setEditorError
    ] = useState(null);

    const [
        exporting,
        setExporting
    ] = useState(false);

    /*=====================================================
    Derived State
    =====================================================*/

    const rightPanelTab =
        ui.rightPanelTab ||
        "layers";

    const activeLayer =
        useMemo(
            () =>
                layers.find(
                    layer =>
                        layer.id ===
                        activeLayerId
                ) || null,
            [
                layers,
                activeLayerId
            ]
        );

    const selectedObjects =
        useMemo(
            () =>
                selectedObjectIds
                    .map(
                        objectId =>
                            objects[
                                objectId
                            ]
                    )
                    .filter(Boolean),
            [
                selectedObjectIds,
                objects
            ]
        );

    const displayedLayers =
        useMemo(
            () => [
                ...layers
            ].reverse(),
            [layers]
        );

    const objectCount =
        Object.keys(
            objects
        ).length;

    const canUndo =
        history.past.length >
            0 ||
        Boolean(
            history.transaction
        );

    const canRedo =
        history.future.length >
        0;

    const zoomPercentage =
        Math.round(
            viewport.zoom *
            100
        );

    const activeToolDefinition =
        TOOL_DEFINITIONS.find(
            tool =>
                tool.id ===
                activeTool
        );

    /*=====================================================
    Responsive UI Effects
    =====================================================*/

    useEffect(() => {
        if (isDesktopPanel) {
            setPanelDrawerOpen(
                false
            );
        }
    }, [isDesktopPanel]);

    useEffect(() => {
        if (
            !panelDrawerOpen &&
            !mobileMenuOpen
        ) {
            return undefined;
        }

        const handleEscape =
            event => {
                if (
                    event.key !==
                    "Escape"
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                setPanelDrawerOpen(
                    false
                );

                setMobileMenuOpen(
                    false
                );
            };

        window.addEventListener(
            "keydown",
            handleEscape,
            true
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleEscape,
                true
            );
        };
    }, [
        panelDrawerOpen,
        mobileMenuOpen
    ]);

    /*=====================================================
    Toast
    =====================================================*/

    const showToast =
        useCallback(
            (
                message,
                type = "success"
            ) => {
                if (
                    toastTimerRef.current
                ) {
                    window.clearTimeout(
                        toastTimerRef.current
                    );
                }

                setToast({
                    message,
                    type
                });

                toastTimerRef.current =
                    window.setTimeout(
                        () => {
                            setToast(
                                null
                            );
                        },
                        2800
                    );
            },
            []
        );

    useEffect(() => {
        return () => {
            if (
                toastTimerRef.current
            ) {
                window.clearTimeout(
                    toastTimerRef.current
                );
            }
        };
    }, []);

    /*=====================================================
    Unsaved Work Protection
    =====================================================*/

    useEffect(() => {
        const handleBeforeUnload =
            event => {
                if (
                    !persistence.dirty
                ) {
                    return;
                }

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
    }, [
        persistence.dirty
    ]);

    /*=====================================================
    Document Operations
    =====================================================*/

    const confirmReplaceDocument =
        useCallback(() => {
            if (
                !persistence.dirty
            ) {
                return true;
            }

            return window.confirm(
                "This design has unsaved changes. Continue and discard them?"
            );
        }, [
            persistence.dirty
        ]);

    const fitCanvas =
        useCallback(() => {
            const stage =
                stageRef.current;

            if (!stage) {
                return;
            }

            fitDocumentToViewport(
                stage.width(),
                stage.height(),
                48
            );
        }, [
            fitDocumentToViewport
        ]);

    const handleNewDocument =
        useCallback(() => {
            setMobileMenuOpen(
                false
            );

            if (
                !confirmReplaceDocument()
            ) {
                return;
            }

            newDocument();

            window.requestAnimationFrame(
                fitCanvas
            );

            showToast(
                "New design created."
            );
        }, [
            confirmReplaceDocument,
            newDocument,
            fitCanvas,
            showToast
        ]);

    const handleOpenProject =
        useCallback(() => {
            setMobileMenuOpen(
                false
            );

            if (
                !confirmReplaceDocument()
            ) {
                return;
            }

            fileInputRef.current
                ?.click();
        }, [
            confirmReplaceDocument
        ]);

    const handleProjectFileChange =
        useCallback(
            async event => {
                const file =
                    event.target
                        .files?.[0];

                event.target.value =
                    "";

                if (!file) {
                    return;
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

                    window.requestAnimationFrame(
                        fitCanvas
                    );

                    setEditorError(
                        null
                    );

                    showToast(
                        "Project opened successfully."
                    );
                } catch (error) {
                    console.error(
                        error
                    );

                    setEditorError(
                        error
                    );

                    showToast(
                        "The project file could not be opened.",
                        "error"
                    );
                }
            },
            [
                loadProject,
                fitCanvas,
                showToast
            ]
        );

    const handleSaveProject =
        useCallback(
            (
                projectOverride =
                    null
            ) => {
                setMobileMenuOpen(
                    false
                );

                try {
                    const isProjectData =
                        projectOverride &&
                        typeof projectOverride ===
                            "object" &&
                        projectOverride.document &&
                        projectOverride.layers;

                    const project =
                        isProjectData
                            ? projectOverride
                            : getProjectData();

                    const filename =
                        `${createSafeFilename(
                            project.document
                                ?.name
                        )}.fashion.json`;

                    downloadTextFile(
                        filename,
                        JSON.stringify(
                            project,
                            null,
                            2
                        )
                    );

                    markSaved();

                    setEditorError(
                        null
                    );

                    showToast(
                        "Project saved."
                    );
                } catch (error) {
                    console.error(
                        error
                    );

                    setSaveError(
                        error
                    );

                    setEditorError(
                        error
                    );

                    showToast(
                        "Project could not be saved.",
                        "error"
                    );
                }
            },
            [
                getProjectData,
                markSaved,
                setSaveError,
                showToast
            ]
        );

    /*=====================================================
    PNG Export
    =====================================================*/

    const handleExportPng =
        useCallback(() => {
            setMobileMenuOpen(
                false
            );

            const stage =
                stageRef.current;

            if (
                !stage ||
                exporting
            ) {
                return;
            }

            setExporting(
                true
            );

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

            const transformer =
                stage.findOne(
                    ".fashion-editor-selection-transformer"
                );

            const backgroundGroup =
                getFirstChild(
                    backgroundLayer
                );

            const artworkGroup =
                getFirstChild(
                    artworkLayer
                );

            const originalStageSize = {
                width:
                    stage.width(),

                height:
                    stage.height()
            };

            const originalBackgroundTransform =
                backgroundGroup
                    ? {
                        x:
                            backgroundGroup.x(),

                        y:
                            backgroundGroup.y(),

                        scaleX:
                            backgroundGroup.scaleX(),

                        scaleY:
                            backgroundGroup.scaleY()
                    }
                    : null;

            const originalArtworkTransform =
                artworkGroup
                    ? {
                        x:
                            artworkGroup.x(),

                        y:
                            artworkGroup.y(),

                        scaleX:
                            artworkGroup.scaleX(),

                        scaleY:
                            artworkGroup.scaleY()
                    }
                    : null;

            const interactionWasVisible =
                interactionLayer
                    ?.visible?.() ??
                true;

            const transformerWasVisible =
                transformer
                    ?.visible?.() ??
                false;

            try {
                interactionLayer
                    ?.visible(false);

                transformer
                    ?.visible(false);

                backgroundGroup
                    ?.setAttrs({
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1
                    });

                artworkGroup
                    ?.setAttrs({
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1
                    });

                stage.size({
                    width:
                        documentData.width,

                    height:
                        documentData.height
                });

                stage.batchDraw();

                const dataUrl =
                    stage.toDataURL({
                        x: 0,
                        y: 0,

                        width:
                            documentData.width,

                        height:
                            documentData.height,

                        pixelRatio:
                            1,

                        mimeType:
                            "image/png",

                        quality:
                            1
                    });

                downloadDataUrl(
                    `${createSafeFilename(
                        documentData.name
                    )}.png`,
                    dataUrl
                );

                showToast(
                    "PNG exported."
                );
            } catch (error) {
                console.error(
                    error
                );

                setEditorError(
                    error
                );

                showToast(
                    "PNG export failed.",
                    "error"
                );
            } finally {
                if (
                    originalBackgroundTransform
                ) {
                    backgroundGroup
                        ?.setAttrs(
                            originalBackgroundTransform
                        );
                }

                if (
                    originalArtworkTransform
                ) {
                    artworkGroup
                        ?.setAttrs(
                            originalArtworkTransform
                        );
                }

                interactionLayer
                    ?.visible(
                        interactionWasVisible
                    );

                transformer
                    ?.visible(
                        transformerWasVisible
                    );

                stage.size(
                    originalStageSize
                );

                stage.batchDraw();

                setExporting(
                    false
                );
            }
        }, [
            exporting,
            documentData.width,
            documentData.height,
            documentData.name,
            showToast
        ]);

    /*=====================================================
    Layer Helpers
    =====================================================*/

    const handleMoveLayerUp =
        useCallback(
            layerId => {
                const index =
                    layers.findIndex(
                        layer =>
                            layer.id ===
                            layerId
                    );

                if (
                    index < 0 ||
                    index >=
                        layers.length - 1
                ) {
                    return;
                }

                moveLayer(
                    layerId,
                    index + 1
                );
            },
            [
                layers,
                moveLayer
            ]
        );

    const handleMoveLayerDown =
        useCallback(
            layerId => {
                const index =
                    layers.findIndex(
                        layer =>
                            layer.id ===
                            layerId
                    );

                if (
                    index <= 0
                ) {
                    return;
                }

                moveLayer(
                    layerId,
                    index - 1
                );
            },
            [
                layers,
                moveLayer
            ]
        );

    const handleDeleteActiveLayer =
        useCallback(() => {
            if (
                !activeLayer ||
                layers.length <= 1
            ) {
                return;
            }

            const confirmed =
                window.confirm(
                    `Delete "${activeLayer.name}" and all objects inside it?`
                );

            if (!confirmed) {
                return;
            }

            deleteLayer(
                activeLayer.id
            );
        }, [
            activeLayer,
            layers.length,
            deleteLayer
        ]);

    /*=====================================================
    Right Panel Content
    =====================================================*/

    const rightPanelContent = (
        <>
            <div className="flex h-12 shrink-0 items-center border-b border-slate-800 bg-slate-950">
                <button
                    type="button"
                    onClick={() => {
                        setUiState({
                            rightPanelTab:
                                "layers"
                        });
                    }}
                    className={[
                        "h-full flex-1 border-b-2 text-[10px] font-bold uppercase tracking-[0.16em] transition",
                        rightPanelTab ===
                        "layers"
                            ? "border-violet-500 text-white"
                            : "border-transparent text-slate-500 hover:text-slate-300"
                    ].join(" ")}
                >
                    Layers
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setUiState({
                            rightPanelTab:
                                "properties"
                        });
                    }}
                    className={[
                        "h-full flex-1 border-b-2 text-[10px] font-bold uppercase tracking-[0.16em] transition",
                        rightPanelTab ===
                        "properties"
                            ? "border-violet-500 text-white"
                            : "border-transparent text-slate-500 hover:text-slate-300"
                    ].join(" ")}
                >
                    Properties
                </button>

                {!isDesktopPanel && (
                    <button
                        type="button"
                        onClick={() => {
                            setPanelDrawerOpen(
                                false
                            );
                        }}
                        title="Close panel"
                        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:bg-slate-800"
                    >
                        ×
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {rightPanelTab ===
                    "layers" && (
                    <>
                        <PanelSection
                            title="Layers"
                            action={
                                <button
                                    type="button"
                                    onClick={() =>
                                        addLayer()
                                    }
                                    className="rounded-md bg-violet-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-violet-400"
                                >
                                    + Add
                                </button>
                            }
                        >
                            <div className="space-y-2">
                                {displayedLayers.map(
                                    layer => {
                                        const actualIndex =
                                            layers.findIndex(
                                                item =>
                                                    item.id ===
                                                    layer.id
                                            );

                                        const active =
                                            layer.id ===
                                            activeLayerId;

                                        return (
                                            <div
                                                key={
                                                    layer.id
                                                }
                                                onClick={() => {
                                                    setActiveLayer(
                                                        layer.id
                                                    );
                                                }}
                                                className={[
                                                    "cursor-pointer rounded-xl border p-2 transition",
                                                    active
                                                        ? "border-violet-500 bg-violet-500/10"
                                                        : "border-slate-800 bg-slate-900 hover:border-slate-700"
                                                ].join(" ")}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        title={
                                                            layer.visible
                                                                ? "Hide layer"
                                                                : "Show layer"
                                                        }
                                                        onClick={event => {
                                                            event.stopPropagation();

                                                            toggleLayerVisibility(
                                                                layer.id
                                                            );
                                                        }}
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                                                    >
                                                        {layer.visible
                                                            ? "◉"
                                                            : "○"}
                                                    </button>

                                                    <LayerNameField
                                                        layer={
                                                            layer
                                                        }
                                                        renameLayer={
                                                            renameLayer
                                                        }
                                                    />

                                                    <button
                                                        type="button"
                                                        title={
                                                            layer.locked
                                                                ? "Unlock layer"
                                                                : "Lock layer"
                                                        }
                                                        onClick={event => {
                                                            event.stopPropagation();

                                                            toggleLayerLock(
                                                                layer.id
                                                            );
                                                        }}
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                                                    >
                                                        {layer.locked
                                                            ? "■"
                                                            : "□"}
                                                    </button>
                                                </div>

                                                <div className="mt-2 flex items-center justify-between pl-11 text-[10px] text-slate-500">
                                                    <span>
                                                        {layer.objectIds.length} object
                                                        {layer.objectIds.length ===
                                                        1
                                                            ? ""
                                                            : "s"}
                                                    </span>

                                                    <span>
                                                        {Math.round(
                                                            layer.opacity *
                                                            100
                                                        )}
                                                        %
                                                    </span>
                                                </div>

                                                {active && (
                                                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                actualIndex >=
                                                                layers.length -
                                                                    1
                                                            }
                                                            onClick={event => {
                                                                event.stopPropagation();

                                                                handleMoveLayerUp(
                                                                    layer.id
                                                                );
                                                            }}
                                                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                                                        >
                                                            Up
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                actualIndex <=
                                                                0
                                                            }
                                                            onClick={event => {
                                                                event.stopPropagation();

                                                                handleMoveLayerDown(
                                                                    layer.id
                                                                );
                                                            }}
                                                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                                                        >
                                                            Down
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={event => {
                                                                event.stopPropagation();

                                                                duplicateLayer(
                                                                    layer.id
                                                                );
                                                            }}
                                                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
                                                        >
                                                            Copy
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                layers.length <=
                                                                1
                                                            }
                                                            onClick={event => {
                                                                event.stopPropagation();

                                                                handleDeleteActiveLayer();
                                                            }}
                                                            className="min-h-9 rounded-md bg-red-950/60 py-1.5 text-[10px] text-red-300 hover:bg-red-900 disabled:opacity-30"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                )}
                            </div>
                        </PanelSection>

                        {activeLayer && (
                            <PanelSection title="Layer Settings">
                                <div className="space-y-5">
                                    <SliderField
                                        label="Opacity"
                                        value={
                                            Math.round(
                                                activeLayer.opacity *
                                                100
                                            )
                                        }
                                        minimum={0}
                                        maximum={100}
                                        suffix="%"
                                        onStart={() => {
                                            beginHistoryTransaction(
                                                "Change layer opacity"
                                            );
                                        }}
                                        onEnd={() => {
                                            commitHistoryTransaction();
                                        }}
                                        onChange={value => {
                                            setLayerOpacity(
                                                activeLayer.id,
                                                value /
                                                    100
                                            );
                                        }}
                                    />

                                    <label className="block">
                                        <span className="mb-2 block text-xs font-medium text-slate-300">
                                            Blend mode
                                        </span>

                                        <select
                                            value={
                                                activeLayer.blendMode
                                            }
                                            onChange={event => {
                                                setLayerBlendMode(
                                                    activeLayer.id,
                                                    event.target.value
                                                );
                                            }}
                                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                                        >
                                            {BLEND_MODES.map(
                                                blendMode => (
                                                    <option
                                                        key={
                                                            blendMode
                                                        }
                                                        value={
                                                            blendMode
                                                        }
                                                    >
                                                        {blendMode}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </label>
                                </div>
                            </PanelSection>
                        )}
                    </>
                )}

                {rightPanelTab ===
                    "properties" && (
                    <>
                        {activeTool ===
                            EDITOR_TOOLS.PENCIL && (
                            <PanelSection title="Pencil">
                                <div className="space-y-5">
                                    <SliderField
                                        label="Size"
                                        value={
                                            brush.size
                                        }
                                        minimum={
                                            0.25
                                        }
                                        maximum={
                                            100
                                        }
                                        step={
                                            0.25
                                        }
                                        suffix="px"
                                        onChange={value => {
                                            setBrushSettings({
                                                size:
                                                    value
                                            });
                                        }}
                                    />

                                    <SliderField
                                        label="Opacity"
                                        value={
                                            Math.round(
                                                brush.opacity *
                                                100
                                            )
                                        }
                                        minimum={1}
                                        maximum={100}
                                        suffix="%"
                                        onChange={value => {
                                            setBrushSettings({
                                                opacity:
                                                    value /
                                                    100
                                            });
                                        }}
                                    />

                                    <SliderField
                                        label="Smoothing"
                                        value={
                                            Math.round(
                                                brush.smoothing *
                                                100
                                            )
                                        }
                                        minimum={0}
                                        maximum={100}
                                        suffix="%"
                                        onChange={value => {
                                            setBrushSettings({
                                                smoothing:
                                                    value /
                                                    100
                                            });
                                        }}
                                    />

                                    <SliderField
                                        label="Streamline"
                                        value={
                                            Math.round(
                                                brush.streamline *
                                                100
                                            )
                                        }
                                        minimum={0}
                                        maximum={100}
                                        suffix="%"
                                        onChange={value => {
                                            setBrushSettings({
                                                streamline:
                                                    value /
                                                    100
                                            });
                                        }}
                                    />

                                    <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                                        Pressure enabled

                                        <input
                                            type="checkbox"
                                            checked={
                                                brush.pressureEnabled
                                            }
                                            onChange={event => {
                                                setBrushSettings({
                                                    pressureEnabled:
                                                        event.target
                                                            .checked
                                                });
                                            }}
                                            className="h-5 w-5 accent-violet-500"
                                        />
                                    </label>

                                    <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                                        Simulate pressure

                                        <input
                                            type="checkbox"
                                            checked={
                                                brush.simulatePressure
                                            }
                                            onChange={event => {
                                                setBrushSettings({
                                                    simulatePressure:
                                                        event.target
                                                            .checked
                                                });
                                            }}
                                            className="h-5 w-5 accent-violet-500"
                                        />
                                    </label>
                                </div>
                            </PanelSection>
                        )}

                        {activeTool ===
                            EDITOR_TOOLS.ERASER && (
                            <PanelSection title="Eraser">
                                <div className="space-y-5">
                                    <SliderField
                                        label="Size"
                                        value={
                                            eraser.size
                                        }
                                        minimum={
                                            eraser.minimumSize
                                        }
                                        maximum={
                                            eraser.maximumSize
                                        }
                                        suffix="px"
                                        onChange={
                                            setEraserSize
                                        }
                                    />

                                    <div>
                                        <p className="mb-2 text-xs font-medium text-slate-300">
                                            Eraser mode
                                        </p>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEraserMode(
                                                        "stroke"
                                                    );
                                                }}
                                                className={[
                                                    "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                                                    eraser.mode ===
                                                    "stroke"
                                                        ? "border-violet-500 bg-violet-500 text-white"
                                                        : "border-slate-700 bg-slate-900 text-slate-300"
                                                ].join(" ")}
                                            >
                                                Stroke
                                            </button>

                                            <button
                                                type="button"
                                                disabled
                                                title="Partial eraser will be added later"
                                                className="min-h-11 cursor-not-allowed rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-600"
                                            >
                                                Partial
                                            </button>
                                        </div>

                                        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                                            Stroke mode removes the complete vector stroke touched by the eraser.
                                        </p>
                                    </div>
                                </div>
                            </PanelSection>
                        )}

                        {activeTool ===
                            EDITOR_TOOLS.SELECT && (
                            <PanelSection title="Selection">
                                {selectedObjects.length >
                                0 ? (
                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                                            <p className="text-sm font-semibold text-white">
                                                {selectedObjects.length} selected
                                            </p>

                                            <p className="mt-1 text-[10px] text-slate-500">
                                                Drag to move. Use the handles to resize or rotate.
                                            </p>
                                        </div>

                                        {selectedObjects.length ===
                                            1 && (
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="rounded-lg bg-slate-900 p-3">
                                                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                                        X
                                                    </span>

                                                    <strong>
                                                        {Math.round(
                                                            numberOr(
                                                                selectedObjects[0]
                                                                    .x
                                                            )
                                                        )}
                                                    </strong>
                                                </div>

                                                <div className="rounded-lg bg-slate-900 p-3">
                                                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                                        Y
                                                    </span>

                                                    <strong>
                                                        {Math.round(
                                                            numberOr(
                                                                selectedObjects[0]
                                                                    .y
                                                            )
                                                        )}
                                                    </strong>
                                                </div>

                                                <div className="rounded-lg bg-slate-900 p-3">
                                                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                                        Rotation
                                                    </span>

                                                    <strong>
                                                        {Math.round(
                                                            numberOr(
                                                                selectedObjects[0]
                                                                    .rotation
                                                            )
                                                        )}
                                                        °
                                                    </strong>
                                                </div>

                                                <div className="rounded-lg bg-slate-900 p-3">
                                                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                                        Type
                                                    </span>

                                                    <strong className="capitalize">
                                                        {
                                                            selectedObjects[0]
                                                                .type
                                                        }
                                                    </strong>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    duplicateObjects(
                                                        selectedObjectIds
                                                    );
                                                }}
                                                className="min-h-11 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                                            >
                                                Duplicate
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    deleteObjects(
                                                        selectedObjectIds
                                                    );
                                                }}
                                                className="min-h-11 rounded-lg bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-900"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs leading-relaxed text-slate-500">
                                        Click an object or drag a selection rectangle across several objects.
                                    </p>
                                )}
                            </PanelSection>
                        )}

                        <PanelSection title="Colours">
                            <div className="space-y-4">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                                    <label>
                                        <span className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">
                                            Primary
                                        </span>

                                        <input
                                            type="color"
                                            value={
                                                colours.primary
                                            }
                                            onChange={event => {
                                                setPrimaryColor(
                                                    event.target.value
                                                );
                                            }}
                                            className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        onClick={
                                            swapColors
                                        }
                                        title="Swap colours"
                                        className="mb-0.5 h-11 w-11 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                    >
                                        ↔
                                    </button>

                                    <label>
                                        <span className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">
                                            Secondary
                                        </span>

                                        <input
                                            type="color"
                                            value={
                                                colours.secondary
                                            }
                                            onChange={event => {
                                                setSecondaryColor(
                                                    event.target.value
                                                );
                                            }}
                                            className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-8 gap-2">
                                    {DEFAULT_COLOURS.map(
                                        colour => (
                                            <button
                                                key={
                                                    colour
                                                }
                                                type="button"
                                                title={
                                                    colour
                                                }
                                                onClick={() => {
                                                    setPrimaryColor(
                                                        colour
                                                    );
                                                }}
                                                className={[
                                                    "aspect-square min-h-7 rounded-md border-2 transition hover:scale-110",
                                                    colours.primary ===
                                                    colour
                                                        ? "border-violet-400"
                                                        : "border-slate-700"
                                                ].join(" ")}
                                                style={{
                                                    background:
                                                        colour
                                                }}
                                            />
                                        )
                                    )}
                                </div>

                                {colours.recent.length >
                                    0 && (
                                    <div>
                                        <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                                            Recent
                                        </p>

                                        <div className="flex flex-wrap gap-2">
                                            {colours.recent
                                                .slice(
                                                    0,
                                                    12
                                                )
                                                .map(
                                                    colour => (
                                                        <button
                                                            key={
                                                                colour
                                                            }
                                                            type="button"
                                                            onClick={() => {
                                                                setPrimaryColor(
                                                                    colour
                                                                );
                                                            }}
                                                            className="h-8 w-8 rounded-md border border-slate-700"
                                                            style={{
                                                                background:
                                                                    colour
                                                            }}
                                                        />
                                                    )
                                                )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </PanelSection>

                        <PanelSection title="Document">
                            <div className="space-y-4 text-xs">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-lg bg-slate-900 p-3">
                                        <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                            Width
                                        </span>

                                        <strong>
                                            {documentData.width}px
                                        </strong>
                                    </div>

                                    <div className="rounded-lg bg-slate-900 p-3">
                                        <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                                            Height
                                        </span>

                                        <strong>
                                            {documentData.height}px
                                        </strong>
                                    </div>
                                </div>

                                <label className="block">
                                    <span className="mb-2 block text-xs font-medium text-slate-300">
                                        Background
                                    </span>

                                    <input
                                        type="color"
                                        value={
                                            documentData.background
                                        }
                                        onChange={event => {
                                            setDocumentBackground(
                                                event.target.value
                                            );
                                        }}
                                        className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                                    />
                                </label>
                            </div>
                        </PanelSection>
                    </>
                )}
            </div>
        </>
    );

    /*=====================================================
    Render
    =====================================================*/

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,.fashion.json,application/json"
                onChange={
                    handleProjectFileChange
                }
                className="hidden"
            />

            {/* Header */}

            <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-2 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-xs font-black text-white shadow-lg shadow-violet-950/40">
                        FV
                    </div>

                    <div className="hidden shrink-0 lg:block">
                        <p className="text-xs font-bold tracking-wide text-white">
                            FashionVision
                        </p>

                        <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                            2D Studio
                        </p>
                    </div>

                    <div className="hidden h-6 w-px bg-slate-800 lg:block" />

                    <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                        <DocumentNameField
                            documentData={
                                documentData
                            }
                            setDocumentName={
                                setDocumentName
                            }
                        />

                        {persistence.dirty && (
                            <span
                                className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                                title="Unsaved changes"
                            />
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <div className="hidden items-center gap-2 lg:flex">
                        <HeaderButton
                            onClick={
                                handleNewDocument
                            }
                        >
                            New
                        </HeaderButton>

                        <HeaderButton
                            onClick={
                                handleOpenProject
                            }
                        >
                            Open
                        </HeaderButton>

                        <HeaderButton
                            onClick={() =>
                                handleSaveProject()
                            }
                        >
                            Save
                        </HeaderButton>

                        <HeaderButton
                            onClick={
                                handleExportPng
                            }
                            disabled={
                                exporting
                            }
                        >
                            {exporting
                                ? "Exporting…"
                                : "Export PNG"}
                        </HeaderButton>
                    </div>

                    <HeaderButton
                        onClick={undo}
                        disabled={
                            !canUndo
                        }
                        title="Undo"
                        className="w-9 px-0"
                    >
                        ↶
                    </HeaderButton>

                    <HeaderButton
                        onClick={redo}
                        disabled={
                            !canRedo
                        }
                        title="Redo"
                        className="hidden w-9 px-0 sm:inline-flex"
                    >
                        ↷
                    </HeaderButton>

                    <HeaderButton
                        onClick={() => {
                            if (
                                isDesktopPanel
                            ) {
                                setUiState({
                                    rightPanelOpen:
                                        !ui.rightPanelOpen
                                });
                            } else {
                                setPanelDrawerOpen(
                                    true
                                );
                            }
                        }}
                        active={
                            isDesktopPanel
                                ? ui.rightPanelOpen
                                : panelDrawerOpen
                        }
                        title="Layers and properties"
                        className="hidden sm:inline-flex"
                    >
                        Panel
                    </HeaderButton>

                    <HeaderButton
                        onClick={() => {
                            setMobileMenuOpen(
                                value =>
                                    !value
                            );
                        }}
                        active={
                            mobileMenuOpen
                        }
                        title="File menu"
                        className="lg:hidden"
                    >
                        Menu
                    </HeaderButton>
                </div>

                {mobileMenuOpen && (
                    <>
                        <button
                            type="button"
                            aria-label="Close menu"
                            onClick={() => {
                                setMobileMenuOpen(
                                    false
                                );
                            }}
                            className="fixed inset-0 z-30 cursor-default bg-black/20 lg:hidden"
                        />

                        <div className="absolute right-2 top-[calc(100%+6px)] z-40 w-52 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl lg:hidden">
                            <button
                                type="button"
                                onClick={
                                    handleNewDocument
                                }
                                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                            >
                                New project
                            </button>

                            <button
                                type="button"
                                onClick={
                                    handleOpenProject
                                }
                                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                            >
                                Open project
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    handleSaveProject()
                                }
                                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                            >
                                Save project
                            </button>

                            <button
                                type="button"
                                disabled={
                                    exporting
                                }
                                onClick={
                                    handleExportPng
                                }
                                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                            >
                                {exporting
                                    ? "Exporting PNG…"
                                    : "Export PNG"}
                            </button>

                            <div className="my-1 h-px bg-slate-800 sm:hidden" />

                            <button
                                type="button"
                                onClick={() => {
                                    setMobileMenuOpen(
                                        false
                                    );

                                    setPanelDrawerOpen(
                                        true
                                    );
                                }}
                                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800 sm:hidden"
                            >
                                Layers and properties
                            </button>
                        </div>
                    </>
                )}
            </header>

            {/* Tool options */}

            <div className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto overscroll-x-contain border-b border-slate-800 bg-slate-900 px-3 sm:gap-4 sm:px-4">
                <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {activeToolDefinition
                        ?.label ||
                        activeTool}
                </div>

                <div className="h-5 w-px shrink-0 bg-slate-700" />

                {activeTool ===
                    EDITOR_TOOLS.PENCIL && (
                    <>
                        <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
                            Size

                            <input
                                type="range"
                                min="0.25"
                                max="100"
                                step="0.25"
                                value={
                                    brush.size
                                }
                                onChange={event => {
                                    setBrushSettings({
                                        size:
                                            Number(
                                                event.target.value
                                            )
                                    });
                                }}
                                className="w-24 accent-violet-500 sm:w-28"
                            />

                            <span className="min-w-10 font-semibold text-slate-100">
                                {brush.size}px
                            </span>
                        </label>

                        <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 sm:flex">
                            Opacity

                            <input
                                type="range"
                                min="0.01"
                                max="1"
                                step="0.01"
                                value={
                                    brush.opacity
                                }
                                onChange={event => {
                                    setBrushSettings({
                                        opacity:
                                            Number(
                                                event.target.value
                                            )
                                    });
                                }}
                                className="w-24 accent-violet-500"
                            />

                            <span className="min-w-10 font-semibold text-slate-100">
                                {Math.round(
                                    brush.opacity *
                                    100
                                )}
                                %
                            </span>
                        </label>
                    </>
                )}

                {activeTool ===
                    EDITOR_TOOLS.ERASER && (
                    <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
                        Size

                        <input
                            type="range"
                            min={
                                eraser.minimumSize
                            }
                            max={
                                eraser.maximumSize
                            }
                            step="1"
                            value={
                                eraser.size
                            }
                            onChange={event => {
                                setEraserSize(
                                    Number(
                                        event.target.value
                                    )
                                );
                            }}
                            className="w-28 accent-violet-500 sm:w-40"
                        />

                        <span className="min-w-12 font-semibold text-slate-100">
                            {eraser.size}px
                        </span>
                    </label>
                )}

                {activeTool ===
                    EDITOR_TOOLS.SELECT && (
                    <span className="shrink-0 text-xs text-slate-400">
                        {selectedObjectIds.length >
                        0
                            ? `${selectedObjectIds.length} selected`
                            : "Tap or drag to select"}
                    </span>
                )}

                {activeTool ===
                    EDITOR_TOOLS.PAN && (
                    <span className="shrink-0 text-xs text-slate-400">
                        Drag to move canvas
                    </span>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <HeaderButton
                        onClick={
                            toggleGrid
                        }
                        active={
                            ui.showGrid
                        }
                        title="Toggle grid"
                        className="hidden sm:inline-flex"
                    >
                        Grid
                    </HeaderButton>

                    <HeaderButton
                        onClick={() =>
                            zoomOut()
                        }
                        title="Zoom out"
                        className="w-9 px-0"
                    >
                        −
                    </HeaderButton>

                    <span className="min-w-11 text-center text-xs font-semibold text-slate-300">
                        {zoomPercentage}%
                    </span>

                    <HeaderButton
                        onClick={() =>
                            zoomIn()
                        }
                        title="Zoom in"
                        className="w-9 px-0"
                    >
                        +
                    </HeaderButton>

                    <HeaderButton
                        onClick={
                            fitCanvas
                        }
                        title="Fit document"
                    >
                        Fit
                    </HeaderButton>
                </div>
            </div>

            {/* Workspace */}

            <main className="flex min-h-0 flex-1 overflow-hidden">
                {/* Tablet/Desktop toolbar */}

                {ui.leftPanelOpen !==
                    false && (
                    <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950 py-3 md:flex">
                        {TOOL_DEFINITIONS.map(
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
                                        setActiveTool
                                    }
                                />
                            )
                        )}

                        <div className="my-1 h-px w-10 bg-slate-800" />

                        <div className="relative h-12 w-12">
                            <button
                                type="button"
                                title="Primary colour"
                                onClick={() => {
                                    setUiState({
                                        rightPanelTab:
                                            "properties"
                                    });

                                    if (
                                        !isDesktopPanel
                                    ) {
                                        setPanelDrawerOpen(
                                            true
                                        );
                                    }
                                }}
                                className="absolute left-0 top-0 h-8 w-8 rounded-lg border-2 border-slate-600 shadow"
                                style={{
                                    background:
                                        colours.primary
                                }}
                            />

                            <button
                                type="button"
                                title="Secondary colour"
                                onClick={() => {
                                    setUiState({
                                        rightPanelTab:
                                            "properties"
                                    });

                                    if (
                                        !isDesktopPanel
                                    ) {
                                        setPanelDrawerOpen(
                                            true
                                        );
                                    }
                                }}
                                className="absolute bottom-0 right-0 h-8 w-8 rounded-lg border-2 border-slate-600 shadow"
                                style={{
                                    background:
                                        colours.secondary
                                }}
                            />

                            <button
                                type="button"
                                onClick={
                                    swapColors
                                }
                                title="Swap colours"
                                className="absolute bottom-0 left-0 text-[10px] font-bold text-slate-400 hover:text-white"
                            >
                                ↔
                            </button>
                        </div>
                    </aside>
                )}

                {/* Canvas */}

                <section className="relative min-w-0 flex-1 overflow-hidden bg-slate-800">
                    <EditorCanvas
                        ref={stageRef}
                        className="h-full w-full"
                        minimumHeight={0}
                        onPointerPositionChange={
                            setPointerInformation
                        }
                        onSaveRequested={
                            handleSaveProject
                        }
                        onError={error => {
                            console.error(
                                error
                            );

                            setEditorError(
                                error
                            );

                            showToast(
                                "An editor error occurred.",
                                "error"
                            );
                        }}
                    />
                </section>

                {/* Desktop right panel */}

                {isDesktopPanel &&
                    ui.rightPanelOpen !==
                        false && (
                    <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-800 bg-slate-950">
                        {rightPanelContent}
                    </aside>
                )}
            </main>

            {/* Mobile bottom toolbar */}

            <nav className="shrink-0 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] md:hidden">
                <div className="flex h-[68px] items-center gap-2 overflow-x-auto overscroll-x-contain px-2">
                    {TOOL_DEFINITIONS.map(
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
                                    setActiveTool
                                }
                                horizontal
                            />
                        )
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            setPanelDrawerOpen(
                                true
                            );
                        }}
                        className="flex h-14 min-w-[58px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2 text-slate-300"
                    >
                        <span className="text-sm font-black">
                            ☰
                        </span>

                        <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider">
                            Panel
                        </span>
                    </button>
                </div>
            </nav>

            {/* Status bar */}

            <footer className="hidden h-7 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-slate-800 bg-slate-950 px-3 text-[10px] text-slate-500 sm:flex">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="truncate">
                        Tool:{" "}
                        <strong className="text-slate-300">
                            {activeToolDefinition
                                ?.label ||
                                activeTool}
                        </strong>
                    </span>

                    <span>
                        Objects:{" "}
                        <strong className="text-slate-300">
                            {objectCount}
                        </strong>
                    </span>

                    <span className="hidden lg:inline">
                        Layer:{" "}
                        <strong className="text-slate-300">
                            {activeLayer
                                ?.name ||
                                "None"}
                        </strong>
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                    {pointerInformation
                        ?.insideDocument && (
                        <span className="hidden lg:inline">
                            X{" "}
                            {Math.round(
                                pointerInformation
                                    .documentPoint
                                    .x
                            )}{" "}
                            Y{" "}
                            {Math.round(
                                pointerInformation
                                    .documentPoint
                                    .y
                            )}
                        </span>
                    )}

                    <span>
                        {zoomPercentage}%
                    </span>

                    <span
                        className={
                            persistence.dirty
                                ? "text-amber-400"
                                : "text-emerald-400"
                        }
                    >
                        {persistence.dirty
                            ? "Unsaved"
                            : "Saved"}
                    </span>
                </div>
            </footer>

            {/* Tablet/mobile panel drawer */}

            {!isDesktopPanel &&
                panelDrawerOpen && (
                <div className="fixed inset-0 z-50 xl:hidden">
                    <button
                        type="button"
                        aria-label="Close panel"
                        onClick={() => {
                            setPanelDrawerOpen(
                                false
                            );
                        }}
                        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
                    />

                    <aside
                        role="dialog"
                        aria-modal="true"
                        aria-label="Editor layers and properties"
                        className="absolute inset-y-0 right-0 flex w-[min(90vw,380px)] flex-col border-l border-slate-700 bg-slate-950 shadow-2xl"
                    >
                        {rightPanelContent}
                    </aside>
                </div>
            )}

            {/* Toast */}

            {toast && (
                <div
                    className={[
                        "fixed bottom-24 right-3 z-[100] max-w-[calc(100vw-24px)] rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl sm:bottom-10 sm:right-5 sm:max-w-sm",
                        toast.type ===
                        "error"
                            ? "border-red-800 bg-red-950 text-red-200"
                            : "border-emerald-800 bg-emerald-950 text-emerald-200"
                    ].join(" ")}
                >
                    {toast.message}
                </div>
            )}

            {/* Error notification */}

            {editorError && (
                <button
                    type="button"
                    onClick={() => {
                        setEditorError(
                            null
                        );
                    }}
                    className="fixed left-3 right-3 top-20 z-[100] rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-left text-xs text-red-200 shadow-2xl sm:left-1/2 sm:right-auto sm:max-w-lg sm:-translate-x-1/2"
                >
                    <strong className="block">
                        Editor error
                    </strong>

                    <span className="mt-1 block opacity-80">
                        {editorError.message ||
                            String(
                                editorError
                            )}
                    </span>

                    <span className="mt-2 block text-[10px] opacity-60">
                        Tap to dismiss
                    </span>
                </button>
            )}
        </div>
    );
}

/*=========================================================
Export
=========================================================*/

const MemoizedFashionEditor =
    memo(
        FashionEditor
    );

MemoizedFashionEditor.displayName =
    "FashionEditor";

export default MemoizedFashionEditor;