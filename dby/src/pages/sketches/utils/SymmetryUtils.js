/*
=========================================================
FashionVision Professional 2D Editor
Symmetry Utilities
Version 1.0
=========================================================
*/

import {
    EDITOR_TOOLS,
    OBJECT_TYPES,
    SYMMETRY_MODES
} from "../useFashionEditorStore";

export const SYMMETRY_VARIANTS = Object.freeze({
    VERTICAL: "vertical",
    HORIZONTAL: "horizontal",
    BOTH: "both"
});

export const DEFAULT_SYMMETRY_EPSILON = 0.001;

const SUPPORTED_SYMMETRY_TOOLS = Object.freeze([
    EDITOR_TOOLS.PENCIL,
    EDITOR_TOOLS.BRUSH,
    EDITOR_TOOLS.LINE,
    EDITOR_TOOLS.SHAPE,
    EDITOR_TOOLS.ERASER
]);

/*=========================================================
General Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    return Number.isFinite(
        number
    )
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

function normalizeDegrees(
    value
) {
    const degrees =
        numberOr(
            value,
            0
        );

    return (
        (
            degrees %
            360
        ) +
        360
    ) %
    360;
}

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

function cloneSerializable(
    value
) {
    if (
        typeof globalThis.structuredClone ===
        "function"
    ) {
        try {
            return globalThis.structuredClone(
                value
            );
        } catch {
            // Fall back to JSON cloning.
        }
    }

    return JSON.parse(
        JSON.stringify(
            value
        )
    );
}

function createId(
    prefix = "symmetry"
) {
    if (
        typeof globalThis.crypto?.randomUUID ===
        "function"
    ) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
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

/*=========================================================
Point Helpers
=========================================================*/

export function isFinitePoint(
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

export function clonePoint(
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

function pointsEqual(
    first,
    second,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    return Boolean(
        isFinitePoint(
            first
        ) &&
        isFinitePoint(
            second
        ) &&
        Math.abs(
            Number(
                first.x
            ) -
            Number(
                second.x
            )
        ) <=
            epsilon &&
        Math.abs(
            Number(
                first.y
            ) -
            Number(
                second.y
            )
        ) <=
            epsilon
    );
}

function uniquePoints(
    points,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    const result =
        [];

    for (
        const point
        of points
    ) {
        if (
            !isFinitePoint(
                point
            )
        ) {
            continue;
        }

        const duplicate =
            result.some(
                existing =>
                    pointsEqual(
                        existing,
                        point,
                        epsilon
                    )
            );

        if (
            duplicate
        ) {
            continue;
        }

        result.push(
            clonePoint(
                point
            )
        );
    }

    return result;
}

/*=========================================================
Symmetry Configuration
=========================================================*/

export function normalizeSymmetryMode(
    mode
) {
    if (
        Object.values(
            SYMMETRY_MODES
        ).includes(
            mode
        )
    ) {
        return mode;
    }

    if (
        mode ===
        SYMMETRY_VARIANTS.BOTH
    ) {
        return SYMMETRY_MODES.FOUR_WAY;
    }

    return SYMMETRY_MODES.VERTICAL;
}

export function normalizeSymmetryAxes(
    symmetry = {},
    documentData = {}
) {
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

    return {
        axisX:
            clamp(
                symmetry.axisX ??
                width /
                2,
                0,
                width
            ),

        axisY:
            clamp(
                symmetry.axisY ??
                height /
                2,
                0,
                height
            )
    };
}

export function normalizeSymmetryConfig(
    symmetry = {},
    documentData = {}
) {
    const axes =
        normalizeSymmetryAxes(
            symmetry,
            documentData
        );

    return {
        ...symmetry,

        enabled:
            Boolean(
                symmetry.enabled
            ),

        mode:
            normalizeSymmetryMode(
                symmetry.mode
            ),

        axisX:
            axes.axisX,

        axisY:
            axes.axisY
    };
}

export function getSymmetryVariants(
    mode
) {
    switch (
        normalizeSymmetryMode(
            mode
        )
    ) {
        case SYMMETRY_MODES.HORIZONTAL:
            return [
                SYMMETRY_VARIANTS.HORIZONTAL
            ];

        case SYMMETRY_MODES.FOUR_WAY:
            return [
                SYMMETRY_VARIANTS.VERTICAL,
                SYMMETRY_VARIANTS.HORIZONTAL,
                SYMMETRY_VARIANTS.BOTH
            ];

        case SYMMETRY_MODES.VERTICAL:
        default:
            return [
                SYMMETRY_VARIANTS.VERTICAL
            ];
    }
}

export function shouldMirrorTool(
    tool,
    symmetry = {}
) {
    if (
        !symmetry.enabled ||
        !SUPPORTED_SYMMETRY_TOOLS.includes(
            tool
        )
    ) {
        return false;
    }

    switch (
        tool
    ) {
        case EDITOR_TOOLS.PENCIL:
            return (
                symmetry.mirrorPencil !==
                false
            );

        case EDITOR_TOOLS.BRUSH:
            return (
                symmetry.mirrorBrush !==
                false
            );

        case EDITOR_TOOLS.LINE:
            return (
                symmetry.mirrorLine !==
                false
            );

        case EDITOR_TOOLS.SHAPE:
            return (
                symmetry.mirrorShape !==
                false
            );

        case EDITOR_TOOLS.ERASER:
            return (
                symmetry.mirrorEraser ===
                true
            );

        default:
            return false;
    }
}

/*=========================================================
Point Mirroring
=========================================================*/

export function mirrorPointVertically(
    point,
    axisX
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
            numberOr(
                axisX,
                0
            ) *
            2 -
            Number(
                point.x
            ),

        y:
            Number(
                point.y
            )
    };
}

export function mirrorPointHorizontally(
    point,
    axisY
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
            numberOr(
                axisY,
                0
            ) *
            2 -
            Number(
                point.y
            )
    };
}

