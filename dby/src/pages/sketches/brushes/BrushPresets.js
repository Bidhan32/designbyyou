/*
=========================================================
FashionVision Professional Editor
Brush Presets
Version 1.0
=========================================================
*/

/*=========================================================
Brush Categories
=========================================================*/

export const BRUSH_CATEGORIES =
    Object.freeze({
        PENCIL:
            "pencil",

        INK:
            "ink",

        MARKER:
            "marker",

        DRY_MEDIA:
            "dry-media",

        CALLIGRAPHY:
            "calligraphy"
    });

/*=========================================================
Brush Render Modes
=========================================================*/

export const BRUSH_RENDER_MODES =
    Object.freeze({
        LINE:
            "line",

        OUTLINE:
            "outline",

        STAMP:
            "stamp"
    });

/*=========================================================
Brush Tip Shapes
=========================================================*/

export const BRUSH_TIP_SHAPES =
    Object.freeze({
        ROUND:
            "round",

        FLAT:
            "flat",

        OVAL:
            "oval",

        TEXTURED:
            "textured"
    });

/*=========================================================
Brush Preset Identifiers
=========================================================*/

export const BRUSH_PRESET_IDS =
    Object.freeze({
        BASIC_PENCIL:
            "pencil-basic",

        FASHION_PENCIL:
            "pencil-fashion",

        INK_PEN:
            "ink-pen",

        TECHNICAL_PEN:
            "technical-pen",

        MARKER:
            "marker-basic",

        CHALK:
            "chalk-basic",

        CHARCOAL:
            "charcoal-basic",

        CALLIGRAPHY:
            "calligraphy-basic"
    });

export const DEFAULT_BRUSH_PRESET_ID =
    BRUSH_PRESET_IDS.BASIC_PENCIL;

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
            numberOr(
                value,
                minimum
            )
        )
    );
}

/*=========================================================
General Helpers
=========================================================*/

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function createPresetId(
    value
) {
    const cleaned =
        String(
            value || ""
        )
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );

    return (
        cleaned ||
        `brush-${Date.now()}`
    );
}

function clonePreset(
    preset
) {
    return {
        ...preset,

        tip: {
            ...preset.tip
        },

        dynamics: {
            ...preset.dynamics
        },

        texture: {
            ...preset.texture
        },

        metadata: {
            ...preset.metadata
        }
    };
}

function deepFreeze(
    value
) {
    if (
        !value ||
        typeof value !== "object" ||
        Object.isFrozen(value)
    ) {
        return value;
    }

    Object.freeze(
        value
    );

    Object.values(
        value
    ).forEach(
        child => {
            deepFreeze(
                child
            );
        }
    );

    return value;
}

/*=========================================================
Default Preset Shape
=========================================================*/

const DEFAULT_PRESET =
    Object.freeze({
        id:
            DEFAULT_BRUSH_PRESET_ID,

        name:
            "Basic Pencil",

        description:
            "A clean pressure-sensitive pencil for everyday fashion sketching.",

        category:
            BRUSH_CATEGORIES.PENCIL,

        brushType:
            "pencil",

        renderMode:
            BRUSH_RENDER_MODES.LINE,

        size:
            4,

        minimumSize:
            0.25,

        maximumSize:
            300,

        opacity:
            1,

        flow:
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

        spacing:
            0.1,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.ROUND,

            hardness:
                0.9,

            roundness:
                1,

            angle:
                0
        },

        dynamics: {
            pressureSize:
                0.55,

            pressureOpacity:
                0.15,

            velocitySize:
                0.08,

            velocityOpacity:
                0,

            sizeJitter:
                0,

            opacityJitter:
                0,

            angleJitter:
                0,

            scatter:
                0
        },

        texture: {
            enabled:
                false,

            textureId:
                null,

            strength:
                0,

            scale:
                1,

            rotation:
                0
        },

        metadata: {
            builtIn:
                true,

            version:
                1,

            tags: [
                "pencil",
                "basic",
                "sketch"
            ]
        }
    });

/*=========================================================
Preset Normalization
=========================================================*/

