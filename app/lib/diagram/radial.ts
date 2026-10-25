import type { Point } from "../../types";
import type { Box } from "../geometry";

// Layout for a mind map: the topic in the middle, its branches spread to
// the right and to the left so the two halves carry about the same number
// of ideas, each branch a small sideways tree, and every link a smooth
// curve from parent to child. Depth sets the size of a node (the builder
// decides the sizes) so the eye reads the hierarchy without lines.

export interface RadialShapeInput {
  id: string;
}

export interface RadialConnectorInput {
  id: string;
  from: string;
  to: string;
}

export interface RadialLayoutInput {
  contentOrigin: Point;
  shapes: RadialShapeInput[];
  connectors: RadialConnectorInput[];
  sizeForDepth: (depth: number) => { width: number; height: number };
}

export interface RadialLayoutResult {
  shapeBoxes: Map<string, Box>;
  depthOf: Map<string, number>;
  // Which top-level branch a node belongs to (the root has none).
  branchOf: Map<string, number>;
  // Parent-to-child, as the two ends of a curved connector; the renderer
  // bends the curve between them (see getCurvedLinePoints).
  connectorPaths: Map<string, Point[]>;
  crossLinkIds: Set<string>;
  contentBounds: Box | null;
}

const LEVEL_GAP = 64;
const SIBLING_GAP = 14;

interface RadialNode {
  id: string;
  width: number;
  height: number;
  depth: number;
  branch: number;
  side: 1 | -1;
  children: RadialNode[];
  parentConnectorId: string | null;
  x: number;
  y: number;
}

export function layoutRadial(input: RadialLayoutInput): RadialLayoutResult {
  const nodes = new Map<string, RadialNode>();
  for (const shape of input.shapes) {
    nodes.set(shape.id, { id: shape.id, width: 0, height: 0, depth: 0, branch: -1, side: 1, children: [], parentConnectorId: null, x: 0, y: 0 });
  }
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
  const root = roots[0];
  const shapeBoxes = new Map<string, Box>();
  const depthOf = new Map<string, number>();
  const branchOf = new Map<string, number>();
  const connectorPaths = new Map<string, Point[]>();
  if (!root) return { shapeBoxes, depthOf, branchOf, connectorPaths, crossLinkIds, contentBounds: null };
  // Loose ideas hang off the topic rather than floating away.
  for (const stray of roots.slice(1)) root.children.push(stray);

  const setDepths = (node: RadialNode, depth: number, branch: number) => {
    node.depth = depth;
    node.branch = branch;
    const size = input.sizeForDepth(depth);
    node.width = size.width;
    node.height = size.height;
    node.children.forEach((child, index) => setDepths(child, depth + 1, depth === 0 ? index : branch));
  };
  setDepths(root, 0, -1);

  // ── Split the branches so the halves balance by leaf count ────
  const leafCount = (node: RadialNode): number => (node.children.length === 0 ? 1 : node.children.reduce((total, child) => total + leafCount(child), 0));
  const totalLeaves = root.children.reduce((total, child) => total + leafCount(child), 0);
  let rightLeaves = 0;
  const rightBranches: RadialNode[] = [];
  const leftBranches: RadialNode[] = [];
  for (const branch of root.children) {
    if (rightLeaves < totalLeaves / 2) {
      rightBranches.push(branch);
      rightLeaves += leafCount(branch);
    } else {
      leftBranches.push(branch);
    }
  }
  const markSide = (node: RadialNode, side: 1 | -1) => {
    node.side = side;
    node.children.forEach((child) => markSide(child, side));
  };
  rightBranches.forEach((branch) => markSide(branch, 1));
  leftBranches.forEach((branch) => markSide(branch, -1));

  // ── Each half is a sideways tidy tree ─────────────────────────
  const extentOf = new Map<string, number>();
  const measure = (node: RadialNode): number => {
    const extent = node.children.length === 0 ? node.height : Math.max(node.height, node.children.reduce((total, child) => total + measure(child), 0) + SIBLING_GAP * (node.children.length - 1));
    extentOf.set(node.id, extent);
    return extent;
  };
  const sideExtent = (branches: RadialNode[]) => branches.reduce((total, branch) => total + measure(branch), 0) + Math.max(0, SIBLING_GAP * (branches.length - 1));
  const rightExtent = sideExtent(rightBranches);
  const leftExtent = sideExtent(leftBranches);
  const tallest = Math.max(root.height, rightExtent, leftExtent);
  const centerY = input.contentOrigin.y + tallest / 2;
  const leftWidth = leftBranches.length === 0 ? 0 : widthOfSide(leftBranches);
  root.x = input.contentOrigin.x + leftWidth + (leftBranches.length === 0 ? 0 : LEVEL_GAP);
  root.y = centerY - root.height / 2;

  const place = (node: RadialNode, top: number, nearX: number) => {
    const extent = extentOf.get(node.id)!;
    node.y = top + (extent - node.height) / 2;
    node.x = node.side === 1 ? nearX : nearX - node.width;
    const childrenExtent = node.children.reduce((total, child) => total + extentOf.get(child.id)!, 0) + SIBLING_GAP * (node.children.length - 1);
    let cursor = top + (extent - childrenExtent) / 2;
    const childNearX = node.side === 1 ? node.x + node.width + LEVEL_GAP : node.x - LEVEL_GAP;
    for (const child of node.children) {
      place(child, cursor, childNearX);
      cursor += extentOf.get(child.id)! + SIBLING_GAP;
    }
  };
  const placeSide = (branches: RadialNode[], extent: number) => {
    let cursor = centerY - extent / 2;
    for (const branch of branches) {
      place(branch, cursor, branch.side === 1 ? root.x + root.width + LEVEL_GAP : root.x - LEVEL_GAP);
      cursor += extentOf.get(branch.id)! + SIBLING_GAP;
    }
  };
  placeSide(rightBranches, rightExtent);
  placeSide(leftBranches, leftExtent);

  // ── Curves from each parent's near side to each child's ───────
  let contentBounds: Box | null = null;
  for (const node of nodes.values()) {
    const box = { x: node.x, y: node.y, width: node.width, height: node.height };
    shapeBoxes.set(node.id, box);
    depthOf.set(node.id, node.depth);
    if (node.branch >= 0) branchOf.set(node.id, node.branch);
    contentBounds = contentBounds ? unite(contentBounds, box) : box;
    for (const child of node.children) {
      if (!child.parentConnectorId) continue;
      const start = { x: child.side === 1 ? node.x + node.width : node.x, y: node.y + node.height / 2 };
      const end = { x: child.side === 1 ? child.x : child.x + child.width, y: child.y + child.height / 2 };
      connectorPaths.set(child.parentConnectorId, [start, end]);
    }
  }
  return { shapeBoxes, depthOf, branchOf, connectorPaths, crossLinkIds, contentBounds };

  function widthOfSide(branches: RadialNode[]): number {
    const depthWidth = (node: RadialNode): number => node.width + (node.children.length === 0 ? 0 : LEVEL_GAP + Math.max(...node.children.map(depthWidth)));
    return Math.max(...branches.map(depthWidth));
  }
}

function unite(first: Box, second: Box): Box {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return { x, y, width: Math.max(first.x + first.width, second.x + second.width) - x, height: Math.max(first.y + first.height, second.y + second.height) - y };
}
