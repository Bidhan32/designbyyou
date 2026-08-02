/*
=========================================================
FashionVision Professional Editor
Logical Layer Renderer
Version 1.0
=========================================================
*/

import React, {
    memo,
    useCallback,
    useMemo
} from "react";

import {
    Group
} from "react-konva";

import ObjectRenderer from "../objects/ObjectRenderer";

import {
    BLEND_MODES,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_BLEND_MODE =
    "source-over";

const warnedMissingObjects =
    new Set();

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
Blend Mode Normalization
=========================================================*/

export function normalizeLayerBlendMode(
    blendMode
) {
    return BLEND_MODES.includes(
        blendMode
    )
        ? blendMode
        : DEFAULT_BLEND_MODE;
}

/*=========================================================
Development Warning
=========================================================*/

function warnMissingObject(
    layerId,
    objectId
) {
    if (
        !import.meta.env.DEV ||
        warnedMissingObjects.has(
            objectId
        )
    ) {
        return;
    }

    warnedMissingObjects.add(
        objectId
    );

    console.warn(
        `[LayerRenderer] Object "${objectId}" referenced by layer "${layerId}" could not be found.`
    );
}

/*=========================================================
Resolve Layer Objects
=========================================================*/

export function getRenderableLayerObjects(
    layer,
    objects,
    {
        includeHiddenObjects = false,
        objectFilter = null
    } = {}
) {
    if (
        !layer ||
        !Array.isArray(
            layer.objectIds
        ) ||
        !isPlainObject(objects)
    ) {
        return [];
    }

    return uniqueIds(
        layer.objectIds
    )
        .map(
            objectId => {
                const object =
                    objects[objectId];

                if (!object) {
                    warnMissingObject(
                        layer.id,
                        objectId
                    );

                    return null;
                }

                /*
                An object must belong to this logical layer.

                This prevents stale layer references from rendering
                the same object in multiple layers.
                */

                if (
                    object.layerId &&
                    object.layerId !==
                        layer.id
                ) {
                    return null;
                }

                if (
                    !includeHiddenObjects &&
                    object.visible ===
                        false
                ) {
                    return null;
                }

                if (
                    isFunction(
                        objectFilter
                    ) &&
                    !objectFilter(
                        object,
                        layer
                    )
                ) {
                    return null;
                }

                return object;
            }
        )
        .filter(Boolean);
}

/*=========================================================
Compare Object References in One Layer
=========================================================*/

function haveSameLayerObjectReferences(
    previousLayer,
    nextLayer,
    previousObjects,
    nextObjects
) {
    const previousIds =
        uniqueIds(
            previousLayer?.objectIds
        );

    const nextIds =
        uniqueIds(
            nextLayer?.objectIds
        );

    if (
        previousIds.length !==
        nextIds.length
    ) {
        return false;
    }

    for (
        let index = 0;
        index < previousIds.length;
        index++
    ) {
        if (
            previousIds[index] !==
            nextIds[index]
        ) {
            return false;
        }

        const objectId =
            previousIds[index];

        if (
            previousObjects?.[
                objectId
            ] !==
            nextObjects?.[
                objectId
            ]
        ) {
            return false;
        }
    }

    return true;
}

/*=========================================================
Logical Layer Group
=========================================================*/

function LogicalLayerGroup({
    layer,
    objects,

    isActive = false,
    listening = true,

    includeHiddenObjects = false,
    objectFilter = null,

    renderers = null,
    fallback = null,

    setActiveLayer = null,

    onObjectSelect = null,
    onObjectChange = null,
    onObjectDelete = null,
    onObjectRenderError = null
}) {
    const layerObjects =
        useMemo(
            () =>
                getRenderableLayerObjects(
                    layer,
                    objects,
                    {
                        includeHiddenObjects,
                        objectFilter
                    }
                ),
            [
                layer,
                objects,
                includeHiddenObjects,
                objectFilter
            ]
        );

    const layerVisible =
        layer?.visible !== false;

    const layerLocked =
        Boolean(
            layer?.locked
        );

    const layerListening =
        Boolean(
            listening &&
            layerVisible &&
            !layerLocked
        );

    const opacity =
        clamp(
            layer?.opacity ?? 1,
            0,
            1
        );

    const blendMode =
        normalizeLayerBlendMode(
            layer?.blendMode
        );

    /*=====================================================
    Object Event Wrappers
    =====================================================*/

    const handleObjectSelect =
        useCallback(
            payload => {
                if (
                    layerLocked ||
                    !layerVisible
                ) {
                    return;
                }

                /*
                Selecting an object also makes its layer active.
                */

                if (
                    !isActive &&
                    isFunction(
                        setActiveLayer
                    )
                ) {
                    setActiveLayer(
                        layer.id
                    );
                }

                onObjectSelect?.({
                    ...payload,

                    layer,

                    layerId:
                        layer.id
                });
            },
            [
                layer,
                layerLocked,
                layerVisible,
                isActive,
                setActiveLayer,
                onObjectSelect
            ]
        );

    const handleObjectChange =
        useCallback(
            payload => {
                onObjectChange?.({
                    ...payload,

                    layer,

                    layerId:
                        layer.id
                });
            },
            [
                layer,
                onObjectChange
            ]
        );

    const handleObjectDelete =
        useCallback(
            payload => {
                onObjectDelete?.({
                    ...payload,

                    layer,

                    layerId:
                        layer.id
                });
            },
            [
                layer,
                onObjectDelete
            ]
        );

    const handleObjectRenderError =
        useCallback(
            payload => {
                onObjectRenderError?.({
                    ...payload,

                    layer,

                    layerId:
                        layer.id
                });
            },
            [
                layer,
                onObjectRenderError
            ]
        );

    /*=====================================================
    Render Guard
    =====================================================*/

    if (
        !layer ||
        !layer.id ||
        !layerVisible
    ) {
        return null;
    }

    return (
        <Group
            id={layer.id}
            name={[
                "fashion-editor-logical-layer",

                isActive
                    ? "fashion-editor-active-layer"
                    : "",

                layerLocked
                    ? "fashion-editor-locked-layer"
                    : ""
            ]
                .filter(Boolean)
                .join(" ")}
            visible={
                layerVisible
            }
            listening={
                layerListening
            }
            opacity={
                opacity
            }
            globalCompositeOperation={
                blendMode
            }
            x={
                numberOr(
                    layer.x,
                    0
                )
            }
            y={
                numberOr(
                    layer.y,
                    0
                )
            }
            rotation={
                numberOr(
                    layer.rotation,
                    0
                )
            }
            scaleX={
                numberOr(
                    layer.scaleX,
                    1
                )
            }
            scaleY={
                numberOr(
                    layer.scaleY,
                    1
                )
            }
        >
            {layerObjects.map(
                object => (
                    <ObjectRenderer
                        key={
                            object.id
                        }
                        object={
                            object
                        }
                        layer={
                            layer
                        }
                        listening={
                            layerListening
                        }
                        transient={
                            Boolean(
                                object.transient
                            )
                        }
                        renderers={
                            renderers
                        }
                        fallback={
                            fallback
                        }
                        onSelect={
                            handleObjectSelect
                        }
                        onChange={
                            handleObjectChange
                        }
                        onDelete={
                            handleObjectDelete
                        }
                        onRenderError={
                            handleObjectRenderError
                        }
                    />
                )
            )}
        </Group>
    );
}

/*=========================================================
Logical Layer Memo Comparison
=========================================================*/

function areLogicalLayerPropsEqual(
    previousProps,
    nextProps
) {
    if (
        previousProps.layer !==
        nextProps.layer
    ) {
        return false;
    }

    if (
        previousProps.isActive !==
            nextProps.isActive ||
        previousProps.listening !==
            nextProps.listening ||
        previousProps.includeHiddenObjects !==
            nextProps.includeHiddenObjects ||
        previousProps.objectFilter !==
            nextProps.objectFilter ||
        previousProps.renderers !==
            nextProps.renderers ||
        previousProps.fallback !==
            nextProps.fallback ||
        previousProps.setActiveLayer !==
            nextProps.setActiveLayer ||
        previousProps.onObjectSelect !==
            nextProps.onObjectSelect ||
        previousProps.onObjectChange !==
            nextProps.onObjectChange ||
        previousProps.onObjectDelete !==
            nextProps.onObjectDelete ||
        previousProps.onObjectRenderError !==
            nextProps.onObjectRenderError
    ) {
        return false;
    }

    /*
    The complete objects map changes whenever one object is
    updated. Only rerender this layer when an object used by
    this layer actually changed.
    */

    return haveSameLayerObjectReferences(
        previousProps.layer,
        nextProps.layer,
        previousProps.objects,
        nextProps.objects
    );
}

const MemoizedLogicalLayerGroup =
    memo(
        LogicalLayerGroup,
        areLogicalLayerPropsEqual
    );

MemoizedLogicalLayerGroup.displayName =
    "LogicalLayerGroup";

/*=========================================================
Layer Renderer Component
=========================================================*/

function LayerRenderer({
    layers: layersOverride = null,
    objects: objectsOverride = null,
    document: documentOverride = null,
    activeLayerId:
        activeLayerIdOverride = null,

    listening = true,

    clipToDocument = true,
    includeHiddenLayers = false,
    includeHiddenObjects = false,

    layerFilter = null,
    objectFilter = null,

    renderers = null,
    fallback = null,

    onObjectSelect = null,
    onObjectChange = null,
    onObjectDelete = null,
    onObjectRenderError = null
}) {
    const storeLayers =
        useFashionEditorStore(
            state =>
                state.layers
        );

    const storeObjects =
        useFashionEditorStore(
            state =>
                state.objects
        );

    const storeDocument =
        useFashionEditorStore(
            state =>
                state.document
        );

    const storeActiveLayerId =
        useFashionEditorStore(
            state =>
                state.activeLayerId
        );

    const setActiveLayer =
        useFashionEditorStore(
            state =>
                state.setActiveLayer
        );

    const layers =
        Array.isArray(
            layersOverride
        )
            ? layersOverride
            : storeLayers;

    const objects =
        isPlainObject(
            objectsOverride
        )
            ? objectsOverride
            : storeObjects;

    const document =
        isPlainObject(
            documentOverride
        )
            ? documentOverride
            : storeDocument;

    const activeLayerId =
        activeLayerIdOverride ||
        storeActiveLayerId;

    /*=====================================================
    Filter Renderable Layers
    =====================================================*/

    const renderableLayers =
        useMemo(
            () =>
                layers.filter(
                    layer => {
                        if (
                            !layer ||
                            !layer.id
                        ) {
                            return false;
                        }

                        if (
                            !includeHiddenLayers &&
                            layer.visible ===
                                false
                        ) {
                            return false;
                        }

                        if (
                            isFunction(
                                layerFilter
                            ) &&
                            !layerFilter(
                                layer
                            )
                        ) {
                            return false;
                        }

                        return true;
                    }
                ),
            [
                layers,
                includeHiddenLayers,
                layerFilter
            ]
        );

    const documentWidth =
        Math.max(
            1,
            numberOr(
                document?.width,
                1200
            )
        );

    const documentHeight =
        Math.max(
            1,
            numberOr(
                document?.height,
                1600
            )
        );

    /*
    The layers array is rendered from first to last.

    Therefore:
    - layers[0] is the back layer
    - the final layer is the top layer
    */

    return (
        <Group
            id="fashion-editor-layer-renderer"
            name="fashion-editor-layer-renderer"
            clipX={
                clipToDocument
                    ? 0
                    : undefined
            }
            clipY={
                clipToDocument
                    ? 0
                    : undefined
            }
            clipWidth={
                clipToDocument
                    ? documentWidth
                    : undefined
            }
            clipHeight={
                clipToDocument
                    ? documentHeight
                    : undefined
            }
        >
            {renderableLayers.map(
                layer => (
                    <MemoizedLogicalLayerGroup
                        key={
                            layer.id
                        }
                        layer={
                            layer
                        }
                        objects={
                            objects
                        }
                        isActive={
                            layer.id ===
                            activeLayerId
                        }
                        listening={
                            listening
                        }
                        includeHiddenObjects={
                            includeHiddenObjects
                        }
                        objectFilter={
                            objectFilter
                        }
                        renderers={
                            renderers
                        }
                        fallback={
                            fallback
                        }
                        setActiveLayer={
                            setActiveLayer
                        }
                        onObjectSelect={
                            onObjectSelect
                        }
                        onObjectChange={
                            onObjectChange
                        }
                        onObjectDelete={
                            onObjectDelete
                        }
                        onObjectRenderError={
                            onObjectRenderError
                        }
                    />
                )
            )}
        </Group>
    );
}

/*=========================================================
Layer Renderer Memo Comparison
=========================================================*/

function areLayerRendererPropsEqual(
    previousProps,
    nextProps
) {
    return (
        previousProps.layers ===
            nextProps.layers &&
        previousProps.objects ===
            nextProps.objects &&
        previousProps.document ===
            nextProps.document &&
        previousProps.activeLayerId ===
            nextProps.activeLayerId &&
        previousProps.listening ===
            nextProps.listening &&
        previousProps.clipToDocument ===
            nextProps.clipToDocument &&
        previousProps.includeHiddenLayers ===
            nextProps.includeHiddenLayers &&
        previousProps.includeHiddenObjects ===
            nextProps.includeHiddenObjects &&
        previousProps.layerFilter ===
            nextProps.layerFilter &&
        previousProps.objectFilter ===
            nextProps.objectFilter &&
        previousProps.renderers ===
            nextProps.renderers &&
        previousProps.fallback ===
            nextProps.fallback &&
        previousProps.onObjectSelect ===
            nextProps.onObjectSelect &&
        previousProps.onObjectChange ===
            nextProps.onObjectChange &&
        previousProps.onObjectDelete ===
            nextProps.onObjectDelete &&
        previousProps.onObjectRenderError ===
            nextProps.onObjectRenderError
    );
}

/*=========================================================
Memoized Export
=========================================================*/

const MemoizedLayerRenderer =
    memo(
        LayerRenderer,
        areLayerRendererPropsEqual
    );

MemoizedLayerRenderer.displayName =
    "LayerRenderer";

export {
    LogicalLayerGroup
};

export default MemoizedLayerRenderer;