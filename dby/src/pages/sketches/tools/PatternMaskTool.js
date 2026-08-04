/*
=========================================================
FashionVision Professional Editor
Pattern Mask Tool
Version 1.0
=========================================================

Applies a fabric texture inside closed ShapeObject objects.

Controls:
- Click a closed shape: apply the pending pattern.
- No pending pattern: opens the image picker.
- Shift/Ctrl/Meta + click: apply to clicked and selected shapes.
- Alt + click: remove the pattern and restore the old fill.
- Enter: apply the pending pattern to selected shapes.
- Escape: clear the pending pattern.

ShapeObject.jsx must render fillType === "pattern" by reading
the pattern fields created by this tool.
=========================================================
*/

import {
    defineTool
} from "./ToolManager";

import {
    OBJECT_TYPES
} from "../useFashionEditorStore";

import {
    PATTERN_FILE_ACCEPT,
    PATTERN_REPEAT_MODES,
    SUPPORTED_PATTERN_REPEAT_MODES,
    loadPatternAsset,
    pickPatternFile
} from "./PatternTool";

/*=========================================================
Public Constants
=========================================================*/

export const PATTERN_MASK_TOOL_ID =
    "pattern-mask";

export const PATTERN_MASK_ASSET_READY_EVENT =
    "fashion:pattern-mask-asset-ready";

export const PATTERN_MASK_APPLIED_EVENT =
    "fashion:pattern-mask-applied";

export const PATTERN_MASK_REMOVED_EVENT =
    "fashion:pattern-mask-removed";

export const PATTERN_MASK_IMPORT_ERROR_EVENT =
    "fashion:pattern-mask-import-error";

/*=========================================================
Defaults
=========================================================*/

const DEFAULT_HISTORY_LABEL =
    "Apply pattern to shape";

const DEFAULT_REMOVE_HISTORY_LABEL =
    "Remove pattern from shape";

const DEFAULT_FALLBACK_FILL =
    "#ffffff";

const DEFAULT_MAX_FILE_SIZE =
    25 * 1024 * 1024;

const MIN_PATTERN_SCALE =
    0.02;

const MAX_PATTERN_SCALE =
    50;

/*=========================================================
General Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const numeric =
        Number(value);

    return Number.isFinite(
        numeric
    )
        ? numeric
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

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        !Array.isArray(value)
    );
}

function uniqueStrings(
    values
) {
    return [
        ...new Set(
            (
                Array.isArray(values)
                    ? values
                    : []
            ).filter(
                value =>
                    typeof value ===
                        "string" &&
                    value
            )
        )
    ];
}

function firstString(
    values,
    fallback = ""
) {
    return (
        values.find(
            value =>
                typeof value ===
                    "string" &&
                value.trim()
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

function nowIso() {
    return new Date()
        .toISOString();
}

function createToolError(
    message,
    code =
        "PATTERN_MASK_ERROR",
    details =
        null
) {
    const error =
        new Error(message);

    error.code =
        code;

    error.details =
        details;

    return error;
}

/*=========================================================
Context and Event Helpers
=========================================================*/

function getNativeEvent(
    event
) {
    return (
        event?.evt ||
        event?.nativeEvent ||
        event ||
        null
    );
}

function isContextLike(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        (
            value.manager ||
            value.stage ||
            value.state ||
            value.editorState ||
            value.actions ||
            value.store ||
            value.screenPoint ||
            value.documentPoint
        )
    );
}

function resolveArguments(
    firstArgument,
    secondArgument
) {
    return isContextLike(
        firstArgument
    )
        ? {
            context:
                firstArgument,

            event:
                secondArgument
        }
        : {
            context:
                secondArgument,

            event:
                firstArgument
        };
}

function safelyPreventDefault(
    event
) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        !nativeEvent ||
        typeof nativeEvent
            .preventDefault !==
            "function" ||
        nativeEvent.cancelable ===
            false ||
        nativeEvent.defaultPrevented ===
            true
    ) {
        return false;
    }

    nativeEvent
        .preventDefault();

    return true;
}

function safelyStopPropagation(
    event
) {
    if (event) {
        event.cancelBubble =
            true;
    }

    getNativeEvent(event)
        ?.stopPropagation
        ?.();
}

