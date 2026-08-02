/*
=========================================================
FashionVision AI
Geometry Engine
Part 1 - Core Geometry
=========================================================
*/

import {
    subtract,
    dot,
    distance,
    average,
    normalize
} from "./VectorUtils";

/* -------------------------------------------------------
   Bounding Box
------------------------------------------------------- */

export function getBoundingBox(points = []) {

    if (!Array.isArray(points) || points.length === 0) {

        return {
            x: 0,
            y: 0,

            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,

            width: 0,
            height: 0,

            center: {
                x: 0,
                y: 0
            }
        };

    }

    let minX = Infinity;
    let minY = Infinity;

    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of points) {

        if (!point)
            continue;

        if (!Number.isFinite(point.x))
            continue;

        if (!Number.isFinite(point.y))
            continue;

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);

        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

    }

    if (minX === Infinity) {

        return {
            x: 0,
            y: 0,

            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,

            width: 0,
            height: 0,

            center: {
                x: 0,
                y: 0
            }
        };

    }

    const width = maxX - minX;
    const height = maxY - minY;

    return {
        // Compatibility aliases
        x: minX,
        y: minY,

        minX,
        minY,
        maxX,
        maxY,

        width,
        height,

        center: {
            x: minX + width / 2,
            y: minY + height / 2
        }
    };

}

/* -------------------------------------------------------
   Normalize Bounding Box
------------------------------------------------------- */

export function normalizeBoundingBox(box) {

    if (!box) {

        return {
            x: 0,
            y: 0,

            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,

            width: 0,
            height: 0,

            center: {
                x: 0,
                y: 0
            }
        };

    }

    const minX =
        Number.isFinite(box.minX)
            ? box.minX
            : Number.isFinite(box.x)
                ? box.x
                : 0;

    const minY =
        Number.isFinite(box.minY)
            ? box.minY
            : Number.isFinite(box.y)
                ? box.y
                : 0;

    const width =
        Number.isFinite(box.width)
            ? Math.max(0, box.width)
            : 0;

    const height =
        Number.isFinite(box.height)
            ? Math.max(0, box.height)
            : 0;

    const maxX =
        Number.isFinite(box.maxX)
            ? box.maxX
            : minX + width;

    const maxY =
        Number.isFinite(box.maxY)
            ? box.maxY
            : minY + height;

    const finalWidth =
        maxX - minX;

    const finalHeight =
        maxY - minY;

    return {
        x: minX,
        y: minY,

        minX,
        minY,
        maxX,
        maxY,

        width: finalWidth,
        height: finalHeight,

        center: {
            x: minX + finalWidth / 2,
            y: minY + finalHeight / 2
        }
    };

}




/* -------------------------------------------------------
   Merge Bounding Boxes
------------------------------------------------------- */

export function mergeBoundingBoxes(a, b) {

    if (!a && !b)
        return normalizeBoundingBox(null);

    if (!a)
        return normalizeBoundingBox(b);

    if (!b)
        return normalizeBoundingBox(a);

    const boxA =
        normalizeBoundingBox(a);

    const boxB =
        normalizeBoundingBox(b);

    const minX =
        Math.min(
            boxA.minX,
            boxB.minX
        );

    const minY =
        Math.min(
            boxA.minY,
            boxB.minY
        );

    const maxX =
        Math.max(
            boxA.maxX,
            boxB.maxX
        );

    const maxY =
        Math.max(
            boxA.maxY,
            boxB.maxY
        );

    return normalizeBoundingBox({
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    });

}

/* -------------------------------------------------------
   Bounding Box Intersection
------------------------------------------------------- */

export function boundingBoxesIntersect(a, b) {

    if (!a || !b)
        return false;

    const boxA =
        normalizeBoundingBox(a);

    const boxB =
        normalizeBoundingBox(b);

    return !(
        boxA.maxX < boxB.minX ||
        boxA.minX > boxB.maxX ||
        boxA.maxY < boxB.minY ||
        boxA.minY > boxB.maxY
    );

}

/* -------------------------------------------------------
   Bounding Box Area
------------------------------------------------------- */

