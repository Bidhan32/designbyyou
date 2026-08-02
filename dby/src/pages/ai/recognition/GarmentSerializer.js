/*
=========================================================
FashionVision AI
Garment Serializer
Version 1.0
=========================================================
*/

import {
    GARMENT_PARTS,
    GARMENT_TYPES
} from "./GarmentClassifier";

import {
    round
} from "../utils/MathUtils";

/*=========================================================
Serializer Constants
=========================================================*/

export const BLUEPRINT_VERSION = 1;

export const BLUEPRINT_KIND =
    "fashionvision-garment-blueprint";

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
    minimum = 0,
    maximum = 1
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

/*=========================================================
Canvas Normalization
=========================================================*/

export function normalizeCanvas(
    canvas = {}
) {

    const suppliedWidth =
        Number(canvas.width);

    const suppliedHeight =
        Number(canvas.height);

    return {

        width:
            suppliedWidth > 0
                ? suppliedWidth
                : 1000,

        height:
            suppliedHeight > 0
                ? suppliedHeight
                : 1000

    };

}

/*=========================================================
Bounding Box Normalization
=========================================================*/

export function normalizeBoundingBox(
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

        x:
            round(x, 2),

        y:
            round(y, 2),

        minX:
            round(x, 2),

        minY:
            round(y, 2),

        maxX:
            round(
                x + width,
                2
            ),

        maxY:
            round(
                y + height,
                2
            ),

        width:
            round(width, 2),

        height:
            round(height, 2),

        center: {

            x:
                round(
                    x +
                    width / 2,
                    2
                ),

            y:
                round(
                    y +
                    height / 2,
                    2
                )

        }

    };

}

/*=========================================================
Merge Bounding Boxes
=========================================================*/

export function mergeBoundingBoxes(
    boxes = []
) {

    const validBoxes =
        boxes
            .filter(Boolean)
            .map(
                normalizeBoundingBox
            );

    if (
        validBoxes.length === 0
    ) {

        return normalizeBoundingBox();

    }

    const minimumX =
        Math.min(
            ...validBoxes.map(
                box =>
                    box.minX
            )
        );

    const minimumY =
        Math.min(
            ...validBoxes.map(
                box =>
                    box.minY
            )
        );

    const maximumX =
        Math.max(
            ...validBoxes.map(
                box =>
                    box.maxX
            )
        );

    const maximumY =
        Math.max(
            ...validBoxes.map(
                box =>
                    box.maxY
            )
        );

    return normalizeBoundingBox({

        x:
            minimumX,

        y:
            minimumY,

        width:
            maximumX -
            minimumX,

        height:
            maximumY -
            minimumY

    });

}

/*=========================================================
Normalize Point to Canvas
=========================================================*/

export function normalizePoint(
    point = {},
    canvas = {}
) {

    const safeCanvas =
        normalizeCanvas(
            canvas
        );

    return {

        x:
            round(
                clamp(
                    numberOr(point.x) /
                    safeCanvas.width
                ),
                6
            ),

        y:
            round(
                clamp(
                    numberOr(point.y) /
                    safeCanvas.height
                ),
                6
            )

    };

}

/*=========================================================
Normalize Bounding Box to Canvas
=========================================================*/

export function normalizeBoxToCanvas(
    box = {},
    canvas = {}
) {

    const safeBox =
        normalizeBoundingBox(
            box
        );

    const safeCanvas =
        normalizeCanvas(
            canvas
        );

    return {

        x:
            round(
                clamp(
                    safeBox.x /
                    safeCanvas.width
                ),
                6
            ),

        y:
            round(
                clamp(
                    safeBox.y /
                    safeCanvas.height
                ),
                6
            ),

        width:
            round(
                clamp(
                    safeBox.width /
                    safeCanvas.width
                ),
                6
            ),

        height:
            round(
                clamp(
                    safeBox.height /
                    safeCanvas.height
                ),
                6
            ),

        center: {

            x:
                round(
                    clamp(
                        safeBox.center.x /
                        safeCanvas.width
                    ),
                    6
                ),

            y:
                round(
                    clamp(
                        safeBox.center.y /
                        safeCanvas.height
                    ),
                    6
                )

        }

    };

}

/*=========================================================
Normalize Box Relative to Garment
=========================================================*/

