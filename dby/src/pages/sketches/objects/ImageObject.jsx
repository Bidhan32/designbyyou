/*
=========================================================
FashionVision Professional Editor
Image Object Renderer
Version 1.0
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
    Image as KonvaImage,
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

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const MINIMUM_DIMENSION = 0.0001;
const IMAGE_RESOURCE_CACHE = new Map();

/*=========================================================
General Helpers
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

function positiveNumberOr(value, fallback = 1) {
    return Math.max(
        MINIMUM_DIMENSION,
        numberOr(value, fallback)
    );
}

function resolveNonEmptyString(
    candidates,
    fallback = ""
) {
    return (
        candidates.find(
            candidate =>
                typeof candidate === "string" &&
                candidate.trim()
        )?.trim() ||
        fallback
    );
}

/*=========================================================
Object Value Resolution
=========================================================*/

function resolveImageSource(object) {
    return resolveNonEmptyString(
        [
            object?.src,
            object?.dataUrl,
            object?.source,
            object?.imageSource,
            object?.asset?.dataUrl,
            object?.asset?.source,
            object?.style?.src,
            object?.style?.source
        ],
        ""
    );
}

function resolveWidth(object) {
    return positiveNumberOr(
        object?.width ??
        object?.geometry?.width ??
        object?.geometry?.boundingBox?.width,
        DEFAULT_WIDTH
    );
}

function resolveHeight(object) {
    return positiveNumberOr(
        object?.height ??
        object?.geometry?.height ??
        object?.geometry?.boundingBox?.height,
        DEFAULT_HEIGHT
    );
}

