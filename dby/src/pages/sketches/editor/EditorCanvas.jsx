/*
=========================================================
FashionVision Professional Editor
Editor Canvas
Version 1.1
=========================================================
*/

import React, {
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    Group,
    Layer,
    Line,
    Rect,
    Stage
} from "react-konva";

import LayerRenderer from "../layers/LayerRenderer";
import ObjectRenderer from "../objects/ObjectRenderer";
import SelectionTool from "../tools/SelectionTool";
import SelectionTransformer from "./SelectionTransformer";

import {
    createToolManager
} from "../tools/ToolManager";

import PencilTool from "../tools/PencilTool";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_VIEWPORT_WIDTH = 900;
const DEFAULT_VIEWPORT_HEIGHT = 700;

const DEFAULT_WORKSPACE_COLOR = "#d9dde5";
const DEFAULT_GRID_COLOR = "#94a3b8";

const TEMPORARY_LAYER_ID =
    "__fashion-editor-temporary-layer__";

/*=========================================================
Numeric Helpers
=========================================================*/

function numberOr(value, fallback = 0) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? numericValue
        : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.max(
        minimum,
        Math.min(
            maximum,
            numberOr(value, minimum)
        )
    );
}

/*=========================================================
General Helpers
=========================================================*/

function isFunction(value) {
    return typeof value === "function";
}

function assignRef(ref, value) {
    if (!ref) {
        return;
    }

    if (isFunction(ref)) {
        ref(value);
        return;
    }

    ref.current = value;
}

function isEditableElement(target) {
    if (!target) {
        return false;
    }

    const tagName =
        target.tagName?.toLowerCase();

    return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable === true
    );
}

/*=========================================================
Coordinate Conversion
=========================================================*/

export function screenPointToDocumentPoint(
    screenPoint,
    viewport
) {
    if (
        !screenPoint ||
        !Number.isFinite(Number(screenPoint.x)) ||
        !Number.isFinite(Number(screenPoint.y))
    ) {
        return null;
    }

    const zoom = Math.max(
        0.0001,
        numberOr(viewport?.zoom, 1)
    );

    const viewportX =
        numberOr(viewport?.x, 0);

    const viewportY =
        numberOr(viewport?.y, 0);

    return {
        x:
            (
                Number(screenPoint.x) -
                viewportX
            ) / zoom,

        y:
            (
                Number(screenPoint.y) -
                viewportY
            ) / zoom
    };
}

function isPointInsideDocument(
    point,
    document
) {
    if (!point || !document) {
        return false;
    }

    const width =
        Math.max(
            1,
            numberOr(document.width, 1200)
        );

    const height =
        Math.max(
            1,
            numberOr(document.height, 1600)
        );

    return (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= width &&
        point.y <= height
    );
}

/*=========================================================
Responsive Container Size
=========================================================*/

function useContainerSize(containerRef) {
    const [size, setSize] = useState({
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
    });

    useLayoutEffect(() => {
        const container =
            containerRef.current;

        if (!container) {
            return undefined;
        }

        let animationFrameId = null;

        const updateSize = () => {
            const rectangle =
                container.getBoundingClientRect();

            const width = Math.max(
                1,
                Math.floor(rectangle.width)
            );

            const height = Math.max(
                1,
                Math.floor(rectangle.height)
            );

            setSize(previousSize => {
                if (
                    previousSize.width === width &&
                    previousSize.height === height
                ) {
                    return previousSize;
                }

                return {
                    width,
                    height
                };
            });
        };

        const scheduleUpdate = () => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(
                    animationFrameId
                );
            }

            animationFrameId =
                requestAnimationFrame(
                    updateSize
                );
        };

        updateSize();

        if (
            typeof ResizeObserver !==
            "undefined"
        ) {
            const observer =
                new ResizeObserver(
                    scheduleUpdate
                );

            observer.observe(container);

            return () => {
                observer.disconnect();

                if (
                    animationFrameId !==
                    null
                ) {
                    cancelAnimationFrame(
                        animationFrameId
                    );
                }
            };
        }

        window.addEventListener(
            "resize",
            scheduleUpdate
        );

        return () => {
            window.removeEventListener(
                "resize",
                scheduleUpdate
            );

            if (
                animationFrameId !==
                null
            ) {
                cancelAnimationFrame(
                    animationFrameId
                );
            }
        };
    }, [containerRef]);

    return size;
}

/*=========================================================
Document Grid
=========================================================*/

