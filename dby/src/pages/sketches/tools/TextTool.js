/*
=========================================================
FashionVision Professional Editor
Text Tool
Version 1.0
=========================================================
*/

import { defineTool } from "./ToolManager";
import { EDITOR_TOOLS, OBJECT_TYPES } from "../useFashionEditorStore";

const DEFAULT_PREVIEW_ID = "__fashion-text-preview__";
const DEFAULT_HISTORY_LABEL = "Add text";
const DEFAULT_TEXT = "Text";
const DEFAULT_FONT_FAMILY = "Arial";
const DEFAULT_FONT_SIZE = 32;
const DEFAULT_TEXT_COLOR = "#111111";
const DEFAULT_TEXT_BOX_WIDTH = 240;
const DEFAULT_TEXT_BOX_HEIGHT = 64;
const MINIMUM_DRAG_DISTANCE = 4;
const MINIMUM_TEXT_BOX_WIDTH = 20;
const MINIMUM_TEXT_BOX_HEIGHT = 20;

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

function isPlainObject(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isFinitePoint(point) {
    return Boolean(
        point &&
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.y))
    );
}

function clonePoint(point) {
    return isFinitePoint(point)
        ? {
            x: Number(point.x),
            y: Number(point.y)
        }
        : null;
}

function createId(prefix = "text") {
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

function getNativeEvent(event) {
    return (
        event?.evt ||
        event?.nativeEvent ||
        event ||
        null
    );
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
            value.point ||
            value.toDocumentPoint
        )
    );
}

/*
Supports both:

    handler(context, event)
    handler(event, context)
*/

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
    const nativeEvent =
        getNativeEvent(event);

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

/*=========================================================
Editor Context Helpers
=========================================================*/

function getLatestState(context) {
    if (
        typeof context?.store?.getState ===
        "function"
    ) {
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
        if (
            typeof source?.[actionName] ===
            "function"
        ) {
            return source[actionName];
        }
    }

    return null;
}

function getActiveLayer(state) {
    return (
        state?.layers?.find(
            layer =>
                layer.id ===
                state.activeLayerId
        ) ||
        null
    );
}

function canDrawOnLayer(layer) {
    return Boolean(
        layer &&
        layer.visible !== false &&
        layer.locked !== true
    );
}

function setTemporaryObject(context, object) {
    if (
        typeof context?.setTemporaryObject !==
        "function"
    ) {
        return false;
    }

    context.setTemporaryObject(
        object ||
        null
    );

    return true;
}

function requestRender(context) {
    if (
        typeof context?.requestRender ===
        "function"
    ) {
        context.requestRender();

        return;
    }

    context?.stage?.batchDraw?.();
}

/*=========================================================
Pointer Helpers
=========================================================*/

function getPointerId(context, event) {
    const contextPointerId =
        Number(context?.pointerId);

    if (
        Number.isFinite(contextPointerId)
    ) {
        return contextPointerId;
    }

    const nativeEvent =
        getNativeEvent(event);

    const pointerId =
        Number(nativeEvent?.pointerId);

    if (
        Number.isFinite(pointerId)
    ) {
        return pointerId;
    }

    const touchIdentifier =
        Number(
            nativeEvent?.changedTouches?.[0]?.identifier ??
            nativeEvent?.touches?.[0]?.identifier
        );

    return Number.isFinite(touchIdentifier)
        ? touchIdentifier
        : null;
}

function getPointerType(context, event) {
    if (
        typeof context?.pointerType === "string" &&
        context.pointerType
    ) {
        return context.pointerType;
    }

    const nativeEvent =
        getNativeEvent(event);

    if (
        typeof nativeEvent?.pointerType === "string" &&
        nativeEvent.pointerType
    ) {
        return nativeEvent.pointerType;
    }

    if (
        nativeEvent?.touches ||
        nativeEvent?.changedTouches
    ) {
        return "touch";
    }

    return "mouse";
}

function isPrimaryPointer(context, event) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        nativeEvent?.isPrimary === false
    ) {
        return false;
    }

    const button =
        Number(
            context?.button ??
            nativeEvent?.button ??
            0
        );

    return (
        !Number.isFinite(button) ||
        button === 0
    );
}

function pointerMatchesSession(
    session,
    context,
    event
) {
    if (!session) {
        return false;
    }

    const incomingPointerId =
        getPointerId(
            context,
            event
        );

    if (
        session.pointerId === null ||
        incomingPointerId === null
    ) {
        return true;
    }

    return (
        session.pointerId ===
        incomingPointerId
    );
}