function resolveObjectOpacity(object) {
    return clamp(
        object?.opacity ??
        object?.style?.opacity ??
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
        object?.globalCompositeOperation ||
        object?.compositeOperation ||
        object?.style?.globalCompositeOperation ||
        object?.style?.compositeOperation ||
        object?.blendMode ||
        layer?.blendMode;

    return (
        typeof value === "string" &&
        value.trim()
    )
        ? value.trim()
        : "source-over";
}

function resolveCornerRadius(
    object,
    width,
    height
) {
    return clamp(
        object?.cornerRadius ??
        object?.style?.cornerRadius ??
        0,
        0,
        Math.min(width, height) / 2
    );
}

function resolveFitMode(object) {
    const requested =
        resolveNonEmptyString(
            [
                object?.fit,
                object?.imageFit,
                object?.objectFit,
                object?.style?.fit,
                object?.style?.imageFit,
                object?.style?.objectFit
            ],
            ""
        ).toLowerCase();

    if (
        requested === "contain" ||
        requested === "cover" ||
        requested === "fill"
    ) {
        return requested;
    }

    const preserveAspectRatio =
        object?.preserveAspectRatio ??
        object?.style?.preserveAspectRatio ??
        true;

    return preserveAspectRatio === false
        ? "fill"
        : "contain";
}

function resolveImageSmoothing(object) {
    return (
        object?.imageSmoothingEnabled ??
        object?.style?.imageSmoothingEnabled ??
        true
    ) !== false;
}

function resolveCrop(
    object,
    naturalWidth,
    naturalHeight
) {
    const crop =
        object?.crop ||
        object?.style?.crop ||
        null;

    if (!crop || typeof crop !== "object") {
        return null;
    }

    const sourceWidth =
        positiveNumberOr(
            naturalWidth,
            DEFAULT_WIDTH
        );

    const sourceHeight =
        positiveNumberOr(
            naturalHeight,
            DEFAULT_HEIGHT
        );

    const x = clamp(
        crop.x ?? crop.cropX ?? 0,
        0,
        sourceWidth
    );

    const y = clamp(
        crop.y ?? crop.cropY ?? 0,
        0,
        sourceHeight
    );

    const width = clamp(
        crop.width ??
        crop.cropWidth ??
        sourceWidth - x,
        MINIMUM_DIMENSION,
        Math.max(
            MINIMUM_DIMENSION,
            sourceWidth - x
        )
    );

    const height = clamp(
        crop.height ??
        crop.cropHeight ??
        sourceHeight - y,
        MINIMUM_DIMENSION,
        Math.max(
            MINIMUM_DIMENSION,
            sourceHeight - y
        )
    );

    return {
        x,
        y,
        width,
        height
    };
}

/*=========================================================
Cached Image Loading
=========================================================*/

function notifyResource(resource) {
    resource.listeners.forEach(
        listener => listener(resource)
    );
}

function createImageResource(source) {
    const resource = {
        source,
        status: source
            ? "loading"
            : "empty",
        image: null,
        error: null,
        listeners: new Set()
    };

    if (!source) {
        return resource;
    }

    if (typeof Image === "undefined") {
        resource.status = "error";
        resource.error = new Error(
            "Browser image loading is unavailable."
        );

        return resource;
    }

    const image = new Image();

    resource.image = image;

    if (
        !source.startsWith("data:") &&
        !source.startsWith("blob:")
    ) {
        image.crossOrigin = "anonymous";
    }

    image.decoding = "async";

    image.onload = () => {
        resource.status = "loaded";
        resource.error = null;
        notifyResource(resource);
    };

    image.onerror = () => {
        resource.status = "error";
        resource.error = new Error(
            "The image source could not be loaded."
        );

        notifyResource(resource);
    };

    image.src = source;

    return resource;
}

function getImageResource(source) {
    if (!source) {
        return createImageResource("");
    }

    const cached =
        IMAGE_RESOURCE_CACHE.get(source);

    if (cached) {
        return cached;
    }

    const resource =
        createImageResource(source);

    IMAGE_RESOURCE_CACHE.set(
        source,
        resource
    );

    return resource;
}

function createResourceSnapshot(resource) {
    return {
        source: resource?.source || "",
        status: resource?.status || "empty",
        image:
            resource?.status === "loaded"
                ? resource.image
                : null,
        error: resource?.error || null
    };
}

function resourceSnapshotsEqual(
    first,
    second
) {
    return (
        first.source === second.source &&
        first.status === second.status &&
        first.image === second.image &&
        first.error === second.error
    );
}

function useCachedImage(source) {
    const [
        snapshot,
        setSnapshot
    ] = useState(() => ({
        source: source || "",
        status: source
            ? "loading"
            : "empty",
        image: null,
        error: null
    }));

    useEffect(() => {
        const resource =
            getImageResource(source);

        let mounted = true;

        const synchronize = () => {
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

        resource.listeners.add(
            synchronize
        );

        return () => {
            mounted = false;

            resource.listeners.delete(
                synchronize
            );
        };
    }, [source]);

    return snapshot;
}

export function clearImageObjectCache(
    source = null
) {
    if (
        typeof source === "string" &&
        source
    ) {
        IMAGE_RESOURCE_CACHE.delete(
            source
        );

        return;
    }

    IMAGE_RESOURCE_CACHE.clear();
}

/*=========================================================
Image Layout
=========================================================*/

function calculateImageLayout({
    frameWidth,
    frameHeight,
    sourceWidth,
    sourceHeight,
    fitMode
}) {
    const safeFrameWidth =
        positiveNumberOr(
            frameWidth,
            DEFAULT_WIDTH
        );

    const safeFrameHeight =
        positiveNumberOr(
            frameHeight,
            DEFAULT_HEIGHT
        );

    const safeSourceWidth =
        positiveNumberOr(
            sourceWidth,
            safeFrameWidth
        );

    const safeSourceHeight =
        positiveNumberOr(
            sourceHeight,
            safeFrameHeight
        );

    if (fitMode === "fill") {
        return {
            x: 0,
            y: 0,
            width: safeFrameWidth,
            height: safeFrameHeight
        };
    }

    const widthScale =
        safeFrameWidth /
        safeSourceWidth;

    const heightScale =
        safeFrameHeight /
        safeSourceHeight;

    const scale =
        fitMode === "cover"
            ? Math.max(
                widthScale,
                heightScale
            )
            : Math.min(
                widthScale,
                heightScale
            );

    const width =
        safeSourceWidth * scale;

    const height =
        safeSourceHeight * scale;

    return {
        x:
            (
                safeFrameWidth -
                width
            ) / 2,

        y:
            (
                safeFrameHeight -
                height
            ) / 2,

        width,
        height
    };
}

/*=========================================================
Rounded Clip
=========================================================*/

function createRoundedClipFunction(
    width,
    height,
    cornerRadius
) {
    if (cornerRadius <= 0) {
        return null;
    }

    return context => {
        const radius =
            Math.min(
                cornerRadius,
                width / 2,
                height / 2
            );

        context.beginPath();
        context.moveTo(radius, 0);
        context.lineTo(
            width - radius,
            0
        );
        context.quadraticCurveTo(
            width,
            0,
            width,
            radius
        );
        context.lineTo(
            width,
            height - radius
        );
        context.quadraticCurveTo(
            width,
            height,
            width - radius,
            height
        );
        context.lineTo(
            radius,
            height
        );
        context.quadraticCurveTo(
            0,
            height,
            0,
            height - radius
        );
        context.lineTo(
            0,
            radius
        );
        context.quadraticCurveTo(
            0,
            0,
            radius,
            0
        );
        context.closePath();
    };
}

/*=========================================================
Konva Helpers
=========================================================*/

function collectionToArray(collection) {
    if (!collection) {
        return [];
    }

    if (Array.isArray(collection)) {
        return collection;
    }

    if (
        typeof collection.toArray ===
        "function"
    ) {
        return collection.toArray();
    }

    const result = [];

    if (
        typeof collection.each ===
        "function"
    ) {
        collection.each(
            node => result.push(node)
        );

        return result;
    }

    try {
        return [...collection];
    } catch {
        return result;
    }
}

function findObjectRootNode(
    stage,
    objectId
) {
    if (!stage || !objectId) {
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
                    ) === true &&
                    node?.getAttr?.(
                        "editorObjectId"
                    ) === objectId
            ) ||
            null
        );
    } catch {
        return null;
    }
}

