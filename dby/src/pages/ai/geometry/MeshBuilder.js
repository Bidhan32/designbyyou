/*
=========================================================
FashionVision AI
Mesh Builder
Version 2.2
=========================================================
*/

import * as THREE from "three";

/*=========================================================
Default Mesh Options
=========================================================*/

export const DEFAULT_MESH_OPTIONS = Object.freeze({
    modelWidth: 3.2,
    modelHeight: 4.6,
    modelDepth: 0.16,

    fitScale: 0.88,

    color: "#7c3aed",
    secondaryColor: "#c4b5fd",

    roughness: 0.72,
    metalness: 0.05,

    wireframe: false,

    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 2,

    centerModel: true
});

/*=========================================================
Part Type Configuration
=========================================================*/

/*
These parts may contribute to the garment's outer shape.

Unknown is included because an early classifier may not
correctly name a valid garment outline.
*/

const STRUCTURAL_PART_TYPES = new Set([
    "unknown",
    "outline",
    "bodice",
    "sleeve",
    "skirt-panel",
    "trouser-leg"
]);

/*
These parts should not normally become silhouette holes.
*/

const EXCLUDED_HOLE_TYPES = new Set([
    "button",
    "seam",
    "decoration"
]);

/*=========================================================
Numeric Helpers
=========================================================*/

function numberOr(
    value,
    fallback = 0
) {
    const numericValue =
        Number(value);

    return Number.isFinite(numericValue)
        ? numericValue
        : fallback;
}

export function clamp(
    value,
    minimum = 0,
    maximum = 1
) {
    return Math.max(
        minimum,
        Math.min(
            maximum,
            numberOr(value, minimum)
        )
    );
}

/*=========================================================
Object Helpers
=========================================================*/

function isObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

/*=========================================================
Normalize Mesh Options
=========================================================*/

export function normalizeMeshOptions(
    options = {}
) {
    return {
        ...DEFAULT_MESH_OPTIONS,
        ...options,

        modelWidth:
            Math.max(
                0.5,
                numberOr(
                    options.modelWidth,
                    DEFAULT_MESH_OPTIONS.modelWidth
                )
            ),

        modelHeight:
            Math.max(
                0.5,
                numberOr(
                    options.modelHeight,
                    DEFAULT_MESH_OPTIONS.modelHeight
                )
            ),

        modelDepth:
            Math.max(
                0.025,
                numberOr(
                    options.modelDepth,
                    DEFAULT_MESH_OPTIONS.modelDepth
                )
            ),

        fitScale:
            clamp(
                options.fitScale ??
                    DEFAULT_MESH_OPTIONS.fitScale,
                0.2,
                1
            ),

        roughness:
            clamp(
                options.roughness ??
                    DEFAULT_MESH_OPTIONS.roughness
            ),

        metalness:
            clamp(
                options.metalness ??
                    DEFAULT_MESH_OPTIONS.metalness
            ),

        bevelSize:
            Math.max(
                0,
                numberOr(
                    options.bevelSize,
                    DEFAULT_MESH_OPTIONS.bevelSize
                )
            ),

        bevelThickness:
            Math.max(
                0,
                numberOr(
                    options.bevelThickness,
                    DEFAULT_MESH_OPTIONS.bevelThickness
                )
            ),

        bevelSegments:
            Math.max(
                1,
                Math.floor(
                    numberOr(
                        options.bevelSegments,
                        DEFAULT_MESH_OPTIONS.bevelSegments
                    )
                )
            ),

        wireframe:
            Boolean(
                options.wireframe ??
                    DEFAULT_MESH_OPTIONS.wireframe
            ),

        bevelEnabled:
            Boolean(
                options.bevelEnabled ??
                    DEFAULT_MESH_OPTIONS.bevelEnabled
            ),

        centerModel:
            options.centerModel !== false
    };
}

/*=========================================================
Material Helpers
=========================================================*/

function createSafeColor(
    color,
    fallback
) {
    try {
        return new THREE.Color(
            color || fallback
        );
    } catch {
        return new THREE.Color(
            fallback
        );
    }
}

export function createGarmentMaterial(
    options = {},
    secondary = false
) {
    const safeOptions =
        normalizeMeshOptions(options);

    return new THREE.MeshStandardMaterial({
        color:
            createSafeColor(
                secondary
                    ? safeOptions.secondaryColor
                    : safeOptions.color,
                secondary
                    ? "#c4b5fd"
                    : "#7c3aed"
            ),

        roughness:
            safeOptions.roughness,

        metalness:
            safeOptions.metalness,

        wireframe:
            safeOptions.wireframe,

        side:
            THREE.DoubleSide
    });
}

/*=========================================================
Relative Box Helpers
=========================================================*/

export function normalizeRelativeBox(
    box = {},
    fallback = {}
) {
    const fallbackX =
        numberOr(fallback.x, 0);

    const fallbackY =
        numberOr(fallback.y, 0);

    const fallbackWidth =
        numberOr(fallback.width, 1);

    const fallbackHeight =
        numberOr(fallback.height, 1);

    const x =
        clamp(
            numberOr(
                box.x,
                fallbackX
            )
        );

    const y =
        clamp(
            numberOr(
                box.y,
                fallbackY
            )
        );

    const width =
        clamp(
            numberOr(
                box.width,
                fallbackWidth
            )
        );

    const height =
        clamp(
            numberOr(
                box.height,
                fallbackHeight
            )
        );

    return {
        x,
        y,
        width,
        height,

        center: {
            x:
                clamp(
                    numberOr(
                        box.center?.x,
                        x + width / 2
                    )
                ),

            y:
                clamp(
                    numberOr(
                        box.center?.y,
                        y + height / 2
                    )
                )
        }
    };
}

