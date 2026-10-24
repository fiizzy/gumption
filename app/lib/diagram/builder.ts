import type {
  Binding,
  CanvasNode,
  ElementStyle,
  LineElementNode,
  LineKind,
  PictogramElementNode,
  Point,
  ShapeElementNode,
  ShapeKind,
  StrokeStyle,
  TextElementNode,
} from "../../types";
import { DIAGRAM_FILL_SWATCHES, TRANSPARENT_COLOR } from "../color";
import { LINE_HEIGHT, LINE_STYLE_KEYS, PICTOGRAM_STYLE_KEYS, SHAPE_STYLE_KEYS, TEXT_STYLE_KEYS, createSeed, pickStyle } from "../elementStyle";
import { ANCHOR_FOCUS, focusFromPoint, getLineGeometry, getOutlinePointToward, type Box } from "../geometry";
import type { PictogramName } from "../pictograms";
import type { DiagramColor, DiagramDirection, DiagramOperation, DiagramShapeKind } from "./operations";
import { layoutDiagram } from "./placement";

// The agent names a lane for each shape and says what connects to what;
// the builder owns every coordinate. Placement and routing live in
// placement.ts; this file turns the result into canvas nodes. The whole
// model is re-laid out after every operation (it is small) and only nodes
// whose geometry or data actually changed are handed back.

export interface DiagramChange {
  upserted: CanvasNode[];
  removedIds: string[];
}

export interface DiagramCounts {
  shapes: number;
  connectors: number;
}

export type ApplyResult = { ok: true; description: string } | { ok: false; reason: string };

const CELL_WIDTH = 180;
const CELL_HEIGHT = 90;
const DIAMOND_WIDTH = 190;
const DIAMOND_HEIGHT = 110;
// A pictogram is a picture with its label underneath, so it stands taller
// than a box; rows holding one grow to fit.
const PICTOGRAM_HEIGHT = 116;
const TITLE_FONT_SIZE = 28;
const TITLE_WIDTH = 640;
const TITLE_GAP = 36;
const TITLE_CHANNEL_CLEARANCE = 10;
const LANE_LABEL_FONT_SIZE = 14;
const LANE_LABEL_COLUMN_WIDTH = 156;
const LANE_LABEL_COLUMN_TEXT_WIDTH = 128;
const LANE_LABEL_ROW_HEIGHT = 40;
const SHAPE_FONT_SIZE = 16;
// Agent drawings use a lighter line than the style panel's default so a
// dozen shapes and their arrows read as one calm sketch.
const AGENT_STROKE_WIDTH = 1.5;
// The frame around a whole diagram: quiet, so the drawing stays the subject.
const FRAME_PADDING = 32;
const FRAME_STROKE_WIDTH = 1;
const FRAME_OPACITY = 55;
const CONNECTOR_LABEL_FONT_SIZE = 13;
const CONNECTOR_LABEL_LIFT = 14;
const CONNECTOR_LABEL_SIDE_GAP = 8;
const CONNECTOR_LABEL_MIN_WIDTH = 40;
const CONNECTOR_LABEL_MAX_WIDTH = 220;
const CONNECTOR_LABEL_PADDING = 10;
// Labels beside a vertical run sit a little above its middle, clear of the
// channel the run leads into.
const CONNECTOR_LABEL_ALONG_RATIO = 0.35;
const CONNECTOR_LABEL_MIN_SEGMENT = 32;
// Side-notes: a handwritten remark just below a shape with a short leader
// back to its outline. They sit to the right of centre when lanes are
// columns (clear of lines leaving the bottom) and near the left edge when
// lanes are rows (clear of the routing channel between columns).
const ANNOTATION_FONT_SIZE = 14;
const ANNOTATION_MAX_WIDTH = 150;
// Under a row of lanes the note has to stay inside its own column, left of
// the lines leaving the bottom, so it wraps sooner.
const ANNOTATION_MAX_WIDTH_DOWN = 120;
const ANNOTATION_MIN_WIDTH = 60;
const ANNOTATION_PADDING = 12;
const ANNOTATION_OPACITY = 75;
const ANNOTATION_GAP = 14;
const ANNOTATION_INDENT_FROM_CENTER = 16;
const ANNOTATION_INDENT_FROM_EDGE = 12;
const ANNOTATION_STACK_GAP = 6;
const LEADER_GAP = 6;
const LEADER_STROKE_WIDTH = 1;
const FREE_NOTE_WIDTH = 360;
const FREE_NOTE_GAP = 12;
const FREE_NOTE_TOP_GAP = 60;
// Average glyph advance relative to font size for the handwriting face;
// only used to size text boxes and estimate heights for bounds.
const AVERAGE_GLYPH_WIDTH_RATIO = 0.55;

