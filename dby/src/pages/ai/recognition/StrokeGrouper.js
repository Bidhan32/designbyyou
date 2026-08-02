/*
=========================================================
FashionVision AI
Stroke Grouper
Version 1.0
=========================================================
*/

import { round } from "../utils/MathUtils";

/*=========================================================
Group Types
=========================================================*/

export const GROUP_TYPES = {
    UNKNOWN: "unknown",
    PART: "part",
    GARMENT: "garment",
    DECORATION: "decoration",
    DETAIL: "detail"
};

/*=========================================================
Grouping Thresholds
=========================================================*/

export const THRESHOLDS = {
    MAX_CENTER_DISTANCE: 120,
    MAX_BOUNDING_GAP: 40,
    MIN_OVERLAP: 0.15,
    MIN_STROKE_CONFIDENCE: 0.20
};

/*=========================================================
Validate Analyzed Stroke
=========================================================*/

export function isValidAnalysis(analysis) {
    return Boolean(
        analysis &&
        analysis.geometry &&
        analysis.geometry.boundingBox &&
        analysis.geometry.centroid &&
        analysis.recognition
    );
}

/*=========================================================
Tag Helper
=========================================================*/

export function addTag(group, tag) {
    if (!group || !Array.isArray(group.tags))
        return group;

    if (typeof tag !== "string" || tag.length === 0)
        return group;

    if (!group.tags.includes(tag))
        group.tags.push(tag);

    return group;
}

/*=========================================================
Create Group Bounding Box
=========================================================*/

export function createBoundingBox(strokes = []) {
    if (!Array.isArray(strokes) || strokes.length === 0) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let validCount = 0;

    strokes.forEach(stroke => {
        if (!isValidAnalysis(stroke))
            return;

        const box = stroke.geometry.boundingBox;

        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);

        maxX = Math.max(
            maxX,
            box.x + box.width
        );

        maxY = Math.max(
            maxY,
            box.y + box.height
        );

        validCount++;
    });

    if (validCount === 0) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
    }

    return {
        x: round(minX, 2),
        y: round(minY, 2),
        width: round(maxX - minX, 2),
        height: round(maxY - minY, 2)
    };
}

/*=========================================================
Calculate Group Center
=========================================================*/

export function calculateGroupCenter(strokes = []) {
    if (!Array.isArray(strokes) || strokes.length === 0) {
        return {
            x: 0,
            y: 0
        };
    }

    let totalX = 0;
    let totalY = 0;
    let validCount = 0;

    strokes.forEach(stroke => {
        if (!isValidAnalysis(stroke))
            return;

        totalX += stroke.geometry.centroid.x;
        totalY += stroke.geometry.centroid.y;

        validCount++;
    });

    if (validCount === 0) {
        return {
            x: 0,
            y: 0
        };
    }

    return {
        x: round(totalX / validCount, 2),
        y: round(totalY / validCount, 2)
    };
}

/*=========================================================
Distance Between Stroke Centers
=========================================================*/

export function centerDistance(strokeA, strokeB) {
    if (
        !isValidAnalysis(strokeA) ||
        !isValidAnalysis(strokeB)
    ) {
        return Infinity;
    }

    const centerA = strokeA.geometry.centroid;
    const centerB = strokeB.geometry.centroid;

    return round(
        Math.hypot(
            centerA.x - centerB.x,
            centerA.y - centerB.y
        ),
        2
    );
}

/*=========================================================
Bounding Box Overlap Ratio
=========================================================*/

export function overlapRatio(boxA, boxB) {
    if (!boxA || !boxB)
        return 0;

    const overlapWidth = Math.max(
        0,
        Math.min(
            boxA.x + boxA.width,
            boxB.x + boxB.width
        ) -
        Math.max(
            boxA.x,
            boxB.x
        )
    );

    const overlapHeight = Math.max(
        0,
        Math.min(
            boxA.y + boxA.height,
            boxB.y + boxB.height
        ) -
        Math.max(
            boxA.y,
            boxB.y
        )
    );

    const overlapArea =
        overlapWidth * overlapHeight;

    if (overlapArea <= 0)
        return 0;

    const areaA =
        Math.max(0, boxA.width) *
        Math.max(0, boxA.height);

    const areaB =
        Math.max(0, boxB.width) *
        Math.max(0, boxB.height);

    const smallestArea = Math.min(
        areaA,
        areaB
    );

    if (smallestArea <= 0)
        return 0;

    return round(
        overlapArea / smallestArea,
        4
    );
}