/*=========================================================
Coordinate Helpers
=========================================================*/

function getScreenPointFromEvent(
    context,
    event
) {
    if (
        isFinitePoint(
            context?.screenPoint
        )
    ) {
        return clonePoint(
            context.screenPoint
        );
    }

    const nativeEvent =
        getNativeEvent(event);

    const touch =
        nativeEvent?.changedTouches?.[0] ||
        nativeEvent?.touches?.[0] ||
        null;

    const clientX =
        Number(
            nativeEvent?.clientX ??
            touch?.clientX
        );

    const clientY =
        Number(
            nativeEvent?.clientY ??
            touch?.clientY
        );

    const container =
        context?.container ||
        context?.stage?.container?.();

    const rectangle =
        container?.getBoundingClientRect?.();

    if (
        rectangle &&
        Number.isFinite(clientX) &&
        Number.isFinite(clientY)
    ) {
        return {
            x:
                clientX -
                rectangle.left,

            y:
                clientY -
                rectangle.top
        };
    }

    return clonePoint(
        context?.stage?.getPointerPosition?.()
    );
}

function screenToDocumentPoint(
    screenPoint,
    context,
    state
) {
    if (
        !isFinitePoint(screenPoint)
    ) {
        return null;
    }

    if (
        typeof context?.toDocumentPoint ===
        "function"
    ) {
        const mappedPoint =
            context.toDocumentPoint(
                screenPoint
            );

        if (
            isFinitePoint(mappedPoint)
        ) {
            return clonePoint(
                mappedPoint
            );
        }
    }

    const viewport =
        state?.viewport ||
        context?.viewport ||
        {};

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                viewport.zoom,
                1
            )
        );

    return {
        x:
            (
                screenPoint.x -
                numberOr(
                    viewport.x,
                    0
                )
            ) /
            zoom,

        y:
            (
                screenPoint.y -
                numberOr(
                    viewport.y,
                    0
                )
            ) /
            zoom
    };
}

function resolveDocumentPoint(
    context,
    event,
    state
) {
    if (
        isFinitePoint(
            context?.documentPoint
        )
    ) {
        return clonePoint(
            context.documentPoint
        );
    }

    if (
        isFinitePoint(
            context?.point
        )
    ) {
        return clonePoint(
            context.point
        );
    }

    return screenToDocumentPoint(
        getScreenPointFromEvent(
            context,
            event
        ),
        context,
        state
    );
}

function getDocumentSize(documentData) {
    return {
        width:
            Math.max(
                1,
                numberOr(
                    documentData?.width,
                    1200
                )
            ),

        height:
            Math.max(
                1,
                numberOr(
                    documentData?.height,
                    1600
                )
            )
    };
}

function isPointInsideDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(point)
    ) {
        return false;
    }

    const {
        width,
        height
    } =
        getDocumentSize(
            documentData
        );

    return (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= width &&
        point.y <= height
    );
}

function clampPointToDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(point)
    ) {
        return null;
    }

    const {
        width,
        height
    } =
        getDocumentSize(
            documentData
        );

    return {
        x:
            clamp(
                point.x,
                0,
                width
            ),

        y:
            clamp(
                point.y,
                0,
                height
            )
    };
}

function snapPointToGrid(
    point,
    state
) {
    if (
        !isFinitePoint(point) ||
        state?.ui?.snapToGrid !== true
    ) {
        return clonePoint(point);
    }

    const gridSize =
        Math.max(
            1,
            numberOr(
                state.ui.gridSize,
                20
            )
        );

    return {
        x:
            Math.round(
                point.x /
                gridSize
            ) *
            gridSize,

        y:
            Math.round(
                point.y /
                gridSize
            ) *
            gridSize
    };
}

/*=========================================================
Text Settings
=========================================================*/

function normalizeFontStyle(value) {
    return [
        "normal",
        "italic",
        "oblique"
    ].includes(value)
        ? value
        : "normal";
}

function normalizeTextDecoration(value) {
    return [
        "",
        "none",
        "underline",
        "line-through"
    ].includes(value)
        ? value
        : "";
}

function normalizeTextAlign(value) {
    return [
        "left",
        "center",
        "right",
        "justify"
    ].includes(value)
        ? value
        : "left";
}

function normalizeVerticalAlign(value) {
    return [
        "top",
        "middle",
        "bottom"
    ].includes(value)
        ? value
        : "top";
}

