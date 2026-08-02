/*
=========================================================
FashionVision Professional Editor
Brush Object Renderer
Version 1.0
=========================================================
*/

import React, {
    memo,
    useCallback,
    useMemo,
    useRef
} from "react";

import {
    Group,
    Line
} from "react-konva";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_STROKE_COLOR =
    "#111111";

const DEFAULT_STROKE_SIZE =
    4;

const SELECTION_COLOR =
    "#2563eb";

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

function isPointObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        Number.isFinite(
            Number(value.x)
        ) &&
        Number.isFinite(
            Number(value.y)
        )
    );
}

/*=========================================================
Normalize Point Collection
=========================================================*/

export function flattenBrushPoints(
    points = []
) {
    if (!Array.isArray(points)) {
        return [];
    }

    /*
    Support an already flattened Konva point array:

    [x1, y1, x2, y2]
    */

    if (
        points.every(
            point =>
                typeof point ===
                    "number" ||
                Number.isFinite(
                    Number(point)
                )
        )
    ) {
        const flattened = [];

        for (
            let index = 0;
            index < points.length - 1;
            index += 2
        ) {
            const x =
                Number(points[index]);

            const y =
                Number(
                    points[index + 1]
                );

            if (
                Number.isFinite(x) &&
                Number.isFinite(y)
            ) {
                flattened.push(
                    x,
                    y
                );
            }
        }

        return flattened;
    }

    /*
    Support professional editor point objects:

    [
        { x, y, pressure, tiltX, tiltY },
        ...
    ]
    */

    return points.reduce(
        (
            flattened,
            point
        ) => {
            if (!isPointObject(point)) {
                return flattened;
            }

            flattened.push(
                Number(point.x),
                Number(point.y)
            );

            return flattened;
        },
        []
    );
}

/*=========================================================
Resolve Stroke Width
=========================================================*/

function resolveStrokeWidth(
    object
) {
    return Math.max(
        0.25,
        numberOr(
            object?.size ??
                object?.strokeWidth,
            DEFAULT_STROKE_SIZE
        )
    );
}

/*=========================================================
Resolve Stroke Opacity
=========================================================*/

function resolveStrokeOpacity(
    object
) {
    return clamp(
        object?.opacity ?? 1,
        0,
        1
    );
}

/*=========================================================
Resolve Stroke Colour
=========================================================*/

function resolveStrokeColor(
    object
) {
    if (
        typeof object?.color ===
            "string" &&
        object.color.trim()
    ) {
        return object.color;
    }

    if (
        typeof object?.stroke ===
            "string" &&
        object.stroke.trim()
    ) {
        return object.stroke;
    }

    return DEFAULT_STROKE_COLOR;
}

/*=========================================================
Resolve Composite Operation
=========================================================*/

function resolveCompositeOperation(
    object
) {
    const operation =
        object?.compositeOperation ||
        object?.globalCompositeOperation;

    return typeof operation ===
        "string"
        ? operation
        : "source-over";
}

/*=========================================================
Brush Object Component
=========================================================*/

