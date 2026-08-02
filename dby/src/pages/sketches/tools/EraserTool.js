/*
=========================================================
FashionVision Professional Editor
Eraser Tool
Version 1.0
=========================================================

This is an object/stroke eraser.

It permanently removes complete brush objects touched
by the eraser. A single pointer drag becomes one undo
history transaction.

Partial point splitting will be added separately.
=========================================================
*/

import Konva from "konva";

import {
    defineTool,
    POINTER_BUTTONS
} from "./ToolManager";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

export const ERASER_TOOL_ID =
    EDITOR_TOOLS.ERASER || "eraser";

export const ERASER_MODES =
    Object.freeze({
        STROKE: "stroke"
    });

export const DEFAULT_ERASER_OPTIONS =
    Object.freeze({
        mode:
            ERASER_MODES.STROKE,

        size:
            36,

        minimumSize:
            4,

        maximumSize:
            300,

        activeLayerOnly:
            false,

        eraseLockedObjects:
            false,

        eraseLockedLayers:
            false,

        eraseHiddenObjects:
            false,

        eraseHiddenLayers:
            false,

        eraseObjectTypes:
            ["brush"],

        cursorFill:
            "rgba(255, 255, 255, 0.18)",

        cursorStroke:
            "#111827",

        cursorInnerStroke:
            "rgba(255, 255, 255, 0.95)",

        cursorStrokeWidth:
            1.5,

        samplingDensity:
            0.55,

        maximumSegmentSamples:
            80
    });

const INTERACTION_LAYER_NAME =
    "fashion-editor-interaction-layer";

const ERASER_CURSOR_GROUP_NAME =
    "fashion-editor-eraser-cursor";

const HISTORY_LABEL =
    "Erase strokes";

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

