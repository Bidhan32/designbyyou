/*
=========================================================
FashionVision Professional Editor
Selection Tool
Version 1.1 — Linked Symmetry Movement
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

export const SELECTION_TOOL_ID = EDITOR_TOOLS.SELECT;

export const SELECTION_MODES = Object.freeze({
    INTERSECT: "intersect",
    CONTAIN: "contain"
});

export const DEFAULT_SELECTION_OPTIONS = Object.freeze({
    minimumMarqueeDistance: 4,
    minimumObjectDragDistance: 2,
    selectionMode: SELECTION_MODES.INTERSECT,
    selectLockedObjects: false,
    selectLockedLayers: false,
    selectHiddenObjects: false,
    selectHiddenLayers: false,
    constrainMarqueeToDocument: true,
    clearSelectionOnEmptyClick: true,
    linkedSymmetryMovement: true,
    marqueeStroke: "#7c3aed",
    marqueeFill: "rgba(124, 58, 237, 0.12)",
    marqueeStrokeWidth: 1.5,
    marqueeDash: [7, 5]
});

const MARQUEE_NODE_NAME = "fashion-editor-selection-marquee";
const ARTWORK_LAYER_NAME = "fashion-editor-artwork-layer";
const INTERACTION_LAYER_NAME = "fashion-editor-interaction-layer";
const MOVE_EPSILON = 0.0001;

const SYMMETRY_VARIANTS = Object.freeze({
    SOURCE: "source",
    VERTICAL: "vertical",
    HORIZONTAL: "horizontal",
    BOTH: "both"
});

/*=========================================================
Numeric and General Helpers
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

function roundNumber(value, precision = 6) {
    const multiplier = 10 ** precision;

    return (
        Math.round(
            numberOr(value, 0) *
            multiplier
        ) /
        multiplier
    );
}

function isPlainObject(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isFunction(value) {
    return typeof value === "function";
}

function isFinitePoint(point) {
    return Boolean(
        point &&
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.y))
    );
}

function clonePoint(point) {
    if (!isFinitePoint(point)) {
        return null;
    }

    return {
        x: Number(point.x),
        y: Number(point.y)
    };
}

function uniqueIds(values = []) {
    return [
        ...new Set(
            (
                Array.isArray(values)
                    ? values
                    : []
            ).filter(
                value =>
                    typeof value === "string" &&
                    value.length > 0
            )
        )
    ];
}

function pointDistance(firstPoint, secondPoint) {
    if (
        !isFinitePoint(firstPoint) ||
        !isFinitePoint(secondPoint)
    ) {
        return 0;
    }

    return Math.hypot(
        secondPoint.x - firstPoint.x,
        secondPoint.y - firstPoint.y
    );
}

/*=========================================================
Editor State and Actions
=========================================================*/

function resolveEditorState(context) {
    if (
        isFunction(
            context?.store?.getState
        )
    ) {
        return context.store.getState();
    }

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

    return useFashionEditorStore.getState();
}

function resolveEditorActions(context) {
    if (
        isPlainObject(
            context?.actions
        )
    ) {
        return context.actions;
    }

    return resolveEditorState(context);
}

/*=========================================================
Document Bounds
=========================================================*/

function getDocumentBounds(documentData) {
    const width = Math.max(
        1,
        numberOr(
            documentData?.width,
            1200
        )
    );

    const height = Math.max(
        1,
        numberOr(
            documentData?.height,
            1600
        )
    );

    return {
        x: 0,
        y: 0,
        width,
        height,
        left: 0,
        top: 0,
        right: width,
        bottom: height
    };
}

function isPointInsideDocument(point, documentData) {
    if (!isFinitePoint(point)) {
        return false;
    }

    const bounds = getDocumentBounds(
        documentData
    );

    return (
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
    );
}