export function getHintRelativeBox(
    hint,
    fallback = {}
) {
    return normalizeRelativeBox(
        hint?.garmentRelativeBox ||
            hint?.normalizedBoundingBox ||
            {},
        fallback
    );
}

export function relativeBoxToFrame(
    relativeBox,
    options = {}
) {
    const safeOptions =
        normalizeMeshOptions(options);

    const box =
        normalizeRelativeBox(relativeBox);

    return {
        x:
            (
                box.center.x -
                0.5
            ) *
            safeOptions.modelWidth,

        y:
            (
                0.5 -
                box.center.y
            ) *
            safeOptions.modelHeight,

        z: 0,

        width:
            Math.max(
                0.1,
                box.width *
                    safeOptions.modelWidth
            ),

        height:
            Math.max(
                0.1,
                box.height *
                    safeOptions.modelHeight
            ),

        depth:
            safeOptions.modelDepth,

        relativeBox:
            box
    };
}

/*=========================================================
Create Basic Procedural Panel
=========================================================*/

export function createPanelGeometry({
    width = 1,
    height = 1,
    depth = 0.15,
    topScale = 1,
    bottomScale = 1,
    options = {}
} = {}) {
    const safeOptions =
        normalizeMeshOptions(options);

    const safeWidth =
        Math.max(
            0.1,
            numberOr(width, 1)
        );

    const safeHeight =
        Math.max(
            0.1,
            numberOr(height, 1)
        );

    const safeDepth =
        Math.max(
            0.025,
            numberOr(
                depth,
                safeOptions.modelDepth
            )
        );

    const halfHeight =
        safeHeight / 2;

    const topHalfWidth =
        safeWidth *
        Math.max(
            0.1,
            numberOr(topScale, 1)
        ) / 2;

    const bottomHalfWidth =
        safeWidth *
        Math.max(
            0.1,
            numberOr(bottomScale, 1)
        ) / 2;

    const shape =
        new THREE.Shape();

    shape.moveTo(
        -bottomHalfWidth,
        -halfHeight
    );

    shape.lineTo(
        bottomHalfWidth,
        -halfHeight
    );

    shape.lineTo(
        topHalfWidth,
        halfHeight
    );

    shape.lineTo(
        -topHalfWidth,
        halfHeight
    );

    shape.closePath();

    const maximumBevel =
        Math.min(
            safeWidth,
            safeHeight,
            safeDepth
        ) * 0.1;

    const geometry =
        new THREE.ExtrudeGeometry(
            shape,
            {
                depth:
                    safeDepth,

                steps:
                    1,

                curveSegments:
                    12,

                bevelEnabled:
                    safeOptions.bevelEnabled,

                bevelThickness:
                    Math.min(
                        safeOptions.bevelThickness,
                        maximumBevel
                    ),

                bevelSize:
                    Math.min(
                        safeOptions.bevelSize,
                        maximumBevel
                    ),

                bevelSegments:
                    safeOptions.bevelSegments
            }
        );

    geometry.translate(
        0,
        0,
        -safeDepth / 2
    );

    geometry.computeVertexNormals();

    return geometry;
}

/*=========================================================
Add Mesh to Group
=========================================================*/

function addMeshToGroup(
    group,
    mesh,
    metadata = {}
) {
    if (
        !group?.isObject3D ||
        !mesh?.isObject3D
    ) {
        return null;
    }

    mesh.userData = {
        ...mesh.userData,
        ...metadata
    };

    group.add(mesh);

    return mesh;
}

/*=========================================================
Build Torso Mesh
=========================================================*/

export function buildTorsoMesh(
    blueprint,
    options,
    material
) {
    const hint =
        blueprint
            ?.constructionHints
            ?.torso;

    /*
    Never generate a torso when the classifier has not
    actually detected one.
    */

    if (!hint?.present) {
        return null;
    }

    const relativeBox =
        getHintRelativeBox(
            hint,
            {
                x: 0.25,
                y: 0.1,
                width: 0.5,
                height: 0.5
            }
        );

    const frame =
        relativeBoxToFrame(
            relativeBox,
            options
        );

    const garmentType =
        blueprint?.garmentType ||
        "unknown";

    let topScale =
        0.92;

    let bottomScale =
        0.8;

    if (
        garmentType ===
        "dress"
    ) {
        topScale =
            0.86;

        bottomScale =
            0.7;
    }

    if (
        garmentType ===
        "upper-body"
    ) {
        topScale =
            0.92;

        bottomScale =
            0.78;
    }

    const geometry =
        createPanelGeometry({
            width:
                frame.width,

            height:
                frame.height,

            depth:
                frame.depth,

            topScale,

            bottomScale,

            options
        });

    const mesh =
        new THREE.Mesh(
            geometry,
            material
        );

    mesh.name =
        "fashionvision-torso";

    mesh.position.set(
        frame.x,
        frame.y,
        frame.z
    );

    mesh.castShadow =
        true;

    mesh.receiveShadow =
        true;

    mesh.userData.frame =
        frame;

    return mesh;
}

/*=========================================================
Build Sleeve Mesh
=========================================================*/