function resolveTextSettings(
    state,
    options
) {
    const textSettings =
        isPlainObject(state?.text)
            ? state.text
            : {};

    const colours =
        isPlainObject(state?.colors)
            ? state.colors
            : {};

    const customText =
        typeof options?.getTextContent ===
        "function"
            ? options.getTextContent(state)
            : null;

    const text =
        String(
            [
                customText,
                textSettings.content,
                textSettings.text,
                textSettings.value,
                DEFAULT_TEXT
            ].find(
                value =>
                    value !== undefined &&
                    value !== null
            ) ??
            DEFAULT_TEXT
        );

    const fill =
        [
            textSettings.fill,
            textSettings.color,
            colours.primary,
            DEFAULT_TEXT_COLOR
        ].find(
            value =>
                typeof value === "string" &&
                value.trim()
        )?.trim() ||
        DEFAULT_TEXT_COLOR;

    return {
        text,

        fontFamily:
            typeof textSettings.fontFamily ===
                "string" &&
            textSettings.fontFamily.trim()
                ? textSettings.fontFamily.trim()
                : DEFAULT_FONT_FAMILY,

        fontSize:
            clamp(
                textSettings.fontSize ??
                DEFAULT_FONT_SIZE,
                1,
                1000
            ),

        fontWeight:
            clamp(
                textSettings.fontWeight ??
                400,
                100,
                900
            ),

        fontStyle:
            normalizeFontStyle(
                textSettings.fontStyle
            ),

        textDecoration:
            normalizeTextDecoration(
                textSettings.textDecoration
            ),

        align:
            normalizeTextAlign(
                textSettings.align
            ),

        verticalAlign:
            normalizeVerticalAlign(
                textSettings.verticalAlign
            ),

        lineHeight:
            clamp(
                textSettings.lineHeight ??
                1.2,
                0.1,
                10
            ),

        letterSpacing:
            clamp(
                textSettings.letterSpacing ??
                0,
                -100,
                500
            ),

        fill,

        opacity:
            clamp(
                textSettings.opacity ??
                1,
                0,
                1
            ),

        width:
            clamp(
                textSettings.width ??
                DEFAULT_TEXT_BOX_WIDTH,
                MINIMUM_TEXT_BOX_WIDTH,
                10000
            ),

        height:
            clamp(
                textSettings.height ??
                DEFAULT_TEXT_BOX_HEIGHT,
                MINIMUM_TEXT_BOX_HEIGHT,
                10000
            ),

        wrap:
            [
                "word",
                "char",
                "none"
            ].includes(
                textSettings.wrap
            )
                ? textSettings.wrap
                : "word",

        padding:
            Math.max(
                0,
                numberOr(
                    textSettings.padding,
                    0
                )
            )
    };
}

/*=========================================================
Text Box Geometry
=========================================================*/

function createTextBoxBounds(
    startPoint,
    endPoint,
    settings,
    documentData
) {
    if (
        !isFinitePoint(startPoint)
    ) {
        return null;
    }

    const documentSize =
        getDocumentSize(
            documentData
        );

    if (
        !isFinitePoint(endPoint)
    ) {
        return {
            x:
                startPoint.x,

            y:
                startPoint.y,

            width:
                Math.max(
                    MINIMUM_TEXT_BOX_WIDTH,
                    Math.min(
                        settings.width,
                        documentSize.width -
                        startPoint.x
                    )
                ),

            height:
                Math.max(
                    MINIMUM_TEXT_BOX_HEIGHT,
                    Math.min(
                        settings.height,
                        documentSize.height -
                        startPoint.y
                    )
                )
        };
    }

    const deltaX =
        endPoint.x -
        startPoint.x;

    const deltaY =
        endPoint.y -
        startPoint.y;

    if (
        Math.hypot(
            deltaX,
            deltaY
        ) <
        MINIMUM_DRAG_DISTANCE
    ) {
        return createTextBoxBounds(
            startPoint,
            null,
            settings,
            documentData
        );
    }

    const x =
        clamp(
            Math.min(
                startPoint.x,
                endPoint.x
            ),
            0,
            documentSize.width
        );

    const y =
        clamp(
            Math.min(
                startPoint.y,
                endPoint.y
            ),
            0,
            documentSize.height
        );

    const right =
        clamp(
            Math.max(
                startPoint.x,
                endPoint.x
            ),
            0,
            documentSize.width
        );

    const bottom =
        clamp(
            Math.max(
                startPoint.y,
                endPoint.y
            ),
            0,
            documentSize.height
        );

    return {
        x,

        y,

        width:
            Math.max(
                MINIMUM_TEXT_BOX_WIDTH,
                right -
                x
            ),

        height:
            Math.max(
                MINIMUM_TEXT_BOX_HEIGHT,
                bottom -
                y
            )
    };
}

