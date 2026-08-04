/*
=========================================================
FashionVision Professional Editor
Selection Transformer
Version 1.1 — Linked Symmetry Transforming
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

const SYMMETRY_VARIANTS =
    Object.freeze({
        SOURCE: "source",
        VERTICAL: "vertical",
        HORIZONTAL: "horizontal",
        BOTH: "both"
    });

const TRANSFORM_EPSILON =
    0.0001;

const MATRIX_EPSILON =
    0.0000001;

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
        numberOr(
            value,
            1
        );

    if (
        Math.abs(scale) <
        0.0001
    ) {
        return scale < 0
            ? -0.0001
            : 0.0001;
    }

    return roundNumber(
        scale
    );
}

function normalizeRotation(
    rotation
) {
    let value =
        numberOr(
            rotation,
            0
        ) %
        360;

    if (
        value >
        180
    ) {
        value -=
            360;
    }

    if (
        value <
        -180
    ) {
        value +=
            360;
    }

    return roundNumber(
        value
    );
}

function radiansToDegrees(
    radians
) {
    return (
        numberOr(
            radians,
            0
        ) *
        180 /
        Math.PI
    );
}

/*=========================================================
General Helpers
=========================================================*/

function isFunction(
    value
) {
    return (
        typeof value ===
        "function"
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

function uniqueIds(
    values
) {
    return [
        ...new Set(
            (
                Array.isArray(values)
                    ? values
                    : []
            ).filter(Boolean)
        )
    ];
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
        return children
            .toArray();
    }

    try {
        return Array.from(
            children ||
            []
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
        isFunction(
            stage.find
        )
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
        isFunction(
            root.id
        ) &&
        root.id() ===
            objectId
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

        if (
            found
        ) {
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
        object.visible !==
            false &&
        object.locked !==
            true &&
        layer.visible !==
            false &&
        layer.locked !==
            true
    );
}

/*=========================================================
Read and Apply Node Transform
=========================================================*/

export function readNodeTransform(
    node
) {
    if (
        !node
    ) {
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
            numberOr(
                firstValue
            ) -
            numberOr(
                secondValue
            )
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
2D Affine Matrix Helpers

Matrix format matches Canvas and Konva:

    [a, b, c, d, e, f]

    x' = a*x + c*y + e
    y' = b*x + d*y + f
=========================================================*/

function identityMatrix() {
    return [
        1,
        0,
        0,
        1,
        0,
        0
    ];
}

function normalizeMatrix(
    matrix
) {
    if (
        !Array.isArray(
            matrix
        ) ||
        matrix.length <
            6
    ) {
        return identityMatrix();
    }

    return [
        numberOr(
            matrix[0],
            1
        ),

        numberOr(
            matrix[1],
            0
        ),

        numberOr(
            matrix[2],
            0
        ),

        numberOr(
            matrix[3],
            1
        ),

        numberOr(
            matrix[4],
            0
        ),

        numberOr(
            matrix[5],
            0
        )
    ];
}

function multiplyMatrices(
    first,
    second
) {
    const [
        a1,
        b1,
        c1,
        d1,
        e1,
        f1
    ] =
        normalizeMatrix(
            first
        );

    const [
        a2,
        b2,
        c2,
        d2,
        e2,
        f2
    ] =
        normalizeMatrix(
            second
        );

    return [
        a1 * a2 +
            c1 * b2,

        b1 * a2 +
            d1 * b2,

        a1 * c2 +
            c1 * d2,

        b1 * c2 +
            d1 * d2,

        a1 * e2 +
            c1 * f2 +
            e1,

        b1 * e2 +
            d1 * f2 +
            f1
    ];
}

function invertMatrix(
    matrix
) {
    const [
        a,
        b,
        c,
        d,
        e,
        f
    ] =
        normalizeMatrix(
            matrix
        );

    const determinant =
        a * d -
        b * c;

    if (
        Math.abs(
            determinant
        ) <
        MATRIX_EPSILON
    ) {
        return null;
    }

    return [
        d /
            determinant,

        -b /
            determinant,

        -c /
            determinant,

        a /
            determinant,

        (
            c * f -
            d * e
        ) /
            determinant,

        (
            b * e -
            a * f
        ) /
            determinant
    ];
}

function getAbsoluteMatrix(
    node
) {
    const matrix =
        node
            ?.getAbsoluteTransform
            ?.()
            ?.getMatrix
            ?.();

    return normalizeMatrix(
        matrix
    );
}

function getParentAbsoluteMatrix(
    node
) {
    const parent =
        node
            ?.getParent
            ?.();

    if (
        !parent
    ) {
        return identityMatrix();
    }

    return getAbsoluteMatrix(
        parent
    );
}

function decomposeMatrix(
    matrix
) {
    const [
        a,
        b,
        c,
        d,
        e,
        f
    ] =
        normalizeMatrix(
            matrix
        );

    const determinant =
        a * d -
        b * c;

    const result = {
        x:
            e,

        y:
            f,

        rotation:
            0,

        scaleX:
            1,

        scaleY:
            1,

        skewX:
            0,

        skewY:
            0
    };

    if (
        Math.abs(a) >
            MATRIX_EPSILON ||
        Math.abs(b) >
            MATRIX_EPSILON
    ) {
        const radius =
            Math.sqrt(
                a * a +
                b * b
            );

        result.rotation =
            b > 0
                ? Math.acos(
                    clamp(
                        a /
                            radius,
                        -1,
                        1
                    )
                )
                : -Math.acos(
                    clamp(
                        a /
                            radius,
                        -1,
                        1
                    )
                );

        result.scaleX =
            radius;

        result.scaleY =
            determinant /
            radius;

        result.skewX =
            Math.atan(
                (
                    a * c +
                    b * d
                ) /
                (
                    radius *
                    radius
                )
            );
    } else if (
        Math.abs(c) >
            MATRIX_EPSILON ||
        Math.abs(d) >
            MATRIX_EPSILON
    ) {
        const radius =
            Math.sqrt(
                c * c +
                d * d
            );

        result.rotation =
            Math.PI /
                2 -
            (
                d > 0
                    ? Math.acos(
                        clamp(
                            -c /
                                radius,
                            -1,
                            1
                        )
                    )
                    : -Math.acos(
                        clamp(
                            c /
                                radius,
                            -1,
                            1
                        )
                    )
            );

        result.scaleX =
            determinant /
            radius;

        result.scaleY =
            radius;

        result.skewY =
            Math.atan(
                (
                    a * c +
                    b * d
                ) /
                (
                    radius *
                    radius
                )
            );
    }

    return {
        x:
            roundNumber(
                result.x,
                6
            ),

        y:
            roundNumber(
                result.y,
                6
            ),

        rotation:
            normalizeRotation(
                radiansToDegrees(
                    result.rotation
                )
            ),

        scaleX:
            normalizeScale(
                result.scaleX
            ),

        scaleY:
            normalizeScale(
                result.scaleY
            ),

        skewX:
            roundNumber(
                radiansToDegrees(
                    result.skewX
                ),
                6
            ),

        skewY:
            roundNumber(
                radiansToDegrees(
                    result.skewY
                ),
                6
            )
    };
}

function applyAbsoluteMatrixToNode(
    node,
    absoluteMatrix
) {
    if (
        !node ||
        !absoluteMatrix
    ) {
        return false;
    }

    const parentAbsoluteMatrix =
        getParentAbsoluteMatrix(
            node
        );

    const inverseParentMatrix =
        invertMatrix(
            parentAbsoluteMatrix
        );

    if (
        !inverseParentMatrix
    ) {
        return false;
    }

    const localMatrix =
        multiplyMatrices(
            inverseParentMatrix,
            absoluteMatrix
        );

    const decomposed =
        decomposeMatrix(
            localMatrix
        );

    const [
        a,
        b,
        c,
        d,
        e,
        f
    ] =
        normalizeMatrix(
            localMatrix
        );

    const offsetX =
        numberOr(
            node.offsetX?.(),
            0
        );

    const offsetY =
        numberOr(
            node.offsetY?.(),
            0
        );

    node.setAttrs({
        x:
            e +
            a * offsetX +
            c * offsetY,

        y:
            f +
            b * offsetX +
            d * offsetY,

        rotation:
            decomposed.rotation,

        scaleX:
            decomposed.scaleX,

        scaleY:
            decomposed.scaleY,

        skewX:
            decomposed.skewX,

        skewY:
            decomposed.skewY,

        offsetX,
        offsetY
    });

    return true;
}

/*=========================================================
Symmetry Metadata Helpers
=========================================================*/

function normalizeSymmetryVariant(
    variant
) {
    const requested =
        typeof variant ===
            "string"
            ? variant
                .trim()
                .toLowerCase()
            : "";

    switch (
        requested
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
        case SYMMETRY_VARIANTS.HORIZONTAL:
        case SYMMETRY_VARIANTS.BOTH:
            return requested;

        default:
            return SYMMETRY_VARIANTS.SOURCE;
    }
}

function getLinkedSymmetryMetadata(
    object
) {
    const symmetry =
        object
            ?.metadata
            ?.symmetry;

    if (
        !isPlainObject(
            symmetry
        ) ||
        symmetry.linked !==
            true ||
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

function createDocumentReflectionMatrix(
    variant,
    axisX,
    axisY
) {
    switch (
        normalizeSymmetryVariant(
            variant
        )
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
            return [
                -1,
                0,
                0,
                1,
                2 * axisX,
                0
            ];

        case SYMMETRY_VARIANTS.HORIZONTAL:
            return [
                1,
                0,
                0,
                -1,
                0,
                2 * axisY
            ];

        case SYMMETRY_VARIANTS.BOTH:
            return [
                -1,
                0,
                0,
                -1,
                2 * axisX,
                2 * axisY
            ];

        default:
            return identityMatrix();
    }
}

function convertDocumentMatrixToStage(
    documentMatrix,
    documentToStageMatrix
) {
    const inverseDocumentToStage =
        invertMatrix(
            documentToStageMatrix
        );

    if (
        !inverseDocumentToStage
    ) {
        return normalizeMatrix(
            documentMatrix
        );
    }

    return multiplyMatrices(
        documentToStageMatrix,

        multiplyMatrices(
            documentMatrix,
            inverseDocumentToStage
        )
    );
}

function getDocumentToStageMatrix(
    resolvedStage
) {
    const artworkGroup =
        resolvedStage
            ?.findOne
            ?.(
                ".fashion-editor-artwork-group"
            );

    if (
        artworkGroup
    ) {
        return getAbsoluteMatrix(
            artworkGroup
        );
    }

    return identityMatrix();
}

/*=========================================================
Linked Symmetry Session Helpers
=========================================================*/

function createNodeSnapshot(
    objectId,
    node
) {
    if (
        !objectId ||
        !node
    ) {
        return null;
    }

    return {
        objectId,
        node,

        transform:
            readNodeTransform(
                node
            ),

        absoluteMatrix:
            getAbsoluteMatrix(
                node
            )
    };
}

function resolveLinkedGroupMembers({
    groupId,
    objects,
    layerMap,
    resolvedStage,
    transformer
}) {
    const candidates =
        Object.values(
            objects ||
            {}
        )
            .filter(
                object => {
                    const metadata =
                        getLinkedSymmetryMetadata(
                            object
                        );

                    return Boolean(
                        metadata &&
                        metadata.groupId ===
                            groupId
                    );
                }
            );

    if (
        candidates.length <
            2 ||
        candidates.some(
            object =>
                !isObjectTransformable(
                    object,
                    layerMap.get(
                        object.layerId
                    )
                )
        )
    ) {
        return [];
    }

    const members =
        candidates
            .map(
                object => {
                    const node =
                        findKonvaNodeById(
                            resolvedStage,
                            object.id
                        );

                    if (
                        !node ||
                        node ===
                            transformer
                    ) {
                        return null;
                    }

                    const metadata =
                        getLinkedSymmetryMetadata(
                            object
                        );

                    return {
                        object,
                        node,
                        metadata
                    };
                }
            )
            .filter(Boolean);

    /*
    A linked set is synchronized only when every member is
    editable and mounted. This prevents partially changing
    a symmetry set.
    */

    return members.length ===
        candidates.length
        ? members
        : [];
}

function synchronizeLinkedGroups(
    session
) {
    if (
        !session ||
        !Array.isArray(
            session.linkedGroups
        )
    ) {
        return [];
    }

    const synchronizedIds =
        new Set();

    session.linkedGroups.forEach(
        group => {
            const driverSnapshot =
                session.snapshotMap.get(
                    group.driverObjectId
                );

            if (
                !driverSnapshot
            ) {
                return;
            }

            const currentDriverMatrix =
                getAbsoluteMatrix(
                    driverSnapshot.node
                );

            const inverseDriverStart =
                invertMatrix(
                    driverSnapshot
                        .absoluteMatrix
                );

            if (
                !inverseDriverStart
            ) {
                return;
            }

            const driverDelta =
                multiplyMatrices(
                    currentDriverMatrix,
                    inverseDriverStart
                );

            const driverReflection =
                group.reflectionMatrices[
                    group.driverVariant
                ] ||
                identityMatrix();

            /*
            Convert the driver's change into source symmetry
            space. Reflection matrices are involutions, so
            each reflection is also its own inverse.
            */

            const sourceDelta =
                multiplyMatrices(
                    driverReflection,

                    multiplyMatrices(
                        driverDelta,
                        driverReflection
                    )
                );

            group.memberObjectIds.forEach(
                memberObjectId => {
                    if (
                        memberObjectId ===
                        group.driverObjectId
                    ) {
                        synchronizedIds.add(
                            memberObjectId
                        );

                        return;
                    }

                    const memberSnapshot =
                        session.snapshotMap.get(
                            memberObjectId
                        );

                    if (
                        !memberSnapshot
                    ) {
                        return;
                    }

                    const memberVariant =
                        group.memberVariants[
                            memberObjectId
                        ] ||
                        SYMMETRY_VARIANTS.SOURCE;

                    const memberReflection =
                        group.reflectionMatrices[
                            memberVariant
                        ] ||
                        identityMatrix();

                    const memberDelta =
                        multiplyMatrices(
                            memberReflection,

                            multiplyMatrices(
                                sourceDelta,
                                memberReflection
                            )
                        );

                    const targetAbsoluteMatrix =
                        multiplyMatrices(
                            memberDelta,
                            memberSnapshot
                                .absoluteMatrix
                        );

                    if (
                        applyAbsoluteMatrixToNode(
                            memberSnapshot.node,
                            targetAbsoluteMatrix
                        )
                    ) {
                        synchronizedIds.add(
                            memberObjectId
                        );
                    }
                }
            );
        }
    );

    return [
        ...synchronizedIds
    ];
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

    linkedSymmetryEnabled = true,

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

    const updateObjects =
        useFashionEditorStore(
            state =>
                state.updateObjects
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
        10 /
        zoom;

    const anchorStrokeWidth =
        1.5 /
        zoom;

    const borderStrokeWidth =
        1.5 /
        zoom;

    const transformerPadding =
        5 /
        zoom;

    const rotateAnchorOffset =
        28 /
        zoom;

    const anchorCornerRadius =
        2.5 /
        zoom;

    const borderDash =
        useMemo(
            () => [
                5 /
                    zoom,

                4 /
                    zoom
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

            if (
                !transformer
            ) {
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
                if (
                    event
                ) {
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
                    nodes.length ===
                    0
                ) {
                    return;
                }

                const resolvedStage =
                    resolveStage({
                        stage,
                        stageRef,
                        transformer
                    });

                if (
                    !resolvedStage
                ) {
                    return;
                }

                const selectedIds =
                    uniqueIds(
                        nodes.map(
                            node =>
                                node.id?.()
                        )
                    );

                const snapshotMap =
                    new Map();

                selectedIds.forEach(
                    objectId => {
                        const node =
                            nodes.find(
                                candidate =>
                                    candidate.id?.() ===
                                    objectId
                            );

                        const snapshot =
                            createNodeSnapshot(
                                objectId,
                                node
                            );

                        if (
                            snapshot
                        ) {
                            snapshotMap.set(
                                objectId,
                                snapshot
                            );
                        }
                    }
                );

                const linkedGroups =
                    [];

                const processedGroupIds =
                    new Set();

                if (
                    linkedSymmetryEnabled
                ) {
                    selectedIds.forEach(
                        selectedObjectId => {
                            const selectedObject =
                                objects[
                                    selectedObjectId
                                ];

                            const selectedMetadata =
                                getLinkedSymmetryMetadata(
                                    selectedObject
                                );

                            if (
                                !selectedMetadata ||
                                processedGroupIds.has(
                                    selectedMetadata
                                        .groupId
                                )
                            ) {
                                return;
                            }

                            processedGroupIds.add(
                                selectedMetadata
                                    .groupId
                            );

                            const members =
                                resolveLinkedGroupMembers({
                                    groupId:
                                        selectedMetadata
                                            .groupId,

                                    objects,
                                    layerMap,
                                    resolvedStage,
                                    transformer
                                });

                            if (
                                members.length <
                                2
                            ) {
                                return;
                            }

                            members.forEach(
                                member => {
                                    if (
                                        snapshotMap.has(
                                            member.object.id
                                        )
                                    ) {
                                        return;
                                    }

                                    const snapshot =
                                        createNodeSnapshot(
                                            member.object.id,
                                            member.node
                                        );

                                    if (
                                        snapshot
                                    ) {
                                        snapshotMap.set(
                                            member.object.id,
                                            snapshot
                                        );
                                    }
                                }
                            );

                            const selectedMemberIds =
                                members
                                    .map(
                                        member =>
                                            member.object.id
                                    )
                                    .filter(
                                        objectId =>
                                            selectedIds.includes(
                                                objectId
                                            )
                                    );

                            if (
                                selectedMemberIds.length ===
                                0
                            ) {
                                return;
                            }

                            const selectedSource =
                                selectedMemberIds.find(
                                    objectId =>
                                        getLinkedSymmetryMetadata(
                                            objects[
                                                objectId
                                            ]
                                        )?.variant ===
                                        SYMMETRY_VARIANTS.SOURCE
                                );

                            const driverObjectId =
                                selectedSource ||
                                selectedMemberIds[0];

                            const driverMetadata =
                                getLinkedSymmetryMetadata(
                                    objects[
                                        driverObjectId
                                    ]
                                );

                            if (
                                !driverMetadata
                            ) {
                                return;
                            }

                            const axisX =
                                numberOr(
                                    driverMetadata.axisX,

                                    numberOr(
                                        document.width,
                                        1200
                                    ) /
                                    2
                                );

                            const axisY =
                                numberOr(
                                    driverMetadata.axisY,

                                    numberOr(
                                        document.height,
                                        1600
                                    ) /
                                    2
                                );

                            const documentToStageMatrix =
                                getDocumentToStageMatrix(
                                    resolvedStage
                                );

                            const reflectionMatrices = {
                                [SYMMETRY_VARIANTS.SOURCE]:
                                    identityMatrix(),

                                [SYMMETRY_VARIANTS.VERTICAL]:
                                    convertDocumentMatrixToStage(
                                        createDocumentReflectionMatrix(
                                            SYMMETRY_VARIANTS.VERTICAL,
                                            axisX,
                                            axisY
                                        ),
                                        documentToStageMatrix
                                    ),

                                [SYMMETRY_VARIANTS.HORIZONTAL]:
                                    convertDocumentMatrixToStage(
                                        createDocumentReflectionMatrix(
                                            SYMMETRY_VARIANTS.HORIZONTAL,
                                            axisX,
                                            axisY
                                        ),
                                        documentToStageMatrix
                                    ),

                                [SYMMETRY_VARIANTS.BOTH]:
                                    convertDocumentMatrixToStage(
                                        createDocumentReflectionMatrix(
                                            SYMMETRY_VARIANTS.BOTH,
                                            axisX,
                                            axisY
                                        ),
                                        documentToStageMatrix
                                    )
                            };

                            const memberVariants =
                                {};

                            members.forEach(
                                member => {
                                    memberVariants[
                                        member.object.id
                                    ] =
                                        member.metadata
                                            .variant;
                                }
                            );

                            linkedGroups.push({
                                groupId:
                                    selectedMetadata
                                        .groupId,

                                sourceObjectId:
                                    driverMetadata
                                        .sourceObjectId,

                                driverObjectId,

                                driverVariant:
                                    driverMetadata
                                        .variant,

                                memberObjectIds:
                                    members.map(
                                        member =>
                                            member.object.id
                                    ),

                                memberVariants,
                                reflectionMatrices,
                                axisX,
                                axisY
                            });
                        }
                    );
                }

                const snapshots = [
                    ...snapshotMap.values()
                ];

                if (
                    snapshots.length ===
                    0
                ) {
                    return;
                }

                const label =
                    linkedGroups.length >
                    0
                        ? "Transform linked symmetry"
                        : snapshots.length ===
                            1
                            ? "Transform object"
                            : "Transform objects";

                const historyStarted =
                    isFunction(
                        beginHistoryTransaction
                    );

                transformingRef.current =
                    true;

                transformSessionRef.current = {
                    snapshots,
                    snapshotMap,

                    selectedObjectIds:
                        selectedIds,

                    linkedGroups,
                    label,
                    historyStarted,

                    startedAt:
                        Date.now()
                };

                if (
                    historyStarted
                ) {
                    beginHistoryTransaction(
                        label
                    );
                }

                onTransformStart?.({
                    objectIds:
                        selectedIds,

                    affectedObjectIds:
                        snapshots.map(
                            snapshot =>
                                snapshot.objectId
                        ),

                    linkedGroupIds:
                        linkedGroups.map(
                            group =>
                                group.groupId
                        ),

                    nodes,
                    event
                });
            },
            [
                stage,
                stageRef,
                objects,
                layerMap,
                document.width,
                document.height,
                linkedSymmetryEnabled,
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

                const session =
                    transformSessionRef.current;

                const linkedObjectIds =
                    session
                        ? synchronizeLinkedGroups(
                            session
                        )
                        : [];

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

                    affectedObjectIds:
                        session
                            ?.snapshots
                            ?.map(
                                snapshot =>
                                    snapshot.objectId
                            ) ||
                        [],

                    linkedObjectIds,

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

                if (
                    !session
                ) {
                    transformingRef.current =
                        false;

                    return;
                }

                synchronizeLinkedGroups(
                    session
                );

                const completedTransforms =
                    session.snapshots
                        .map(
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
                                    return null;
                                }

                                return {
                                    objectId:
                                        snapshot.objectId,

                                    before:
                                        snapshot.transform,

                                    after:
                                        currentTransform
                                };
                            }
                        )
                        .filter(Boolean);

                const transformMap =
                    new Map(
                        completedTransforms.map(
                            item => [
                                item.objectId,
                                item.after
                            ]
                        )
                    );

                try {
                    if (
                        completedTransforms.length >
                        0
                    ) {
                        const changedIds =
                            completedTransforms.map(
                                item =>
                                    item.objectId
                            );

                        if (
                            isFunction(
                                updateObjects
                            )
                        ) {
                            updateObjects(
                                changedIds,

                                currentObject =>
                                    transformMap.get(
                                        currentObject.id
                                    ) ||
                                    {},

                                session.label
                            );
                        } else {
                            completedTransforms.forEach(
                                item => {
                                    updateObject(
                                        item.objectId,
                                        item.after,
                                        session.label
                                    );
                                }
                            );
                        }

                        if (
                            session.historyStarted
                        ) {
                            commitHistoryTransaction();
                        }
                    } else if (
                        session.historyStarted
                    ) {
                        cancelHistoryTransaction();
                    }
                } catch (
                    error
                ) {
                    session.snapshots.forEach(
                        snapshot => {
                            applyNodeTransform(
                                snapshot.node,
                                snapshot.transform
                            );
                        }
                    );

                    if (
                        session.historyStarted
                    ) {
                        cancelHistoryTransaction();
                    }

                    transformingRef.current =
                        false;

                    transformSessionRef.current =
                        null;

                    throw error;
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
                        completedTransforms.length >
                        0,

                    changedCount:
                        completedTransforms.length,

                    transforms:
                        completedTransforms,

                    linkedGroupIds:
                        session.linkedGroups.map(
                            group =>
                                group.groupId
                        ),

                    linkedObjectIds:
                        uniqueIds(
                            session.linkedGroups.flatMap(
                                group =>
                                    group.memberObjectIds
                            )
                        ),

                    event
                });
            },
            [
                updateObject,
                updateObjects,
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

                if (
                    !session
                ) {
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

                if (
                    session.historyStarted
                ) {
                    cancelHistoryTransaction();
                }

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
                        session.selectedObjectIds,

                    affectedObjectIds:
                        session.snapshots.map(
                            snapshot =>
                                snapshot.objectId
                        ),

                    linkedGroupIds:
                        session.linkedGroups.map(
                            group =>
                                group.groupId
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
    Cancel on Escape and Window Blur
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
                        left <
                            0 ||
                        top <
                            0 ||
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