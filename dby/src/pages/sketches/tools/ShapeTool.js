/*
=========================================================
FashionVision Professional Editor
Shape Tool
Version 1.1 — Symmetry Integrated
=========================================================
*/

import { defineTool } from "./ToolManager";

import {
    EDITOR_TOOLS,
    OBJECT_TYPES,
    useFashionEditorStore
} from "../useFashionEditorStore";

import {
    createSymmetryObjectSet,
    createSymmetryPreviewObjects,
    normalizeSymmetryConfig,
    shouldMirrorTool,
    snapPointToSymmetryAxis
} from "../utils/SymmetryUtils";

/*=========================================================
Shape Types and Constants
=========================================================*/

export const SHAPE_TYPES = Object.freeze({
    RECTANGLE: "rectangle",
    ELLIPSE: "ellipse",
    CIRCLE: "circle",
    TRIANGLE: "triangle",
    POLYGON: "polygon"
});

const SUPPORTED_SHAPE_TYPES =
    Object.values(SHAPE_TYPES);

const DEFAULT_PREVIEW_ID =
    "__fashion-shape-preview__";

const DEFAULT_SYMMETRY_PREVIEW_ID_PREFIX =
    "__fashion-shape-symmetry-preview__";

const DEFAULT_HISTORY_LABEL =
    "Draw shape";

const DEFAULT_SYMMETRY_HISTORY_LABEL =
    "Draw symmetrical shape";

const DEFAULT_STROKE =
    "#111111";

const DEFAULT_FILL =
    "#ffffff";

const DEFAULT_STROKE_WIDTH =
    3;

const DEFAULT_POLYGON_SIDES =
    5;

const MAXIMUM_POLYGON_SIDES =
    32;

const MINIMUM_SHAPE_SIZE =
    1;

const DEFAULT_SYMMETRY_SNAP_THRESHOLD =
    8;

/*=========================================================
General Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
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

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isFinitePoint(
    point
) {
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

function clonePoint(
    point
) {
    if (
        !isFinitePoint(point)
    ) {
        return null;
    }

    return {
        ...point,

        x:
            Number(point.x),

        y:
            Number(point.y)
    };
}

function createId(
    prefix = "shape"
) {
    if (
        typeof globalThis.crypto
            ?.randomUUID ===
        "function"
    ) {
        return (
            `${prefix}-` +
            globalThis.crypto
                .randomUUID()
        );
    }

    return (
        `${prefix}-${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

function nowIso() {
    return new Date()
        .toISOString();
}

function getNativeEvent(
    event
) {
    return (
        event?.evt ||
        event?.nativeEvent ||
        event ||
        null
    );
}

function isContextLike(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        (
            value.manager ||
            value.stage ||
            value.state ||
            value.editorState ||
            value.actions ||
            value.store ||
            value.documentPoint ||
            value.point ||
            value.toDocumentPoint
        )
    );
}

/*
Supports both ToolManager calling conventions:

    handler(context, event)
    handler(event, context)
*/

function resolveHandlerArguments(
    firstArgument,
    secondArgument
) {
    return isContextLike(
        firstArgument
    )
        ? {
            context:
                firstArgument,

            event:
                secondArgument
        }
        : {
            context:
                secondArgument,

            event:
                firstArgument
        };
}

function safelyPreventDefault(
    event
) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        !nativeEvent ||
        typeof nativeEvent
            .preventDefault !==
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

/*=========================================================
Editor Context Helpers
=========================================================*/

function getLatestState(
    context
) {
    if (
        typeof context?.store
            ?.getState ===
        "function"
    ) {
        return context.store
            .getState();
    }

    if (
        typeof context?.editorStore
            ?.getState ===
        "function"
    ) {
        return context.editorStore
            .getState();
    }

    return (
        context?.state ||
        context?.editorState ||
        context?.actions ||
        useFashionEditorStore
            .getState() ||
        null
    );
}

function getAction(
    context,
    actionName
) {
    const latestState =
        getLatestState(
            context
        );

    const sources = [
        context?.actions,
        context?.state,
        context?.editorState,
        latestState,
        context
    ];

    for (
        const source of sources
    ) {
        if (
            typeof source?.[
                actionName
            ] ===
            "function"
        ) {
            return source[
                actionName
            ];
        }
    }

    return null;
}

function getActiveLayer(
    state
) {
    return (
        state?.layers?.find(
            layer =>
                layer.id ===
                state.activeLayerId
        ) ||
        null
    );
}

function canDrawOnLayer(
    layer
) {
    return Boolean(
        layer &&
        layer.visible !==
            false &&
        layer.locked !==
            true
    );
}

function setTemporaryObject(
    context,
    object
) {
    if (
        typeof context
            ?.setTemporaryObject !==
        "function"
    ) {
        return false;
    }

    context.setTemporaryObject(
        object ||
        null
    );

    return true;
}

