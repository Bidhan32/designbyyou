// Shared helpers and state kept separate from the React refresh boundary.

function isObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isGarmentBlueprint(
    value
) {
    if (!isObject(value)) {
        return false;
    }

    return Boolean(
        value.kind ===
            "fashionvision-garment-blueprint" ||
        Array.isArray(value.parts) ||
        value.constructionHints ||
        value.bounds
    );
}

function resolveViewerBlueprint(
    value
) {
    if (!isObject(value)) {
        return null;
    }

    const candidates = [
        value.garmentBlueprint,

        value.blueprint
            ?.garmentBlueprint,

        value.data
            ?.garmentBlueprint,

        value.result
            ?.garmentBlueprint,

        value.localBlueprint,

        value.blueprint,

        value
    ];

    const recognizedBlueprint =
        candidates.find(
            candidate =>
                isGarmentBlueprint(
                    candidate
                )
        );

    if (recognizedBlueprint) {
        return recognizedBlueprint;
    }

    /*
    Allow MeshBuilder to validate an unfamiliar server
    blueprint instead of rejecting it inside Viewer.
    */

    return value;
}

export { isObject, isGarmentBlueprint, resolveViewerBlueprint };
