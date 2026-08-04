/*
=========================================================
FashionVision Professional Editor
Text Edit Overlay
Version 1.0
=========================================================

Usage example:

<TextEditOverlay
    object={editingTextObject}
    stageRef={stageRef}
    open={Boolean(editingTextObject)}
    onCommit={() => {
        setEditingTextObject(null);
    }}
    onCancel={() => {
        setEditingTextObject(null);
    }}
/>

The component renders an HTML textarea over the matching
Konva text object and commits the edited value through the
editor store's updateObject action.
=========================================================
*/

import React, {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "react";

import { createPortal } from "react-dom";

import {
    OBJECT_TYPES,
    useFashionEditorStore
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_TEXT =
    "Text";

const DEFAULT_FONT_FAMILY =
    "Arial";

const DEFAULT_FONT_SIZE =
    32;

const DEFAULT_FONT_WEIGHT =
    400;

const DEFAULT_LINE_HEIGHT =
    1.2;

const DEFAULT_FILL =
    "#111111";

const DEFAULT_WIDTH =
    240;

const DEFAULT_HEIGHT =
    64;

const DEFAULT_HISTORY_LABEL =
    "Edit text";

const POSITION_EPSILON =
    0.05;

const MINIMUM_DIMENSION =
    1;

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

function resolveString(
    candidates,
    fallback = ""
) {
    const value =
        candidates.find(
            candidate =>
                typeof candidate ===
                    "string"
        );

    return value !==
        undefined
        ? value
        : fallback;
}

function resolveNonEmptyString(
    candidates,
    fallback = ""
) {
    return (
        candidates.find(
            candidate =>
                typeof candidate ===
                    "string" &&
                candidate.trim()
        )?.trim() ||
        fallback
    );
}

function resolveRefValue(
    value
) {
    if (
        value &&
        typeof value ===
            "object" &&
        "current" in value
    ) {
        return value.current;
    }

    return value || null;
}

function isTextObject(
    object
) {
    return Boolean(
        object &&
        object.id &&
        (
            object.type ===
                OBJECT_TYPES.TEXT ||
            object.objectKind ===
                "text" ||
            object.metadata
                ?.objectKind ===
                "text"
        )
    );
}

function valuesNearlyEqual(
    first,
    second
) {
    return (
        Math.abs(
            numberOr(
                first,
                0
            ) -
            numberOr(
                second,
                0
            )
        ) <=
        POSITION_EPSILON
    );
}

/*=========================================================
Text Value Resolution
=========================================================*/

function resolveTextContent(
    object
) {
    return resolveString(
        [
            object?.text,
            object?.content,
            object?.value,
            object?.style?.text
        ],
        DEFAULT_TEXT
    );
}

function resolveTextWidth(
    object
) {
    return Math.max(
        MINIMUM_DIMENSION,
        numberOr(
            object?.width ??
            object?.geometry?.width ??
            object?.geometry
                ?.boundingBox?.width,
            DEFAULT_WIDTH
        )
    );
}

function resolveTextHeight(
    object
) {
    return Math.max(
        MINIMUM_DIMENSION,
        numberOr(
            object?.height ??
            object?.geometry?.height ??
            object?.geometry
                ?.boundingBox?.height,
            DEFAULT_HEIGHT
        )
    );
}

function resolveFontFamily(
    object
) {
    return resolveNonEmptyString(
        [
            object?.fontFamily,
            object?.style?.fontFamily,
            object?.textStyle
                ?.fontFamily
        ],
        DEFAULT_FONT_FAMILY
    );
}

function resolveFontSize(
    object
) {
    return Math.max(
        1,
        numberOr(
            object?.fontSize ??
            object?.style?.fontSize ??
            object?.textStyle
                ?.fontSize,
            DEFAULT_FONT_SIZE
        )
    );
}

function resolveFontWeight(
    object
) {
    const requested =
        object?.fontWeight ??
        object?.style
            ?.fontWeight ??
        object?.textStyle
            ?.fontWeight ??
        DEFAULT_FONT_WEIGHT;

    if (
        typeof requested ===
            "string"
    ) {
        const normalized =
            requested
                .trim()
                .toLowerCase();

        if (
            normalized ===
                "bold" ||
            normalized ===
                "bolder"
        ) {
            return 700;
        }

        if (
            normalized ===
                "normal" ||
            normalized ===
                "lighter"
        ) {
            return 400;
        }
    }

    return clamp(
        requested,
        100,
        900
    );
}

function resolveFontStyle(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object?.fontStyle,
                object?.style
                    ?.fontStyle,
                object?.textStyle
                    ?.fontStyle
            ],
            "normal"
        )
            .toLowerCase();

    if (
        requested.includes(
            "italic"
        )
    ) {
        return "italic";
    }

    if (
        requested.includes(
            "oblique"
        )
    ) {
        return "oblique";
    }

    return "normal";
}

