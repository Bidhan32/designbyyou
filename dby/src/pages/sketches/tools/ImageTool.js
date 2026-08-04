/*
=========================================================
FashionVision Professional Editor
Image Tool
Version 1.0
=========================================================

Supported workflow:

1. Select the Image tool.
2. Click the canvas.
3. Choose a PNG, JPG, JPEG, WebP or SVG file.
4. The image is fitted inside the document and placed at
   the clicked position.
5. The new image is selected and the editor switches to the
   Select tool by default.

The tool also exposes queueFile(), queueAsset(),
pickAndQueue() and placePending() methods so a later
FashionEditor upload button can use the same import logic.
=========================================================
*/

import {
    defineTool
} from "./ToolManager";

import {
    EDITOR_TOOLS,
    OBJECT_TYPES
} from "../useFashionEditorStore";

/*=========================================================
Public Constants
=========================================================*/

export const SUPPORTED_IMAGE_MIME_TYPES =
    Object.freeze([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/svg+xml"
    ]);

export const SUPPORTED_IMAGE_EXTENSIONS =
    Object.freeze([
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg"
    ]);

export const IMAGE_FILE_ACCEPT =
    [
        ...SUPPORTED_IMAGE_MIME_TYPES,
        ...SUPPORTED_IMAGE_EXTENSIONS
    ].join(",");

export const IMAGE_ASSET_READY_EVENT =
    "fashion:image-asset-ready";

export const IMAGE_IMPORT_ERROR_EVENT =
    "fashion:image-import-error";

/*=========================================================
Defaults
=========================================================*/

const DEFAULT_PREVIEW_ID =
    "__fashion-image-preview__";

const DEFAULT_HISTORY_LABEL =
    "Import image";

const DEFAULT_IMAGE_NAME =
    "Imported image";

const DEFAULT_IMAGE_WIDTH =
    640;

const DEFAULT_IMAGE_HEIGHT =
    480;

const DEFAULT_DOCUMENT_WIDTH =
    1200;

const DEFAULT_DOCUMENT_HEIGHT =
    1600;

const DEFAULT_MAX_FILE_SIZE =
    25 *
    1024 *
    1024;

const DEFAULT_FIT_RATIO =
    0.72;

const MINIMUM_IMAGE_SIZE =
    1;

