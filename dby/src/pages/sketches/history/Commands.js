/*
=========================================================
FashionVision Professional Editor
Command Definitions
Version 1.0
=========================================================
*/

/*=========================================================
Command Schema
=========================================================*/

export const COMMAND_SCHEMA_VERSION = 1;

/*=========================================================
Command Categories
=========================================================*/

export const COMMAND_CATEGORIES = Object.freeze({
    DOCUMENT: "document",
    OBJECT: "object",
    LAYER: "layer",
    SELECTION: "selection",
    CLIPBOARD: "clipboard",
    VIEWPORT: "viewport",
    TOOL: "tool",
    STYLE: "style",
    HISTORY: "history",
    SYSTEM: "system"
});

/*=========================================================
Command Types
=========================================================*/

export const COMMAND_TYPES = Object.freeze({

    /*---------------------------------------------
    Document Commands
    ---------------------------------------------*/

    NEW_DOCUMENT:
        "document/new",

    CLEAR_DOCUMENT:
        "document/clear",

    UPDATE_DOCUMENT:
        "document/update",

    RENAME_DOCUMENT:
        "document/rename",

    RESIZE_DOCUMENT:
        "document/resize",

    SET_DOCUMENT_BACKGROUND:
        "document/set-background",

    LOAD_PROJECT:
        "document/load-project",

    /*---------------------------------------------
    Object Commands
    ---------------------------------------------*/

    ADD_OBJECT:
        "object/add",

    ADD_OBJECTS:
        "object/add-many",

    UPDATE_OBJECT:
        "object/update",

    UPDATE_OBJECTS:
        "object/update-many",

    DELETE_OBJECTS:
        "object/delete",

    DUPLICATE_OBJECTS:
        "object/duplicate",

    MOVE_OBJECTS:
        "object/move",

    TRANSFORM_OBJECTS:
        "object/transform",

    MOVE_OBJECT_TO_LAYER:
        "object/move-to-layer",

    REORDER_OBJECT:
        "object/reorder",

    BRING_TO_FRONT:
        "object/bring-to-front",

    SEND_TO_BACK:
        "object/send-to-back",

    GROUP_OBJECTS:
        "object/group",

    UNGROUP_OBJECTS:
        "object/ungroup",

    /*---------------------------------------------
    Layer Commands
    ---------------------------------------------*/

    ADD_LAYER:
        "layer/add",

    UPDATE_LAYER:
        "layer/update",

    RENAME_LAYER:
        "layer/rename",

    DELETE_LAYER:
        "layer/delete",

    DUPLICATE_LAYER:
        "layer/duplicate",

    REORDER_LAYER:
        "layer/reorder",

    SET_ACTIVE_LAYER:
        "layer/set-active",

    TOGGLE_LAYER_VISIBILITY:
        "layer/toggle-visibility",

    TOGGLE_LAYER_LOCK:
        "layer/toggle-lock",

    SET_LAYER_OPACITY:
        "layer/set-opacity",

    SET_LAYER_BLEND_MODE:
        "layer/set-blend-mode",

    /*---------------------------------------------
    Selection Commands
    ---------------------------------------------*/

    SELECT_OBJECTS:
        "selection/select",

    TOGGLE_OBJECT_SELECTION:
        "selection/toggle",

    SELECT_ALL:
        "selection/select-all",

    CLEAR_SELECTION:
        "selection/clear",

    /*---------------------------------------------
    Clipboard Commands
    ---------------------------------------------*/

    COPY_OBJECTS:
        "clipboard/copy",

    CUT_OBJECTS:
        "clipboard/cut",

    PASTE_OBJECTS:
        "clipboard/paste",

    /*---------------------------------------------
    Viewport Commands
    ---------------------------------------------*/

    SET_VIEWPORT:
        "viewport/set",

    SET_ZOOM:
        "viewport/set-zoom",

    ZOOM_IN:
        "viewport/zoom-in",

    ZOOM_OUT:
        "viewport/zoom-out",

    PAN_VIEWPORT:
        "viewport/pan",

    RESET_VIEWPORT:
        "viewport/reset",

    FIT_DOCUMENT:
        "viewport/fit-document",

    /*---------------------------------------------
    Tool Commands
    ---------------------------------------------*/

    SET_ACTIVE_TOOL:
        "tool/set-active",

    SET_BRUSH_SETTINGS:
        "tool/set-brush-settings",

    SET_SHAPE_SETTINGS:
        "tool/set-shape-settings",

    SET_FILL_SETTINGS:
        "tool/set-fill-settings",

    SET_TEXT_SETTINGS:
        "tool/set-text-settings",

    /*---------------------------------------------
    Colour and Style Commands
    ---------------------------------------------*/

    SET_PRIMARY_COLOR:
        "style/set-primary-color",

    SET_SECONDARY_COLOR:
        "style/set-secondary-color",

    SWAP_COLORS:
        "style/swap-colors",

    APPLY_FILL:
        "style/apply-fill",

    APPLY_STROKE:
        "style/apply-stroke",

    APPLY_PATTERN:
        "style/apply-pattern",

    /*---------------------------------------------
    History Commands
    ---------------------------------------------*/

    UNDO:
        "history/undo",

    REDO:
        "history/redo",

    BEGIN_TRANSACTION:
        "history/begin-transaction",

    COMMIT_TRANSACTION:
        "history/commit-transaction",

    CANCEL_TRANSACTION:
        "history/cancel-transaction",

    CLEAR_HISTORY:
        "history/clear"
});

