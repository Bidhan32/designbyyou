import { create } from "zustand";

/*=========================================================
FashionVision Professional 2D Editor Store
Version 1.0
=========================================================*/

/*=========================================================
Schema and Limits
=========================================================*/

export const PROJECT_SCHEMA_VERSION = 1;

export const DEFAULT_DOCUMENT_WIDTH = 1200;
export const DEFAULT_DOCUMENT_HEIGHT = 1600;

export const DEFAULT_HISTORY_LIMIT = 100;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/*=========================================================
Editor Tools
=========================================================*/

export const EDITOR_TOOLS = Object.freeze({
    SELECT: "select",

    PENCIL: "pencil",
    BRUSH: "brush",
    ERASER: "eraser",

    LINE: "line",
    SHAPE: "shape",
    FILL: "fill",

    TEXT: "text",
    IMAGE: "image",
    PATTERN: "pattern",

    EYEDROPPER: "eyedropper",

    PAN: "pan",
    ZOOM: "zoom"
});

/*=========================================================
Object Types
=========================================================*/

export const OBJECT_TYPES = Object.freeze({
    BRUSH: "brush",
    SHAPE: "shape",
    TEXT: "text",
    IMAGE: "image",
    PATTERN: "pattern",
    GROUP: "group"
});

/*=========================================================
Blend Modes
=========================================================*/

export const BLEND_MODES = Object.freeze([
    "source-over",

    "multiply",
    "screen",
    "overlay",

    "darken",
    "lighten",

    "color-dodge",
    "color-burn",

    "hard-light",
    "soft-light",

    "difference",
    "exclusion",

    "hue",
    "saturation",
    "color",
    "luminosity"
]);

/*=========================================================
Numeric Helpers
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
            numberOr(value, minimum)
        )
    );
}

/*=========================================================
General Helpers
=========================================================*/

function nowIso() {
    return new Date().toISOString();
}