export function normalizeBoxToGarment(
    box = {},
    garmentBox = {}
) {

    const safeBox =
        normalizeBoundingBox(
            box
        );

    const safeGarmentBox =
        normalizeBoundingBox(
            garmentBox
        );

    return {

        x:
            round(
                clamp(
                    (
                        safeBox.x -
                        safeGarmentBox.x
                    ) /
                    Math.max(
                        safeGarmentBox.width,
                        1
                    )
                ),
                6
            ),

        y:
            round(
                clamp(
                    (
                        safeBox.y -
                        safeGarmentBox.y
                    ) /
                    Math.max(
                        safeGarmentBox.height,
                        1
                    )
                ),
                6
            ),

        width:
            round(
                clamp(
                    safeBox.width /
                    Math.max(
                        safeGarmentBox.width,
                        1
                    )
                ),
                6
            ),

        height:
            round(
                clamp(
                    safeBox.height /
                    Math.max(
                        safeGarmentBox.height,
                        1
                    )
                ),
                6
            ),

        center: {

            x:
                round(
                    clamp(
                        (
                            safeBox.center.x -
                            safeGarmentBox.x
                        ) /
                        Math.max(
                            safeGarmentBox.width,
                            1
                        )
                    ),
                    6
                ),

            y:
                round(
                    clamp(
                        (
                            safeBox.center.y -
                            safeGarmentBox.y
                        ) /
                        Math.max(
                            safeGarmentBox.height,
                            1
                        )
                    ),
                    6
                )

        }

    };

}

/*=========================================================
Create Assignment Index
=========================================================*/

export function createAssignmentMap(
    classification
) {

    const assignmentMap =
        new Map();

    const classifiedGroups =
        Array.isArray(
            classification?.groups
        )
            ? classification.groups
            : [];

    classifiedGroups.forEach(
        groupClassification => {

            const assignments =
                Array.isArray(
                    groupClassification
                        ?.assignments
                )
                    ? groupClassification
                        .assignments
                    : [];

            assignments.forEach(
                assignment => {

                    if (
                        assignment
                            ?.strokeId ===
                        undefined ||
                        assignment
                            ?.strokeId ===
                        null
                    ) {
                        return;
                    }

                    assignmentMap.set(
                        assignment.strokeId,
                        {
                            ...assignment,

                            groupId:
                                groupClassification
                                    ?.groupId ??
                                null
                        }
                    );

                }
            );

        }
    );

    return assignmentMap;

}

/*=========================================================
Infer Part Side
=========================================================*/

export function inferPartSide(
    analysis,
    garmentBox
) {

    const extractedSide =
        analysis
            ?.extracted
            ?.position
            ?.horizontal;

    if (
        [
            "left",
            "right",
            "center"
        ].includes(
            extractedSide
        )
    ) {

        return extractedSide;

    }

    const box =
        normalizeBoundingBox(
            analysis
                ?.geometry
                ?.boundingBox
        );

    const normalizedBox =
        normalizeBoxToGarment(
            box,
            garmentBox
        );

    if (
        normalizedBox.center.x <
        0.40
    ) {

        return "left";

    }

    if (
        normalizedBox.center.x >
        0.60
    ) {

        return "right";

    }

    return "center";

}

/*=========================================================
Serialize Stroke Points
=========================================================*/

function serializePoints(
    points = [],
    canvas = {}
) {

    if (!Array.isArray(points))
        return [];

    return points
        .filter(
            point =>
                point &&
                Number.isFinite(
                    Number(point.x)
                ) &&
                Number.isFinite(
                    Number(point.y)
                )
        )
        .map(
            point => {

                const absolutePoint = {

                    x:
                        round(
                            Number(point.x),
                            2
                        ),

                    y:
                        round(
                            Number(point.y),
                            2
                        )

                };

                return {

                    ...absolutePoint,

                    normalized:
                        normalizePoint(
                            absolutePoint,
                            canvas
                        )

                };

            }
        );

}

/*=========================================================
Serialize One Garment Part
=========================================================*/

