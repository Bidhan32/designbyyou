/*
=========================================================
FashionVision Professional Editor
Text Object Renderer
Version 1.1
=========================================================
*/

import React, {
    memo,
    useCallback,
    useMemo,
    useRef
} from "react";

import {
    Group,
    Rect,
    Text
} from "react-konva";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

const DEFAULT_TEXT =
    "Text";

const DEFAULT_FONT_FAMILY =
    "Arial";

const DEFAULT_FONT_SIZE =
    32;

const DEFAULT_FONT_WEIGHT =
    400;

const DEFAULT_FILL =
    "#111111";

const DEFAULT_WIDTH =
    240;

const DEFAULT_HEIGHT =
    64;

const DEFAULT_LINE_HEIGHT =
    1.2;

const MINIMUM_DIMENSION =
    0.0001;

/*
EditorCanvas can listen for this Konva stage event:

stage.on(TEXT_EDIT_REQUEST_EVENT, handler);
*/

export const TEXT_EDIT_REQUEST_EVENT =
    "fashion:text-edit-request";

/*=========================================================
Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const result =
        Number(value);

    return Number.isFinite(
        result
    )
        ? result
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

function positiveNumberOr(
    value,
    fallback = 1
) {
    return Math.max(
        MINIMUM_DIMENSION,
        numberOr(
            value,
            fallback
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

/*=========================================================
Object Value Resolution
=========================================================*/

function resolveTextContent(
    object
) {
    return resolveString(
        [
            object?.text,
            object?.content,
            object?.value,
            object?.style?.text,
            object?.metadata?.text
        ],
        DEFAULT_TEXT
    );
}

function resolveWidth(
    object
) {
    return positiveNumberOr(
        object?.width ??
        object?.geometry?.width ??
        object?.geometry
            ?.boundingBox?.width,
        DEFAULT_WIDTH
    );
}

function resolveHeight(
    object
) {
    return positiveNumberOr(
        object?.height ??
        object?.geometry?.height ??
        object?.geometry
            ?.boundingBox?.height,
        DEFAULT_HEIGHT
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
        object?.style?.fontWeight ??
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

function resolveKonvaFontStyle(
    object
) {
    const style =
        resolveFontStyle(
            object
        );

    const bold =
        resolveFontWeight(
            object
        ) >=
        600;

    if (
        bold &&
        style !==
            "normal"
    ) {
        return `bold ${style}`;
    }

    return bold
        ? "bold"
        : style;
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
            ""
        )
            .toLowerCase();

    return [
        "underline",
        "line-through"
    ].includes(
        requested
    )
        ? requested
        : "";
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
                    ?.textAlign,
                object?.textStyle
                    ?.align
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

function resolveVerticalAlign(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object
                    ?.verticalAlign,
                object?.style
                    ?.verticalAlign,
                object?.textStyle
                    ?.verticalAlign
            ],
            "top"
        )
            .toLowerCase();

    return [
        "top",
        "middle",
        "bottom"
    ].includes(
        requested
    )
        ? requested
        : "top";
}

function resolveWrap(
    object
) {
    const requested =
        resolveNonEmptyString(
            [
                object?.wrap,
                object?.style?.wrap,
                object?.textStyle?.wrap
            ],
            "word"
        )
            .toLowerCase();

    return [
        "word",
        "char",
        "none"
    ].includes(
        requested
    )
        ? requested
        : "word";
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
    return clamp(
        object?.letterSpacing ??
        object?.style
            ?.letterSpacing ??
        object?.textStyle
            ?.letterSpacing ??
        0,
        -100,
        500
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
            object?.style?.color,
            object?.textStyle?.fill,
            object?.textStyle?.color
        ],
        DEFAULT_FILL
    );
}

