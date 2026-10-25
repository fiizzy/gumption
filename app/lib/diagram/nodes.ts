import type { ArtboardData, Binding, CanvasNode, ElementStyle, FillStyle, LineElementNode, LineKind, PictogramElementNode, Point, ShapeElementNode, ShapeKind, StrokeStyle, TextElementNode } from "../../types";
import { TRANSPARENT_COLOR } from "../color";
import { LINE_HEIGHT, LINE_STYLE_KEYS, PICTOGRAM_STYLE_KEYS, SHAPE_STYLE_KEYS, TEXT_STYLE_KEYS, pickStyle } from "../elementStyle";
import { getLineGeometry, type Box } from "../geometry";
import type { PictogramName } from "../pictograms";

// Canvas nodes the diagram engines emit, described before they are built:
// a stable id, a signature of everything that affects the node, its box,
// and a builder. The diagram is re-planned after every operation, and only
// nodes whose signature changed are rebuilt and handed to the canvas.

export interface PlannedNode {
  nodeId: string;
  signature: string;
  box: Box;
  // What the node is, so later passes can tell text and shapes (things a
  // label must not cover) from lines (things it should not sit on).
  role: "text" | "shape" | "line";
  build: () => CanvasNode;
}

export interface TextOptions {
  fontSize: number;
  fontWeight: "normal" | "bold";
  opacity: number;
  // Painted over the canvas colour so a line passing under it is hidden.
  knockout?: boolean;
}

export interface ShapeOptions {
  label: string;
  // A quieter second line under the label.
  note?: string;
  backgroundColor: string;
  strokeWidth: number;
  fontSize: number;
  opacity?: number;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  artboard?: ArtboardData;
}

export interface PolylineOptions {
  kind: LineKind;
  strokeStyle: StrokeStyle;
  strokeWidth: number;
  curved?: boolean;
  opacity?: number;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
}

// Average glyph advance relative to font size for the handwriting face;
// only used to size text boxes and estimate heights for bounds.
export const AVERAGE_GLYPH_WIDTH_RATIO = 0.55;

export function estimateTextHeight(text: string, width: number, fontSize: number): number {
  const charactersPerLine = Math.max(1, Math.floor(width / (fontSize * AVERAGE_GLYPH_WIDTH_RATIO)));
  const lineCount = text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return lineCount * fontSize * LINE_HEIGHT;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  const longestLine = Math.max(...text.split("\n").map((line) => line.length));
  return Math.ceil(longestLine * fontSize * AVERAGE_GLYPH_WIDTH_RATIO);
}

export function boxOfPoints(points: Point[]): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function uniteBoxes(boxes: Box[]): Box | null {
  return boxes.reduce<Box | null>((bounds, box) => {
    if (!bounds) return { ...box };
    const right = Math.max(bounds.x + bounds.width, box.x + box.width);
    const bottom = Math.max(bounds.y + bounds.height, box.y + box.height);
    const x = Math.min(bounds.x, box.x);
    const y = Math.min(bounds.y, box.y);
    return { x, y, width: right - x, height: bottom - y };
  }, null);
}

function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export class NodeFactory {
  constructor(private readonly style: ElementStyle) {}

  text(nodeId: string, text: string, position: Point, width: number, options: TextOptions): PlannedNode {
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const roundedWidth = Math.round(width);
    const { fontSize, fontWeight, opacity, knockout = false } = options;
    return {
      nodeId,
      role: "text",
      signature: JSON.stringify(["text", text, x, y, roundedWidth, fontSize, fontWeight, opacity, knockout]),
      box: { x, y, width: roundedWidth, height: estimateTextHeight(text, roundedWidth, fontSize) },
      build: (): TextElementNode => ({
        id: nodeId,
        type: "textElement",
        position: { x, y },
        data: { ...pickStyle(this.style, TEXT_STYLE_KEYS), text, width: roundedWidth, fontSize, fontWeight, opacity, ...(knockout ? { knockout } : {}) },
      }),
    };
  }

  shape(nodeId: string, seed: number, shapeKind: ShapeKind, box: Box, options: ShapeOptions): PlannedNode {
    const x = Math.round(box.x);
    const y = Math.round(box.y);
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    const { label, note = "", backgroundColor, strokeWidth, fontSize, opacity, strokeStyle, fillStyle, artboard } = options;
    return {
      nodeId,
      role: "shape",
      signature: JSON.stringify(["shape", shapeKind, label, note, x, y, width, height, backgroundColor, strokeWidth, fontSize, opacity, strokeStyle, fillStyle, artboard]),
      box: { x, y, width, height },
      build: (): ShapeElementNode => ({
        id: nodeId,
        type: "shapeElement",
        position: { x, y },
        data: {
          ...pickStyle(this.style, SHAPE_STYLE_KEYS),
          shapeKind,
          width,
          height,
          seed,
          label,
          note,
          backgroundColor,
          strokeWidth,
          fontSize,
          ...(opacity === undefined ? {} : { opacity }),
          ...(strokeStyle === undefined ? {} : { strokeStyle }),
          ...(fillStyle === undefined ? {} : { fillStyle }),
          ...(artboard === undefined ? {} : { artboard }),
        },
      }),
    };
  }

  pictogram(nodeId: string, seed: number, icon: PictogramName, label: string, box: Box, strokeWidth: number, fontSize: number): PlannedNode {
    const x = Math.round(box.x);
    const y = Math.round(box.y);
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    return {
      nodeId,
      role: "shape",
      signature: JSON.stringify(["pictogram", icon, label, x, y, width, height, strokeWidth, fontSize]),
      box: { x, y, width, height },
      build: (): PictogramElementNode => ({
        id: nodeId,
        type: "pictogramElement",
        position: { x, y },
        data: { ...pickStyle(this.style, PICTOGRAM_STYLE_KEYS), icon, width, height, seed, label, strokeWidth, fontSize },
      }),
    };
  }

  polyline(nodeId: string, seed: number, path: Point[], options: PolylineOptions): PlannedNode {
    const rounded = path.map(roundPoint);
    const { position, points } = getLineGeometry(rounded);
    const { kind, strokeStyle, strokeWidth, curved = false, opacity, startBinding = null, endBinding = null } = options;
    // A binding's focus is relative to its target's box, so a target that
    // moved under a line that did not must still rebuild the line.
    const bindingSignature = (binding: Binding | null) => binding && [binding.elementId, Math.round(binding.focus.x * 1000), Math.round(binding.focus.y * 1000)];
    return {
      nodeId,
      role: "line",
      signature: JSON.stringify(["line", kind, strokeStyle, strokeWidth, curved, opacity, rounded, bindingSignature(startBinding), bindingSignature(endBinding)]),
      box: boxOfPoints(rounded),
      build: (): LineElementNode => ({
        id: nodeId,
        type: "lineElement",
        position,
        data: {
          ...pickStyle(this.style, LINE_STYLE_KEYS),
          kind,
          points,
          ...(curved ? { curved } : {}),
          seed,
          startBinding,
          endBinding,
          strokeStyle,
          strokeWidth,
          ...(opacity === undefined ? {} : { opacity }),
        },
      }),
    };
  }
}

export const TRANSPARENT_FILL = TRANSPARENT_COLOR;
