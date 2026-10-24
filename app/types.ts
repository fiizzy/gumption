import type { Node } from '@xyflow/react';

export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond';

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
export type PictogramStyle = Pick<
  ElementStyle,
  'strokeColor' | 'strokeWidth' | 'sloppiness' | 'opacity' | 'fontSize' | 'fontFamily'
>;

// ── Persisted shape — what actually lives in the Whiteboard's `nodes` state ──

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
  // A quieter second line under the label. Older agent drawings put the
  // defining file here; new ones write it as a side-note beside the shape.
  // Kept as-is when the label is edited.
  note: string;
}

// A line or arrow through two or more points (hand-drawn lines have two;
// the agent routes its connectors through bends), stored relative to the
// node's own bounding box (top-left = position) so dragging the whole
// node moves every point together, same as any other xyflow node.
export interface LineElementData extends LineStyle {
  [key: string]: unknown;
  kind: LineKind;
  points: Point[];
  seed: number;
  startBinding: Binding | null;
  endBinding: Binding | null;
}

// A small hand-drawn picture from the pictogram library (see
// lib/pictograms.ts) with its label underneath; the whiteboard agent uses
// these for people, devices and physical things.
export interface PictogramElementData extends PictogramStyle {
  [key: string]: unknown;
  icon: string;
  width: number;
  height: number;
  seed: number;
  label: string;
}

export interface ImageElementData {
  [key: string]: unknown;
  src: string;
  width: number;
  height: number;
  opacity: number;
}

export type TextElementNode = Node<TextElementData, 'textElement'>;
export type ShapeElementNode = Node<ShapeElementData, 'shapeElement'>;
export type LineElementNode = Node<LineElementData, 'lineElement'>;
export type ImageElementNode = Node<ImageElementData, 'imageElement'>;
export type PictogramElementNode = Node<PictogramElementData, 'pictogramElement'>;

export type CanvasNode = TextElementNode | ShapeElementNode | LineElementNode | ImageElementNode | PictogramElementNode;

export type CanvasNodeType = CanvasNode['type'];

export type ResizeHandleKind = 'corner' | 'edge';

// ── Hydrated shape — the persisted data plus per-render derived values and
// interaction callbacks, assembled fresh every render in the Whiteboard and
// handed to <ReactFlow>. Keeping callbacks out of the persisted state means
// they can never go stale, since they're rebuilt from current component
// state on every pass instead of being captured once at node-creation time. ──

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
  // dragged; the Whiteboard owns snapping/binding and the resulting geometry.
  onEndpointDrag: (endpointIndex: 0 | 1, flowPoint: Point) => void;
  onEndpointDragEnd: () => void;
}

export interface HydratedImageElementData extends ImageElementData {
  isBindingTarget: boolean;
  onResizeElement: (width: number, height: number, x: number, y: number) => void;
}

export interface HydratedPictogramElementData extends PictogramElementData {
  isBindingTarget: boolean;
}

export type HydratedTextElementNode = Node<HydratedTextElementData, 'textElement'>;
export type HydratedShapeElementNode = Node<HydratedShapeElementData, 'shapeElement'>;
export type HydratedLineElementNode = Node<HydratedLineElementData, 'lineElement'>;
export type HydratedImageElementNode = Node<HydratedImageElementData, 'imageElement'>;
export type HydratedPictogramElementNode = Node<HydratedPictogramElementData, 'pictogramElement'>;

export type HydratedCanvasNode =
  | HydratedTextElementNode
  | HydratedShapeElementNode
  | HydratedLineElementNode
  | HydratedImageElementNode
  | HydratedPictogramElementNode;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