function isFunction(
    value
) {
    return typeof value ===
        "function";
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

function uniqueIds(
    values = []
) {
    return [
        ...new Set(
            values.filter(
                value =>
                    typeof value ===
                        "string" &&
                    value.length > 0
            )
        )
    ];
}

/*=========================================================
Resolve Store State
=========================================================*/

function resolveEditorState(
    context
) {
    if (
        isPlainObject(
            context?.state
        )
    ) {
        return context.state;
    }

    if (
        isPlainObject(
            context?.editorState
        )
    ) {
        return context.editorState;
    }

    if (
        isFunction(
            context?.store?.getState
        )
    ) {
        return context.store.getState();
    }

    return useFashionEditorStore.getState();
}

/*=========================================================
Resolve Store Actions
=========================================================*/

function resolveEditorActions(
    context
) {
    if (
        isPlainObject(
            context?.actions
        )
    ) {
        return context.actions;
    }

    return resolveEditorState(
        context
    );
}

/*=========================================================
Resolve Points
=========================================================*/

function resolveScreenPoint(
    context
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

    if (
        isFinitePoint(
            context?.stagePoint
        )
    ) {
        return clonePoint(
            context.stagePoint
        );
    }

    const stagePoint =
        context?.stage
            ?.getPointerPosition
            ?.();

    return clonePoint(
        stagePoint
    );
}

function resolveDocumentPoint(
    context
) {
    if (
        isFinitePoint(
            context?.point
        )
    ) {
        return clonePoint(
            context.point
        );
    }

    const screenPoint =
        resolveScreenPoint(
            context
        );

    if (
        !screenPoint ||
        !isFunction(
            context?.toDocumentPoint
        )
    ) {
        return null;
    }

    return clonePoint(
        context.toDocumentPoint(
            screenPoint
        )
    );
}

/*=========================================================
Document Bounds
=========================================================*/

function isPointInsideDocument(
    point,
    document
) {
    if (!isFinitePoint(point)) {
        return false;
    }

    const width =
        Math.max(
            1,
            numberOr(
                document?.width,
                1200
            )
        );

    const height =
        Math.max(
            1,
            numberOr(
                document?.height,
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
Konva Tree Helpers
=========================================================*/

function getNodeChildren(
    node
) {
    if (
        !node ||
        !isFunction(
            node.getChildren
        )
    ) {
        return [];
    }

    const children =
        node.getChildren();

    if (
        isFunction(
            children?.toArray
        )
    ) {
        return children.toArray();
    }

    try {
        return Array.from(
            children || []
        );
    } catch {
        return [];
    }
}

function findNodeByName(
    stage,
    name
) {
    if (!stage || !name) {
        return null;
    }

    try {
        return (
            stage.findOne(
                `.${name}`
            ) || null
        );
    } catch {
        return null;
    }
}

function getInteractionRoot(
    stage
) {
    const interactionLayer =
        findNodeByName(
            stage,
            INTERACTION_LAYER_NAME
        );

    if (!interactionLayer) {
        return null;
    }

    return (
        getNodeChildren(
            interactionLayer
        )[0] ||
        interactionLayer
    );
}

/*=========================================================
Eraser Size
=========================================================*/

function resolveEraserSize(
    context,
    options
) {
    const state =
        resolveEditorState(
            context
        );

    const configuredSize =
        state?.eraser?.size ??
        context?.eraser?.size ??
        options.size;

    return clamp(
        configuredSize,
        options.minimumSize,
        options.maximumSize
    );
}

/*=========================================================
Layer Resolution
=========================================================*/

function findObjectLayer(
    state,
    objectId,
    object
) {
    if (
        object?.layerId
    ) {
        const directLayer =
            state.layers?.find(
                layer =>
                    layer.id ===
                    object.layerId
            );

        if (directLayer) {
            return directLayer;
        }
    }

    return (
        state.layers?.find(
            layer =>
                Array.isArray(
                    layer.objectIds
                ) &&
                layer.objectIds.includes(
                    objectId
                )
        ) ||
        null
    );
}

/*=========================================================
Object Erasability
=========================================================*/

function isObjectErasable(
    state,
    objectId,
    options
) {
    const object =
        state?.objects?.[
            objectId
        ];

    if (!object) {
        return false;
    }

    const layer =
        findObjectLayer(
            state,
            objectId,
            object
        );

    if (!layer) {
        return false;
    }

    if (
        options.activeLayerOnly &&
        layer.id !==
            state.activeLayerId
    ) {
        return false;
    }

    if (
        !options.eraseHiddenLayers &&
        layer.visible === false
    ) {
        return false;
    }

    if (
        !options.eraseLockedLayers &&
        layer.locked === true
    ) {
        return false;
    }

    if (
        !options.eraseHiddenObjects &&
        object.visible === false
    ) {
        return false;
    }

    if (
        !options.eraseLockedObjects &&
        object.locked === true
    ) {
        return false;
    }

    if (
        Array.isArray(
            options.eraseObjectTypes
        ) &&
        options.eraseObjectTypes
            .length > 0 &&
        !options.eraseObjectTypes
            .includes(
                object.type
            )
    ) {
        return false;
    }

    return true;
}

/*=========================================================
Find Object ID from Konva Node
=========================================================*/

function resolveObjectIdFromNode(
    node,
    stage,
    state
) {
    let currentNode =
        node;

    while (
        currentNode &&
        currentNode !== stage
    ) {
        const nodeId =
            isFunction(
                currentNode.id
            )
                ? currentNode.id()
                : null;

        if (
            nodeId &&
            state?.objects?.[
                nodeId
            ]
        ) {
            return nodeId;
        }

        currentNode =
            isFunction(
                currentNode.getParent
            )
                ? currentNode.getParent()
                : null;
    }

    return null;
}

/*=========================================================
Probe Point Generation
=========================================================*/

function createCircularProbePoints(
    center,
    radius
) {
    if (!isFinitePoint(center)) {
        return [];
    }

    const safeRadius =
        Math.max(
            0,
            numberOr(radius, 0)
        );

    const points = [
        clonePoint(center)
    ];

    if (safeRadius <= 1) {
        return points;
    }

    const rings = [
        {
            radius:
                safeRadius * 0.45,

            count:
                8
        },
        {
            radius:
                safeRadius * 0.82,

            count:
                12
        }
    ];

    rings.forEach(ring => {
        for (
            let index = 0;
            index < ring.count;
            index += 1
        ) {
            const angle =
                (
                    Math.PI *
                    2 *
                    index
                ) /
                ring.count;

            points.push({
                x:
                    center.x +
                    Math.cos(angle) *
                        ring.radius,

                y:
                    center.y +
                    Math.sin(angle) *
                        ring.radius
            });
        }
    });

    return points;
}

/*=========================================================
Segment Sampling
=========================================================*/

function createSegmentSamples(
    startPoint,
    endPoint,
    spacing,
    maximumSamples
) {
    if (
        !isFinitePoint(startPoint) ||
        !isFinitePoint(endPoint)
    ) {
        return [];
    }

    const distance =
        Math.hypot(
            endPoint.x -
                startPoint.x,

            endPoint.y -
                startPoint.y
        );

    const safeSpacing =
        Math.max(
            1,
            numberOr(
                spacing,
                2
            )
        );

    const sampleCount =
        clamp(
            Math.ceil(
                distance /
                safeSpacing
            ),
            1,
            Math.max(
                1,
                numberOr(
                    maximumSamples,
                    80
                )
            )
        );

    const points = [];

    for (
        let index = 0;
        index <= sampleCount;
        index += 1
    ) {
        const progress =
            index /
            sampleCount;

        points.push({
            x:
                startPoint.x +
                (
                    endPoint.x -
                    startPoint.x
                ) *
                    progress,

            y:
                startPoint.y +
                (
                    endPoint.y -
                    startPoint.y
                ) *
                    progress
        });
    }

    return points;
}

/*=========================================================
Collect Erasable Objects at One Point
=========================================================*/

function collectObjectIdsAtPoint(
    stage,
    center,
    radius,
    state,
    options,
    excludedIds
) {
    if (
        !stage ||
        !isFinitePoint(center) ||
        !isFunction(
            stage.getIntersection
        )
    ) {
        return [];
    }

    const result =
        new Set();

    const probePoints =
        createCircularProbePoints(
            center,
            radius
        );

    probePoints.forEach(
        probePoint => {
            const hitNode =
                stage.getIntersection(
                    probePoint
                );

            if (!hitNode) {
                return;
            }

            const objectId =
                resolveObjectIdFromNode(
                    hitNode,
                    stage,
                    state
                );

            if (
                !objectId ||
                excludedIds.has(
                    objectId
                )
            ) {
                return;
            }

            if (
                isObjectErasable(
                    state,
                    objectId,
                    options
                )
            ) {
                result.add(
                    objectId
                );
            }
        }
    );

    return [
        ...result
    ];
}

/*=========================================================
Collect Objects Along Drag Segment
=========================================================*/

function collectObjectIdsAlongSegment(
    context,
    startScreenPoint,
    endScreenPoint,
    erasedIds,
    options
) {
    const stage =
        context.stage;

    const state =
        resolveEditorState(
            context
        );

    if (
        !stage ||
        !state ||
        !isFinitePoint(
            startScreenPoint
        ) ||
        !isFinitePoint(
            endScreenPoint
        )
    ) {
        return [];
    }

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                state.viewport?.zoom,
                1
            )
        );

    const eraserSize =
        resolveEraserSize(
            context,
            options
        );

    const screenRadius =
        Math.max(
            2,
            (
                eraserSize *
                zoom
            ) /
                2
        );

    const segmentSpacing =
        Math.max(
            2,
            screenRadius *
                options.samplingDensity
        );

    const segmentPoints =
        createSegmentSamples(
            startScreenPoint,
            endScreenPoint,
            segmentSpacing,
            options.maximumSegmentSamples
        );

    const collectedIds =
        new Set();

    segmentPoints.forEach(
        segmentPoint => {
            const excludedIds =
                new Set([
                    ...erasedIds,
                    ...collectedIds
                ]);

            const pointIds =
                collectObjectIdsAtPoint(
                    stage,
                    segmentPoint,
                    screenRadius,
                    state,
                    options,
                    excludedIds
                );

            pointIds.forEach(
                objectId => {
                    collectedIds.add(
                        objectId
                    );
                }
            );
        }
    );

    return [
        ...collectedIds
    ];
}

/*=========================================================
Delete Objects
=========================================================*/

function deleteObjectIds(
    context,
    objectIds
) {
    const actions =
        resolveEditorActions(
            context
        );

    const ids =
        uniqueIds(
            objectIds
        );

    if (ids.length === 0) {
        return false;
    }

    if (
        isFunction(
            actions?.deleteObjects
        )
    ) {
        actions.deleteObjects(
            ids,
            HISTORY_LABEL
        );

        return true;
    }

    if (
        isFunction(
            actions?.deleteObject
        )
    ) {
        ids.forEach(
            objectId => {
                actions.deleteObject(
                    objectId,
                    HISTORY_LABEL
                );
            }
        );

        return true;
    }

    if (
        isFunction(
            actions?.removeObject
        )
    ) {
        ids.forEach(
            objectId => {
                actions.removeObject(
                    objectId,
                    HISTORY_LABEL
                );
            }
        );

        return true;
    }

    console.error(
        "EraserTool requires deleteObjects, deleteObject, or removeObject in useFashionEditorStore."
    );

    return false;
}

/*=========================================================
History Transaction
=========================================================*/

function beginEraseTransaction(
    context,
    session
) {
    if (
        session.historyStarted
    ) {
        return session;
    }

    const actions =
        resolveEditorActions(
            context
        );

    actions
        ?.beginHistoryTransaction
        ?.(
            HISTORY_LABEL
        );

    return {
        ...session,

        historyStarted:
            true
    };
}

function finishEraseTransaction(
    context,
    session
) {
    if (
        !session?.historyStarted
    ) {
        return;
    }

    const actions =
        resolveEditorActions(
            context
        );

    if (session.changed) {
        actions
            ?.commitHistoryTransaction
            ?.();
    } else {
        actions
            ?.cancelHistoryTransaction
            ?.();
    }
}

/*=========================================================
Eraser Cursor
=========================================================*/

function removeEraserCursor(
    context
) {
    const stage =
        context?.stage;

    if (!stage) {
        return;
    }

    const cursorGroup =
        findNodeByName(
            stage,
            ERASER_CURSOR_GROUP_NAME
        );

    if (!cursorGroup) {
        return;
    }

    const layer =
        cursorGroup.getLayer?.();

    cursorGroup.destroy();

    layer?.batchDraw?.();
}

function createEraserCursor(
    context,
    point,
    options
) {
    const stage =
        context.stage;

    const interactionRoot =
        getInteractionRoot(
            stage
        );

    if (
        !stage ||
        !interactionRoot ||
        !isFinitePoint(point)
    ) {
        return null;
    }

    removeEraserCursor(
        context
    );

    const state =
        resolveEditorState(
            context
        );

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                state?.viewport?.zoom,
                1
            )
        );

    const eraserSize =
        resolveEraserSize(
            context,
            options
        );

    const radius =
        eraserSize / 2;

    const cursorGroup =
        new Konva.Group({
            name:
                ERASER_CURSOR_GROUP_NAME,

            x:
                point.x,

            y:
                point.y,

            listening:
                false
        });

    const outerCircle =
        new Konva.Circle({
            x:
                0,

            y:
                0,

            radius,

            fill:
                options.cursorFill,

            stroke:
                options.cursorStroke,

            strokeWidth:
                options
                    .cursorStrokeWidth /
                zoom,

            listening:
                false,

            perfectDrawEnabled:
                false
        });

    const innerCircle =
        new Konva.Circle({
            x:
                0,

            y:
                0,

            radius:
                Math.max(
                    1,
                    radius -
                        2 / zoom
                ),

            stroke:
                options.cursorInnerStroke,

            strokeWidth:
                1 / zoom,

            listening:
                false,

            perfectDrawEnabled:
                false
        });

    cursorGroup.add(
        outerCircle
    );

    cursorGroup.add(
        innerCircle
    );

    interactionRoot.add(
        cursorGroup
    );

    cursorGroup.moveToTop();

    interactionRoot
        .getLayer
        ?.()
        ?.batchDraw
        ?.();

    return cursorGroup;
}

