/*
=========================================================
FashionVision Professional Editor
Fill Tool
Version 1.0
=========================================================
*/

import { defineTool } from "./ToolManager";
import { EDITOR_TOOLS, OBJECT_TYPES } from "../useFashionEditorStore";

const DEFAULT_FILL_COLOUR = "#111111";
const DEFAULT_FILL_OPACITY = 1;
const DEFAULT_HISTORY_LABEL = "Fill shape";

function numberOr(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
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

function isPlainObject(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function getNativeEvent(event) {
    return event?.evt || event?.nativeEvent || event || null;
}

function isContextLike(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        (
            value.manager ||
            value.stage ||
            value.state ||
            value.editorState ||
            value.actions ||
            value.store ||
            value.documentPoint ||
            value.screenPoint
        )
    );
}

function resolveHandlerArguments(
    firstArgument,
    secondArgument
) {
    return isContextLike(firstArgument)
        ? {
            context: firstArgument,
            event: secondArgument
        }
        : {
            context: secondArgument,
            event: firstArgument
        };
}

function safelyPreventDefault(event) {
    const nativeEvent = getNativeEvent(event);

    if (
        !nativeEvent ||
        typeof nativeEvent.preventDefault !== "function" ||
        nativeEvent.cancelable === false ||
        nativeEvent.defaultPrevented === true
    ) {
        return false;
    }

    nativeEvent.preventDefault();

    return true;
}

function safelyStopPropagation(event) {
    if (event) {
        event.cancelBubble = true;
    }

    getNativeEvent(event)?.stopPropagation?.();
}

function getLatestState(context) {
    if (typeof context?.store?.getState === "function") {
        return context.store.getState();
    }

    return (
        context?.state ||
        context?.editorState ||
        context?.actions ||
        null
    );
}

function getAction(context, actionName) {
    const sources = [
        context?.actions,
        context?.state,
        context?.editorState,
        getLatestState(context),
        context
    ];

    for (const source of sources) {
        if (typeof source?.[actionName] === "function") {
            return source[actionName];
        }
    }

    return null;
}

function requestRender(context) {
    if (typeof context?.requestRender === "function") {
        context.requestRender();
        return;
    }

    context?.stage?.batchDraw?.();
}

function isPrimaryPointer(context, event) {
    const nativeEvent = getNativeEvent(event);

    if (nativeEvent?.isPrimary === false) {
        return false;
    }

    const button = Number(
        context?.button ??
        nativeEvent?.button ??
        0
    );

    return !Number.isFinite(button) || button === 0;
}

function isFinitePoint(point) {
    return Boolean(
        point &&
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.y))
    );
}

/*=========================================================
Konva Target Resolution
=========================================================*/

function getNodeAttribute(node, attributeName) {
    if (!node) {
        return undefined;
    }

    if (typeof node.getAttr === "function") {
        const value = node.getAttr(attributeName);

        if (value !== undefined) {
            return value;
        }
    }

    return node.attrs?.[attributeName];
}

function getNodeParent(node) {
    if (typeof node?.getParent === "function") {
        return node.getParent();
    }

    return node?.parent || null;
}

function resolveObjectIdFromNode(node) {
    let currentNode = node;

    for (
        let depth = 0;
        currentNode && depth < 50;
        depth += 1
    ) {
        const editorObjectId = getNodeAttribute(
            currentNode,
            "editorObjectId"
        );

        if (
            typeof editorObjectId === "string" &&
            editorObjectId
        ) {
            return editorObjectId;
        }

        const objectId = getNodeAttribute(
            currentNode,
            "objectId"
        );

        if (
            typeof objectId === "string" &&
            objectId
        ) {
            return objectId;
        }

        const objectRoot =
            getNodeAttribute(
                currentNode,
                "editorObjectRoot"
            ) === true;

        if (
            objectRoot &&
            typeof currentNode.id === "function"
        ) {
            const nodeId = currentNode.id();

            if (
                typeof nodeId === "string" &&
                nodeId
            ) {
                return nodeId;
            }
        }

        currentNode = getNodeParent(currentNode);
    }

    return null;
}

function resolveClickedObjectId(context, event) {
    const eventTarget =
        event?.target ||
        event?.currentTarget ||
        context?.event?.target ||
        null;

    const directObjectId =
        resolveObjectIdFromNode(eventTarget);

    if (directObjectId) {
        return directObjectId;
    }

    if (
        !context?.stage ||
        !isFinitePoint(context.screenPoint) ||
        typeof context.stage.getIntersection !== "function"
    ) {
        return null;
    }

    try {
        const intersection =
            context.stage.getIntersection({
                x: Number(context.screenPoint.x),
                y: Number(context.screenPoint.y)
            });

        return resolveObjectIdFromNode(intersection);
    } catch {
        return null;
    }
}

/*=========================================================
Object Validation
=========================================================*/

function getObjectLayer(state, object) {
    return (
        state?.layers?.find(
            layer =>
                layer.id === object?.layerId
        ) ||
        null
    );
}

function canEditObject(object, layer) {
    return Boolean(
        object &&
        object.visible !== false &&
        object.locked !== true &&
        layer &&
        layer.visible !== false &&
        layer.locked !== true
    );
}

function canFillObject(object) {
    return Boolean(
        object &&
        object.type === OBJECT_TYPES.SHAPE &&
        object.closed !== false
    );
}

/*=========================================================
Fill Settings
=========================================================*/

