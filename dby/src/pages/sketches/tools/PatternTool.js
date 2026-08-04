/*
=========================================================
FashionVision Professional Editor
Pattern Tool
Version 1.0
=========================================================
*/

import { defineTool } from "./ToolManager";
import {
    EDITOR_TOOLS,
    OBJECT_TYPES
} from "../useFashionEditorStore";

/*=========================================================
Public Constants
=========================================================*/

export const PATTERN_REPEAT_MODES =
    Object.freeze({
        REPEAT: "repeat",
        REPEAT_X: "repeat-x",
        REPEAT_Y: "repeat-y",
        NO_REPEAT: "no-repeat"
    });

export const SUPPORTED_PATTERN_REPEAT_MODES =
    Object.freeze(
        Object.values(
            PATTERN_REPEAT_MODES
        )
    );

export const SUPPORTED_PATTERN_MIME_TYPES =
    Object.freeze([
        "image/png",
        "image/jpeg",
        "image/webp"
    ]);

export const SUPPORTED_PATTERN_EXTENSIONS =
    Object.freeze([
        ".png",
        ".jpg",
        ".jpeg",
        ".webp"
    ]);

export const PATTERN_FILE_ACCEPT = [
    ...SUPPORTED_PATTERN_MIME_TYPES,
    ...SUPPORTED_PATTERN_EXTENSIONS
].join(",");

export const PATTERN_ASSET_READY_EVENT =
    "fashion:pattern-asset-ready";

export const PATTERN_IMPORT_ERROR_EVENT =
    "fashion:pattern-import-error";

export const PATTERN_PLACED_EVENT =
    "fashion:pattern-placed";

/*=========================================================
Defaults
=========================================================*/

const DEFAULT_PREVIEW_ID =
    "__fashion-pattern-preview__";

const DEFAULT_HISTORY_LABEL =
    "Create pattern";

const DEFAULT_PATTERN_NAME =
    "Imported pattern";

const DEFAULT_DOCUMENT_WIDTH =
    1200;

const DEFAULT_DOCUMENT_HEIGHT =
    1600;

const DEFAULT_TILE_WIDTH =
    128;

const DEFAULT_TILE_HEIGHT =
    128;

const DEFAULT_CLICK_SIZE =
    360;

const DEFAULT_MAX_FILE_SIZE =
    25 * 1024 * 1024;

const MINIMUM_PATTERN_SIZE =
    2;

const MINIMUM_PATTERN_SCALE =
    0.02;

const MAXIMUM_PATTERN_SCALE =
    50;

const MAXIMUM_PATTERN_DIMENSION =
    100000;

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

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        !Array.isArray(
            value
        )
    );
}

function isFinitePoint(
    point
) {
    return Boolean(
        point &&
        Number.isFinite(
            Number(
                point.x
            )
        ) &&
        Number.isFinite(
            Number(
                point.y
            )
        )
    );
}

function clonePoint(
    point
) {
    if (
        !isFinitePoint(
            point
        )
    ) {
        return null;
    }

    return {
        x:
            Number(
                point.x
            ),

        y:
            Number(
                point.y
            )
    };
}

