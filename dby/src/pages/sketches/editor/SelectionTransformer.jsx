/*
=========================================================
FashionVision Professional Editor
Selection Transformer
Version 1.0
=========================================================
*/

import React, {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef
} from "react";

import {
    Transformer
} from "react-konva";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

export const SELECTION_TRANSFORMER_ID =
    "fashion-editor-selection-transformer";

export const DEFAULT_TRANSFORMER_ANCHORS =
    Object.freeze([
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right"
    ]);

const DEFAULT_ROTATION_SNAPS =
    Object.freeze([
        0,
        45,
        90,
        135,
        180,
        225,
        270,
        315
    ]);

const TRANSFORM_EPSILON =
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

function roundNumber(
    value,
    precision = 6
) {
    const multiplier =
        10 ** precision;

    return (
        Math.round(
            numberOr(value, 0) *
            multiplier
        ) /
        multiplier
    );
}

function normalizeScale(
    value
) {
    const scale =
        numberOr(value, 1);

    if (
        Math.abs(scale) <
        0.0001
    ) {
        return 0.0001;
    }

    return roundNumber(
        scale
    );
}

function normalizeRotation(
    rotation
) {
    let value =
        numberOr(rotation, 0) %
        360;

    if (value > 180) {
        value -= 360;
    }

    if (value < -180) {
        value += 360;
    }

    return roundNumber(
        value
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

/*=========================================================
Resolve Konva Stage
=========================================================*/

function resolveStage({
    stage,
    stageRef,
    transformer
}) {
    if (
        stage &&
        isFunction(stage.find)
    ) {
        return stage;
    }

    const referencedStage =
        stageRef?.current;

    if (
        referencedStage &&
        isFunction(
            referencedStage.find
        )
    ) {
        return referencedStage;
    }

    return (
        transformer
            ?.getStage
            ?.() ||
        null
    );
}

/*=========================================================
Find Konva Node
=========================================================*/

export function findKonvaNodeById(
    root,
    objectId
) {
    if (
        !root ||
        !objectId
    ) {
        return null;
    }

    if (
        isFunction(root.id) &&
        root.id() === objectId
    ) {
        return root;
    }

    const children =
        getNodeChildren(
            root
        );

    for (
        const child of children
    ) {
        const found =
            findKonvaNodeById(
                child,
                objectId
            );

        if (found) {
            return found;
        }
    }

    return null;
}

/*=========================================================
Object Selectability
=========================================================*/

function isObjectTransformable(
    object,
    layer
) {
    return Boolean(
        object &&
        layer &&
        object.visible !== false &&
        object.locked !== true &&
        layer.visible !== false &&
        layer.locked !== true
    );
}

/*=========================================================
Read Node Transform
=========================================================*/

export function readNodeTransform(
    node
) {
    if (!node) {
        return null;
    }

    return {
        x:
            roundNumber(
                node.x?.(),
                4
            ),

        y:
            roundNumber(
                node.y?.(),
                4
            ),

        rotation:
            normalizeRotation(
                node.rotation?.()
            ),

        scaleX:
            normalizeScale(
                node.scaleX?.()
            ),

        scaleY:
            normalizeScale(
                node.scaleY?.()
            ),

        skewX:
            roundNumber(
                node.skewX?.(),
                4
            ),

        skewY:
            roundNumber(
                node.skewY?.(),
                4
            ),

        offsetX:
            roundNumber(
                node.offsetX?.(),
                4
            ),

        offsetY:
            roundNumber(
                node.offsetY?.(),
                4
            )
    };
}

/*=========================================================
Apply Node Transform
=========================================================*/

function applyNodeTransform(
    node,
    transform
) {
    if (
        !node ||
        !transform
    ) {
        return;
    }

    node.position({
        x:
            numberOr(
                transform.x,
                0
            ),

        y:
            numberOr(
                transform.y,
                0
            )
    });

    node.rotation(
        numberOr(
            transform.rotation,
            0
        )
    );

    node.scale({
        x:
            numberOr(
                transform.scaleX,
                1
            ),

        y:
            numberOr(
                transform.scaleY,
                1
            )
    });

    node.skew({
        x:
            numberOr(
                transform.skewX,
                0
            ),

        y:
            numberOr(
                transform.skewY,
                0
            )
    });

    node.offset({
        x:
            numberOr(
                transform.offsetX,
                0
            ),

        y:
            numberOr(
                transform.offsetY,
                0
            )
    });
}

/*=========================================================
Compare Transforms
=========================================================*/

function numbersAreDifferent(
    firstValue,
    secondValue
) {
    return (
        Math.abs(
            numberOr(firstValue) -
            numberOr(secondValue)
        ) >
        TRANSFORM_EPSILON
    );
}

function transformsAreDifferent(
    firstTransform,
    secondTransform
) {
    if (
        !firstTransform ||
        !secondTransform
    ) {
        return true;
    }

    return (
        numbersAreDifferent(
            firstTransform.x,
            secondTransform.x
        ) ||
        numbersAreDifferent(
            firstTransform.y,
            secondTransform.y
        ) ||
        numbersAreDifferent(
            firstTransform.rotation,
            secondTransform.rotation
        ) ||
        numbersAreDifferent(
            firstTransform.scaleX,
            secondTransform.scaleX
        ) ||
        numbersAreDifferent(
            firstTransform.scaleY,
            secondTransform.scaleY
        ) ||
        numbersAreDifferent(
            firstTransform.skewX,
            secondTransform.skewX
        ) ||
        numbersAreDifferent(
            firstTransform.skewY,
            secondTransform.skewY
        ) ||
        numbersAreDifferent(
            firstTransform.offsetX,
            secondTransform.offsetX
        ) ||
        numbersAreDifferent(
            firstTransform.offsetY,
            secondTransform.offsetY
        )
    );
}

/*=========================================================
Selection Transformer Component
=========================================================*/

function SelectionTransformer({
    stage = null,
    stageRef = null,

    enabled = true,

    resizeEnabled = true,
    rotateEnabled = true,

    enabledAnchors =
        DEFAULT_TRANSFORMER_ANCHORS,

    keepRatio = false,
    centeredScaling = false,
    flipEnabled = false,

    minimumWidth = 8,
    minimumHeight = 8,

    constrainToDocument = false,

    borderColor = "#7c3aed",
    anchorFill = "#ffffff",
    anchorStroke = "#7c3aed",

    rotationSnaps =
        DEFAULT_ROTATION_SNAPS,

    rotationSnapTolerance = 6,

    onTransformStart = null,
    onTransform = null,
    onTransformEnd = null,
    onTransformCancel = null
}) {
    const transformerRef =
        useRef(null);

    const transformSessionRef =
        useRef(null);

    const transformingRef =
        useRef(false);

    /*=====================================================
    Store State
    =====================================================*/

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

    const objects =
        useFashionEditorStore(
            state =>
                state.objects
        );

    const layers =
        useFashionEditorStore(
            state =>
                state.layers
        );

    const document =
        useFashionEditorStore(
            state =>
                state.document
        );

    const viewportZoom =
        useFashionEditorStore(
            state =>
                state.viewport.zoom
        );

    /*=====================================================
    Store Actions
    =====================================================*/

    const updateObject =
        useFashionEditorStore(
            state =>
                state.updateObject
        );

    const beginHistoryTransaction =
        useFashionEditorStore(
            state =>
                state
                    .beginHistoryTransaction
        );

    const commitHistoryTransaction =
        useFashionEditorStore(
            state =>
                state
                    .commitHistoryTransaction
        );

    const cancelHistoryTransaction =
        useFashionEditorStore(
            state =>
                state
                    .cancelHistoryTransaction
        );

    /*=====================================================
    Derived Values
    =====================================================*/

    const layerMap =
        useMemo(
            () =>
                new Map(
                    layers.map(
                        layer => [
                            layer.id,
                            layer
                        ]
                    )
                ),
            [
                layers
            ]
        );

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                viewportZoom,
                1
            )
        );

    const transformerVisible =
        Boolean(
            enabled &&
            activeTool ===
                EDITOR_TOOLS.SELECT &&
            selectedObjectIds.length >
                0
        );

    const anchorSize =
        10 / zoom;

    const anchorStrokeWidth =
        1.5 / zoom;

    const borderStrokeWidth =
        1.5 / zoom;

    const transformerPadding =
        5 / zoom;

    const rotateAnchorOffset =
        28 / zoom;

    const anchorCornerRadius =
        2.5 / zoom;

    const borderDash =
        useMemo(
            () => [
                5 / zoom,
                4 / zoom
            ],
            [
                zoom
            ]
        );

    /*=====================================================
    Resolve Selected Nodes
    =====================================================*/

    const resolveSelectedNodes =
        useCallback(
            () => {
                const transformer =
                    transformerRef.current;

                const resolvedStage =
                    resolveStage({
                        stage,
                        stageRef,
                        transformer
                    });

                if (
                    !resolvedStage ||
                    !transformerVisible
                ) {
                    return [];
                }

                return selectedObjectIds
                    .map(
                        objectId => {
                            const object =
                                objects[
                                    objectId
                                ];

                            const layer =
                                layerMap.get(
                                    object?.layerId
                                );

                            if (
                                !isObjectTransformable(
                                    object,
                                    layer
                                )
                            ) {
                                return null;
                            }

                            const node =
                                findKonvaNodeById(
                                    resolvedStage,
                                    objectId
                                );

                            if (
                                !node ||
                                node ===
                                    transformer
                            ) {
                                return null;
                            }

                            return node;
                        }
                    )
                    .filter(Boolean);
            },
            [
                stage,
                stageRef,
                transformerVisible,
                selectedObjectIds,
                objects,
                layerMap
            ]
        );

    /*=====================================================
    Synchronize Transformer Nodes
    =====================================================*/

    useLayoutEffect(
        () => {
            const transformer =
                transformerRef.current;

            if (!transformer) {
                return;
            }

            const nodes =
                resolveSelectedNodes();

            transformer.nodes(
                nodes
            );

            transformer.forceUpdate?.();

            transformer
                .getLayer
                ?.()
                ?.batchDraw
                ?.();
        },
        [
            resolveSelectedNodes,
            zoom
        ]
    );

    /*=====================================================
    Stop Event Bubbling
    =====================================================*/

    const stopTransformerEvent =
        useCallback(
            event => {
                if (event) {
                    event.cancelBubble =
                        true;
                }

                event
                    ?.evt
                    ?.stopPropagation
                    ?.();
            },
            []
        );

    /*=====================================================
    Begin Transform Session
    =====================================================*/

    const handleTransformStart =
        useCallback(
            event => {
                stopTransformerEvent(
                    event
                );

                if (
                    transformingRef.current
                ) {
                    return;
                }

                const transformer =
                    transformerRef.current;

                const nodes =
                    transformer
                        ?.nodes
                        ?.() ||
                    [];

                if (
                    nodes.length === 0
                ) {
                    return;
                }

                const snapshots =
                    nodes
                        .map(
                            node => {
                                const objectId =
                                    node.id?.();

                                if (
                                    !objectId ||
                                    !objects[
                                        objectId
                                    ]
                                ) {
                                    return null;
                                }

                                return {
                                    objectId,

                                    node,

                                    transform:
                                        readNodeTransform(
                                            node
                                        )
                                };
                            }
                        )
                        .filter(Boolean);

                if (
                    snapshots.length ===
                    0
                ) {
                    return;
                }

                transformingRef.current =
                    true;

                transformSessionRef.current = {
                    snapshots,

                    startedAt:
                        Date.now()
                };

                beginHistoryTransaction(
                    snapshots.length === 1
                        ? "Transform object"
                        : "Transform objects"
                );

                onTransformStart?.({
                    objectIds:
                        snapshots.map(
                            snapshot =>
                                snapshot.objectId
                        ),

                    nodes:
                        snapshots.map(
                            snapshot =>
                                snapshot.node
                        ),

                    event
                });
            },
            [
                objects,
                beginHistoryTransaction,
                onTransformStart,
                stopTransformerEvent
            ]
        );

    /*=====================================================
    Transform Progress
    =====================================================*/

    const handleTransform =
        useCallback(
            event => {
                stopTransformerEvent(
                    event
                );

                const transformer =
                    transformerRef.current;

                transformer
                    ?.forceUpdate
                    ?.();

                transformer
                    ?.getLayer
                    ?.()
                    ?.batchDraw
                    ?.();

                const nodes =
                    transformer
                        ?.nodes
                        ?.() ||
                    [];

                onTransform?.({
                    objectIds:
                        nodes
                            .map(
                                node =>
                                    node.id?.()
                            )
                            .filter(Boolean),

                    transforms:
                        nodes.map(
                            node => ({
                                objectId:
                                    node.id?.(),

                                transform:
                                    readNodeTransform(
                                        node
                                    )
                            })
                        ),

                    event
                });
            },
            [
                onTransform,
                stopTransformerEvent
            ]
        );

    /*=====================================================
    Finish Transform
    =====================================================*/

    const handleTransformEnd =
        useCallback(
            event => {
                stopTransformerEvent(
                    event
                );

                const session =
                    transformSessionRef.current;

                if (!session) {
                    transformingRef.current =
                        false;

                    return;
                }

                let changedCount =
                    0;

                const completedTransforms =
                    [];

                session.snapshots.forEach(
                    snapshot => {
                        const currentTransform =
                            readNodeTransform(
                                snapshot.node
                            );

                        if (
                            !transformsAreDifferent(
                                snapshot.transform,
                                currentTransform
                            )
                        ) {
                            return;
                        }

                        changedCount +=
                            1;

                        completedTransforms.push({
                            objectId:
                                snapshot.objectId,

                            before:
                                snapshot.transform,

                            after:
                                currentTransform
                        });

                        updateObject(
                            snapshot.objectId,
                            currentTransform,
                            session.snapshots
                                .length === 1
                                ? "Transform object"
                                : "Transform objects"
                        );
                    }
                );

                if (
                    changedCount > 0
                ) {
                    commitHistoryTransaction();
                } else {
                    cancelHistoryTransaction();
                }

                transformingRef.current =
                    false;

                transformSessionRef.current =
                    null;

                const transformer =
                    transformerRef.current;

                transformer
                    ?.forceUpdate
                    ?.();

                transformer
                    ?.getLayer
                    ?.()
                    ?.batchDraw
                    ?.();

                onTransformEnd?.({
                    changed:
                        changedCount > 0,

                    changedCount,

                    transforms:
                        completedTransforms,

                    event
                });
            },
            [
                updateObject,
                commitHistoryTransaction,
                cancelHistoryTransaction,
                onTransformEnd,
                stopTransformerEvent
            ]
        );

    /*=====================================================
    Cancel Active Transform
    =====================================================*/

    const cancelActiveTransform =
        useCallback(
            (
                reason =
                    "cancelled"
            ) => {
                const session =
                    transformSessionRef.current;

                if (!session) {
                    return false;
                }

                const transformer =
                    transformerRef.current;

                transformer
                    ?.stopTransform
                    ?.();

                session.snapshots.forEach(
                    snapshot => {
                        applyNodeTransform(
                            snapshot.node,
                            snapshot.transform
                        );
                    }
                );

                cancelHistoryTransaction();

                transformingRef.current =
                    false;

                transformSessionRef.current =
                    null;

                transformer
                    ?.forceUpdate
                    ?.();

                transformer
                    ?.getLayer
                    ?.()
                    ?.batchDraw
                    ?.();

                onTransformCancel?.({
                    reason,

                    objectIds:
                        session.snapshots.map(
                            snapshot =>
                                snapshot.objectId
                        )
                });

                return true;
            },
            [
                cancelHistoryTransaction,
                onTransformCancel
            ]
        );

    /*=====================================================
    Cancel on Escape
    =====================================================*/

    useEffect(
        () => {
            const handleKeyDown =
                event => {
                    if (
                        event.key !==
                        "Escape" ||
                        !transformSessionRef
                            .current
                    ) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    cancelActiveTransform(
                        "escape-key"
                    );
                };

            const handleWindowBlur =
                () => {
                    if (
                        transformSessionRef
                            .current
                    ) {
                        cancelActiveTransform(
                            "window-blur"
                        );
                    }
                };

            window.addEventListener(
                "keydown",
                handleKeyDown,
                true
            );

            window.addEventListener(
                "blur",
                handleWindowBlur
            );

            return () => {
                window.removeEventListener(
                    "keydown",
                    handleKeyDown,
                    true
                );

                window.removeEventListener(
                    "blur",
                    handleWindowBlur
                );
            };
        },
        [
            cancelActiveTransform
        ]
    );

    /*=====================================================
    Cancel When Tool Changes
    =====================================================*/

    useEffect(
        () => {
            if (
                activeTool !==
                    EDITOR_TOOLS.SELECT &&
                transformSessionRef
                    .current
            ) {
                cancelActiveTransform(
                    "tool-changed"
                );
            }
        },
        [
            activeTool,
            cancelActiveTransform
        ]
    );

    /*=====================================================
    Cleanup
    =====================================================*/

    useEffect(
        () => {
            return () => {
                if (
                    transformSessionRef
                        .current
                ) {
                    cancelActiveTransform(
                        "component-unmounted"
                    );
                }
            };
        },
        [
            cancelActiveTransform
        ]
    );

    /*=====================================================
    Bounding Box Validation
    =====================================================*/

    const boundBoxFunction =
        useCallback(
            (
                oldBox,
                newBox
            ) => {
                const width =
                    Math.abs(
                        numberOr(
                            newBox?.width,
                            0
                        )
                    );

                const height =
                    Math.abs(
                        numberOr(
                            newBox?.height,
                            0
                        )
                    );

                if (
                    width <
                        Math.max(
                            1,
                            numberOr(
                                minimumWidth,
                                8
                            )
                        ) ||
                    height <
                        Math.max(
                            1,
                            numberOr(
                                minimumHeight,
                                8
                            )
                        )
                ) {
                    return oldBox;
                }

                if (
                    constrainToDocument
                ) {
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

                    const left =
                        numberOr(
                            newBox.x,
                            0
                        );

                    const top =
                        numberOr(
                            newBox.y,
                            0
                        );

                    const right =
                        left +
                        numberOr(
                            newBox.width,
                            0
                        );

                    const bottom =
                        top +
                        numberOr(
                            newBox.height,
                            0
                        );

                    if (
                        left < 0 ||
                        top < 0 ||
                        right >
                            documentWidth ||
                        bottom >
                            documentHeight
                    ) {
                        return oldBox;
                    }
                }

                return newBox;
            },
            [
                minimumWidth,
                minimumHeight,
                constrainToDocument,
                document.width,
                document.height
            ]
        );

    /*=====================================================
    Render
    =====================================================*/

    return (
        <Transformer
            ref={
                transformerRef
            }
            id={
                SELECTION_TRANSFORMER_ID
            }
            name={
                SELECTION_TRANSFORMER_ID
            }
            visible={
                transformerVisible
            }
            listening={
                transformerVisible
            }
            resizeEnabled={
                resizeEnabled
            }
            rotateEnabled={
                rotateEnabled
            }
            enabledAnchors={
                enabledAnchors
            }
            keepRatio={
                keepRatio
            }
            centeredScaling={
                centeredScaling
            }
            flipEnabled={
                flipEnabled
            }
            ignoreStroke={
                false
            }
            shouldOverdrawWholeArea={
                false
            }
            borderEnabled
            borderStroke={
                borderColor
            }
            borderStrokeWidth={
                borderStrokeWidth
            }
            borderDash={
                borderDash
            }
            anchorFill={
                anchorFill
            }
            anchorStroke={
                anchorStroke
            }
            anchorStrokeWidth={
                anchorStrokeWidth
            }
            anchorSize={
                anchorSize
            }
            anchorCornerRadius={
                anchorCornerRadius
            }
            padding={
                transformerPadding
            }
            rotateAnchorOffset={
                rotateAnchorOffset
            }
            rotationSnaps={
                rotationSnaps
            }
            rotationSnapTolerance={
                clamp(
                    rotationSnapTolerance,
                    0,
                    45
                )
            }
            boundBoxFunc={
                boundBoxFunction
            }
            onPointerDown={
                stopTransformerEvent
            }
            onMouseDown={
                stopTransformerEvent
            }
            onTouchStart={
                stopTransformerEvent
            }
            onTransformStart={
                handleTransformStart
            }
            onTransform={
                handleTransform
            }
            onTransformEnd={
                handleTransformEnd
            }
        />
    );
}

/*=========================================================
Memoized Export
=========================================================*/

const MemoizedSelectionTransformer =
    memo(
        SelectionTransformer
    );

MemoizedSelectionTransformer.displayName =
    "SelectionTransformer";

export default MemoizedSelectionTransformer;