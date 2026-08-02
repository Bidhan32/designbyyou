/*
=========================================================
FashionVision AI
Shape Detector
Version 1.0
=========================================================
*/

import { round } from "../utils/MathUtils";

/*=========================================================
Shape Types
=========================================================*/

export const SHAPES = {

    UNKNOWN: "unknown",

    LINE: "line",

    CURVE: "curve",

    CIRCLE: "circle",

    ELLIPSE: "ellipse",

    RECTANGLE: "rectangle",

    TRIANGLE: "triangle",

    POLYGON: "polygon",

    SCRIBBLE: "scribble"

};

/*=========================================================
Detection Thresholds
=========================================================*/

export const THRESHOLDS = {

    CIRCLE_CIRCULARITY: 0.82,

    RECTANGLE_ASPECT_MIN: 0.45,

    RECTANGLE_ASPECT_MAX: 2.50,

    LINE_COMPLEXITY: 0.08,

    CURVE_COMPLEXITY: 0.25,

    SCRIBBLE_COMPLEXITY: 0.60,

  

};

/*=========================================================
Recognition Result
=========================================================*/

export function createRecognitionResult() {

    return {
        shape: SHAPES.UNKNOWN,

        analysisConfidence: 1,

        shapeConfidence: 0,

        confidence: 0,

        tags: []
    };

}

/*=========================================================
Confidence Clamp
=========================================================*/

export function clampConfidence(value) {

    const numericValue =
        Number(value);

    if (!Number.isFinite(numericValue))
        return 0;

    return Math.max(
        0,
        Math.min(
            1,
            round(
                numericValue,
                3
            )
        )
    );

}

/*=========================================================
Tag Helper
=========================================================*/

export function addTag(result, tag) {

    if (!result)
        return;

    if (!Array.isArray(result.tags)) {

        result.tags = [];

    }

    if (
        typeof tag !== "string" ||
        tag.trim() === ""
    ) {
        return;
    }

    if (!result.tags.includes(tag)) {

        result.tags.push(tag);

    }

}

/*=========================================================
Update Recognition
=========================================================*/

export function updateRecognition(
    analysis,
    shape,
    confidence,
    tags = []
) {

    if (!analysis)
        return analysis;

    if (!analysis.recognition) {

        analysis.recognition =
            createRecognitionResult();

    }

    const previousConfidence =
        Number(
            analysis.recognition.confidence
        );

    const analysisConfidence =
        Number.isFinite(
            analysis.recognition.analysisConfidence
        )
            ? analysis.recognition.analysisConfidence
            : Number.isFinite(previousConfidence)
                ? previousConfidence
                : 1;

    const shapeConfidence =
        clampConfidence(confidence);

    analysis.recognition.shape =
        shape;

    analysis.recognition.analysisConfidence =
        clampConfidence(
            analysisConfidence
        );

    analysis.recognition.shapeConfidence =
        shapeConfidence;

    analysis.recognition.confidence =
        clampConfidence(
            analysisConfidence *
            shapeConfidence
        );

    tags.forEach(tag => {

        addTag(
            analysis.recognition,
            tag
        );

    });

    return analysis;

}

/*=========================================================
Line Detection
=========================================================*/

export function detectLine(analysis) {

    if (!analysis)
        return analysis;

    const { geometry, features } = analysis;

    const width = geometry.boundingBox.width;
    const height = geometry.boundingBox.height;

    const length = geometry.strokeLength;

    const diagonal = Math.hypot(width, height);

    const straightness = diagonal / Math.max(length, 1);

    if (
        !geometry.isClosedShape &&
        straightness > 0.95 &&
        features.complexity < THRESHOLDS.LINE_COMPLEXITY
    ) {

        updateRecognition(
            analysis,
            SHAPES.LINE,
            0.98,
            [
                "open",
                "straight"
            ]
        );

    }

    return analysis;

}

/*=========================================================
Curve Detection
=========================================================*/

export function detectCurve(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { geometry, features } = analysis;

    if (
        !geometry.isClosedShape &&
        features.complexity < THRESHOLDS.CURVE_COMPLEXITY &&
        features.smoothness > 0.65
    ) {

        updateRecognition(
            analysis,
            SHAPES.CURVE,
            0.90,
            [
                "open",
                "smooth"
            ]
        );

    }

    return analysis;

}

/*=========================================================
Scribble Detection
=========================================================*/

export function detectScribble(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { features } = analysis;

    if (

        features.complexity >
        THRESHOLDS.SCRIBBLE_COMPLEXITY

    ) {

        updateRecognition(

            analysis,

            SHAPES.SCRIBBLE,

            0.92,

            [

                "rough",

                "freehand"

            ]

        );

    }

    return analysis;

}

/*=========================================================
Circle Detection
=========================================================*/