function resolveFillColour(state, options) {
    if (typeof options?.getFillColour === "function") {
        const customColour =
            options.getFillColour(state);

        if (
            typeof customColour === "string" &&
            customColour.trim()
        ) {
            return customColour.trim();
        }
    }

    const fillSettings =
        isPlainObject(state?.fill)
            ? state.fill
            : {};

    const shapeSettings =
        isPlainObject(state?.shape)
            ? state.shape
            : {};

    const colours =
        isPlainObject(state?.colors)
            ? state.colors
            : {};

    return (
        [
            fillSettings.color,
            fillSettings.fill,
            shapeSettings.fill,
            colours.primary,
            colours.secondary
        ].find(
            value =>
                typeof value === "string" &&
                value.trim()
        )?.trim() ||
        DEFAULT_FILL_COLOUR
    );
}

function resolveFillOpacity(state, options) {
    if (typeof options?.getFillOpacity === "function") {
        return clamp(
            options.getFillOpacity(state),
            0,
            1
        );
    }

    return clamp(
        state?.fill?.opacity ??
        state?.fill?.fillOpacity ??
        state?.shape?.fillOpacity ??
        DEFAULT_FILL_OPACITY,
        0,
        1
    );
}

function resolveFillMode(state, context, options) {
    if (typeof options?.getFillMode === "function") {
        const customMode =
            options.getFillMode(
                state,
                context
            );

        if (
            customMode === "none" ||
            customMode === "solid"
        ) {
            return customMode;
        }
    }

    // Alt-click removes the fill.
    if (context?.altKey) {
        return "none";
    }

    return (
        state?.fill?.mode === "none" ||
        state?.fill?.fillType === "none"
    )
        ? "none"
        : "solid";
}

function createFillUpdates(
    mode,
    colour,
    opacity
) {
    if (mode === "none") {
        return {
            fillType: "none",
            fill: "transparent",
            fillOpacity: 0,

            style: {
                fillType: "none",
                fill: "transparent",
                fillOpacity: 0
            }
        };
    }

    return {
        fillType: "solid",
        fill: colour,
        fillOpacity: opacity,

        style: {
            fillType: "solid",
            fill: colour,
            fillOpacity: opacity
        }
    };
}

function hasFillChanged(object, updates) {
    const currentFillType =
        object?.fillType ||
        object?.style?.fillType ||
        (
            object?.fill === "transparent"
                ? "none"
                : "solid"
        );

    const currentFill =
        object?.fill ??
        object?.style?.fill ??
        "transparent";

    const currentOpacity = clamp(
        object?.fillOpacity ??
        object?.style?.fillOpacity ??
        (
            currentFillType === "none"
                ? 0
                : 1
        ),
        0,
        1
    );

    return (
        currentFillType !== updates.fillType ||
        currentFill !== updates.fill ||
        Math.abs(
            currentOpacity -
            updates.fillOpacity
        ) >
            0.0001
    );
}

/*=========================================================
Fill Tool Factory
=========================================================*/

export function createFillTool(options = {}) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.FILL;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    function fillClickedObject(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        if (
            !context ||
            !isPrimaryPointer(
                context,
                event
            )
        ) {
            return false;
        }

        const state =
            getLatestState(context);

        const objectId =
            resolveClickedObjectId(
                context,
                event
            );

        const object =
            state?.objects?.[
                objectId
            ];

        if (!canFillObject(object)) {
            return false;
        }

        const layer =
            getObjectLayer(
                state,
                object
            );

        if (
            !canEditObject(
                object,
                layer
            )
        ) {
            return false;
        }

        safelyPreventDefault(event);
        safelyStopPropagation(event);

        const mode =
            resolveFillMode(
                state,
                context,
                options
            );

        const colour =
            resolveFillColour(
                state,
                options
            );

        const opacity =
            resolveFillOpacity(
                state,
                options
            );

        const updates =
            createFillUpdates(
                mode,
                colour,
                opacity
            );

        if (
            !hasFillChanged(
                object,
                updates
            )
        ) {
            return true;
        }

        const updateObject =
            getAction(
                context,
                "updateObject"
            );

        if (!updateObject) {
            throw new Error(
                "FillTool requires updateObject in the editor context."
            );
        }

        updateObject(
            object.id,
            updates,
            mode === "none"
                ? "Remove shape fill"
                : historyLabel
        );

        if (
            object.layerId &&
            state.activeLayerId !==
                object.layerId
        ) {
            getAction(
                context,
                "setActiveLayer"
            )?.(
                object.layerId,
                {
                    clearSelection: false
                }
            );
        }

        if (
            options.selectFilledObject === true
        ) {
            getAction(
                context,
                "selectObjects"
            )?.([
                object.id
            ]);
        }

        requestRender(context);

        return true;
    }

    function finishInteraction(
        firstArgument,
        secondArgument
    ) {
        const {
            event
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        safelyPreventDefault(event);

        return true;
    }

    function cancelInteraction() {
        return true;
    }

    return defineTool({
        id: toolId,

        name:
            options.name ||
            "Fill",

        label:
            options.label ||
            "Fill",

        description:
            "Apply a solid fill to a closed shape. Alt-click removes the fill.",

        shortcut:
            options.shortcut ||
            "F",

        cursor:
            options.cursor ||
            "cell",

        preventDefault: true,
        stopPropagation: true,
        allowRightButton: false,
        allowMiddleButton: false,

        onPointerDown:
            fillClickedObject,

        onPointerUp:
            finishInteraction,

        onPointerCancel:
            cancelInteraction,

        onCancel:
            cancelInteraction
    });
}

/*=========================================================
Default Export
=========================================================*/

export const FillTool =
    createFillTool();

export default FillTool;