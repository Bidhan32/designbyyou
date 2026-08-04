/*
=========================================================
FashionVision Professional Editor
Shape Object Renderer
Version 1.1
=========================================================
*/

import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    Circle,
    Ellipse,
    Group,
    Line,
    Rect
} from "react-konva";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

const SHAPE_TYPES = Object.freeze({
    RECTANGLE: "rectangle",
    ELLIPSE: "ellipse",
    CIRCLE: "circle",
    TRIANGLE: "triangle",
    POLYGON: "polygon"
});

const SUPPORTED_SHAPE_TYPES =
    Object.values(
        SHAPE_TYPES
    );

const DEFAULT_STROKE =
    "#111111";

const DEFAULT_FILL =
    "#ffffff";

const DEFAULT_STROKE_WIDTH =
    3;

const DEFAULT_POLYGON_SIDES =
    5;

const MINIMUM_DIMENSION =
    0.0001;

const MINIMUM_HIT_WIDTH =
    14;

const MINIMUM_PATTERN_SCALE =
    0.02;

const MAXIMUM_PATTERN_SCALE =
    50;

const DEFAULT_PATTERN_REPEAT =
    "repeat";

const PATTERN_REPEAT_VALUES =
    Object.freeze([
        "repeat",
        "repeat-x",
        "repeat-y",
        "no-repeat"
    ]);

const SHAPE_PATTERN_RESOURCE_CACHE =
    new Map();

/*=========================================================
Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const result =
        Number(value);

    return Number.isFinite(
        result
    )
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

function positiveNumberOr(
    value,
    fallback = 1
) {
    return Math.max(
        MINIMUM_DIMENSION,
        numberOr(
            value,
            fallback
        )
    );
}

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

function toFlatPoints(
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

function createTrianglePoints(
    width,
    height
) {
    return [
        width / 2,
        0,

        width,
        height,

        0,
        height
    ];
}

function createRegularPolygonPoints(
    width,
    height,
    sides
) {
    const count =
        Math.round(
            clamp(
                sides,
                3,
                32
            )
        );

    const centerX =
        width /
        2;

    const centerY =
        height /
        2;

    const radiusX =
        width /
        2;

    const radiusY =
        height /
        2;

    const points = [];

    for (
        let index = 0;
        index < count;
        index += 1
    ) {
        const angle =
            -Math.PI / 2 +
            (
                index /
                count
            ) *
            Math.PI *
            2;

        points.push(
            centerX +
                Math.cos(
                    angle
                ) *
                radiusX,

            centerY +
                Math.sin(
                    angle
                ) *
                radiusY
        );
    }

    return points;
}

/*=========================================================
Shape and Style Resolution
=========================================================*/

function resolveShapeType(
    object
) {
    const requested =
        object?.shapeType ||
        object?.shape?.type ||
        object?.metadata
            ?.shapeType;

    return SUPPORTED_SHAPE_TYPES.includes(
        requested
    )
        ? requested
        : SHAPE_TYPES.RECTANGLE;
}

function resolveWidth(
    object
) {
    return positiveNumberOr(
        object?.width ??
        object?.geometry
            ?.width ??
        object?.geometry
            ?.boundingBox
            ?.width,
        1
    );
}

function resolveHeight(
    object
) {
    return positiveNumberOr(
        object?.height ??
        object?.geometry
            ?.height ??
        object?.geometry
            ?.boundingBox
            ?.height,
        1
    );
}

function resolveString(
    candidates,
    fallback
) {
    return (
        candidates.find(
            value =>
                typeof value ===
                    "string" &&
                value.trim()
        )?.trim() ||
        fallback
    );
}

function resolveStroke(
    object
) {
    return resolveString(
        [
            object?.stroke,
            object?.style?.stroke,
            object?.color,
            object?.style?.color
        ],
        DEFAULT_STROKE
    );
}