/*=========================================================
Backward-Compatible Alias
=========================================================*/

export const COMMANDS =
    COMMAND_TYPES;

/*=========================================================
Default Command Labels
=========================================================*/

export const COMMAND_LABELS = Object.freeze({

    [COMMAND_TYPES.NEW_DOCUMENT]:
        "New document",

    [COMMAND_TYPES.CLEAR_DOCUMENT]:
        "Clear document",

    [COMMAND_TYPES.UPDATE_DOCUMENT]:
        "Update document",

    [COMMAND_TYPES.RENAME_DOCUMENT]:
        "Rename document",

    [COMMAND_TYPES.RESIZE_DOCUMENT]:
        "Resize document",

    [COMMAND_TYPES.SET_DOCUMENT_BACKGROUND]:
        "Change document background",

    [COMMAND_TYPES.LOAD_PROJECT]:
        "Load project",

    [COMMAND_TYPES.ADD_OBJECT]:
        "Add object",

    [COMMAND_TYPES.ADD_OBJECTS]:
        "Add objects",

    [COMMAND_TYPES.UPDATE_OBJECT]:
        "Update object",

    [COMMAND_TYPES.UPDATE_OBJECTS]:
        "Update objects",

    [COMMAND_TYPES.DELETE_OBJECTS]:
        "Delete objects",

    [COMMAND_TYPES.DUPLICATE_OBJECTS]:
        "Duplicate objects",

    [COMMAND_TYPES.MOVE_OBJECTS]:
        "Move objects",

    [COMMAND_TYPES.TRANSFORM_OBJECTS]:
        "Transform objects",

    [COMMAND_TYPES.MOVE_OBJECT_TO_LAYER]:
        "Move object to layer",

    [COMMAND_TYPES.REORDER_OBJECT]:
        "Reorder object",

    [COMMAND_TYPES.BRING_TO_FRONT]:
        "Bring object to front",

    [COMMAND_TYPES.SEND_TO_BACK]:
        "Send object to back",

    [COMMAND_TYPES.GROUP_OBJECTS]:
        "Group objects",

    [COMMAND_TYPES.UNGROUP_OBJECTS]:
        "Ungroup objects",

    [COMMAND_TYPES.ADD_LAYER]:
        "Add layer",

    [COMMAND_TYPES.UPDATE_LAYER]:
        "Update layer",

    [COMMAND_TYPES.RENAME_LAYER]:
        "Rename layer",

    [COMMAND_TYPES.DELETE_LAYER]:
        "Delete layer",

    [COMMAND_TYPES.DUPLICATE_LAYER]:
        "Duplicate layer",

    [COMMAND_TYPES.REORDER_LAYER]:
        "Reorder layer",

    [COMMAND_TYPES.SET_ACTIVE_LAYER]:
        "Set active layer",

    [COMMAND_TYPES.TOGGLE_LAYER_VISIBILITY]:
        "Toggle layer visibility",

    [COMMAND_TYPES.TOGGLE_LAYER_LOCK]:
        "Toggle layer lock",

    [COMMAND_TYPES.SET_LAYER_OPACITY]:
        "Change layer opacity",

    [COMMAND_TYPES.SET_LAYER_BLEND_MODE]:
        "Change layer blend mode",

    [COMMAND_TYPES.SELECT_OBJECTS]:
        "Select objects",

    [COMMAND_TYPES.TOGGLE_OBJECT_SELECTION]:
        "Toggle object selection",

    [COMMAND_TYPES.SELECT_ALL]:
        "Select all objects",

    [COMMAND_TYPES.CLEAR_SELECTION]:
        "Clear selection",

    [COMMAND_TYPES.COPY_OBJECTS]:
        "Copy objects",

    [COMMAND_TYPES.CUT_OBJECTS]:
        "Cut objects",

    [COMMAND_TYPES.PASTE_OBJECTS]:
        "Paste objects",

    [COMMAND_TYPES.SET_VIEWPORT]:
        "Change viewport",

    [COMMAND_TYPES.SET_ZOOM]:
        "Change zoom",

    [COMMAND_TYPES.ZOOM_IN]:
        "Zoom in",

    [COMMAND_TYPES.ZOOM_OUT]:
        "Zoom out",

    [COMMAND_TYPES.PAN_VIEWPORT]:
        "Pan viewport",

    [COMMAND_TYPES.RESET_VIEWPORT]:
        "Reset viewport",

    [COMMAND_TYPES.FIT_DOCUMENT]:
        "Fit document to viewport",

    [COMMAND_TYPES.SET_ACTIVE_TOOL]:
        "Change tool",

    [COMMAND_TYPES.SET_BRUSH_SETTINGS]:
        "Change brush settings",

    [COMMAND_TYPES.SET_SHAPE_SETTINGS]:
        "Change shape settings",

    [COMMAND_TYPES.SET_FILL_SETTINGS]:
        "Change fill settings",

    [COMMAND_TYPES.SET_TEXT_SETTINGS]:
        "Change text settings",

    [COMMAND_TYPES.SET_PRIMARY_COLOR]:
        "Change primary colour",

    [COMMAND_TYPES.SET_SECONDARY_COLOR]:
        "Change secondary colour",

    [COMMAND_TYPES.SWAP_COLORS]:
        "Swap colours",

    [COMMAND_TYPES.APPLY_FILL]:
        "Apply fill",

    [COMMAND_TYPES.APPLY_STROKE]:
        "Apply stroke",

    [COMMAND_TYPES.APPLY_PATTERN]:
        "Apply pattern",

    [COMMAND_TYPES.UNDO]:
        "Undo",

    [COMMAND_TYPES.REDO]:
        "Redo",

    [COMMAND_TYPES.BEGIN_TRANSACTION]:
        "Begin history transaction",

    [COMMAND_TYPES.COMMIT_TRANSACTION]:
        "Commit history transaction",

    [COMMAND_TYPES.CANCEL_TRANSACTION]:
        "Cancel history transaction",

    [COMMAND_TYPES.CLEAR_HISTORY]:
        "Clear history"
});

