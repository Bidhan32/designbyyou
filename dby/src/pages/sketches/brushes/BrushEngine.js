/*
=========================================================
FashionVision Professional Editor
Brush Engine
Version 1.0
=========================================================
*/

import {
    BRUSH_RENDER_MODES,
    DEFAULT_BRUSH_PRESET_ID,
    createBrushSettingsFromPreset,
    getBrushPreset
} from "./BrushPresets";

/*=========================================================
Engine Constants
=========================================================*/

export const BRUSH_ENGINE_VERSION = 1;

export const DEFAULT_BRUSH_COLOR =
    "#111111";

export const DEFAULT_MAX_RAW_POINTS =
    20000;

export const DEFAULT_MINIMUM_POINT_DISTANCE =
    0.05;

export const BRUSH_POINT_TYPES =
    Object.freeze({
        MOUSE:
            "mouse",

        PEN:
            "pen",

        TOUCH:
            "touch",

        UNKNOWN:
            "unknown"
    });

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

function lerp(
    start,
    end,
    amount
) {
    return (
        start +
        (
            end -
            start
        ) *
        amount
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
        typeof value ===
            "object" &&
        !Array.isArray(
            value
        )
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

function nowIso() {
    return new Date().toISOString();
}

function createId(
    prefix = "brush"
) {
    if (
        typeof crypto !==
            "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return (
            `${prefix}-` +
            crypto.randomUUID()
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

function cloneSerializable(
    value
) {
    if (
        typeof globalThis
            .structuredClone ===
        "function"
    ) {
        try {
            return globalThis
                .structuredClone(
                    value
                );
        } catch {
            // Fall through to JSON cloning.
        }
    }

    return JSON.parse(
        JSON.stringify(
            value
        )
    );
}

function normalizePointerType(
    value
) {
    const pointerType =
        String(
            value || ""
        ).toLowerCase();

    if (
        Object.values(
            BRUSH_POINT_TYPES
        ).includes(
            pointerType
        )
    ) {
        return pointerType;
    }

    return BRUSH_POINT_TYPES.UNKNOWN;
}

/*=========================================================
Geometry Helpers
=========================================================*/

function distanceBetweenPoints(
    firstPoint,
    secondPoint
) {
    if (
        !firstPoint ||
        !secondPoint
    ) {
        return 0;
    }

    return Math.hypot(
        numberOr(
            secondPoint.x
        ) -
        numberOr(
            firstPoint.x
        ),

        numberOr(
            secondPoint.y
        ) -
        numberOr(
            firstPoint.y
        )
    );
}

function calculatePointAngle(
    previousPoint,
    nextPoint
) {
    if (
        !previousPoint ||
        !nextPoint
    ) {
        return 0;
    }

    return (
        Math.atan2(
            nextPoint.y -
                previousPoint.y,

            nextPoint.x -
                previousPoint.x
        ) *
        180 /
        Math.PI
    );
}

function calculatePerpendicular(
    previousPoint,
    nextPoint
) {
    if (
        !previousPoint ||
        !nextPoint
    ) {
        return {
            x: 0,
            y: 0
        };
    }

    const deltaX =
        nextPoint.x -
        previousPoint.x;

    const deltaY =
        nextPoint.y -
        previousPoint.y;

    const length =
        Math.hypot(
            deltaX,
            deltaY
        );

    if (length <= 0.0001) {
        return {
            x: 0,
            y: 0
        };
    }

    return {
        x:
            -deltaY /
            length,

        y:
            deltaX /
            length
    };
}

function interpolatePoint(
    firstPoint,
    secondPoint,
    amount
) {
    const safeAmount =
        clamp(
            amount,
            0,
            1
        );

    return {
        x:
            lerp(
                firstPoint.x,
                secondPoint.x,
                safeAmount
            ),

        y:
            lerp(
                firstPoint.y,
                secondPoint.y,
                safeAmount
            ),

        pressure:
            lerp(
                numberOr(
                    firstPoint.pressure,
                    0.5
                ),
                numberOr(
                    secondPoint.pressure,
                    0.5
                ),
                safeAmount
            ),

        effectivePressure:
            lerp(
                numberOr(
                    firstPoint
                        .effectivePressure,
                    0.5
                ),
                numberOr(
                    secondPoint
                        .effectivePressure,
                    0.5
                ),
                safeAmount
            ),

        velocity:
            lerp(
                numberOr(
                    firstPoint.velocity
                ),
                numberOr(
                    secondPoint.velocity
                ),
                safeAmount
            ),

        normalizedVelocity:
            lerp(
                numberOr(
                    firstPoint
                        .normalizedVelocity
                ),
                numberOr(
                    secondPoint
                        .normalizedVelocity
                ),
                safeAmount
            ),

        width:
            lerp(
                numberOr(
                    firstPoint.width,
                    1
                ),
                numberOr(
                    secondPoint.width,
                    1
                ),
                safeAmount
            ),

        opacity:
            lerp(
                numberOr(
                    firstPoint.opacity,
                    1
                ),
                numberOr(
                    secondPoint.opacity,
                    1
                ),
                safeAmount
            ),

        rotation:
            lerp(
                numberOr(
                    firstPoint.rotation
                ),
                numberOr(
                    secondPoint.rotation
                ),
                safeAmount
            ),

        distance:
            lerp(
                numberOr(
                    firstPoint.distance
                ),
                numberOr(
                    secondPoint.distance
                ),
                safeAmount
            ),

        time:
            lerp(
                numberOr(
                    firstPoint.time
                ),
                numberOr(
                    secondPoint.time
                ),
                safeAmount
            ),

        pointerType:
            secondPoint.pointerType ||
            firstPoint.pointerType ||
            BRUSH_POINT_TYPES.UNKNOWN
    };
}

/*=========================================================
Deterministic Noise
=========================================================*/

function hashNumber(
    value
) {
    const sine =
        Math.sin(
            numberOr(value) *
            12.9898
        ) *
        43758.5453;

    return (
        sine -
        Math.floor(
            sine
        )
    );
}

function signedNoise(
    seed
) {
    return (
        hashNumber(
            seed
        ) *
        2 -
        1
    );
}

/*=========================================================
Brush Settings Resolution
=========================================================*/

export function resolveBrushSettings(
    settings = {},
    fallbackPresetId =
        DEFAULT_BRUSH_PRESET_ID
) {
    const source =
        typeof settings ===
            "string"
            ? {
                presetId:
                    settings
            }
            : isPlainObject(
                settings
            )
                ? settings
                : {};

    const preset =
        getBrushPreset(
            source.presetId ||
            fallbackPresetId
        );

    const presetSettings =
        createBrushSettingsFromPreset(
            preset,
            source
        );

    const minimumSize =
        Math.max(
            0.1,
            numberOr(
                source.minimumSize,
                presetSettings
                    .minimumSize
            )
        );

    const maximumSize =
        Math.max(
            minimumSize,
            numberOr(
                source.maximumSize,
                presetSettings
                    .maximumSize
            )
        );

    const renderMode =
        Object.values(
            BRUSH_RENDER_MODES
        ).includes(
            source.renderMode
        )
            ? source.renderMode
            : presetSettings
                .renderMode;

    return {
        ...presetSettings,
        ...source,

        presetId:
            preset.id,

        brushType:
            source.brushType ||
            presetSettings
                .brushType,

        renderMode,

        color:
            typeof source.color ===
                "string" &&
            source.color.trim()
                ? source.color.trim()
                : DEFAULT_BRUSH_COLOR,

        minimumSize,

        maximumSize,

        size:
            clamp(
                source.size ??
                presetSettings.size,
                minimumSize,
                maximumSize
            ),

        opacity:
            clamp(
                source.opacity ??
                presetSettings
                    .opacity,
                0.01,
                1
            ),

        flow:
            clamp(
                source.flow ??
                presetSettings.flow,
                0.01,
                1
            ),

        smoothing:
            clamp(
                source.smoothing ??
                presetSettings
                    .smoothing,
                0,
                1
            ),

        streamline:
            clamp(
                source.streamline ??
                presetSettings
                    .streamline,
                0,
                1
            ),

        thinning:
            clamp(
                source.thinning ??
                presetSettings
                    .thinning,
                -1,
                1
            ),

        taperStart:
            Math.max(
                0,
                numberOr(
                    source.taperStart,
                    presetSettings
                        .taperStart
                )
            ),

        taperEnd:
            Math.max(
                0,
                numberOr(
                    source.taperEnd,
                    presetSettings
                        .taperEnd
                )
            ),

        spacing:
            clamp(
                source.spacing ??
                presetSettings
                    .spacing,
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
            ...presetSettings.tip,
            ...(
                isPlainObject(
                    source.tip
                )
                    ? source.tip
                    : {}
            ),

            hardness:
                clamp(
                    source.tip
                        ?.hardness ??
                    presetSettings
                        .tip
                        .hardness,
                    0,
                    1
                ),

            roundness:
                clamp(
                    source.tip
                        ?.roundness ??
                    presetSettings
                        .tip
                        .roundness,
                    0.05,
                    1
                ),

            angle:
                numberOr(
                    source.tip
                        ?.angle,
                    presetSettings
                        .tip
                        .angle
                )
        },

        dynamics: {
            ...presetSettings
                .dynamics,
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
                    presetSettings
                        .dynamics
                        .pressureSize,
                    -1,
                    1
                ),

            pressureOpacity:
                clamp(
                    source.dynamics
                        ?.pressureOpacity ??
                    presetSettings
                        .dynamics
                        .pressureOpacity,
                    -1,
                    1
                ),

            velocitySize:
                clamp(
                    source.dynamics
                        ?.velocitySize ??
                    presetSettings
                        .dynamics
                        .velocitySize,
                    -1,
                    1
                ),

            velocityOpacity:
                clamp(
                    source.dynamics
                        ?.velocityOpacity ??
                    presetSettings
                        .dynamics
                        .velocityOpacity,
                    -1,
                    1
                ),

            sizeJitter:
                clamp(
                    source.dynamics
                        ?.sizeJitter ??
                    presetSettings
                        .dynamics
                        .sizeJitter,
                    0,
                    1
                ),

            opacityJitter:
                clamp(
                    source.dynamics
                        ?.opacityJitter ??
                    presetSettings
                        .dynamics
                        .opacityJitter,
                    0,
                    1
                ),

            angleJitter:
                clamp(
                    source.dynamics
                        ?.angleJitter ??
                    presetSettings
                        .dynamics
                        .angleJitter,
                    0,
                    1
                ),

            scatter:
                clamp(
                    source.dynamics
                        ?.scatter ??
                    presetSettings
                        .dynamics
                        .scatter,
                    0,
                    3
                )
        },

        texture: {
            ...presetSettings
                .texture,
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
                    presetSettings
                        .texture
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
                        presetSettings
                            .texture
                            .scale
                    )
                ),

            rotation:
                numberOr(
                    source.texture
                        ?.rotation,
                    presetSettings
                        .texture
                        .rotation
                )
        }
    };
}

/*=========================================================
Point Normalization
=========================================================*/

export function normalizeBrushPoint(
    point,
    index = 0,
    previousPoint = null
) {
    let source = point;

    if (
        Array.isArray(
            point
        )
    ) {
        source = {
            x:
                point[0],

            y:
                point[1],

            pressure:
                point[2],

            time:
                point[3]
        };
    }

    if (
        !isPlainObject(
            source
        )
    ) {
        return null;
    }

    const x =
        Number(
            source.x
        );

    const y =
        Number(
            source.y
        );

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return null;
    }

    const pointerType =
        normalizePointerType(
            source.pointerType
        );

    const rawPressure =
        Number(
            source.pressure
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
    Browsers frequently report pressure 0
    for mouse pointer-up events. Treat that
    as missing pressure rather than forcing
    the stroke to zero width.
    */

    if (
        pointerType ===
            BRUSH_POINT_TYPES.MOUSE &&
        pressure === 0
    ) {
        pressure =
            null;
    }

    const fallbackTime =
        previousPoint
            ? numberOr(
                previousPoint.time
            ) + 16
            : index * 16;

    return {
        x,
        y,

        pressure,

        tiltX:
            clamp(
                source.tiltX,
                -90,
                90
            ),

        tiltY:
            clamp(
                source.tiltY,
                -90,
                90
            ),

        twist:
            numberOr(
                source.twist,
                0
            ),

        tangentialPressure:
            clamp(
                source
                    .tangentialPressure,
                -1,
                1
            ),

        pointerType,

        pointerId:
            source.pointerId ??
            null,

        time:
            numberOr(
                source.time ??
                source.timestamp,
                fallbackTime
            ),

        index:
            numberOr(
                source.index,
                index
            )
    };
}

export function normalizeBrushPoints(
    points = []
) {
    if (
        !Array.isArray(
            points
        )
    ) {
        return [];
    }

    /*
    Support a flat Konva point array:
    [x1, y1, x2, y2, ...]
    */

    if (
        points.length > 0 &&
        points.every(
            value =>
                Number.isFinite(
                    Number(value)
                )
        )
    ) {
        const normalized = [];

        for (
            let index = 0;
            index <
            points.length - 1;
            index += 2
        ) {
            const previousPoint =
                normalized[
                    normalized.length -
                    1
                ] ||
                null;

            const point =
                normalizeBrushPoint(
                    {
                        x:
                            points[index],

                        y:
                            points[
                                index + 1
                            ]
                    },
                    normalized.length,
                    previousPoint
                );

            if (point) {
                normalized.push(
                    point
                );
            }
        }

        return normalized;
    }

    const normalized = [];

    points.forEach(
        (
            point,
            index
        ) => {
            const previousPoint =
                normalized[
                    normalized.length -
                    1
                ] ||
                null;

            const normalizedPoint =
                normalizeBrushPoint(
                    point,
                    index,
                    previousPoint
                );

            if (
                normalizedPoint
            ) {
                normalized.push(
                    normalizedPoint
                );
            }
        }
    );

    return normalized;
}

/*=========================================================
Point Reduction
=========================================================*/

export function removeDuplicateBrushPoints(
    points,
    minimumDistance =
        DEFAULT_MINIMUM_POINT_DISTANCE
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return [];
    }

    if (
        points.length === 1
    ) {
        return [
            {
                ...points[0]
            }
        ];
    }

    const safeDistance =
        Math.max(
            0,
            numberOr(
                minimumDistance,
                DEFAULT_MINIMUM_POINT_DISTANCE
            )
        );

    const result = [
        {
            ...points[0]
        }
    ];

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        const point =
            points[index];

        const previousAccepted =
            result[
                result.length -
                1
            ];

        const distance =
            distanceBetweenPoints(
                previousAccepted,
                point
            );

        const isLastPoint =
            index ===
            points.length - 1;

        if (
            distance >=
                safeDistance ||
            isLastPoint
        ) {
            result.push({
                ...point
            });
        }
    }

    return result;
}

