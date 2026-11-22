import { Transform } from "konva/lib/Util";
import { defineTool } from "./ToolManager";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function projection(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
}

// Retain corners while keeping long freehand seams manageable in anchor mode.
function simplify(points, tolerance) {
  const last = points.length - 1;
  const keep = new Set([0, last]);
  const ranges = [[0, last]];
  while (ranges.length) {
    const [start, end] = ranges.pop();
    const a = points[start], b = points[end];
    let largest = tolerance;
    let corner;
    for (let i = start + 1; i < end; i++) {
      const gap = distance(points[i], mix(a, b, projection(points[i], a, b)));
      if (gap > largest) {
        largest = gap;
        corner = i;
      }
    }
    if (corner !== undefined) {
      keep.add(corner);
      ranges.push([start, corner], [corner, end]);
    }
  }
  return points.filter((_, index) => keep.has(index));
}

function smooth(nodes) {
  return nodes.map((p, i) => {
    const previous = nodes[i - 1] || p;
    const next = nodes[i + 1] || p;
    const dx = (next.x - previous.x) / 6;
    const dy = (next.y - previous.y) / 6;
    return { ...p, incoming: { x: p.x - dx, y: p.y - dy }, outgoing: { x: p.x + dx, y: p.y + dy } };
  });
}

function split(a, b, t) {
  const left = mix(a, a.outgoing || a, t);
  const middle = mix(a.outgoing || a, b.incoming || b, t);
  const right = mix(b.incoming || b, b, t);
  const incoming = mix(left, middle, t);
  const outgoing = mix(middle, right, t);
  return [{ ...a, outgoing: left }, { ...mix(incoming, outgoing, t), incoming, outgoing }, { ...b, incoming: right }];
}

function samples(a, b) {
  if (!a.outgoing && !b.incoming) return [a, b];
  const length = distance(a, a.outgoing || a) + distance(a.outgoing || a, b.incoming || b) + distance(b.incoming || b, b);
  const steps = Math.min(128, Math.max(4, Math.ceil(length / 5)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const c = a.outgoing || a, d = b.incoming || b;
    return { x: u**3*a.x + 3*u*u*t*c.x + 3*u*t*t*d.x + t**3*b.x,
      y: u**3*a.y + 3*u*u*t*c.y + 3*u*t*t*d.y + t**3*b.y };
  });
}

function geometry(penNodes) {
  const points = [penNodes[0]];
  for (let i = 1; i < penNodes.length; i++) points.push(...samples(penNodes[i-1], penNodes[i]).slice(1));
  return { penNodes, points: points.map(({x,y}) => ({x,y})), flatPoints: points.flatMap(p => [p.x,p.y]) };
}

export function penTransform(object) {
  const transform = new Transform();
  transform.translate(object.x || 0, object.y || 0);
  transform.rotate((object.rotation || 0) * Math.PI / 180);
  transform.skew(object.skewX || 0, object.skewY || 0);
  transform.scale(object.scaleX ?? 1, object.scaleY ?? 1);
  transform.translate(-(object.offsetX || 0), -(object.offsetY || 0));
  return transform;
}

export function editablePaths(state) {
  return state.layers.filter(layer => layer.visible !== false && !layer.locked)
    .flatMap(layer => layer.objectIds.map(id => state.objects[id]))
    .filter(o => o?.penNodes?.length && !o.locked && o.visible !== false);
}

function editAnchor(ctx, remove) {
  let nearest = 10 / (ctx.viewport?.zoom || 1);
  let hit;
  for (const object of editablePaths(ctx.state)) {
    const transform = penTransform(object);
    const nodes = object.penNodes;
    if (remove && nodes.length <= 2) continue;
    function consider(p, index, t) {
      const delta = distance(ctx.point, p);
      if (delta <= nearest) {
        nearest = delta;
        hit = { object, index, t };
      }
    }
    nodes.forEach((node, i) => {
      if (remove) return consider(transform.point(node), i);
      if (!i) return;
      const curve = samples(nodes[i-1], node).map(p => transform.point(p));
      for (let j = 1; j < curve.length; j++) {
        const a = curve[j-1], b = curve[j];
        const ratio = projection(ctx.point, a, b);
        const t = (j-1+ratio)/(curve.length-1);
        if (t > 0.001 && t < 0.999) consider(mix(a,b,ratio), i, t);
      }
    });
  }
  if (!hit) return;
  const { object, index, t } = hit;
  const nodes = [...object.penNodes];
  if (remove) nodes.splice(index, 1);
  else if (!nodes[index-1].outgoing && !nodes[index].incoming) nodes.splice(index, 0, mix(nodes[index-1], nodes[index], t));
  else nodes.splice(index-1, 2, ...split(nodes[index-1], nodes[index], t));
  ctx.actions.updateObject(object.id, geometry(nodes), remove ? "Delete anchor point" : "Add anchor point");
}