function updateEraserCursor(
    context,
    options
) {
    const state =
        resolveEditorState(
            context
        );

    const point =
        resolveDocumentPoint(
            context
        );

    if (
        !state ||
        !point ||
        !isPointInsideDocument(
            point,
            state.document
        )
    ) {
        removeEraserCursor(
            context
        );

        return null;
    }

    const stage =
        context.stage;

    let cursorGroup =
        findNodeByName(
            stage,
            ERASER_CURSOR_GROUP_NAME
        );

    if (!cursorGroup) {
        return createEraserCursor(
            context,
            point,
            options
        );
    }

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                state.viewport?.zoom,
                1
            )
        );

    const radius =
        resolveEraserSize(
            context,
            options
        ) / 2;

    cursorGroup.position({
        x:
            point.x,

        y:
            point.y
    });

    const children =
        getNodeChildren(
            cursorGroup
        );

    children.forEach(
        child => {
            if (
                isFunction(
                    child.radius
                )
            ) {
                const isInner =
                    child !==
                    children[0];

                child.radius(
                    isInner
                        ? Math.max(
                            1,
                            radius -
                                2 /
                                    zoom
                        )
                        : radius
                );
            }
        }
    );

    cursorGroup
        .getLayer
        ?.()
        ?.batchDraw
        ?.();

    return cursorGroup;
}