export function mirrorPointBoth(
    point,
    axisX,
    axisY
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
            numberOr(
                axisX,
                0
            ) *
            2 -
            Number(
                point.x
            ),

        y:
            numberOr(
                axisY,
                0
            ) *
            2 -
            Number(
                point.y
            )
    };
}

export function mirrorPoint(
    point,
    variant,
    axes = {}
) {
    switch (
        variant
    ) {
        case SYMMETRY_VARIANTS.HORIZONTAL:
            return mirrorPointHorizontally(
                point,
                axes.axisY
            );

        case SYMMETRY_VARIANTS.BOTH:
            return mirrorPointBoth(
                point,
                axes.axisX,
                axes.axisY
            );

        case SYMMETRY_VARIANTS.VERTICAL:
        default:
            return mirrorPointVertically(
                point,
                axes.axisX
            );
    }
}

export function getSymmetricalPoints(
    point,
    symmetry = {},
    options = {}
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return [];
    }

    const config =
        normalizeSymmetryConfig(
            symmetry,
            options.document
        );

    if (
        !config.enabled &&
        options.force !==
        true
    ) {
        return options.includeOriginal ===
            false
            ? []
            : [
                clonePoint(
                    point
                )
            ];
    }

    const result =
        options.includeOriginal ===
        false
            ? []
            : [
                clonePoint(
                    point
                )
            ];

    for (
        const variant
        of getSymmetryVariants(
            config.mode
        )
    ) {
        const mirrored =
            mirrorPoint(
                point,
                variant,
                config
            );

        if (
            mirrored
        ) {
            result.push(
                mirrored
            );
        }
    }

    return uniquePoints(
        result,
        options.epsilon
    );
}

/*=========================================================
Axis Checks and Snapping
=========================================================*/

export function isPointOnVerticalAxis(
    point,
    axisX,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    return Boolean(
        isFinitePoint(
            point
        ) &&
        Math.abs(
            Number(
                point.x
            ) -
            numberOr(
                axisX,
                0
            )
        ) <=
            epsilon
    );
}

export function isPointOnHorizontalAxis(
    point,
    axisY,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    return Boolean(
        isFinitePoint(
            point
        ) &&
        Math.abs(
            Number(
                point.y
            ) -
            numberOr(
                axisY,
                0
            )
        ) <=
            epsilon
    );
}

export function snapPointToSymmetryAxis(
    point,
    symmetry = {},
    threshold = 8
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return null;
    }

    const config =
        normalizeSymmetryConfig(
            symmetry
        );

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
        config.mode ===
            SYMMETRY_MODES.VERTICAL ||
        config.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        if (
            Math.abs(
                result.x -
                config.axisX
            ) <=
            distance
        ) {
            result.x =
                config.axisX;
        }
    }

    if (
        config.mode ===
            SYMMETRY_MODES.HORIZONTAL ||
        config.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        if (
            Math.abs(
                result.y -
                config.axisY
            ) <=
            distance
        ) {
            result.y =
                config.axisY;
        }
    }

    return result;
}

/*=========================================================
Point Array Helpers
=========================================================*/

export function normalizePointArray(
    points = []
) {
    if (
        !Array.isArray(
            points
        ) ||
        points.length ===
        0
    ) {
        return [];
    }

    if (
        isFinitePoint(
            points[0]
        )
    ) {
        return points
            .filter(
                isFinitePoint
            )
            .map(
                clonePoint
            );
    }

    const result =
        [];

    for (
        let index = 0;
        index + 1 <
            points.length;
        index += 2
    ) {
        const x =
            Number(
                points[
                    index
                ]
            );

        const y =
            Number(
                points[
                    index +
                    1
                ]
            );

        if (
            Number.isFinite(
                x
            ) &&
            Number.isFinite(
                y
            )
        ) {
            result.push({
                x,
                y
            });
        }
    }

    return result;
}