const FILE_PICKER_CANCEL_DELAY =
    350;

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
    prefix = "image"
) {
    if (
        typeof globalThis
            .crypto
            ?.randomUUID ===
        "function"
    ) {
        return (
            `${prefix}-` +
            globalThis.crypto
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

function createError(
    message,
    code =
        "IMAGE_IMPORT_ERROR",
    details =
        null
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

    return true;
}

function getLatestState(
    context
) {
    if (
        typeof context?.store
            ?.getState ===
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

function canDrawOnLayer(
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

    if (
        nativeEvent?.touches ||
        nativeEvent
            ?.changedTouches
    ) {
        return "touch";
    }

    return "mouse";
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
        const mappedPoint =
            context
                .toDocumentPoint(
                    screenPoint
                );

        if (
            isFinitePoint(
                mappedPoint
            )
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
        getScreenPointFromEvent(
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

/*=========================================================
File Type Helpers
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

    const normalizedName =
        filename
            .trim()
            .toLowerCase();

    const dotIndex =
        normalizedName
            .lastIndexOf(
                "."
            );

    return dotIndex >=
        0
        ? normalizedName
            .slice(
                dotIndex
            )
        : "";
}

function normalizeMimeType(
    mimeType,
    filename =
        ""
) {
    const normalizedMime =
        typeof mimeType ===
            "string"
            ? mimeType
                .trim()
                .toLowerCase()
            : "";

    if (
        SUPPORTED_IMAGE_MIME_TYPES
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

    if (
        extension ===
        ".svg"
    ) {
        return "image/svg+xml";
    }

    return normalizedMime;
}

export function isSupportedImageFile(
    file
) {
    if (!file) {
        return false;
    }

    const mimeType =
        normalizeMimeType(
            file.type,
            file.name
        );

    const extension =
        getFileExtension(
            file.name
        );

    return Boolean(
        SUPPORTED_IMAGE_MIME_TYPES
            .includes(
                mimeType
            ) ||
        SUPPORTED_IMAGE_EXTENSIONS
            .includes(
                extension
            )
    );
}

export function validateImageFile(
    file,
    {
        maximumFileSize =
            DEFAULT_MAX_FILE_SIZE
    } = {}
) {
    if (!file) {
        throw createError(
            "No image file was selected.",
            "IMAGE_FILE_MISSING"
        );
    }

    if (
        !isSupportedImageFile(
            file
        )
    ) {
        throw createError(
            "Unsupported image format. Choose PNG, JPG, JPEG, WebP or SVG.",
            "IMAGE_FILE_UNSUPPORTED",
            {
                name:
                    file.name,
                type:
                    file.type
            }
        );
    }

    const fileSize =
        Math.max(
            0,
            numberOr(
                file.size,
                0
            )
        );

    const safeMaximum =
        Math.max(
            1,
            numberOr(
                maximumFileSize,
                DEFAULT_MAX_FILE_SIZE
            )
        );

    if (
        fileSize >
        safeMaximum
    ) {
        const maximumMegabytes =
            (
                safeMaximum /
                1024 /
                1024
            )
                .toFixed(1);

        throw createError(
            `The image is too large. The maximum size is ${maximumMegabytes} MB.`,
            "IMAGE_FILE_TOO_LARGE",
            {
                size:
                    fileSize,
                maximumFileSize:
                    safeMaximum
            }
        );
    }

    return true;
}

/*=========================================================
File Reading
=========================================================*/

function readFileAsDataUrl(
    file
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
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
                            createError(
                                "The selected image could not be read.",
                                "IMAGE_FILE_READ_FAILED"
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
                        createError(
                            "The selected image could not be read.",
                            "IMAGE_FILE_READ_FAILED"
                        )
                    );
                };

            reader.onabort =
                () => {
                    reject(
                        createError(
                            "Image reading was cancelled.",
                            "IMAGE_FILE_READ_CANCELLED"
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

function readFileAsText(
    file
) {
    if (
        typeof file?.text ===
        "function"
    ) {
        return file.text();
    }

    return new Promise(
        (
            resolve,
            reject
        ) => {
            const reader =
                new FileReader();

            reader.onload =
                () => {
                    resolve(
                        String(
                            reader.result ||
                            ""
                        )
                    );
                };

            reader.onerror =
                () => {
                    reject(
                        reader.error ||
                        createError(
                            "The SVG file could not be read.",
                            "SVG_FILE_READ_FAILED"
                        )
                    );
                };

            reader
                .readAsText(
                    file
                );
        }
    );
}

/*=========================================================
SVG Safety
=========================================================*/

function isUnsafeSvgUrl(
    value
) {
    if (
        typeof value !==
            "string"
    ) {
        return false;
    }

    const normalized =
        value
            .trim()
            .toLowerCase();

    if (!normalized) {
        return false;
    }

    return Boolean(
        normalized
            .startsWith(
                "javascript:"
            ) ||
        normalized
            .startsWith(
                "http:"
            ) ||
        normalized
            .startsWith(
                "https:"
            ) ||
        normalized
            .startsWith(
                "//"
            ) ||
        normalized
            .startsWith(
                "file:"
            )
    );
}

export function sanitizeSvgText(
    svgText
) {
    if (
        typeof svgText !==
            "string" ||
        !svgText.trim()
    ) {
        throw createError(
            "The SVG file is empty.",
            "SVG_EMPTY"
        );
    }

    if (
        typeof DOMParser ===
            "undefined" ||
        typeof XMLSerializer ===
            "undefined"
    ) {
        /*
        Browser environments used by the editor provide both
        APIs. Throwing here is safer than importing an SVG
        without sanitizing it.
        */

        throw createError(
            "SVG import is unavailable in this environment.",
            "SVG_SANITIZER_UNAVAILABLE"
        );
    }

    const parser =
        new DOMParser();

    const documentNode =
        parser
            .parseFromString(
                svgText,
                "image/svg+xml"
            );

    const parserError =
        documentNode
            .querySelector(
                "parsererror"
            );

    const root =
        documentNode
            .documentElement;

    if (
        parserError ||
        !root ||
        root.localName
            ?.toLowerCase() !==
            "svg"
    ) {
        throw createError(
            "The selected SVG is invalid.",
            "SVG_INVALID"
        );
    }

    documentNode
        .querySelectorAll(
            "script,foreignObject,iframe,object,embed,audio,video"
        )
        .forEach(
            node =>
                node.remove()
        );

    documentNode
        .querySelectorAll(
            "*"
        )
        .forEach(
            element => {
                [
                    ...element
                        .attributes
                ].forEach(
                    attribute => {
                        const attributeName =
                            attribute.name
                                .toLowerCase();

                        const attributeValue =
                            attribute.value;

                        if (
                            attributeName
                                .startsWith(
                                    "on"
                                )
                        ) {
                            element
                                .removeAttribute(
                                    attribute.name
                                );

                            return;
                        }

                        if (
                            (
                                attributeName ===
                                    "href" ||
                                attributeName ===
                                    "xlink:href" ||
                                attributeName ===
                                    "src"
                            ) &&
                            isUnsafeSvgUrl(
                                attributeValue
                            )
                        ) {
                            element
                                .removeAttribute(
                                    attribute.name
                                );

                            return;
                        }

                        if (
                            (
                                attributeName ===
                                    "style" ||
                                attributeName ===
                                    "fill" ||
                                attributeName ===
                                    "stroke" ||
                                attributeName ===
                                    "filter"
                            ) &&
                            /url\s*\(\s*(['"]?)(?:https?:|\/\/|javascript:|file:)/i
                                .test(
                                    attributeValue
                                )
                        ) {
                            element
                                .removeAttribute(
                                    attribute.name
                                );
                        }
                    }
                );
            }
        );

    return new XMLSerializer()
        .serializeToString(
            root
        );
}

function createSvgDataUrl(
    svgText
) {
    return (
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
            svgText
        )
    );
}

/*=========================================================
Image Decoding
=========================================================*/

export function decodeImageSource(
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
                    createError(
                        "Image decoding is unavailable in this environment.",
                        "IMAGE_DECODER_UNAVAILABLE"
                    )
                );

                return;
            }

            const image =
                new Image();

            image.onload =
                () => {
                    const width =
                        Math.max(
                            1,
                            numberOr(
                                image
                                    .naturalWidth ||
                                image.width,
                                DEFAULT_IMAGE_WIDTH
                            )
                        );

                    const height =
                        Math.max(
                            1,
                            numberOr(
                                image
                                    .naturalHeight ||
                                image.height,
                                DEFAULT_IMAGE_HEIGHT
                            )
                        );

                    resolve({
                        image,
                        width,
                        height
                    });
                };

            image.onerror =
                () => {
                    reject(
                        createError(
                            "The selected file is not a readable image.",
                            "IMAGE_DECODE_FAILED"
                        )
                    );
                };

            image.decoding =
                "async";

            image.src =
                source;
        }
    );
}

/*=========================================================
Asset Loading
=========================================================*/

export async function loadImageAsset(
    file,
    options = {}
) {
    validateImageFile(
        file,
        options
    );

    const mimeType =
        normalizeMimeType(
            file.type,
            file.name
        );

    let dataUrl;

    if (
        mimeType ===
        "image/svg+xml"
    ) {
        const rawSvg =
            await readFileAsText(
                file
            );

        const sanitizedSvg =
            sanitizeSvgText(
                rawSvg
            );

        dataUrl =
            createSvgDataUrl(
                sanitizedSvg
            );
    } else {
        dataUrl =
            await readFileAsDataUrl(
                file
            );
    }

    const decoded =
        await decodeImageSource(
            dataUrl
        );

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                decoded.width,
                DEFAULT_IMAGE_WIDTH
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                decoded.height,
                DEFAULT_IMAGE_HEIGHT
            )
        );

    return {
        id:
            createId(
                "asset"
            ),

        kind:
            "image",

        name:
            typeof file.name ===
                "string" &&
            file.name.trim()
                ? file.name.trim()
                : DEFAULT_IMAGE_NAME,

        fileName:
            typeof file.name ===
                "string"
                ? file.name
                : DEFAULT_IMAGE_NAME,

        mimeType,

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

/*=========================================================
Native File Picker
=========================================================*/

export function pickImageFile({
    accept =
        IMAGE_FILE_ACCEPT,
    capture =
        null
} = {}) {
    if (
        typeof document ===
            "undefined"
    ) {
        return Promise.reject(
            createError(
                "The image picker is unavailable in this environment.",
                "IMAGE_PICKER_UNAVAILABLE"
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

                    input
                        .remove();
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

            const handleChange =
                () => {
                    settle(
                        input.files
                            ?.[0] ||
                        null
                    );
                };

            const handleCancel =
                () => {
                    settle(
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
                                FILE_PICKER_CANCEL_DELAY
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
                input.setAttribute(
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

            input.style.width =
                "1px";

            input.style.height =
                "1px";

            input.addEventListener(
                "change",
                handleChange,
                {
                    once:
                        true
                }
            );

            input.addEventListener(
                "cancel",
                handleCancel,
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
Image Fitting and Placement
=========================================================*/

export function calculateFittedImageSize(
    asset,
    documentData,
    options = {}
) {
    const {
        width:
            documentWidth,
        height:
            documentHeight
    } =
        getDocumentSize(
            documentData
        );

    const naturalWidth =
        Math.max(
            1,
            numberOr(
                asset?.naturalWidth,
                DEFAULT_IMAGE_WIDTH
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                asset?.naturalHeight,
                DEFAULT_IMAGE_HEIGHT
            )
        );

    const fitRatio =
        clamp(
            options.fitRatio ??
            DEFAULT_FIT_RATIO,
            0.05,
            1
        );

    const maximumWidth =
        Math.max(
            MINIMUM_IMAGE_SIZE,
            Math.min(
                documentWidth,
                numberOr(
                    options.maximumWidth,
                    documentWidth *
                    fitRatio
                )
            )
        );

    const maximumHeight =
        Math.max(
            MINIMUM_IMAGE_SIZE,
            Math.min(
                documentHeight,
                numberOr(
                    options.maximumHeight,
                    documentHeight *
                    fitRatio
                )
            )
        );

    const widthScale =
        maximumWidth /
        naturalWidth;

    const heightScale =
        maximumHeight /
        naturalHeight;

    let scale =
        Math.min(
            widthScale,
            heightScale
        );

    if (
        options.allowUpscale !==
        true
    ) {
        scale =
            Math.min(
                scale,
                1
            );
    }

    scale =
        Math.max(
            MINIMUM_IMAGE_SIZE /
            Math.max(
                naturalWidth,
                naturalHeight
            ),
            scale
        );

    return {
        width:
            Math.max(
                MINIMUM_IMAGE_SIZE,
                naturalWidth *
                scale
            ),

        height:
            Math.max(
                MINIMUM_IMAGE_SIZE,
                naturalHeight *
                scale
            ),

        scale
    };
}

export function calculateImagePlacementBounds(
    asset,
    placementPoint,
    documentData,
    options = {}
) {
    const {
        width:
            documentWidth,
        height:
            documentHeight
    } =
        getDocumentSize(
            documentData
        );

    const size =
        calculateFittedImageSize(
            asset,
            documentData,
            options
        );

    const fallbackPoint =
        getDocumentCenter(
            documentData
        );

    const point =
        isFinitePoint(
            placementPoint
        )
            ? clonePoint(
                placementPoint
            )
            : fallbackPoint;

    const anchor =
        options.anchor ===
            "top-left"
            ? "top-left"
            : "center";

    let x =
        anchor ===
            "top-left"
            ? point.x
            : point.x -
                size.width /
                2;

    let y =
        anchor ===
            "top-left"
            ? point.y
            : point.y -
                size.height /
                2;

    x =
        clamp(
            x,
            0,
            Math.max(
                0,
                documentWidth -
                size.width
            )
        );

    y =
        clamp(
            y,
            0,
            Math.max(
                0,
                documentHeight -
                size.height
            )
        );

    return {
        x,
        y,

        width:
            size.width,

        height:
            size.height,

        right:
            x +
            size.width,

        bottom:
            y +
            size.height,

        center: {
            x:
                x +
                size.width /
                2,

            y:
                y +
                size.height /
                2
        },

        scale:
            size.scale
    };
}

/*=========================================================
Image Object Creation
=========================================================*/

export function createImageObject({
    id,
    layerId,
    asset,
    bounds,
    pointerType =
        "unknown",
    transient =
        false,
    opacity =
        1
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

    const safeOpacity =
        clamp(
            opacity,
            0,
            1
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
                bounds.width
            )
        );

    const naturalHeight =
        Math.max(
            1,
            numberOr(
                asset.naturalHeight,
                bounds.height
            )
        );

    return {
        id,

        type:
            OBJECT_TYPES.IMAGE,

        objectKind:
            "image",

        name:
            transient
                ? "Image Preview"
                : (
                    asset.name ||
                    asset.fileName ||
                    DEFAULT_IMAGE_NAME
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

        offsetX:
            0,

        offsetY:
            0,

        opacity:
            safeOpacity,

        src:
            dataUrl,

        source:
            dataUrl,

        dataUrl,

        imageSource:
            dataUrl,

        assetId:
            asset.id ||
            null,

        fileName:
            asset.fileName ||
            asset.name ||
            DEFAULT_IMAGE_NAME,

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

        preserveAspectRatio:
            true,

        imageSmoothingEnabled:
            true,

        crop:
            null,

        style: {
            opacity:
                safeOpacity,

            preserveAspectRatio:
                true,

            imageSmoothingEnabled:
                true,

            cornerRadius:
                0
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

            aspectRatio:
                bounds.width /
                Math.max(
                    MINIMUM_IMAGE_SIZE,
                    bounds.height
                ),

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
                EDITOR_TOOLS.IMAGE,

            objectKind:
                "image",

            pointerType,

            transient:
                Boolean(
                    transient
                ),

            createdWith:
                "ImageTool",

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
Tool Factory
=========================================================*/

export function createImageTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.IMAGE;

    const previewId =
        options.previewId ||
        DEFAULT_PREVIEW_ID;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    let pendingAsset =
        null;

    let previewPoint =
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
        if (clearAsset) {
            pendingAsset =
                null;
        }

        previewPoint =
            null;

        clearPreview(
            context
        );

        return true;
    }

    function resolvePlacementPoint(
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

    function resolveImageOpacity(
        state
    ) {
        return clamp(
            options.opacity ??
            state?.image?.opacity ??
            1,
            0,
            1
        );
    }

    function createPreviewObject(
        context,
        point =
            null
    ) {
        if (
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

        const bounds =
            calculateImagePlacementBounds(
                pendingAsset,
                placementPoint,
                state.document,
                options
            );

        previewPoint =
            clonePoint(
                placementPoint
            );

        const previewObject =
            createImageObject({
                id:
                    previewId,

                layerId:
                    activeLayer.id,

                asset:
                    pendingAsset,

                bounds,

                pointerType:
                    "preview",

                transient:
                    true,

                opacity:
                    resolveImageOpacity(
                        state
                    )
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
            typeof asset.dataUrl !==
                "string" ||
            !asset.dataUrl
        ) {
            throw createError(
                "A valid image asset is required.",
                "IMAGE_ASSET_INVALID"
            );
        }

        pendingAsset =
            asset;

        previewPoint =
            isFinitePoint(
                previewAt
            )
                ? clonePoint(
                    previewAt
                )
                : null;

        if (context) {
            createPreviewObject(
                context,
                previewPoint
            );

            fireStageEvent(
                context,
                IMAGE_ASSET_READY_EVENT,
                {
                    asset:
                        pendingAsset
                }
            );
        }

        options
            .onAssetReady
            ?.(
                pendingAsset,
                context
            );

        return pendingAsset;
    }

    async function queueFile(
        file,
        context =
            null,
        queueOptions =
            {}
    ) {
        if (destroyed) {
            throw createError(
                "The image tool has been destroyed.",
                "IMAGE_TOOL_DESTROYED"
            );
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
            loadImageAsset(
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
                context,
                queueOptions
            );

            return asset;
        } catch (error) {
            fireStageEvent(
                context,
                IMAGE_IMPORT_ERROR_EVENT,
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
                : pickImageFile;

        const file =
            await picker({
                accept:
                    options.accept ||
                    IMAGE_FILE_ACCEPT,

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

    function placePending(
        context,
        point =
            null,
        {
            pointerType =
                "programmatic"
        } = {}
    ) {
        if (
            !pendingAsset
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

        const placementPoint =
            isFinitePoint(
                point
            )
                ? clonePoint(
                    point
                )
                : (
                    previewPoint ||
                    getDocumentCenter(
                        state.document
                    )
                );

        const safePoint =
            clampPointToDocument(
                snapPointToGrid(
                    placementPoint,
                    state
                ),
                state.document
            );

        const bounds =
            calculateImagePlacementBounds(
                pendingAsset,
                safePoint,
                state.document,
                options
            );

        const imageObject =
            createImageObject({
                id:
                    createId(
                        "image"
                    ),

                layerId:
                    activeLayer.id,

                asset:
                    pendingAsset,

                bounds,

                pointerType,

                transient:
                    false,

                opacity:
                    resolveImageOpacity(
                        state
                    )
            });

        const addObject =
            getAction(
                context,
                "addObject"
            );

        if (!addObject) {
            throw createError(
                "ImageTool requires addObject in the editor context.",
                "IMAGE_ADD_ACTION_MISSING"
            );
        }

        addObject(
            imageObject,
            {
                label:
                    historyLabel,

                select:
                    options
                        .selectCreatedImage !==
                    false
            }
        );

        const placedAsset =
            pendingAsset;

        pendingAsset =
            null;

        previewPoint =
            null;

        clearPreview(
            context
        );

        if (
            options
                .switchToSelectAfterCreate !==
            false
        ) {
            getAction(
                context,
                "setActiveTool"
            )?.(
                EDITOR_TOOLS.SELECT
            );
        }

        options
            .onImagePlaced
            ?.(
                imageObject,
                placedAsset,
                context
            );

        requestRender(
            context
        );

        return imageObject;
    }

    async function importFile(
        file,
        context =
            null,
        {
            placementPoint =
                null,
            placeImmediately =
                true,
            pointerType =
                "programmatic"
        } = {}
    ) {
        const asset =
            await queueFile(
                file,
                context,
                {
                    previewAt:
                        placementPoint
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
            placementPoint,
            {
                pointerType
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
            !canDrawOnLayer(
                activeLayer
            )
        ) {
            return false;
        }

        let point =
            resolvePlacementPoint(
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

        const pointerType =
            getPointerType(
                context,
                event
            );

        if (
            pendingAsset
        ) {
            placePending(
                context,
                point,
                {
                    pointerType
                }
            );

            return true;
        }

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
                .placeImmediatelyAfterSelection ===
            false
        ) {
            previewPoint =
                point;

            createPreviewObject(
                context,
                point
            );

            return true;
        }

        placePending(
            context,
            point,
            {
                pointerType
            }
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
            !pendingAsset ||
            !context
        ) {
            return false;
        }

        const state =
            getLatestState(
                context
            );

        let point =
            resolvePlacementPoint(
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

        previewPoint =
            point;

        createPreviewObject(
            context,
            point
        );

        return true;
    }

    function handlePointerUp(
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

        /*
        Do not call preventDefault here. Pointer-up and
        touch-end events can be non-cancelable.
        */

        return Boolean(
            pendingAsset ||
            loadingPromise ||
            event
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
            typeof nativeEvent?.key ===
                "string"
                ? nativeEvent.key
                    .toLowerCase()
                : "";

        if (
            key ===
                "enter" &&
            pendingAsset
        ) {
            safelyPreventDefault(
                event
            );

            placePending(
                context,
                previewPoint,
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

        return false;
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

        clearPreview(
            context
        );

        if (
            pendingAsset
        ) {
            createPreviewObject(
                context,
                previewPoint
            );
        }

        if (
            options
                .openFilePickerOnActivate ===
            true
        ) {
            /*
            Some browsers only permit file pickers inside a
            direct user gesture. The default is therefore
            false; canvas-click import is more reliable.
            */

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

        if (
            options
                .preservePendingAssetOnCancel ===
            true
        ) {
            clearPreview(
                context
            );

            return true;
        }

        return clearPending(
            context
        );
    }

    function destroyTool(
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
            "Image",

        label:
            options.label ||
            "Image",

        description:
            "Import PNG, JPG, WebP or SVG images and place them on the canvas.",

        shortcut:
            options.shortcut ||
            "I",

        cursor:
            () =>
                pendingAsset
                    ? "copy"
                    : "crosshair",

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
            handlePointerDown,

        onPointerMove:
            handlePointerMove,

        onPointerUp:
            handlePointerUp,

        onPointerCancel:
            cancelInteraction,

        onCancel:
            cancelInteraction,

        onKeyDown:
            handleKeyDown,

        onDestroy:
            destroyTool,

        /*
        Public integration methods. defineTool preserves
        custom properties, so the registered tool and this
        exported singleton share the same closures.
        */

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
                )
    });
}

/*=========================================================
Default Tool
=========================================================*/

export const ImageTool =
    createImageTool();

export default ImageTool;