/*
=========================================================
FashionVision Professional Editor
Selection Tool
Version 1.0
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

export const SELECTION_TOOL_ID =
    EDITOR_TOOLS.SELECT;

export const SELECTION_MODES =
    Object.freeze({
        INTERSECT:
            "intersect",

        CONTAIN:
            "contain"
    });

export const DEFAULT_SELECTION_OPTIONS =
    Object.freeze({
        minimumMarqueeDistance:
            4,

        selectionMode:
            SELECTION_MODES.INTERSECT,

        selectLockedObjects:
            false,

        selectLockedLayers:
            false,

        selectHiddenObjects:
            false,

        selectHiddenLayers:
            false,

        constrainMarqueeToDocument:
            true,

        clearSelectionOnEmptyClick:
            true,

        marqueeStroke:
            "#7c3aed",

        marqueeFill:
            "rgba(124, 58, 237, 0.12)",

        marqueeStrokeWidth:
            1.5,

        marqueeDash:
            [7, 5]
    });

const MARQUEE_NODE_NAME =
    "fashion-editor-selection-marquee";

const ARTWORK_LAYER_NAME =
    "fashion-editor-artwork-layer";

const INTERACTION_LAYER_NAME =
    "fashion-editor-interaction-layer";

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
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isFunction(
    value
) {
    return typeof value ===
        "function";
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
    if (!Array.isArray(values)) {
        return [];
    }

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
Resolve Editor State
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
        return context.store.getState();
    }

    return useFashionEditorStore.getState();
}

/*=========================================================
Resolve Editor Actions
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
Document Bounds
=========================================================*/

function getDocumentBounds(
    document
) {
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

    return {
        x:
            0,

        y:
            0,

        width,

        height,

        left:
            0,

        top:
            0,

        right:
            width,

        bottom:
            height
    };
}

function isPointInsideDocument(
    point,
    document
) {
    if (!isFinitePoint(point)) {
        return false;
    }

    const bounds =
        getDocumentBounds(
            document
        );

    return (
        point.x >=
            bounds.left &&
        point.x <=
            bounds.right &&
        point.y >=
            bounds.top &&
        point.y <=
            bounds.bottom
    );
}