function resolveTextDecoration(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object
                    ?.textDecoration,
                object?.style
                    ?.textDecoration,
                object?.textStyle
                    ?.textDecoration
            ],
            "none"
        )
            .toLowerCase();

    return [
        "none",
        "underline",
        "line-through"
    ].includes(
        requested
    )
        ? requested
        : "none";
}

function resolveTextAlign(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object?.align,
                object?.textAlign,
                object?.style?.align,
                object?.style
                    ?.textAlign
            ],
            "left"
        )
            .toLowerCase();

    return [
        "left",
        "center",
        "right",
        "justify"
    ].includes(
        requested
    )
        ? requested
        : "left";
}

function resolveLineHeight(
    object
) {
    return clamp(
        object?.lineHeight ??
        object?.style
            ?.lineHeight ??
        object?.textStyle
            ?.lineHeight ??
        DEFAULT_LINE_HEIGHT,
        0.1,
        10
    );
}

function resolveLetterSpacing(
    object
) {
    return numberOr(
        object?.letterSpacing ??
        object?.style
            ?.letterSpacing ??
        object?.textStyle
            ?.letterSpacing,
        0
    );
}

function resolvePadding(
    object
) {
    return Math.max(
        0,
        numberOr(
            object?.padding ??
            object?.style?.padding ??
            object?.textStyle
                ?.padding,
            0
        )
    );
}

function resolveFill(
    object
) {
    return resolveNonEmptyString(
        [
            object?.fill,
            object?.color,
            object?.style?.fill,
            object?.style?.color
        ],
        DEFAULT_FILL
    );
}

function resolveOpacity(
    object
) {
    return clamp(
        object?.opacity ??
        object?.style?.opacity ??
        1,
        0,
        1
    );
}

function resolveDirection(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object?.direction,
                object?.style
                    ?.direction
            ],
            "inherit"
        )
            .toLowerCase();

    return [
        "inherit",
        "ltr",
        "rtl"
    ].includes(
        requested
    )
        ? requested
        : "inherit";
}

/*=========================================================
Konva Node Helpers
=========================================================*/

function collectionToArray(
    collection
) {
    if (!collection) {
        return [];
    }

    if (
        Array.isArray(
            collection
        )
    ) {
        return collection;
    }

    if (
        typeof collection
            .toArray ===
        "function"
    ) {
        return collection
            .toArray();
    }

    const result =
        [];

    if (
        typeof collection.each ===
        "function"
    ) {
        collection.each(
            node => {
                result.push(
                    node
                );
            }
        );

        return result;
    }

    try {
        return [
            ...collection
        ];
    } catch {
        return result;
    }
}

export function findTextObjectNode(
    stage,
    objectId
) {
    if (
        !stage ||
        !objectId
    ) {
        return null;
    }

    try {
        const namedNodes =
            collectionToArray(
                stage.find(
                    ".fashion-editor-text-object"
                )
            );

        const namedMatch =
            namedNodes.find(
                node =>
                    node?.getAttr?.(
                        "editorObjectId"
                    ) ===
                    objectId
            );

        if (namedMatch) {
            return namedMatch;
        }

        const objectNodes =
            collectionToArray(
                stage.find(
                    ".fashion-editor-object"
                )
            );

        return (
            objectNodes.find(
                node =>
                    node?.getAttr?.(
                        "editorObjectRoot"
                    ) ===
                        true &&
                    node?.getAttr?.(
                        "editorObjectId"
                    ) ===
                        objectId
            ) ||
            null
        );
    } catch {
        return null;
    }
}

