/*
=========================================================
FashionVision Professional Editor
Pencil Tool
Version 1.1 — Symmetry Integrated
=========================================================
*/

import {
    defineTool,
    POINTER_BUTTONS
} from "./ToolManager";

import {
    EDITOR_TOOLS,
    OBJECT_TYPES,
    SYMMETRY_MODES,
    useFashionEditorStore
} from "../useFashionEditorStore";

import {
    createSymmetryObjectSet,
    createSymmetryPreviewObjects,
    normalizeSymmetryConfig,
    shouldMirrorTool
} from "../utils/SymmetryUtils";

/*=========================================================
Pencil Tool Constants
=========================================================*/

export const PENCIL_TOOL_ID =
    EDITOR_TOOLS.PENCIL;

export const DEFAULT_PENCIL_TOOL_OPTIONS =
    Object.freeze({
        minimumDistance:
            0.65,

        sizeDistanceFactor:
            0.08,

        simplifyEnabled:
            true,

        simplifyTolerance:
            0.35,

        smoothingToleranceFactor:
            0.75,

        clipToDocument:
            true,

        selectAfterDraw:
            false,

        allowSinglePointDot:
            true,

        straightLineWithShift:
            true,

        symmetryPreviewEnabled:
            true,

        symmetrySnapThreshold:
            8,

        preventSymmetryDuplicates:
            true,

        maximumPoints:
            20000
    });

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

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        !Array.isArray(
            value
        )
    );
}

function isFunction(
    value
) {
    return (
        typeof value ===
        "function"
    );
}

function nowIso() {
    return new Date()
        .toISOString();
}