export function normalizeBrushPreset(
    preset = {},
    fallback =
        DEFAULT_PRESET
) {
    const source =
        isPlainObject(preset)
            ? preset
            : {};

    const base =
        isPlainObject(fallback)
            ? fallback
            : DEFAULT_PRESET;

    const minimumSize =
        Math.max(
            0.1,
            numberOr(
                source.minimumSize,
                base.minimumSize
            )
        );

    const maximumSize =
        Math.max(
            minimumSize,
            numberOr(
                source.maximumSize,
                base.maximumSize
            )
        );

    const category =
        Object.values(
            BRUSH_CATEGORIES
        ).includes(
            source.category
        )
            ? source.category
            : base.category;

    const renderMode =
        Object.values(
            BRUSH_RENDER_MODES
        ).includes(
            source.renderMode
        )
            ? source.renderMode
            : base.renderMode;

    const tipShape =
        Object.values(
            BRUSH_TIP_SHAPES
        ).includes(
            source.tip?.shape
        )
            ? source.tip.shape
            : base.tip.shape;

    return {
        ...base,
        ...source,

        id:
            createPresetId(
                source.id ||
                source.name ||
                base.id
            ),

        name:
            typeof source.name ===
                "string" &&
            source.name.trim()
                ? source.name.trim()
                : base.name,

        description:
            typeof source.description ===
                "string"
                ? source.description.trim()
                : base.description,

        category,

        brushType:
            typeof source.brushType ===
                "string" &&
            source.brushType.trim()
                ? source.brushType.trim()
                : base.brushType,

        renderMode,

        minimumSize,

        maximumSize,

        size:
            clamp(
                source.size ??
                base.size,
                minimumSize,
                maximumSize
            ),

        opacity:
            clamp(
                source.opacity ??
                base.opacity,
                0.01,
                1
            ),

        flow:
            clamp(
                source.flow ??
                base.flow,
                0.01,
                1
            ),

        smoothing:
            clamp(
                source.smoothing ??
                base.smoothing,
                0,
                1
            ),

        streamline:
            clamp(
                source.streamline ??
                base.streamline,
                0,
                1
            ),

        thinning:
            clamp(
                source.thinning ??
                base.thinning,
                -1,
                1
            ),

        taperStart:
            Math.max(
                0,
                numberOr(
                    source.taperStart,
                    base.taperStart
                )
            ),

        taperEnd:
            Math.max(
                0,
                numberOr(
                    source.taperEnd,
                    base.taperEnd
                )
            ),

        spacing:
            clamp(
                source.spacing ??
                base.spacing,
                0.01,
                5
            ),

        pressureEnabled:
            source.pressureEnabled !==
            false,

        simulatePressure:
            source.simulatePressure !==
            false,

        tip: {
            ...base.tip,
            ...(
                isPlainObject(
                    source.tip
                )
                    ? source.tip
                    : {}
            ),

            shape:
                tipShape,

            hardness:
                clamp(
                    source.tip
                        ?.hardness ??
                    base.tip.hardness,
                    0,
                    1
                ),

            roundness:
                clamp(
                    source.tip
                        ?.roundness ??
                    base.tip.roundness,
                    0.05,
                    1
                ),

            angle:
                numberOr(
                    source.tip
                        ?.angle,
                    base.tip.angle
                )
        },

        dynamics: {
            ...base.dynamics,
            ...(
                isPlainObject(
                    source.dynamics
                )
                    ? source.dynamics
                    : {}
            ),

            pressureSize:
                clamp(
                    source.dynamics
                        ?.pressureSize ??
                    base.dynamics
                        .pressureSize,
                    -1,
                    1
                ),

            pressureOpacity:
                clamp(
                    source.dynamics
                        ?.pressureOpacity ??
                    base.dynamics
                        .pressureOpacity,
                    -1,
                    1
                ),

            velocitySize:
                clamp(
                    source.dynamics
                        ?.velocitySize ??
                    base.dynamics
                        .velocitySize,
                    -1,
                    1
                ),

            velocityOpacity:
                clamp(
                    source.dynamics
                        ?.velocityOpacity ??
                    base.dynamics
                        .velocityOpacity,
                    -1,
                    1
                ),

            sizeJitter:
                clamp(
                    source.dynamics
                        ?.sizeJitter ??
                    base.dynamics
                        .sizeJitter,
                    0,
                    1
                ),

            opacityJitter:
                clamp(
                    source.dynamics
                        ?.opacityJitter ??
                    base.dynamics
                        .opacityJitter,
                    0,
                    1
                ),

            angleJitter:
                clamp(
                    source.dynamics
                        ?.angleJitter ??
                    base.dynamics
                        .angleJitter,
                    0,
                    1
                ),

            scatter:
                clamp(
                    source.dynamics
                        ?.scatter ??
                    base.dynamics
                        .scatter,
                    0,
                    3
                )
        },

        texture: {
            ...base.texture,
            ...(
                isPlainObject(
                    source.texture
                )
                    ? source.texture
                    : {}
            ),

            enabled:
                source.texture
                    ?.enabled ===
                true,

            strength:
                clamp(
                    source.texture
                        ?.strength ??
                    base.texture
                        .strength,
                    0,
                    1
                ),

            scale:
                Math.max(
                    0.01,
                    numberOr(
                        source.texture
                            ?.scale,
                        base.texture
                            .scale
                    )
                ),

            rotation:
                numberOr(
                    source.texture
                        ?.rotation,
                    base.texture
                        .rotation
                )
        },

        metadata: {
            ...base.metadata,
            ...(
                isPlainObject(
                    source.metadata
                )
                    ? source.metadata
                    : {}
            ),

            tags:
                Array.isArray(
                    source.metadata
                        ?.tags
                )
                    ? [
                        ...new Set(
                            source.metadata.tags
                                .filter(
                                    tag =>
                                        typeof tag ===
                                            "string" &&
                                        tag.trim()
                                )
                                .map(
                                    tag =>
                                        tag.trim()
                                )
                        )
                    ]
                    : [
                        ...base.metadata
                            .tags
                    ]
        }
    };
}

