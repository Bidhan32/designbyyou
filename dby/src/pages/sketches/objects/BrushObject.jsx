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
    Circle,
    Ellipse,
    Group,
    Line,
    Path
} from "react-konva";

import {
    BRUSH_RENDER_MODES
} from "../brushes/BrushPresets";

import {
    createPerfectFreehandGeometry
} from "../brushes/PerfectFreehandBrush";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_COLOR =
    "#111111";

const DEFAULT_STROKE_WIDTH =
    4;

const MINIMUM_HIT_WIDTH =
    14;

const MINIMUM_SCALE =
    0.0001;

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

function positiveNumberOr(
    value,
    fallback = 1
) {
    return Math.max(
        MINIMUM_SCALE,
        numberOr(
            value,
            fallback
        )
    );
}

/*=========================================================
Point Helpers
=========================================================*/

function isPointObject(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        Number.isFinite(
            Number(value.x)
        ) &&
        Number.isFinite(
            Number(value.y)
        )
    );
}

function normalizePointObjects(
    points = []
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return [];
    }

    if (
        isPointObject(
            points[0]
        )
    ) {
        return points
            .filter(
                isPointObject
            )
            .map(
                point => ({
                    ...point,

                    x:
                        Number(point.x),

                    y:
                        Number(point.y)
                })
            );
    }

    const result = [];

    for (
        let index = 0;
        index + 1 <
            points.length;
        index += 2
    ) {
        const x =
            Number(
                points[index]
            );

        const y =
            Number(
                points[
                    index + 1
                ]
            );

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            continue;
        }

        result.push({
            x,
            y
        });
    }

    return result;
}

function toFlatPoints(
    points = []
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return [];
    }

    if (
        typeof points[0] ===
        "number"
    ) {
        const result = [];

        for (
            let index = 0;
            index + 1 <
                points.length;
            index += 2
        ) {
            const x =
                Number(
                    points[index]
                );

            const y =
                Number(
                    points[
                        index + 1
                    ]
                );

            if (
                Number.isFinite(x) &&
                Number.isFinite(y)
            ) {
                result.push(
                    x,
                    y
                );
            }
        }

        return result;
    }

    return points
        .filter(
            isPointObject
        )
        .flatMap(
            point => [
                Number(point.x),
                Number(point.y)
            ]
        );
}

/*=========================================================
Object Style Helpers
=========================================================*/

function resolveRenderMode(
    object
) {
    const requestedMode =
        object?.renderMode ||
        object?.brush
            ?.renderMode ||
        object?.style
            ?.renderMode ||
        object?.metadata
            ?.renderMode;

    if (
        requestedMode ===
            BRUSH_RENDER_MODES
                .OUTLINE ||
        requestedMode ===
            "outline"
    ) {
        return "outline";
    }

    if (
        requestedMode ===
            BRUSH_RENDER_MODES
                .STAMP ||
        requestedMode ===
            "stamp"
    ) {
        return "stamp";
    }

    if (
        requestedMode ===
            BRUSH_RENDER_MODES
                .LINE ||
        requestedMode ===
            "line"
    ) {
        return "line";
    }

    if (
        Array.isArray(
            object?.stamps
        ) &&
        object.stamps.length > 0
    ) {
        return "stamp";
    }

    if (
        object?.svgPath ||
        object?.geometry
            ?.freehand
            ?.svgPath ||
        Array.isArray(
            object
                ?.flatOutlinePoints
        ) ||
        Array.isArray(
            object
                ?.outlinePoints
        )
    ) {
        return "outline";
    }

    return "line";
}

function resolveColor(
    object
) {
    const candidates = [
        object?.color,
        object?.stroke,
        object?.fill,
        object?.style?.color,
        object?.style?.stroke,
        object?.style?.fill,
        object?.brush?.color
    ];

    return (
        candidates.find(
            value =>
                typeof value ===
                    "string" &&
                value.trim()
        )?.trim() ||
        DEFAULT_COLOR
    );
}