function clampPointToDocument(
    point,
    document
) {
    if (!isFinitePoint(point)) {
        return null;
    }

    const bounds =
        getDocumentBounds(
            document
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

/*=========================================================
Rectangle Helpers
=========================================================*/

export function createSelectionRectangle(
    startPoint,
    endPoint
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

    const x =
        Math.min(
            startPoint.x,
            endPoint.x
        );

    const y =
        Math.min(
            startPoint.y,
            endPoint.y
        );

    const width =
        Math.abs(
            endPoint.x -
            startPoint.x
        );

    const height =
        Math.abs(
            endPoint.y -
            startPoint.y
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
            x + width,

        bottom:
            y + height
    };
}

export function rectanglesIntersect(
    rectangleA,
    rectangleB
) {
    if (
        !rectangleA ||
        !rectangleB
    ) {
        return false;
    }

    return !(
        rectangleA.right <
            rectangleB.left ||
        rectangleA.left >
            rectangleB.right ||
        rectangleA.bottom <
            rectangleB.top ||
        rectangleA.top >
            rectangleB.bottom
    );
}

export function rectangleContains(
    outerRectangle,
    innerRectangle
) {
    if (
        !outerRectangle ||
        !innerRectangle
    ) {
        return false;
    }

    return (
        innerRectangle.left >=
            outerRectangle.left &&
        innerRectangle.right <=
            outerRectangle.right &&
        innerRectangle.top >=
            outerRectangle.top &&
        innerRectangle.bottom <=
            outerRectangle.bottom
    );
}

function getRectangleDistance(
    rectangle
) {
    if (!rectangle) {
        return 0;
    }

    return Math.hypot(
        rectangle.width,
        rectangle.height
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

    return children
        ? Array.from(children)
        : [];
}

function findNodeRecursively(
    rootNode,
    predicate
) {
    if (
        !rootNode ||
        !isFunction(predicate)
    ) {
        return null;
    }

    if (predicate(rootNode)) {
        return rootNode;
    }

    const children =
        getNodeChildren(
            rootNode
        );

    for (
        const child of children
    ) {
        const found =
            findNodeRecursively(
                child,
                predicate
            );

        if (found) {
            return found;
        }
    }

    return null;
}

function findNodeByName(
    stage,
    name
) {
    if (!stage || !name) {
        return null;
    }

    try {
        const node =
            stage.findOne(
                `.${name}`
            );

        if (node) {
            return node;
        }
    } catch {
        // Fall back to manual traversal.
    }

    return findNodeRecursively(
        stage,
        node =>
            isFunction(
                node.hasName
            ) &&
            node.hasName(name)
    );
}

function findObjectNode(
    stage,
    objectId
) {
    if (!stage || !objectId) {
        return null;
    }

    return findNodeRecursively(
        stage,
        node =>
            isFunction(node.id) &&
            node.id() === objectId
    );
}

function getArtworkRoot(
    stage
) {
    const artworkLayer =
        findNodeByName(
            stage,
            ARTWORK_LAYER_NAME
        );

    if (!artworkLayer) {
        return null;
    }

    return (
        getNodeChildren(
            artworkLayer
        )[0] ||
        null
    );
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
Find Object from Pointer Target
=========================================================*/

function getObjectIdFromEvent(
    context,
    state
) {
    let node =
        context?.event?.target ||
        null;

    const stage =
        context?.stage;

    while (
        node &&
        node !== stage
    ) {
        const nodeId =
            isFunction(node.id)
                ? node.id()
                : null;

        if (
            nodeId &&
            state?.objects?.[
                nodeId
            ]
        ) {
            return nodeId;
        }

        node =
            isFunction(
                node.getParent
            )
                ? node.getParent()
                : null;
    }

    return null;
}

/*=========================================================
Object Bounds
=========================================================*/

function normalizeClientRectangle(
    rectangle
) {
    if (!rectangle) {
        return null;
    }

    const x =
        numberOr(
            rectangle.x,
            0
        );

    const y =
        numberOr(
            rectangle.y,
            0
        );

    const width =
        Math.max(
            0,
            numberOr(
                rectangle.width,
                0
            )
        );

    const height =
        Math.max(
            0,
            numberOr(
                rectangle.height,
                0
            )
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
            x + width,

        bottom:
            y + height
    };
}

function getObjectNodeBounds(
    stage,
    artworkRoot,
    objectId
) {
    const objectNode =
        findObjectNode(
            stage,
            objectId
        );

    if (
        !objectNode ||
        !isFunction(
            objectNode.getClientRect
        )
    ) {
        return null;
    }

    try {
        return normalizeClientRectangle(
            objectNode.getClientRect({
                relativeTo:
                    artworkRoot ||
                    undefined,

                skipShadow:
                    true,

                skipStroke:
                    false
            })
        );
    } catch {
        return normalizeClientRectangle(
            objectNode.getClientRect({
                skipShadow:
                    true,

                skipStroke:
                    false
            })
        );
    }
}

/*=========================================================
Object Selectability
=========================================================*/

function isObjectSelectable(
    object,
    layer,
    options
) {
    if (!object || !layer) {
        return false;
    }

    if (
        !options
            .selectHiddenLayers &&
        layer.visible === false
    ) {
        return false;
    }

    if (
        !options
            .selectLockedLayers &&
        layer.locked
    ) {
        return false;
    }

    if (
        !options
            .selectHiddenObjects &&
        object.visible === false
    ) {
        return false;
    }

    if (
        !options
            .selectLockedObjects &&
        object.locked
    ) {
        return false;
    }

    return true;
}

/*=========================================================
Collect Objects in Marquee
=========================================================*/

function collectObjectsInRectangle(
    context,
    selectionRectangle,
    options
) {
    const state =
        resolveEditorState(
            context
        );

    const stage =
        context.stage;

    if (
        !state ||
        !stage ||
        !selectionRectangle
    ) {
        return [];
    }

    const artworkRoot =
        getArtworkRoot(
            stage
        );

    const selectedIds = [];

    state.layers.forEach(
        layer => {
            if (
                !Array.isArray(
                    layer.objectIds
                )
            ) {
                return;
            }

            layer.objectIds.forEach(
                objectId => {
                    const object =
                        state.objects[
                            objectId
                        ];

                    if (
                        !isObjectSelectable(
                            object,
                            layer,
                            options
                        )
                    ) {
                        return;
                    }

                    const objectBounds =
                        getObjectNodeBounds(
                            stage,
                            artworkRoot,
                            objectId
                        );

                    if (!objectBounds) {
                        return;
                    }

                    const selected =
                        options
                            .selectionMode ===
                        SELECTION_MODES
                            .CONTAIN
                            ? rectangleContains(
                                selectionRectangle,
                                objectBounds
                            )
                            : rectanglesIntersect(
                                selectionRectangle,
                                objectBounds
                            );

                    if (selected) {
                        selectedIds.push(
                            objectId
                        );
                    }
                }
            );
        }
    );

    return uniqueIds(
        selectedIds
    );
}

/*=========================================================
Modifier Selection
=========================================================*/

function hasAppendModifier(
    context
) {
    return Boolean(
        context.shiftKey ||
        context.ctrlKey ||
        context.metaKey
    );
}

function hasToggleModifier(
    context
) {
    return Boolean(
        context.ctrlKey ||
        context.metaKey
    );
}

/*=========================================================
Marquee Node
=========================================================*/

function removeMarqueeNode(
    context
) {
    const stage =
        context?.stage;

    if (!stage) {
        return;
    }

    const marqueeNode =
        findNodeByName(
            stage,
            MARQUEE_NODE_NAME
        );

    if (!marqueeNode) {
        return;
    }

    const layer =
        marqueeNode.getLayer?.();

    marqueeNode.destroy();

    layer?.batchDraw?.();
}

function createMarqueeNode(
    context,
    rectangle,
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
        !rectangle
    ) {
        return null;
    }

    removeMarqueeNode(
        context
    );

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                resolveEditorState(
                    context
                )?.viewport?.zoom,
                1
            )
        );

    const marqueeNode =
        new Konva.Rect({
            name:
                MARQUEE_NODE_NAME,

            x:
                rectangle.x,

            y:
                rectangle.y,

            width:
                rectangle.width,

            height:
                rectangle.height,

            fill:
                options.marqueeFill,

            stroke:
                options.marqueeStroke,

            strokeWidth:
                options
                    .marqueeStrokeWidth /
                zoom,

            dash:
                options.marqueeDash.map(
                    value =>
                        value / zoom
                ),

            listening:
                false,

            perfectDrawEnabled:
                false,

            shadowForStrokeEnabled:
                false
        });

    interactionRoot.add(
        marqueeNode
    );

    marqueeNode.moveToTop();

    interactionRoot
        .getLayer
        ?.()
        ?.batchDraw
        ?.();

    return marqueeNode;
}

function updateMarqueeNode(
    context,
    rectangle,
    options
) {
    const stage =
        context.stage;

    if (!stage || !rectangle) {
        return null;
    }

    let marqueeNode =
        findNodeByName(
            stage,
            MARQUEE_NODE_NAME
        );

    if (!marqueeNode) {
        marqueeNode =
            createMarqueeNode(
                context,
                rectangle,
                options
            );
    }

    if (!marqueeNode) {
        return null;
    }

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                resolveEditorState(
                    context
                )?.viewport?.zoom,
                1
            )
        );

    marqueeNode.setAttrs({
        x:
            rectangle.x,

        y:
            rectangle.y,

        width:
            rectangle.width,

        height:
            rectangle.height,

        strokeWidth:
            options
                .marqueeStrokeWidth /
            zoom,

        dash:
            options.marqueeDash.map(
                value =>
                    value / zoom
            )
    });

    marqueeNode
        .getLayer
        ?.()
        ?.batchDraw
        ?.();

    return marqueeNode;
}

