/*
=========================================================
FashionVision Professional Editor
Straight Line Tool
Version 1.1 — Symmetry Integrated
=========================================================
*/

import { BRUSH_RENDER_MODES } from "../brushes/BrushPresets";
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
Constants
=========================================================*/

const DEFAULT_PREVIEW_ID =
    "__fashion-line-preview__";

const DEFAULT_SYMMETRY_PREVIEW_ID_PREFIX =
    "__fashion-line-symmetry-preview__";

const DEFAULT_HISTORY_LABEL =
    "Draw line";

const DEFAULT_SYMMETRY_HISTORY_LABEL =
    "Draw symmetrical line";

const DEFAULT_LINE_COLOR =
    "#111111";

const DEFAULT_LINE_WIDTH =
    3;

const DEFAULT_ANGLE_INCREMENT =
    15;

const DEFAULT_SYMMETRY_SNAP_THRESHOLD =
    8;

const MINIMUM_LINE_LENGTH =
    0.5;

/*=========================================================
Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const result =
        Number(value);

    return Number.isFinite(result)
        ? result
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
        typeof value ===
            "object" &&
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
    prefix = "line"
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
        typeof value ===
            "object" &&
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
    if (
        isContextLike(
            firstArgument
        )
    ) {
        return {
            context:
                firstArgument,

            event:
                secondArgument
        };
    }

    return {
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
Editor Context
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
            ? objects.filter(Boolean)
            : [];

    context?.setTemporaryObjects?.(
        safeObjects
    );

    context?.onTemporaryObjectsChange?.(
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
            ? mirroredObjects.filter(Boolean)
            : [];

    const temporaryObjects = [
        primaryObject,
        ...safeMirroredObjects
    ].filter(Boolean);

    setTemporaryObject(
        context,
        primaryObject ||
        null
    );

    setTemporaryObjects(
        context,
        temporaryObjects
    );

    context?.onTemporaryObjectChange?.(
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
                    Boolean(primaryObject)
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
Pointer Information
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

    const eventPointerId =
        Number(
            nativeEvent?.pointerId
        );

    if (
        Number.isFinite(
            eventPointerId
        )
    ) {
        return eventPointerId;
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
        return context
            .pointerType;
    }

    const nativeEvent =
        getNativeEvent(event);

    if (
        typeof nativeEvent
            ?.pointerType ===
            "string" &&
        nativeEvent.pointerType
    ) {
        return nativeEvent
            .pointerType;
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
        !Number.isFinite(button) ||
        button === 0
    );
}

function pointerMatchesSession(
    session,
    context,
    event
) {
    if (!session) {
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
Coordinates
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

function clampPointToDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(point)
    ) {
        return null;
    }

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
        !isFinitePoint(point) ||
        state?.ui?.snapToGrid !==
            true
    ) {
        return clonePoint(point);
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

function snapPointToAngle(
    startPoint,
    endPoint,
    incrementDegrees
) {
    const deltaX =
        endPoint.x -
        startPoint.x;

    const deltaY =
        endPoint.y -
        startPoint.y;

    const length =
        Math.hypot(
            deltaX,
            deltaY
        );

    if (
        length <= 0
    ) {
        return clonePoint(
            startPoint
        );
    }

    const incrementRadians =
        Math.max(
            1,
            numberOr(
                incrementDegrees,
                DEFAULT_ANGLE_INCREMENT
            )
        ) *
        Math.PI /
        180;

    const angle =
        Math.atan2(
            deltaY,
            deltaX
        );

    const snappedAngle =
        Math.round(
            angle /
            incrementRadians
        ) *
        incrementRadians;

    return {
        ...endPoint,

        x:
            startPoint.x +
            Math.cos(
                snappedAngle
            ) *
            length,

        y:
            startPoint.y +
            Math.sin(
                snappedAngle
            ) *
            length
    };
}

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
                EDITOR_TOOLS.LINE,
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
        !isFinitePoint(point) ||
        !symmetry?.enabled ||
        symmetry.snapToAxis !==
            true
    ) {
        return clonePoint(point);
    }

    return snapPointToSymmetryAxis(
        point,
        symmetry,
        threshold
    );
}

function resolveStartPoint(
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

function resolveEndpoint(
    startPoint,
    rawEndPoint,
    state,
    angleSnapping,
    angleIncrement,
    symmetry,
    symmetrySnapThreshold
) {
    let endPoint =
        snapPointToGrid(
            rawEndPoint,
            state
        );

    if (
        angleSnapping
    ) {
        endPoint =
            snapPointToAngle(
                startPoint,
                endPoint,
                angleIncrement
            );
    }

    endPoint =
        applySymmetryAxisSnap(
            endPoint,
            symmetry,
            symmetrySnapThreshold
        );

    return clampPointToDocument(
        endPoint,
        state?.document
    );
}

/*=========================================================
Line Settings and Geometry
=========================================================*/