/*=========================================================
Command Category Map
=========================================================*/

export const COMMAND_CATEGORY_MAP = Object.freeze({

    [COMMAND_TYPES.NEW_DOCUMENT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.CLEAR_DOCUMENT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.UPDATE_DOCUMENT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.RENAME_DOCUMENT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.RESIZE_DOCUMENT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.SET_DOCUMENT_BACKGROUND]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.LOAD_PROJECT]:
        COMMAND_CATEGORIES.DOCUMENT,

    [COMMAND_TYPES.ADD_OBJECT]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.ADD_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.UPDATE_OBJECT]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.UPDATE_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.DELETE_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.DUPLICATE_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.MOVE_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.TRANSFORM_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.MOVE_OBJECT_TO_LAYER]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.REORDER_OBJECT]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.BRING_TO_FRONT]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.SEND_TO_BACK]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.GROUP_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.UNGROUP_OBJECTS]:
        COMMAND_CATEGORIES.OBJECT,

    [COMMAND_TYPES.ADD_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.UPDATE_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.RENAME_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.DELETE_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.DUPLICATE_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.REORDER_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.SET_ACTIVE_LAYER]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.TOGGLE_LAYER_VISIBILITY]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.TOGGLE_LAYER_LOCK]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.SET_LAYER_OPACITY]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.SET_LAYER_BLEND_MODE]:
        COMMAND_CATEGORIES.LAYER,

    [COMMAND_TYPES.SELECT_OBJECTS]:
        COMMAND_CATEGORIES.SELECTION,

    [COMMAND_TYPES.TOGGLE_OBJECT_SELECTION]:
        COMMAND_CATEGORIES.SELECTION,

    [COMMAND_TYPES.SELECT_ALL]:
        COMMAND_CATEGORIES.SELECTION,

    [COMMAND_TYPES.CLEAR_SELECTION]:
        COMMAND_CATEGORIES.SELECTION,

    [COMMAND_TYPES.COPY_OBJECTS]:
        COMMAND_CATEGORIES.CLIPBOARD,

    [COMMAND_TYPES.CUT_OBJECTS]:
        COMMAND_CATEGORIES.CLIPBOARD,

    [COMMAND_TYPES.PASTE_OBJECTS]:
        COMMAND_CATEGORIES.CLIPBOARD,

    [COMMAND_TYPES.SET_VIEWPORT]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.SET_ZOOM]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.ZOOM_IN]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.ZOOM_OUT]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.PAN_VIEWPORT]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.RESET_VIEWPORT]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.FIT_DOCUMENT]:
        COMMAND_CATEGORIES.VIEWPORT,

    [COMMAND_TYPES.SET_ACTIVE_TOOL]:
        COMMAND_CATEGORIES.TOOL,

    [COMMAND_TYPES.SET_BRUSH_SETTINGS]:
        COMMAND_CATEGORIES.TOOL,

    [COMMAND_TYPES.SET_SHAPE_SETTINGS]:
        COMMAND_CATEGORIES.TOOL,

    [COMMAND_TYPES.SET_FILL_SETTINGS]:
        COMMAND_CATEGORIES.TOOL,

    [COMMAND_TYPES.SET_TEXT_SETTINGS]:
        COMMAND_CATEGORIES.TOOL,

    [COMMAND_TYPES.SET_PRIMARY_COLOR]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.SET_SECONDARY_COLOR]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.SWAP_COLORS]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.APPLY_FILL]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.APPLY_STROKE]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.APPLY_PATTERN]:
        COMMAND_CATEGORIES.STYLE,

    [COMMAND_TYPES.UNDO]:
        COMMAND_CATEGORIES.HISTORY,

    [COMMAND_TYPES.REDO]:
        COMMAND_CATEGORIES.HISTORY,

    [COMMAND_TYPES.BEGIN_TRANSACTION]:
        COMMAND_CATEGORIES.HISTORY,

    [COMMAND_TYPES.COMMIT_TRANSACTION]:
        COMMAND_CATEGORIES.HISTORY,

    [COMMAND_TYPES.CANCEL_TRANSACTION]:
        COMMAND_CATEGORIES.HISTORY,

    [COMMAND_TYPES.CLEAR_HISTORY]:
        COMMAND_CATEGORIES.HISTORY
});