export function serializePart(
    analysis,
    assignment,
    garmentBox,
    canvas,
    index = 0
) {

    if (!analysis)
        return null;

    const strokeId =
        analysis.id ??
        `stroke-${index + 1}`;

    const box =
        normalizeBoundingBox(
            analysis
                ?.geometry
                ?.boundingBox
        );

    const centroid = {

        x:
            round(
                numberOr(
                    analysis
                        ?.geometry
                        ?.centroid
                        ?.x,
                    box.center.x
                ),
                2
            ),

        y:
            round(
                numberOr(
                    analysis
                        ?.geometry
                        ?.centroid
                        ?.y,
                    box.center.y
                ),
                2
            )

    };

    const recognition =
        analysis.recognition || {};

    const features =
        analysis.features || {};

    const partType =
        assignment?.part ||
        recognition.garment ||
        GARMENT_PARTS.UNKNOWN;

    const confidence =
        clamp(
            assignment?.confidence ??
            recognition
                .garmentConfidence ??
            0
        );

    const groupId =
        assignment?.groupId ??
        recognition.groupId ??
        null;

    const side =
        inferPartSide(
            analysis,
            garmentBox
        );

    return {

        id:
            `part-${strokeId}`,

        strokeId,

        groupId,

        type:
            partType,

        side,

        confidence:
            round(
                confidence,
                3
            ),

        tags:
            [
                ...new Set([
                    ...(
                        Array.isArray(
                            assignment?.tags
                        )
                            ? assignment.tags
                            : []
                    ),

                    ...(
                        Array.isArray(
                            recognition.tags
                        )
                            ? recognition.tags
                            : []
                    )
                ])
            ],

        recognition: {

            shape:
                recognition.shape ||
                "unknown",

            shapeConfidence:
                round(
                    clamp(
                        recognition
                            .shapeConfidence
                    ),
                    3
                ),

            analysisConfidence:
                round(
                    clamp(
                        recognition
                            .analysisConfidence
                    ),
                    3
                ),

            confidence:
                round(
                    clamp(
                        recognition.confidence
                    ),
                    3
                )

        },

        geometry: {

            closed:
                Boolean(
                    analysis
                        ?.geometry
                        ?.isClosedShape
                ),

            strokeLength:
                round(
                    numberOr(
                        analysis
                            ?.geometry
                            ?.strokeLength
                    ),
                    2
                ),

            area:
                round(
                    numberOr(
                        analysis
                            ?.geometry
                            ?.area
                    ),
                    2
                ),

            perimeter:
                round(
                    numberOr(
                        analysis
                            ?.geometry
                            ?.perimeter
                    ),
                    2
                ),

            centroid,

            normalizedCentroid:
                normalizePoint(
                    centroid,
                    canvas
                ),

            boundingBox:
                box,

            normalizedBoundingBox:
                normalizeBoxToCanvas(
                    box,
                    canvas
                ),

            garmentRelativeBox:
                normalizeBoxToGarment(
                    box,
                    garmentBox
                ),

            points:
                serializePoints(
                    analysis
                        ?.geometry
                        ?.points,
                    canvas
                )

        },

        features: {

            orientation:
                features.orientation ||
                "unknown",

            aspectRatio:
                round(
                    numberOr(
                        features.aspectRatio
                    ),
                    4
                ),

            circularity:
                round(
                    clamp(
                        features.circularity
                    ),
                    4
                ),

            compactness:
                round(
                    clamp(
                        features.compactness
                    ),
                    4
                ),

            smoothness:
                round(
                    clamp(
                        features.smoothness
                    ),
                    4
                ),

            complexity:
                round(
                    clamp(
                        features.complexity
                    ),
                    4
                ),

            sharpCorners:
                Math.max(
                    0,
                    numberOr(
                        features.sharpCorners
                    )
                )

        },

        extracted: {

            position:
                analysis
                    ?.extracted
                    ?.position ||
                {},

            size:
                analysis
                    ?.extracted
                    ?.size ||
                {},

            orientation:
                analysis
                    ?.extracted
                    ?.orientation ||
                {},

            symmetry:
                analysis
                    ?.extracted
                    ?.symmetry ||
                {},

            style:
                analysis
                    ?.extracted
                    ?.style ||
                {}

        }

    };

}

/*=========================================================
Create Empty Component Collection
=========================================================*/

export function createComponentCollection() {

    return {

        outlines: [],

        bodices: [],

        sleeves: {
            left: [],
            right: [],
            center: []
        },

        necklines: [],

        collars: [],

        waistlines: [],

        hemlines: [],

        skirtPanels: [],

        trouserLegs: {
            left: [],
            right: [],
            center: []
        },

        pockets: [],

        buttons: [],

        seams: [],

        decorations: [],

        unknown: []

    };

}

/*=========================================================
Assign Part to Component Collection
=========================================================*/