/*=========================================================
Publish Marquee State
=========================================================*/

function publishMarquee(
    context,
    rectangle,
    active
) {
    context.manager?.setToolState(
        SELECTION_TOOL_ID,
        {
            marquee:
                rectangle,

            marqueeActive:
                Boolean(active)
        }
    );

    context.onSelectionMarqueeChange?.({
        rectangle,
        active:
            Boolean(active)
    });
}

/*=========================================================
Clear Marquee
=========================================================*/

function clearMarquee(
    context
) {
    removeMarqueeNode(
        context
    );

    publishMarquee(
        context,
        null,
        false
    );

    context.requestRender?.();
}

/*=========================================================
Object Click Selection
=========================================================*/

function applyObjectClickSelection(
    context,
    objectId
) {
    const state =
        resolveEditorState(
            context
        );

    const actions =
        resolveEditorActions(
            context
        );

    if (
        !state ||
        !objectId ||
        !isFunction(
            actions?.selectObjects
        )
    ) {
        return;
    }

    const isSelected =
        state.selectedObjectIds.includes(
            objectId
        );

    if (
        hasToggleModifier(
            context
        ) &&
        isFunction(
            actions.toggleObjectSelection
        )
    ) {
        actions.toggleObjectSelection(
            objectId
        );

        return;
    }

    if (
        context.shiftKey &&
        isFunction(
            actions.toggleObjectSelection
        )
    ) {
        actions.toggleObjectSelection(
            objectId
        );

        return;
    }

    if (!isSelected) {
        actions.selectObjects(
            [objectId]
        );
    }
}

