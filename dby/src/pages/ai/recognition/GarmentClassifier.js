/*
=========================================================
FashionVision AI
Garment Classifier
Version 1.0
=========================================================
*/

import { round } from "../utils/MathUtils";

/*=========================================================
Garment Parts
=========================================================*/

export const GARMENT_PARTS = {
    UNKNOWN: "unknown",

    OUTLINE: "outline",

    BODICE: "bodice",

    SLEEVE: "sleeve",

    NECKLINE: "neckline",

    COLLAR: "collar",

    WAISTLINE: "waistline",

    HEMLINE: "hemline",

    SKIRT_PANEL: "skirt-panel",

    TROUSER_LEG: "trouser-leg",

    POCKET: "pocket",

    BUTTON: "button",

    SEAM: "seam",

    DECORATION: "decoration"
};

/*=========================================================
Garment Types
=========================================================*/

export const GARMENT_TYPES = {
    UNKNOWN: "unknown",

    GARMENT_OUTLINE: "garment-outline",

    UPPER_BODY: "upper-body",

    DRESS: "dress",

    SKIRT: "skirt",

    TROUSERS: "trousers",

    DETAIL_CLUSTER: "detail-cluster"
};

/*=========================================================
Classifier Thresholds
=========================================================*/

export const THRESHOLDS = {
    MIN_PART_CONFIDENCE: 0.32,

    MIN_GARMENT_CONFIDENCE: 0.35,

    SMALL_RELATIVE_WIDTH: 0.24,

    SMALL_RELATIVE_HEIGHT: 0.24,

    NARROW_RELATIVE_HEIGHT: 0.12,

    ELONGATED_RATIO: 1.60,

    VERY_ELONGATED_RATIO: 2.30
};

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

export function clamp(
    value,
    min = 0,
    max = 1
) {
    return Math.max(
        min,
        Math.min(
            max,
            numberOr(
                value,
                min
            )
        )
    );
}

/*=========================================================
Get Strokes From Group
=========================================================*/

export function getGroupStrokes(
    group
) {
    if (
        Array.isArray(
            group?.strokes
        )
    ) {
        return group.strokes.filter(
            Boolean
        );
    }

    if (
        Array.isArray(
            group?.members
        )
    ) {
        return group.members.filter(
            Boolean
        );
    }

    if (
        Array.isArray(
            group?.analyses
        )
    ) {
        return group.analyses.filter(
            Boolean
        );
    }

    return [];
}

/*=========================================================
Bounding Box Helpers
=========================================================*/

function normalizeBox(
    box = {}
) {
    const x =
        numberOr(
            box.x ??
            box.minX,
            0
        );

    const y =
        numberOr(
            box.y ??
            box.minY,
            0
        );

    const width =
        Math.max(
            0,
            numberOr(
                box.width,
                numberOr(
                    box.maxX,
                    x
                ) - x
            )
        );

    const height =
        Math.max(
            0,
            numberOr(
                box.height,
                numberOr(
                    box.maxY,
                    y
                ) - y
            )
        );

    return {
        x,
        y,

        minX:
            x,

        minY:
            y,

        maxX:
            x + width,

        maxY:
            y + height,

        width,
        height,

        center: {
            x:
                x +
                width / 2,

            y:
                y +
                height / 2
        }
    };
}

function mergeBoxes(
    boxes = []
) {
    const validBoxes =
        boxes
            .filter(Boolean)
            .map(normalizeBox);

    if (
        validBoxes.length === 0
    ) {
        return normalizeBox();
    }

    const minX =
        Math.min(
            ...validBoxes.map(
                box => box.minX
            )
        );

    const minY =
        Math.min(
            ...validBoxes.map(
                box => box.minY
            )
        );

    const maxX =
        Math.max(
            ...validBoxes.map(
                box => box.maxX
            )
        );

    const maxY =
        Math.max(
            ...validBoxes.map(
                box => box.maxY
            )
        );

    return normalizeBox({
        x:
            minX,

        y:
            minY,

        width:
            maxX - minX,

        height:
            maxY - minY
    });
}