export function addPartToComponents(
    components,
    part
) {

    if (
        !components ||
        !part
    ) {
        return;
    }

    switch (part.type) {

        case GARMENT_PARTS.OUTLINE:

            components.outlines.push(
                part.id
            );

            break;

        case GARMENT_PARTS.BODICE:

            components.bodices.push(
                part.id
            );

            break;

        case GARMENT_PARTS.SLEEVE:

            components.sleeves[
                part.side
            ]?.push(
                part.id
            );

            break;

        case GARMENT_PARTS.NECKLINE:

            components.necklines.push(
                part.id
            );

            break;

        case GARMENT_PARTS.COLLAR:

            components.collars.push(
                part.id
            );

            break;

        case GARMENT_PARTS.WAISTLINE:

            components.waistlines.push(
                part.id
            );

            break;

        case GARMENT_PARTS.HEMLINE:

            components.hemlines.push(
                part.id
            );

            break;

        case GARMENT_PARTS.SKIRT_PANEL:

            components.skirtPanels.push(
                part.id
            );

            break;

        case GARMENT_PARTS.TROUSER_LEG:

            components.trouserLegs[
                part.side
            ]?.push(
                part.id
            );

            break;

        case GARMENT_PARTS.POCKET:

            components.pockets.push(
                part.id
            );

            break;

        case GARMENT_PARTS.BUTTON:

            components.buttons.push(
                part.id
            );

            break;

        case GARMENT_PARTS.SEAM:

            components.seams.push(
                part.id
            );

            break;

        case GARMENT_PARTS.DECORATION:

            components.decorations.push(
                part.id
            );

            break;

        default:

            components.unknown.push(
                part.id
            );

    }

}

/*=========================================================
Count Part Types
=========================================================*/

function countPartTypes(
    parts = []
) {

    return parts.reduce(
        (
            counts,
            part
        ) => {

            const type =
                part?.type ||
                GARMENT_PARTS.UNKNOWN;

            counts[type] =
                numberOr(
                    counts[type]
                ) + 1;

            return counts;

        },
        {}
    );

}

/*=========================================================
Serialize One Group
=========================================================*/

export function serializeGroup(
    group,
    parts,
    canvas,
    index = 0
) {

    const groupId =
        group?.id ??
        `group-${index + 1}`;

    const groupParts =
        parts.filter(
            part =>
                part.groupId ===
                groupId
        );

    const groupBox =
        group?.boundingBox
            ? normalizeBoundingBox(
                group.boundingBox
            )
            : mergeBoundingBoxes(
                groupParts.map(
                    part =>
                        part
                            .geometry
                            .boundingBox
                )
            );

    const strokeIds =
        Array.isArray(
            group?.strokeIds
        )
            ? [...group.strokeIds]
            : Array.isArray(
                group?.strokes
            )
                ? group.strokes
                    .map(
                        stroke =>
                            stroke?.id
                    )
                    .filter(
                        value =>
                            value !==
                            undefined &&
                            value !==
                            null
                    )
                : [];

    return {

        id:
            groupId,

        type:
            group?.garment
                ?.garmentType ??
            group?.type ??
            GARMENT_TYPES.UNKNOWN,

        confidence:
            round(
                clamp(
                    group?.garment
                        ?.confidence ??
                    group?.confidence ??
                    0
                ),
                3
            ),

        strokeIds,

        partIds:
            groupParts.map(
                part =>
                    part.id
            ),

        strokeCount:
            strokeIds.length,

        partCount:
            groupParts.length,

        partCounts:
            countPartTypes(
                groupParts
            ),

        boundingBox:
            groupBox,

        normalizedBoundingBox:
            normalizeBoxToCanvas(
                groupBox,
                canvas
            )

    };

}

/*=========================================================
Find Parts by IDs
=========================================================*/

function findPartsByIds(
    partIds,
    partMap
) {

    return partIds
        .map(
            partId =>
                partMap.get(
                    partId
                )
        )
        .filter(Boolean);

}

/*=========================================================
Create Construction Hint
=========================================================*/

