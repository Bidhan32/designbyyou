/*
=========================================================
FashionVision AI
Stroke Analyzer
Version 1.0
=========================================================
*/
import {
  strokeLength,
  polygonArea,
  polygonPerimeter,
  strokeCentroid,
  getBoundingBox,
  circularity,
  compactness,
  aspectRatio,
  orientation,
  isClosedShape,
} from "../utils/Geometry";

import { distance } from "../utils/VectorUtils";

import { round } from "../utils/MathUtils";

/*=========================================================
Point Conversion
=========================================================*/

export function convertPoints(points = []) {
  if (!Array.isArray(points)) return [];

  if (points.length === 0) return [];

  /*
    Already in object format:
    [{ x: 10, y: 20 }, ...]
    */

  if (typeof points[0] === "object" && points[0] !== null) {
    return points
      .filter(
        (point) =>
          point && Number.isFinite(point.x) && Number.isFinite(point.y),
      )
      .map((point) => ({
        x: point.x,
        y: point.y,
      }));
  }

  /*
    Flat Konva format:
    [x1, y1, x2, y2, ...]
    */

  const convertedPoints = [];

  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = Number(points[index]);

    const y = Number(points[index + 1]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    convertedPoints.push({
      x,
      y,
    });
  }

  return convertedPoints;
}

/*=========================================================
Prepare Points for Turning Analysis
=========================================================*/

function prepareTurningPoints(points = [], closed = false) {
  if (!Array.isArray(points)) return [];

  const validPoints = points
    .map((point) => {
      if (!point) return null;

      const x = Number(point.x);

      const y = Number(point.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return {
        x,
        y,
      };
    })
    .filter(Boolean);

  /*
    Remove the last point only when it is genuinely
    a duplicate or near-duplicate of the first point.
    */

  if (closed && validPoints.length > 3) {
    const first = validPoints[0];

    const last = validPoints[validPoints.length - 1];

    const box = getBoundingBox(validPoints);

    const diagonal = Math.hypot(box.width, box.height);

    const duplicateTolerance = Math.max(0.5, Math.min(diagonal * 0.005, 2));

    if (distance(first, last) <= duplicateTolerance) {
      validPoints.pop();
    }
  }

  return validPoints;
}

/*=========================================================
Turning Angle at One Point
=========================================================*/

function turningAngleAt(previous, current, next) {
  const firstVectorX = current.x - previous.x;

  const firstVectorY = current.y - previous.y;

  const secondVectorX = next.x - current.x;

  const secondVectorY = next.y - current.y;

  const firstMagnitude = Math.hypot(firstVectorX, firstVectorY);

  const secondMagnitude = Math.hypot(secondVectorX, secondVectorY);

  if (firstMagnitude === 0 || secondMagnitude === 0) {
    return null;
  }

  const dotProduct =
    firstVectorX * secondVectorX + firstVectorY * secondVectorY;

  let cosine = dotProduct / (firstMagnitude * secondMagnitude);

  cosine = Math.max(-1, Math.min(1, cosine));

  return Math.acos(cosine);
}

/*=========================================================
Average Turning Angle
=========================================================*/

export function averageTurningAngle(points = [], closed = false) {
  const workingPoints = prepareTurningPoints(points, closed);

  if (workingPoints.length < 3) return 0;

  const pointCount = workingPoints.length;

  const startIndex = closed ? 0 : 1;

  const endIndex = closed ? pointCount : pointCount - 1;

  let totalAngle = 0;
  let validAngleCount = 0;

  for (let index = startIndex; index < endIndex; index++) {
    const previous = workingPoints[(index - 1 + pointCount) % pointCount];

    const current = workingPoints[index];

    const next = workingPoints[(index + 1) % pointCount];

    const angle = turningAngleAt(previous, current, next);

    if (angle === null) continue;

    totalAngle += angle;
    validAngleCount++;
  }

  if (validAngleCount === 0) return 0;

  return totalAngle / validAngleCount;
}
/*=========================================================
Sharp Corner Count
=========================================================*/

export function countSharpCorners(
  points = [],
  closed = false,
  threshold = Math.PI * 0.4,
) {
  const workingPoints = prepareTurningPoints(points, closed);

  if (workingPoints.length < 3) return 0;

  const safeThreshold = Number.isFinite(threshold)
    ? Math.max(0, Math.min(Math.PI, threshold))
    : Math.PI * 0.4;

  const pointCount = workingPoints.length;

  const startIndex = closed ? 0 : 1;

  const endIndex = closed ? pointCount : pointCount - 1;

  let cornerCount = 0;

  for (let index = startIndex; index < endIndex; index++) {
    const previous = workingPoints[(index - 1 + pointCount) % pointCount];

    const current = workingPoints[index];

    const next = workingPoints[(index + 1) % pointCount];

    const angle = turningAngleAt(previous, current, next);

    if (angle !== null && angle > safeThreshold) {
      cornerCount++;
    }
  }

  return cornerCount;
}

/*=========================================================
Average Segment Length
=========================================================*/

/*=========================================================
Average Segment Length
=========================================================*/

export function averageSegmentLength(points = []) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  let totalLength = 0;

  for (let index = 1; index < points.length; index++) {
    totalLength += distance(points[index - 1], points[index]);
  }

  return totalLength / (points.length - 1);
}

/*=========================================================
Smoothness
=========================================================*/

export function calculateSmoothness(points = [], closed = false) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  if (points.length === 2) return 1;

  const angle = averageTurningAngle(points, closed);

  return Math.max(0, Math.min(1, 1 - angle / Math.PI));
}