export function getGroupBoundingBox(
    group
) {
    if (
        group?.boundingBox
    ) {
        return normalizeBox(
            group.boundingBox
        );
    }

    const strokes =
        getGroupStrokes(
            group
        );

    return mergeBoxes(
        strokes.map(
            stroke =>
                stroke
                    ?.geometry
                    ?.boundingBox
        )
    );
}

/*=========================================================
Create Relative Stroke Metrics
=========================================================*/

function createMetrics(
    stroke,
    groupBox
) {
    const box =
        normalizeBox(
            stroke
                ?.geometry
                ?.boundingBox
        );

    const safeGroupBox =
        normalizeBox(
            groupBox
        );

    const relativeWidth =
        box.width /
        Math.max(
            safeGroupBox.width,
            1
        );

    const relativeHeight =
        box.height /
        Math.max(
            safeGroupBox.height,
            1
        );

    const centerX =
        (
            box.center.x -
            safeGroupBox.x
        ) /
        Math.max(
            safeGroupBox.width,
            1
        );

    const centerY =
        (
            box.center.y -
            safeGroupBox.y
        ) /
        Math.max(
            safeGroupBox.height,
            1
        );

    const aspectRatio =
        box.width /
        Math.max(
            box.height,
            1
        );

    const tallRatio =
        box.height /
        Math.max(
            box.width,
            1
        );

    return {
        box,

        shape:
            stroke
                ?.recognition
                ?.shape ||
            "unknown",

        orientation:
            stroke
                ?.features
                ?.orientation ||
            (
                box.width >
                box.height
                    ? "horizontal"
                    : box.height >
                        box.width
                        ? "vertical"
                        : "square"
            ),

        isClosed:
            Boolean(
                stroke
                    ?.geometry
                    ?.isClosedShape
            ),

        smoothness:
            clamp(
                stroke
                    ?.features
                    ?.smoothness
            ),

        complexity:
            clamp(
                stroke
                    ?.features
                    ?.complexity
            ),

        circularity:
            clamp(
                stroke
                    ?.features
                    ?.circularity
            ),

        sharpCorners:
            Math.max(
                0,
                numberOr(
                    stroke
                        ?.features
                        ?.sharpCorners
                )
            ),

        recognitionConfidence:
            clamp(
                stroke
                    ?.recognition
                    ?.confidence
            ),

        centerX:
            clamp(
                centerX
            ),

        centerY:
            clamp(
                centerY
            ),

        relativeWidth:
            clamp(
                relativeWidth
            ),

        relativeHeight:
            clamp(
                relativeHeight
            ),

        aspectRatio,

        tallRatio
    };
}

/*=========================================================
Scoring Helpers
=========================================================*/

function addScore(
    scores,
    part,
    amount
) {
    scores[part] =
        numberOr(
            scores[part]
        ) +
        numberOr(
            amount
        );
}

function chooseHighest(
    scores
) {
    return Object.entries(
        scores
    ).reduce(
        (
            best,
            [
                part,
                score
            ]
        ) => {

            if (
                score >
                best.score
            ) {
                return {
                    part,
                    score
                };
            }

            return best;

        },
        {
            part:
                GARMENT_PARTS.UNKNOWN,

            score:
                0
        }
    );
}

/*=========================================================
Classify One Stroke as a Garment Part
=========================================================*/