/*=========================================================
Streamline Processing
=========================================================*/

export function streamlineBrushPoints(
    points,
    streamline = 0
) {
    if (
        !Array.isArray(points) ||
        points.length < 2
    ) {
        return Array.isArray(
            points
        )
            ? points.map(
                point => ({
                    ...point
                })
            )
            : [];
    }

    const strength =
        clamp(
            streamline,
            0,
            1
        );

    if (strength <= 0) {
        return points.map(
            point => ({
                ...point
            })
        );
    }

    const interpolation =
        clamp(
            1 -
            strength * 0.82,
            0.08,
            1
        );

    const result = [
        {
            ...points[0]
        }
    ];

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        const sourcePoint =
            points[index];

        const previousPoint =
            result[
                result.length -
                1
            ];

        result.push({
            ...sourcePoint,

            x:
                lerp(
                    previousPoint.x,
                    sourcePoint.x,
                    interpolation
                ),

            y:
                lerp(
                    previousPoint.y,
                    sourcePoint.y,
                    interpolation
                )
        });
    }

    return result;
}

/*=========================================================
Smoothing Processing
=========================================================*/

function smoothBrushPointPass(
    points,
    strength
) {
    if (
        points.length < 3
    ) {
        return points.map(
            point => ({
                ...point
            })
        );
    }

    const result = [
        {
            ...points[0]
        }
    ];

    for (
        let index = 1;
        index <
        points.length - 1;
        index += 1
    ) {
        const previousPoint =
            points[
                index - 1
            ];

        const point =
            points[index];

        const nextPoint =
            points[
                index + 1
            ];

        const averageX =
            (
                previousPoint.x +
                point.x * 2 +
                nextPoint.x
            ) / 4;

        const averageY =
            (
                previousPoint.y +
                point.y * 2 +
                nextPoint.y
            ) / 4;

        result.push({
            ...point,

            x:
                lerp(
                    point.x,
                    averageX,
                    strength
                ),

            y:
                lerp(
                    point.y,
                    averageY,
                    strength
                )
        });
    }

    result.push({
        ...points[
            points.length -
            1
        ]
    });

    return result;
}