function resolveStrokeWidth(
    object
) {
    return Math.max(
        0,
        numberOr(
            object?.strokeWidth ??
            object?.style
                ?.strokeWidth,
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
        1,
        0,
        1
    );
}

function resolveFillType(
    object
) {
    const fillType =
        object?.fillType ||
        object?.style
            ?.fillType;

    if (
        fillType ===
            "pattern" ||
        resolvePatternSource(
            object
        )
    ) {
        return "pattern";
    }

    return (
        fillType === "none" ||
        object?.fill ===
            "transparent" ||
        object?.style
            ?.fill ===
            "transparent"
    )
        ? "none"
        : "solid";
}

function resolveFill(
    object
) {
    if (
        resolveFillType(
            object
        ) === "none"
    ) {
        return "transparent";
    }

    return resolveString(
        [
            object?.fill,
            object?.style?.fill
        ],
        DEFAULT_FILL
    );
}

function resolveFillOpacity(
    object
) {
    const fillType =
        resolveFillType(
            object
        );

    if (
        fillType ===
        "none"
    ) {
        return 0;
    }

    return clamp(
        fillType ===
            "pattern"
            ? (
                object?.patternOpacity ??
                object?.style
                    ?.patternOpacity ??
                object?.fillOpacity ??
                object?.style
                    ?.fillOpacity ??
                1
            )
            : (
                object?.fillOpacity ??
                object?.style
                    ?.fillOpacity ??
                1
            ),
        0,
        1
    );
}

function resolvePatternSource(
    object
) {
    return resolveString(
        [
            object?.fillPatternSource,
            object?.patternSource,
            object?.style
                ?.fillPatternSource,
            object?.style
                ?.patternSource,
            object?.pattern?.source,
            object?.pattern
                ?.dataUrl
        ],
        ""
    );
}

function resolvePatternRepeat(
    object
) {
    const repeat =
        resolveString(
            [
                object?.patternRepeat,
                object?.repeat,
                object?.repeatMode,
                object?.style
                    ?.patternRepeat,
                object?.style
                    ?.repeat,
                object?.style
                    ?.repeatMode
            ],
            DEFAULT_PATTERN_REPEAT
        )
            .toLowerCase();

    return PATTERN_REPEAT_VALUES
        .includes(
            repeat
        )
        ? repeat
        : DEFAULT_PATTERN_REPEAT;
}

function resolvePatternScale(
    object
) {
    return clamp(
        object?.patternScale ??
        object?.style
            ?.patternScale ??
        1,
        MINIMUM_PATTERN_SCALE,
        MAXIMUM_PATTERN_SCALE
    );
}

function resolvePatternScaleX(
    object,
    fallbackScale
) {
    return clamp(
        object?.patternScaleX ??
        object?.style
            ?.patternScaleX ??
        fallbackScale,
        MINIMUM_PATTERN_SCALE,
        MAXIMUM_PATTERN_SCALE
    );
}

function resolvePatternScaleY(
    object,
    fallbackScale
) {
    return clamp(
        object?.patternScaleY ??
        object?.style
            ?.patternScaleY ??
        fallbackScale,
        MINIMUM_PATTERN_SCALE,
        MAXIMUM_PATTERN_SCALE
    );
}

function resolvePatternRotation(
    object
) {
    const rotation =
        numberOr(
            object?.patternRotation ??
            object?.style
                ?.patternRotation,
            0
        );

    return (
        (
            rotation %
            360
        ) +
        360
    ) %
    360;
}

function resolvePatternOffsetX(
    object
) {
    return numberOr(
        object?.patternOffsetX ??
        object?.style
            ?.patternOffsetX,
        0
    );
}

function resolvePatternOffsetY(
    object
) {
    return numberOr(
        object?.patternOffsetY ??
        object?.style
            ?.patternOffsetY,
        0
    );
}

function resolvePatternPositionX(
    object
) {
    return numberOr(
        object?.patternX ??
        object?.patternPositionX ??
        object?.style
            ?.patternX ??
        object?.style
            ?.patternPositionX,
        0
    );
}

function resolvePatternPositionY(
    object
) {
    return numberOr(
        object?.patternY ??
        object?.patternPositionY ??
        object?.style
            ?.patternY ??
        object?.style
            ?.patternPositionY,
        0
    );
}

function resolvePatternBackground(
    object
) {
    return resolveString(
        [
            object?.patternBackground,
            object?.style
                ?.patternBackground
        ],
        "transparent"
    );
}

function resolveImageSmoothing(
    object
) {
    return (
        object
            ?.imageSmoothingEnabled ??
        object?.style
            ?.imageSmoothingEnabled ??
        true
    ) !==
        false;
}

/*=========================================================
Pattern Image Cache
=========================================================*/

function notifyPatternResource(
    resource
) {
    resource.listeners
        .forEach(
            listener => {
                listener(
                    resource
                );
            }
        );
}

function createPatternResource(
    source
) {
    const resource = {
        source,

        status:
            source
                ? "loading"
                : "empty",

        image:
            null,

        error:
            null,

        listeners:
            new Set()
    };

    if (!source) {
        return resource;
    }

    if (
        typeof Image ===
        "undefined"
    ) {
        resource.status =
            "error";

        resource.error =
            new Error(
                "Pattern image loading is unavailable."
            );

        return resource;
    }

    const image =
        new Image();

    resource.image =
        image;

    if (
        !source.startsWith(
            "data:"
        ) &&
        !source.startsWith(
            "blob:"
        )
    ) {
        image.crossOrigin =
            "anonymous";
    }

    image.decoding =
        "async";

    image.onload =
        () => {
            resource.status =
                "loaded";

            resource.error =
                null;

            notifyPatternResource(
                resource
            );
        };

    image.onerror =
        () => {
            resource.status =
                "error";

            resource.error =
                new Error(
                    "The shape pattern could not be loaded."
                );

            notifyPatternResource(
                resource
            );
        };

    image.src =
        source;

    return resource;
}

function getPatternResource(
    source
) {
    if (!source) {
        return createPatternResource(
            ""
        );
    }

    const cachedResource =
        SHAPE_PATTERN_RESOURCE_CACHE
            .get(
                source
            );

    if (cachedResource) {
        return cachedResource;
    }

    const resource =
        createPatternResource(
            source
        );

    SHAPE_PATTERN_RESOURCE_CACHE
        .set(
            source,
            resource
        );

    return resource;
}

function createPatternSnapshot(
    resource
) {
    return {
        source:
            resource?.source ||
            "",

        status:
            resource?.status ||
            "empty",

        image:
            resource?.status ===
                "loaded"
                ? resource.image
                : null,

        error:
            resource?.error ||
            null
    };
}

function patternSnapshotsEqual(
    first,
    second
) {
    return (
        first.source ===
            second.source &&
        first.status ===
            second.status &&
        first.image ===
            second.image &&
        first.error ===
            second.error
    );
}

function useCachedPatternImage(
    source
) {
    const [
        snapshot,
        setSnapshot
    ] =
        useState(
            () => ({
                source:
                    source ||
                    "",

                status:
                    source
                        ? "loading"
                        : "empty",

                image:
                    null,

                error:
                    null
            })
        );

    useEffect(
        () => {
            const resource =
                getPatternResource(
                    source
                );

            let mounted =
                true;

            const synchronize =
                () => {
                    if (!mounted) {
                        return;
                    }

                    const nextSnapshot =
                        createPatternSnapshot(
                            resource
                        );

                    setSnapshot(
                        currentSnapshot =>
                            patternSnapshotsEqual(
                                currentSnapshot,
                                nextSnapshot
                            )
                                ? currentSnapshot
                                : nextSnapshot
                    );
                };

            synchronize();

            resource.listeners
                .add(
                    synchronize
                );

            return () => {
                mounted =
                    false;

                resource.listeners
                    .delete(
                        synchronize
                    );
            };
        },
        [
            source
        ]
    );

    return snapshot;
}

export function clearShapePatternCache(
    source =
        null
) {
    if (
        typeof source ===
            "string" &&
        source
    ) {
        SHAPE_PATTERN_RESOURCE_CACHE
            .delete(
                source
            );

        return;
    }

    SHAPE_PATTERN_RESOURCE_CACHE
        .clear();
}

function resolveObjectOpacity(
    object
) {
    return clamp(
        object?.opacity ??
        1,
        0,
        1
    );
}

function resolveCornerRadius(
    object,
    width,
    height
) {
    return clamp(
        object?.cornerRadius ??
        object?.style
            ?.cornerRadius ??
        0,
        0,
        Math.min(
            width,
            height
        ) /
        2
    );
}

function resolveDash(
    object
) {
    const dash =
        object?.dash ||
        object?.style?.dash;

    return Array.isArray(
        dash
    )
        ? dash
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
        : [];
}

function resolveLineCap(
    object
) {
    const value =
        object?.lineCap ||
        object?.style
            ?.lineCap;

    return [
        "butt",
        "round",
        "square"
    ].includes(
        value
    )
        ? value
        : "round";
}

function resolveLineJoin(
    object
) {
    const value =
        object?.lineJoin ||
        object?.style
            ?.lineJoin;

    return [
        "bevel",
        "round",
        "miter"
    ].includes(
        value
    )
        ? value
        : "round";
}

function resolveCompositeOperation(
    object,
    layer
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
        object?.blendMode ||
        layer?.blendMode;

    return (
        typeof value ===
            "string" &&
        value.trim()
    )
        ? value.trim()
        : "source-over";
}

function resolvePolygonPoints(
    object,
    shapeType,
    width,
    height
) {
    const stored =
        toFlatPoints(
            object
                ?.flatPoints ||
            object?.points ||
            object?.geometry
                ?.points ||
            []
        );

    if (
        stored.length >=
        6
    ) {
        return stored;
    }

    if (
        shapeType ===
        SHAPE_TYPES.TRIANGLE
    ) {
        return createTrianglePoints(
            width,
            height
        );
    }

    if (
        shapeType ===
        SHAPE_TYPES.POLYGON
    ) {
        return createRegularPolygonPoints(
            width,
            height,
            object?.sides ??
            DEFAULT_POLYGON_SIDES
        );
    }

    return [];
}

/*=========================================================
Konva Helpers
=========================================================*/

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

    try {
        const nodes =
            stage.find(
                node =>
                    node.getAttr(
                        "editorObjectRoot"
                    ) ===
                        true &&
                    node.getAttr(
                        "editorObjectId"
                    ) ===
                        objectId
            );

        return typeof nodes
            ?.toArray ===
            "function"
            ? nodes
                .toArray()[0] ||
                null
            : nodes?.[0] ||
                null;
    } catch {
        return null;
    }
}

