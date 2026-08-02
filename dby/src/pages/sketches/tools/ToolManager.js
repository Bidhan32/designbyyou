/*
=========================================================
FashionVision Professional Editor
Tool Manager
Version 1.0
=========================================================
*/

/*=========================================================
Tool Event Names
=========================================================*/

export const TOOL_EVENTS = Object.freeze({
    ACTIVATE: "onActivate",
    DEACTIVATE: "onDeactivate",

    POINTER_DOWN: "onPointerDown",
    POINTER_MOVE: "onPointerMove",
    POINTER_UP: "onPointerUp",
    POINTER_ENTER: "onPointerEnter",
    POINTER_LEAVE: "onPointerLeave",
    POINTER_CANCEL: "onPointerCancel",

    DOUBLE_CLICK: "onDoubleClick",
    CONTEXT_MENU: "onContextMenu",

    WHEEL: "onWheel",

    KEY_DOWN: "onKeyDown",
    KEY_UP: "onKeyUp",

    CANCEL: "onCancel",
    DESTROY: "onDestroy"
});

/*=========================================================
Interaction Phases
=========================================================*/

export const INTERACTION_PHASES = Object.freeze({
    IDLE: "idle",
    STARTED: "started",
    MOVING: "moving",
    ENDING: "ending",
    CANCELLED: "cancelled"
});

/*=========================================================
Pointer Buttons
=========================================================*/

export const POINTER_BUTTONS = Object.freeze({
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2
});

/*=========================================================
Supported Tool Handlers
=========================================================*/

const TOOL_HANDLER_NAMES = Object.freeze(
    Object.values(
        TOOL_EVENTS
    )
);

/*=========================================================
General Helpers
=========================================================*/

function isPlainObject(
    value
) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isFunction(
    value
) {
    return typeof value ===
        "function";
}

function isPromiseLike(
    value
) {
    return Boolean(
        value &&
        typeof value.then ===
            "function"
    );
}