/*=========================================================
Session Helpers
=========================================================*/

function createEraseSession(
    screenPoint
) {
    return {
        lastScreenPoint:
            clonePoint(
                screenPoint
            ),

        erasedIds:
            [],

        changed:
            false,

        historyStarted:
            false,

        startedAt:
            Date.now()
    };
}

function eraseSegment(
    context,
    session,
    endScreenPoint,
    options
) {
    if (
        !session ||
        !isFinitePoint(
            endScreenPoint
        )
    ) {
        return session;
    }

    const erasedIdSet =
        new Set(
            session.erasedIds
        );

    const newObjectIds =
        collectObjectIdsAlongSegment(
            context,
            session.lastScreenPoint ||
                endScreenPoint,
            endScreenPoint,
            erasedIdSet,
            options
        );

    let nextSession = {
        ...session,

        lastScreenPoint:
            clonePoint(
                endScreenPoint
            )
    };

    if (
        newObjectIds.length === 0
    ) {
        return nextSession;
    }

    nextSession =
        beginEraseTransaction(
            context,
            nextSession
        );

    const deleted =
        deleteObjectIds(
            context,
            newObjectIds
        );

    if (!deleted) {
        return nextSession;
    }

    nextSession = {
        ...nextSession,

        erasedIds:
            uniqueIds([
                ...nextSession
                    .erasedIds,

                ...newObjectIds
            ]),

        changed:
            true
    };

    context.requestRender?.();

    return nextSession;
}

