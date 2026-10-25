import type { Point } from "../../types";
import type { Box } from "../geometry";
import type { DiagramDirection } from "./operations";

// Layout for a hierarchy: site maps, org charts, taxonomies. The agent
// connects parents to children; this decides where everything sits, with
// the conventions of information-architecture diagrams:
//
// - the root at the top, children centred under their parent, siblings
//   evenly spaced (a tidy tree);
// - from a chosen depth down, children stack as an indented list under
//   their parent so a deep site stays narrow;
// - one bus line per parent instead of a fan of separate elbows;
// - extra roots (utility pages such as sign-in or 404) on a rail beside
//   the main tree;
// - links that are not parent-child (cross-links) routed around the outside.
//
// Works in an abstract frame like placement.ts: `u` runs with depth and `v`
// across siblings.

export interface TreeShapeInput {
  id: string;
  width: number;
  height: number;
}

export interface TreeConnectorInput {
  id: string;
  from: string;
  to: string;
}

export interface TreeLayoutInput {
  direction: DiagramDirection;
  contentOrigin: Point;
  shapes: TreeShapeInput[];
  connectors: TreeConnectorInput[];
  // Children of a node at this depth or deeper stack as a list. Infinity
  // spreads every level.
  stackFromDepth: number;
}

export interface TreeBus {
  parentId: string;
  // From the parent down to the bus line (or the stacked list's spine).
  trunk: Point[];
  // Across the children, when there are two or more spread out.
  bar: Point[] | null;
}

export interface TreeLayoutResult {
  shapeBoxes: Map<string, Box>;
  // Parent-to-child: the drop from the bus into the child.
  connectorPaths: Map<string, Point[]>;
  buses: TreeBus[];
  crossLinkIds: Set<string>;
  contentBounds: Box | null;
}

const LEVEL_GAP = 72;
const SIBLING_GAP = 28;
const STACK_INDENT = 36;
const STACK_GAP = 14;
const STACK_TOP_GAP = 24;
const RAIL_GAP = 96;
const RAIL_ITEM_GAP = 20;
const CROSS_LINK_MARGIN = 40;
const CROSS_LINK_TRACK_SPACING = 12;

interface TreeNode {
  id: string;
  uSize: number;
  vSize: number;
  depth: number;
  children: TreeNode[];
  parentConnectorId: string | null;
  u: number;
  v: number;
}

