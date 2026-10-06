import type { Node, Edge } from '@xyflow/react';

export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond';

// App-level UI state, not per-node data — which coding harness new chat
// nodes would use. Only 'claude' is actually wired up to app/lib/ai.ts
// today; 'codex' is a non-functional placeholder for a future harness.
export type Harness = 'claude' | 'codex';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type Sloppiness = 'clean' | 'sketchy';
export type FontWeight = 'normal' | 'bold';
// 'hand' is the original sketchy handwriting; 'casual' a clearer hand-drawn face.
export type FontFamily = 'casual' | 'hand' | 'sans' | 'serif' | 'mono';
export type LineKind = 'line' | 'arrow';

export interface Point {
  x: number;
  y: number;
}

// Attaches a line/arrow endpoint to another element so it follows that
// element around. `focus` is the attachment point normalized to the
// target's bounding box (0..1 on each axis), always lying on its outline,
// so it stays put proportionally when the target is resized.
export interface Binding {
  elementId: string;
  focus: Point;
}

// The full set of Excalidraw-style properties. Each element type persists
// only the subset that applies to it (see the *Style picks below), and the
// style panel shows a control whenever any selected element has that key.
export interface ElementStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  sloppiness: Sloppiness;
  opacity: number;
  fontSize: number;
  fontFamily: FontFamily;
  fontWeight: FontWeight;
}

export type ShapeStyle = Pick<
  ElementStyle,
  | 'strokeColor'
  | 'backgroundColor'
  | 'fillStyle'
  | 'strokeWidth'
  | 'strokeStyle'
  | 'sloppiness'
  | 'opacity'
  | 'fontSize'
  | 'fontFamily'
>;
export type LineStyle = Pick<
  ElementStyle,
  'strokeColor' | 'strokeWidth' | 'strokeStyle' | 'sloppiness' | 'opacity'
>;
export type TextStyle = Pick<
  ElementStyle,
  'strokeColor' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'opacity'
>;

// ── Persisted shape — what actually lives in CanvasChat's `nodes` state ──
//
// `branchParentId` is deliberately NOT named `parentId` — xyflow reserves
// `Node.parentId` for its own sub-flow/grouping nesting feature, and
// reusing that name would silently collide with it.
export type ResponseStyle = 'concise' | 'detailed';

// The terminal chat style's color scheme, chosen per thread.
export type TerminalTheme = 'green' | 'red' | 'blue' | 'mono';

// What Claude may do in a project's working folder. 'ask' = the user hasn't
// been asked yet; the first chat in the project prompts for it.
export type FileAccess = 'ask' | 'readWrite' | 'readOnly' | 'none';

export interface ConversationNodeData {
  [key: string]: unknown;
  prompt: string;
  response: string;
  // The reply length/depth the user asked for when sending this prompt.
  responseStyle: ResponseStyle;
  loading: boolean;
  minimized: boolean;
  // Card tint in the standard chat style.
  color: string;
  // Color scheme in the terminal chat style.
  terminalTheme: TerminalTheme;
  branchParentId: string | null;
  width: number;
  // Used only once the user has resized the card by hand; until then the
  // card grows with its content (up to a cap) as the reply streams in.
  height: number;
  isHeightPinned: boolean;
  // Meaningful on a thread's root card: the whole thread shows as a deck.
  isThreadStacked: boolean;
}

// Height is intrinsic (the text wraps at `width` and grows downward), so
// only the width is stored.
export interface TextElementData extends TextStyle {
  [key: string]: unknown;
  text: string;
  width: number;
}

export interface ShapeElementData extends ShapeStyle {
  [key: string]: unknown;
  shapeKind: ShapeKind;
  width: number;
  height: number;
  // Fixed per element so rough.js redraws the same wobble every render.
  seed: number;
  label: string;
}

// A straight line or arrow between two points, stored relative to the
// node's own bounding box (top-left = position) so dragging the whole
// node moves both endpoints together, same as any other xyflow node.
export interface LineElementData extends LineStyle {
  [key: string]: unknown;
  kind: LineKind;
  points: [Point, Point];
  seed: number;
  startBinding: Binding | null;
  endBinding: Binding | null;
}