/*=========================================================
Built-in Brush Presets
=========================================================*/

const BUILT_IN_PRESETS = [
    {
        id:
            BRUSH_PRESET_IDS.BASIC_PENCIL,

        name:
            "Basic Pencil",

        description:
            "A clean everyday pencil with natural pressure variation.",

        category:
            BRUSH_CATEGORIES.PENCIL,

        brushType:
            "pencil",

        renderMode:
            BRUSH_RENDER_MODES.LINE,

        size:
            4,

        opacity:
            1,

        smoothing:
            0.55,

        streamline:
            0.45,

        thinning:
            0.22,

        taperStart:
            0,

        taperEnd:
            8,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.ROUND,

            hardness:
                0.92,

            roundness:
                1,

            angle:
                0
        },

        dynamics: {
            pressureSize:
                0.58,

            pressureOpacity:
                0.12,

            velocitySize:
                0.08
        },

        metadata: {
            tags: [
                "pencil",
                "basic",
                "drawing"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.FASHION_PENCIL,

        name:
            "Fashion Sketch Pencil",

        description:
            "A light, expressive pencil designed for fast fashion silhouettes.",

        category:
            BRUSH_CATEGORIES.PENCIL,

        brushType:
            "fashion-pencil",

        renderMode:
            BRUSH_RENDER_MODES.OUTLINE,

        size:
            6,

        opacity:
            0.78,

        flow:
            0.86,

        smoothing:
            0.68,

        streamline:
            0.58,

        thinning:
            0.52,

        taperStart:
            4,

        taperEnd:
            18,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.OVAL,

            hardness:
                0.72,

            roundness:
                0.72,

            angle:
                -12
        },

        dynamics: {
            pressureSize:
                0.82,

            pressureOpacity:
                0.32,

            velocitySize:
                0.18,

            velocityOpacity:
                0.08,

            sizeJitter:
                0.015
        },

        metadata: {
            tags: [
                "fashion",
                "pencil",
                "gesture",
                "silhouette"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.INK_PEN,

        name:
            "Ink Pen",

        description:
            "A smooth pressure-sensitive ink pen with tapered endings.",

        category:
            BRUSH_CATEGORIES.INK,

        brushType:
            "ink",

        renderMode:
            BRUSH_RENDER_MODES.OUTLINE,

        size:
            7,

        opacity:
            1,

        flow:
            1,

        smoothing:
            0.78,

        streamline:
            0.72,

        thinning:
            0.7,

        taperStart:
            6,

        taperEnd:
            16,

        spacing:
            0.05,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.ROUND,

            hardness:
                1,

            roundness:
                1,

            angle:
                0
        },

        dynamics: {
            pressureSize:
                0.9,

            pressureOpacity:
                0,

            velocitySize:
                0.12,

            velocityOpacity:
                0
        },

        metadata: {
            tags: [
                "ink",
                "smooth",
                "line-art"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.TECHNICAL_PEN,

        name:
            "Technical Pen",

        description:
            "A precise uniform pen for seams, construction lines and details.",

        category:
            BRUSH_CATEGORIES.INK,

        brushType:
            "technical-pen",

        renderMode:
            BRUSH_RENDER_MODES.LINE,

        size:
            2,

        opacity:
            1,

        flow:
            1,

        smoothing:
            0.88,

        streamline:
            0.82,

        thinning:
            0,

        taperStart:
            0,

        taperEnd:
            0,

        spacing:
            0.04,

        pressureEnabled:
            false,

        simulatePressure:
            false,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.ROUND,

            hardness:
                1,

            roundness:
                1,

            angle:
                0
        },

        dynamics: {
            pressureSize:
                0,

            pressureOpacity:
                0,

            velocitySize:
                0,

            velocityOpacity:
                0
        },

        metadata: {
            tags: [
                "technical",
                "precise",
                "seam",
                "detail"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.MARKER,

        name:
            "Fashion Marker",

        description:
            "A broad translucent marker for blocking fabric colour and shadows.",

        category:
            BRUSH_CATEGORIES.MARKER,

        brushType:
            "marker",

        renderMode:
            BRUSH_RENDER_MODES.OUTLINE,

        size:
            28,

        opacity:
            0.42,

        flow:
            0.62,

        smoothing:
            0.72,

        streamline:
            0.62,

        thinning:
            0.18,

        taperStart:
            0,

        taperEnd:
            4,

        spacing:
            0.08,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.FLAT,

            hardness:
                0.82,

            roundness:
                0.38,

            angle:
                -28
        },

        dynamics: {
            pressureSize:
                0.28,

            pressureOpacity:
                0.22,

            velocitySize:
                0.05,

            velocityOpacity:
                0.08
        },

        metadata: {
            tags: [
                "marker",
                "colour",
                "fabric",
                "shadow"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.CHALK,

        name:
            "Chalk",

        description:
            "A dry textured chalk brush for highlights and rough fabric studies.",

        category:
            BRUSH_CATEGORIES.DRY_MEDIA,

        brushType:
            "chalk",

        renderMode:
            BRUSH_RENDER_MODES.STAMP,

        size:
            18,

        opacity:
            0.72,

        flow:
            0.68,

        smoothing:
            0.38,

        streamline:
            0.25,

        thinning:
            0.12,

        taperStart:
            0,

        taperEnd:
            4,

        spacing:
            0.18,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.TEXTURED,

            hardness:
                0.46,

            roundness:
                0.84,

            angle:
                0
        },

        dynamics: {
            pressureSize:
                0.42,

            pressureOpacity:
                0.38,

            velocitySize:
                0.06,

            velocityOpacity:
                0.12,

            sizeJitter:
                0.08,

            opacityJitter:
                0.1,

            angleJitter:
                0.16,

            scatter:
                0.1
        },

        texture: {
            enabled:
                true,

            textureId:
                "chalk-grain",

            strength:
                0.68,

            scale:
                0.85,

            rotation:
                0
        },

        metadata: {
            tags: [
                "chalk",
                "dry",
                "texture",
                "highlight"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.CHARCOAL,

        name:
            "Charcoal",

        description:
            "A soft expressive charcoal brush for dramatic shading and form.",

        category:
            BRUSH_CATEGORIES.DRY_MEDIA,

        brushType:
            "charcoal",

        renderMode:
            BRUSH_RENDER_MODES.STAMP,

        size:
            24,

        opacity:
            0.58,

        flow:
            0.52,

        smoothing:
            0.34,

        streamline:
            0.22,

        thinning:
            0.26,

        taperStart:
            0,

        taperEnd:
            8,

        spacing:
            0.16,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.TEXTURED,

            hardness:
                0.28,

            roundness:
                0.68,

            angle:
                -8
        },

        dynamics: {
            pressureSize:
                0.68,

            pressureOpacity:
                0.52,

            velocitySize:
                0.1,

            velocityOpacity:
                0.12,

            sizeJitter:
                0.11,

            opacityJitter:
                0.13,

            angleJitter:
                0.18,

            scatter:
                0.14
        },

        texture: {
            enabled:
                true,

            textureId:
                "charcoal-grain",

            strength:
                0.82,

            scale:
                1.15,

            rotation:
                0
        },

        metadata: {
            tags: [
                "charcoal",
                "shading",
                "texture",
                "expressive"
            ]
        }
    },

    {
        id:
            BRUSH_PRESET_IDS.CALLIGRAPHY,

        name:
            "Calligraphy Pen",

        description:
            "An angled flat-tip pen for decorative outlines and fashion lettering.",

        category:
            BRUSH_CATEGORIES.CALLIGRAPHY,

        brushType:
            "calligraphy",

        renderMode:
            BRUSH_RENDER_MODES.OUTLINE,

        size:
            14,

        opacity:
            1,

        flow:
            1,

        smoothing:
            0.76,

        streamline:
            0.7,

        thinning:
            0.32,

        taperStart:
            4,

        taperEnd:
            10,

        spacing:
            0.05,

        pressureEnabled:
            true,

        simulatePressure:
            true,

        tip: {
            shape:
                BRUSH_TIP_SHAPES.FLAT,

            hardness:
                1,

            roundness:
                0.24,

            angle:
                -35
        },

        dynamics: {
            pressureSize:
                0.42,

            pressureOpacity:
                0,

            velocitySize:
                0.08,

            velocityOpacity:
                0,

            angleJitter:
                0
        },

        metadata: {
            tags: [
                "calligraphy",
                "flat-tip",
                "lettering",
                "decorative"
            ]
        }
    }
];

/*=========================================================
Normalized Built-in Presets
=========================================================*/

export const BRUSH_PRESETS =
    deepFreeze(
        BUILT_IN_PRESETS.map(
            preset =>
                normalizeBrushPreset(
                    preset,
                    DEFAULT_PRESET
                )
        )
    );

export const BRUSH_PRESET_MAP =
    deepFreeze(
        BRUSH_PRESETS.reduce(
            (
                result,
                preset
            ) => {
                result[preset.id] =
                    preset;

                return result;
            },
            {}
        )
    );

/*=========================================================
Preset Lookup
=========================================================*/

export function getBrushPreset(
    presetId,
    fallbackId =
        DEFAULT_BRUSH_PRESET_ID
) {
    const requestedId =
        typeof presetId ===
            "string"
            ? presetId
            : "";

    const safeFallbackId =
        typeof fallbackId ===
            "string"
            ? fallbackId
            : DEFAULT_BRUSH_PRESET_ID;

    return (
        BRUSH_PRESET_MAP[
            requestedId
        ] ||
        BRUSH_PRESET_MAP[
            safeFallbackId
        ] ||
        BRUSH_PRESETS[0] ||
        null
    );
}

export function getBrushPresetsByCategory(
    category
) {
    return BRUSH_PRESETS.filter(
        preset =>
            preset.category ===
            category
    );
}

export function searchBrushPresets(
    searchTerm
) {
    const query =
        String(
            searchTerm || ""
        )
            .trim()
            .toLowerCase();

    if (!query) {
        return [
            ...BRUSH_PRESETS
        ];
    }

    return BRUSH_PRESETS.filter(
        preset => {
            const searchableText = [
                preset.name,
                preset.description,
                preset.category,
                preset.brushType,
                ...preset.metadata.tags
            ]
                .join(" ")
                .toLowerCase();

            return searchableText.includes(
                query
            );
        }
    );
}

/*=========================================================
Store-compatible Brush Settings
=========================================================*/

export function createBrushSettingsFromPreset(
    presetOrId,
    currentSettings = {}
) {
    const preset =
        typeof presetOrId ===
            "string"
            ? getBrushPreset(
                presetOrId
            )
            : normalizeBrushPreset(
                presetOrId
            );

    const currentColor =
        typeof currentSettings.color ===
            "string" &&
        currentSettings.color.trim()
            ? currentSettings.color.trim()
            : "#111111";

    return {
        presetId:
            preset.id,

        brushType:
            preset.brushType,

        renderMode:
            preset.renderMode,

        color:
            currentColor,

        size:
            preset.size,

        minimumSize:
            preset.minimumSize,

        maximumSize:
            preset.maximumSize,

        opacity:
            preset.opacity,

        flow:
            preset.flow,

        smoothing:
            preset.smoothing,

        streamline:
            preset.streamline,

        thinning:
            preset.thinning,

        taperStart:
            preset.taperStart,

        taperEnd:
            preset.taperEnd,

        spacing:
            preset.spacing,

        pressureEnabled:
            preset.pressureEnabled,

        simulatePressure:
            preset.simulatePressure,

        tip: {
            ...preset.tip
        },

        dynamics: {
            ...preset.dynamics
        },

        texture: {
            ...preset.texture
        }
    };
}

/*=========================================================
Custom Presets
=========================================================*/

export function createCustomBrushPreset(
    overrides = {}
) {
    const customPreset =
        normalizeBrushPreset(
            {
                ...overrides,

                id:
                    createPresetId(
                        overrides.id ||
                        overrides.name ||
                        "custom-brush"
                    ),

                metadata: {
                    ...DEFAULT_PRESET.metadata,
                    ...(
                        isPlainObject(
                            overrides.metadata
                        )
                            ? overrides.metadata
                            : {}
                    ),

                    builtIn:
                        false
                }
            },
            DEFAULT_PRESET
        );

    return clonePreset(
        customPreset
    );
}

export function isBrushPreset(
    value
) {
    return Boolean(
        isPlainObject(value) &&
        typeof value.id ===
            "string" &&
        typeof value.name ===
            "string" &&
        typeof value.brushType ===
            "string" &&
        Number.isFinite(
            Number(value.size)
        )
    );
}

/*=========================================================
Default Export
=========================================================*/

export default BRUSH_PRESETS;