export function flattenPointArray(
    points = []
) {
    return normalizePointArray(
        points
    ).flatMap(
        point => [
            point.x,
            point.y
        ]
    );
}

export function mirrorPointObjectArray(
    points,
    variant,
    axes = {}
) {
    return normalizePointArray(
        points
    )
        .map(
            point =>
                mirrorPoint(
                    point,
                    variant,
                    axes
                )
        )
        .filter(
            Boolean
        );
}

export function mirrorFlatPointArray(
    points,
    variant,
    axes = {}
) {
    return flattenPointArray(
        mirrorPointObjectArray(
            points,
            variant,
            axes
        )
    );
}

export function mirrorAnyPointArray(
    points,
    variant,
    axes = {}
) {
    if (
        !Array.isArray(
            points
        )
    ) {
        return [];
    }

    if (
        points.length >
            0 &&
        isFinitePoint(
            points[0]
        )
    ) {
        return mirrorPointObjectArray(
            points,
            variant,
            axes
        );
    }

    return mirrorFlatPointArray(
        points,
        variant,
        axes
    );
}

export function arePointArraysEquivalent(
    firstPoints,
    secondPoints,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    const first =
        normalizePointArray(
            firstPoints
        );

    const second =
        normalizePointArray(
            secondPoints
        );

    return Boolean(
        first.length ===
            second.length &&
        first.every(
            (
                point,
                index
            ) =>
                pointsEqual(
                    point,
                    second[
                        index
                    ],
                    epsilon
                )
        )
    );
}

export function isPointArrayOnAxis(
    points,
    variant,
    axes = {},
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    const normalized =
        normalizePointArray(
            points
        );

    if (
        normalized.length ===
        0
    ) {
        return false;
    }

    switch (
        variant
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
            return normalized.every(
                point =>
                    isPointOnVerticalAxis(
                        point,
                        axes.axisX,
                        epsilon
                    )
            );

        case SYMMETRY_VARIANTS.HORIZONTAL:
            return normalized.every(
                point =>
                    isPointOnHorizontalAxis(
                        point,
                        axes.axisY,
                        epsilon
                    )
            );

        case SYMMETRY_VARIANTS.BOTH:
            return normalized.every(
                point =>
                    isPointOnVerticalAxis(
                        point,
                        axes.axisX,
                        epsilon
                    ) &&
                    isPointOnHorizontalAxis(
                        point,
                        axes.axisY,
                        epsilon
                    )
            );

        default:
            return false;
    }
}

/*=========================================================
Line Helpers
=========================================================*/

