/*
=========================================================
FashionVision Professional Editor
Pattern Object Renderer
Version 1.0
=========================================================

Renders PatternTool objects with React Konva.

Supported pattern properties:

- repeat / repeatMode / patternRepeat
- patternScale / patternScaleX / patternScaleY
- patternRotation
- patternOffsetX / patternOffsetY
- opacity / patternOpacity
- background
- cornerRadius
- imageSmoothingEnabled
- clipping to object bounds
- selection, dragging and multi-object movement
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
    Group,
    Line,
    Rect
} from "react-konva";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_WIDTH =
    360;

const DEFAULT_HEIGHT =
    360;

const DEFAULT_TILE_WIDTH =
    128;

const DEFAULT_TILE_HEIGHT =
    128;

const DEFAULT_REPEAT =
    "repeat";

const MINIMUM_DIMENSION =
    0.0001;

const MINIMUM_PATTERN_SCALE =
    0.02;

const MAXIMUM_PATTERN_SCALE =
    50;

const PATTERN_REPEAT_VALUES =
    Object.freeze([
        "repeat",
        "repeat-x",
        "repeat-y",
        "no-repeat"
    ]);

const PATTERN_RESOURCE_CACHE =
    new Map();

/*=========================================================
General Helpers
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

function resolveNonEmptyString(
    candidates,
    fallback = ""
) {
    return (
        candidates.find(
            candidate =>
                typeof candidate ===
                    "string" &&
                candidate.trim()
        )?.trim() ||
        fallback
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

/*=========================================================
Object Value Resolution
=========================================================*/

function resolvePatternSource(
    object
) {
    return resolveNonEmptyString(
        [
            object?.patternSource,
            object?.src,
            object?.dataUrl,
            object?.source,
            object?.imageSource,
            object?.asset?.dataUrl,
            object?.asset?.source,
            object?.style?.patternSource,
            object?.style?.src,
            object?.style?.source
        ],
        ""
    );
}

function resolveWidth(
    object
) {
    return positiveNumberOr(
        object?.width ??
        object?.geometry?.width ??
        object?.geometry
            ?.boundingBox?.width,
        DEFAULT_WIDTH
    );
}

function resolveHeight(
    object
) {
    return positiveNumberOr(
        object?.height ??
        object?.geometry?.height ??
        object?.geometry
            ?.boundingBox?.height,
        DEFAULT_HEIGHT
    );
}

function resolveObjectOpacity(
    object
) {
    return clamp(
        object?.opacity ??
        object?.patternOpacity ??
        object?.style?.opacity ??
        object?.style
            ?.patternOpacity ??
        1,
        0,
        1
    );
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

function resolveRepeatMode(
    object
) {
    const value =
        resolveNonEmptyString(
            [
                object?.repeat,
                object?.repeatMode,
                object?.patternRepeat,
                object?.style?.repeat,
                object?.style
                    ?.repeatMode,
                object?.style
                    ?.patternRepeat
            ],
            DEFAULT_REPEAT
        )
            .toLowerCase();

    return PATTERN_REPEAT_VALUES
        .includes(
            value
        )
        ? value
        : DEFAULT_REPEAT;
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
    return normalizeDegrees(
        object?.patternRotation ??
        object?.style
            ?.patternRotation ??
        0
    );
}

function resolvePatternOffsetX(
    object
) {
    return numberOr(
        object?.patternOffsetX ??
        object?.style
            ?.patternOffsetX ??
        0,
        0
    );
}

function resolvePatternOffsetY(
    object
) {
    return numberOr(
        object?.patternOffsetY ??
        object?.style
            ?.patternOffsetY ??
        0,
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
            ?.patternPositionX ??
        0,
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
            ?.patternPositionY ??
        0,
        0
    );
}

function resolveBackground(
    object
) {
    const value =
        object?.background ??
        object?.style
            ?.background ??
        "transparent";

    return (
        typeof value ===
            "string" &&
        value.trim()
    )
        ? value
        : "transparent";
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

function resolveClipToBounds(
    object
) {
    return (
        object?.clipToBounds ??
        object?.style
            ?.clipToBounds ??
        true
    ) !==
        false;
}

/*=========================================================
Cached Pattern Image Loading
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
                "Browser image loading is unavailable."
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
                    "The pattern source could not be loaded."
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
        PATTERN_RESOURCE_CACHE
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

    PATTERN_RESOURCE_CACHE
        .set(
            source,
            resource
        );

    return resource;
}

function createResourceSnapshot(
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

function resourceSnapshotsEqual(
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
                        createResourceSnapshot(
                            resource
                        );

                    setSnapshot(
                        currentSnapshot =>
                            resourceSnapshotsEqual(
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

export function clearPatternObjectCache(
    source =
        null
) {
    if (
        typeof source ===
            "string" &&
        source
    ) {
        PATTERN_RESOURCE_CACHE
            .delete(
                source
            );

        return;
    }

    PATTERN_RESOURCE_CACHE
        .clear();
}

/*=========================================================
Konva Helpers
=========================================================*/

function collectionToArray(
    collection
) {
    if (!collection) {
        return [];
    }

    if (
        Array.isArray(
            collection
        )
    ) {
        return collection;
    }

    if (
        typeof collection
            .toArray ===
        "function"
    ) {
        return collection
            .toArray();
    }

    const result =
        [];

    if (
        typeof collection.each ===
        "function"
    ) {
        collection.each(
            node => {
                result.push(
                    node
                );
            }
        );

        return result;
    }

    try {
        return [
            ...collection
        ];
    } catch {
        return result;
    }
}

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
        return (
            collectionToArray(
                stage.find(
                    ".fashion-editor-object"
                )
            ).find(
                node =>
                    node?.getAttr?.(
                        "editorObjectRoot"
                    ) ===
                        true &&
                    node?.getAttr?.(
                        "editorObjectId"
                    ) ===
                        objectId
            ) ||
            null
        );
    } catch {
        return null;
    }
}

