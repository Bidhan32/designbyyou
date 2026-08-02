/*
=========================================================
FashionVision Professional Editor
Responsive Editor Canvas
Version 1.3.1
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

import PencilTool from "../tools/PencilTool";
import SelectionTool from "../tools/SelectionTool";
import EraserTool from "../tools/EraserTool";

import SelectionTransformer from "./SelectionTransformer";

import {
    createToolManager
} from "../tools/ToolManager";

import {
    EDITOR_TOOLS,
    MAX_ZOOM,
    MIN_ZOOM,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_VIEWPORT_WIDTH = 900;
const DEFAULT_VIEWPORT_HEIGHT = 700;

const DEFAULT_WORKSPACE_COLOR =
    "#d9dde5";

const DEFAULT_GRID_COLOR =
    "#94a3b8";

const TEMPORARY_LAYER_ID =
    "__fashion-editor-temporary-layer__";

const RESIZE_FIT_DELAY = 60;

/*=========================================================
Numeric Helpers
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

/*=========================================================
General Helpers
=========================================================*/

function isFunction(value) {
    return (
        typeof value ===
        "function"
    );
}

function assignRef(
    ref,
    value
) {
    if (!ref) {
        return;
    }

    if (isFunction(ref)) {
        ref(value);
        return;
    }

    ref.current =
        value;
}

function isEditableElement(
    target
) {
    if (!target) {
        return false;
    }

    const tagName =
        target.tagName
            ?.toLowerCase();

    return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable ===
            true
    );
}

function getNativeEvent(event) {
    return (
        event?.evt ||
        event?.nativeEvent ||
        event ||
        null
    );
}

function safelyPreventDefault(event) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        !nativeEvent ||
        typeof nativeEvent.preventDefault !==
            "function" ||
        nativeEvent.cancelable ===
            false ||
        nativeEvent.defaultPrevented ===
            true
    ) {
        return false;
    }

    nativeEvent.preventDefault();

    return true;
}

/*
ToolManager currently attempts to call preventDefault()
for every handled input event. Browsers can deliver a
touchend event with cancelable=false. Passing that event
unchanged causes an intervention warning.

This wrapper preserves the original Konva event and native
event properties, but turns preventDefault into a safe no-op
only when the browser says the event cannot be cancelled.
*/
function createManagerSafeEvent(event) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        !event ||
        !nativeEvent ||
        nativeEvent.cancelable !==
            false ||
        typeof Proxy ===
            "undefined"
    ) {
        return event;
    }

    try {
        const safeNativeEvent =
            new Proxy(
                nativeEvent,
                {
                    get(
                        target,
                        property
                    ) {
                        if (
                            property ===
                            "preventDefault"
                        ) {
                            return () =>
                                false;
                        }

                        const value =
                            Reflect.get(
                                target,
                                property,
                                target
                            );

                        return typeof value ===
                            "function"
                            ? value.bind(
                                target
                            )
                            : value;
                    }
                }
            );

        return new Proxy(
            event,
            {
                get(
                    target,
                    property
                ) {
                    if (
                        property ===
                        "evt" ||
                        property ===
                        "nativeEvent"
                    ) {
                        return safeNativeEvent;
                    }

                    const value =
                        Reflect.get(
                            target,
                            property,
                            target
                        );

                    return typeof value ===
                        "function"
                        ? value.bind(
                            target
                        )
                        : value;
                },

                set(
                    target,
                    property,
                    value
                ) {
                    return Reflect.set(
                        target,
                        property,
                        value,
                        target
                    );
                }
            }
        );
    } catch {
        return event;
    }
}

function isTouchEvent(
    nativeEvent
) {
    const eventType =
        typeof nativeEvent?.type ===
            "string"
            ? nativeEvent.type
                .toLowerCase()
            : "";

    return Boolean(
        nativeEvent?.pointerType ===
            "touch" ||
        eventType.startsWith(
            "touch"
        ) ||
        nativeEvent?.touches ||
        nativeEvent
            ?.changedTouches
    );
}

function getPointerId(
    nativeEvent
) {
    const directPointerId =
        Number(
            nativeEvent?.pointerId
        );

    if (
        Number.isFinite(
            directPointerId
        )
    ) {
        return directPointerId;
    }

    const touch =
        nativeEvent
            ?.changedTouches?.[0] ||
        nativeEvent
            ?.touches?.[0] ||
        null;

    const touchIdentifier =
        Number(
            touch?.identifier
        );

    return Number.isFinite(
        touchIdentifier
    )
        ? touchIdentifier
        : null;
}

function isFinitePoint(point) {
    return Boolean(
        point &&
        Number.isFinite(
            Number(point.x)
        ) &&
        Number.isFinite(
            Number(point.y)
        )
    );
}

function clonePoint(point) {
    if (!isFinitePoint(point)) {
        return null;
    }

    return {
        x:
            Number(point.x),

        y:
            Number(point.y)
    };
}