function createId(
    prefix = "pattern"
) {
    if (
        typeof globalThis
            .crypto
            ?.randomUUID ===
        "function"
    ) {
        return (
            `${prefix}-` +
            globalThis
                .crypto
                .randomUUID()
        );
    }

    return (
        `${prefix}-` +
        `${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

function nowIso() {
    return new Date()
        .toISOString();
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

function createPatternError(
    message,
    code = "PATTERN_ERROR",
    details = null
) {
    const error =
        new Error(
            message
        );

    error.code =
        code;

    error.details =
        details;

    return error;
}

/*=========================================================
Event and Context Helpers
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
            value.documentPoint ||
            value.point ||
            value.toDocumentPoint
        )
    );
}

function resolveHandlerArguments(
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
        getNativeEvent(
            event
        );

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
    const nativeEvent =
        getNativeEvent(
            event
        );

    nativeEvent
        ?.stopPropagation
        ?.();

    if (event) {
        event.cancelBubble =
            true;
    }
}

function getLatestState(
    context
) {
    if (
        typeof context
            ?.store
            ?.getState ===
        "function"
    ) {
        return context
            .store
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
        getLatestState(
            context
        ),
        context
    ];

    for (
        const source
        of sources
    ) {
        if (
            typeof source
                ?.[actionName] ===
            "function"
        ) {
            return source[
                actionName
            ];
        }
    }

    return null;
}

function getActiveLayer(
    state
) {
    return (
        state?.layers
            ?.find(
                layer =>
                    layer.id ===
                    state.activeLayerId
            ) ||
        null
    );
}

function canUseLayer(
    layer
) {
    return Boolean(
        layer &&
        layer.visible !==
            false &&
        layer.locked !==
            true
    );
}

function setTemporaryObject(
    context,
    object
) {
    if (
        typeof context
            ?.setTemporaryObject !==
        "function"
    ) {
        return false;
    }

    context
        .setTemporaryObject(
            object ||
            null
        );

    return true;
}

function requestRender(
    context
) {
    if (
        typeof context
            ?.requestRender ===
        "function"
    ) {
        context
            .requestRender();

        return;
    }

    context?.stage
        ?.batchDraw
        ?.();
}

function fireStageEvent(
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
Pointer Helpers
=========================================================*/

function getPointerId(
    context,
    event
) {
    const contextPointerId =
        Number(
            context?.pointerId
        );

    if (
        Number.isFinite(
            contextPointerId
        )
    ) {
        return contextPointerId;
    }

    const nativeEvent =
        getNativeEvent(
            event
        );

    const pointerId =
        Number(
            nativeEvent?.pointerId
        );

    if (
        Number.isFinite(
            pointerId
        )
    ) {
        return pointerId;
    }

    const touchIdentifier =
        Number(
            nativeEvent
                ?.changedTouches
                ?.[0]
                ?.identifier ??
            nativeEvent
                ?.touches
                ?.[0]
                ?.identifier
        );

    return Number.isFinite(
        touchIdentifier
    )
        ? touchIdentifier
        : null;
}

function getPointerType(
    context,
    event
) {
    if (
        typeof context
            ?.pointerType ===
            "string" &&
        context.pointerType
    ) {
        return context
            .pointerType;
    }

    const nativeEvent =
        getNativeEvent(
            event
        );

    if (
        typeof nativeEvent
            ?.pointerType ===
            "string" &&
        nativeEvent.pointerType
    ) {
        return nativeEvent
            .pointerType;
    }

    return (
        nativeEvent?.touches ||
        nativeEvent
            ?.changedTouches
    )
        ? "touch"
        : "mouse";
}

function isPrimaryPointer(
    context,
    event
) {
    const nativeEvent =
        getNativeEvent(
            event
        );

    if (
        nativeEvent
            ?.isPrimary ===
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
        !Number.isFinite(
            button
        ) ||
        button ===
            0
    );
}

function pointerMatches(
    interaction,
    context,
    event
) {
    if (!interaction) {
        return false;
    }

    const pointerId =
        getPointerId(
            context,
            event
        );

    return (
        interaction.pointerId ===
            null ||
        pointerId ===
            null ||
        interaction.pointerId ===
            pointerId
    );
}

function getScreenPoint(
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
        getNativeEvent(
            event
        );

    const touch =
        nativeEvent
            ?.changedTouches?.[0] ||
        nativeEvent
            ?.touches?.[0] ||
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
        context?.stage
            ?.container?.();

    const rectangle =
        container
            ?.getBoundingClientRect
            ?.();

    if (
        rectangle &&
        Number.isFinite(
            clientX
        ) &&
        Number.isFinite(
            clientY
        )
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
        context?.stage
            ?.getPointerPosition
            ?.()
    );
}

function screenToDocumentPoint(
    screenPoint,
    context,
    state
) {
    if (
        !isFinitePoint(
            screenPoint
        )
    ) {
        return null;
    }

    if (
        typeof context
            ?.toDocumentPoint ===
        "function"
    ) {
        const converted =
            context
                .toDocumentPoint(
                    screenPoint
                );

        if (
            isFinitePoint(
                converted
            )
        ) {
            return clonePoint(
                converted
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
            context
                ?.documentPoint
        )
    ) {
        return clonePoint(
            context
                .documentPoint
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
        getScreenPoint(
            context,
            event
        ),
        context,
        state
    );
}

/*=========================================================
Document Geometry
=========================================================*/

function getDocumentSize(
    documentData
) {
    return {
        width:
            Math.max(
                1,
                numberOr(
                    documentData
                        ?.width,
                    DEFAULT_DOCUMENT_WIDTH
                )
            ),

        height:
            Math.max(
                1,
                numberOr(
                    documentData
                        ?.height,
                    DEFAULT_DOCUMENT_HEIGHT
                )
            )
    };
}

function isPointInsideDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(
            point
        )
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
        point.x >=
            0 &&
        point.y >=
            0 &&
        point.x <=
            width &&
        point.y <=
            height
    );
}

function clampPointToDocument(
    point,
    documentData
) {
    if (
        !isFinitePoint(
            point
        )
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
        !isFinitePoint(
            point
        ) ||
        state?.ui
            ?.snapToGrid !==
        true
    ) {
        return clonePoint(
            point
        );
    }

    const gridSize =
        Math.max(
            1,
            numberOr(
                state.ui
                    .gridSize,
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

function getDocumentCenter(
    documentData
) {
    const {
        width,
        height
    } =
        getDocumentSize(
            documentData
        );

    return {
        x:
            width /
            2,

        y:
            height /
            2
    };
}

function createBoundsFromPoints(
    startPoint,
    endPoint,
    {
        drawFromCenter =
            false,

        constrainSquare =
            false,

        documentData =
            null
    } = {}
) {
    if (
        !isFinitePoint(
            startPoint
        ) ||
        !isFinitePoint(
            endPoint
        )
    ) {
        return null;
    }

    let deltaX =
        endPoint.x -
        startPoint.x;

    let deltaY =
        endPoint.y -
        startPoint.y;

    if (
        constrainSquare
    ) {
        const size =
            Math.max(
                Math.abs(
                    deltaX
                ),
                Math.abs(
                    deltaY
                )
            );

        deltaX =
            (
                deltaX <
                0
                    ? -1
                    : 1
            ) *
            size;

        deltaY =
            (
                deltaY <
                0
                    ? -1
                    : 1
            ) *
            size;
    }

    let x;
    let y;
    let width;
    let height;

    if (
        drawFromCenter
    ) {
        x =
            startPoint.x -
            Math.abs(
                deltaX
            );

        y =
            startPoint.y -
            Math.abs(
                deltaY
            );

        width =
            Math.abs(
                deltaX
            ) *
            2;

        height =
            Math.abs(
                deltaY
            ) *
            2;
    } else {
        x =
            Math.min(
                startPoint.x,
                startPoint.x +
                deltaX
            );

        y =
            Math.min(
                startPoint.y,
                startPoint.y +
                deltaY
            );

        width =
            Math.abs(
                deltaX
            );

        height =
            Math.abs(
                deltaY
            );
    }

    const documentSize =
        getDocumentSize(
            documentData
        );

    const left =
        clamp(
            x,
            0,
            documentSize.width
        );

    const top =
        clamp(
            y,
            0,
            documentSize.height
        );

    const right =
        clamp(
            x +
            width,
            0,
            documentSize.width
        );

    const bottom =
        clamp(
            y +
            height,
            0,
            documentSize.height
        );

    return {
        x:
            Math.min(
                left,
                right
            ),

        y:
            Math.min(
                top,
                bottom
            ),

        width:
            Math.abs(
                right -
                left
            ),

        height:
            Math.abs(
                bottom -
                top
            )
    };
}

function createDefaultBounds(
    point,
    documentData,
    asset,
    options = {}
) {
    const documentSize =
        getDocumentSize(
            documentData
        );

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                asset?.naturalWidth,
                DEFAULT_TILE_WIDTH
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                asset?.naturalHeight,
                DEFAULT_TILE_HEIGHT
            )
        );

    const requestedSize =
        Math.max(
            MINIMUM_PATTERN_SIZE,
            numberOr(
                options
                    .defaultClickSize,
                DEFAULT_CLICK_SIZE
            )
        );

    const ratio =
        naturalWidth /
        naturalHeight;

    let width =
        requestedSize;

    let height =
        requestedSize;

    if (
        options
            .defaultClickSquare !==
        true
    ) {
        if (
            ratio >=
            1
        ) {
            height =
                requestedSize /
                ratio;
        } else {
            width =
                requestedSize *
                ratio;
        }
    }

    width =
        Math.min(
            width,
            documentSize.width
        );

    height =
        Math.min(
            height,
            documentSize.height
        );

    const center =
        isFinitePoint(
            point
        )
            ? point
            : getDocumentCenter(
                documentData
            );

    return {
        x:
            clamp(
                center.x -
                width /
                2,
                0,
                Math.max(
                    0,
                    documentSize.width -
                    width
                )
            ),

        y:
            clamp(
                center.y -
                height /
                2,
                0,
                Math.max(
                    0,
                    documentSize.height -
                    height
                )
            ),

        width,
        height
    };
}

/*=========================================================
File Loading
=========================================================*/

function getFileExtension(
    filename
) {
    if (
        typeof filename !==
        "string"
    ) {
        return "";
    }

    const normalized =
        filename
            .trim()
            .toLowerCase();

    const dotIndex =
        normalized
            .lastIndexOf(
                "."
            );

    return dotIndex >=
        0
        ? normalized
            .slice(
                dotIndex
            )
        : "";
}

function normalizeMimeType(
    mimeType,
    filename = ""
) {
    const normalizedMime =
        typeof mimeType ===
            "string"
            ? mimeType
                .trim()
                .toLowerCase()
            : "";

    if (
        SUPPORTED_PATTERN_MIME_TYPES
            .includes(
                normalizedMime
            )
    ) {
        return normalizedMime;
    }

    const extension =
        getFileExtension(
            filename
        );

    if (
        extension ===
        ".png"
    ) {
        return "image/png";
    }

    if (
        extension ===
            ".jpg" ||
        extension ===
            ".jpeg"
    ) {
        return "image/jpeg";
    }

    if (
        extension ===
        ".webp"
    ) {
        return "image/webp";
    }

    return normalizedMime;
}

export function isSupportedPatternFile(
    file
) {
    if (!file) {
        return false;
    }

    return Boolean(
        SUPPORTED_PATTERN_MIME_TYPES
            .includes(
                normalizeMimeType(
                    file.type,
                    file.name
                )
            ) ||
        SUPPORTED_PATTERN_EXTENSIONS
            .includes(
                getFileExtension(
                    file.name
                )
            )
    );
}

export function validatePatternFile(
    file,
    {
        maximumFileSize =
            DEFAULT_MAX_FILE_SIZE
    } = {}
) {
    if (!file) {
        throw createPatternError(
            "No pattern image was selected.",
            "PATTERN_FILE_MISSING"
        );
    }

    if (
        !isSupportedPatternFile(
            file
        )
    ) {
        throw createPatternError(
            "Unsupported pattern format. Choose PNG, JPG, JPEG or WebP.",
            "PATTERN_FILE_UNSUPPORTED",
            {
                name:
                    file.name,

                type:
                    file.type
            }
        );
    }

    const maximumSize =
        Math.max(
            1,
            numberOr(
                maximumFileSize,
                DEFAULT_MAX_FILE_SIZE
            )
        );

    if (
        numberOr(
            file.size,
            0
        ) >
        maximumSize
    ) {
        throw createPatternError(
            `The pattern image is too large. Maximum size: ${(maximumSize / 1024 / 1024).toFixed(1)} MB.`,
            "PATTERN_FILE_TOO_LARGE"
        );
    }

    return true;
}

function readFileAsDataUrl(
    file
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
            if (
                typeof FileReader ===
                "undefined"
            ) {
                reject(
                    createPatternError(
                        "File reading is unavailable.",
                        "PATTERN_FILE_READER_UNAVAILABLE"
                    )
                );

                return;
            }

            const reader =
                new FileReader();

            reader.onload =
                () => {
                    if (
                        typeof reader
                            .result !==
                        "string"
                    ) {
                        reject(
                            createPatternError(
                                "The pattern image could not be read.",
                                "PATTERN_FILE_READ_FAILED"
                            )
                        );

                        return;
                    }

                    resolve(
                        reader.result
                    );
                };

            reader.onerror =
                () => {
                    reject(
                        reader.error ||
                        createPatternError(
                            "The pattern image could not be read.",
                            "PATTERN_FILE_READ_FAILED"
                        )
                    );
                };

            reader.onabort =
                () => {
                    reject(
                        createPatternError(
                            "Pattern image reading was cancelled.",
                            "PATTERN_FILE_READ_CANCELLED"
                        )
                    );
                };

            reader
                .readAsDataURL(
                    file
                );
        }
    );
}

export function decodePatternSource(
    source
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
            if (
                typeof Image ===
                "undefined"
            ) {
                reject(
                    createPatternError(
                        "Pattern image decoding is unavailable.",
                        "PATTERN_DECODER_UNAVAILABLE"
                    )
                );

                return;
            }

            const image =
                new Image();

            image.decoding =
                "async";

            image.onload =
                () => {
                    resolve({
                        image,

                        width:
                            Math.max(
                                1,
                                numberOr(
                                    image
                                        .naturalWidth ||
                                    image.width,
                                    DEFAULT_TILE_WIDTH
                                )
                            ),

                        height:
                            Math.max(
                                1,
                                numberOr(
                                    image
                                        .naturalHeight ||
                                    image.height,
                                    DEFAULT_TILE_HEIGHT
                                )
                            )
                    });
                };

            image.onerror =
                () => {
                    reject(
                        createPatternError(
                            "The selected file is not a readable pattern image.",
                            "PATTERN_DECODE_FAILED"
                        )
                    );
                };

            image.src =
                source;
        }
    );
}

export async function loadPatternAsset(
    file,
    options = {}
) {
    validatePatternFile(
        file,
        options
    );

    const dataUrl =
        await readFileAsDataUrl(
            file
        );

    const decoded =
        await decodePatternSource(
            dataUrl
        );

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                decoded.width,
                DEFAULT_TILE_WIDTH
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                decoded.height,
                DEFAULT_TILE_HEIGHT
            )
        );

    return {
        id:
            createId(
                "pattern-asset"
            ),

        kind:
            "pattern",

        name:
            typeof file.name ===
                "string" &&
            file.name.trim()
                ? file.name.trim()
                : DEFAULT_PATTERN_NAME,

        fileName:
            file.name ||
            DEFAULT_PATTERN_NAME,

        mimeType:
            normalizeMimeType(
                file.type,
                file.name
            ),

        fileSize:
            Math.max(
                0,
                numberOr(
                    file.size,
                    0
                )
            ),

        lastModified:
            numberOr(
                file.lastModified,
                0
            ),

        dataUrl,
        source:
            dataUrl,

        naturalWidth,
        naturalHeight,

        aspectRatio:
            naturalWidth /
            naturalHeight,

        importedAt:
            nowIso()
    };
}

export function pickPatternFile({
    accept =
        PATTERN_FILE_ACCEPT,

    capture =
        null
} = {}) {
    if (
        typeof document ===
        "undefined"
    ) {
        return Promise.reject(
            createPatternError(
                "The pattern picker is unavailable.",
                "PATTERN_PICKER_UNAVAILABLE"
            )
        );
    }

    return new Promise(
        resolve => {
            const input =
                document
                    .createElement(
                        "input"
                    );

            let settled =
                false;

            let focusTimer =
                null;

            const cleanup =
                () => {
                    if (
                        focusTimer !==
                        null
                    ) {
                        window
                            .clearTimeout(
                                focusTimer
                            );
                    }

                    window
                        .removeEventListener(
                            "focus",
                            handleWindowFocus
                        );

                    input.remove();
                };

            const settle =
                file => {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();

                    resolve(
                        file ||
                        null
                    );
                };

            const handleWindowFocus =
                () => {
                    focusTimer =
                        window
                            .setTimeout(
                                () => {
                                    if (
                                        !settled &&
                                        !input
                                            .files
                                            ?.length
                                    ) {
                                        settle(
                                            null
                                        );
                                    }
                                },
                                350
                            );
                };

            input.type =
                "file";

            input.accept =
                accept;

            input.multiple =
                false;

            if (
                capture !==
                    null &&
                capture !==
                    undefined
            ) {
                input
                    .setAttribute(
                        "capture",
                        String(
                            capture
                        )
                    );
            }

            input.style.position =
                "fixed";

            input.style.left =
                "-10000px";

            input.style.top =
                "-10000px";

            input
                .addEventListener(
                    "change",
                    () => {
                        settle(
                            input.files
                                ?.[0] ||
                            null
                        );
                    },
                    {
                        once:
                            true
                    }
                );

            input
                .addEventListener(
                    "cancel",
                    () => {
                        settle(
                            null
                        );
                    },
                    {
                        once:
                            true
                    }
                );

            window
                .addEventListener(
                    "focus",
                    handleWindowFocus
                );

            document.body
                .appendChild(
                    input
                );

            input.click();
        }
    );
}

/*=========================================================
Pattern Settings
=========================================================*/

function normalizeRepeatMode(
    value
) {
    return SUPPORTED_PATTERN_REPEAT_MODES
        .includes(
            value
        )
        ? value
        : PATTERN_REPEAT_MODES
            .REPEAT;
}

export function resolvePatternSettings(
    state,
    options = {}
) {
    const stateSettings =
        isPlainObject(
            state?.pattern
        )
            ? state.pattern
            : {};

    const optionSettings =
        isPlainObject(
            options.settings
        )
            ? options.settings
            : {};

    const merged = {
        ...stateSettings,
        ...optionSettings
    };

    const scale =
        clamp(
            options.scale ??
            merged.scale ??
            merged.patternScale ??
            1,
            MINIMUM_PATTERN_SCALE,
            MAXIMUM_PATTERN_SCALE
        );

    return {
        repeat:
            normalizeRepeatMode(
                options.repeat ??
                merged.repeat ??
                merged.repeatMode ??
                PATTERN_REPEAT_MODES
                    .REPEAT
            ),

        scale,

        scaleX:
            clamp(
                options.scaleX ??
                merged.scaleX ??
                merged.patternScaleX ??
                scale,
                MINIMUM_PATTERN_SCALE,
                MAXIMUM_PATTERN_SCALE
            ),

        scaleY:
            clamp(
                options.scaleY ??
                merged.scaleY ??
                merged.patternScaleY ??
                scale,
                MINIMUM_PATTERN_SCALE,
                MAXIMUM_PATTERN_SCALE
            ),

        rotation:
            normalizeDegrees(
                options.rotation ??
                merged.rotation ??
                merged.patternRotation ??
                0
            ),

        opacity:
            clamp(
                options.opacity ??
                merged.opacity ??
                merged.patternOpacity ??
                1,
                0,
                1
            ),

        offsetX:
            numberOr(
                options.offsetX ??
                merged.offsetX ??
                merged.patternOffsetX,
                0
            ),

        offsetY:
            numberOr(
                options.offsetY ??
                merged.offsetY ??
                merged.patternOffsetY,
                0
            ),

        imageSmoothingEnabled:
            (
                options
                    .imageSmoothingEnabled ??
                merged
                    .imageSmoothingEnabled ??
                true
            ) !==
                false,

        clipToBounds:
            (
                options.clipToBounds ??
                merged.clipToBounds ??
                true
            ) !==
                false,

        background:
            typeof (
                options.background ??
                merged.background
            ) ===
                "string"
                ? (
                    options.background ??
                    merged.background
                )
                : "transparent"
    };
}

/*=========================================================
Pattern Object Creation
=========================================================*/

export function createPatternObject({
    id,
    layerId,
    asset,
    bounds,
    settings,
    pointerType =
        "unknown",
    transient =
        false
}) {
    if (
        !id ||
        !layerId ||
        !asset ||
        !bounds
    ) {
        return null;
    }

    const timestamp =
        nowIso();

    const safeBounds = {
        x:
            numberOr(
                bounds.x,
                0
            ),

        y:
            numberOr(
                bounds.y,
                0
            ),

        width:
            clamp(
                bounds.width,
                MINIMUM_PATTERN_SIZE,
                MAXIMUM_PATTERN_DIMENSION
            ),

        height:
            clamp(
                bounds.height,
                MINIMUM_PATTERN_SIZE,
                MAXIMUM_PATTERN_DIMENSION
            )
    };

    const repeat =
        normalizeRepeatMode(
            settings?.repeat
        );

    const scale =
        clamp(
            settings?.scale ??
            1,
            MINIMUM_PATTERN_SCALE,
            MAXIMUM_PATTERN_SCALE
        );

    const patternScaleX =
        clamp(
            settings?.scaleX ??
            scale,
            MINIMUM_PATTERN_SCALE,
            MAXIMUM_PATTERN_SCALE
        );

    const patternScaleY =
        clamp(
            settings?.scaleY ??
            scale,
            MINIMUM_PATTERN_SCALE,
            MAXIMUM_PATTERN_SCALE
        );

    const patternRotation =
        normalizeDegrees(
            settings?.rotation
        );

    const patternOpacity =
        clamp(
            settings?.opacity ??
            1,
            0,
            1
        );

    const patternOffsetX =
        numberOr(
            settings?.offsetX,
            0
        );

    const patternOffsetY =
        numberOr(
            settings?.offsetY,
            0
        );

    const dataUrl =
        asset.dataUrl ||
        asset.source ||
        "";

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                asset.naturalWidth,
                DEFAULT_TILE_WIDTH
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                asset.naturalHeight,
                DEFAULT_TILE_HEIGHT
            )
        );

    const tileWidth =
        naturalWidth *
        patternScaleX;

    const tileHeight =
        naturalHeight *
        patternScaleY;

    const imageSmoothingEnabled =
        settings
            ?.imageSmoothingEnabled !==
        false;

    const clipToBounds =
        settings
            ?.clipToBounds !==
        false;

    const background =
        typeof settings
            ?.background ===
            "string"
            ? settings.background
            : "transparent";

    return {
        id,

        type:
            OBJECT_TYPES.PATTERN,

        objectKind:
            "pattern",

        name:
            transient
                ? "Pattern Preview"
                : (
                    asset.name ||
                    asset.fileName ||
                    DEFAULT_PATTERN_NAME
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
            safeBounds.x,

        y:
            safeBounds.y,

        width:
            safeBounds.width,

        height:
            safeBounds.height,

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

        offsetX:
            0,

        offsetY:
            0,

        opacity:
            patternOpacity,

        src:
            dataUrl,

        source:
            dataUrl,

        dataUrl,

        patternSource:
            dataUrl,

        imageSource:
            dataUrl,

        assetId:
            asset.id ||
            null,

        fileName:
            asset.fileName ||
            asset.name ||
            DEFAULT_PATTERN_NAME,

        mimeType:
            asset.mimeType ||
            "image/png",

        fileSize:
            Math.max(
                0,
                numberOr(
                    asset.fileSize,
                    0
                )
            ),

        naturalWidth,
        naturalHeight,

        aspectRatio:
            naturalWidth /
            naturalHeight,

        repeat,
        repeatMode:
            repeat,

        patternRepeat:
            repeat,

        patternScale:
            scale,

        patternScaleX,
        patternScaleY,
        patternRotation,
        patternOpacity,
        patternOffsetX,
        patternOffsetY,

        tileWidth,
        tileHeight,

        imageSmoothingEnabled,
        clipToBounds,
        background,

        style: {
            opacity:
                patternOpacity,

            repeat,
            repeatMode:
                repeat,

            patternRepeat:
                repeat,

            patternScale:
                scale,

            patternScaleX,
            patternScaleY,
            patternRotation,
            patternOpacity,
            patternOffsetX,
            patternOffsetY,

            tileWidth,
            tileHeight,

            imageSmoothingEnabled,
            clipToBounds,
            background
        },

        geometry: {
            x:
                safeBounds.x,

            y:
                safeBounds.y,

            width:
                safeBounds.width,

            height:
                safeBounds.height,

            left:
                safeBounds.x,

            top:
                safeBounds.y,

            right:
                safeBounds.x +
                safeBounds.width,

            bottom:
                safeBounds.y +
                safeBounds.height,

            center: {
                x:
                    safeBounds.x +
                    safeBounds.width /
                    2,

                y:
                    safeBounds.y +
                    safeBounds.height /
                    2
            },

            aspectRatio:
                safeBounds.width /
                Math.max(
                    MINIMUM_PATTERN_SIZE,
                    safeBounds.height
                ),

            boundingBox: {
                x:
                    safeBounds.x,

                y:
                    safeBounds.y,

                width:
                    safeBounds.width,

                height:
                    safeBounds.height,

                minX:
                    safeBounds.x,

                minY:
                    safeBounds.y,

                maxX:
                    safeBounds.x +
                    safeBounds.width,

                maxY:
                    safeBounds.y +
                    safeBounds.height
            }
        },

        metadata: {
            tool:
                EDITOR_TOOLS.PATTERN,

            objectKind:
                "pattern",

            pointerType,

            transient:
                Boolean(
                    transient
                ),

            createdWith:
                "PatternTool",

            originalFileName:
                asset.fileName ||
                asset.name ||
                null,

            originalMimeType:
                asset.mimeType ||
                null,

            originalWidth:
                naturalWidth,

            originalHeight:
                naturalHeight,

            importedAt:
                asset.importedAt ||
                timestamp
        },

        createdAt:
            timestamp,

        updatedAt:
            timestamp
    };
}

/*=========================================================
Pattern Tool Factory
=========================================================*/

export function createPatternTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.PATTERN;

    const previewId =
        options.previewId ||
        DEFAULT_PREVIEW_ID;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    const minimumSize =
        Math.max(
            MINIMUM_PATTERN_SIZE,
            numberOr(
                options.minimumSize,
                MINIMUM_PATTERN_SIZE
            )
        );

    let pendingAsset =
        null;

    let previewPoint =
        null;

    let interaction =
        null;

    let loadingPromise =
        null;

    let destroyed =
        false;

    function clearPreview(
        context
    ) {
        setTemporaryObject(
            context,
            null
        );

        requestRender(
            context
        );
    }

    function clearPending(
        context,
        {
            clearAsset =
                true
        } = {}
    ) {
        interaction =
            null;

        previewPoint =
            null;

        if (clearAsset) {
            pendingAsset =
                null;
        }

        clearPreview(
            context
        );

        return true;
    }

    function resolvePoint(
        context,
        event,
        state
    ) {
        let point =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (!point) {
            point =
                getDocumentCenter(
                    state?.document
                );
        }

        point =
            snapPointToGrid(
                point,
                state
            );

        return clampPointToDocument(
            point,
            state?.document
        );
    }

    function createPreviewObject(
        context,
        bounds,
        settings,
        layerId,
        pointerType =
            "preview"
    ) {
        if (!pendingAsset) {
            clearPreview(
                context
            );

            return null;
        }

        const previewObject =
            createPatternObject({
                id:
                    previewId,

                layerId,

                asset:
                    pendingAsset,

                bounds,

                settings,

                pointerType,

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

    function renderReadyPreview(
        context,
        point =
            null
    ) {
        if (
            !pendingAsset ||
            interaction
        ) {
            return null;
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
            !canUseLayer(
                activeLayer
            )
        ) {
            clearPreview(
                context
            );

            return null;
        }

        const placementPoint =
            isFinitePoint(
                point
            )
                ? point
                : (
                    previewPoint ||
                    getDocumentCenter(
                        state.document
                    )
                );

        previewPoint =
            clonePoint(
                placementPoint
            );

        const bounds =
            createDefaultBounds(
                placementPoint,
                state.document,
                pendingAsset,
                options
            );

        return createPreviewObject(
            context,
            bounds,
            resolvePatternSettings(
                state,
                options
            ),
            activeLayer.id,
            "preview"
        );
    }

    function renderDragPreview(
        context
    ) {
        if (
            !interaction ||
            !pendingAsset
        ) {
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

        let bounds =
            createBoundsFromPoints(
                interaction
                    .startPoint,
                interaction
                    .endPoint,
                {
                    drawFromCenter:
                        Boolean(
                            context?.altKey
                        ),

                    constrainSquare:
                        Boolean(
                            context?.shiftKey
                        ),

                    documentData:
                        state.document
                }
            );

        if (
            !bounds ||
            bounds.width <
                minimumSize ||
            bounds.height <
                minimumSize
        ) {
            bounds =
                createDefaultBounds(
                    interaction
                        .startPoint,
                    state.document,
                    pendingAsset,
                    options
                );
        }

        interaction.bounds =
            bounds;

        return createPreviewObject(
            context,
            bounds,
            interaction.settings,
            interaction.layerId,
            interaction.pointerType
        );
    }

    async function queueAsset(
        asset,
        context =
            null,
        {
            previewAt =
                null
        } = {}
    ) {
        if (
            !asset ||
            typeof asset
                .dataUrl !==
                "string" ||
            !asset.dataUrl
        ) {
            throw createPatternError(
                "A valid pattern asset is required.",
                "PATTERN_ASSET_INVALID"
            );
        }

        pendingAsset =
            asset;

        interaction =
            null;

        previewPoint =
            isFinitePoint(
                previewAt
            )
                ? clonePoint(
                    previewAt
                )
                : null;

        if (context) {
            renderReadyPreview(
                context,
                previewPoint
            );

            fireStageEvent(
                context,
                PATTERN_ASSET_READY_EVENT,
                {
                    asset
                }
            );
        }

        options
            .onAssetReady
            ?.(
                asset,
                context
            );

        return asset;
    }

    async function queueFile(
        file,
        context =
            null,
        queueOptions =
            {}
    ) {
        if (destroyed) {
            destroyed =
                false;
        }

        if (loadingPromise) {
            return loadingPromise;
        }

        options
            .onImportStart
            ?.(
                file,
                context
            );

        loadingPromise =
            loadPatternAsset(
                file,
                {
                    maximumFileSize:
                        options
                            .maximumFileSize ??
                        DEFAULT_MAX_FILE_SIZE
                }
            );

        try {
            const asset =
                await loadingPromise;

            await queueAsset(
                asset,
                context,
                queueOptions
            );

            return asset;
        } catch (
            error
        ) {
            fireStageEvent(
                context,
                PATTERN_IMPORT_ERROR_EVENT,
                {
                    error,
                    file
                }
            );

            options
                .onImportError
                ?.(
                    error,
                    file,
                    context
                );

            throw error;
        } finally {
            loadingPromise =
                null;
        }
    }

    async function pickAndQueue(
        context =
            null,
        pickerOptions =
            {}
    ) {
        if (loadingPromise) {
            return loadingPromise;
        }

        const picker =
            typeof options
                .pickFile ===
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
            options
                .onImportCancel
                ?.(
                    context
                );

            return null;
        }

        return queueFile(
            file,
            context,
            pickerOptions
        );
    }

    function addPatternObject(
        context,
        patternObject,
        asset
    ) {
        const addObject =
            getAction(
                context,
                "addObject"
            );

        if (!addObject) {
            throw createPatternError(
                "PatternTool requires addObject in the editor context.",
                "PATTERN_ADD_ACTION_MISSING"
            );
        }

        addObject(
            patternObject,
            {
                label:
                    historyLabel,

                select:
                    options
                        .selectCreatedPattern !==
                    false
            }
        );

        fireStageEvent(
            context,
            PATTERN_PLACED_EVENT,
            {
                object:
                    patternObject,

                asset
            }
        );

        options
            .onPatternPlaced
            ?.(
                patternObject,
                asset,
                context
            );
    }

    function finishPlacement(
        context,
        patternObject,
        asset,
        {
            keepAsset =
                false
        } = {}
    ) {
        addPatternObject(
            context,
            patternObject,
            asset
        );

        interaction =
            null;

        previewPoint =
            null;

        if (
            !keepAsset &&
            options
                .keepAssetAfterPlacement !==
            true
        ) {
            pendingAsset =
                null;
        }

        clearPreview(
            context
        );

        if (
            options
                .switchToSelectAfterCreate ===
            true
        ) {
            getAction(
                context,
                "setActiveTool"
            )?.(
                EDITOR_TOOLS.SELECT
            );
        } else if (
            pendingAsset
        ) {
            renderReadyPreview(
                context
            );
        }

        requestRender(
            context
        );

        return patternObject;
    }

    function placePending(
        context,
        bounds =
            null,
        {
            pointerType =
                "programmatic",

            keepAsset =
                false
        } = {}
    ) {
        if (!pendingAsset) {
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
            !canUseLayer(
                activeLayer
            )
        ) {
            return false;
        }

        const resolvedBounds =
            bounds &&
            numberOr(
                bounds.width,
                0
            ) >=
                minimumSize &&
            numberOr(
                bounds.height,
                0
            ) >=
                minimumSize
                ? {
                    x:
                        numberOr(
                            bounds.x,
                            0
                        ),

                    y:
                        numberOr(
                            bounds.y,
                            0
                        ),

                    width:
                        clamp(
                            bounds.width,
                            minimumSize,
                            MAXIMUM_PATTERN_DIMENSION
                        ),

                    height:
                        clamp(
                            bounds.height,
                            minimumSize,
                            MAXIMUM_PATTERN_DIMENSION
                        )
                }
                : createDefaultBounds(
                    previewPoint ||
                    getDocumentCenter(
                        state.document
                    ),
                    state.document,
                    pendingAsset,
                    options
                );

        const asset =
            pendingAsset;

        const patternObject =
            createPatternObject({
                id:
                    createId(
                        "pattern"
                    ),

                layerId:
                    activeLayer.id,

                asset,

                bounds:
                    resolvedBounds,

                settings:
                    resolvePatternSettings(
                        state,
                        options
                    ),

                pointerType,

                transient:
                    false
            });

        return finishPlacement(
            context,
            patternObject,
            asset,
            {
                keepAsset
            }
        );
    }

    async function importFile(
        file,
        context =
            null,
        {
            bounds =
                null,

            previewAt =
                null,

            placeImmediately =
                false,

            pointerType =
                "programmatic",

            keepAsset =
                false
        } = {}
    ) {
        const asset =
            await queueFile(
                file,
                context,
                {
                    previewAt
                }
            );

        if (
            !asset ||
            !placeImmediately ||
            !context
        ) {
            return asset;
        }

        return placePending(
            context,
            bounds,
            {
                pointerType,
                keepAsset
            }
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
            !canUseLayer(
                activeLayer
            )
        ) {
            return false;
        }

        let point =
            resolvePoint(
                context,
                event,
                state
            );

        if (
            !point ||
            !isPointInsideDocument(
                point,
                state.document
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        safelyStopPropagation(
            event
        );

        if (
            !pendingAsset
        ) {
            if (
                options
                    .openFilePickerOnCanvasClick ===
                false
            ) {
                return false;
            }

            const asset =
                await pickAndQueue(
                    context,
                    {
                        previewAt:
                            point
                    }
                );

            if (!asset) {
                return true;
            }

            if (
                options
                    .placeDefaultAfterSelection ===
                true
            ) {
                placePending(
                    context,
                    createDefaultBounds(
                        point,
                        state.document,
                        asset,
                        options
                    ),
                    {
                        pointerType:
                            getPointerType(
                                context,
                                event
                            )
                    }
                );
            }

            return true;
        }

        point =
            clampPointToDocument(
                snapPointToGrid(
                    point,
                    state
                ),
                state.document
            );

        interaction = {
            id:
                createId(
                    "pattern"
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
                state.document
                    ?.id ||
                null,

            startPoint:
                clonePoint(
                    point
                ),

            endPoint:
                clonePoint(
                    point
                ),

            bounds:
                null,

            settings:
                resolvePatternSettings(
                    state,
                    options
                )
        };

        previewPoint =
            clonePoint(
                point
            );

        renderDragPreview(
            context
        );

        return true;
    }

    function handlePointerMove(
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
            !pendingAsset
        ) {
            return false;
        }

        const state =
            getLatestState(
                context
            );

        if (!state) {
            return false;
        }

        let point =
            resolvePoint(
                context,
                event,
                state
            );

        if (!point) {
            return false;
        }

        if (
            !interaction
        ) {
            previewPoint =
                point;

            renderReadyPreview(
                context,
                point
            );

            return true;
        }

        if (
            !pointerMatches(
                interaction,
                context,
                event
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            event
        );

        interaction.endPoint =
            clampPointToDocument(
                snapPointToGrid(
                    point,
                    state
                ),
                state.document
            );

        renderDragPreview(
            context
        );

        return true;
    }

    function handlePointerUp(
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
            !interaction ||
            !pointerMatches(
                interaction,
                context,
                event
            )
        ) {
            return false;
        }

        const currentInteraction =
            interaction;

        const state =
            getLatestState(
                context
            );

        const releasePoint =
            resolveDocumentPoint(
                context,
                event,
                state
            );

        if (
            state &&
            releasePoint
        ) {
            currentInteraction
                .endPoint =
                clampPointToDocument(
                    snapPointToGrid(
                        releasePoint,
                        state
                    ),
                    state.document
                );
        }

        let bounds =
            createBoundsFromPoints(
                currentInteraction
                    .startPoint,
                currentInteraction
                    .endPoint,
                {
                    drawFromCenter:
                        Boolean(
                            context?.altKey
                        ),

                    constrainSquare:
                        Boolean(
                            context?.shiftKey
                        ),

                    documentData:
                        state?.document
                }
            ) ||
            currentInteraction
                .bounds;

        interaction =
            null;

        clearPreview(
            context
        );

        if (
            !state ||
            !pendingAsset
        ) {
            return true;
        }

        const layer =
            state.layers
                ?.find(
                    item =>
                        item.id ===
                        currentInteraction
                            .layerId
                );

        if (
            !canUseLayer(
                layer
            ) ||
            (
                currentInteraction
                    .documentId &&
                state.document
                    ?.id !==
                    currentInteraction
                        .documentId
            )
        ) {
            return true;
        }

        if (
            !bounds ||
            bounds.width <
                minimumSize ||
            bounds.height <
                minimumSize
        ) {
            bounds =
                createDefaultBounds(
                    currentInteraction
                        .startPoint,
                    state.document,
                    pendingAsset,
                    options
                );
        }

        const asset =
            pendingAsset;

        const patternObject =
            createPatternObject({
                id:
                    currentInteraction
                        .id,

                layerId:
                    currentInteraction
                        .layerId,

                asset,

                bounds,

                settings:
                    currentInteraction
                        .settings,

                pointerType:
                    currentInteraction
                        .pointerType,

                transient:
                    false
            });

        return finishPlacement(
            context,
            patternObject,
            asset
        );
    }

    function handlePointerCancel(
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
            interaction &&
            !pointerMatches(
                interaction,
                context,
                event
            )
        ) {
            return false;
        }

        interaction =
            null;

        if (
            pendingAsset
        ) {
            renderReadyPreview(
                context,
                previewPoint
            );
        } else {
            clearPreview(
                context
            );
        }

        return true;
    }

    function handleCancel(
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

        if (
            options
                .preservePendingAssetOnCancel ===
            true
        ) {
            interaction =
                null;

            renderReadyPreview(
                context,
                previewPoint
            );

            return true;
        }

        return clearPending(
            context
        );
    }

    function handleKeyDown(
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

        const nativeEvent =
            getNativeEvent(
                event
            );

        const key =
            typeof nativeEvent
                ?.key ===
                "string"
                ? nativeEvent.key
                    .toLowerCase()
                : "";

        if (
            key ===
                "enter" &&
            pendingAsset &&
            !interaction
        ) {
            safelyPreventDefault(
                event
            );

            placePending(
                context,
                null,
                {
                    pointerType:
                        "keyboard"
                }
            );

            return true;
        }

        if (
            key ===
                "escape" &&
            (
                pendingAsset ||
                interaction ||
                loadingPromise
            )
        ) {
            safelyPreventDefault(
                event
            );

            clearPending(
                context
            );

            return true;
        }

        if (
            interaction &&
            (
                nativeEvent
                    ?.key ===
                    "Shift" ||
                nativeEvent
                    ?.key ===
                    "Alt"
            )
        ) {
            renderDragPreview(
                context
            );

            return true;
        }

        return false;
    }

    function handleKeyUp(
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

        const nativeEvent =
            getNativeEvent(
                event
            );

        if (
            interaction &&
            (
                nativeEvent
                    ?.key ===
                    "Shift" ||
                nativeEvent
                    ?.key ===
                    "Alt"
            )
        ) {
            renderDragPreview(
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
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        destroyed =
            false;

        interaction =
            null;

        clearPreview(
            context
        );

        if (
            pendingAsset
        ) {
            renderReadyPreview(
                context,
                previewPoint
            );
        }

        if (
            options
                .openFilePickerOnActivate ===
                true &&
            !pendingAsset
        ) {
            pickAndQueue(
                context
            ).catch(
                error => {
                    options
                        .onImportError
                        ?.(
                            error,
                            null,
                            context
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
            resolveHandlerArguments(
                firstArgument,
                secondArgument
            );

        interaction =
            null;

        clearPreview(
            context
        );

        if (
            options
                .preservePendingAssetOnDeactivate !==
            true
        ) {
            pendingAsset =
                null;

            previewPoint =
                null;
        }

        return true;
    }

    function handleDestroy(
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

        destroyed =
            true;

        loadingPromise =
            null;

        return clearPending(
            context
        );
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Pattern",

        label:
            options.label ||
            "Pattern",

        description:
            "Import a repeating image and drag to create a pattern area.",

        shortcut:
            options.shortcut ||
            "R",

        cursor:
            () =>
                pendingAsset
                    ? "crosshair"
                    : "copy",

        preventDefault:
            true,

        stopPropagation:
            false,

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

        onPointerMove:
            handlePointerMove,

        onPointerUp:
            handlePointerUp,

        onPointerCancel:
            handlePointerCancel,

        onCancel:
            handleCancel,

        onKeyDown:
            handleKeyDown,

        onKeyUp:
            handleKeyUp,

        onDestroy:
            handleDestroy,

        pickAndQueue,
        queueFile,
        queueAsset,
        importFile,
        placePending,

        clearPending:
            context =>
                clearPending(
                    context
                ),

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
                ),

        getSession:
            () =>
                interaction
                    ? {
                        ...interaction,

                        startPoint:
                            clonePoint(
                                interaction
                                    .startPoint
                            ),

                        endPoint:
                            clonePoint(
                                interaction
                                    .endPoint
                            ),

                        bounds:
                            interaction
                                .bounds
                                ? {
                                    ...interaction
                                        .bounds
                                }
                                : null,

                        settings: {
                            ...interaction
                                .settings
                        }
                    }
                    : null
    });
}

/*=========================================================
Default Tool
=========================================================*/

export const PatternTool =
    createPatternTool();

export default PatternTool;