function setTemporaryObjects(
    context,
    objects
) {
    const safeObjects =
        Array.isArray(
            objects
        )
            ? objects.filter(
                Boolean
            )
            : [];

    context?.setTemporaryObjects?.(
        safeObjects
    );

    context
        ?.onTemporaryObjectsChange
        ?.(
            safeObjects
        );

    return safeObjects;
}

function publishTemporaryObjects(
    context,
    primaryObject,
    mirroredObjects,
    toolId
) {
    const safeMirroredObjects =
        Array.isArray(
            mirroredObjects
        )
            ? mirroredObjects.filter(
                Boolean
            )
            : [];

    const temporaryObjects = [
        primaryObject,
        ...safeMirroredObjects
    ].filter(
        Boolean
    );

    setTemporaryObject(
        context,
        primaryObject ||
        null
    );

    setTemporaryObjects(
        context,
        temporaryObjects
    );

    context
        ?.onTemporaryObjectChange
        ?.(
            primaryObject ||
            null
        );

    context?.manager
        ?.setToolState?.(
            toolId,
            {
                temporaryObject:
                    primaryObject ||
                    null,

                temporaryObjects,

                symmetryTemporaryObjects:
                    safeMirroredObjects,

                drawing:
                    Boolean(
                        primaryObject
                    )
            }
        );

    return temporaryObjects;
}

function requestRender(
    context
) {
    if (
        typeof context
            ?.requestRender ===
        "function"
    ) {
        context.requestRender();

        return;
    }

    context?.stage
        ?.batchDraw?.();
}

/*=========================================================
Pointer Helpers
=========================================================*/

function getPointerId(
    context,
    event
) {
    const contextPointerId =
        Number(
            context?.pointerId
        );

    if (
        Number.isFinite(
            contextPointerId
        )
    ) {
        return contextPointerId;
    }

    const nativeEvent =
        getNativeEvent(event);

    const pointerId =
        Number(
            nativeEvent?.pointerId
        );

    if (
        Number.isFinite(
            pointerId
        )
    ) {
        return pointerId;
    }

    const touchIdentifier =
        Number(
            nativeEvent
                ?.changedTouches?.[0]
                ?.identifier ??
            nativeEvent
                ?.touches?.[0]
                ?.identifier
        );

    return Number.isFinite(
        touchIdentifier
    )
        ? touchIdentifier
        : null;
}

function getPointerType(
    context,
    event
) {
    if (
        typeof context
            ?.pointerType ===
            "string" &&
        context.pointerType
    ) {
        return context.pointerType;
    }

    const nativeEvent =
        getNativeEvent(event);

    if (
        typeof nativeEvent
            ?.pointerType ===
            "string" &&
        nativeEvent.pointerType
    ) {
        return nativeEvent.pointerType;
    }

    if (
        nativeEvent?.touches ||
        nativeEvent
            ?.changedTouches
    ) {
        return "touch";
    }

    return "mouse";
}

function isPrimaryPointer(
    context,
    event
) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        nativeEvent?.isPrimary ===
        false
    ) {
        return false;
    }

    const button =
        Number(
            context?.button ??
            nativeEvent?.button ??
            0
        );

    return (
        !Number.isFinite(
            button
        ) ||
        button ===
            0
    );
}

function pointerMatchesSession(
    session,
    context,
    event
) {
    if (
        !session
    ) {
        return false;
    }

    const incomingPointerId =
        getPointerId(
            context,
            event
        );

    if (
        session.pointerId ===
            null ||
        incomingPointerId ===
            null
    ) {
        return true;
    }

    return (
        session.pointerId ===
        incomingPointerId
    );
}

/*=========================================================
Coordinate Helpers
=========================================================*/

function getScreenPointFromEvent(
    context,
    event
) {
    if (
        isFinitePoint(
            context?.screenPoint
        )
    ) {
        return clonePoint(
            context.screenPoint
        );
    }

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

    const container =
        context?.container ||
        context?.containerRef
            ?.current ||
        context?.stage
            ?.container?.();

    const rectangle =
        container
            ?.getBoundingClientRect?.();

    if (
        rectangle &&
        Number.isFinite(
            clientX
        ) &&
        Number.isFinite(
            clientY
        )
    ) {
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
        context?.stage
            ?.getPointerPosition?.()
    );
}

function screenToDocumentPoint(
    screenPoint,
    context,
    state
) {
    if (
        !isFinitePoint(
            screenPoint
        )
    ) {
        return null;
    }

    if (
        typeof context
            ?.toDocumentPoint ===
        "function"
    ) {
        const mappedPoint =
            context.toDocumentPoint(
                screenPoint
            );

        if (
            isFinitePoint(
                mappedPoint
            )
        ) {
            return clonePoint(
                mappedPoint
            );
        }
    }

    const viewport =
        state?.viewport ||
        context?.viewport ||
        {};

    const zoom =
        Math.max(
            0.0001,

            numberOr(
                viewport.zoom,
                1
            )
        );

    return {
        x:
            (
                screenPoint.x -
                numberOr(
                    viewport.x,
                    0
                )
            ) /
            zoom,

        y:
            (
                screenPoint.y -
                numberOr(
                    viewport.y,
                    0
                )
            ) /
            zoom
    };
}

