/*
 * =========================================================
 * FashionVision Professional Editor
 * Precision Vector Eraser
 * Version 2.0
 * =========================================================
 *
 * Erases only affected sections of vector brush strokes.
 *
 * Features:
 * - Partial stroke erasing
 * - Continuous drag erasing
 * - Stroke fragmentation
 * - Preservation of remaining brush geometry
 * - Layer and object lock protection
 * - Zoom-aware cursor
 * - One undo/redo transaction per drag
 *
 * Stamp brushes and raster images are excluded.
 * =========================================================
 */

import Konva from "konva";

import { defineTool, POINTER_BUTTONS } from "./ToolManager";

import { EDITOR_TOOLS, useFashionEditorStore } from "../useFashionEditorStore";

/* =========================================================
   Constants
   ========================================================= */

export const ERASER_TOOL_ID = EDITOR_TOOLS.ERASER || "eraser";

export const ERASER_MODES = Object.freeze({
  STROKE: "stroke",
  PRECISION: "precision",
});

export const DEFAULT_ERASER_OPTIONS = Object.freeze({
  mode: ERASER_MODES.PRECISION,

  size: 18,
  minimumSize: 4,
  maximumSize: 300,

  activeLayerOnly: true,

  eraseObjectTypes: ["brush"],

  eraseLockedObjects: false,
  eraseLockedLayers: false,

  eraseHiddenObjects: false,
  eraseHiddenLayers: false,

  cursorFill: "rgba(255,255,255,0.18)",

  cursorStroke: "#111827",

  cursorInnerStroke: "rgba(255,255,255,0.95)",

  cursorStrokeWidth: 1.5,

  maximumStep: 2,

  maximumSamplesPerPathSegment: 2048,
});

const HISTORY_LABEL = "Precision erase";

const CURSOR_NAME = "fashion-editor-eraser-cursor";

const INTERACTION_LAYER_NAME = "fashion-editor-interaction-layer";

/* =========================================================
   General Helpers
   ========================================================= */

const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, finite(value, minimum)));

const pointValid = (point) =>
  point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));

const asPoint = (point) =>
  pointValid(point)
    ? {
        x: Number(point.x),
        y: Number(point.y),
      }
    : null;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const currentState = () => useFashionEditorStore.getState();

/* =========================================================
   Pointer Resolution
   ========================================================= */

function getScreenPoint(context) {
  return (
    asPoint(context?.screenPoint) ||
    asPoint(context?.stagePoint) ||
    asPoint(context?.stage?.getPointerPosition?.())
  );
}

function getDocumentPoint(context) {
  const explicit = asPoint(context?.point);

  if (explicit) {
    return explicit;
  }

  const screen = getScreenPoint(context);

  if (!screen || typeof context?.toDocumentPoint !== "function") {
    return null;
  }

  return asPoint(context.toDocumentPoint(screen));
}

function withinDocument(point, state) {
  return Boolean(
    point &&
    state?.document &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= finite(state.document.width, 1200) &&
    point.y <= finite(state.document.height, 1600),
  );
}

/* =========================================================
   Eraser Size
   ========================================================= */

function brushSize(context, options) {
  return clamp(
    currentState()?.eraser?.size ?? context?.eraser?.size ?? options.size,

    options.minimumSize,
    options.maximumSize,
  );
}

/* =========================================================
   ID Generation
   ========================================================= */

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return "brush-" + globalThis.crypto.randomUUID();
  }

  return `brush-${Date.now()}-` + Math.random().toString(36).slice(2);
}

/* =========================================================
   Layer Resolution
   ========================================================= */

function getLayer(state, object) {
  return (
    (state.layers || []).find((layer) => layer.id === object.layerId) ||
    (state.layers || []).find((layer) => layer.objectIds?.includes(object.id))
  );
}

/* =========================================================
   Brush Render Mode
   ========================================================= */

function resolveRenderMode(object) {
  const mode =
    object.renderMode ||
    object.brush?.renderMode ||
    object.style?.renderMode ||
    object.metadata?.renderMode;

  if (mode) {
    return mode;
  }

  if (object.stamps?.length) {
    return "stamp";
  }

  if (
    object.svgPath ||
    object.geometry?.freehand?.svgPath ||
    object.flatOutlinePoints?.length ||
    object.outlinePoints?.length
  ) {
    return "outline";
  }

  return "line";
}

/* =========================================================
   Erasability Checks
   ========================================================= */

