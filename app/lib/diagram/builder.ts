import type { CanvasNode, ElementStyle, LineKind, Point, ShapeKind, StrokeStyle } from "../../types";
import { DIAGRAM_FILL_SWATCHES, TRANSPARENT_COLOR } from "../color";
import { LINE_HEIGHT, createSeed } from "../elementStyle";
import { focusFromPoint, getOutlinePointToward, type Box } from "../geometry";
import { getPictogramPictureBox, type PictogramName } from "../pictograms";
import { familyOf, getDiagramKind, type DiagramKind, type LayoutFamily } from "./kinds";
import { DEVICE_SPECS, composeElement, elementWidth, isBottomBar, isFullWidth, measureElement, type MockupElement } from "./mockup";
import { AVERAGE_GLYPH_WIDTH_RATIO, NodeFactory, estimateTextHeight, estimateTextWidth, uniteBoxes, type PlannedNode } from "./nodes";
import { isMockupPrimitiveKind, type Device, type DiagramColor, type DiagramDirection, type DiagramOperation, type DiagramShapeKind } from "./operations";
import { layoutGrid } from "./grid";
import { layoutDiagram } from "./placement";
import { layoutRadial } from "./radial";
import { rankByLongestPath } from "./ranking";
import { layoutScreens, type ScreenEndpoint } from "./screens";
import { layoutSequence } from "./sequence";
import { layoutTree } from "./tree";

// The agent says what kind of diagram it is drawing, names a lane (or
// screen) for each shape and says what connects to what; the builder owns
// every coordinate. Each kind belongs to a layout family with its own
// engine (placement.ts, tree.ts, screens.ts); this file feeds the engine
// and turns its answer into canvas nodes. The whole model is re-laid out
// after every operation (it is small) and only nodes whose geometry or
// data actually changed are handed back.

export interface DiagramChange {
  upserted: CanvasNode[];
  removedIds: string[];
}

// A diagram's model as stored on its artboard. Versioned so an older
// drawing that cannot be read back is drawn anew rather than misread.
export const DIAGRAM_STATE_VERSION = 1;
const DEFAULT_ARTBOARD_NAME = "Diagram";

export interface DiagramState {
  version: number;
  title: string | null;
  kind: DiagramKind | null;
  direction: DiagramDirection | null;
  device: Device | null;
  lanes: LaneModel[];
  rows: string[];
  shapes: ShapeModel[];
  connectors: ConnectorModel[];
  groups: GroupModel[];
  notes: NoteModel[];
  titleNodeId: string;
  frameNodeId: string;
  frameSeed: number;
  laneNodeIds: [number, string][];
  screenFrameNodeIds: [number, { nodeId: string; seed: number }][];
  busNodes: [string, BusNodes][];
  lifelineNodeIds: [string, { nodeId: string; seed: number }][];
  gridNodeIds: [string, { nodeId: string; seed: number }][];
}

