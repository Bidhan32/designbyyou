// Shared helpers and state kept separate from the React refresh boundary.

const DEFAULT_WIDTH =
    240;

const DEFAULT_HEIGHT =
    64;

const MINIMUM_DIMENSION =
    1;

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

function collectionToArray(
    collection
) {
    if (!collection) {
        return [];
    }

    if (
        Array.isArray(
            collection
        )
    ) {
        return collection;
    }

    if (
        typeof collection
            .toArray ===
        "function"
    ) {
        return collection
            .toArray();
    }

    const result =
        [];

    if (
        typeof collection.each ===
        "function"
    ) {
        collection.each(
            node => {
                result.push(
                    node
                );
            }
        );

        return result;
    }

    try {
        return [
            ...collection
        ];
    } catch {
        return result;
    }
}

function findTextObjectNode(
    stage,
    objectId
) {
    if (
        !stage ||
        !objectId
    ) {
        return null;
    }

    try {
        const namedNodes =
            collectionToArray(
                stage.find(
                    ".fashion-editor-text-object"
                )
            );

        const namedMatch =
            namedNodes.find(
                node =>
                    node?.getAttr?.(
                        "editorObjectId"
                    ) ===
                    objectId
            );

        if (namedMatch) {
            return namedMatch;
        }

        const objectNodes =
            collectionToArray(
                stage.find(
                    ".fashion-editor-object"
                )
            );

        return (
            objectNodes.find(
                node =>
                    node?.getAttr?.(
                        "editorObjectRoot"
                    ) ===
                        true &&
                    node?.getAttr?.(
                        "editorObjectId"
                    ) ===
                        objectId
            ) ||
            null
        );
    } catch {
        return null;
    }
}

function readAbsoluteMatrix(
    node
) {
    const transform =
        node
            ?.getAbsoluteTransform
            ?.();

    const matrix =
        transform
            ?.getMatrix
            ?.();

    if (
        !Array.isArray(
            matrix
        ) ||
        matrix.length <
            6
    ) {
        return [
            1,
            0,
            0,
            1,
            0,
            0
        ];
    }

    return matrix.map(
        value =>
            numberOr(
                value,
                0
            )
    );
}

function calculateTextOverlayLayout({
    stage,
    node,
    container,
    width,
    height
}) {
    if (
        !stage ||
        !node ||
        !container
    ) {
        return null;
    }

    const rectangle =
        container
            .getBoundingClientRect
            ?.();

    if (!rectangle) {
        return null;
    }

    const stageWidth =
        Math.max(
            1,
            numberOr(
                stage.width?.(),
                rectangle.width ||
                1
            )
        );

    const stageHeight =
        Math.max(
            1,
            numberOr(
                stage.height?.(),
                rectangle.height ||
                1
            )
        );

    const cssScaleX =
        rectangle.width /
        stageWidth;

    const cssScaleY =
        rectangle.height /
        stageHeight;

    const [
        a,
        b,
        c,
        d,
        e,
        f
    ] =
        readAbsoluteMatrix(
            node
        );

    return {
        left:
            rectangle.left,

        top:
            rectangle.top,

        width:
            Math.max(
                MINIMUM_DIMENSION,
                numberOr(
                    width,
                    DEFAULT_WIDTH
                )
            ),

        height:
            Math.max(
                MINIMUM_DIMENSION,
                numberOr(
                    height,
                    DEFAULT_HEIGHT
                )
            ),

        matrix: [
            a *
            cssScaleX,

            b *
            cssScaleY,

            c *
            cssScaleX,

            d *
            cssScaleY,

            e *
            cssScaleX,

            f *
            cssScaleY
        ]
    };
}

export { DEFAULT_WIDTH, DEFAULT_HEIGHT, MINIMUM_DIMENSION, numberOr, collectionToArray, findTextObjectNode, readAbsoluteMatrix, calculateTextOverlayLayout };