/*=========================================================
Text Object Creation
=========================================================*/

function createTextObject({
    id,
    layerId,
    bounds,
    settings,
    pointerType,
    transient = false
}) {
    if (
        !bounds ||
        !settings
    ) {
        return null;
    }

    const timestamp =
        new Date()
            .toISOString();

    return {
        id,

        type:
            OBJECT_TYPES.TEXT,

        objectKind:
            "text",

        name:
            transient
                ? "Text Preview"
                : (
                    settings.text
                        .trim()
                        .slice(
                            0,
                            32
                        ) ||
                    "Text"
                ),

        layerId,

        visible:
            true,

        locked:
            Boolean(
                transient
            ),

        selectable:
            !transient,

        transient:
            Boolean(
                transient
            ),

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

        skewX:
            0,

        skewY:
            0,

        opacity:
            settings.opacity,

        text:
            settings.text,

        content:
            settings.text,

        value:
            settings.text,

        fontFamily:
            settings.fontFamily,

        fontSize:
            settings.fontSize,

        fontWeight:
            settings.fontWeight,

        fontStyle:
            settings.fontStyle,

        textDecoration:
            settings.textDecoration,

        align:
            settings.align,

        verticalAlign:
            settings.verticalAlign,

        lineHeight:
            settings.lineHeight,

        letterSpacing:
            settings.letterSpacing,

        wrap:
            settings.wrap,

        padding:
            settings.padding,

        fill:
            settings.fill,

        color:
            settings.fill,

        style: {
            fill:
                settings.fill,

            color:
                settings.fill,

            opacity:
                settings.opacity,

            fontFamily:
                settings.fontFamily,

            fontSize:
                settings.fontSize,

            fontWeight:
                settings.fontWeight,

            fontStyle:
                settings.fontStyle,

            textDecoration:
                settings.textDecoration,

            align:
                settings.align,

            verticalAlign:
                settings.verticalAlign,

            lineHeight:
                settings.lineHeight,

            letterSpacing:
                settings.letterSpacing,

            wrap:
                settings.wrap,

            padding:
                settings.padding
        },

        geometry: {
            x:
                bounds.x,

            y:
                bounds.y,

            width:
                bounds.width,

            height:
                bounds.height,

            left:
                bounds.x,

            top:
                bounds.y,

            right:
                bounds.x +
                bounds.width,

            bottom:
                bounds.y +
                bounds.height,

            center: {
                x:
                    bounds.x +
                    bounds.width /
                    2,

                y:
                    bounds.y +
                    bounds.height /
                    2
            },

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
                    bounds.x,

                minY:
                    bounds.y,

                maxX:
                    bounds.x +
                    bounds.width,

                maxY:
                    bounds.y +
                    bounds.height
            }
        },

        metadata: {
            tool:
                EDITOR_TOOLS.TEXT,

            objectKind:
                "text",

            pointerType,

            transient:
                Boolean(
                    transient
                ),

            createdWith:
                "TextTool"
        },

        createdAt:
            timestamp,

        updatedAt:
            timestamp
    };
}

/*=========================================================
Text Tool Factory
=========================================================*/

