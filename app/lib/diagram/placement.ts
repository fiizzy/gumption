import type { Point } from "../../types";
import type { Box } from "../geometry";
import type { DiagramDirection } from "./operations";

// Placement and routing for a layered diagram: shapes sit in lanes (named
// by the agent, or ranks computed from the flow) and connect to each other;
// everything else is decided here so that connected shapes sit level, lines
// cross as little as possible, and every line runs in straight horizontal
// and vertical runs through channels kept clear of shapes and side-notes.
//
// A flowchart adds three rules from the discipline: the main path (the
// spine) is pinned to the first row so it runs straight; a decision's other
// exits leave it sideways; and a loop back runs along the outer channel,
// never through the drawing.
//
// The engine works in an abstract frame: `u` runs along the lanes (left to
// right for direction "right", top to bottom for "down") and `v` across
// them. Converting back to canvas coordinates is the last step.

export interface LayoutShapeInput {
  id: string;
  laneIndex: number;
  width: number;
  height: number;
  // Height of the side-notes stacked under the shape, 0 for none.
  annotationBand: number;
  // How far a right-side note reaches past the shape's edge across the
  // lanes, 0 for none; the gap to the next row grows to keep it clear.
  annotationSpill?: number;
  // A decision: its exits to other rows leave from its sides.
  branchesSideways?: boolean;
  // How far inside the box the drawn thing is (a pictogram's picture sits
  // in the middle with its label under it). Lines meet the drawn edges;
  // only the canvas-bottom side keeps the box edge, below the label.
  portInsets?: { left: number; right: number; top: number; bottom: number };
}

export interface LayoutConnectorInput {
  id: string;
  from: string;
  to: string;
  // The label's width, when it has one: a level run between two
  // neighbouring shapes is kept long enough to carry it.
  labelWidth?: number;
}

export interface LayoutInput {
  direction: DiagramDirection;
  // Top-left of the lane area on the canvas, after the title and labels.
  contentOrigin: Point;
  // Nothing routes above/left of this along the lane axis (the title).
  leadingLimit: number;
  laneCount: number;
  defaultShapeSize: { width: number; height: number };
  shapes: LayoutShapeInput[];
  connectors: LayoutConnectorInput[];
  // The spine: kept first in its lane and on the first row.
  pinnedFirst?: ReadonlySet<string>;
  // Lines running back to an earlier lane go around the outside.
  loopsOutside?: boolean;
  // Space between lanes; the default suits swimlanes with labelled handoffs.
  laneGap?: number;
  // Which way side-notes hang from a shape's bottom; ports on that side
  // step aside from them. Defaults to right when lanes are columns.
  annotationSide?: "left" | "right";
  // Sets of shapes drawn inside one box: kept next to each other in a lane.
  groups?: string[][];
  // How much room a group's box takes around its members, so gaps next to
  // a group grow to hold its padding (and its label, on the canvas-top
  // side) plus a margin to whatever is next, and routing channels stay
  // outside the box.
  groupSpacing?: { padding: number; labelSpace: number; margin: number };
}

export interface LayoutLane {
  // Along the lane axis: x for direction "right", y for "down".
  start: number;
  extent: number;
}

export interface LayoutResult {
  shapeBoxes: Map<string, Box>;
  cellBoxes: Map<string, Box>;
  connectorPaths: Map<string, Point[]>;
  lanes: LayoutLane[];
  contentBounds: Box | null;
}

const DEFAULT_LANE_GAP = 150;
const SLOT_GAP = 56;
// Side-notes hang below a shape; the gap after it grows to hold them, and
// the routing channel sits beyond that.
const NOTE_GAP = 14;
const LANE_CHANNEL_INSET = 45;
const LANE_CHANNEL_ZONE = 66;
const ROW_CHANNEL_INSET = 20;
const ROW_CHANNEL_ZONE = 40;
const CHANNEL_TRACK_SPACING = 12;
const PORT_SPACING = 24;
// Ports on the side a note hangs from step aside from it: a little toward
// the far side when the note sits right of centre, well past it when the
// note sits at the left edge.
const NOTE_PORT_SHIFT_RIGHT = -16;
const NOTE_PORT_SHIFT_LEFT = 60;
const NOTE_SIDE_PORT_SPACING = 20;
// Ordering score weights: a same-lane line past another shape, and a
// same-lane line running backwards.
const SKIP_PENALTY = 1;
const BACKWARD_PENALTY = 2;
const GROUP_SPLIT_PENALTY = 2;
// Space a level run keeps beyond its label's width: a margin each side.
const LABEL_RUN_ROOM = 40;
const EXHAUSTIVE_ORDERING_LIMIT = 5000;
const ORDERING_SWEEPS = 4;
const ROW_PASSES = 3;
const COLLINEAR_EPSILON = 0.5;
const OUTER_ROW_GAP = -1;

interface AbstractBox {
  u: number;
  v: number;
  du: number;
  dv: number;
}

type Side = "forward" | "back" | "plusV" | "minusV";