export function smoothBrushPoints(
    points,
    smoothing = 0
) {
    if (
        !Array.isArray(points) ||
        points.length < 3
    ) {
        return Array.isArray(
            points
        )
            ? points.map(
                point => ({
                    ...point
                })
            )
            : [];
    }

    const strength =
        clamp(
            smoothing,
            0,
            1
        );

    if (strength <= 0) {
        return points.map(
            point => ({
                ...point
            })
        );
    }

    const passCount =
        strength > 0.8
            ? 4
            : strength > 0.55
                ? 3
                : strength > 0.25
                    ? 2
                    : 1;

    let result =
        points.map(
            point => ({
                ...point
            })
        );

    for (
        let pass = 0;
        pass < passCount;
        pass += 1
    ) {
        result =
            smoothBrushPointPass(
                result,
                strength * 0.72
            );
    }

    return result;
}

/*=========================================================
Stroke Metrics
=========================================================*/

export function calculateStrokeLength(
    points = []
) {
    if (
        !Array.isArray(points) ||
        points.length < 2
    ) {
        return 0;
    }

    let length = 0;

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        length +=
            distanceBetweenPoints(
                points[
                    index - 1
                ],
                points[index]
            );
    }

    return length;
}

function addStrokeMetrics(
    points,
    settings
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return [];
    }

    let cumulativeDistance =
        0;

    const velocityReference =
        Math.max(
            0.15,
            settings.size *
            0.075
        );

    return points.map(
        (
            point,
            index
        ) => {
            const previousPoint =
                points[
                    Math.max(
                        0,
                        index - 1
                    )
                ];

            const segmentDistance =
                index === 0
                    ? 0
                    : distanceBetweenPoints(
                        previousPoint,
                        point
                    );

            cumulativeDistance +=
                segmentDistance;

            const elapsedTime =
                index === 0
                    ? 16
                    : Math.max(
                        1,
                        point.time -
                        previousPoint.time
                    );

            const velocity =
                segmentDistance /
                elapsedTime;

            const normalizedVelocity =
                clamp(
                    velocity /
                    velocityReference,
                    0,
                    1
                );

            return {
                ...point,

                segmentDistance,

                distance:
                    cumulativeDistance,

                velocity,

                normalizedVelocity
            };
        }
    );
}

