/*
 * =========================================================
 * FashionVision Professional Editor
 * Precision Vector Eraser
 *
 * Version 2.1 — Stamp / Texture Brush Support
 * =========================================================
 *
 * Supports:
 * - Partial erasing of line strokes
 * - Partial erasing of outline brush strokes
 * - Charcoal and chalk stamp brush erasing
 * - Rotated and scaled brush objects
 * - Active-layer-only editing
 * - Layer and object locking
 * - Undo / redo transactions
 * - Live eraser cursor
 *
 * Raster image pixels are not erased.
 * Textured stamps are removed as complete individual marks.
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
   Pointer Helpers
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

  return screen && typeof context?.toDocumentPoint === "function"
    ? asPoint(context.toDocumentPoint(screen))
    : null;
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

function brushSize(context, options) {
  return clamp(
    currentState()?.eraser?.size ?? context?.eraser?.size ?? options.size,
    options.minimumSize,
    options.maximumSize,
  );
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `brush-${globalThis.crypto.randomUUID()}`;
  }

  return `brush-${Date.now()}-` + Math.random().toString(36).slice(2);
}

/* =========================================================
   Layer and Brush Object Helpers
   ========================================================= */

function getLayer(state, object) {
  return (
    (state.layers || []).find((layer) => layer.id === object.layerId) ||
    (state.layers || []).find((layer) => layer.objectIds?.includes(object.id))
  );
}

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

  return resolveRenderMode(object) !== "stamp" || Array.isArray(object.stamps);
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

    for (let index = 0; index + 1 < points.length; index += 2) {
      if (
        Number.isFinite(points[index]) &&
        Number.isFinite(points[index + 1])
      ) {
        result.push({
          x: points[index],
          y: points[index + 1],
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

function interpolate(a, b, t) {
  const next = { ...a };

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
   Object Transform Helpers
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
   Geometry and Collision Helpers
   ========================================================= */

function distPointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < 1e-12) {
    return distance(point, a);
  }

  const position = clamp(
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
    0,
    1,
  );

  return Math.hypot(
    point.x - (a.x + position * dx),
    point.y - (a.y + position * dy),
  );
}

function strokeRadiusAt(point, object, scale) {
  const renderMode = resolveRenderMode(object);

  let width;

  if (renderMode === "outline") {
    width = finite(
      point.width,
      finite(object.brush?.size, finite(object.strokeWidth, 4)),
    );
  } else {
    width = finite(
      object.strokeWidth,
      finite(object.width, finite(object.brush?.size, 4)),
    );
  }

  return (Math.max(0, width) * scale) / 2;
}

function isCovered(point, transform, object, a, b, eraserRadius, scale) {
  const world = transform.point({
    x: point.x,
    y: point.y,
  });

  const strokeRadius = strokeRadiusAt(point, object, scale);

  return distPointToSegment(world, a, b) <= eraserRadius + strokeRadius;
}

function cutBoundary(p0, p1, t0, t1, inside0, isInside) {
  let lower = t0;
  let upper = t1;

  for (let index = 0; index < 12; index += 1) {
    const middle = (lower + upper) / 2;

    if (isInside(interpolate(p0, p1, middle)) === inside0) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return interpolate(p0, p1, (lower + upper) / 2);
}

function pushUnique(points, point) {
  const previous = points[points.length - 1];

  if (!previous || distance(previous, point) > 0.001) {
    points.push(point);
  }
}

/* =========================================================
   Segment Intersection Helpers
   ========================================================= */

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  const abC = cross(a, b, c);
  const abD = cross(a, b, d);

  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  return abC * abD < 0 && cdA * cdB < 0;
}

function distSegmentToSegment(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) {
    return 0;
  }

  return Math.min(
    distPointToSegment(a, c, d),
    distPointToSegment(b, c, d),
    distPointToSegment(c, a, b),
    distPointToSegment(d, a, b),
  );
}

function positiveOr(value, fallback) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

/* =========================================================
   Stamp Brush Geometry
   ========================================================= */

function stampRadii(stamp, object) {
  const defaultSize = Math.max(
    0.1,
    finite(
      object.strokeWidth ??
        object.width ??
        object.size ??
        object.style?.strokeWidth ??
        object.brush?.size,
      4,
    ),
  );

  const size = Math.max(0.1, finite(stamp.size ?? stamp.diameter, defaultSize));

  return {
    rx: Math.max(
      0.05,
      finite(
        stamp.radiusX ??
          (stamp.width !== undefined
            ? finite(stamp.width, size) / 2
            : size / 2),
        size / 2,
      ),
    ),

    ry: Math.max(
      0.05,
      finite(
        stamp.radiusY ??
          (stamp.height !== undefined
            ? finite(stamp.height, size) / 2
            : size / 2),
        size / 2,
      ),
    ),
  };
}

/* =========================================================
   Stamp Collision Detection

   Charcoal and chalk are made of multiple textured
   ellipse stamps. Instead of splitting their center path,
   detect which individual stamps intersect the eraser.
   ========================================================= */

function stampTouched(
  stamp,
  object,
  transform,
  inverse,
  maxScale,
  a,
  b,
  radius,
) {
  if (!stamp || typeof stamp !== "object") {
    return false;
  }

  const x = Number(stamp.x ?? stamp.point?.x);

  const y = Number(stamp.y ?? stamp.point?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }

  const { rx, ry } = stampRadii(stamp, object);

  const scaleX = positiveOr(stamp.scaleX ?? stamp.scale, 1);

  const scaleY = positiveOr(stamp.scaleY ?? stamp.scale, 1);

  const rotation = (finite(stamp.rotation ?? stamp.angle) * Math.PI) / 180;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const extentX = rx * scaleX;
  const extentY = ry * scaleY;

  const center = transform.point({
    x,
    y,
  });

  // Reject stamps too far from the eraser path.
  if (
    distPointToSegment(center, a, b) >
    radius + Math.max(extentX, extentY) * maxScale
  ) {
    return false;
  }

  const pointInside = (world) => {
    if (!inverse) {
      return false;
    }

    const local = inverse.point(world);

    const dx = local.x - x;
    const dy = local.y - y;

    const u = (cos * dx + sin * dy) / extentX;

    const v = (-sin * dx + cos * dy) / extentY;

    return u * u + v * v <= 1;
  };

  if (pointInside(a) || pointInside(b)) {
    return true;
  }

  // Approximate the ellipse perimeter for collision tests.
  const steps = 32;

  const ellipsePoint = (angle) => {
    const dx = extentX * Math.cos(angle);
    const dy = extentY * Math.sin(angle);

    return transform.point({
      x: x + cos * dx - sin * dy,
      y: y + sin * dx + cos * dy,
    });
  };

  let before = ellipsePoint(0);

  for (let index = 1; index <= steps; index += 1) {
    const next = ellipsePoint((index * 2 * Math.PI) / steps);

    if (distSegmentToSegment(a, b, before, next) <= radius + 0.05) {
      return true;
    }

    before = next;
  }

  return false;
}

/* =========================================================
   Clip Stamp Dabs

   IMPORTANT:
   This is the function required for charcoal/chalk
   erasing support.
   ========================================================= */

function clipStampDabs(object, a, b, eraserRadius) {
  const stamps = Array.isArray(object.stamps) ? object.stamps : [];

  if (!stamps.length) {
    return {
      changed: false,
      stamps,
    };
  }

  const transform = objectTransform(object);

  let inverse = null;

  try {
    inverse = transform.copy().invert();
  } catch {
    // Ignore singular transforms.
  }

  const maxScale = maxTransformScale(transform);

  let changed = false;

  const survivors = stamps.filter((stamp) => {
    const touched = stampTouched(
      stamp,
      object,
      transform,
      inverse,
      maxScale,
      a,
      b,
      eraserRadius,
    );

    if (touched) {
      changed = true;
    }

    return !touched;
  });

  return {
    changed,
    stamps: changed ? survivors : stamps,
  };
}

/* =========================================================
   Clip Ordinary Vector Paths
   ========================================================= */

function clipPath(points, object, a, b, radius, options) {
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

  if (
    Math.min(a.x, b.x) - margin > maxX ||
    Math.max(a.x, b.x) + margin < minX ||
    Math.min(a.y, b.y) - margin > maxY ||
    Math.max(a.y, b.y) + margin < minY
  ) {
    return {
      changed: false,
      fragments: [points],
    };
  }

  const covered = (point) =>
    isCovered(point, transform, object, a, b, radius, scale);

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

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index];
    const p1 = points[index + 1];

    const world0 = transform.point({
      x: p0.x,
      y: p0.y,
    });

    const world1 = transform.point({
      x: p1.x,
      y: p1.y,
    });

    const segmentLength = distance(world0, world1);

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

    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const t = sampleIndex / sampleCount;

      const candidate = interpolate(p0, p1, t);

      const inside = covered(candidate);

      if (inside !== previousInside) {
        const border = cutBoundary(p0, p1, lastT, t, previousInside, covered);

        if (previousInside) {
          pushUnique(open, border);
        } else {
          pushUnique(open, border);
          finish();
        }

        changed = true;
      }

      if (!inside && sampleIndex === sampleCount) {
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
   Rebuild Vector Stroke Fragments
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
   Preserve Fragment Ordering
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

      ids.splice(ids.indexOf(originalId) + 1, 0, ...createdIds);

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

  // Snapshot IDs before changing any objects.
  const candidates = Object.values(state.objects || {});

  for (const old of candidates) {
    const latest = currentState();

    const object = latest.objects?.[old.id];

    if (!isErasable(latest, object, options)) {
      continue;
    }

    const stampMode = resolveRenderMode(object) === "stamp";

    const clipped = stampMode
      ? clipStampDabs(object, previousDoc, currentDoc, radius)
      : clipPath(
          normalizePoints(object),
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

    /* -----------------------------------------
       Charcoal / Chalk / Stamp Brushes
       ----------------------------------------- */

    if (stampMode) {
      if (!clipped.stamps.length) {
        currentState().deleteObjects?.([object.id], HISTORY_LABEL);
      } else {
        currentState().updateObject?.(
          object.id,
          {
            stamps: clipped.stamps,
          },
          HISTORY_LABEL,
        );
      }

      continue;
    }

    /* -----------------------------------------
       Ordinary Vector Brush Strokes
       ----------------------------------------- */

    if (!clipped.fragments.length) {
      currentState().deleteObjects?.([object.id], HISTORY_LABEL);

      continue;
    }

    const [first, ...rest] = clipped.fragments;

    currentState().updateObject?.(
      object.id,
      fragmentUpdate(object, first),
      HISTORY_LABEL,
    );

    if (!rest.length) {
      continue;
    }

    const clones = rest.map((points, index) => ({
      ...object,
      ...fragmentUpdate(object, points),

      id: createId(),

      name: `${object.name || "Brush"} ` + `(part ${index + 2})`,

      selected: false,
    }));

    const newIds =
      currentState().addObjects?.(clones, {
        label: HISTORY_LABEL,
        select: false,
      }) || [];

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

  const zoom = Math.max(0.0001, finite(currentState().viewport?.zoom, 1));

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
   Interaction Sessions
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
   Eraser Tool Factory
   ========================================================= */

export function createEraserTool(toolOptions = {}) {
  const options = {
    ...DEFAULT_ERASER_OPTIONS,
    ...toolOptions,

    eraseObjectTypes: Array.isArray(toolOptions.eraseObjectTypes)
      ? [...toolOptions.eraseObjectTypes]
      : [...DEFAULT_ERASER_OPTIONS.eraseObjectTypes],
  };

  const stateOfTool = (context, erasing) =>
    context.manager?.setToolState?.(ERASER_TOOL_ID, {
      mode: options.mode,

      size: brushSize(context, options),

      erasing,
    });

  return defineTool({
    id: ERASER_TOOL_ID,

    label: "Eraser",

    description: "Erase vector stroke sections and textured stamp marks.",

    shortcut: "E",

    cursor: "none",

    preventDefault: true,

    stopPropagation: false,

    allowRightButton: false,

    allowMiddleButton: false,

    onActivate(context) {
      removeCursor(context);

      stateOfTool(context, false);
    },

    onPointerEnter(context) {
      updateCursor(context, options);
    },

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

    onPointerCancel(context) {
      endSession(context, context.interaction?.data);

      stateOfTool(context, false);
    },

    onCancel(context) {
      endSession(context, context.interaction?.data);

      stateOfTool(context, false);
    },

    onPointerLeave(context) {
      if (!context.interaction?.data) {
        removeCursor(context);
      }
    },

    onDeactivate(context) {
      endSession(context, context.interaction?.data);

      removeCursor(context);

      stateOfTool(context, false);
    },

    onDestroy(context) {
      endSession(context, context.interaction?.data);

      removeCursor(context);
    },
  });
}

/* =========================================================
   Default Export
   ========================================================= */

export const EraserTool = createEraserTool();

export default EraserTool;
