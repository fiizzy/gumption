import type { Node, Edge } from '@xyflow/react';

export type ShapeKind = 'square' | 'circle' | 'diamond';

// App-level UI state, not per-node data — which coding harness new chat
// nodes would use. Only 'claude' is actually wired up to app/lib/ai.ts
// today; 'codex' is a non-functional placeholder for a future harness.
export type Harness = 'claude' | 'codex';

// Shared styling vocabulary across shapes, lines/arrows, and text.
export type StrokeStyle = 'solid' | 'dashed';
export type FontWeight = 'normal' | 'bold';

export interface Point {
  x: number;
  y: number;
}

// ── Persisted shape — what actually lives in CanvasChat's `nodes` state ──
//
// `branchParentId` is deliberately NOT named `parentId` — xyflow reserves
// `Node.parentId` for its own sub-flow/grouping nesting feature, and
// reusing that name would silently collide with it.
//
// Every conversation node either branches from an earlier one (set) or is
// a standalone, untethered session (null) — there is no other connection
// type. See CanvasChat's `addNode` for how the active node is carried
// forward by default so continuing a thread doesn't require re-selecting it.
export interface ConversationNodeData {
  [key: string]: unknown;
  prompt: string;
  response: string;
  loading: boolean;
  minimized: boolean;
  color: string;
  branchParentId: string | null;
  width: number;
  height: number;
}

export interface TextElementData {
  [key: string]: unknown;
  text: string;
  color: string;
  autoEdit: boolean;
  fontWeight: FontWeight;
  fontSize: number;
  width: number;
  height: number;
}

export interface ShapeElementData {
  [key: string]: unknown;
  shapeKind: ShapeKind;
  color: string;
  width: number;
  height: number;
  strokeStyle: StrokeStyle;
}

// A straight line or arrow between two points, stored relative to the
// node's own bounding box (top-left = position) so dragging the whole
// node moves both endpoints together, same as any other xyflow node.
export interface LineElementData {
  [key: string]: unknown;
  kind: 'line' | 'arrow';
  points: [Point, Point];
  color: string;
  strokeStyle: StrokeStyle;
}

export type ConversationNode = Node<ConversationNodeData, 'conversation'>;
export type TextElementNode = Node<TextElementData, 'textElement'>;
export type ShapeElementNode = Node<ShapeElementData, 'shapeElement'>;
export type LineElementNode = Node<LineElementData, 'lineElement'>;

export type CanvasNode =
  | ConversationNode
  | TextElementNode
  | ShapeElementNode
  | LineElementNode;

// ── Hydrated shape — the persisted data plus per-render derived values and
// interaction callbacks, assembled fresh every render in CanvasChat and
// handed to <ReactFlow>. Keeping callbacks out of the persisted state means
// they can never go stale, since they're rebuilt from current component
// state (activeNodeId, etc.) on every pass instead of being captured once
// at node-creation time. ──
export interface HydratedConversationNodeData extends ConversationNodeData {
  branchParentPromptPreview: string | undefined;
  isBranchActive: boolean;
  onToggleBranch: () => void;
  onFocusNode: () => void;
  onExpandNode: () => void;
  onColorChange: (color: string) => void;
  onToggleMinimize: () => void;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export interface HydratedTextElementData extends TextElementData {
  onTextChange: (text: string) => void;
  onColorChange: (color: string) => void;
  onDeleteElement: () => void;
  // The corner handles scale fontSize proportionally along with the box
  // (dragging a corner is "make the text bigger/smaller"); the edge
  // handles only change width/height, rewrapping at the same font size —
  // hence needing to know which kind of handle triggered the resize.
  onResizeElement: (width: number, height: number, x: number, y: number, handleKind: "corner" | "edge") => void;
}

export interface HydratedShapeElementData extends ShapeElementData {
  onColorChange: (color: string) => void;
  onDeleteElement: () => void;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export interface HydratedLineElementData extends LineElementData {
  onColorChange: (color: string) => void;
  onDeleteElement: () => void;
  onPointsChange: (points: [Point, Point], position: Point) => void;
  // Given a flow-space point, returns it snapped to the nearest chat-node/
  // shape/text anchor within range, or the point unchanged if none is close.
  onSnapPoint: (point: Point) => Point;
}

export type HydratedConversationNode = Node<HydratedConversationNodeData, 'conversation'>;
export type HydratedTextElementNode = Node<HydratedTextElementData, 'textElement'>;
export type HydratedShapeElementNode = Node<HydratedShapeElementData, 'shapeElement'>;
export type HydratedLineElementNode = Node<HydratedLineElementData, 'lineElement'>;

export type HydratedCanvasNode =
  | HydratedConversationNode
  | HydratedTextElementNode
  | HydratedShapeElementNode
  | HydratedLineElementNode;

export interface CanvasEdgeData {
  [key: string]: unknown;
}

export type BranchEdge = Edge<CanvasEdgeData, 'branch'>;

// A user-drawn connector from a chat node's anchor handle to a shape or
// text element — entirely separate from BranchEdge: it's real, persisted
// edge state (not derived from branchParentId), and unlike branch edges it
// can be created, reconnected, and deleted by the user.
export type AnchorEdge = Edge<CanvasEdgeData, 'anchor'>;

export type CanvasEdge = BranchEdge | AnchorEdge;
