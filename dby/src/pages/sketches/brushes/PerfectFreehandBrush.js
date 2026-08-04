/*
=========================================================
FashionVision Professional Editor
Perfect Freehand Brush Geometry
Version 1.0
=========================================================
*/

/*=========================================================
Constants
=========================================================*/

export const PERFECT_FREEHAND_VERSION = 1;

export const FREEHAND_CAPS =
    Object.freeze({
        ROUND:
            "round",

        BUTT:
            "butt",

        SQUARE:
            "square",

        NONE:
            "none"
    });

export const FREEHAND_JOINS =
    Object.freeze({
        ROUND:
            "round",

        MITER:
            "miter",

        BEVEL:
            "bevel"
    });

export const DEFAULT_FREEHAND_OPTIONS =
    Object.freeze({
        size:
            4,

        thinning:
            0.5,

        smoothing:
            0.5,

        streamline:
            0,

        simulatePressure:
            true,

        pressureEnabled:
            true,

        minimumWidth:
            0.05,

        minimumPointDistance:
            0.01,

        taperStart:
            0,

        taperEnd:
            0,

        startCap:
            FREEHAND_CAPS.ROUND,

        endCap:
            FREEHAND_CAPS.ROUND,

        join:
            FREEHAND_JOINS.ROUND,

        miterLimit:
            3,

        capSegments:
            12,

        smoothingPasses:
            0,

        widthSmoothing:
            0.45,

        usePointWidth:
            true,

        applyTaperToPointWidth:
            false,

        closed:
            false,

        svgPrecision:
            2,

        smoothSvgPath:
            true
    });

const EPSILON =
    0.000001;

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

