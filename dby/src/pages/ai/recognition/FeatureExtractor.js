/*
=========================================================
FashionVision AI
Feature Extractor
Version 1.0
=========================================================
*/

import { round } from "../utils/MathUtils";

/*=========================================================
Feature Categories
=========================================================*/

export const FEATURE_TYPES = {

    POSITION: "position",

    SIZE: "size",

    ORIENTATION: "orientation",

    SYMMETRY: "symmetry",

    STYLE: "style",

    AI: "ai"

};

/*=========================================================
Thresholds
=========================================================*/

export const THRESHOLDS = {

    SMALL_SIZE: 60,

    MEDIUM_SIZE: 180,

    LARGE_SIZE: 350,

    TALL_RATIO: 1.40,

    WIDE_RATIO: 1.40,

    SMOOTH: 0.75,

    ROUGH: 0.35

};

/*=========================================================
Create Empty Feature Object
=========================================================*/

export function createFeatureObject() {

    return {

        position: {},

        size: {},

        orientation: {},

        symmetry: {},

        style: {},

        ai: {}

    };

}

/*=========================================================
Normalize Value
=========================================================*/

export function normalize(value, max) {

    if (max <= 0)
        return 0;

    return round(value / max, 4);

}

/*=========================================================
Clamp
=========================================================*/

export function clamp(value, min = 0, max = 1) {

    return Math.max(

        min,

        Math.min(

            value,

            max

        )

    );

}

/*=========================================================
Percentage
=========================================================*/

export function percentage(value, total) {

    if (total <= 0)
        return 0;

    return round(

        (value / total) * 100,

        2

    );

}

/*=========================================================
Position Feature Extraction
=========================================================*/

export function extractPosition(analysis, canvas = {}) {

    if (!analysis)
        return analysis;

    const box = analysis.geometry.boundingBox;
    const center = analysis.geometry.centroid;

   const suppliedWidth =
    Number(canvas.width);

const suppliedHeight =
    Number(canvas.height);

const canvasWidth =
    suppliedWidth > 0
        ? suppliedWidth
        : 1000;

const canvasHeight =
    suppliedHeight > 0
        ? suppliedHeight
        : 1000;

const normalizedX =
    clamp(
        normalize(
            center.x,
            canvasWidth
        )
    );

const normalizedY =
    clamp(
        normalize(
            center.y,
            canvasHeight
        )
    );

    let horizontal = "center";

    if (normalizedX < 0.33)
        horizontal = "left";

    else if (normalizedX > 0.66)
        horizontal = "right";

    let vertical = "middle";

    if (normalizedY < 0.33)
        vertical = "top";

    else if (normalizedY > 0.66)
        vertical = "bottom";

    analysis.extracted.position = {

        centerX: round(center.x, 2),

        centerY: round(center.y, 2),

        normalizedX,

        normalizedY,

        left: round(box.x, 2),

        top: round(box.y, 2),

        right: round(box.x + box.width, 2),

        bottom: round(box.y + box.height, 2),

        horizontal,

        vertical

    };

    return analysis;

}

/*=========================================================
Size Feature Extraction
=========================================================*/

export function extractSize(analysis) {

    if (!analysis)
        return analysis;

    const geometry = analysis.geometry;

    const box = geometry.boundingBox;

    const width = box.width;

    const height = box.height;

    const area = geometry.area;

    const perimeter = geometry.perimeter;

    const longestSide = Math.max(width, height);

    const shortestSide = Math.min(width, height);

    const diagonal = Math.hypot(width, height);

    const tallRatio =
    height /
    Math.max(width, 1);

const wideRatio =
    width /
    Math.max(height, 1);

    let category = "medium";

    if (longestSide < THRESHOLDS.SMALL_SIZE)
        category = "small";

    else if (longestSide < THRESHOLDS.MEDIUM_SIZE)
        category = "medium";

    else if (longestSide < THRESHOLDS.LARGE_SIZE)
        category = "large";

    else
        category = "extra-large";

    analysis.extracted.size = {

        width: round(width, 2),

        height: round(height, 2),

        area: round(area, 2),

        perimeter: round(perimeter, 2),

        longestSide: round(longestSide, 2),

        shortestSide: round(shortestSide, 2),

        diagonal: round(diagonal, 2),
        

        aspectRatio: round(

            width / Math.max(height, 1),

            4

        ),

        category,

       tallRatio:
    round(tallRatio, 4),

wideRatio:
    round(wideRatio, 4),

isTall:
    tallRatio >=
    THRESHOLDS.TALL_RATIO,

isWide:
    wideRatio >=
    THRESHOLDS.WIDE_RATIO,

        isSquare:

            Math.abs(width - height) <

            Math.max(width, height) * 0.10

    };

    return analysis;

}