function resolveStrokeWidth(
    object
) {
    return Math.max(
        0.1,
        numberOr(
            object?.strokeWidth ??
            object?.width ??
            object?.size ??
            object?.style
                ?.strokeWidth ??
            object?.brush?.size,
            DEFAULT_STROKE_WIDTH
        )
    );
}

function resolveStrokeOpacity(
    object
) {
    return clamp(
        object?.strokeOpacity ??
        object?.style
            ?.strokeOpacity ??
        object?.style
            ?.opacity ??
        object?.brush
            ?.opacity ??
        1,
        0,
        1
    );
}

function resolveObjectOpacity(
    object
) {
    return clamp(
        object?.opacity ?? 1,
        0,
        1
    );
}

function resolveCompositeOperation(
    object
) {
    const value =
        object
            ?.globalCompositeOperation ||
        object
            ?.compositeOperation ||
        object?.style
            ?.globalCompositeOperation ||
        object?.style
            ?.compositeOperation ||
        object?.blendMode;

    return (
        typeof value ===
            "string" &&
        value.trim()
            ? value.trim()
            : "source-over"
    );
}

/*=========================================================
Outline Geometry
=========================================================*/

function createOutlineOptions(
    object
) {
    const brush =
        object?.brush ||
        object?.settings ||
        {};

    return {
        size:
            resolveStrokeWidth(
                object
            ),

        thinning:
            0,

        smoothing:
            0,

        streamline:
            0,

        pressureEnabled:
            false,

        simulatePressure:
            false,

        usePointWidth:
            true,

        applyTaperToPointWidth:
            false,

        taperStart:
            0,

        taperEnd:
            0,

        minimumWidth:
            Math.max(
                0.01,
                numberOr(
                    brush.minimumSize,
                    0.05
                )
            ),

        minimumPointDistance:
            0.001,

        widthSmoothing:
            clamp(
                numberOr(
                    brush.smoothing,
                    0.5
                ) *
                0.35,
                0,
                0.4
            ),

        startCap:
            "round",

        endCap:
            "round",

        join:
            "round",

        capSegments:
            12,

        smoothSvgPath:
            true,

        svgPrecision:
            2
    };
}

function resolveOutlineGeometry(
    object
) {
    const processedPoints =
        normalizePointObjects(
            object?.points
        );

    /*
    Prefer rebuilding from the processed points. This keeps
    outline brushes correct after moving or editing points.
    */

    if (
        processedPoints.length > 0
    ) {
        try {
            const geometry =
                createPerfectFreehandGeometry(
                    processedPoints,
                    createOutlineOptions(
                        object
                    )
                );

            if (geometry?.valid) {
                return {
                    valid:
                        true,

                    svgPath:
                        geometry.svgPath ||
                        "",

                    flatOutlinePoints:
                        Array.isArray(
                            geometry
                                .flatOutlinePoints
                        )
                            ? geometry
                                .flatOutlinePoints
                            : [],

                    bounds:
                        geometry.bounds ||
                        object?.geometry
                            ?.boundingBox ||
                        null
                };
            }
        } catch {
            // Stored geometry below is used as a fallback.
        }
    }

    const svgPath =
        object?.svgPath ||
        object?.geometry
            ?.freehand
            ?.svgPath ||
        "";

    const flatOutlinePoints =
        toFlatPoints(
            object
                ?.flatOutlinePoints ||
            object?.outlinePoints ||
            object?.geometry
                ?.freehand
                ?.flatOutlinePoints ||
            object?.geometry
                ?.freehand
                ?.outlinePoints ||
            []
        );

    return {
        valid:
            Boolean(
                svgPath ||
                flatOutlinePoints
                    .length >= 6
            ),

        svgPath,

        flatOutlinePoints,

        bounds:
            object?.geometry
                ?.boundingBox ||
            null
    };
}

/*=========================================================
Stamp Geometry
=========================================================*/

