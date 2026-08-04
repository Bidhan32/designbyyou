/*
=========================================================
FashionVision Professional Editor
Professional Brush Tool
Version 1.2 — Symmetry Integrated
=========================================================
*/

import {
    createBrushEngine,
    createBrushStrokeObject
} from "../brushes/BrushEngine";

import {
    BRUSH_RENDER_MODES,
    DEFAULT_BRUSH_PRESET_ID,
    getBrushPreset
} from "../brushes/BrushPresets";

import {
    createPerfectFreehandGeometry
} from "../brushes/PerfectFreehandBrush";

import { defineTool } from "./ToolManager";

import {
    EDITOR_TOOLS,
    useFashionEditorStore
} from "../useFashionEditorStore";

import {
    createSymmetryObjectSet,
    createSymmetryPreviewObjects,
    normalizeSymmetryConfig,
    shouldMirrorTool,
    snapPointToSymmetryAxis
} from "../utils/SymmetryUtils";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_PREVIEW_ID =
    "__fashion-brush-preview__";

const DEFAULT_SYMMETRY_PREVIEW_ID_PREFIX =
    "__fashion-brush-symmetry-preview__";

const DEFAULT_HISTORY_LABEL =
    "Draw brush stroke";

const DEFAULT_SYMMETRY_HISTORY_LABEL =
    "Draw symmetrical brush stroke";

const DEFAULT_SYMMETRY_SNAP_THRESHOLD =
    8;

const MINIMUM_ZOOM =
    0.0001;

const MINIMUM_SAMPLE_DISTANCE =
    0.025;

const MAX_COALESCED_SAMPLES =
    64;

/*=========================================================
Basic Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const numericValue =
        Number(
            value
        );

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

function createId(
    prefix = "brush"
) {
    if (
        typeof globalThis.crypto?.randomUUID ===
        "function"
    ) {
        return (
            `${prefix}-` +
            globalThis.crypto.randomUUID()
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

function nowMilliseconds() {
    if (
        typeof performance !==
            "undefined" &&
        typeof performance.now ===
            "function"
    ) {
        return performance.now();
    }

    return Date.now();
}

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

function safelyPreventDefault(
    event
) {
    const nativeEvent =
        getNativeEvent(
            event
        );

    if (
        !nativeEvent ||
        typeof nativeEvent.preventDefault !==
            "function" ||
        nativeEvent.cancelable ===
            false ||
        nativeEvent.defaultPrevented
    ) {
        return false;
    }

    nativeEvent.preventDefault();

    return true;
}

function requestFrame(
    callback
) {
    if (
        typeof globalThis.requestAnimationFrame ===
        "function"
    ) {
        return globalThis.requestAnimationFrame(
            callback
        );
    }

    return globalThis.setTimeout(
        callback,
        16
    );
}

function cancelFrame(
    frameId
) {
    if (
        frameId ===
            null ||
        frameId ===
            undefined
    ) {
        return;
    }

    if (
        typeof globalThis.cancelAnimationFrame ===
        "function"
    ) {
        globalThis.cancelAnimationFrame(
            frameId
        );

        return;
    }

    globalThis.clearTimeout(
        frameId
    );
}

/*=========================================================
ToolManager Compatibility
=========================================================*/

function isContextLike(
    value
) {
    return Boolean(
        value &&
        typeof value ===
            "object" &&
        (
            value.stage ||
            value.stageRef ||
            value.state ||
            value.editorState ||
            value.actions ||
            value.store ||
            value.toDocumentPoint
        )
    );
}

/*
Some ToolManager versions call handlers as:

    handler(context, event)

Others call handlers as:

    handler(event, context)
*/

function resolveHandlerArguments(
    firstArgument,
    secondArgument
) {
    if (
        isContextLike(
            firstArgument
        )
    ) {
        return {
            context:
                firstArgument,

            event:
                secondArgument
        };
    }

    return {
        context:
            secondArgument,

        event:
            firstArgument
    };
}

function getLatestState(
    context
) {
    return (
        context?.store
            ?.getState
            ?.() ||
        context?.editorStore
            ?.getState
            ?.() ||
        context?.state ||
        context?.editorState ||
        context?.actions ||
        useFashionEditorStore
            .getState() ||
        null
    );
}

