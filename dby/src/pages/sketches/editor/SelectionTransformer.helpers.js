// Shared helpers and state kept separate from the React refresh boundary.

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

function roundNumber(
    value,
    precision = 6
) {
    const multiplier =
        10 ** precision;

    return (
        Math.round(
            numberOr(value, 0) *
            multiplier
        ) /
        multiplier
    );
}

function normalizeScale(
    value
) {
    const scale =
        numberOr(
            value,
            1
        );

    if (
        Math.abs(scale) <
        0.0001
    ) {
        return scale < 0
            ? -0.0001
            : 0.0001;
    }

    return roundNumber(
        scale
    );
}

function normalizeRotation(
    rotation
) {
    let value =
        numberOr(
            rotation,
            0
        ) %
        360;

    if (
        value >
        180
    ) {
        value -=
            360;
    }

    if (
        value <
        -180
    ) {
        value +=
            360;
    }

    return roundNumber(
        value
    );
}

function isFunction(
    value
) {
    return (
        typeof value ===
        "function"
    );
}

function getNodeChildren(
    node
) {
    if (
        !node ||
        !isFunction(
            node.getChildren
        )
    ) {
        return [];
    }

    const children =
        node.getChildren();

    if (
        isFunction(
            children?.toArray
        )
    ) {
        return children
            .toArray();
    }

    try {
        return Array.from(
            children ||
            []
        );
    } catch {
        return [];
    }
}

function findKonvaNodeById(
    root,
    objectId
) {
    if (
        !root ||
        !objectId
    ) {
        return null;
    }

    if (
        isFunction(
            root.id
        ) &&
        root.id() ===
            objectId
    ) {
        return root;
    }

    const children =
        getNodeChildren(
            root
        );

    for (
        const child of children
    ) {
        const found =
            findKonvaNodeById(
                child,
                objectId
            );

        if (
            found
        ) {
            return found;
        }
    }

    return null;
}

function readNodeTransform(
    node
) {
    if (
        !node
    ) {
        return null;
    }

    return {
        x:
            roundNumber(
                node.x?.(),
                4
            ),

        y:
            roundNumber(
                node.y?.(),
                4
            ),

        rotation:
            normalizeRotation(
                node.rotation?.()
            ),

        scaleX:
            normalizeScale(
                node.scaleX?.()
            ),

        scaleY:
            normalizeScale(
                node.scaleY?.()
            ),

        skewX:
            roundNumber(
                node.skewX?.(),
                4
            ),

        skewY:
            roundNumber(
                node.skewY?.(),
                4
            ),

        offsetX:
            roundNumber(
                node.offsetX?.(),
                4
            ),

        offsetY:
            roundNumber(
                node.offsetY?.(),
                4
            )
    };
}

export { numberOr, roundNumber, normalizeScale, normalizeRotation, isFunction, getNodeChildren, findKonvaNodeById, readNodeTransform };
