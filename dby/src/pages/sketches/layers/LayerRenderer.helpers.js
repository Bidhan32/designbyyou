// Shared helpers and state kept separate from the React refresh boundary.
import { BLEND_MODES } from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_BLEND_MODE =
    "source-over";

const warnedMissingObjects =
    new Set();

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

function normalizeLayerBlendMode(
    blendMode
) {
    return BLEND_MODES.includes(
        blendMode
    )
        ? blendMode
        : DEFAULT_BLEND_MODE;
}

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

function getRenderableLayerObjects(
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

export { DEFAULT_BLEND_MODE, warnedMissingObjects, isPlainObject, isFunction, uniqueIds, normalizeLayerBlendMode, warnMissingObject, getRenderableLayerObjects };