interface ShapeState extends LayoutShapeInput {
  uSize: number;
  vSize: number;
  row: number;
  cell: AbstractBox;
  box: AbstractBox;
}

interface PortRequest {
  connectorId: string;
  end: "start" | "end";
  sortKey: number;
}

interface ChannelUse {
  connectorId: string;
  slot: "first" | "last" | "row";
  from: number;
  to: number;
}

type Route =
  | { kind: "across"; fromSide: Side; toSide: Side; laneGap: number; laneGapOut: number; rowGap: number | null }
  | { kind: "along"; rowGap: number }
  | { kind: "loop"; side: Side; laneGap: number }
  | { kind: "branch" }
  | { kind: "outside"; side: "minusV" | "plusV"; exitsViaBack: boolean; entersViaForward: boolean };

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function layoutDiagram(input: LayoutInput): LayoutResult {
  const isRight = input.direction === "right";
  const annotationSide = input.annotationSide ?? (isRight ? "right" : "left");
  const pinned = input.pinnedFirst ?? new Set<string>();
  const toReal = (u: number, v: number): Point => (isRight ? { x: u, y: v } : { x: v, y: u });
  const toRealBox = ({ u, v, du, dv }: AbstractBox): Box => (isRight ? { x: u, y: v, width: du, height: dv } : { x: v, y: u, width: dv, height: du });
  const originU = isRight ? input.contentOrigin.x : input.contentOrigin.y;
  const originV = isRight ? input.contentOrigin.y : input.contentOrigin.x;
  const defaultUSize = isRight ? input.defaultShapeSize.width : input.defaultShapeSize.height;
  const defaultVSize = isRight ? input.defaultShapeSize.height : input.defaultShapeSize.width;

  const shapes = new Map<string, ShapeState>();
  const lanes: string[][] = Array.from({ length: input.laneCount }, () => []);
  for (const shape of input.shapes) {
    if (shape.laneIndex < 0 || shape.laneIndex >= input.laneCount) continue;
    lanes[shape.laneIndex].push(shape.id);
    shapes.set(shape.id, {
      ...shape,
      uSize: isRight ? shape.width : shape.height,
      vSize: isRight ? shape.height : shape.width,
      row: 0,
      cell: { u: 0, v: 0, du: 0, dv: 0 },
      box: { u: 0, v: 0, du: 0, dv: 0 },
    });
  }
  const connectors = input.connectors.filter((connector) => shapes.has(connector.from) && shapes.has(connector.to) && connector.from !== connector.to);
  const neighbors = new Map<string, string[]>();
  for (const connector of connectors) {
    neighbors.set(connector.from, [...(neighbors.get(connector.from) ?? []), connector.to]);
    neighbors.set(connector.to, [...(neighbors.get(connector.to) ?? []), connector.from]);
  }
  const laneOf = (id: string) => shapes.get(id)!.laneIndex;

  const groups = (input.groups ?? []).map((members) => members.filter((id) => shapes.has(id))).filter((members) => members.length > 1);
  orderLanes(lanes, connectors, neighbors, laneOf, pinned, groups);
  // Lanes a spine line passes over keep their first row clear for it.
  const reservedFirstRow = new Set<number>();
  for (const connector of connectors) {
    if (!pinned.has(connector.from) || !pinned.has(connector.to)) continue;
    const [low, high] = [laneOf(connector.from), laneOf(connector.to)].sort((first, second) => first - second);
    for (let laneIndex = low + 1; laneIndex < high; laneIndex += 1) reservedFirstRow.add(laneIndex);
  }
  const rowCount = assignRows(lanes, shapes, neighbors, pinned, reservedFirstRow);

  // ── Extents and gaps ──────────────────────────────────────────
  const laneExtents = lanes.map((ids) => Math.max(defaultUSize, ...ids.map((id) => shapes.get(id)!.uSize)));
  const rowExtents = Array.from({ length: rowCount }, (_, row) =>
    Math.max(defaultVSize, ...[...shapes.values()].filter((shape) => shape.row === row).map((shape) => shape.vSize)),
  );
  // Notes hang down the canvas: across the rows in direction "right", along
  // the lanes in direction "down". The gap on that axis grows to fit them.
  const laneBands = lanes.map((ids) => Math.max(0, ...ids.map((id) => shapes.get(id)!.annotationBand)));
  const rowBands = Array.from({ length: rowCount }, (_, row) =>
    Math.max(0, ...[...shapes.values()].filter((shape) => shape.row === row).map((shape) => shape.annotationBand)),
  );
  // ── Room for group boxes ──────────────────────────────────────
  // For gap g (after lane or row g): the far padding of groups ending at g
  // and the near padding of groups starting at g + 1. The canvas-top side
  // of a group also holds its label: rows are that axis when lanes are
  // columns, lanes when lanes are rows.
  const spacing = input.groupSpacing;
  const groupRanges = spacing
    ? groups.map((members) => {
        const cells = members.map((id) => shapes.get(id)!);
        return {
          minLane: Math.min(...cells.map((shape) => shape.laneIndex)),
          maxLane: Math.max(...cells.map((shape) => shape.laneIndex)),
          minRow: Math.min(...cells.map((shape) => shape.row)),
          maxRow: Math.max(...cells.map((shape) => shape.row)),
        };
      })
    : [];
  const nearPadding = (axis: "lane" | "row", gap: number) => {
    if (!spacing) return 0;
    const startsNext = groupRanges.some((range) => (axis === "lane" ? range.minLane : range.minRow) === gap + 1);
    const labelOnAxis = axis === "row" ? isRight : !isRight;
    return startsNext ? spacing.padding + (labelOnAxis ? spacing.labelSpace : 0) : 0;
  };
  const farPadding = (axis: "lane" | "row", gap: number) => {
    if (!spacing) return 0;
    return groupRanges.some((range) => (axis === "lane" ? range.maxLane : range.maxRow) === gap) ? spacing.padding : 0;
  };
  const groupRoom = (axis: "lane" | "row", gap: number) => {
    const room = nearPadding(axis, gap) + farPadding(axis, gap);
    return room === 0 ? 0 : room + spacing!.margin;
  };

  // A labelled level run straight between neighbours needs the label's
  // width plus a margin each side: across neighbouring lanes when lanes are
  // columns, between neighbouring rows of one lane when lanes are rows.
  const labelRoom = (axis: "lane" | "row", gap: number) => {
    let room = 0;
    for (const connector of connectors) {
      if (!connector.labelWidth) continue;
      const from = shapes.get(connector.from)!;
      const to = shapes.get(connector.to)!;
      const isLevelNeighbour =
        axis === "lane"
          ? isRight && from.row === to.row && Math.min(from.laneIndex, to.laneIndex) === gap && Math.abs(from.laneIndex - to.laneIndex) === 1
          : !isRight && from.laneIndex === to.laneIndex && Math.min(from.row, to.row) === gap && Math.abs(from.row - to.row) === 1;
      if (isLevelNeighbour) room = Math.max(room, connector.labelWidth + LABEL_RUN_ROOM);
    }
    return room;
  };

  const laneSpacing = input.laneGap ?? DEFAULT_LANE_GAP;
  const gapAfterLane = (laneIndex: number) =>
    Math.max((isRight || laneBands[laneIndex] === 0 ? laneSpacing : Math.max(laneSpacing, NOTE_GAP + laneBands[laneIndex] + LANE_CHANNEL_ZONE)), labelRoom("lane", laneIndex)) + groupRoom("lane", laneIndex);
  // When lanes are rows, a right-side note reaches sideways into the next
  // row's gap; that gap grows to keep the note short of the channel.
  const rowSpills = Array.from({ length: rowCount }, (_, row) =>
    Math.max(0, ...[...shapes.values()].filter((shape) => shape.row === row).map((shape) => shape.annotationSpill ?? 0)),
  );
  const gapAfterRow = (row: number) => {
    const base = isRight
      ? rowBands[row] === 0
        ? SLOT_GAP
        : Math.max(SLOT_GAP, NOTE_GAP + rowBands[row] + ROW_CHANNEL_ZONE)
      : rowSpills[row] === 0
        ? SLOT_GAP
        : Math.max(SLOT_GAP, rowSpills[row] + NOTE_GAP + ROW_CHANNEL_INSET);
    return Math.max(base, labelRoom("row", row)) + groupRoom("row", row);
  };

  const laneStarts: number[] = [];
  let laneCursor = originU;
  laneExtents.forEach((extent, laneIndex) => {
    laneStarts.push(laneCursor);
    laneCursor += extent + gapAfterLane(laneIndex);
  });
  const rowStarts: number[] = [];
  let rowCursor = originV;
  rowExtents.forEach((extent, row) => {
    rowStarts.push(rowCursor);
    rowCursor += extent + gapAfterRow(row);
  });
  const laneEnd = (laneIndex: number) => laneStarts[laneIndex] + laneExtents[laneIndex];
  const rowEnd = (row: number) => rowStarts[row] + rowExtents[row];

  for (const shape of shapes.values()) {
    shape.cell = { u: laneStarts[shape.laneIndex], v: rowStarts[shape.row], du: laneExtents[shape.laneIndex], dv: rowExtents[shape.row] };
    shape.box = {
      u: shape.cell.u + (shape.cell.du - shape.uSize) / 2,
      v: shape.cell.v + (shape.cell.dv - shape.vSize) / 2,
      du: shape.uSize,
      dv: shape.vSize,
    };
  }

  // ── Channels ──────────────────────────────────────────────────
  // A lane gap `g` lies after lane g (g = -1 is before the first lane); a
  // row gap likewise. Channels sit toward the far end of a gap, past where
  // side-notes reach.
  // A channel next to a group runs outside the group's box.
  const laneChannelCenter = (gap: number) => {
    if (gap + 1 < lanes.length) return laneStarts[gap + 1] - nearPadding("lane", gap) - LANE_CHANNEL_INSET;
    if (gap < 0) return Math.max(input.leadingLimit, laneStarts[0] - nearPadding("lane", gap) - LANE_CHANNEL_INSET);
    return laneEnd(gap) + farPadding("lane", gap) + LANE_CHANNEL_INSET;
  };
  const rowChannelCenter = (gap: number) => {
    if (gap + 1 < rowCount) return rowStarts[gap + 1] - nearPadding("row", gap) - ROW_CHANNEL_INSET;
    if (gap < 0) return rowStarts[0] - nearPadding("row", gap) - ROW_CHANNEL_INSET;
    return rowEnd(gap) + farPadding("row", gap) + ROW_CHANNEL_INSET;
  };

  const occupied = new Set([...shapes.values()].map((shape) => `${shape.laneIndex}:${shape.row}`));
  const isFreeBetweenLanes = (fromLane: number, toLane: number, row: number) => {
    const [low, high] = fromLane < toLane ? [fromLane, toLane] : [toLane, fromLane];
    for (let laneIndex = low + 1; laneIndex < high; laneIndex += 1) if (occupied.has(`${laneIndex}:${row}`)) return false;
    return true;
  };
  const isFreeBetweenRows = (laneIndex: number, fromRow: number, toRow: number) => {
    const [low, high] = fromRow < toRow ? [fromRow, toRow] : [toRow, fromRow];
    for (let row = low + 1; row < high; row += 1) if (occupied.has(`${laneIndex}:${row}`)) return false;
    return true;
  };
  const isFreeToOuterEdge = (laneIndex: number, row: number) => isFreeBetweenRows(laneIndex, OUTER_ROW_GAP, row);

  // The cells each group covers, so a detour can avoid running through a
  // group's box: the nearest gap to the target is taken unless it would
  // cut a group, then the other gaps are tried, nearest first.
  const groupSpans = groups.map((members) => {
    const cells = members.map((id) => shapes.get(id)!);
    return {
      minLane: Math.min(...cells.map((shape) => shape.laneIndex)),
      maxLane: Math.max(...cells.map((shape) => shape.laneIndex)),
      minRow: Math.min(...cells.map((shape) => shape.row)),
      maxRow: Math.max(...cells.map((shape) => shape.row)),
    };
  });
  const crossesGroup = (fromLane: number, toLane: number, rowGap: number) => {
    const [low, high] = fromLane < toLane ? [fromLane, toLane] : [toLane, fromLane];
    return groupSpans.some((group) => group.maxLane >= low && group.minLane <= high && group.minRow <= rowGap && group.maxRow >= rowGap + 1);
  };
  const pickDetourRowGap = (from: ShapeState, to: ShapeState) => {
    const nearest = from.row <= to.row ? to.row - 1 : to.row;
    const candidates = [nearest, nearest === to.row ? to.row - 1 : to.row, OUTER_ROW_GAP, rowCount - 1];
    return candidates.find((gap) => !crossesGroup(from.laneIndex, to.laneIndex, gap)) ?? nearest;
  };
  const isFreeToFarEdge = (laneIndex: number, row: number) => isFreeBetweenRows(laneIndex, row, rowCount);

  // ── Routes ────────────────────────────────────────────────────
  const routes = new Map<string, Route>();
  const portRequests = new Map<string, Map<Side, PortRequest[]>>();
  const laneChannelUses = new Map<number, ChannelUse[]>();
  const rowChannelUses = new Map<number, ChannelUse[]>();
  const requestPort = (shapeId: string, side: Side, request: PortRequest) => {
    const sides = portRequests.get(shapeId) ?? new Map<Side, PortRequest[]>();
    sides.set(side, [...(sides.get(side) ?? []), request]);
    portRequests.set(shapeId, sides);
  };
  const useChannel = (uses: Map<number, ChannelUse[]>, gap: number, use: ChannelUse) => {
    uses.set(gap, [...(uses.get(gap) ?? []), use]);
  };
  const centerU = (shape: ShapeState) => shape.box.u + shape.box.du / 2;
  const centerV = (shape: ShapeState) => shape.box.v + shape.box.dv / 2;
  const span = (first: number, second: number) => ({ from: Math.min(first, second), to: Math.max(first, second) });

  for (const connector of connectors) {
    const from = shapes.get(connector.from)!;
    const to = shapes.get(connector.to)!;
    if (input.loopsOutside && to.laneIndex < from.laneIndex) {
      // Back around the outside. The outer side (beside the spine) is
      // preferred; if a shape stands in the way there but the far side is
      // clear, the loop goes around that side instead, so it never has to
      // cut across the spine. Otherwise: up through the lane channel, along
      // the outer row channel, and down the target's lane channel.
      const outerIsFree = isFreeToOuterEdge(from.laneIndex, from.row) && isFreeToOuterEdge(to.laneIndex, to.row);
      const farIsFree = isFreeToFarEdge(from.laneIndex, from.row) && isFreeToFarEdge(to.laneIndex, to.row);
      const side = !outerIsFree && farIsFree ? "plusV" : "minusV";
      const exitsViaBack = side === "minusV" && !isFreeToOuterEdge(from.laneIndex, from.row);
      const entersViaForward = side === "minusV" && !isFreeToOuterEdge(to.laneIndex, to.row);
      const rowGap = side === "minusV" ? OUTER_ROW_GAP : rowCount - 1;
      routes.set(connector.id, { kind: "outside", side, exitsViaBack, entersViaForward });
      requestPort(from.id, exitsViaBack ? "back" : side, { connectorId: connector.id, end: "start", sortKey: centerU(to) });
      requestPort(to.id, entersViaForward ? "forward" : side, { connectorId: connector.id, end: "end", sortKey: centerU(from) });
      const channelV = rowChannelCenter(rowGap);
      const exitU = exitsViaBack ? laneChannelCenter(from.laneIndex - 1) : centerU(from);
      const entryU = entersViaForward ? laneChannelCenter(to.laneIndex) : centerU(to);
      if (exitsViaBack) useChannel(laneChannelUses, from.laneIndex - 1, { connectorId: connector.id, slot: "first", ...span(centerV(from), channelV) });
      if (entersViaForward) useChannel(laneChannelUses, to.laneIndex, { connectorId: connector.id, slot: "last", ...span(centerV(to), channelV) });
      useChannel(rowChannelUses, rowGap, { connectorId: connector.id, slot: "row", ...span(exitU, entryU) });
      continue;
    }
    if (
      from.branchesSideways &&
      to.laneIndex > from.laneIndex &&
      to.row !== from.row &&
      isFreeBetweenRows(from.laneIndex, from.row, to.row) &&
      !occupied.has(`${from.laneIndex}:${to.row}`) &&
      isFreeBetweenLanes(from.laneIndex, to.laneIndex, to.row)
    ) {
      // A decision's side exit: sideways to the target's row, then forward
      // into it. Crosses the channels on its way rather than running along them.
      routes.set(connector.id, { kind: "branch" });
      requestPort(from.id, to.row > from.row ? "plusV" : "minusV", { connectorId: connector.id, end: "start", sortKey: centerU(to) });
      requestPort(to.id, "back", { connectorId: connector.id, end: "end", sortKey: centerV(from) });
      continue;
    }
    if (from.laneIndex !== to.laneIndex) {
      const travel = to.laneIndex > from.laneIndex ? 1 : -1;
      const fromSide: Side = travel === 1 ? "forward" : "back";
      const toSide: Side = travel === 1 ? "back" : "forward";
      const laneGap = travel === 1 ? from.laneIndex : from.laneIndex - 1;
      const laneGapOut = travel === 1 ? to.laneIndex - 1 : to.laneIndex;
      const needsDetour = !isFreeBetweenLanes(from.laneIndex, to.laneIndex, to.row);
      const rowGap = needsDetour ? pickDetourRowGap(from, to) : null;
      routes.set(connector.id, { kind: "across", fromSide, toSide, laneGap, laneGapOut, rowGap });
      requestPort(from.id, fromSide, { connectorId: connector.id, end: "start", sortKey: centerV(to) });
      requestPort(to.id, toSide, { connectorId: connector.id, end: "end", sortKey: centerV(from) });
      const fromV = centerV(from);
      const toV = centerV(to);
      if (rowGap === null) {
        useChannel(laneChannelUses, laneGap, { connectorId: connector.id, slot: "first", ...span(fromV, toV) });
      } else {
        const channelV = rowChannelCenter(rowGap);
        useChannel(laneChannelUses, laneGap, { connectorId: connector.id, slot: "first", ...span(fromV, channelV) });
        useChannel(laneChannelUses, laneGapOut, { connectorId: connector.id, slot: "last", ...span(toV, channelV) });
        const firstU = laneChannelCenter(laneGap);
        const lastU = laneChannelCenter(laneGapOut);
        useChannel(rowChannelUses, rowGap, { connectorId: connector.id, slot: "row", ...span(firstU, lastU) });
      }
      continue;
    }
    if (from.row < to.row && isFreeBetweenRows(from.laneIndex, from.row, to.row)) {
      const rowGap = to.row - 1;
      routes.set(connector.id, { kind: "along", rowGap });
      requestPort(from.id, "plusV", { connectorId: connector.id, end: "start", sortKey: centerU(to) });
      requestPort(to.id, "minusV", { connectorId: connector.id, end: "end", sortKey: centerU(from) });
      useChannel(rowChannelUses, rowGap, { connectorId: connector.id, slot: "row", ...span(centerU(from), centerU(to)) });
      continue;
    }
    // Backwards within a lane, or past other shapes: loop out through the
    // lane gap, forwards for a downstream target and back for an upstream one.
    const side: Side = from.row < to.row ? "forward" : "back";
    const laneGap = side === "forward" ? from.laneIndex : from.laneIndex - 1;
    routes.set(connector.id, { kind: "loop", side, laneGap });
    requestPort(from.id, side, { connectorId: connector.id, end: "start", sortKey: centerV(to) });
    requestPort(to.id, side, { connectorId: connector.id, end: "end", sortKey: centerV(from) });
    useChannel(laneChannelUses, laneGap, { connectorId: connector.id, slot: "first", ...span(centerV(from), centerV(to)) });
  }

  // ── Ports: spread along a side in the order of where lines go ─
  const ports = new Map<string, Point>();
  const bottomSide: Side = isRight ? "plusV" : "forward";
  const visualBoxOf = (shape: ShapeState): AbstractBox => {
    const insets = shape.portInsets;
    if (!insets) return shape.box;
    const [u0, u1, v0, v1] = isRight ? [insets.left, insets.right, insets.top, insets.bottom] : [insets.top, insets.bottom, insets.left, insets.right];
    return { u: shape.box.u + u0, v: shape.box.v + v0, du: shape.box.du - u0 - u1, dv: shape.box.dv - v0 - v1 };
  };
  for (const [shapeId, sides] of portRequests) {
    const shape = shapes.get(shapeId)!;
    const visual = visualBoxOf(shape);
    const visualCenterU = visual.u + visual.du / 2;
    const visualCenterV = visual.v + visual.dv / 2;
    for (const [side, requests] of sides) {
      const sorted = [...requests].sort((first, second) => first.sortKey - second.sortKey || first.connectorId.localeCompare(second.connectorId));
      const alongSide = side === "forward" || side === "back" ? visual.dv : visual.du;
      const isNoteSide = shape.annotationBand > 0 && side === bottomSide;
      const spacing = Math.min(isNoteSide ? NOTE_SIDE_PORT_SPACING : PORT_SPACING, alongSide / (sorted.length + 1));
      sorted.forEach((request, index) => {
        const offset = (index - (sorted.length - 1) / 2) * spacing;
        // A single line leaves from the centre, clear of a right-side note
        // already; only a spread of lines needs to move over.
        const noteShift = !isNoteSide ? 0 : annotationSide === "right" ? (sorted.length > 1 ? NOTE_PORT_SHIFT_RIGHT : 0) : NOTE_PORT_SHIFT_LEFT;
        const point =
          side === "forward"
            ? { u: side === bottomSide ? shape.box.u + shape.box.du : visual.u + visual.du, v: visualCenterV + offset + noteShift }
            : side === "back"
              ? { u: visual.u, v: visualCenterV + offset }
              : side === "plusV"
                ? { u: visualCenterU + offset + noteShift, v: side === bottomSide ? shape.box.v + shape.box.dv : visual.v + visual.dv }
                : { u: visualCenterU + offset, v: visual.v };
        ports.set(`${request.connectorId}:${request.end}`, { x: point.u, y: point.v });
      });
    }
  }

  // ── Channel tracks: lines sharing a gap and overlapping get their own ─
  const assignTracks = (uses: Map<number, ChannelUse[]>, center: (gap: number) => number) => {
    const positions = new Map<string, number>();
    for (const [gap, gapUses] of uses) {
      const sorted = [...gapUses].sort((first, second) => first.from - second.from || first.connectorId.localeCompare(second.connectorId));
      const trackEnds: number[] = [];
      const trackOf = new Map<ChannelUse, number>();
      for (const use of sorted) {
        let track = trackEnds.findIndex((end) => end < use.from);
        if (track === -1) {
          track = trackEnds.length;
          trackEnds.push(use.to);
        } else {
          trackEnds[track] = use.to;
        }
        trackOf.set(use, track);
      }
      const trackCount = trackEnds.length;
      for (const use of sorted) {
        const offset = (trackOf.get(use)! - (trackCount - 1) / 2) * CHANNEL_TRACK_SPACING;
        positions.set(`${use.connectorId}:${use.slot}`, center(gap) + offset);
      }
    }
    return positions;
  };
  const laneChannels = assignTracks(laneChannelUses, laneChannelCenter);
  const rowChannels = assignTracks(rowChannelUses, rowChannelCenter);

  // ── Paths ─────────────────────────────────────────────────────
  const connectorPaths = new Map<string, Point[]>();
  for (const connector of connectors) {
    const route = routes.get(connector.id)!;
    const start = ports.get(`${connector.id}:start`)!;
    const end = ports.get(`${connector.id}:end`)!;
    const abstract: Point[] = [start];
    if (route.kind === "across") {
      const firstU = laneChannels.get(`${connector.id}:first`)!;
      if (route.rowGap === null) {
        abstract.push({ x: firstU, y: start.y }, { x: firstU, y: end.y });
      } else {
        const channelV = rowChannels.get(`${connector.id}:row`)!;
        const lastU = laneChannels.get(`${connector.id}:last`)!;
        abstract.push({ x: firstU, y: start.y }, { x: firstU, y: channelV }, { x: lastU, y: channelV }, { x: lastU, y: end.y });
      }
    } else if (route.kind === "along") {
      const channelV = rowChannels.get(`${connector.id}:row`)!;
      abstract.push({ x: start.x, y: channelV }, { x: end.x, y: channelV });
    } else if (route.kind === "loop") {
      const channelU = laneChannels.get(`${connector.id}:first`)!;
      abstract.push({ x: channelU, y: start.y }, { x: channelU, y: end.y });
    } else if (route.kind === "branch") {
      abstract.push({ x: start.x, y: end.y });
    } else {
      const channelV = rowChannels.get(`${connector.id}:row`)!;
      if (route.exitsViaBack) {
        const firstU = laneChannels.get(`${connector.id}:first`)!;
        abstract.push({ x: firstU, y: start.y }, { x: firstU, y: channelV });
      } else {
        abstract.push({ x: start.x, y: channelV });
      }
      if (route.entersViaForward) {
        const lastU = laneChannels.get(`${connector.id}:last`)!;
        abstract.push({ x: lastU, y: channelV }, { x: lastU, y: end.y });
      } else {
        abstract.push({ x: end.x, y: channelV });
      }
    }
    abstract.push(end);
    connectorPaths.set(connector.id, simplify(abstract).map((point) => toReal(point.x, point.y)));
  }

  // ── Back to the canvas ────────────────────────────────────────
  const shapeBoxes = new Map<string, Box>();
  const cellBoxes = new Map<string, Box>();
  let contentBounds: Box | null = null;
  for (const shape of shapes.values()) {
    const cell = toRealBox(shape.cell);
    shapeBoxes.set(shape.id, toRealBox(shape.box));
    cellBoxes.set(shape.id, cell);
    contentBounds = contentBounds ? unite(contentBounds, cell) : cell;
  }
  return {
    shapeBoxes,
    cellBoxes,
    connectorPaths,
    lanes: laneStarts.map((start, laneIndex) => ({ start, extent: laneExtents[laneIndex] })),
    contentBounds,
  };
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

// Drops repeated points and the middle of any three in a line.
function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.x - point.x) < COLLINEAR_EPSILON && Math.abs(previous.y - point.y) < COLLINEAR_EPSILON) continue;
    const beforePrevious = result[result.length - 2];
    if (
      previous &&
      beforePrevious &&
      ((Math.abs(beforePrevious.x - previous.x) < COLLINEAR_EPSILON && Math.abs(previous.x - point.x) < COLLINEAR_EPSILON) ||
        (Math.abs(beforePrevious.y - previous.y) < COLLINEAR_EPSILON && Math.abs(previous.y - point.y) < COLLINEAR_EPSILON))
    ) {
      result.pop();
    }
    result.push(point);
  }
  return result;
}