export function layoutTree(input: TreeLayoutInput): TreeLayoutResult {
  const isRight = input.direction === "right";
  const toReal = (u: number, v: number): Point => (isRight ? { x: u, y: v } : { x: v, y: u });
  const originU = isRight ? input.contentOrigin.x : input.contentOrigin.y;
  const originV = isRight ? input.contentOrigin.y : input.contentOrigin.x;
  // Lists only read as lists when they run down the page.
  const stackFromDepth = isRight ? Infinity : input.stackFromDepth;

  const nodes = new Map<string, TreeNode>();
  for (const shape of input.shapes) {
    nodes.set(shape.id, {
      id: shape.id,
      uSize: isRight ? shape.width : shape.height,
      vSize: isRight ? shape.height : shape.width,
      depth: 0,
      children: [],
      parentConnectorId: null,
      u: 0,
      v: 0,
    });
  }

  // The first connection into a shape makes it a child, unless that would
  // close a cycle; every other connection is a cross-link.
  const parentOf = new Map<string, string>();
  const crossLinkIds = new Set<string>();
  const isAncestor = (candidate: string, of: string) => {
    let current: string | undefined = of;
    while (current) {
      if (current === candidate) return true;
      current = parentOf.get(current);
    }
    return false;
  };
  for (const connector of input.connectors) {
    const from = nodes.get(connector.from);
    const to = nodes.get(connector.to);
    if (!from || !to || from === to) continue;
    if (parentOf.has(to.id) || isAncestor(to.id, from.id)) {
      crossLinkIds.add(connector.id);
      continue;
    }
    parentOf.set(to.id, from.id);
    to.parentConnectorId = connector.id;
    from.children.push(to);
  }
  const roots = [...nodes.values()].filter((node) => !parentOf.has(node.id));
  const setDepths = (node: TreeNode, depth: number) => {
    node.depth = depth;
    node.children.forEach((child) => setDepths(child, depth + 1));
  };
  roots.forEach((root) => setDepths(root, 0));

  const isStackedParent = (node: TreeNode) => node.depth >= stackFromDepth;

  // ── Breadth of each subtree, and the depth of each spread level ─
  const breadthOf = new Map<string, number>();
  // Where each node's subtree starts across: its corridor for cross-links
  // runs just past the subtree's far edge.
  const breadthStartOf = new Map<string, number>();
  const stackedExtentOf = new Map<string, number>();
  const measure = (node: TreeNode): number => {
    if (node.children.length === 0) {
      breadthOf.set(node.id, node.vSize);
      return node.vSize;
    }
    if (isStackedParent(node)) {
      const breadth = Math.max(node.vSize, ...node.children.map((child) => STACK_INDENT + measure(child)));
      breadthOf.set(node.id, breadth);
      return breadth;
    }
    const childrenBreadth = node.children.reduce((total, child) => total + measure(child), 0) + SIBLING_GAP * (node.children.length - 1);
    const breadth = Math.max(node.vSize, childrenBreadth);
    breadthOf.set(node.id, breadth);
    return breadth;
  };
  roots.forEach(measure);

  // Spread levels share a u position per depth; stacked lists hang from
  // their parent and take whatever height they need.
  const levelExtent: number[] = [];
  const visitLevels = (node: TreeNode) => {
    levelExtent[node.depth] = Math.max(levelExtent[node.depth] ?? 0, node.uSize);
    if (!isStackedParent(node)) node.children.forEach(visitLevels);
  };
  roots.forEach(visitLevels);
  const levelStart: number[] = [];
  let levelCursor = originU;
  levelExtent.forEach((extent, depth) => {
    levelStart[depth] = levelCursor;
    levelCursor += extent + LEVEL_GAP;
  });

  // ── Positions ─────────────────────────────────────────────────
  const placeStacked = (node: TreeNode): number => {
    let cursor = node.u + node.uSize + STACK_TOP_GAP;
    for (const child of node.children) {
      child.u = cursor;
      child.v = node.v + STACK_INDENT;
      breadthStartOf.set(child.id, child.v);
      cursor = (child.children.length > 0 ? placeStacked(child) : child.u + child.uSize) + STACK_GAP;
    }
    stackedExtentOf.set(node.id, cursor - STACK_GAP);
    return cursor - STACK_GAP;
  };
  const centerV = (node: TreeNode) => node.v + node.vSize / 2;
  const centerU = (node: TreeNode) => node.u + node.uSize / 2;
  const placeSpread = (node: TreeNode, vStart: number) => {
    const breadth = breadthOf.get(node.id)!;
    breadthStartOf.set(node.id, vStart);
    node.u = levelStart[node.depth];
    node.v = vStart + (breadth - node.vSize) / 2;
    if (node.children.length === 0) return;
    if (isStackedParent(node)) {
      node.v = vStart;
      placeStacked(node);
      return;
    }
    const childrenBreadth = node.children.reduce((total, child) => total + breadthOf.get(child.id)!, 0) + SIBLING_GAP * (node.children.length - 1);
    let cursor = vStart + (breadth - childrenBreadth) / 2;
    for (const child of node.children) {
      placeSpread(child, cursor);
      cursor += breadthOf.get(child.id)! + SIBLING_GAP;
    }
    // Over the middle of its children, not of their subtrees: a parent of a
    // list on the left and a leaf on the right still sits between the two.
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    node.v = (centerV(first) + centerV(last)) / 2 - node.vSize / 2;
  };

  const [mainRoot, ...railRoots] = roots;
  if (mainRoot) placeSpread(mainRoot, originV);
  const mainBreadth = mainRoot ? breadthOf.get(mainRoot.id)! : 0;
  // Extra roots line up on a rail past the main tree, each with its own subtree.
  let railCursor = originU;
  const railV = originV + mainBreadth + (mainRoot ? RAIL_GAP : 0);
  for (const root of railRoots) {
    const savedLevelStart = [...levelStart];
    levelStart.forEach((_, depth) => (levelStart[depth] = railCursor + (savedLevelStart[depth] - originU)));
    placeSpread(root, railV);
    levelStart.splice(0, levelStart.length, ...savedLevelStart);
    railCursor = subtreeEndU(root) + RAIL_ITEM_GAP;
  }

  // ── Buses and drops ───────────────────────────────────────────
  const buses: TreeBus[] = [];
  const connectorPaths = new Map<string, Point[]>();
  for (const node of nodes.values()) {
    if (node.children.length === 0) continue;
    if (isStackedParent(node)) {
      const spineV = node.v + STACK_INDENT / 2;
      const last = node.children[node.children.length - 1];
      buses.push({ parentId: node.id, trunk: [toReal(node.u + node.uSize, spineV), toReal(centerU(last), spineV)], bar: null });
      for (const child of node.children) {
        connectorPaths.set(child.parentConnectorId!, [toReal(centerU(child), spineV), toReal(centerU(child), child.v)]);
      }
      continue;
    }
    const busU = node.u + node.uSize + LEVEL_GAP / 2;
    const childCenters = node.children.map(centerV);
    const first = Math.min(...childCenters);
    const last = Math.max(...childCenters);
    buses.push({
      parentId: node.id,
      trunk: [toReal(node.u + node.uSize, centerV(node)), toReal(busU, centerV(node))],
      bar: node.children.length > 1 ? [toReal(busU, first), toReal(busU, last)] : null,
    });
    for (const child of node.children) {
      connectorPaths.set(child.parentConnectorId!, [toReal(busU, centerV(child)), toReal(child.u, centerV(child))]);
    }
  }

  // ── Cross-links: out of the side into the corridor beside the subtree,
  // down to a rail past the bottom of the tree, and back up the target's
  // corridor. Two nodes in the same corridor get a straight run.
  const maxU = Math.max(...[...nodes.values()].map((node) => subtreeEndU(node)));
  const corridorOf = (node: TreeNode) => (breadthStartOf.get(node.id) ?? node.v) + breadthOf.get(node.id)! + SIBLING_GAP / 2;
  let track = 0;
  for (const connector of input.connectors) {
    if (!crossLinkIds.has(connector.id)) continue;
    const from = nodes.get(connector.from)!;
    const to = nodes.get(connector.to)!;
    const fromCorridor = corridorOf(from);
    const toCorridor = corridorOf(to);
    const start = toReal(centerU(from), from.v + from.vSize);
    const end = toReal(centerU(to), to.v + to.vSize);
    if (Math.abs(fromCorridor - toCorridor) < 1) {
      connectorPaths.set(connector.id, [start, toReal(centerU(from), fromCorridor), toReal(centerU(to), fromCorridor), end]);
      continue;
    }
    const rail = maxU + CROSS_LINK_MARGIN + track * CROSS_LINK_TRACK_SPACING;
    track += 1;
    connectorPaths.set(connector.id, [
      start,
      toReal(centerU(from), fromCorridor),
      toReal(rail, fromCorridor),
      toReal(rail, toCorridor),
      toReal(centerU(to), toCorridor),
      end,
    ]);
  }

  // ── Back to the canvas ────────────────────────────────────────
  const shapeBoxes = new Map<string, Box>();
  let contentBounds: Box | null = null;
  for (const node of nodes.values()) {
    const box = isRight ? { x: node.u, y: node.v, width: node.uSize, height: node.vSize } : { x: node.v, y: node.u, width: node.vSize, height: node.uSize };
    shapeBoxes.set(node.id, box);
    contentBounds = contentBounds ? unite(contentBounds, box) : box;
  }
  return { shapeBoxes, connectorPaths, buses, crossLinkIds, contentBounds };

  function subtreeEndU(node: TreeNode): number {
    const own = node.u + node.uSize;
    if (node.children.length === 0) return own;
    if (isStackedParent(node)) return stackedExtentOf.get(node.id) ?? own;
    return Math.max(own, ...node.children.map(subtreeEndU));
  }
}

function unite(first: Box, second: Box): Box {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x + first.width, second.x + second.width) - x,
    height: Math.max(first.y + first.height, second.y + second.height) - y,
  };
}