/*=========================================================
Pattern Object
=========================================================*/

function PatternObject({
    object,
    layer =
        null,

    selected:
        selectedProp =
            undefined,

    listening =
        true,

    transient =
        false,

    onSelect =
        null,

    onChange =
        null,

    onRenderError =
        null
}) {
    const rootRef =
        useRef(
            null
        );

    const patternRectRef =
        useRef(
            null
        );

    const dragSessionRef =
        useRef(
            null
        );

    const reportedErrorSourceRef =
        useRef(
            null
        );

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

    const source =
        resolvePatternSource(
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

    const repeatMode =
        resolveRepeatMode(
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

    const background =
        resolveBackground(
            object
        );

    const cornerRadius =
        resolveCornerRadius(
            object,
            width,
            height
        );

    const imageSmoothingEnabled =
        resolveImageSmoothing(
            object
        );

    const clipToBounds =
        resolveClipToBounds(
            object
        );

    const patternResource =
        useCachedPatternImage(
            source
        );

    const naturalWidth =
        positiveNumberOr(
            patternResource
                .image
                ?.naturalWidth ||
            patternResource
                .image
                ?.width ||
            object?.naturalWidth ||
            object?.metadata
                ?.originalWidth,
            DEFAULT_TILE_WIDTH
        );

    const naturalHeight =
        positiveNumberOr(
            patternResource
                .image
                ?.naturalHeight ||
            patternResource
                .image
                ?.height ||
            object?.naturalHeight ||
            object?.metadata
                ?.originalHeight,
            DEFAULT_TILE_HEIGHT
        );

    const tileWidth =
        naturalWidth *
        patternScaleX;

    const tileHeight =
        naturalHeight *
        patternScaleY;

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

    const objectLocked =
        Boolean(
            object?.locked ||
            layer?.locked
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
            !objectLocked &&
            object?.selectable !==
                false
        );

    const canDrag =
        Boolean(
            canSelect &&
            activeTool ===
                EDITOR_TOOLS
                    .SELECT
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
                    "pattern",

                layerId:
                    object?.layerId ||
                    layer?.id,

                editorObject:
                    true,

                patternObject:
                    true,

                transient:
                    isTransient
            }),
            [
                object?.id,
                object?.type,
                object?.layerId,
                layer?.id,
                isTransient
            ]
        );

    /*
    Ask Konva to redraw after the browser image loads.
    */

    useEffect(
        () => {
            if (
                patternResource
                    .status ===
                    "loaded" ||
                patternResource
                    .status ===
                    "error"
            ) {
                rootRef.current
                    ?.getLayer?.()
                    ?.batchDraw?.();
            }
        },
        [
            patternResource
                .status,
            patternResource
                .image
        ]
    );

    /*
    Apply the requested smoothing preference to the
    underlying layer canvas before drawing. Konva stores the
    value as an object attribute as well, so it remains
    available to export and future render passes.
    */

    useEffect(
        () => {
            const layerNode =
                patternRectRef
                    .current
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
                "imageSmoothingEnabled"
                    in nativeContext
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

    /*
    Report each failed source once.
    */

    useEffect(
        () => {
            if (
                patternResource
                    .status !==
                    "error" ||
                !source ||
                reportedErrorSourceRef
                    .current ===
                    source
            ) {
                return;
            }

            reportedErrorSourceRef
                .current =
                source;

            onRenderError?.(
                patternResource
                    .error ||
                new Error(
                    "The pattern could not be rendered."
                ),
                {
                    object,
                    source
                }
            );
        },
        [
            patternResource
                .status,
            patternResource
                .error,
            source,
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
                        EDITOR_TOOLS
                            .SELECT ||
                    !canSelect ||
                    !object?.id
                ) {
                    return false;
                }

                if (event) {
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
                    state
                        .setActiveLayer
                        ?.(
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

                if (additive) {
                    nextState
                        .toggleObjectSelection
                        ?.(
                            object.id
                        );
                } else if (
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

                onSelect?.(
                    object,
                    event
                );

                return true;
            },
            [
                canSelect,
                object,
                onSelect
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
                    !selectedIds
                        .includes(
                            object.id
                        )
                ) {
                    selectedIds = [
                        object.id
                    ];

                    state
                        .selectObjects
                        ?.(
                            selectedIds
                        );
                }

                selectedIds =
                    selectedIds
                        .filter(
                            objectId => {
                                const candidate =
                                    state
                                        .objects[
                                        objectId
                                    ];

                                const candidateLayer =
                                    state
                                        .layers
                                        .find(
                                            item =>
                                                item.id ===
                                                candidate
                                                    ?.layerId
                                        );

                                return Boolean(
                                    candidate &&
                                    candidate
                                        .visible !==
                                        false &&
                                    !candidate
                                        .locked &&
                                    candidateLayer &&
                                    candidateLayer
                                        .visible !==
                                        false &&
                                    !candidateLayer
                                        .locked
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
                        ?.getStage?.();

                const initialPositions =
                    {};

                const nodeById =
                    {};

                selectedIds
                    .forEach(
                        objectId => {
                            const candidate =
                                state
                                    .objects[
                                    objectId
                                ];

                            initialPositions[
                                objectId
                            ] = {
                                x:
                                    numberOr(
                                        candidate
                                            ?.x,
                                        0
                                    ),

                                y:
                                    numberOr(
                                        candidate
                                            ?.y,
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

                            if (node) {
                                nodeById[
                                    objectId
                                ] =
                                    node;
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

                if (!session) {
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

                if (!session) {
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
                        state
                            .updateObjects(
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

                                    if (!initial) {
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

                    onChange?.(
                        {
                            deltaX,
                            deltaY,

                            objectIds:
                                session
                                    .selectedIds
                        },
                        object
                    );
                } catch (
                    error
                ) {
                    state
                        .cancelHistoryTransaction
                        ?.();

                    onRenderError?.(
                        error,
                        {
                            object,
                            operation:
                                "drag"
                        }
                    );

                    console.error(
                        "Pattern object drag failed:",
                        error
                    );
                } finally {
                    session.stage
                        ?.batchDraw
                        ?.();
                }
            },
            [
                object,
                onChange,
                onRenderError
            ]
        );

    if (
        !object ||
        !visible
    ) {
        return null;
    }

    const rootName = [
        "fashion-editor-object",
        "fashion-editor-pattern-object",

        selected
            ? "fashion-editor-selected-object"
            : "",

        isTransient
            ? "fashion-editor-transient-object"
            : ""
    ]
        .filter(
            Boolean
        )
        .join(
            " "
        );

    /*
    clipToBounds is normally true. A pattern fill inside a
    Rect is naturally clipped to that Rect. The attribute is
    still placed on the root for future custom renderers and
    transformer/property-panel integrations.
    */

    return (
        <Group
            ref={
                rootRef
            }
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
                "pattern"
            }
            layerId={
                object.layerId ||
                layer?.id
            }
            editorObject
            editorObjectRoot
            patternObject
            clipToBounds={
                clipToBounds
            }
            patternRepeat={
                repeatMode
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
            tileWidth={
                tileWidth
            }
            tileHeight={
                tileHeight
            }
            imageSmoothingEnabled={
                imageSmoothingEnabled
            }
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
            width={
                width
            }
            height={
                height
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
            {/*
            Stable hit area. It remains selectable while the
            pattern image is loading or unavailable.
            */}

            <Rect
                {...commonAttributes}
                name="fashion-editor-pattern-hit-area"
                x={
                    0
                }
                y={
                    0
                }
                width={
                    width
                }
                height={
                    height
                }
                cornerRadius={
                    cornerRadius
                }
                fill="rgba(0,0,0,0)"
                strokeEnabled={
                    false
                }
                listening={
                    canListen
                }
                perfectDrawEnabled={
                    false
                }
            />

            {background !==
                "transparent" && (
                <Rect
                    {...commonAttributes}
                    name="fashion-editor-pattern-background"
                    x={
                        0
                    }
                    y={
                        0
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fill={
                        background
                    }
                    listening={
                        false
                    }
                    perfectDrawEnabled={
                        false
                    }
                />
            )}

            {patternResource
                .status ===
                "loaded" &&
                patternResource
                    .image && (
                <Rect
                    ref={
                        patternRectRef
                    }
                    {...commonAttributes}
                    name="fashion-editor-pattern-geometry"
                    x={
                        0
                    }
                    y={
                        0
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fillPatternImage={
                        patternResource
                            .image
                    }
                    fillPatternRepeat={
                        repeatMode
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
                    clipToBounds={
                        clipToBounds
                    }
                    listening={
                        false
                    }
                    perfectDrawEnabled={
                        false
                    }
                    shadowForStrokeEnabled={
                        false
                    }
                />
            )}

            {patternResource
                .status ===
                "loading" && (
                <Rect
                    name="fashion-editor-pattern-loading"
                    x={
                        0
                    }
                    y={
                        0
                    }
                    width={
                        width
                    }
                    height={
                        height
                    }
                    cornerRadius={
                        cornerRadius
                    }
                    fill="rgba(148,163,184,0.08)"
                    stroke="rgba(100,116,139,0.35)"
                    strokeWidth={
                        1
                    }
                    dash={[
                        8,
                        6
                    ]}
                    listening={
                        false
                    }
                    perfectDrawEnabled={
                        false
                    }
                />
            )}

            {(
                patternResource
                    .status ===
                    "error" ||
                patternResource
                    .status ===
                    "empty"
            ) && (
                <>
                    <Rect
                        name="fashion-editor-pattern-error"
                        x={
                            0
                        }
                        y={
                            0
                        }
                        width={
                            width
                        }
                        height={
                            height
                        }
                        cornerRadius={
                            cornerRadius
                        }
                        fill="rgba(127,29,29,0.08)"
                        stroke="rgba(239,68,68,0.65)"
                        strokeWidth={
                            1
                        }
                        dash={[
                            8,
                            6
                        ]}
                        listening={
                            false
                        }
                        perfectDrawEnabled={
                            false
                        }
                    />

                    <Line
                        points={[
                            0,
                            0,
                            width,
                            height
                        ]}
                        stroke="rgba(239,68,68,0.65)"
                        strokeWidth={
                            1
                        }
                        listening={
                            false
                        }
                        perfectDrawEnabled={
                            false
                        }
                    />

                    <Line
                        points={[
                            width,
                            0,
                            0,
                            height
                        ]}
                        stroke="rgba(239,68,68,0.65)"
                        strokeWidth={
                            1
                        }
                        listening={
                            false
                        }
                        perfectDrawEnabled={
                            false
                        }
                    />
                </>
            )}
        </Group>
    );
}

/*=========================================================
Export
=========================================================*/

PatternObject.displayName =
    "PatternObject";

export default memo(
    PatternObject
);