function findSelectionTransformer(
    stage
) {
    if (!stage) {
        return null;
    }

    try {
        return (
            stage.findOne(
                ".fashion-editor-selection-transformer"
            ) ||
            null
        );
    } catch {
        return null;
    }
}

/*=========================================================
Overlay Geometry
=========================================================*/

function getStageContainer(
    stage,
    containerReference
) {
    const explicitContainer =
        resolveRefValue(
            containerReference
        );

    if (explicitContainer) {
        return explicitContainer;
    }

    return (
        stage?.container?.() ||
        null
    );
}

function readAbsoluteMatrix(
    node
) {
    const transform =
        node
            ?.getAbsoluteTransform
            ?.();

    const matrix =
        transform
            ?.getMatrix
            ?.();

    if (
        !Array.isArray(
            matrix
        ) ||
        matrix.length <
            6
    ) {
        return [
            1,
            0,
            0,
            1,
            0,
            0
        ];
    }

    return matrix.map(
        value =>
            numberOr(
                value,
                0
            )
    );
}

export function calculateTextOverlayLayout({
    stage,
    node,
    container,
    width,
    height
}) {
    if (
        !stage ||
        !node ||
        !container
    ) {
        return null;
    }

    const rectangle =
        container
            .getBoundingClientRect
            ?.();

    if (!rectangle) {
        return null;
    }

    const stageWidth =
        Math.max(
            1,
            numberOr(
                stage.width?.(),
                rectangle.width ||
                1
            )
        );

    const stageHeight =
        Math.max(
            1,
            numberOr(
                stage.height?.(),
                rectangle.height ||
                1
            )
        );

    const cssScaleX =
        rectangle.width /
        stageWidth;

    const cssScaleY =
        rectangle.height /
        stageHeight;

    const [
        a,
        b,
        c,
        d,
        e,
        f
    ] =
        readAbsoluteMatrix(
            node
        );

    return {
        left:
            rectangle.left,

        top:
            rectangle.top,

        width:
            Math.max(
                MINIMUM_DIMENSION,
                numberOr(
                    width,
                    DEFAULT_WIDTH
                )
            ),

        height:
            Math.max(
                MINIMUM_DIMENSION,
                numberOr(
                    height,
                    DEFAULT_HEIGHT
                )
            ),

        matrix: [
            a *
            cssScaleX,

            b *
            cssScaleY,

            c *
            cssScaleX,

            d *
            cssScaleY,

            e *
            cssScaleX,

            f *
            cssScaleY
        ]
    };
}

function layoutsEqual(
    first,
    second
) {
    if (
        first ===
        second
    ) {
        return true;
    }

    if (
        !first ||
        !second
    ) {
        return false;
    }

    if (
        !valuesNearlyEqual(
            first.left,
            second.left
        ) ||
        !valuesNearlyEqual(
            first.top,
            second.top
        ) ||
        !valuesNearlyEqual(
            first.width,
            second.width
        ) ||
        !valuesNearlyEqual(
            first.height,
            second.height
        )
    ) {
        return false;
    }

    return first.matrix.every(
        (
            value,
            index
        ) =>
            valuesNearlyEqual(
                value,
                second.matrix[
                    index
                ]
            )
    );
}

function matrixToCss(
    matrix
) {
    const safeMatrix =
        Array.isArray(
            matrix
        ) &&
        matrix.length >=
            6
            ? matrix
            : [
                1,
                0,
                0,
                1,
                0,
                0
            ];

    return (
        `matrix(` +
        safeMatrix
            .slice(
                0,
                6
            )
            .map(
                value =>
                    numberOr(
                        value,
                        0
                    )
                    .toFixed(
                        6
                    )
            )
            .join(",") +
        `)`
    );
}

