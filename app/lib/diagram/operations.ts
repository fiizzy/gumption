import type { LineKind, ShapeKind, StrokeStyle } from "../../types";
import { isPictogramName, type PictogramName } from "../pictograms";

// The streaming protocol the whiteboard agent speaks: one JSON object per
// line, applied to the canvas the moment the line is complete. Everything
// here is deliberately forgiving about optional fields and strict about
// the ones a drawing can't do without.

export type DiagramDirection = "down" | "right";

export const DIAGRAM_COLORS = ["red", "green", "blue", "yellow", "violet"] as const;
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];

// The geometric shapes plus a named picture from the pictogram library.
export type DiagramShapeKind = ShapeKind | "pictogram";

export interface PlanOperation {
  op: "plan";
  title: string | null;
  direction: DiagramDirection;
  lanes: string[];
}

export interface ShapeOperation {
  op: "shape";
  id: string;
  kind: DiagramShapeKind;
  icon: PictogramName | null;
  label: string;
  lane: string | null;
  color: DiagramColor | null;
  note: string | null;
}

export interface ConnectOperation {
  op: "connect";
  id: string;
  from: string;
  to: string;
  label: string | null;
  kind: LineKind;
  strokeStyle: StrokeStyle;
}

export interface UpdateOperation {
  op: "update";
  id: string;
  label?: string;
  lane?: string;
  color?: DiagramColor | null;
  kind?: DiagramShapeKind;
  icon?: PictogramName | null;
  note?: string | null;
}

export interface RemoveOperation {
  op: "remove";
  id: string;
}

export interface NoteOperation {
  op: "note";
  id: string;
  text: string;
  near: string | null;
}

export interface DoneOperation {
  op: "done";
  summary: string | null;
}

export type DiagramOperation =
  | PlanOperation
  | ShapeOperation
  | ConnectOperation
  | UpdateOperation
  | RemoveOperation
  | NoteOperation
  | DoneOperation;

export type ParsedOperationLine =
  | { kind: "operation"; operation: DiagramOperation }
  | { kind: "invalid"; reason: string }
  // Prose, blank lines and code fences: not part of the protocol.
  | { kind: "ignored" };

const SHAPE_KINDS: readonly DiagramShapeKind[] = ["rectangle", "ellipse", "diamond", "pictogram"];
const LINE_KINDS: readonly LineKind[] = ["line", "arrow"];
const CONNECTOR_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"];
const DIRECTIONS: readonly DiagramDirection[] = ["down", "right"];
const MAX_LABEL_LENGTH = 200;
const MAX_TEXT_LENGTH = 600;
const CODE_FENCE_PREFIX = "```";

let generatedIdCounter = 0;
function generateId(prefix: string): string {
  generatedIdCounter += 1;
  return `${prefix}-${generatedIdCounter}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readEnum<Value extends string>(value: unknown, allowed: readonly Value[], fallback: Value): Value {
  return typeof value === "string" && allowed.includes(value as Value) ? (value as Value) : fallback;
}

function readOptionalEnum<Value extends string>(value: unknown, allowed: readonly Value[]): Value | null {
  return typeof value === "string" && allowed.includes(value as Value) ? (value as Value) : null;
}

function parseOperation(value: unknown): ParsedOperationLine {
  if (!isRecord(value) || typeof value.op !== "string") return { kind: "invalid", reason: "missing op" };
  switch (value.op) {
    case "plan":
      return {
        kind: "operation",
        operation: {
          op: "plan",
          title: readText(value.title, MAX_LABEL_LENGTH),
          direction: readEnum(value.direction, DIRECTIONS, "right"),
          lanes: Array.isArray(value.lanes)
            ? value.lanes.flatMap((lane) => {
                const name = readText(lane, MAX_LABEL_LENGTH);
                return name ? [name] : [];
              })
            : [],
        },
      };
    case "shape": {
      const id = readId(value.id);
      const label = readText(value.label, MAX_LABEL_LENGTH);
      if (!id) return { kind: "invalid", reason: "shape without an id" };
      if (!label) return { kind: "invalid", reason: `shape "${id}" without a label` };
      const kind = readEnum(value.kind, SHAPE_KINDS, "rectangle");
      const icon = isPictogramName(value.icon) ? value.icon : null;
      return {
        kind: "operation",
        operation: {
          op: "shape",
          id,
          // A pictogram the library does not have falls back to a plain box.
          kind: kind === "pictogram" && !icon ? "rectangle" : kind,
          icon,
          label,
          lane: readText(value.lane, MAX_LABEL_LENGTH),
          color: readOptionalEnum(value.color, DIAGRAM_COLORS),
          note: readText(value.note, MAX_TEXT_LENGTH),
        },
      };
    }
    case "connect": {
      const from = readId(value.from);
      const to = readId(value.to);
      if (!from || !to) return { kind: "invalid", reason: "connect without from and to" };
      return {
        kind: "operation",
        operation: {
          op: "connect",
          id: readId(value.id) ?? generateId("connect"),
          from,
          to,
          label: readText(value.label, MAX_LABEL_LENGTH),
          kind: readEnum(value.kind, LINE_KINDS, "arrow"),
          strokeStyle: readEnum(value.style, CONNECTOR_STYLES, "solid"),
        },
      };
    }
    case "update": {
      const id = readId(value.id);
      if (!id) return { kind: "invalid", reason: "update without an id" };
      const operation: UpdateOperation = { op: "update", id };
      const label = readText(value.label, MAX_LABEL_LENGTH);
      if (label) operation.label = label;
      const lane = readText(value.lane, MAX_LABEL_LENGTH);
      if (lane) operation.lane = lane;
      if ("color" in value) operation.color = readOptionalEnum(value.color, DIAGRAM_COLORS);
      const kind = readOptionalEnum(value.kind, SHAPE_KINDS);
      const icon = isPictogramName(value.icon) ? value.icon : null;
      if (kind === "pictogram" && icon) operation.kind = kind;
      else if (kind && kind !== "pictogram") operation.kind = kind;
      if (icon) operation.icon = icon;
      if ("note" in value) operation.note = readText(value.note, MAX_TEXT_LENGTH);
      return { kind: "operation", operation };
    }
    case "remove": {
      const id = readId(value.id);
      if (!id) return { kind: "invalid", reason: "remove without an id" };
      return { kind: "operation", operation: { op: "remove", id } };
    }
    case "note": {
      const text = readText(value.text, MAX_TEXT_LENGTH);
      if (!text) return { kind: "invalid", reason: "note without text" };
      return {
        kind: "operation",
        operation: { op: "note", id: readId(value.id) ?? generateId("note"), text, near: readId(value.near) },
      };
    }
    case "done":
      return { kind: "operation", operation: { op: "done", summary: readText(value.summary, MAX_TEXT_LENGTH) } };
    default:
      return { kind: "invalid", reason: `unknown op "${value.op}"` };
  }
}

// A line may also hold a JSON array of operations: some replies batch them.
export function parseOperationLine(line: string): ParsedOperationLine[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(CODE_FENCE_PREFIX)) return [{ kind: "ignored" }];
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [{ kind: "ignored" }];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [{ kind: "invalid", reason: "not valid JSON" }];
  }
  return Array.isArray(parsed) ? parsed.map(parseOperation) : [parseOperation(parsed)];
}

// Collects streamed text and hands back whole lines as they complete.
export class OperationLineBuffer {
  private pending = "";

  push(delta: string): string[] {
    this.pending += delta;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    return lines;
  }

  flush(): string[] {
    const remainder = this.pending;
    this.pending = "";
    return remainder.trim() ? [remainder] : [];
  }
}
