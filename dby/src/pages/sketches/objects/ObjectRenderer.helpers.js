// Shared helpers and state kept separate from the React refresh boundary.
import BrushObject from "./BrushObject";
import ShapeObject from "./ShapeObject";
import TextObject from "./TextObject";
import ImageObject from "./ImageObject";
import PatternObject from "./PatternObject";
import { OBJECT_TYPES } from "../useFashionEditorStore";

/*=========================================================
Development Warnings
=========================================================*/

function isObject(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        !Array.isArray(value)
    );
}

function isFunction(
    value
) {
    return (
        typeof value ===
        "function"
    );
}

const BUILT_IN_RENDERERS =
    Object.freeze({
        [OBJECT_TYPES.BRUSH]:
            BrushObject,

        [OBJECT_TYPES.SHAPE]:
            ShapeObject,

        [OBJECT_TYPES.TEXT]:
            TextObject,

        [OBJECT_TYPES.IMAGE]:
            ImageObject,

        [OBJECT_TYPES.PATTERN]:
            PatternObject
    });

function resolveObjectType(
    object
) {
    if (
        typeof object?.type !==
            "string" ||
        object.type.trim() ===
            ""
    ) {
        return null;
    }

    return object.type.trim();
}

function resolveRenderer(
    objectType,
    customRenderers
) {
    if (!objectType) {
        return null;
    }

    const customRenderer =
        customRenderers?.[
            objectType
        ];

    if (
        isFunction(
            customRenderer
        ) ||
        isObject(
            customRenderer
        )
    ) {
        return customRenderer;
    }

    return (
        BUILT_IN_RENDERERS[
            objectType
        ] ||
        null
    );
}

export { isObject, isFunction, BUILT_IN_RENDERERS, resolveObjectType, resolveRenderer };