export function boundingBoxArea(box) {

    if (!box)
        return 0;

    const normalized =
        normalizeBoundingBox(box);

    return (
        normalized.width *
        normalized.height
    );

}

/* -------------------------------------------------------
   Stroke Length
------------------------------------------------------- */

export function strokeLength(points = []) {

    if (!Array.isArray(points) || points.length < 2)
        return 0;

    let total = 0;

    for (let i = 1; i < points.length; i++) {

        total += distance(
            points[i - 1],
            points[i]
        );

    }

    return total;

}

/* -------------------------------------------------------
   Polygon Perimeter
------------------------------------------------------- */

export function polygonPerimeter(points = []) {

    if (!Array.isArray(points) || points.length < 3)
        return 0;

    return (
        strokeLength(points) +
        distance(
            points[0],
            points[points.length - 1]
        )
    );

}

/* -------------------------------------------------------
   Polygon Area
------------------------------------------------------- */

export function polygonArea(points = []) {

    if (!Array.isArray(points) || points.length < 3)
        return 0;

    let area = 0;

    for (let i = 0; i < points.length; i++) {

        const current =
            points[i];

        const next =
            points[
                (i + 1) %
                points.length
            ];

        area +=
            current.x * next.y -
            current.y * next.x;

    }

    return Math.abs(area / 2);

}

/* -------------------------------------------------------
   Stroke Centroid
------------------------------------------------------- */

export function strokeCentroid(
    points = [],
    closed = false
) {

    if (!Array.isArray(points) || points.length === 0) {

        return {
            x: 0,
            y: 0
        };

    }

    if (closed && points.length >= 3) {

        return polygonCentroid(points);

    }

    return average(points);

}

/* -------------------------------------------------------
   Polygon Centroid
------------------------------------------------------- */


export function polygonCentroid(points = []) {

    if (!Array.isArray(points) || points.length === 0) {

        return {
            x: 0,
            y: 0
        };

    }

    if (points.length < 3)
        return average(points);

    let signedArea = 0;

    let centroidX = 0;
    let centroidY = 0;

    for (let i = 0; i < points.length; i++) {

        const current = points[i];

        const next =
            points[(i + 1) % points.length];

        const cross =
            current.x * next.y -
            next.x * current.y;

        signedArea += cross;

        centroidX +=
            (current.x + next.x) * cross;

        centroidY +=
            (current.y + next.y) * cross;

    }

    signedArea *= 0.5;

    if (Math.abs(signedArea) < 0.000001)
        return average(points);

    centroidX /=
        6 * signedArea;

    centroidY /=
        6 * signedArea;

    return {
        x: centroidX,
        y: centroidY
    };

}

/* -------------------------------------------------------
   Width
------------------------------------------------------- */

export function shapeWidth(points) {

    return getBoundingBox(points).width;

}

/* -------------------------------------------------------
   Height
------------------------------------------------------- */

export function shapeHeight(points) {

    return getBoundingBox(points).height;

}

/* -------------------------------------------------------
   Aspect Ratio
------------------------------------------------------- */

export function aspectRatio(points) {

    const box = getBoundingBox(points);

    if (box.height === 0) return 0;

    return box.width / box.height;

}

/* -------------------------------------------------------
   Shape Density
------------------------------------------------------- */

export function shapeDensity(points) {

    const area = polygonArea(points);

    if (area === 0) return 0;

    return strokeLength(points) / area;

}

/* -------------------------------------------------------
   Circularity
------------------------------------------------------- */

export function circularity(points) {

    const area = polygonArea(points);

    const perimeter = polygonPerimeter(points);

    if (perimeter === 0) return 0;

    return (4 * Math.PI * area) / (perimeter * perimeter);

}

/* -------------------------------------------------------
   Compactness
------------------------------------------------------- */

export function compactness(points) {

    const area = polygonArea(points);

    const box = getBoundingBox(points);

    const boxArea = box.width * box.height;

    if (boxArea === 0) return 0;

    return area / boxArea;

}

/* -------------------------------------------------------
   Shape Orientation
------------------------------------------------------- */