function isPrimaryPointer(
    context,
    event
) {
    const nativeEvent =
        getNativeEvent(event);

    if (
        nativeEvent?.isPrimary ===
        false
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

function getState(
    context
) {
    if (
        typeof context?.store?.getState ===
        "function"
    ) {
        return context.store
            .getState();
    }

    return (
        context?.state ||
        context?.editorState ||
        context?.actions ||
        null
    );
}

function getAction(
    context,
    actionName
) {
    const sources = [
        context?.actions,
        context?.state,
        context?.editorState,
        getState(context),
        context
    ];

    for (const source of sources) {
        if (
            typeof source?.[actionName] ===
            "function"
        ) {
            return source[
                actionName
            ];
        }
    }

    return null;
}

function requestRender(
    context
) {
    if (
        typeof context?.requestRender ===
        "function"
    ) {
        context.requestRender();
        return;
    }

    context?.stage
        ?.batchDraw
        ?.();
}

function emitStageEvent(
    context,
    eventName,
    payload
) {
    context?.stage
        ?.fire?.(
            eventName,
            payload,
            true
        );
}

/*=========================================================
Konva Target Resolution
=========================================================*/

function getNodeAttribute(
    node,
    attributeName
) {
    if (!node) {
        return undefined;
    }

    if (
        typeof node.getAttr ===
        "function"
    ) {
        const value =
            node.getAttr(
                attributeName
            );

        if (
            value !== undefined
        ) {
            return value;
        }
    }

    return node.attrs
        ?.[attributeName];
}

function getParentNode(
    node
) {
    if (
        typeof node?.getParent ===
        "function"
    ) {
        return node.getParent();
    }

    return node?.parent ||
        null;
}

function resolveObjectIdFromNode(
    node
) {
    let currentNode =
        node;

    for (
        let depth = 0;
        currentNode &&
        depth < 50;
        depth += 1
    ) {
        const editorObjectId =
            getNodeAttribute(
                currentNode,
                "editorObjectId"
            );

        if (
            typeof editorObjectId ===
                "string" &&
            editorObjectId
        ) {
            return editorObjectId;
        }

        const objectId =
            getNodeAttribute(
                currentNode,
                "objectId"
            );

        if (
            typeof objectId ===
                "string" &&
            objectId
        ) {
            return objectId;
        }

        if (
            getNodeAttribute(
                currentNode,
                "editorObjectRoot"
            ) ===
                true &&
            typeof currentNode.id ===
                "function"
        ) {
            const nodeId =
                currentNode.id();

            if (
                typeof nodeId ===
                    "string" &&
                nodeId
            ) {
                return nodeId;
            }
        }

        currentNode =
            getParentNode(
                currentNode
            );
    }

    return null;
}

function resolveClickedObjectId(
    event
) {
    return resolveObjectIdFromNode(
        event?.target ||
        event?.currentTarget ||
        null
    );
}

/*=========================================================
Shape Validation
=========================================================*/

function getObjectLayer(
    state,
    object
) {
    return (
        state?.layers?.find(
            layer =>
                layer.id ===
                object?.layerId
        ) ||
        null
    );
}

function isClosedShape(
    object
) {
    return Boolean(
        object &&
        object.type ===
            OBJECT_TYPES.SHAPE &&
        object.closed !==
            false
    );
}

function canEditShape(
    state,
    object
) {
    if (
        !isClosedShape(object)
    ) {
        return false;
    }

    const layer =
        getObjectLayer(
            state,
            object
        );

    return Boolean(
        object.visible !==
            false &&
        object.locked !==
            true &&
        layer &&
        layer.visible !==
            false &&
        layer.locked !==
            true
    );
}

function getEditableShapeIds(
    state,
    objectIds
) {
    return uniqueStrings(
        objectIds
    ).filter(
        objectId =>
            canEditShape(
                state,
                state?.objects
                    ?.[objectId]
            )
    );
}

function resolveTargetShapeIds(
    state,
    clickedObjectId,
    event
) {
    const selectedShapeIds =
        getEditableShapeIds(
            state,
            state?.selectedObjectIds
        );

    const clickedObject =
        clickedObjectId
            ? state?.objects
                ?.[clickedObjectId]
            : null;

    const clickedIsEditable =
        canEditShape(
            state,
            clickedObject
        );

    const nativeEvent =
        getNativeEvent(event);

    const additive =
        Boolean(
            nativeEvent?.shiftKey ||
            nativeEvent?.ctrlKey ||
            nativeEvent?.metaKey
        );

    if (
        clickedIsEditable &&
        additive
    ) {
        return uniqueStrings([
            ...selectedShapeIds,
            clickedObjectId
        ]);
    }

    if (clickedIsEditable) {
        return [
            clickedObjectId
        ];
    }

    return selectedShapeIds;
}

/*=========================================================
Pattern Settings
=========================================================*/

function normalizeRepeatMode(
    value
) {
    return SUPPORTED_PATTERN_REPEAT_MODES
        .includes(value)
        ? value
        : PATTERN_REPEAT_MODES
            .REPEAT;
}

export function resolvePatternMaskSettings(
    state,
    options = {}
) {
    const patternSettings =
        isPlainObject(
            state?.pattern
        )
            ? state.pattern
            : {};

    const patternMaskSettings =
        isPlainObject(
            state?.patternMask
        )
            ? state.patternMask
            : {};

    const suppliedSettings =
        isPlainObject(
            options.settings
        )
            ? options.settings
            : {};

    const settings = {
        ...patternSettings,
        ...patternMaskSettings,
        ...suppliedSettings
    };

    const scale =
        clamp(
            options.scale ??
            settings.scale ??
            settings.patternScale ??
            1,
            MIN_PATTERN_SCALE,
            MAX_PATTERN_SCALE
        );

    return {
        repeat:
            normalizeRepeatMode(
                options.repeat ??
                settings.repeat ??
                settings.repeatMode ??
                settings.patternRepeat ??
                PATTERN_REPEAT_MODES
                    .REPEAT
            ),

        scale,

        scaleX:
            clamp(
                options.scaleX ??
                settings.scaleX ??
                settings.patternScaleX ??
                scale,
                MIN_PATTERN_SCALE,
                MAX_PATTERN_SCALE
            ),

        scaleY:
            clamp(
                options.scaleY ??
                settings.scaleY ??
                settings.patternScaleY ??
                scale,
                MIN_PATTERN_SCALE,
                MAX_PATTERN_SCALE
            ),

        rotation:
            normalizeDegrees(
                options.rotation ??
                settings.rotation ??
                settings.patternRotation ??
                0
            ),

        opacity:
            clamp(
                options.opacity ??
                settings.opacity ??
                settings.patternOpacity ??
                1,
                0,
                1
            ),

        offsetX:
            numberOr(
                options.offsetX ??
                settings.offsetX ??
                settings.patternOffsetX,
                0
            ),

        offsetY:
            numberOr(
                options.offsetY ??
                settings.offsetY ??
                settings.patternOffsetY,
                0
            ),

        imageSmoothingEnabled:
            (
                options
                    .imageSmoothingEnabled ??
                settings
                    .imageSmoothingEnabled ??
                true
            ) !==
                false,

        background:
            firstString(
                [
                    options.background,
                    settings.background,
                    settings.patternBackground
                ],
                "transparent"
            )
    };
}

/*=========================================================
Previous Fill Snapshot
=========================================================*/

function resolveFillType(
    object
) {
    const fillType =
        object?.fillType ||
        object?.style?.fillType;

    if (
        [
            "none",
            "solid",
            "pattern"
        ].includes(fillType)
    ) {
        return fillType;
    }

    return (
        object?.fill ===
            "transparent" ||
        object?.style?.fill ===
            "transparent"
    )
        ? "none"
        : "solid";
}

function getPreviousFill(
    object
) {
    const savedPreviousFill =
        object?.metadata
            ?.patternMask
            ?.previousFill;

    if (
        resolveFillType(object) ===
            "pattern" &&
        isPlainObject(
            savedPreviousFill
        )
    ) {
        return {
            ...savedPreviousFill
        };
    }

    const fillType =
        resolveFillType(object);

    return {
        fillType,

        fill:
            object?.fill ??
            object?.style?.fill ??
            (
                fillType ===
                    "none"
                    ? "transparent"
                    : DEFAULT_FALLBACK_FILL
            ),

        fillOpacity:
            clamp(
                object?.fillOpacity ??
                object?.style?.fillOpacity ??
                (
                    fillType ===
                        "none"
                        ? 0
                        : 1
                ),
                0,
                1
            )
    };
}

function resolveFallbackFill(
    previousFill,
    background
) {
    if (
        previousFill.fillType ===
            "solid" &&
        typeof previousFill.fill ===
            "string" &&
        previousFill.fill !==
            "transparent"
    ) {
        return previousFill.fill;
    }

    if (
        background !==
        "transparent"
    ) {
        return background;
    }

    return DEFAULT_FALLBACK_FILL;
}

/*=========================================================
Apply and Remove Update Builders
=========================================================*/

export function createPatternMaskUpdates(
    object,
    asset,
    settings
) {
    if (
        !isClosedShape(object)
    ) {
        throw createToolError(
            "Pattern masks can only be applied to closed shape objects.",
            "PATTERN_MASK_INVALID_SHAPE"
        );
    }

    if (
        !asset ||
        typeof asset.dataUrl !==
            "string" ||
        !asset.dataUrl
    ) {
        throw createToolError(
            "A valid pattern asset is required.",
            "PATTERN_MASK_INVALID_ASSET"
        );
    }

    const previousFill =
        getPreviousFill(object);

    const repeat =
        normalizeRepeatMode(
            settings?.repeat
        );

    const scale =
        clamp(
            settings?.scale ??
            1,
            MIN_PATTERN_SCALE,
            MAX_PATTERN_SCALE
        );

    const scaleX =
        clamp(
            settings?.scaleX ??
            scale,
            MIN_PATTERN_SCALE,
            MAX_PATTERN_SCALE
        );

    const scaleY =
        clamp(
            settings?.scaleY ??
            scale,
            MIN_PATTERN_SCALE,
            MAX_PATTERN_SCALE
        );

    const rotation =
        normalizeDegrees(
            settings?.rotation
        );

    const opacity =
        clamp(
            settings?.opacity ??
            1,
            0,
            1
        );

    const offsetX =
        numberOr(
            settings?.offsetX,
            0
        );

    const offsetY =
        numberOr(
            settings?.offsetY,
            0
        );

    const background =
        firstString(
            [
                settings?.background
            ],
            "transparent"
        );

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                asset.naturalWidth,
                128
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                asset.naturalHeight,
                128
            )
        );

    const source =
        asset.dataUrl;

    const timestamp =
        nowIso();

    const patternFields = {
        fillType:
            "pattern",

        fill:
            resolveFallbackFill(
                previousFill,
                background
            ),

        fillOpacity:
            opacity,

        fillPatternSource:
            source,

        patternSource:
            source,

        patternAssetId:
            asset.id ||
            null,

        patternFileName:
            asset.fileName ||
            asset.name ||
            "Pattern",

        patternMimeType:
            asset.mimeType ||
            "image/png",

        patternFileSize:
            Math.max(
                0,
                numberOr(
                    asset.fileSize,
                    0
                )
            ),

        patternNaturalWidth:
            naturalWidth,

        patternNaturalHeight:
            naturalHeight,

        patternRepeat:
            repeat,

        repeat,

        repeatMode:
            repeat,

        patternScale:
            scale,

        patternScaleX:
            scaleX,

        patternScaleY:
            scaleY,

        patternRotation:
            rotation,

        patternOpacity:
            opacity,

        patternOffsetX:
            offsetX,

        patternOffsetY:
            offsetY,

        tileWidth:
            naturalWidth *
            scaleX,

        tileHeight:
            naturalHeight *
            scaleY,

        imageSmoothingEnabled:
            settings
                ?.imageSmoothingEnabled !==
            false,

        patternBackground:
            background
    };

    return {
        ...patternFields,

        style: {
            ...(
                object.style ||
                {}
            ),

            ...patternFields
        },

        metadata: {
            ...(
                object.metadata ||
                {}
            ),

            patternMask: {
                ...(
                    object.metadata
                        ?.patternMask ||
                    {}
                ),

                active:
                    true,

                tool:
                    PATTERN_MASK_TOOL_ID,

                sourceAssetId:
                    asset.id ||
                    null,

                sourceFileName:
                    asset.fileName ||
                    asset.name ||
                    null,

                sourceMimeType:
                    asset.mimeType ||
                    null,

                sourceWidth:
                    naturalWidth,

                sourceHeight:
                    naturalHeight,

                previousFill,

                appliedAt:
                    timestamp
            }
        },

        updatedAt:
            timestamp
    };
}

