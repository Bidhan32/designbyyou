// Shared helpers and state kept separate from the React refresh boundary.

const SHAPE_PATTERN_RESOURCE_CACHE =
    new Map();

function clearShapePatternCache(
    source =
        null
) {
    if (
        typeof source ===
            "string" &&
        source
    ) {
        SHAPE_PATTERN_RESOURCE_CACHE
            .delete(
                source
            );

        return;
    }

    SHAPE_PATTERN_RESOURCE_CACHE
        .clear();
}

export { SHAPE_PATTERN_RESOURCE_CACHE, clearShapePatternCache };