function normalizeStamp(
    stamp,
    index,
    defaultSize
) {
    if (
        !stamp ||
        typeof stamp !==
            "object"
    ) {
        return null;
    }

    const x =
        numberOr(
            stamp.x ??
            stamp.point?.x,
            NaN
        );

    const y =
        numberOr(
            stamp.y ??
            stamp.point?.y,
            NaN
        );

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return null;
    }

    const size =
        Math.max(
            0.1,
            numberOr(
                stamp.size ??
                stamp.diameter ??
                defaultSize,
                defaultSize
            )
        );

    const radiusX =
        Math.max(
            0.05,
            numberOr(
                stamp.radiusX ??
                (
                    stamp.width !==
                        undefined
                        ? numberOr(
                            stamp.width,
                            size
                        ) / 2
                        : size / 2
                ),
                size / 2
            )
        );

    const radiusY =
        Math.max(
            0.05,
            numberOr(
                stamp.radiusY ??
                (
                    stamp.height !==
                        undefined
                        ? numberOr(
                            stamp.height,
                            size
                        ) / 2
                        : size / 2
                ),
                size / 2
            )
        );

    return {
        id:
            stamp.id ||
            `stamp-${index}`,

        x,
        y,

        radiusX,
        radiusY,

        rotation:
            numberOr(
                stamp.rotation ??
                stamp.angle,
                0
            ),

        opacity:
            clamp(
                stamp.opacity ?? 1,
                0,
                1
            ),

        scaleX:
            positiveNumberOr(
                stamp.scaleX ??
                stamp.scale,
                1
            ),

        scaleY:
            positiveNumberOr(
                stamp.scaleY ??
                stamp.scale,
                1
            ),

        color:
            typeof stamp.color ===
                "string" &&
            stamp.color.trim()
                ? stamp.color.trim()
                : null
    };
}

/*=========================================================
Konva Node Helpers
=========================================================*/

function collectionToArray(
    collection
) {
    if (!collection) {
        return [];
    }

    if (
        Array.isArray(collection)
    ) {
        return collection;
    }

    if (
        typeof collection
            .toArray ===
        "function"
    ) {
        return collection
            .toArray();
    }

    const result = [];

    if (
        typeof collection.each ===
        "function"
    ) {
        collection.each(
            node => {
                result.push(node);
            }
        );

        return result;
    }

    try {
        return [
            ...collection
        ];
    } catch {
        return result;
    }
}

function findObjectRootNode(
    stage,
    objectId
) {
    if (
        !stage ||
        !objectId
    ) {
        return null;
    }

    const candidates =
        collectionToArray(
            stage.find(
                ".fashion-editor-object"
            )
        );

    return (
        candidates.find(
            node =>
                node?.getAttr?.(
                    "editorObjectRoot"
                ) === true &&
                node?.getAttr?.(
                    "objectId"
                ) === objectId
        ) ||
        null
    );
}

/*=========================================================
Geometry Renderers
=========================================================*/

const LineGeometry =
    memo(function LineGeometry({
        object,
        color,
        strokeWidth,
        strokeOpacity,
        compositeOperation,
        commonAttributes
    }) {
        const flatPoints =
            toFlatPoints(
                object?.flatPoints ||
                object?.points ||
                object
                    ?.previewPoints ||
                []
            );

        if (
            flatPoints.length <
            2
        ) {
            return null;
        }

        if (
            flatPoints.length ===
            2
        ) {
            return (
                <Circle
                    {...commonAttributes}
                    name="fashion-editor-brush-geometry"
                    x={
                        flatPoints[0]
                    }
                    y={
                        flatPoints[1]
                    }
                    radius={
                        Math.max(
                            0.1,
                            strokeWidth / 2
                        )
                    }
                    fill={color}
                    opacity={
                        strokeOpacity
                    }
                    globalCompositeOperation={
                        compositeOperation
                    }
                    perfectDrawEnabled={
                        false
                    }
                    shadowForStrokeEnabled={
                        false
                    }
                />
            );
        }

        return (
            <Line
                {...commonAttributes}
                name="fashion-editor-brush-geometry"
                points={
                    flatPoints
                }
                stroke={color}
                strokeWidth={
                    strokeWidth
                }
                opacity={
                    strokeOpacity
                }
                lineCap={
                    object?.lineCap ||
                    object?.style
                        ?.lineCap ||
                    "round"
                }
                lineJoin={
                    object?.lineJoin ||
                    object?.style
                        ?.lineJoin ||
                    "round"
                }
                tension={
                    clamp(
                        object?.tension ??
                        object?.style
                            ?.tension ??
                        0,
                        0,
                        1
                    )
                }
                bezier={
                    object?.bezier ===
                    true
                }
                dash={
                    Array.isArray(
                        object?.dash ||
                        object?.style
                            ?.dash
                    )
                        ? (
                            object?.dash ||
                            object?.style
                                ?.dash
                        )
                        : undefined
                }
                hitStrokeWidth={
                    Math.max(
                        MINIMUM_HIT_WIDTH,
                        strokeWidth
                    )
                }
                globalCompositeOperation={
                    compositeOperation
                }
                perfectDrawEnabled={
                    false
                }
                shadowForStrokeEnabled={
                    false
                }
            />
        );
    });