function getLineMetrics(
    startPoint,
    endPoint
) {
    const deltaX =
        endPoint.x -
        startPoint.x;

    const deltaY =
        endPoint.y -
        startPoint.y;

    const angleRadians =
        Math.atan2(
            deltaY,
            deltaX
        );

    const minX =
        Math.min(
            startPoint.x,
            endPoint.x
        );

    const minY =
        Math.min(
            startPoint.y,
            endPoint.y
        );

    const maxX =
        Math.max(
            startPoint.x,
            endPoint.x
        );

    const maxY =
        Math.max(
            startPoint.y,
            endPoint.y
        );

    return {
        length:
            Math.hypot(
                deltaX,
                deltaY
            ),

        angleRadians,

        angle:
            angleRadians *
            180 /
            Math.PI,

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

export function mirrorLinePoints(
    startPoint,
    endPoint,
    variant,
    axes = {}
) {
    const mirroredStart =
        mirrorPoint(
            startPoint,
            variant,
            axes
        );

    const mirroredEnd =
        mirrorPoint(
            endPoint,
            variant,
            axes
        );

    if (
        !mirroredStart ||
        !mirroredEnd
    ) {
        return null;
    }

    return {
        startPoint:
            mirroredStart,

        endPoint:
            mirroredEnd,

        metrics:
            getLineMetrics(
                mirroredStart,
                mirroredEnd
            )
    };
}

/*=========================================================
Bounds and Rotation
=========================================================*/

export function mirrorBounds(
    bounds,
    variant,
    axes = {}
) {
    if (
        !isPlainObject(
            bounds
        )
    ) {
        return null;
    }

    const x =
        numberOr(
            bounds.x ??
            bounds.left ??
            bounds.minX,
            0
        );

    const y =
        numberOr(
            bounds.y ??
            bounds.top ??
            bounds.minY,
            0
        );

    const width =
        Math.max(
            0,

            numberOr(
                bounds.width,

                numberOr(
                    bounds.right ??
                    bounds.maxX,
                    x
                ) -
                x
            )
        );

    const height =
        Math.max(
            0,

            numberOr(
                bounds.height,

                numberOr(
                    bounds.bottom ??
                    bounds.maxY,
                    y
                ) -
                y
            )
        );

    let mirroredX =
        x;

    let mirroredY =
        y;

    if (
        variant ===
            SYMMETRY_VARIANTS.VERTICAL ||
        variant ===
            SYMMETRY_VARIANTS.BOTH
    ) {
        mirroredX =
            numberOr(
                axes.axisX,
                0
            ) *
            2 -
            (
                x +
                width
            );
    }

    if (
        variant ===
            SYMMETRY_VARIANTS.HORIZONTAL ||
        variant ===
            SYMMETRY_VARIANTS.BOTH
    ) {
        mirroredY =
            numberOr(
                axes.axisY,
                0
            ) *
            2 -
            (
                y +
                height
            );
    }

    return {
        x:
            mirroredX,

        y:
            mirroredY,

        width,

        height,

        left:
            mirroredX,

        top:
            mirroredY,

        right:
            mirroredX +
            width,

        bottom:
            mirroredY +
            height,

        minX:
            mirroredX,

        minY:
            mirroredY,

        maxX:
            mirroredX +
            width,

        maxY:
            mirroredY +
            height,

        center: {
            x:
                mirroredX +
                width /
                2,

            y:
                mirroredY +
                height /
                2
        }
    };
}

export function mirrorRotation(
    rotation,
    variant
) {
    const angle =
        numberOr(
            rotation,
            0
        );

    switch (
        variant
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
        case SYMMETRY_VARIANTS.HORIZONTAL:
            return normalizeDegrees(
                -angle
            );

        case SYMMETRY_VARIANTS.BOTH:
            return normalizeDegrees(
                angle +
                180
            );

        default:
            return normalizeDegrees(
                angle
            );
    }
}

/*=========================================================
Symmetry Metadata
=========================================================*/

export function createSymmetryMetadata(
    sourceObject,
    variant,
    axes = {},
    options = {}
) {
    const previous =
        isPlainObject(
            sourceObject?.metadata
        )
            ? sourceObject.metadata
            : {};

    const previousSymmetry =
        isPlainObject(
            previous.symmetry
        )
            ? previous.symmetry
            : {};

    return {
        ...previous,

        symmetry: {
            ...previousSymmetry,

            generated:
                true,

            sourceObjectId:
                options.sourceObjectId ||
                previousSymmetry.sourceObjectId ||
                sourceObject?.id ||
                null,

            groupId:
                options.groupId ||
                previousSymmetry.groupId ||
                createId(
                    "symmetry-group"
                ),

            variant,

            mode:
                options.mode ||
                previousSymmetry.mode ||
                null,

            axisX:
                numberOr(
                    axes.axisX,
                    0
                ),

            axisY:
                numberOr(
                    axes.axisY,
                    0
                ),

            linked:
                options.linked ===
                true,

            generatedAt:
                nowIso()
        }
    };
}

export function attachSourceSymmetryMetadata(
    object,
    symmetry = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    const groupId =
        options.groupId ||
        createId(
            "symmetry-group"
        );

    return {
        ...cloneSerializable(
            object
        ),

        metadata: {
            ...(
                object.metadata ||
                {}
            ),

            symmetry: {
                ...(
                    object.metadata?.symmetry ||
                    {}
                ),

                generated:
                    false,

                sourceObjectId:
                    object.id ||
                    null,

                groupId,

                variant:
                    "source",

                mode:
                    normalizeSymmetryMode(
                        symmetry.mode
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
                    ),

                linked:
                    symmetry.linkedMirrors ===
                    true,

                generatedAt:
                    nowIso()
            }
        }
    };
}

/*=========================================================
Line Object Mirroring
=========================================================*/

export function mirrorLineObject(
    object,
    variant,
    axes = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    const points =
        normalizePointArray(
            object.points?.length
                ? object.points
                : object.flatPoints
        );

    const startPoint =
        clonePoint(
            object.startPoint
        ) ||
        clonePoint(
            object.geometry?.startPoint
        ) ||
        points[0];

    const endPoint =
        clonePoint(
            object.endPoint
        ) ||
        clonePoint(
            object.geometry?.endPoint
        ) ||
        points[
            points.length -
            1
        ];

    if (
        !startPoint ||
        !endPoint
    ) {
        return mirrorObjectTransform(
            object,
            variant,
            axes,
            options
        );
    }

    const line =
        mirrorLinePoints(
            startPoint,
            endPoint,
            variant,
            axes
        );

    if (
        !line
    ) {
        return null;
    }

    const timestamp =
        nowIso();

    const mirroredPoints = [
        line.startPoint,
        line.endPoint
    ];

    return {
        ...cloneSerializable(
            object
        ),

        id:
            options.id ||
            createId(
                "line"
            ),

        name:
            options.name ||
            `${object.name || "Line"} Mirror`,

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

        points:
            mirroredPoints,

        flatPoints:
            flattenPointArray(
                mirroredPoints
            ),

        previewPoints:
            flattenPointArray(
                mirroredPoints
            ),

        startPoint:
            line.startPoint,

        endPoint:
            line.endPoint,

        length:
            line.metrics.length,

        angle:
            line.metrics.angle,

        geometry: {
            ...(
                object.geometry ||
                {}
            ),

            startPoint:
                line.startPoint,

            endPoint:
                line.endPoint,

            length:
                line.metrics.length,

            angle:
                line.metrics.angle,

            angleRadians:
                line.metrics.angleRadians,

            center:
                line.metrics.center,

            boundingBox:
                line.metrics.boundingBox
        },

        metadata:
            createSymmetryMetadata(
                object,
                variant,
                axes,
                options
            ),

        createdAt:
            options.preserveCreatedAt ===
            true
                ? object.createdAt
                : timestamp,

        updatedAt:
            timestamp
    };
}

/*=========================================================
Generic Object Transform Mirroring
=========================================================*/

export function mirrorObjectTransform(
    object,
    variant,
    axes = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    const timestamp =
        nowIso();

    const sourceX =
        numberOr(
            object.x,
            0
        );

    const sourceY =
        numberOr(
            object.y,
            0
        );

    const sourceScaleX =
        numberOr(
            object.scaleX,
            1
        );

    const sourceScaleY =
        numberOr(
            object.scaleY,
            1
        );

    let x =
        sourceX;

    let y =
        sourceY;

    let scaleX =
        sourceScaleX;

    let scaleY =
        sourceScaleY;

    if (
        variant ===
            SYMMETRY_VARIANTS.VERTICAL ||
        variant ===
            SYMMETRY_VARIANTS.BOTH
    ) {
        x =
            numberOr(
                axes.axisX,
                0
            ) *
            2 -
            sourceX;

        scaleX =
            -sourceScaleX;
    }

    if (
        variant ===
            SYMMETRY_VARIANTS.HORIZONTAL ||
        variant ===
            SYMMETRY_VARIANTS.BOTH
    ) {
        y =
            numberOr(
                axes.axisY,
                0
            ) *
            2 -
            sourceY;

        scaleY =
            -sourceScaleY;
    }

    return {
        ...cloneSerializable(
            object
        ),

        id:
            options.id ||
            createId(
                object.type ||
                "object"
            ),

        name:
            options.name ||
            `${object.name || object.type || "Object"} Mirror`,

        x,

        y,

        rotation:
            variant ===
            SYMMETRY_VARIANTS.BOTH
                ? numberOr(
                    object.rotation,
                    0
                )
                : mirrorRotation(
                    object.rotation,
                    variant
                ),

        scaleX,

        scaleY,

        metadata:
            createSymmetryMetadata(
                object,
                variant,
                axes,
                options
            ),

        createdAt:
            options.preserveCreatedAt ===
            true
                ? object.createdAt
                : timestamp,

        updatedAt:
            timestamp
    };
}

/*=========================================================
Shape Object Mirroring
=========================================================*/

function canMaterializeShapeMirror(
    object,
    variant
) {
    const transformIsSimple =
        Boolean(
            object?.type ===
                OBJECT_TYPES.SHAPE &&
            Math.abs(
                numberOr(
                    object.rotation,
                    0
                )
            ) <=
                DEFAULT_SYMMETRY_EPSILON &&
            Math.abs(
                numberOr(
                    object.skewX,
                    0
                )
            ) <=
                DEFAULT_SYMMETRY_EPSILON &&
            Math.abs(
                numberOr(
                    object.skewY,
                    0
                )
            ) <=
                DEFAULT_SYMMETRY_EPSILON &&
            Math.abs(
                numberOr(
                    object.scaleX,
                    1
                ) -
                1
            ) <=
                DEFAULT_SYMMETRY_EPSILON &&
            Math.abs(
                numberOr(
                    object.scaleY,
                    1
                ) -
                1
            ) <=
                DEFAULT_SYMMETRY_EPSILON
        );

    if (
        !transformIsSimple
    ) {
        return false;
    }

    if (
        [
            "rectangle",
            "ellipse",
            "circle"
        ].includes(
            object.shapeType
        )
    ) {
        return true;
    }

    return Boolean(
        object.shapeType ===
            "triangle" &&
        variant ===
            SYMMETRY_VARIANTS.VERTICAL
    );
}

export function mirrorShapeObject(
    object,
    variant,
    axes = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    if (
        options.materialize !==
            false &&
        canMaterializeShapeMirror(
            object,
            variant
        )
    ) {
        const bounds =
            mirrorBounds(
                {
                    x:
                        object.x,

                    y:
                        object.y,

                    width:
                        object.width,

                    height:
                        object.height
                },

                variant,
                axes
            );

        if (
            bounds
        ) {
            const timestamp =
                nowIso();

            return {
                ...cloneSerializable(
                    object
                ),

                id:
                    options.id ||
                    createId(
                        "shape"
                    ),

                name:
                    options.name ||
                    `${object.name || "Shape"} Mirror`,

                x:
                    bounds.x,

                y:
                    bounds.y,

                width:
                    bounds.width,

                height:
                    bounds.height,

                rotation:
                    0,

                scaleX:
                    1,

                scaleY:
                    1,

                center: {
                    x:
                        bounds.width /
                        2,

                    y:
                        bounds.height /
                        2
                },

                geometry: {
                    ...(
                        object.geometry ||
                        {}
                    ),

                    x:
                        bounds.x,

                    y:
                        bounds.y,

                    width:
                        bounds.width,

                    height:
                        bounds.height,

                    left:
                        bounds.left,

                    top:
                        bounds.top,

                    right:
                        bounds.right,

                    bottom:
                        bounds.bottom,

                    center:
                        bounds.center,

                    boundingBox: {
                        x:
                            bounds.x,

                        y:
                            bounds.y,

                        width:
                            bounds.width,

                        height:
                            bounds.height,

                        minX:
                            bounds.minX,

                        minY:
                            bounds.minY,

                        maxX:
                            bounds.maxX,

                        maxY:
                            bounds.maxY
                    }
                },

                metadata:
                    createSymmetryMetadata(
                        object,
                        variant,
                        axes,
                        options
                    ),

                createdAt:
                    options.preserveCreatedAt ===
                    true
                        ? object.createdAt
                        : timestamp,

                updatedAt:
                    timestamp
            };
        }
    }

    return mirrorObjectTransform(
        object,
        variant,
        axes,
        options
    );
}

/*=========================================================
Brush Object Mirroring
=========================================================*/

export function mirrorBrushObject(
    object,
    variant,
    axes = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    const isLine =
        object.objectKind ===
            "line" ||
        object.shapeType ===
            "line" ||
        (
            object.renderMode ===
                "line" &&
            (
                object.startPoint ||
                object.endPoint
            )
        );

    if (
        isLine
    ) {
        return mirrorLineObject(
            object,
            variant,
            axes,
            options
        );
    }

    /*
    Brush strokes may contain SVG paths, pressure data,
    stamps and generated outlines. Root transform mirroring
    preserves all brush information without rebuilding it.
    */

    return mirrorObjectTransform(
        object,
        variant,
        axes,
        options
    );
}

/*=========================================================
Duplicate Prevention
=========================================================*/

function getPrimaryPointCollection(
    object
) {
    const fields = [
        "points",
        "rawPoints",
        "samplePoints",
        "processedPoints",
        "outlinePoints",
        "flatPoints",
        "flatOutlinePoints",
        "previewPoints"
    ];

    for (
        const field
        of fields
    ) {
        if (
            Array.isArray(
                object?.[
                    field
                ]
            ) &&
            object[
                field
            ].length >
                0
        ) {
            return object[
                field
            ];
        }
    }

    if (
        isFinitePoint(
            object?.startPoint
        ) &&
        isFinitePoint(
            object?.endPoint
        )
    ) {
        return [
            object.startPoint,
            object.endPoint
        ];
    }

    return [];
}

export function isObjectOnSymmetryAxis(
    object,
    variant,
    axes = {},
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    const points =
        getPrimaryPointCollection(
            object
        );

    if (
        points.length >
        0
    ) {
        return isPointArrayOnAxis(
            points,
            variant,
            axes,
            epsilon
        );
    }

    if (
        object?.type !==
        OBJECT_TYPES.SHAPE
    ) {
        return false;
    }

    const center = {
        x:
            numberOr(
                object.x,
                0
            ) +
            Math.max(
                0,

                numberOr(
                    object.width,
                    0
                )
            ) /
            2,

        y:
            numberOr(
                object.y,
                0
            ) +
            Math.max(
                0,

                numberOr(
                    object.height,
                    0
                )
            ) /
            2
    };

    const verticalSymmetricShapes = [
        "rectangle",
        "ellipse",
        "circle",
        "triangle"
    ];

    const horizontalSymmetricShapes = [
        "rectangle",
        "ellipse",
        "circle"
    ];

    switch (
        variant
    ) {
        case SYMMETRY_VARIANTS.VERTICAL:
            return Boolean(
                Math.abs(
                    center.x -
                    numberOr(
                        axes.axisX,
                        0
                    )
                ) <=
                    epsilon &&
                verticalSymmetricShapes.includes(
                    object.shapeType
                )
            );

        case SYMMETRY_VARIANTS.HORIZONTAL:
            return Boolean(
                Math.abs(
                    center.y -
                    numberOr(
                        axes.axisY,
                        0
                    )
                ) <=
                    epsilon &&
                horizontalSymmetricShapes.includes(
                    object.shapeType
                )
            );

        case SYMMETRY_VARIANTS.BOTH:
            return Boolean(
                Math.abs(
                    center.x -
                    numberOr(
                        axes.axisX,
                        0
                    )
                ) <=
                    epsilon &&
                Math.abs(
                    center.y -
                    numberOr(
                        axes.axisY,
                        0
                    )
                ) <=
                    epsilon &&
                horizontalSymmetricShapes.includes(
                    object.shapeType
                )
            );

        default:
            return false;
    }
}

export function isMirroredObjectDuplicate(
    sourceObject,
    mirroredObject,
    variant,
    axes = {},
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    if (
        !sourceObject ||
        !mirroredObject
    ) {
        return false;
    }

    /*
    Freehand strokes retain their local point arrays and are
    mirrored using their root transform. Comparing raw points
    would incorrectly reject every valid freehand mirror.
    */

    return isObjectOnSymmetryAxis(
        sourceObject,
        variant,
        axes,
        epsilon
    );
}

function areGeneratedCopiesEquivalent(
    first,
    second,
    epsilon =
        DEFAULT_SYMMETRY_EPSILON
) {
    if (
        !first ||
        !second
    ) {
        return false;
    }

    const firstIsLine =
        first.objectKind ===
            "line" ||
        first.shapeType ===
            "line";

    const secondIsLine =
        second.objectKind ===
            "line" ||
        second.shapeType ===
            "line";

    if (
        firstIsLine &&
        secondIsLine
    ) {
        return arePointArraysEquivalent(
            first.points ||
            first.flatPoints,

            second.points ||
            second.flatPoints,

            epsilon
        );
    }

    const fields = [
        "x",
        "y",
        "rotation",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY"
    ];

    return fields.every(
        field => {
            const fallback =
                field.startsWith(
                    "scale"
                )
                    ? 1
                    : 0;

            return (
                Math.abs(
                    numberOr(
                        first[
                            field
                        ],
                        fallback
                    ) -
                    numberOr(
                        second[
                            field
                        ],
                        fallback
                    )
                ) <=
                epsilon
            );
        }
    );
}

/*=========================================================
General Editor Object Mirroring
=========================================================*/

export function mirrorEditorObject(
    object,
    variant,
    axes = {},
    options = {}
) {
    if (
        !isPlainObject(
            object
        )
    ) {
        return null;
    }

    if (
        object.objectKind ===
            "line" ||
        object.shapeType ===
            "line"
    ) {
        return mirrorLineObject(
            object,
            variant,
            axes,
            options
        );
    }

    switch (
        object.type
    ) {
        case OBJECT_TYPES.SHAPE:
            return mirrorShapeObject(
                object,
                variant,
                axes,
                options
            );

        case OBJECT_TYPES.BRUSH:
            return mirrorBrushObject(
                object,
                variant,
                axes,
                options
            );

        default:
            return mirrorObjectTransform(
                object,
                variant,
                axes,
                options
            );
    }
}

/*=========================================================
Create Symmetry Copies
=========================================================*/

export function createSymmetryCopies(
    sourceObject,
    symmetry = {},
    options = {}
) {
    if (
        !isPlainObject(
            sourceObject
        )
    ) {
        return [];
    }

    const config =
        normalizeSymmetryConfig(
            symmetry,
            options.document
        );

    if (
        !config.enabled &&
        options.force !==
        true
    ) {
        return [];
    }

    const groupId =
        options.groupId ||
        createId(
            "symmetry-group"
        );

    const copies =
        [];

    for (
        const variant
        of getSymmetryVariants(
            config.mode
        )
    ) {
        const copy =
            mirrorEditorObject(
                sourceObject,
                variant,
                config,
                {
                    ...options,

                    groupId,

                    mode:
                        config.mode,

                    linked:
                        options.linked ??
                        config.linkedMirrors ===
                            true,

                    sourceObjectId:
                        sourceObject.id ||
                        options.sourceObjectId
                }
            );

        if (
            !copy
        ) {
            continue;
        }

        if (
            options.preventDuplicates !==
            false
        ) {
            const sameAsSource =
                isMirroredObjectDuplicate(
                    sourceObject,
                    copy,
                    variant,
                    config,
                    options.epsilon
                );

            if (
                sameAsSource
            ) {
                continue;
            }

            const sameAsExistingCopy =
                copies.some(
                    existing =>
                        areGeneratedCopiesEquivalent(
                            existing,
                            copy,
                            options.epsilon
                        )
                );

            if (
                sameAsExistingCopy
            ) {
                continue;
            }
        }

        copies.push(
            copy
        );
    }

    return copies;
}

export function createSymmetryObjectSet(
    sourceObject,
    symmetry = {},
    options = {}
) {
    if (
        !isPlainObject(
            sourceObject
        )
    ) {
        return [];
    }

    const config =
        normalizeSymmetryConfig(
            symmetry,
            options.document
        );

    if (
        !config.enabled &&
        options.force !==
        true
    ) {
        return [
            cloneSerializable(
                sourceObject
            )
        ];
    }

    const groupId =
        options.groupId ||
        createId(
            "symmetry-group"
        );

    const source =
        options.attachMetadata ===
        false
            ? cloneSerializable(
                sourceObject
            )
            : attachSourceSymmetryMetadata(
                sourceObject,
                config,
                {
                    groupId
                }
            );

    return [
        source,

        ...createSymmetryCopies(
            sourceObject,
            config,
            {
                ...options,
                groupId
            }
        )
    ];
}

/*=========================================================
Live Preview
=========================================================*/

export function createSymmetryPreviewObjects(
    previewObject,
    symmetry = {},
    options = {}
) {
    return createSymmetryCopies(
        previewObject,
        symmetry,
        {
            ...options,

            preserveCreatedAt:
                true,

            preventDuplicates:
                options.preventDuplicates !==
                false
        }
    ).map(
        (
            object,
            index
        ) => ({
            ...object,

            id:
                options.previewIdPrefix
                    ? `${options.previewIdPrefix}-${index}`
                    : `__symmetry-preview-${index}__`,

            name:
                `${previewObject.name || "Preview"} Symmetry Preview`,

            transient:
                true,

            locked:
                true,

            selectable:
                false,

            listening:
                false,

            metadata: {
                ...(
                    object.metadata ||
                    {}
                ),

                transient:
                    true,

                symmetryPreview:
                    true
            }
        })
    );
}

/*=========================================================
Symmetry Guide Lines
=========================================================*/

export function getSymmetryGuideLines(
    symmetry = {},
    documentData = {}
) {
    const config =
        normalizeSymmetryConfig(
            symmetry,
            documentData
        );

    if (
        !config.enabled ||
        config.showGuide ===
        false
    ) {
        return [];
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

    const common = {
        stroke:
            typeof config.guideColor ===
            "string"
                ? config.guideColor
                : "#8b5cf6",

        strokeWidth:
            Math.max(
                0.25,

                numberOr(
                    config.guideWidth,
                    1
                )
            ),

        opacity:
            clamp(
                config.guideOpacity ??
                0.85,
                0,
                1
            ),

        dash:
            Array.isArray(
                config.guideDash
            )
                ? [
                    ...config.guideDash
                ]
                : [
                    10,
                    8
                ],

        listening:
            false,

        perfectDrawEnabled:
            false
    };

    const guides =
        [];

    if (
        config.mode ===
            SYMMETRY_MODES.VERTICAL ||
        config.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        guides.push({
            ...common,

            id:
                "symmetry-guide-vertical",

            variant:
                SYMMETRY_VARIANTS.VERTICAL,

            points: [
                config.axisX,
                0,
                config.axisX,
                height
            ]
        });
    }

    if (
        config.mode ===
            SYMMETRY_MODES.HORIZONTAL ||
        config.mode ===
            SYMMETRY_MODES.FOUR_WAY
    ) {
        guides.push({
            ...common,

            id:
                "symmetry-guide-horizontal",

            variant:
                SYMMETRY_VARIANTS.HORIZONTAL,

            points: [
                0,
                config.axisY,
                width,
                config.axisY
            ]
        });
    }

    return guides;
}

/*=========================================================
Default Export
=========================================================*/

const SymmetryUtils =
    Object.freeze({
        SYMMETRY_VARIANTS,
        DEFAULT_SYMMETRY_EPSILON,

        normalizeSymmetryMode,
        normalizeSymmetryAxes,
        normalizeSymmetryConfig,
        getSymmetryVariants,
        shouldMirrorTool,

        isFinitePoint,
        clonePoint,

        mirrorPointVertically,
        mirrorPointHorizontally,
        mirrorPointBoth,
        mirrorPoint,
        getSymmetricalPoints,

        isPointOnVerticalAxis,
        isPointOnHorizontalAxis,
        snapPointToSymmetryAxis,

        normalizePointArray,
        flattenPointArray,
        mirrorPointObjectArray,
        mirrorFlatPointArray,
        mirrorAnyPointArray,
        arePointArraysEquivalent,
        isPointArrayOnAxis,

        mirrorLinePoints,
        mirrorLineObject,

        mirrorBounds,
        mirrorRotation,
        mirrorObjectTransform,
        mirrorShapeObject,
        mirrorBrushObject,

        createSymmetryMetadata,
        attachSourceSymmetryMetadata,

        isObjectOnSymmetryAxis,
        isMirroredObjectDuplicate,

        mirrorEditorObject,
        createSymmetryCopies,
        createSymmetryObjectSet,
        createSymmetryPreviewObjects,

        getSymmetryGuideLines
    });

export default SymmetryUtils;