export interface ImageElementData {
  [key: string]: unknown;
  src: string;
  width: number;
  height: number;
  opacity: number;
}

export type ConversationNode = Node<ConversationNodeData, 'conversation'>;
export type TextElementNode = Node<TextElementData, 'textElement'>;
export type ShapeElementNode = Node<ShapeElementData, 'shapeElement'>;
export type LineElementNode = Node<LineElementData, 'lineElement'>;
export type ImageElementNode = Node<ImageElementData, 'imageElement'>;

export type CanvasNode =
  | ConversationNode
  | TextElementNode
  | ShapeElementNode
  | LineElementNode
  | ImageElementNode;

export type CanvasNodeType = CanvasNode['type'];

export type ResizeHandleKind = 'corner' | 'edge';

// ── Hydrated shape — the persisted data plus per-render derived values and
// interaction callbacks, assembled fresh every render in CanvasChat and
// handed to <ReactFlow>. Keeping callbacks out of the persisted state means
// they can never go stale, since they're rebuilt from current component
// state (activeNodeId, etc.) on every pass instead of being captured once
// at node-creation time. ──
// Present when the card belongs to a thread of 2+ cards.
export interface ThreadSummary {
  cardCount: number;
  isStacked: boolean;
  // When stacked and this card is on top: its 0-based place in the thread.
  deckIndex: number | null;
  // When on top of a deck: the tallest card in the thread, so flipping
  // through the deck never changes its height.
  deckHeight: number | null;
}

export interface HydratedConversationNodeData extends ConversationNodeData {
  branchParentPromptPreview: string | undefined;
  isBranchActive: boolean;
  isBindingTarget: boolean;
  thread: ThreadSummary | null;
  // Live tool activity while the reply streams (e.g. "Read"), else null.
  activity: string | null;
  onToggleThreadStack: () => void;
  onThreadColorChange: (color: string) => void;
  onTerminalThemeChange: (theme: TerminalTheme) => void;
  onThreadTerminalThemeChange: (theme: TerminalTheme) => void;
  onShowAdjacentInDeck: (direction: -1 | 1) => void;
  onToggleBranch: () => void;
  onFocusNode: () => void;
  onExpandNode: () => void;
  onColorChange: (color: string) => void;
  onToggleMinimize: () => void;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export interface HydratedTextElementData extends TextElementData {
  isEditing: boolean;
  isBindingTarget: boolean;
  onTextChange: (text: string) => void;
  onStopEditing: () => void;
  // The corner handles scale fontSize proportionally along with the box
  // (dragging a corner is "make the text bigger/smaller"); the edge
  // handles only change the width, rewrapping at the same font size.
  onResizeElement: (width: number, x: number, y: number, handleKind: ResizeHandleKind) => void;
}

export interface HydratedShapeElementData extends ShapeElementData {
  isEditing: boolean;
  isBindingTarget: boolean;
  onLabelChange: (label: string) => void;
  onStopEditing: () => void;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export interface HydratedLineElementData extends LineElementData {
  // Reports a flow-space pointer position while an endpoint handle is
  // dragged; CanvasChat owns snapping/binding and the resulting geometry.
  onEndpointDrag: (endpointIndex: 0 | 1, flowPoint: Point) => void;
  onEndpointDragEnd: () => void;
}

export interface HydratedImageElementData extends ImageElementData {
  isBindingTarget: boolean;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export type HydratedConversationNode = Node<HydratedConversationNodeData, 'conversation'>;
export type HydratedTextElementNode = Node<HydratedTextElementData, 'textElement'>;
export type HydratedShapeElementNode = Node<HydratedShapeElementData, 'shapeElement'>;
export type HydratedLineElementNode = Node<HydratedLineElementData, 'lineElement'>;
export type HydratedImageElementNode = Node<HydratedImageElementData, 'imageElement'>;

export type HydratedCanvasNode =
  | HydratedConversationNode
  | HydratedTextElementNode
  | HydratedShapeElementNode
  | HydratedLineElementNode
  | HydratedImageElementNode;

export interface CanvasEdgeData {
  [key: string]: unknown;
}

// Derived purely from each conversation node's branchParentId — never
// user-created or persisted on its own.
export type BranchEdge = Edge<CanvasEdgeData, 'branch'>;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