/*=========================================================
Undoable Commands
=========================================================*/

const UNDOABLE_COMMANDS = new Set([
    COMMAND_TYPES.CLEAR_DOCUMENT,

    COMMAND_TYPES.UPDATE_DOCUMENT,
    COMMAND_TYPES.RENAME_DOCUMENT,
    COMMAND_TYPES.RESIZE_DOCUMENT,
    COMMAND_TYPES.SET_DOCUMENT_BACKGROUND,

    COMMAND_TYPES.ADD_OBJECT,
    COMMAND_TYPES.ADD_OBJECTS,
    COMMAND_TYPES.UPDATE_OBJECT,
    COMMAND_TYPES.UPDATE_OBJECTS,
    COMMAND_TYPES.DELETE_OBJECTS,
    COMMAND_TYPES.DUPLICATE_OBJECTS,
    COMMAND_TYPES.MOVE_OBJECTS,
    COMMAND_TYPES.TRANSFORM_OBJECTS,
    COMMAND_TYPES.MOVE_OBJECT_TO_LAYER,
    COMMAND_TYPES.REORDER_OBJECT,
    COMMAND_TYPES.BRING_TO_FRONT,
    COMMAND_TYPES.SEND_TO_BACK,
    COMMAND_TYPES.GROUP_OBJECTS,
    COMMAND_TYPES.UNGROUP_OBJECTS,

    COMMAND_TYPES.ADD_LAYER,
    COMMAND_TYPES.UPDATE_LAYER,
    COMMAND_TYPES.RENAME_LAYER,
    COMMAND_TYPES.DELETE_LAYER,
    COMMAND_TYPES.DUPLICATE_LAYER,
    COMMAND_TYPES.REORDER_LAYER,
    COMMAND_TYPES.TOGGLE_LAYER_VISIBILITY,
    COMMAND_TYPES.TOGGLE_LAYER_LOCK,
    COMMAND_TYPES.SET_LAYER_OPACITY,
    COMMAND_TYPES.SET_LAYER_BLEND_MODE,

    COMMAND_TYPES.CUT_OBJECTS,
    COMMAND_TYPES.PASTE_OBJECTS,

    COMMAND_TYPES.APPLY_FILL,
    COMMAND_TYPES.APPLY_STROKE,
    COMMAND_TYPES.APPLY_PATTERN
]);