/*=========================================================
Shape Primitive
=========================================================*/

function ShapePrimitive({
    shapeRef = null,

    shapeType,
    width,
    height,
    points,
    cornerRadius,

    fill,
    fillEnabled,
    fillPriority =
        "color",

    fillPatternImage =
        null,

    fillPatternRepeat =
        DEFAULT_PATTERN_REPEAT,

    fillPatternX =
        0,

    fillPatternY =
        0,

    fillPatternScaleX =
        1,

    fillPatternScaleY =
        1,

    fillPatternRotation =
        0,

    fillPatternOffsetX =
        0,

    fillPatternOffsetY =
        0,

    imageSmoothingEnabled =
        true,

    stroke,
    strokeEnabled,
    strokeWidth,

    opacity,

    dash,
    lineCap,
    lineJoin,

    listening,
    hitStrokeWidth,

    commonAttributes
}) {
    const shared = {
        ...commonAttributes,

        fill:
            fillEnabled
                ? fill
                : undefined,

        fillEnabled:
            Boolean(
                fillEnabled
            ),

        fillPriority:
            fillPatternImage
                ? fillPriority
                : "color",

        fillPatternImage:
            fillPatternImage ||
            undefined,

        fillPatternRepeat,

        fillPatternX,
        fillPatternY,

        fillPatternScaleX,
        fillPatternScaleY,

        fillPatternRotation,

        fillPatternOffsetX,
        fillPatternOffsetY,

        imageSmoothingEnabled,

        stroke:
            strokeEnabled
                ? stroke
                : undefined,

        strokeEnabled:
            Boolean(
                strokeEnabled
            ),

        strokeWidth:
            strokeEnabled
                ? strokeWidth
                : 0,

        opacity,

        dash:
            strokeEnabled
                ? dash
                : [],

        lineCap,

        lineJoin,

        listening,

        hitStrokeWidth,

        perfectDrawEnabled:
            false,

        shadowForStrokeEnabled:
            false
    };

    if (
        shapeType ===
        SHAPE_TYPES.ELLIPSE
    ) {
        return (
            <Ellipse
                ref={
                    shapeRef
                }
                {...shared}
                x={
                    width /
                    2
                }
                y={
                    height /
                    2
                }
                radiusX={
                    width /
                    2
                }
                radiusY={
                    height /
                    2
                }
            />
        );
    }

    if (
        shapeType ===
        SHAPE_TYPES.CIRCLE
    ) {
        return (
            <Circle
                ref={
                    shapeRef
                }
                {...shared}
                x={
                    width /
                    2
                }
                y={
                    height /
                    2
                }
                radius={
                    Math.min(
                        width,
                        height
                    ) /
                    2
                }
            />
        );
    }

    if (
        shapeType ===
            SHAPE_TYPES.TRIANGLE ||
        shapeType ===
            SHAPE_TYPES.POLYGON
    ) {
        return (
            <Line
                ref={
                    shapeRef
                }
                {...shared}
                points={
                    points
                }
                closed
            />
        );
    }

    return (
        <Rect
            ref={
                shapeRef
            }
            {...shared}
            x={0}
            y={0}
            width={
                width
            }
            height={
                height
            }
            cornerRadius={
                cornerRadius
            }
        />
    );
}

