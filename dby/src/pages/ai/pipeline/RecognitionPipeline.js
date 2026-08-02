/*
=========================================================
FashionVision AI
Recognition Pipeline
Version 1.0
=========================================================
*/

import {
    analyzeDrawing
} from "../recognition/StrokeAnalyzer";

import {
    classifyGarment
} from "../recognition/GarmentClassifier";

import {
    detectShapes
} from "../recognition/ShapeDetector";

import {
    groupStrokes
} from "../recognition/StrokeGrouper";

import {
    extractAllFeatures
} from "../recognition/FeatureExtractor";

import {
    serializeGarment
} from "../recognition/GarmentSerializer";

/*=========================================================
Process Complete Sketch
=========================================================*/

export function processSketch(
    strokes = [],
    canvas = {}
) {

    if (!Array.isArray(strokes)) {

        return {
            analyses: [],
            groups: [],
            garment: null,
            garmentBlueprint: null
        };

    }

    const canvasSize = {

        width:
            Number(canvas.width) ||
            1000,

        height:
            Number(canvas.height) ||
            1000

    };

    const analyses =
        analyzeDrawing(
            strokes
        );

    detectShapes(
        analyses
    );

    const groups =
        groupStrokes(
            analyses
        );

    /*
    Assign garment parts and garment types.
    */

    const garment =
        classifyGarment(
            groups
        );

    /*
    Run after classification so extracted.ai.garment
    receives the classified garment part.
    */

    extractAllFeatures(
        analyses,
        canvasSize
    );

    /*
    Convert all recognition results into stable JSON
    for the geometry and 3D systems.
    */

    const garmentBlueprint =
        serializeGarment({

            classification:
                garment,

            groups,

            analyses,

            canvas:
                canvasSize

        });

    return {

        analyses,

        groups,

        garment,

        garmentBlueprint

    };

}

/*=========================================================
Default Export
=========================================================*/

export default {
    processSketch
};