function resolveObjectOpacity(
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

function resolveCompositeOperation(
    object,
    layer
) {
    const value =
        object
            ?.globalCompositeOperation ||
        object
            ?.compositeOperation ||
        object?.style
            ?.globalCompositeOperation ||
        object?.style
            ?.compositeOperation ||
        object?.blendMode ||
        layer?.blendMode;

    return (
        typeof value ===
            "string" &&
        value.trim()
            ? value.trim()
            : "source-over"
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
Konva Helpers
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

function findObjectRootNode(
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
        return (
            collectionToArray(
                stage.find(
                    ".fashion-editor-object"
                )
            ).find(
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

function findClosestObjectRoot(
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
        if (
            currentNode
                ?.getAttr?.(
                    "editorObjectRoot"
                ) ===
            true
        ) {
            return currentNode;
        }

        currentNode =
            currentNode
                ?.getParent?.() ||
            currentNode?.parent ||
            null;
    }

    return null;
}

/*=========================================================
Text Object
=========================================================*/

function TextObject({
    object,
    layer = null,

    selected:
        selectedProp =
            undefined,

    listening = true,
    transient = false,

    /*
    Optional direct callback. When it is not supplied,
    TextObject emits TEXT_EDIT_REQUEST_EVENT on the Konva
    stage so EditorCanvas can open TextEditOverlay.
    */

    onEdit = null
}) {
    const dragSessionRef =
        useRef(null);

    const activeTool =
        useFashionEditorStore(
            state =>
                state.activeTool
        );

    const selectedFromStore =
        useFashionEditorStore(
            state =>
                Boolean(
                    object?.id &&
                    state
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                )
        );

    const selected =
        selectedProp ===
            undefined
            ? selectedFromStore
            : Boolean(
                selectedProp
            );

    const text =
        resolveTextContent(
            object
        );

    const width =
        resolveWidth(
            object
        );

    const height =
        resolveHeight(
            object
        );

    const fontFamily =
        resolveFontFamily(
            object
        );

    const fontSize =
        resolveFontSize(
            object
        );

    const fontStyle =
        resolveKonvaFontStyle(
            object
        );

    const textDecoration =
        resolveTextDecoration(
            object
        );

    const align =
        resolveTextAlign(
            object
        );

    const verticalAlign =
        resolveVerticalAlign(
            object
        );

    const wrap =
        resolveWrap(
            object
        );

    const lineHeight =
        resolveLineHeight(
            object
        );

    const letterSpacing =
        resolveLetterSpacing(
            object
        );

    const padding =
        resolvePadding(
            object
        );

    const fill =
        resolveFill(
            object
        );

    const direction =
        resolveDirection(
            object
        );

    const isTransient =
        Boolean(
            transient ||
            object?.transient ||
            object?.metadata
                ?.transient
        );

    const visible =
        Boolean(
            object &&
            object.visible !==
                false &&
            layer?.visible !==
                false
        );

    const objectLocked =
        Boolean(
            object?.locked ||
            layer?.locked
        );

    const canListen =
        Boolean(
            visible &&
            listening !==
                false &&
            !isTransient
        );

    const canSelect =
        Boolean(
            canListen &&
            !objectLocked &&
            object?.selectable !==
                false
        );

    const canDrag =
        Boolean(
            canSelect &&
            activeTool ===
                EDITOR_TOOLS
                    .SELECT
        );

    const canEditText =
        Boolean(
            canSelect &&
            activeTool ===
                EDITOR_TOOLS
                    .SELECT
        );

    const commonAttributes =
        useMemo(
            () => ({
                objectId:
                    object?.id,

                editorObjectId:
                    object?.id,

                objectType:
                    object?.type ||
                    "text",

                layerId:
                    object?.layerId ||
                    layer?.id,

                editorObject:
                    true,

                textObject:
                    true,

                transient:
                    isTransient
            }),
            [
                object?.id,
                object?.type,
                object?.layerId,
                layer?.id,
                isTransient
            ]
        );

    const selectObject =
        useCallback(
            event => {
                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    state.activeTool !==
                        EDITOR_TOOLS
                            .SELECT ||
                    !canSelect ||
                    !object?.id
                ) {
                    return false;
                }

                if (event) {
                    event.cancelBubble =
                        true;
                }

                const nativeEvent =
                    event?.evt ||
                    event ||
                    null;

                const additive =
                    Boolean(
                        nativeEvent
                            ?.shiftKey ||
                        nativeEvent
                            ?.ctrlKey ||
                        nativeEvent
                            ?.metaKey
                    );

                if (
                    object.layerId &&
                    state.activeLayerId !==
                        object.layerId
                ) {
                    state.setActiveLayer?.(
                        object.layerId,
                        {
                            clearSelection:
                                false
                        }
                    );
                }

                const nextState =
                    useFashionEditorStore
                        .getState();

                if (additive) {
                    nextState
                        .toggleObjectSelection
                        ?.(
                            object.id
                        );

                    return true;
                }

                if (
                    !nextState
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                ) {
                    nextState
                        .selectObjects
                        ?.([
                            object.id
                        ]);
                }

                return true;
            },
            [
                canSelect,
                object?.id,
                object?.layerId
            ]
        );

    const handlePointerDown =
        useCallback(
            event => {
                selectObject(
                    event
                );
            },
            [
                selectObject
            ]
        );

    const handleEditRequest =
        useCallback(
            event => {
                if (
                    !canEditText ||
                    !object?.id
                ) {
                    return false;
                }

                if (event) {
                    event.cancelBubble =
                        true;
                }

                const eventNode =
                    event?.currentTarget ||
                    event?.target ||
                    null;

                const rootNode =
                    findClosestObjectRoot(
                        eventNode
                    ) ||
                    eventNode;

                const stage =
                    rootNode
                        ?.getStage?.() ||
                    eventNode
                        ?.getStage?.() ||
                    null;

                const state =
                    useFashionEditorStore
                        .getState();

                if (
                    object.layerId &&
                    state.activeLayerId !==
                        object.layerId
                ) {
                    state.setActiveLayer?.(
                        object.layerId,
                        {
                            clearSelection:
                                false
                        }
                    );
                }

                const nextState =
                    useFashionEditorStore
                        .getState();

                if (
                    !nextState
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                ) {
                    nextState
                        .selectObjects
                        ?.([
                            object.id
                        ]);
                }

                const latestObject =
                    useFashionEditorStore
                        .getState()
                        .objects?.[
                            object.id
                        ] ||
                    object;

                const request = {
                    objectId:
                        object.id,

                    object:
                        latestObject,

                    node:
                        rootNode,

                    stage,

                    nativeEvent:
                        event?.evt ||
                        null
                };

                if (
                    typeof onEdit ===
                    "function"
                ) {
                    onEdit(
                        request
                    );
                }

                /*
                The stage event is the default integration path.
                EditorCanvas should listen to this event and set
                its editingTextObject state.
                */

                stage?.fire?.(
                    TEXT_EDIT_REQUEST_EVENT,
                    request,
                    true
                );

                return true;
            },
            [
                canEditText,
                object,
                onEdit
            ]
        );

    const handleDragStart =
        useCallback(
            event => {
                if (
                    !canDrag ||
                    !object?.id
                ) {
                    return;
                }

                selectObject(
                    event
                );

                const state =
                    useFashionEditorStore
                        .getState();

                let selectedIds =
                    state
                        .selectedObjectIds;

                if (
                    !selectedIds.includes(
                        object.id
                    )
                ) {
                    selectedIds = [
                        object.id
                    ];

                    state.selectObjects?.(
                        selectedIds
                    );
                }

                selectedIds =
                    selectedIds.filter(
                        objectId => {
                            const candidate =
                                state.objects[
                                    objectId
                                ];

                            const candidateLayer =
                                state.layers.find(
                                    item =>
                                        item.id ===
                                        candidate
                                            ?.layerId
                                );

                            return Boolean(
                                candidate &&
                                candidate
                                    .visible !==
                                    false &&
                                !candidate
                                    .locked &&
                                candidateLayer &&
                                candidateLayer
                                    .visible !==
                                    false &&
                                !candidateLayer
                                    .locked
                            );
                        }
                    );

                if (
                    selectedIds.length ===
                    0
                ) {
                    return;
                }

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const stage =
                    draggedNode
                        ?.getStage
                        ?.();

                const initialPositions =
                    {};

                const nodeById =
                    {};

                selectedIds.forEach(
                    objectId => {
                        const candidate =
                            state.objects[
                                objectId
                            ];

                        initialPositions[
                            objectId
                        ] = {
                            x:
                                numberOr(
                                    candidate
                                        ?.x,
                                    0
                                ),

                            y:
                                numberOr(
                                    candidate
                                        ?.y,
                                    0
                                )
                        };

                        const node =
                            objectId ===
                                object.id
                                ? draggedNode
                                : findObjectRootNode(
                                    stage,
                                    objectId
                                );

                        if (node) {
                            nodeById[
                                objectId
                            ] = node;
                        }
                    }
                );

                state
                    .beginHistoryTransaction
                    ?.(
                        "Move objects"
                    );

                dragSessionRef.current = {
                    selectedIds,

                    draggedObjectId:
                        object.id,

                    startX:
                        numberOr(
                            draggedNode
                                ?.x?.(),
                            initialPositions[
                                object.id
                            ]?.x ||
                            0
                        ),

                    startY:
                        numberOr(
                            draggedNode
                                ?.y?.(),
                            initialPositions[
                                object.id
                            ]?.y ||
                            0
                        ),

                    initialPositions,

                    nodeById,

                    stage
                };
            },
            [
                canDrag,
                object?.id,
                selectObject
            ]
        );

    const handleDragMove =
        useCallback(
            event => {
                const session =
                    dragSessionRef
                        .current;

                if (!session) {
                    return;
                }

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode
                            ?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode
                            ?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                session
                    .selectedIds
                    .forEach(
                        objectId => {
                            if (
                                objectId ===
                                session
                                    .draggedObjectId
                            ) {
                                return;
                            }

                            const node =
                                session
                                    .nodeById[
                                    objectId
                                ];

                            const initial =
                                session
                                    .initialPositions[
                                    objectId
                                ];

                            if (
                                !node ||
                                !initial
                            ) {
                                return;
                            }

                            node.position({
                                x:
                                    initial.x +
                                    deltaX,

                                y:
                                    initial.y +
                                    deltaY
                            });
                        }
                    );

                session.stage
                    ?.batchDraw
                    ?.();
            },
            []
        );

    const handleDragEnd =
        useCallback(
            event => {
                const session =
                    dragSessionRef
                        .current;

                if (!session) {
                    return;
                }

                dragSessionRef.current =
                    null;

                const draggedNode =
                    event
                        ?.currentTarget ||
                    event?.target;

                const deltaX =
                    numberOr(
                        draggedNode
                            ?.x?.(),
                        session.startX
                    ) -
                    session.startX;

                const deltaY =
                    numberOr(
                        draggedNode
                            ?.y?.(),
                        session.startY
                    ) -
                    session.startY;

                const state =
                    useFashionEditorStore
                        .getState();

                try {
                    if (
                        Math.abs(
                            deltaX
                        ) <
                            0.0001 &&
                        Math.abs(
                            deltaY
                        ) <
                            0.0001
                    ) {
                        state
                            .commitHistoryTransaction
                            ?.();

                        return;
                    }

                    if (
                        typeof state
                            .updateObjects ===
                        "function"
                    ) {
                        state.updateObjects(
                            session
                                .selectedIds,

                            currentObject => {
                                const initial =
                                    session
                                        .initialPositions[
                                        currentObject
                                            .id
                                    ];

                                return initial
                                    ? {
                                        x:
                                            initial.x +
                                            deltaX,

                                        y:
                                            initial.y +
                                            deltaY
                                    }
                                    : {};
                            },

                            "Move objects"
                        );
                    } else {
                        session
                            .selectedIds
                            .forEach(
                                objectId => {
                                    const initial =
                                        session
                                            .initialPositions[
                                            objectId
                                        ];

                                    if (!initial) {
                                        return;
                                    }

                                    state
                                        .updateObject
                                        ?.(
                                            objectId,
                                            {
                                                x:
                                                    initial.x +
                                                    deltaX,

                                                y:
                                                    initial.y +
                                                    deltaY
                                            },
                                            "Move object"
                                        );
                                }
                            );
                    }

                    state
                        .commitHistoryTransaction
                        ?.();
                } catch (error) {
                    state
                        .cancelHistoryTransaction
                        ?.();

                    console.error(
                        "Text object drag failed:",
                        error
                    );
                } finally {
                    session.stage
                        ?.batchDraw
                        ?.();
                }
            },
            []
        );

    if (
        !object ||
        !visible
    ) {
        return null;
    }

    const rootName = [
        "fashion-editor-object",
        "fashion-editor-text-object",

        selected
            ? "fashion-editor-selected-object"
            : "",

        isTransient
            ? "fashion-editor-transient-object"
            : ""
    ]
        .filter(
            Boolean
        )
        .join(
            " "
        );

    return (
        <Group
            id={
                object.id
            }
            name={
                rootName
            }
            objectId={
                object.id
            }
            editorObjectId={
                object.id
            }
            objectType={
                object.type ||
                "text"
            }
            layerId={
                object.layerId ||
                layer?.id
            }
            editorObject
            editorObjectRoot
            textObject
            transient={
                isTransient
            }
            x={
                numberOr(
                    object.x,
                    0
                )
            }
            y={
                numberOr(
                    object.y,
                    0
                )
            }
            width={
                width
            }
            height={
                height
            }
            rotation={
                numberOr(
                    object.rotation,
                    0
                )
            }
            scaleX={
                numberOr(
                    object.scaleX,
                    1
                )
            }
            scaleY={
                numberOr(
                    object.scaleY,
                    1
                )
            }
            skewX={
                numberOr(
                    object.skewX,
                    0
                )
            }
            skewY={
                numberOr(
                    object.skewY,
                    0
                )
            }
            offsetX={
                numberOr(
                    object.offsetX,
                    0
                )
            }
            offsetY={
                numberOr(
                    object.offsetY,
                    0
                )
            }
            visible={
                visible
            }
            opacity={
                resolveObjectOpacity(
                    object
                )
            }
            globalCompositeOperation={
                resolveCompositeOperation(
                    object,
                    layer
                )
            }
            listening={
                canListen
            }
            draggable={
                canDrag
            }
            textEditable={
                canEditText
            }
            onPointerDown={
                handlePointerDown
            }
            onDblClick={
                handleEditRequest
            }
            onDblTap={
                handleEditRequest
            }
            onDragStart={
                handleDragStart
            }
            onDragMove={
                handleDragMove
            }
            onDragEnd={
                handleDragEnd
            }
        >
            {/*
            Stable hit area, including when the text is blank.
            */}

            <Rect
                {...commonAttributes}
                name="fashion-editor-text-hit-area"
                x={0}
                y={0}
                width={
                    width
                }
                height={
                    height
                }
                fill="rgba(0,0,0,0)"
                strokeEnabled={
                    false
                }
                listening={
                    canListen
                }
                perfectDrawEnabled={
                    false
                }
            />

            <Text
                {...commonAttributes}
                name="fashion-editor-text-geometry"
                x={0}
                y={0}
                width={
                    width
                }
                height={
                    height
                }
                text={
                    text
                }
                fill={
                    fill
                }
                fontFamily={
                    fontFamily
                }
                fontSize={
                    fontSize
                }
                fontStyle={
                    fontStyle
                }
                textDecoration={
                    textDecoration
                }
                align={
                    align
                }
                verticalAlign={
                    verticalAlign
                }
                wrap={
                    wrap
                }
                lineHeight={
                    lineHeight
                }
                letterSpacing={
                    letterSpacing
                }
                padding={
                    padding
                }
                direction={
                    direction
                }
                ellipsis={
                    object?.ellipsis ===
                    true
                }
                listening={
                    canListen
                }
                perfectDrawEnabled={
                    false
                }
                shadowForStrokeEnabled={
                    false
                }
            />
        </Group>
    );
}

TextObject.displayName =
    "TextObject";

export default memo(
    TextObject
);