/*=========================================================
Shape Object
=========================================================*/

function ShapeObject({
    object,

    layer = null,

    selected:
        selectedProp =
            undefined,

    listening = true,

    transient = false,

    onRenderError = null
}) {
    const dragSessionRef =
        useRef(null);

    const patternFillRef =
        useRef(null);

    const reportedPatternErrorRef =
        useRef(null);

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
        );

    const selectedFromStore =
        useFashionEditorStore(
            state =>
                Boolean(
                    object?.id &&
                    state
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                )
        );

    const selected =
        selectedProp ===
            undefined
            ? selectedFromStore
            : Boolean(
                selectedProp
            );

    const shapeType =
        resolveShapeType(
            object
        );

    const width =
        resolveWidth(
            object
        );

    const height =
        resolveHeight(
            object
        );

    const stroke =
        resolveStroke(
            object
        );

    const strokeWidth =
        resolveStrokeWidth(
            object
        );

    const strokeOpacity =
        resolveStrokeOpacity(
            object
        );

    const fillType =
        resolveFillType(
            object
        );

    const fill =
        resolveFill(
            object
        );

    const fillOpacity =
        resolveFillOpacity(
            object
        );

    const patternSource =
        resolvePatternSource(
            object
        );

    const patternResource =
        useCachedPatternImage(
            patternSource
        );

    const patternRepeat =
        resolvePatternRepeat(
            object
        );

    const basePatternScale =
        resolvePatternScale(
            object
        );

    const patternScaleX =
        resolvePatternScaleX(
            object,
            basePatternScale
        );

    const patternScaleY =
        resolvePatternScaleY(
            object,
            basePatternScale
        );

    const patternRotation =
        resolvePatternRotation(
            object
        );

    const patternOffsetX =
        resolvePatternOffsetX(
            object
        );

    const patternOffsetY =
        resolvePatternOffsetY(
            object
        );

    const patternPositionX =
        resolvePatternPositionX(
            object
        );

    const patternPositionY =
        resolvePatternPositionY(
            object
        );

    const patternBackground =
        resolvePatternBackground(
            object
        );

    const imageSmoothingEnabled =
        resolveImageSmoothing(
            object
        );

    const isPatternFill =
        fillType ===
        "pattern";

    const patternLoaded =
        isPatternFill &&
        patternResource.status ===
            "loaded" &&
        Boolean(
            patternResource.image
        );

    const lineCap =
        resolveLineCap(
            object
        );

    const lineJoin =
        resolveLineJoin(
            object
        );

    const cornerRadius =
        resolveCornerRadius(
            object,
            width,
            height
        );

    const dash =
        useMemo(
            () =>
                resolveDash(
                    object
                ),
            [
                object
            ]
        );

    const polygonPoints =
        useMemo(
            () =>
                resolvePolygonPoints(
                    object,
                    shapeType,
                    width,
                    height
                ),
            [
                object,
                shapeType,
                width,
                height
            ]
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

    const canListen =
        Boolean(
            visible &&
            listening !==
                false &&
            !isTransient
        );

    const canSelect =
        Boolean(
            canListen &&
            object?.selectable !==
                false &&
            !object?.locked &&
            !layer?.locked
        );

    const canDrag =
        Boolean(
            canSelect &&
            activeTool ===
                EDITOR_TOOLS.SELECT
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
                    "shape",

                shapeType,

                layerId:
                    object?.layerId ||
                    layer?.id,

                editorObject:
                    true,

                fillType,

                patternMask:
                    isPatternFill,

                transient:
                    isTransient
            }),
            [
                object?.id,
                object?.type,
                object?.layerId,
                layer?.id,
                shapeType,
                fillType,
                isPatternFill,
                isTransient
            ]
        );

    useEffect(
        () => {
            if (
                patternResource.status ===
                    "loaded" ||
                patternResource.status ===
                    "error"
            ) {
                patternFillRef.current
                    ?.getLayer?.()
                    ?.batchDraw?.();
            }
        },
        [
            patternResource.status,
            patternResource.image
        ]
    );

    useEffect(
        () => {
            const layerNode =
                patternFillRef.current
                    ?.getLayer?.();

            const sceneContext =
                layerNode
                    ?.getCanvas?.()
                    ?.getContext?.();

            const nativeContext =
                sceneContext
                    ?._context ||
                sceneContext;

            if (
                nativeContext &&
                "imageSmoothingEnabled" in
                    nativeContext
            ) {
                nativeContext
                    .imageSmoothingEnabled =
                    imageSmoothingEnabled;
            }

            layerNode
                ?.batchDraw?.();
        },
        [
            imageSmoothingEnabled,
            patternResource.image
        ]
    );

    useEffect(
        () => {
            if (
                patternResource.status !==
                    "error" ||
                !patternSource ||
                reportedPatternErrorRef
                    .current ===
                    patternSource
            ) {
                return;
            }

            reportedPatternErrorRef.current =
                patternSource;

            onRenderError?.(
                patternResource.error ||
                new Error(
                    "The shape pattern could not be rendered."
                ),
                {
                    object,
                    source:
                        patternSource,
                    operation:
                        "pattern-render"
                }
            );
        },
        [
            patternResource.status,
            patternResource.error,
            patternSource,
            object,
            onRenderError
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
                        EDITOR_TOOLS.SELECT ||
                    !canSelect ||
                    !object?.id
                ) {
                    return false;
                }

                if (
                    event
                ) {
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

                if (
                    additive
                ) {
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
                        ?.([
                            object.id
                        ]);
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
            [
                selectObject
            ]
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
                                candidate.visible !==
                                    false &&
                                !candidate.locked &&
                                candidateLayer &&
                                candidateLayer.visible !==
                                    false &&
                                !candidateLayer.locked
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
                                    candidate?.x,
                                    0
                                ),

                            y:
                                numberOr(
                                    candidate?.y,
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

                        if (
                            node
                        ) {
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

                if (
                    !session
                ) {
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

                if (
                    !session
                ) {
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
                        Math.abs(
                            deltaX
                        ) <
                            0.0001 &&
                        Math.abs(
                            deltaY
                        ) <
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

                                return initial
                                    ? {
                                        x:
                                            initial.x +
                                            deltaX,

                                        y:
                                            initial.y +
                                            deltaY
                                    }
                                    : {};
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

                                    if (
                                        !initial
                                    ) {
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
                } catch (
                    error
                ) {
                    state
                        .cancelHistoryTransaction
                        ?.();

                    console.error(
                        "Shape object drag failed:",
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

    const hitStrokeWidth =
        Math.max(
            MINIMUM_HIT_WIDTH,
            strokeWidth
        );

    const rootName = [
        "fashion-editor-object",
        "fashion-editor-shape-object",

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
                "shape"
            }
            shapeType={
                shapeType
            }
            fillType={
                fillType
            }
            patternMask={
                isPatternFill
            }
            patternRepeat={
                patternRepeat
            }
            patternScaleX={
                patternScaleX
            }
            patternScaleY={
                patternScaleY
            }
            patternRotation={
                patternRotation
            }
            patternOffsetX={
                patternOffsetX
            }
            patternOffsetY={
                patternOffsetY
            }
            imageSmoothingEnabled={
                imageSmoothingEnabled
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
            globalCompositeOperation={
                resolveCompositeOperation(
                    object,
                    layer
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
            {/* Transparent hit surface */}

            <ShapePrimitive
                shapeType={
                    shapeType
                }
                width={
                    width
                }
                height={
                    height
                }
                points={
                    polygonPoints
                }
                cornerRadius={
                    cornerRadius
                }
                fill="rgba(0,0,0,0)"
                fillEnabled
                stroke="rgba(0,0,0,0)"
                strokeEnabled
                strokeWidth={
                    Math.max(
                        strokeWidth,
                        1
                    )
                }
                opacity={1}
                dash={[]}
                lineCap={
                    lineCap
                }
                lineJoin={
                    lineJoin
                }
                listening={
                    canListen
                }
                hitStrokeWidth={
                    hitStrokeWidth
                }
                commonAttributes={{
                    ...commonAttributes,

                    name:
                        "fashion-editor-shape-hit-surface"
                }}
            />

            {/* Solid fill */}

            {fillType !==
                "pattern" &&
                fillOpacity >
                    0 && (
                <ShapePrimitive
                    shapeType={
                        shapeType
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    points={
                        polygonPoints
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fill={
                        fill
                    }
                    fillEnabled
                    strokeEnabled={
                        false
                    }
                    strokeWidth={0}
                    opacity={
                        fillOpacity
                    }
                    dash={[]}
                    lineCap={
                        lineCap
                    }
                    lineJoin={
                        lineJoin
                    }
                    listening={
                        false
                    }
                    hitStrokeWidth={0}
                    commonAttributes={{
                        ...commonAttributes,

                        name:
                            "fashion-editor-shape-fill"
                    }}
                />
            )}

            {/* Pattern background or loading/error fallback */}

            {isPatternFill &&
                fillOpacity >
                    0 &&
                (
                    (
                        patternLoaded &&
                        patternBackground !==
                            "transparent"
                    ) ||
                    !patternLoaded
                ) && (
                <ShapePrimitive
                    shapeType={
                        shapeType
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    points={
                        polygonPoints
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fill={
                        patternLoaded
                            ? patternBackground
                            : fill
                    }
                    fillEnabled
                    strokeEnabled={
                        false
                    }
                    strokeWidth={0}
                    opacity={
                        fillOpacity
                    }
                    dash={[]}
                    lineCap={
                        lineCap
                    }
                    lineJoin={
                        lineJoin
                    }
                    listening={
                        false
                    }
                    hitStrokeWidth={0}
                    commonAttributes={{
                        ...commonAttributes,

                        name:
                            patternResource.status ===
                                "error"
                                ? "fashion-editor-shape-pattern-error-fallback"
                                : "fashion-editor-shape-pattern-background"
                    }}
                />
            )}

            {/* Pattern mask fill */}

            {patternLoaded &&
                fillOpacity >
                    0 && (
                <ShapePrimitive
                    shapeRef={
                        patternFillRef
                    }
                    shapeType={
                        shapeType
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    points={
                        polygonPoints
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fill="transparent"
                    fillEnabled
                    fillPriority="pattern"
                    fillPatternImage={
                        patternResource.image
                    }
                    fillPatternRepeat={
                        patternRepeat
                    }
                    fillPatternX={
                        patternPositionX
                    }
                    fillPatternY={
                        patternPositionY
                    }
                    fillPatternScaleX={
                        patternScaleX
                    }
                    fillPatternScaleY={
                        patternScaleY
                    }
                    fillPatternRotation={
                        patternRotation
                    }
                    fillPatternOffsetX={
                        patternOffsetX
                    }
                    fillPatternOffsetY={
                        patternOffsetY
                    }
                    imageSmoothingEnabled={
                        imageSmoothingEnabled
                    }
                    strokeEnabled={
                        false
                    }
                    strokeWidth={0}
                    opacity={
                        fillOpacity
                    }
                    dash={[]}
                    lineCap={
                        lineCap
                    }
                    lineJoin={
                        lineJoin
                    }
                    listening={
                        false
                    }
                    hitStrokeWidth={0}
                    commonAttributes={{
                        ...commonAttributes,

                        name:
                            "fashion-editor-shape-pattern-fill",

                        patternMask:
                            true,

                        patternSource
                    }}
                />
            )}

            {/* Stroke */}

            {strokeWidth >
                0 &&
                strokeOpacity >
                    0 && (
                <ShapePrimitive
                    shapeType={
                        shapeType
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    points={
                        polygonPoints
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fillEnabled={
                        false
                    }
                    stroke={
                        stroke
                    }
                    strokeEnabled
                    strokeWidth={
                        strokeWidth
                    }
                    opacity={
                        strokeOpacity
                    }
                    dash={
                        dash
                    }
                    lineCap={
                        lineCap
                    }
                    lineJoin={
                        lineJoin
                    }
                    listening={
                        false
                    }
                    hitStrokeWidth={0}
                    commonAttributes={{
                        ...commonAttributes,

                        name:
                            "fashion-editor-shape-stroke"
                    }}
                />
            )}
        </Group>
    );
}

ShapeObject.displayName =
    "ShapeObject";

export default memo(
    ShapeObject
);