function createId(
    prefix = "stroke"
) {
    if (
        typeof crypto !==
            "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return (
        `${prefix}-${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

/*=========================================================
Point Helpers
=========================================================*/

function isFinitePoint(
    point
) {
    return Boolean(
        point &&
        Number.isFinite(
            Number(
                point.x
            )
        ) &&
        Number.isFinite(
            Number(
                point.y
            )
        )
    );
}

function clonePoint(
    point
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return null;
    }

    return {
        ...point,

        x:
            Number(
                point.x
            ),

        y:
            Number(
                point.y
            )
    };
}

function distanceBetweenPoints(
    pointA,
    pointB
) {
    if (
        !isFinitePoint(
            pointA
        ) ||
        !isFinitePoint(
            pointB
        )
    ) {
        return 0;
    }

    return Math.hypot(
        Number(
            pointB.x
        ) -
        Number(
            pointA.x
        ),

        Number(
            pointB.y
        ) -
        Number(
            pointA.y
        )
    );
}

/*=========================================================
Resolve Store State
=========================================================*/

function resolveEditorState(
    context
) {
    if (
        context?.state &&
        isPlainObject(
            context.state
        )
    ) {
        return context.state;
    }

    if (
        context?.editorState &&
        isPlainObject(
            context.editorState
        )
    ) {
        return context.editorState;
    }

    if (
        isFunction(
            context?.store?.getState
        )
    ) {
        return context.store
            .getState();
    }

    if (
        isFunction(
            context
                ?.editorStore
                ?.getState
        )
    ) {
        return context.editorStore
            .getState();
    }

    return useFashionEditorStore
        .getState();
}

/*=========================================================
Resolve Store Actions
=========================================================*/

function resolveEditorActions(
    context
) {
    if (
        context?.actions &&
        isPlainObject(
            context.actions
        )
    ) {
        return context.actions;
    }

    return resolveEditorState(
        context
    );
}

/*=========================================================
Resolve Document
=========================================================*/

function resolveDocument(
    context
) {
    return (
        context?.document ||
        resolveEditorState(
            context
        )?.document ||
        null
    );
}

/*=========================================================
Resolve Active Layer
=========================================================*/

function resolveActiveLayer(
    context
) {
    const state =
        resolveEditorState(
            context
        );

    if (
        !state
    ) {
        return null;
    }

    const activeLayerId =
        context?.activeLayerId ||
        state.activeLayerId;

    return (
        state.layers?.find(
            layer =>
                layer.id ===
                activeLayerId
        ) ||
        null
    );
}

/*=========================================================
Resolve Brush Settings
=========================================================*/

function resolveBrushSettings(
    context
) {
    const state =
        resolveEditorState(
            context
        );

    const source = {
        ...state?.brush,
        ...context?.brush
    };

    return {
        presetId:
            source.presetId ||
            "pencil-basic",

        brushType:
            source.brushType ||
            "pencil",

        color:
            typeof source.color ===
                "string"
                ? source.color
                : "#111111",

        size:
            clamp(
                source.size ??
                4,
                0.25,
                300
            ),

        opacity:
            clamp(
                source.opacity ??
                1,
                0.01,
                1
            ),

        smoothing:
            clamp(
                source.smoothing ??
                0.55,
                0,
                1
            ),

        streamline:
            clamp(
                source.streamline ??
                0.45,
                0,
                1
            ),

        thinning:
            clamp(
                source.thinning ??
                0,
                -1,
                1
            ),

        taperStart:
            Math.max(
                0,

                numberOr(
                    source.taperStart,
                    0
                )
            ),

        taperEnd:
            Math.max(
                0,

                numberOr(
                    source.taperEnd,
                    0
                )
            ),

        pressureEnabled:
            source.pressureEnabled !==
            false,

        simulatePressure:
            source.simulatePressure !==
            false
    };
}

/*=========================================================
Resolve Symmetry Settings
=========================================================*/

function resolveSymmetrySettings(
    context,
    documentData
) {
    const state =
        resolveEditorState(
            context
        );

    const source = {
        ...state?.symmetry,
        ...context?.symmetry
    };

    const normalized =
        normalizeSymmetryConfig(
            source,
            documentData
        );

    return {
        ...normalized,

        enabled:
            shouldMirrorTool(
                PENCIL_TOOL_ID,
                normalized
            )
    };
}

/*=========================================================
Document Boundary Helpers
=========================================================*/

function getDocumentBounds(
    documentData
) {
    const width =
        Math.max(
            1,

            numberOr(
                documentData?.width,
                1200
            )
        );

    const height =
        Math.max(
            1,

            numberOr(
                documentData?.height,
                1600
            )
        );

    return {
        left:
            0,

        top:
            0,

        right:
            width,

        bottom:
            height,

        width,

        height
    };
}

function isPointInsideDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return false;
    }

    const bounds =
        getDocumentBounds(
            documentData
        );

    return (
        point.x >=
            bounds.left &&
        point.y >=
            bounds.top &&
        point.x <=
            bounds.right &&
        point.y <=
            bounds.bottom
    );
}

function clampPointToDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return null;
    }

    const bounds =
        getDocumentBounds(
            documentData
        );

    return {
        x:
            clamp(
                point.x,
                bounds.left,
                bounds.right
            ),

        y:
            clamp(
                point.y,
                bounds.top,
                bounds.bottom
            )
    };
}

function resolveDrawingPoint(
    point,
    documentData,
    options
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return null;
    }

    if (
        !options.clipToDocument
    ) {
        return {
            x:
                Number(
                    point.x
                ),

            y:
                Number(
                    point.y
                )
        };
    }

    return clampPointToDocument(
        point,
        documentData
    );
}

/*=========================================================
Symmetry Snapping
=========================================================*/

function snapDrawingPointToSymmetryAxes(
    point,
    symmetry,
    threshold
) {
    if (
        !isFinitePoint(
            point
        ) ||
        !symmetry?.enabled ||
        !symmetry?.snapToAxis
    ) {
        return clonePoint(
            point
        );
    }

    const result =
        clonePoint(
            point
        );

    const distance =
        Math.max(
            0,

            numberOr(
                threshold,
                8
            )
        );

    if (
        symmetry.mode ===
            SYMMETRY_MODES.VERTICAL ||
        symmetry.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        if (
            Math.abs(
                result.x -
                symmetry.axisX
            ) <=
            distance
        ) {
            result.x =
                symmetry.axisX;
        }
    }

    if (
        symmetry.mode ===
            SYMMETRY_MODES.HORIZONTAL ||
        symmetry.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        if (
            Math.abs(
                result.y -
                symmetry.axisY
            ) <=
            distance
        ) {
            result.y =
                symmetry.axisY;
        }
    }

    return result;
}

/*=========================================================
Pressure Helpers
=========================================================*/

function calculateSimulatedPressure(
    currentPoint,
    previousPoint,
    currentTimestamp,
    previousTimestamp,
    previousPressure
) {
    if (
        !previousPoint ||
        !Number.isFinite(
            previousTimestamp
        )
    ) {
        return 0.45;
    }

    const distance =
        distanceBetweenPoints(
            previousPoint,
            currentPoint
        );

    const elapsed =
        Math.max(
            1,

            currentTimestamp -
            previousTimestamp
        );

    const velocity =
        distance /
        elapsed;

    const targetPressure =
        clamp(
            0.82 -
            velocity *
            0.38,
            0.18,
            0.85
        );

    return clamp(
        numberOr(
            previousPressure,
            0.45
        ) *
            0.65 +
        targetPressure *
            0.35,
        0.05,
        1
    );
}

function resolvePressure(
    context,
    brush,
    currentPoint,
    previousPoint,
    timestamp
) {
    if (
        !brush.pressureEnabled
    ) {
        return 0.5;
    }

    const nativePressure =
        clamp(
            context?.pressure ??
            0.5,
            0,
            1
        );

    const pointerType =
        context?.pointerType ||
        "mouse";

    if (
        pointerType ===
            "pen" &&
        nativePressure >
            0
    ) {
        return nativePressure;
    }

    if (
        !brush.simulatePressure
    ) {
        return nativePressure >
            0
            ? nativePressure
            : 0.5;
    }

    return calculateSimulatedPressure(
        currentPoint,
        previousPoint,
        timestamp,
        previousPoint?.timestamp,
        previousPoint?.pressure
    );
}

/*=========================================================
Create Sample Point
=========================================================*/

function createSamplePoint(
    context,
    brush,
    documentData,
    options,
    previousPoint = null,
    symmetry = null
) {
    let drawingPoint =
        resolveDrawingPoint(
            context.point,
            documentData,
            options
        );

    if (
        !drawingPoint
    ) {
        return null;
    }

    drawingPoint =
        snapDrawingPointToSymmetryAxes(
            drawingPoint,
            symmetry,
            options.symmetrySnapThreshold
        );

    if (
        options.clipToDocument
    ) {
        drawingPoint =
            clampPointToDocument(
                drawingPoint,
                documentData
            );
    }

    if (
        !drawingPoint
    ) {
        return null;
    }

    const timestamp =
        Date.now();

    return {
        x:
            drawingPoint.x,

        y:
            drawingPoint.y,

        pressure:
            resolvePressure(
                context,
                brush,
                drawingPoint,
                previousPoint,
                timestamp
            ),

        tiltX:
            numberOr(
                context.tiltX,
                0
            ),

        tiltY:
            numberOr(
                context.tiltY,
                0
            ),

        twist:
            numberOr(
                context.twist,
                0
            ),

        pointerWidth:
            Math.max(
                1,

                numberOr(
                    context.width,
                    1
                )
            ),

        pointerHeight:
            Math.max(
                1,

                numberOr(
                    context.height,
                    1
                )
            ),

        timestamp
    };
}

/*=========================================================
Point Collection Helpers
=========================================================*/

function getMinimumPointDistance(
    brush,
    options
) {
    return Math.max(
        options.minimumDistance,

        brush.size *
        options.sizeDistanceFactor
    );
}

function appendPoint(
    points,
    nextPoint,
    minimumDistance,
    maximumPoints,
    force = false
) {
    if (
        !isFinitePoint(
            nextPoint
        )
    ) {
        return points;
    }

    if (
        !Array.isArray(
            points
        ) ||
        points.length ===
            0
    ) {
        return [
            nextPoint
        ];
    }

    if (
        points.length >=
        maximumPoints
    ) {
        return points;
    }

    const previousPoint =
        points[
            points.length -
            1
        ];

    const distance =
        distanceBetweenPoints(
            previousPoint,
            nextPoint
        );

    if (
        !force &&
        distance <
        minimumDistance
    ) {
        return points;
    }

    return [
        ...points,
        nextPoint
    ];
}

/*=========================================================
Ramer-Douglas-Peucker Simplification
=========================================================*/

function squaredDistance(
    pointA,
    pointB
) {
    const deltaX =
        pointA.x -
        pointB.x;

    const deltaY =
        pointA.y -
        pointB.y;

    return (
        deltaX *
        deltaX +
        deltaY *
        deltaY
    );
}

function squaredSegmentDistance(
    point,
    segmentStart,
    segmentEnd
) {
    let x =
        segmentStart.x;

    let y =
        segmentStart.y;

    let deltaX =
        segmentEnd.x -
        x;

    let deltaY =
        segmentEnd.y -
        y;

    if (
        deltaX !==
            0 ||
        deltaY !==
            0
    ) {
        const interpolation =
            (
                (
                    point.x -
                    x
                ) *
                deltaX +
                (
                    point.y -
                    y
                ) *
                deltaY
            ) /
            (
                deltaX *
                deltaX +
                deltaY *
                deltaY
            );

        if (
            interpolation >
            1
        ) {
            x =
                segmentEnd.x;

            y =
                segmentEnd.y;
        } else if (
            interpolation >
            0
        ) {
            x +=
                deltaX *
                interpolation;

            y +=
                deltaY *
                interpolation;
        }
    }

    deltaX =
        point.x -
        x;

    deltaY =
        point.y -
        y;

    return (
        deltaX *
        deltaX +
        deltaY *
        deltaY
    );
}

function simplifyRadialDistance(
    points,
    squaredTolerance
) {
    if (
        points.length <=
        2
    ) {
        return [
            ...points
        ];
    }

    let previousPoint =
        points[0];

    const simplified = [
        previousPoint
    ];

    for (
        let index = 1;
        index <
        points.length;
        index += 1
    ) {
        const currentPoint =
            points[
                index
            ];

        if (
            squaredDistance(
                currentPoint,
                previousPoint
            ) >
            squaredTolerance
        ) {
            simplified.push(
                currentPoint
            );

            previousPoint =
                currentPoint;
        }
    }

    const lastPoint =
        points[
            points.length -
            1
        ];

    if (
        previousPoint !==
        lastPoint
    ) {
        simplified.push(
            lastPoint
        );
    }

    return simplified;
}

function simplifyDouglasPeuckerStep(
    points,
    firstIndex,
    lastIndex,
    squaredTolerance,
    simplified
) {
    let maximumSquaredDistance =
        squaredTolerance;

    let selectedIndex =
        -1;

    for (
        let index =
            firstIndex +
            1;
        index <
        lastIndex;
        index += 1
    ) {
        const currentSquaredDistance =
            squaredSegmentDistance(
                points[
                    index
                ],
                points[
                    firstIndex
                ],
                points[
                    lastIndex
                ]
            );

        if (
            currentSquaredDistance >
            maximumSquaredDistance
        ) {
            selectedIndex =
                index;

            maximumSquaredDistance =
                currentSquaredDistance;
        }
    }

    if (
        selectedIndex <
        0
    ) {
        return;
    }

    if (
        selectedIndex -
        firstIndex >
        1
    ) {
        simplifyDouglasPeuckerStep(
            points,
            firstIndex,
            selectedIndex,
            squaredTolerance,
            simplified
        );
    }

    simplified.push(
        points[
            selectedIndex
        ]
    );

    if (
        lastIndex -
        selectedIndex >
        1
    ) {
        simplifyDouglasPeuckerStep(
            points,
            selectedIndex,
            lastIndex,
            squaredTolerance,
            simplified
        );
    }
}

function simplifyDouglasPeucker(
    points,
    squaredTolerance
) {
    if (
        points.length <=
        2
    ) {
        return [
            ...points
        ];
    }

    const lastIndex =
        points.length -
        1;

    const simplified = [
        points[0]
    ];

    simplifyDouglasPeuckerStep(
        points,
        0,
        lastIndex,
        squaredTolerance,
        simplified
    );

    simplified.push(
        points[
            lastIndex
        ]
    );

    return simplified;
}

export function simplifyPencilPoints(
    points,
    tolerance = 0.5
) {
    if (
        !Array.isArray(
            points
        ) ||
        points.length <=
            2
    ) {
        return Array.isArray(
            points
        )
            ? [
                ...points
            ]
            : [];
    }

    const safeTolerance =
        Math.max(
            0,

            numberOr(
                tolerance,
                0.5
            )
        );

    if (
        safeTolerance ===
        0
    ) {
        return [
            ...points
        ];
    }

    const squaredTolerance =
        safeTolerance *
        safeTolerance;

    const radialSimplified =
        simplifyRadialDistance(
            points,
            squaredTolerance
        );

    return simplifyDouglasPeucker(
        radialSimplified,
        squaredTolerance
    );
}

/*=========================================================
Calculate Stroke Bounds
=========================================================*/

export function calculatePencilStrokeBounds(
    points,
    strokeSize = 1
) {
    const validPoints =
        Array.isArray(
            points
        )
            ? points.filter(
                isFinitePoint
            )
            : [];

    if (
        validPoints.length ===
        0
    ) {
        return {
            x:
                0,

            y:
                0,

            width:
                0,

            height:
                0,

            minX:
                0,

            minY:
                0,

            maxX:
                0,

            maxY:
                0
        };
    }

    const halfSize =
        Math.max(
            0,

            numberOr(
                strokeSize,
                1
            ) /
            2
        );

    const xs =
        validPoints.map(
            point =>
                point.x
        );

    const ys =
        validPoints.map(
            point =>
                point.y
        );

    const minX =
        Math.min(
            ...xs
        ) -
        halfSize;

    const minY =
        Math.min(
            ...ys
        ) -
        halfSize;

    const maxX =
        Math.max(
            ...xs
        ) +
        halfSize;

    const maxY =
        Math.max(
            ...ys
        ) +
        halfSize;

    return {
        x:
            minX,

        y:
            minY,

        width:
            Math.max(
                0,
                maxX -
                minX
            ),

        height:
            Math.max(
                0,
                maxY -
                minY
            ),

        minX,

        minY,

        maxX,

        maxY
    };
}

/*=========================================================
Create Dot Points
=========================================================*/

function createDotPoints(
    point,
    brush
) {
    const offset =
        Math.max(
            0.01,

            brush.size *
            0.005
        );

    return [
        {
            ...point
        },

        {
            ...point,

            x:
                point.x +
                offset,

            timestamp:
                point.timestamp +
                1
        }
    ];
}

/*=========================================================
Finalize Stroke Points
=========================================================*/

function finalizeStrokePoints(
    session,
    options
) {
    const rawPoints =
        Array.isArray(
            session?.points
        )
            ? session.points.filter(
                isFinitePoint
            )
            : [];

    if (
        rawPoints.length ===
        0
    ) {
        return [];
    }

    if (
        session.straightLine
    ) {
        const firstPoint =
            rawPoints[0];

        const lastPoint =
            rawPoints[
                rawPoints.length -
                1
            ];

        if (
            distanceBetweenPoints(
                firstPoint,
                lastPoint
            ) <
            0.01
        ) {
            return options
                .allowSinglePointDot
                ? createDotPoints(
                    firstPoint,
                    session.brush
                )
                : [];
        }

        return [
            firstPoint,
            lastPoint
        ];
    }

    if (
        rawPoints.length ===
        1
    ) {
        return options
            .allowSinglePointDot
            ? createDotPoints(
                rawPoints[0],
                session.brush
            )
            : [];
    }

    if (
        !options.simplifyEnabled
    ) {
        return [
            ...rawPoints
        ];
    }

    const tolerance =
        Math.max(
            options.simplifyTolerance,

            session.brush.size *
            session.brush.smoothing *
            options.smoothingToleranceFactor *
            0.1
        );

    const simplified =
        simplifyPencilPoints(
            rawPoints,
            tolerance
        );

    if (
        simplified.length ===
        1
    ) {
        return options
            .allowSinglePointDot
            ? createDotPoints(
                simplified[0],
                session.brush
            )
            : [];
    }

    return simplified;
}

/*=========================================================
Create Stroke Object
=========================================================*/

function createStrokeObject(
    session,
    points
) {
    const bounds =
        calculatePencilStrokeBounds(
            points,
            session.brush.size
        );

    return {
        id:
            session.strokeId,

        type:
            OBJECT_TYPES.BRUSH,

        name:
            "Pencil Stroke",

        layerId:
            session.layerId,

        brushType:
            "pencil",

        presetId:
            session.brush.presetId,

        points,

        color:
            session.brush.color,

        size:
            session.brush.size,

        opacity:
            session.brush.opacity,

        smoothing:
            session.brush.smoothing,

        streamline:
            session.brush.streamline,

        thinning:
            session.brush.thinning,

        taperStart:
            session.brush.taperStart,

        taperEnd:
            session.brush.taperEnd,

        pressureEnabled:
            session.brush.pressureEnabled,

        simulatePressure:
            session.brush.simulatePressure,

        lineCap:
            "round",

        lineJoin:
            "round",

        tension:
            clamp(
                session.brush.smoothing,
                0,
                1
            ),

        compositeOperation:
            "source-over",

        visible:
            true,

        locked:
            false,

        x:
            0,

        y:
            0,

        rotation:
            0,

        scaleX:
            1,

        scaleY:
            1,

        bounds,

        metadata: {
            tool:
                PENCIL_TOOL_ID,

            pointerType:
                session.pointerType,

            rawPointCount:
                session.points.length,

            finalPointCount:
                points.length,

            straightLine:
                session.straightLine,

            startedAt:
                session.startedAt,

            completedAt:
                nowIso()
        }
    };
}

/*=========================================================
Create Temporary Preview Object
=========================================================*/

function createTemporaryStrokeObject(
    session
) {
    return {
        id:
            session.strokeId,

        type:
            OBJECT_TYPES.BRUSH,

        name:
            "Pencil Preview",

        layerId:
            session.layerId,

        brushType:
            "pencil",

        presetId:
            session.brush.presetId,

        points:
            session.points,

        color:
            session.brush.color,

        size:
            session.brush.size,

        opacity:
            session.brush.opacity,

        smoothing:
            session.brush.smoothing,

        streamline:
            session.brush.streamline,

        thinning:
            session.brush.thinning,

        taperStart:
            session.brush.taperStart,

        taperEnd:
            session.brush.taperEnd,

        pressureEnabled:
            session.brush.pressureEnabled,

        simulatePressure:
            session.brush.simulatePressure,

        lineCap:
            "round",

        lineJoin:
            "round",

        tension:
            clamp(
                session.brush.smoothing,
                0,
                1
            ),

        compositeOperation:
            "source-over",

        visible:
            true,

        locked:
            true,

        transient:
            true,

        selectable:
            false,

        listening:
            false,

        x:
            0,

        y:
            0,

        rotation:
            0,

        scaleX:
            1,

        scaleY:
            1
    };
}

/*=========================================================
Publish Temporary Stroke
=========================================================*/

function publishTemporaryStroke(
    context,
    session
) {
    const temporaryObject =
        createTemporaryStrokeObject(
            session
        );

    const symmetryTemporaryObjects =
        session.symmetry?.enabled &&
        session.options
            .symmetryPreviewEnabled !==
            false
            ? createSymmetryPreviewObjects(
                temporaryObject,
                session.symmetry,
                {
                    document:
                        session.document,

                    preventDuplicates:
                        session.options
                            .preventSymmetryDuplicates !==
                        false,

                    previewIdPrefix:
                        `${session.strokeId}-symmetry-preview`
                }
            )
            : [];

    const temporaryObjects = [
        temporaryObject,
        ...symmetryTemporaryObjects
    ];

    context.manager?.setToolState(
        PENCIL_TOOL_ID,
        {
            temporaryObject,

            temporaryObjects,

            symmetryTemporaryObjects,

            drawing:
                true
        }
    );

    if (
        isFunction(
            context.setTemporaryObject
        )
    ) {
        context.setTemporaryObject(
            temporaryObject
        );
    }

    if (
        isFunction(
            context.setTemporaryObjects
        )
    ) {
        context.setTemporaryObjects(
            temporaryObjects
        );
    }

    if (
        isFunction(
            context.onTemporaryObjectChange
        )
    ) {
        context.onTemporaryObjectChange(
            temporaryObject
        );
    }

    if (
        isFunction(
            context.onTemporaryObjectsChange
        )
    ) {
        context.onTemporaryObjectsChange(
            temporaryObjects
        );
    }

    context.requestRender?.();

    return temporaryObjects;
}

/*=========================================================
Clear Temporary Stroke
=========================================================*/

function clearTemporaryStroke(
    context
) {
    context?.manager?.setToolState(
        PENCIL_TOOL_ID,
        {
            temporaryObject:
                null,

            temporaryObjects:
                [],

            symmetryTemporaryObjects:
                [],

            drawing:
                false
        }
    );

    if (
        isFunction(
            context?.setTemporaryObject
        )
    ) {
        context.setTemporaryObject(
            null
        );
    }

    if (
        isFunction(
            context?.setTemporaryObjects
        )
    ) {
        context.setTemporaryObjects(
            []
        );
    }

    if (
        isFunction(
            context
                ?.onTemporaryObjectChange
        )
    ) {
        context.onTemporaryObjectChange(
            null
        );
    }

    if (
        isFunction(
            context
                ?.onTemporaryObjectsChange
        )
    ) {
        context.onTemporaryObjectsChange(
            []
        );
    }

    context?.requestRender?.();
}

/*=========================================================
Create Pencil Session
=========================================================*/

function createPencilSession({
    strokeId,
    layerId,
    brush,
    firstPoint,
    context,
    documentData,
    symmetry,
    options
}) {
    return {
        strokeId,

        layerId,

        brush,

        document: {
            width:
                numberOr(
                    documentData?.width,
                    1200
                ),

            height:
                numberOr(
                    documentData?.height,
                    1600
                )
        },

        symmetry,

        options,

        pointerId:
            context.pointerId,

        pointerType:
            context.pointerType,

        startedAt:
            nowIso(),

        startedTimestamp:
            Date.now(),

        straightLine:
            Boolean(
                options
                    .straightLineWithShift &&
                context.shiftKey
            ),

        points: [
            firstPoint
        ]
    };
}

/*=========================================================
Create Committed Stroke Objects
=========================================================*/

function createCommittedStrokeObjects(
    strokeObject,
    session,
    documentData,
    options
) {
    if (
        !session.symmetry?.enabled
    ) {
        return [
            strokeObject
        ];
    }

    return createSymmetryObjectSet(
        strokeObject,
        session.symmetry,
        {
            document:
                session.document ||
                documentData,

            preventDuplicates:
                options
                    .preventSymmetryDuplicates !==
                false,

            linked:
                session.symmetry
                    .linkedMirrors ===
                true
        }
    );
}

/*=========================================================
Commit Stroke Objects
=========================================================*/

function commitStrokeObjects(
    actions,
    objects,
    options
) {
    if (
        !Array.isArray(
            objects
        ) ||
        objects.length ===
            0
    ) {
        return [];
    }

    const label =
        objects.length >
        1
            ? "Draw symmetrical pencil stroke"
            : "Draw pencil stroke";

    if (
        isFunction(
            actions?.addObjects
        )
    ) {
        const ids =
            actions.addObjects(
                objects,
                {
                    label,

                    select:
                        options.selectAfterDraw
                }
            );

        return Array.isArray(
            ids
        )
            ? ids
            : [];
    }

    if (
        !isFunction(
            actions?.addObject
        )
    ) {
        return [];
    }

    const objectIds =
        [];

    const useTransaction =
        objects.length >
            1 &&
        isFunction(
            actions.beginHistoryTransaction
        ) &&
        isFunction(
            actions.commitHistoryTransaction
        );

    if (
        useTransaction
    ) {
        actions.beginHistoryTransaction(
            label
        );
    }

    try {
        for (
            const object
            of objects
        ) {
            const objectId =
                actions.addObject(
                    object,
                    {
                        label,

                        select:
                            options.selectAfterDraw
                    }
                );

            if (
                !objectId
            ) {
                throw new Error(
                    "Pencil object could not be added."
                );
            }

            objectIds.push(
                objectId
            );
        }

        if (
            useTransaction
        ) {
            actions.commitHistoryTransaction();
        }

        return objectIds;
    } catch (error) {
        if (
            useTransaction &&
            isFunction(
                actions.cancelHistoryTransaction
            )
        ) {
            actions.cancelHistoryTransaction();
        } else if (
            objectIds.length >
                0 &&
            isFunction(
                actions.deleteObjects
            )
        ) {
            actions.deleteObjects(
                objectIds,
                "Rollback pencil stroke"
            );
        }

        console.error(
            "PencilTool commit failed:",
            error
        );

        return [];
    }
}

/*=========================================================
Create Pencil Tool
=========================================================*/

export function createPencilTool(
    toolOptions = {}
) {
    const options = {
        ...DEFAULT_PENCIL_TOOL_OPTIONS,
        ...toolOptions,

        minimumDistance:
            Math.max(
                0,

                numberOr(
                    toolOptions
                        .minimumDistance,
                    DEFAULT_PENCIL_TOOL_OPTIONS
                        .minimumDistance
                )
            ),

        sizeDistanceFactor:
            Math.max(
                0,

                numberOr(
                    toolOptions
                        .sizeDistanceFactor,
                    DEFAULT_PENCIL_TOOL_OPTIONS
                        .sizeDistanceFactor
                )
            ),

        simplifyTolerance:
            Math.max(
                0,

                numberOr(
                    toolOptions
                        .simplifyTolerance,
                    DEFAULT_PENCIL_TOOL_OPTIONS
                        .simplifyTolerance
                )
            ),

        smoothingToleranceFactor:
            Math.max(
                0,

                numberOr(
                    toolOptions
                        .smoothingToleranceFactor,
                    DEFAULT_PENCIL_TOOL_OPTIONS
                        .smoothingToleranceFactor
                )
            ),

        symmetrySnapThreshold:
            Math.max(
                0,

                numberOr(
                    toolOptions
                        .symmetrySnapThreshold,
                    DEFAULT_PENCIL_TOOL_OPTIONS
                        .symmetrySnapThreshold
                )
            ),

        maximumPoints:
            Math.max(
                100,

                Math.floor(
                    numberOr(
                        toolOptions
                            .maximumPoints,
                        DEFAULT_PENCIL_TOOL_OPTIONS
                            .maximumPoints
                    )
                )
            )
    };

    return defineTool({
        id:
            PENCIL_TOOL_ID,

        label:
            "Pencil",

        description:
            "Draw smooth freehand pencil strokes with optional symmetry.",

        cursor:
            "crosshair",

        shortcut:
            "P",

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        preventDefault:
            true,

        stopPropagation:
            false,

        /*---------------------------------------------
        Activate
        ---------------------------------------------*/

        onActivate:
            context => {
                clearTemporaryStroke(
                    context
                );
            },

        /*---------------------------------------------
        Pointer Down
        ---------------------------------------------*/

        onPointerDown:
            context => {
                if (
                    context.button !==
                    POINTER_BUTTONS.LEFT
                ) {
                    return null;
                }

                const documentData =
                    resolveDocument(
                        context
                    );

                const activeLayer =
                    resolveActiveLayer(
                        context
                    );

                if (
                    !documentData ||
                    !activeLayer ||
                    activeLayer.locked ||
                    activeLayer.visible ===
                        false
                ) {
                    context.cancelInteraction?.(
                        "active-layer-unavailable"
                    );

                    return null;
                }

                if (
                    !isFinitePoint(
                        context.point
                    )
                ) {
                    context.cancelInteraction?.(
                        "invalid-pointer-position"
                    );

                    return null;
                }

                if (
                    options.clipToDocument &&
                    !isPointInsideDocument(
                        context.point,
                        documentData
                    )
                ) {
                    context.cancelInteraction?.(
                        "pointer-outside-document"
                    );

                    return null;
                }

                const brush =
                    resolveBrushSettings(
                        context
                    );

                const symmetry =
                    resolveSymmetrySettings(
                        context,
                        documentData
                    );

                const firstPoint =
                    createSamplePoint(
                        context,
                        brush,
                        documentData,
                        options,
                        null,
                        symmetry
                    );

                if (
                    !firstPoint
                ) {
                    context.cancelInteraction?.(
                        "failed-to-create-point"
                    );

                    return null;
                }

                const session =
                    createPencilSession({
                        strokeId:
                            createId(
                                "pencil"
                            ),

                        layerId:
                            activeLayer.id,

                        brush,

                        firstPoint,

                        context,

                        documentData,

                        symmetry,

                        options
                    });

                context.replaceInteractionData?.(
                    session
                );

                publishTemporaryStroke(
                    context,
                    session
                );

                context.onStrokeStart?.(
                    session
                );

                return session;
            },

        /*---------------------------------------------
        Pointer Move
        ---------------------------------------------*/

        onPointerMove:
            context => {
                const session =
                    context.interaction
                        ?.data;

                if (
                    !session ||
                    !session.strokeId
                ) {
                    return null;
                }

                const documentData =
                    resolveDocument(
                        context
                    );

                const previousPoint =
                    session.points[
                        session.points.length -
                        1
                    ];

                const nextPoint =
                    createSamplePoint(
                        context,
                        session.brush,
                        documentData,
                        options,
                        previousPoint,
                        session.symmetry
                    );

                if (
                    !nextPoint
                ) {
                    return null;
                }

                let nextPoints;

                if (
                    session.straightLine
                ) {
                    nextPoints = [
                        session.points[0],
                        nextPoint
                    ];
                } else {
                    nextPoints =
                        appendPoint(
                            session.points,
                            nextPoint,
                            getMinimumPointDistance(
                                session.brush,
                                options
                            ),
                            options.maximumPoints
                        );
                }

                if (
                    nextPoints ===
                    session.points
                ) {
                    return null;
                }

                const nextSession = {
                    ...session,

                    points:
                        nextPoints
                };

                context.replaceInteractionData?.(
                    nextSession
                );

                publishTemporaryStroke(
                    context,
                    nextSession
                );

                context.onStrokeChange?.(
                    nextSession
                );

                return nextSession;
            },

        /*---------------------------------------------
        Pointer Up
        ---------------------------------------------*/

        onPointerUp:
            context => {
                let session =
                    context.interaction
                        ?.data;

                if (
                    !session
                ) {
                    clearTemporaryStroke(
                        context
                    );

                    return null;
                }

                const documentData =
                    resolveDocument(
                        context
                    );

                const previousPoint =
                    session.points[
                        session.points.length -
                        1
                    ];

                const finalSample =
                    createSamplePoint(
                        context,
                        session.brush,
                        documentData,
                        options,
                        previousPoint,
                        session.symmetry
                    );

                if (
                    finalSample
                ) {
                    session = {
                        ...session,

                        points:
                            session.straightLine
                                ? [
                                    session.points[0],
                                    finalSample
                                ]
                                : appendPoint(
                                    session.points,
                                    finalSample,
                                    0,
                                    options.maximumPoints,
                                    true
                                )
                    };
                }

                const finalPoints =
                    finalizeStrokePoints(
                        session,
                        options
                    );

                clearTemporaryStroke(
                    context
                );

                if (
                    finalPoints.length <
                    2
                ) {
                    context.onStrokeDiscarded?.({
                        reason:
                            "insufficient-points",

                        session
                    });

                    return null;
                }

                const actions =
                    resolveEditorActions(
                        context
                    );

                if (
                    !isFunction(
                        actions?.addObject
                    ) &&
                    !isFunction(
                        actions?.addObjects
                    )
                ) {
                    console.error(
                        "PencilTool: addObject/addObjects actions are unavailable."
                    );

                    return null;
                }

                const strokeObject =
                    createStrokeObject(
                        session,
                        finalPoints
                    );

                const committedObjects =
                    createCommittedStrokeObjects(
                        strokeObject,
                        session,
                        documentData,
                        options
                    );

                const objectIds =
                    commitStrokeObjects(
                        actions,
                        committedObjects,
                        options
                    );

                if (
                    objectIds.length ===
                    0
                ) {
                    context.onStrokeDiscarded?.({
                        reason:
                            "objects-not-added",

                        session,

                        object:
                            strokeObject,

                        objects:
                            committedObjects
                    });

                    return null;
                }

                const objectId =
                    objectIds[0];

                context.manager?.setToolState(
                    PENCIL_TOOL_ID,
                    {
                        temporaryObject:
                            null,

                        temporaryObjects:
                            [],

                        symmetryTemporaryObjects:
                            [],

                        drawing:
                            false,

                        lastCommittedObjectId:
                            objectId,

                        lastCommittedObjectIds:
                            objectIds
                    }
                );

                context.onStrokeCommitted?.({
                    objectId,

                    objectIds,

                    object:
                        committedObjects[0] ||
                        strokeObject,

                    objects:
                        committedObjects,

                    mirroredObjects:
                        committedObjects.slice(
                            1
                        ),

                    symmetry:
                        session.symmetry,

                    session
                });

                return objectId;
            },

        /*---------------------------------------------
        Pointer Cancel
        ---------------------------------------------*/

        onPointerCancel:
            context => {
                clearTemporaryStroke(
                    context
                );
            },

        /*---------------------------------------------
        Cancel
        ---------------------------------------------*/

        onCancel:
            context => {
                const session =
                    context.interaction
                        ?.data;

                clearTemporaryStroke(
                    context
                );

                context.onStrokeCancelled?.({
                    reason:
                        context.cancelReason ||
                        "cancelled",

                    session
                });
            },

        /*---------------------------------------------
        Deactivate
        ---------------------------------------------*/

        onDeactivate:
            context => {
                clearTemporaryStroke(
                    context
                );
            },

        /*---------------------------------------------
        Destroy
        ---------------------------------------------*/

        onDestroy:
            context => {
                clearTemporaryStroke(
                    context
                );
            }
    });
}

/*=========================================================
Default Pencil Tool
=========================================================*/

export const PencilTool =
    createPencilTool();

/*=========================================================
Default Export
=========================================================*/

export default PencilTool;