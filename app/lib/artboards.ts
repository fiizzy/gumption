import type { NodeChange } from "@xyflow/react";
import type { ArtboardData, CanvasNode, Point, ShapeElementNode } from "../types";
import { isDiagramState, type DiagramState } from "./diagram/builder";
import { getNodeBox, type Box } from "./geometry";

// Every drawing the agent makes sits on an artboard: its frame, which owns
// the nodes it drew. The artboard moves, duplicates and deletes as one with
// them, and selecting it (or anything on it) makes it the drawing the next
// request changes.

export type ArtboardNode = ShapeElementNode & { data: ShapeElementNode["data"] & { artboard: ArtboardData } };

export interface EditTarget {
  artboardId: string;
  name: string;
  state: DiagramState;
  memberIds: string[];
  framePosition: Point;
  bounds: Box;
}

export function isArtboard(node: CanvasNode): node is ArtboardNode {
  return node.type === "shapeElement" && node.data.artboard !== undefined;
}

// The artboard that is selected, or that holds something selected. With
// several, the one holding the most of the selection wins.
export function findEditTarget(nodes: CanvasNode[]): EditTarget | null {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  if (selectedIds.size === 0) return null;
  let best: { node: ArtboardNode; score: number } | null = null;
  for (const node of nodes) {
    if (!isArtboard(node)) continue;
    const score = (selectedIds.has(node.id) ? 1 : 0) + node.data.artboard.memberIds.filter((id) => selectedIds.has(id)).length;
    if (score > 0 && (!best || score > best.score)) best = { node, score };
  }
  if (!best) return null;
  const { node } = best;
  const state = node.data.artboard.diagram;
  if (!isDiagramState(state)) return null;
  return {
    artboardId: node.id,
    name: node.data.artboard.name,
    state,
    memberIds: node.data.artboard.memberIds,
    framePosition: node.position,
    bounds: getNodeBox(node),
  };
}

export function findArtboard(nodes: CanvasNode[], artboardId: string): ArtboardNode | null {
  const node = nodes.find((candidate) => candidate.id === artboardId);
  return node && isArtboard(node) ? node : null;
}

// The ids plus the members of any artboard among them.
export function withArtboardMembers(nodes: CanvasNode[], ids: ReadonlySet<string>): Set<string> {
  const expanded = new Set(ids);
  for (const node of nodes) {
    if (isArtboard(node) && ids.has(node.id)) node.data.artboard.memberIds.forEach((id) => expanded.add(id));
  }
  return expanded;
}

// When an artboard is dragged its members come along by the same amount,
// unless they are already being moved themselves (part of the selection).
export function carryArtboardMembers(nodes: CanvasNode[], changes: NodeChange<CanvasNode>[]): NodeChange<CanvasNode>[] {
  const moving = new Set(changes.flatMap((change) => (change.type === "position" && change.position ? [change.id] : [])));
  if (moving.size === 0) return changes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const carried: NodeChange<CanvasNode>[] = [];
  for (const change of changes) {
    if (change.type !== "position" || !change.position) continue;
    const artboard = byId.get(change.id);
    if (!artboard || !isArtboard(artboard)) continue;
    const deltaX = change.position.x - artboard.position.x;
    const deltaY = change.position.y - artboard.position.y;
    if (deltaX === 0 && deltaY === 0) continue;
    for (const memberId of artboard.data.artboard.memberIds) {
      const member = byId.get(memberId);
      if (!member || moving.has(memberId)) continue;
      moving.add(memberId);
      carried.push({ type: "position", id: memberId, position: { x: member.position.x + deltaX, y: member.position.y + deltaY }, dragging: change.dragging });
    }
  }
  return carried.length === 0 ? changes : [...changes, ...carried];
}

// A copy of an artboard is a plain frame around copies of its nodes: the
// model belongs to the original, which stays the one a request can change.
export function withoutArtboard(node: CanvasNode): CanvasNode {
  if (!isArtboard(node)) return node;
  const { artboard: _artboard, ...data } = node.data;
  return { ...node, data } as CanvasNode;
}