function resolveLineSettings(
    state
) {
    const shape =
        isPlainObject(
            state?.shape
        )
            ? state.shape
            : {};

    const primaryColor =
        typeof state?.colors
            ?.primary ===
            "string" &&
        state.colors.primary.trim()
            ? state.colors
                .primary
                .trim()
            : null;

    const shapeStroke =
        typeof shape.stroke ===
            "string" &&
        shape.stroke.trim()
            ? shape.stroke.trim()
            : null;

    return {
        color:
            primaryColor ||
            shapeStroke ||
            DEFAULT_LINE_COLOR,

        strokeWidth:
            Math.max(
                0.25,
                numberOr(
                    shape.strokeWidth,
                    DEFAULT_LINE_WIDTH
                )
            ),

        opacity:
            clamp(
                shape.strokeOpacity ??
                1,
                0,
                1
            ),

        lineCap:
            typeof shape.lineCap ===
                "string"
                ? shape.lineCap
                : "round",

        lineJoin:
            typeof shape.lineJoin ===
                "string"
                ? shape.lineJoin
                : "round",

        dash:
            Array.isArray(
                shape.dash
            )
                ? [
                    ...shape.dash
                ]
                : undefined
    };
}

function getLineMetrics(
    startPoint,
    endPoint,
    strokeWidth
) {
    const deltaX =
        endPoint.x -
        startPoint.x;

    const deltaY =
        endPoint.y -
        startPoint.y;

    const length =
        Math.hypot(
            deltaX,
            deltaY
        );

    const angleRadians =
        Math.atan2(
            deltaY,
            deltaX
        );

    const padding =
        Math.max(
            0.5,
            numberOr(
                strokeWidth,
                DEFAULT_LINE_WIDTH
            ) /
            2
        );

    const minX =
        Math.min(
            startPoint.x,
            endPoint.x
        ) -
        padding;

    const minY =
        Math.min(
            startPoint.y,
            endPoint.y
        ) -
        padding;

    const maxX =
        Math.max(
            startPoint.x,
            endPoint.x
        ) +
        padding;

    const maxY =
        Math.max(
            startPoint.y,
            endPoint.y
        ) +
        padding;

    return {
        length,

        angle:
            angleRadians *
            180 /
            Math.PI,

        angleRadians,

        center: {
            x:
                (
                    startPoint.x +
                    endPoint.x
                ) /
                2,

            y:
                (
                    startPoint.y +
                    endPoint.y
                ) /
                2
        },

        boundingBox: {
            x:
                minX,

            y:
                minY,

            width:
                maxX -
                minX,

            height:
                maxY -
                minY,

            minX,
            minY,
            maxX,
            maxY
        }
    };
}

/*=========================================================
Line Object
=========================================================*/

/*
The current ObjectRenderer registers BrushObject. Therefore
straight lines use OBJECT_TYPES.BRUSH with renderMode "line".

This allows the line to render, select, transform, erase,
save and export using the files already in the editor.
*/