function getAction(
    context,
    actionName
) {
    const state =
        getLatestState(
            context
        );

    const candidates = [
        context?.actions?.[
            actionName
        ],

        state?.[
            actionName
        ],

        context?.[
            actionName
        ]
    ];

    return (
        candidates.find(
            candidate =>
                typeof candidate ===
                "function"
        ) ||
        null
    );
}

function setTemporaryObject(
    context,
    object
) {
    context
        ?.setTemporaryObject
        ?.(
            object ||
            null
        );
}

function setTemporaryObjects(
    context,
    objects
) {
    const safeObjects =
        Array.isArray(
            objects
        )
            ? objects.filter(
                Boolean
            )
            : [];

    context
        ?.setTemporaryObjects
        ?.(
            safeObjects
        );

    context
        ?.onTemporaryObjectsChange
        ?.(
            safeObjects
        );
}

function publishTemporaryObjects(
    context,
    primaryObject,
    mirroredObjects = [],
    toolId =
        EDITOR_TOOLS.BRUSH
) {
    const safeMirroredObjects =
        Array.isArray(
            mirroredObjects
        )
            ? mirroredObjects.filter(
                Boolean
            )
            : [];

    const temporaryObjects = [
        primaryObject,
        ...safeMirroredObjects
    ].filter(
        Boolean
    );

    setTemporaryObject(
        context,
        primaryObject ||
        null
    );

    setTemporaryObjects(
        context,
        temporaryObjects
    );

    context
        ?.onTemporaryObjectChange
        ?.(
            primaryObject ||
            null
        );

    context
        ?.manager
        ?.setToolState
        ?.(
            toolId,
            {
                temporaryObject:
                    primaryObject ||
                    null,

                temporaryObjects,

                symmetryTemporaryObjects:
                    safeMirroredObjects,

                drawing:
                    Boolean(
                        primaryObject
                    )
            }
        );

    return temporaryObjects;
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

/*=========================================================
Layer and Document Helpers
=========================================================*/

function getActiveLayer(
    state
) {
    if (
        !state ||
        !Array.isArray(
            state.layers
        )
    ) {
        return null;
    }

    return (
        state.layers.find(
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

function isPointInsideDocument(
    point,
    documentData
) {
    if (
        !point ||
        !documentData
    ) {
        return false;
    }

    const x =
        Number(
            point.x
        );

    const y =
        Number(
            point.y
        );

    if (
        !Number.isFinite(
            x
        ) ||
        !Number.isFinite(
            y
        )
    ) {
        return false;
    }

    const width =
        Math.max(
            1,

            numberOr(
                documentData.width,
                1
            )
        );

    const height =
        Math.max(
            1,

            numberOr(
                documentData.height,
                1
            )
        );

    return (
        x >=
            0 &&
        y >=
            0 &&
        x <=
            width &&
        y <=
            height
    );
}

function clampPointToDocument(
    point,
    documentData
) {
    if (
        !point ||
        !documentData
    ) {
        return point;
    }

    const width =
        Math.max(
            1,

            numberOr(
                documentData.width,
                1
            )
        );

    const height =
        Math.max(
            1,

            numberOr(
                documentData.height,
                1
            )
        );

    return {
        ...point,

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

/*=========================================================
Pointer Helpers
=========================================================*/

function getPointerType(
    nativeEvent
) {
    const pointerType =
        String(
            nativeEvent
                ?.pointerType ||
            "mouse"
        ).toLowerCase();

    if (
        [
            "mouse",
            "pen",
            "touch"
        ].includes(
            pointerType
        )
    ) {
        return pointerType;
    }

    return "unknown";
}

function isPrimaryPointer(
    nativeEvent
) {
    if (
        !nativeEvent ||
        nativeEvent.isPrimary ===
            false
    ) {
        return false;
    }

    if (
        getPointerType(
            nativeEvent
        ) ===
        "touch"
    ) {
        return true;
    }

    const button =
        Number(
            nativeEvent.button
        );

    return (
        !Number.isFinite(
            button
        ) ||
        button ===
            0 ||
        button ===
            -1
    );
}

function pointerMatchesSession(
    session,
    nativeEvent
) {
    if (
        !session
    ) {
        return false;
    }

    const eventPointerId =
        nativeEvent?.pointerId;

    if (
        session.pointerId ===
            null ||
        session.pointerId ===
            undefined ||
        eventPointerId ===
            null ||
        eventPointerId ===
            undefined
    ) {
        return true;
    }

    return (
        session.pointerId ===
        eventPointerId
    );
}

function getContainerRectangle(
    context
) {
    const container =
        context?.container ||
        context?.containerRef
            ?.current ||
        context?.stage
            ?.container
            ?.();

    return (
        container
            ?.getBoundingClientRect
            ?.() ||
        null
    );
}

function getScreenPointFromSample(
    sample,
    context
) {
    const rectangle =
        getContainerRectangle(
            context
        );

    const clientX =
        Number(
            sample?.clientX
        );

    const clientY =
        Number(
            sample?.clientY
        );

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

    const stagePoint =
        context?.stage
            ?.getPointerPosition
            ?.();

    if (
        stagePoint &&
        Number.isFinite(
            Number(
                stagePoint.x
            )
        ) &&
        Number.isFinite(
            Number(
                stagePoint.y
            )
        )
    ) {
        return {
            x:
                Number(
                    stagePoint.x
                ),

            y:
                Number(
                    stagePoint.y
                )
        };
    }

    return null;
}

function screenPointToDocumentPoint(
    screenPoint,
    context,
    state
) {
    if (
        !screenPoint
    ) {
        return null;
    }

    if (
        typeof context?.toDocumentPoint ===
        "function"
    ) {
        const converted =
            context.toDocumentPoint(
                screenPoint
            );

        if (
            converted &&
            Number.isFinite(
                Number(
                    converted.x
                )
            ) &&
            Number.isFinite(
                Number(
                    converted.y
                )
            )
        ) {
            return {
                x:
                    Number(
                        converted.x
                    ),

                y:
                    Number(
                        converted.y
                    )
            };
        }
    }

    const viewport =
        state?.viewport ||
        context?.viewport ||
        {};

    const zoom =
        Math.max(
            MINIMUM_ZOOM,

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

function createBrushPoint(
    sample,
    context,
    state,
    options = {}
) {
    const screenPoint =
        getScreenPointFromSample(
            sample,
            context
        );

    if (
        !screenPoint
    ) {
        return null;
    }

    let documentPoint =
        screenPointToDocumentPoint(
            screenPoint,
            context,
            state
        );

    if (
        !documentPoint
    ) {
        return null;
    }

    if (
        options.symmetry?.enabled &&
        options.symmetry
            .snapToAxis
    ) {
        documentPoint =
            snapPointToSymmetryAxis(
                documentPoint,
                options.symmetry,

                options.symmetrySnapThreshold ??
                DEFAULT_SYMMETRY_SNAP_THRESHOLD
            );
    }

    if (
        options.clampToDocument !==
        false
    ) {
        documentPoint =
            clampPointToDocument(
                documentPoint,
                state?.document
            );
    }

    const pointerType =
        getPointerType(
            sample
        );

    const rawPressure =
        Number(
            sample?.pressure
        );

    let pressure =
        Number.isFinite(
            rawPressure
        )
            ? clamp(
                rawPressure,
                0,
                1
            )
            : null;

    /*
    Mouse events commonly report pressure 0
    even while drawing.
    */

    if (
        pointerType ===
            "mouse" &&
        pressure ===
            0
    ) {
        pressure =
            null;
    }

    return {
        x:
            documentPoint.x,

        y:
            documentPoint.y,

        pressure,

        tiltX:
            clamp(
                sample?.tiltX,
                -90,
                90
            ),

        tiltY:
            clamp(
                sample?.tiltY,
                -90,
                90
            ),

        twist:
            numberOr(
                sample?.twist,
                0
            ),

        tangentialPressure:
            clamp(
                sample
                    ?.tangentialPressure,
                -1,
                1
            ),

        pointerType,

        pointerId:
            sample?.pointerId ??
            null,

        time:
            numberOr(
                sample?.timeStamp,
                nowMilliseconds()
            )
    };
}

function getEventSamples(
    event
) {
    const nativeEvent =
        getNativeEvent(
            event
        );

    if (
        !nativeEvent
    ) {
        return [];
    }

    if (
        typeof nativeEvent
            .getCoalescedEvents ===
        "function"
    ) {
        try {
            const coalescedEvents =
                nativeEvent
                    .getCoalescedEvents();

            if (
                Array.isArray(
                    coalescedEvents
                ) &&
                coalescedEvents.length >
                    0
            ) {
                return coalescedEvents.slice(
                    -MAX_COALESCED_SAMPLES
                );
            }
        } catch {
            // Fall back to the original event.
        }
    }

    return [
        nativeEvent
    ];
}

/*=========================================================
Brush Settings
=========================================================*/

function resolveStrokeSettings(
    state
) {
    const brushState =
        isPlainObject(
            state?.brush
        )
            ? state.brush
            : {};

    const primaryColor =
        typeof state?.colors
            ?.primary ===
            "string" &&
        state.colors.primary.trim()
            ? state.colors.primary
                .trim()
            : typeof brushState
                .color ===
                "string" &&
              brushState.color.trim()
                ? brushState.color
                    .trim()
                : "#111111";

    return {
        ...brushState,

        presetId:
            brushState.presetId ||
            DEFAULT_BRUSH_PRESET_ID,

        color:
            primaryColor
    };
}

function resolveSymmetrySettings(
    state,
    context,
    documentData
) {
    const source = {
        ...(
            isPlainObject(
                state?.symmetry
            )
                ? state.symmetry
                : {}
        ),

        ...(
            isPlainObject(
                context?.symmetry
            )
                ? context.symmetry
                : {}
        )
    };

    const normalized =
        normalizeSymmetryConfig(
            source,
            documentData
        );

    return {
        ...normalized,

        enabled:
            shouldMirrorTool(
                EDITOR_TOOLS.BRUSH,
                normalized
            )
    };
}

function createFreehandOptions(
    processedStroke
) {
    const settings =
        processedStroke?.settings ||
        {};

    /*
    BrushEngine already calculates pressure,
    velocity, taper and width.

    PerfectFreehandBrush only converts those
    calculated widths into a closed outline.
    */

    return {
        size:
            numberOr(
                processedStroke?.size,

                numberOr(
                    settings.size,
                    4
                )
            ),

        thinning:
            0,

        smoothing:
            0,

        streamline:
            0,

        pressureEnabled:
            false,

        simulatePressure:
            false,

        usePointWidth:
            true,

        applyTaperToPointWidth:
            false,

        taperStart:
            0,

        taperEnd:
            0,

        minimumWidth:
            Math.max(
                0.01,

                numberOr(
                    settings.minimumSize,
                    0.05
                )
            ),

        minimumPointDistance:
            0.001,

        widthSmoothing:
            clamp(
                numberOr(
                    settings.smoothing,
                    0.5
                ) *
                0.35,
                0,
                0.4
            ),

        startCap:
            "round",

        endCap:
            "round",

        join:
            "round",

        capSegments:
            12,

        smoothSvgPath:
            true,

        svgPrecision:
            2
    };
}

/*=========================================================
Brush Object Creation
=========================================================*/

function attachRenderedGeometry(
    brushObject,
    processedStroke
) {
    if (
        !brushObject ||
        !processedStroke
    ) {
        return brushObject;
    }

    /*
    Line and stamp modes already contain
    the required geometry from BrushEngine.
    */

    if (
        processedStroke.renderMode !==
        BRUSH_RENDER_MODES.OUTLINE
    ) {
        return {
            ...brushObject,

            previewPoints:
                processedStroke
                    .flatPoints,

            geometry: {
                ...brushObject.geometry,

                boundingBox: {
                    ...processedStroke
                        .bounds
                }
            }
        };
    }

    const freehandGeometry =
        createPerfectFreehandGeometry(
            processedStroke.points,

            createFreehandOptions(
                processedStroke
            )
        );

    if (
        !freehandGeometry.valid
    ) {
        return brushObject;
    }

    return {
        ...brushObject,

        outlinePoints:
            freehandGeometry
                .outlinePoints,

        flatOutlinePoints:
            freehandGeometry
                .flatOutlinePoints,

        svgPath:
            freehandGeometry
                .svgPath,

        previewPoints:
            freehandGeometry
                .flatOutlinePoints,

        geometry: {
            ...brushObject.geometry,

            length:
                freehandGeometry
                    .length,

            minimumWidth:
                freehandGeometry
                    .minimumWidth,

            maximumWidth:
                freehandGeometry
                    .maximumWidth,

            boundingBox: {
                ...freehandGeometry
                    .bounds
            },

            freehand: {
                version:
                    freehandGeometry
                        .version,

                outlinePoints:
                    freehandGeometry
                        .outlinePoints,

                flatOutlinePoints:
                    freehandGeometry
                        .flatOutlinePoints,

                svgPath:
                    freehandGeometry
                        .svgPath
            }
        }
    };
}

function buildBrushObject(
    processedStroke,
    session,
    options = {}
) {
    if (
        !processedStroke?.valid ||
        !session
    ) {
        return null;
    }

    const preset =
        getBrushPreset(
            processedStroke.presetId
        );

    const brushObject =
        createBrushStrokeObject(
            processedStroke.rawPoints,
            processedStroke.settings,
            {
                id:
                    options.id ||
                    session.objectId,

                strokeId:
                    processedStroke.id,

                layerId:
                    session.layerId,

                name:
                    `${preset?.name || "Brush"} Stroke`,

                processedStroke,

                keepRawPoints:
                    options.keepRawPoints !==
                    false,

                metadata: {
                    tool:
                        EDITOR_TOOLS.BRUSH,

                    presetId:
                        processedStroke.presetId,

                    pointerType:
                        session.pointerType,

                    transient:
                        options.transient ===
                        true
                }
            }
        );

    if (
        !brushObject
    ) {
        return null;
    }

    return attachRenderedGeometry(
        {
            ...brushObject,

            id:
                options.id ||
                brushObject.id,

            transient:
                options.transient ===
                true,

            selectable:
                options.transient !==
                true,

            locked:
                options.transient ===
                true,

            visible:
                true,

            metadata: {
                ...brushObject.metadata,

                transient:
                    options.transient ===
                    true
            }
        },

        processedStroke
    );
}

/*=========================================================
Symmetry and Commit Helpers
=========================================================*/

function createCommittedBrushObjects(
    brushObject,
    session,
    documentData,
    options = {}
) {
    if (
        !session?.symmetry?.enabled
    ) {
        return [
            brushObject
        ];
    }

    return createSymmetryObjectSet(
        brushObject,
        session.symmetry,
        {
            document:
                session.document ||
                documentData,

            preventDuplicates:
                options
                    .preventSymmetryDuplicates !==
                false,

            linked:
                session.symmetry
                    .linkedMirrors ===
                true
        }
    );
}

function commitBrushObjects(
    context,
    objects,
    options = {}
) {
    const safeObjects =
        Array.isArray(
            objects
        )
            ? objects.filter(
                Boolean
            )
            : [];

    if (
        safeObjects.length ===
        0
    ) {
        return [];
    }

    const historyLabel =
        safeObjects.length >
        1
            ? (
                options.symmetryHistoryLabel ||
                DEFAULT_SYMMETRY_HISTORY_LABEL
            )
            : (
                options.historyLabel ||
                DEFAULT_HISTORY_LABEL
            );

    const selectCreatedStroke =
        options.selectCreatedStroke ===
        true;

    const addObjects =
        getAction(
            context,
            "addObjects"
        );

    if (
        addObjects
    ) {
        const objectIds =
            addObjects(
                safeObjects,
                {
                    label:
                        historyLabel,

                    select:
                        selectCreatedStroke
                }
            );

        return Array.isArray(
            objectIds
        )
            ? objectIds
            : [];
    }

    const addObject =
        getAction(
            context,
            "addObject"
        );

    if (
        !addObject
    ) {
        throw new Error(
            "BrushTool requires an addObject or addObjects action in the editor context."
        );
    }

    const beginHistoryTransaction =
        getAction(
            context,
            "beginHistoryTransaction"
        );

    const commitHistoryTransaction =
        getAction(
            context,
            "commitHistoryTransaction"
        );

    const cancelHistoryTransaction =
        getAction(
            context,
            "cancelHistoryTransaction"
        );

    const deleteObjects =
        getAction(
            context,
            "deleteObjects"
        );

    const useTransaction =
        safeObjects.length >
            1 &&
        beginHistoryTransaction &&
        commitHistoryTransaction;

    const objectIds =
        [];

    if (
        useTransaction
    ) {
        beginHistoryTransaction(
            historyLabel
        );
    }

    try {
        for (
            const object
            of safeObjects
        ) {
            const objectId =
                addObject(
                    object,
                    {
                        label:
                            historyLabel,

                        select:
                            selectCreatedStroke
                    }
                );

            if (
                !objectId
            ) {
                throw new Error(
                    "Brush object could not be added."
                );
            }

            objectIds.push(
                objectId
            );
        }

        if (
            useTransaction
        ) {
            commitHistoryTransaction();
        }

        return objectIds;
    } catch (
        error
    ) {
        if (
            useTransaction &&
            cancelHistoryTransaction
        ) {
            cancelHistoryTransaction();
        } else if (
            objectIds.length >
                0 &&
            deleteObjects
        ) {
            deleteObjects(
                objectIds,
                "Rollback brush stroke"
            );
        }

        console.error(
            "BrushTool commit failed:",
            error
        );

        return [];
    }
}

/*=========================================================
Brush Tool Factory
=========================================================*/

export function createBrushTool(
    options = {}
) {
    const toolId =
        options.id ||
        EDITOR_TOOLS.BRUSH;

    const previewId =
        options.previewId ||
        DEFAULT_PREVIEW_ID;

    const historyLabel =
        options.historyLabel ||
        DEFAULT_HISTORY_LABEL;

    const symmetryHistoryLabel =
        options.symmetryHistoryLabel ||
        DEFAULT_SYMMETRY_HISTORY_LABEL;

    const symmetryPreviewIdPrefix =
        options.symmetryPreviewIdPrefix ||
        DEFAULT_SYMMETRY_PREVIEW_ID_PREFIX;

    const symmetrySnapThreshold =
        Math.max(
            0,

            numberOr(
                options.symmetrySnapThreshold,
                DEFAULT_SYMMETRY_SNAP_THRESHOLD
            )
        );

    let session =
        null;

    let previewFrameId =
        null;

    let latestPreviewContext =
        null;

    function clearPreviewFrame() {
        if (
            previewFrameId !==
            null
        ) {
            cancelFrame(
                previewFrameId
            );

            previewFrameId =
                null;
        }
    }

    function clearPreview(
        context
    ) {
        publishTemporaryObjects(
            context,
            null,
            [],
            toolId
        );

        requestRender(
            context
        );
    }

    function renderPreview(
        context
    ) {
        if (
            !session ||
            !session.engine
                .isDrawing()
        ) {
            clearPreview(
                context
            );

            return null;
        }

        const processedStroke =
            session.engine
                .getPreview({
                    minimumPointDistance:
                        session.minimumPointDistance
                });

        const previewObject =
            buildBrushObject(
                processedStroke,
                session,
                {
                    id:
                        previewId,

                    transient:
                        true,

                    keepRawPoints:
                        false
                }
            );

        if (
            !previewObject
        ) {
            clearPreview(
                context
            );

            return null;
        }

        const symmetryPreviewObjects =
            session.symmetry?.enabled &&
            options.symmetryPreviewEnabled !==
                false
                ? createSymmetryPreviewObjects(
                    previewObject,
                    session.symmetry,
                    {
                        document:
                            session.document,

                        preventDuplicates:
                            options.preventSymmetryDuplicates !==
                            false,

                        previewIdPrefix:
                            `${symmetryPreviewIdPrefix}-${session.strokeId}`
                    }
                )
                : [];

        const temporaryObjects =
            publishTemporaryObjects(
                context,
                previewObject,
                symmetryPreviewObjects,
                toolId
            );

        requestRender(
            context
        );

        return temporaryObjects;
    }

    function schedulePreview(
        context
    ) {
        latestPreviewContext =
            context;

        if (
            previewFrameId !==
            null
        ) {
            return;
        }

        previewFrameId =
            requestFrame(
                () => {
                    previewFrameId =
                        null;

                    renderPreview(
                        latestPreviewContext
                    );
                }
            );
    }

    function addEventPoints(
        event,
        context
    ) {
        if (
            !session
        ) {
            return 0;
        }

        const nativeEvent =
            getNativeEvent(
                event
            );

        if (
            !pointerMatchesSession(
                session,
                nativeEvent
            )
        ) {
            return 0;
        }

        const state =
            getLatestState(
                context
            );

        if (
            !state
        ) {
            return 0;
        }

        let addedCount =
            0;

        getEventSamples(
            event
        ).forEach(
            sample => {
                const point =
                    createBrushPoint(
                        sample,
                        context,
                        state,
                        {
                            clampToDocument:
                                true,

                            symmetry:
                                session.symmetry,

                            symmetrySnapThreshold
                        }
                    );

                if (
                    point &&
                    session.engine
                        .addPoint(
                            point
                        )
                ) {
                    addedCount +=
                        1;
                }
            }
        );

        return addedCount;
    }

    function cancelStroke(
        context
    ) {
        clearPreviewFrame();

        session?.engine
            ?.cancelStroke();

        session =
            null;

        latestPreviewContext =
            null;

        clearPreview(
            context
        );

        return true;
    }

    function startStroke(
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
            !context ||
            !isPrimaryPointer(
                nativeEvent
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

        const symmetry =
            resolveSymmetrySettings(
                state,
                context,
                state.document
            );

        const firstPoint =
            createBrushPoint(
                nativeEvent,
                context,
                state,
                {
                    clampToDocument:
                        false,

                    symmetry,

                    symmetrySnapThreshold
                }
            );

        if (
            !firstPoint ||
            !isPointInsideDocument(
                firstPoint,
                state.document
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            nativeEvent
        );

        if (
            session
        ) {
            cancelStroke(
                context
            );
        }

        const strokeSettings =
            resolveStrokeSettings(
                state
            );

        const zoom =
            Math.max(
                MINIMUM_ZOOM,

                numberOr(
                    state.viewport?.zoom,
                    1
                )
            );

        const minimumPointDistance =
            Math.max(
                MINIMUM_SAMPLE_DISTANCE,

                numberOr(
                    options.minimumPointDistance,

                    numberOr(
                        strokeSettings.size,
                        4
                    ) *
                    0.015 /
                    zoom
                )
            );

        const engine =
            createBrushEngine({
                settings:
                    strokeSettings,

                minimumPointDistance,

                maxRawPoints:
                    options.maxRawPoints
            });

        const objectId =
            createId(
                "brush"
            );

        const strokeId =
            createId(
                "stroke"
            );

        const started =
            engine.beginStroke(
                firstPoint,
                {
                    id:
                        strokeId,

                    pointerId:
                        nativeEvent?.pointerId ??
                        firstPoint.pointerId,

                    layerId:
                        activeLayer.id,

                    settings:
                        strokeSettings
                }
            );

        if (
            !started
        ) {
            return false;
        }

        session = {
            objectId,

            strokeId,

            pointerId:
                nativeEvent?.pointerId ??
                firstPoint.pointerId ??
                null,

            pointerType:
                firstPoint.pointerType,

            layerId:
                activeLayer.id,

            documentId:
                state.document?.id ??
                null,

            document: {
                width:
                    Math.max(
                        1,

                        numberOr(
                            state.document?.width,
                            1200
                        )
                    ),

                height:
                    Math.max(
                        1,

                        numberOr(
                            state.document?.height,
                            1600
                        )
                    )
            },

            symmetry,

            minimumPointDistance,

            engine,

            startedAt:
                nowMilliseconds()
        };

        renderPreview(
            context
        );

        return true;
    }

    function continueStroke(
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
            !session
        ) {
            return false;
        }

        const nativeEvent =
            getNativeEvent(
                event
            );

        if (
            !pointerMatchesSession(
                session,
                nativeEvent
            )
        ) {
            return false;
        }

        safelyPreventDefault(
            nativeEvent
        );

        if (
            addEventPoints(
                event,
                context
            ) >
            0
        ) {
            schedulePreview(
                context
            );
        }

        return true;
    }

    function finishStroke(
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
            !session
        ) {
            return false;
        }

        const nativeEvent =
            getNativeEvent(
                event
            );

        if (
            !pointerMatchesSession(
                session,
                nativeEvent
            )
        ) {
            return false;
        }

        /*
        Never call preventDefault here.

        Browsers can mark pointerup or touchend
        as non-cancelable after gesture handling.
        */

        addEventPoints(
            event,
            context
        );

        clearPreviewFrame();

        const completedSession =
            session;

        const processedStroke =
            completedSession.engine
                .endStroke(
                    null,
                    {
                        minimumPointDistance:
                            completedSession.minimumPointDistance
                    }
                );

        session =
            null;

        latestPreviewContext =
            null;

        clearPreview(
            context
        );

        if (
            !processedStroke?.valid
        ) {
            return true;
        }

        const state =
            getLatestState(
                context
            );

        const layer =
            state?.layers?.find(
                item =>
                    item.id ===
                    completedSession.layerId
            );

        if (
            !state ||
            !canDrawOnLayer(
                layer
            ) ||
            (
                completedSession.documentId &&
                state.document?.id !==
                    completedSession.documentId
            )
        ) {
            return true;
        }

        const brushObject =
            buildBrushObject(
                processedStroke,
                completedSession,
                {
                    id:
                        completedSession.objectId,

                    transient:
                        false,

                    keepRawPoints:
                        options.keepRawPoints !==
                        false
                }
            );

        if (
            !brushObject
        ) {
            return true;
        }

        const committedObjects =
            createCommittedBrushObjects(
                brushObject,
                completedSession,
                state.document,
                options
            );

        const objectIds =
            commitBrushObjects(
                context,
                committedObjects,
                {
                    ...options,

                    historyLabel,

                    symmetryHistoryLabel
                }
            );

        if (
            objectIds.length ===
            0
        ) {
            context
                ?.onStrokeDiscarded
                ?.({
                    reason:
                        "objects-not-added",

                    object:
                        brushObject,

                    objects:
                        committedObjects,

                    session:
                        completedSession
                });

            return true;
        }

        context
            ?.manager
            ?.setToolState
            ?.(
                toolId,
                {
                    temporaryObject:
                        null,

                    temporaryObjects:
                        [],

                    symmetryTemporaryObjects:
                        [],

                    drawing:
                        false,

                    lastCommittedObjectId:
                        objectIds[0],

                    lastCommittedObjectIds:
                        objectIds
                }
            );

        context
            ?.onStrokeCommitted
            ?.({
                objectId:
                    objectIds[0],

                objectIds,

                object:
                    committedObjects[0] ||
                    brushObject,

                objects:
                    committedObjects,

                mirroredObjects:
                    committedObjects.slice(
                        1
                    ),

                symmetry:
                    completedSession.symmetry,

                session:
                    completedSession
            });

        requestRender(
            context
        );

        return true;
    }

    function cancelPointerStroke(
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
            session &&
            !pointerMatchesSession(
                session,
                nativeEvent
            )
        ) {
            return false;
        }

        return cancelStroke(
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

        return cancelStroke(
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

        return cancelStroke(
            context
        );
    }

    return defineTool({
        id:
            toolId,

        name:
            options.name ||
            "Brush",

        label:
            options.label ||
            "Brush",

        shortcut:
            options.shortcut ||
            "B",

        cursor:
            options.cursor ||
            "crosshair",

        allowOutsideDocument:
            false,

        onActivate:
            activateTool,

        onDeactivate:
            deactivateTool,

        onPointerDown:
            startStroke,

        onPointerMove:
            continueStroke,

        onPointerUp:
            finishStroke,

        onPointerCancel:
            cancelPointerStroke,

        onCancel:
            cancelInteraction,

        getCursor:
            () =>
                options.cursor ||
                "crosshair"
    });
}

/*=========================================================
Default Brush Tool
=========================================================*/

export const BrushTool =
    createBrushTool();

export default BrushTool;