export function orientation(points) {

    const box = getBoundingBox(points);

    if (box.height > box.width)

        return "vertical";

    if (box.width > box.height)

        return "horizontal";

    return "square";

}

/* -------------------------------------------------------
   Closed Shape Detection
------------------------------------------------------- */


export function isClosedShape(
    points = [],
    threshold = null
) {

    if (!Array.isArray(points) || points.length < 3)
        return false;

    const first =
        points[0];

    const last =
        points[points.length - 1];

    const box =
        getBoundingBox(points);

    const diagonal =
        Math.hypot(
            box.width,
            box.height
        );

    const adaptiveThreshold =
        threshold ??
        Math.max(
            6,
            Math.min(
                diagonal * 0.08,
                20
            )
        );

    return (
        distance(first, last) <=
        adaptiveThreshold
    );

}

/* -------------------------------------------------------
   Diagonal Length
------------------------------------------------------- */

export function boundingDiagonal(points) {

    const box = getBoundingBox(points);

    return Math.hypot(

        box.width,

        box.height

    );
}
   /* -------------------------------------------------------
   Line Length
------------------------------------------------------- */

export function lineLength(a, b) {

    if (!a || !b)
        return 0;

    return distance(a, b);

}

/* -------------------------------------------------------
   Shape Balance Score
------------------------------------------------------- */

export function shapeBalanceScore(points = []) {

    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return 1;
    }

    const closed =
        isClosedShape(points);

    const centroid =
        strokeCentroid(
            points,
            closed
        );

    const box =
        getBoundingBox(points);

    const distanceFromCenter =
        distance(
            centroid,
            box.center
        );

    const maxPossibleDistance =
        Math.hypot(
            box.width,
            box.height
        ) / 2;

    if (maxPossibleDistance === 0)
        return 1;

    const score =
        1 -
        distanceFromCenter /
        maxPossibleDistance;

    return Math.max(
        0,
        Math.min(1, score)
    );

}

/* -------------------------------------------------------
   Shape Symmetry Compatibility Alias
------------------------------------------------------- */

export function shapeSymmetryScore(points = []) {

    return shapeBalanceScore(points);

}


/* -------------------------------------------------------
   Mid Point
------------------------------------------------------- */

export function lineMidpoint(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
    };
}

/* -------------------------------------------------------
   Line Angle (Radians)
------------------------------------------------------- */

export function lineAngle(a, b) {
    return Math.atan2(
        b.y - a.y,
        b.x - a.x
    );
}

/* -------------------------------------------------------
   Line Angle (Degrees)
------------------------------------------------------- */

export function lineAngleDegrees(a, b) {
    return lineAngle(a, b) * 180 / Math.PI;
}

/* -------------------------------------------------------
   Tangent Vector
------------------------------------------------------- */

export function tangent(a, b) {

    return normalize(

        subtract(b, a)

    );

}

/* -------------------------------------------------------
   Normal Vector
------------------------------------------------------- */

export function normal(a, b) {

    const t = tangent(a, b);

    return {

        x: -t.y,

        y: t.x

    };

}

/* -------------------------------------------------------
   Segment Direction
------------------------------------------------------- */

export function lineDirection(a, b) {
    return subtract(b, a);
}

/* -------------------------------------------------------
   Projection Parameter
------------------------------------------------------- */

export function projectionParameter(point, start, end) {

    const ab = subtract(end, start);

    const ap = subtract(point, start);

    const denominator = dot(ab, ab);

    if (denominator === 0)
        return 0;

    return dot(ap, ab) / denominator;

}

/* -------------------------------------------------------
   Closest Point On Segment
------------------------------------------------------- */

export function closestPointOnSegment(point, start, end) {

    let t = projectionParameter(point, start, end);

    t = Math.max(0, Math.min(1, t));

    return {

        x: start.x + (end.x - start.x) * t,

        y: start.y + (end.y - start.y) * t

    };

}

/* -------------------------------------------------------
   Distance To Segment
------------------------------------------------------- */

export function distanceToSegment(point, start, end) {

    const p = closestPointOnSegment(

        point,

        start,

        end

    );

    return distance(point, p);

}

/* -------------------------------------------------------
   Line Intersection
------------------------------------------------------- */