/*=========================================================
Pressure Simulation
=========================================================*/

function hasReliablePressure(
    point
) {
    if (
        !Number.isFinite(
            Number(
                point?.pressure
            )
        )
    ) {
        return false;
    }

    if (
        point.pointerType ===
            BRUSH_POINT_TYPES.MOUSE
    ) {
        return false;
    }

    return true;
}

function simulatePointPressure(
    point,
    progress
) {
    const velocityInfluence =
        1 -
        clamp(
            point.normalizedVelocity,
            0,
            1
        );

    const strokeShape =
        Math.sin(
            clamp(
                progress,
                0,
                1
            ) *
            Math.PI
        );

    return clamp(
        0.18 +
        velocityInfluence * 0.66 +
        strokeShape * 0.16,
        0.05,
        1
    );
}

function applyPressure(
    points,
    settings,
    totalLength
) {
    return points.map(
        point => {
            const progress =
                totalLength > 0
                    ? point.distance /
                    totalLength
                    : 0;

            let effectivePressure =
                0.5;

            if (
                settings.pressureEnabled &&
                hasReliablePressure(
                    point
                )
            ) {
                effectivePressure =
                    clamp(
                        point.pressure,
                        0.01,
                        1
                    );
            } else if (
                settings
                    .simulatePressure
            ) {
                effectivePressure =
                    simulatePointPressure(
                        point,
                        progress
                    );
            }

            return {
                ...point,

                effectivePressure
            };
        }
    );
}

/*=========================================================
Taper
=========================================================*/

function calculateTaperFactor(
    distance,
    totalLength,
    taperStart,
    taperEnd
) {
    let startFactor = 1;
    let endFactor = 1;

    if (taperStart > 0) {
        startFactor =
            clamp(
                distance /
                taperStart,
                0,
                1
            );
    }

    if (taperEnd > 0) {
        endFactor =
            clamp(
                (
                    totalLength -
                    distance
                ) /
                taperEnd,
                0,
                1
            );
    }

    return Math.min(
        startFactor,
        endFactor
    );
}

/*=========================================================
Brush Dynamics
=========================================================*/