/*=========================================================
Create Selection Session
=========================================================*/

function createSelectionSession({
    context,
    startPoint,
    objectId
}) {
    return {
        mode:
            objectId
                ? "object"
                : "marquee",

        objectId:
            objectId ||
            null,

        startPoint:
            clonePoint(
                startPoint
            ),

        currentPoint:
            clonePoint(
                startPoint
            ),

        append:
            hasAppendModifier(
                context
            ),

        startedAt:
            Date.now(),

        moved:
            false
    };
}

/*=========================================================
Create Selection Tool
=========================================================*/

export function createSelectionTool(
    toolOptions = {}
) {
    const options = {
        ...DEFAULT_SELECTION_OPTIONS,
        ...toolOptions,

        minimumMarqueeDistance:
            Math.max(
                0,
                numberOr(
                    toolOptions
                        .minimumMarqueeDistance,
                    DEFAULT_SELECTION_OPTIONS
                        .minimumMarqueeDistance
                )
            ),

        selectionMode:
            Object.values(
                SELECTION_MODES
            ).includes(
                toolOptions.selectionMode
            )
                ? toolOptions
                    .selectionMode
                : DEFAULT_SELECTION_OPTIONS
                    .selectionMode,

        marqueeStrokeWidth:
            Math.max(
                0.25,
                numberOr(
                    toolOptions
                        .marqueeStrokeWidth,
                    DEFAULT_SELECTION_OPTIONS
                        .marqueeStrokeWidth
                )
            ),

        marqueeDash:
            Array.isArray(
                toolOptions.marqueeDash
            )
                ? toolOptions
                    .marqueeDash
                    .map(value =>
                        Math.max(
                            0,
                            numberOr(
                                value,
                                0
                            )
                        )
                    )
                : [
                    ...DEFAULT_SELECTION_OPTIONS
                        .marqueeDash
                ]
    };

    return defineTool({
        id:
            SELECTION_TOOL_ID,

        label:
            "Select",

        description:
            "Select, move and transform canvas objects.",

        cursor:
            "default",

        shortcut:
            "V",

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
                clearMarquee(
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

                const state =
                    resolveEditorState(
                        context
                    );

                const actions =
                    resolveEditorActions(
                        context
                    );

                if (
                    !state ||
                    !isFinitePoint(
                        context.point
                    )
                ) {
                    return null;
                }

                const objectId =
                    getObjectIdFromEvent(
                        context,
                        state
                    );

                if (objectId) {
                    applyObjectClickSelection(
                        context,
                        objectId
                    );

                    const objectSession =
                        createSelectionSession({
                            context,

                            startPoint:
                                context.point,

                            objectId
                        });

                    context.replaceInteractionData(
                        objectSession
                    );

                    return objectSession;
                }

                const insideDocument =
                    isPointInsideDocument(
                        context.point,
                        state.document
                    );

                if (!insideDocument) {
                    if (
                        options
                            .clearSelectionOnEmptyClick &&
                        !hasAppendModifier(
                            context
                        )
                    ) {
                        actions
                            ?.clearSelection
                            ?.();
                    }

                    return null;
                }

                const startPoint =
                    options
                        .constrainMarqueeToDocument
                        ? clampPointToDocument(
                            context.point,
                            state.document
                        )
                        : clonePoint(
                            context.point
                        );

                const session =
                    createSelectionSession({
                        context,

                        startPoint,

                        objectId:
                            null
                    });

                context.replaceInteractionData(
                    session
                );

                const initialRectangle =
                    createSelectionRectangle(
                        startPoint,
                        startPoint
                    );

                updateMarqueeNode(
                    context,
                    initialRectangle,
                    options
                );

                publishMarquee(
                    context,
                    initialRectangle,
                    true
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
                    session.mode !==
                        "marquee" ||
                    !isFinitePoint(
                        context.point
                    )
                ) {
                    return null;
                }

                const state =
                    resolveEditorState(
                        context
                    );

                if (!state) {
                    return null;
                }

                const currentPoint =
                    options
                        .constrainMarqueeToDocument
                        ? clampPointToDocument(
                            context.point,
                            state.document
                        )
                        : clonePoint(
                            context.point
                        );

                const rectangle =
                    createSelectionRectangle(
                        session.startPoint,
                        currentPoint
                    );

                const moved =
                    getRectangleDistance(
                        rectangle
                    ) >=
                    options
                        .minimumMarqueeDistance;

                const nextSession = {
                    ...session,

                    currentPoint,

                    moved
                };

                context.replaceInteractionData(
                    nextSession
                );

                updateMarqueeNode(
                    context,
                    rectangle,
                    options
                );

                publishMarquee(
                    context,
                    rectangle,
                    true
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
                    clearMarquee(
                        context
                    );

                    return null;
                }

                if (
                    session.mode ===
                    "object"
                ) {
                    clearMarquee(
                        context
                    );

                    return session.objectId;
                }

                const state =
                    resolveEditorState(
                        context
                    );

                const actions =
                    resolveEditorActions(
                        context
                    );

                if (!state) {
                    clearMarquee(
                        context
                    );

                    return null;
                }

                const currentPoint =
                    isFinitePoint(
                        context.point
                    )
                        ? (
                            options
                                .constrainMarqueeToDocument
                                ? clampPointToDocument(
                                    context.point,
                                    state.document
                                )
                                : clonePoint(
                                    context.point
                                )
                        )
                        : session.currentPoint;

                const rectangle =
                    createSelectionRectangle(
                        session.startPoint,
                        currentPoint
                    );

                const moved =
                    getRectangleDistance(
                        rectangle
                    ) >=
                    options
                        .minimumMarqueeDistance;

                if (!moved) {
                    if (
                        options
                            .clearSelectionOnEmptyClick &&
                        !session.append
                    ) {
                        actions
                            ?.clearSelection
                            ?.();
                    }

                    clearMarquee(
                        context
                    );

                    return [];
                }

                const selectedIds =
                    collectObjectsInRectangle(
                        context,
                        rectangle,
                        options
                    );

                actions
                    ?.selectObjects
                    ?.(
                        selectedIds,
                        {
                            append:
                                session.append
                        }
                    );

                clearMarquee(
                    context
                );

                context.onSelectionComplete?.({
                    objectIds:
                        selectedIds,

                    rectangle,

                    append:
                        session.append
                });

                return selectedIds;
            },

        /*---------------------------------------------
        Pointer Cancel
        ---------------------------------------------*/

        onPointerCancel:
            context => {
                clearMarquee(
                    context
                );
            },

        /*---------------------------------------------
        Cancel
        ---------------------------------------------*/

        onCancel:
            context => {
                clearMarquee(
                    context
                );
            },

        /*---------------------------------------------
        Deactivate
        ---------------------------------------------*/

        onDeactivate:
            context => {
                clearMarquee(
                    context
                );
            },

        /*---------------------------------------------
        Escape
        ---------------------------------------------*/

        onKeyDown:
            context => {
                if (
                    context.nativeEvent
                        ?.key ===
                    "Escape"
                ) {
                    clearMarquee(
                        context
                    );
                }
            },

        /*---------------------------------------------
        Destroy
        ---------------------------------------------*/

        onDestroy:
            context => {
                clearMarquee(
                    context
                );
            }
    });
}

/*=========================================================
Default Selection Tool
=========================================================*/

export const SelectionTool =
    createSelectionTool();

/*=========================================================
Default Export
=========================================================*/

export default SelectionTool;