// Picks the order of shapes within each lane. The score counts crossings
// between lanes, same-lane lines that skip past other shapes, and
// same-lane lines that run backwards (those need a loop out and around).
// Pinned shapes stay first in their lane and are not reordered. Diagrams
// are small, so every ordering is tried when that is affordable; bigger
// ones fall back to barycenter sweeps. Arrival order breaks ties, so a
// streaming diagram only moves when it helps.
function orderLanes(
  lanes: string[][],
  connectors: LayoutConnectorInput[],
  neighbors: Map<string, string[]>,
  laneOf: (id: string) => number,
  pinned: ReadonlySet<string>,
  groups: string[][],
) {
  const pinnedOf = lanes.map((ids) => ids.filter((id) => pinned.has(id)));
  const freeOf = lanes.map((ids) => ids.filter((id) => !pinned.has(id)));
  lanes.forEach((_, laneIndex) => (lanes[laneIndex] = [...pinnedOf[laneIndex], ...freeOf[laneIndex]]));
  const withPinned = (free: string[][]) => free.map((ids, laneIndex) => [...pinnedOf[laneIndex], ...ids]);

  const arrival = new Map<string, number>();
  lanes.forEach((ids) => ids.forEach((id, index) => arrival.set(id, index)));
  const positionsOf = (candidate: string[][]) => {
    const positions = new Map<string, number>();
    candidate.forEach((ids) => ids.forEach((id, index) => positions.set(id, index)));
    return positions;
  };
  const score = (positions: Map<string, number>) => {
    let total = 0;
    for (const connector of connectors) {
      if (laneOf(connector.from) !== laneOf(connector.to)) continue;
      const fromPosition = positions.get(connector.from)!;
      const toPosition = positions.get(connector.to)!;
      total += Math.max(0, Math.abs(fromPosition - toPosition) - 1) * SKIP_PENALTY;
      if (toPosition < fromPosition) total += BACKWARD_PENALTY;
    }
    for (let first = 0; first < connectors.length; first += 1) {
      for (let second = first + 1; second < connectors.length; second += 1) {
        const a = connectors[first];
        const b = connectors[second];
        if (laneOf(a.from) === laneOf(a.to) || laneOf(b.from) === laneOf(b.to)) continue;
        const [aLow, aHigh] = laneOf(a.from) < laneOf(a.to) ? [a.from, a.to] : [a.to, a.from];
        const [bLow, bHigh] = laneOf(b.from) < laneOf(b.to) ? [b.from, b.to] : [b.to, b.from];
        if (laneOf(aLow) !== laneOf(bLow) || laneOf(aHigh) !== laneOf(bHigh)) continue;
        if ((positions.get(aLow)! - positions.get(bLow)!) * (positions.get(aHigh)! - positions.get(bHigh)!) < 0) total += 1;
      }
    }
    // Members of a group in the same lane want to be neighbours: every
    // stranger between them costs.
    for (const members of groups) {
      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
        const inLane = members.filter((id) => laneOf(id) === laneIndex).map((id) => positions.get(id)!);
        if (inLane.length < 2) continue;
        total += (Math.max(...inLane) - Math.min(...inLane) + 1 - inLane.length) * GROUP_SPLIT_PENALTY;
      }
    }
    return total;
  };
  const displacement = (positions: Map<string, number>) => {
    let total = 0;
    for (const [id, position] of positions) total += Math.abs(position - arrival.get(id)!);
    return total;
  };

  let best = lanes.map((ids) => [...ids]);
  let bestScore = score(positionsOf(best));
  let bestDisplacement = 0;
  if (bestScore === 0) return;
  const consider = (candidate: string[][]) => {
    const positions = positionsOf(candidate);
    const candidateScore = score(positions);
    if (candidateScore > bestScore) return;
    const candidateDisplacement = displacement(positions);
    if (candidateScore < bestScore || candidateDisplacement < bestDisplacement) {
      best = candidate.map((ids) => [...ids]);
      bestScore = candidateScore;
      bestDisplacement = candidateDisplacement;
    }
  };

  const orderingCount = freeOf.reduce((count, ids) => count * factorial(ids.length), 1);
  if (orderingCount <= EXHAUSTIVE_ORDERING_LIMIT) {
    const candidate = freeOf.map((ids) => [...ids]);
    const visitLane = (laneIndex: number) => {
      if (laneIndex === lanes.length) {
        consider(withPinned(candidate));
        return;
      }
      for (const permutation of permutations(freeOf[laneIndex])) {
        candidate[laneIndex] = permutation;
        visitLane(laneIndex + 1);
        if (bestScore === 0 && bestDisplacement === 0) return;
      }
    };
    visitLane(0);
  } else {
    const sweep = (laneIndex: number) => {
      const positions = positionsOf(lanes);
      const barycenter = (id: string) => {
        const others = (neighbors.get(id) ?? []).map((other) => positions.get(other)!);
        return others.length > 0 ? others.reduce((total, value) => total + value, 0) / others.length : positions.get(id)!;
      };
      const free = lanes[laneIndex]
        .filter((id) => !pinned.has(id))
        .map((id) => ({ id, key: barycenter(id), index: positions.get(id)! }))
        .sort((first, second) => first.key - second.key || first.index - second.index)
        .map(({ id }) => id);
      lanes[laneIndex] = [...pinnedOf[laneIndex], ...free];
    };
    for (let round = 0; round < ORDERING_SWEEPS; round += 1) {
      for (let laneIndex = 1; laneIndex < lanes.length; laneIndex += 1) sweep(laneIndex);
      for (let laneIndex = lanes.length - 2; laneIndex >= 0; laneIndex -= 1) sweep(laneIndex);
      consider(lanes);
      if (bestScore === 0) break;
    }
  }
  best.forEach((ids, laneIndex) => (lanes[laneIndex] = ids));
}