/*=========================================================
Bounding Box Gap
=========================================================*/

export function boundingGap(boxA, boxB) {
    if (!boxA || !boxB)
        return Infinity;

    const horizontalGap = Math.max(
        boxA.x - (boxB.x + boxB.width),
        boxB.x - (boxA.x + boxA.width),
        0
    );

    const verticalGap = Math.max(
        boxA.y - (boxB.y + boxB.height),
        boxB.y - (boxA.y + boxA.height),
        0
    );

    return round(
        Math.hypot(
            horizontalGap,
            verticalGap
        ),
        2
    );
}

/*=========================================================
Neighbor Test
=========================================================*/

export function areNeighbors(strokeA, strokeB) {
    if (
        !isValidAnalysis(strokeA) ||
        !isValidAnalysis(strokeB)
    ) {
        return false;
    }

    if (strokeA === strokeB)
        return false;

    const boxA =
        strokeA.geometry.boundingBox;

    const boxB =
        strokeB.geometry.boundingBox;

    const distance =
        centerDistance(strokeA, strokeB);

    const overlap =
        overlapRatio(boxA, boxB);

    const gap =
        boundingGap(boxA, boxB);

    const closeCenters =
        distance <=
        THRESHOLDS.MAX_CENTER_DISTANCE;

    const overlapping =
        overlap >=
        THRESHOLDS.MIN_OVERLAP;

    const closeBounds =
        gap <=
        THRESHOLDS.MAX_BOUNDING_GAP;

    return (
        closeCenters ||
        overlapping ||
        closeBounds
    );
}

/*=========================================================
Find Connected Strokes
=========================================================*/

export function findConnectedStrokes(
    index,
    analyses = []
) {
    if (
        !Array.isArray(analyses) ||
        index < 0 ||
        index >= analyses.length
    ) {
        return [];
    }

    const current = analyses[index];

    if (!isValidAnalysis(current))
        return [];

    const connectedIndexes = [];

    for (
        let candidateIndex = 0;
        candidateIndex < analyses.length;
        candidateIndex++
    ) {
        if (candidateIndex === index)
            continue;

        const candidate =
            analyses[candidateIndex];

        if (
            areNeighbors(
                current,
                candidate
            )
        ) {
            connectedIndexes.push(
                candidateIndex
            );
        }
    }

    return connectedIndexes;
}

/*=========================================================
Create Shape Summary
=========================================================*/

export function createShapeSummary(strokes = []) {
    const summary = {};

    if (!Array.isArray(strokes))
        return summary;

    strokes.forEach(stroke => {
        const shape =
            stroke?.recognition?.shape ||
            "unknown";

        summary[shape] =
            (summary[shape] || 0) + 1;
    });

    return summary;
}

/*=========================================================
Calculate Group Confidence
=========================================================*/

export function calculateGroupConfidence(strokes = []) {
    if (!Array.isArray(strokes) || strokes.length === 0)
        return 0;

    let totalConfidence = 0;
    let validCount = 0;

    strokes.forEach(stroke => {
        const confidence =
            stroke?.recognition?.confidence;

        if (!Number.isFinite(confidence))
            return;

        totalConfidence += confidence;
        validCount++;
    });

    if (validCount === 0)
        return 0;

    return round(
        totalConfidence / validCount,
        3
    );
}

/*=========================================================
Create Stroke Groups
=========================================================*/