/*=========================================================
Mergeable Commands
=========================================================*/

const MERGEABLE_COMMANDS = new Set([
    COMMAND_TYPES.UPDATE_OBJECT,
    COMMAND_TYPES.UPDATE_OBJECTS,
    COMMAND_TYPES.MOVE_OBJECTS,
    COMMAND_TYPES.TRANSFORM_OBJECTS,
    COMMAND_TYPES.SET_LAYER_OPACITY,
    COMMAND_TYPES.SET_VIEWPORT,
    COMMAND_TYPES.SET_ZOOM,
    COMMAND_TYPES.PAN_VIEWPORT
]);

/*=========================================================
General Helpers
=========================================================*/

function nowIso() {
    return new Date().toISOString();
}

function createId(
    prefix = "command"
) {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return (
        `${prefix}-${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function cloneSerializable(
    value
) {
    if (
        value === undefined
    ) {
        return undefined;
    }

    if (
        typeof globalThis.structuredClone ===
        "function"
    ) {
        try {
            return globalThis.structuredClone(
                value
            );
        } catch {
            // Fall back to JSON cloning.
        }
    }

    try {
        return JSON.parse(
            JSON.stringify(value)
        );
    } catch {
        return value;
    }
}

function uniqueIds(
    values = []
) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [
        ...new Set(
            values.filter(
                value =>
                    typeof value ===
                        "string" &&
                    value.length > 0
            )
        )
    ];
}

/*=========================================================
Command Type Helpers
=========================================================*/

export function isKnownCommandType(
    type
) {
    return Object.values(
        COMMAND_TYPES
    ).includes(type);
}

export function getCommandCategory(
    type
) {
    return (
        COMMAND_CATEGORY_MAP[type] ||
        COMMAND_CATEGORIES.SYSTEM
    );
}

export function getCommandLabel(
    type,
    fallback = "Editor change"
) {
    return (
        COMMAND_LABELS[type] ||
        fallback
    );
}

export function isUndoableCommand(
    commandOrType
) {
    const type =
        typeof commandOrType ===
            "string"
            ? commandOrType
            : commandOrType?.type;

    return UNDOABLE_COMMANDS.has(
        type
    );
}

export function isMergeableCommand(
    commandOrType
) {
    const type =
        typeof commandOrType ===
            "string"
            ? commandOrType
            : commandOrType?.type;

    return MERGEABLE_COMMANDS.has(
        type
    );
}

/*=========================================================
Create Command
=========================================================*/

export function createCommand(
    type,
    payload = {},
    options = {}
) {
    if (!isKnownCommandType(type)) {
        throw new Error(
            `Unknown editor command type: ${String(type)}`
        );
    }

    const safePayload =
        isPlainObject(payload)
            ? cloneSerializable(payload)
            : {};

    const undoable =
        options.undoable ??
        isUndoableCommand(type);

    return {
        schemaVersion:
            COMMAND_SCHEMA_VERSION,

        id:
            options.id ||
            createId("command"),

        type,

        category:
            options.category ||
            getCommandCategory(type),

        label:
            options.label ||
            getCommandLabel(type),

        timestamp:
            options.timestamp ||
            nowIso(),

        payload:
            safePayload,

        undoable:
            Boolean(undoable),

        mergeable:
            options.mergeable ??
            isMergeableCommand(type),

        mergeKey:
            typeof options.mergeKey ===
                "string"
                ? options.mergeKey
                : null,

        source:
            options.source ||
            "editor",

        transactionId:
            options.transactionId ||
            null,

        metadata:
            isPlainObject(
                options.metadata
            )
                ? cloneSerializable(
                    options.metadata
                )
                : {}
    };
}

/*=========================================================
Validate Command
=========================================================*/

export function validateCommand(
    command
) {
    const errors = [];

    if (!isPlainObject(command)) {
        return {
            valid:
                false,

            errors: [
                "Command must be an object."
            ]
        };
    }

    if (
        command.schemaVersion !==
        COMMAND_SCHEMA_VERSION
    ) {
        errors.push(
            "Command schema version is unsupported."
        );
    }

    if (
        typeof command.id !==
            "string" ||
        !command.id
    ) {
        errors.push(
            "Command ID is missing."
        );
    }

    if (
        !isKnownCommandType(
            command.type
        )
    ) {
        errors.push(
            "Command type is invalid."
        );
    }

    if (
        typeof command.label !==
            "string"
    ) {
        errors.push(
            "Command label is invalid."
        );
    }

    if (
        !isPlainObject(
            command.payload
        )
    ) {
        errors.push(
            "Command payload must be an object."
        );
    }

    if (
        typeof command.timestamp !==
            "string"
    ) {
        errors.push(
            "Command timestamp is invalid."
        );
    }

    return {
        valid:
            errors.length === 0,

        errors
    };
}

/*=========================================================
Normalize Command
=========================================================*/

export function normalizeCommand(
    command
) {
    if (!isPlainObject(command)) {
        return null;
    }

    if (
        !isKnownCommandType(
            command.type
        )
    ) {
        return null;
    }

    return createCommand(
        command.type,
        command.payload,
        {
            id:
                command.id,

            label:
                command.label,

            timestamp:
                command.timestamp,

            category:
                command.category,

            undoable:
                command.undoable,

            mergeable:
                command.mergeable,

            mergeKey:
                command.mergeKey,

            source:
                command.source,

            transactionId:
                command.transactionId,

            metadata:
                command.metadata
        }
    );
}

/*=========================================================
Command Serialization
=========================================================*/

export function serializeCommand(
    command
) {
    const normalized =
        normalizeCommand(
            command
        );

    if (!normalized) {
        throw new Error(
            "Cannot serialize an invalid command."
        );
    }

    return JSON.stringify(
        normalized
    );
}

export function deserializeCommand(
    serialized
) {
    try {
        const parsed =
            typeof serialized ===
                "string"
                ? JSON.parse(
                    serialized
                )
                : serialized;

        const normalized =
            normalizeCommand(
                parsed
            );

        if (!normalized) {
            return {
                command:
                    null,

                error:
                    "The command is invalid."
            };
        }

        const validation =
            validateCommand(
                normalized
            );

        if (!validation.valid) {
            return {
                command:
                    null,

                error:
                    validation.errors.join(
                        " "
                    )
            };
        }

        return {
            command:
                normalized,

            error:
                null
        };

    } catch (error) {
        return {
            command:
                null,

            error:
                error?.message ||
                "The command could not be parsed."
        };
    }
}

/*=========================================================
Command Merge Helpers
=========================================================*/

function haveMatchingObjectIds(
    firstPayload,
    secondPayload
) {
    const firstIds =
        uniqueIds(
            firstPayload.objectIds ||
            (
                firstPayload.objectId
                    ? [
                        firstPayload.objectId
                    ]
                    : []
            )
        );

    const secondIds =
        uniqueIds(
            secondPayload.objectIds ||
            (
                secondPayload.objectId
                    ? [
                        secondPayload.objectId
                    ]
                    : []
            )
        );

    if (
        firstIds.length !==
        secondIds.length
    ) {
        return false;
    }

    return firstIds.every(
        id =>
            secondIds.includes(id)
    );
}

export function canMergeCommands(
    previousCommand,
    nextCommand
) {
    if (
        !previousCommand ||
        !nextCommand
    ) {
        return false;
    }

    if (
        previousCommand.type !==
        nextCommand.type
    ) {
        return false;
    }

    if (
        !previousCommand.mergeable ||
        !nextCommand.mergeable
    ) {
        return false;
    }

    if (
        previousCommand.transactionId &&
        nextCommand.transactionId &&
        previousCommand.transactionId !==
        nextCommand.transactionId
    ) {
        return false;
    }

    if (
        previousCommand.mergeKey ||
        nextCommand.mergeKey
    ) {
        return Boolean(
            previousCommand.mergeKey &&
            previousCommand.mergeKey ===
                nextCommand.mergeKey
        );
    }

    switch (previousCommand.type) {

        case COMMAND_TYPES.UPDATE_OBJECT:

            return (
                previousCommand
                    .payload
                    .objectId ===
                nextCommand
                    .payload
                    .objectId
            );

        case COMMAND_TYPES.UPDATE_OBJECTS:

        case COMMAND_TYPES.MOVE_OBJECTS:

        case COMMAND_TYPES.TRANSFORM_OBJECTS:

            return haveMatchingObjectIds(
                previousCommand.payload,
                nextCommand.payload
            );

        case COMMAND_TYPES.SET_LAYER_OPACITY:

            return (
                previousCommand
                    .payload
                    .layerId ===
                nextCommand
                    .payload
                    .layerId
            );

        case COMMAND_TYPES.SET_VIEWPORT:

        case COMMAND_TYPES.SET_ZOOM:

        case COMMAND_TYPES.PAN_VIEWPORT:

            return true;

        default:

            return false;
    }
}

export function mergeCommands(
    previousCommand,
    nextCommand
) {
    if (
        !canMergeCommands(
            previousCommand,
            nextCommand
        )
    ) {
        return null;
    }

    return {
        ...previousCommand,

        label:
            nextCommand.label ||
            previousCommand.label,

        timestamp:
            nextCommand.timestamp,

        payload: {
            ...previousCommand.payload,
            ...nextCommand.payload
        },

        metadata: {
            ...previousCommand.metadata,
            ...nextCommand.metadata,

            mergedCommandIds: [
                ...(
                    previousCommand
                        .metadata
                        ?.mergedCommandIds ||
                    [
                        previousCommand.id
                    ]
                ),

                nextCommand.id
            ]
        }
    };
}

/*=========================================================
Document Command Factories
=========================================================*/

export function createClearDocumentCommand(
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.CLEAR_DOCUMENT,
        {},
        options
    );
}

export function createRenameDocumentCommand(
    name,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.RENAME_DOCUMENT,
        {
            name
        },
        options
    );
}

export function createResizeDocumentCommand(
    width,
    height,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.RESIZE_DOCUMENT,
        {
            width,
            height
        },
        options
    );
}

export function createSetDocumentBackgroundCommand(
    background,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SET_DOCUMENT_BACKGROUND,
        {
            background
        },
        options
    );
}

/*=========================================================
Object Command Factories
=========================================================*/

export function createAddObjectCommand(
    object,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.ADD_OBJECT,
        {
            object
        },
        options
    );
}

export function createAddObjectsCommand(
    objects,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.ADD_OBJECTS,
        {
            objects:
                Array.isArray(objects)
                    ? objects
                    : []
        },
        options
    );
}

export function createUpdateObjectCommand(
    objectId,
    updates,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.UPDATE_OBJECT,
        {
            objectId,
            updates:
                isPlainObject(updates)
                    ? updates
                    : {}
        },
        {
            mergeKey:
                options.mergeKey ||
                `update-object:${objectId}`,

            ...options
        }
    );
}

export function createUpdateObjectsCommand(
    objectIds,
    updates,
    options = {}
) {
    const safeIds =
        uniqueIds(objectIds);

    return createCommand(
        COMMAND_TYPES.UPDATE_OBJECTS,
        {
            objectIds:
                safeIds,

            updates:
                isPlainObject(updates)
                    ? updates
                    : {}
        },
        {
            mergeKey:
                options.mergeKey ||
                `update-objects:${safeIds
                    .slice()
                    .sort()
                    .join(",")}`,

            ...options
        }
    );
}

export function createDeleteObjectsCommand(
    objectIds,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.DELETE_OBJECTS,
        {
            objectIds:
                uniqueIds(objectIds)
        },
        options
    );
}

export function createMoveObjectsCommand(
    objectIds,
    deltaX,
    deltaY,
    options = {}
) {
    const safeIds =
        uniqueIds(objectIds);

    return createCommand(
        COMMAND_TYPES.MOVE_OBJECTS,
        {
            objectIds:
                safeIds,

            deltaX:
                Number(deltaX) ||
                0,

            deltaY:
                Number(deltaY) ||
                0
        },
        {
            mergeKey:
                options.mergeKey ||
                `move-objects:${safeIds
                    .slice()
                    .sort()
                    .join(",")}`,

            ...options
        }
    );
}

export function createTransformObjectsCommand(
    objectIds,
    transforms,
    options = {}
) {
    const safeIds =
        uniqueIds(objectIds);

    return createCommand(
        COMMAND_TYPES.TRANSFORM_OBJECTS,
        {
            objectIds:
                safeIds,

            transforms:
                isPlainObject(transforms)
                    ? transforms
                    : {}
        },
        {
            mergeKey:
                options.mergeKey ||
                `transform-objects:${safeIds
                    .slice()
                    .sort()
                    .join(",")}`,

            ...options
        }
    );
}

/*=========================================================
Layer Command Factories
=========================================================*/

export function createAddLayerCommand(
    layerOptions = {},
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.ADD_LAYER,
        {
            layerOptions:
                isPlainObject(layerOptions)
                    ? layerOptions
                    : {}
        },
        options
    );
}

export function createUpdateLayerCommand(
    layerId,
    updates,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.UPDATE_LAYER,
        {
            layerId,

            updates:
                isPlainObject(updates)
                    ? updates
                    : {}
        },
        options
    );
}

export function createDeleteLayerCommand(
    layerId,
    deleteMode = "delete",
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.DELETE_LAYER,
        {
            layerId,

            mode:
                deleteMode === "move"
                    ? "move"
                    : "delete"
        },
        options
    );
}

export function createReorderLayerCommand(
    layerId,
    targetIndex,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.REORDER_LAYER,
        {
            layerId,

            targetIndex:
                Number(targetIndex)
        },
        options
    );
}

/*=========================================================
Selection Command Factories
=========================================================*/

export function createSelectObjectsCommand(
    objectIds,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SELECT_OBJECTS,
        {
            objectIds:
                uniqueIds(objectIds),

            append:
                Boolean(
                    options.append
                )
        },
        {
            ...options,

            undoable:
                false
        }
    );
}

export function createClearSelectionCommand(
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.CLEAR_SELECTION,
        {},
        {
            ...options,

            undoable:
                false
        }
    );
}

/*=========================================================
Viewport Command Factories
=========================================================*/

export function createSetViewportCommand(
    viewport,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SET_VIEWPORT,
        {
            viewport:
                isPlainObject(viewport)
                    ? viewport
                    : {}
        },
        {
            ...options,

            undoable:
                false,

            mergeKey:
                options.mergeKey ||
                "viewport"
        }
    );
}

export function createPanViewportCommand(
    deltaX,
    deltaY,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.PAN_VIEWPORT,
        {
            deltaX:
                Number(deltaX) ||
                0,

            deltaY:
                Number(deltaY) ||
                0
        },
        {
            ...options,

            undoable:
                false,

            mergeKey:
                options.mergeKey ||
                "viewport-pan"
        }
    );
}

export function createSetZoomCommand(
    zoom,
    anchor = null,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SET_ZOOM,
        {
            zoom:
                Number(zoom),

            anchor:
                isPlainObject(anchor)
                    ? anchor
                    : null
        },
        {
            ...options,

            undoable:
                false,

            mergeKey:
                options.mergeKey ||
                "viewport-zoom"
        }
    );
}

/*=========================================================
Tool Command Factories
=========================================================*/

export function createSetActiveToolCommand(
    tool,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SET_ACTIVE_TOOL,
        {
            tool
        },
        {
            ...options,

            undoable:
                false
        }
    );
}

export function createSetBrushSettingsCommand(
    settings,
    options = {}
) {
    return createCommand(
        COMMAND_TYPES.SET_BRUSH_SETTINGS,
        {
            settings:
                isPlainObject(settings)
                    ? settings
                    : {}
        },
        {
            ...options,

            undoable:
                false
        }
    );
}

/*=========================================================
Default Export
=========================================================*/

export default {
    COMMAND_SCHEMA_VERSION,

    COMMAND_CATEGORIES,

    COMMAND_TYPES,

    COMMANDS,

    COMMAND_LABELS,

    COMMAND_CATEGORY_MAP,

    isKnownCommandType,

    getCommandCategory,

    getCommandLabel,

    isUndoableCommand,

    isMergeableCommand,

    createCommand,

    validateCommand,

    normalizeCommand,

    serializeCommand,

    deserializeCommand,

    canMergeCommands,

    mergeCommands,

    createClearDocumentCommand,

    createRenameDocumentCommand,

    createResizeDocumentCommand,

    createSetDocumentBackgroundCommand,

    createAddObjectCommand,

    createAddObjectsCommand,

    createUpdateObjectCommand,

    createUpdateObjectsCommand,

    createDeleteObjectsCommand,

    createMoveObjectsCommand,

    createTransformObjectsCommand,

    createAddLayerCommand,

    createUpdateLayerCommand,

    createDeleteLayerCommand,

    createReorderLayerCommand,

    createSelectObjectsCommand,

    createClearSelectionCommand,

    createSetViewportCommand,

    createPanViewportCommand,

    createSetZoomCommand,

    createSetActiveToolCommand,

    createSetBrushSettingsCommand
};