function applyBrushDynamics(
    points,
    settings,
    totalLength,
    seed
) {
    const dynamics =
        settings.dynamics;

    const tipAngle =
        numberOr(
            settings.tip?.angle,
            0
        );

    return points.map(
        (
            point,
            index
        ) => {
            const previousPoint =
                points[
                    Math.max(
                        0,
                        index - 1
                    )
                ];

            const nextPoint =
                points[
                    Math.min(
                        points.length -
                        1,
                        index + 1
                    )
                ];

            const pressure =
                clamp(
                    point
                        .effectivePressure,
                    0,
                    1
                );

            const pressureCentered =
                (
                    pressure -
                    0.5
                ) *
                2;

            const velocity =
                clamp(
                    point
                        .normalizedVelocity,
                    0,
                    1
                );

            const pressureSizeFactor =
                1 +
                dynamics
                    .pressureSize *
                pressureCentered;

            const thinningFactor =
                1 +
                settings.thinning *
                pressureCentered *
                0.65;

            const velocitySizeFactor =
                1 -
                dynamics
                    .velocitySize *
                velocity;

            const sizeNoise =
                signedNoise(
                    seed +
                    index * 37.17
                ) *
                dynamics
                    .sizeJitter;

            const taperFactor =
                calculateTaperFactor(
                    point.distance,
                    totalLength,
                    settings
                        .taperStart,
                    settings
                        .taperEnd
                );

            const widthFactor =
                Math.max(
                    0.02,
                    pressureSizeFactor *
                    thinningFactor *
                    velocitySizeFactor *
                    (
                        1 +
                        sizeNoise
                    ) *
                    Math.max(
                        0.01,
                        taperFactor
                    )
                );

            const pressureOpacityFactor =
                1 +
                dynamics
                    .pressureOpacity *
                pressureCentered;

            const velocityOpacityFactor =
                1 -
                dynamics
                    .velocityOpacity *
                velocity;

            const opacityNoise =
                signedNoise(
                    seed +
                    index * 91.73
                ) *
                dynamics
                    .opacityJitter;

            const opacity =
                clamp(
                    settings.opacity *
                    settings.flow *
                    pressureOpacityFactor *
                    velocityOpacityFactor *
                    (
                        1 +
                        opacityNoise
                    ),
                    0.001,
                    1
                );

            const tangentAngle =
                calculatePointAngle(
                    previousPoint,
                    nextPoint
                );

            const angleNoise =
                signedNoise(
                    seed +
                    index * 53.91
                ) *
                dynamics
                    .angleJitter *
                180;

            const perpendicular =
                calculatePerpendicular(
                    previousPoint,
                    nextPoint
                );

            const scatterAmount =
                signedNoise(
                    seed +
                    index * 71.33
                ) *
                dynamics.scatter *
                settings.size;

            return {
                ...point,

                x:
                    point.x +
                    perpendicular.x *
                    scatterAmount,

                y:
                    point.y +
                    perpendicular.y *
                    scatterAmount,

                width:
                    Math.max(
                        0.01,
                        settings.size *
                        widthFactor
                    ),

                opacity,

                rotation:
                    tangentAngle +
                    tipAngle +
                    angleNoise,

                taperFactor
            };
        }
    );
}

/*=========================================================
Stamp Sampling
=========================================================*/

export function sampleStrokeAtSpacing(
    points,
    spacing
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return [];
    }

    if (
        points.length === 1
    ) {
        return [
            {
                ...points[0]
            }
        ];
    }

    const safeSpacing =
        Math.max(
            0.1,
            numberOr(
                spacing,
                1
            )
        );

    const result = [
        {
            ...points[0]
        }
    ];

    let remainingDistance =
        safeSpacing;

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        let segmentStart =
            points[
                index - 1
            ];

        const segmentEnd =
            points[index];

        let segmentLength =
            distanceBetweenPoints(
                segmentStart,
                segmentEnd
            );

        if (
            segmentLength <=
            0.0001
        ) {
            continue;
        }

        while (
            segmentLength >=
            remainingDistance
        ) {
            const amount =
                remainingDistance /
                segmentLength;

            const sampledPoint =
                interpolatePoint(
                    segmentStart,
                    segmentEnd,
                    amount
                );

            result.push(
                sampledPoint
            );

            segmentStart =
                sampledPoint;

            segmentLength =
                distanceBetweenPoints(
                    segmentStart,
                    segmentEnd
                );

            remainingDistance =
                safeSpacing;
        }

        remainingDistance -=
            segmentLength;

        if (
            remainingDistance <=
            0.0001
        ) {
            remainingDistance =
                safeSpacing;
        }
    }

    const finalPoint =
        points[
            points.length - 1
        ];

    const lastSample =
        result[
            result.length - 1
        ];

    if (
        distanceBetweenPoints(
            lastSample,
            finalPoint
        ) >
        safeSpacing * 0.25
    ) {
        result.push({
            ...finalPoint
        });
    }

    return result;
}

function createBrushStamps(
    points,
    settings
) {
    if (
        settings.renderMode !==
        BRUSH_RENDER_MODES.STAMP
    ) {
        return [];
    }

    const spacing =
        Math.max(
            0.5,
            settings.size *
            settings.spacing
        );

    return sampleStrokeAtSpacing(
        points,
        spacing
    ).map(
        (
            point,
            index
        ) => ({
            id:
                `stamp-${index}`,

            x:
                point.x,

            y:
                point.y,

            size:
                point.width,

            width:
                point.width,

            height:
                point.width *
                clamp(
                    settings.tip
                        ?.roundness,
                    0.05,
                    1
                ),

            opacity:
                point.opacity,

            rotation:
                point.rotation,

            pressure:
                point
                    .effectivePressure,

            textureId:
                settings.texture
                    ?.enabled
                    ? settings
                        .texture
                        .textureId
                    : null,

            textureStrength:
                settings.texture
                    ?.enabled
                    ? settings
                        .texture
                        .strength
                    : 0
        })
    );
}

/*=========================================================
Bounds
=========================================================*/