export function createGroups(analyses = []) {
    if (!Array.isArray(analyses))
        return [];

    const validAnalyses =
        analyses.filter(isValidAnalysis);

    if (validAnalyses.length === 0)
        return [];

    const visited = new Set();
    const groups = [];

    let nextGroupId = 1;

    for (
        let startIndex = 0;
        startIndex < validAnalyses.length;
        startIndex++
    ) {
        if (visited.has(startIndex))
            continue;

        const queue = [startIndex];
        let queuePosition = 0;

        const members = [];

        visited.add(startIndex);

        while (
            queuePosition < queue.length
        ) {
            const currentIndex =
                queue[queuePosition];

            queuePosition++;

            const currentStroke =
                validAnalyses[currentIndex];

            members.push(currentStroke);

            const connectedIndexes =
                findConnectedStrokes(
                    currentIndex,
                    validAnalyses
                );

            connectedIndexes.forEach(
                connectedIndex => {
                    if (
                        visited.has(
                            connectedIndex
                        )
                    ) {
                        return;
                    }

                    visited.add(
                        connectedIndex
                    );

                    queue.push(
                        connectedIndex
                    );
                }
            );
        }

        const groupId =
            `group-${nextGroupId++}`;

        const group = {
            id: groupId,

            type: GROUP_TYPES.UNKNOWN,

            strokes: members,

            strokeIds: members.map(
                stroke => stroke.id
            ),

            strokeCount: members.length,

            bounds:
                createBoundingBox(members),

            center:
                calculateGroupCenter(members),

            geometry: null,

            recognition: {
                garment: null,
                garmentType: null,
                confidence:
                    calculateGroupConfidence(
                        members
                    ),
                tags: []
            },

            shapeSummary:
                createShapeSummary(members),

            tags: [],

            createdAt: Date.now()
        };

        if (members.length === 1) {
            addTag(group, "isolated");
        } else {
            addTag(group, "connected");
            addTag(group, "multi-stroke");
        }

        members.forEach(stroke => {
            stroke.recognition.groupId =
                groupId;
        });

        groups.push(group);
    }

    return groups;
}

/*=========================================================
Calculate Group Statistics
=========================================================*/

export function calculateGroupStatistics(group) {
    if (
        !group ||
        !Array.isArray(group.strokes) ||
        group.strokes.length === 0
    ) {
        return group;
    }

    const validStrokes =
        group.strokes.filter(
            isValidAnalysis
        );

    if (validStrokes.length === 0)
        return group;

    const boundingBox =
        createBoundingBox(validStrokes);

    const centroid =
        calculateGroupCenter(validStrokes);

    let totalStrokeLength = 0;
    let totalArea = 0;
    let totalPerimeter = 0;
    let totalPointCount = 0;
    let closedShapeCount = 0;
    let openShapeCount = 0;

    validStrokes.forEach(stroke => {
        totalStrokeLength +=
            Number(
                stroke.geometry.strokeLength
            ) || 0;

        totalArea +=
            Number(
                stroke.geometry.area
            ) || 0;

        totalPerimeter +=
            Number(
                stroke.geometry.perimeter
            ) || 0;

        totalPointCount +=
            Number(
                stroke.geometry.pointCount
            ) || 0;

        if (
            stroke.geometry.isClosedShape
        ) {
            closedShapeCount++;
        } else {
            openShapeCount++;
        }
    });

    const width =
        boundingBox.width;

    const height =
        boundingBox.height;

    const boundingArea =
        width * height;

    group.bounds =
        boundingBox;

    group.center =
        centroid;

    group.strokeCount =
        validStrokes.length;

    group.shapeSummary =
        createShapeSummary(validStrokes);

    group.geometry = {
        boundingBox,

        centroid,

        width:
            round(width, 2),

        height:
            round(height, 2),

        diagonal:
            round(
                Math.hypot(
                    width,
                    height
                ),
                2
            ),

        boundingArea:
            round(
                boundingArea,
                2
            ),

        totalStrokeLength:
            round(
                totalStrokeLength,
                2
            ),

        totalArea:
            round(
                totalArea,
                2
            ),

        totalPerimeter:
            round(
                totalPerimeter,
                2
            ),

        pointCount:
            totalPointCount,

        aspectRatio:
            round(
                width /
                Math.max(height, 1),
                4
            ),

        closedShapeCount,

        openShapeCount,

        closedRatio:
            round(
                closedShapeCount /
                Math.max(
                    validStrokes.length,
                    1
                ),
                4
            )
    };

    group.recognition.confidence =
        calculateGroupConfidence(
            validStrokes
        );

    return group;
}

/*=========================================================
Main Stroke Grouping Pipeline
=========================================================*/

export function groupStrokes(analyses = []) {
    if (!Array.isArray(analyses))
        return [];

    const groups =
        createGroups(analyses);

    return groups.map(group =>
        calculateGroupStatistics(group)
    );
}

/*=========================================================
Default Export
=========================================================*/

export default {
    GROUP_TYPES,
    THRESHOLDS,

    isValidAnalysis,
    addTag,

    createBoundingBox,
    calculateGroupCenter,

    centerDistance,
    overlapRatio,
    boundingGap,
    areNeighbors,

    findConnectedStrokes,

    createShapeSummary,
    calculateGroupConfidence,

    createGroups,
    calculateGroupStatistics,
    groupStrokes
};