function createId(
    prefix = "item"
) {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return (
        `${prefix}-${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

function cloneSerializable(
    value
) {
    if (
        typeof globalThis.structuredClone ===
        "function"
    ) {
        try {
            return globalThis.structuredClone(
                value
            );
        } catch {
            // Fall through to JSON cloning.
        }
    }

    return JSON.parse(
        JSON.stringify(value)
    );
}

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function uniqueIds(
    values = []
) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [
        ...new Set(
            values.filter(
                value =>
                    typeof value === "string" &&
                    value.length > 0
            )
        )
    ];
}

function moveArrayItem(
    values,
    fromIndex,
    toIndex
) {
    if (!Array.isArray(values)) {
        return [];
    }

    const result = [
        ...values
    ];

    const safeFrom =
        clamp(
            fromIndex,
            0,
            Math.max(
                0,
                result.length - 1
            )
        );

    const safeTo =
        clamp(
            toIndex,
            0,
            Math.max(
                0,
                result.length - 1
            )
        );

    if (
        safeFrom === safeTo ||
        result.length < 2
    ) {
        return result;
    }

    const [
        movedItem
    ] = result.splice(
        safeFrom,
        1
    );

    result.splice(
        safeTo,
        0,
        movedItem
    );

    return result;
}

/*=========================================================
Default Document
=========================================================*/

export function createDefaultDocument(
    overrides = {}
) {
    const timestamp =
        nowIso();

    return {
        id:
            overrides.id ||
            createId("document"),

        name:
            typeof overrides.name ===
                "string" &&
            overrides.name.trim()
                ? overrides.name.trim()
                : "Untitled Fashion Design",

        width:
            Math.max(
                100,
                numberOr(
                    overrides.width,
                    DEFAULT_DOCUMENT_WIDTH
                )
            ),

        height:
            Math.max(
                100,
                numberOr(
                    overrides.height,
                    DEFAULT_DOCUMENT_HEIGHT
                )
            ),

        background:
            typeof overrides.background ===
                "string"
                ? overrides.background
                : "#ffffff",

        unit:
            overrides.unit ||
            "px",

        dpi:
            Math.max(
                72,
                numberOr(
                    overrides.dpi,
                    144
                )
            ),

        schemaVersion:
            PROJECT_SCHEMA_VERSION,

        createdAt:
            overrides.createdAt ||
            timestamp,

        updatedAt:
            overrides.updatedAt ||
            timestamp
    };
}

/*=========================================================
Default Layer
=========================================================*/

export function createDefaultLayer(
    overrides = {},
    index = 0
) {
    return {
        id:
            overrides.id ||
            createId("layer"),

        name:
            typeof overrides.name ===
                "string" &&
            overrides.name.trim()
                ? overrides.name.trim()
                : `Layer ${index + 1}`,

        visible:
            overrides.visible !== false,

        locked:
            Boolean(
                overrides.locked
            ),

        opacity:
            clamp(
                overrides.opacity ?? 1,
                0,
                1
            ),

        blendMode:
            BLEND_MODES.includes(
                overrides.blendMode
            )
                ? overrides.blendMode
                : "source-over",

        objectIds:
            uniqueIds(
                overrides.objectIds
            ),

        createdAt:
            overrides.createdAt ||
            nowIso(),

        updatedAt:
            overrides.updatedAt ||
            nowIso()
    };
}

/*=========================================================
Default Brush Settings
=========================================================*/

function createDefaultBrushSettings() {
    return {
        presetId:
            "pencil-basic",

        brushType:
            "pencil",

        color:
            "#111111",

        size:
            4,

        opacity:
            1,

        smoothing:
            0.55,

        streamline:
            0.45,

        thinning:
            0,

        taperStart:
            0,

        taperEnd:
            0,

        pressureEnabled:
            true,

        simulatePressure:
            true
    };
}

/*=========================================================
Default Eraser Settings
=========================================================*/

function createDefaultEraserSettings() {
    return {
        mode:
            "stroke",

        size:
            36,

        minimumSize:
            4,

        maximumSize:
            300
    };
}

/*=========================================================
Default Shape Settings
=========================================================*/

function createDefaultShapeSettings() {
    return {
        shapeType:
            "rectangle",

        stroke:
            "#111111",

        strokeWidth:
            3,

        strokeOpacity:
            1,

        fillType:
            "none",

        fill:
            "#ffffff",

        fillOpacity:
            1,

        cornerRadius:
            0,

        sides:
            5,

        keepAspectRatio:
            false
    };
}

/*=========================================================
Default Fill Settings
=========================================================*/

function createDefaultFillSettings() {
    return {
        fillType:
            "solid",

        color:
            "#d946ef",

        opacity:
            1,

        tolerance:
            24,

        contiguous:
            true,

        gradient:
            null,

        pattern:
            null
    };
}

/*=========================================================
Default Text Settings
=========================================================*/

function createDefaultTextSettings() {
    return {
        fontFamily:
            "Arial",

        fontSize:
            32,

        fontStyle:
            "normal",

        fontWeight:
            400,

        align:
            "left",

        lineHeight:
            1.2,

        letterSpacing:
            0,

        fill:
            "#111111",

        opacity:
            1
    };
}

/*=========================================================
Default Viewport
=========================================================*/

function createDefaultViewport() {
    return {
        zoom:
            1,

        x:
            0,

        y:
            0
    };
}

/*=========================================================
Default UI State
=========================================================*/

function createDefaultUiState() {
    return {
        leftPanelOpen:
            true,

        rightPanelOpen:
            true,

        bottomPanelOpen:
            true,

        rightPanelTab:
            "properties",

        bottomPanelTab:
            "colors",

        showGrid:
            false,

        gridSize:
            20,

        snapToGrid:
            false,

        showRulers:
            true,

        showGuides:
            true,

        canvasCursor:
            "crosshair"
    };
}

/*=========================================================
Normalize Canvas Object
=========================================================*/

export function normalizeEditorObject(
    object = {},
    fallbackLayerId
) {
    const source =
        isPlainObject(object)
            ? object
            : {};

    const timestamp =
        nowIso();

    const type =
        Object.values(
            OBJECT_TYPES
        ).includes(source.type)
            ? source.type
            : OBJECT_TYPES.BRUSH;

    return {
        ...source,

        id:
            source.id ||
            createId(type),

        type,

        layerId:
            source.layerId ||
            fallbackLayerId,

        name:
            typeof source.name ===
                "string" &&
            source.name.trim()
                ? source.name.trim()
                : type,

        visible:
            source.visible !==
            false,

        locked:
            Boolean(
                source.locked
            ),

        opacity:
            clamp(
                source.opacity ?? 1,
                0,
                1
            ),

        x:
            numberOr(
                source.x,
                0
            ),

        y:
            numberOr(
                source.y,
                0
            ),

        rotation:
            numberOr(
                source.rotation,
                0
            ),

        scaleX:
            numberOr(
                source.scaleX,
                1
            ),

        scaleY:
            numberOr(
                source.scaleY,
                1
            ),

        skewX:
            numberOr(
                source.skewX,
                0
            ),

        skewY:
            numberOr(
                source.skewY,
                0
            ),

        createdAt:
            source.createdAt ||
            timestamp,

        updatedAt:
            source.updatedAt ||
            timestamp
    };
}

/*=========================================================
Create Initial Content
=========================================================*/

function createInitialContent(
    documentOverrides = {}
) {
    const initialLayer =
        createDefaultLayer(
            {
                name:
                    "Layer 1"
            },
            0
        );

    return {
        document:
            createDefaultDocument(
                documentOverrides
            ),

        layers: [
            initialLayer
        ],

        objects: {},

        activeLayerId:
            initialLayer.id,

        selectedObjectIds: []
    };
}

/*=========================================================
Project Normalization
=========================================================*/

export function normalizeProjectData(
    project = {}
) {
    const source =
        isPlainObject(project)
            ? project
            : {};

    const documentData =
        createDefaultDocument(
            source.document ||
            {}
        );

    let layers =
        Array.isArray(
            source.layers
        )
            ? source.layers.map(
                (
                    layer,
                    index
                ) =>
                    createDefaultLayer(
                        layer,
                        index
                    )
            )
            : [];

    if (
        layers.length === 0
    ) {
        layers = [
            createDefaultLayer(
                {
                    name:
                        "Layer 1"
                },
                0
            )
        ];
    }

    const layerIds =
        new Set(
            layers.map(
                layer =>
                    layer.id
            )
        );

    const firstLayerId =
        layers[0].id;

    const rawObjects =
        Array.isArray(
            source.objects
        )
            ? source.objects
            : isPlainObject(
                source.objects
            )
                ? Object.values(
                    source.objects
                )
                : [];

    const objects = {};

    rawObjects.forEach(
        rawObject => {
            if (!rawObject) {
                return;
            }

            const requestedLayerId =
                rawObject.layerId;

            const layerId =
                layerIds.has(
                    requestedLayerId
                )
                    ? requestedLayerId
                    : firstLayerId;

            const normalizedObject =
                normalizeEditorObject(
                    rawObject,
                    layerId
                );

            objects[
                normalizedObject.id
            ] = normalizedObject;
        }
    );

    const assignedObjectIds =
        new Set();

    layers =
        layers.map(
            layer => {
                const validIds =
                    uniqueIds(
                        layer.objectIds
                    ).filter(
                        objectId =>
                            objects[objectId] &&
                            objects[objectId]
                                .layerId ===
                                layer.id
                    );

                validIds.forEach(
                    objectId =>
                        assignedObjectIds.add(
                            objectId
                        )
                );

                return {
                    ...layer,

                    objectIds:
                        validIds
                };
            }
        );

    Object.values(
        objects
    ).forEach(
        object => {
            if (
                assignedObjectIds.has(
                    object.id
                )
            ) {
                return;
            }

            const layerIndex =
                layers.findIndex(
                    layer =>
                        layer.id ===
                        object.layerId
                );

            const safeIndex =
                layerIndex >= 0
                    ? layerIndex
                    : 0;

            const layer =
                layers[safeIndex];

            layers[safeIndex] = {
                ...layer,

                objectIds: [
                    ...layer.objectIds,
                    object.id
                ]
            };
        }
    );

    const requestedActiveLayerId =
        source.activeLayerId;

    const activeLayerId =
        layerIds.has(
            requestedActiveLayerId
        )
            ? requestedActiveLayerId
            : firstLayerId;

    return {
        schemaVersion:
            PROJECT_SCHEMA_VERSION,

        document:
            documentData,

        layers,

        objects,

        activeLayerId
    };
}

/*=========================================================
History Helpers
=========================================================*/

function createHistorySnapshot(
    state
) {
    return cloneSerializable({
        document:
            state.document,

        layers:
            state.layers,

        objects:
            state.objects,

        activeLayerId:
            state.activeLayerId
    });
}

function createHistoryEntry(
    label,
    snapshot
) {
    return {
        id:
            createId("history"),

        label:
            label ||
            "Editor change",

        timestamp:
            nowIso(),

        snapshot
    };
}

function restoreSnapshot(
    state,
    snapshot
) {
    const normalized =
        normalizeProjectData(
            snapshot
        );

    const validObjectIds =
        new Set(
            Object.keys(
                normalized.objects
            )
        );

    return {
        document:
            normalized.document,

        layers:
            normalized.layers,

        objects:
            normalized.objects,

        activeLayerId:
            normalized.activeLayerId,

        selectedObjectIds:
            state.selectedObjectIds.filter(
                objectId =>
                    validObjectIds.has(
                        objectId
                    )
            )
    };
}

function applyContentPatch(
    state,
    patch,
    label
) {
    const transaction =
        state.history.transaction;

    let nextHistory =
        state.history;

    if (!transaction) {
        const entry =
            createHistoryEntry(
                label,
                createHistorySnapshot(
                    state
                )
            );

        nextHistory = {
            ...state.history,

            past: [
                ...state.history.past,
                entry
            ].slice(
                -state.history.limit
            ),

            future: [],

            transaction:
                null
        };
    }

    const sourceDocument =
        patch.document ||
        state.document;

    return {
        ...patch,

        document: {
            ...sourceDocument,

            updatedAt:
                nowIso()
        },

        revision:
            state.revision + 1,

        history:
            nextHistory,

        persistence: {
            ...state.persistence,

            dirty:
                true
        }
    };
}

/*=========================================================
Object Transformation Helpers
=========================================================*/

function translateObject(
    object,
    deltaX,
    deltaY
) {
    const dx =
        numberOr(
            deltaX,
            0
        );

    const dy =
        numberOr(
            deltaY,
            0
        );

    const hasPointObjects =
        Array.isArray(
            object.points
        ) &&
        object.points.some(
            point =>
                isPlainObject(
                    point
                )
        );

    if (hasPointObjects) {
        return {
            ...object,

            points:
                object.points.map(
                    point => ({
                        ...point,

                        x:
                            numberOr(
                                point.x
                            ) + dx,

                        y:
                            numberOr(
                                point.y
                            ) + dy
                    })
                ),

            updatedAt:
                nowIso()
        };
    }

    return {
        ...object,

        x:
            numberOr(
                object.x,
                0
            ) + dx,

        y:
            numberOr(
                object.y,
                0
            ) + dy,

        updatedAt:
            nowIso()
    };
}

function mergeObjectUpdates(
    object,
    updates = {}
) {
    return {
        ...object,
        ...updates,

        style:
            updates.style
                ? {
                    ...object.style,
                    ...updates.style
                }
                : object.style,

        transform:
            updates.transform
                ? {
                    ...object.transform,
                    ...updates.transform
                }
                : object.transform,

        metadata:
            updates.metadata
                ? {
                    ...object.metadata,
                    ...updates.metadata
                }
                : object.metadata,

        id:
            object.id,

        layerId:
            updates.layerId ||
            object.layerId,

        updatedAt:
            nowIso()
    };
}

/*=========================================================
Fashion Editor Store
=========================================================*/

export const useFashionEditorStore =
    create(
        (
            set,
            get
        ) => {
            const initialContent =
                createInitialContent();

            const commitContentChange = (
                label,
                producer
            ) => {
                set(
                    state => {
                        const patch =
                            producer(
                                state
                            );

                        if (!patch) {
                            return {};
                        }

                        return applyContentPatch(
                            state,
                            patch,
                            label
                        );
                    }
                );
            };

            return {
                /*-----------------------------------------
                Project Content
                -----------------------------------------*/

                ...initialContent,

                schemaVersion:
                    PROJECT_SCHEMA_VERSION,

                revision:
                    0,

                /*-----------------------------------------
                Tool State
                -----------------------------------------*/

                activeTool:
                    EDITOR_TOOLS.PENCIL,

                previousTool:
                    EDITOR_TOOLS.PENCIL,

                    
                /*-----------------------------------------
                Drawing Settings
                -----------------------------------------*/

               brush:
    createDefaultBrushSettings(),

eraser:
    createDefaultEraserSettings(),

shape:
    createDefaultShapeSettings(),

                fill:
                    createDefaultFillSettings(),

                text:
                    createDefaultTextSettings(),

                /*-----------------------------------------
                Colour System
                -----------------------------------------*/

                colors: {
                    primary:
                        "#111111",

                    secondary:
                        "#ffffff",

                    recent: [],

                    saved: [],

                    activePaletteId:
                        null
                },

                /*-----------------------------------------
                Viewport
                -----------------------------------------*/

                viewport:
                    createDefaultViewport(),

                /*-----------------------------------------
                User Interface
                -----------------------------------------*/

                ui:
                    createDefaultUiState(),

                /*-----------------------------------------
                Clipboard
                -----------------------------------------*/

                clipboard: {
                    objects: [],

                    pasteCount:
                        0
                },

                /*-----------------------------------------
                History
                -----------------------------------------*/

                history: {
                    past: [],

                    future: [],

                    limit:
                        DEFAULT_HISTORY_LIMIT,

                    transaction:
                        null
                },

                /*-----------------------------------------
                Persistence
                -----------------------------------------*/

                persistence: {
                    dirty:
                        false,

                    saving:
                        false,

                    lastSavedAt:
                        null,

                    error:
                        null
                },

                /*=========================================
                Document Actions
                =========================================*/

                newDocument: (
                    options = {}
                ) => {
                    const content =
                        createInitialContent(
                            options
                        );

                    set({
                        ...content,

                        revision:
                            0,

                        clipboard: {
                            objects: [],
                            pasteCount: 0
                        },

                        history: {
                            ...get().history,

                            past: [],
                            future: [],
                            transaction:
                                null
                        },

                        persistence: {
                            dirty:
                                false,

                            saving:
                                false,

                            lastSavedAt:
                                null,

                            error:
                                null
                        },

                        viewport:
                            createDefaultViewport()
                    });
                },

                clearDocument: () => {
                    commitContentChange(
                        "Clear document",
                        state => {
                            const layer =
                                createDefaultLayer(
                                    {
                                        name:
                                            "Layer 1"
                                    },
                                    0
                                );

                            return {
                                layers: [
                                    layer
                                ],

                                objects: {},

                                activeLayerId:
                                    layer.id,

                                selectedObjectIds:
                                    []
                            };
                        }
                    );
                },

                setDocumentName: name => {
                    if (
                        typeof name !==
                            "string" ||
                        !name.trim()
                    ) {
                        return;
                    }

                    commitContentChange(
                        "Rename document",
                        state => ({
                            document: {
                                ...state.document,

                                name:
                                    name.trim()
                            }
                        })
                    );
                },

                setDocumentBackground:
                    background => {
                        if (
                            typeof background !==
                                "string" ||
                            !background.trim()
                        ) {
                            return;
                        }

                        commitContentChange(
                            "Change document background",
                            state => ({
                                document: {
                                    ...state.document,

                                    background:
                                        background.trim()
                                }
                            })
                        );
                    },

                resizeDocument: (
                    width,
                    height
                ) => {
                    const safeWidth =
                        Math.max(
                            100,
                            numberOr(
                                width,
                                get().document
                                    .width
                            )
                        );

                    const safeHeight =
                        Math.max(
                            100,
                            numberOr(
                                height,
                                get().document
                                    .height
                            )
                        );

                    commitContentChange(
                        "Resize document",
                        state => ({
                            document: {
                                ...state.document,

                                width:
                                    safeWidth,

                                height:
                                    safeHeight
                            }
                        })
                    );
                },

                /*=========================================
                Tool Actions
                =========================================*/

   /*=========================================
Tool Actions
=========================================*/

setActiveTool:
    tool => {
        if (
            !Object.values(
                EDITOR_TOOLS
            ).includes(tool)
        ) {
            return;
        }

        set(
            state => {
                if (
                    state.activeTool ===
                    tool
                ) {
                    return {};
                }

                return {
                    previousTool:
                        state.activeTool,

                    activeTool:
                        tool
                };
            }
        );
    },

restorePreviousTool: () => {
    set(
        state => ({
            activeTool:
                state.previousTool,

            previousTool:
                state.activeTool
        })
    );
},

                /*=========================================
                Brush Actions
                =========================================*/

                setBrushSettings:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                brush: {
                                    ...state.brush,
                                    ...updates,

                                    size:
                                        clamp(
                                            updates.size ??
                                            state.brush
                                                .size,
                                            0.25,
                                            300
                                        ),

                                    opacity:
                                        clamp(
                                            updates.opacity ??
                                            state.brush
                                                .opacity,
                                            0.01,
                                            1
                                        ),

                                    smoothing:
                                        clamp(
                                            updates.smoothing ??
                                            state.brush
                                                .smoothing,
                                            0,
                                            1
                                        ),

                                    streamline:
                                        clamp(
                                            updates.streamline ??
                                            state.brush
                                                .streamline,
                                            0,
                                            1
                                        ),

                                    thinning:
                                        clamp(
                                            updates.thinning ??
                                            state.brush
                                                .thinning,
                                            -1,
                                            1
                                        )
                                }
                            })
                        );
                    },

                setBrushSize: size => {
                    get().setBrushSettings({
                        size
                    });
                },

                setBrushOpacity:
                    opacity => {
                        get().setBrushSettings({
                            opacity
                        });
                    },

                setBrushPreset:
                    preset => {
                        if (
                            !isPlainObject(
                                preset
                            )
                        ) {
                            return;
                        }

                        get().setBrushSettings(
                            preset
                        );
                    },

                    /*=========================================
Eraser Actions
=========================================*/

setEraserSettings:
    updates => {
        if (
            !isPlainObject(
                updates
            )
        ) {
            return;
        }

        set(
            state => {
                const minimumSize =
                    Math.max(
                        1,
                        numberOr(
                            updates.minimumSize,
                            state.eraser
                                .minimumSize
                        )
                    );

                const maximumSize =
                    Math.max(
                        minimumSize,
                        numberOr(
                            updates.maximumSize,
                            state.eraser
                                .maximumSize
                        )
                    );

                const mode =
                    updates.mode ===
                        "stroke" ||
                    updates.mode ===
                        "partial"
                        ? updates.mode
                        : state.eraser
                            .mode;

                return {
                    eraser: {
                        ...state.eraser,
                        ...updates,

                        mode,

                        minimumSize,

                        maximumSize,

                        size:
                            clamp(
                                updates.size ??
                                state.eraser
                                    .size,
                                minimumSize,
                                maximumSize
                            )
                    }
                };
            }
        );
    },

setEraserSize:
    size => {
        get().setEraserSettings({
            size
        });
    },

setEraserMode:
    mode => {
        if (
            mode !== "stroke" &&
            mode !== "partial"
        ) {
            return;
        }

        get().setEraserSettings({
            mode
        });
    },

                /*=========================================
                Shape, Fill and Text Settings
                =========================================*/

                setShapeSettings:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                shape: {
                                    ...state.shape,
                                    ...updates,

                                    strokeWidth:
                                        clamp(
                                            updates
                                                .strokeWidth ??
                                            state.shape
                                                .strokeWidth,
                                            0,
                                            200
                                        ),

                                    strokeOpacity:
                                        clamp(
                                            updates
                                                .strokeOpacity ??
                                            state.shape
                                                .strokeOpacity,
                                            0,
                                            1
                                        ),

                                    fillOpacity:
                                        clamp(
                                            updates
                                                .fillOpacity ??
                                            state.shape
                                                .fillOpacity,
                                            0,
                                            1
                                        )
                                }
                            })
                        );
                    },

                setFillSettings:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                fill: {
                                    ...state.fill,
                                    ...updates,

                                    opacity:
                                        clamp(
                                            updates.opacity ??
                                            state.fill
                                                .opacity,
                                            0,
                                            1
                                        ),

                                    tolerance:
                                        clamp(
                                            updates.tolerance ??
                                            state.fill
                                                .tolerance,
                                            0,
                                            255
                                        )
                                }
                            })
                        );
                    },

                setTextSettings:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                text: {
                                    ...state.text,
                                    ...updates,

                                    fontSize:
                                        clamp(
                                            updates.fontSize ??
                                            state.text
                                                .fontSize,
                                            4,
                                            500
                                        ),

                                    opacity:
                                        clamp(
                                            updates.opacity ??
                                            state.text
                                                .opacity,
                                            0,
                                            1
                                        )
                                }
                            })
                        );
                    },

                /*=========================================
                Colour Actions
                =========================================*/

                setPrimaryColor:
                    color => {
                        if (
                            typeof color !==
                                "string" ||
                            !color.trim()
                        ) {
                            return;
                        }

                        const cleanColor =
                            color.trim();

                        set(
                            state => ({
                                colors: {
                                    ...state.colors,

                                    primary:
                                        cleanColor,

                                    recent: [
                                        cleanColor,

                                        ...state
                                            .colors
                                            .recent
                                            .filter(
                                                item =>
                                                    item !==
                                                    cleanColor
                                            )
                                    ].slice(
                                        0,
                                        24
                                    )
                                },

                                brush: {
                                    ...state.brush,

                                    color:
                                        cleanColor
                                },

                                shape: {
                                    ...state.shape,

                                    stroke:
                                        cleanColor
                                }
                            })
                        );
                    },

                setSecondaryColor:
                    color => {
                        if (
                            typeof color !==
                                "string" ||
                            !color.trim()
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                colors: {
                                    ...state.colors,

                                    secondary:
                                        color.trim()
                                }
                            })
                        );
                    },

              swapColors: () => {
    set(
        state => {
            const nextPrimary =
                state.colors
                    .secondary;

            const nextSecondary =
                state.colors
                    .primary;

            return {
                colors: {
                    ...state.colors,

                    primary:
                        nextPrimary,

                    secondary:
                        nextSecondary
                },

                brush: {
                    ...state.brush,

                    color:
                        nextPrimary
                },

                shape: {
                    ...state.shape,

                    stroke:
                        nextPrimary
                }
            };
        }
    );
},

                saveColor: color => {
                    const selectedColor =
                        typeof color ===
                            "string" &&
                        color.trim()
                            ? color.trim()
                            : get().colors
                                .primary;

                    set(
                        state => ({
                            colors: {
                                ...state.colors,

                                saved: [
                                    selectedColor,

                                    ...state
                                        .colors
                                        .saved
                                        .filter(
                                            item =>
                                                item !==
                                                selectedColor
                                        )
                                ].slice(
                                    0,
                                    64
                                )
                            }
                        })
                    );
                },

                removeSavedColor:
                    color => {
                        set(
                            state => ({
                                colors: {
                                    ...state.colors,

                                    saved:
                                        state.colors
                                            .saved
                                            .filter(
                                                item =>
                                                    item !==
                                                    color
                                            )
                                }
                            })
                        );
                    },

                /*=========================================
                Object Actions
                =========================================*/

                addObject: (
                    object,
                    options = {}
                ) => {
                    if (
                        !isPlainObject(
                            object
                        )
                    ) {
                        return null;
                    }

                    const state =
                        get();

                    const requestedLayerId =
                        object.layerId ||
                        state.activeLayerId;

                    const layer =
                        state.layers.find(
                            item =>
                                item.id ===
                                requestedLayerId
                        );

                    if (
                        !layer ||
                        layer.locked ||
                        !layer.visible
                    ) {
                        return null;
                    }

                    const normalizedObject =
                        normalizeEditorObject(
                            object,
                            layer.id
                        );

                    if (
                        state.objects[
                            normalizedObject.id
                        ]
                    ) {
                        normalizedObject.id =
                            createId(
                                normalizedObject
                                    .type
                            );
                    }

                    commitContentChange(
                        options.label ||
                        "Add object",
                        currentState => ({
                            objects: {
                                ...currentState.objects,

                                [normalizedObject.id]:
                                    normalizedObject
                            },

                            layers:
                                currentState.layers.map(
                                    item =>
                                        item.id ===
                                        layer.id
                                            ? {
                                                ...item,

                                                objectIds: [
                                                    ...item.objectIds,
                                                    normalizedObject.id
                                                ],

                                                updatedAt:
                                                    nowIso()
                                            }
                                            : item
                                ),

                            selectedObjectIds:
                                options.select ===
                                false
                                    ? currentState
                                        .selectedObjectIds
                                    : [
                                        normalizedObject.id
                                    ]
                        })
                    );

                    return normalizedObject.id;
                },

                addObjects: (
                    objects,
                    options = {}
                ) => {
                    if (
                        !Array.isArray(
                            objects
                        ) ||
                        objects.length === 0
                    ) {
                        return [];
                    }

                    const state =
                        get();

                    const prepared = [];

                    objects.forEach(
                        object => {
                            if (
                                !isPlainObject(
                                    object
                                )
                            ) {
                                return;
                            }

                            const layerId =
                                object.layerId ||
                                state.activeLayerId;

                            const layer =
                                state.layers.find(
                                    item =>
                                        item.id ===
                                        layerId
                                );

                            if (
                                !layer ||
                                layer.locked ||
                                !layer.visible
                            ) {
                                return;
                            }

                            const normalized =
                                normalizeEditorObject(
                                    object,
                                    layerId
                                );

                            if (
                                state.objects[
                                    normalized.id
                                ] ||
                                prepared.some(
                                    item =>
                                        item.id ===
                                        normalized.id
                                )
                            ) {
                                normalized.id =
                                    createId(
                                        normalized
                                            .type
                                    );
                            }

                            prepared.push(
                                normalized
                            );
                        }
                    );

                    if (
                        prepared.length === 0
                    ) {
                        return [];
                    }

                    const addedIds =
                        prepared.map(
                            object =>
                                object.id
                        );

                    commitContentChange(
                        options.label ||
                        "Add objects",
                        currentState => {
                            const nextObjects = {
                                ...currentState.objects
                            };

                            const idsByLayer =
                                new Map();

                            prepared.forEach(
                                object => {
                                    nextObjects[
                                        object.id
                                    ] = object;

                                    const existing =
                                        idsByLayer.get(
                                            object.layerId
                                        ) || [];

                                    idsByLayer.set(
                                        object.layerId,
                                        [
                                            ...existing,
                                            object.id
                                        ]
                                    );
                                }
                            );

                            return {
                                objects:
                                    nextObjects,

                                layers:
                                    currentState.layers.map(
                                        layer => {
                                            const ids =
                                                idsByLayer.get(
                                                    layer.id
                                                );

                                            if (!ids) {
                                                return layer;
                                            }

                                            return {
                                                ...layer,

                                                objectIds: [
                                                    ...layer.objectIds,
                                                    ...ids
                                                ],

                                                updatedAt:
                                                    nowIso()
                                            };
                                        }
                                    ),

                                selectedObjectIds:
                                    options.select ===
                                    false
                                        ? currentState
                                            .selectedObjectIds
                                        : addedIds
                            };
                        }
                    );

                    return addedIds;
                },

                updateObject: (
                    objectId,
                    updates,
                    label =
                        "Update object"
                ) => {
                    const state =
                        get();

                    const object =
                        state.objects[
                            objectId
                        ];

                    if (
                        !object ||
                        object.locked
                    ) {
                        return;
                    }

                    const layer =
                        state.layers.find(
                            item =>
                                item.id ===
                                object.layerId
                        );

                    if (
                        !layer ||
                        layer.locked
                    ) {
                        return;
                    }

                    const resolvedUpdates =
                        typeof updates ===
                            "function"
                            ? updates(
                                cloneSerializable(
                                    object
                                )
                            )
                            : updates;

                    if (
                        !isPlainObject(
                            resolvedUpdates
                        )
                    ) {
                        return;
                    }

                    commitContentChange(
                        label,
                        currentState => ({
                            objects: {
                                ...currentState.objects,

                                [objectId]:
                                    mergeObjectUpdates(
                                        currentState
                                            .objects[
                                            objectId
                                        ],
                                        resolvedUpdates
                                    )
                            }
                        })
                    );
                },

                updateObjects: (
                    objectIds,
                    updates,
                    label =
                        "Update objects"
                ) => {
                    const safeIds =
                        uniqueIds(
                            objectIds
                        );

                    if (
                        safeIds.length === 0
                    ) {
                        return;
                    }

                    commitContentChange(
                        label,
                        state => {
                            const nextObjects = {
                                ...state.objects
                            };

                            let changed =
                                false;

                            safeIds.forEach(
                                objectId => {
                                    const object =
                                        state.objects[
                                            objectId
                                        ];

                                    if (
                                        !object ||
                                        object.locked
                                    ) {
                                        return;
                                    }

                                    const layer =
                                        state.layers.find(
                                            item =>
                                                item.id ===
                                                object.layerId
                                        );

                                    if (
                                        !layer ||
                                        layer.locked
                                    ) {
                                        return;
                                    }

                                    const resolved =
                                        typeof updates ===
                                            "function"
                                            ? updates(
                                                cloneSerializable(
                                                    object
                                                )
                                            )
                                            : updates;

                                    if (
                                        !isPlainObject(
                                            resolved
                                        )
                                    ) {
                                        return;
                                    }

                                    nextObjects[
                                        objectId
                                    ] =
                                        mergeObjectUpdates(
                                            object,
                                            resolved
                                        );

                                    changed =
                                        true;
                                }
                            );

                            return changed
                                ? {
                                    objects:
                                        nextObjects
                                }
                                : null;
                        }
                    );
                },

                deleteObjects: (
                    objectIds,
                    label =
                        "Delete objects"
                ) => {
                    const requestedIds =
                        uniqueIds(
                            objectIds?.length
                                ? objectIds
                                : get()
                                    .selectedObjectIds
                        );

                    if (
                        requestedIds.length ===
                        0
                    ) {
                        return;
                    }

                    commitContentChange(
                        label,
                        state => {
                            const deletableIds =
                                requestedIds.filter(
                                    objectId => {
                                        const object =
                                            state.objects[
                                                objectId
                                            ];

                                        if (
                                            !object ||
                                            object.locked
                                        ) {
                                            return false;
                                        }

                                        const layer =
                                            state.layers.find(
                                                item =>
                                                    item.id ===
                                                    object.layerId
                                            );

                                        return Boolean(
                                            layer &&
                                            !layer.locked
                                        );
                                    }
                                );

                            if (
                                deletableIds.length ===
                                0
                            ) {
                                return null;
                            }

                            const idSet =
                                new Set(
                                    deletableIds
                                );

                            const nextObjects = {
                                ...state.objects
                            };

                            deletableIds.forEach(
                                objectId => {
                                    delete nextObjects[
                                        objectId
                                    ];
                                }
                            );

                            return {
                                objects:
                                    nextObjects,

                                layers:
                                    state.layers.map(
                                        layer => ({
                                            ...layer,

                                            objectIds:
                                                layer.objectIds.filter(
                                                    objectId =>
                                                        !idSet.has(
                                                            objectId
                                                        )
                                                )
                                        })
                                    ),

                                selectedObjectIds:
                                    state.selectedObjectIds.filter(
                                        objectId =>
                                            !idSet.has(
                                                objectId
                                            )
                                    )
                            };
                        }
                    );
                },

                duplicateObjects: (
                    objectIds,
                    options = {}
                ) => {
                    const state =
                        get();

                    const ids =
                        uniqueIds(
                            objectIds?.length
                                ? objectIds
                                : state
                                    .selectedObjectIds
                        );

                    const offsetX =
                        numberOr(
                            options.offsetX,
                            20
                        );

                    const offsetY =
                        numberOr(
                            options.offsetY,
                            20
                        );

                    const copies =
                        ids
                            .map(
                                objectId =>
                                    state.objects[
                                        objectId
                                    ]
                            )
                            .filter(Boolean)
                            .map(
                                object => {
                                    const translated =
                                        translateObject(
                                            cloneSerializable(
                                                object
                                            ),
                                            offsetX,
                                            offsetY
                                        );

                                    return {
                                        ...translated,

                                        id:
                                            createId(
                                                object.type
                                            ),

                                        name:
                                            `${object.name || object.type} copy`,

                                        createdAt:
                                            nowIso(),

                                        updatedAt:
                                            nowIso()
                                    };
                                }
                            );

                    return get().addObjects(
                        copies,
                        {
                            label:
                                "Duplicate objects",

                            select:
                                true
                        }
                    );
                },

                nudgeSelection: (
                    deltaX,
                    deltaY
                ) => {
                    const selectedIds =
                        get()
                            .selectedObjectIds;

                    if (
                        selectedIds.length ===
                        0
                    ) {
                        return;
                    }

                    commitContentChange(
                        "Move objects",
                        state => {
                            const nextObjects = {
                                ...state.objects
                            };

                            let changed =
                                false;

                            selectedIds.forEach(
                                objectId => {
                                    const object =
                                        state.objects[
                                            objectId
                                        ];

                                    if (
                                        !object ||
                                        object.locked
                                    ) {
                                        return;
                                    }

                                    const layer =
                                        state.layers.find(
                                            item =>
                                                item.id ===
                                                object.layerId
                                        );

                                    if (
                                        !layer ||
                                        layer.locked
                                    ) {
                                        return;
                                    }

                                    nextObjects[
                                        objectId
                                    ] =
                                        translateObject(
                                            object,
                                            deltaX,
                                            deltaY
                                        );

                                    changed =
                                        true;
                                }
                            );

                            return changed
                                ? {
                                    objects:
                                        nextObjects
                                }
                                : null;
                        }
                    );
                },

                moveObjectToLayer: (
                    objectId,
                    targetLayerId
                ) => {
                    const state =
                        get();

                    const object =
                        state.objects[
                            objectId
                        ];

                    const sourceLayer =
                        state.layers.find(
                            layer =>
                                layer.id ===
                                object?.layerId
                        );

                    const targetLayer =
                        state.layers.find(
                            layer =>
                                layer.id ===
                                targetLayerId
                        );

                    if (
                        !object ||
                        !sourceLayer ||
                        !targetLayer ||
                        sourceLayer.locked ||
                        targetLayer.locked ||
                        object.locked ||
                        sourceLayer.id ===
                        targetLayer.id
                    ) {
                        return;
                    }

                    commitContentChange(
                        "Move object to layer",
                        currentState => ({
                            objects: {
                                ...currentState.objects,

                                [objectId]: {
                                    ...object,

                                    layerId:
                                        targetLayerId,

                                    updatedAt:
                                        nowIso()
                                }
                            },

                            layers:
                                currentState.layers.map(
                                    layer => {
                                        if (
                                            layer.id ===
                                            sourceLayer.id
                                        ) {
                                            return {
                                                ...layer,

                                                objectIds:
                                                    layer.objectIds.filter(
                                                        id =>
                                                            id !==
                                                            objectId
                                                    )
                                            };
                                        }

                                        if (
                                            layer.id ===
                                            targetLayer.id
                                        ) {
                                            return {
                                                ...layer,

                                                objectIds: [
                                                    ...layer.objectIds,
                                                    objectId
                                                ]
                                            };
                                        }

                                        return layer;
                                    }
                                )
                        })
                    );
                },

                reorderObject: (
                    objectId,
                    targetIndex
                ) => {
                    const state =
                        get();

                    const object =
                        state.objects[
                            objectId
                        ];

                    const layer =
                        state.layers.find(
                            item =>
                                item.id ===
                                object?.layerId
                        );

                    if (
                        !object ||
                        !layer ||
                        layer.locked
                    ) {
                        return;
                    }

                    const currentIndex =
                        layer.objectIds.indexOf(
                            objectId
                        );

                    if (
                        currentIndex < 0
                    ) {
                        return;
                    }

                    commitContentChange(
                        "Reorder object",
                        currentState => ({
                            layers:
                                currentState.layers.map(
                                    item =>
                                        item.id ===
                                        layer.id
                                            ? {
                                                ...item,

                                                objectIds:
                                                    moveArrayItem(
                                                        item.objectIds,
                                                        currentIndex,
                                                        targetIndex
                                                    )
                                            }
                                            : item
                                )
                        })
                    );
                },

                bringToFront:
                    objectId => {
                        const object =
                            get().objects[
                                objectId
                            ];

                        const layer =
                            get().layers.find(
                                item =>
                                    item.id ===
                                    object?.layerId
                            );

                        if (layer) {
                            get().reorderObject(
                                objectId,
                                layer.objectIds
                                    .length -
                                1
                            );
                        }
                    },

                sendToBack:
                    objectId => {
                        get().reorderObject(
                            objectId,
                            0
                        );
                    },

                /*=========================================
                Selection Actions
                =========================================*/

                selectObjects: (
                    objectIds,
                    options = {}
                ) => {
                    const state =
                        get();

                    const validIds =
                        uniqueIds(
                            objectIds
                        ).filter(
                            objectId => {
                                const object =
                                    state.objects[
                                        objectId
                                    ];

                                const layer =
                                    state.layers.find(
                                        item =>
                                            item.id ===
                                            object?.layerId
                                    );

                                return Boolean(
                                    object &&
                                    object.visible !==
                                        false &&
                                    layer &&
                                    layer.visible
                                );
                            }
                        );

                    set({
                        selectedObjectIds:
                            options.append
                                ? uniqueIds([
                                    ...state
                                        .selectedObjectIds,
                                    ...validIds
                                ])
                                : validIds
                    });
                },

                toggleObjectSelection:
                    objectId => {
                        const state =
                            get();

                        const selected =
                            state.selectedObjectIds.includes(
                                objectId
                            );

                        set({
                            selectedObjectIds:
                                selected
                                    ? state.selectedObjectIds.filter(
                                        id =>
                                            id !==
                                            objectId
                                    )
                                    : [
                                        ...state.selectedObjectIds,
                                        objectId
                                    ]
                        });
                    },

                clearSelection: () => {
                    set({
                        selectedObjectIds:
                            []
                    });
                },

                selectAllOnActiveLayer:
                    () => {
                        const state =
                            get();

                        const layer =
                            state.layers.find(
                                item =>
                                    item.id ===
                                    state.activeLayerId
                            );

                        if (
                            !layer ||
                            !layer.visible
                        ) {
                            return;
                        }

                        set({
                            selectedObjectIds:
                                layer.objectIds.filter(
                                    objectId =>
                                        state.objects[
                                            objectId
                                        ]?.visible !==
                                        false
                                )
                        });
                    },

                /*=========================================
                Clipboard Actions
                =========================================*/

                copySelection: () => {
                    const state =
                        get();

                    const copied =
                        state.selectedObjectIds
                            .map(
                                objectId =>
                                    state.objects[
                                        objectId
                                    ]
                            )
                            .filter(Boolean)
                            .map(
                                object =>
                                    cloneSerializable(
                                        object
                                    )
                            );

                    set({
                        clipboard: {
                            objects:
                                copied,

                            pasteCount:
                                0
                        }
                    });

                    return copied.length;
                },

                cutSelection: () => {
                    const count =
                        get()
                            .copySelection();

                    if (count > 0) {
                        get().deleteObjects(
                            get()
                                .selectedObjectIds,
                            "Cut objects"
                        );
                    }
                },

                pasteClipboard: () => {
                    const state =
                        get();

                    if (
                        state.clipboard
                            .objects
                            .length === 0
                    ) {
                        return [];
                    }

                    const pasteNumber =
                        state.clipboard
                            .pasteCount +
                        1;

                    const offset =
                        pasteNumber * 18;

                    const copies =
                        state.clipboard
                            .objects
                            .map(
                                sourceObject => {
                                    const preferredLayer =
                                        state.layers.find(
                                            layer =>
                                                layer.id ===
                                                sourceObject
                                                    .layerId &&
                                                !layer.locked
                                        );

                                    const activeLayer =
                                        state.layers.find(
                                            layer =>
                                                layer.id ===
                                                state.activeLayerId &&
                                                !layer.locked
                                        );

                                    const targetLayer =
                                        preferredLayer ||
                                        activeLayer;

                                    if (
                                        !targetLayer
                                    ) {
                                        return null;
                                    }

                                    const translated =
                                        translateObject(
                                            sourceObject,
                                            offset,
                                            offset
                                        );

                                    return {
                                        ...translated,

                                        id:
                                            createId(
                                                sourceObject.type
                                            ),

                                        layerId:
                                            targetLayer.id,

                                        createdAt:
                                            nowIso(),

                                        updatedAt:
                                            nowIso()
                                    };
                                }
                            )
                            .filter(Boolean);

                    const ids =
                        get().addObjects(
                            copies,
                            {
                                label:
                                    "Paste objects",

                                select:
                                    true
                            }
                        );

                    set(
                        currentState => ({
                            clipboard: {
                                ...currentState.clipboard,

                                pasteCount:
                                    pasteNumber
                            }
                        })
                    );

                    return ids;
                },

                /*=========================================
                Layer Actions
                =========================================*/

                setActiveLayer:
    (
        layerId,
        options = {}
    ) => {
        const state =
            get();

        if (
            !state.layers.some(
                layer =>
                    layer.id ===
                    layerId
            )
        ) {
            return;
        }

        set({
            activeLayerId:
                layerId,

            selectedObjectIds:
                options.clearSelection ===
                true
                    ? []
                    : state
                        .selectedObjectIds
        });
    },

                addLayer: (
                    options = {}
                ) => {
                    const state =
                        get();

                    const activeIndex =
                        state.layers.findIndex(
                            layer =>
                                layer.id ===
                                state.activeLayerId
                        );

                    const insertIndex =
                        Number.isFinite(
                            Number(
                                options.index
                            )
                        )
                            ? clamp(
                                options.index,
                                0,
                                state.layers
                                    .length
                            )
                            : activeIndex >= 0
                                ? activeIndex +
                                1
                                : state.layers
                                    .length;

                    const layer =
                        createDefaultLayer(
                            {
                                ...options,

                                name:
                                    options.name ||
                                    `Layer ${
                                        state.layers.length +
                                        1
                                    }`
                            },
                            state.layers.length
                        );

                    commitContentChange(
                        "Add layer",
                        currentState => {
                            const nextLayers = [
                                ...currentState.layers
                            ];

                            nextLayers.splice(
                                insertIndex,
                                0,
                                layer
                            );

                            return {
                                layers:
                                    nextLayers,

                                activeLayerId:
                                    layer.id,

                                selectedObjectIds:
                                    []
                            };
                        }
                    );

                    return layer.id;
                },

                updateLayer: (
                    layerId,
                    updates,
                    label =
                        "Update layer"
                ) => {
                    if (
                        !isPlainObject(
                            updates
                        )
                    ) {
                        return;
                    }

                    const state =
                        get();

                    const layer =
                        state.layers.find(
                            item =>
                                item.id ===
                                layerId
                        );

                    if (!layer) {
                        return;
                    }

                    commitContentChange(
                        label,
                        currentState => ({
                            layers:
                                currentState.layers.map(
                                    item =>
                                        item.id ===
                                        layerId
                                            ? {
                                                ...item,
                                                ...updates,

                                                id:
                                                    item.id,

                                                opacity:
                                                    clamp(
                                                        updates.opacity ??
                                                        item.opacity,
                                                        0,
                                                        1
                                                    ),

                                                blendMode:
                                                    BLEND_MODES.includes(
                                                        updates.blendMode
                                                    )
                                                        ? updates.blendMode
                                                        : item.blendMode,

                                                objectIds:
                                                    item.objectIds,

                                                updatedAt:
                                                    nowIso()
                                            }
                                            : item
                                )
                        })
                    );
                },

                renameLayer: (
                    layerId,
                    name
                ) => {
                    if (
                        typeof name !==
                            "string" ||
                        !name.trim()
                    ) {
                        return;
                    }

                    get().updateLayer(
                        layerId,
                        {
                            name:
                                name.trim()
                        },
                        "Rename layer"
                    );
                },

                toggleLayerVisibility:
                    layerId => {
                        const layer =
                            get().layers.find(
                                item =>
                                    item.id ===
                                    layerId
                            );

                        if (!layer) {
                            return;
                        }

                        get().updateLayer(
                            layerId,
                            {
                                visible:
                                    !layer.visible
                            },
                            "Toggle layer visibility"
                        );
                    },

                toggleLayerLock:
                    layerId => {
                        const layer =
                            get().layers.find(
                                item =>
                                    item.id ===
                                    layerId
                            );

                        if (!layer) {
                            return;
                        }

                        get().updateLayer(
                            layerId,
                            {
                                locked:
                                    !layer.locked
                            },
                            "Toggle layer lock"
                        );

                        if (
                            !layer.locked
                        ) {
                            set(
                                state => ({
                                    selectedObjectIds:
                                        state.selectedObjectIds.filter(
                                            objectId =>
                                                state.objects[
                                                    objectId
                                                ]?.layerId !==
                                                layerId
                                        )
                                })
                            );
                        }
                    },

                setLayerOpacity: (
                    layerId,
                    opacity
                ) => {
                    get().updateLayer(
                        layerId,
                        {
                            opacity
                        },
                        "Change layer opacity"
                    );
                },

                setLayerBlendMode: (
                    layerId,
                    blendMode
                ) => {
                    if (
                        !BLEND_MODES.includes(
                            blendMode
                        )
                    ) {
                        return;
                    }

                    get().updateLayer(
                        layerId,
                        {
                            blendMode
                        },
                        "Change layer blend mode"
                    );
                },

                moveLayer: (
                    layerId,
                    targetIndex
                ) => {
                    const state =
                        get();

                    const currentIndex =
                        state.layers.findIndex(
                            layer =>
                                layer.id ===
                                layerId
                        );

                    if (
                        currentIndex < 0
                    ) {
                        return;
                    }

                    commitContentChange(
                        "Reorder layer",
                        currentState => ({
                            layers:
                                moveArrayItem(
                                    currentState.layers,
                                    currentIndex,
                                    targetIndex
                                )
                        })
                    );
                },

                duplicateLayer:
                    layerId => {
                        const state =
                            get();

                        const sourceLayer =
                            state.layers.find(
                                layer =>
                                    layer.id ===
                                    layerId
                            );

                        if (!sourceLayer) {
                            return null;
                        }

                        const newLayerId =
                            createId("layer");

                        const objectCopies =
                            sourceLayer.objectIds
                                .map(
                                    objectId =>
                                        state.objects[
                                            objectId
                                        ]
                                )
                                .filter(Boolean)
                                .map(
                                    object => ({
                                        ...cloneSerializable(
                                            object
                                        ),

                                        id:
                                            createId(
                                                object.type
                                            ),

                                        layerId:
                                            newLayerId,

                                        createdAt:
                                            nowIso(),

                                        updatedAt:
                                            nowIso()
                                    })
                                );

                        const newLayer = {
                            ...sourceLayer,

                            id:
                                newLayerId,

                            name:
                                `${sourceLayer.name} copy`,

                            objectIds:
                                objectCopies.map(
                                    object =>
                                        object.id
                                ),

                            createdAt:
                                nowIso(),

                            updatedAt:
                                nowIso()
                        };

                        const sourceIndex =
                            state.layers.findIndex(
                                layer =>
                                    layer.id ===
                                    layerId
                            );

                        commitContentChange(
                            "Duplicate layer",
                            currentState => {
                                const nextLayers = [
                                    ...currentState.layers
                                ];

                                nextLayers.splice(
                                    sourceIndex +
                                    1,
                                    0,
                                    newLayer
                                );

                                const nextObjects = {
                                    ...currentState.objects
                                };

                                objectCopies.forEach(
                                    object => {
                                        nextObjects[
                                            object.id
                                        ] = object;
                                    }
                                );

                                return {
                                    layers:
                                        nextLayers,

                                    objects:
                                        nextObjects,

                                    activeLayerId:
                                        newLayerId,

                                    selectedObjectIds:
                                        []
                                };
                            }
                        );

                        return newLayerId;
                    },

                deleteLayer: (
                    layerId,
                    options = {}
                ) => {
                    const state =
                        get();

                    if (
                        state.layers.length <=
                        1
                    ) {
                        return false;
                    }

                    const layerIndex =
                        state.layers.findIndex(
                            layer =>
                                layer.id ===
                                layerId
                        );

                    if (
                        layerIndex < 0
                    ) {
                        return false;
                    }

                    const layer =
                        state.layers[
                            layerIndex
                        ];

                    const fallbackLayer =
                        state.layers[
                            layerIndex - 1
                        ] ||
                        state.layers[
                            layerIndex + 1
                        ];

                    if (!fallbackLayer) {
                        return false;
                    }

                    const mode =
                        options.mode ===
                            "move"
                            ? "move"
                            : "delete";

                    commitContentChange(
                        "Delete layer",
                        currentState => {
                            const nextObjects = {
                                ...currentState.objects
                            };

                            let nextFallbackIds = [
                                ...fallbackLayer
                                    .objectIds
                            ];

                            if (
                                mode === "move"
                            ) {
                                layer.objectIds.forEach(
                                    objectId => {
                                        const object =
                                            nextObjects[
                                                objectId
                                            ];

                                        if (!object) {
                                            return;
                                        }

                                        nextObjects[
                                            objectId
                                        ] = {
                                            ...object,

                                            layerId:
                                                fallbackLayer.id,

                                            updatedAt:
                                                nowIso()
                                        };

                                        nextFallbackIds.push(
                                            objectId
                                        );
                                    }
                                );
                            } else {
                                layer.objectIds.forEach(
                                    objectId => {
                                        delete nextObjects[
                                            objectId
                                        ];
                                    }
                                );
                            }

                            const removedIds =
                                new Set(
                                    layer.objectIds
                                );

                            return {
                                layers:
                                    currentState.layers
                                        .filter(
                                            item =>
                                                item.id !==
                                                layerId
                                        )
                                        .map(
                                            item =>
                                                item.id ===
                                                fallbackLayer.id
                                                    ? {
                                                        ...item,

                                                        objectIds:
                                                            nextFallbackIds
                                                    }
                                                    : item
                                        ),

                                objects:
                                    nextObjects,

                                activeLayerId:
                                    currentState
                                        .activeLayerId ===
                                    layerId
                                        ? fallbackLayer.id
                                        : currentState
                                            .activeLayerId,

                                selectedObjectIds:
                                    mode === "delete"
                                        ? currentState
                                            .selectedObjectIds
                                            .filter(
                                                objectId =>
                                                    !removedIds.has(
                                                        objectId
                                                    )
                                            )
                                        : currentState
                                            .selectedObjectIds
                            };
                        }
                    );

                    return true;
                },

                /*=========================================
                Viewport Actions
                =========================================*/

                setViewport:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                viewport: {
                                    ...state.viewport,
                                    ...updates,

                                    zoom:
                                        clamp(
                                            updates.zoom ??
                                            state.viewport
                                                .zoom,
                                            MIN_ZOOM,
                                            MAX_ZOOM
                                        ),

                                    x:
                                        numberOr(
                                            updates.x,
                                            state.viewport
                                                .x
                                        ),

                                    y:
                                        numberOr(
                                            updates.y,
                                            state.viewport
                                                .y
                                        )
                                }
                            })
                        );
                    },

                setZoom: (
                    zoom,
                    anchor = null
                ) => {
                    const state =
                        get();

                    const previousZoom =
                        state.viewport.zoom;

                    const nextZoom =
                        clamp(
                            zoom,
                            MIN_ZOOM,
                            MAX_ZOOM
                        );

                    if (
                        !anchor ||
                        !Number.isFinite(
                            Number(anchor.x)
                        ) ||
                        !Number.isFinite(
                            Number(anchor.y)
                        )
                    ) {
                        set({
                            viewport: {
                                ...state.viewport,

                                zoom:
                                    nextZoom
                            }
                        });

                        return;
                    }

                    const documentPoint = {
                        x:
                            (
                                Number(anchor.x) -
                                state.viewport.x
                            ) /
                            previousZoom,

                        y:
                            (
                                Number(anchor.y) -
                                state.viewport.y
                            ) /
                            previousZoom
                    };

                    set({
                        viewport: {
                            zoom:
                                nextZoom,

                            x:
                                Number(anchor.x) -
                                documentPoint.x *
                                nextZoom,

                            y:
                                Number(anchor.y) -
                                documentPoint.y *
                                nextZoom
                        }
                    });
                },

                zoomIn: (
                    anchor = null
                ) => {
                    get().setZoom(
                        get().viewport.zoom *
                        1.15,
                        anchor
                    );
                },

                zoomOut: (
                    anchor = null
                ) => {
                    get().setZoom(
                        get().viewport.zoom /
                        1.15,
                        anchor
                    );
                },

                panBy: (
                    deltaX,
                    deltaY
                ) => {
                    set(
                        state => ({
                            viewport: {
                                ...state.viewport,

                                x:
                                    state.viewport.x +
                                    numberOr(
                                        deltaX
                                    ),

                                y:
                                    state.viewport.y +
                                    numberOr(
                                        deltaY
                                    )
                            }
                        })
                    );
                },

                resetViewport: () => {
                    set({
                        viewport:
                            createDefaultViewport()
                    });
                },

                fitDocumentToViewport: (
                    viewportWidth,
                    viewportHeight,
                    padding = 64
                ) => {
                    const state =
                        get();

                    const availableWidth =
                        Math.max(
                            1,
                            numberOr(
                                viewportWidth
                            ) -
                            padding * 2
                        );

                    const availableHeight =
                        Math.max(
                            1,
                            numberOr(
                                viewportHeight
                            ) -
                            padding * 2
                        );

                    const zoom =
                        clamp(
                            Math.min(
                                availableWidth /
                                state.document
                                    .width,

                                availableHeight /
                                state.document
                                    .height
                            ),
                            MIN_ZOOM,
                            MAX_ZOOM
                        );

                    set({
                        viewport: {
                            zoom,

                            x:
                                (
                                    viewportWidth -
                                    state.document
                                        .width *
                                    zoom
                                ) / 2,

                            y:
                                (
                                    viewportHeight -
                                    state.document
                                        .height *
                                    zoom
                                ) / 2
                        }
                    });
                },

                /*=========================================
                UI Actions
                =========================================*/

                setUiState:
                    updates => {
                        if (
                            !isPlainObject(
                                updates
                            )
                        ) {
                            return;
                        }

                        set(
                            state => ({
                                ui: {
                                    ...state.ui,
                                    ...updates,

                                    gridSize:
                                        Math.max(
                                            1,
                                            numberOr(
                                                updates.gridSize,
                                                state.ui
                                                    .gridSize
                                            )
                                        )
                                }
                            })
                        );
                    },

                toggleGrid: () => {
                    set(
                        state => ({
                            ui: {
                                ...state.ui,

                                showGrid:
                                    !state.ui
                                        .showGrid
                            }
                        })
                    );
                },

                toggleSnapToGrid:
                    () => {
                        set(
                            state => ({
                                ui: {
                                    ...state.ui,

                                    snapToGrid:
                                        !state.ui
                                            .snapToGrid
                                }
                            })
                        );
                    },

                /*=========================================
                History Transactions
                =========================================*/

                beginHistoryTransaction:
                    label => {
                        set(
                            state => {
                                if (
                                    state.history
                                        .transaction
                                ) {
                                    return {};
                                }

                                return {
                                    history: {
                                        ...state.history,

                                        transaction: {
                                            id:
                                                createId(
                                                    "transaction"
                                                ),

                                            label:
                                                label ||
                                                "Transform objects",

                                            startedAt:
                                                nowIso(),

                                            startRevision:
                                                state.revision,

                                            snapshot:
                                                createHistorySnapshot(
                                                    state
                                                )
                                        }
                                    }
                                };
                            }
                        );
                    },

                commitHistoryTransaction:
                    () => {
                        set(
                            state => {
                                const transaction =
                                    state.history
                                        .transaction;

                                if (!transaction) {
                                    return {};
                                }

                                if (
                                    transaction.startRevision ===
                                    state.revision
                                ) {
                                    return {
                                        history: {
                                            ...state.history,

                                            transaction:
                                                null
                                        }
                                    };
                                }

                                const entry =
                                    createHistoryEntry(
                                        transaction.label,
                                        transaction.snapshot
                                    );

                                return {
                                    history: {
                                        ...state.history,

                                        past: [
                                            ...state
                                                .history
                                                .past,
                                            entry
                                        ].slice(
                                            -state
                                                .history
                                                .limit
                                        ),

                                        future: [],

                                        transaction:
                                            null
                                    }
                                };
                            }
                        );
                    },

                cancelHistoryTransaction:
                    () => {
                        set(
                            state => {
                                const transaction =
                                    state.history
                                        .transaction;

                                if (!transaction) {
                                    return {};
                                }

                                return {
                                    ...restoreSnapshot(
                                        state,
                                        transaction
                                            .snapshot
                                    ),

                                    revision:
                                        state.revision +
                                        1,

                                    history: {
                                        ...state.history,

                                        transaction:
                                            null
                                    }
                                };
                            }
                        );
                    },

                undo: () => {
                    set(
                        state => {
                            if (
                                state.history
                                    .transaction
                            ) {
                                return {
                                    ...restoreSnapshot(
                                        state,
                                        state.history
                                            .transaction
                                            .snapshot
                                    ),

                                    revision:
                                        state.revision +
                                        1,

                                    history: {
                                        ...state.history,

                                        transaction:
                                            null
                                    }
                                };
                            }

                            const past =
                                state.history
                                    .past;

                            if (
                                past.length ===
                                0
                            ) {
                                return {};
                            }

                            const entry =
                                past[
                                    past.length -
                                    1
                                ];

                            const currentEntry =
                                createHistoryEntry(
                                    entry.label,
                                    createHistorySnapshot(
                                        state
                                    )
                                );

                            return {
                                ...restoreSnapshot(
                                    state,
                                    entry.snapshot
                                ),

                                revision:
                                    state.revision +
                                    1,

                                history: {
                                    ...state.history,

                                    past:
                                        past.slice(
                                            0,
                                            -1
                                        ),

                                    future: [
                                        ...state
                                            .history
                                            .future,
                                        currentEntry
                                    ].slice(
                                        -state
                                            .history
                                            .limit
                                    ),

                                    transaction:
                                        null
                                },

                                persistence: {
                                    ...state.persistence,

                                    dirty:
                                        true
                                }
                            };
                        }
                    );
                },

                redo: () => {
                    set(
                        state => {
                            const future =
                                state.history
                                    .future;

                            if (
                                future.length ===
                                0 ||
                                state.history
                                    .transaction
                            ) {
                                return {};
                            }

                            const entry =
                                future[
                                    future.length -
                                    1
                                ];

                            const currentEntry =
                                createHistoryEntry(
                                    entry.label,
                                    createHistorySnapshot(
                                        state
                                    )
                                );

                            return {
                                ...restoreSnapshot(
                                    state,
                                    entry.snapshot
                                ),

                                revision:
                                    state.revision +
                                    1,

                                history: {
                                    ...state.history,

                                    past: [
                                        ...state
                                            .history
                                            .past,
                                        currentEntry
                                    ].slice(
                                        -state
                                            .history
                                            .limit
                                    ),

                                    future:
                                        future.slice(
                                            0,
                                            -1
                                        ),

                                    transaction:
                                        null
                                },

                                persistence: {
                                    ...state.persistence,

                                    dirty:
                                        true
                                }
                            };
                        }
                    );
                },

                clearHistory: () => {
                    set(
                        state => ({
                            history: {
                                ...state.history,

                                past: [],

                                future: [],

                                transaction:
                                    null
                            }
                        })
                    );
                },

                setHistoryLimit:
                    limit => {
                        const safeLimit =
                            clamp(
                                limit,
                                10,
                                500
                            );

                        set(
                            state => ({
                                history: {
                                    ...state.history,

                                    limit:
                                        safeLimit,

                                    past:
                                        state.history
                                            .past
                                            .slice(
                                                -safeLimit
                                            ),

                                    future:
                                        state.history
                                            .future
                                            .slice(
                                                -safeLimit
                                            )
                                }
                            })
                        );
                    },

                canUndo: () =>
                    get().history.past
                        .length > 0 ||
                    Boolean(
                        get().history
                            .transaction
                    ),

                canRedo: () =>
                    get().history.future
                        .length > 0,

                /*=========================================
                Project Import and Export
                =========================================*/

                getProjectData: () => {
                    const state =
                        get();

                    return cloneSerializable({
                        schemaVersion:
                            PROJECT_SCHEMA_VERSION,

                        document:
                            state.document,

                        layers:
                            state.layers,

                        objects:
                            state.objects,

                        activeLayerId:
                            state.activeLayerId,

                        exportedAt:
                            nowIso()
                    });
                },

                loadProject:
                    projectData => {
                        const normalized =
                            normalizeProjectData(
                                projectData
                            );

                        set(
                            state => ({
                                document:
                                    normalized.document,

                                layers:
                                    normalized.layers,

                                objects:
                                    normalized.objects,

                                activeLayerId:
                                    normalized
                                        .activeLayerId,

                                selectedObjectIds:
                                    [],

                                revision:
                                    0,

                                viewport:
                                    createDefaultViewport(),

                                clipboard: {
                                    objects: [],

                                    pasteCount:
                                        0
                                },

                                history: {
                                    ...state.history,

                                    past: [],

                                    future: [],

                                    transaction:
                                        null
                                },

                                persistence: {
                                    dirty:
                                        false,

                                    saving:
                                        false,

                                    lastSavedAt:
                                        nowIso(),

                                    error:
                                        null
                                }
                            })
                        );
                    },

                /*=========================================
                Persistence Status
                =========================================*/

                setSaving:
                    saving => {
                        set(
                            state => ({
                                persistence: {
                                    ...state.persistence,

                                    saving:
                                        Boolean(
                                            saving
                                        ),

                                    error:
                                        saving
                                            ? null
                                            : state
                                                .persistence
                                                .error
                                }
                            })
                        );
                    },

                markSaved: () => {
                    set(
                        state => ({
                            persistence: {
                                ...state.persistence,

                                dirty:
                                    false,

                                saving:
                                    false,

                                lastSavedAt:
                                    nowIso(),

                                error:
                                    null
                            }
                        })
                    );
                },

                setSaveError:
                    error => {
                        set(
                            state => ({
                                persistence: {
                                    ...state.persistence,

                                    saving:
                                        false,

                                    error:
                                        error?.message ||
                                        String(
                                            error ||
                                            "Unknown save error"
                                        )
                                }
                            })
                        );
                    }
            };
        }
    );

/*=========================================================
Reusable Selectors
=========================================================*/

export const selectActiveLayer =
    state =>
        state.layers.find(
            layer =>
                layer.id ===
                state.activeLayerId
        ) ||
        null;

export const selectSelectedObjects =
    state =>
        state.selectedObjectIds
            .map(
                objectId =>
                    state.objects[
                        objectId
                    ]
            )
            .filter(Boolean);

export const selectActiveLayerObjects =
    state => {
        const layer =
            state.layers.find(
                item =>
                    item.id ===
                    state.activeLayerId
            );

        if (!layer) {
            return [];
        }

        return layer.objectIds
            .map(
                objectId =>
                    state.objects[
                        objectId
                    ]
            )
            .filter(Boolean);
    };

export const selectVisibleObjects =
    state =>
        state.layers.flatMap(
            layer => {
                if (!layer.visible) {
                    return [];
                }

                return layer.objectIds
                    .map(
                        objectId =>
                            state.objects[
                                objectId
                            ]
                    )
                    .filter(
                        object =>
                            object &&
                            object.visible !==
                            false
                    );
            }
        );

export const selectCanUndo =
    state =>
        state.history.past.length >
            0 ||
        Boolean(
            state.history.transaction
        );

export const selectCanRedo =
    state =>
        state.history.future.length >
        0;

export default useFashionEditorStore;