export function calculateBrushBounds(
    points = [],
    stamps = []
) {
    if (
        points.length === 0 &&
        stamps.length === 0
    ) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0,

            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0
        };
    }

    let minX =
        Infinity;

    let minY =
        Infinity;

    let maxX =
        -Infinity;

    let maxY =
        -Infinity;

    points.forEach(
        point => {
            const radius =
                Math.max(
                    0.5,
                    numberOr(
                        point.width,
                        1
                    ) / 2
                );

            minX =
                Math.min(
                    minX,
                    point.x -
                    radius
                );

            minY =
                Math.min(
                    minY,
                    point.y -
                    radius
                );

            maxX =
                Math.max(
                    maxX,
                    point.x +
                    radius
                );

            maxY =
                Math.max(
                    maxY,
                    point.y +
                    radius
                );
        }
    );

    stamps.forEach(
        stamp => {
            const halfWidth =
                Math.max(
                    0.5,
                    numberOr(
                        stamp.width,
                        stamp.size
                    ) / 2
                );

            const halfHeight =
                Math.max(
                    0.5,
                    numberOr(
                        stamp.height,
                        stamp.size
                    ) / 2
                );

            minX =
                Math.min(
                    minX,
                    stamp.x -
                    halfWidth
                );

            minY =
                Math.min(
                    minY,
                    stamp.y -
                    halfHeight
                );

            maxX =
                Math.max(
                    maxX,
                    stamp.x +
                    halfWidth
                );

            maxY =
                Math.max(
                    maxY,
                    stamp.y +
                    halfHeight
                );
        }
    );

    if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
    ) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0,

            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0
        };
    }

    return {
        x:
            minX,

        y:
            minY,

        width:
            Math.max(
                0,
                maxX -
                minX
            ),

        height:
            Math.max(
                0,
                maxY -
                minY
            ),

        minX,
        minY,
        maxX,
        maxY
    };
}

/*=========================================================
Stroke Processing
=========================================================*/

export function processBrushStroke(
    rawPoints,
    settings = {},
    options = {}
) {
    const resolvedSettings =
        resolveBrushSettings(
            settings
        );

    const normalizedPoints =
        normalizeBrushPoints(
            rawPoints
        );

    if (
        normalizedPoints.length ===
        0
    ) {
        return {
            id:
                options.id ||
                createId("stroke"),

            valid:
                false,

            settings:
                resolvedSettings,

            rawPoints: [],

            points: [],

            flatPoints: [],

            stamps: [],

            length: 0,

            bounds:
                calculateBrushBounds(),

            renderMode:
                resolvedSettings
                    .renderMode
        };
    }

    const minimumDistance =
        Math.max(
            DEFAULT_MINIMUM_POINT_DISTANCE,
            numberOr(
                options
                    .minimumPointDistance,
                resolvedSettings.size *
                (
                    0.01 +
                    resolvedSettings
                        .streamline *
                    0.025
                )
            )
        );

    const reducedPoints =
        removeDuplicateBrushPoints(
            normalizedPoints,
            minimumDistance
        );

    const streamlinedPoints =
        streamlineBrushPoints(
            reducedPoints,
            resolvedSettings
                .streamline
        );

    const smoothedPoints =
        smoothBrushPoints(
            streamlinedPoints,
            resolvedSettings
                .smoothing
        );

    const measuredPoints =
        addStrokeMetrics(
            smoothedPoints,
            resolvedSettings
        );

    const length =
        measuredPoints.length >
        0
            ? measuredPoints[
                measuredPoints.length -
                1
            ].distance
            : 0;

    const pressurePoints =
        applyPressure(
            measuredPoints,
            resolvedSettings,
            length
        );

    const seed =
        numberOr(
            options.seed,
            hashNumber(
                normalizedPoints
                    .length *
                913.37 +
                normalizedPoints[0]
                    .x *
                17.13 +
                normalizedPoints[0]
                    .y *
                29.71
            ) *
            100000
        );

    const processedPoints =
        applyBrushDynamics(
            pressurePoints,
            resolvedSettings,
            length,
            seed
        );

    const stamps =
        createBrushStamps(
            processedPoints,
            resolvedSettings
        );

    const flatPoints =
        processedPoints.flatMap(
            point => [
                point.x,
                point.y
            ]
        );

    const bounds =
        calculateBrushBounds(
            processedPoints,
            stamps
        );

    return {
        id:
            options.id ||
            createId("stroke"),

        valid:
            processedPoints
                .length > 0,

        presetId:
            resolvedSettings
                .presetId,

        brushType:
            resolvedSettings
                .brushType,

        renderMode:
            resolvedSettings
                .renderMode,

        color:
            resolvedSettings
                .color,

        size:
            resolvedSettings
                .size,

        opacity:
            resolvedSettings
                .opacity,

        flow:
            resolvedSettings
                .flow,

        settings:
            cloneSerializable(
                resolvedSettings
            ),

        rawPoints:
            normalizedPoints,

        points:
            processedPoints,

        flatPoints,

        stamps,

        length,

        bounds,

        createdAt:
            options.createdAt ||
            nowIso()
    };
}

/*=========================================================
Create Store-compatible Brush Object
=========================================================*/