function createConstructionHint(
    partIds,
    partMap,
    garmentBox,
    canvas
) {

    const parts =
        findPartsByIds(
            partIds,
            partMap
        );

    const boundingBox =
        mergeBoundingBoxes(
            parts.map(
                part =>
                    part
                        .geometry
                        .boundingBox
            )
        );

    return {

        present:
            parts.length > 0,

        partIds:
            parts.map(
                part =>
                    part.id
            ),

        count:
            parts.length,

        boundingBox,

        normalizedBoundingBox:
            normalizeBoxToCanvas(
                boundingBox,
                canvas
            ),

        garmentRelativeBox:
            normalizeBoxToGarment(
                boundingBox,
                garmentBox
            ),

        averageConfidence:
            parts.length > 0
                ? round(
                    parts.reduce(
                        (
                            total,
                            part
                        ) =>
                            total +
                            part.confidence,
                        0
                    ) /
                    parts.length,
                    3
                )
                : 0

    };

}

/*=========================================================
Create Construction Hints
=========================================================*/

export function createConstructionHints(
    components,
    parts,
    garmentType,
    garmentBox,
    canvas
) {

    const partMap =
        new Map(
            parts.map(
                part => [
                    part.id,
                    part
                ]
            )
        );

    const torsoPartIds = [
        ...components.bodices,
        ...components.outlines
    ];

    const neckPartIds = [
        ...components.necklines,
        ...components.collars
    ];

    const lowerBodyPartIds = [
        ...components.skirtPanels,

        ...components
            .trouserLegs
            .left,

        ...components
            .trouserLegs
            .right,

        ...components
            .trouserLegs
            .center
    ];

    let lowerBodyMode =
        "unknown";

    if (
        components
            .skirtPanels
            .length > 0 ||
        garmentType ===
            GARMENT_TYPES.SKIRT ||
        garmentType ===
            GARMENT_TYPES.DRESS
    ) {

        lowerBodyMode =
            "skirt";

    } else if (
        components
            .trouserLegs
            .left
            .length > 0 ||
        components
            .trouserLegs
            .right
            .length > 0 ||
        garmentType ===
            GARMENT_TYPES.TROUSERS
    ) {

        lowerBodyMode =
            "trousers";

    }

    const detailPartIds = [
        ...components.pockets,
        ...components.buttons,
        ...components.seams,
        ...components.decorations
    ];

    return {

        torso:
            createConstructionHint(
                torsoPartIds,
                partMap,
                garmentBox,
                canvas
            ),

        neck:
            createConstructionHint(
                neckPartIds,
                partMap,
                garmentBox,
                canvas
            ),

        sleeves: {

            left:
                createConstructionHint(
                    components
                        .sleeves
                        .left,
                    partMap,
                    garmentBox,
                    canvas
                ),

            right:
                createConstructionHint(
                    components
                        .sleeves
                        .right,
                    partMap,
                    garmentBox,
                    canvas
                ),

            center:
                createConstructionHint(
                    components
                        .sleeves
                        .center,
                    partMap,
                    garmentBox,
                    canvas
                )

        },

        lowerBody: {

            mode:
                lowerBodyMode,

            ...createConstructionHint(
                lowerBodyPartIds,
                partMap,
                garmentBox,
                canvas
            )

        },

        waist:
            createConstructionHint(
                components.waistlines,
                partMap,
                garmentBox,
                canvas
            ),

        hem:
            createConstructionHint(
                components.hemlines,
                partMap,
                garmentBox,
                canvas
            ),

        details:
            createConstructionHint(
                detailPartIds,
                partMap,
                garmentBox,
                canvas
            ),

        symmetry: {

            hasLeftSleeve:
                components
                    .sleeves
                    .left
                    .length > 0,

            hasRightSleeve:
                components
                    .sleeves
                    .right
                    .length > 0,

            balancedSleeves:
                components
                    .sleeves
                    .left
                    .length ===
                components
                    .sleeves
                    .right
                    .length

        }

    };

}

/*=========================================================
Serialize Complete Garment
=========================================================*/