export function detectCircle(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { geometry, features } = analysis;

    if (!geometry.isClosedShape)
        return analysis;

    const width = geometry.boundingBox.width;
    const height = geometry.boundingBox.height;

    const ratio = width / Math.max(height, 1);

    const circularity = features.circularity;

    if (

        circularity >= THRESHOLDS.CIRCLE_CIRCULARITY &&
        ratio > 0.85 &&
        ratio < 1.15

    ) {

        updateRecognition(

            analysis,

            SHAPES.CIRCLE,

            0.96,

            [

                "closed",

                "round",

                "symmetric"

            ]

        );

    }

    return analysis;

}

/*=========================================================
Ellipse Detection
=========================================================*/

export function detectEllipse(analysis) {

    if (!analysis)
        return analysis;

    if (
        analysis.recognition.shape !==
        SHAPES.UNKNOWN
    ) {
        return analysis;
    }

    const {
        geometry,
        features
    } = analysis;

    if (!geometry.isClosedShape)
        return analysis;

    const ratio =
        features.aspectRatio;

    const circularityScore =
        features.circularity;

    const elongated =
        ratio < 0.85 ||
        ratio > 1.15;

    const sufficientlyRound =
        circularityScore >= 0.55;

    const mostlySmooth =
        features.smoothness >= 0.55;

    const notAngular =
        features.sharpCorners <= 2;

    if (
        elongated &&
        sufficientlyRound &&
        mostlySmooth &&
        notAngular
    ) {

        updateRecognition(
            analysis,
            SHAPES.ELLIPSE,
            0.93,
            [
                "closed",
                "oval",
                "smooth"
            ]
        );

    }

    return analysis;

}

/*=========================================================
Rectangle Detection
=========================================================*/

export function detectRectangle(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { geometry, features } = analysis;

    if (!geometry.isClosedShape)
        return analysis;

    const corners = features.sharpCorners;
    const ratio = features.aspectRatio;

    if (

        corners === 4 &&

        ratio >= THRESHOLDS.RECTANGLE_ASPECT_MIN &&
        ratio <= THRESHOLDS.RECTANGLE_ASPECT_MAX &&

        features.circularity < 0.75

    ) {

        updateRecognition(

            analysis,

            SHAPES.RECTANGLE,

            0.93,

            [

                "closed",

                "quadrilateral",

                "angular"

            ]

        );

    }

    return analysis;

}

/*=========================================================
Triangle Detection
=========================================================*/

export function detectTriangle(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { geometry, features } = analysis;

    if (!geometry.isClosedShape)
        return analysis;

    const corners = features.sharpCorners;

    if (

        corners === 3

    ) {

        updateRecognition(

            analysis,

            SHAPES.TRIANGLE,

            0.91,

            [

                "closed",

                "triangle",

                "angular"

            ]

        );

    }

    return analysis;

}

/*=========================================================
Polygon Detection
=========================================================*/

export function detectPolygon(analysis) {

    if (!analysis)
        return analysis;

    if (analysis.recognition.shape !== SHAPES.UNKNOWN)
        return analysis;

    const { geometry, features } = analysis;

    if (!geometry.isClosedShape)
        return analysis;

   if (
    features.sharpCorners >= 4
) {

    updateRecognition(
        analysis,
        SHAPES.POLYGON,
        0.89,
        [
            "closed",
            "polygon",
            "angular"
        ]
    );

}

    return analysis;

}

/*=========================================================
Main Shape Detection Pipeline
=========================================================*/

export function detectShape(analysis) {

    if (!analysis)
        return null;

    if (!analysis.recognition) {

        analysis.recognition =
            createRecognitionResult();

    }

    detectLine(analysis);
    detectCurve(analysis);
    detectScribble(analysis);

    detectCircle(analysis);
    detectRectangle(analysis);
    detectTriangle(analysis);
    detectEllipse(analysis);
    detectPolygon(analysis);

   if (
    analysis.recognition.shape ===
    SHAPES.UNKNOWN
) {

    addTag(
        analysis.recognition,
        "unrecognized"
    );

    const analyzerConfidence =
        clampConfidence(
            analysis.recognition
                .analysisConfidence ??
            analysis.recognition
                .confidence ??
            1
        );

    const shapeConfidence =
        0.25;

    analysis.recognition
        .analysisConfidence =
        analyzerConfidence;

    analysis.recognition
        .shapeConfidence =
        shapeConfidence;

    analysis.recognition.confidence =
        clampConfidence(
            analyzerConfidence *
            shapeConfidence
        );

}

    return analysis;

}

/*=========================================================
Detect Shapes For Multiple Strokes
=========================================================*/

export function detectShapes(analyses = []) {

    if (!Array.isArray(analyses))
        return [];

    return analyses

        .map(detectShape)

        .filter(Boolean);

}

/*=========================================================
Default Export
=========================================================*/

export default {

    SHAPES,

    THRESHOLDS,

    detectShape,

    detectShapes,

    detectLine,

    detectCurve,

    detectCircle,

    detectEllipse,

    detectRectangle,

    detectTriangle,

    detectPolygon,

    detectScribble

};