/*=========================================================
Orientation Feature Extraction
=========================================================*/

export function extractOrientation(analysis) {

    if (!analysis?.geometry?.boundingBox)
        return analysis;

    const geometry =
        analysis.geometry;

    const features =
        analysis.features || {};

    const box =
        geometry.boundingBox;

    const width =
        Number(box.width) || 0;

    const height =
        Number(box.height) || 0;

    const points =
        Array.isArray(geometry.points)
            ? geometry.points
            : [];

    const baseOrientation =
        features.orientation ||
        (
            width > height
                ? "horizontal"
                : height > width
                    ? "vertical"
                    : "square"
        );

    let angle = null;

    let direction =
        baseOrientation;

    let slope =
        "none";

    /*
    Calculate an endpoint angle for open strokes.
    Closed shapes use their bounding-box orientation,
    because their first and final points are close.
    */

    if (
        !geometry.isClosedShape &&
        points.length >= 2
    ) {

        const first =
            points[0];

        const last =
            points[points.length - 1];

        const deltaX =
            last.x - first.x;

        const deltaY =
            last.y - first.y;

        if (
            Math.hypot(
                deltaX,
                deltaY
            ) > 0
        ) {

            let calculatedAngle =
                Math.atan2(
                    deltaY,
                    deltaX
                ) *
                180 /
                Math.PI;

            /*
            Normalize the angle to -90 through 90.
            */

            if (calculatedAngle > 90)
                calculatedAngle -= 180;

            if (calculatedAngle < -90)
                calculatedAngle += 180;

            angle =
                round(
                    calculatedAngle,
                    2
                );

            const absoluteAngle =
                Math.abs(
                    calculatedAngle
                );

            if (absoluteAngle <= 15) {

                direction =
                    "horizontal";

            } else if (
                absoluteAngle >= 75
            ) {

                direction =
                    "vertical";

            } else {

                direction =
                    "diagonal";

                /*
                Canvas Y increases downward.
                */

                slope =
                    calculatedAngle > 0
                        ? "descending"
                        : "ascending";

            }

        }

    }

    analysis.extracted.orientation = {

        angle,

        direction,

        slope,

        width:
            round(width, 2),

        height:
            round(height, 2),

        portrait:
            height > width,

        landscape:
            width > height,

        square:
            Math.abs(
                width - height
            ) <=
            Math.max(
                width,
                height,
                1
            ) * 0.10

    };

    return analysis;

}

/*=========================================================
Symmetry Feature Extraction
=========================================================*/

export function extractSymmetry(analysis) {

    if (!analysis)
        return analysis;

    const geometry = analysis.geometry;

    const features = analysis.features;

    const box = geometry.boundingBox;

    const width = box.width;

    const height = box.height;

    const aspect = features.aspectRatio;

    const circularity = features.circularity;

    const complexity = features.complexity;

    let verticalScore = 0;

    let horizontalScore = 0;

    let radialScore = 0;

    /*---------------------------------------------
    Vertical Symmetry
    ---------------------------------------------*/

    verticalScore =

        1 - Math.min(

            Math.abs(1 - aspect),

            1

        );

    /*---------------------------------------------
    Horizontal Symmetry
    ---------------------------------------------*/

    horizontalScore =

        1 - Math.min(

            Math.abs(width - height) /

            Math.max(width, height, 1),

            1

        );

    /*---------------------------------------------
    Radial Symmetry
    ---------------------------------------------*/

    radialScore = circularity;

    /*---------------------------------------------
    Overall Symmetry
    ---------------------------------------------*/

    const symmetryScore =

        (

            verticalScore +

            horizontalScore +

            radialScore

        ) / 3;

    analysis.extracted.symmetry = {

         method: "heuristic",

    vertical: round(verticalScore, 4),

    horizontal: round(horizontalScore, 4),

    radial: round(radialScore, 4),

    overall: round(symmetryScore, 4),

        highlySymmetric:

            symmetryScore >= 0.80,

        moderatelySymmetric:

            symmetryScore >= 0.55 &&
            symmetryScore < 0.80,

        asymmetric:

            symmetryScore < 0.55,

        complexity: round(complexity,4)

    };

    return analysis;

}

/*=========================================================
Style Feature Extraction
=========================================================*/