export function buildSleeveMesh(
    blueprint,
    side,
    options,
    material
) {
    const hint =
        blueprint
            ?.constructionHints
            ?.sleeves
            ?.[side];

    if (!hint?.present) {
        return null;
    }

    const fallback =
        side === "left"
            ? {
                x: 0.04,
                y: 0.12,
                width: 0.24,
                height: 0.42
            }
            : {
                x: 0.72,
                y: 0.12,
                width: 0.24,
                height: 0.42
            };

    const relativeBox =
        getHintRelativeBox(
            hint,
            fallback
        );

    const frame =
        relativeBoxToFrame(
            relativeBox,
            options
        );

    const sleeveLength =
        Math.max(
            frame.height,
            frame.width,
            0.4
        );

    const sleeveRadius =
        Math.max(
            0.08,
            Math.min(
                frame.width,
                frame.height
            ) * 0.25
        );

    const geometry =
        new THREE.CylinderGeometry(
            sleeveRadius * 0.72,
            sleeveRadius,
            sleeveLength,
            18,
            2,
            false
        );

    geometry.computeVertexNormals();

    const mesh =
        new THREE.Mesh(
            geometry,
            material
        );

    mesh.name =
        `fashionvision-${side}-sleeve`;

    mesh.position.set(
        frame.x,
        frame.y,
        0
    );

    mesh.rotation.z =
        side === "left"
            ? -0.32
            : 0.32;

    if (
        frame.width >
        frame.height
    ) {
        mesh.rotation.z =
            side === "left"
                ? -Math.PI / 2
                : Math.PI / 2;
    }

    mesh.castShadow =
        true;

    mesh.receiveShadow =
        true;

    mesh.userData.frame =
        frame;

    mesh.userData.side =
        side;

    return mesh;
}

/*=========================================================
Build Neck Mesh
=========================================================*/

export function buildNeckMesh(
    blueprint,
    options,
    material
) {
    const hint =
        blueprint
            ?.constructionHints
            ?.neck;

    if (!hint?.present) {
        return null;
    }

    const relativeBox =
        getHintRelativeBox(
            hint,
            {
                x: 0.4,
                y: 0.02,
                width: 0.2,
                height: 0.1
            }
        );

    const frame =
        relativeBoxToFrame(
            relativeBox,
            options
        );

    const radius =
        Math.max(
            0.1,
            frame.width * 0.32
        );

    const tubeRadius =
        Math.max(
            0.018,
            frame.depth * 0.1
        );

    const geometry =
        new THREE.TorusGeometry(
            radius,
            tubeRadius,
            10,
            48,
            Math.PI * 1.65
        );

    const mesh =
        new THREE.Mesh(
            geometry,
            material
        );

    mesh.name =
        "fashionvision-neck";

    mesh.position.set(
        frame.x,
        frame.y,
        frame.depth * 0.58
    );

    mesh.rotation.z =
        Math.PI * 0.675;

    mesh.castShadow =
        true;

    mesh.userData.frame =
        frame;

    return mesh;
}

/*=========================================================
Build Skirt Mesh
=========================================================*/

export function buildSkirtMesh(
    blueprint,
    options,
    material
) {
    const hint =
        blueprint
            ?.constructionHints
            ?.lowerBody;

    if (
        !hint?.present ||
        hint.mode !== "skirt"
    ) {
        return null;
    }

    const relativeBox =
        getHintRelativeBox(
            hint,
            {
                x: 0.25,
                y: 0.48,
                width: 0.5,
                height: 0.5
            }
        );

    const frame =
        relativeBoxToFrame(
            relativeBox,
            options
        );

    const geometry =
        createPanelGeometry({
            width:
                frame.width,

            height:
                frame.height,

            depth:
                frame.depth,

            topScale:
                0.62,

            bottomScale:
                1,

            options
        });

    const mesh =
        new THREE.Mesh(
            geometry,
            material
        );

    mesh.name =
        "fashionvision-skirt";

    mesh.position.set(
        frame.x,
        frame.y,
        frame.z
    );

    mesh.castShadow =
        true;

    mesh.receiveShadow =
        true;

    mesh.userData.frame =
        frame;

    return mesh;
}

/*=========================================================
Build Trouser Meshes
=========================================================*/

export function buildTrouserMeshes(
    blueprint,
    options,
    material
) {
    const hint =
        blueprint
            ?.constructionHints
            ?.lowerBody;

    if (
        !hint?.present ||
        hint.mode !== "trousers"
    ) {
        return [];
    }

    const relativeBox =
        getHintRelativeBox(
            hint,
            {
                x: 0.28,
                y: 0.48,
                width: 0.44,
                height: 0.5
            }
        );

    const frame =
        relativeBoxToFrame(
            relativeBox,
            options
        );

    const gap =
        Math.max(
            0.06,
            frame.width * 0.08
        );

    const legWidth =
        Math.max(
            0.12,
            (
                frame.width -
                gap
            ) / 2
        );

    const createLegGeometry =
        () =>
            createPanelGeometry({
                width:
                    legWidth,

                height:
                    frame.height,

                depth:
                    frame.depth,

                topScale:
                    1,

                bottomScale:
                    0.84,

                options
            });

    const leftLeg =
        new THREE.Mesh(
            createLegGeometry(),
            material
        );

    const rightLeg =
        new THREE.Mesh(
            createLegGeometry(),
            material
        );

    leftLeg.name =
        "fashionvision-left-trouser-leg";

    rightLeg.name =
        "fashionvision-right-trouser-leg";

    const offset =
        legWidth / 2 +
        gap / 2;

    leftLeg.position.set(
        frame.x - offset,
        frame.y,
        frame.z
    );

    rightLeg.position.set(
        frame.x + offset,
        frame.y,
        frame.z
    );

    leftLeg.castShadow =
        true;

    leftLeg.receiveShadow =
        true;

    rightLeg.castShadow =
        true;

    rightLeg.receiveShadow =
        true;

    leftLeg.userData.side =
        "left";

    rightLeg.userData.side =
        "right";

    leftLeg.userData.frame =
        frame;

    rightLeg.userData.frame =
        frame;

    return [
        leftLeg,
        rightLeg
    ];
}

/*=========================================================
Build Lower Body
=========================================================*/