/*=========================================================
Text Update Helpers
=========================================================*/

function createTextUpdates(
    text
) {
    const safeText =
        typeof text ===
            "string"
            ? text
            : String(
                text ?? ""
            );

    const trimmedName =
        safeText
            .trim()
            .replace(
                /\s+/g,
                " "
            )
            .slice(
                0,
                32
            );

    return {
        text:
            safeText,

        content:
            safeText,

        value:
            safeText,

        name:
            trimmedName ||
            "Text",

        updatedAt:
            new Date()
                .toISOString()
    };
}

/*=========================================================
Text Edit Overlay
=========================================================*/

function TextEditOverlay({
    object,
    open = true,

    stageRef = null,
    stage = null,
    containerRef = null,

    historyLabel =
        DEFAULT_HISTORY_LABEL,

    autoFocus = true,
    selectAllOnOpen = false,
    commitOnBlur = true,
    allowEmpty = true,

    onChange = null,
    onCommit = null,
    onCancel = null,
    onOpen = null,
    onClose = null,

    className = "",
    style = null,
    zIndex = 100000
}) {
    const textareaRef =
        useRef(null);

    const nodeRef =
        useRef(null);

    const transformerRef =
        useRef(null);

    const originalVisibilityRef =
        useRef(null);

    const transformerVisibilityRef =
        useRef(null);

    const closingRef =
        useRef(false);

    const originalTextRef =
        useRef(
            resolveTextContent(
                object
            )
        );

    const [
        draftText,
        setDraftText
    ] =
        useState(
            resolveTextContent(
                object
            )
        );

    const [
        layout,
        setLayout
    ] =
        useState(null);

    const resolvedStage =
        resolveRefValue(
            stageRef
        ) ||
        resolveRefValue(
            stage
        );

    const validObject =
        isTextObject(
            object
        );

    const visible =
        Boolean(
            open &&
            validObject &&
            typeof document !==
                "undefined"
        );

    const width =
        resolveTextWidth(
            object
        );

    const height =
        resolveTextHeight(
            object
        );

    const textStyle =
        useMemo(
            () => ({
                boxSizing:
                    "border-box",

                display:
                    "block",

                width:
                    `${width}px`,

                height:
                    `${height}px`,

                minWidth:
                    `${width}px`,

                minHeight:
                    `${height}px`,

                margin:
                    0,

                border:
                    "1px solid rgba(139, 92, 246, 0.95)",

                borderRadius:
                    "2px",

                outline:
                    "none",

                padding:
                    `${resolvePadding(
                        object
                    )}px`,

                overflow:
                    "hidden",

                resize:
                    "none",

                background:
                    "rgba(255, 255, 255, 0.04)",

                color:
                    resolveFill(
                        object
                    ),

                caretColor:
                    resolveFill(
                        object
                    ),

                opacity:
                    resolveOpacity(
                        object
                    ),

                fontFamily:
                    resolveFontFamily(
                        object
                    ),

                fontSize:
                    `${resolveFontSize(
                        object
                    )}px`,

                fontWeight:
                    resolveFontWeight(
                        object
                    ),

                fontStyle:
                    resolveFontStyle(
                        object
                    ),

                textDecoration:
                    resolveTextDecoration(
                        object
                    ),

                textAlign:
                    resolveTextAlign(
                        object
                    ),

                lineHeight:
                    resolveLineHeight(
                        object
                    ),

                letterSpacing:
                    `${resolveLetterSpacing(
                        object
                    )}px`,

                direction:
                    resolveDirection(
                        object
                    ),

                whiteSpace:
                    object?.wrap ===
                        "none"
                        ? "pre"
                        : "pre-wrap",

                overflowWrap:
                    object?.wrap ===
                        "char"
                        ? "anywhere"
                        : "break-word",

                wordBreak:
                    object?.wrap ===
                        "char"
                        ? "break-all"
                        : "normal",

                fontSynthesis:
                    "none",

                transformOrigin:
                    "0 0",

                boxShadow:
                    "0 0 0 1px rgba(139, 92, 246, 0.25), 0 8px 30px rgba(15, 23, 42, 0.28)"
            }),
            [
                object,
                width,
                height
            ]
        );

    const finishEditing =
        useCallback(
            (
                mode,
                value =
                    draftText
            ) => {
                if (
                    closingRef.current
                ) {
                    return;
                }

                closingRef.current =
                    true;

                const originalText =
                    originalTextRef
                        .current;

                const safeValue =
                    typeof value ===
                        "string"
                        ? value
                        : String(
                            value ?? ""
                        );

                if (
                    mode ===
                    "commit"
                ) {
                    const acceptedValue =
                        allowEmpty
                            ? safeValue
                            : (
                                safeValue.trim()
                                    ? safeValue
                                    : originalText
                            );

                    if (
                        acceptedValue !==
                        originalText
                    ) {
                        const updates =
                            createTextUpdates(
                                acceptedValue
                            );

                        const state =
                            useFashionEditorStore
                                .getState();

                        state
                            .updateObject
                            ?.(
                                object.id,
                                updates,
                                historyLabel
                            );
                    }

                    onCommit?.(
                        acceptedValue,
                        object
                    );
                } else {
                    onCancel?.(
                        originalText,
                        object
                    );
                }

                onClose?.(
                    mode,
                    object
                );
            },
            [
                allowEmpty,
                draftText,
                historyLabel,
                object,
                onCancel,
                onClose,
                onCommit
            ]
        );

    const handleDraftChange =
        useCallback(
            event => {
                const nextValue =
                    event.target
                        .value;

                setDraftText(
                    nextValue
                );

                onChange?.(
                    nextValue,
                    object
                );
            },
            [
                object,
                onChange
            ]
        );

    const handleKeyDown =
        useCallback(
            event => {
                event.stopPropagation();

                if (
                    event.key ===
                    "Escape"
                ) {
                    event.preventDefault();

                    finishEditing(
                        "cancel"
                    );

                    return;
                }

                if (
                    event.key ===
                        "Enter" &&
                    (
                        event.ctrlKey ||
                        event.metaKey
                    )
                ) {
                    event.preventDefault();

                    finishEditing(
                        "commit",
                        event.currentTarget
                            .value
                    );
                }
            },
            [
                finishEditing
            ]
        );

    const handleBlur =
        useCallback(
            event => {
                if (
                    closingRef.current
                ) {
                    return;
                }

                if (
                    commitOnBlur
                ) {
                    finishEditing(
                        "commit",
                        event.currentTarget
                            .value
                    );
                }
            },
            [
                commitOnBlur,
                finishEditing
            ]
        );

    const stopCanvasEvent =
        useCallback(
            event => {
                event.stopPropagation();
            },
            []
        );

    /*
    Reset the draft whenever another text object starts
    editing.
    */

    useEffect(
        () => {
            const nextText =
                resolveTextContent(
                    object
                );

            originalTextRef.current =
                nextText;

            closingRef.current =
                false;

            setDraftText(
                nextText
            );
        },
        [
            object?.id
        ]
    );

    /*
    Resolve and continuously follow the Konva object. The
    requestAnimationFrame loop is necessary because panning,
    zooming and transformer updates can happen without a DOM
    resize event.
    */

    useLayoutEffect(
        () => {
            if (
                !visible ||
                !resolvedStage
            ) {
                setLayout(
                    null
                );

                return undefined;
            }

            const node =
                findTextObjectNode(
                    resolvedStage,
                    object.id
                );

            const container =
                getStageContainer(
                    resolvedStage,
                    containerRef
                );

            if (
                !node ||
                !container
            ) {
                setLayout(
                    null
                );

                return undefined;
            }

            nodeRef.current =
                node;

            transformerRef.current =
                findSelectionTransformer(
                    resolvedStage
                );

            originalVisibilityRef.current =
                node.visible?.();

            transformerVisibilityRef.current =
                transformerRef.current
                    ?.visible?.();

            node.visible?.(
                false
            );

            transformerRef.current
                ?.visible?.(
                    false
                );

            resolvedStage
                .batchDraw?.();

            let animationFrameId =
                null;

            let disposed =
                false;

            const updateLayout =
                () => {
                    if (disposed) {
                        return;
                    }

                    const nextLayout =
                        calculateTextOverlayLayout({
                            stage:
                                resolvedStage,

                            node,

                            container,

                            width,

                            height
                        });

                    setLayout(
                        currentLayout =>
                            layoutsEqual(
                                currentLayout,
                                nextLayout
                            )
                                ? currentLayout
                                : nextLayout
                    );

                    animationFrameId =
                        window
                            .requestAnimationFrame(
                                updateLayout
                            );
                };

            updateLayout();

            onOpen?.(
                object
            );

            return () => {
                disposed =
                    true;

                if (
                    animationFrameId !==
                    null
                ) {
                    window
                        .cancelAnimationFrame(
                            animationFrameId
                        );
                }

                node.visible?.(
                    originalVisibilityRef
                        .current ??
                    true
                );

                if (
                    transformerRef.current &&
                    transformerVisibilityRef
                        .current !==
                        null
                ) {
                    transformerRef.current
                        .visible?.(
                            transformerVisibilityRef
                                .current
                        );
                }

                resolvedStage
                    .batchDraw?.();

                nodeRef.current =
                    null;

                transformerRef.current =
                    null;
            };
        },
        [
            containerRef,
            height,
            object,
            object?.id,
            onOpen,
            resolvedStage,
            visible,
            width
        ]
    );

    /*
    Focus after the overlay is mounted and positioned.
    */

    useEffect(
        () => {
            if (
                !visible ||
                !layout ||
                !autoFocus
            ) {
                return undefined;
            }

            const animationFrameId =
                window
                    .requestAnimationFrame(
                        () => {
                            const textarea =
                                textareaRef
                                    .current;

                            if (!textarea) {
                                return;
                            }

                            textarea.focus({
                                preventScroll:
                                    true
                            });

                            if (
                                selectAllOnOpen
                            ) {
                                textarea.select();
                            } else {
                                const cursorPosition =
                                    textarea.value
                                        .length;

                                textarea
                                    .setSelectionRange(
                                        cursorPosition,
                                        cursorPosition
                                    );
                            }
                        }
                    );

            return () => {
                window
                    .cancelAnimationFrame(
                        animationFrameId
                    );
            };
        },
        [
            autoFocus,
            layout,
            selectAllOnOpen,
            visible
        ]
    );

    if (
        !visible ||
        !layout
    ) {
        return null;
    }

    const overlayStyle = {
        position:
            "fixed",

        left:
            `${layout.left}px`,

        top:
            `${layout.top}px`,

        zIndex,

        width:
            `${layout.width}px`,

        height:
            `${layout.height}px`,

        transform:
            matrixToCss(
                layout.matrix
            ),

        transformOrigin:
            "0 0",

        pointerEvents:
            "auto",

        ...textStyle,

        ...(
            style ||
            {}
        )
    };

    return createPortal(
        <textarea
            ref={
                textareaRef
            }
            data-fashion-text-editor="true"
            data-object-id={
                object.id
            }
            aria-label="Edit text"
            spellCheck
            value={
                draftText
            }
            onChange={
                handleDraftChange
            }
            onKeyDown={
                handleKeyDown
            }
            onBlur={
                handleBlur
            }
            onPointerDown={
                stopCanvasEvent
            }
            onPointerUp={
                stopCanvasEvent
            }
            onClick={
                stopCanvasEvent
            }
            onDoubleClick={
                stopCanvasEvent
            }
            onMouseDown={
                stopCanvasEvent
            }
            onTouchStart={
                stopCanvasEvent
            }
            onWheel={
                stopCanvasEvent
            }
            className={
                className
            }
            style={
                overlayStyle
            }
        />,
        document.body
    );
}

/*=========================================================
Export
=========================================================*/

TextEditOverlay.displayName =
    "TextEditOverlay";

export default memo(
    TextEditOverlay
);