function DocumentGrid({
    width,
    height,
    gridSize,
    zoom,
    color = DEFAULT_GRID_COLOR
}) {
    const lines = useMemo(() => {
        const safeWidth = Math.max(
            1,
            numberOr(width, 1)
        );

        const safeHeight = Math.max(
            1,
            numberOr(height, 1)
        );

        let spacing = Math.max(
            5,
            numberOr(gridSize, 20)
        );

        const estimatedLineCount =
            safeWidth / spacing +
            safeHeight / spacing;

        /*
        Avoid creating thousands of Konva nodes.
        */

        if (estimatedLineCount > 350) {
            spacing *= Math.ceil(
                estimatedLineCount / 350
            );
        }

        const result = [];

        for (
            let x = spacing;
            x < safeWidth;
            x += spacing
        ) {
            result.push({
                id: `grid-vertical-${x}`,
                points: [
                    x,
                    0,
                    x,
                    safeHeight
                ]
            });
        }

        for (
            let y = spacing;
            y < safeHeight;
            y += spacing
        ) {
            result.push({
                id: `grid-horizontal-${y}`,
                points: [
                    0,
                    y,
                    safeWidth,
                    y
                ]
            });
        }

        return result;
    }, [
        width,
        height,
        gridSize
    ]);

    const strokeWidth =
        1 /
        Math.max(
            0.0001,
            numberOr(zoom, 1)
        );

    return (
        <>
            {lines.map(line => (
                <Line
                    key={line.id}
                    points={line.points}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    opacity={0.28}
                    listening={false}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                />
            ))}
        </>
    );
}

/*=========================================================
Editor Canvas
=========================================================*/