export function serializeGarment({

    classification = null,

    groups = [],

    analyses = [],

    canvas = {}

} = {}) {

    const safeCanvas =
        normalizeCanvas(
            canvas
        );

    const safeAnalyses =
        Array.isArray(
            analyses
        )
            ? analyses
                .filter(Boolean)
            : [];

    const safeGroups =
        Array.isArray(
            groups
        )
            ? groups
                .filter(Boolean)
            : [];

    const garmentBox =
        mergeBoundingBoxes(
            safeAnalyses.map(
                analysis =>
                    analysis
                        ?.geometry
                        ?.boundingBox
            )
        );

    const assignmentMap =
        createAssignmentMap(
            classification
        );

    const parts =
        safeAnalyses
            .map(
                (
                    analysis,
                    index
                ) => {

                    const assignment =
                        assignmentMap.get(
                            analysis.id
                        );

                    return serializePart(
                        analysis,
                        assignment,
                        garmentBox,
                        safeCanvas,
                        index
                    );

                }
            )
            .filter(Boolean);

    const components =
        createComponentCollection();

    parts.forEach(
        part => {

            addPartToComponents(
                components,
                part
            );

        }
    );

    const serializedGroups =
        safeGroups.map(
            (
                group,
                index
            ) =>
                serializeGroup(
                    group,
                    parts,
                    safeCanvas,
                    index
                )
        );

    const garmentType =
        classification
            ?.garmentType ||
        GARMENT_TYPES.UNKNOWN;

    const confidence =
        round(
            clamp(
                classification
                    ?.confidence
            ),
            3
        );

    const constructionHints =
        createConstructionHints(
            components,
            parts,
            garmentType,
            garmentBox,
            safeCanvas
        );

    return {

        blueprintVersion:
            BLUEPRINT_VERSION,

        kind:
            BLUEPRINT_KIND,

        garmentType,

        confidence,

        canvas:
            safeCanvas,

        bounds: {

            absolute:
                garmentBox,

            normalized:
                normalizeBoxToCanvas(
                    garmentBox,
                    safeCanvas
                )

        },

        metrics: {

            strokeCount:
                safeAnalyses.length,

            groupCount:
                serializedGroups.length,

            partCount:
                parts.length,

            width:
                garmentBox.width,

            height:
                garmentBox.height,

            aspectRatio:
                round(
                    garmentBox.width /
                    Math.max(
                        garmentBox.height,
                        1
                    ),
                    4
                ),

            tallRatio:
                round(
                    garmentBox.height /
                    Math.max(
                        garmentBox.width,
                        1
                    ),
                    4
                )

        },

        partCounts:
            countPartTypes(
                parts
            ),

        components,

        constructionHints,

        parts,

        groups:
            serializedGroups,

        source: {

            analysisIds:
                safeAnalyses.map(
                    analysis =>
                        analysis.id
                ),

            groupIds:
                serializedGroups.map(
                    group =>
                        group.id
                )

        },

        generatedAt:
            Date.now()

    };

}

/*=========================================================
Validate Serialized Blueprint
=========================================================*/

export function validateBlueprint(
    blueprint
) {

    const errors = [];

    if (!blueprint) {

        errors.push(
            "Blueprint is missing."
        );

    }

    if (
        blueprint?.kind !==
        BLUEPRINT_KIND
    ) {

        errors.push(
            "Blueprint kind is invalid."
        );

    }

    if (
        blueprint?.blueprintVersion !==
        BLUEPRINT_VERSION
    ) {

        errors.push(
            "Blueprint version is unsupported."
        );

    }

    if (
        !Number.isFinite(
            Number(
                blueprint
                    ?.canvas
                    ?.width
            )
        ) ||
        Number(
            blueprint
                ?.canvas
                ?.width
        ) <= 0
    ) {

        errors.push(
            "Canvas width is invalid."
        );

    }

    if (
        !Number.isFinite(
            Number(
                blueprint
                    ?.canvas
                    ?.height
            )
        ) ||
        Number(
            blueprint
                ?.canvas
                ?.height
        ) <= 0
    ) {

        errors.push(
            "Canvas height is invalid."
        );

    }

    if (
        !Array.isArray(
            blueprint?.parts
        )
    ) {

        errors.push(
            "Blueprint parts must be an array."
        );

    }

    if (
        !Array.isArray(
            blueprint?.groups
        )
    ) {

        errors.push(
            "Blueprint groups must be an array."
        );

    }

    return {

        valid:
            errors.length === 0,

        errors

    };

}

/*=========================================================
Default Export
=========================================================*/

export default {

    BLUEPRINT_VERSION,

    BLUEPRINT_KIND,

    normalizeCanvas,

    normalizeBoundingBox,

    mergeBoundingBoxes,

    normalizePoint,

    normalizeBoxToCanvas,

    normalizeBoxToGarment,

    createAssignmentMap,

    inferPartSide,

    serializePart,

    createComponentCollection,

    addPartToComponents,

    serializeGroup,

    createConstructionHints,

    serializeGarment,

    validateBlueprint

};