function BrushObject({
    object,
    layer = null,
    listening = true,
    transient = false,
    onSelect = null,
    onChange = null
}) {
    const groupRef =
        useRef(null);

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

    const selectObjects =
        useFashionEditorStore(
            state =>
                state.selectObjects
        );

    const toggleObjectSelection =
        useFashionEditorStore(
            state =>
                state.toggleObjectSelection
        );

    const updateObject =
        useFashionEditorStore(
            state =>
                state.updateObject
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

    const cancelHistoryTransaction =
        useFashionEditorStore(
            state =>
                state.cancelHistoryTransaction
        );

    const points =
        useMemo(
            () =>
                flattenBrushPoints(
                    object?.points
                ),
            [
                object?.points
            ]
        );

    const strokeWidth =
        useMemo(
            () =>
                resolveStrokeWidth(
                    object
                ),
            [
                object
            ]
        );

    const strokeColor =
        useMemo(
            () =>
                resolveStrokeColor(
                    object
                ),
            [
                object
            ]
        );

    const strokeOpacity =
        useMemo(
            () =>
                resolveStrokeOpacity(
                    object
                ),
            [
                object
            ]
        );

    const isSelected =
        Boolean(
            object?.id &&
            selectedObjectIds.includes(
                object.id
            )
        );

    const objectLocked =
        Boolean(
            object?.locked
        );

    const layerLocked =
        Boolean(
            layer?.locked
        );

    const layerVisible =
        layer?.visible !== false;

    const objectVisible =
        object?.visible !== false;

    const selectionEnabled =
        activeTool ===
        EDITOR_TOOLS.SELECT;

    const isInteractive =
        Boolean(
            listening &&
            !transient &&
            !object?.transient &&
            !objectLocked &&
            !layerLocked &&
            layerVisible &&
            objectVisible
        );

    const isDraggable =
        Boolean(
            isInteractive &&
            selectionEnabled &&
            isSelected
        );

    /*=====================================================
    Selection
    =====================================================*/

    const handlePointerDown =
        useCallback(
            event => {
                if (
                    !isInteractive ||
                    !selectionEnabled
                ) {
                    return;
                }

                event.cancelBubble =
                    true;

                const nativeEvent =
                    event.evt;

                const appendSelection =
                    Boolean(
                        nativeEvent?.shiftKey ||
                        nativeEvent?.ctrlKey ||
                        nativeEvent?.metaKey
                    );

                if (appendSelection) {
                    toggleObjectSelection(
                        object.id
                    );
                } else if (!isSelected) {
                    selectObjects([
                        object.id
                    ]);
                }

                onSelect?.({
                    object,
                    append:
                        appendSelection,
                    event
                });
            },
            [
                isInteractive,
                selectionEnabled,
                toggleObjectSelection,
                selectObjects,
                object,
                isSelected,
                onSelect
            ]
        );

    /*=====================================================
    Drag History
    =====================================================*/

    const handleDragStart =
        useCallback(
            event => {
                if (!isDraggable) {
                    event.target.stopDrag();

                    return;
                }

                event.cancelBubble =
                    true;

                beginHistoryTransaction(
                    "Move brush stroke"
                );
            },
            [
                isDraggable,
                beginHistoryTransaction
            ]
        );

    const handleDragMove =
        useCallback(
            event => {
                if (!isDraggable) {
                    return;
                }

                event.cancelBubble =
                    true;
            },
            [
                isDraggable
            ]
        );

    const handleDragEnd =
        useCallback(
            event => {
                if (!isDraggable) {
                    cancelHistoryTransaction();

                    return;
                }

                event.cancelBubble =
                    true;

                const node =
                    event.target;

                const nextX =
                    numberOr(
                        node.x(),
                        0
                    );

                const nextY =
                    numberOr(
                        node.y(),
                        0
                    );

                updateObject(
                    object.id,
                    {
                        x:
                            nextX,

                        y:
                            nextY
                    },
                    "Move brush stroke"
                );

                commitHistoryTransaction();

                onChange?.({
                    objectId:
                        object.id,

                    updates: {
                        x:
                            nextX,

                        y:
                            nextY
                    },

                    event
                });
            },
            [
                isDraggable,
                object,
                updateObject,
                commitHistoryTransaction,
                cancelHistoryTransaction,
                onChange
            ]
        );

    /*=====================================================
    Render Guard
    =====================================================*/

    if (
        !object ||
        !object.id ||
        !objectVisible ||
        !layerVisible ||
        points.length < 4
    ) {
        return null;
    }

    const objectX =
        numberOr(
            object.x,
            0
        );

    const objectY =
        numberOr(
            object.y,
            0
        );

    const rotation =
        numberOr(
            object.rotation,
            0
        );

    const scaleX =
        numberOr(
            object.scaleX,
            1
        );

    const scaleY =
        numberOr(
            object.scaleY,
            1
        );

    const skewX =
        numberOr(
            object.skewX,
            0
        );

    const skewY =
        numberOr(
            object.skewY,
            0
        );

    const tension =
        clamp(
            object.tension ??
                object.smoothing ??
                0.5,
            0,
            1
        );

    const hitStrokeWidth =
        Math.max(
            strokeWidth + 10,
            14
        );

    return (
        <Group
            ref={groupRef}
            id={object.id}
            name="fashion-editor-brush-object"
            x={objectX}
            y={objectY}
            rotation={rotation}
            scaleX={scaleX}
            scaleY={scaleY}
            skewX={skewX}
            skewY={skewY}
            draggable={isDraggable}
            listening={
                isInteractive
            }
            visible={
                objectVisible &&
                layerVisible
            }
            onPointerDown={
                handlePointerDown
            }
            onMouseDown={
                handlePointerDown
            }
            onTouchStart={
                handlePointerDown
            }
            onDragStart={
                handleDragStart
            }
            onDragMove={
                handleDragMove
            }
            onDragEnd={
                handleDragEnd
            }
        >
            {/* Selection outline */}

            {isSelected &&
                selectionEnabled &&
                !transient && (
                    <Line
                        points={points}
                        stroke={
                            SELECTION_COLOR
                        }
                        strokeWidth={
                            strokeWidth +
                            6
                        }
                        opacity={0.45}
                        tension={
                            tension
                        }
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                        perfectDrawEnabled={
                            false
                        }
                        shadowForStrokeEnabled={
                            false
                        }
                    />
                )}

            {/* Visible brush stroke */}

            <Line
                points={points}
                stroke={
                    strokeColor
                }
                strokeWidth={
                    strokeWidth
                }
                opacity={
                    strokeOpacity
                }
                tension={
                    tension
                }
                lineCap={
                    object.lineCap ||
                    "round"
                }
                lineJoin={
                    object.lineJoin ||
                    "round"
                }
                dash={
                    Array.isArray(
                        object.dash
                    )
                        ? object.dash
                        : undefined
                }
                dashOffset={
                    numberOr(
                        object.dashOffset,
                        0
                    )
                }
                globalCompositeOperation={
                    resolveCompositeOperation(
                        object
                    )
                }
                hitStrokeWidth={
                    hitStrokeWidth
                }
                bezier={
                    Boolean(
                        object.bezier
                    )
                }
                closed={
                    Boolean(
                        object.closed
                    )
                }
                listening={
                    isInteractive
                }
                perfectDrawEnabled={
                    false
                }
                shadowForStrokeEnabled={
                    false
                }
            />
        </Group>
    );
}

/*=========================================================
Memoized Export
=========================================================*/

const MemoizedBrushObject =
    memo(
        BrushObject,
        (
            previousProps,
            nextProps
        ) => {
            return (
                previousProps.object ===
                    nextProps.object &&
                previousProps.layer ===
                    nextProps.layer &&
                previousProps.listening ===
                    nextProps.listening &&
                previousProps.transient ===
                    nextProps.transient &&
                previousProps.onSelect ===
                    nextProps.onSelect &&
                previousProps.onChange ===
                    nextProps.onChange
            );
        }
    );

MemoizedBrushObject.displayName =
    "BrushObject";

export default MemoizedBrushObject;