/*=========================================================
Complexity
=========================================================*/

export function calculateComplexity(points = [], closed = false) {
  const workingPoints = prepareTurningPoints(points, closed);

  if (workingPoints.length < 2) return 0;

  const corners = countSharpCorners(workingPoints, closed);

  const box = getBoundingBox(workingPoints);

  const diagonal = Math.hypot(box.width, box.height);

  const pathLength = closed
    ? polygonPerimeter(workingPoints)
    : strokeLength(workingPoints);

  /*
    High corner count contributes to complexity,
    but ordinary triangles and rectangles remain
    below the scribble threshold.
    */

  const cornerScore = Math.min(1, corners / 12);

  /*
    Scribbles usually have a path much longer than
    their overall bounding-box diagonal.
    */

  const pathRatio = pathLength / Math.max(diagonal, 1);

  const pathScore = Math.max(0, Math.min(1, (pathRatio - 1) / 5));

  return Math.max(0, Math.min(1, cornerScore * 0.6 + pathScore * 0.4));
}

/*=========================================================
Confidence Score
=========================================================*/

export function calculateConfidence(features) {
  if (!features || !features.boundingBox) {
    return 0;
  }

  let score = 1;

  const pointCount = Number(features.pointCount) || 0;

  const length = Number(features.strokeLength) || 0;

  const complexity = Number(features.complexity) || 0;

  const smoothness = Number(features.smoothness) || 0;

  const width = Number(features.boundingBox.width) || 0;

  const height = Number(features.boundingBox.height) || 0;

  const diagonal = Math.hypot(width, height);

  if (pointCount < 3) score -= 0.35;

  if (length < 10) score -= 0.3;

  if (diagonal < 5) score -= 0.3;

  if (complexity > 0.9) score -= 0.25;

  if (smoothness < 0.2) score -= 0.2;

  return round(Math.max(0, Math.min(1, score)), 3);
}

/*=========================================================
Stroke Analysis
=========================================================*/

export function analyzeStroke(stroke) {
  /* Validate stroke */

  if (!stroke || !Array.isArray(stroke.points)) {
    return null;
  }

  /* Convert the points into { x, y } objects */

  const points = convertPoints(stroke.points);

  if (points.length < 2) return null;

  /*=====================================================
    Core Geometry
    =====================================================*/

  const length = strokeLength(points);

  const closed = isClosedShape(points);

  const area = closed ? polygonArea(points) : 0;

  const perimeter = closed ? polygonPerimeter(points) : length;

  /*
    Closed shapes use a polygon centroid.
    Open strokes use the average point position.
    */

  const centroid = strokeCentroid(points, closed);

  const boundingBox = getBoundingBox(points);

  /*=====================================================
    Shape Geometry Features
    =====================================================*/

  const circularityScore = closed ? circularity(points) : 0;

  const compactnessScore = closed ? compactness(points) : 0;

  const ratio = aspectRatio(points);

  const strokeOrientation = orientation(points);

  /*=====================================================
    Stroke Style Features
    =====================================================*/

  const turningAngle = averageTurningAngle(points, closed);

  const smoothness = calculateSmoothness(points, closed);

  const complexity = calculateComplexity(points, closed);

  const sharpCorners = countSharpCorners(points, closed);

  const averageSegment = averageSegmentLength(points);

  /*=====================================================
    Create Analysis Result
    =====================================================*/
  const parsedStrokeWidth = Number(stroke.width);
  const analysis = {
    analysisVersion: 1,

    id: stroke.id ?? null,

    recognition: {
      shape: "unknown",

      tags: [],

      garment: null,

      groupId: null,

      confidence: 0,
    },

    tool: stroke.tool ?? "unknown",

    color: stroke.color ?? null,

    width: Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 1,

    analyzedAt: Date.now(),

    geometry: {
      pointCount: points.length,

      points,

      strokeLength: round(length, 2),

      strokeType: stroke.strokeType || "freehand",

      area: round(area, 2),

      perimeter: round(perimeter, 2),

      centroid: {
        x: round(centroid.x, 2),

        y: round(centroid.y, 2),
      },

      boundingBox,

      isClosedShape: closed,
    },

    features: {
      circularity: round(circularityScore, 4),

      compactness: round(compactnessScore, 4),

      aspectRatio: round(ratio, 4),

      orientation: strokeOrientation,

      averageTurningAngle: round(turningAngle, 4),

      averageSegmentLength: round(averageSegment, 2),

      smoothness: round(smoothness, 4),

      complexity: round(complexity, 4),

      sharpCorners,
    },
  };

  /*=====================================================
    Recognition Confidence
    =====================================================*/

  analysis.recognition.confidence = calculateConfidence({
    pointCount: analysis.geometry.pointCount,

    strokeLength: analysis.geometry.strokeLength,

    boundingBox: analysis.geometry.boundingBox,

    complexity: analysis.features.complexity,

    smoothness: analysis.features.smoothness,
  });

  return analysis;
}

/*=========================================================
Analyze Multiple Strokes
=========================================================*/

export function analyzeDrawing(strokes = []) {
  if (!Array.isArray(strokes)) return [];

  return strokes.map(analyzeStroke).filter(Boolean);
}
export default {
  analyzeStroke,
  analyzeDrawing,

  convertPoints,

  averageTurningAngle,
  countSharpCorners,
  averageSegmentLength,

  calculateComplexity,
  calculateSmoothness,
  calculateConfidence,
};