function clampPointToDocument(point, documentData) {
    if (!isFinitePoint(point)) {
        return null;
    }

    const bounds = getDocumentBounds(
        documentData
    );

    return {
        x: clamp(
            point.x,
            bounds.left,
            bounds.right
        ),

        y: clamp(
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
        !isFinitePoint(startPoint) ||
        !isFinitePoint(endPoint)
    ) {
        return null;
    }

    const x = Math.min(
        startPoint.x,
        endPoint.x
    );

    const y = Math.min(
        startPoint.y,
        endPoint.y
    );

    const width = Math.abs(
        endPoint.x - startPoint.x
    );

    const height = Math.abs(
        endPoint.y - startPoint.y
    );

    return {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
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
        rectangleA.right < rectangleB.left ||
        rectangleA.left > rectangleB.right ||
        rectangleA.bottom < rectangleB.top ||
        rectangleA.top > rectangleB.bottom
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
        innerRectangle.left >= outerRectangle.left &&
        innerRectangle.right <= outerRectangle.right &&
        innerRectangle.top >= outerRectangle.top &&
        innerRectangle.bottom <= outerRectangle.bottom
    );
}

function getRectangleDistance(rectangle) {
    return rectangle
        ? Math.hypot(
            rectangle.width,
            rectangle.height
        )
        : 0;
}

/*=========================================================
Konva Tree Helpers
=========================================================*/

function getNodeChildren(node) {
    if (
        !node ||
        !isFunction(node.getChildren)
    ) {
        return [];
    }

    const children = node.getChildren();

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

    for (
        const child of getNodeChildren(
            rootNode
        )
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

function findNodeByName(stage, name) {
    if (
        !stage ||
        !name
    ) {
        return null;
    }

    try {
        const node = stage.findOne(
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
            isFunction(node.hasName) &&
            node.hasName(name)
    );
}

function findObjectNode(stage, objectId) {
    if (
        !stage ||
        !objectId
    ) {
        return null;
    }

    try {
        const result = stage.find(
            node =>
                node.getAttr?.(
                    "editorObjectRoot"
                ) === true &&
                node.getAttr?.(
                    "editorObjectId"
                ) === objectId
        );

        const nodes =
            isFunction(result?.toArray)
                ? result.toArray()
                : Array.from(
                    result || []
                );

        if (nodes[0]) {
            return nodes[0];
        }
    } catch {
        // Fall back to ID traversal.
    }

    return findNodeRecursively(
        stage,
        node =>
            isFunction(node.id) &&
            node.id() === objectId
    );
}

function getArtworkRoot(stage) {
    const artworkLayer =
        findNodeByName(
            stage,
            ARTWORK_LAYER_NAME
        );

    return artworkLayer
        ? getNodeChildren(
            artworkLayer
        )[0] || null
        : null;
}

function getInteractionRoot(stage) {
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

function getObjectIdFromNode(
    node,
    stage,
    state
) {
    let currentNode = node;

    while (
        currentNode &&
        currentNode !== stage
    ) {
        const editorObjectId =
            currentNode.getAttr?.(
                "editorObjectId"
            );

        if (
            editorObjectId &&
            state.objects?.[
                editorObjectId
            ]
        ) {
            return editorObjectId;
        }

        const nodeId =
            currentNode.id?.();

        if (
            nodeId &&
            state.objects?.[nodeId]
        ) {
            return nodeId;
        }

        currentNode =
            currentNode.getParent?.() ||
            null;
    }

    return null;
}

function getObjectIdFromEvent(
    context,
    state
) {
    return getObjectIdFromNode(
        context?.event?.target || null,
        context?.stage || null,
        state
    );
}

/*=========================================================
Object Bounds and Selectability
=========================================================*/

function normalizeClientRectangle(rectangle) {
    if (!rectangle) {
        return null;
    }

    const x = numberOr(
        rectangle.x,
        0
    );

    const y = numberOr(
        rectangle.y,
        0
    );

    const width = Math.max(
        0,
        numberOr(
            rectangle.width,
            0
        )
    );

    const height = Math.max(
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
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
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

                skipShadow: true,
                skipStroke: false
            })
        );
    } catch {
        return normalizeClientRectangle(
            objectNode.getClientRect({
                skipShadow: true,
                skipStroke: false
            })
        );
    }
}

function isObjectSelectable(
    object,
    layer,
    options
) {
    if (
        !object ||
        !layer
    ) {
        return false;
    }

    if (
        !options.selectHiddenLayers &&
        layer.visible === false
    ) {
        return false;
    }

    if (
        !options.selectLockedLayers &&
        layer.locked
    ) {
        return false;
    }

    if (
        !options.selectHiddenObjects &&
        object.visible === false
    ) {
        return false;
    }

    if (
        !options.selectLockedObjects &&
        object.locked
    ) {
        return false;
    }

    return true;
}

function isObjectMovable(
    object,
    layer
) {
    return Boolean(
        object &&
        layer &&
        object.visible !== false &&
        object.locked !== true &&
        object.selectable !== false &&
        layer.visible !== false &&
        layer.locked !== true
    );
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

    const stage = context.stage;

    if (
        !state ||
        !stage ||
        !selectionRectangle
    ) {
        return [];
    }

    const artworkRoot =
        getArtworkRoot(stage);

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
                        options.selectionMode ===
                            SELECTION_MODES.CONTAIN
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

function hasAppendModifier(context) {
    return Boolean(
        context.shiftKey ||
        context.ctrlKey ||
        context.metaKey
    );
}

function hasToggleModifier(context) {
    return Boolean(
        context.ctrlKey ||
        context.metaKey
    );
}

/*=========================================================
Marquee Node
=========================================================*/

function removeMarqueeNode(context) {
    const stage = context?.stage;

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
    const stage = context.stage;

    const interactionRoot =
        getInteractionRoot(stage);

    if (
        !stage ||
        !interactionRoot ||
        !rectangle
    ) {
        return null;
    }

    removeMarqueeNode(context);

    const zoom = Math.max(
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
                options.marqueeStrokeWidth /
                zoom,

            dash:
                options.marqueeDash.map(
                    value =>
                        value / zoom
                ),

            listening: false,
            perfectDrawEnabled: false,
            shadowForStrokeEnabled: false
        });

    interactionRoot.add(
        marqueeNode
    );

    marqueeNode.moveToTop();

    interactionRoot
        .getLayer?.()
        ?.batchDraw?.();

    return marqueeNode;
}

function updateMarqueeNode(
    context,
    rectangle,
    options
) {
    const stage = context.stage;

    if (
        !stage ||
        !rectangle
    ) {
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

    const zoom = Math.max(
        0.0001,
        numberOr(
            resolveEditorState(
                context
            )?.viewport?.zoom,
            1
        )
    );

    marqueeNode.setAttrs({
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,

        strokeWidth:
            options.marqueeStrokeWidth /
            zoom,

        dash:
            options.marqueeDash.map(
                value =>
                    value / zoom
            )
    });

    marqueeNode
        .getLayer?.()
        ?.batchDraw?.();

    return marqueeNode;
}

function publishMarquee(
    context,
    rectangle,
    active
) {
    context.manager?.setToolState(
        SELECTION_TOOL_ID,
        {
            marquee: rectangle,
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

function clearMarquee(context) {
    removeMarqueeNode(context);

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
        resolveEditorState(context);

    const actions =
        resolveEditorActions(context);

    if (
        !state ||
        !objectId ||
        !isFunction(
            actions?.selectObjects
        )
    ) {
        return [];
    }

    const isSelected =
        state.selectedObjectIds
            .includes(objectId);

    if (
        (
            hasToggleModifier(context) ||
            context.shiftKey
        ) &&
        isFunction(
            actions.toggleObjectSelection
        )
    ) {
        actions.toggleObjectSelection(
            objectId
        );
    } else if (!isSelected) {
        actions.selectObjects(
            [objectId]
        );
    }

    return uniqueIds(
        resolveEditorState(
            context
        )?.selectedObjectIds ||
        [objectId]
    );
}

/*=========================================================
Linked Symmetry Metadata
=========================================================*/

function normalizeSymmetryVariant(variant) {
    const requested =
        typeof variant === "string"
            ? variant
                .trim()
                .toLowerCase()
            : "";

    switch (requested) {
        case SYMMETRY_VARIANTS.VERTICAL:
        case SYMMETRY_VARIANTS.HORIZONTAL:
        case SYMMETRY_VARIANTS.BOTH:
            return requested;

        default:
            return SYMMETRY_VARIANTS.SOURCE;
    }
}

function getLinkedSymmetryMetadata(object) {
    const symmetry =
        object?.metadata?.symmetry;

    if (
        !isPlainObject(symmetry) ||
        symmetry.linked !== true ||
        !symmetry.groupId
    ) {
        return null;
    }

    return {
        ...symmetry,

        groupId:
            symmetry.groupId,

        sourceObjectId:
            symmetry.sourceObjectId ||
            object.id ||
            null,

        variant:
            normalizeSymmetryVariant(
                symmetry.variant
            ),

        axisX:
            numberOr(
                symmetry.axisX,
                0
            ),

        axisY:
            numberOr(
                symmetry.axisY,
                0
            )
    };
}

function reflectMovementDelta(
    delta,
    variant
) {
    const x = numberOr(
        delta?.x,
        0
    );

    const y = numberOr(
        delta?.y,
        0
    );

    switch (
        normalizeSymmetryVariant(
            variant
        )
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
            return {
                x: -x,
                y
            };

        case SYMMETRY_VARIANTS.HORIZONTAL:
            return {
                x,
                y: -y
            };

        case SYMMETRY_VARIANTS.BOTH:
            return {
                x: -x,
                y: -y
            };

        default:
            return {
                x,
                y
            };
    }
}

function createLayerMap(layers) {
    return new Map(
        (
            Array.isArray(layers)
                ? layers
                : []
        ).map(
            layer => [
                layer.id,
                layer
            ]
        )
    );
}

function resolveLinkedGroupMembers(
    state,
    groupId,
    stage,
    layerMap
) {
    const candidates =
        Object.values(
            state?.objects || {}
        ).filter(
            object =>
                getLinkedSymmetryMetadata(
                    object
                )?.groupId ===
                groupId
        );

    if (
        candidates.length < 2
    ) {
        return [];
    }

    const members =
        candidates
            .map(
                object => {
                    const layer =
                        layerMap.get(
                            object.layerId
                        );

                    if (
                        !isObjectMovable(
                            object,
                            layer
                        )
                    ) {
                        return null;
                    }

                    const node =
                        findObjectNode(
                            stage,
                            object.id
                        );

                    if (!node) {
                        return null;
                    }

                    return {
                        object,
                        node,

                        metadata:
                            getLinkedSymmetryMetadata(
                                object
                            )
                    };
                }
            )
            .filter(Boolean);

    return members.length ===
        candidates.length
        ? members
        : [];
}

/*=========================================================
Linked Movement Session
=========================================================*/

function suppressNodeDragging(snapshot) {
    if (!snapshot?.node) {
        return;
    }

    snapshot.node.stopDrag?.();
    snapshot.node.draggable?.(false);
}

function restoreNodeDragging(snapshot) {
    if (!snapshot?.node) {
        return;
    }

    snapshot.node.stopDrag?.();

    if (
        typeof snapshot.wasDraggable ===
        "boolean"
    ) {
        snapshot.node.draggable?.(
            snapshot.wasDraggable
        );
    }
}

function restoreMovementSession(
    session,
    restorePosition = true
) {
    Object.values(
        session?.snapshots || {}
    ).forEach(
        snapshot => {
            if (restorePosition) {
                snapshot.node?.position?.({
                    x: snapshot.x,
                    y: snapshot.y
                });
            }

            restoreNodeDragging(
                snapshot
            );
        }
    );

    session?.stage?.batchDraw?.();
}

function createLinkedMovementSession({
    context,
    objectId,
    startPoint,
    selectedIds,
    options
}) {
    const state =
        resolveEditorState(context);

    const stage = context.stage;

    if (
        !state ||
        !stage ||
        !objectId ||
        !isFinitePoint(startPoint)
    ) {
        return null;
    }

    const layerMap =
        createLayerMap(
            state.layers
        );

    const safeSelectedIds =
        uniqueIds(selectedIds)
            .filter(
                selectedId => {
                    const object =
                        state.objects[
                            selectedId
                        ];

                    return isObjectMovable(
                        object,
                        layerMap.get(
                            object?.layerId
                        )
                    );
                }
            );

    if (
        !safeSelectedIds.includes(
            objectId
        )
    ) {
        return null;
    }

    const snapshots = {};
    const strategies = {};
    const linkedGroupIds = [];
    const handledObjectIds =
        new Set();
    const handledGroupIds =
        new Set();

    if (
        options.linkedSymmetryMovement
    ) {
        safeSelectedIds.forEach(
            selectedObjectId => {
                const selectedObject =
                    state.objects[
                        selectedObjectId
                    ];

                const metadata =
                    getLinkedSymmetryMetadata(
                        selectedObject
                    );

                if (
                    !metadata ||
                    handledGroupIds.has(
                        metadata.groupId
                    )
                ) {
                    return;
                }

                handledGroupIds.add(
                    metadata.groupId
                );

                const members =
                    resolveLinkedGroupMembers(
                        state,
                        metadata.groupId,
                        stage,
                        layerMap
                    );

                if (
                    members.length < 2
                ) {
                    return;
                }

                const selectedMemberIds =
                    members
                        .map(
                            member =>
                                member.object.id
                        )
                        .filter(
                            memberId =>
                                safeSelectedIds.includes(
                                    memberId
                                )
                        );

                if (
                    selectedMemberIds.length ===
                    0
                ) {
                    return;
                }

                const driverObjectId =
                    selectedMemberIds.includes(
                        objectId
                    )
                        ? objectId
                        : (
                            selectedMemberIds.find(
                                memberId =>
                                    getLinkedSymmetryMetadata(
                                        state.objects[
                                            memberId
                                        ]
                                    )?.variant ===
                                    SYMMETRY_VARIANTS.SOURCE
                            ) ||
                            selectedMemberIds[0]
                        );

                const driverMetadata =
                    getLinkedSymmetryMetadata(
                        state.objects[
                            driverObjectId
                        ]
                    );

                if (!driverMetadata) {
                    return;
                }

                members.forEach(
                    member => {
                        const memberId =
                            member.object.id;

                        const node =
                            member.node;

                        snapshots[
                            memberId
                        ] = {
                            objectId:
                                memberId,

                            node,

                            x:
                                numberOr(
                                    node.x?.(),
                                    member.object.x
                                ),

                            y:
                                numberOr(
                                    node.y?.(),
                                    member.object.y
                                ),

                            wasDraggable:
                                Boolean(
                                    node.draggable?.()
                                )
                        };

                        strategies[
                            memberId
                        ] = {
                            type:
                                "linked-symmetry",

                            groupId:
                                metadata.groupId,

                            driverObjectId,

                            driverVariant:
                                driverMetadata.variant,

                            memberVariant:
                                member.metadata.variant
                        };

                        handledObjectIds.add(
                            memberId
                        );
                    }
                );

                linkedGroupIds.push(
                    metadata.groupId
                );
            }
        );
    }

    safeSelectedIds.forEach(
        selectedObjectId => {
            if (
                handledObjectIds.has(
                    selectedObjectId
                )
            ) {
                return;
            }

            const object =
                state.objects[
                    selectedObjectId
                ];

            const node =
                findObjectNode(
                    stage,
                    selectedObjectId
                );

            if (
                !object ||
                !node
            ) {
                return;
            }

            snapshots[
                selectedObjectId
            ] = {
                objectId:
                    selectedObjectId,

                node,

                x:
                    numberOr(
                        node.x?.(),
                        object.x
                    ),

                y:
                    numberOr(
                        node.y?.(),
                        object.y
                    ),

                wasDraggable:
                    Boolean(
                        node.draggable?.()
                    )
            };

            strategies[
                selectedObjectId
            ] = {
                type:
                    "direct"
            };
        }
    );

    if (
        linkedGroupIds.length === 0
    ) {
        return null;
    }

    Object.values(
        snapshots
    ).forEach(
        suppressNodeDragging
    );

    return {
        objectId,

        startPoint:
            clonePoint(startPoint),

        currentPoint:
            clonePoint(startPoint),

        selectedIds:
            safeSelectedIds,

        affectedObjectIds:
            Object.keys(snapshots),

        snapshots,
        strategies,

        linkedGroupIds:
            uniqueIds(linkedGroupIds),

        moved: false,
        historyStarted: false,
        stage
    };
}

function resolveObjectDelta(
    pointerDelta,
    strategy
) {
    if (
        strategy?.type !==
        "linked-symmetry"
    ) {
        return pointerDelta;
    }

    const sourceDelta =
        reflectMovementDelta(
            pointerDelta,
            strategy.driverVariant
        );

    return reflectMovementDelta(
        sourceDelta,
        strategy.memberVariant
    );
}

function clearObjectMovementState(context) {
    context.manager?.setToolState(
        SELECTION_TOOL_ID,
        {
            moving: false,
            movingObjectId: null,
            affectedObjectIds: [],
            linkedGroupIds: [],
            delta: null
        }
    );
}

function applyLinkedMovement(
    context,
    session,
    point,
    options
) {
    if (
        !session ||
        !isFinitePoint(point)
    ) {
        return session;
    }

    const pointerDelta = {
        x:
            point.x -
            session.startPoint.x,

        y:
            point.y -
            session.startPoint.y
    };

    const moved =
        session.moved ||
        pointDistance(
            session.startPoint,
            point
        ) >=
        options.minimumObjectDragDistance;

    if (!moved) {
        return {
            ...session,
            currentPoint:
                clonePoint(point)
        };
    }

    const actions =
        resolveEditorActions(context);

    let historyStarted =
        session.historyStarted;

    if (
        !historyStarted &&
        isFunction(
            actions?.beginHistoryTransaction
        )
    ) {
        actions.beginHistoryTransaction(
            "Move linked symmetry"
        );

        historyStarted = true;
    }

    session.affectedObjectIds.forEach(
        objectId => {
            const snapshot =
                session.snapshots[
                    objectId
                ];

            if (!snapshot?.node) {
                return;
            }

            suppressNodeDragging(
                snapshot
            );

            const objectDelta =
                resolveObjectDelta(
                    pointerDelta,
                    session.strategies[
                        objectId
                    ]
                );

            snapshot.node.position({
                x:
                    snapshot.x +
                    objectDelta.x,

                y:
                    snapshot.y +
                    objectDelta.y
            });
        }
    );

    session.stage?.batchDraw?.();

    const nextSession = {
        ...session,

        currentPoint:
            clonePoint(point),

        pointerDelta,
        moved: true,
        historyStarted
    };

    context.manager?.setToolState(
        SELECTION_TOOL_ID,
        {
            moving: true,

            movingObjectId:
                session.objectId,

            selectedObjectIds:
                session.selectedIds,

            affectedObjectIds:
                session.affectedObjectIds,

            linkedGroupIds:
                session.linkedGroupIds,

            delta:
                pointerDelta
        }
    );

    context.onSelectionMove?.({
        objectId:
            session.objectId,

        selectedObjectIds:
            session.selectedIds,

        affectedObjectIds:
            session.affectedObjectIds,

        linkedGroupIds:
            session.linkedGroupIds,

        delta:
            pointerDelta
    });

    return nextSession;
}

function finishLinkedMovement(
    context,
    session,
    finalPoint,
    options
) {
    let completedSession = session;

    if (
        isFinitePoint(finalPoint)
    ) {
        completedSession =
            applyLinkedMovement(
                context,
                session,
                finalPoint,
                options
            );
    }

    const actions =
        resolveEditorActions(context);

    if (!completedSession?.moved) {
        restoreMovementSession(
            completedSession,
            false
        );

        clearObjectMovementState(
            context
        );

        return (
            completedSession?.objectId ||
            null
        );
    }

    const updatesById =
        new Map();

    completedSession
        .affectedObjectIds
        .forEach(
            objectId => {
                const snapshot =
                    completedSession
                        .snapshots[
                            objectId
                        ];

                if (!snapshot?.node) {
                    return;
                }

                const x =
                    roundNumber(
                        snapshot.node.x?.(),
                        6
                    );

                const y =
                    roundNumber(
                        snapshot.node.y?.(),
                        6
                    );

                if (
                    Math.abs(
                        x - snapshot.x
                    ) < MOVE_EPSILON &&
                    Math.abs(
                        y - snapshot.y
                    ) < MOVE_EPSILON
                ) {
                    return;
                }

                updatesById.set(
                    objectId,
                    {
                        x,
                        y
                    }
                );
            }
        );

    const changedObjectIds = [
        ...updatesById.keys()
    ];

    try {
        if (
            changedObjectIds.length === 0
        ) {
            if (
                completedSession
                    .historyStarted
            ) {
                actions
                    ?.cancelHistoryTransaction
                    ?.();
            }
        } else if (
            isFunction(
                actions?.updateObjects
            )
        ) {
            actions.updateObjects(
                changedObjectIds,

                currentObject =>
                    updatesById.get(
                        currentObject.id
                    ) || {},

                "Move linked symmetry"
            );

            if (
                completedSession
                    .historyStarted
            ) {
                actions
                    .commitHistoryTransaction
                    ?.();
            }
        } else if (
            isFunction(
                actions?.updateObject
            )
        ) {
            changedObjectIds.forEach(
                objectId => {
                    actions.updateObject(
                        objectId,
                        updatesById.get(
                            objectId
                        ),
                        "Move linked symmetry"
                    );
                }
            );

            if (
                completedSession
                    .historyStarted
            ) {
                actions
                    .commitHistoryTransaction
                    ?.();
            }
        } else {
            throw new Error(
                "SelectionTool requires updateObject or updateObjects."
            );
        }
    } catch (error) {
        restoreMovementSession(
            completedSession,
            true
        );

        if (
            completedSession
                .historyStarted
        ) {
            actions
                ?.cancelHistoryTransaction
                ?.();
        }

        clearObjectMovementState(
            context
        );

        console.error(
            "SelectionTool linked movement failed:",
            error
        );

        context.onSelectionMoveError?.({
            error,

            objectId:
                completedSession.objectId,

            affectedObjectIds:
                completedSession
                    .affectedObjectIds
        });

        return null;
    }

    restoreMovementSession(
        completedSession,
        false
    );

    clearObjectMovementState(
        context
    );

    context.onSelectionMoveEnd?.({
        objectId:
            completedSession.objectId,

        selectedObjectIds:
            completedSession.selectedIds,

        affectedObjectIds:
            changedObjectIds,

        linkedGroupIds:
            completedSession.linkedGroupIds,

        changed:
            changedObjectIds.length > 0
    });

    return changedObjectIds;
}

function cancelLinkedMovement(
    context,
    session,
    reason = "cancelled"
) {
    if (!session) {
        return false;
    }

    restoreMovementSession(
        session,
        true
    );

    if (session.historyStarted) {
        resolveEditorActions(
            context
        )?.cancelHistoryTransaction?.();
    }

    clearObjectMovementState(
        context
    );

    context.onSelectionMoveCancel?.({
        reason,

        objectId:
            session.objectId,

        affectedObjectIds:
            session.affectedObjectIds,

        linkedGroupIds:
            session.linkedGroupIds
    });

    return true;
}

/*=========================================================
Selection Tool Factory
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

        minimumObjectDragDistance:
            Math.max(
                0,
                numberOr(
                    toolOptions
                        .minimumObjectDragDistance,
                    DEFAULT_SELECTION_OPTIONS
                        .minimumObjectDragDistance
                )
            ),

        selectionMode:
            Object.values(
                SELECTION_MODES
            ).includes(
                toolOptions.selectionMode
            )
                ? toolOptions.selectionMode
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
                : [
                    ...DEFAULT_SELECTION_OPTIONS
                        .marqueeDash
                ]
    };

    /*=====================================================
    Native Linked-Symmetry Drag Coordinator

    Editor object renderers stop Konva pointer bubbling and
    already handle normal dragging. A native capture listener
    intercepts only linked symmetry objects, preserving normal
    object dragging and text double-click editing.
    =====================================================*/

    let activeContext = null;
    let stage = null;
    let container = null;
    let movementSession = null;
    let pointerId = null;
    let suppressClickUntil = 0;

    function documentPointFromNativeEvent(
        nativeEvent
    ) {
        if (
            !stage ||
            !nativeEvent
        ) {
            return null;
        }

        stage.setPointersPositions?.(
            nativeEvent
        );

        const screenPoint =
            stage.getPointerPosition?.();

        if (
            !isFinitePoint(screenPoint)
        ) {
            return null;
        }

        const state =
            useFashionEditorStore
                .getState();

        const zoom = Math.max(
            0.0001,
            numberOr(
                state.viewport?.zoom,
                1
            )
        );

        return {
            x:
                (
                    screenPoint.x -
                    numberOr(
                        state.viewport?.x,
                        0
                    )
                ) /
                zoom,

            y:
                (
                    screenPoint.y -
                    numberOr(
                        state.viewport?.y,
                        0
                    )
                ) /
                zoom
        };
    }

    function createNativeContext(
        nativeEvent,
        targetNode,
        point
    ) {
        const state =
            useFashionEditorStore
                .getState();

        return {
            ...(activeContext || {}),

            state,
            editorState: state,
            actions: state,
            store:
                useFashionEditorStore,

            stage,

            event: {
                target:
                    targetNode,

                evt:
                    nativeEvent,

                nativeEvent
            },

            nativeEvent,
            point,
            documentPoint:
                point,

            button:
                numberOr(
                    nativeEvent?.button,
                    POINTER_BUTTONS.LEFT
                ),

            pointerId:
                Number.isFinite(
                    Number(
                        nativeEvent?.pointerId
                    )
                )
                    ? Number(
                        nativeEvent.pointerId
                    )
                    : null,

            shiftKey:
                Boolean(
                    nativeEvent?.shiftKey
                ),

            ctrlKey:
                Boolean(
                    nativeEvent?.ctrlKey
                ),

            metaKey:
                Boolean(
                    nativeEvent?.metaKey
                ),

            altKey:
                Boolean(
                    nativeEvent?.altKey
                ),

            requestRender:
                () =>
                    stage?.batchDraw?.()
        };
    }

    function stopNativeEvent(nativeEvent) {
        if (!nativeEvent) {
            return;
        }

        if (
            nativeEvent.cancelable !==
            false
        ) {
            nativeEvent.preventDefault?.();
        }

        nativeEvent.stopPropagation?.();
        nativeEvent
            .stopImmediatePropagation?.();
    }

    function removeWindowListeners() {
        window.removeEventListener(
            "pointermove",
            handlePointerMove,
            true
        );

        window.removeEventListener(
            "pointerup",
            handlePointerUp,
            true
        );

        window.removeEventListener(
            "pointercancel",
            handlePointerCancel,
            true
        );

        window.removeEventListener(
            "keydown",
            handleKeyDown,
            true
        );

        window.removeEventListener(
            "blur",
            handleWindowBlur
        );
    }

    function clearMovementSession() {
        removeWindowListeners();

        if (
            container &&
            pointerId !== null
        ) {
            try {
                container
                    .releasePointerCapture
                    ?.(pointerId);
            } catch {
                // Pointer capture is optional.
            }
        }

        movementSession = null;
        pointerId = null;
    }

    function cancelMovement(
        reason = "cancelled"
    ) {
        if (!movementSession) {
            clearMovementSession();
            return false;
        }

        const context =
            createNativeContext(
                null,
                null,
                movementSession
                    .currentPoint
            );

        cancelLinkedMovement(
            context,
            movementSession,
            reason
        );

        clearMovementSession();

        return true;
    }

    function handlePointerMove(
        nativeEvent
    ) {
        if (
            !movementSession ||
            (
                pointerId !== null &&
                Number(
                    nativeEvent?.pointerId
                ) !== pointerId
            )
        ) {
            return;
        }

        stopNativeEvent(
            nativeEvent
        );

        const point =
            documentPointFromNativeEvent(
                nativeEvent
            );

        if (!point) {
            return;
        }

        movementSession =
            applyLinkedMovement(
                createNativeContext(
                    nativeEvent,
                    null,
                    point
                ),
                movementSession,
                point,
                options
            );
    }

    function handlePointerUp(
        nativeEvent
    ) {
        if (
            !movementSession ||
            (
                pointerId !== null &&
                Number(
                    nativeEvent?.pointerId
                ) !== pointerId
            )
        ) {
            return;
        }

        stopNativeEvent(
            nativeEvent
        );

        const point =
            documentPointFromNativeEvent(
                nativeEvent
            ) ||
            movementSession.currentPoint;

        finishLinkedMovement(
            createNativeContext(
                nativeEvent,
                null,
                point
            ),
            movementSession,
            point,
            options
        );

        suppressClickUntil =
            Date.now() + 350;

        clearMovementSession();
    }

    function handlePointerCancel(
        nativeEvent
    ) {
        if (
            !movementSession ||
            (
                pointerId !== null &&
                Number(
                    nativeEvent?.pointerId
                ) !== pointerId
            )
        ) {
            return;
        }

        stopNativeEvent(
            nativeEvent
        );

        cancelMovement(
            "pointer-cancelled"
        );
    }

    function handleKeyDown(
        nativeEvent
    ) {
        if (
            nativeEvent.key !==
                "Escape" ||
            !movementSession
        ) {
            return;
        }

        stopNativeEvent(
            nativeEvent
        );

        cancelMovement(
            "escape-key"
        );
    }

    function handleWindowBlur() {
        cancelMovement(
            "window-blur"
        );
    }

    function handleClickCapture(
        nativeEvent
    ) {
        if (
            Date.now() <=
            suppressClickUntil
        ) {
            stopNativeEvent(
                nativeEvent
            );
        }
    }

    function handlePointerDown(
        nativeEvent
    ) {
        const state =
            useFashionEditorStore
                .getState();

        if (
            state.activeTool !==
                EDITOR_TOOLS.SELECT ||
            options
                .linkedSymmetryMovement !==
                true ||
            nativeEvent.button !==
                POINTER_BUTTONS.LEFT ||
            nativeEvent.isPrimary ===
                false ||
            movementSession
        ) {
            return;
        }

        const point =
            documentPointFromNativeEvent(
                nativeEvent
            );

        const screenPoint =
            stage?.getPointerPosition?.();

        if (
            !point ||
            !screenPoint
        ) {
            return;
        }

        const targetNode =
            stage.getIntersection?.(
                screenPoint
            );

        const objectId =
            getObjectIdFromNode(
                targetNode,
                stage,
                state
            );

        if (!objectId) {
            return;
        }

        const clickedMetadata =
            getLinkedSymmetryMetadata(
                state.objects[objectId]
            );

        if (!clickedMetadata) {
            return;
        }

        const members =
            resolveLinkedGroupMembers(
                state,
                clickedMetadata.groupId,
                stage,
                createLayerMap(
                    state.layers
                )
            );

        if (
            members.length < 2
        ) {
            return;
        }

        stopNativeEvent(
            nativeEvent
        );

        suppressClickUntil =
            Date.now() + 350;

        try {
            activeContext
                ?.container
                ?.focus?.({
                    preventScroll: true
                });
        } catch {
            activeContext
                ?.container
                ?.focus?.();
        }

        const context =
            createNativeContext(
                nativeEvent,
                targetNode,
                point
            );

        const selectedIds =
            applyObjectClickSelection(
                context,
                objectId
            );

        const session =
            createLinkedMovementSession({
                context,
                objectId,
                startPoint: point,
                selectedIds,
                options
            });

        if (!session) {
            return;
        }

        movementSession = session;

        pointerId =
            Number.isFinite(
                Number(
                    nativeEvent.pointerId
                )
            )
                ? Number(
                    nativeEvent.pointerId
                )
                : null;

        if (
            container &&
            pointerId !== null
        ) {
            try {
                container
                    .setPointerCapture
                    ?.(pointerId);
            } catch {
                // Pointer capture is optional.
            }
        }

        window.addEventListener(
            "pointermove",
            handlePointerMove,
            true
        );

        window.addEventListener(
            "pointerup",
            handlePointerUp,
            true
        );

        window.addEventListener(
            "pointercancel",
            handlePointerCancel,
            true
        );

        window.addEventListener(
            "keydown",
            handleKeyDown,
            true
        );

        window.addEventListener(
            "blur",
            handleWindowBlur
        );
    }

    function detachCapture(
        reason = "deactivated"
    ) {
        cancelMovement(reason);

        if (container) {
            container.removeEventListener(
                "pointerdown",
                handlePointerDown,
                true
            );

            container.removeEventListener(
                "click",
                handleClickCapture,
                true
            );
        }

        activeContext = null;
        stage = null;
        container = null;
    }

    function attachCapture(context) {
        const nextStage =
            context?.stage || null;

        const nextContainer =
            nextStage?.container?.() ||
            null;

        if (
            stage === nextStage &&
            container === nextContainer
        ) {
            activeContext = context;
            return;
        }

        detachCapture(
            "stage-changed"
        );

        activeContext = context;
        stage = nextStage;
        container = nextContainer;

        if (!container) {
            return;
        }

        container.addEventListener(
            "pointerdown",
            handlePointerDown,
            true
        );

        container.addEventListener(
            "click",
            handleClickCapture,
            true
        );
    }

    /*=====================================================
    Tool Definition
    =====================================================*/

    return defineTool({
        id:
            SELECTION_TOOL_ID,

        label:
            "Select",

        description:
            "Select, move and transform objects with linked symmetry support.",

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

        onActivate:
            context => {
                attachCapture(
                    context
                );

                clearMarquee(
                    context
                );

                clearObjectMovementState(
                    context
                );
            },

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

                    const session = {
                        mode:
                            "object",

                        objectId,

                        startPoint:
                            clonePoint(
                                context.point
                            ),

                        currentPoint:
                            clonePoint(
                                context.point
                            ),

                        append:
                            hasAppendModifier(
                                context
                            ),

                        moved:
                            false
                    };

                    context
                        .replaceInteractionData(
                            session
                        );

                    return session;
                }

                if (
                    !isPointInsideDocument(
                        context.point,
                        state.document
                    )
                ) {
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

                const session = {
                    mode:
                        "marquee",

                    objectId:
                        null,

                    startPoint,

                    currentPoint:
                        clonePoint(
                            startPoint
                        ),

                    append:
                        hasAppendModifier(
                            context
                        ),

                    moved:
                        false
                };

                context
                    .replaceInteractionData(
                        session
                    );

                const rectangle =
                    createSelectionRectangle(
                        startPoint,
                        startPoint
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

                return session;
            },

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

                const nextSession = {
                    ...session,

                    currentPoint,

                    moved:
                        getRectangleDistance(
                            rectangle
                        ) >=
                        options
                            .minimumMarqueeDistance
                };

                context
                    .replaceInteractionData(
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

        onPointerCancel:
            context => {
                clearMarquee(
                    context
                );
            },

        onCancel:
            context => {
                cancelMovement(
                    context.cancelReason ||
                    "cancelled"
                );

                clearMarquee(
                    context
                );
            },

        onDeactivate:
            context => {
                detachCapture(
                    "deactivated"
                );

                clearMarquee(
                    context
                );
            },

        onKeyDown:
            context => {
                if (
                    context.nativeEvent
                        ?.key ===
                    "Escape"
                ) {
                    cancelMovement(
                        "escape-key"
                    );

                    clearMarquee(
                        context
                    );
                }
            },

        onDestroy:
            context => {
                detachCapture(
                    "destroyed"
                );

                clearMarquee(
                    context
                );
            }
    });
}

/*=========================================================
Default Export
=========================================================*/

export const SelectionTool =
    createSelectionTool();

export default SelectionTool;