export function buildLowerBody(
    blueprint,
    options,
    material
) {
    const mode =
        blueprint
            ?.constructionHints
            ?.lowerBody
            ?.mode ||
        "unknown";

    if (
        mode ===
        "trousers"
    ) {
        return buildTrouserMeshes(
            blueprint,
            options,
            material
        );
    }

    if (
        mode === "skirt" ||
        blueprint?.garmentType === "dress" ||
        blueprint?.garmentType === "skirt"
    ) {
        const skirt =
            buildSkirtMesh(
                blueprint,
                options,
                material
            );

        return skirt
            ? [skirt]
            : [];
    }

    return [];
}

/*=========================================================
Read Serialized Points
=========================================================*/

function readPartPoints(
    part
) {
    const sourcePoints =
        part
            ?.geometry
            ?.points;

    if (!Array.isArray(sourcePoints)) {
        return [];
    }

    return sourcePoints
        .map(point => ({
            x:
                Number(point?.x),

            y:
                Number(point?.y)
        }))
        .filter(
            point =>
                Number.isFinite(point.x) &&
                Number.isFinite(point.y)
        );
}

/*=========================================================
Get All Serialized Parts
=========================================================*/

function getAllParts(
    blueprint
) {
    return Array.isArray(
        blueprint?.parts
    )
        ? blueprint.parts.filter(Boolean)
        : [];
}

/*=========================================================
Get Structural Parts
=========================================================*/

export function getStructuralParts(
    blueprint
) {
    return getAllParts(
        blueprint
    ).filter(
        part =>
            STRUCTURAL_PART_TYPES.has(
                part?.type ||
                "unknown"
            )
    );
}

/*=========================================================
Get Structural Points
=========================================================*/

export function getStructuralPoints(
    blueprint
) {
    return getStructuralParts(
        blueprint
    ).flatMap(
        readPartPoints
    );
}

/*=========================================================
Get All Part Points
=========================================================*/

function getAllPartPoints(
    blueprint
) {
    return getAllParts(
        blueprint
    ).flatMap(
        readPartPoints
    );
}

/*=========================================================
Point Distance
=========================================================*/

function pointDistance(
    pointA,
    pointB
) {
    return Math.hypot(
        pointB.x - pointA.x,
        pointB.y - pointA.y
    );
}

/*=========================================================
Remove Consecutive Duplicate Points
=========================================================*/

function removeConsecutiveDuplicates(
    points = [],
    minimumDistance = 1.25
) {
    if (!Array.isArray(points)) {
        return [];
    }

    const result = [];

    points.forEach(point => {
        const previous =
            result[
                result.length - 1
            ];

        if (
            !previous ||
            pointDistance(
                previous,
                point
            ) >= minimumDistance
        ) {
            result.push(point);
        }
    });

    if (
        result.length >= 2 &&
        pointDistance(
            result[0],
            result[
                result.length - 1
            ]
        ) < minimumDistance
    ) {
        result.pop();
    }

    return result;
}

/*=========================================================
Remove Global Duplicate Points
=========================================================*/

function removeGlobalDuplicates(
    points = []
) {
    const pointMap =
        new Map();

    points.forEach(point => {
        const key =
            `${Math.round(
                point.x * 100
            )}:${Math.round(
                point.y * 100
            )}`;

        if (!pointMap.has(key)) {
            pointMap.set(
                key,
                point
            );
        }
    });

    return [
        ...pointMap.values()
    ];
}

/*=========================================================
Calculate Signed Polygon Area
=========================================================*/

function signedPolygonArea(
    points = []
) {
    if (points.length < 3) {
        return 0;
    }

    let area =
        0;

    for (
        let index = 0;
        index < points.length;
        index++
    ) {
        const current =
            points[index];

        const next =
            points[
                (
                    index + 1
                ) %
                points.length
            ];

        area +=
            current.x *
                next.y -
            next.x *
                current.y;
    }

    return area / 2;
}

/*=========================================================
Contour Centroid
=========================================================*/

function calculateContourCentroid(
    points = []
) {
    if (points.length === 0) {
        return {
            x: 0,
            y: 0
        };
    }

    const total =
        points.reduce(
            (
                result,
                point
            ) => ({
                x:
                    result.x +
                    point.x,

                y:
                    result.y +
                    point.y
            }),
            {
                x: 0,
                y: 0
            }
        );

    return {
        x:
            total.x /
            points.length,

        y:
            total.y /
            points.length
    };
}

/*=========================================================
Determine Whether Stroke is Closed
=========================================================*/

function isEffectivelyClosed(
    part,
    points
) {
    if (
        part
            ?.geometry
            ?.closed === true
    ) {
        return true;
    }

    if (points.length < 3) {
        return false;
    }

    const xs =
        points.map(
            point => point.x
        );

    const ys =
        points.map(
            point => point.y
        );

    const width =
        Math.max(...xs) -
        Math.min(...xs);

    const height =
        Math.max(...ys) -
        Math.min(...ys);

    const diagonal =
        Math.hypot(
            width,
            height
        );

    const closingDistance =
        pointDistance(
            points[0],
            points[
                points.length - 1
            ]
        );

    return (
        closingDistance <=
        Math.max(
            10,
            diagonal * 0.1
        )
    );
}

/*=========================================================
Point on Polygon Boundary
=========================================================*/

function isPointOnSegment(
    point,
    segmentStart,
    segmentEnd,
    tolerance = 0.0001
) {
    const cross =
        (
            point.y -
            segmentStart.y
        ) *
        (
            segmentEnd.x -
            segmentStart.x
        ) -
        (
            point.x -
            segmentStart.x
        ) *
        (
            segmentEnd.y -
            segmentStart.y
        );

    if (
        Math.abs(cross) >
        tolerance
    ) {
        return false;
    }

    const dot =
        (
            point.x -
            segmentStart.x
        ) *
        (
            segmentEnd.x -
            segmentStart.x
        ) +
        (
            point.y -
            segmentStart.y
        ) *
        (
            segmentEnd.y -
            segmentStart.y
        );

    if (dot < 0) {
        return false;
    }

    const squaredLength =
        (
            segmentEnd.x -
            segmentStart.x
        ) ** 2 +
        (
            segmentEnd.y -
            segmentStart.y
        ) ** 2;

    return dot <=
        squaredLength;
}