export function isDiagramState(value: unknown): value is DiagramState {
  return typeof value === "object" && value !== null && (value as { version?: unknown }).version === DIAGRAM_STATE_VERSION;
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
// Hierarchies hold many small boxes, so they use a tighter cell.
const TREE_CELL_SIZES: Record<"sitemap" | "tree", { width: number; height: number }> = {
  sitemap: { width: 150, height: 52 },
  tree: { width: 160, height: 64 },
};
const TREE_DIAMOND_SIZE = { width: 170, height: 80 };
const TREE_PICTOGRAM_WIDTH = 150;
// Children of nodes this deep stack as a list: right under the top level
// for a site map, one level further down for an org chart.
const STACK_FROM_DEPTH: Record<"sitemap" | "tree", number> = { sitemap: 1, tree: 2 };
const TITLE_FONT_SIZE = 28;
const TITLE_WIDTH = 640;
// The handwriting face runs wider than the estimate; leave room so the
// title does not wrap.
const TITLE_WIDTH_SLACK = 1.2;
const TITLE_PADDING = 24;
const TITLE_GAP = 36;
const TITLE_CHANNEL_CLEARANCE = 10;
// A flowchart's loops run above or left of the first row; leave them room.
const OUTER_CHANNEL_CLEARANCE = 28;
// Steps of a flowchart sit closer than swimlane columns: the gap only
// needs to hold a channel and a short label.
const FLOW_RANK_GAP = 110;
const LANE_LABEL_FONT_SIZE = 14;
const LANE_LABEL_COLUMN_WIDTH = 156;
const LANE_LABEL_COLUMN_TEXT_WIDTH = 128;
const LANE_LABEL_ROW_HEIGHT = 40;
const SCREEN_LABEL_GAP = 30;
const SHAPE_FONT_SIZE = 16;
const TREE_SHAPE_FONT_SIZE = 14;
// Agent drawings use a lighter line than the style panel's default so a
// dozen shapes and their arrows read as one calm sketch.
const AGENT_STROKE_WIDTH = 1.5;
// The frame around a whole diagram: quiet, so the drawing stays the subject.
export const FRAME_PADDING = 32;
const FRAME_STROKE_WIDTH = 1;
const FRAME_OPACITY = 55;
const SCREEN_FRAME_STROKE_WIDTH = 1.5;
const CONNECTOR_LABEL_FONT_SIZE = 13;
const CONNECTOR_LABEL_MIN_WIDTH = 40;
const CONNECTOR_LABEL_MAX_WIDTH = 220;
const CONNECTOR_LABEL_PADDING = 10;
// Connector label placement (see placeConnectorLabels). Costs are in
// arbitrary units: covering or crossing anything dwarfs every preference.
const LABEL_SIDE_GAP = 5;
const LABEL_VERTICAL_PADDING = 4;
const LABEL_ON_LINE_PADDING = 12;
const LABEL_CLEARANCE = 4;
const LABEL_RUN_MARGIN = 16;
const LABEL_ALONG_POSITIONS = [0.5, 0.35, 0.65, 0.2, 0.8];
const LABEL_ALONG_COST = 4;
const LABEL_LAST_RUN_COST = 1;
const LABEL_MIDDLE_RUN_COST = 2;
const LABEL_ORIENTATION_COST = 3;
const LABEL_SECOND_SIDE_COST = 1;
const LABEL_OVERHANG_COST = 30;
// A run with room to spare reads better than one the label just fits.
const LABEL_TIGHT_RUN_COST = 3;
const LABEL_ROOMY_RUN_RATIO = 1.6;
const LABEL_ON_LINE_COST = 40;
const LABEL_CROSSING_COST = 100;
const LABEL_COVER_COST = 1000;
// A line node this thin is a single run, usable as an obstacle as is.
const THIN_LINE_LIMIT = 2;
// Side-notes: a handwritten remark just below a shape with a short leader
// back to its outline. They sit to the right of centre when lanes are
// columns (clear of lines leaving the bottom) and in a flowchart (so the
// spine can leave from the centre), and near the left edge when lanes are
// rows (clear of the routing channel between columns).
const ANNOTATION_FONT_SIZE = 14;
const ANNOTATION_MAX_WIDTH = 150;
// At the left edge the note has to stay inside its own column, left of the
// lines leaving the bottom, so it wraps sooner.
const ANNOTATION_MAX_WIDTH_LEFT = 120;
const ANNOTATION_MIN_WIDTH = 60;
const ANNOTATION_PADDING = 12;
const ANNOTATION_OPACITY = 75;
const ANNOTATION_GAP = 14;
const ANNOTATION_INDENT_FROM_CENTER = 16;
const ANNOTATION_INDENT_FROM_EDGE = 12;
// The tick that hangs the block from its shape lands a little in from the
// block's left edge.
const TICK_INSET = 10;
const LEADER_STROKE_WIDTH = 1;
const FREE_NOTE_WIDTH = 360;
const FREE_NOTE_GAP = 12;
const FREE_NOTE_TOP_GAP = 60;
const CROSS_LINK_STYLE: StrokeStyle = "dashed";
// Groups: a quiet box behind its members with the name in the top-left.
// Each group is padded inside, and kept a clear margin from its neighbours.
const GROUP_PADDING = 24;
const GROUP_LABEL_HEIGHT = 28;
const GROUP_MARGIN = 28;
const GROUP_LABEL_INSET = 12;
const GROUP_LABEL_TOP = 8;
const GROUP_LABEL_FONT_SIZE = 13;
const GROUP_STROKE_WIDTH = 1;
const GROUP_OPACITY = 60;
// Room between the lane labels and the first row for a group's label.
const GROUP_CLEARANCE = GROUP_PADDING + GROUP_LABEL_HEIGHT + GROUP_MARGIN;
// Mind maps: the topic reads largest, then each level a little smaller.
const MINDMAP_SIZES = [
  { width: 200, height: 64 },
  { width: 160, height: 48 },
  { width: 140, height: 40 },
];
const MINDMAP_FONT_SIZES = [19, 15, 13];
const BRANCH_COLORS: DiagramColor[] = ["blue", "green", "violet", "yellow", "red"];
// Sequence diagrams.
const SEQUENCE_PARTICIPANT_SIZE = { width: 150, height: 52 };
const SEQUENCE_ACTOR_WIDTH = 120;
const LIFELINE_STROKE_WIDTH = 1;
const LIFELINE_OPACITY = 55;
// Boards.
const CARD_WIDTH = 170;
const CARD_HEIGHT = 52;
const CARD_NOTE_HEIGHT = 20;
const CARD_FONT_SIZE = 14;
const GRID_RULE_STROKE_WIDTH = 1;
const GRID_RULE_OPACITY = 45;
const GRID_HEADER_INSET = 12;
const GRID_HEADER_TOP = 9;

const SHAPE_SIZES: Record<ShapeKind | "pictogram", { width: number; height: number }> = {
  rectangle: { width: CELL_WIDTH, height: CELL_HEIGHT },
  ellipse: { width: CELL_WIDTH, height: CELL_HEIGHT },
  diamond: { width: DIAMOND_WIDTH, height: DIAMOND_HEIGHT },
  pictogram: { width: CELL_WIDTH, height: PICTOGRAM_HEIGHT },
};

// Arrows and leaders meet a pictogram at the edge of its box.
function outlineKindOf(kind: DiagramShapeKind): ShapeKind {
  return kind === "ellipse" || kind === "diamond" ? kind : "rectangle";
}

interface LaneModel {
  name: string;
  shapeIds: string[];
}

interface GroupModel {
  id: string;
  label: string | null;
  members: string[];
  color: DiagramColor | null;
  nodeId: string;
  labelNodeId: string;
  seed: number;
}

interface ShapeModel {
  id: string;
  kind: DiagramShapeKind;
  icon: PictogramName | null;
  label: string;
  laneIndex: number;
  rowIndex: number;
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

type AnnotationSide = "left" | "right";

interface Segment {
  start: Point;
  end: Point;
  isHorizontal: boolean;
  length: number;
}

interface BusNodes {
  trunkNodeId: string;
  barNodeId: string;
  seed: number;
}

// What a family engine hands back for the shared steps that follow:
// annotations, connectors, labels and the frame.
interface FamilyPlan {
  nodes: PlannedNode[];
  shapeBoxes: Map<string, Box>;
  cellBoxes: Map<string, Box>;
  connectorPaths: Map<string, Point[]>;
  // Connector ends that are not shapes (a screen frame): id to node id and box.
  extraTargets: Map<string, { nodeId: string; box: Box }>;
  contentBounds: Box | null;
  drawsSideNotes: boolean;
  // Kinds that are only boxes and links (a mind map) draw no notes at all.
  dropsNotes?: boolean;
  dashedConnectorIds: Set<string>;
  // Where the family puts each group; left out, a group wraps its members.
  groupBoxes?: Map<string, Box>;
  // Which way connector labels read: along horizontal runs or vertical ones.
  labelDirection?: DiagramDirection;
}

function annotationSideFor(kind: DiagramKind, direction: DiagramDirection): AnnotationSide {
  return direction === "right" || kind === "flow" ? "right" : "left";
}

// How far a right-side note reaches past the middle of its shape, so the
// engine can keep the next column clear of it.
function annotationSpill(annotations: Annotation[], side: AnnotationSide, shapeWidth: number): number {
  if (side !== "right" || annotations.length === 0) return 0;
  return Math.max(0, ANNOTATION_INDENT_FROM_CENTER + annotationBlock(annotations, side).width - shapeWidth / 2);
}

// Lines meet a pictogram at its picture, not at the corners of its box.
function portInsetsFor(shape: ShapeModel, box: Box): { left: number; right: number; top: number; bottom: number } | undefined {
  if (shape.kind !== "pictogram") return undefined;
  const picture = getPictogramPictureBox(box, shape.label !== "", SHAPE_FONT_SIZE);
  return { left: picture.x - box.x, right: box.x + box.width - picture.x - picture.width, top: 0, bottom: box.height - picture.height };
}

function backgroundColorFor(color: DiagramColor | null): string {
  if (!color) return TRANSPARENT_COLOR;
  return DIAGRAM_FILL_SWATCHES.find((swatch) => swatch.label.toLowerCase() === color)?.value ?? TRANSPARENT_COLOR;
}

const NOTE_BREAK_PATTERN = /[/ ]/g;

// Wraps a note so each line fits the width, breaking after a slash or a
// space where it can: a file path reads as its segments, not cut mid-word.
function wrapAnnotation(text: string, side: AnnotationSide): string {
  const maxWidth = side === "right" ? ANNOTATION_MAX_WIDTH : ANNOTATION_MAX_WIDTH_LEFT;
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

function annotationWidth(text: string, side: AnnotationSide): number {
  const maxWidth = side === "right" ? ANNOTATION_MAX_WIDTH : ANNOTATION_MAX_WIDTH_LEFT;
  const longestLine = Math.max(...text.split("\n").map((line) => line.length));
  return Math.min(maxWidth, Math.max(ANNOTATION_MIN_WIDTH, Math.ceil(longestLine * ANNOTATION_FONT_SIZE * AVERAGE_GLYPH_WIDTH_RATIO) + ANNOTATION_PADDING));
}

function annotationHeight(text: string, side: AnnotationSide): number {
  return estimateTextHeight(text, annotationWidth(text, side), ANNOTATION_FONT_SIZE);
}

// A shape's annotations read as one block: its own note first, then the
// remarks the agent attached, each on its own lines.
function annotationBlock(annotations: Annotation[], side: AnnotationSide): { text: string; width: number; height: number } {
  const text = annotations.map((annotation) => annotation.text).join("\n");
  const width = Math.max(ANNOTATION_MIN_WIDTH, ...annotations.map((annotation) => annotationWidth(annotation.text, side)));
  return { text, width, height: estimateTextHeight(text, width, ANNOTATION_FONT_SIZE) };
}

function annotationBandHeight(annotations: Annotation[], side: AnnotationSide): number {
  return annotations.length === 0 ? 0 : annotationBlock(annotations, side).height;
}

function segmentsOf(path: Point[]): Segment[] {
  return path.slice(1).map((end, index) => {
    const start = path[index];
    return { start, end, isHorizontal: Math.abs(end.y - start.y) <= Math.abs(end.x - start.x), length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
}

function labelWidthFor(label: string): number {
  return Math.min(CONNECTOR_LABEL_MAX_WIDTH, Math.max(CONNECTOR_LABEL_MIN_WIDTH, estimateTextWidth(label, CONNECTOR_LABEL_FONT_SIZE) + CONNECTOR_LABEL_PADDING));
}

interface LabelledConnector {
  connector: ConnectorModel;
  label: string;
  path: Point[];
}

interface LabelCandidate {
  box: Box;
  cost: number;
  // Sitting across its own line, which shows through as a gap.
  onLine: boolean;
}

function inflate(box: Box, amount: number): Box {
  return { x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}

function boxesOverlap(first: Box, second: Box): boolean {
  return first.x < second.x + second.width && second.x < first.x + first.width && first.y < second.y + second.height && second.y < first.y + first.height;
}

// Whether a straight run passes through a box (Liang–Barsky clipping).
function runCrossesBox([start, end]: [Point, Point], box: Box): boolean {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let enter = 0;
  let leave = 1;
  const edges: [number, number][] = [
    [-deltaX, start.x - box.x],
    [deltaX, box.x + box.width - start.x],
    [-deltaY, start.y - box.y],
    [deltaY, box.y + box.height - start.y],
  ];
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const t = distance / direction;
    if (direction < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

export class DiagramBuilder {
  private title: string | null = null;
  private kind: DiagramKind | null = null;
  private direction: DiagramDirection | null = null;
  private device: Device | null = null;
  private readonly lanes: LaneModel[] = [];
  private readonly rows: string[] = [];
  private readonly shapes = new Map<string, ShapeModel>();
  private readonly connectors = new Map<string, ConnectorModel>();
  private readonly groups = new Map<string, GroupModel>();
  private readonly notes = new Map<string, NoteModel>();
  private readonly lifelineNodeIds = new Map<string, { nodeId: string; seed: number }>();
  private readonly gridNodeIds = new Map<string, { nodeId: string; seed: number }>();
  private titleNodeId = crypto.randomUUID();
  private frameNodeId = crypto.randomUUID();
  private frameSeed = createSeed();
  private readonly laneNodeIds = new Map<number, string>();
  private readonly screenFrameNodeIds = new Map<number, { nodeId: string; seed: number }>();
  private readonly busNodes = new Map<string, BusNodes>();
  private readonly factory: NodeFactory;
  private materialized = new Map<string, { signature: string; node: CanvasNode }>();
  // Nodes a restored diagram had on the canvas: the first materialize
  // replaces them all and removes the ones no longer drawn.
  private restoredNodeIds = new Set<string>();
  private lastBounds: Box | null = null;

  constructor(
    private origin: Point,
    style: ElementStyle,
  ) {
    this.factory = new NodeFactory(style);
  }

  // Everything needed to pick the diagram up again later and change it in
  // place: the model and the ids of every node it drew. Stored on the
  // artboard, so it travels with the project.
  serialize(): DiagramState {
    return {
      version: DIAGRAM_STATE_VERSION,
      title: this.title,
      kind: this.kind,
      direction: this.direction,
      device: this.device,
      lanes: this.lanes.map((lane) => ({ ...lane, shapeIds: [...lane.shapeIds] })),
      rows: [...this.rows],
      shapes: [...this.shapes.values()],
      connectors: [...this.connectors.values()],
      groups: [...this.groups.values()],
      notes: [...this.notes.values()],
      titleNodeId: this.titleNodeId,
      frameNodeId: this.frameNodeId,
      frameSeed: this.frameSeed,
      laneNodeIds: [...this.laneNodeIds],
      screenFrameNodeIds: [...this.screenFrameNodeIds],
      busNodes: [...this.busNodes],
      lifelineNodeIds: [...this.lifelineNodeIds],
      gridNodeIds: [...this.gridNodeIds],
    };
  }

  // A builder for a diagram already on the canvas. `framePosition` is where
  // its artboard is now (it may have been moved since it was drawn).
  static restore(state: DiagramState, memberIds: string[], framePosition: Point, style: ElementStyle): DiagramBuilder {
    const builder = new DiagramBuilder({ x: framePosition.x + FRAME_PADDING, y: framePosition.y + FRAME_PADDING }, style);
    builder.title = state.title;
    builder.kind = state.kind;
    builder.direction = state.direction;
    builder.device = state.device;
    builder.lanes.push(...state.lanes.map((lane) => ({ ...lane, shapeIds: [...lane.shapeIds] })));
    builder.rows.push(...state.rows);
    state.shapes.forEach((shape) => builder.shapes.set(shape.id, { ...shape }));
    state.connectors.forEach((connector) => builder.connectors.set(connector.id, { ...connector }));
    state.groups.forEach((group) => builder.groups.set(group.id, { ...group, members: [...group.members] }));
    state.notes.forEach((note) => builder.notes.set(note.id, { ...note }));
    builder.titleNodeId = state.titleNodeId;
    builder.frameNodeId = state.frameNodeId;
    builder.frameSeed = state.frameSeed;
    state.laneNodeIds.forEach(([key, value]) => builder.laneNodeIds.set(key, value));
    state.screenFrameNodeIds.forEach(([key, value]) => builder.screenFrameNodeIds.set(key, value));
    state.busNodes.forEach(([key, value]) => builder.busNodes.set(key, value));
    state.lifelineNodeIds.forEach(([key, value]) => builder.lifelineNodeIds.set(key, value));
    state.gridNodeIds.forEach(([key, value]) => builder.gridNodeIds.set(key, value));
    builder.restoredNodeIds = new Set([...memberIds, state.frameNodeId]);
    // The frame sits a padding outside the content, whose top-left is the
    // origin; the content can start left of the origin (lane titles), so
    // one layout pass finds the true offset and the origin is corrected.
    const firstBounds = uniteBoxes(builder.plan().filter((item) => item.nodeId !== builder.frameNodeId).map((item) => item.box));
    if (firstBounds) {
      builder.origin = {
        x: builder.origin.x + (builder.origin.x - FRAME_PADDING - (firstBounds.x - FRAME_PADDING)),
        y: builder.origin.y + (builder.origin.y - FRAME_PADDING - (firstBounds.y - FRAME_PADDING)),
      };
    }
    return builder;
  }

  getArtboardId(): string {
    return this.frameNodeId;
  }

  getTitle(): string | null {
    return this.title;
  }

  apply(operation: DiagramOperation): ApplyResult {
    switch (operation.op) {
      case "plan":
        if (operation.title) this.title = operation.title;
        if (operation.kind) this.kind = operation.kind;
        if (operation.direction) this.direction = operation.direction;
        if (operation.device) this.device = operation.device;
        operation.lanes.forEach((name) => this.findOrCreateLane(name));
        operation.rows.forEach((name) => this.findOrCreateRow(name));
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
          rowIndex: this.findOrCreateRow(operation.row ?? ""),
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
        const from = this.describeEndpoint(operation.from);
        const to = this.describeEndpoint(operation.to);
        if (!from || !to) return { ok: false, reason: `connect refers to an unknown shape (${!from ? operation.from : operation.to})` };
        // A message from a participant to itself is a self-call in a
        // sequence; everywhere else a loop onto one shape draws nothing.
        if (operation.from === operation.to && this.kind !== "sequence") return { ok: false, reason: `connect from “${from}” to itself` };
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
        return { ok: true, description: `Connecting ${from} to ${to}` };
      }
      case "group": {
        const members = operation.members.filter((member) => this.shapes.has(member) || this.connectors.has(member));
        if (members.length === 0) return { ok: false, reason: `group "${operation.id}" names nothing on the canvas` };
        const existing = this.groups.get(operation.id);
        this.groups.set(operation.id, {
          id: operation.id,
          label: operation.label,
          members,
          color: operation.color,
          nodeId: existing?.nodeId ?? crypto.randomUUID(),
          labelNodeId: existing?.labelNodeId ?? crypto.randomUUID(),
          seed: existing?.seed ?? createSeed(),
        });
        return { ok: true, description: operation.label ? `Grouping ${operation.label}` : "Grouping" };
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
        if (this.connectors.delete(operation.id)) {
          this.dropMember(operation.id);
          return { ok: true, description: "Removing a connection" };
        }
        if (this.groups.delete(operation.id)) return { ok: true, description: "Removing a group" };
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
    const kind = this.resolveKind();
    if (this.title) lines.push(`Title: ${this.title}`);
    lines.push(`Kind: ${kind}`);
    const family = familyOf(kind);
    const laneNames = this.lanes.filter((lane) => lane.name).map((lane) => lane.name);
    if (laneNames.length > 0) lines.push(`${family === "screens" ? "Screens" : family === "grid" ? "Columns" : "Lanes"}: ${laneNames.join(", ")}`);
    const rowNames = this.rows.filter(Boolean);
    if (rowNames.length > 0) lines.push(`Rows: ${rowNames.join(", ")}`);
    const shapes = [...this.shapes.values()].map((shape) => {
      const lane = this.lanes[shape.laneIndex]?.name;
      const row = this.rows[shape.rowIndex];
      const kindText = shape.kind === "pictogram" ? `pictogram ${shape.icon}` : shape.kind;
      return `${shape.id} "${shape.label}" (${kindText}${lane ? `, ${lane}` : ""}${row ? `, row ${row}` : ""}${shape.note ? `, note: ${shape.note}` : ""})`;
    });
    if (shapes.length > 0) lines.push(`Shapes: ${shapes.join("; ")}`);
    const connectors = [...this.connectors.values()].map((connector) => `${connector.from} -> ${connector.to}${connector.label ? ` "${connector.label}"` : ""}`);
    if (connectors.length > 0) lines.push(`Connections: ${connectors.join("; ")}`);
    const groups = [...this.groups.values()].map((group) => `${group.id}${group.label ? ` "${group.label}"` : ""} [${group.members.join(", ")}]`);
    if (groups.length > 0) lines.push(`Groups: ${groups.join("; ")}`);
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
    const removedIds = [...new Set([...this.materialized.keys(), ...this.restoredNodeIds])].filter((nodeId) => !next.has(nodeId));
    this.restoredNodeIds.clear();
    this.materialized = next;
    this.lastBounds = uniteBoxes(planned.map((item) => item.box));
    return { upserted, removedIds };
  }

  // ── The model ─────────────────────────────────────────────────

  private hasNamedLanes(): boolean {
    return this.lanes.some((lane) => lane.name !== "");
  }

  // Without a plan the drawing is a flowchart, or swimlanes once a lane is
  // named; "flow" with named lanes is swimlanes too.
  private resolveKind(): DiagramKind {
    if (this.kind === "flow" && this.hasNamedLanes()) return "swimlane";
    if (this.kind) return this.kind;
    return this.hasNamedLanes() ? "swimlane" : "flow";
  }

  private resolveDirection(kind: DiagramKind): DiagramDirection {
    return this.direction ?? getDiagramKind(kind).defaultDirection;
  }

  private findLaneIndex(name: string): number {
    const normalized = name.trim().toLowerCase();
    return this.lanes.findIndex((lane) => lane.name.toLowerCase() === normalized);
  }

  private findOrCreateLane(name: string): number {
    const existingIndex = this.findLaneIndex(name);
    if (existingIndex !== -1) return existingIndex;
    this.lanes.push({ name: name.trim(), shapeIds: [] });
    return this.lanes.length - 1;
  }

  private findOrCreateRow(name: string): number {
    const normalized = name.trim().toLowerCase();
    const existingIndex = this.rows.findIndex((row) => row.toLowerCase() === normalized);
    if (existingIndex !== -1) return existingIndex;
    this.rows.push(name.trim());
    return this.rows.length - 1;
  }

  private dropMember(id: string) {
    for (const group of this.groups.values()) group.members = group.members.filter((member) => member !== id);
  }

  // A connector end: a shape, or (in a screen flow) a screen by name.
  private describeEndpoint(id: string): string | null {
    const shape = this.shapes.get(id);
    if (shape) return shape.label;
    const laneIndex = this.findLaneIndex(id);
    return laneIndex !== -1 && this.lanes[laneIndex].name ? this.lanes[laneIndex].name : null;
  }

  private updateShape(
    shape: ShapeModel,
    patch: { label?: string; lane?: string | null; row?: string | null; color?: DiagramColor | null; kind?: DiagramShapeKind; icon?: PictogramName | null; note?: string | null },
  ) {
    if (patch.label) shape.label = patch.label;
    if (patch.kind) shape.kind = patch.kind;
    if (patch.icon) shape.icon = patch.icon;
    if (patch.color !== undefined) shape.color = patch.color;
    if (patch.note !== undefined) shape.note = patch.note;
    if (patch.row) shape.rowIndex = this.findOrCreateRow(patch.row);
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
    this.dropMember(shape.id);
    for (const [id, connector] of this.connectors) {
      if (connector.from === shape.id || connector.to === shape.id) {
        this.connectors.delete(id);
        this.dropMember(id);
      }
    }
    for (const [id, note] of this.notes) {
      if (note.near === shape.id) this.notes.delete(id);
    }
  }

  // The shape's own note first, then any notes the agent attached to it.
  private annotationsByShape(side: AnnotationSide): Map<string, Annotation[]> {
    const annotations = new Map<string, Annotation[]>();
    for (const shape of this.shapes.values()) {
      annotations.set(
        shape.id,
        shape.note ? [{ text: wrapAnnotation(shape.note, side), nodeId: shape.noteNodeId, leaderNodeId: shape.noteLeaderNodeId, leaderSeed: shape.noteLeaderSeed }] : [],
      );
    }
    for (const note of this.notes.values()) {
      if (note.near) {
        annotations.get(note.near)?.push({ text: wrapAnnotation(note.text, side), nodeId: note.nodeId, leaderNodeId: note.leaderNodeId, leaderSeed: note.leaderSeed });
      }
    }
    return annotations;
  }

  // ── Planning ──────────────────────────────────────────────────

  private plan(): PlannedNode[] {
    const kind = this.resolveKind();
    const family = familyOf(kind);
    const direction = this.resolveDirection(kind);
    const planned: PlannedNode[] = [];
    const titleHeight = this.title ? TITLE_FONT_SIZE * LINE_HEIGHT : 0;
    const contentTop = this.origin.y + (this.title ? titleHeight + TITLE_GAP : 0);
    const annotationSide = annotationSideFor(kind, direction);
    const annotations = this.annotationsByShape(annotationSide);

    if (this.title) {
      // Sized to the words so a narrow drawing is not framed to a wide title.
      const titleWidth = Math.min(TITLE_WIDTH, estimateTextWidth(this.title, TITLE_FONT_SIZE) * TITLE_WIDTH_SLACK + TITLE_PADDING);
      planned.push(this.factory.text(this.titleNodeId, this.title, { x: this.origin.x, y: this.origin.y }, titleWidth, { fontSize: TITLE_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
    }

    const familyPlan = this.planFamily(family, kind, direction, contentTop, titleHeight, annotations, annotationSide);
    const notesByShape = new Map<string, PlannedNode[]>();
    for (const shape of this.shapes.values()) {
      const box = familyPlan.shapeBoxes.get(shape.id);
      if (!box || !familyPlan.drawsSideNotes) continue;
      notesByShape.set(shape.id, this.planAnnotations(shape, box, annotations.get(shape.id) ?? [], annotationSide));
    }
    // Group boxes go under the shapes (and notes) they hold.
    const groupNodes = this.planGroups(familyPlan, notesByShape);
    planned.push(...groupNodes);
    planned.push(...familyPlan.nodes);
    for (const notes of notesByShape.values()) planned.push(...notes);

    const labelled: LabelledConnector[] = [];
    for (const connector of this.connectors.values()) {
      const path = familyPlan.connectorPaths.get(connector.id);
      const from = this.endpointOf(connector.from, familyPlan);
      const to = this.endpointOf(connector.to, familyPlan);
      if (!from || !to || !path || path.length < 2) continue;
      const strokeStyle = familyPlan.dashedConnectorIds.has(connector.id) ? CROSS_LINK_STYLE : connector.strokeStyle;
      planned.push(this.planConnector(connector, strokeStyle, from, to, path, family === "radial"));
      if (connector.label) labelled.push({ connector, label: connector.label, path });
    }
    // Labels last: they sit above every line, and are placed knowing where
    // everything else already is.
    const groupNodeIds = new Set(groupNodes.map((node) => node.nodeId));
    planned.push(...this.placeConnectorLabels(labelled, planned, groupNodeIds, familyPlan.connectorPaths, familyPlan.labelDirection ?? direction, annotationSide));

    const freeNotes = familyPlan.dropsNotes ? [] : [...this.notes.values()].filter((note) => !note.near || !familyPlan.drawsSideNotes);
    let freeNoteTop = (familyPlan.contentBounds ? familyPlan.contentBounds.y + familyPlan.contentBounds.height : contentTop) + FREE_NOTE_TOP_GAP;
    for (const note of freeNotes) {
      const nearLabel = note.near ? this.shapes.get(note.near)?.label : null;
      const text = nearLabel ? `${nearLabel}: ${note.text}` : note.text;
      planned.push(this.factory.text(note.nodeId, text, { x: this.origin.x, y: freeNoteTop }, FREE_NOTE_WIDTH, { fontSize: ANNOTATION_FONT_SIZE, fontWeight: "normal", opacity: ANNOTATION_OPACITY }));
      freeNoteTop += estimateTextHeight(text, FREE_NOTE_WIDTH, ANNOTATION_FONT_SIZE) + FREE_NOTE_GAP;
    }

    // The frame goes first so it sits beneath everything it encloses. It is
    // the diagram's artboard: it knows every node the diagram drew and
    // carries the model, so the drawing can be moved as one and changed later.
    const bounds = uniteBoxes(planned.map((item) => item.box));
    if (bounds) planned.unshift(this.planFrame(bounds, planned.map((item) => item.nodeId)));
    return planned;
  }

  private planFamily(
    family: LayoutFamily,
    kind: DiagramKind,
    direction: DiagramDirection,
    contentTop: number,
    titleHeight: number,
    annotations: Map<string, Annotation[]>,
    annotationSide: AnnotationSide,
  ): FamilyPlan {
    switch (family) {
      case "tree":
        return this.planTree(kind as "sitemap" | "tree", direction, contentTop);
      case "radial":
        return this.planRadial(contentTop);
      case "sequence":
        return this.planSequence(contentTop);
      case "grid":
        return this.planGrid(contentTop);
      case "screens":
        return this.planScreens(contentTop);
      case "layered":
        return this.planLayered(kind, direction, contentTop, titleHeight, annotations, annotationSide);
    }
  }

  // A group is a quiet labelled box behind its members: a pool, a
  // container, a subsystem, or (in a sequence) a fragment around messages.
  private planGroups(familyPlan: FamilyPlan, notesByShape: Map<string, PlannedNode[]>): PlannedNode[] {
    const planned: PlannedNode[] = [];
    for (const group of this.groups.values()) {
      const box =
        familyPlan.groupBoxes?.get(group.id) ??
        (() => {
          // A member's notes belong to it, so the box holds them too.
          const memberBoxes = group.members.flatMap((member) => {
            const shapeBox = familyPlan.shapeBoxes.get(member);
            return shapeBox ? [shapeBox, ...(notesByShape.get(member) ?? []).map((note) => note.box)] : [];
          });
          const bounds = uniteBoxes(memberBoxes);
          return bounds && { x: bounds.x - GROUP_PADDING, y: bounds.y - GROUP_PADDING - (group.label ? GROUP_LABEL_HEIGHT : 0), width: bounds.width + GROUP_PADDING * 2, height: bounds.height + GROUP_PADDING * 2 + (group.label ? GROUP_LABEL_HEIGHT : 0) };
        })();
      if (!box) continue;
      planned.push(
        this.factory.shape(group.nodeId, group.seed, "rectangle", box, {
          label: "",
          backgroundColor: backgroundColorFor(group.color),
          strokeWidth: GROUP_STROKE_WIDTH,
          strokeStyle: "solid",
          // A flat tint: hatching behind hatched shapes reads as noise.
          fillStyle: "solid",
          opacity: GROUP_OPACITY,
          fontSize: SHAPE_FONT_SIZE,
        }),
      );
      if (group.label) {
        planned.push(
          this.factory.text(group.labelNodeId, group.label, { x: box.x + GROUP_LABEL_INSET, y: box.y + GROUP_LABEL_TOP }, box.width - GROUP_LABEL_INSET * 2, {
            fontSize: GROUP_LABEL_FONT_SIZE,
            fontWeight: "bold",
            opacity: 100,
          }),
        );
      }
    }
    return planned;
  }

  // Mind maps: the topic in the middle, branches to both sides, curves.
  private planRadial(contentTop: number): FamilyPlan {
    const shapes = [...this.shapes.values()];
    const layout = layoutRadial({
      contentOrigin: { x: this.origin.x, y: contentTop },
      shapes: shapes.map((shape) => ({ id: shape.id })),
      connectors: [...this.connectors.values()].map((connector) => ({ id: connector.id, from: connector.from, to: connector.to })),
      sizeForDepth: (depth) => MINDMAP_SIZES[Math.min(depth, MINDMAP_SIZES.length - 1)],
    });
    const nodes: PlannedNode[] = [];
    for (const shape of shapes) {
      const box = layout.shapeBoxes.get(shape.id);
      if (!box) continue;
      const depth = layout.depthOf.get(shape.id) ?? 0;
      const branch = layout.branchOf.get(shape.id);
      // The first level carries its branch colour; deeper ideas stay plain.
      const color = depth === 1 && branch !== undefined ? (shape.color ?? BRANCH_COLORS[branch % BRANCH_COLORS.length]) : depth === 0 ? shape.color : null;
      nodes.push(this.planShape({ ...shape, color }, box, MINDMAP_FONT_SIZES[Math.min(depth, MINDMAP_FONT_SIZES.length - 1)]));
    }
    return {
      nodes,
      shapeBoxes: layout.shapeBoxes,
      cellBoxes: layout.shapeBoxes,
      connectorPaths: layout.connectorPaths,
      extraTargets: new Map(),
      contentBounds: layout.contentBounds,
      drawsSideNotes: false,
      dropsNotes: true,
      dashedConnectorIds: layout.crossLinkIds,
      labelDirection: "right",
    };
  }

  // Sequence diagrams: participants along the top, messages in time order.
  private planSequence(contentTop: number): FamilyPlan {
    const shapes = [...this.shapes.values()];
    const sizeOf = (shape: ShapeModel) => (shape.kind === "pictogram" ? { width: SEQUENCE_ACTOR_WIDTH, height: PICTOGRAM_HEIGHT } : SEQUENCE_PARTICIPANT_SIZE);
    const layout = layoutSequence({
      contentOrigin: { x: this.origin.x, y: contentTop },
      participants: shapes.map((shape) => ({ id: shape.id, ...sizeOf(shape) })),
      messages: [...this.connectors.values()].map((connector) => ({ id: connector.id, from: connector.from, to: connector.to })),
      fragments: [...this.groups.values()].map((group) => ({ id: group.id, messageIds: group.members })),
    });
    const nodes: PlannedNode[] = [];
    for (const lifeline of layout.lifelines) {
      const ids = this.lifelineNodeIds.get(lifeline.participantId) ?? { nodeId: crypto.randomUUID(), seed: createSeed() };
      this.lifelineNodeIds.set(lifeline.participantId, ids);
      nodes.push(this.factory.polyline(ids.nodeId, ids.seed, [lifeline.top, lifeline.bottom], { kind: "line", strokeStyle: "dashed", strokeWidth: LIFELINE_STROKE_WIDTH, opacity: LIFELINE_OPACITY }));
    }
    for (const shape of shapes) {
      const box = layout.participantBoxes.get(shape.id);
      if (box) nodes.push(this.planShape(shape, box, SHAPE_FONT_SIZE));
    }
    return {
      nodes,
      shapeBoxes: layout.participantBoxes,
      cellBoxes: layout.participantBoxes,
      connectorPaths: layout.messagePaths,
      extraTargets: new Map(),
      contentBounds: layout.contentBounds,
      drawsSideNotes: false,
      dashedConnectorIds: new Set(),
      groupBoxes: new Map(layout.fragmentBoxes.map((fragment) => [fragment.id, fragment.box])),
      labelDirection: "right",
    };
  }

  // Boards: cards in named columns and rows.
  private planGrid(contentTop: number): FamilyPlan {
    const shapes = [...this.shapes.values()];
    const hasColumnHeaders = this.hasNamedLanes();
    const hasRowHeaders = this.rows.some(Boolean);
    const cardHeight = (shape: ShapeModel) => (shape.kind === "pictogram" ? PICTOGRAM_HEIGHT : CARD_HEIGHT + (shape.note ? CARD_NOTE_HEIGHT : 0));
    const layout = layoutGrid({
      contentOrigin: { x: this.origin.x, y: contentTop },
      columnCount: Math.max(1, this.lanes.length),
      rowCount: Math.max(1, this.rows.length),
      hasColumnHeaders,
      hasRowHeaders,
      cardWidth: CARD_WIDTH,
      cards: shapes.map((shape) => ({ id: shape.id, columnIndex: shape.laneIndex, rowIndex: shape.rowIndex, height: cardHeight(shape) })),
    });
    const nodes: PlannedNode[] = [];
    const stableIds = (key: string) => {
      const ids = this.gridNodeIds.get(key) ?? { nodeId: crypto.randomUUID(), seed: createSeed() };
      this.gridNodeIds.set(key, ids);
      return ids;
    };
    layout.separators.forEach((points, index) => {
      const ids = stableIds(`separator-${index}`);
      nodes.push(this.factory.polyline(ids.nodeId, ids.seed, points, { kind: "line", strokeStyle: "solid", strokeWidth: GRID_RULE_STROKE_WIDTH, opacity: GRID_RULE_OPACITY }));
    });
    layout.columnHeaderBoxes.forEach((box, column) => {
      const name = this.lanes[column]?.name;
      if (!name) return;
      const ids = stableIds(`column-${column}`);
      nodes.push(this.factory.text(ids.nodeId, name, { x: box.x + GRID_HEADER_INSET, y: box.y + GRID_HEADER_TOP }, box.width - GRID_HEADER_INSET * 2, { fontSize: LANE_LABEL_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
    });
    layout.rowHeaderBoxes.forEach((box, row) => {
      const name = this.rows[row];
      if (!name) return;
      const ids = stableIds(`row-${row}`);
      nodes.push(this.factory.text(ids.nodeId, name, { x: box.x + GRID_HEADER_INSET, y: box.y + GRID_HEADER_TOP }, box.width - GRID_HEADER_INSET * 2, { fontSize: LANE_LABEL_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
    });
    for (const shape of shapes) {
      const box = layout.cardBoxes.get(shape.id);
      if (!box) continue;
      if (shape.kind === "pictogram" && shape.icon) {
        nodes.push(this.planShape(shape, box, SHAPE_FONT_SIZE));
        continue;
      }
      nodes.push(
        this.factory.shape(shape.nodeId, shape.seed, "rectangle", box, {
          label: shape.label,
          note: shape.note ?? "",
          backgroundColor: backgroundColorFor(shape.color),
          strokeWidth: AGENT_STROKE_WIDTH,
          fontSize: CARD_FONT_SIZE,
        }),
      );
    }
    return {
      nodes,
      shapeBoxes: layout.cardBoxes,
      cellBoxes: layout.cardBoxes,
      connectorPaths: new Map(),
      extraTargets: new Map(),
      contentBounds: layout.contentBounds,
      drawsSideNotes: false,
      dashedConnectorIds: new Set(),
    };
  }

  private endpointOf(id: string, familyPlan: FamilyPlan): { nodeId: string; box: Box; outlineKind: ShapeKind } | null {
    const shape = this.shapes.get(id);
    const shapeBox = familyPlan.shapeBoxes.get(id);
    if (shape && shapeBox) return { nodeId: shape.nodeId, box: shapeBox, outlineKind: outlineKindOf(shape.kind) };
    const extra = familyPlan.extraTargets.get(id.trim().toLowerCase());
    return extra ? { nodeId: extra.nodeId, box: extra.box, outlineKind: "rectangle" } : null;
  }

  // Flowcharts, swimlanes and layers. A flowchart has no lanes: its ranks
  // come from the connections and its main path is pinned straight.
  private planLayered(
    kind: DiagramKind,
    direction: DiagramDirection,
    contentTop: number,
    titleHeight: number,
    annotations: Map<string, Annotation[]>,
    annotationSide: AnnotationSide,
  ): FamilyPlan {
    const isRight = direction === "right";
    const isFlow = kind === "flow";
    const hasLaneLabels = !isFlow && this.hasNamedLanes();
    const shapes = [...this.shapes.values()];
    const ranking = isFlow
      ? rankByLongestPath({
          shapeIds: shapes.map((shape) => shape.id),
          connectors: [...this.connectors.values()].map(({ id, from, to, label }) => ({ id, from, to, label })),
          startCandidateIds: shapes.filter((shape) => shape.kind === "ellipse").map((shape) => shape.id),
        })
      : null;
    const outerClearance = (isFlow ? OUTER_CHANNEL_CLEARANCE : 0) + (this.groups.size > 0 ? GROUP_CLEARANCE : 0);
    const contentOrigin = isRight
      ? { x: this.origin.x, y: contentTop + (hasLaneLabels ? LANE_LABEL_ROW_HEIGHT : 0) + outerClearance }
      : { x: this.origin.x + (hasLaneLabels ? LANE_LABEL_COLUMN_WIDTH : 0) + outerClearance, y: contentTop };

    const layout = layoutDiagram({
      direction,
      contentOrigin,
      leadingLimit: isRight ? -Infinity : this.origin.y + titleHeight + TITLE_CHANNEL_CLEARANCE,
      laneCount: ranking ? Math.max(1, ranking.rankCount) : this.lanes.length,
      defaultShapeSize: { width: CELL_WIDTH, height: CELL_HEIGHT },
      shapes: shapes.map((shape) => ({
        id: shape.id,
        laneIndex: ranking ? ranking.rankOf.get(shape.id)! : shape.laneIndex,
        ...this.layeredShapeSize(shape),
        annotationBand: annotationBandHeight(annotations.get(shape.id) ?? [], annotationSide),
        annotationSpill: annotationSpill(annotations.get(shape.id) ?? [], annotationSide, this.layeredShapeSize(shape).width),
        branchesSideways: shape.kind === "diamond",
        portInsets: portInsetsFor(shape, { x: 0, y: 0, ...this.layeredShapeSize(shape) }),
      })),
      connectors: [...this.connectors.values()].map((connector) => ({
        id: connector.id,
        from: connector.from,
        to: connector.to,
        labelWidth: connector.label ? labelWidthFor(connector.label) : undefined,
      })),
      pinnedFirst: ranking?.spine,
      loopsOutside: isFlow,
      annotationSide,
      laneGap: isFlow ? FLOW_RANK_GAP : undefined,
      groups: [...this.groups.values()].map((group) => group.members),
      groupSpacing: { padding: GROUP_PADDING, labelSpace: GROUP_LABEL_HEIGHT, margin: GROUP_MARGIN },
    });

    const nodes: PlannedNode[] = [];
    if (hasLaneLabels) {
      this.lanes.forEach((lane, laneIndex) => {
        if (!lane.name) return;
        const laneNodeId = this.laneNodeIds.get(laneIndex) ?? crypto.randomUUID();
        this.laneNodeIds.set(laneIndex, laneNodeId);
        const span = layout.lanes[laneIndex];
        const position = isRight ? { x: span.start, y: contentTop } : { x: this.origin.x, y: span.start + span.extent / 2 - (LANE_LABEL_FONT_SIZE * LINE_HEIGHT) / 2 };
        const width = isRight ? CELL_WIDTH : LANE_LABEL_COLUMN_TEXT_WIDTH;
        nodes.push(this.factory.text(laneNodeId, lane.name, position, width, { fontSize: LANE_LABEL_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
      });
    }
    for (const shape of shapes) {
      const box = layout.shapeBoxes.get(shape.id);
      if (box) nodes.push(this.planShape(shape, box, SHAPE_FONT_SIZE));
    }
    return {
      nodes,
      shapeBoxes: layout.shapeBoxes,
      cellBoxes: layout.cellBoxes,
      connectorPaths: layout.connectorPaths,
      extraTargets: new Map(),
      contentBounds: layout.contentBounds,
      drawsSideNotes: true,
      dashedConnectorIds: new Set(),
    };
  }

  private layeredShapeSize(shape: ShapeModel): { width: number; height: number } {
    return SHAPE_SIZES[shape.kind in SHAPE_SIZES ? (shape.kind as ShapeKind | "pictogram") : "rectangle"];
  }

  // Site maps and other hierarchies: a tidy tree with bus connectors.
  private planTree(kind: "sitemap" | "tree", direction: DiagramDirection, contentTop: number): FamilyPlan {
    const cell = TREE_CELL_SIZES[kind];
    const sizeOf = (shape: ShapeModel) =>
      shape.kind === "pictogram" ? { width: TREE_PICTOGRAM_WIDTH, height: PICTOGRAM_HEIGHT } : shape.kind === "diamond" ? TREE_DIAMOND_SIZE : cell;
    const shapes = [...this.shapes.values()];
    const layout = layoutTree({
      direction,
      contentOrigin: { x: this.origin.x, y: contentTop },
      shapes: shapes.map((shape) => ({ id: shape.id, ...sizeOf(shape) })),
      connectors: [...this.connectors.values()].map((connector) => ({ id: connector.id, from: connector.from, to: connector.to })),
      stackFromDepth: STACK_FROM_DEPTH[kind],
    });

    const nodes: PlannedNode[] = [];
    for (const shape of shapes) {
      const box = layout.shapeBoxes.get(shape.id);
      if (box) nodes.push(this.planShape(shape, box, TREE_SHAPE_FONT_SIZE));
    }
    const line = { kind: "line" as const, strokeStyle: "solid" as const, strokeWidth: AGENT_STROKE_WIDTH };
    for (const bus of layout.buses) {
      const parent = this.shapes.get(bus.parentId);
      if (!parent) continue;
      const busNodes = this.busNodes.get(bus.parentId) ?? { trunkNodeId: crypto.randomUUID(), barNodeId: crypto.randomUUID(), seed: createSeed() };
      this.busNodes.set(bus.parentId, busNodes);
      const parentBox = layout.shapeBoxes.get(bus.parentId)!;
      nodes.push(this.factory.polyline(busNodes.trunkNodeId, busNodes.seed, bus.trunk, { ...line, startBinding: { elementId: parent.nodeId, focus: focusFromPoint(parentBox, bus.trunk[0]) } }));
      if (bus.bar) nodes.push(this.factory.polyline(busNodes.barNodeId, busNodes.seed + 1, bus.bar, line));
    }
    return {
      nodes,
      shapeBoxes: layout.shapeBoxes,
      cellBoxes: layout.shapeBoxes,
      connectorPaths: layout.connectorPaths,
      extraTargets: new Map(),
      contentBounds: layout.contentBounds,
      drawsSideNotes: true,
      dashedConnectorIds: layout.crossLinkIds,
    };
  }

  // Mockups and screen flows: each lane is a screen in a device frame.
  private planScreens(contentTop: number): FamilyPlan {
    const device = DEVICE_SPECS[this.device ?? "phone"];
    const shapes = [...this.shapes.values()];
    const elements: MockupElement[] = shapes.map((shape) => ({
      id: shape.id,
      kind: shape.kind,
      label: shape.label,
      note: shape.note,
      color: shape.color,
      icon: shape.icon,
      nodeId: shape.nodeId,
      seed: shape.seed,
    }));
    const screenIndexOf = (id: string): number | null => {
      const shape = this.shapes.get(id);
      if (shape) return shape.laneIndex;
      const laneIndex = this.findLaneIndex(id);
      return laneIndex === -1 ? null : laneIndex;
    };
    const endpoint = (id: string): ScreenEndpoint | null => {
      const screenIndex = screenIndexOf(id);
      return screenIndex === null ? null : { screenIndex, elementId: this.shapes.has(id) ? id : null };
    };
    const connectors = [...this.connectors.values()].flatMap((connector) => {
      const from = endpoint(connector.from);
      const to = endpoint(connector.to);
      return from && to ? [{ id: connector.id, from, to }] : [];
    });
    const layout = layoutScreens({
      contentOrigin: { x: this.origin.x, y: contentTop + SCREEN_LABEL_GAP },
      device,
      screenCount: this.lanes.length,
      elements: elements.map((element) => {
        const shape = this.shapes.get(element.id)!;
        return {
          id: element.id,
          screenIndex: shape.laneIndex,
          width: elementWidth(element.kind, device),
          height: measureElement(element, device),
          isFullWidth: isFullWidth(element.kind),
          isBottomBar: isBottomBar(element.kind),
        };
      }),
      connectors,
    });

    const nodes: PlannedNode[] = [];
    const extraTargets = new Map<string, { nodeId: string; box: Box }>();
    layout.frames.forEach((frame, screenIndex) => {
      const frameNodes = this.screenFrameNodeIds.get(screenIndex) ?? { nodeId: crypto.randomUUID(), seed: createSeed() };
      this.screenFrameNodeIds.set(screenIndex, frameNodes);
      nodes.push(this.factory.shape(frameNodes.nodeId, frameNodes.seed, "rectangle", frame, { label: "", backgroundColor: TRANSPARENT_COLOR, strokeWidth: SCREEN_FRAME_STROKE_WIDTH, fontSize: SHAPE_FONT_SIZE }));
      const lane = this.lanes[screenIndex];
      if (lane.name) {
        const laneNodeId = this.laneNodeIds.get(screenIndex) ?? crypto.randomUUID();
        this.laneNodeIds.set(screenIndex, laneNodeId);
        nodes.push(this.factory.text(laneNodeId, lane.name, { x: frame.x, y: frame.y - SCREEN_LABEL_GAP }, frame.width, { fontSize: LANE_LABEL_FONT_SIZE, fontWeight: "bold", opacity: 100 }));
        extraTargets.set(lane.name.toLowerCase(), { nodeId: frameNodes.nodeId, box: frame });
      }
    });
    const context = {
      factory: this.factory,
      device,
      isFirstScreen: true,
      strokeWidth: AGENT_STROKE_WIDTH,
      fillFor: backgroundColorFor,
    };
    for (const element of elements) {
      const box = layout.elementBoxes.get(element.id);
      if (!box) continue;
      const screenIndex = this.shapes.get(element.id)!.laneIndex;
      nodes.push(...composeElement(element, box, { ...context, isFirstScreen: screenIndex === 0 }));
    }
    return {
      nodes,
      shapeBoxes: layout.elementBoxes,
      cellBoxes: layout.elementBoxes,
      connectorPaths: layout.connectorPaths,
      extraTargets,
      contentBounds: layout.contentBounds,
      drawsSideNotes: false,
      dashedConnectorIds: new Set(),
    };
  }

  // ── Pieces ────────────────────────────────────────────────────

  private planShape(shape: ShapeModel, box: Box, fontSize: number): PlannedNode {
    if (shape.kind === "pictogram" && shape.icon) return this.factory.pictogram(shape.nodeId, shape.seed, shape.icon, shape.label, box, AGENT_STROKE_WIDTH, fontSize);
    // A mockup piece drawn outside a mockup is just a labelled box.
    const shapeKind: ShapeKind = isMockupPrimitiveKind(shape.kind) || shape.kind === "pictogram" ? "rectangle" : shape.kind;
    return this.factory.shape(shape.nodeId, shape.seed, shapeKind, box, {
      label: shape.label,
      backgroundColor: backgroundColorFor(shape.color),
      strokeWidth: AGENT_STROKE_WIDTH,
      fontSize,
    });
  }

  // Everything said about a shape is one block hung just under it on a
  // short tick, so no leader ever crosses a line of text.
  private planAnnotations(shape: ShapeModel, box: Box, annotations: Annotation[], side: AnnotationSide): PlannedNode[] {
    if (annotations.length === 0) return [];
    const block = annotationBlock(annotations, side);
    const position = { x: side === "right" ? box.x + box.width / 2 + ANNOTATION_INDENT_FROM_CENTER : box.x + ANNOTATION_INDENT_FROM_EDGE, y: box.y + box.height + ANNOTATION_GAP };
    const anchor = { x: position.x + TICK_INSET, y: position.y };
    const outlineKind = outlineKindOf(shape.kind);
    // Boxes take a straight tick from their bottom edge; a curved or
    // pointed outline takes it from wherever the ray to the block lands.
    const tickTop = outlineKind === "rectangle" ? { x: anchor.x, y: box.y + box.height } : getOutlinePointToward(box, outlineKind, anchor);
    return [
      this.factory.text(shape.noteNodeId, block.text, position, block.width, { fontSize: ANNOTATION_FONT_SIZE, fontWeight: "normal", opacity: ANNOTATION_OPACITY }),
      this.factory.polyline(shape.noteLeaderNodeId, shape.noteLeaderSeed, [tickTop, anchor], {
        kind: "line",
        strokeStyle: "solid",
        strokeWidth: LEADER_STROKE_WIDTH,
        opacity: ANNOTATION_OPACITY,
        startBinding: { elementId: shape.nodeId, focus: focusFromPoint(box, tickTop) },
        endBinding: { elementId: shape.noteNodeId, focus: { x: TICK_INSET / block.width, y: 0 } },
      }),
    ];
  }

  // The label goes beside the run that leaves or enters a shape, where
  // nothing else is drawn: above a horizontal run when lanes are columns,
  // beside the vertical run into the target when lanes are rows.
  // Each label is a block of its own: it is tried beside every run of its
  // line (above or below a level run, left or right of an upright one, at
  // a few points along it) and on the line itself, and the spot that
  // covers no shape, note or other label and crosses no line wins. Ties go
  // to where a reader looks first: the run leaving the source, then level
  // runs in a left-to-right drawing. When every spot beside the line is
  // taken, the label sits on its own line with the canvas showing through
  // behind it, which breaks the line cleanly rather than striking the text.
  private placeConnectorLabels(
    labelled: LabelledConnector[],
    planned: PlannedNode[],
    groupNodeIds: Set<string>,
    connectorPaths: Map<string, Point[]>,
    direction: DiagramDirection,
    annotationSide: AnnotationSide,
  ): PlannedNode[] {
    const obstacles = planned.filter((node) => node.role !== "line" && !groupNodeIds.has(node.nodeId)).map((node) => node.box);
    // Thin line nodes (lifelines, rules, bus bars, note ticks) are runs too.
    const thinLines = planned
      .filter((node) => node.role === "line" && (node.box.width < THIN_LINE_LIMIT || node.box.height < THIN_LINE_LIMIT))
      .map((node): [Point, Point] => [
        { x: node.box.x, y: node.box.y },
        { x: node.box.x + node.box.width, y: node.box.y + node.box.height },
      ]);
    const runsOf = (path: Point[]) => path.slice(1).map((end, index): [Point, Point] => [path[index], end]);
    const allRuns = [...[...connectorPaths.values()].flatMap(runsOf), ...thinLines];
    const placedLabels: Box[] = [];
    const lineHeight = CONNECTOR_LABEL_FONT_SIZE * LINE_HEIGHT + LABEL_VERTICAL_PADDING;
    const prefersLevelRuns = direction === "right";

    return labelled.map(({ connector, label, path }) => {
      const width = labelWidthFor(label);
      const ownRuns = runsOf(path);
      const segments = segmentsOf(path);
      const candidates: LabelCandidate[] = [];
      segments.forEach((segment, segmentIndex) => {
        const runLength = segment.isHorizontal ? width : lineHeight;
        const fits = segment.length >= runLength + LABEL_RUN_MARGIN;
        // A reader's eye leaves the source first.
        const orderCost = segmentIndex === 0 ? 0 : segmentIndex === segments.length - 1 ? LABEL_LAST_RUN_COST : LABEL_MIDDLE_RUN_COST;
        const orientationCost = segment.isHorizontal === prefersLevelRuns ? 0 : LABEL_ORIENTATION_COST;
        for (const along of LABEL_ALONG_POSITIONS) {
          const anchor = { x: segment.start.x + (segment.end.x - segment.start.x) * along, y: segment.start.y + (segment.end.y - segment.start.y) * along };
          const alongCost = Math.abs(along - 0.5) * LABEL_ALONG_COST;
          const roomy = segment.length >= runLength * LABEL_ROOMY_RUN_RATIO;
          const base = orderCost + orientationCost + alongCost + (fits ? 0 : LABEL_OVERHANG_COST) + (roomy ? 0 : LABEL_TIGHT_RUN_COST);
          if (segment.isHorizontal) {
            candidates.push({ box: { x: anchor.x - width / 2, y: anchor.y - LABEL_SIDE_GAP - lineHeight, width, height: lineHeight }, cost: base, onLine: false });
            candidates.push({ box: { x: anchor.x - width / 2, y: anchor.y + LABEL_SIDE_GAP, width, height: lineHeight }, cost: base + LABEL_SECOND_SIDE_COST, onLine: false });
          } else {
            // Beside an upright run the label first tries the side the notes do not take.
            const leftFirst = annotationSide === "right" || prefersLevelRuns;
            const left = { x: anchor.x - LABEL_SIDE_GAP - width, y: anchor.y - lineHeight / 2, width, height: lineHeight };
            const right = { x: anchor.x + LABEL_SIDE_GAP, y: anchor.y - lineHeight / 2, width, height: lineHeight };
            candidates.push({ box: leftFirst ? left : right, cost: base, onLine: false });
            candidates.push({ box: leftFirst ? right : left, cost: base + LABEL_SECOND_SIDE_COST, onLine: false });
          }
          if (fits) {
            const onLineWidth = Math.min(width, estimateTextWidth(label, CONNECTOR_LABEL_FONT_SIZE) + LABEL_ON_LINE_PADDING);
            candidates.push({ box: { x: anchor.x - onLineWidth / 2, y: anchor.y - lineHeight / 2, width: onLineWidth, height: lineHeight }, cost: base + LABEL_ON_LINE_COST, onLine: true });
          }
        }
      });

      const scored = candidates.map((candidate) => {
        const padded = inflate(candidate.box, LABEL_CLEARANCE);
        let cost = candidate.cost;
        for (const obstacle of obstacles) if (boxesOverlap(padded, obstacle)) cost += LABEL_COVER_COST;
        for (const placed of placedLabels) if (boxesOverlap(padded, placed)) cost += LABEL_COVER_COST;
        for (const run of allRuns) {
          // On its own line the label is expected to sit across that line.
          if (candidate.onLine && ownRuns.some((own) => own[0] === run[0] && own[1] === run[1])) continue;
          if (runCrossesBox(run, candidate.box)) cost += LABEL_CROSSING_COST;
        }
        return { ...candidate, cost };
      });
      const best = scored.reduce((winner, candidate) => (candidate.cost < winner.cost ? candidate : winner));
      placedLabels.push(best.box);
      const knockout = best.onLine || best.cost >= LABEL_CROSSING_COST;
      return this.factory.text(connector.labelNodeId, label, { x: best.box.x, y: best.box.y + LABEL_VERTICAL_PADDING / 2 }, best.box.width, {
        fontSize: CONNECTOR_LABEL_FONT_SIZE,
        fontWeight: "normal",
        opacity: 100,
        knockout,
      });
    });
  }

  private planFrame(contentBounds: Box, memberIds: string[]): PlannedNode {
    const box = {
      x: contentBounds.x - FRAME_PADDING,
      y: contentBounds.y - FRAME_PADDING,
      width: contentBounds.width + FRAME_PADDING * 2,
      height: contentBounds.height + FRAME_PADDING * 2,
    };
    return this.factory.shape(this.frameNodeId, this.frameSeed, "rectangle", box, {
      label: "",
      backgroundColor: TRANSPARENT_COLOR,
      strokeWidth: FRAME_STROKE_WIDTH,
      strokeStyle: "solid",
      opacity: FRAME_OPACITY,
      fontSize: SHAPE_FONT_SIZE,
      artboard: { name: this.title ?? DEFAULT_ARTBOARD_NAME, memberIds, diagram: this.serialize() },
    });
  }

  private planConnector(
    connector: ConnectorModel,
    strokeStyle: StrokeStyle,
    from: { nodeId: string; box: Box },
    to: { nodeId: string; box: Box },
    path: Point[],
    curved = false,
  ): PlannedNode {
    const start = path[0];
    const end = path[path.length - 1];
    return this.factory.polyline(connector.nodeId, connector.seed, path, {
      kind: connector.kind,
      strokeStyle,
      strokeWidth: AGENT_STROKE_WIDTH,
      curved,
      startBinding: { elementId: from.nodeId, focus: focusFromPoint(from.box, start) },
      endBinding: { elementId: to.nodeId, focus: focusFromPoint(to.box, end) },
    });
  }
}