const SHAPE_SIZES: Record<DiagramShapeKind, { width: number; height: number }> = {
  rectangle: { width: CELL_WIDTH, height: CELL_HEIGHT },
  ellipse: { width: CELL_WIDTH, height: CELL_HEIGHT },
  diamond: { width: DIAMOND_WIDTH, height: DIAMOND_HEIGHT },
  pictogram: { width: CELL_WIDTH, height: PICTOGRAM_HEIGHT },
};

// Arrows and leaders meet a pictogram at the edge of its box.
function outlineKindOf(kind: DiagramShapeKind): ShapeKind {
  return kind === "pictogram" ? "rectangle" : kind;
}

interface LaneModel {
  name: string;
  shapeIds: string[];
}

interface ShapeModel {
  id: string;
  kind: DiagramShapeKind;
  icon: PictogramName | null;
  label: string;
  laneIndex: number;
  color: DiagramColor | null;
  note: string | null;
  nodeId: string;
  noteNodeId: string;
  noteLeaderNodeId: string;
  noteLeaderSeed: number;
  seed: number;
}

interface ConnectorModel {
  id: string;
  from: string;
  to: string;
  label: string | null;
  kind: LineKind;
  strokeStyle: StrokeStyle;
  nodeId: string;
  labelNodeId: string;
  seed: number;
}

interface NoteModel {
  id: string;
  text: string;
  near: string | null;
  nodeId: string;
  leaderNodeId: string;
  leaderSeed: number;
}

interface Annotation {
  text: string;
  nodeId: string;
  leaderNodeId: string;
  leaderSeed: number;
}

interface PlannedNode {
  nodeId: string;
  signature: string;
  box: Box;
  build: () => CanvasNode;
}

interface TextOptions {
  fontSize: number;
  fontWeight: "normal" | "bold";
  opacity: number;
}

interface Segment {
  start: Point;
  end: Point;
  isHorizontal: boolean;
  length: number;
}

function estimateTextHeight(text: string, width: number, fontSize: number): number {
  const charactersPerLine = Math.max(1, Math.floor(width / (fontSize * AVERAGE_GLYPH_WIDTH_RATIO)));
  const lineCount = text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return lineCount * fontSize * LINE_HEIGHT;
}

function backgroundColorFor(color: DiagramColor | null): string {
  if (!color) return TRANSPARENT_COLOR;
  return DIAGRAM_FILL_SWATCHES.find((swatch) => swatch.label.toLowerCase() === color)?.value ?? TRANSPARENT_COLOR;
}

const NOTE_BREAK_PATTERN = /[/ ]/g;