/*=========================================================
Point Inside Polygon
=========================================================*/

function isPointInsidePolygon(
    point,
    polygon = []
) {
    if (
        !point ||
        polygon.length < 3
    ) {
        return false;
    }

    let inside =
        false;

    for (
        let currentIndex = 0,
            previousIndex =
                polygon.length - 1;

        currentIndex <
        polygon.length;

        previousIndex =
            currentIndex++
    ) {
        const current =
            polygon[currentIndex];

        const previous =
            polygon[previousIndex];

        if (
            isPointOnSegment(
                point,
                previous,
                current
            )
        ) {
            return true;
        }

        const intersects =
            (
                current.y >
                point.y
            ) !==
            (
                previous.y >
                point.y
            ) &&
            point.x <
                (
                    (
                        previous.x -
                        current.x
                    ) *
                    (
                        point.y -
                        current.y
                    )
                ) /
                (
                    previous.y -
                    current.y ||
                    Number.EPSILON
                ) +
                current.x;

        if (intersects) {
            inside =
                !inside;
        }
    }

    return inside;
}

/*=========================================================
Ensure Contour Winding Direction
=========================================================*/

function ensureContourDirection(
    points,
    clockwise
) {
    const isClockwise =
        signedPolygonArea(points) < 0;

    if (
        isClockwise ===
        clockwise
    ) {
        return [
            ...points
        ];
    }

    return [
        ...points
    ].reverse();
}

/*=========================================================
Calculate Point Bounds
=========================================================*/

function calculatePointBounds(
    points = []
) {
    if (points.length === 0) {
        return null;
    }

    const xs =
        points.map(
            point => point.x
        );

    const ys =
        points.map(
            point => point.y
        );

    const minX =
        Math.min(...xs);

    const minY =
        Math.min(...ys);

    const maxX =
        Math.max(...xs);

    const maxY =
        Math.max(...ys);

    return {
        minX,
        minY,
        maxX,
        maxY,

        width:
            maxX - minX,

        height:
            maxY - minY,

        center: {
            x:
                (
                    minX +
                    maxX
                ) / 2,

            y:
                (
                    minY +
                    maxY
                ) / 2
        }
    };
}

/*=========================================================
Resolve Garment Bounds
=========================================================*/

function resolveGarmentBounds(
    blueprint,
    points
) {
    const suppliedBounds =
        blueprint
            ?.bounds
            ?.absolute;

    const minX =
        Number(
            suppliedBounds?.minX ??
                suppliedBounds?.x
        );

    const minY =
        Number(
            suppliedBounds?.minY ??
                suppliedBounds?.y
        );

    const width =
        Number(
            suppliedBounds?.width
        );

    const height =
        Number(
            suppliedBounds?.height
        );

    if (
        Number.isFinite(minX) &&
        Number.isFinite(minY) &&
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
    ) {
        return {
            minX,
            minY,

            maxX:
                minX + width,

            maxY:
                minY + height,

            width,
            height,

            center: {
                x:
                    minX +
                    width / 2,

                y:
                    minY +
                    height / 2
            }
        };
    }

    return calculatePointBounds(points);
}

/*=========================================================
Convert Canvas Points to Model Space
=========================================================*/

function convertPointsToModelSpace(
    points,
    blueprint,
    options
) {
    const allBlueprintPoints =
        getAllPartPoints(
            blueprint
        );

    const bounds =
        resolveGarmentBounds(
            blueprint,
            allBlueprintPoints.length > 0
                ? allBlueprintPoints
                : points
        );

    if (
        !bounds ||
        bounds.width <= 0 ||
        bounds.height <= 0
    ) {
        return [];
    }

    /*
    One uniform scale preserves the original aspect ratio.
    */

    const scaleX =
        options.modelWidth /
        bounds.width;

    const scaleY =
        options.modelHeight /
        bounds.height;

    const scale =
        Math.min(
            scaleX,
            scaleY
        ) *
        options.fitScale;

    return points.map(
        point => ({
            x:
                (
                    point.x -
                    bounds.center.x
                ) *
                scale,

            /*
            Canvas coordinates increase downward.
            Three.js coordinates increase upward.
            */

            y:
                (
                    bounds.center.y -
                    point.y
                ) *
                scale
        })
    );
}

/*=========================================================
Convex Hull Cross Product
=========================================================*/

function crossProduct(
    origin,
    pointA,
    pointB
) {
    return (
        (
            pointA.x -
            origin.x
        ) *
        (
            pointB.y -
            origin.y
        ) -
        (
            pointA.y -
            origin.y
        ) *
        (
            pointB.x -
            origin.x
        )
    );
}

/*=========================================================
Create Convex Hull
=========================================================*/

export function createConvexHull(
    sourcePoints = []
) {
    const points =
        removeGlobalDuplicates(
            sourcePoints
        )
            .slice()
            .sort(
                (
                    pointA,
                    pointB
                ) =>
                    pointA.x -
                    pointB.x ||
                    pointA.y -
                    pointB.y
            );

    if (points.length < 3) {
        return [];
    }

    const lower = [];

    points.forEach(point => {
        while (
            lower.length >= 2 &&
            crossProduct(
                lower[
                    lower.length - 2
                ],
                lower[
                    lower.length - 1
                ],
                point
            ) <= 0
        ) {
            lower.pop();
        }

        lower.push(point);
    });

    const upper = [];

    for (
        let index =
            points.length - 1;
        index >= 0;
        index--
    ) {
        const point =
            points[index];

        while (
            upper.length >= 2 &&
            crossProduct(
                upper[
                    upper.length - 2
                ],
                upper[
                    upper.length - 1
                ],
                point
            ) <= 0
        ) {
            upper.pop();
        }

        upper.push(point);
    }

    lower.pop();
    upper.pop();

    return [
        ...lower,
        ...upper
    ];
}

