import type {
  Binding,
  CanvasNode,
  LineElementData,
  LineElementNode,
  Point,
  ShapeKind,
} from "../types";
import { LINE_HEIGHT } from "./elementStyle";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TEXT_PADDING_X = 4;
export const TEXT_PADDING_Y = 2;

// Arrow tips stop just short of the outline they're bound to, like
// Excalidraw, so the arrowhead stays readable against the target's stroke.
const BINDING_GAP = 5;
const GEOMETRY_EPSILON = 0.01;

export const ANCHOR_FOCUS = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
} as const;

export type AnchorSide = keyof typeof ANCHOR_FOCUS;

const BINDABLE_TYPES: ReadonlySet<CanvasNode["type"]> = new Set([
  "conversation",
  "shapeElement",
  "textElement",
  "imageElement",
]);

export function isBindableNode(node: CanvasNode): boolean {
  return BINDABLE_TYPES.has(node.type);
}

export function getNodeBox(node: CanvasNode): Box {
  const { x, y } = node.position;
  switch (node.type) {
    case "lineElement": {
      const [start, end] = node.data.points;
      return {
        x: x + Math.min(start.x, end.x),
        y: y + Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    }
    case "textElement":
      return {
        x,
        y,
        width: node.data.width,
        height: node.measured?.height ?? node.data.fontSize * LINE_HEIGHT + TEXT_PADDING_Y * 2,
      };
    case "conversation":
      return { x, y, width: node.data.width, height: node.measured?.height ?? node.data.height };
    default:
      return { x, y, width: node.data.width, height: node.data.height };
  }
}

export function getOutlineKind(node: CanvasNode): ShapeKind {
  return node.type === "shapeElement" ? node.data.shapeKind : "rectangle";
}

export function getBoxesBounds(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distanceBetween(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

// Where a ray from the box's center toward `toward` crosses the outline —
// used both to bind an endpoint "on" a shape and to snap it there.
export function getOutlinePointToward(box: Box, kind: ShapeKind, toward: Point): Point {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const deltaX = toward.x - centerX;
  const deltaY = toward.y - centerY;
  if ((deltaX === 0 && deltaY === 0) || halfWidth === 0 || halfHeight === 0) {
    return { x: centerX, y: box.y };
  }
  const normalizedX = Math.abs(deltaX) / halfWidth;
  const normalizedY = Math.abs(deltaY) / halfHeight;
  const scale =
    kind === "ellipse"
      ? 1 / Math.hypot(normalizedX, normalizedY)
      : kind === "diamond"
        ? 1 / (normalizedX + normalizedY)
        : 1 / Math.max(normalizedX, normalizedY);
  return { x: centerX + deltaX * scale, y: centerY + deltaY * scale };
}

export function isPointInsideOutline(box: Box, kind: ShapeKind, point: Point): boolean {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  if (halfWidth === 0 || halfHeight === 0) return false;
  const normalizedX = Math.abs(point.x - (box.x + halfWidth)) / halfWidth;
  const normalizedY = Math.abs(point.y - (box.y + halfHeight)) / halfHeight;
  if (kind === "ellipse") return normalizedX ** 2 + normalizedY ** 2 <= 1;
  if (kind === "diamond") return normalizedX + normalizedY <= 1;
  return normalizedX <= 1 && normalizedY <= 1;
}

export function focusFromPoint(box: Box, point: Point): Point {
  return {
    x: box.width === 0 ? 0.5 : (point.x - box.x) / box.width,
    y: box.height === 0 ? 0.5 : (point.y - box.y) / box.height,
  };
}

export function pointFromFocus(box: Box, focus: Point): Point {
  return { x: box.x + focus.x * box.width, y: box.y + focus.y * box.height };
}

function getBoundPoint(target: CanvasNode, focus: Point): Point {
  const box = getNodeBox(target);
  const point = pointFromFocus(box, focus);
  const deltaX = point.x - (box.x + box.width / 2);
  const deltaY = point.y - (box.y + box.height / 2);
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) return point;
  return { x: point.x + (deltaX / length) * BINDING_GAP, y: point.y + (deltaY / length) * BINDING_GAP };
}

// Later array entries render on top among equal zIndex values, matching
// xyflow's own stacking.
export function sortTopmostFirst(nodes: CanvasNode[]): CanvasNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((first, second) => (second.node.zIndex ?? 0) - (first.node.zIndex ?? 0) || second.index - first.index)
    .map(({ node }) => node);
}

export interface BindingCandidate {
  binding: Binding;
  point: Point;
}

// Snaps to a side midpoint when close to one (the same four spots the
// anchor handles sit on), otherwise binds anywhere along the outline when
// the point is inside the element or within `snapRadius` of its edge.
export function findBindingAt(
  point: Point,
  nodes: CanvasNode[],
  excludedIds: ReadonlySet<string>,
  snapRadius: number,
): BindingCandidate | null {
  for (const node of sortTopmostFirst(nodes)) {
    if (!isBindableNode(node) || excludedIds.has(node.id)) continue;
    const box = getNodeBox(node);
    for (const focus of Object.values(ANCHOR_FOCUS)) {
      const anchorPoint = pointFromFocus(box, focus);
      if (distanceBetween(anchorPoint, point) <= snapRadius) {
        return { binding: { elementId: node.id, focus: { ...focus } }, point: anchorPoint };
      }
    }
    const kind = getOutlineKind(node);
    const outlinePoint = getOutlinePointToward(box, kind, point);
    if (isPointInsideOutline(box, kind, point) || distanceBetween(outlinePoint, point) <= snapRadius) {
      return { binding: { elementId: node.id, focus: focusFromPoint(box, outlinePoint) }, point: outlinePoint };
    }
  }
  return null;
}

export function findTopmostShapeAt(point: Point, nodes: CanvasNode[]): CanvasNode | null {
  for (const node of sortTopmostFirst(nodes)) {
    if (node.type !== "shapeElement") continue;
    if (isPointInsideOutline(getNodeBox(node), node.data.shapeKind, point)) return node;
  }
  return null;
}

export function getLineEndpoints(node: LineElementNode): [Point, Point] {
  const [start, end] = node.data.points;
  return [
    { x: node.position.x + start.x, y: node.position.y + start.y },
    { x: node.position.x + end.x, y: node.position.y + end.y },
  ];
}

export function getLineGeometry(start: Point, end: Point): Pick<LineElementNode, "position"> & Pick<LineElementData, "points"> {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  return {
    position: { x: minX, y: minY },
    points: [
      { x: start.x - minX, y: start.y - minY },
      { x: end.x - minX, y: end.y - minY },
    ],
  };
}

function isSamePoint(first: Point, second: Point): boolean {
  return Math.abs(first.x - second.x) < GEOMETRY_EPSILON && Math.abs(first.y - second.y) < GEOMETRY_EPSILON;
}

// Bound endpoints are derived, not stored: the persisted `points` of a
// bound end go stale as soon as its target moves, and this recomputes them
// from the target's current box. Returns the same array (and the same node
// objects) when nothing changed so memoized consumers don't re-render.
export function resolveLineBindings(nodes: CanvasNode[]): CanvasNode[] {
  const hasBoundLine = nodes.some(
    (node) => node.type === "lineElement" && (node.data.startBinding || node.data.endBinding),
  );
  if (!hasBoundLine) return nodes;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const resolveEnd = (binding: Binding | null, fallback: Point): Point => {
    const target = binding ? nodesById.get(binding.elementId) : undefined;
    if (!binding || !target || !isBindableNode(target)) return fallback;
    return getBoundPoint(target, binding.focus);
  };

  let hasChanged = false;
  const resolved = nodes.map((node) => {
    if (node.type !== "lineElement" || (!node.data.startBinding && !node.data.endBinding)) return node;
    const [currentStart, currentEnd] = getLineEndpoints(node);
    const start = resolveEnd(node.data.startBinding, currentStart);
    const end = resolveEnd(node.data.endBinding, currentEnd);
    if (isSamePoint(start, currentStart) && isSamePoint(end, currentEnd)) return node;
    hasChanged = true;
    const { position, points } = getLineGeometry(start, end);
    return { ...node, position, data: { ...node.data, points } };
  });
  return hasChanged ? resolved : nodes;
}

// Freezes the current resolved geometry of the matching bound endpoints and
// clears those bindings — e.g. when the line itself is dragged away from
// its targets, or a target is deleted.
export function detachLineBindings(
  nodes: CanvasNode[],
  shouldDetach: (line: LineElementNode, binding: Binding) => boolean,
): CanvasNode[] {
  const resolved = resolveLineBindings(nodes);
  let hasChanged = false;
  const result = resolved.map((node, index) => {
    if (node.type !== "lineElement") return nodes[index];
    const { startBinding, endBinding } = node.data;
    const detachStart = !!startBinding && shouldDetach(node, startBinding);
    const detachEnd = !!endBinding && shouldDetach(node, endBinding);
    if (!detachStart && !detachEnd) return nodes[index];
    hasChanged = true;
    return {
      ...node,
      data: {
        ...node.data,
        startBinding: detachStart ? null : startBinding,
        endBinding: detachEnd ? null : endBinding,
      },
    };
  });
  return hasChanged ? result : nodes;
}

const ANGLE_SNAP_STEP = Math.PI / 12;

// Shift-drag constraint for lines: 15° increments, like Excalidraw.
export function snapAngle(start: Point, end: Point): Point {
  const length = distanceBetween(start, end);
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / ANGLE_SNAP_STEP) * ANGLE_SNAP_STEP;
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}