// Wraps a note so each line fits the width, breaking after a slash or a
// space where it can: a file path reads as its segments, not cut mid-word.
function wrapAnnotation(text: string, direction: DiagramDirection): string {
  const maxWidth = direction === "right" ? ANNOTATION_MAX_WIDTH : ANNOTATION_MAX_WIDTH_DOWN;
  const maxCharacters = Math.max(1, Math.floor((maxWidth - ANNOTATION_PADDING) / (ANNOTATION_FONT_SIZE * AVERAGE_GLYPH_WIDTH_RATIO)));
  return text
    .split("\n")
    .flatMap((line) => {
      const lines: string[] = [];
      let rest = line;
      while (rest.length > maxCharacters) {
        let breakAt = -1;
        for (const match of rest.slice(0, maxCharacters + 1).matchAll(NOTE_BREAK_PATTERN)) breakAt = match.index;
        const cut = breakAt > 0 ? breakAt + 1 : maxCharacters;
        lines.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      lines.push(rest);
      return lines;
    })
    .join("\n");
}

function annotationWidth(text: string, direction: DiagramDirection): number {
  const maxWidth = direction === "right" ? ANNOTATION_MAX_WIDTH : ANNOTATION_MAX_WIDTH_DOWN;
  const longestLine = Math.max(...text.split("\n").map((line) => line.length));
  return Math.min(maxWidth, Math.max(ANNOTATION_MIN_WIDTH, Math.ceil(longestLine * ANNOTATION_FONT_SIZE * AVERAGE_GLYPH_WIDTH_RATIO) + ANNOTATION_PADDING));
}

function annotationHeight(text: string, direction: DiagramDirection): number {
  return estimateTextHeight(text, annotationWidth(text, direction), ANNOTATION_FONT_SIZE);
}

function annotationBandHeight(annotations: Annotation[], direction: DiagramDirection): number {
  if (annotations.length === 0) return 0;
  const textHeight = annotations.reduce((total, annotation) => total + annotationHeight(annotation.text, direction), 0);
  return textHeight + ANNOTATION_STACK_GAP * (annotations.length - 1);
}

function uniteBoxes(boxes: Box[]): Box | null {
  return boxes.reduce<Box | null>((bounds, box) => {
    if (!bounds) return { ...box };
    const right = Math.max(bounds.x + bounds.width, box.x + box.width);
    const bottom = Math.max(bounds.y + bounds.height, box.y + box.height);
    const x = Math.min(bounds.x, box.x);
    const y = Math.min(bounds.y, box.y);
    return { x, y, width: right - x, height: bottom - y };
  }, null);
}

function boxOfPoints(points: Point[]): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function segmentsOf(path: Point[]): Segment[] {
  return path.slice(1).map((end, index) => {
    const start = path[index];
    return { start, end, isHorizontal: Math.abs(end.y - start.y) <= Math.abs(end.x - start.x), length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
}

function longest(segments: Segment[]): Segment | undefined {
  return segments.reduce<Segment | undefined>((best, segment) => (!best || segment.length > best.length ? segment : best), undefined);
}

export class DiagramBuilder {
  private title: string | null = null;
  private direction: DiagramDirection = "right";
  private readonly lanes: LaneModel[] = [];
  private readonly shapes = new Map<string, ShapeModel>();
  private readonly connectors = new Map<string, ConnectorModel>();
  private readonly notes = new Map<string, NoteModel>();
  private readonly titleNodeId = crypto.randomUUID();
  private readonly frameNodeId = crypto.randomUUID();
  private readonly frameSeed = createSeed();
  private readonly laneNodeIds = new Map<number, string>();
  private materialized = new Map<string, { signature: string; node: CanvasNode }>();
  private lastBounds: Box | null = null;

  constructor(
    private readonly origin: Point,
    private readonly style: ElementStyle,
  ) {}

  apply(operation: DiagramOperation): ApplyResult {
    switch (operation.op) {
      case "plan":
        if (operation.title) this.title = operation.title;
        this.direction = operation.direction;
        operation.lanes.forEach((name) => this.findOrCreateLane(name));
        return { ok: true, description: operation.title ? `Planning “${operation.title}”` : "Planning the layout" };
      case "shape": {
        const existing = this.shapes.get(operation.id);
        if (existing) {
          this.updateShape(existing, operation);
          return { ok: true, description: `Updating ${existing.label}` };
        }
        const laneIndex = this.findOrCreateLane(operation.lane ?? "");
        this.lanes[laneIndex].shapeIds.push(operation.id);
        this.shapes.set(operation.id, {
          id: operation.id,
          kind: operation.kind,
          icon: operation.icon,
          label: operation.label,
          laneIndex,
          color: operation.color,
          note: operation.note,
          nodeId: crypto.randomUUID(),
          noteNodeId: crypto.randomUUID(),
          noteLeaderNodeId: crypto.randomUUID(),
          noteLeaderSeed: createSeed(),
          seed: createSeed(),
        });
        return { ok: true, description: `Sketching ${operation.label}` };
      }
      case "connect": {
        const from = this.shapes.get(operation.from);
        const to = this.shapes.get(operation.to);
        if (!from || !to) return { ok: false, reason: `connect refers to an unknown shape (${!from ? operation.from : operation.to})` };
        if (from === to) return { ok: false, reason: `connect from “${from.label}” to itself` };
        const existing = this.connectors.get(operation.id);
        this.connectors.set(operation.id, {
          id: operation.id,
          from: operation.from,
          to: operation.to,
          label: operation.label,
          kind: operation.kind,
          strokeStyle: operation.strokeStyle,
          nodeId: existing?.nodeId ?? crypto.randomUUID(),
          labelNodeId: existing?.labelNodeId ?? crypto.randomUUID(),
          seed: existing?.seed ?? createSeed(),
        });
        return { ok: true, description: `Connecting ${from.label} to ${to.label}` };
      }
      case "update": {
        const shape = this.shapes.get(operation.id);
        if (!shape) return { ok: false, reason: `update refers to an unknown shape (${operation.id})` };
        this.updateShape(shape, operation);
        return { ok: true, description: `Updating ${shape.label}` };
      }
      case "remove": {
        const shape = this.shapes.get(operation.id);
        if (shape) {
          this.removeShape(shape);
          return { ok: true, description: `Removing ${shape.label}` };
        }
        if (this.connectors.delete(operation.id)) return { ok: true, description: "Removing a connection" };
        if (this.notes.delete(operation.id)) return { ok: true, description: "Removing a note" };
        return { ok: false, reason: `remove refers to nothing on the canvas (${operation.id})` };
      }
      case "note": {
        if (operation.near && !this.shapes.has(operation.near)) {
          return { ok: false, reason: `note refers to an unknown shape (${operation.near})` };
        }
        const existing = this.notes.get(operation.id);
        this.notes.set(operation.id, {
          id: operation.id,
          text: operation.text,
          near: operation.near,
          nodeId: existing?.nodeId ?? crypto.randomUUID(),
          leaderNodeId: existing?.leaderNodeId ?? crypto.randomUUID(),
          leaderSeed: existing?.leaderSeed ?? createSeed(),
        });
        return { ok: true, description: "Adding a note" };
      }
      case "done":
        return { ok: true, description: "Finishing" };
    }
  }

  getCounts(): DiagramCounts {
    return { shapes: this.shapes.size, connectors: this.connectors.size };
  }

  getNodeIds(): string[] {
    return [...this.materialized.keys()];
  }

  getBounds(): Box | null {
    return this.lastBounds;
  }

  // A plain-text outline of the drawing, handed back to the agent on the
  // next turn so it can change what it drew rather than start over.
  describe(): string {
    const lines: string[] = [];
    if (this.title) lines.push(`Title: ${this.title}`);
    const laneNames = this.lanes.filter((lane) => lane.name).map((lane) => lane.name);
    if (laneNames.length > 0) lines.push(`Lanes: ${laneNames.join(", ")}`);
    const shapes = [...this.shapes.values()].map((shape) => {
      const lane = this.lanes[shape.laneIndex]?.name;
      const kind = shape.kind === "pictogram" ? `pictogram ${shape.icon}` : shape.kind;
      return `${shape.id} "${shape.label}" (${kind}${lane ? `, ${lane}` : ""}${shape.note ? `, note: ${shape.note}` : ""})`;
    });
    if (shapes.length > 0) lines.push(`Shapes: ${shapes.join("; ")}`);
    const connectors = [...this.connectors.values()].map((connector) => `${connector.from} -> ${connector.to}${connector.label ? ` "${connector.label}"` : ""}`);
    if (connectors.length > 0) lines.push(`Connections: ${connectors.join("; ")}`);
    return lines.join("\n");
  }

  // Re-lays out everything and returns the difference from the last call.
  materialize(): DiagramChange {
    const planned = this.plan();
    const next = new Map<string, { signature: string; node: CanvasNode }>();
    const upserted: CanvasNode[] = [];
    for (const item of planned) {
      const previous = this.materialized.get(item.nodeId);
      if (previous && previous.signature === item.signature) {
        next.set(item.nodeId, previous);
        continue;
      }
      const node = item.build();
      next.set(item.nodeId, { signature: item.signature, node });
      upserted.push(node);
    }
    const removedIds = [...this.materialized.keys()].filter((nodeId) => !next.has(nodeId));
    this.materialized = next;
    this.lastBounds = uniteBoxes(planned.map((item) => item.box));
    return { upserted, removedIds };
  }

  private findOrCreateLane(name: string): number {
    const normalized = name.trim().toLowerCase();
    const existingIndex = this.lanes.findIndex((lane) => lane.name.toLowerCase() === normalized);
    if (existingIndex !== -1) return existingIndex;
    this.lanes.push({ name: name.trim(), shapeIds: [] });
    return this.lanes.length - 1;
  }

  private updateShape(
    shape: ShapeModel,
    patch: { label?: string; lane?: string | null; color?: DiagramColor | null; kind?: DiagramShapeKind; icon?: PictogramName | null; note?: string | null },
  ) {
    if (patch.label) shape.label = patch.label;
    if (patch.kind) shape.kind = patch.kind;
    if (patch.icon) shape.icon = patch.icon;
    if (patch.color !== undefined) shape.color = patch.color;
    if (patch.note !== undefined) shape.note = patch.note;
    if (patch.lane) {
      const laneIndex = this.findOrCreateLane(patch.lane);
      if (laneIndex !== shape.laneIndex) {
        this.lanes[shape.laneIndex].shapeIds = this.lanes[shape.laneIndex].shapeIds.filter((id) => id !== shape.id);
        this.lanes[laneIndex].shapeIds.push(shape.id);
        shape.laneIndex = laneIndex;
      }
    }
  }

  private removeShape(shape: ShapeModel) {
    this.shapes.delete(shape.id);
    this.lanes[shape.laneIndex].shapeIds = this.lanes[shape.laneIndex].shapeIds.filter((id) => id !== shape.id);
    for (const [id, connector] of this.connectors) {
      if (connector.from === shape.id || connector.to === shape.id) this.connectors.delete(id);
    }
    for (const [id, note] of this.notes) {
      if (note.near === shape.id) this.notes.delete(id);
    }
  }

  // The shape's own note first, then any notes the agent attached to it.
  private annotationsByShape(): Map<string, Annotation[]> {
    const annotations = new Map<string, Annotation[]>();
    for (const shape of this.shapes.values()) {
      annotations.set(
        shape.id,
        shape.note
          ? [{ text: wrapAnnotation(shape.note, this.direction), nodeId: shape.noteNodeId, leaderNodeId: shape.noteLeaderNodeId, leaderSeed: shape.noteLeaderSeed }]
          : [],
      );
    }
    for (const note of this.notes.values()) {
      if (note.near) {
        annotations
          .get(note.near)
          ?.push({ text: wrapAnnotation(note.text, this.direction), nodeId: note.nodeId, leaderNodeId: note.leaderNodeId, leaderSeed: note.leaderSeed });
      }
    }
    return annotations;
  }

  private plan(): PlannedNode[] {
    const planned: PlannedNode[] = [];
    const isRight = this.direction === "right";
    const hasLaneLabels = this.lanes.some((lane) => lane.name !== "");
    const titleHeight = this.title ? TITLE_FONT_SIZE * LINE_HEIGHT : 0;
    const contentTop = this.origin.y + (this.title ? titleHeight + TITLE_GAP : 0);
    const annotations = this.annotationsByShape();

    if (this.title) {
      planned.push(this.planText(this.titleNodeId, this.title, { x: this.origin.x, y: this.origin.y }, TITLE_WIDTH, { fontSize: TITLE_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
    }

    const layout = layoutDiagram({
      direction: this.direction,
      contentOrigin: isRight
        ? { x: this.origin.x, y: contentTop + (hasLaneLabels ? LANE_LABEL_ROW_HEIGHT : 0) }
        : { x: this.origin.x + (hasLaneLabels ? LANE_LABEL_COLUMN_WIDTH : 0), y: contentTop },
      leadingLimit: isRight ? -Infinity : this.origin.y + titleHeight + TITLE_CHANNEL_CLEARANCE,
      laneCount: this.lanes.length,
      defaultShapeSize: { width: CELL_WIDTH, height: CELL_HEIGHT },
      shapes: [...this.shapes.values()].map((shape) => ({
        id: shape.id,
        laneIndex: shape.laneIndex,
        ...SHAPE_SIZES[shape.kind],
        annotationBand: annotationBandHeight(annotations.get(shape.id) ?? [], this.direction),
      })),
      connectors: [...this.connectors.values()].map((connector) => ({ id: connector.id, from: connector.from, to: connector.to })),
    });

    this.lanes.forEach((lane, laneIndex) => {
      if (!lane.name) return;
      const laneNodeId = this.laneNodeIds.get(laneIndex) ?? crypto.randomUUID();
      this.laneNodeIds.set(laneIndex, laneNodeId);
      const span = layout.lanes[laneIndex];
      const position = isRight
        ? { x: span.start, y: contentTop }
        : { x: this.origin.x, y: span.start + span.extent / 2 - (LANE_LABEL_FONT_SIZE * LINE_HEIGHT) / 2 };
      const width = isRight ? CELL_WIDTH : LANE_LABEL_COLUMN_TEXT_WIDTH;
      planned.push(this.planText(laneNodeId, lane.name, position, width, { fontSize: LANE_LABEL_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
    });

    for (const shape of this.shapes.values()) {
      const box = layout.shapeBoxes.get(shape.id);
      const cell = layout.cellBoxes.get(shape.id);
      if (!box || !cell) continue;
      planned.push(this.planShape(shape, box));
      planned.push(...this.planAnnotations(shape, box, cell, annotations.get(shape.id) ?? []));
    }

    for (const connector of this.connectors.values()) {
      const fromShape = this.shapes.get(connector.from);
      const toShape = this.shapes.get(connector.to);
      const fromBox = layout.shapeBoxes.get(connector.from);
      const toBox = layout.shapeBoxes.get(connector.to);
      const path = layout.connectorPaths.get(connector.id);
      if (!fromShape || !toShape || !fromBox || !toBox || !path || path.length < 2) continue;
      planned.push(this.planConnector(connector, fromShape, toShape, fromBox, toBox, path));
      if (connector.label) planned.push(this.planConnectorLabel(connector, connector.label, path));
    }

    let freeNoteTop = (layout.contentBounds ? layout.contentBounds.y + layout.contentBounds.height : contentTop) + FREE_NOTE_TOP_GAP;
    for (const note of this.notes.values()) {
      if (note.near) continue;
      planned.push(
        this.planText(note.nodeId, note.text, { x: this.origin.x, y: freeNoteTop }, FREE_NOTE_WIDTH, {
          fontSize: ANNOTATION_FONT_SIZE,
          fontWeight: "normal",
          opacity: ANNOTATION_OPACITY,
        }),
      );
      freeNoteTop += estimateTextHeight(note.text, FREE_NOTE_WIDTH, ANNOTATION_FONT_SIZE) + FREE_NOTE_GAP;
    }

    // The frame goes first so it sits beneath everything it encloses.
    const bounds = uniteBoxes(planned.map((item) => item.box));
    if (bounds) planned.unshift(this.planFrame(bounds));
    return planned;
  }

  private planAnnotations(shape: ShapeModel, box: Box, cell: Box, annotations: Annotation[]): PlannedNode[] {
    const planned: PlannedNode[] = [];
    const x = this.direction === "right" ? box.x + box.width / 2 + ANNOTATION_INDENT_FROM_CENTER : cell.x + ANNOTATION_INDENT_FROM_EDGE;
    let top = box.y + box.height + ANNOTATION_GAP;
    for (const annotation of annotations) {
      const position = { x, y: top };
      const textHeight = annotationHeight(annotation.text, this.direction);
      planned.push(
        this.planText(annotation.nodeId, annotation.text, position, annotationWidth(annotation.text, this.direction), {
          fontSize: ANNOTATION_FONT_SIZE,
          fontWeight: "normal",
          opacity: ANNOTATION_OPACITY,
        }),
      );
      const start = { x: position.x - LEADER_GAP, y: position.y + textHeight / 2 };
      const end = getOutlinePointToward(box, outlineKindOf(shape.kind), start);
      planned.push(
        this.planLeader(
          annotation.leaderNodeId,
          annotation.leaderSeed,
          start,
          end,
          { elementId: annotation.nodeId, focus: { ...ANCHOR_FOCUS.left } },
          { elementId: shape.nodeId, focus: focusFromPoint(box, end) },
        ),
      );
      top += textHeight + ANNOTATION_STACK_GAP;
    }
    return planned;
  }

  // The label goes beside the run that leaves or enters a shape, where
  // nothing else is drawn: above a horizontal run when lanes are columns,
  // beside the vertical run into the target when lanes are rows.
  private planConnectorLabel(connector: ConnectorModel, label: string, path: Point[]): PlannedNode {
    const isRight = this.direction === "right";
    const width = Math.min(
      CONNECTOR_LABEL_MAX_WIDTH,
      Math.max(CONNECTOR_LABEL_MIN_WIDTH, label.length * CONNECTOR_LABEL_FONT_SIZE * AVERAGE_GLYPH_WIDTH_RATIO + CONNECTOR_LABEL_PADDING),
    );
    const segments = segmentsOf(path);
    const first = segments[0];
    const last = segments[segments.length - 1];
    const wantsHorizontal = isRight;
    const ends = (isRight ? [first, last] : [last, first])
      .filter((segment) => segment.isHorizontal === wantsHorizontal && segment.length >= CONNECTOR_LABEL_MIN_SEGMENT)
      .sort((a, b) => b.length - a.length);
    const oriented = segments.filter((segment) => segment.isHorizontal === wantsHorizontal);
    const segment = segments.length === 1 ? first : (ends[0] ?? longest(oriented) ?? longest(segments))!;
    const along = segment.isHorizontal ? 0.5 : CONNECTOR_LABEL_ALONG_RATIO;
    const anchor = { x: segment.start.x + (segment.end.x - segment.start.x) * along, y: segment.start.y + (segment.end.y - segment.start.y) * along };
    const lineHeight = CONNECTOR_LABEL_FONT_SIZE * LINE_HEIGHT;
    const position = segment.isHorizontal
      ? { x: anchor.x - width / 2, y: anchor.y - lineHeight / 2 - CONNECTOR_LABEL_LIFT }
      : isRight
        ? { x: anchor.x - CONNECTOR_LABEL_SIDE_GAP - width, y: anchor.y - lineHeight / 2 }
        : { x: anchor.x + CONNECTOR_LABEL_SIDE_GAP, y: anchor.y - lineHeight / 2 };
    return this.planText(connector.labelNodeId, label, position, width, { fontSize: CONNECTOR_LABEL_FONT_SIZE, fontWeight: "normal", opacity: 100 });
  }

  private planText(nodeId: string, text: string, position: Point, width: number, options: TextOptions): PlannedNode {
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const roundedWidth = Math.round(width);
    const { fontSize, fontWeight, opacity } = options;
    return {
      nodeId,
      signature: JSON.stringify(["text", text, x, y, roundedWidth, fontSize, fontWeight, opacity]),
      box: { x, y, width: roundedWidth, height: estimateTextHeight(text, roundedWidth, fontSize) },
      build: (): TextElementNode => ({
        id: nodeId,
        type: "textElement",
        position: { x, y },
        data: { ...pickStyle(this.style, TEXT_STYLE_KEYS), text, width: roundedWidth, fontSize, fontWeight, opacity },
      }),
    };
  }

  private planShape(shape: ShapeModel, box: Box): PlannedNode {
    const x = Math.round(box.x);
    const y = Math.round(box.y);
    if (shape.kind === "pictogram" && shape.icon) return this.planPictogram(shape, shape.icon, box);
    const shapeKind = outlineKindOf(shape.kind);
    const backgroundColor = backgroundColorFor(shape.color);
    return {
      nodeId: shape.nodeId,
      signature: JSON.stringify(["shape", shapeKind, shape.label, x, y, box.width, box.height, backgroundColor]),
      box: { ...box, x, y },
      build: (): ShapeElementNode => ({
        id: shape.nodeId,
        type: "shapeElement",
        position: { x, y },
        data: {
          ...pickStyle(this.style, SHAPE_STYLE_KEYS),
          shapeKind,
          width: box.width,
          height: box.height,
          seed: shape.seed,
          label: shape.label,
          note: "",
          backgroundColor,
          strokeWidth: AGENT_STROKE_WIDTH,
          fontSize: SHAPE_FONT_SIZE,
        },
      }),
    };
  }

  private planPictogram(shape: ShapeModel, icon: PictogramName, box: Box): PlannedNode {
    const x = Math.round(box.x);
    const y = Math.round(box.y);
    return {
      nodeId: shape.nodeId,
      signature: JSON.stringify(["pictogram", icon, shape.label, x, y, box.width, box.height]),
      box: { ...box, x, y },
      build: (): PictogramElementNode => ({
        id: shape.nodeId,
        type: "pictogramElement",
        position: { x, y },
        data: {
          ...pickStyle(this.style, PICTOGRAM_STYLE_KEYS),
          icon,
          width: box.width,
          height: box.height,
          seed: shape.seed,
          label: shape.label,
          strokeWidth: AGENT_STROKE_WIDTH,
          fontSize: SHAPE_FONT_SIZE,
        },
      }),
    };
  }

  private planFrame(contentBounds: Box): PlannedNode {
    const x = Math.round(contentBounds.x - FRAME_PADDING);
    const y = Math.round(contentBounds.y - FRAME_PADDING);
    const width = Math.round(contentBounds.width + FRAME_PADDING * 2);
    const height = Math.round(contentBounds.height + FRAME_PADDING * 2);
    return {
      nodeId: this.frameNodeId,
      signature: JSON.stringify(["frame", x, y, width, height]),
      box: { x, y, width, height },
      build: (): ShapeElementNode => ({
        id: this.frameNodeId,
        type: "shapeElement",
        position: { x, y },
        data: {
          ...pickStyle(this.style, SHAPE_STYLE_KEYS),
          shapeKind: "rectangle",
          width,
          height,
          seed: this.frameSeed,
          label: "",
          note: "",
          backgroundColor: TRANSPARENT_COLOR,
          strokeWidth: FRAME_STROKE_WIDTH,
          strokeStyle: "solid",
          opacity: FRAME_OPACITY,
          fontSize: SHAPE_FONT_SIZE,
        },
      }),
    };
  }

  private planConnector(connector: ConnectorModel, fromShape: ShapeModel, toShape: ShapeModel, fromBox: Box, toBox: Box, path: Point[]): PlannedNode {
    const rounded = path.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
    const start = rounded[0];
    const end = rounded[rounded.length - 1];
    const { position, points } = getLineGeometry(rounded);
    return {
      nodeId: connector.nodeId,
      signature: JSON.stringify(["line", connector.kind, connector.strokeStyle, rounded, fromShape.nodeId, toShape.nodeId]),
      box: boxOfPoints(rounded),
      build: (): LineElementNode => ({
        id: connector.nodeId,
        type: "lineElement",
        position,
        data: {
          ...pickStyle(this.style, LINE_STYLE_KEYS),
          kind: connector.kind,
          points,
          seed: connector.seed,
          startBinding: { elementId: fromShape.nodeId, focus: focusFromPoint(fromBox, start) },
          endBinding: { elementId: toShape.nodeId, focus: focusFromPoint(toBox, end) },
          strokeStyle: connector.strokeStyle,
          strokeWidth: AGENT_STROKE_WIDTH,
        },
      }),
    };
  }

  private planLeader(nodeId: string, seed: number, start: Point, end: Point, startBinding: Binding, endBinding: Binding): PlannedNode {
    const { position, points } = getLineGeometry([start, end]);
    return {
      nodeId,
      signature: JSON.stringify(["leader", Math.round(start.x), Math.round(start.y), Math.round(end.x), Math.round(end.y), startBinding.elementId, endBinding.elementId]),
      box: boxOfPoints([start, end]),
      build: (): LineElementNode => ({
        id: nodeId,
        type: "lineElement",
        position,
        data: {
          ...pickStyle(this.style, LINE_STYLE_KEYS),
          kind: "line",
          points,
          seed,
          startBinding,
          endBinding,
          strokeStyle: "solid",
          strokeWidth: LEADER_STROKE_WIDTH,
          opacity: ANNOTATION_OPACITY,
        },
      }),
    };
  }
}