/*=========================================================
Image Object
=========================================================*/

function ImageObject({
    object,
    layer = null,

    selected:
        selectedProp = undefined,

    listening = true,
    transient = false,

    onSelect = null,
    onChange = null,
    onRenderError = null
}) {
    const rootRef = useRef(null);
    const dragSessionRef = useRef(null);
    const reportedErrorSourceRef =
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
                    state.selectedObjectIds
                        .includes(
                            object.id
                        )
                )
        );

    const selected =
        selectedProp === undefined
            ? selectedFromStore
            : Boolean(selectedProp);

    const source =
        resolveImageSource(object);

    const width =
        resolveWidth(object);

    const height =
        resolveHeight(object);

    const cornerRadius =
        resolveCornerRadius(
            object,
            width,
            height
        );

    const fitMode =
        resolveFitMode(object);

    const imageSmoothingEnabled =
        resolveImageSmoothing(object);

    const imageResource =
        useCachedImage(source);

    const naturalWidth =
        positiveNumberOr(
            imageResource.image
                ?.naturalWidth ||
            imageResource.image
                ?.width ||
            object?.naturalWidth ||
            object?.metadata
                ?.originalWidth,
            width
        );

    const naturalHeight =
        positiveNumberOr(
            imageResource.image
                ?.naturalHeight ||
            imageResource.image
                ?.height ||
            object?.naturalHeight ||
            object?.metadata
                ?.originalHeight,
            height
        );

    const crop = useMemo(
        () =>
            resolveCrop(
                object,
                naturalWidth,
                naturalHeight
            ),
        [
            object,
            naturalWidth,
            naturalHeight
        ]
    );

    const sourceWidth =
        crop?.width ||
        naturalWidth;

    const sourceHeight =
        crop?.height ||
        naturalHeight;

    const imageLayout = useMemo(
        () =>
            calculateImageLayout({
                frameWidth: width,
                frameHeight: height,
                sourceWidth,
                sourceHeight,
                fitMode
            }),
        [
            width,
            height,
            sourceWidth,
            sourceHeight,
            fitMode
        ]
    );

    const clipFunction = useMemo(
        () =>
            createRoundedClipFunction(
                width,
                height,
                cornerRadius
            ),
        [
            width,
            height,
            cornerRadius
        ]
    );

    const isTransient = Boolean(
        transient ||
        object?.transient ||
        object?.metadata?.transient
    );

    const visible = Boolean(
        object &&
        object.visible !== false &&
        layer?.visible !== false
    );

    const objectLocked = Boolean(
        object?.locked ||
        layer?.locked
    );

    const canListen = Boolean(
        visible &&
        listening !== false &&
        !isTransient
    );

    const canSelect = Boolean(
        canListen &&
        !objectLocked &&
        object?.selectable !== false
    );

    const canDrag = Boolean(
        canSelect &&
        activeTool === EDITOR_TOOLS.SELECT
    );

    const commonAttributes = useMemo(
        () => ({
            objectId: object?.id,
            editorObjectId: object?.id,
            objectType:
                object?.type ||
                "image",
            layerId:
                object?.layerId ||
                layer?.id,
            editorObject: true,
            imageObject: true,
            transient: isTransient
        }),
        [
            object?.id,
            object?.type,
            object?.layerId,
            layer?.id,
            isTransient
        ]
    );

    useEffect(() => {
        if (
            imageResource.status ===
                "loaded" ||
            imageResource.status ===
                "error"
        ) {
            rootRef.current
                ?.getLayer?.()
                ?.batchDraw?.();
        }
    }, [
        imageResource.status,
        imageResource.image
    ]);

    useEffect(() => {
        if (
            imageResource.status !==
                "error" ||
            !source ||
            reportedErrorSourceRef
                .current === source
        ) {
            return;
        }

        reportedErrorSourceRef.current =
            source;

        onRenderError?.(
            imageResource.error ||
            new Error(
                "The image could not be rendered."
            ),
            {
                object,
                source
            }
        );
    }, [
        imageResource.status,
        imageResource.error,
        source,
        object,
        onRenderError
    ]);

    const selectObject = useCallback(
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

            if (event) {
                event.cancelBubble = true;
            }

            const nativeEvent =
                event?.evt ||
                event ||
                null;

            const additive = Boolean(
                nativeEvent?.shiftKey ||
                nativeEvent?.ctrlKey ||
                nativeEvent?.metaKey
            );

            if (
                object.layerId &&
                state.activeLayerId !==
                    object.layerId
            ) {
                state.setActiveLayer?.(
                    object.layerId,
                    {
                        clearSelection: false
                    }
                );
            }

            const nextState =
                useFashionEditorStore
                    .getState();

            if (additive) {
                nextState
                    .toggleObjectSelection
                    ?.(object.id);
            } else if (
                !nextState
                    .selectedObjectIds
                    .includes(object.id)
            ) {
                nextState
                    .selectObjects
                    ?.([object.id]);
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
                selectObject(event);
            },
            [selectObject]
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

                selectObject(event);

                const state =
                    useFashionEditorStore
                        .getState();

                let selectedIds =
                    state.selectedObjectIds;

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
                    selectedIds.length === 0
                ) {
                    return;
                }

                const draggedNode =
                    event?.currentTarget ||
                    event?.target;

                const stage =
                    draggedNode
                        ?.getStage?.();

                const initialPositions = {};
                const nodeById = {};

                selectedIds.forEach(
                    objectId => {
                        const candidate =
                            state.objects[
                                objectId
                            ];

                        initialPositions[
                            objectId
                        ] = {
                            x: numberOr(
                                candidate?.x,
                                0
                            ),
                            y: numberOr(
                                candidate?.y,
                                0
                            )
                        };

                        const node =
                            objectId === object.id
                                ? draggedNode
                                : findObjectRootNode(
                                    stage,
                                    objectId
                                );

                        if (node) {
                            nodeById[
                                objectId
                            ] = node;
                        }
                    }
                );

                state
                    .beginHistoryTransaction
                    ?.("Move objects");

                dragSessionRef.current = {
                    selectedIds,
                    draggedObjectId:
                        object.id,
                    startX: numberOr(
                        draggedNode?.x?.(),
                        initialPositions[
                            object.id
                        ]?.x || 0
                    ),
                    startY: numberOr(
                        draggedNode?.y?.(),
                        initialPositions[
                            object.id
                        ]?.y || 0
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
                    dragSessionRef.current;

                if (!session) {
                    return;
                }

                const draggedNode =
                    event?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                session.selectedIds.forEach(
                    objectId => {
                        if (
                            objectId ===
                            session.draggedObjectId
                        ) {
                            return;
                        }

                        const node =
                            session.nodeById[
                                objectId
                            ];

                        const initial =
                            session.initialPositions[
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
                    ?.batchDraw?.();
            },
            []
        );

    const handleDragEnd =
        useCallback(
            event => {
                const session =
                    dragSessionRef.current;

                if (!session) {
                    return;
                }

                dragSessionRef.current =
                    null;

                const draggedNode =
                    event?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                const state =
                    useFashionEditorStore
                        .getState();

                try {
                    if (
                        Math.abs(deltaX) <
                            0.0001 &&
                        Math.abs(deltaY) <
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
                            session.selectedIds,
                            currentObject => {
                                const initial =
                                    session
                                        .initialPositions[
                                        currentObject.id
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
                        session.selectedIds.forEach(
                            objectId => {
                                const initial =
                                    session
                                        .initialPositions[
                                        objectId
                                    ];

                                if (!initial) {
                                    return;
                                }

                                state.updateObject?.(
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
                } catch (error) {
                    state
                        .cancelHistoryTransaction
                        ?.();

                    onRenderError?.(
                        error,
                        {
                            object,
                            operation: "drag"
                        }
                    );

                    console.error(
                        "Image object drag failed:",
                        error
                    );
                } finally {
                    session.stage
                        ?.batchDraw?.();
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
        "fashion-editor-image-object",
        selected
            ? "fashion-editor-selected-object"
            : "",
        isTransient
            ? "fashion-editor-transient-object"
            : ""
    ]
        .filter(Boolean)
        .join(" ");

    const contentGroupProps =
        cornerRadius > 0
            ? {
                clipFunc:
                    clipFunction
            }
            : {
                clipX: 0,
                clipY: 0,
                clipWidth: width,
                clipHeight: height
            };

    return (
        <Group
            ref={rootRef}
            id={object.id}
            name={rootName}
            objectId={object.id}
            editorObjectId={
                object.id
            }
            objectType={
                object.type ||
                "image"
            }
            layerId={
                object.layerId ||
                layer?.id
            }
            editorObject
            editorObjectRoot
            imageObject
            preserveAspectRatio={
                fitMode !== "fill"
            }
            transient={
                isTransient
            }
            x={numberOr(
                object.x,
                0
            )}
            y={numberOr(
                object.y,
                0
            )}
            width={width}
            height={height}
            rotation={numberOr(
                object.rotation,
                0
            )}
            scaleX={numberOr(
                object.scaleX,
                1
            )}
            scaleY={numberOr(
                object.scaleY,
                1
            )}
            skewX={numberOr(
                object.skewX,
                0
            )}
            skewY={numberOr(
                object.skewY,
                0
            )}
            offsetX={numberOr(
                object.offsetX,
                0
            )}
            offsetY={numberOr(
                object.offsetY,
                0
            )}
            visible={visible}
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
            listening={canListen}
            draggable={canDrag}
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
            Stable transparent hit area while loading,
            loaded, or unavailable.
            */}

            <Rect
                {...commonAttributes}
                name="fashion-editor-image-hit-area"
                x={0}
                y={0}
                width={width}
                height={height}
                cornerRadius={
                    cornerRadius
                }
                fill="rgba(0,0,0,0)"
                strokeEnabled={false}
                listening={canListen}
                perfectDrawEnabled={
                    false
                }
            />

            <Group
                {...contentGroupProps}
                listening={false}
            >
                {imageResource.status ===
                    "loaded" &&
                    imageResource.image && (
                    <KonvaImage
                        {...commonAttributes}
                        name="fashion-editor-image-geometry"
                        image={
                            imageResource.image
                        }
                        x={imageLayout.x}
                        y={imageLayout.y}
                        width={
                            imageLayout.width
                        }
                        height={
                            imageLayout.height
                        }
                        cropX={crop?.x}
                        cropY={crop?.y}
                        cropWidth={
                            crop?.width
                        }
                        cropHeight={
                            crop?.height
                        }
                        imageSmoothingEnabled={
                            imageSmoothingEnabled
                        }
                        listening={false}
                        perfectDrawEnabled={
                            false
                        }
                        shadowForStrokeEnabled={
                            false
                        }
                    />
                )}

                {imageResource.status ===
                    "loading" && (
                    <Rect
                        name="fashion-editor-image-loading"
                        x={0}
                        y={0}
                        width={width}
                        height={height}
                        fill="rgba(148,163,184,0.08)"
                        stroke="rgba(100,116,139,0.35)"
                        strokeWidth={1}
                        dash={[8, 6]}
                        listening={false}
                        perfectDrawEnabled={
                            false
                        }
                    />
                )}

                {(
                    imageResource.status ===
                        "error" ||
                    imageResource.status ===
                        "empty"
                ) && (
                    <>
                        <Rect
                            name="fashion-editor-image-error"
                            x={0}
                            y={0}
                            width={width}
                            height={height}
                            fill="rgba(127,29,29,0.08)"
                            stroke="rgba(239,68,68,0.65)"
                            strokeWidth={1}
                            dash={[8, 6]}
                            listening={false}
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
                            strokeWidth={1}
                            listening={false}
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
                            strokeWidth={1}
                            listening={false}
                            perfectDrawEnabled={
                                false
                            }
                        />
                    </>
                )}
            </Group>
        </Group>
    );
}

/*=========================================================
Export
=========================================================*/

ImageObject.displayName =
    "ImageObject";

export default memo(
    ImageObject
);