const OutlineGeometry =
    memo(function OutlineGeometry({
        geometry,
        color,
        strokeOpacity,
        compositeOperation,
        commonAttributes
    }) {
        if (!geometry?.valid) {
            return null;
        }

        if (geometry.svgPath) {
            return (
                <Path
                    {...commonAttributes}
                    name="fashion-editor-brush-geometry"
                    data={
                        geometry
                            .svgPath
                    }
                    fill={color}
                    opacity={
                        strokeOpacity
                    }
                    globalCompositeOperation={
                        compositeOperation
                    }
                    perfectDrawEnabled={
                        false
                    }
                    shadowForStrokeEnabled={
                        false
                    }
                />
            );
        }

        if (
            geometry
                .flatOutlinePoints
                .length >= 6
        ) {
            return (
                <Line
                    {...commonAttributes}
                    name="fashion-editor-brush-geometry"
                    points={
                        geometry
                            .flatOutlinePoints
                    }
                    closed
                    fill={color}
                    stroke={color}
                    strokeWidth={
                        0.01
                    }
                    opacity={
                        strokeOpacity
                    }
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation={
                        compositeOperation
                    }
                    perfectDrawEnabled={
                        false
                    }
                    shadowForStrokeEnabled={
                        false
                    }
                />
            );
        }

        return null;
    });

const StampGeometry =
    memo(function StampGeometry({
        stamps,
        color,
        strokeOpacity,
        compositeOperation,
        commonAttributes
    }) {
        if (
            !Array.isArray(stamps) ||
            stamps.length === 0
        ) {
            return null;
        }

        return (
            <>
                {stamps.map(
                    stamp => (
                        <Ellipse
                            key={
                                stamp.id
                            }
                            {...commonAttributes}
                            name="fashion-editor-brush-geometry"
                            x={stamp.x}
                            y={stamp.y}
                            radiusX={
                                stamp.radiusX
                            }
                            radiusY={
                                stamp.radiusY
                            }
                            rotation={
                                stamp.rotation
                            }
                            scaleX={
                                stamp.scaleX
                            }
                            scaleY={
                                stamp.scaleY
                            }
                            fill={
                                stamp.color ||
                                color
                            }
                            opacity={
                                clamp(
                                    strokeOpacity *
                                    stamp.opacity,
                                    0,
                                    1
                                )
                            }
                            globalCompositeOperation={
                                compositeOperation
                            }
                            perfectDrawEnabled={
                                false
                            }
                            shadowForStrokeEnabled={
                                false
                            }
                        />
                    )
                )}
            </>
        );
    });

/*=========================================================
Brush Object
=========================================================*/