export function extractStyle(analysis) {

    if (!analysis)
        return analysis;

    const features =
        analysis.features || {};

    const smoothness =
        Number(features.smoothness) || 0;

    const complexity =
        Number(features.complexity) || 0;

    const isSmooth =
        smoothness >=
        THRESHOLDS.SMOOTH;

    const isRough =
        smoothness <=
        THRESHOLDS.ROUGH;

    const recognition =
        analysis.recognition || {};

    const analysisConfidence =
        clamp(
            Number(
                recognition.analysisConfidence ??
                recognition.confidence
            ) || 0
        );

    const shapeConfidence =
        clamp(
            Number(
                recognition.shapeConfidence
            ) || 0
        );

    const confidence =
        clamp(
            Number(
                recognition.confidence
            ) || 0
        );

    let style =
        "unknown";

    /*---------------------------------------------
    Style Classification
    ---------------------------------------------*/

    if (
        isSmooth &&
        complexity < 0.20
    ) {

        style =
            "technical";

    } else if (
        smoothness >= 0.65 &&
        complexity < 0.40
    ) {

        style =
            "clean";

    } else if (
        !isRough &&
        complexity < 0.60
    ) {

        style =
            "concept";

    } else {

        style =
            "rough";

    }

    /*---------------------------------------------
    Detail Level
    ---------------------------------------------*/

    let detail =
        "low";

    if (complexity > 0.75) {

        detail =
            "high";

    } else if (
        complexity > 0.40
    ) {

        detail =
            "medium";

    }

    /*---------------------------------------------
    Drawing Quality
    ---------------------------------------------*/

    let quality =
        "poor";

    if (
        analysisConfidence >= 0.90
    ) {

        quality =
            "excellent";

    } else if (
        analysisConfidence >= 0.75
    ) {

        quality =
            "good";

    } else if (
        analysisConfidence >= 0.50
    ) {

        quality =
            "fair";

    }

    analysis.extracted.style = {

        style,

        detail,

        quality,

        smoothness:
            round(
                smoothness,
                4
            ),

        complexity:
            round(
                complexity,
                4
            ),

        analysisConfidence:
            round(
                analysisConfidence,
                4
            ),

        shapeConfidence:
            round(
                shapeConfidence,
                4
            ),

        confidence:
            round(
                confidence,
                4
            ),

        isSmooth,

        isRough,

        technical:
            style === "technical",

        clean:
            style === "clean",

        concept:
            style === "concept",

        rough:
            style === "rough"

    };

    return analysis;

}

/*=========================================================
AI Feature Extraction
=========================================================*/

export function extractAI(analysis) {

    if (!analysis)
        return analysis;

    const recognition =
        analysis.recognition || {};

    analysis.extracted.ai = {

        shape:
            recognition.shape ||
            "unknown",

        analysisConfidence:
            clamp(
                Number(
                    recognition
                        .analysisConfidence
                ) || 0
            ),

        shapeConfidence:
            clamp(
                Number(
                    recognition
                        .shapeConfidence
                ) || 0
            ),

        confidence:
            clamp(
                Number(
                    recognition.confidence
                ) || 0
            ),

        tags:
            Array.isArray(
                recognition.tags
            )
                ? [...recognition.tags]
                : [],

        garment:
            recognition.garment ??
            null,

        groupId:
            recognition.groupId ??
            null

    };

    return analysis;

}

/*=========================================================
Extract Features From Multiple Strokes
=========================================================*/

export function extractAllFeatures(
    analyses = [],
    canvas = {}
) {

    if (!Array.isArray(analyses))
        return [];

    return analyses
        .map(analysis =>
            extractFeatures(
                analysis,
                canvas
            )
        )
        .filter(Boolean);

}

/*=========================================================
Main Feature Extraction Pipeline
=========================================================*/

export function extractFeatures(
    analysis,
    canvas = {}
) {

    if (!analysis)
        return null;

    if (!analysis.extracted) {

        analysis.extracted =
            createFeatureObject();

    }

    extractPosition(
        analysis,
        canvas
    );

    extractSize(analysis);

    extractOrientation(analysis);

    extractSymmetry(analysis);

    extractStyle(analysis);

    extractAI(analysis);

    return analysis;

}

/*=========================================================
Default Export
=========================================================*/

export default {

    FEATURE_TYPES,

    THRESHOLDS,

    createFeatureObject,

    normalize,

    clamp,

    percentage,

    extractPosition,

    extractSize,

    extractOrientation,

    extractSymmetry,

    extractStyle,

    extractAI,

    extractFeatures,

    extractAllFeatures

};