export function classifyStrokePart(
    stroke,
    group
) {
    if (!stroke) {
        return {
            strokeId:
                null,

            part:
                GARMENT_PARTS.UNKNOWN,

            confidence:
                0,

            tags:
                []
        };
    }

    const metrics =
        createMetrics(
            stroke,
            getGroupBoundingBox(
                group
            )
        );

    const scores = {};
    const tags = [];

    const {
        shape,
        orientation,
        isClosed,
        smoothness,
        complexity,
        circularity,
        sharpCorners,
        recognitionConfidence,
        centerX,
        centerY,
        relativeWidth,
        relativeHeight,
        aspectRatio,
        tallRatio
    } = metrics;

    const nearTop =
        centerY <= 0.30;

    const nearMiddle =
        centerY > 0.30 &&
        centerY < 0.68;

    const nearBottom =
        centerY >= 0.68;

    const nearLeft =
        centerX <= 0.28;

    const nearRight =
        centerX >= 0.72;

    const nearCenter =
        !nearLeft &&
        !nearRight;

    const small =
        relativeWidth <=
            THRESHOLDS
                .SMALL_RELATIVE_WIDTH &&
        relativeHeight <=
            THRESHOLDS
                .SMALL_RELATIVE_HEIGHT;

    const narrowHorizontal =
        orientation ===
            "horizontal" &&
        relativeHeight <=
            THRESHOLDS
                .NARROW_RELATIVE_HEIGHT;

    const elongated =
        aspectRatio >=
            THRESHOLDS
                .ELONGATED_RATIO ||
        tallRatio >=
            THRESHOLDS
                .ELONGATED_RATIO;

    const veryTall =
        tallRatio >=
        THRESHOLDS
            .VERY_ELONGATED_RATIO;

    const curved =
        [
            "curve",
            "circle",
            "ellipse"
        ].includes(
            shape
        );

    const angular =
        [
            "rectangle",
            "triangle",
            "polygon"
        ].includes(
            shape
        );

    const structural =
        [
            "line",
            "curve",
            "scribble"
        ].includes(
            shape
        );

    /*---------------------------------------------
    Neckline
    ---------------------------------------------*/

    if (
        nearTop &&
        nearCenter &&
        curved
    ) {
        addScore(
            scores,
            GARMENT_PARTS.NECKLINE,
            0.72
        );

        tags.push(
            "top-center",
            "curved"
        );
    }

    /*---------------------------------------------
    Collar
    ---------------------------------------------*/

    if (
        nearTop &&
        nearCenter &&
        angular &&
        relativeHeight < 0.35
    ) {
        addScore(
            scores,
            GARMENT_PARTS.COLLAR,
            0.68
        );

        tags.push(
            "top-center",
            "angular"
        );
    }

    /*---------------------------------------------
    Waistline
    ---------------------------------------------*/

    if (
        narrowHorizontal &&
        nearMiddle
    ) {
        addScore(
            scores,
            GARMENT_PARTS.WAISTLINE,
            0.80
        );

        tags.push(
            "horizontal",
            "middle"
        );
    }

    /*---------------------------------------------
    Hemline
    ---------------------------------------------*/

    if (
        narrowHorizontal &&
        nearBottom
    ) {
        addScore(
            scores,
            GARMENT_PARTS.HEMLINE,
            0.82
        );

        tags.push(
            "horizontal",
            "bottom"
        );
    }

    /*---------------------------------------------
    Sleeve
    ---------------------------------------------*/

    if (
        (
            nearLeft ||
            nearRight
        ) &&
        elongated &&
        structural
    ) {
        addScore(
            scores,
            GARMENT_PARTS.SLEEVE,
            0.68
        );

        tags.push(
            nearLeft
                ? "left-side"
                : "right-side",

            "elongated"
        );
    }

    /*---------------------------------------------
    Trouser Leg
    ---------------------------------------------*/

    if (
        nearBottom &&
        (
            nearLeft ||
            nearRight
        ) &&
        veryTall &&
        relativeWidth < 0.45
    ) {
        addScore(
            scores,
            GARMENT_PARTS.TROUSER_LEG,
            0.76
        );

        tags.push(
            "lower-side",
            "tall-narrow"
        );
    }

    /*---------------------------------------------
    Skirt Panel
    ---------------------------------------------*/

    if (
        nearBottom &&
        nearCenter &&
        relativeWidth >= 0.42 &&
        relativeHeight >= 0.34 &&
        (
            isClosed ||
            angular ||
            shape === "scribble"
        )
    ) {
        addScore(
            scores,
            GARMENT_PARTS.SKIRT_PANEL,
            0.70
        );

        tags.push(
            "lower-center",
            "panel"
        );
    }

    /*---------------------------------------------
    Bodice
    ---------------------------------------------*/

 const canBeBodice =
    shape !== "unknown" &&
    shape !== "scribble" &&
    (
        isClosed ||
        angular
    );

if (
    canBeBodice &&
    nearCenter &&
    centerY <= 0.62 &&
    relativeWidth >= 0.34 &&
    relativeHeight >= 0.34
) {
    addScore(
        scores,
        GARMENT_PARTS.BODICE,
        0.62
    );

    tags.push(
        "central",
        "structural"
    );
}

    /*---------------------------------------------
    Pocket
    ---------------------------------------------*/

    if (
        small &&
        nearCenter &&
        isClosed &&
        [
            "rectangle",
            "polygon"
        ].includes(
            shape
        )
    ) {
        addScore(
            scores,
            GARMENT_PARTS.POCKET,
            0.84
        );

        tags.push(
            "small",
            "closed"
        );
    }

    /*---------------------------------------------
    Button
    ---------------------------------------------*/

    if (
        small &&
        nearCenter &&
        isClosed &&
        (
            [
                "circle",
                "ellipse"
            ].includes(
                shape
            ) ||
            circularity >= 0.72
        )
    ) {
        addScore(
            scores,
            GARMENT_PARTS.BUTTON,
            0.88
        );

        tags.push(
            "small",
            "round"
        );
    }

    /*---------------------------------------------
    Seam
    ---------------------------------------------*/

    if (
        nearCenter &&
        !isClosed &&
        [
            "line",
            "curve"
        ].includes(
            shape
        ) &&
        relativeWidth < 0.60 &&
        relativeHeight < 0.70
    ) {
        addScore(
            scores,
            GARMENT_PARTS.SEAM,
            0.48
        );
    }

    /*---------------------------------------------
    Decoration
    ---------------------------------------------*/

    if (
        small &&
        (
            shape === "scribble" ||
            complexity >= 0.55 ||
            sharpCorners >= 5
        )
    ) {
        addScore(
            scores,
            GARMENT_PARTS.DECORATION,
            0.64
        );

        tags.push(
            "small",
            "decorative"
        );
    }

    /*---------------------------------------------
    Outline Fallback
    ---------------------------------------------*/

    if (
        structural &&
        relativeHeight >= 0.45
    ) {
        addScore(
            scores,
            GARMENT_PARTS.OUTLINE,
            0.42
        );
    }

    if (
        smoothness >= 0.65 &&
        complexity < 0.45 &&
        relativeHeight >= 0.35
    ) {
        addScore(
            scores,
            GARMENT_PARTS.OUTLINE,
            0.16
        );
    }

    const selected =
        chooseHighest(
            scores
        );

    const part =
        selected.score >=
        THRESHOLDS
            .MIN_PART_CONFIDENCE
            ? selected.part
            : GARMENT_PARTS.UNKNOWN;

    const confidence =
        part ===
        GARMENT_PARTS.UNKNOWN
            ? 0.20
            : clamp(
                selected.score *
                (
                    0.75 +
                    recognitionConfidence *
                    0.25
                )
            );

    return {
        strokeId:
            stroke.id ??
            null,

        part,

        confidence:
            round(
                confidence,
                3
            ),

        tags:
            [
                ...new Set(
                    tags
                )
            ],

        metrics: {
            shape,

            orientation,

            isClosed,

            centerX:
                round(
                    centerX,
                    4
                ),

            centerY:
                round(
                    centerY,
                    4
                ),

            relativeWidth:
                round(
                    relativeWidth,
                    4
                ),

            relativeHeight:
                round(
                    relativeHeight,
                    4
                ),

            aspectRatio:
                round(
                    aspectRatio,
                    4
                ),

            tallRatio:
                round(
                    tallRatio,
                    4
                ),

            smoothness:
                round(
                    smoothness,
                    4
                ),

            complexity:
                round(
                    complexity,
                    4
                )
        }
    };
}