function BrushObject({
    object,
    layer = null,
    listening = true,
    transient = false
}) {
    const dragSessionRef =
        useRef(null);

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
        );

    const selected =
        useFashionEditorStore(
            state =>
                state
                    .selectedObjectIds
                    .includes(
                        object?.id
                    )
        );

    const isTransient =
        Boolean(
            transient ||
            object?.transient ||
            object?.metadata
                ?.transient
        );

    const visible =
        Boolean(
            object &&
            object.visible !==
                false &&
            layer?.visible !==
                false
        );

    const objectLocked =
        Boolean(
            object?.locked ||
            layer?.locked
        );

    const canListen =
        Boolean(
            listening !== false &&
            visible &&
            !isTransient
        );

    const canSelect =
        Boolean(
            canListen &&
            !objectLocked &&
            object?.selectable !==
                false
        );

    const canDrag =
        Boolean(
            canSelect &&
            activeTool ===
                EDITOR_TOOLS.SELECT
        );

    const renderMode =
        useMemo(
            () =>
                resolveRenderMode(
                    object
                ),
            [object]
        );

    const color =
        useMemo(
            () =>
                resolveColor(
                    object
                ),
            [object]
        );

    const strokeWidth =
        useMemo(
            () =>
                resolveStrokeWidth(
                    object
                ),
            [object]
        );

    const strokeOpacity =
        useMemo(
            () =>
                resolveStrokeOpacity(
                    object
                ),
            [object]
        );

    const compositeOperation =
        useMemo(
            () =>
                resolveCompositeOperation(
                    object
                ),
            [object]
        );

    const outlineGeometry =
        useMemo(
            () =>
                renderMode ===
                    "outline"
                    ? resolveOutlineGeometry(
                        object
                    )
                    : null,
            [
                object,
                renderMode
            ]
        );

    const stamps =
        useMemo(
            () => {
                if (
                    renderMode !==
                    "stamp"
                ) {
                    return [];
                }

                const defaultSize =
                    resolveStrokeWidth(
                        object
                    );

                return (
                    Array.isArray(
                        object?.stamps
                    )
                        ? object.stamps
                        : []
                )
                    .map(
                        (
                            stamp,
                            index
                        ) =>
                            normalizeStamp(
                                stamp,
                                index,
                                defaultSize
                            )
                    )
                    .filter(Boolean);
            },
            [
                object,
                renderMode
            ]
        );

    const commonAttributes =
        useMemo(
            () => ({
                objectId:
                    object?.id,

                editorObjectId:
                    object?.id,

                objectType:
                    object?.type ||
                    "brush",

                layerId:
                    object?.layerId ||
                    layer?.id,

                editorObject:
                    true,

                transient:
                    isTransient
            }),
            [
                object?.id,
                object?.type,
                object?.layerId,
                layer?.id,
                isTransient
            ]
        );

    const selectObject =
        useCallback(
            event => {
                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    state.activeTool !==
                        EDITOR_TOOLS
                            .SELECT ||
                    !canSelect ||
                    !object?.id
                ) {
                    return false;
                }

                if (event) {
                    event.cancelBubble =
                        true;
                }

                const nativeEvent =
                    event?.evt ||
                    event ||
                    null;

                const additive =
                    Boolean(
                        nativeEvent
                            ?.shiftKey ||
                        nativeEvent
                            ?.ctrlKey ||
                        nativeEvent
                            ?.metaKey
                    );

                if (
                    object.layerId &&
                    state.activeLayerId !==
                        object.layerId
                ) {
                    state.setActiveLayer?.(
                        object.layerId,
                        {
                            clearSelection:
                                false
                        }
                    );
                }

                const nextState =
                    useFashionEditorStore
                        .getState();

                if (additive) {
                    nextState
                        .toggleObjectSelection
                        ?.(
                            object.id
                        );

                    return true;
                }

                if (
                    !nextState
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                ) {
                    nextState
                        .selectObjects
                        ?.(
                            [
                                object.id
                            ]
                        );
                }

                return true;
            },
            [
                canSelect,
                object?.id,
                object?.layerId
            ]
        );

    const handlePointerDown =
        useCallback(
            event => {
                selectObject(
                    event
                );
            },
            [selectObject]
        );

    const handleDragStart =
        useCallback(
            event => {
                if (
                    !canDrag ||
                    !object?.id
                ) {
                    return;
                }

                selectObject(
                    event
                );

                const state =
                    useFashionEditorStore
                        .getState();

                let selectedIds =
                    state
                        .selectedObjectIds;

                if (
                    !selectedIds.includes(
                        object.id
                    )
                ) {
                    selectedIds = [
                        object.id
                    ];

                    state.selectObjects?.(
                        selectedIds
                    );
                }

                selectedIds =
                    selectedIds.filter(
                        objectId => {
                            const candidate =
                                state.objects[
                                    objectId
                                ];

                            const candidateLayer =
                                state.layers.find(
                                    item =>
                                        item.id ===
                                        candidate
                                            ?.layerId
                                );

                            return Boolean(
                                candidate &&
                                candidate
                                    .visible !==
                                    false &&
                                !candidate
                                    .locked &&
                                candidateLayer &&
                                candidateLayer
                                    .visible !==
                                    false &&
                                !candidateLayer
                                    .locked
                            );
                        }
                    );

                if (
                    selectedIds.length ===
                    0
                ) {
                    return;
                }

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const stage =
                    draggedNode
                        ?.getStage
                        ?.();

                const initialPositions =
                    {};

                const nodeById =
                    {};

                selectedIds.forEach(
                    objectId => {
                        const candidate =
                            state.objects[
                                objectId
                            ];

                        initialPositions[
                            objectId
                        ] = {
                            x:
                                numberOr(
                                    candidate
                                        ?.x,
                                    0
                                ),

                            y:
                                numberOr(
                                    candidate
                                        ?.y,
                                    0
                                )
                        };

                        const node =
                            objectId ===
                                object.id
                                ? draggedNode
                                : findObjectRootNode(
                                    stage,
                                    objectId
                                );

                        if (node) {
                            nodeById[
                                objectId
                            ] = node;
                        }
                    }
                );

                state
                    .beginHistoryTransaction
                    ?.(
                        "Move objects"
                    );

                dragSessionRef.current = {
                    selectedIds,

                    draggedObjectId:
                        object.id,

                    startX:
                        numberOr(
                            draggedNode
                                ?.x?.(),
                            initialPositions[
                                object.id
                            ]?.x ||
                            0
                        ),

                    startY:
                        numberOr(
                            draggedNode
                                ?.y?.(),
                            initialPositions[
                                object.id
                            ]?.y ||
                            0
                        ),

                    initialPositions,

                    nodeById,

                    stage
                };
            },
            [
                canDrag,
                object?.id,
                selectObject
            ]
        );

    const handleDragMove =
        useCallback(
            event => {
                const session =
                    dragSessionRef
                        .current;

                if (!session) {
                    return;
                }

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode
                            ?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode
                            ?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                session
                    .selectedIds
                    .forEach(
                        objectId => {
                            if (
                                objectId ===
                                session
                                    .draggedObjectId
                            ) {
                                return;
                            }

                            const node =
                                session
                                    .nodeById[
                                    objectId
                                ];

                            const initial =
                                session
                                    .initialPositions[
                                    objectId
                                ];

                            if (
                                !node ||
                                !initial
                            ) {
                                return;
                            }

                            node.position({
                                x:
                                    initial.x +
                                    deltaX,

                                y:
                                    initial.y +
                                    deltaY
                            });
                        }
                    );

                session.stage
                    ?.batchDraw
                    ?.();
            },
            []
        );

    const handleDragEnd =
        useCallback(
            event => {
                const session =
                    dragSessionRef
                        .current;

                if (!session) {
                    return;
                }

                dragSessionRef.current =
                    null;

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode
                            ?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode
                            ?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                const state =
                    useFashionEditorStore
                        .getState();

                try {
                    if (
                        Math.abs(deltaX) <
                            0.0001 &&
                        Math.abs(deltaY) <
                            0.0001
                    ) {
                        state
                            .commitHistoryTransaction
                            ?.();

                        return;
                    }

                    if (
                        typeof state
                            .updateObjects ===
                        "function"
                    ) {
                        state.updateObjects(
                            session
                                .selectedIds,

                            currentObject => {
                                const initial =
                                    session
                                        .initialPositions[
                                        currentObject
                                            .id
                                    ];

                                if (!initial) {
                                    return {};
                                }

                                return {
                                    x:
                                        initial.x +
                                        deltaX,

                                    y:
                                        initial.y +
                                        deltaY
                                };
                            },

                            "Move objects"
                        );
                    } else {
                        session
                            .selectedIds
                            .forEach(
                                objectId => {
                                    const initial =
                                        session
                                            .initialPositions[
                                            objectId
                                        ];

                                    if (!initial) {
                                        return;
                                    }

                                    state
                                        .updateObject
                                        ?.(
                                            objectId,
                                            {
                                                x:
                                                    initial.x +
                                                    deltaX,

                                                y:
                                                    initial.y +
                                                    deltaY
                                            },
                                            "Move object"
                                        );
                                }
                            );
                    }

                    state
                        .commitHistoryTransaction
                        ?.();
                } catch (error) {
                    state
                        .cancelHistoryTransaction
                        ?.();

                    console.error(
                        "Brush object drag failed:",
                        error
                    );
                } finally {
                    session.stage
                        ?.batchDraw
                        ?.();
                }
            },
            []
        );

    if (
        !object ||
        !visible
    ) {
        return null;
    }

    const rootName = [
        "fashion-editor-object",
        "fashion-editor-brush-object",
        selected
            ? "fashion-editor-selected-object"
            : "",
        isTransient
            ? "fashion-editor-transient-object"
            : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <Group
            id={
                object.id
            }
            name={
                rootName
            }
            objectId={
                object.id
            }
            editorObjectId={
                object.id
            }
            objectType={
                object.type ||
                "brush"
            }
            layerId={
                object.layerId ||
                layer?.id
            }
            editorObject
            editorObjectRoot
            transient={
                isTransient
            }
            x={
                numberOr(
                    object.x,
                    0
                )
            }
            y={
                numberOr(
                    object.y,
                    0
                )
            }
            rotation={
                numberOr(
                    object.rotation,
                    0
                )
            }
            scaleX={
                numberOr(
                    object.scaleX,
                    1
                )
            }
            scaleY={
                numberOr(
                    object.scaleY,
                    1
                )
            }
            skewX={
                numberOr(
                    object.skewX,
                    0
                )
            }
            skewY={
                numberOr(
                    object.skewY,
                    0
                )
            }
            offsetX={
                numberOr(
                    object.offsetX,
                    0
                )
            }
            offsetY={
                numberOr(
                    object.offsetY,
                    0
                )
            }
            visible={
                visible
            }
            opacity={
                resolveObjectOpacity(
                    object
                )
            }
            listening={
                canListen
            }
            draggable={
                canDrag
            }
            onPointerDown={
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
            {renderMode ===
                "outline" && (
                <OutlineGeometry
                    geometry={
                        outlineGeometry
                    }
                    color={
                        color
                    }
                    strokeOpacity={
                        strokeOpacity
                    }
                    compositeOperation={
                        compositeOperation
                    }
                    commonAttributes={
                        commonAttributes
                    }
                />
            )}

            {renderMode ===
                "stamp" && (
                <StampGeometry
                    stamps={
                        stamps
                    }
                    color={
                        color
                    }
                    strokeOpacity={
                        strokeOpacity
                    }
                    compositeOperation={
                        compositeOperation
                    }
                    commonAttributes={
                        commonAttributes
                    }
                />
            )}

            {renderMode ===
                "line" && (
                <LineGeometry
                    object={
                        object
                    }
                    color={
                        color
                    }
                    strokeWidth={
                        strokeWidth
                    }
                    strokeOpacity={
                        strokeOpacity
                    }
                    compositeOperation={
                        compositeOperation
                    }
                    commonAttributes={
                        commonAttributes
                    }
                />
            )}
        </Group>
    );
}

/*=========================================================
Export
=========================================================*/

BrushObject.displayName =
    "BrushObject";

export default memo(
    BrushObject
);