export function createPatternMaskRemovalUpdates(
    object,
    {
        restorePreviousFill =
            true
    } = {}
) {
    if (
        !isClosedShape(object)
    ) {
        throw createToolError(
            "Pattern masks can only be removed from closed shape objects.",
            "PATTERN_MASK_INVALID_SHAPE"
        );
    }

    const previousFill =
        object?.metadata
            ?.patternMask
            ?.previousFill;

    const restoredFill =
        restorePreviousFill &&
        isPlainObject(previousFill)
            ? {
                fillType:
                    previousFill
                        .fillType ===
                        "none"
                        ? "none"
                        : "solid",

                fill:
                    previousFill
                        .fillType ===
                        "none"
                        ? "transparent"
                        : firstString(
                            [
                                previousFill.fill
                            ],
                            DEFAULT_FALLBACK_FILL
                        ),

                fillOpacity:
                    previousFill
                        .fillType ===
                        "none"
                        ? 0
                        : clamp(
                            previousFill
                                .fillOpacity,
                            0,
                            1
                        )
            }
            : {
                fillType:
                    "none",

                fill:
                    "transparent",

                fillOpacity:
                    0
            };

    const clearedPatternFields = {
        fillPatternSource:
            null,

        patternSource:
            null,

        patternAssetId:
            null,

        patternFileName:
            null,

        patternMimeType:
            null,

        patternFileSize:
            0,

        patternNaturalWidth:
            null,

        patternNaturalHeight:
            null,

        patternRepeat:
            null,

        repeat:
            null,

        repeatMode:
            null,

        patternScale:
            null,

        patternScaleX:
            null,

        patternScaleY:
            null,

        patternRotation:
            null,

        patternOpacity:
            null,

        patternOffsetX:
            null,

        patternOffsetY:
            null,

        tileWidth:
            null,

        tileHeight:
            null,

        patternBackground:
            null
    };

    const timestamp =
        nowIso();

    return {
        ...restoredFill,
        ...clearedPatternFields,

        style: {
            ...(
                object.style ||
                {}
            ),

            ...restoredFill,
            ...clearedPatternFields
        },

        metadata: {
            ...(
                object.metadata ||
                {}
            ),

            patternMask: {
                ...(
                    object.metadata
                        ?.patternMask ||
                    {}
                ),

                active:
                    false,

                removedAt:
                    timestamp
            }
        },

        updatedAt:
            timestamp
    };
}