function distanceBetweenPoints(
    firstPoint,
    secondPoint
) {
    if (
        !isFinitePoint(firstPoint) ||
        !isFinitePoint(secondPoint)
    ) {
        return 0;
    }

    return Math.hypot(
        secondPoint.x -
            firstPoint.x,

        secondPoint.y -
            firstPoint.y
    );
}

function midpoint(
    firstPoint,
    secondPoint
) {
    if (
        !isFinitePoint(firstPoint) ||
        !isFinitePoint(secondPoint)
    ) {
        return null;
    }

    return {
        x:
            (
                firstPoint.x +
                secondPoint.x
            ) / 2,

        y:
            (
                firstPoint.y +
                secondPoint.y
            ) / 2
    };
}

function getResponsiveFitPadding(
    width,
    height
) {
    const safeWidth =
        Math.max(
            1,
            numberOr(width, 1)
        );

    const safeHeight =
        Math.max(
            1,
            numberOr(height, 1)
        );

    if (
        safeWidth < 480 ||
        safeHeight < 420
    ) {
        return 18;
    }

    if (safeWidth < 768) {
        return 28;
    }

    if (safeWidth < 1100) {
        return 40;
    }

    return 56;
}

/*=========================================================
Coordinate Conversion
=========================================================*/

export function screenPointToDocumentPoint(
    screenPoint,
    viewport
) {
    if (
        !isFinitePoint(
            screenPoint
        )
    ) {
        return null;
    }

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                viewport?.zoom,
                1
            )
        );

    const viewportX =
        numberOr(
            viewport?.x,
            0
        );

    const viewportY =
        numberOr(
            viewport?.y,
            0
        );

    return {
        x:
            (
                Number(
                    screenPoint.x
                ) -
                viewportX
            ) / zoom,

        y:
            (
                Number(
                    screenPoint.y
                ) -
                viewportY
            ) / zoom
    };
}

function isPointInsideDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(point) ||
        !documentData
    ) {
        return false;
    }

    const width =
        Math.max(
            1,
            numberOr(
                documentData.width,
                1200
            )
        );

    const height =
        Math.max(
            1,
            numberOr(
                documentData.height,
                1600
            )
        );

    return (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= width &&
        point.y <= height
    );
}

/*=========================================================
Pointer Coordinates
=========================================================*/

function getLocalEventPoint(
    event,
    container,
    stage
) {
    const nativeEvent =
        getNativeEvent(event);

    const touch =
        nativeEvent
            ?.changedTouches?.[0] ||
        nativeEvent
            ?.touches?.[0] ||
        null;

    const clientX =
        Number(
            nativeEvent?.clientX ??
            touch?.clientX
        );

    const clientY =
        Number(
            nativeEvent?.clientY ??
            touch?.clientY
        );

    if (
        container &&
        Number.isFinite(clientX) &&
        Number.isFinite(clientY)
    ) {
        const rectangle =
            container
                .getBoundingClientRect();

        return {
            x:
                clientX -
                rectangle.left,

            y:
                clientY -
                rectangle.top
        };
    }

    return clonePoint(
        stage
            ?.getPointerPosition
            ?.()
    );
}

function getLocalTouchPoints(
    nativeEvent,
    container
) {
    if (
        !nativeEvent ||
        !container
    ) {
        return [];
    }

    const rectangle =
        container
            .getBoundingClientRect();

    const touches =
        nativeEvent.touches
            ? Array.from(
                nativeEvent.touches
            )
            : [];

    return touches
        .map(touch => {
            const identifier =
                Number(
                    touch.identifier
                );

            const clientX =
                Number(
                    touch.clientX
                );

            const clientY =
                Number(
                    touch.clientY
                );

            if (
                !Number.isFinite(
                    identifier
                ) ||
                !Number.isFinite(
                    clientX
                ) ||
                !Number.isFinite(
                    clientY
                )
            ) {
                return null;
            }

            return [
                identifier,

                {
                    x:
                        clientX -
                        rectangle.left,

                    y:
                        clientY -
                        rectangle.top
                }
            ];
        })
        .filter(Boolean);
}

function applyStageTouchStyles(
    stage
) {
    const stageContainer =
        stage
            ?.container
            ?.();

    if (!stageContainer) {
        return;
    }

    stageContainer.style.touchAction =
        "none";

    stageContainer.style.overscrollBehavior =
        "none";

    stageContainer.style.userSelect =
        "none";

    stageContainer.style.webkitUserSelect =
        "none";

    stageContainer
        .querySelectorAll("canvas")
        .forEach(canvas => {
            canvas.style.touchAction =
                "none";

            canvas.style.overscrollBehavior =
                "none";
        });
}

/*=========================================================
Responsive Container Size
=========================================================*/

