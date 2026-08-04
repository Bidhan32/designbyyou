/*
=========================================================
FashionVision Professional Editor
Object Renderer
Version 1.4
=========================================================
*/

import React, {
    memo,
    useEffect,
    useMemo
} from "react";

import BrushObject from "./BrushObject";
import ShapeObject from "./ShapeObject";
import TextObject from "./TextObject";
import ImageObject from "./ImageObject";
import PatternObject from "./PatternObject";

import {
    OBJECT_TYPES
} from "../useFashionEditorStore";

/*=========================================================
Development Warnings
=========================================================*/

const warnedObjectTypes =
    new Set();

/*=========================================================
General Helpers
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

/*=========================================================
Built-in Renderer Registry
=========================================================*/

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

/*=========================================================
Resolve Object Type
=========================================================*/

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

/*=========================================================
Resolve Renderer
=========================================================*/

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

/*=========================================================
Unsupported Object Warning
=========================================================*/

function warnUnsupportedObjectType(
    objectType
) {
    if (
        import.meta.env.PROD ||
        !objectType ||
        warnedObjectTypes.has(
            objectType
        )
    ) {
        return;
    }

    warnedObjectTypes.add(
        objectType
    );

    console.warn(
        `[ObjectRenderer] No renderer is registered for object type "${objectType}".`
    );
}

/*=========================================================
Fallback Renderer
=========================================================*/

function renderFallback({
    fallback,
    object,
    layer,
    objectType
}) {
    if (!fallback) {
        return null;
    }

    if (
        isFunction(
            fallback
        )
    ) {
        const FallbackComponent =
            fallback;

        return (
            <FallbackComponent
                object={object}
                layer={layer}
                objectType={
                    objectType
                }
            />
        );
    }

    return fallback;
}

/*=========================================================
Object Renderer Component
=========================================================*/

function ObjectRenderer({
    object,
    layer = null,

    listening = true,
    transient = false,

    renderers = null,
    fallback = null,

    onSelect = null,
    onChange = null,
    onDelete = null,
    onRenderError = null
}) {
    const objectType =
        useMemo(
            () =>
                resolveObjectType(
                    object
                ),
            [
                object?.type
            ]
        );

    const Renderer =
        useMemo(
            () =>
                resolveRenderer(
                    objectType,
                    renderers
                ),
            [
                objectType,
                renderers
            ]
        );

    useEffect(
        () => {
            if (
                object &&
                objectType &&
                !Renderer
            ) {
                warnUnsupportedObjectType(
                    objectType
                );
            }
        },
        [
            object,
            objectType,
            Renderer
        ]
    );

    if (
        !object ||
        !isObject(
            object
        ) ||
        !object.id ||
        !objectType
    ) {
        return null;
    }

    if (
        object.visible ===
            false ||
        layer?.visible ===
            false
    ) {
        return null;
    }

    if (!Renderer) {
        return renderFallback({
            fallback,
            object,
            layer,
            objectType
        });
    }

    const rendererProps = {
        object,
        layer,

        listening:
            Boolean(
                listening
            ),

        transient:
            Boolean(
                transient ||
                object.transient ||
                object.metadata
                    ?.transient
            ),

        onSelect,
        onChange,
        onDelete,
        onRenderError
    };

    return (
        <Renderer
            {...rendererProps}
        />
    );
}

/*=========================================================
Memo Comparison
=========================================================*/

function areObjectRendererPropsEqual(
    previousProps,
    nextProps
) {
    return (
        previousProps.object ===
            nextProps.object &&

        previousProps.layer ===
            nextProps.layer &&

        previousProps.listening ===
            nextProps.listening &&

        previousProps.transient ===
            nextProps.transient &&

        previousProps.renderers ===
            nextProps.renderers &&

        previousProps.fallback ===
            nextProps.fallback &&

        previousProps.onSelect ===
            nextProps.onSelect &&

        previousProps.onChange ===
            nextProps.onChange &&

        previousProps.onDelete ===
            nextProps.onDelete &&

        previousProps.onRenderError ===
            nextProps.onRenderError
    );
}

/*=========================================================
Memoized Export
=========================================================*/

const MemoizedObjectRenderer =
    memo(
        ObjectRenderer,
        areObjectRendererPropsEqual
    );

MemoizedObjectRenderer.displayName =
    "ObjectRenderer";

/*=========================================================
Exports
=========================================================*/

export {
    BUILT_IN_RENDERERS,
    resolveObjectType,
    resolveRenderer
};

export default MemoizedObjectRenderer;