/*=========================================================
Count Garment Parts
=========================================================*/

function countParts(
    assignments = []
) {
    return assignments.reduce(
        (
            counts,
            assignment
        ) => {

            const part =
                assignment?.part ||
                GARMENT_PARTS.UNKNOWN;

            counts[part] =
                numberOr(
                    counts[part]
                ) + 1;

            return counts;

        },
        {}
    );
}

/*=========================================================
Infer Garment Type From Group
=========================================================*/

export function inferGarmentType(
    group,
    assignments = []
) {
    const counts =
        countParts(
            assignments
        );

    const box =
        getGroupBoundingBox(
            group
        );

    const strokes =
        getGroupStrokes(
            group
        );

        const hasMinimumGarmentStructure =
    strokes.length >= 3;

    const tallRatio =
        box.height /
        Math.max(
            box.width,
            1
        );

    const count =
        part =>
            numberOr(
                counts[part]
            );

    const bodices =
        count(
            GARMENT_PARTS.BODICE
        );

    const sleeves =
        count(
            GARMENT_PARTS.SLEEVE
        );

    const skirts =
        count(
            GARMENT_PARTS.SKIRT_PANEL
        );

    const trouserLegs =
        count(
            GARMENT_PARTS.TROUSER_LEG
        );

    const outlines =
        count(
            GARMENT_PARTS.OUTLINE
        );

    const details =
        count(
            GARMENT_PARTS.BUTTON
        ) +
        count(
            GARMENT_PARTS.POCKET
        ) +
        count(
            GARMENT_PARTS.DECORATION
        );

    const scores = {
    [GARMENT_TYPES.UNKNOWN]:
        0.20,

    [GARMENT_TYPES.GARMENT_OUTLINE]:
        (
            strokes.length >= 2 &&
            outlines > 0
                ? 0.50
                : 0
        ),

    [GARMENT_TYPES.UPPER_BODY]:
        (
            hasMinimumGarmentStructure &&
            bodices > 0
                ? 0.52
                : 0
        ) +
        (
            hasMinimumGarmentStructure &&
            sleeves > 0
                ? 0.18
                : 0
        ),

    [GARMENT_TYPES.DRESS]:
        (
            strokes.length >= 4 &&
            bodices > 0 &&
            skirts > 0
                ? 0.76
                : 0
        ) +
        (
            strokes.length >= 4 &&
            bodices > 0 &&
            tallRatio >= 1.45
                ? 0.20
                : 0
        ),

    [GARMENT_TYPES.SKIRT]:
        (
            strokes.length >= 2 &&
            skirts > 0 &&
            bodices === 0
                ? 0.68
                : 0
        ),

    [GARMENT_TYPES.TROUSERS]:
        (
            trouserLegs >= 2
                ? 0.82
                : 0
        ),

    [GARMENT_TYPES.DETAIL_CLUSTER]:
        (
            details >= 2 &&
            bodices === 0 &&
            skirts === 0 &&
            trouserLegs === 0
                ? 0.62
                : 0
        )
};

    const selected =
        Object.entries(
            scores
        ).reduce(
            (
                best,
                [
                    type,
                    score
                ]
            ) => {

                if (
                    score >
                    best.score
                ) {
                    return {
                        type,
                        score
                    };
                }

                return best;

            },
            {
                type:
                    GARMENT_TYPES.UNKNOWN,

                score:
                    0
            }
        );

    const type =
        selected.score >=
        THRESHOLDS
            .MIN_GARMENT_CONFIDENCE
            ? selected.type
            : GARMENT_TYPES.UNKNOWN;

    const averagePartConfidence =
        assignments.length > 0
            ? assignments.reduce(
                (
                    total,
                    assignment
                ) =>
                    total +
                    numberOr(
                        assignment
                            .confidence
                    ),
                0
            ) /
            assignments.length
            : 0;

    const confidence =
        type ===
        GARMENT_TYPES.UNKNOWN
            ? 0.20
            : clamp(
                selected.score *
                    0.75 +
                averagePartConfidence *
                    0.25
            );

    return {
        type,

        confidence:
            round(
                confidence,
                3
            ),

        partCounts:
            counts,

        metrics: {
            strokeCount:
                strokes.length,

            width:
                round(
                    box.width,
                    2
                ),

            height:
                round(
                    box.height,
                    2
                ),

            aspectRatio:
                round(
                    box.width /
                    Math.max(
                        box.height,
                        1
                    ),
                    4
                ),

            tallRatio:
                round(
                    tallRatio,
                    4
                )
        }
    };
}