function EditorCanvas(
    {
        className = "",
        style = null,

        stageRef:
            externalStageRef = null,

        tools = [],

        autoFit = true,
        wheelZoom = true,
        clipToDocument = true,

        minimumHeight = 640,

        workspaceColor =
            DEFAULT_WORKSPACE_COLOR,

        gridColor =
            DEFAULT_GRID_COLOR,

        onReady = null,

        onPointerPositionChange =
            null,

        onTemporaryObjectChange =
            null,

        onViewportChange =
            null,

        onSaveRequested =
            null,

        onError = null
    },
    forwardedRef
) {
    const containerRef =
        useRef(null);

    const internalStageRef =
        useRef(null);

    const managerRef =
        useRef(null);

    const extraToolIdsRef =
        useRef(new Set());

    const panSessionRef =
        useRef(null);

    const spacePressedRef =
        useRef(false);

    const autoFitSignatureRef =
        useRef(null);

    const onReadyRef =
        useRef(onReady);

    const onPointerPositionChangeRef =
        useRef(
            onPointerPositionChange
        );

    const onTemporaryObjectChangeRef =
        useRef(
            onTemporaryObjectChange
        );

    const onViewportChangeRef =
        useRef(onViewportChange);

    const onSaveRequestedRef =
        useRef(onSaveRequested);

    const onErrorRef =
        useRef(onError);

    const [
        temporaryObject,
        setTemporaryObject
    ] = useState(null);

    const [
        isPanning,
        setIsPanning
    ] = useState(false);

    const [
        isSpacePressed,
        setIsSpacePressed
    ] = useState(false);

    const containerSize =
        useContainerSize(
            containerRef
        );

    /*=====================================================
    Store State
    =====================================================*/

    const document =
        useFashionEditorStore(
            state => state.document
        );

    const viewport =
        useFashionEditorStore(
            state => state.viewport
        );

    const ui =
        useFashionEditorStore(
            state => state.ui
        );

    const activeTool =
        useFashionEditorStore(
            state => state.activeTool
        );

    const activeLayer =
        useFashionEditorStore(
            state =>
                state.layers.find(
                    layer =>
                        layer.id ===
                        state.activeLayerId
                ) || null
        );

    /*=====================================================
    Store Actions
    =====================================================*/

    const setActiveTool =
        useFashionEditorStore(
            state =>
                state.setActiveTool
        );

    const setViewport =
        useFashionEditorStore(
            state =>
                state.setViewport
        );

    const setZoom =
        useFashionEditorStore(
            state =>
                state.setZoom
        );

    const panBy =
        useFashionEditorStore(
            state =>
                state.panBy
        );

    const fitDocumentToViewport =
        useFashionEditorStore(
            state =>
                state
                    .fitDocumentToViewport
        );

    const undo =
        useFashionEditorStore(
            state => state.undo
        );

    const redo =
        useFashionEditorStore(
            state => state.redo
        );

    const deleteObjects =
        useFashionEditorStore(
            state =>
                state.deleteObjects
        );

    const clearSelection =
        useFashionEditorStore(
            state =>
                state.clearSelection
        );

    const selectAllOnActiveLayer =
        useFashionEditorStore(
            state =>
                state
                    .selectAllOnActiveLayer
        );

    const copySelection =
        useFashionEditorStore(
            state =>
                state.copySelection
        );

    const cutSelection =
        useFashionEditorStore(
            state =>
                state.cutSelection
        );

    const pasteClipboard =
        useFashionEditorStore(
            state =>
                state.pasteClipboard
        );

    /*=====================================================
    Keep Callback References Current
    =====================================================*/

    useEffect(() => {
        onReadyRef.current =
            onReady;

        onPointerPositionChangeRef.current =
            onPointerPositionChange;

        onTemporaryObjectChangeRef.current =
            onTemporaryObjectChange;

        onViewportChangeRef.current =
            onViewportChange;

        onSaveRequestedRef.current =
            onSaveRequested;

        onErrorRef.current =
            onError;
    }, [
        onReady,
        onPointerPositionChange,
        onTemporaryObjectChange,
        onViewportChange,
        onSaveRequested,
        onError
    ]);

    /*=====================================================
    Temporary Object
    =====================================================*/

    const updateTemporaryObject =
        useCallback(nextObject => {
            const resolvedObject =
                nextObject || null;

            setTemporaryObject(
                resolvedObject
            );

            onTemporaryObjectChangeRef
                .current
                ?.(
                    resolvedObject
                );
        }, []);

    /*=====================================================
    Tool Manager
    =====================================================*/

    useEffect(() => {
        const manager =
            createToolManager({
                fallbackToolId:
                    EDITOR_TOOLS.PENCIL,

                getContext: () => {
                    const state =
                        useFashionEditorStore
                            .getState();

                    return {
                        state,

                        editorState:
                            state,

                        actions:
                            state,

                        store:
                            useFashionEditorStore,

                        document:
                            state.document,

                        viewport:
                            state.viewport,

                        activeLayerId:
                            state.activeLayerId,

                        brush:
                            state.brush,

                        stage:
                            internalStageRef
                                .current,

                        stageRef:
                            internalStageRef,

                        setTemporaryObject:
                            updateTemporaryObject,

                        toDocumentPoint:
                            screenPoint =>
                                screenPointToDocumentPoint(
                                    screenPoint,
                                    useFashionEditorStore
                                        .getState()
                                        .viewport
                                ),

                        requestRender: () => {
                            internalStageRef
                                .current
                                ?.batchDraw
                                ?.();
                        }
                    };
                },

                onError: (
                    error,
                    details
                ) => {
                    if (
                        isFunction(
                            onErrorRef.current
                        )
                    ) {
                        onErrorRef.current(
                            error,
                            details
                        );

                        return;
                    }

                    console.error(
                        "Fashion editor tool error:",
                        error,
                        details
                    );
                }
            });

      manager.register(
    PencilTool
);

manager.register(
    SelectionTool
);

        managerRef.current =
            manager;

        const currentTool =
            useFashionEditorStore
                .getState()
                .activeTool;

        if (
            manager.hasTool(
                currentTool
            )
        ) {
            manager.activate(
                currentTool
            );
        } else {
            manager.deactivate();
        }

        if (
            internalStageRef.current
        ) {
            onReadyRef.current?.({
                stage:
                    internalStageRef.current,

                manager,

                container:
                    containerRef.current
            });
        }

        return () => {
            manager.destroy();

            if (
                managerRef.current ===
                manager
            ) {
                managerRef.current =
                    null;
            }
        };
    }, [
        updateTemporaryObject
    ]);

    /*=====================================================
    Register Additional Tools
    =====================================================*/

    useEffect(() => {
        const manager =
            managerRef.current;

        if (!manager) {
            return;
        }

        const nextToolIds =
            new Set();

        if (Array.isArray(tools)) {
            tools.forEach(tool => {
               if (
    !tool?.id ||
    tool.id === PencilTool.id ||
    tool.id === SelectionTool.id
) {
    return;
}

                manager.register(
                    tool,
                    {
                        replace: true
                    }
                );

                nextToolIds.add(
                    tool.id
                );
            });
        }

        extraToolIdsRef.current.forEach(
            toolId => {
                if (
                    !nextToolIds.has(
                        toolId
                    ) &&
                    manager.hasTool(
                        toolId
                    )
                ) {
                    manager.unregister(
                        toolId
                    );
                }
            }
        );

        extraToolIdsRef.current =
            nextToolIds;

        const currentTool =
            useFashionEditorStore
                .getState()
                .activeTool;

        if (
            manager.hasTool(
                currentTool
            )
        ) {
            manager.activate(
                currentTool
            );
        }
    }, [tools]);

    /*=====================================================
    Synchronize Active Tool
    =====================================================*/

    useEffect(() => {
        const manager =
            managerRef.current;

        if (!manager) {
            return;
        }

        if (
            manager.hasTool(
                activeTool
            )
        ) {
            manager.activate(
                activeTool
            );
        } else {
            /*
            Select and pan are currently managed directly
            by the canvas and rendered objects.
            */

            manager.deactivate();
        }

        updateTemporaryObject(
            null
        );
    }, [
        activeTool,
        updateTemporaryObject
    ]);

    /*=====================================================
    Stage Reference
    =====================================================*/

    const setStageNode =
        useCallback(
            node => {
                internalStageRef.current =
                    node;

                assignRef(
                    forwardedRef,
                    node
                );

                assignRef(
                    externalStageRef,
                    node
                );

                if (node) {
                    onReadyRef.current?.({
                        stage: node,

                        manager:
                            managerRef.current,

                        container:
                            containerRef.current
                    });
                }
            },
            [
                forwardedRef,
                externalStageRef
            ]
        );

    /*=====================================================
    Automatic Document Fit
    =====================================================*/

    useEffect(() => {
        if (
            !autoFit ||
            containerSize.width <= 1 ||
            containerSize.height <= 1
        ) {
            return;
        }

        const signature = [
            document.id,
            document.width,
            document.height
        ].join(":");

        if (
            autoFitSignatureRef
                .current ===
            signature
        ) {
            return;
        }

        autoFitSignatureRef.current =
            signature;

        fitDocumentToViewport(
            containerSize.width,
            containerSize.height,
            56
        );
    }, [
        autoFit,
        containerSize.width,
        containerSize.height,
        document.id,
        document.width,
        document.height,
        fitDocumentToViewport
    ]);

    /*=====================================================
    Viewport Callback
    =====================================================*/

    useEffect(() => {
        onViewportChangeRef
            .current
            ?.(
                viewport
            );
    }, [viewport]);

    /*=====================================================
    Pointer Information
    =====================================================*/

    const getPointerInformation =
        useCallback(() => {
            const stage =
                internalStageRef.current;

            const screenPoint =
                stage
                    ?.getPointerPosition
                    ?.();

            if (!screenPoint) {
                return null;
            }

            const state =
                useFashionEditorStore
                    .getState();

            const documentPoint =
                screenPointToDocumentPoint(
                    screenPoint,
                    state.viewport
                );

            return {
                screenPoint,

                documentPoint,

                insideDocument:
                    isPointInsideDocument(
                        documentPoint,
                        state.document
                    )
            };
        }, []);

    const publishPointerPosition =
        useCallback(() => {
            const information =
                getPointerInformation();

            if (information) {
                onPointerPositionChangeRef
                    .current
                    ?.(
                        information
                    );
            }

            return information;
        }, [
            getPointerInformation
        ]);

    /*=====================================================
    Focus
    =====================================================*/

    const focusCanvas =
        useCallback(() => {
            const container =
                containerRef.current;

            if (!container) {
                return;
            }

            try {
                container.focus({
                    preventScroll: true
                });
            } catch {
                container.focus();
            }
        }, []);

    const canvasHasKeyboardFocus =
        useCallback(() => {
            const container =
                containerRef.current;

            if (
                !container ||
                typeof globalThis.document ===
                "undefined"
            ) {
                return false;
            }

            const activeElement =
                globalThis.document
                    .activeElement;

            return (
                activeElement ===
                    container ||
                container.contains(
                    activeElement
                )
            );
        }, []);

    /*=====================================================
    Pan Handling
    =====================================================*/

    const shouldStartPan =
        useCallback(nativeEvent => {
            const currentTool =
                useFashionEditorStore
                    .getState()
                    .activeTool;

            return Boolean(
                currentTool ===
                    EDITOR_TOOLS.PAN ||
                spacePressedRef.current ||
                nativeEvent?.button === 1
            );
        }, []);

    const startPan =
        useCallback(
            event => {
                const nativeEvent =
                    event?.evt ||
                    event;

                if (
                    !shouldStartPan(
                        nativeEvent
                    )
                ) {
                    return false;
                }

                nativeEvent
                    ?.preventDefault
                    ?.();

                if (
                    managerRef.current
                        ?.isInteracting()
                ) {
                    managerRef.current
                        .cancelInteraction(
                            "pan-started"
                        );
                }

                updateTemporaryObject(
                    null
                );

                const state =
                    useFashionEditorStore
                        .getState();

                const pointerId =
                    Number.isFinite(
                        Number(
                            nativeEvent
                                ?.pointerId
                        )
                    )
                        ? Number(
                            nativeEvent
                                .pointerId
                        )
                        : null;

                const stagePoint =
                    internalStageRef
                        .current
                        ?.getPointerPosition
                        ?.();

                panSessionRef.current = {
                    pointerId,

                    startClientX:
                        numberOr(
                            nativeEvent
                                ?.clientX,
                            stagePoint?.x
                        ),

                    startClientY:
                        numberOr(
                            nativeEvent
                                ?.clientY,
                            stagePoint?.y
                        ),

                    startViewportX:
                        state.viewport.x,

                    startViewportY:
                        state.viewport.y
                };

                try {
                    if (
                        pointerId !==
                        null
                    ) {
                        nativeEvent
                            ?.target
                            ?.setPointerCapture
                            ?.(pointerId);
                    }
                } catch {
                    // Pointer capture is optional.
                }

                setIsPanning(true);

                return true;
            },
            [
                shouldStartPan,
                updateTemporaryObject
            ]
        );

    const updatePan =
        useCallback(
            event => {
                const panSession =
                    panSessionRef.current;

                if (!panSession) {
                    return false;
                }

                const nativeEvent =
                    event?.evt ||
                    event;

                const stagePoint =
                    internalStageRef
                        .current
                        ?.getPointerPosition
                        ?.();

                const currentX =
                    numberOr(
                        nativeEvent
                            ?.clientX,
                        stagePoint?.x
                    );

                const currentY =
                    numberOr(
                        nativeEvent
                            ?.clientY,
                        stagePoint?.y
                    );

                setViewport({
                    x:
                        panSession
                            .startViewportX +
                        (
                            currentX -
                            panSession
                                .startClientX
                        ),

                    y:
                        panSession
                            .startViewportY +
                        (
                            currentY -
                            panSession
                                .startClientY
                        )
                });

                return true;
            },
            [setViewport]
        );

    const endPan =
        useCallback(event => {
            const panSession =
                panSessionRef.current;

            if (!panSession) {
                return false;
            }

            const nativeEvent =
                event?.evt ||
                event;

            try {
                if (
                    panSession.pointerId !==
                    null
                ) {
                    nativeEvent
                        ?.target
                        ?.releasePointerCapture
                        ?.(
                            panSession
                                .pointerId
                        );
                }
            } catch {
                // Pointer release is optional.
            }

            panSessionRef.current =
                null;

            setIsPanning(false);

            return true;
        }, []);

    /*=====================================================
    Stage Pointer Events
    =====================================================*/

    const handlePointerDown =
        useCallback(
            event => {
                focusCanvas();

                publishPointerPosition();

                if (startPan(event)) {
                    return;
                }

                managerRef.current
                    ?.handlePointerDown(
                        event
                    );
            },
            [
                focusCanvas,
                publishPointerPosition,
                startPan
            ]
        );

    const handlePointerMove =
        useCallback(
            event => {
                publishPointerPosition();

                if (updatePan(event)) {
                    return;
                }

                managerRef.current
                    ?.handlePointerMove(
                        event
                    );
            },
            [
                publishPointerPosition,
                updatePan
            ]
        );

    const handlePointerUp =
        useCallback(
            event => {
                publishPointerPosition();

                if (endPan(event)) {
                    return;
                }

                managerRef.current
                    ?.handlePointerUp(
                        event
                    );
            },
            [
                publishPointerPosition,
                endPan
            ]
        );

    const handlePointerCancel =
        useCallback(
            event => {
                if (endPan(event)) {
                    return;
                }

                managerRef.current
                    ?.handlePointerCancel(
                        event
                    );
            },
            [endPan]
        );

    const handlePointerEnter =
        useCallback(
            event => {
                publishPointerPosition();

                managerRef.current
                    ?.handlePointerEnter(
                        event
                    );
            },
            [publishPointerPosition]
        );

    const handlePointerLeave =
        useCallback(event => {
            managerRef.current
                ?.handlePointerLeave(
                    event
                );
        }, []);

    /*=====================================================
    Empty Canvas Selection
    =====================================================*/

    const handleStageClick =
        useCallback(
            event => {
                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    state.activeTool !==
                    EDITOR_TOOLS.SELECT
                ) {
                    return;
                }

                const stage =
                    internalStageRef.current;

                if (
                    event.target === stage
                ) {
                    clearSelection();
                }
            },
            [clearSelection]
        );

    /*=====================================================
    Wheel Zoom and Pan
    =====================================================*/

    const handleWheel =
        useCallback(
            event => {
                const nativeEvent =
                    event.evt;

                nativeEvent
                    ?.preventDefault
                    ?.();

                const managerResult =
                    managerRef.current
                        ?.handleWheel(
                            event
                        );

                if (
                    managerResult === true
                ) {
                    return;
                }

                const stage =
                    internalStageRef.current;

                const anchor =
                    stage
                        ?.getPointerPosition
                        ?.();

                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    nativeEvent?.shiftKey
                ) {
                    panBy(
                        -numberOr(
                            nativeEvent
                                ?.deltaY,
                            0
                        ),
                        0
                    );

                    return;
                }

                if (!wheelZoom) {
                    panBy(
                        -numberOr(
                            nativeEvent
                                ?.deltaX,
                            0
                        ),

                        -numberOr(
                            nativeEvent
                                ?.deltaY,
                            0
                        )
                    );

                    return;
                }

                const deltaY = clamp(
                    numberOr(
                        nativeEvent
                            ?.deltaY,
                        0
                    ),
                    -240,
                    240
                );

                const zoomFactor =
                    Math.exp(
                        -deltaY * 0.0018
                    );

                setZoom(
                    state.viewport.zoom *
                        zoomFactor,
                    anchor
                );
            },
            [
                wheelZoom,
                panBy,
                setZoom
            ]
        );

    /*=====================================================
    Other Stage Events
    =====================================================*/

    const handleDoubleClick =
        useCallback(event => {
            managerRef.current
                ?.handleDoubleClick(
                    event
                );
        }, []);

    const handleContextMenu =
        useCallback(event => {
            event.evt
                ?.preventDefault
                ?.();

            managerRef.current
                ?.handleContextMenu(
                    event
                );
        }, []);

    /*=====================================================
    Keyboard Shortcuts
    =====================================================*/

    useEffect(() => {
        const handleKeyDown = event => {
            if (
                isEditableElement(
                    event.target
                )
            ) {
                return;
            }

            if (
                !canvasHasKeyboardFocus()
            ) {
                return;
            }

            const key =
                event.key.toLowerCase();

            const commandKey =
                event.ctrlKey ||
                event.metaKey;

            if (
                event.code === "Space"
            ) {
                event.preventDefault();

                if (
                    !spacePressedRef.current
                ) {
                    spacePressedRef.current =
                        true;

                    setIsSpacePressed(
                        true
                    );
                }

                return;
            }

            if (
                commandKey &&
                key === "z"
            ) {
                event.preventDefault();

                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }

                return;
            }

            if (
                commandKey &&
                key === "y"
            ) {
                event.preventDefault();

                redo();

                return;
            }

            if (
                commandKey &&
                key === "a"
            ) {
                event.preventDefault();

                selectAllOnActiveLayer();

                return;
            }

            if (
                commandKey &&
                key === "c"
            ) {
                event.preventDefault();

                copySelection();

                return;
            }

            if (
                commandKey &&
                key === "x"
            ) {
                event.preventDefault();

                cutSelection();

                return;
            }

            if (
                commandKey &&
                key === "v"
            ) {
                event.preventDefault();

                pasteClipboard();

                return;
            }

            if (
                commandKey &&
                key === "s"
            ) {
                event.preventDefault();

                onSaveRequestedRef
                    .current
                    ?.(
                        useFashionEditorStore
                            .getState()
                            .getProjectData()
                    );

                return;
            }

            if (
                key === "delete" ||
                key === "backspace"
            ) {
                event.preventDefault();

                deleteObjects();

                return;
            }

            if (key === "escape") {
                event.preventDefault();

                if (
                    managerRef.current
                        ?.isInteracting()
                ) {
                    managerRef.current
                        .cancelInteraction(
                            "escape-key"
                        );

                    updateTemporaryObject(
                        null
                    );
                } else {
                    clearSelection();
                }

                return;
            }

            if (
                key === "p" &&
                !commandKey
            ) {
                event.preventDefault();

                setActiveTool(
                    EDITOR_TOOLS.PENCIL
                );

                return;
            }

            if (
                key === "v" &&
                !commandKey
            ) {
                event.preventDefault();

                setActiveTool(
                    EDITOR_TOOLS.SELECT
                );

                return;
            }

            if (
                key === "h" &&
                !commandKey
            ) {
                event.preventDefault();

                setActiveTool(
                    EDITOR_TOOLS.PAN
                );

                return;
            }

            if (
                key === "+" ||
                key === "="
            ) {
                event.preventDefault();

                const state =
                    useFashionEditorStore
                        .getState();

                setZoom(
                    state.viewport.zoom *
                        1.15
                );

                return;
            }

            if (
                key === "-" ||
                key === "_"
            ) {
                event.preventDefault();

                const state =
                    useFashionEditorStore
                        .getState();

                setZoom(
                    state.viewport.zoom /
                        1.15
                );

                return;
            }

            if (key === "0") {
                event.preventDefault();

                fitDocumentToViewport(
                    containerSize.width,
                    containerSize.height,
                    56
                );

                return;
            }

            managerRef.current
                ?.handleKeyDown(
                    event
                );
        };

        const handleKeyUp = event => {
            if (
                event.code === "Space"
            ) {
                spacePressedRef.current =
                    false;

                setIsSpacePressed(false);
            }

            managerRef.current
                ?.handleKeyUp(
                    event
                );
        };

        const handleWindowBlur = () => {
            spacePressedRef.current =
                false;

            setIsSpacePressed(false);

            panSessionRef.current =
                null;

            setIsPanning(false);

            if (
                managerRef.current
                    ?.isInteracting()
            ) {
                managerRef.current
                    .cancelInteraction(
                        "window-blurred"
                    );
            }

            updateTemporaryObject(
                null
            );
        };

        window.addEventListener(
            "keydown",
            handleKeyDown
        );

        window.addEventListener(
            "keyup",
            handleKeyUp
        );

        window.addEventListener(
            "blur",
            handleWindowBlur
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown
            );

            window.removeEventListener(
                "keyup",
                handleKeyUp
            );

            window.removeEventListener(
                "blur",
                handleWindowBlur
            );
        };
    }, [
        undo,
        redo,
        deleteObjects,
        clearSelection,
        selectAllOnActiveLayer,
        copySelection,
        cutSelection,
        pasteClipboard,
        setActiveTool,
        setZoom,
        fitDocumentToViewport,
        containerSize.width,
        containerSize.height,
        canvasHasKeyboardFocus,
        updateTemporaryObject
    ]);

    /*=====================================================
    Temporary Layer
    =====================================================*/

    const temporaryLayer =
        useMemo(
            () => ({
                id:
                    TEMPORARY_LAYER_ID,

                name:
                    "Temporary Drawing",

                visible:
                    true,

                locked:
                    true,

                opacity:
                    activeLayer
                        ?.opacity ?? 1,

                blendMode:
                    activeLayer
                        ?.blendMode ||
                    "source-over",

                objectIds:
                    temporaryObject
                        ? [
                            temporaryObject.id
                        ]
                        : []
            }),
            [
                activeLayer,
                temporaryObject
            ]
        );

    /*=====================================================
    Cursor
    =====================================================*/

    const cursor = useMemo(() => {
        if (isPanning) {
            return "grabbing";
        }

        if (
            activeTool ===
                EDITOR_TOOLS.PAN ||
            isSpacePressed
        ) {
            return "grab";
        }

        const managerCursor =
            managerRef.current
                ?.getCursor
                ?.();

        if (
            managerCursor &&
            managerCursor !== "default"
        ) {
            return managerCursor;
        }

        if (
            activeTool ===
            EDITOR_TOOLS.SELECT
        ) {
            return "default";
        }

        return (
            ui.canvasCursor ||
            "crosshair"
        );
    }, [
        isPanning,
        activeTool,
        isSpacePressed,
        ui.canvasCursor
    ]);

    /*=====================================================
    Document Geometry
    =====================================================*/

    const documentWidth =
        Math.max(
            1,
            numberOr(
                document.width,
                1200
            )
        );

    const documentHeight =
        Math.max(
            1,
            numberOr(
                document.height,
                1600
            )
        );

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                viewport.zoom,
                1
            )
        );

    const viewportX =
        numberOr(
            viewport.x,
            0
        );

    const viewportY =
        numberOr(
            viewport.y,
            0
        );

    const borderWidth =
        1 / zoom;

    const shadowBlur =
        24 / zoom;

    const shadowOffsetY =
        8 / zoom;

    /*=====================================================
    Render
    =====================================================*/

    return (
        <div
            ref={containerRef}
            className={[
                "relative h-full w-full overflow-hidden outline-none",
                className
            ]
                .filter(Boolean)
                .join(" ")}
            style={{
                minHeight:
                    minimumHeight,

                background:
                    workspaceColor,

                touchAction:
                    "none",

                cursor,

                ...style
            }}
            tabIndex={0}
            role="application"
            aria-label="Fashion design drawing canvas"
        >
            <Stage
                ref={setStageNode}
                width={containerSize.width}
                height={containerSize.height}
                onPointerDown={
                    handlePointerDown
                }
                onPointerMove={
                    handlePointerMove
                }
                onPointerUp={
                    handlePointerUp
                }
                onPointerCancel={
                    handlePointerCancel
                }
                onPointerEnter={
                    handlePointerEnter
                }
                onPointerLeave={
                    handlePointerLeave
                }
                onClick={
                    handleStageClick
                }
                onTap={
                    handleStageClick
                }
                onWheel={
                    handleWheel
                }
                onDblClick={
                    handleDoubleClick
                }
                onDblTap={
                    handleDoubleClick
                }
                onContextMenu={
                    handleContextMenu
                }
            >
                {/* Document background */}

                <Layer
                    name="fashion-editor-background-layer"
                    listening={false}
                >
                    <Group
                        x={viewportX}
                        y={viewportY}
                        scaleX={zoom}
                        scaleY={zoom}
                    >
                        <Rect
                            x={0}
                            y={0}
                            width={
                                documentWidth
                            }
                            height={
                                documentHeight
                            }
                            fill={
                                document.background ||
                                "#ffffff"
                            }
                            shadowColor="#0f172a"
                            shadowOpacity={0.22}
                            shadowBlur={
                                shadowBlur
                            }
                            shadowOffsetX={0}
                            shadowOffsetY={
                                shadowOffsetY
                            }
                            listening={false}
                            perfectDrawEnabled={
                                false
                            }
                        />

                        {ui.showGrid && (
                            <DocumentGrid
                                width={
                                    documentWidth
                                }
                                height={
                                    documentHeight
                                }
                                gridSize={
                                    ui.gridSize
                                }
                                zoom={zoom}
                                color={
                                    gridColor
                                }
                            />
                        )}

                        <Rect
                            x={0}
                            y={0}
                            width={
                                documentWidth
                            }
                            height={
                                documentHeight
                            }
                            stroke="#94a3b8"
                            strokeWidth={
                                borderWidth
                            }
                            listening={false}
                            perfectDrawEnabled={
                                false
                            }
                        />
                    </Group>
                </Layer>

                {/* Artwork */}

              <Layer name="fashion-editor-artwork-layer">
    <Group
        x={viewportX}
        y={viewportY}
        scaleX={zoom}
        scaleY={zoom}
    >
        <LayerRenderer
            document={document}
            clipToDocument={clipToDocument}
            listening={!isPanning}
        />

        <SelectionTransformer
            stageRef={internalStageRef}
            enabled={!isPanning}
            resizeEnabled
            rotateEnabled
            keepRatio={false}
            flipEnabled={false}
        />
    </Group>
</Layer>

                {/* Temporary drawing preview */}

                <Layer
                    name="fashion-editor-interaction-layer"
                    listening={false}
                >
                    <Group
                        x={viewportX}
                        y={viewportY}
                        scaleX={zoom}
                        scaleY={zoom}
                        clipX={
                            clipToDocument
                                ? 0
                                : undefined
                        }
                        clipY={
                            clipToDocument
                                ? 0
                                : undefined
                        }
                        clipWidth={
                            clipToDocument
                                ? documentWidth
                                : undefined
                        }
                        clipHeight={
                            clipToDocument
                                ? documentHeight
                                : undefined
                        }
                    >
                        {temporaryObject && (
                            <ObjectRenderer
                                object={
                                    temporaryObject
                                }
                                layer={
                                    temporaryLayer
                                }
                                listening={
                                    false
                                }
                                transient
                            />
                        )}
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
}

/*=========================================================
Export
=========================================================*/

const ForwardedEditorCanvas =
    forwardRef(EditorCanvas);

ForwardedEditorCanvas.displayName =
    "EditorCanvas";

export default memo(
    ForwardedEditorCanvas
);