export function createBrushStrokeObject(
    rawPoints,
    settings = {},
    options = {}
) {
    const stroke =
        options.processedStroke ||
        processBrushStroke(
            rawPoints,
            settings,
            {
                id:
                    options.strokeId,

                seed:
                    options.seed,

                minimumPointDistance:
                    options
                        .minimumPointDistance
            }
        );

    if (!stroke.valid) {
        return null;
    }

    const objectId =
        options.id ||
        createId("brush");

    const name =
        typeof options.name ===
            "string" &&
        options.name.trim()
            ? options.name.trim()
            : stroke.settings
                .brushType ||
            "Brush Stroke";

    return {
        id:
            objectId,

        type:
            "brush",

        name,

        layerId:
            options.layerId,

        visible:
            true,

        locked:
            false,

        opacity:
            1,

        x:
            numberOr(
                options.x,
                0
            ),

        y:
            numberOr(
                options.y,
                0
            ),

        rotation:
            numberOr(
                options.rotation,
                0
            ),

        scaleX:
            numberOr(
                options.scaleX,
                1
            ),

        scaleY:
            numberOr(
                options.scaleY,
                1
            ),

        skewX:
            numberOr(
                options.skewX,
                0
            ),

        skewY:
            numberOr(
                options.skewY,
                0
            ),

        presetId:
            stroke.presetId,

        brushType:
            stroke.brushType,

        renderMode:
            stroke.renderMode,

        color:
            stroke.color,

        size:
            stroke.size,

        strokeWidth:
            stroke.size,

        strokeOpacity:
            stroke.opacity,

        flow:
            stroke.flow,

        lineCap:
            "round",

        lineJoin:
            "round",

        tension:
            clamp(
                stroke.settings
                    .smoothing *
                0.65,
                0,
                0.65
            ),

        points:
            stroke.points,

        flatPoints:
            stroke.flatPoints,

        rawPoints:
            options.keepRawPoints ===
            false
                ? undefined
                : stroke.rawPoints,

        stamps:
            stroke.stamps,

        geometry: {
            length:
                stroke.length,

            boundingBox: {
                ...stroke.bounds
            }
        },

        style: {
            stroke:
                stroke.color,

            fill:
                stroke.color,

            color:
                stroke.color,

            strokeWidth:
                stroke.size,

            opacity:
                stroke.opacity,

            flow:
                stroke.flow,

            lineCap:
                "round",

            lineJoin:
                "round",

            globalCompositeOperation:
                options
                    .globalCompositeOperation ||
                "source-over"
        },

        brush: {
            presetId:
                stroke.presetId,

            brushType:
                stroke.brushType,

            renderMode:
                stroke.renderMode,

            size:
                stroke.size,

            opacity:
                stroke.opacity,

            flow:
                stroke.flow,

            smoothing:
                stroke.settings
                    .smoothing,

            streamline:
                stroke.settings
                    .streamline,

            thinning:
                stroke.settings
                    .thinning,

            taperStart:
                stroke.settings
                    .taperStart,

            taperEnd:
                stroke.settings
                    .taperEnd,

            spacing:
                stroke.settings
                    .spacing,

            pressureEnabled:
                stroke.settings
                    .pressureEnabled,

            simulatePressure:
                stroke.settings
                    .simulatePressure,

            tip: {
                ...stroke.settings
                    .tip
            },

            dynamics: {
                ...stroke.settings
                    .dynamics
            },

            texture: {
                ...stroke.settings
                    .texture
            }
        },

        metadata: {
            ...(
                isPlainObject(
                    options.metadata
                )
                    ? options.metadata
                    : {}
            ),

            brushEngineVersion:
                BRUSH_ENGINE_VERSION,

            strokeId:
                stroke.id,

            createdWith:
                "BrushEngine"
        },

        createdAt:
            options.createdAt ||
            stroke.createdAt,

        updatedAt:
            options.updatedAt ||
            stroke.createdAt
    };
}

/*=========================================================
Brush Engine Class
=========================================================*/

export class BrushEngine {
    constructor(
        options = {}
    ) {
        this.maxRawPoints =
            Math.max(
                10,
                numberOr(
                    options.maxRawPoints,
                    DEFAULT_MAX_RAW_POINTS
                )
            );

        this.minimumPointDistance =
            Math.max(
                0,
                numberOr(
                    options
                        .minimumPointDistance,
                    DEFAULT_MINIMUM_POINT_DISTANCE
                )
            );

        this.settings =
            resolveBrushSettings(
                options.settings ||
                {
                    presetId:
                        options.presetId ||
                        DEFAULT_BRUSH_PRESET_ID
                }
            );

        this.activeStroke =
            null;

        this.lastStroke =
            null;
    }

    setPreset(
        presetId,
        overrides = {}
    ) {
        const currentColor =
            this.settings
                ?.color ||
            DEFAULT_BRUSH_COLOR;

        this.settings =
            resolveBrushSettings({
                ...createBrushSettingsFromPreset(
                    presetId,
                    {
                        color:
                            currentColor
                    }
                ),

                ...overrides,

                presetId,

                color:
                    overrides.color ||
                    currentColor,

                tip: {
                    ...createBrushSettingsFromPreset(
                        presetId,
                        {
                            color:
                                currentColor
                        }
                    ).tip,

                    ...(
                        isPlainObject(
                            overrides.tip
                        )
                            ? overrides.tip
                            : {}
                    )
                },

                dynamics: {
                    ...createBrushSettingsFromPreset(
                        presetId,
                        {
                            color:
                                currentColor
                        }
                    ).dynamics,

                    ...(
                        isPlainObject(
                            overrides
                                .dynamics
                        )
                            ? overrides
                                .dynamics
                            : {}
                    )
                },

                texture: {
                    ...createBrushSettingsFromPreset(
                        presetId,
                        {
                            color:
                                currentColor
                        }
                    ).texture,

                    ...(
                        isPlainObject(
                            overrides
                                .texture
                        )
                            ? overrides
                                .texture
                            : {}
                    )
                }
            });

        return this.getSettings();
    }

    setSettings(
        updates = {}
    ) {
        if (
            !isPlainObject(
                updates
            )
        ) {
            return this.getSettings();
        }

        this.settings =
            resolveBrushSettings({
                ...this.settings,
                ...updates,

                tip: {
                    ...this.settings.tip,
                    ...(
                        isPlainObject(
                            updates.tip
                        )
                            ? updates.tip
                            : {}
                    )
                },

                dynamics: {
                    ...this.settings
                        .dynamics,
                    ...(
                        isPlainObject(
                            updates.dynamics
                        )
                            ? updates
                                .dynamics
                            : {}
                    )
                },

                texture: {
                    ...this.settings
                        .texture,
                    ...(
                        isPlainObject(
                            updates.texture
                        )
                            ? updates
                                .texture
                            : {}
                    )
                }
            });

        return this.getSettings();
    }