function useContainerSize(
    containerRef
) {
    const [
        size,
        setSize
    ] = useState({
        width:
            DEFAULT_VIEWPORT_WIDTH,

        height:
            DEFAULT_VIEWPORT_HEIGHT
    });

    useLayoutEffect(() => {
        const container =
            containerRef.current;

        if (!container) {
            return undefined;
        }

        let animationFrameId =
            null;

        const updateSize = () => {
            const rectangle =
                container
                    .getBoundingClientRect();

            const width =
                Math.max(
                    1,
                    Math.round(
                        rectangle.width
                    )
                );

            const height =
                Math.max(
                    1,
                    Math.round(
                        rectangle.height
                    )
                );

            setSize(previousSize => {
                if (
                    previousSize.width ===
                        width &&
                    previousSize.height ===
                        height
                ) {
                    return previousSize;
                }

                return {
                    width,
                    height
                };
            });
        };

        const scheduleUpdate =
            () => {
                if (
                    animationFrameId !==
                    null
                ) {
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

            observer.observe(
                container
            );

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

        window.addEventListener(
            "orientationchange",
            scheduleUpdate
        );

        return () => {
            window.removeEventListener(
                "resize",
                scheduleUpdate
            );

            window.removeEventListener(
                "orientationchange",
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
    color =
        DEFAULT_GRID_COLOR
}) {
    const lines =
        useMemo(() => {
            const safeWidth =
                Math.max(
                    1,
                    numberOr(width, 1)
                );

            const safeHeight =
                Math.max(
                    1,
                    numberOr(height, 1)
                );

            let spacing =
                Math.max(
                    5,
                    numberOr(
                        gridSize,
                        20
                    )
                );

            const estimatedLineCount =
                safeWidth /
                    spacing +
                safeHeight /
                    spacing;

            /*
            Avoid creating thousands of
            individual Konva nodes.
            */

            if (
                estimatedLineCount >
                350
            ) {
                spacing *=
                    Math.ceil(
                        estimatedLineCount /
                        350
                    );
            }

            const result = [];

            for (
                let x = spacing;
                x < safeWidth;
                x += spacing
            ) {
                result.push({
                    id:
                        `grid-vertical-${x}`,

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
                    id:
                        `grid-horizontal-${y}`,

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
                    strokeWidth={
                        strokeWidth
                    }
                    opacity={0.28}
                    listening={false}
                    perfectDrawEnabled={
                        false
                    }
                    shadowForStrokeEnabled={
                        false
                    }
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
            externalStageRef =
                null,

        tools = [],

        autoFit = true,
        autoFitOnResize = true,

        wheelZoom = true,
        touchGestures = true,
        clipToDocument = true,

        minimumHeight = 640,

        fitPadding = null,

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
    /*=====================================================
    References
    =====================================================*/

    const containerRef =
        useRef(null);

    const internalStageRef =
        useRef(null);

    const managerRef =
        useRef(null);

    const extraToolIdsRef =
        useRef(
            new Set()
        );

    const panSessionRef =
        useRef(null);

    const spacePressedRef =
        useRef(false);

    const autoFitSignatureRef =
        useRef(null);

    const resizeFitTimerRef =
        useRef(null);

    const activeTouchPointersRef =
        useRef(
            new Map()
        );

    const pinchGestureRef =
        useRef(null);

    const touchGestureActiveRef =
        useRef(false);

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
        useRef(
            onViewportChange
        );

    const onSaveRequestedRef =
        useRef(
            onSaveRequested
        );

    const onErrorRef =
        useRef(onError);

    /*=====================================================
    Local State
    =====================================================*/

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

    const [
        isTouchGesturing,
        setIsTouchGesturing
    ] = useState(false);

    const containerSize =
        useContainerSize(
            containerRef
        );

    /*=====================================================
    Store State
    =====================================================*/

    const documentData =
        useFashionEditorStore(
            state =>
                state.document
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

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
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
            state =>
                state.undo
        );

    const redo =
        useFashionEditorStore(
            state =>
                state.redo
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

    const nudgeSelection =
        useFashionEditorStore(
            state =>
                state.nudgeSelection
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
        useCallback(
            nextObject => {
                const resolvedObject =
                    nextObject ||
                    null;

                setTemporaryObject(
                    resolvedObject
                );

                onTemporaryObjectChangeRef
                    .current
                    ?.(
                        resolvedObject
                    );
            },
            []
        );

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

                        eraser:
                            state.eraser,

                        selection: {
                            objectIds:
                                state
                                    .selectedObjectIds
                        },

                        stage:
                            internalStageRef
                                .current,

                        stageRef:
                            internalStageRef,

                        container:
                            containerRef
                                .current,

                        containerRef,

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

                        requestRender:
                            () => {
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
                            onErrorRef
                                .current
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

        manager.register(
            EraserTool
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
                    internalStageRef
                        .current,

                manager,

                container:
                    containerRef
                        .current
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

        if (
            Array.isArray(
                tools
            )
        ) {
            tools.forEach(
                tool => {
                    if (
                        !tool?.id ||
                        tool.id ===
                            PencilTool.id ||
                        tool.id ===
                            SelectionTool.id ||
                        tool.id ===
                            EraserTool.id
                    ) {
                        return;
                    }

                    manager.register(
                        tool,
                        {
                            replace:
                                true
                        }
                    );

                    nextToolIds.add(
                        tool.id
                    );
                }
            );
        }

        extraToolIdsRef
            .current
            .forEach(toolId => {
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
            });

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
                    applyStageTouchStyles(
                        node
                    );

                    onReadyRef.current?.({
                        stage:
                            node,

                        manager:
                            managerRef
                                .current,

                        container:
                            containerRef
                                .current
                    });
                }
            },
            [
                forwardedRef,
                externalStageRef
            ]
        );

    /*=====================================================
    Responsive Automatic Document Fit
    =====================================================*/

    useEffect(() => {
        if (
            !autoFit ||
            containerSize.width <= 1 ||
            containerSize.height <= 1
        ) {
            return undefined;
        }

        const documentSignature = [
            documentData.id,
            documentData.width,
            documentData.height
        ].join(":");

        const signature =
            autoFitOnResize
                ? [
                    documentSignature,
                    containerSize.width,
                    containerSize.height
                ].join(":")
                : documentSignature;

        if (
            autoFitSignatureRef
                .current ===
            signature
        ) {
            return undefined;
        }

        autoFitSignatureRef.current =
            signature;

        if (
            resizeFitTimerRef.current
        ) {
            window.clearTimeout(
                resizeFitTimerRef
                    .current
            );
        }

        resizeFitTimerRef.current =
            window.setTimeout(
                () => {
                    const padding =
                        Number.isFinite(
                            Number(
                                fitPadding
                            )
                        )
                            ? Math.max(
                                0,
                                Number(
                                    fitPadding
                                )
                            )
                            : getResponsiveFitPadding(
                                containerSize
                                    .width,
                                containerSize
                                    .height
                            );

                    fitDocumentToViewport(
                        containerSize.width,
                        containerSize.height,
                        padding
                    );

                    resizeFitTimerRef.current =
                        null;
                },
                RESIZE_FIT_DELAY
            );

        return () => {
            if (
                resizeFitTimerRef.current
            ) {
                window.clearTimeout(
                    resizeFitTimerRef
                        .current
                );

                resizeFitTimerRef.current =
                    null;
            }
        };
    }, [
        autoFit,
        autoFitOnResize,
        fitPadding,
        containerSize.width,
        containerSize.height,
        documentData.id,
        documentData.width,
        documentData.height,
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
                internalStageRef
                    .current;

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
                screenPoint:
                    clonePoint(
                        screenPoint
                    ),

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
                    preventScroll:
                        true
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
                typeof globalThis
                    .document ===
                    "undefined"
            ) {
                return false;
            }

            const activeElement =
                globalThis
                    .document
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
    Touch Gesture Helpers
    =====================================================*/

    const syncTouchPointers =
        useCallback(
            (
                event,
                phase =
                    "move"
            ) => {
                const nativeEvent =
                    getNativeEvent(
                        event
                    );

                if (
                    !isTouchEvent(
                        nativeEvent
                    )
                ) {
                    return 0;
                }

                const pointerMap =
                    activeTouchPointersRef
                        .current;

                /*
                Native TouchEvent objects expose the complete
                active touch list. Rebuilding the map from that
                list is the most reliable path on iOS and Android.
                */
                if (
                    nativeEvent
                        ?.touches
                ) {
                    pointerMap.clear();

                    getLocalTouchPoints(
                        nativeEvent,
                        containerRef
                            .current
                    ).forEach(
                        ([
                            pointerId,
                            point
                        ]) => {
                            pointerMap.set(
                                pointerId,
                                point
                            );
                        }
                    );

                    return pointerMap
                        .size;
                }

                /*
                PointerEvent path used by browsers that expose
                touch input through pointer events.
                */
                const pointerId =
                    getPointerId(
                        nativeEvent
                    );

                if (
                    pointerId ===
                    null
                ) {
                    return pointerMap
                        .size;
                }

                if (
                    phase ===
                        "end" ||
                    phase ===
                        "cancel"
                ) {
                    pointerMap.delete(
                        pointerId
                    );

                    return pointerMap
                        .size;
                }

                const localPoint =
                    getLocalEventPoint(
                        event,
                        containerRef
                            .current,
                        internalStageRef
                            .current
                    );

                if (localPoint) {
                    pointerMap.set(
                        pointerId,
                        localPoint
                    );
                }

                return pointerMap
                    .size;
            },
            []
        );

    const initializePinchGesture =
        useCallback(() => {
            const pointerEntries = [
                ...activeTouchPointersRef
                    .current
                    .entries()
            ];

            if (
                pointerEntries.length <
                2
            ) {
                pinchGestureRef.current =
                    null;

                return false;
            }

            const [
                firstEntry,
                secondEntry
            ] = pointerEntries;

            const [
                firstPointerId,
                firstPoint
            ] = firstEntry;

            const [
                secondPointerId,
                secondPoint
            ] = secondEntry;

            const center =
                midpoint(
                    firstPoint,
                    secondPoint
                );

            const distance =
                Math.max(
                    1,
                    distanceBetweenPoints(
                        firstPoint,
                        secondPoint
                    )
                );

            if (!center) {
                return false;
            }

            const state =
                useFashionEditorStore
                    .getState();

            const documentAnchor =
                screenPointToDocumentPoint(
                    center,
                    state.viewport
                );

            if (!documentAnchor) {
                return false;
            }

            pinchGestureRef.current = {
                pointerIds: [
                    firstPointerId,
                    secondPointerId
                ],

                startDistance:
                    distance,

                startZoom:
                    state.viewport
                        .zoom,

                documentAnchor
            };

            return true;
        }, []);

    const beginTouchGesture =
        useCallback(
            event => {
                if (!touchGestures) {
                    return false;
                }

                const nativeEvent =
                    getNativeEvent(
                        event
                    );

                if (
                    !isTouchEvent(
                        nativeEvent
                    )
                ) {
                    return false;
                }

                const touchCount =
                    syncTouchPointers(
                        event,
                        "start"
                    );

                const pointerId =
                    getPointerId(
                        nativeEvent
                    );

                /*
                Pointer capture is available for PointerEvent
                input. Native TouchEvent objects do not need it.
                */
                if (
                    nativeEvent
                        ?.pointerType ===
                        "touch" &&
                    pointerId !==
                        null
                ) {
                    try {
                        nativeEvent
                            ?.target
                            ?.setPointerCapture
                            ?.(
                                pointerId
                            );
                    } catch {
                        // Pointer capture is optional.
                    }
                }

                if (
                    touchGestureActiveRef
                        .current
                ) {
                    if (
                        touchCount >= 2
                    ) {
                        initializePinchGesture();
                    }

                    safelyPreventDefault(
                        nativeEvent
                    );

                    return true;
                }

                /*
                One touch belongs to the active drawing,
                erasing, selection, or pan tool. The ToolManager
                must receive it normally.
                */
                if (touchCount < 2) {
                    return false;
                }

                touchGestureActiveRef.current =
                    true;

                setIsTouchGesturing(
                    true
                );

                if (
                    managerRef.current
                        ?.isInteracting()
                ) {
                    managerRef.current
                        .cancelInteraction(
                            "touch-gesture-started"
                        );
                }

                panSessionRef.current =
                    null;

                setIsPanning(false);

                updateTemporaryObject(
                    null
                );

                initializePinchGesture();

                safelyPreventDefault(
                    nativeEvent
                );

                return true;
            },
            [
                touchGestures,
                syncTouchPointers,
                initializePinchGesture,
                updateTemporaryObject
            ]
        );

    const updateTouchGesture =
        useCallback(
            event => {
                if (!touchGestures) {
                    return false;
                }

                const nativeEvent =
                    getNativeEvent(
                        event
                    );

                if (
                    !isTouchEvent(
                        nativeEvent
                    )
                ) {
                    return false;
                }

                const touchCount =
                    syncTouchPointers(
                        event,
                        "move"
                    );

                if (
                    !touchGestureActiveRef
                        .current
                ) {
                    return false;
                }

                safelyPreventDefault(
                    nativeEvent
                );

                if (touchCount < 2) {
                    return true;
                }

                let gesture =
                    pinchGestureRef.current;

                if (!gesture) {
                    initializePinchGesture();

                    gesture =
                        pinchGestureRef
                            .current;
                }

                if (!gesture) {
                    return true;
                }

                let firstPoint =
                    activeTouchPointersRef
                        .current
                        .get(
                            gesture
                                .pointerIds[0]
                        );

                let secondPoint =
                    activeTouchPointersRef
                        .current
                        .get(
                            gesture
                                .pointerIds[1]
                        );

                if (
                    !firstPoint ||
                    !secondPoint
                ) {
                    initializePinchGesture();

                    gesture =
                        pinchGestureRef
                            .current;

                    if (!gesture) {
                        return true;
                    }

                    firstPoint =
                        activeTouchPointersRef
                            .current
                            .get(
                                gesture
                                    .pointerIds[0]
                            );

                    secondPoint =
                        activeTouchPointersRef
                            .current
                            .get(
                                gesture
                                    .pointerIds[1]
                            );
                }

                if (
                    !firstPoint ||
                    !secondPoint
                ) {
                    return true;
                }

                const currentDistance =
                    Math.max(
                        1,
                        distanceBetweenPoints(
                            firstPoint,
                            secondPoint
                        )
                    );

                const currentCenter =
                    midpoint(
                        firstPoint,
                        secondPoint
                    );

                if (!currentCenter) {
                    return true;
                }

                const zoomRatio =
                    currentDistance /
                    Math.max(
                        1,
                        gesture
                            .startDistance
                    );

                const nextZoom =
                    clamp(
                        gesture
                            .startZoom *
                            zoomRatio,
                        MIN_ZOOM,
                        MAX_ZOOM
                    );

                setViewport({
                    zoom:
                        nextZoom,

                    x:
                        currentCenter.x -
                        gesture
                            .documentAnchor
                            .x *
                        nextZoom,

                    y:
                        currentCenter.y -
                        gesture
                            .documentAnchor
                            .y *
                        nextZoom
                });

                return true;
            },
            [
                touchGestures,
                syncTouchPointers,
                initializePinchGesture,
                setViewport
            ]
        );

    const endTouchGesture =
        useCallback(
            (
                event,
                phase =
                    "end"
            ) => {
                if (!touchGestures) {
                    return false;
                }

                const nativeEvent =
                    getNativeEvent(
                        event
                    );

                if (
                    !isTouchEvent(
                        nativeEvent
                    )
                ) {
                    return false;
                }

                const pointerId =
                    getPointerId(
                        nativeEvent
                    );

                const wasTouchGesture =
                    touchGestureActiveRef
                        .current;

                const touchCount =
                    syncTouchPointers(
                        event,
                        phase
                    );

                if (
                    nativeEvent
                        ?.pointerType ===
                        "touch" &&
                    pointerId !==
                        null
                ) {
                    try {
                        nativeEvent
                            ?.target
                            ?.releasePointerCapture
                            ?.(
                                pointerId
                            );
                    } catch {
                        // Pointer release is optional.
                    }
                }

                /*
                Never call preventDefault() here. Browsers often
                dispatch touchend with cancelable=false after the
                gesture has completed. Trying to cancel that event
                produces the intervention warning.
                */
                if (!wasTouchGesture) {
                    return false;
                }

                if (touchCount >= 2) {
                    initializePinchGesture();
                } else {
                    pinchGestureRef.current =
                        null;
                }

                if (touchCount === 0) {
                    touchGestureActiveRef.current =
                        false;

                    setIsTouchGesturing(
                        false
                    );
                }

                return true;
            },
            [
                touchGestures,
                syncTouchPointers,
                initializePinchGesture
            ]
        );

    /*=====================================================
    Pan Handling
    =====================================================*/

    const shouldStartPan =
        useCallback(
            nativeEvent => {
                const currentTool =
                    useFashionEditorStore
                        .getState()
                        .activeTool;

                return Boolean(
                    currentTool ===
                        EDITOR_TOOLS.PAN ||
                    spacePressedRef
                        .current ||
                    nativeEvent?.button ===
                        1
                );
            },
            []
        );

    const startPan =
        useCallback(
            event => {
                const nativeEvent =
                    getNativeEvent(
                        event
                    );

                if (
                    !shouldStartPan(
                        nativeEvent
                    )
                ) {
                    return false;
                }

                safelyPreventDefault(
                    nativeEvent
                );

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
                    getPointerId(
                        nativeEvent
                    );

                const localPoint =
                    getLocalEventPoint(
                        event,
                        containerRef
                            .current,
                        internalStageRef
                            .current
                    );

                panSessionRef.current = {
                    pointerId,

                    startX:
                        numberOr(
                            localPoint?.x,
                            0
                        ),

                    startY:
                        numberOr(
                            localPoint?.y,
                            0
                        ),

                    startViewportX:
                        state.viewport
                            .x,

                    startViewportY:
                        state.viewport
                            .y
                };

                try {
                    if (
                        pointerId !==
                        null
                    ) {
                        nativeEvent
                            ?.target
                            ?.setPointerCapture
                            ?.(
                                pointerId
                            );
                    }
                } catch {
                    // Pointer capture is optional.
                }

                setIsPanning(
                    true
                );

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
                    panSessionRef
                        .current;

                if (!panSession) {
                    return false;
                }

                safelyPreventDefault(
                    event
                );

                const localPoint =
                    getLocalEventPoint(
                        event,
                        containerRef
                            .current,
                        internalStageRef
                            .current
                    );

                if (!localPoint) {
                    return true;
                }

                setViewport({
                    x:
                        panSession
                            .startViewportX +
                        (
                            localPoint.x -
                            panSession
                                .startX
                        ),

                    y:
                        panSession
                            .startViewportY +
                        (
                            localPoint.y -
                            panSession
                                .startY
                        )
                });

                return true;
            },
            [setViewport]
        );

    const endPan =
        useCallback(
            event => {
                const panSession =
                    panSessionRef
                        .current;

                if (!panSession) {
                    return false;
                }

                const nativeEvent =
                    getNativeEvent(
                        event
                    );

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

                setIsPanning(
                    false
                );

                return true;
            },
            []
        );

    /*=====================================================
    Stage Pointer Events
    =====================================================*/

    const handlePointerDown =
        useCallback(
            event => {
                focusCanvas();

                publishPointerPosition();

                if (
                    beginTouchGesture(
                        event
                    )
                ) {
                    return;
                }

                if (
                    startPan(event)
                ) {
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
                beginTouchGesture,
                startPan
            ]
        );

    const handlePointerMove =
        useCallback(
            event => {
                publishPointerPosition();

                if (
                    updateTouchGesture(
                        event
                    )
                ) {
                    return;
                }

                if (
                    updatePan(event)
                ) {
                    return;
                }

                managerRef.current
                    ?.handlePointerMove(
                        event
                    );
            },
            [
                publishPointerPosition,
                updateTouchGesture,
                updatePan
            ]
        );

    const handlePointerUp =
        useCallback(
            event => {
                publishPointerPosition();

                if (
                    endTouchGesture(
                        event,
                        "end"
                    )
                ) {
                    return;
                }

                if (
                    endPan(event)
                ) {
                    return;
                }

                managerRef.current
                    ?.handlePointerUp(
                        createManagerSafeEvent(
                            event
                        )
                    );
            },
            [
                publishPointerPosition,
                endTouchGesture,
                endPan
            ]
        );

    const handlePointerCancel =
        useCallback(
            event => {
                if (
                    endTouchGesture(
                        event,
                        "cancel"
                    )
                ) {
                    return;
                }

                if (
                    endPan(event)
                ) {
                    return;
                }

                managerRef.current
                    ?.handlePointerCancel(
                        createManagerSafeEvent(
                            event
                        )
                    );
            },
            [
                endTouchGesture,
                endPan
            ]
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
            [
                publishPointerPosition
            ]
        );

    const handlePointerLeave =
        useCallback(
            event => {
                managerRef.current
                    ?.handlePointerLeave(
                        event
                    );
            },
            []
        );

    /*=====================================================
    Empty Canvas Selection
    =====================================================*/

    const handleStageClick =
        useCallback(
            event => {
                if (
                    touchGestureActiveRef
                        .current
                ) {
                    return;
                }

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
                    internalStageRef
                        .current;

                if (
                    event.target ===
                    stage
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

                safelyPreventDefault(
                    nativeEvent
                );

                const managerResult =
                    managerRef.current
                        ?.handleWheel(
                            event
                        );

                if (
                    managerResult ===
                    true
                ) {
                    return;
                }

                const stage =
                    internalStageRef
                        .current;

                const anchor =
                    stage
                        ?.getPointerPosition
                        ?.();

                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    nativeEvent
                        ?.shiftKey
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

                const deltaY =
                    clamp(
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
                        -deltaY *
                        0.0018
                    );

                setZoom(
                    state.viewport
                        .zoom *
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
            safelyPreventDefault(
                event
            );

            managerRef.current
                ?.handleContextMenu(
                    createManagerSafeEvent(
                        event
                    )
                );
        }, []);

    /*=====================================================
    Fit Current View
    =====================================================*/

    const fitCurrentView =
        useCallback(() => {
            const padding =
                Number.isFinite(
                    Number(
                        fitPadding
                    )
                )
                    ? Math.max(
                        0,
                        Number(
                            fitPadding
                        )
                    )
                    : getResponsiveFitPadding(
                        containerSize
                            .width,
                        containerSize
                            .height
                    );

            fitDocumentToViewport(
                containerSize.width,
                containerSize.height,
                padding
            );
        }, [
            fitPadding,
            containerSize.width,
            containerSize.height,
            fitDocumentToViewport
        ]);

    /*=====================================================
    Keyboard Shortcuts
    =====================================================*/

    useEffect(() => {
        const handleKeyDown =
            event => {
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
                    event.key
                        .toLowerCase();

                const commandKey =
                    event.ctrlKey ||
                    event.metaKey;

                if (
                    event.code ===
                    "Space"
                ) {
                    event.preventDefault();

                    if (
                        !spacePressedRef
                            .current
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

                    if (
                        event.shiftKey
                    ) {
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
                    key ===
                        "delete" ||
                    key ===
                        "backspace"
                ) {
                    event.preventDefault();

                    deleteObjects();

                    return;
                }

                if (
                    key ===
                    "escape"
                ) {
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
                    activeTool ===
                        EDITOR_TOOLS.SELECT &&
                    (
                        key ===
                            "arrowleft" ||
                        key ===
                            "arrowright" ||
                        key ===
                            "arrowup" ||
                        key ===
                            "arrowdown"
                    )
                ) {
                    event.preventDefault();

                    const distance =
                        event.shiftKey
                            ? 10
                            : 1;

                    if (
                        key ===
                        "arrowleft"
                    ) {
                        nudgeSelection(
                            -distance,
                            0
                        );
                    }

                    if (
                        key ===
                        "arrowright"
                    ) {
                        nudgeSelection(
                            distance,
                            0
                        );
                    }

                    if (
                        key ===
                        "arrowup"
                    ) {
                        nudgeSelection(
                            0,
                            -distance
                        );
                    }

                    if (
                        key ===
                        "arrowdown"
                    ) {
                        nudgeSelection(
                            0,
                            distance
                        );
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
                    key === "e" &&
                    !commandKey
                ) {
                    event.preventDefault();

                    setActiveTool(
                        EDITOR_TOOLS.ERASER
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
                        state.viewport
                            .zoom *
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
                        state.viewport
                            .zoom /
                            1.15
                    );

                    return;
                }

                if (key === "0") {
                    event.preventDefault();

                    fitCurrentView();

                    return;
                }

                managerRef.current
                    ?.handleKeyDown(
                        event
                    );
            };

        const handleKeyUp =
            event => {
                if (
                    event.code ===
                    "Space"
                ) {
                    spacePressedRef.current =
                        false;

                    setIsSpacePressed(
                        false
                    );
                }

                managerRef.current
                    ?.handleKeyUp(
                        event
                    );
            };

        const handleWindowBlur =
            () => {
                spacePressedRef.current =
                    false;

                setIsSpacePressed(
                    false
                );

                panSessionRef.current =
                    null;

                setIsPanning(
                    false
                );

                activeTouchPointersRef
                    .current
                    .clear();

                pinchGestureRef.current =
                    null;

                touchGestureActiveRef.current =
                    false;

                setIsTouchGesturing(
                    false
                );

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
        activeTool,
        undo,
        redo,
        deleteObjects,
        clearSelection,
        selectAllOnActiveLayer,
        copySelection,
        cutSelection,
        pasteClipboard,
        nudgeSelection,
        setActiveTool,
        setZoom,
        fitCurrentView,
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
                        ?.opacity ??
                    1,

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

    const cursor =
        useMemo(() => {
            if (
                isTouchGesturing
            ) {
                return "grabbing";
            }

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
                managerCursor !==
                    "default"
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
            isTouchGesturing,
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
                documentData.width,
                1200
            )
        );

    const documentHeight =
        Math.max(
            1,
            numberOr(
                documentData.height,
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

    const transformerEnabled =
        activeTool ===
            EDITOR_TOOLS.SELECT &&
        !isPanning &&
        !isTouchGesturing;

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

                overscrollBehavior:
                    "none",

                userSelect:
                    "none",

                WebkitUserSelect:
                    "none",

                WebkitTouchCallout:
                    "none",

                cursor,

                ...style
            }}
            tabIndex={0}
            role="application"
            aria-label="Fashion design drawing canvas"
            aria-keyshortcuts="V P E H Delete Control+Z Control+Y Control+S"
            data-active-tool={
                activeTool
            }
            data-touch-gesture={
                isTouchGesturing
                    ? "true"
                    : "false"
            }
        >
            <Stage
                ref={setStageNode}
                width={
                    containerSize.width
                }
                height={
                    containerSize.height
                }
                draggable={false}
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
                        name="fashion-editor-background-group"
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
                                documentData.background ||
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

                <Layer
                    name="fashion-editor-artwork-layer"
                >
                    <Group
                        name="fashion-editor-artwork-group"
                        x={viewportX}
                        y={viewportY}
                        scaleX={zoom}
                        scaleY={zoom}
                    >
                        <LayerRenderer
                            document={
                                documentData
                            }
                            clipToDocument={
                                clipToDocument
                            }
                            listening={
                                !isPanning &&
                                !isTouchGesturing
                            }
                        />

                        <SelectionTransformer
                            stageRef={
                                internalStageRef
                            }
                            enabled={
                                transformerEnabled
                            }
                            resizeEnabled
                            rotateEnabled
                            keepRatio={
                                false
                            }
                            flipEnabled={
                                false
                            }
                        />
                    </Group>
                </Layer>

                {/* Temporary previews and tool cursors */}

                <Layer
                    name="fashion-editor-interaction-layer"
                    listening={false}
                >
                    <Group
                        name="fashion-editor-interaction-group"
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

            {isTouchGesturing && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-950/85 px-3 py-1.5 text-[10px] font-semibold text-slate-300 shadow-lg backdrop-blur">
                    Pinch to zoom · move two fingers to pan
                </div>
            )}
        </div>
    );
}

/*=========================================================
Export
=========================================================*/

const ForwardedEditorCanvas =
    forwardRef(
        EditorCanvas
    );

ForwardedEditorCanvas.displayName =
    "EditorCanvas";

export default memo(
    ForwardedEditorCanvas
);