function isErasable(state, object, options) {
  if (!object || !options.eraseObjectTypes.includes(object.type)) {
    return false;
  }

  const layer = getLayer(state, object);

  if (!layer) {
    return false;
  }

  if (options.activeLayerOnly && layer.id !== state.activeLayerId) {
    return false;
  }

  // Never modify locked content.
  if (object.locked || layer.locked) {
    return false;
  }

  if (!options.eraseHiddenObjects && object.visible === false) {
    return false;
  }

  if (!options.eraseHiddenLayers && layer.visible === false) {
    return false;
  }

  if (object.transient || object.metadata?.transient) {
    return false;
  }

  // Stamp brushes require per-stamp editing.
  return resolveRenderMode(object) !== "stamp";
}

/* =========================================================
   Normalize Brush Points
   ========================================================= */

function normalizePoints(object) {
  const points =
    Array.isArray(object.points) && object.points.length
      ? object.points
      : Array.isArray(object.rawPoints) && object.rawPoints.length
        ? object.rawPoints
        : object.flatPoints;

  if (!Array.isArray(points)) {
    return [];
  }

  if (typeof points[0] === "number") {
    const result = [];

    for (let i = 0; i + 1 < points.length; i += 2) {
      if (Number.isFinite(points[i]) && Number.isFinite(points[i + 1])) {
        result.push({
          x: points[i],
          y: points[i + 1],
        });
      }
    }

    return result;
  }

  return points.filter(pointValid).map((point) => ({
    ...point,

    x: Number(point.x),
    y: Number(point.y),
  }));
}

/* =========================================================
   Point Interpolation
   ========================================================= */

function interpolate(a, b, t) {
  const next = {
    ...a,
  };

  const numericFields = [
    "x",
    "y",
    "pressure",
    "width",
    "size",
    "opacity",
    "time",
    "timestamp",
    "tiltX",
    "tiltY",
  ];

  for (const key of numericFields) {
    if (Number.isFinite(a[key]) && Number.isFinite(b[key])) {
      next[key] = a[key] + (b[key] - a[key]) * t;
    }
  }

  return next;
}

/* =========================================================
   Object Transform
   ========================================================= */

function objectTransform(object) {
  const transform = new Konva.Transform();

  transform.translate(finite(object.x), finite(object.y));

  transform.rotate((finite(object.rotation) * Math.PI) / 180);

  transform.skew(finite(object.skewX), finite(object.skewY));

  transform.scale(finite(object.scaleX, 1), finite(object.scaleY, 1));

  transform.translate(-finite(object.offsetX), -finite(object.offsetY));

  return transform;
}

function maxTransformScale(transform) {
  const matrix = transform.getMatrix();

  return Math.max(
    0.00001,

    Math.hypot(matrix[0], matrix[1]),

    Math.hypot(matrix[2], matrix[3]),
  );
}

/* =========================================================
   Point-to-Segment Distance
   ========================================================= */

function distPointToSegment(point, start, end) {
  const dx = end.x - start.x;

  const dy = end.y - start.y;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < 1e-12) {
    return distance(point, start);
  }

  const progress = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,

    0,
    1,
  );

  return Math.hypot(
    point.x - (start.x + progress * dx),

    point.y - (start.y + progress * dy),
  );
}

/* =========================================================
   Stroke Radius
   ========================================================= */

function strokeRadiusAt(point, object, scale) {
  const renderMode = resolveRenderMode(object);

  let width;

  if (renderMode === "outline") {
    width = finite(
      point.width,

      finite(
        object.brush?.size,

        finite(object.strokeWidth, 4),
      ),
    );
  } else {
    width = finite(
      object.strokeWidth,

      finite(
        object.width,

        finite(object.brush?.size, 4),
      ),
    );
  }

  return (Math.max(0, width) * scale) / 2;
}

/* =========================================================
   Eraser Coverage
   ========================================================= */

function isCovered(point, transform, object, start, end, eraserRadius, scale) {
  const world = transform.point({
    x: point.x,
    y: point.y,
  });

  const strokeRadius = strokeRadiusAt(point, object, scale);

  return distPointToSegment(world, start, end) <= eraserRadius + strokeRadius;
}

/* =========================================================
   Find Exact Cut Boundary
   ========================================================= */