function numberOr(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function clamp(
    value,
    minimum,
    maximum
) {
    return Math.max(
        minimum,
        Math.min(
            maximum,
            numberOr(value, minimum)
        )
    );
}

function clonePoint(
    point
) {
    if (!point) {
        return null;
    }

    return {
        x:
            numberOr(point.x),

        y:
            numberOr(point.y)
    };
}

/*=========================================================
Native Event Helpers
=========================================================*/

function getNativeEvent(
    event
) {
    return (
        event?.evt ||
        event?.nativeEvent ||
        event ||
        null
    );
}

function getStageFromEvent(
    event
) {
    return (
        event
            ?.target
            ?.getStage
            ?.() ||
        event
            ?.currentTarget
            ?.getStage
            ?.() ||
        null
    );
}

function getPointerId(
    nativeEvent
) {
    const pointerId =
        Number(
            nativeEvent?.pointerId
        );

    return Number.isFinite(
        pointerId
    )
        ? pointerId
        : null;
}

function getPointerType(
    nativeEvent
) {
    if (
        typeof nativeEvent?.pointerType ===
        "string"
    ) {
        return nativeEvent.pointerType;
    }

    if (
        nativeEvent?.touches ||
        nativeEvent?.changedTouches
    ) {
        return "touch";
    }

    return "mouse";
}

function getPointerButton(
    nativeEvent
) {
    const button =
        Number(nativeEvent?.button);

    return Number.isFinite(button)
        ? button
        : POINTER_BUTTONS.LEFT;
}

function getPointerPressure(
    nativeEvent
) {
    const pressure =
        Number(nativeEvent?.pressure);

    if (
        Number.isFinite(pressure) &&
        pressure > 0
    ) {
        return clamp(
            pressure,
            0,
            1
        );
    }

    const force =
        Number(
            nativeEvent
                ?.touches
                ?.[0]
                ?.force
        );

    if (
        Number.isFinite(force) &&
        force > 0
    ) {
        return clamp(
            force,
            0,
            1
        );
    }

    return 0.5;
}

/*=========================================================
Read Pointer Position
=========================================================*/

function getScreenPoint(
    event,
    stage
) {
    const stagePoint =
        stage
            ?.getPointerPosition
            ?.();

    if (
        stagePoint &&
        Number.isFinite(stagePoint.x) &&
        Number.isFinite(stagePoint.y)
    ) {
        return {
            x:
                stagePoint.x,

            y:
                stagePoint.y
        };
    }

    const nativeEvent =
        getNativeEvent(event);

    const offsetX =
        Number(nativeEvent?.offsetX);

    const offsetY =
        Number(nativeEvent?.offsetY);

    if (
        Number.isFinite(offsetX) &&
        Number.isFinite(offsetY)
    ) {
        return {
            x:
                offsetX,

            y:
                offsetY
        };
    }

    const target =
        nativeEvent?.currentTarget ||
        nativeEvent?.target;

    const rectangle =
        target
            ?.getBoundingClientRect
            ?.();

    const clientX =
        Number(nativeEvent?.clientX);

    const clientY =
        Number(nativeEvent?.clientY);

    if (
        rectangle &&
        Number.isFinite(clientX) &&
        Number.isFinite(clientY)
    ) {
        return {
            x:
                clientX -
                rectangle.left,

            y:
                clientY -
                rectangle.top
        };
    }

    return null;
}

/*=========================================================
Convert Screen Position to Document Position
=========================================================*/

function toDocumentPoint(
    screenPoint,
    stage,
    viewport,
    customMapper
) {
    if (!screenPoint) {
        return null;
    }

    if (isFunction(customMapper)) {
        const mappedPoint =
            customMapper(
                screenPoint
            );

        if (
            mappedPoint &&
            Number.isFinite(
                mappedPoint.x
            ) &&
            Number.isFinite(
                mappedPoint.y
            )
        ) {
            return {
                x:
                    mappedPoint.x,

                y:
                    mappedPoint.y
            };
        }
    }

    /*
    Konva's pointer position is not affected by Stage
    transformations. Inverting the Stage transform gives
    the logical document coordinate.
    */

    try {
        const transform =
            stage
                ?.getAbsoluteTransform
                ?.()
                ?.copy
                ?.();

        if (
            transform &&
            isFunction(transform.invert) &&
            isFunction(transform.point)
        ) {
            transform.invert();

            const transformedPoint =
                transform.point(
                    screenPoint
                );

            if (
                transformedPoint &&
                Number.isFinite(
                    transformedPoint.x
                ) &&
                Number.isFinite(
                    transformedPoint.y
                )
            ) {
                return {
                    x:
                        transformedPoint.x,

                    y:
                        transformedPoint.y
                };
            }
        }
    } catch {
        /*
        Use viewport conversion below when a Konva
        transform cannot be resolved.
        */
    }

    const zoom =
        Math.max(
            0.0001,
            numberOr(
                viewport?.zoom,
                1
            )
        );

    const viewportX =
        numberOr(
            viewport?.x,
            0
        );

    const viewportY =
        numberOr(
            viewport?.y,
            0
        );

    return {
        x:
            (
                screenPoint.x -
                viewportX
            ) /
            zoom,

        y:
            (
                screenPoint.y -
                viewportY
            ) /
            zoom
    };
}

/*=========================================================
Modifier Key State
=========================================================*/

function getModifierKeys(
    nativeEvent
) {
    return {
        alt:
            Boolean(
                nativeEvent?.altKey
            ),

        ctrl:
            Boolean(
                nativeEvent?.ctrlKey
            ),

        meta:
            Boolean(
                nativeEvent?.metaKey
            ),

        shift:
            Boolean(
                nativeEvent?.shiftKey
            )
    };
}

/*=========================================================
Prevent Browser Event
=========================================================*/

function preventEventDefault(event) {
    const nativeEvent =
        event?.evt ||
        event?.nativeEvent ||
        event;

    if (
        !nativeEvent ||
        typeof nativeEvent.preventDefault !==
            "function"
    ) {
        return false;
    }

    /*
    touchend and pointerup events can become
    non-cancelable after browser scrolling or
    gesture handling has already started.
    */

    if (
        nativeEvent.cancelable ===
        false
    ) {
        return false;
    }

    if (
        nativeEvent.defaultPrevented
    ) {
        return true;
    }

    nativeEvent.preventDefault();

    return true;
}

/*=========================================================
Stop Browser Event
=========================================================*/

function stopEventPropagation(
    event
) {
    const nativeEvent =
        getNativeEvent(event);

    nativeEvent
        ?.stopPropagation
        ?.();

    if (event) {
        event.cancelBubble =
            true;
    }
}

/*=========================================================
Pointer Capture Helpers
=========================================================*/

function capturePointer(
    nativeEvent
) {
    const pointerId =
        getPointerId(
            nativeEvent
        );

    if (pointerId === null) {
        return false;
    }

    const target =
        nativeEvent?.currentTarget ||
        nativeEvent?.target;

    try {
        target
            ?.setPointerCapture
            ?.(pointerId);

        return true;
    } catch {
        return false;
    }
}

function releasePointer(
    nativeEvent
) {
    const pointerId =
        getPointerId(
            nativeEvent
        );

    if (pointerId === null) {
        return false;
    }

    const target =
        nativeEvent?.currentTarget ||
        nativeEvent?.target;

    try {
        target
            ?.releasePointerCapture
            ?.(pointerId);

        return true;
    } catch {
        return false;
    }
}

/*=========================================================
Tool Definition Validation
=========================================================*/

export function validateToolDefinition(
    tool
) {
    const errors = [];

    if (!isPlainObject(tool)) {
        return {
            valid:
                false,

            errors: [
                "Tool definition must be an object."
            ]
        };
    }

    if (
        typeof tool.id !==
            "string" ||
        !tool.id.trim()
    ) {
        errors.push(
            "Tool ID is required."
        );
    }

    if (
        tool.label !== undefined &&
        typeof tool.label !==
            "string"
    ) {
        errors.push(
            "Tool label must be a string."
        );
    }

    if (
        tool.cursor !== undefined &&
        typeof tool.cursor !==
            "string" &&
        !isFunction(tool.cursor)
    ) {
        errors.push(
            "Tool cursor must be a string or function."
        );
    }

    TOOL_HANDLER_NAMES.forEach(
        handlerName => {
            if (
                tool[handlerName] !==
                    undefined &&
                !isFunction(
                    tool[handlerName]
                )
            ) {
                errors.push(
                    `${handlerName} must be a function.`
                );
            }
        }
    );

    return {
        valid:
            errors.length === 0,

        errors
    };
}

/*=========================================================
Create Normalized Tool Definition
=========================================================*/

export function defineTool(
    definition
) {
    const validation =
        validateToolDefinition(
            definition
        );

    if (!validation.valid) {
        throw new Error(
            validation.errors.join(
                " "
            )
        );
    }

    return {
        label:
            definition.id,

        description:
            "",

        icon:
            null,

        cursor:
            "default",

        shortcut:
            null,

        allowRightButton:
            false,

        allowMiddleButton:
            false,

        preventDefault:
            true,

        stopPropagation:
            false,

        ...definition,

        id:
            definition.id.trim()
    };
}

/*=========================================================
Create Empty Interaction
=========================================================*/

function createInteraction({
    toolId,
    pointerId,
    pointerType,
    button,
    screenPoint,
    documentPoint
}) {
    return {
        phase:
            INTERACTION_PHASES.STARTED,

        toolId,

        pointerId,

        pointerType,

        button,

        startedAt:
            Date.now(),

        startScreenPoint:
            clonePoint(
                screenPoint
            ),

        previousScreenPoint:
            clonePoint(
                screenPoint
            ),

        currentScreenPoint:
            clonePoint(
                screenPoint
            ),

        startPoint:
            clonePoint(
                documentPoint
            ),

        previousPoint:
            clonePoint(
                documentPoint
            ),

        currentPoint:
            clonePoint(
                documentPoint
            ),

        distance:
            0,

        movementCount:
            0,

        data: {}
    };
}

/*=========================================================
Calculate Interaction Distance
=========================================================*/

function calculateDistance(
    pointA,
    pointB
) {
    if (
        !pointA ||
        !pointB
    ) {
        return 0;
    }

    return Math.hypot(
        pointB.x - pointA.x,
        pointB.y - pointA.y
    );
}

/*=========================================================
Tool Manager
=========================================================*/

export class ToolManager {

    constructor({
        getContext = null,
        onError = null,
        onActiveToolChange = null,
        fallbackToolId = null
    } = {}) {
        this.tools =
            new Map();

        this.toolStates =
            new Map();

        this.activeToolId =
            null;

        this.fallbackToolId =
            fallbackToolId;

        this.interaction =
            null;

        this.destroyed =
            false;

        this.getExternalContext =
            isFunction(getContext)
                ? getContext
                : () => ({});

        this.onError =
            isFunction(onError)
                ? onError
                : (
                    error,
                    details
                ) => {
                    console.error(
                        "FashionVision tool error:",
                        error,
                        details
                    );
                };

        this.onActiveToolChange =
            isFunction(
                onActiveToolChange
            )
                ? onActiveToolChange
                : null;
    }

    /*=====================================================
    Tool Registry
    =====================================================*/

    register(
        definition,
        {
            replace = false,
            activate = false
        } = {}
    ) {
        this.assertNotDestroyed();

        const tool =
            defineTool(
                definition
            );

        if (
            this.tools.has(tool.id) &&
            !replace
        ) {
            throw new Error(
                `Tool "${tool.id}" is already registered.`
            );
        }

        this.tools.set(
            tool.id,
            tool
        );

        if (
            activate ||
            !this.activeToolId
        ) {
            this.activate(
                tool.id
            );
        }

        return tool;
    }

    registerMany(
        definitions = [],
        options = {}
    ) {
        if (
            !Array.isArray(
                definitions
            )
        ) {
            return [];
        }

        return definitions.map(
            definition =>
                this.register(
                    definition,
                    options
                )
        );
    }

    unregister(
        toolId
    ) {
        this.assertNotDestroyed();

        if (
            !this.tools.has(toolId)
        ) {
            return false;
        }

        if (
            this.interaction
                ?.toolId ===
            toolId
        ) {
            this.cancelInteraction(
                "tool-unregistered"
            );
        }

        if (
            this.activeToolId ===
            toolId
        ) {
            this.deactivate();

            const nextToolId =
                this.fallbackToolId &&
                this.tools.has(
                    this.fallbackToolId
                )
                    ? this.fallbackToolId
                    : [
                        ...this.tools.keys()
                    ].find(
                        id =>
                            id !==
                            toolId
                    ) || null;

            if (nextToolId) {
                this.activate(
                    nextToolId
                );
            }
        }

        this.toolStates.delete(
            toolId
        );

        return this.tools.delete(
            toolId
        );
    }

    hasTool(
        toolId
    ) {
        return this.tools.has(
            toolId
        );
    }

    getTool(
        toolId
    ) {
        return (
            this.tools.get(
                toolId
            ) ||
            null
        );
    }

    getActiveTool() {
        return this.getTool(
            this.activeToolId
        );
    }

    getRegisteredTools() {
        return [
            ...this.tools.values()
        ];
    }

    /*=====================================================
    Tool Activation
    =====================================================*/

    activate(
        toolId,
        contextOverrides = {}
    ) {
        this.assertNotDestroyed();

        const nextTool =
            this.getTool(
                toolId
            );

        if (!nextTool) {
            return false;
        }

        if (
            this.activeToolId ===
            toolId
        ) {
            return true;
        }

        if (this.interaction) {
            this.cancelInteraction(
                "tool-changed"
            );
        }

        const previousToolId =
            this.activeToolId;

        const previousTool =
            this.getTool(
                previousToolId
            );

        if (previousTool) {
            this.invokeToolHandler(
                previousTool,
                TOOL_EVENTS.DEACTIVATE,
                null,
                {
                    ...contextOverrides,

                    previousToolId,

                    nextToolId:
                        toolId
                }
            );
        }

        this.activeToolId =
            toolId;

        this.invokeToolHandler(
            nextTool,
            TOOL_EVENTS.ACTIVATE,
            null,
            {
                ...contextOverrides,

                previousToolId,

                nextToolId:
                    toolId
            }
        );

        this.onActiveToolChange?.({
            previousToolId,
            activeToolId:
                toolId,
            tool:
                nextTool
        });

        return true;
    }

    deactivate(
        contextOverrides = {}
    ) {
        if (!this.activeToolId) {
            return;
        }

        if (this.interaction) {
            this.cancelInteraction(
                "tool-deactivated"
            );
        }

        const previousToolId =
            this.activeToolId;

        const tool =
            this.getTool(
                previousToolId
            );

        this.activeToolId =
            null;

        if (tool) {
            this.invokeToolHandler(
                tool,
                TOOL_EVENTS.DEACTIVATE,
                null,
                {
                    ...contextOverrides,

                    previousToolId,

                    nextToolId:
                        null
                }
            );
        }

        this.onActiveToolChange?.({
            previousToolId,
            activeToolId:
                null,
            tool:
                null
        });
    }

    /*=====================================================
    Tool State
    =====================================================*/

    getToolState(
        toolId = this.activeToolId
    ) {
        if (!toolId) {
            return {};
        }

        return (
            this.toolStates.get(
                toolId
            ) ||
            {}
        );
    }

    setToolState(
        toolId,
        stateOrUpdater
    ) {
        if (!toolId) {
            return {};
        }

        const currentState =
            this.getToolState(
                toolId
            );

        const nextState =
            isFunction(
                stateOrUpdater
            )
                ? stateOrUpdater(
                    currentState
                )
                : stateOrUpdater;

        if (
            !isPlainObject(
                nextState
            )
        ) {
            return currentState;
        }

        const mergedState = {
            ...currentState,
            ...nextState
        };

        this.toolStates.set(
            toolId,
            mergedState
        );

        return mergedState;
    }

    replaceToolState(
        toolId,
        nextState = {}
    ) {
        if (
            !toolId ||
            !isPlainObject(
                nextState
            )
        ) {
            return {};
        }

        this.toolStates.set(
            toolId,
            nextState
        );

        return nextState;
    }

    clearToolState(
        toolId
    ) {
        if (!toolId) {
            return false;
        }

        return this.toolStates.delete(
            toolId
        );
    }

    /*=====================================================
    Interaction Data
    =====================================================*/

    setInteractionData(
        updates
    ) {
        if (
            !this.interaction ||
            !isPlainObject(
                updates
            )
        ) {
            return null;
        }

        this.interaction.data = {
            ...this.interaction.data,
            ...updates
        };

        return this.interaction.data;
    }

    replaceInteractionData(
        data = {}
    ) {
        if (
            !this.interaction ||
            !isPlainObject(data)
        ) {
            return null;
        }

        this.interaction.data =
            data;

        return this.interaction.data;
    }

    getInteraction() {
        return this.interaction;
    }

    isInteracting() {
        return Boolean(
            this.interaction
        );
    }

    /*=====================================================
    Context Creation
    =====================================================*/

    createContext(
        event = null,
        contextOverrides = {},
        toolId = null
    ) {
        const externalContext =
            this.getExternalContext?.() ||
            {};

        const stage =
            contextOverrides.stage ||
            externalContext.stage ||
            contextOverrides
                .stageRef
                ?.current ||
            externalContext
                .stageRef
                ?.current ||
            getStageFromEvent(event);

        const nativeEvent =
            getNativeEvent(event);

        const screenPoint =
            getScreenPoint(
                event,
                stage
            );

        const viewport =
            contextOverrides.viewport ||
            externalContext.viewport ||
            externalContext.state
                ?.viewport ||
            {
                zoom: 1,
                x: 0,
                y: 0
            };

        const documentPoint =
            toDocumentPoint(
                screenPoint,
                stage,
                viewport,
                contextOverrides
                    .toDocumentPoint ||
                externalContext
                    .toDocumentPoint
            );

        const modifiers =
            getModifierKeys(
                nativeEvent
            );

        const resolvedToolId =
            toolId ||
            this.interaction
                ?.toolId ||
            this.activeToolId;

        const tool =
            this.getTool(
                resolvedToolId
            );

        return {
            ...externalContext,
            ...contextOverrides,

            manager:
                this,

            tool,

            toolId:
                resolvedToolId,

            event,

            nativeEvent,

            stage,

            screenPoint,

            point:
                documentPoint,

            documentPoint,

            viewport,

            interaction:
                this.interaction,

            session:
                this.interaction
                    ?.data ||
                null,

            pointerId:
                getPointerId(
                    nativeEvent
                ),

            pointerType:
                getPointerType(
                    nativeEvent
                ),

            button:
                getPointerButton(
                    nativeEvent
                ),

            buttons:
                numberOr(
                    nativeEvent?.buttons,
                    0
                ),

            pressure:
                getPointerPressure(
                    nativeEvent
                ),

            tiltX:
                numberOr(
                    nativeEvent?.tiltX,
                    0
                ),

            tiltY:
                numberOr(
                    nativeEvent?.tiltY,
                    0
                ),

            twist:
                numberOr(
                    nativeEvent?.twist,
                    0
                ),

            width:
                numberOr(
                    nativeEvent?.width,
                    1
                ),

            height:
                numberOr(
                    nativeEvent?.height,
                    1
                ),

            modifiers,

            altKey:
                modifiers.alt,

            ctrlKey:
                modifiers.ctrl,

            metaKey:
                modifiers.meta,

            shiftKey:
                modifiers.shift,

            getToolState:
                () =>
                    this.getToolState(
                        resolvedToolId
                    ),

            setToolState:
                updates =>
                    this.setToolState(
                        resolvedToolId,
                        updates
                    ),

            replaceToolState:
                nextState =>
                    this.replaceToolState(
                        resolvedToolId,
                        nextState
                    ),

            clearToolState:
                () =>
                    this.clearToolState(
                        resolvedToolId
                    ),

            setInteractionData:
                updates =>
                    this.setInteractionData(
                        updates
                    ),

            replaceInteractionData:
                data =>
                    this.replaceInteractionData(
                        data
                    ),

            preventDefault:
                () =>
                    preventEventDefault(
                        event
                    ),

            stopPropagation:
                () =>
                    stopEventPropagation(
                        event
                    ),

            capturePointer:
                () =>
                    capturePointer(
                        nativeEvent
                    ),

            releasePointer:
                () =>
                    releasePointer(
                        nativeEvent
                    ),

            cancelInteraction:
                reason =>
                    this.cancelInteraction(
                        reason ||
                        "tool-requested-cancel",
                        event,
                        contextOverrides
                    )
        };
    }

    /*=====================================================
    Handler Invocation
    =====================================================*/

    invokeToolHandler(
        tool,
        handlerName,
        event,
        contextOverrides = {}
    ) {
        const handler =
            tool?.[handlerName];

        if (!isFunction(handler)) {
            return undefined;
        }

        const context =
            this.createContext(
                event,
                contextOverrides,
                tool.id
            );

        try {
            const result =
                handler(context);

            if (
                isPromiseLike(result)
            ) {
                result.catch(
                    error => {
                        this.handleToolError(
                            error,
                            {
                                tool,
                                handlerName,
                                context
                            }
                        );
                    }
                );
            }

            return result;
        } catch (error) {
            this.handleToolError(
                error,
                {
                    tool,
                    handlerName,
                    context
                }
            );

            return undefined;
        }
    }

    handleToolError(
        error,
        details = {}
    ) {
        this.onError(
            error,
            details
        );
    }

    /*=====================================================
    Pointer Validation
    =====================================================*/

    canToolHandleButton(
        tool,
        button
    ) {
        if (
            button ===
            POINTER_BUTTONS.RIGHT
        ) {
            return Boolean(
                tool?.allowRightButton
            );
        }

        if (
            button ===
            POINTER_BUTTONS.MIDDLE
        ) {
            return Boolean(
                tool?.allowMiddleButton
            );
        }

        return true;
    }

    prepareEventForTool(
        tool,
        event
    ) {
        if (tool?.preventDefault) {
            preventEventDefault(
                event
            );
        }

        if (tool?.stopPropagation) {
            stopEventPropagation(
                event
            );
        }
    }

    /*=====================================================
    Pointer Down
    =====================================================*/

    handlePointerDown(
        event,
        contextOverrides = {}
    ) {
        this.assertNotDestroyed();

        const tool =
            this.getActiveTool();

        if (!tool) {
            return;
        }

        const initialContext =
            this.createContext(
                event,
                contextOverrides,
                tool.id
            );

        if (
            !this.canToolHandleButton(
                tool,
                initialContext.button
            )
        ) {
            return;
        }

        if (this.interaction) {
            this.cancelInteraction(
                "new-pointer-down",
                event,
                contextOverrides
            );
        }

        this.prepareEventForTool(
            tool,
            event
        );

        this.interaction =
            createInteraction({
                toolId:
                    tool.id,

                pointerId:
                    initialContext.pointerId,

                pointerType:
                    initialContext.pointerType,

                button:
                    initialContext.button,

                screenPoint:
                    initialContext.screenPoint,

                documentPoint:
                    initialContext.documentPoint
            });

        initialContext.capturePointer();

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.POINTER_DOWN,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Pointer Move
    =====================================================*/

    handlePointerMove(
        event,
        contextOverrides = {}
    ) {
        this.assertNotDestroyed();

        const interaction =
            this.interaction;

        const tool =
            interaction
                ? this.getTool(
                    interaction.toolId
                )
                : this.getActiveTool();

        if (!tool) {
            return;
        }

        const context =
            this.createContext(
                event,
                contextOverrides,
                tool.id
            );

        if (interaction) {
            const incomingPointerId =
                context.pointerId;

            if (
                interaction.pointerId !==
                    null &&
                incomingPointerId !==
                    null &&
                interaction.pointerId !==
                    incomingPointerId
            ) {
                return;
            }

            interaction.phase =
                INTERACTION_PHASES.MOVING;

            interaction.previousScreenPoint =
                clonePoint(
                    interaction
                        .currentScreenPoint
                );

            interaction.previousPoint =
                clonePoint(
                    interaction.currentPoint
                );

            interaction.currentScreenPoint =
                clonePoint(
                    context.screenPoint
                );

            interaction.currentPoint =
                clonePoint(
                    context.documentPoint
                );

            interaction.distance =
                calculateDistance(
                    interaction.startPoint,
                    interaction.currentPoint
                );

            interaction.movementCount +=
                1;
        }

        this.prepareEventForTool(
            tool,
            event
        );

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.POINTER_MOVE,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Pointer Up
    =====================================================*/

    handlePointerUp(
        event,
        contextOverrides = {}
    ) {
        this.assertNotDestroyed();

        const interaction =
            this.interaction;

        const tool =
            interaction
                ? this.getTool(
                    interaction.toolId
                )
                : this.getActiveTool();

        if (!tool) {
            this.interaction =
                null;

            return;
        }

        const context =
            this.createContext(
                event,
                contextOverrides,
                tool.id
            );

        if (
            interaction &&
            interaction.pointerId !==
                null &&
            context.pointerId !==
                null &&
            interaction.pointerId !==
                context.pointerId
        ) {
            return;
        }

        if (interaction) {
            interaction.phase =
                INTERACTION_PHASES.ENDING;

            interaction.previousScreenPoint =
                clonePoint(
                    interaction
                        .currentScreenPoint
                );

            interaction.previousPoint =
                clonePoint(
                    interaction.currentPoint
                );

            interaction.currentScreenPoint =
                clonePoint(
                    context.screenPoint
                );

            interaction.currentPoint =
                clonePoint(
                    context.documentPoint
                );

            interaction.distance =
                calculateDistance(
                    interaction.startPoint,
                    interaction.currentPoint
                );
        }

        this.prepareEventForTool(
            tool,
            event
        );

        const result =
            this.invokeToolHandler(
                tool,
                TOOL_EVENTS.POINTER_UP,
                event,
                contextOverrides
            );

        context.releasePointer();

        this.interaction =
            null;

        return result;
    }

    /*=====================================================
    Pointer Cancel
    =====================================================*/

    handlePointerCancel(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.interaction
                ? this.getTool(
                    this.interaction
                        .toolId
                )
                : this.getActiveTool();

        if (tool) {
            this.invokeToolHandler(
                tool,
                TOOL_EVENTS.POINTER_CANCEL,
                event,
                contextOverrides
            );
        }

        this.cancelInteraction(
            "pointer-cancelled",
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Pointer Enter and Leave
    =====================================================*/

    handlePointerEnter(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.interaction
                ? this.getTool(
                    this.interaction
                        .toolId
                )
                : this.getActiveTool();

        if (!tool) {
            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.POINTER_ENTER,
            event,
            contextOverrides
        );
    }

    handlePointerLeave(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.interaction
                ? this.getTool(
                    this.interaction
                        .toolId
                )
                : this.getActiveTool();

        if (!tool) {
            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.POINTER_LEAVE,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Double Click
    =====================================================*/

    handleDoubleClick(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.getActiveTool();

        if (!tool) {
            return;
        }

        this.prepareEventForTool(
            tool,
            event
        );

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.DOUBLE_CLICK,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Context Menu
    =====================================================*/

    handleContextMenu(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.getActiveTool();

        if (!tool) {
            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.CONTEXT_MENU,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Wheel
    =====================================================*/

    handleWheel(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.getActiveTool();

        if (!tool) {
            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.WHEEL,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Keyboard
    =====================================================*/

    handleKeyDown(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.interaction
                ? this.getTool(
                    this.interaction
                        .toolId
                )
                : this.getActiveTool();

        if (!tool) {
            return;
        }

        if (
            event?.key ===
            "Escape" &&
            this.interaction
        ) {
            this.cancelInteraction(
                "escape-key",
                event,
                contextOverrides
            );

            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.KEY_DOWN,
            event,
            contextOverrides
        );
    }

    handleKeyUp(
        event,
        contextOverrides = {}
    ) {
        const tool =
            this.interaction
                ? this.getTool(
                    this.interaction
                        .toolId
                )
                : this.getActiveTool();

        if (!tool) {
            return;
        }

        return this.invokeToolHandler(
            tool,
            TOOL_EVENTS.KEY_UP,
            event,
            contextOverrides
        );
    }

    /*=====================================================
    Cancel Active Interaction
    =====================================================*/

    cancelInteraction(
        reason = "cancelled",
        event = null,
        contextOverrides = {}
    ) {
        const interaction =
            this.interaction;

        if (!interaction) {
            return false;
        }

        interaction.phase =
            INTERACTION_PHASES.CANCELLED;

        interaction.cancelReason =
            reason;

        const tool =
            this.getTool(
                interaction.toolId
            );

        if (tool) {
            this.invokeToolHandler(
                tool,
                TOOL_EVENTS.CANCEL,
                event,
                {
                    ...contextOverrides,

                    cancelReason:
                        reason
                }
            );
        }

        const nativeEvent =
            getNativeEvent(event);

        releasePointer(
            nativeEvent
        );

        this.interaction =
            null;

        return true;
    }

    /*=====================================================
    Cursor
    =====================================================*/

    getCursor(
        contextOverrides = {}
    ) {
        const tool =
            this.getActiveTool();

        if (!tool) {
            return "default";
        }

        if (
            isFunction(tool.cursor)
        ) {
            try {
                return (
                    tool.cursor(
                        this.createContext(
                            null,
                            contextOverrides,
                            tool.id
                        )
                    ) ||
                    "default"
                );
            } catch {
                return "default";
            }
        }

        return (
            tool.cursor ||
            "default"
        );
    }

    /*=====================================================
    Reset Manager
    =====================================================*/

    reset({
        keepRegisteredTools = true,
        activateFallback = true
    } = {}) {
        if (this.interaction) {
            this.cancelInteraction(
                "manager-reset"
            );
        }

        this.toolStates.clear();

        if (!keepRegisteredTools) {
            this.tools.clear();
        }

        this.activeToolId =
            null;

        if (
            activateFallback &&
            this.fallbackToolId &&
            this.tools.has(
                this.fallbackToolId
            )
        ) {
            this.activate(
                this.fallbackToolId
            );
        }
    }

    /*=====================================================
    Destroy Manager
    =====================================================*/

    destroy() {
        if (this.destroyed) {
            return;
        }

        if (this.interaction) {
            this.cancelInteraction(
                "manager-destroyed"
            );
        }

        this.tools.forEach(
            tool => {
                this.invokeToolHandler(
                    tool,
                    TOOL_EVENTS.DESTROY,
                    null
                );
            }
        );

        this.tools.clear();

        this.toolStates.clear();

        this.activeToolId =
            null;

        this.destroyed =
            true;
    }

    /*=====================================================
    Safety
    =====================================================*/

    assertNotDestroyed() {
        if (this.destroyed) {
            throw new Error(
                "ToolManager has already been destroyed."
            );
        }
    }

}

/*=========================================================
Tool Manager Factory
=========================================================*/

export function createToolManager(
    options = {}
) {
    return new ToolManager(
        options
    );
}

/*=========================================================
Default Export
=========================================================*/

export default ToolManager;