export function lineIntersection(a1, a2, b1, b2) {

    const denominator =

        (a1.x - a2.x) * (b1.y - b2.y) -

        (a1.y - a2.y) * (b1.x - b2.x);

    if (Math.abs(denominator) < 0.000001)
        return null;

    const x =

        (

            (a1.x * a2.y - a1.y * a2.x) *

            (b1.x - b2.x)

            -

            (a1.x - a2.x) *

            (b1.x * b2.y - b1.y * b2.x)

        ) / denominator;

    const y =

        (

            (a1.x * a2.y - a1.y * a2.x) *

            (b1.y - b2.y)

            -

            (a1.y - a2.y) *

            (b1.x * b2.y - b1.y * b2.x)

        ) / denominator;

    return { x, y };

}

/* -------------------------------------------------------
   Segment Intersection
------------------------------------------------------- */



export function segmentsIntersect(
    a1,
    a2,
    b1,
    b2,
    tolerance = 0.000001
) {

    function crossProduct(p, q, r) {

        return (
            (q.x - p.x) * (r.y - p.y) -
            (q.y - p.y) * (r.x - p.x)
        );

    }

    function orientationValue(p, q, r) {

        const value =
            crossProduct(p, q, r);

        if (Math.abs(value) <= tolerance)
            return 0;

        return value > 0 ? 1 : -1;

    }

    function liesOnSegment(p, q, r) {

        return (
            q.x <= Math.max(p.x, r.x) + tolerance &&
            q.x >= Math.min(p.x, r.x) - tolerance &&
            q.y <= Math.max(p.y, r.y) + tolerance &&
            q.y >= Math.min(p.y, r.y) - tolerance
        );

    }

    const o1 =
        orientationValue(a1, a2, b1);

    const o2 =
        orientationValue(a1, a2, b2);

    const o3 =
        orientationValue(b1, b2, a1);

    const o4 =
        orientationValue(b1, b2, a2);

    if (o1 !== o2 && o3 !== o4)
        return true;

    if (
        o1 === 0 &&
        liesOnSegment(a1, b1, a2)
    ) {
        return true;
    }

    if (
        o2 === 0 &&
        liesOnSegment(a1, b2, a2)
    ) {
        return true;
    }

    if (
        o3 === 0 &&
        liesOnSegment(b1, a1, b2)
    ) {
        return true;
    }

    if (
        o4 === 0 &&
        liesOnSegment(b1, a2, b2)
    ) {
        return true;
    }

    return false;

}

/* -------------------------------------------------------
   Point On Segment
------------------------------------------------------- */

export function pointOnSegment(point, start, end, tolerance = 1) {

    return (

        distanceToSegment(

            point,

            start,

            end

        ) <= tolerance

    );

}

/* -------------------------------------------------------
   Extend Line
------------------------------------------------------- */

export function extendLine(start, end, amount) {

    const dir = tangent(start, end);

    return {

        x: end.x + dir.x * amount,

        y: end.y + dir.y * amount

    };

}

/* -------------------------------------------------------
   Shorten Line
------------------------------------------------------- */

export function shortenLine(start, end, amount) {

    const dir = tangent(start, end);

    return {

        x: end.x - dir.x * amount,

        y: end.y - dir.y * amount

    };

}

/*
=========================================================
FashionVision AI
Geometry Engine
Part 2 - Advanced Geometry
=========================================================
*/

/* -------------------------------------------------------
   Point-in-Polygon (Ray Casting)
------------------------------------------------------- */
export function pointInPolygon(point, polygon) {
    let isInside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        
        if (
            (pi.y > point.y) !== (pj.y > point.y) &&
            point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
        ) {
            isInside = !isInside;
        }
    }
    
    return isInside;
}

/* -------------------------------------------------------
   Convex Hull (Monotone Chain)
------------------------------------------------------- */
export function convexHull(points) {
    if (points.length <= 3) return [...points];
    
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
            lower.pop();
        }
        lower.push(sorted[i]);
    }
    
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
            upper.pop();
        }
        upper.push(sorted[i]);
    }
    
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/* -------------------------------------------------------
   Point-to-Line Distance
------------------------------------------------------- */