/*=========================================================
Classify One Group
=========================================================*/

export function classifyGroup(
    group
) {
    if (!group)
        return null;

    const strokes =
        getGroupStrokes(
            group
        );

    const assignments =
        strokes.map(
            stroke =>
                classifyStrokePart(
                    stroke,
                    group
                )
        );

    const garment =
        inferGarmentType(
            group,
            assignments
        );

    const result = {
        groupId:
            group.id ??
            null,

        garmentType:
            garment.type,

        confidence:
            garment.confidence,

        boundingBox:
            getGroupBoundingBox(
                group
            ),

        partCounts:
            garment.partCounts,

        assignments,

        metrics:
            garment.metrics
    };

    /*
    Attach classification to the group.
    */

    group.type =
        garment.type;

    group.garment =
        result;

    /*
    Attach garment-part recognition to each stroke.
    */

    assignments.forEach(
        (
            assignment,
            index
        ) => {

            const stroke =
                strokes[index];

            if (!stroke)
                return;

            if (
                !stroke.recognition
            ) {
                stroke.recognition = {
                    shape:
                        "unknown",

                    confidence:
                        0,

                    tags:
                        []
                };
            }

            stroke.recognition.garment =
                assignment.part;

            stroke.recognition
                .garmentConfidence =
                assignment.confidence;

            /*
            This also supports classification if feature
            extraction has already run.
            */

            if (
                stroke.extracted?.ai
            ) {
                stroke.extracted.ai.garment =
                    assignment.part;

                stroke.extracted
                    .ai
                    .garmentConfidence =
                    assignment.confidence;
            }

        }
    );

    return result;
}