function resolveDocumentPoint(
    context,
    event,
    state
) {
    if (
        isFinitePoint(
            context?.documentPoint
        )
    ) {
        return clonePoint(
            context.documentPoint
        );
    }

    if (
        isFinitePoint(
            context?.point
        )
    ) {
        return clonePoint(
            context.point
        );
    }

    return screenToDocumentPoint(
        getScreenPointFromEvent(
            context,
            event
        ),
        context,
        state
    );
}

function getDocumentSize(
    documentData
) {
    return {
        width:
            Math.max(
                1,

                numberOr(
                    documentData?.width,
                    1200
                )
            ),

        height:
            Math.max(
                1,

                numberOr(
                    documentData?.height,
                    1600
                )
            )
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

    const {
        width,
        height
    } =
        getDocumentSize(
            documentData
        );

    return (
        point.x >=
            0 &&
        point.y >=
            0 &&
        point.x <=
            width &&
        point.y <=
            height
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

    const {
        width,
        height
    } =
        getDocumentSize(
            documentData
        );

    return {
        ...point,

        x:
            clamp(
                point.x,
                0,
                width
            ),

        y:
            clamp(
                point.y,
                0,
                height
            )
    };
}

function snapPointToGrid(
    point,
    state
) {
    if (
        !isFinitePoint(
            point
        ) ||
        state?.ui?.snapToGrid !==
            true
    ) {
        return clonePoint(
            point
        );
    }

    const gridSize =
        Math.max(
            1,

            numberOr(
                state.ui.gridSize,
                20
            )
        );

    return {
        ...point,

        x:
            Math.round(
                point.x /
                gridSize
            ) *
            gridSize,

        y:
            Math.round(
                point.y /
                gridSize
            ) *
            gridSize
    };
}

/*=========================================================
Symmetry Helpers
=========================================================*/

function resolveSymmetrySettings(
    state,
    context,
    documentData
) {
    const source = {
        ...(
            isPlainObject(
                state?.symmetry
            )
                ? state.symmetry
                : {}
        ),

        ...(
            isPlainObject(
                context?.symmetry
            )
                ? context.symmetry
                : {}
        )
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
                EDITOR_TOOLS.SHAPE,
                normalized
            )
    };
}

function applySymmetryAxisSnap(
    point,
    symmetry,
    threshold
) {
    if (
        !isFinitePoint(
            point
        ) ||
        !symmetry?.enabled ||
        symmetry.snapToAxis !==
            true
    ) {
        return clonePoint(
            point
        );
    }

    return snapPointToSymmetryAxis(
        point,
        symmetry,
        threshold
    );
}

function resolveShapePoint(
    rawPoint,
    state,
    symmetry,
    symmetrySnapThreshold
) {
    let point =
        snapPointToGrid(
            rawPoint,
            state
        );

    point =
        applySymmetryAxisSnap(
            point,
            symmetry,
            symmetrySnapThreshold
        );

    return clampPointToDocument(
        point,
        state?.document
    );
}

/*=========================================================
Shape Settings
=========================================================*/

function normalizeShapeType(
    shapeType
) {
    return SUPPORTED_SHAPE_TYPES.includes(
        shapeType
    )
        ? shapeType
        : SHAPE_TYPES.RECTANGLE;
}

function resolveShapeSettings(
    state
) {
    const shape =
        isPlainObject(
            state?.shape
        )
            ? state.shape
            : {};

    const colors =
        isPlainObject(
            state?.colors
        )
            ? state.colors
            : {};

    const fillType =
        shape.fillType ===
            "solid"
            ? "solid"
            : "none";

    return {
        shapeType:
            normalizeShapeType(
                shape.shapeType
            ),

        stroke:
            typeof shape.stroke ===
                "string" &&
            shape.stroke.trim()
                ? shape.stroke.trim()
                : (
                    typeof colors.primary ===
                        "string" &&
                    colors.primary.trim()
                        ? colors.primary.trim()
                        : DEFAULT_STROKE
                ),

        strokeWidth:
            clamp(
                shape.strokeWidth ??
                    DEFAULT_STROKE_WIDTH,
                0,
                200
            ),

        strokeOpacity:
            clamp(
                shape.strokeOpacity ??
                    1,
                0,
                1
            ),

        fillType,

        fill:
            typeof shape.fill ===
                "string" &&
            shape.fill.trim()
                ? shape.fill.trim()
                : (
                    typeof colors.secondary ===
                        "string" &&
                    colors.secondary.trim()
                        ? colors.secondary.trim()
                        : DEFAULT_FILL
                ),

        fillOpacity:
            clamp(
                shape.fillOpacity ??
                    1,
                0,
                1
            ),

        cornerRadius:
            Math.max(
                0,

                numberOr(
                    shape.cornerRadius,
                    0
                )
            ),

        sides:
            Math.round(
                clamp(
                    shape.sides ??
                        DEFAULT_POLYGON_SIDES,
                    3,
                    MAXIMUM_POLYGON_SIDES
                )
            ),

        keepAspectRatio:
            shape.keepAspectRatio ===
            true,

        dash:
            Array.isArray(
                shape.dash
            )
                ? shape.dash
                    .map(
                        value =>
                            Math.max(
                                0,

                                numberOr(
                                    value,
                                    0
                                )
                            )
                    )
                    .filter(
                        value =>
                            value >
                            0
                    )
                : [],

        lineCap:
            typeof shape.lineCap ===
                "string"
                ? shape.lineCap
                : "round",

        lineJoin:
            typeof shape.lineJoin ===
                "string"
                ? shape.lineJoin
                : "round"
    };
}

/*=========================================================
Drag Bounds
=========================================================*/

function createDragRectangle(
    startPoint,
    endPoint,
    {
        constrainProportions =
            false,

        drawFromCenter =
            false,

        documentData =
            null
    } = {}
) {
    if (
        !isFinitePoint(
            startPoint
        ) ||
        !isFinitePoint(
            endPoint
        )
    ) {
        return null;
    }

    let deltaX =
        endPoint.x -
        startPoint.x;

    let deltaY =
        endPoint.y -
        startPoint.y;

    if (
        constrainProportions
    ) {
        const side =
            Math.max(
                Math.abs(
                    deltaX
                ),
                Math.abs(
                    deltaY
                )
            );

        deltaX =
            side *
            (
                deltaX <
                0
                    ? -1
                    : 1
            );

        deltaY =
            side *
            (
                deltaY <
                0
                    ? -1
                    : 1
            );
    }

    let left;
    let top;
    let right;
    let bottom;

    if (
        drawFromCenter
    ) {
        left =
            startPoint.x -
            Math.abs(
                deltaX
            );

        right =
            startPoint.x +
            Math.abs(
                deltaX
            );

        top =
            startPoint.y -
            Math.abs(
                deltaY
            );

        bottom =
            startPoint.y +
            Math.abs(
                deltaY
            );
    } else {
        left =
            Math.min(
                startPoint.x,
                startPoint.x +
                deltaX
            );

        right =
            Math.max(
                startPoint.x,
                startPoint.x +
                deltaX
            );

        top =
            Math.min(
                startPoint.y,
                startPoint.y +
                deltaY
            );

        bottom =
            Math.max(
                startPoint.y,
                startPoint.y +
                deltaY
            );
    }

    if (
        documentData
    ) {
        const documentSize =
            getDocumentSize(
                documentData
            );

        left =
            clamp(
                left,
                0,
                documentSize.width
            );

        right =
            clamp(
                right,
                0,
                documentSize.width
            );

        top =
            clamp(
                top,
                0,
                documentSize.height
            );

        bottom =
            clamp(
                bottom,
                0,
                documentSize.height
            );
    }

    const x =
        Math.min(
            left,
            right
        );

    const y =
        Math.min(
            top,
            bottom
        );

    const width =
        Math.abs(
            right -
            left
        );

    const height =
        Math.abs(
            bottom -
            top
        );

    return {
        x,

        y,

        width,

        height,

        left:
            x,

        top:
            y,

        right:
            x +
            width,

        bottom:
            y +
            height,

        center: {
            x:
                x +
                width /
                2,

            y:
                y +
                height /
                2
        }
    };
}

/*=========================================================
Polygon Geometry
=========================================================*/

function createRegularPolygonPoints(
    width,
    height,
    sides
) {
    const safeWidth =
        Math.max(
            0,

            numberOr(
                width,
                0
            )
        );

    const safeHeight =
        Math.max(
            0,

            numberOr(
                height,
                0
            )
        );

    const safeSides =
        Math.round(
            clamp(
                sides,
                3,
                MAXIMUM_POLYGON_SIDES
            )
        );

    const centerX =
        safeWidth /
        2;

    const centerY =
        safeHeight /
        2;

    const radiusX =
        safeWidth /
        2;

    const radiusY =
        safeHeight /
        2;

    const startAngle =
        -Math.PI /
        2;

    const points = [];

    for (
        let index = 0;
        index <
            safeSides;
        index += 1
    ) {
        const angle =
            startAngle +
            (
                index /
                safeSides
            ) *
            Math.PI *
            2;

        points.push({
            x:
                centerX +
                Math.cos(
                    angle
                ) *
                radiusX,

            y:
                centerY +
                Math.sin(
                    angle
                ) *
                radiusY
        });
    }

    return points;
}

function createTrianglePoints(
    width,
    height
) {
    return [
        {
            x:
                width /
                2,

            y:
                0
        },

        {
            x:
                width,

            y:
                height
        },

        {
            x:
                0,

            y:
                height
        }
    ];
}

function flattenPoints(
    points
) {
    return Array.isArray(
        points
    )
        ? points.flatMap(
            point => [
                numberOr(
                    point?.x,
                    0
                ),

                numberOr(
                    point?.y,
                    0
                )
            ]
        )
        : [];
}

/*=========================================================
Shape Object
=========================================================*/

function createShapeName(
    shapeType,
    transient
) {
    if (
        transient
    ) {
        return "Shape Preview";
    }

    const labels = {
        [SHAPE_TYPES.RECTANGLE]:
            "Rectangle",

        [SHAPE_TYPES.ELLIPSE]:
            "Ellipse",

        [SHAPE_TYPES.CIRCLE]:
            "Circle",

        [SHAPE_TYPES.TRIANGLE]:
            "Triangle",

        [SHAPE_TYPES.POLYGON]:
            "Polygon"
    };

    return (
        labels[
            shapeType
        ] ||
        "Shape"
    );
}

function createShapeObject({
    id,
    layerId,
    bounds,
    settings,
    pointerType,
    transient = false
}) {
    if (
        !bounds ||
        !settings
    ) {
        return null;
    }

    const shapeType =
        normalizeShapeType(
            settings.shapeType
        );

    const width =
        Math.max(
            0,

            numberOr(
                bounds.width,
                0
            )
        );

    const height =
        Math.max(
            0,

            numberOr(
                bounds.height,
                0
            )
        );

    const radiusX =
        width /
        2;

    const radiusY =
        height /
        2;

    let points = [];

    if (
        shapeType ===
        SHAPE_TYPES.TRIANGLE
    ) {
        points =
            createTrianglePoints(
                width,
                height
            );
    }

    if (
        shapeType ===
        SHAPE_TYPES.POLYGON
    ) {
        points =
            createRegularPolygonPoints(
                width,
                height,
                settings.sides
            );
    }

    const cornerRadius =
        shapeType ===
            SHAPE_TYPES.RECTANGLE
            ? clamp(
                settings.cornerRadius,
                0,
                Math.min(
                    width,
                    height
                ) /
                2
            )
            : 0;

    const hasFill =
        settings.fillType !==
        "none";

    const fill =
        hasFill
            ? settings.fill
            : "transparent";

    const fillOpacity =
        hasFill
            ? settings.fillOpacity
            : 0;

    const timestamp =
        nowIso();

    return {
        id,

        type:
            OBJECT_TYPES.SHAPE,

        objectKind:
            "shape",

        shapeType,

        name:
            createShapeName(
                shapeType,
                transient
            ),

        layerId,

        visible:
            true,

        locked:
            Boolean(
                transient
            ),

        selectable:
            !transient,

        listening:
            !transient,

        transient:
            Boolean(
                transient
            ),

        x:
            bounds.x,

        y:
            bounds.y,

        width,

        height,

        rotation:
            0,

        scaleX:
            1,

        scaleY:
            1,

        skewX:
            0,

        skewY:
            0,

        opacity:
            1,

        stroke:
            settings.stroke,

        strokeWidth:
            settings.strokeWidth,

        strokeOpacity:
            settings.strokeOpacity,

        fillType:
            settings.fillType,

        fill,

        fillOpacity,

        cornerRadius,

        sides:
            shapeType ===
                SHAPE_TYPES.POLYGON
                ? settings.sides
                : (
                    shapeType ===
                        SHAPE_TYPES.TRIANGLE
                        ? 3
                        : null
                ),

        radius:
            Math.min(
                radiusX,
                radiusY
            ),

        radiusX,

        radiusY,

        center: {
            x:
                width /
                2,

            y:
                height /
                2
        },

        points,

        flatPoints:
            flattenPoints(
                points
            ),

        closed:
            true,

        dash: [
            ...settings.dash
        ],

        lineCap:
            settings.lineCap,

        lineJoin:
            settings.lineJoin,

        keepAspectRatio:
            settings
                .keepAspectRatio,

        style: {
            stroke:
                settings.stroke,

            strokeWidth:
                settings
                    .strokeWidth,

            strokeOpacity:
                settings
                    .strokeOpacity,

            fillType:
                settings.fillType,

            fill,

            fillOpacity,

            cornerRadius,

            dash: [
                ...settings.dash
            ],

            lineCap:
                settings.lineCap,

            lineJoin:
                settings.lineJoin
        },

        geometry: {
            x:
                bounds.x,

            y:
                bounds.y,

            width,

            height,

            left:
                bounds.x,

            top:
                bounds.y,

            right:
                bounds.x +
                width,

            bottom:
                bounds.y +
                height,

            center: {
                x:
                    bounds.x +
                    width /
                    2,

                y:
                    bounds.y +
                    height /
                    2
            },

            radius:
                Math.min(
                    radiusX,
                    radiusY
                ),

            radiusX,

            radiusY,

            points:
                points.map(
                    clonePoint
                ),

            boundingBox: {
                x:
                    bounds.x,

                y:
                    bounds.y,

                width,

                height,

                minX:
                    bounds.x,

                minY:
                    bounds.y,

                maxX:
                    bounds.x +
                    width,

                maxY:
                    bounds.y +
                    height
            }
        },

        metadata: {
            tool:
                EDITOR_TOOLS.SHAPE,

            objectKind:
                "shape",

            shapeType,

            pointerType,

            transient:
                Boolean(
                    transient
                ),

            createdWith:
                "ShapeTool"
        },

        createdAt:
            timestamp,

        updatedAt:
            timestamp
    };
}

/*=========================================================
Symmetry and Commit Helpers
=========================================================*/

function createCommittedShapeObjects(
    shapeObject,
    shapeSession,
    documentData,
    options
) {
    if (
        !shapeSession?.symmetry?.enabled
    ) {
        return [
            shapeObject
        ];
    }

    return createSymmetryObjectSet(
        shapeObject,
        shapeSession.symmetry,
        {
            document:
                shapeSession.document ||
                documentData,

            preventDuplicates:
                options
                    .preventSymmetryDuplicates !==
                false,

            linked:
                shapeSession.symmetry
                    .linkedMirrors ===
                true
        }
    );
}

function commitShapeObjects(
    context,
    shapeObjects,
    options
) {
    const safeObjects =
        Array.isArray(
            shapeObjects
        )
            ? shapeObjects.filter(
                Boolean
            )
            : [];

    if (
        safeObjects.length ===
        0
    ) {
        return [];
    }

    const label =
        safeObjects.length >
        1
            ? options.symmetryHistoryLabel
            : options.historyLabel;

    const selectCreatedShape =
        options.selectCreatedShape ===
        true;

    const addObjects =
        getAction(
            context,
            "addObjects"
        );

    if (
        addObjects
    ) {
        const objectIds =
            addObjects(
                safeObjects,
                {
                    label,

                    select:
                        selectCreatedShape
                }
            );

        return Array.isArray(
            objectIds
        )
            ? objectIds
            : [];
    }

    const addObject =
        getAction(
            context,
            "addObject"
        );

    if (
        !addObject
    ) {
        throw new Error(
            "ShapeTool requires addObject or addObjects in the editor context."
        );
    }

    const beginHistoryTransaction =
        getAction(
            context,
            "beginHistoryTransaction"
        );

    const commitHistoryTransaction =
        getAction(
            context,
            "commitHistoryTransaction"
        );

    const cancelHistoryTransaction =
        getAction(
            context,
            "cancelHistoryTransaction"
        );

    const deleteObjects =
        getAction(
            context,
            "deleteObjects"
        );

    const useTransaction =
        safeObjects.length >
            1 &&
        beginHistoryTransaction &&
        commitHistoryTransaction;

    const objectIds = [];

    if (
        useTransaction
    ) {
        beginHistoryTransaction(
            label
        );
    }

    try {
        for (
            const shapeObject
            of safeObjects
        ) {
            const objectId =
                addObject(
                    shapeObject,
                    {
                        label,

                        select:
                            selectCreatedShape
                    }
                );

            if (
                !objectId
            ) {
                throw new Error(
                    "Shape object could not be added."
                );
            }

            objectIds.push(
                objectId
            );
        }

        if (
            useTransaction
        ) {
            commitHistoryTransaction();
        }

        return objectIds;
    } catch (
        error
    ) {
        if (
            useTransaction &&
            cancelHistoryTransaction
        ) {
            cancelHistoryTransaction();
        } else if (
            objectIds.length >
                0 &&
            deleteObjects
        ) {
            deleteObjects(
                objectIds,
                "Rollback shape creation"
            );
        }

        console.error(
            "ShapeTool commit failed:",
            error
        );

        return [];
    }
}

/*=========================================================
Shape Tool Factory
=========================================================*/

export function createShapeTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.SHAPE;

    const previewId =
        options.previewId ||
        DEFAULT_PREVIEW_ID;

    const symmetryPreviewIdPrefix =
        options.symmetryPreviewIdPrefix ||
        DEFAULT_SYMMETRY_PREVIEW_ID_PREFIX;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    const symmetryHistoryLabel =
        options.symmetryHistoryLabel ||
        DEFAULT_SYMMETRY_HISTORY_LABEL;

    const minimumSize =
        Math.max(
            0,

            numberOr(
                options.minimumSize,
                MINIMUM_SHAPE_SIZE
            )
        );

    const symmetrySnapThreshold =
        Math.max(
            0,

            numberOr(
                options.symmetrySnapThreshold,
                DEFAULT_SYMMETRY_SNAP_THRESHOLD
            )
        );

    let session =
        null;

    function clearPreview(
        context
    ) {
        publishTemporaryObjects(
            context,
            null,
            [],
            toolId
        );

        requestRender(
            context
        );
    }

    function cancelShape(
        context,
        reason = "cancelled"
    ) {
        const cancelledSession =
            session;

        session =
            null;

        clearPreview(
            context
        );

        context?.onShapeCancelled?.({
            reason,

            session:
                cancelledSession
        });

        return true;
    }

    function resolveCurrentBounds(
        context,
        state,
        endPoint,
        activeSession = session
    ) {
        if (
            !activeSession ||
            !state ||
            !endPoint
        ) {
            return null;
        }

        const constrainProportions =
            activeSession.settings
                .keepAspectRatio ||
            Boolean(
                context?.shiftKey
            ) ||
            activeSession.settings
                .shapeType ===
                SHAPE_TYPES.CIRCLE;

        return createDragRectangle(
            activeSession.startPoint,
            endPoint,
            {
                constrainProportions,

                drawFromCenter:
                    Boolean(
                        context?.altKey || state.shape?.drawFromCenter
                    ),

                documentData:
                    state.document
            }
        );
    }

    function renderPreview(
        context
    ) {
        if (
            !session
        ) {
            clearPreview(
                context
            );

            return null;
        }

        const state =
            getLatestState(
                context
            );

        if (
            !state
        ) {
            return null;
        }

        const bounds =
            resolveCurrentBounds(
                context,
                state,
                session.endPoint,
                session
            );

        if (
            !bounds
        ) {
            return null;
        }

        session.bounds =
            bounds;

        const previewObject =
            createShapeObject({
                id:
                    previewId,

                layerId:
                    session.layerId,

                bounds,

                settings:
                    session.settings,

                pointerType:
                    session.pointerType,

                transient:
                    true
            });

        if (
            !previewObject
        ) {
            clearPreview(
                context
            );

            return null;
        }

        const symmetryPreviewObjects =
            session.symmetry?.enabled &&
            options.symmetryPreviewEnabled !==
                false
                ? createSymmetryPreviewObjects(
                    previewObject,
                    session.symmetry,
                    {
                        document:
                            session.document,

                        preventDuplicates:
                            options
                                .preventSymmetryDuplicates !==
                            false,

                        previewIdPrefix:
                            `${symmetryPreviewIdPrefix}-${session.objectId}`
                    }
                )
                : [];

        const temporaryObjects =
            publishTemporaryObjects(
                context,
                previewObject,
                symmetryPreviewObjects,
                toolId
            );

        context?.onShapeChange?.({
            bounds,

            previewObject,

            temporaryObjects,

            symmetry:
                session.symmetry,

            session
        });

        requestRender(
            context
        );

        return temporaryObjects;
    }

    function startShape(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            !context ||
            !isPrimaryPointer(
                context,
                event
            )
        ) {
            return false;
        }

        const state =
            getLatestState(
                context
            );

        const activeLayer =
            getActiveLayer(
                state
            );

        if (
            !state ||
            !canDrawOnLayer(
                activeLayer
            )
        ) {
            return false;
        }

        let startPoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            !startPoint ||
            !isPointInsideDocument(
                startPoint,
                state.document
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        if (
            session
        ) {
            cancelShape(
                context,
                "restart"
            );
        }

        const symmetry =
            resolveSymmetrySettings(
                state,
                context,
                state.document
            );

        startPoint =
            resolveShapePoint(
                startPoint,
                state,
                symmetry,
                symmetrySnapThreshold
            );

        if (
            !startPoint
        ) {
            return false;
        }

        session = {
            objectId:
                createId(
                    "shape"
                ),

            pointerId:
                getPointerId(
                    context,
                    event
                ),

            pointerType:
                getPointerType(
                    context,
                    event
                ),

            layerId:
                activeLayer.id,

            documentId:
                state.document
                    ?.id ||
                null,

            document: {
                width:
                    Math.max(
                        1,

                        numberOr(
                            state.document
                                ?.width,
                            1200
                        )
                    ),

                height:
                    Math.max(
                        1,

                        numberOr(
                            state.document
                                ?.height,
                            1600
                        )
                    )
            },

            startPoint:
                clonePoint(
                    startPoint
                ),

            endPoint:
                clonePoint(
                    startPoint
                ),

            bounds:
                null,

            settings:
                resolveShapeSettings(
                    state
                ),

            symmetry,

            startedAt:
                nowIso()
        };

        renderPreview(
            context
        );

        context?.onShapeStart?.({
            startPoint:
                session.startPoint,

            settings:
                session.settings,

            symmetry,

            session
        });

        return true;
    }

    function updateShape(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            !session ||
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        const state =
            getLatestState(
                context
            );

        let point =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            !state ||
            !point
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        point =
            resolveShapePoint(
                point,
                state,
                session.symmetry,
                symmetrySnapThreshold
            );

        if (
            !point
        ) {
            return false;
        }

        session.endPoint =
            point;

        renderPreview(
            context
        );

        return true;
    }

    function finishShape(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            !session ||
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        /*
        Do not call preventDefault here because pointerup
        and touchend can be non-cancelable.
        */

        const currentSession =
            session;

        const state =
            getLatestState(
                context
            );

        let releasePoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            state &&
            releasePoint
        ) {
            releasePoint =
                resolveShapePoint(
                    releasePoint,
                    state,
                    currentSession.symmetry,
                    symmetrySnapThreshold
                );

            if (
                releasePoint
            ) {
                currentSession.endPoint =
                    releasePoint;
            }
        }

        const bounds =
            resolveCurrentBounds(
                context,
                state,
                currentSession.endPoint,
                currentSession
            ) ||
            currentSession.bounds;

        session =
            null;

        clearPreview(
            context
        );

        if (
            !state ||
            !bounds
        ) {
            return true;
        }

        const layer =
            state.layers?.find(
                item =>
                    item.id ===
                    currentSession.layerId
            );

        if (
            !canDrawOnLayer(
                layer
            ) ||
            (
                currentSession.documentId &&
                state.document?.id !==
                    currentSession.documentId
            )
        ) {
            return true;
        }

        if (
            bounds.width <
                minimumSize ||
            bounds.height <
                minimumSize
        ) {
            context?.onShapeDiscarded?.({
                reason:
                    "minimum-size",

                bounds,

                minimumSize,

                session:
                    currentSession
            });

            return true;
        }

        const shapeObject =
            createShapeObject({
                id:
                    currentSession.objectId,

                layerId:
                    currentSession.layerId,

                bounds,

                settings:
                    currentSession.settings,

                pointerType:
                    currentSession.pointerType,

                transient:
                    false
            });

        if (
            !shapeObject
        ) {
            return true;
        }

        const committedObjects =
            createCommittedShapeObjects(
                shapeObject,
                currentSession,
                state.document,
                options
            );

        const objectIds =
            commitShapeObjects(
                context,
                committedObjects,
                {
                    ...options,

                    historyLabel,

                    symmetryHistoryLabel
                }
            );

        if (
            objectIds.length ===
            0
        ) {
            context?.onShapeDiscarded?.({
                reason:
                    "objects-not-added",

                object:
                    shapeObject,

                objects:
                    committedObjects,

                session:
                    currentSession
            });

            return true;
        }

        context?.manager
            ?.setToolState?.(
                toolId,
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
                        objectIds[0],

                    lastCommittedObjectIds:
                        objectIds
                }
            );

        context?.onShapeCommitted?.({
            objectId:
                objectIds[0],

            objectIds,

            object:
                committedObjects[0] ||
                shapeObject,

            objects:
                committedObjects,

            mirroredObjects:
                committedObjects.slice(
                    1
                ),

            symmetry:
                currentSession.symmetry,

            session:
                currentSession
        });

        requestRender(
            context
        );

        return true;
    }

    function cancelPointerShape(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            session &&
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        return cancelShape(
            context,
            "pointer-cancelled"
        );
    }

    function cancelInteraction(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        return cancelShape(
            context,
            context?.cancelReason ||
            "cancelled"
        );
    }

    function activateTool(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        session =
            null;

        clearPreview(
            context
        );

        return true;
    }

    function deactivateTool(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        return cancelShape(
            context,
            "deactivated"
        );
    }

    function updateModifierPreview(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            !session ||
            (
                event?.key !==
                    "Shift" &&
                event?.key !==
                    "Alt"
            )
        ) {
            return false;
        }

        renderPreview(
            context
        );

        return true;
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Shape",

        label:
            options.label ||
            "Shape",

        description:
            "Draw rectangles, ellipses, circles, triangles and polygons with optional symmetry.",

        shortcut:
            options.shortcut ||
            "S",

        cursor:
            options.cursor ||
            "crosshair",

        preventDefault:
            true,

        stopPropagation:
            false,

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        allowOutsideDocument:
            false,

        onActivate:
            activateTool,

        onDeactivate:
            deactivateTool,

        onPointerDown:
            startShape,

        onPointerMove:
            updateShape,

        onPointerUp:
            finishShape,

        onPointerCancel:
            cancelPointerShape,

        onCancel:
            cancelInteraction,

        onKeyDown:
            updateModifierPreview,

        onKeyUp:
            updateModifierPreview,

        onDestroy:
            deactivateTool
    });
}

/*=========================================================
Default Export
=========================================================*/

export const ShapeTool =
    createShapeTool();

export default ShapeTool;