import type { Node, Edge } from '@xyflow/react';

export type ShapeKind = 'square' | 'circle';

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
}

export interface TextElementData {
  [key: string]: unknown;
  text: string;
  color: string;
  autoEdit: boolean;
}

export interface ShapeElementData {
  [key: string]: unknown;
  shapeKind: ShapeKind;
  color: string;
}

export type ConversationNode = Node<ConversationNodeData, 'conversation'>;
export type TextElementNode = Node<TextElementData, 'textElement'>;
export type ShapeElementNode = Node<ShapeElementData, 'shapeElement'>;

export type CanvasNode = ConversationNode | TextElementNode | ShapeElementNode;

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
}

export interface HydratedTextElementData extends TextElementData {
  onTextChange: (text: string) => void;
  onColorChange: (color: string) => void;
  onDeleteElement: () => void;
}

export interface HydratedShapeElementData extends ShapeElementData {
  onColorChange: (color: string) => void;
  onDeleteElement: () => void;
}

export type HydratedConversationNode = Node<HydratedConversationNodeData, 'conversation'>;
export type HydratedTextElementNode = Node<HydratedTextElementData, 'textElement'>;
export type HydratedShapeElementNode = Node<HydratedShapeElementData, 'shapeElement'>;

export type HydratedCanvasNode =
  | HydratedConversationNode
  | HydratedTextElementNode
  | HydratedShapeElementNode;

export interface CanvasEdgeData {
  [key: string]: unknown;
}

export type BranchEdge = Edge<CanvasEdgeData, 'branch'>;
export type CanvasEdge = BranchEdge;