export function createTextTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.TEXT;

    const previewId =
        options.previewId ||
        DEFAULT_PREVIEW_ID;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    let session =
        null;

    function clearPreview(context) {
        setTemporaryObject(
            context,
            null
        );

        requestRender(
            context
        );
    }

    function cancelText(context) {
        session =
            null;

        clearPreview(
            context
        );

        return true;
    }

    function resolveCurrentBounds(state) {
        if (
            !session ||
            !state
        ) {
            return null;
        }

        return createTextBoxBounds(
            session.startPoint,
            session.endPoint,
            session.settings,
            state.document
        );
    }

    function renderPreview(context) {
        if (!session) {
            clearPreview(
                context
            );

            return null;
        }

        const state =
            getLatestState(
                context
            );

        if (!state) {
            return null;
        }

        const bounds =
            resolveCurrentBounds(
                state
            );

        if (!bounds) {
            return null;
        }

        session.bounds =
            bounds;

        const previewObject =
            createTextObject({
                id:
                    previewId,

                layerId:
                    session.layerId,

                bounds,

                settings:
                    session.settings,

                pointerType:
                    session.pointerType,

                transient:
                    true
            });

        setTemporaryObject(
            context,
            previewObject
        );

        requestRender(
            context
        );

        return previewObject;
    }

    function startText(
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
            getLatestState(
                context
            );

        const activeLayer =
            getActiveLayer(
                state
            );

        if (
            !state ||
            !canDrawOnLayer(
                activeLayer
            )
        ) {
            return false;
        }

        let startPoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            !startPoint ||
            !isPointInsideDocument(
                startPoint,
                state.document
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        if (
            session
        ) {
            cancelText(
                context
            );
        }

        startPoint =
            snapPointToGrid(
                startPoint,
                state
            );

        startPoint =
            clampPointToDocument(
                startPoint,
                state.document
            );

        session = {
            objectId:
                createId(
                    "text"
                ),

            pointerId:
                getPointerId(
                    context,
                    event
                ),

            pointerType:
                getPointerType(
                    context,
                    event
                ),

            layerId:
                activeLayer.id,

            documentId:
                state.document?.id ||
                null,

            startPoint:
                clonePoint(
                    startPoint
                ),

            endPoint:
                clonePoint(
                    startPoint
                ),

            bounds:
                null,

            settings:
                resolveTextSettings(
                    state,
                    options
                )
        };

        renderPreview(
            context
        );

        return true;
    }

    function updateText(
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
            !session ||
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        const state =
            getLatestState(
                context
            );

        let point =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            !state ||
            !point
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        point =
            snapPointToGrid(
                point,
                state
            );

        session.endPoint =
            clampPointToDocument(
                point,
                state.document
            );

        renderPreview(
            context
        );

        return true;
    }

    function finishText(
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
            !session ||
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        const currentSession =
            session;

        const state =
            getLatestState(
                context
            );

        let releasePoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            state &&
            releasePoint
        ) {
            releasePoint =
                snapPointToGrid(
                    releasePoint,
                    state
                );

            currentSession.endPoint =
                clampPointToDocument(
                    releasePoint,
                    state.document
                );
        }

        const bounds =
            resolveCurrentBounds(
                state
            ) ||
            currentSession.bounds;

        session =
            null;

        clearPreview(
            context
        );

        if (
            !state ||
            !bounds
        ) {
            return true;
        }

        const layer =
            state.layers?.find(
                item =>
                    item.id ===
                    currentSession.layerId
            );

        if (
            !canDrawOnLayer(
                layer
            ) ||
            (
                currentSession.documentId &&
                state.document?.id !==
                    currentSession.documentId
            )
        ) {
            return true;
        }

        const textObject =
            createTextObject({
                id:
                    currentSession.objectId,

                layerId:
                    currentSession.layerId,

                bounds,

                settings:
                    currentSession.settings,

                pointerType:
                    currentSession.pointerType,

                transient:
                    false
            });

        if (!textObject) {
            return true;
        }

        const addObject =
            getAction(
                context,
                "addObject"
            );

        if (!addObject) {
            throw new Error(
                "TextTool requires addObject in the editor context."
            );
        }

        addObject(
            textObject,
            {
                label:
                    historyLabel,

                select:
                    options.selectCreatedText !==
                    false
            }
        );

        if (
            options.switchToSelectAfterCreate ===
            true
        ) {
            getAction(
                context,
                "setActiveTool"
            )?.(
                EDITOR_TOOLS.SELECT
            );
        }

        requestRender(
            context
        );

        return true;
    }

    function cancelPointerText(
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
            session &&
            !pointerMatchesSession(
                session,
                context,
                event
            )
        ) {
            return false;
        }

        return cancelText(
            context
        );
    }

    function cancelInteraction(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        return cancelText(
            context
        );
    }

    function activateTool(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        session =
            null;

        clearPreview(
            context
        );

        return true;
    }

    function deactivateTool(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        return cancelText(
            context
        );
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Text",

        label:
            options.label ||
            "Text",

        description:
            "Click to place text or drag to create a text box.",

        shortcut:
            options.shortcut ||
            "T",

        cursor:
            options.cursor ||
            "text",

        preventDefault:
            true,

        stopPropagation:
            false,

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        onActivate:
            activateTool,

        onDeactivate:
            deactivateTool,

        onPointerDown:
            startText,

        onPointerMove:
            updateText,

        onPointerUp:
            finishText,

        onPointerCancel:
            cancelPointerText,

        onCancel:
            cancelInteraction
    });
}

/*=========================================================
Default Export
=========================================================*/

export const TextTool =
    createTextTool();

export default TextTool;