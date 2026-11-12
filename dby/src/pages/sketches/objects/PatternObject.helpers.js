// Shared helpers and state kept separate from the React refresh boundary.

const PATTERN_RESOURCE_CACHE =
    new Map();

function clearPatternObjectCache(
    source =
        null
) {
    if (
        typeof source ===
            "string" &&
        source
    ) {
        PATTERN_RESOURCE_CACHE
            .delete(
                source
            );

        return;
    }

    PATTERN_RESOURCE_CACHE
        .clear();
}

export { PATTERN_RESOURCE_CACHE, clearPatternObjectCache };
