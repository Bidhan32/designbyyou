// Shared helpers and state kept separate from the React refresh boundary.

const IMAGE_RESOURCE_CACHE = new Map();

function clearImageObjectCache(
    source = null
) {
    if (
        typeof source === "string" &&
        source
    ) {
        IMAGE_RESOURCE_CACHE.delete(
            source
        );

        return;
    }

    IMAGE_RESOURCE_CACHE.clear();
}

export { IMAGE_RESOURCE_CACHE, clearImageObjectCache };