    getSettings() {
        return cloneSerializable(
            this.settings
        );
    }

    isDrawing() {
        return Boolean(
            this.activeStroke
        );
    }

    beginStroke(
        point,
        options = {}
    ) {
        const normalizedPoint =
            normalizeBrushPoint(
                point,
                0,
                null
            );

        if (!normalizedPoint) {
            return false;
        }

        this.activeStroke = {
            id:
                options.id ||
                createId("stroke"),

            pointerId:
                options.pointerId ??
                normalizedPoint
                    .pointerId ??
                null,

            layerId:
                options.layerId ??
                null,

            seed:
                numberOr(
                    options.seed,
                    hashNumber(
                        normalizedPoint.x *
                        13.17 +
                        normalizedPoint.y *
                        31.91 +
                        nowMilliseconds()
                    ) *
                    100000
                ),

            startedAt:
                nowIso(),

            startedAtMilliseconds:
                nowMilliseconds(),

            rawPoints: [
                normalizedPoint
            ],

            settings:
                resolveBrushSettings(
                    options.settings ||
                    this.settings
                )
        };

        return true;
    }

    addPoint(
        point
    ) {
        if (
            !this.activeStroke
        ) {
            return false;
        }

        if (
            this.activeStroke
                .rawPoints
                .length >=
            this.maxRawPoints
        ) {
            return false;
        }

        const previousPoint =
            this.activeStroke
                .rawPoints[
                this.activeStroke
                    .rawPoints
                    .length -
                1
            ];

        const normalizedPoint =
            normalizeBrushPoint(
                point,
                this.activeStroke
                    .rawPoints
                    .length,
                previousPoint
            );

        if (!normalizedPoint) {
            return false;
        }

        const distance =
            distanceBetweenPoints(
                previousPoint,
                normalizedPoint
            );

        if (
            distance <
            this.minimumPointDistance
        ) {
            /*
            Preserve the newest pressure and
            timestamp without adding a large
            number of duplicate points.
            */

            this.activeStroke
                .rawPoints[
                this.activeStroke
                    .rawPoints
                    .length -
                1
            ] = {
                ...previousPoint,

                pressure:
                    normalizedPoint
                        .pressure,

                tiltX:
                    normalizedPoint
                        .tiltX,

                tiltY:
                    normalizedPoint
                        .tiltY,

                twist:
                    normalizedPoint
                        .twist,

                time:
                    normalizedPoint
                        .time
            };

            return false;
        }

        this.activeStroke
            .rawPoints
            .push(
                normalizedPoint
            );

        return true;
    }

    getRawPoints() {
        if (
            !this.activeStroke
        ) {
            return [];
        }

        return cloneSerializable(
            this.activeStroke
                .rawPoints
        );
    }

    getPreview(
        options = {}
    ) {
        if (
            !this.activeStroke
        ) {
            return null;
        }

        return processBrushStroke(
            this.activeStroke
                .rawPoints,
            this.activeStroke
                .settings,
            {
                id:
                    this.activeStroke
                        .id,

                seed:
                    this.activeStroke
                        .seed,

                minimumPointDistance:
                    options
                        .minimumPointDistance ??
                    this
                        .minimumPointDistance
            }
        );
    }

    endStroke(
        finalPoint = null,
        options = {}
    ) {
        if (
            !this.activeStroke
        ) {
            return null;
        }

        if (finalPoint) {
            this.addPoint(
                finalPoint
            );
        }

        const processedStroke =
            processBrushStroke(
                this.activeStroke
                    .rawPoints,
                this.activeStroke
                    .settings,
                {
                    id:
                        this.activeStroke
                            .id,

                    seed:
                        this.activeStroke
                            .seed,

                    minimumPointDistance:
                        options
                            .minimumPointDistance ??
                        this
                            .minimumPointDistance,

                    createdAt:
                        this.activeStroke
                            .startedAt
                }
            );

        this.lastStroke = {
            ...processedStroke,

            layerId:
                this.activeStroke
                    .layerId,

            endedAt:
                nowIso()
        };

        this.activeStroke =
            null;

        return cloneSerializable(
            this.lastStroke
        );
    }

    cancelStroke() {
        const cancelledStroke =
            this.activeStroke;

        this.activeStroke =
            null;

        return cancelledStroke
            ? {
                id:
                    cancelledStroke.id,

                cancelled:
                    true
            }
            : null;
    }

    getLastStroke() {
        return this.lastStroke
            ? cloneSerializable(
                this.lastStroke
            )
            : null;
    }

    createObject(
        options = {}
    ) {
        const stroke =
            options.processedStroke ||
            this.lastStroke ||
            this.getPreview();

        if (
            !stroke ||
            !stroke.valid
        ) {
            return null;
        }

        return createBrushStrokeObject(
            stroke.rawPoints,
            stroke.settings,
            {
                ...options,

                layerId:
                    options.layerId ??
                    stroke.layerId,

                processedStroke:
                    stroke
            }
        );
    }

    reset() {
        this.activeStroke =
            null;

        this.lastStroke =
            null;
    }
}

/*=========================================================
Brush Engine Factory
=========================================================*/

export function createBrushEngine(
    options = {}
) {
    return new BrushEngine(
        options
    );
}

/*=========================================================
Default Export
=========================================================*/

export default createBrushEngine;