function cutBoundary(pointA, pointB, startT, endT, initialInside, isInside) {
  let low = startT;
  let high = endT;

  for (let i = 0; i < 12; i += 1) {
    const middle = (low + high) / 2;

    const candidate = interpolate(pointA, pointB, middle);

    if (isInside(candidate) === initialInside) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return interpolate(pointA, pointB, (low + high) / 2);
}

function pushUnique(points, point) {
  const previous = points[points.length - 1];

  if (!previous || distance(previous, point) > 0.001) {
    points.push(point);
  }
}

/* =========================================================
   Precision Path Clipping
   ========================================================= */

function clipPath(points, object, start, end, radius, options) {
  if (!points.length) {
    return {
      changed: false,
      fragments: [points],
    };
  }

  const transform = objectTransform(object);

  const scale = maxTransformScale(transform);

  let minX = Infinity;
  let minY = Infinity;

  let maxX = -Infinity;
  let maxY = -Infinity;

  let maxStrokeRadius = 0;

  // Calculate transformed brush bounds.
  for (const point of points) {
    const world = transform.point({
      x: point.x,
      y: point.y,
    });

    minX = Math.min(minX, world.x);

    minY = Math.min(minY, world.y);

    maxX = Math.max(maxX, world.x);

    maxY = Math.max(maxY, world.y);

    maxStrokeRadius = Math.max(
      maxStrokeRadius,

      strokeRadiusAt(point, object, scale),
    );
  }

  const margin = radius + maxStrokeRadius + 4;

  // Skip strokes outside the eraser path.
  if (
    Math.min(start.x, end.x) - margin > maxX ||
    Math.max(start.x, end.x) + margin < minX ||
    Math.min(start.y, end.y) - margin > maxY ||
    Math.max(start.y, end.y) + margin < minY
  ) {
    return {
      changed: false,
      fragments: [points],
    };
  }

  const covered = (point) =>
    isCovered(point, transform, object, start, end, radius, scale);

  // Single-point brush dab.
  if (points.length === 1) {
    return covered(points[0])
      ? {
          changed: true,
          fragments: [],
        }
      : {
          changed: false,
          fragments: [points],
        };
  }

  const fragments = [];

  let open = [];

  let previousInside = covered(points[0]);

  let changed = previousInside;

  if (!previousInside) {
    open.push({
      ...points[0],
    });
  }

  const finish = () => {
    if (open.length) {
      fragments.push(open);
    }

    open = [];
  };

  // Examine each brush path segment.
  for (let i = 0; i < points.length - 1; i += 1) {
    const pointA = points[i];

    const pointB = points[i + 1];

    const worldA = transform.point({
      x: pointA.x,
      y: pointA.y,
    });

    const worldB = transform.point({
      x: pointB.x,
      y: pointB.y,
    });

    const segmentLength = distance(worldA, worldB);

    const sampleSpacing = Math.max(
      0.5,

      Math.min(options.maximumStep, radius / 3),
    );

    const sampleCount = Math.max(
      1,

      Math.min(
        options.maximumSamplesPerPathSegment,

        Math.ceil(segmentLength / sampleSpacing),
      ),
    );

    let lastT = 0;

    for (let k = 1; k <= sampleCount; k += 1) {
      const t = k / sampleCount;

      const candidate = interpolate(pointA, pointB, t);

      const inside = covered(candidate);

      if (inside !== previousInside) {
        const border = cutBoundary(
          pointA,
          pointB,
          lastT,
          t,
          previousInside,
          covered,
        );

        if (previousInside) {
          pushUnique(open, border);
        } else {
          pushUnique(open, border);

          finish();
        }

        changed = true;
      }

      if (!inside && k === sampleCount) {
        pushUnique(open, candidate);
      }

      if (inside) {
        changed = true;
      }

      lastT = t;

      previousInside = inside;
    }
  }

  finish();

  if (!changed) {
    return {
      changed: false,
      fragments: [points],
    };
  }

  return {
    changed: true,
    fragments,
  };
}

/* =========================================================
   Build Updated Brush Geometry
   ========================================================= */

function fragmentUpdate(object, points) {
  const flatPoints = points.flatMap((point) => [point.x, point.y]);

  return {
    renderMode: resolveRenderMode(object),

    points,

    rawPoints: points.map((point) => ({
      ...point,
    })),

    flatPoints,

    previewPoints: flatPoints,

    svgPath: null,

    flatOutlinePoints: null,

    outlinePoints: null,

    geometry: {
      ...(object.geometry || {}),

      freehand: null,

      boundingBox: null,
    },
  };
}

/* =========================================================
   Preserve Fragment Layer Order
   ========================================================= */

function repositionNewFragmentsAfterOriginal(layerId, originalId, createdIds) {
  if (!createdIds.length) {
    return;
  }

  useFashionEditorStore.setState((state) => ({
    layers: state.layers.map((layer) => {
      if (layer.id !== layerId) {
        return layer;
      }

      const current = layer.objectIds || [];

      const sourceIndex = current.indexOf(originalId);

      if (sourceIndex < 0) {
        return layer;
      }

      const ids = current.filter((id) => !createdIds.includes(id));

      ids.splice(
        ids.indexOf(originalId) + 1,

        0,

        ...createdIds,
      );

      return {
        ...layer,
        objectIds: ids,
      };
    }),
  }));
}

/* =========================================================
   Erase Along Pointer Drag
   ========================================================= */

function eraseAlongDrag(context, session, currentDoc, options) {
  const state = currentState();

  const previousDoc = session.lastDoc || currentDoc;

  const radius = brushSize(context, options) / 2;

  let changed = false;

  let historyStarted = session.historyStarted;

  const processedIds = [];

  // Snapshot object IDs before mutation.
  const candidates = Object.values(state.objects || {});

  for (const old of candidates) {
    const latest = currentState();

    const object = latest.objects?.[old.id];

    if (!isErasable(latest, object, options)) {
      continue;
    }

    const points = normalizePoints(object);

    if (!points.length) {
      continue;
    }

    const clipped = clipPath(
      points,
      object,
      previousDoc,
      currentDoc,
      radius,
      options,
    );

    if (!clipped.changed) {
      continue;
    }

    if (!historyStarted) {
      latest.beginHistoryTransaction?.(HISTORY_LABEL);

      historyStarted = true;
    }

    changed = true;

    processedIds.push(object.id);

    // Remove only when nothing remains.
    if (!clipped.fragments.length) {
      currentState().deleteObjects?.([object.id], HISTORY_LABEL);

      continue;
    }

    const [first, ...rest] = clipped.fragments;

    // Retain the original object for
    // the first surviving fragment.
    currentState().updateObject?.(
      object.id,

      fragmentUpdate(object, first),

      HISTORY_LABEL,
    );

    if (!rest.length) {
      continue;
    }

    // Create new editable objects
    // for the remaining fragments.
    const clones = rest.map((fragmentPoints, index) => ({
      ...object,

      ...fragmentUpdate(object, fragmentPoints),

      id: createId(),

      name: `${object.name || "Brush"}` + ` (part ${index + 2})`,

      selected: false,
    }));

    const newIds =
      currentState().addObjects?.(
        clones,

        {
          label: HISTORY_LABEL,

          select: false,
        },
      ) || [];

    repositionNewFragmentsAfterOriginal(object.layerId, object.id, newIds);
  }

  if (changed) {
    context.requestRender?.();
  }

  return {
    ...session,

    lastDoc: {
      ...currentDoc,
    },

    historyStarted,

    changed: session.changed || changed,

    affectedIds: changed
      ? [...new Set([...(session.affectedIds || []), ...processedIds])]
      : session.affectedIds,
  };
}

/* =========================================================
   Eraser Cursor
   ========================================================= */

function getCursor(context) {
  return context?.stage?.findOne?.(`.${CURSOR_NAME}`) || null;
}

function interactionRoot(stage) {
  const layer = stage?.findOne?.(`.${INTERACTION_LAYER_NAME}`);

  if (!layer) {
    return null;
  }

  const children = layer.getChildren?.();

  return children?.[0] || layer;
}

function removeCursor(context) {
  const cursor = getCursor(context);

  const layer = cursor?.getLayer?.();

  cursor?.destroy?.();

  layer?.batchDraw?.();
}

function updateCursor(context, options) {
  const docPoint = getDocumentPoint(context);

  if (!withinDocument(docPoint, currentState())) {
    removeCursor(context);

    return;
  }

  let cursor = getCursor(context);

  if (!cursor) {
    const root = interactionRoot(context.stage);

    if (!root) {
      return;
    }

    cursor = new Konva.Group({
      name: CURSOR_NAME,

      listening: false,
    });

    cursor.add(
      new Konva.Circle({
        name: "eraser-outer",

        listening: false,

        fill: options.cursorFill,

        stroke: options.cursorStroke,
      }),
    );

    cursor.add(
      new Konva.Circle({
        name: "eraser-inner",

        listening: false,

        stroke: options.cursorInnerStroke,
      }),
    );

    root.add(cursor);

    cursor.moveToTop();
  }

  const zoom = Math.max(
    0.0001,

    finite(currentState().viewport?.zoom, 1),
  );

  const radius = brushSize(context, options) / 2;

  cursor.position(docPoint);

  const children = cursor.getChildren();

  children[0]?.radius(radius);

  children[0]?.strokeWidth(options.cursorStrokeWidth / zoom);

  children[1]?.radius(Math.max(1, radius - 2 / zoom));

  children[1]?.strokeWidth(1 / zoom);

  cursor.getLayer?.()?.batchDraw?.();
}

/* =========================================================
   Interaction Session
   ========================================================= */

function startSession(context, options) {
  const state = currentState();

  const doc = getDocumentPoint(context);

  if (!withinDocument(doc, state)) {
    return null;
  }

  const session = {
    lastDoc: {
      ...doc,
    },

    changed: false,

    historyStarted: false,

    affectedIds: [],
  };

  return eraseAlongDrag(context, session, doc, options);
}

function endSession(context, session) {
  if (session?.historyStarted) {
    if (session.changed) {
      currentState().commitHistoryTransaction?.();
    } else {
      currentState().cancelHistoryTransaction?.();
    }
  }

  return {
    changed: Boolean(session?.changed),

    erasedObjectIds: session?.affectedIds || [],
  };
}

/* =========================================================
   Create Eraser Tool
   ========================================================= */

export function createEraserTool(toolOptions = {}) {
  const options = {
    ...DEFAULT_ERASER_OPTIONS,

    ...toolOptions,

    eraseObjectTypes: Array.isArray(toolOptions.eraseObjectTypes)
      ? [...toolOptions.eraseObjectTypes]
      : [...DEFAULT_ERASER_OPTIONS.eraseObjectTypes],
  };

  const stateOfTool = (context, erasing) => {
    context.manager?.setToolState?.(
      ERASER_TOOL_ID,

      {
        mode: options.mode,

        size: brushSize(context, options),

        erasing,
      },
    );
  };

  return defineTool({
    id: ERASER_TOOL_ID,

    label: "Eraser",

    description: "Erase only touched portions of vector brush strokes.",

    shortcut: "E",

    cursor: "none",

    preventDefault: true,

    stopPropagation: false,

    allowRightButton: false,

    allowMiddleButton: false,

    /* ---------------------------------------------
           Activate
           --------------------------------------------- */

    onActivate(context) {
      removeCursor(context);

      stateOfTool(context, false);
    },

    /* ---------------------------------------------
           Pointer Enter
           --------------------------------------------- */

    onPointerEnter(context) {
      updateCursor(context, options);
    },

    /* ---------------------------------------------
           Pointer Down
           --------------------------------------------- */

    onPointerDown(context) {
      if (context.button !== POINTER_BUTTONS.LEFT) {
        return null;
      }

      updateCursor(context, options);

      const session = startSession(context, options);

      if (!session) {
        return null;
      }

      context.replaceInteractionData?.(session);

      stateOfTool(context, true);

      return session;
    },

    /* ---------------------------------------------
           Pointer Move
           --------------------------------------------- */

    onPointerMove(context) {
      updateCursor(context, options);

      const session = context.interaction?.data;

      if (!session) {
        return null;
      }

      const point = getDocumentPoint(context);

      if (!point) {
        return session;
      }

      const updated = withinDocument(point, currentState())
        ? eraseAlongDrag(context, session, point, options)
        : {
            ...session,
            lastDoc: null,
          };

      context.replaceInteractionData?.(updated);

      return updated;
    },

    /* ---------------------------------------------
           Pointer Up
           --------------------------------------------- */

    onPointerUp(context) {
      const session = context.interaction?.data;

      if (!session) {
        return null;
      }

      const point = getDocumentPoint(context);

      const updated =
        point && withinDocument(point, currentState())
          ? eraseAlongDrag(context, session, point, options)
          : session;

      const result = endSession(context, updated);

      stateOfTool(context, false);

      return result;
    },

    /* ---------------------------------------------
           Pointer Cancel
           --------------------------------------------- */

    onPointerCancel(context) {
      endSession(context, context.interaction?.data);

      stateOfTool(context, false);
    },

    /* ---------------------------------------------
           Cancel
           --------------------------------------------- */

    onCancel(context) {
      endSession(context, context.interaction?.data);

      stateOfTool(context, false);
    },

    /* ---------------------------------------------
           Pointer Leave
           --------------------------------------------- */

    onPointerLeave(context) {
      if (!context.interaction?.data) {
        removeCursor(context);
      }
    },

    /* ---------------------------------------------
           Deactivate
           --------------------------------------------- */

    onDeactivate(context) {
      endSession(context, context.interaction?.data);

      removeCursor(context);

      stateOfTool(context, false);
    },

    /* ---------------------------------------------
           Destroy
           --------------------------------------------- */

    onDestroy(context) {
      endSession(context, context.interaction?.data);

      removeCursor(context);
    },
  });
}

/* =========================================================
   Default Tool
   ========================================================= */

export const EraserTool = createEraserTool();

/* =========================================================
   Default Export
   ========================================================= */

export default EraserTool;