function roundNumber(
    value,
    precision = 2
) {
    const safePrecision =
        clamp(
            precision,
            0,
            8
        );

    const factor =
        10 **
        safePrecision;

    return (
        Math.round(
            numberOr(value) *
            factor
        ) /
        factor
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

function isFinitePoint(
    point
) {
    return Boolean(
        point &&
        Number.isFinite(
            Number(point.x)
        ) &&
        Number.isFinite(
            Number(point.y)
        )
    );
}

/*=========================================================
Vector Helpers
=========================================================*/

function createVector(
    x = 0,
    y = 0
) {
    return {
        x:
            numberOr(x),

        y:
            numberOr(y)
    };
}

function addVectors(
    first,
    second
) {
    return {
        x:
            numberOr(first?.x) +
            numberOr(second?.x),

        y:
            numberOr(first?.y) +
            numberOr(second?.y)
    };
}

function subtractVectors(
    first,
    second
) {
    return {
        x:
            numberOr(first?.x) -
            numberOr(second?.x),

        y:
            numberOr(first?.y) -
            numberOr(second?.y)
    };
}

function multiplyVector(
    vector,
    amount
) {
    return {
        x:
            numberOr(vector?.x) *
            numberOr(amount),

        y:
            numberOr(vector?.y) *
            numberOr(amount)
    };
}

function vectorLength(
    vector
) {
    return Math.hypot(
        numberOr(vector?.x),
        numberOr(vector?.y)
    );
}

function normalizeVector(
    vector,
    fallback = {
        x: 1,
        y: 0
    }
) {
    const length =
        vectorLength(
            vector
        );

    if (
        length <=
        EPSILON
    ) {
        return {
            x:
                numberOr(
                    fallback?.x,
                    1
                ),

            y:
                numberOr(
                    fallback?.y,
                    0
                )
        };
    }

    return {
        x:
            vector.x /
            length,

        y:
            vector.y /
            length
    };
}

function perpendicularVector(
    vector
) {
    return {
        x:
            -numberOr(
                vector?.y
            ),

        y:
            numberOr(
                vector?.x
            )
    };
}

function dotProduct(
    first,
    second
) {
    return (
        numberOr(first?.x) *
            numberOr(second?.x) +
        numberOr(first?.y) *
            numberOr(second?.y)
    );
}

function distanceBetweenPoints(
    first,
    second
) {
    if (
        !isFinitePoint(first) ||
        !isFinitePoint(second)
    ) {
        return 0;
    }

    return Math.hypot(
        second.x -
            first.x,

        second.y -
            first.y
    );
}

function midpoint(
    first,
    second
) {
    return {
        x:
            (
                numberOr(first?.x) +
                numberOr(second?.x)
            ) / 2,

        y:
            (
                numberOr(first?.y) +
                numberOr(second?.y)
            ) / 2
    };
}

/*=========================================================
Options
=========================================================*/

function normalizeCap(
    value,
    fallback
) {
    return Object.values(
        FREEHAND_CAPS
    ).includes(value)
        ? value
        : fallback;
}

function normalizeJoin(
    value,
    fallback
) {
    return Object.values(
        FREEHAND_JOINS
    ).includes(value)
        ? value
        : fallback;
}

function resolveTaperValue(
    value,
    size
) {
    if (value === true) {
        return Math.max(
            1,
            numberOr(size, 4) *
            3
        );
    }

    if (
        value === false ||
        value === null ||
        value === undefined
    ) {
        return 0;
    }

    return Math.max(
        0,
        numberOr(value)
    );
}

export function normalizeFreehandOptions(
    options = {}
) {
    const source =
        isPlainObject(options)
            ? options
            : {};

    const startOptions =
        isPlainObject(
            source.start
        )
            ? source.start
            : {};

    const endOptions =
        isPlainObject(
            source.end
        )
            ? source.end
            : {};

    const size =
        Math.max(
            0.05,
            numberOr(
                source.size,
                DEFAULT_FREEHAND_OPTIONS
                    .size
            )
        );

    return {
        ...DEFAULT_FREEHAND_OPTIONS,
        ...source,

        size,

        thinning:
            clamp(
                source.thinning,
                -1,
                1
            ),

        smoothing:
            clamp(
                source.smoothing,
                0,
                1
            ),

        streamline:
            clamp(
                source.streamline,
                0,
                1
            ),

        simulatePressure:
            source.simulatePressure !==
            false,

        pressureEnabled:
            source.pressureEnabled !==
            false,

        minimumWidth:
            Math.max(
                0.001,
                numberOr(
                    source.minimumWidth,
                    DEFAULT_FREEHAND_OPTIONS
                        .minimumWidth
                )
            ),

        minimumPointDistance:
            Math.max(
                0,
                numberOr(
                    source.minimumPointDistance,
                    DEFAULT_FREEHAND_OPTIONS
                        .minimumPointDistance
                )
            ),

        taperStart:
            resolveTaperValue(
                source.taperStart ??
                startOptions.taper,
                size
            ),

        taperEnd:
            resolveTaperValue(
                source.taperEnd ??
                endOptions.taper,
                size
            ),

        startCap:
            normalizeCap(
                source.startCap ??
                startOptions.cap,
                DEFAULT_FREEHAND_OPTIONS
                    .startCap
            ),

        endCap:
            normalizeCap(
                source.endCap ??
                endOptions.cap,
                DEFAULT_FREEHAND_OPTIONS
                    .endCap
            ),

        join:
            normalizeJoin(
                source.join,
                DEFAULT_FREEHAND_OPTIONS
                    .join
            ),

        miterLimit:
            clamp(
                source.miterLimit,
                1,
                20
            ),

        capSegments:
            Math.round(
                clamp(
                    source.capSegments,
                    4,
                    64
                )
            ),

        smoothingPasses:
            Math.round(
                clamp(
                    source.smoothingPasses,
                    0,
                    6
                )
            ),

        widthSmoothing:
            clamp(
                source.widthSmoothing,
                0,
                1
            ),

        usePointWidth:
            source.usePointWidth !==
            false,

        applyTaperToPointWidth:
            source
                .applyTaperToPointWidth ===
            true,

        closed:
            source.closed ===
            true,

        svgPrecision:
            Math.round(
                clamp(
                    source.svgPrecision,
                    0,
                    8
                )
            ),

        smoothSvgPath:
            source.smoothSvgPath !==
            false
    };
}

/*=========================================================
Point Normalization
=========================================================*/

export function normalizeFreehandPoint(
    point,
    index = 0,
    previousPoint = null
) {
    let source =
        point;

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

            width:
                point[3],

            opacity:
                point[4]
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

    const fallbackTime =
        previousPoint
            ? numberOr(
                previousPoint.time
            ) + 16
            : index * 16;

    const pressure =
        Number.isFinite(
            Number(
                source.effectivePressure
            )
        )
            ? clamp(
                source.effectivePressure,
                0,
                1
            )
            : Number.isFinite(
                Number(
                    source.pressure
                )
            )
                ? clamp(
                    source.pressure,
                    0,
                    1
                )
                : null;

    return {
        ...source,

        x,
        y,

        pressure,

        effectivePressure:
            pressure,

        width:
            Number.isFinite(
                Number(
                    source.width
                )
            )
                ? Math.max(
                    0,
                    Number(
                        source.width
                    )
                )
                : null,

        opacity:
            clamp(
                source.opacity ?? 1,
                0,
                1
            ),

        velocity:
            Math.max(
                0,
                numberOr(
                    source.velocity,
                    0
                )
            ),

        normalizedVelocity:
            clamp(
                source.normalizedVelocity,
                0,
                1
            ),

        time:
            numberOr(
                source.time ??
                source.timestamp,
                fallbackTime
            ),

        index:
            index
    };
}

export function normalizeFreehandPoints(
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
    Supports flat Konva arrays:

    [x1, y1, x2, y2, ...]
    */

    const isFlatPointArray =
        points.length > 0 &&
        points.every(
            value =>
                Number.isFinite(
                    Number(value)
                )
        );

    if (isFlatPointArray) {
        const result = [];

        for (
            let index = 0;
            index <
            points.length - 1;
            index += 2
        ) {
            const previousPoint =
                result[
                    result.length -
                    1
                ] ||
                null;

            const normalized =
                normalizeFreehandPoint(
                    {
                        x:
                            points[index],

                        y:
                            points[
                                index + 1
                            ]
                    },
                    result.length,
                    previousPoint
                );

            if (normalized) {
                result.push(
                    normalized
                );
            }
        }

        return result;
    }

    const result = [];

    points.forEach(
        point => {
            const previousPoint =
                result[
                    result.length -
                    1
                ] ||
                null;

            const normalized =
                normalizeFreehandPoint(
                    point,
                    result.length,
                    previousPoint
                );

            if (normalized) {
                result.push(
                    normalized
                );
            }
        }
    );

    return result;
}

/*=========================================================
Point Cleanup
=========================================================*/

export function removeDuplicateFreehandPoints(
    points,
    minimumDistance = 0.01
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
                0.01
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

        const isLastPoint =
            index ===
            points.length - 1;

        if (
            distanceBetweenPoints(
                previousAccepted,
                point
            ) >= safeDistance ||
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
Streamline
=========================================================*/

function streamlineFreehandPoints(
    points,
    streamline
) {
    if (
        points.length < 2 ||
        streamline <= 0
    ) {
        return points.map(
            point => ({
                ...point
            })
        );
    }

    const amount =
        clamp(
            1 -
            streamline *
            0.78,
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
        const previous =
            result[
                result.length -
                1
            ];

        const source =
            points[index];

        result.push({
            ...source,

            x:
                lerp(
                    previous.x,
                    source.x,
                    amount
                ),

            y:
                lerp(
                    previous.y,
                    source.y,
                    amount
                )
        });
    }

    return result;
}

/*=========================================================
Centerline Smoothing
=========================================================*/

function chaikinPass(
    points
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
        let index = 0;
        index <
        points.length - 1;
        index += 1
    ) {
        const first =
            points[index];

        const second =
            points[
                index + 1
            ];

        result.push({
            ...first,

            x:
                first.x *
                    0.75 +
                second.x *
                    0.25,

            y:
                first.y *
                    0.75 +
                second.y *
                    0.25,

            pressure:
                lerp(
                    numberOr(
                        first.pressure,
                        0.5
                    ),
                    numberOr(
                        second.pressure,
                        0.5
                    ),
                    0.25
                ),

            width:
                Number.isFinite(
                    Number(
                        first.width
                    )
                ) &&
                Number.isFinite(
                    Number(
                        second.width
                    )
                )
                    ? lerp(
                        first.width,
                        second.width,
                        0.25
                    )
                    : first.width,

            opacity:
                lerp(
                    numberOr(
                        first.opacity,
                        1
                    ),
                    numberOr(
                        second.opacity,
                        1
                    ),
                    0.25
                )
        });

        result.push({
            ...second,

            x:
                first.x *
                    0.25 +
                second.x *
                    0.75,

            y:
                first.y *
                    0.25 +
                second.y *
                    0.75,

            pressure:
                lerp(
                    numberOr(
                        first.pressure,
                        0.5
                    ),
                    numberOr(
                        second.pressure,
                        0.5
                    ),
                    0.75
                ),

            width:
                Number.isFinite(
                    Number(
                        first.width
                    )
                ) &&
                Number.isFinite(
                    Number(
                        second.width
                    )
                )
                    ? lerp(
                        first.width,
                        second.width,
                        0.75
                    )
                    : second.width,

            opacity:
                lerp(
                    numberOr(
                        first.opacity,
                        1
                    ),
                    numberOr(
                        second.opacity,
                        1
                    ),
                    0.75
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

function smoothCenterline(
    points,
    options
) {
    let result =
        points.map(
            point => ({
                ...point
            })
        );

    const requestedPasses =
        options.smoothingPasses >
        0
            ? options.smoothingPasses
            : options.smoothing >
                0.82
                ? 2
                : options.smoothing >
                    0.55
                    ? 1
                    : 0;

    for (
        let pass = 0;
        pass < requestedPasses;
        pass += 1
    ) {
        result =
            chaikinPass(
                result
            );
    }

    return result;
}

/*=========================================================
Stroke Metrics
=========================================================*/

export function calculateFreehandLength(
    points = []
) {
    if (
        !Array.isArray(points) ||
        points.length < 2
    ) {
        return 0;
    }

    let totalLength = 0;

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        totalLength +=
            distanceBetweenPoints(
                points[
                    index - 1
                ],
                points[index]
            );
    }

    return totalLength;
}

function addPointMetrics(
    points
) {
    let runningLength = 0;

    return points.map(
        (
            point,
            index
        ) => {
            const previous =
                index > 0
                    ? points[
                        index - 1
                    ]
                    : point;

            const segmentLength =
                index === 0
                    ? 0
                    : distanceBetweenPoints(
                        previous,
                        point
                    );

            runningLength +=
                segmentLength;

            const elapsedTime =
                index === 0
                    ? 16
                    : Math.max(
                        1,
                        point.time -
                        previous.time
                    );

            const calculatedVelocity =
                segmentLength /
                elapsedTime;

            return {
                ...point,

                segmentLength,

                runningLength,

                velocity:
                    Number.isFinite(
                        Number(
                            point.velocity
                        )
                    )
                        ? point.velocity
                        : calculatedVelocity
            };
        }
    );
}

/*=========================================================
Pressure and Width
=========================================================*/

function simulatePressure(
    point,
    progress,
    size
) {
    const velocityReference =
        Math.max(
            0.08,
            size *
            0.04
        );

    const normalizedVelocity =
        Number.isFinite(
            Number(
                point.normalizedVelocity
            )
        )
            ? clamp(
                point.normalizedVelocity,
                0,
                1
            )
            : clamp(
                point.velocity /
                velocityReference,
                0,
                1
            );

    const velocityPressure =
        1 -
        normalizedVelocity;

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
        velocityPressure *
            0.64 +
        strokeShape *
            0.18,
        0.05,
        1
    );
}

function getTaperFactor(
    runningLength,
    totalLength,
    taperStart,
    taperEnd
) {
    let startFactor = 1;
    let endFactor = 1;

    if (taperStart > 0) {
        startFactor =
            clamp(
                runningLength /
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
                    runningLength
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

function calculatePointWidth(
    point,
    progress,
    totalLength,
    options
) {
    const hasPointWidth =
        Number.isFinite(
            Number(
                point.width
            )
        ) &&
        point.width >
            0;

    const taperFactor =
        getTaperFactor(
            point.runningLength,
            totalLength,
            options.taperStart,
            options.taperEnd
        );

    if (
        options.usePointWidth &&
        hasPointWidth
    ) {
        const pointWidth =
            Math.max(
                options.minimumWidth,
                point.width
            );

        return options
            .applyTaperToPointWidth
            ? Math.max(
                options.minimumWidth,
                pointWidth *
                taperFactor
            )
            : pointWidth;
    }

    let pressure =
        Number.isFinite(
            Number(
                point.pressure
            )
        )
            ? clamp(
                point.pressure,
                0,
                1
            )
            : null;

    if (
        (
            pressure === null ||
            !options
                .pressureEnabled
        ) &&
        options.simulatePressure
    ) {
        pressure =
            simulatePressure(
                point,
                progress,
                options.size
            );
    }

    if (pressure === null) {
        pressure =
            0.5;
    }

    const pressureCentered =
        (
            pressure -
            0.5
        ) *
        2;

    const pressureWidthFactor =
        1 +
        options.thinning *
        pressureCentered;

    return Math.max(
        options.minimumWidth,
        options.size *
        pressureWidthFactor *
        taperFactor
    );
}

function smoothStrokeWidths(
    widths,
    strength
) {
    if (
        widths.length < 3 ||
        strength <= 0
    ) {
        return [
            ...widths
        ];
    }

    const result = [
        widths[0]
    ];

    for (
        let index = 1;
        index <
        widths.length - 1;
        index += 1
    ) {
        const average =
            (
                widths[
                    index - 1
                ] +
                widths[index] *
                    2 +
                widths[
                    index + 1
                ]
            ) / 4;

        result.push(
            lerp(
                widths[index],
                average,
                strength
            )
        );
    }

    result.push(
        widths[
            widths.length - 1
        ]
    );

    return result;
}

/*=========================================================
Stroke Frames
=========================================================*/

function calculatePointFrame(
    points,
    index,
    options
) {
    const point =
        points[index];

    const previous =
        points[
            Math.max(
                0,
                index - 1
            )
        ];

    const next =
        points[
            Math.min(
                points.length - 1,
                index + 1
            )
        ];

    const previousDirection =
        normalizeVector(
            subtractVectors(
                point,
                previous
            ),
            subtractVectors(
                next,
                point
            )
        );

    const nextDirection =
        normalizeVector(
            subtractVectors(
                next,
                point
            ),
            previousDirection
        );

    let tangent;

    if (index === 0) {
        tangent =
            nextDirection;
    } else if (
        index ===
        points.length - 1
    ) {
        tangent =
            previousDirection;
    } else {
        tangent =
            normalizeVector(
                addVectors(
                    previousDirection,
                    nextDirection
                ),
                nextDirection
            );
    }

    const normal =
        normalizeVector(
            perpendicularVector(
                tangent
            ),
            {
                x: 0,
                y: 1
            }
        );

    let miterScale = 1;

    if (
        index > 0 &&
        index <
            points.length - 1 &&
        options.join ===
            FREEHAND_JOINS.MITER
    ) {
        const nextNormal =
            normalizeVector(
                perpendicularVector(
                    nextDirection
                )
            );

        const denominator =
            Math.abs(
                dotProduct(
                    normal,
                    nextNormal
                )
            );

        if (
            denominator >
            EPSILON
        ) {
            miterScale =
                clamp(
                    1 /
                    denominator,
                    1,
                    options.miterLimit
                );
        }
    }

    if (
        options.join ===
        FREEHAND_JOINS.BEVEL
    ) {
        miterScale = 1;
    }

    return {
        tangent,
        normal,
        miterScale
    };
}

/*=========================================================
Create Stroke Points
=========================================================*/

export function getStrokePoints(
    inputPoints,
    options = {}
) {
    const resolvedOptions =
        normalizeFreehandOptions(
            options
        );

    let points =
        normalizeFreehandPoints(
            inputPoints
        );

    points =
        removeDuplicateFreehandPoints(
            points,
            resolvedOptions
                .minimumPointDistance
        );

    points =
        streamlineFreehandPoints(
            points,
            resolvedOptions
                .streamline
        );

    points =
        smoothCenterline(
            points,
            resolvedOptions
        );

    points =
        addPointMetrics(
            points
        );

    if (
        points.length === 0
    ) {
        return [];
    }

    const totalLength =
        points[
            points.length - 1
        ].runningLength;

    let widths =
        points.map(
            point => {
                const progress =
                    totalLength > 0
                        ? point
                            .runningLength /
                        totalLength
                        : 0;

                return calculatePointWidth(
                    point,
                    progress,
                    totalLength,
                    resolvedOptions
                );
            }
        );

    widths =
        smoothStrokeWidths(
            widths,
            resolvedOptions
                .widthSmoothing
        );

    return points.map(
        (
            point,
            index
        ) => {
            const frame =
                calculatePointFrame(
                    points,
                    index,
                    resolvedOptions
                );

            const width =
                Math.max(
                    resolvedOptions
                        .minimumWidth,
                    widths[index]
                );

            const radius =
                width / 2;

            return {
                ...point,

                index,

                width,

                radius,

                tangent:
                    frame.tangent,

                normal:
                    frame.normal,

                miterScale:
                    frame
                        .miterScale
            };
        }
    );
}

/*=========================================================
Arc Helpers
=========================================================*/

function normalizePositiveAngle(
    angle
) {
    const fullCircle =
        Math.PI *
        2;

    let normalized =
        angle %
        fullCircle;

    if (normalized < 0) {
        normalized +=
            fullCircle;
    }

    return normalized;
}

function angularDistance(
    first,
    second
) {
    const fullCircle =
        Math.PI *
        2;

    const difference =
        Math.abs(
            normalizePositiveAngle(
                first
            ) -
            normalizePositiveAngle(
                second
            )
        );

    return Math.min(
        difference,
        fullCircle -
        difference
    );
}

function createArcPoints(
    center,
    startPoint,
    endPoint,
    throughAngle,
    segments
) {
    const startAngle =
        Math.atan2(
            startPoint.y -
                center.y,
            startPoint.x -
                center.x
        );

    const endAngle =
        Math.atan2(
            endPoint.y -
                center.y,
            endPoint.x -
                center.x
        );

    const positiveDelta =
        normalizePositiveAngle(
            endAngle -
            startAngle
        );

    const negativeDelta =
        positiveDelta -
        Math.PI *
        2;

    const positiveMidpoint =
        startAngle +
        positiveDelta /
        2;

    const negativeMidpoint =
        startAngle +
        negativeDelta /
        2;

    const delta =
        angularDistance(
            positiveMidpoint,
            throughAngle
        ) <=
        angularDistance(
            negativeMidpoint,
            throughAngle
        )
            ? positiveDelta
            : negativeDelta;

    const radius =
        Math.max(
            EPSILON,
            distanceBetweenPoints(
                center,
                startPoint
            )
        );

    const result = [];

    for (
        let index = 1;
        index < segments;
        index += 1
    ) {
        const amount =
            index /
            segments;

        const angle =
            startAngle +
            delta *
            amount;

        result.push({
            x:
                center.x +
                Math.cos(angle) *
                radius,

            y:
                center.y +
                Math.sin(angle) *
                radius
        });
    }

    return result;
}

/*=========================================================
Single Point Stroke
=========================================================*/

function createDotOutline(
    point,
    options
) {
    const radius =
        Math.max(
            options.minimumWidth /
                2,
            point.radius ||
                options.size /
                2
        );

    const segmentCount =
        Math.max(
            8,
            options.capSegments *
                2
        );

    const result = [];

    for (
        let index = 0;
        index < segmentCount;
        index += 1
    ) {
        const angle =
            (
                index /
                segmentCount
            ) *
            Math.PI *
            2;

        result.push({
            x:
                point.x +
                Math.cos(angle) *
                radius,

            y:
                point.y +
                Math.sin(angle) *
                radius
        });
    }

    return result;
}

/*=========================================================
Outline Generation
=========================================================*/

function buildOutlineFromStrokePoints(
    strokePoints,
    options
) {
    if (
        strokePoints.length === 0
    ) {
        return [];
    }

    if (
        strokePoints.length === 1
    ) {
        return createDotOutline(
            strokePoints[0],
            options
        );
    }

    const leftPoints = [];
    const rightPoints = [];

    strokePoints.forEach(
        (
            point,
            index
        ) => {
            let center = {
                x:
                    point.x,

                y:
                    point.y
            };

            let radius =
                Math.max(
                    options.minimumWidth /
                        2,
                    point.radius
                );

            /*
            Square caps extend the centerline
            by half of the local stroke width.
            */

            if (
                index === 0 &&
                options.startCap ===
                    FREEHAND_CAPS.SQUARE
            ) {
                center =
                    addVectors(
                        center,
                        multiplyVector(
                            point.tangent,
                            -radius
                        )
                    );
            }

            if (
                index ===
                    strokePoints.length -
                        1 &&
                options.endCap ===
                    FREEHAND_CAPS.SQUARE
            ) {
                center =
                    addVectors(
                        center,
                        multiplyVector(
                            point.tangent,
                            radius
                        )
                    );
            }

            if (
                options.join ===
                FREEHAND_JOINS.MITER
            ) {
                radius *=
                    point.miterScale;
            }

            const offset =
                multiplyVector(
                    point.normal,
                    radius
                );

            leftPoints.push(
                addVectors(
                    center,
                    offset
                )
            );

            rightPoints.push(
                subtractVectors(
                    center,
                    offset
                )
            );
        }
    );

    if (options.closed) {
        return [
            ...leftPoints,
            ...[
                ...rightPoints
            ].reverse()
        ];
    }

    const firstStrokePoint =
        strokePoints[0];

    const finalStrokePoint =
        strokePoints[
            strokePoints.length - 1
        ];

    const firstLeft =
        leftPoints[0];

    const firstRight =
        rightPoints[0];

    const finalLeft =
        leftPoints[
            leftPoints.length - 1
        ];

    const finalRight =
        rightPoints[
            rightPoints.length - 1
        ];

    const outline = [
        ...leftPoints
    ];

    /*
    End cap: move from the left edge
    to the right edge through the
    forward tangent direction.
    */

    if (
        options.endCap ===
        FREEHAND_CAPS.ROUND
    ) {
        const tangentAngle =
            Math.atan2(
                finalStrokePoint
                    .tangent.y,
                finalStrokePoint
                    .tangent.x
            );

        outline.push(
            ...createArcPoints(
                finalStrokePoint,
                finalLeft,
                finalRight,
                tangentAngle,
                options.capSegments
            )
        );
    }

    outline.push(
        ...[
            ...rightPoints
        ].reverse()
    );

    /*
    Start cap: move from the right edge
    back to the left edge through the
    reverse tangent direction.
    */

    if (
        options.startCap ===
        FREEHAND_CAPS.ROUND
    ) {
        const reverseTangentAngle =
            Math.atan2(
                -firstStrokePoint
                    .tangent.y,
                -firstStrokePoint
                    .tangent.x
            );

        outline.push(
            ...createArcPoints(
                firstStrokePoint,
                firstRight,
                firstLeft,
                reverseTangentAngle,
                options.capSegments
            )
        );
    }

    return outline;
}

/*=========================================================
Public Outline Functions
=========================================================*/

export function getStrokeOutlinePoints(
    inputPoints,
    options = {}
) {
    const resolvedOptions =
        normalizeFreehandOptions(
            options
        );

    const strokePoints =
        getStrokePoints(
            inputPoints,
            resolvedOptions
        );

    return buildOutlineFromStrokePoints(
        strokePoints,
        resolvedOptions
    );
}

/*
Compatibility-style result:

[
    [x, y],
    [x, y],
    ...
]
*/

export function getStroke(
    inputPoints,
    options = {}
) {
    return getStrokeOutlinePoints(
        inputPoints,
        options
    ).map(
        point => [
            point.x,
            point.y
        ]
    );
}

/*=========================================================
Flat Point Conversion
=========================================================*/

export function freehandPointsToFlatArray(
    points = []
) {
    if (
        !Array.isArray(points)
    ) {
        return [];
    }

    return points.flatMap(
        point => {
            if (
                Array.isArray(point)
            ) {
                return [
                    numberOr(
                        point[0]
                    ),

                    numberOr(
                        point[1]
                    )
                ];
            }

            return [
                numberOr(
                    point?.x
                ),

                numberOr(
                    point?.y
                )
            ];
        }
    );
}

/*=========================================================
SVG Path
=========================================================*/

function formatSvgNumber(
    value,
    precision
) {
    return String(
        roundNumber(
            value,
            precision
        )
    );
}

export function getSvgPathFromStroke(
    strokePoints = [],
    options = {}
) {
    const resolvedOptions =
        normalizeFreehandOptions(
            options
        );

    const points =
        normalizeFreehandPoints(
            strokePoints
        );

    if (
        points.length === 0
    ) {
        return "";
    }

    const precision =
        resolvedOptions
            .svgPrecision;

    if (points.length === 1) {
        return [
            "M",
            formatSvgNumber(
                points[0].x,
                precision
            ),
            formatSvgNumber(
                points[0].y,
                precision
            ),
            "Z"
        ].join(" ");
    }

    if (
        !resolvedOptions
            .smoothSvgPath
    ) {
        const path = [
            "M",
            formatSvgNumber(
                points[0].x,
                precision
            ),
            formatSvgNumber(
                points[0].y,
                precision
            )
        ];

        for (
            let index = 1;
            index < points.length;
            index += 1
        ) {
            path.push(
                "L",
                formatSvgNumber(
                    points[index].x,
                    precision
                ),
                formatSvgNumber(
                    points[index].y,
                    precision
                )
            );
        }

        path.push("Z");

        return path.join(" ");
    }

    /*
    Smooth closed quadratic path.

    Each point acts as a quadratic
    control point between midpoints.
    */

    const firstMidpoint =
        midpoint(
            points[
                points.length - 1
            ],
            points[0]
        );

    const path = [
        "M",
        formatSvgNumber(
            firstMidpoint.x,
            precision
        ),
        formatSvgNumber(
            firstMidpoint.y,
            precision
        )
    ];

    for (
        let index = 0;
        index < points.length;
        index += 1
    ) {
        const point =
            points[index];

        const nextPoint =
            points[
                (
                    index + 1
                ) %
                points.length
            ];

        const nextMidpoint =
            midpoint(
                point,
                nextPoint
            );

        path.push(
            "Q",
            formatSvgNumber(
                point.x,
                precision
            ),
            formatSvgNumber(
                point.y,
                precision
            ),
            formatSvgNumber(
                nextMidpoint.x,
                precision
            ),
            formatSvgNumber(
                nextMidpoint.y,
                precision
            )
        );
    }

    path.push("Z");

    return path.join(" ");
}

/*=========================================================
Bounds
=========================================================*/

export function calculateFreehandBounds(
    points = []
) {
    const normalized =
        normalizeFreehandPoints(
            points
        );

    if (
        normalized.length === 0
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

    normalized.forEach(
        point => {
            minX =
                Math.min(
                    minX,
                    point.x
                );

            minY =
                Math.min(
                    minY,
                    point.y
                );

            maxX =
                Math.max(
                    maxX,
                    point.x
                );

            maxY =
                Math.max(
                    maxY,
                    point.y
                );
        }
    );

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
Complete Geometry Result
=========================================================*/

export function createPerfectFreehandGeometry(
    inputPoints,
    options = {}
) {
    const resolvedOptions =
        normalizeFreehandOptions(
            options
        );

    const strokePoints =
        getStrokePoints(
            inputPoints,
            resolvedOptions
        );

    const outlinePoints =
        buildOutlineFromStrokePoints(
            strokePoints,
            resolvedOptions
        );

    const flatOutlinePoints =
        freehandPointsToFlatArray(
            outlinePoints
        );

    const flatCenterlinePoints =
        freehandPointsToFlatArray(
            strokePoints
        );

    const bounds =
        calculateFreehandBounds(
            outlinePoints
        );

    const length =
        strokePoints.length >
        0
            ? strokePoints[
                strokePoints.length - 1
            ].runningLength
            : 0;

    const widths =
        strokePoints.map(
            point =>
                point.width
        );

    const minimumWidth =
        widths.length > 0
            ? Math.min(
                ...widths
            )
            : 0;

    const maximumWidth =
        widths.length > 0
            ? Math.max(
                ...widths
            )
            : 0;

    return {
        valid:
            strokePoints.length >
                0 &&
            outlinePoints.length >
                0,

        version:
            PERFECT_FREEHAND_VERSION,

        options:
            cloneSerializable(
                resolvedOptions
            ),

        centerline:
            strokePoints,

        centerlinePoints:
            strokePoints,

        flatCenterlinePoints,

        outline:
            outlinePoints,

        outlinePoints,

        flatOutlinePoints,

        svgPath:
            getSvgPathFromStroke(
                outlinePoints,
                resolvedOptions
            ),

        length,

        minimumWidth,

        maximumWidth,

        bounds
    };
}

/*=========================================================
Perfect Freehand Brush Class
=========================================================*/

export class PerfectFreehandBrush {
    constructor(
        options = {}
    ) {
        this.options =
            normalizeFreehandOptions(
                options
            );

        this.lastGeometry =
            null;
    }

    setOptions(
        updates = {}
    ) {
        if (
            !isPlainObject(
                updates
            )
        ) {
            return this.getOptions();
        }

        this.options =
            normalizeFreehandOptions({
                ...this.options,
                ...updates,

                start: {
                    ...(
                        isPlainObject(
                            this.options.start
                        )
                            ? this.options
                                .start
                            : {}
                    ),

                    ...(
                        isPlainObject(
                            updates.start
                        )
                            ? updates.start
                            : {}
                    )
                },

                end: {
                    ...(
                        isPlainObject(
                            this.options.end
                        )
                            ? this.options
                                .end
                            : {}
                    ),

                    ...(
                        isPlainObject(
                            updates.end
                        )
                            ? updates.end
                            : {}
                    )
                }
            });

        return this.getOptions();
    }

    getOptions() {
        return cloneSerializable(
            this.options
        );
    }

    process(
        points,
        options = {}
    ) {
        const resolvedOptions =
            normalizeFreehandOptions({
                ...this.options,
                ...(
                    isPlainObject(
                        options
                    )
                        ? options
                        : {}
                )
            });

        this.lastGeometry =
            createPerfectFreehandGeometry(
                points,
                resolvedOptions
            );

        return cloneSerializable(
            this.lastGeometry
        );
    }

    getStrokePoints(
        points,
        options = {}
    ) {
        return getStrokePoints(
            points,
            {
                ...this.options,
                ...options
            }
        );
    }

    getOutlinePoints(
        points,
        options = {}
    ) {
        return getStrokeOutlinePoints(
            points,
            {
                ...this.options,
                ...options
            }
        );
    }

    getStroke(
        points,
        options = {}
    ) {
        return getStroke(
            points,
            {
                ...this.options,
                ...options
            }
        );
    }

    getSvgPath(
        points,
        options = {}
    ) {
        const geometry =
            this.process(
                points,
                options
            );

        return geometry.svgPath;
    }

    getLastGeometry() {
        return this.lastGeometry
            ? cloneSerializable(
                this.lastGeometry
            )
            : null;
    }

    reset() {
        this.lastGeometry =
            null;
    }
}

/*=========================================================
Factory
=========================================================*/

export function createPerfectFreehandBrush(
    options = {}
) {
    return new PerfectFreehandBrush(
        options
    );
}

/*=========================================================
Default Export
=========================================================*/

export default createPerfectFreehandBrush;