/*=========================================================
Create Eraser Tool
=========================================================*/

export function createEraserTool(
    toolOptions = {}
) {
    const options = {
        ...DEFAULT_ERASER_OPTIONS,
        ...toolOptions,

        size:
            clamp(
                toolOptions.size ??
                    DEFAULT_ERASER_OPTIONS
                        .size,
                toolOptions.minimumSize ??
                    DEFAULT_ERASER_OPTIONS
                        .minimumSize,
                toolOptions.maximumSize ??
                    DEFAULT_ERASER_OPTIONS
                        .maximumSize
            ),

        minimumSize:
            Math.max(
                1,
                numberOr(
                    toolOptions.minimumSize,
                    DEFAULT_ERASER_OPTIONS
                        .minimumSize
                )
            ),

        maximumSize:
            Math.max(
                1,
                numberOr(
                    toolOptions.maximumSize,
                    DEFAULT_ERASER_OPTIONS
                        .maximumSize
                )
            ),

        samplingDensity:
            clamp(
                toolOptions
                    .samplingDensity ??
                    DEFAULT_ERASER_OPTIONS
                        .samplingDensity,
                0.1,
                2
            ),

        maximumSegmentSamples:
            Math.max(
                1,
                Math.floor(
                    numberOr(
                        toolOptions
                            .maximumSegmentSamples,
                        DEFAULT_ERASER_OPTIONS
                            .maximumSegmentSamples
                    )
                )
            ),

        eraseObjectTypes:
            Array.isArray(
                toolOptions
                    .eraseObjectTypes
            )
                ? [
                    ...toolOptions
                        .eraseObjectTypes
                ]
                : [
                    ...DEFAULT_ERASER_OPTIONS
                        .eraseObjectTypes
                ]
    };

    return defineTool({
        id:
            ERASER_TOOL_ID,

        label:
            "Eraser",

        description:
            "Remove complete vector strokes.",

        shortcut:
            "E",

        cursor:
            "none",

        preventDefault:
            true,

        stopPropagation:
            false,

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        /*---------------------------------------------
        Activate
        ---------------------------------------------*/

        onActivate:
            context => {
                removeEraserCursor(
                    context
                );

                context.manager
                    ?.setToolState
                    ?.(
                        ERASER_TOOL_ID,
                        {
                            mode:
                                options.mode,

                            size:
                                resolveEraserSize(
                                    context,
                                    options
                                ),

                            erasing:
                                false
                        }
                    );
            },

        /*---------------------------------------------
        Pointer Enter
        ---------------------------------------------*/

        onPointerEnter:
            context => {
                updateEraserCursor(
                    context,
                    options
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

                updateEraserCursor(
                    context,
                    options
                );

                const state =
                    resolveEditorState(
                        context
                    );

                const documentPoint =
                    resolveDocumentPoint(
                        context
                    );

                const screenPoint =
                    resolveScreenPoint(
                        context
                    );

                if (
                    !state ||
                    !screenPoint ||
                    !documentPoint ||
                    !isPointInsideDocument(
                        documentPoint,
                        state.document
                    )
                ) {
                    return null;
                }

                let session =
                    createEraseSession(
                        screenPoint
                    );

                session =
                    eraseSegment(
                        context,
                        session,
                        screenPoint,
                        options
                    );

                context
                    .replaceInteractionData
                    ?.(
                        session
                    );

                context.manager
                    ?.setToolState
                    ?.(
                        ERASER_TOOL_ID,
                        {
                            mode:
                                options.mode,

                            size:
                                resolveEraserSize(
                                    context,
                                    options
                                ),

                            erasing:
                                true
                        }
                    );

                return session;
            },

        /*---------------------------------------------
        Pointer Move
        ---------------------------------------------*/

        onPointerMove:
            context => {
                updateEraserCursor(
                    context,
                    options
                );

                const session =
                    context.interaction
                        ?.data;

                if (!session) {
                    return null;
                }

                const screenPoint =
                    resolveScreenPoint(
                        context
                    );

                if (!screenPoint) {
                    return session;
                }

                const nextSession =
                    eraseSegment(
                        context,
                        session,
                        screenPoint,
                        options
                    );

                context
                    .replaceInteractionData
                    ?.(
                        nextSession
                    );

                return nextSession;
            },

        /*---------------------------------------------
        Pointer Up
        ---------------------------------------------*/

        onPointerUp:
            context => {
                const session =
                    context.interaction
                        ?.data;

                if (!session) {
                    return null;
                }

                const screenPoint =
                    resolveScreenPoint(
                        context
                    );

                const finalSession =
                    screenPoint
                        ? eraseSegment(
                            context,
                            session,
                            screenPoint,
                            options
                        )
                        : session;

                finishEraseTransaction(
                    context,
                    finalSession
                );

                context.manager
                    ?.setToolState
                    ?.(
                        ERASER_TOOL_ID,
                        {
                            mode:
                                options.mode,

                            size:
                                resolveEraserSize(
                                    context,
                                    options
                                ),

                            erasing:
                                false
                        }
                    );

                return {
                    erasedObjectIds:
                        finalSession
                            .erasedIds,

                    changed:
                        finalSession
                            .changed
                };
            },

        /*---------------------------------------------
        Pointer Cancel
        ---------------------------------------------*/

        onPointerCancel:
            context => {
                const session =
                    context.interaction
                        ?.data;

                finishEraseTransaction(
                    context,
                    session
                );

                context.manager
                    ?.setToolState
                    ?.(
                        ERASER_TOOL_ID,
                        {
                            erasing:
                                false
                        }
                    );
            },

        /*---------------------------------------------
        Pointer Leave
        ---------------------------------------------*/

        onPointerLeave:
            context => {
                if (
                    !context.interaction
                        ?.data
                ) {
                    removeEraserCursor(
                        context
                    );
                }
            },

        /*---------------------------------------------
        Cancel
        ---------------------------------------------*/

        onCancel:
            context => {
                const session =
                    context.interaction
                        ?.data;

                /*
                Erased objects already changed the store,
                so commit them rather than discarding the
                history transaction.
                */

                finishEraseTransaction(
                    context,
                    session
                );

                context.manager
                    ?.setToolState
                    ?.(
                        ERASER_TOOL_ID,
                        {
                            erasing:
                                false
                        }
                    );
            },

        /*---------------------------------------------
        Deactivate
        ---------------------------------------------*/

        onDeactivate:
            context => {
                const session =
                    context.interaction
                        ?.data;

                finishEraseTransaction(
                    context,
                    session
                );

                removeEraserCursor(
                    context
                );
            },

        /*---------------------------------------------
        Destroy
        ---------------------------------------------*/

        onDestroy:
            context => {
                const session =
                    context.interaction
                        ?.data;

                finishEraseTransaction(
                    context,
                    session
                );

                removeEraserCursor(
                    context
                );
            }
    });
}

/*=========================================================
Default Tool
=========================================================*/

export const EraserTool =
    createEraserTool();

/*=========================================================
Default Export
=========================================================*/

export default EraserTool;