/*=========================================================
Read Closed Part Contours
=========================================================*/

function getClosedPartContours(
    blueprint,
    options
) {
    return getAllParts(
        blueprint
    )
        .filter(
            part =>
                !EXCLUDED_HOLE_TYPES.has(
                    part?.type
                )
        )
        .map(part => {
            const canvasPoints =
                removeConsecutiveDuplicates(
                    readPartPoints(part)
                );

            if (
                canvasPoints.length < 3 ||
                !isEffectivelyClosed(
                    part,
                    canvasPoints
                )
            ) {
                return null;
            }

            const modelPoints =
                removeConsecutiveDuplicates(
                    convertPointsToModelSpace(
                        canvasPoints,
                        blueprint,
                        options
                    ),
                    0.01
                );

            if (
                modelPoints.length < 3
            ) {
                return null;
            }

            const area =
                Math.abs(
                    signedPolygonArea(
                        modelPoints
                    )
                );

            if (
                !Number.isFinite(area) ||
                area < 0.01
            ) {
                return null;
            }

            return {
                part,

                type:
                    part?.type ||
                    "unknown",

                points:
                    modelPoints,

                area,

                centroid:
                    calculateContourCentroid(
                        modelPoints
                    )
            };
        })
        .filter(Boolean)
        .sort(
            (
                contourA,
                contourB
            ) =>
                contourB.area -
                contourA.area
        );
}

/*=========================================================
Determine Outer Contour and Holes
=========================================================*/

function createSilhouetteData(
    blueprint,
    options
) {
    const structuralCanvasPoints =
        getStructuralPoints(
            blueprint
        );

    if (
        structuralCanvasPoints.length <
        3
    ) {
        return null;
    }

    const structuralModelPoints =
        convertPointsToModelSpace(
            structuralCanvasPoints,
            blueprint,
            options
        );

    const convexHull =
        createConvexHull(
            structuralModelPoints
        );

    if (
        convexHull.length < 3
    ) {
        return null;
    }

    const hullArea =
        Math.abs(
            signedPolygonArea(
                convexHull
            )
        );

    if (
        !Number.isFinite(hullArea) ||
        hullArea < 0.01
    ) {
        return null;
    }

    const closedContours =
        getClosedPartContours(
            blueprint,
            options
        );

    const largestClosedContour =
        closedContours[0] ||
        null;

    /*
    A closed contour becomes the outer garment only when
    it occupies a meaningful percentage of the entire
    structural hull.

    Otherwise the structural hull remains the outside and
    closed internal strokes become holes.
    */

    const canUseClosedOuter =
        largestClosedContour &&
        largestClosedContour.area >=
            hullArea * 0.42;

    const outerPoints =
        canUseClosedOuter
            ? largestClosedContour.points
            : convexHull;

    const outerArea =
        Math.abs(
            signedPolygonArea(
                outerPoints
            )
        );

    const holeCandidates =
        closedContours.filter(
            contour => {
                if (
                    canUseClosedOuter &&
                    contour ===
                        largestClosedContour
                ) {
                    return false;
                }

                /*
                Reject contours almost as large as the outer
                contour because they are probably duplicated
                garment outlines rather than holes.
                */

                if (
                    contour.area >=
                    outerArea * 0.78
                ) {
                    return false;
                }

                return isPointInsidePolygon(
                    contour.centroid,
                    outerPoints
                );
            }
        );

    /*
    Avoid accepting a contour inside another accepted hole.
    This prevents nested duplicate cutouts.
    */

    const holes = [];

    holeCandidates.forEach(
        candidate => {
            const insideExistingHole =
                holes.some(
                    hole =>
                        isPointInsidePolygon(
                            candidate.centroid,
                            hole.points
                        )
                );

            if (!insideExistingHole) {
                holes.push(candidate);
            }
        }
    );

    return {
        outerPoints,

        holes,

        reconstructionMethod:
            canUseClosedOuter
                ? "closed-contour"
                : "convex-hull",

        structuralPointCount:
            structuralCanvasPoints.length,

        outerPointCount:
            outerPoints.length,

        hullArea,

        outerArea
    };
}

/*=========================================================
Build Mesh from Sketch Silhouette
=========================================================*/