/*=========================================================
Classify Complete Sketch
=========================================================*/

export function classifyGarment(
    groups = []
) {
    if (
        !Array.isArray(
            groups
        )
    ) {
        return {
            version:
                1,

            garmentType:
                GARMENT_TYPES.UNKNOWN,

            confidence:
                0,

            groups:
                [],

            partCounts:
                {}
        };
    }

    const classifications =
        groups
            .map(
                classifyGroup
            )
            .filter(
                Boolean
            );

    const partCounts = {};
    const typeScores = {};

    classifications.forEach(
        classification => {

            Object.entries(
                classification
                    .partCounts ||
                {}
            ).forEach(
                (
                    [
                        part,
                        count
                    ]
                ) => {

                    partCounts[part] =
                        numberOr(
                            partCounts[part]
                        ) +
                        numberOr(
                            count
                        );

                }
            );

            const type =
                classification
                    .garmentType ||
                GARMENT_TYPES.UNKNOWN;

            typeScores[type] =
                numberOr(
                    typeScores[type]
                ) +
                numberOr(
                    classification
                        .confidence
                );

        }
    );

    if (
        classifications.length === 0
    ) {
        return {
            version:
                1,

            garmentType:
                GARMENT_TYPES.UNKNOWN,

            confidence:
                0,

            groups:
                [],

            partCounts
        };
    }

    const selected =
        Object.entries(
            typeScores
        ).reduce(
            (
                best,
                [
                    type,
                    score
                ]
            ) => {

                if (
                    score >
                    best.score
                ) {
                    return {
                        type,
                        score
                    };
                }

                return best;

            },
            {
                type:
                    GARMENT_TYPES.UNKNOWN,

                score:
                    0
            }
        );

    const matchingGroups =
        classifications.filter(
            classification =>
                classification
                    .garmentType ===
                selected.type
        );

    const confidence =
        matchingGroups.length > 0
            ? matchingGroups.reduce(
                (
                    total,
                    classification
                ) =>
                    total +
                    classification
                        .confidence,
                0
            ) /
            matchingGroups.length
            : 0;

    return {
        version:
            1,

        garmentType:
            selected.type,

        confidence:
            round(
                clamp(
                    confidence
                ),
                3
            ),

        groups:
            classifications,

        partCounts
    };
}

/*=========================================================
Default Export
=========================================================*/

export default {
    GARMENT_PARTS,

    GARMENT_TYPES,

    THRESHOLDS,

    getGroupStrokes,

    getGroupBoundingBox,

    classifyStrokePart,

    inferGarmentType,

    classifyGroup,

    classifyGarment
};