export function hasPatternMask(
    object
) {
    return Boolean(
        isClosedShape(object) &&
        (
            resolveFillType(object) ===
                "pattern" ||
            (
                typeof object
                    ?.fillPatternSource ===
                    "string" &&
                object
                    .fillPatternSource
            ) ||
            (
                typeof object
                    ?.patternSource ===
                    "string" &&
                object
                    .patternSource
            )
        )
    );
}

/*=========================================================
Tool Factory
=========================================================*/

export function createPatternMaskTool(
    options = {}
) {
    const toolId =
        options.id ||
        PATTERN_MASK_TOOL_ID;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    const removeHistoryLabel =
        options.removeHistoryLabel ||
        DEFAULT_REMOVE_HISTORY_LABEL;

    let pendingAsset =
        null;

    let loadingPromise =
        null;

    let destroyed =
        false;

    function emitError(
        context,
        error,
        details = {}
    ) {
        emitStageEvent(
            context,
            PATTERN_MASK_IMPORT_ERROR_EVENT,
            {
                error,
                ...details
            }
        );

        options.onError?.(
            error,
            details,
            context
        );
    }

    async function queueAsset(
        asset,
        context = null
    ) {
        if (
            !asset ||
            typeof asset.dataUrl !==
                "string" ||
            !asset.dataUrl
        ) {
            throw createToolError(
                "A valid pattern asset is required.",
                "PATTERN_MASK_INVALID_ASSET"
            );
        }

        pendingAsset =
            asset;

        if (context) {
            emitStageEvent(
                context,
                PATTERN_MASK_ASSET_READY_EVENT,
                {
                    asset
                }
            );

            requestRender(
                context
            );
        }

        options.onAssetReady?.(
            asset,
            context
        );

        return asset;
    }

    async function queueFile(
        file,
        context = null
    ) {
        if (destroyed) {
            destroyed =
                false;
        }

        if (loadingPromise) {
            return loadingPromise;
        }

        options.onImportStart?.(
            file,
            context
        );

        loadingPromise =
            loadPatternAsset(
                file,
                {
                    maximumFileSize:
                        options.maximumFileSize ??
                        DEFAULT_MAX_FILE_SIZE
                }
            );

        try {
            const asset =
                await loadingPromise;

            await queueAsset(
                asset,
                context
            );

            return asset;
        } catch (error) {
            emitError(
                context,
                error,
                {
                    file,
                    operation:
                        "import"
                }
            );

            throw error;
        } finally {
            loadingPromise =
                null;
        }
    }

    async function pickAndQueue(
        context = null,
        pickerOptions = {}
    ) {
        if (loadingPromise) {
            return loadingPromise;
        }

        const picker =
            typeof options.pickFile ===
                "function"
                ? options.pickFile
                : pickPatternFile;

        const file =
            await picker({
                accept:
                    options.accept ||
                    PATTERN_FILE_ACCEPT,

                capture:
                    options.capture ??
                    null,

                ...pickerOptions
            });

        if (!file) {
            options.onImportCancel?.(
                context
            );

            return null;
        }

        return queueFile(
            file,
            context
        );
    }

    function selectObjects(
        context,
        objectIds
    ) {
        if (
            options.selectAppliedShapes ===
            false
        ) {
            return;
        }

        getAction(
            context,
            "selectObjects"
        )?.(
            objectIds
        );
    }

    function activateObjectLayer(
        context,
        state,
        objectIds
    ) {
        const firstObject =
            state?.objects
                ?.[objectIds[0]];

        if (
            !firstObject?.layerId ||
            state.activeLayerId ===
                firstObject.layerId
        ) {
            return;
        }

        getAction(
            context,
            "setActiveLayer"
        )?.(
            firstObject.layerId,
            {
                clearSelection:
                    false
            }
        );
    }

    function updateShapes(
        context,
        state,
        objectIds,
        createUpdates,
        label
    ) {
        const editableIds =
            getEditableShapeIds(
                state,
                objectIds
            );

        if (
            editableIds.length ===
            0
        ) {
            return [];
        }

        const updateObjects =
            getAction(
                context,
                "updateObjects"
            );

        if (
            typeof updateObjects ===
            "function"
        ) {
            updateObjects(
                editableIds,
                currentObject =>
                    createUpdates(
                        currentObject
                    ),
                label
            );

            return editableIds;
        }

        const updateObject =
            getAction(
                context,
                "updateObject"
            );

        if (!updateObject) {
            throw createToolError(
                "PatternMaskTool requires updateObject or updateObjects.",
                "PATTERN_MASK_UPDATE_ACTION_MISSING"
            );
        }

        const beginTransaction =
            getAction(
                context,
                "beginHistoryTransaction"
            );

        const commitTransaction =
            getAction(
                context,
                "commitHistoryTransaction"
            );

        const cancelTransaction =
            getAction(
                context,
                "cancelHistoryTransaction"
            );

        const useTransaction =
            editableIds.length >
                1 &&
            typeof beginTransaction ===
                "function" &&
            typeof commitTransaction ===
                "function";

        if (useTransaction) {
            beginTransaction(
                label
            );
        }

        try {
            editableIds.forEach(
                objectId => {
                    const latestObject =
                        getState(
                            context
                        )?.objects
                            ?.[objectId] ||
                        state.objects[
                            objectId
                        ];

                    if (!latestObject) {
                        return;
                    }

                    updateObject(
                        objectId,
                        createUpdates(
                            latestObject
                        ),
                        label
                    );
                }
            );

            if (useTransaction) {
                commitTransaction();
            }

            return editableIds;
        } catch (error) {
            if (
                useTransaction &&
                typeof cancelTransaction ===
                    "function"
            ) {
                cancelTransaction();
            }

            throw error;
        }
    }

    function applyAssetToShapes(
        context,
        asset,
        objectIds,
        applyOptions = {}
    ) {
        const state =
            getState(
                context
            );

        if (!state) {
            return [];
        }

        const settings =
            resolvePatternMaskSettings(
                state,
                {
                    ...options,
                    ...applyOptions,

                    settings: {
                        ...(
                            options.settings ||
                            {}
                        ),

                        ...(
                            applyOptions.settings ||
                            {}
                        )
                    }
                }
            );

        const appliedIds =
            updateShapes(
                context,
                state,
                objectIds,
                currentObject =>
                    createPatternMaskUpdates(
                        currentObject,
                        asset,
                        settings
                    ),
                applyOptions.historyLabel ||
                historyLabel
            );

        if (
            appliedIds.length ===
            0
        ) {
            return [];
        }

        activateObjectLayer(
            context,
            state,
            appliedIds
        );

        if (
            applyOptions.select !==
            false
        ) {
            selectObjects(
                context,
                appliedIds
            );
        }

        requestRender(
            context
        );

        emitStageEvent(
            context,
            PATTERN_MASK_APPLIED_EVENT,
            {
                asset,
                objectIds:
                    appliedIds,
                settings
            }
        );

        options.onApplied?.(
            {
                asset,
                objectIds:
                    appliedIds,
                settings
            },
            context
        );

        const keepAsset =
            applyOptions.keepAsset ??
            (
                options.keepAssetAfterApply !==
                false
            );

        if (!keepAsset) {
            pendingAsset =
                null;
        }

        return appliedIds;
    }

    function applyPendingToShapes(
        context,
        objectIds,
        applyOptions = {}
    ) {
        if (!pendingAsset) {
            return [];
        }

        return applyAssetToShapes(
            context,
            pendingAsset,
            objectIds,
            applyOptions
        );
    }

    function applyAssetToSelection(
        context,
        asset,
        applyOptions = {}
    ) {
        const state =
            getState(
                context
            );

        return applyAssetToShapes(
            context,
            asset,
            state?.selectedObjectIds ||
                [],
            applyOptions
        );
    }

    function applyPendingToSelection(
        context,
        applyOptions = {}
    ) {
        const state =
            getState(
                context
            );

        return applyPendingToShapes(
            context,
            state?.selectedObjectIds ||
                [],
            applyOptions
        );
    }

    function applyAssetToObject(
        context,
        asset,
        objectId,
        applyOptions = {}
    ) {
        return applyAssetToShapes(
            context,
            asset,
            [
                objectId
            ],
            applyOptions
        );
    }

    function removeFromShapes(
        context,
        objectIds,
        removeOptions = {}
    ) {
        const state =
            getState(
                context
            );

        if (!state) {
            return [];
        }

        const maskedShapeIds =
            getEditableShapeIds(
                state,
                objectIds
            ).filter(
                objectId =>
                    hasPatternMask(
                        state.objects[
                            objectId
                        ]
                    )
            );

        const removedIds =
            updateShapes(
                context,
                state,
                maskedShapeIds,
                currentObject =>
                    createPatternMaskRemovalUpdates(
                        currentObject,
                        {
                            restorePreviousFill:
                                removeOptions
                                    .restorePreviousFill !==
                                false
                        }
                    ),
                removeOptions.historyLabel ||
                removeHistoryLabel
            );

        if (
            removedIds.length ===
            0
        ) {
            return [];
        }

        activateObjectLayer(
            context,
            state,
            removedIds
        );

        if (
            removeOptions.select !==
            false
        ) {
            selectObjects(
                context,
                removedIds
            );
        }

        requestRender(
            context
        );

        emitStageEvent(
            context,
            PATTERN_MASK_REMOVED_EVENT,
            {
                objectIds:
                    removedIds
            }
        );

        options.onRemoved?.(
            {
                objectIds:
                    removedIds
            },
            context
        );

        return removedIds;
    }

    function removeFromSelection(
        context,
        removeOptions = {}
    ) {
        const state =
            getState(
                context
            );

        return removeFromShapes(
            context,
            state?.selectedObjectIds ||
                [],
            removeOptions
        );
    }

    function removeFromObject(
        context,
        objectId,
        removeOptions = {}
    ) {
        return removeFromShapes(
            context,
            [
                objectId
            ],
            removeOptions
        );
    }

    async function handlePointerDown(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveArguments(
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
            getState(
                context
            );

        if (!state) {
            return false;
        }

        const clickedObjectId =
            resolveClickedObjectId(
                event
            );

        const targetIds =
            resolveTargetShapeIds(
                state,
                clickedObjectId,
                event
            );

        if (
            targetIds.length ===
            0
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        safelyStopPropagation(
            event
        );

        const nativeEvent =
            getNativeEvent(
                event
            );

        if (
            context?.altKey ||
            nativeEvent?.altKey
        ) {
            removeFromShapes(
                context,
                targetIds
            );

            return true;
        }

        let asset =
            pendingAsset;

        if (!asset) {
            if (
                options.openFilePickerOnShapeClick ===
                false
            ) {
                return false;
            }

            asset =
                await pickAndQueue(
                    context
                );

            if (!asset) {
                return true;
            }
        }

        applyAssetToShapes(
            context,
            asset,
            targetIds
        );

        return true;
    }

    function handleKeyDown(
        firstArgument,
        secondArgument
    ) {
        const {
            context,
            event
        } =
            resolveArguments(
                firstArgument,
                secondArgument
            );

        const nativeEvent =
            getNativeEvent(
                event
            );

        const key =
            typeof nativeEvent?.key ===
                "string"
                ? nativeEvent.key
                    .toLowerCase()
                : "";

        if (
            key === "enter" &&
            pendingAsset
        ) {
            safelyPreventDefault(
                event
            );

            applyPendingToSelection(
                context
            );

            return true;
        }

        if (
            key === "escape"
        ) {
            safelyPreventDefault(
                event
            );

            pendingAsset =
                null;

            requestRender(
                context
            );

            return true;
        }

        return false;
    }

    function handleActivate(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveArguments(
                firstArgument,
                secondArgument
            );

        destroyed =
            false;

        if (
            options.openFilePickerOnActivate ===
                true &&
            !pendingAsset
        ) {
            pickAndQueue(
                context
            ).catch(
                error => {
                    emitError(
                        context,
                        error,
                        {
                            operation:
                                "activate"
                        }
                    );
                }
            );
        }

        return true;
    }

    function handleDeactivate(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveArguments(
                firstArgument,
                secondArgument
            );

        if (
            options.preservePendingAssetOnDeactivate !==
            true
        ) {
            pendingAsset =
                null;
        }

        requestRender(
            context
        );

        return true;
    }

    function clearPending(
        context
    ) {
        pendingAsset =
            null;

        requestRender(
            context
        );

        return true;
    }

    function handleDestroy(
        firstArgument,
        secondArgument
    ) {
        const {
            context
        } =
            resolveArguments(
                firstArgument,
                secondArgument
            );

        destroyed =
            true;

        pendingAsset =
            null;

        loadingPromise =
            null;

        requestRender(
            context
        );

        return true;
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Pattern Mask",

        label:
            options.label ||
            "Pattern Mask",

        description:
            "Apply a repeating fabric texture inside closed shapes. Alt-click removes it.",

        shortcut:
            options.shortcut ||
            "M",

        cursor:
            () =>
                pendingAsset
                    ? "cell"
                    : "copy",

        preventDefault:
            true,

        stopPropagation:
            true,

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        onActivate:
            handleActivate,

        onDeactivate:
            handleDeactivate,

        onPointerDown:
            handlePointerDown,

        onPointerUp:
            () =>
                true,

        onPointerCancel:
            () =>
                true,

        onCancel:
            (
                firstArgument,
                secondArgument
            ) => {
                const {
                    context
                } =
                    resolveArguments(
                        firstArgument,
                        secondArgument
                    );

                return clearPending(
                    context
                );
            },

        onKeyDown:
            handleKeyDown,

        onDestroy:
            handleDestroy,

        queueAsset,

        queueFile,

        pickAndQueue,

        applyAssetToShapes,

        applyAssetToSelection,

        applyAssetToObject,

        applyPendingToShapes,

        applyPendingToSelection,

        removeFromShapes,

        removeFromSelection,

        removeFromObject,

        clearPending,

        getPendingAsset:
            () =>
                pendingAsset,

        hasPendingAsset:
            () =>
                Boolean(
                    pendingAsset
                ),

        isLoading:
            () =>
                Boolean(
                    loadingPromise
                )
    });
}

/*=========================================================
Default Tool
=========================================================*/

export const PatternMaskTool =
    createPatternMaskTool();

export default PatternMaskTool;