export function buildSilhouetteMesh(
    blueprint,
    options,
    material
) {
    const safeOptions =
        normalizeMeshOptions(options);

    const silhouetteData =
        createSilhouetteData(
            blueprint,
            safeOptions
        );

    if (!silhouetteData) {
        return null;
    }

    const {
        outerPoints,
        holes,
        reconstructionMethod,
        structuralPointCount,
        outerPointCount,
        hullArea,
        outerArea
    } = silhouetteData;

    if (outerPoints.length < 3) {
        return null;
    }

    /*
    Three.js generally expects the outside contour to be
    clockwise and holes to use the opposite direction.
    */

    const directedOuterPoints =
        ensureContourDirection(
            outerPoints,
            true
        );

    const shape =
        new THREE.Shape();

    shape.moveTo(
        directedOuterPoints[0].x,
        directedOuterPoints[0].y
    );

    for (
        let index = 1;
        index <
        directedOuterPoints.length;
        index++
    ) {
        shape.lineTo(
            directedOuterPoints[index].x,
            directedOuterPoints[index].y
        );
    }

    shape.closePath();

    holes.forEach(
        contour => {
            const holePoints =
                ensureContourDirection(
                    contour.points,
                    false
                );

            if (
                holePoints.length < 3
            ) {
                return;
            }

            const holePath =
                new THREE.Path();

            holePath.moveTo(
                holePoints[0].x,
                holePoints[0].y
            );

            for (
                let index = 1;
                index <
                holePoints.length;
                index++
            ) {
                holePath.lineTo(
                    holePoints[index].x,
                    holePoints[index].y
                );
            }

            holePath.closePath();

            shape.holes.push(
                holePath
            );
        }
    );

    const depth =
        safeOptions.modelDepth;

    /*
    Keep bevels very small when holes exist. Large bevels
    can overlap small neckline or pocket openings.
    */

    const holeAwareBevelLimit =
        holes.length > 0
            ? 0.008
            : 0.018;

    const maximumBevel =
        Math.max(
            0,
            Math.min(
                safeOptions.bevelSize,
                safeOptions.bevelThickness,
                depth * 0.12,
                holeAwareBevelLimit
            )
        );

    const geometry =
        new THREE.ExtrudeGeometry(
            shape,
            {
                depth,

                steps:
                    1,

                curveSegments:
                    16,

                bevelEnabled:
                    safeOptions.bevelEnabled &&
                    maximumBevel > 0,

                bevelThickness:
                    maximumBevel,

                bevelSize:
                    maximumBevel,

                bevelSegments:
                    safeOptions.bevelSegments
            }
        );

    geometry.translate(
        0,
        0,
        -depth / 2
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh =
        new THREE.Mesh(
            geometry,
            material
        );

    mesh.name =
        "fashionvision-sketch-silhouette";

    mesh.castShadow =
        true;

    mesh.receiveShadow =
        true;

    mesh.userData = {
        garmentPart:
            "silhouette",

        reconstructionMethod,

        structuralPointCount,

        sourcePointCount:
            structuralPointCount,

        contourPointCount:
            outerPointCount,

        holeCount:
            holes.length,

        holeTypes:
            holes.map(
                hole =>
                    hole.type
            ),

        hullArea,

        contourArea:
            outerArea
    };

    return mesh;
}

/*=========================================================
Center Complete Garment Group
=========================================================*/

export function centerGarmentGroup(
    group
) {
    if (
        !group?.isObject3D ||
        group.children.length === 0
    ) {
        return group;
    }

    group.updateMatrixWorld(true);

    const bounds =
        new THREE.Box3()
            .setFromObject(group);

    if (bounds.isEmpty()) {
        return group;
    }

    const center =
        bounds.getCenter(
            new THREE.Vector3()
        );

    group.position.x -=
        center.x;

    group.position.y -=
        center.y;

    group.position.z -=
        center.z;

    group.updateMatrixWorld(true);

    return group;
}

/*=========================================================
Resolve Nested Blueprint
=========================================================*/

function resolveSourceBlueprint(
    blueprint
) {
    if (!isObject(blueprint)) {
        return null;
    }

    if (
        isObject(
            blueprint.garmentBlueprint
        )
    ) {
        return blueprint.garmentBlueprint;
    }

    if (
        isObject(
            blueprint.blueprint
                ?.garmentBlueprint
        )
    ) {
        return blueprint
            .blueprint
            .garmentBlueprint;
    }

    return blueprint;
}

/*=========================================================
Build Complete Garment Mesh
=========================================================*/

export function buildGarmentMesh(
    blueprint,
    options = {}
) {
    const sourceBlueprint =
        resolveSourceBlueprint(
            blueprint
        );

    if (!sourceBlueprint) {
        throw new Error(
            "A valid garment blueprint is required."
        );
    }

    const safeOptions =
        normalizeMeshOptions(options);

    const group =
        new THREE.Group();

    group.name =
        "fashionvision-garment";

    const ownsMainMaterial =
        !options.material;

    const mainMaterial =
        options.material ||
        createGarmentMaterial(
            safeOptions,
            false
        );

    /*
    First use the real sketch points.
    */

    const silhouette =
        buildSilhouetteMesh(
            sourceBlueprint,
            safeOptions,
            mainMaterial
        );

    if (silhouette) {
        addMeshToGroup(
            group,
            silhouette,
            {
                garmentPart:
                    "silhouette"
            }
        );
    } else {
        /*
        Point-based reconstruction was unavailable.

        Use classified procedural components as a fallback,
        but never create an unrelated default rectangle.
        */

        const torso =
            buildTorsoMesh(
                sourceBlueprint,
                safeOptions,
                mainMaterial
            );

        if (torso) {
            addMeshToGroup(
                group,
                torso,
                {
                    garmentPart:
                        "torso"
                }
            );
        }

        const leftSleeve =
            buildSleeveMesh(
                sourceBlueprint,
                "left",
                safeOptions,
                mainMaterial
            );

        const rightSleeve =
            buildSleeveMesh(
                sourceBlueprint,
                "right",
                safeOptions,
                mainMaterial
            );

        if (leftSleeve) {
            addMeshToGroup(
                group,
                leftSleeve,
                {
                    garmentPart:
                        "sleeve",

                    side:
                        "left"
                }
            );
        }

        if (rightSleeve) {
            addMeshToGroup(
                group,
                rightSleeve,
                {
                    garmentPart:
                        "sleeve",

                    side:
                        "right"
                }
            );
        }

        const lowerBodyMeshes =
            buildLowerBody(
                sourceBlueprint,
                safeOptions,
                mainMaterial
            );

        lowerBodyMeshes.forEach(
            mesh => {
                addMeshToGroup(
                    group,
                    mesh,
                    {
                        garmentPart:
                            "lower-body"
                    }
                );
            }
        );
    }

    /*
    A neck ring is only allowed when no silhouette exists.

    When a silhouette exists, a closed neckline stroke is
    represented as a hole instead of a floating torus.
    */

    if (!silhouette) {
        const neckHint =
            sourceBlueprint
                ?.constructionHints
                ?.neck;

        if (neckHint?.present) {
            const secondaryMaterial =
                options.secondaryMaterial ||
                createGarmentMaterial(
                    safeOptions,
                    true
                );

            const neck =
                buildNeckMesh(
                    sourceBlueprint,
                    safeOptions,
                    secondaryMaterial
                );

            if (neck) {
                addMeshToGroup(
                    group,
                    neck,
                    {
                        garmentPart:
                            "neck"
                    }
                );
            } else if (
                !options.secondaryMaterial
            ) {
                secondaryMaterial.dispose();
            }
        }
    }

    /*
    Dispose the internally created material when no mesh
    was generated and therefore no child owns it.
    */

    if (
        group.children.length === 0 &&
        ownsMainMaterial
    ) {
        mainMaterial.dispose();
    }

    if (
        safeOptions.centerModel &&
        group.children.length > 0
    ) {
        centerGarmentGroup(group);
    }

    group.userData = {
        ...group.userData,

        empty:
            group.children.length === 0,

        blueprintVersion:
            sourceBlueprint
                .blueprintVersion ??
            null,

        blueprintKind:
            sourceBlueprint.kind ??
            null,

        garmentType:
            sourceBlueprint
                .garmentType ||
            "unknown",

        confidence:
            numberOr(
                sourceBlueprint.confidence
            ),

        sourceBlueprint,

        meshOptions:
            safeOptions
    };

    return group;
}

/*=========================================================
Dispose Garment Mesh
=========================================================*/

export function disposeGarmentMesh(
    object
) {
    if (!object?.traverse) {
        return;
    }

    const geometries =
        new Set();

    const materials =
        new Set();

    const textures =
        new Set();

    object.traverse(
        child => {
            if (child.geometry) {
                geometries.add(
                    child.geometry
                );
            }

            const childMaterials =
                Array.isArray(
                    child.material
                )
                    ? child.material
                    : child.material
                        ? [child.material]
                        : [];

            childMaterials.forEach(
                material => {
                    if (!material) {
                        return;
                    }

                    materials.add(material);

                    Object.values(
                        material
                    ).forEach(
                        value => {
                            if (
                                value?.isTexture
                            ) {
                                textures.add(
                                    value
                                );
                            }
                        }
                    );
                }
            );
        }
    );

    textures.forEach(
        texture =>
            texture.dispose()
    );

    materials.forEach(
        material =>
            material.dispose()
    );

    geometries.forEach(
        geometry =>
            geometry.dispose()
    );
}

/*=========================================================
Rebuild Existing Garment Mesh
=========================================================*/

export function rebuildGarmentMesh(
    existingMesh,
    blueprint,
    options = {}
) {
    if (existingMesh?.parent) {
        existingMesh.parent.remove(
            existingMesh
        );
    }

    disposeGarmentMesh(
        existingMesh
    );

    return buildGarmentMesh(
        blueprint,
        options
    );
}

/*=========================================================
Get Mesh Summary
=========================================================*/

export function getGarmentMeshSummary(
    object
) {
    if (!object?.traverse) {
        return {
            meshCount: 0,
            vertexCount: 0,
            triangleCount: 0,
            parts: []
        };
    }

    let meshCount =
        0;

    let vertexCount =
        0;

    let triangleCount =
        0;

    const parts = [];

    object.traverse(
        child => {
            if (!child.isMesh) {
                return;
            }

            meshCount++;

            const positionAttribute =
                child
                    .geometry
                    ?.getAttribute(
                        "position"
                    );

            const index =
                child.geometry?.index;

            const vertices =
                positionAttribute?.count ||
                0;

            const triangles =
                index
                    ? index.count / 3
                    : vertices / 3;

            vertexCount +=
                vertices;

            triangleCount +=
                triangles;

            parts.push({
                name:
                    child.name ||
                    `mesh-${meshCount}`,

                garmentPart:
                    child
                        .userData
                        ?.garmentPart ||
                    "unknown",

                reconstructionMethod:
                    child
                        .userData
                        ?.reconstructionMethod ||
                    null,

                side:
                    child
                        .userData
                        ?.side ||
                    null,

                holeCount:
                    numberOr(
                        child
                            .userData
                            ?.holeCount
                    ),

                sourcePointCount:
                    numberOr(
                        child
                            .userData
                            ?.sourcePointCount
                    ),

                contourPointCount:
                    numberOr(
                        child
                            .userData
                            ?.contourPointCount
                    ),

                vertices,

                triangles:
                    Math.round(
                        triangles
                    )
            });
        }
    );

    return {
        meshCount,

        vertexCount,

        triangleCount:
            Math.round(
                triangleCount
            ),

        parts
    };
}

/*=========================================================
Default Export
=========================================================*/

export default {
    DEFAULT_MESH_OPTIONS,

    clamp,

    normalizeMeshOptions,

    createGarmentMaterial,

    normalizeRelativeBox,

    getHintRelativeBox,

    relativeBoxToFrame,

    createPanelGeometry,

    buildTorsoMesh,

    buildSleeveMesh,

    buildNeckMesh,

    buildSkirtMesh,

    buildTrouserMeshes,

    buildLowerBody,

    getStructuralParts,

    getStructuralPoints,

    createConvexHull,

    buildSilhouetteMesh,

    centerGarmentGroup,

    buildGarmentMesh,

    rebuildGarmentMesh,

    disposeGarmentMesh,

    getGarmentMeshSummary
};