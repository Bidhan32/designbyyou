import { isObject, isFunction, resolveObjectType, resolveRenderer } from "./ObjectRenderer.helpers.js";
/*
=========================================================
FashionVision Professional Editor
Object Renderer
Version 1.4
=========================================================
*/

import React, {
    memo,
    useEffect
} from "react";









/*=========================================================
Development Warnings
=========================================================*/

const warnedObjectTypes =
    new Set();

/*=========================================================
General Helpers
=========================================================*/





/*=========================================================
Built-in Renderer Registry
=========================================================*/



/*=========================================================
Resolve Object Type
=========================================================*/



/*=========================================================
Resolve Renderer
=========================================================*/



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
    const objectType = resolveObjectType(object);

    const Renderer = resolveRenderer(objectType, renderers);

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

    return React.createElement(Renderer, rendererProps);
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



export default MemoizedObjectRenderer;