function createLineObject({
    id,
    layerId,
    startPoint,
    endPoint,
    settings,
    pointerType,
    transient
}) {
    const metrics =
        getLineMetrics(
            startPoint,
            endPoint,
            settings.strokeWidth
        );

    const timestamp =
        nowIso();

    const renderMode =
        BRUSH_RENDER_MODES
            ?.LINE ||
        "line";

    return {
        id,

        type:
            OBJECT_TYPES.BRUSH,

        objectKind:
            "line",

        shapeType:
            "line",

        brushType:
            "line",

        renderMode,

        name:
            transient
                ? "Line Preview"
                : "Straight Line",

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
            0,

        y:
            0,

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

        color:
            settings.color,

        stroke:
            settings.color,

        strokeWidth:
            settings.strokeWidth,

        strokeOpacity:
            settings.opacity,

        lineCap:
            settings.lineCap,

        lineJoin:
            settings.lineJoin,

        dash:
            settings.dash,

        points: [
            clonePoint(
                startPoint
            ),

            clonePoint(
                endPoint
            )
        ],

        flatPoints: [
            startPoint.x,
            startPoint.y,
            endPoint.x,
            endPoint.y
        ],

        previewPoints: [
            startPoint.x,
            startPoint.y,
            endPoint.x,
            endPoint.y
        ],

        startPoint:
            clonePoint(
                startPoint
            ),

        endPoint:
            clonePoint(
                endPoint
            ),

        length:
            metrics.length,

        angle:
            metrics.angle,

        style: {
            color:
                settings.color,

            stroke:
                settings.color,

            strokeWidth:
                settings
                    .strokeWidth,

            strokeOpacity:
                settings.opacity,

            opacity:
                settings.opacity,

            lineCap:
                settings.lineCap,

            lineJoin:
                settings.lineJoin,

            dash:
                settings.dash,

            renderMode
        },

        geometry: {
            startPoint:
                clonePoint(
                    startPoint
                ),

            endPoint:
                clonePoint(
                    endPoint
                ),

            length:
                metrics.length,

            angle:
                metrics.angle,

            angleRadians:
                metrics
                    .angleRadians,

            center:
                metrics.center,

            boundingBox:
                metrics
                    .boundingBox
        },

        metadata: {
            tool:
                EDITOR_TOOLS.LINE,

            objectKind:
                "line",

            shapeType:
                "line",

            pointerType,

            transient:
                Boolean(
                    transient
                ),

            createdWith:
                "LineTool"
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

function createCommittedLineObjects(
    lineObject,
    lineSession,
    documentData,
    options
) {
    if (
        !lineSession?.symmetry?.enabled
    ) {
        return [
            lineObject
        ];
    }

    return createSymmetryObjectSet(
        lineObject,
        lineSession.symmetry,
        {
            document:
                lineSession.document ||
                documentData,

            preventDuplicates:
                options
                    .preventSymmetryDuplicates !==
                false,

            linked:
                lineSession.symmetry
                    .linkedMirrors ===
                true
        }
    );
}

function commitLineObjects(
    context,
    lineObjects,
    options
) {
    const safeObjects =
        Array.isArray(
            lineObjects
        )
            ? lineObjects.filter(Boolean)
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

    const selectCreatedLine =
        options.selectCreatedLine ===
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
                        selectCreatedLine
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
            "LineTool requires addObject or addObjects in the editor context."
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

    const objectIds =
        [];

    if (
        useTransaction
    ) {
        beginHistoryTransaction(
            label
        );
    }

    try {
        for (
            const lineObject of safeObjects
        ) {
            const objectId =
                addObject(
                    lineObject,
                    {
                        label,

                        select:
                            selectCreatedLine
                    }
                );

            if (
                !objectId
            ) {
                throw new Error(
                    "Line object could not be added."
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
                "Rollback line creation"
            );
        }

        console.error(
            "LineTool commit failed:",
            error
        );

        return [];
    }
}

/*=========================================================
Line Tool
=========================================================*/

export function createLineTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.LINE;

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

    const angleIncrement =
        Math.max(
            1,
            numberOr(
                options.angleIncrement,
                DEFAULT_ANGLE_INCREMENT
            )
        );

    const minimumLength =
        Math.max(
            0,
            numberOr(
                options.minimumLength,
                MINIMUM_LINE_LENGTH
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

    function cancelLine(
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

        context?.onLineCancelled?.({
            reason,

            session:
                cancelledSession
        });

        return true;
    }

    function renderPreview(
        context,
        angleSnapping = false
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

        const endPoint =
            resolveEndpoint(
                session.startPoint,
                session.rawEndPoint,
                state,
                angleSnapping,
                angleIncrement,
                session.symmetry,
                symmetrySnapThreshold
            );

        if (
            !endPoint
        ) {
            return null;
        }

        session.endPoint =
            endPoint;

        session.angleSnapped =
            angleSnapping;

        const previewObject =
            createLineObject({
                id:
                    previewId,

                layerId:
                    session.layerId,

                startPoint:
                    session.startPoint,

                endPoint,

                settings:
                    session.settings,

                pointerType:
                    session.pointerType,

                transient:
                    true
            });

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

        context?.onLineChange?.({
            startPoint:
                session.startPoint,

            endPoint,

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

    function startLine(
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
            cancelLine(
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
            resolveStartPoint(
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
                createId("line"),

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
                            state.document?.width,
                            1200
                        )
                    ),

                height:
                    Math.max(
                        1,
                        numberOr(
                            state.document?.height,
                            1600
                        )
                    )
            },

            startPoint:
                clonePoint(
                    startPoint
                ),

            rawEndPoint:
                clonePoint(
                    startPoint
                ),

            endPoint:
                clonePoint(
                    startPoint
                ),

            angleSnapped:
                Boolean(
                    context.shiftKey
                ),

            settings:
                resolveLineSettings(
                    state
                ),

            symmetry,

            startedAt:
                nowIso()
        };

        renderPreview(
            context,
            Boolean(
                context.shiftKey
            )
        );

        context?.onLineStart?.({
            startPoint:
                session.startPoint,

            symmetry,

            session
        });

        return true;
    }

    function updateLine(
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

        const point =
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

        session.rawEndPoint =
            clampPointToDocument(
                point,
                state.document
            );

        renderPreview(
            context,
            Boolean(
                context.shiftKey
            )
        );

        return true;
    }

    function finishLine(
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
        Do not call preventDefault here.

        pointerup and touchend may be delivered with
        cancelable=false.
        */

        const currentSession =
            session;

        const state =
            getLatestState(
                context
            );

        const releasePoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            releasePoint &&
            state
        ) {
            currentSession.rawEndPoint =
                clampPointToDocument(
                    releasePoint,
                    state.document
                );
        }

        const finalEndPoint =
            state
                ? resolveEndpoint(
                    currentSession.startPoint,
                    currentSession.rawEndPoint,
                    state,
                    Boolean(
                        context.shiftKey ||
                        currentSession.angleSnapped
                    ),
                    angleIncrement,
                    currentSession.symmetry,
                    symmetrySnapThreshold
                ) ||
                currentSession.endPoint
                : currentSession.endPoint;

        session =
            null;

        clearPreview(
            context
        );

        if (
            !state ||
            !finalEndPoint
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

        const metrics =
            getLineMetrics(
                currentSession.startPoint,
                finalEndPoint,
                currentSession.settings
                    .strokeWidth
            );

        if (
            metrics.length <
            minimumLength
        ) {
            context?.onLineDiscarded?.({
                reason:
                    "minimum-length",

                length:
                    metrics.length,

                minimumLength,

                session:
                    currentSession
            });

            return true;
        }

        const lineObject =
            createLineObject({
                id:
                    currentSession.objectId,

                layerId:
                    currentSession.layerId,

                startPoint:
                    currentSession.startPoint,

                endPoint:
                    finalEndPoint,

                settings:
                    currentSession.settings,

                pointerType:
                    currentSession.pointerType,

                transient:
                    false
            });

        const committedObjects =
            createCommittedLineObjects(
                lineObject,
                currentSession,
                state.document,
                options
            );

        const objectIds =
            commitLineObjects(
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
            context?.onLineDiscarded?.({
                reason:
                    "objects-not-added",

                object:
                    lineObject,

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

        context?.onLineCommitted?.({
            objectId:
                objectIds[0],

            objectIds,

            object:
                committedObjects[0] ||
                lineObject,

            objects:
                committedObjects,

            mirroredObjects:
                committedObjects.slice(1),

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

    function cancelPointerLine(
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

        return cancelLine(
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

        return cancelLine(
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

        return cancelLine(
            context,
            "deactivated"
        );
    }

    function updateShiftSnap(
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
            event?.key !==
                "Shift"
        ) {
            return false;
        }

        renderPreview(
            context,
            event.type ===
                "keydown"
        );

        return true;
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Line",

        label:
            options.label ||
            "Line",

        description:
            "Draw straight vector lines with optional symmetry.",

        shortcut:
            options.shortcut ||
            "L",

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
            startLine,

        onPointerMove:
            updateLine,

        onPointerUp:
            finishLine,

        onPointerCancel:
            cancelPointerLine,

        onCancel:
            cancelInteraction,

        onKeyDown:
            updateShiftSnap,

        onKeyUp:
            updateShiftSnap,

        onDestroy:
            deactivateTool
    });
}

/*=========================================================
Default Export
=========================================================*/

export const LineTool =
    createLineTool();

export default LineTool;