export function createPenTool() {
  let draft;
  let dragging;
  function clear(ctx) {
    draft = null;
    dragging = null;
    ctx.setTemporaryObject?.(null);
  }
  function pickAnchor(ctx) {
    let radius = 7 / (ctx.viewport?.zoom || 1);
    for (const object of editablePaths(ctx.state)) {
      const transform = penTransform(object);
      object.penNodes.forEach((anchor, index) => {
        const gap = distance(transform.point(anchor), ctx.point);
        if (gap <= radius) {
          radius = gap;
          dragging = { object, index, inverse: transform.copy().invert(), start: ctx.point };
        }
      });
    }
  }
  function movedGeometry(point) {
    const { object, index, inverse } = dragging;
    const next = inverse.point(point);
    const start = inverse.point(dragging.start);
    const move = p => ({ x: p.x + next.x - start.x, y: p.y + next.y - start.y });
    const nodes = [...object.penNodes];
    const anchor = nodes[index];
    nodes[index] = { ...move(anchor), incoming: anchor.incoming && move(anchor.incoming),
      outgoing: anchor.outgoing && move(anchor.outgoing) };
    return geometry(nodes);
  }
  function begin(ctx, mode) {
    const { shape, colors, activeLayerId } = ctx.state;
    draft = { mode, nodes: [], object: { type: "brush", objectKind: "pen", renderMode: "line",
      name: mode === "curvature" ? "Curvature path" : "Freeform path", layerId: activeLayerId,
      stroke: colors.primary, color: colors.primary, strokeWidth: Math.max(0.25, shape.strokeWidth),
      strokeOpacity: shape.strokeOpacity, lineCap: "round", lineJoin: "round" } };
  }
  function preview(ctx, nodes) {
    ctx.setTemporaryObject?.({ ...draft.object, ...geometry(nodes), id: "pen-preview" });
  }
  function finish(ctx) {
    if (draft?.nodes.length >= 2) {
      const nodes = draft.mode === "curvature" ? smooth(draft.nodes) : simplify(draft.nodes, 0.8 / (ctx.viewport?.zoom || 1));
      ctx.actions.addObject({ ...draft.object, ...geometry(nodes) }, { label: "Draw pen path" });
    }
    clear(ctx);
  }
  return defineTool({
    id: "pen", label: "Pen", cursor: "crosshair",
    onPointerDown(ctx) {
      const mode = ctx.state.shape.penMode || "freeform";
      if (mode === "add") {
        pickAnchor(ctx);
        if (!dragging) editAnchor(ctx, false);
        return;
      }
      if (mode === "delete") return editAnchor(ctx, true);
      if (!draft || draft.mode !== mode || mode === "freeform") begin(ctx, mode);
      if (mode === "curvature" && draft.nodes.length >= 2 &&
          distance(ctx.point, draft.nodes.at(-1)) <= 6 / (ctx.viewport?.zoom || 1)) return finish(ctx);
      draft.nodes.push(ctx.point);
      preview(ctx, mode === "curvature" ? smooth(draft.nodes) : draft.nodes);
    },
    onPointerMove(ctx) {
      if (dragging) {
        ctx.setTemporaryObject?.({ ...dragging.object, ...movedGeometry(ctx.point), id: "pen-preview", opacity: 0.65 });
        return;
      }
      if (!draft) return;
      if (draft.mode === "curvature") return preview(ctx, smooth([...draft.nodes, ctx.point]));
      if (distance(ctx.point, draft.nodes.at(-1)) < 3 / (ctx.viewport?.zoom || 1)) return;
      draft.nodes.push(ctx.point);
      preview(ctx, draft.nodes);
    },
    onPointerUp(ctx) {
      if (dragging) {
        if (distance(ctx.point, dragging.start) > 0) {
          ctx.actions.updateObject(dragging.object.id, movedGeometry(ctx.point), "Move anchor point");
        }
        clear(ctx);
        return;
      }
      if (draft?.mode !== "freeform") return;
      if (distance(ctx.point, draft.nodes.at(-1)) > 0) draft.nodes.push(ctx.point);
      finish(ctx);
    },
    onKeyDown(ctx, event) {
      if (event.key === "Escape") clear(ctx);
      if (event.key === "Enter" && draft?.mode === "curvature") finish(ctx);
    },
    onCancel: clear, onPointerCancel: clear, onDeactivate: clear
  });
}

export default createPenTool();