function factorial(count: number): number {
  let result = 1;
  for (let value = 2; value <= count; value += 1) result *= value;
  return result;
}

function* permutations<Item>(items: Item[]): Generator<Item[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [items[index], ...tail];
  }
}

// Gives each shape a row so that, lane order permitting, it sits level
// with the median of what it connects to in other lanes. Pinned shapes
// take the first row, and lanes a pinned line passes over leave it empty.
// Empty rows are squeezed out afterwards. Returns the number of rows.
function assignRows(
  lanes: string[][],
  shapes: Map<string, ShapeState>,
  neighbors: Map<string, string[]>,
  pinned: ReadonlySet<string>,
  reservedFirstRow: ReadonlySet<number>,
): number {
  const rows = new Map<string, number>();
  const place = (laneIndex: number) => {
    let nextFree = reservedFirstRow.has(laneIndex) ? 1 : 0;
    for (const id of lanes[laneIndex]) {
      const placedNeighborRows = (neighbors.get(id) ?? [])
        .filter((other) => shapes.get(other)!.laneIndex !== laneIndex && rows.has(other))
        .map((other) => rows.get(other)!);
      const desired = pinned.has(id) ? 0 : placedNeighborRows.length > 0 ? Math.floor(median(placedNeighborRows)) : nextFree;
      const row = Math.max(desired, nextFree);
      rows.set(id, row);
      nextFree = row + 1;
    }
  };
  for (let pass = 0; pass < ROW_PASSES; pass += 1) {
    if (pass % 2 === 0) for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) place(laneIndex);
    else for (let laneIndex = lanes.length - 1; laneIndex >= 0; laneIndex -= 1) place(laneIndex);
  }
  const usedRows = [...new Set(rows.values())].sort((first, second) => first - second);
  const compact = new Map(usedRows.map((row, index) => [row, index]));
  for (const [id, row] of rows) shapes.get(id)!.row = compact.get(row)!;
  return usedRows.length;
}