export function pointLineDistance(
    point,
    lineStart,
    lineEnd
) {

    if (
        !point ||
        !lineStart ||
        !lineEnd
    ) {
        return Infinity;
    }

    const numerator =
        Math.abs(
            (lineEnd.y - lineStart.y) *
            point.x -

            (lineEnd.x - lineStart.x) *
            point.y +

            lineEnd.x * lineStart.y -

            lineEnd.y * lineStart.x
        );

    const denominator =
        distance(
            lineStart,
            lineEnd
        );

    if (denominator === 0) {

        return distance(
            point,
            lineStart
        );

    }

    return numerator / denominator;

}

/* -------------------------------------------------------
   Douglas-Peucker Simplification
------------------------------------------------------- */

export function douglasPeucker(
    points = [],
    epsilon = 1
) {

    if (!Array.isArray(points))
        return [];

    const validPoints =
        points.filter(point => (
            point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        ));

    if (validPoints.length <= 2)
        return [...validPoints];

    const parsedEpsilon =
        Number(epsilon);

    const safeEpsilon =
        Number.isFinite(parsedEpsilon)
            ? Math.max(0, parsedEpsilon)
            : 1;

    let maximumDistance = 0;
    let splitIndex = -1;

    const lastIndex =
        validPoints.length - 1;

    for (
        let index = 1;
        index < lastIndex;
        index++
    ) {

        const currentDistance =
            pointLineDistance(
                validPoints[index],
                validPoints[0],
                validPoints[lastIndex]
            );

        if (
            currentDistance >
            maximumDistance
        ) {

            maximumDistance =
                currentDistance;

            splitIndex =
                index;

        }

    }

    if (
        maximumDistance >
        safeEpsilon &&
        splitIndex > 0 &&
        splitIndex < lastIndex
    ) {

        const firstSection =
            douglasPeucker(
                validPoints.slice(
                    0,
                    splitIndex + 1
                ),
                safeEpsilon
            );

        const secondSection =
            douglasPeucker(
                validPoints.slice(
                    splitIndex
                ),
                safeEpsilon
            );

        return [
            ...firstSection.slice(0, -1),
            ...secondSection
        ];

    }

    return [
        validPoints[0],
        validPoints[lastIndex]
    ];

}


/* -------------------------------------------------------
   Bézier Curve Sampling (Cubic)
------------------------------------------------------- */


export function sampleBezier(
    p0,
    p1,
    p2,
    p3,
    segments = 20
) {

    /* Validate control points */

    const controlPoints = [
        p0,
        p1,
        p2,
        p3
    ];

    const validControlPoints =
        controlPoints.every(point => (
            point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        ));

    if (!validControlPoints)
        return [];

    /* Validate segment count */

    const parsedSegments =
        Number(segments);

    const safeSegments =
        Number.isFinite(parsedSegments)
            ? Math.max(
                1,
                Math.floor(parsedSegments)
            )
            : 20;

    const sampledPoints = [];

    /* Generate curve points */

    for (
        let index = 0;
        index <= safeSegments;
        index++
    ) {

        const t =
            index / safeSegments;

        const u =
            1 - t;

        const uu =
            u * u;

        const tt =
            t * t;

        const uuu =
            uu * u;

        const ttt =
            tt * t;

        const x =
            uuu * p0.x +
            3 * uu * t * p1.x +
            3 * u * tt * p2.x +
            ttt * p3.x;

        const y =
            uuu * p0.y +
            3 * uu * t * p1.y +
            3 * u * tt * p2.y +
            ttt * p3.y;

        sampledPoints.push({
            x,
            y
        });

    }

    return sampledPoints;

}

/* -------------------------------------------------------
   Shape Eccentricity
------------------------------------------------------- */
export function shapeEccentricity(points) {
    const box = getBoundingBox(points);
    if (box.height === 0 && box.width === 0) return 0;
    if (box.height === 0 || box.width === 0) return 1;
    
    const max = Math.max(box.width, box.height);
    const min = Math.min(box.width, box.height);
    
    return Math.sqrt(1 - Math.pow(min / max, 2));
}
