import React, {
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";

import {
    Stage,
    Layer,
    Line
} from "react-konva";

import simplify from "simplify-js";

import {
    useSketchStore
} from "../useSketchStore";

/*=========================================================
Canvas Configuration
=========================================================*/

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const DEFAULT_COLOR = "#000000";
const DEFAULT_STROKE_WIDTH = 3;

/*
Higher values remove more pointer noise.
Do not increase too much or garment details may disappear.
*/

const SIMPLIFY_TOLERANCE = 3;

/*
Ignore extremely small mouse movements.
*/

const MIN_POINT_DISTANCE = 2.5;

/*
Turn this off after recognition testing is complete.
*/

const DEBUG_RECOGNITION = true;

/*=========================================================
Generate Unique Stroke ID
=========================================================*/

function generateStrokeId() {

    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return (
        `stroke-${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );

}

/*=========================================================
Convert Flat Konva Points to Objects
=========================================================*/

function convertFlatPointsToObjects(
    points = []
) {

    if (!Array.isArray(points))
        return [];

    const converted = [];

    for (
        let index = 0;
        index + 1 < points.length;
        index += 2
    ) {

        const x =
            Number(points[index]);

        const y =
            Number(
                points[index + 1]
            );

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            continue;
        }

        converted.push({
            x,
            y
        });

    }

    return converted;

}

/*=========================================================
Convert Point Objects to Flat Konva Points
=========================================================*/

function flattenPointObjects(
    points = []
) {

    if (!Array.isArray(points))
        return [];

    return points.flatMap(
        point => [
            point.x,
            point.y
        ]
    );

}

/*=========================================================
Drawing Canvas
=========================================================*/

export const DrawingCanvas = ({
    stageRef = null
}) => {

    /*=====================================================
    Zustand State
    =====================================================*/

    const lines =
        useSketchStore(
            state => state.lines
        );

    const analyses =
        useSketchStore(
            state => state.analyses
        );

    const groups =
        useSketchStore(
            state => state.groups
        );

    const garment =
        useSketchStore(
            state => state.garment
        );

    const garmentBlueprint =
        useSketchStore(
            state => state.garmentBlueprint
        );

    const addLine =
        useSketchStore(
            state => state.addLine
        );

    /*=====================================================
    Local Drawing State
    =====================================================*/

    const [
        currentLine,
        setCurrentLine
    ] = useState(null);

    /*
    React state updates asynchronously.

    This ref always stores the newest active line so that
    mouse-up receives the complete stroke.
    */

    const currentLineRef =
        useRef(null);

    const isDrawing =
        useRef(false);

    /*=====================================================
    Recognition Debugging
    =====================================================*/

    useEffect(() => {

        if (!DEBUG_RECOGNITION)
            return;

        console.groupCollapsed(
            `FashionVision Recognition — ${lines.length} stroke(s)`
        );

        console.log(
            "Completed lines:",
            lines
        );

        console.log(
            "Recognition analyses:",
            analyses
        );

        console.log(
            "Stroke groups:",
            groups
        );

        console.log(
            "Detected garment type:",
            garment?.garmentType ??
            "unknown"
        );

        console.log(
            "Garment confidence:",
            garment?.confidence ??
            0
        );

        console.log(
            "Garment part counts:",
            garment?.partCounts ??
            {}
        );

        console.log(
            "Garment classification:",
            garment
        );

        console.log(
            "Serialized garment blueprint:",
            garmentBlueprint
        );

        console.log(
            "Construction hints:",
            garmentBlueprint
                ?.constructionHints ??
            null
        );

        console.table(
            analyses.map(
                analysis => ({

                    id:
                        analysis.id,

                    shape:
                        analysis
                            .recognition
                            ?.shape,

                    garmentPart:
                        analysis
                            .recognition
                            ?.garment,

                    shapeConfidence:
                        analysis
                            .recognition
                            ?.confidence,

                    garmentConfidence:
                        analysis
                            .recognition
                            ?.garmentConfidence,

                    complexity:
                        analysis
                            .features
                            ?.complexity,

                    smoothness:
                        analysis
                            .features
                            ?.smoothness,

                    sharpCorners:
                        analysis
                            .features
                            ?.sharpCorners,

                    closed:
                        analysis
                            .geometry
                            ?.isClosedShape,

                    groupId:
                        analysis
                            .recognition
                            ?.groupId,

                    position:
                        `${
                            analysis
                                .extracted
                                ?.position
                                ?.horizontal ??
                            "unknown"
                        } / ${
                            analysis
                                .extracted
                                ?.position
                                ?.vertical ??
                            "unknown"
                        }`,

                    style:
                        analysis
                            .extracted
                            ?.style
                            ?.style ??
                        "unknown"

                })
            )
        );

        const assignments =
            garment
                ?.groups
                ?.flatMap(
                    group =>
                        (
                            group.assignments ||
                            []
                        ).map(
                            assignment => ({

                                groupId:
                                    group.groupId,

                                strokeId:
                                    assignment.strokeId,

                                garmentPart:
                                    assignment.part,

                                confidence:
                                    assignment.confidence,

                                detectedShape:
                                    assignment
                                        .metrics
                                        ?.shape,

                                centerX:
                                    assignment
                                        .metrics
                                        ?.centerX,

                                centerY:
                                    assignment
                                        .metrics
                                        ?.centerY,

                                relativeWidth:
                                    assignment
                                        .metrics
                                        ?.relativeWidth,

                                relativeHeight:
                                    assignment
                                        .metrics
                                        ?.relativeHeight

                            })
                        )
                ) || [];

        if (assignments.length > 0) {

            console.table(
                assignments
            );

        }

        console.groupEnd();

    }, [
        lines,
        analyses,
        groups,
        garment,
        garmentBlueprint
    ]);

    /*=====================================================
    Update Current Line
    =====================================================*/

    const updateCurrentLine =
        useCallback(line => {

            currentLineRef.current =
                line;

            setCurrentLine(line);

        }, []);

    /*=====================================================
    Get Pointer Position
    =====================================================*/

    const getPointerPosition =
        useCallback(event => {

            const stage =
                event.target?.getStage?.();

            if (!stage)
                return null;

            return (
                stage.getPointerPosition() ||
                null
            );

        }, []);

    /*=====================================================
    Begin Drawing
    =====================================================*/

    const handleDrawingStart =
        useCallback(event => {

            /*
            Prevent right-click from beginning a stroke.
            Touch events may not have a button value.
            */

            if (
                Number.isFinite(
                    event.evt?.button
                ) &&
                event.evt.button !== 0
            ) {
                return;
            }

            const position =
                getPointerPosition(event);

            if (!position)
                return;

            isDrawing.current =
                true;

            const newLine = {

                id:
                    generateStrokeId(),

                points: [
                    position.x,
                    position.y
                ],

                color:
                    DEFAULT_COLOR,

                /*
                Used by React Konva.
                */

                strokeWidth:
                    DEFAULT_STROKE_WIDTH,

                /*
                Used by StrokeAnalyzer.
                */

                width:
                    DEFAULT_STROKE_WIDTH,

                tool:
                    "pen",

                strokeType:
                    "freehand"

            };

            updateCurrentLine(
                newLine
            );

        }, [
            getPointerPosition,
            updateCurrentLine
        ]);

    /*=====================================================
    Continue Drawing
    =====================================================*/

    const handleDrawingMove =
        useCallback(event => {

            if (!isDrawing.current)
                return;

            const previousLine =
                currentLineRef.current;

            if (
                !previousLine ||
                !Array.isArray(
                    previousLine.points
                )
            ) {
                return;
            }

            const position =
                getPointerPosition(event);

            if (!position)
                return;

            const previousPoints =
                previousLine.points;

            if (
                previousPoints.length < 2
            ) {
                return;
            }

            const previousX =
                previousPoints[
                    previousPoints.length - 2
                ];

            const previousY =
                previousPoints[
                    previousPoints.length - 1
                ];

            const movementDistance =
                Math.hypot(
                    position.x - previousX,
                    position.y - previousY
                );

            /*
            Ignore tiny mouse movements that create false
            sharp corners and excessive complexity.
            */

            if (
                movementDistance <
                MIN_POINT_DISTANCE
            ) {
                return;
            }

            const updatedLine = {

                ...previousLine,

                points: [
                    ...previousPoints,
                    position.x,
                    position.y
                ]

            };

            updateCurrentLine(
                updatedLine
            );

        }, [
            getPointerPosition,
            updateCurrentLine
        ]);

    /*=====================================================
    Complete Drawing
    =====================================================*/

    const handleDrawingEnd =
        useCallback(() => {

            if (!isDrawing.current)
                return;

            isDrawing.current =
                false;

            const completedLine =
                currentLineRef.current;

            /*
            Remove the temporary active stroke immediately.
            */

            updateCurrentLine(null);

            if (
                !completedLine ||
                !Array.isArray(
                    completedLine.points
                ) ||
                completedLine.points.length < 4
            ) {
                return;
            }

            const pointObjects =
                convertFlatPointsToObjects(
                    completedLine.points
                );

            if (pointObjects.length < 2)
                return;

            /*
            false enables simplify-js radial-distance
            preprocessing before Douglas-Peucker.
            This usually removes pointer jitter better than
            highQuality=true.
            */

            const simplifiedPoints =
                simplify(
                    pointObjects,
                    SIMPLIFY_TOLERANCE,
                    false
                );

            if (
                simplifiedPoints.length < 2
            ) {
                return;
            }

            const finalPoints =
                flattenPointObjects(
                    simplifiedPoints
                );

            if (finalPoints.length < 4)
                return;

            const finalStrokeWidth =
                Number(
                    completedLine.strokeWidth
                ) ||
                DEFAULT_STROKE_WIDTH;

            const finalLine = {

                ...completedLine,

                points:
                    finalPoints,

                /*
                Konva rendering property.
                */

                strokeWidth:
                    finalStrokeWidth,

                /*
                StrokeAnalyzer property.
                */

                width:
                    finalStrokeWidth,

                tool:
                    completedLine.tool ||
                    "pen",

                strokeType:
                    completedLine.strokeType ||
                    "freehand"

            };

            /*
            This action runs:

            StrokeAnalyzer
            ShapeDetector
            StrokeGrouper
            GarmentClassifier
            FeatureExtractor
            GarmentSerializer
            */

            addLine(
                finalLine,
                {
                    width:
                        CANVAS_WIDTH,

                    height:
                        CANVAS_HEIGHT
                }
            );

        }, [
            addLine,
            updateCurrentLine
        ]);

    /*=====================================================
    Prevent Browser Context Menu
    =====================================================*/

    const handleContextMenu =
        useCallback(event => {

            event.evt?.preventDefault();

        }, []);

    /*=====================================================
    Render
    =====================================================*/

    return (
        <div
            className="
                h-[600px]
                w-[800px]
                max-w-full
                touch-none
                overflow-auto
                rounded-lg
                border
                border-gray-300
                bg-white
                cursor-crosshair
            "
        >

            <Stage
                ref={stageRef}

                width={
                    CANVAS_WIDTH
                }

                height={
                    CANVAS_HEIGHT
                }

                onMouseDown={
                    handleDrawingStart
                }

                onMouseMove={
                    handleDrawingMove
                }

                onMouseUp={
                    handleDrawingEnd
                }

                onMouseLeave={
                    handleDrawingEnd
                }

                onTouchStart={
                    handleDrawingStart
                }

                onTouchMove={
                    handleDrawingMove
                }

                onTouchEnd={
                    handleDrawingEnd
                }

                onContextMenu={
                    handleContextMenu
                }
            >

                <Layer>

                    {/* Completed strokes */}

                    {lines.map(
                        line => (

                            <Line
                                key={
                                    line.id
                                }

                                points={
                                    Array.isArray(
                                        line.points
                                    )
                                        ? line.points
                                        : []
                                }

                                stroke={
                                    line.color ||
                                    DEFAULT_COLOR
                                }

                                strokeWidth={
                                    Number(
                                        line.strokeWidth ??
                                        line.width
                                    ) ||
                                    DEFAULT_STROKE_WIDTH
                                }

                                tension={0.5}

                                lineCap="round"

                                lineJoin="round"

                                perfectDrawEnabled={
                                    false
                                }

                                listening={
                                    false
                                }
                            />

                        )
                    )}

                    {/* Active stroke */}

                    {currentLine && (

                        <Line
                            points={
                                currentLine.points
                            }

                            stroke={
                                currentLine.color ||
                                DEFAULT_COLOR
                            }

                            strokeWidth={
                                Number(
                                    currentLine
                                        .strokeWidth
                                ) ||
                                DEFAULT_STROKE_WIDTH
                            }

                            tension={0.5}

                            lineCap="round"

                            lineJoin="round"

                            perfectDrawEnabled={
                                false
                            }

                            listening={
                                false
                            }
                        />

                    )}

                </Layer>

            </Stage>

        </div>
    );

};

export default DrawingCanvas;