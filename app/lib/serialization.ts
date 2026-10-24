import type {
  Binding,
  CanvasNode,
  ImageElementNode,
  LineElementNode,
  PictogramElementNode,
  Point,
  ShapeElementNode,
  TextElementNode,
  Viewport,
} from "../types";
import { normalizeChatMessages, type ChatMessage } from "./chat";
import { DEFAULT_ELEMENT_STYLE, MAX_FONT_SIZE, MIN_FONT_SIZE, createSeed } from "./elementStyle";
import { isPictogramName } from "./pictograms";

// The on-disk identifiers predate the whiteboard and stay as they are so
// every file and project saved so far still opens.
export const CANVAS_DOCUMENT_TYPE = "canvas-chat";
export const CLIPBOARD_PAYLOAD_TYPE = "canvas-chat/clipboard";
export const CANVAS_DOCUMENT_VERSION = 1;
export const CANVAS_FILE_EXTENSION = "canvaschat";

const ELEMENT_DEFAULT_SIZE = 100;
const MIN_ELEMENT_SIZE = 1;
const MAX_ELEMENT_SIZE = 100_000;
const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 32;
const MAX_OPACITY = 100;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

// Chat cards from before the whiteboard become plain notes at the same
// spot, so nothing anyone wrote is lost.
const LEGACY_CONVERSATION_WIDTH = 380;
const LEGACY_CONVERSATION_FONT_SIZE = 14;

export interface CanvasDocument {
  type: typeof CANVAS_DOCUMENT_TYPE;
  version: number;
  nodes: CanvasNode[];
  viewport: Viewport | null;
  // The conversation beside this canvas; older files have none.
  messages: ChatMessage[];
}

interface ClipboardPayload {
  type: typeof CLIPBOARD_PAYLOAD_TYPE;
  nodes: CanvasNode[];
}

// Drops xyflow's runtime-only fields (selected, measured, dragging, ...)
// so they never leak into saved files or the clipboard.
export function toPersistedNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map(
    (node) =>
      ({
        id: node.id,
        type: node.type,
        position: { x: node.position.x, y: node.position.y },
        ...(node.zIndex !== undefined && { zIndex: node.zIndex }),
        data: node.data,
      }) as CanvasNode,
  );
}

export function createCanvasDocument(nodes: CanvasNode[], viewport: Viewport | null, messages: ChatMessage[] = []): CanvasDocument {
  return {
    type: CANVAS_DOCUMENT_TYPE,
    version: CANVAS_DOCUMENT_VERSION,
    nodes: toPersistedNodes(nodes),
    viewport,
    messages,
  };
}

export function createClipboardText(nodes: CanvasNode[]): string {
  const payload: ClipboardPayload = { type: CLIPBOARD_PAYLOAD_TYPE, nodes: toPersistedNodes(nodes) };
  return JSON.stringify(payload);
}

export function parseClipboardText(text: string): CanvasNode[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.type !== CLIPBOARD_PAYLOAD_TYPE || !Array.isArray(parsed.nodes)) return null;
  return normalizeNodes(parsed.nodes);
}

export function parseCanvasDocument(value: unknown): CanvasDocument {
  if (!isRecord(value) || value.type !== CANVAS_DOCUMENT_TYPE || !Array.isArray(value.nodes)) {
    throw new Error("This file isn't a Gumption whiteboard.");
  }
  const version = readNumber(value.version, CANVAS_DOCUMENT_VERSION);
  if (version > CANVAS_DOCUMENT_VERSION) {
    throw new Error("This whiteboard was saved by a newer version of Gumption.");
  }
  return {
    type: CANVAS_DOCUMENT_TYPE,
    version: CANVAS_DOCUMENT_VERSION,
    nodes: normalizeNodes(value.nodes),
    viewport: readViewport(value.viewport),
    messages: normalizeChatMessages(value.messages),
  };
}

export function normalizeNodes(rawNodes: unknown[]): CanvasNode[] {
  const seenIds = new Set<string>();
  const nodes: CanvasNode[] = [];
  for (const rawNode of rawNodes) {
    const node = normalizeNode(rawNode);
    if (!node || seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    nodes.push(node);
  }
  return nodes;
}

function normalizeNode(rawNode: unknown): CanvasNode | null {
  if (!isRecord(rawNode) || typeof rawNode.id !== "string" || !isRecord(rawNode.data)) return null;
  const position = readPoint(rawNode.position);
  if (!position) return null;
  const base = {
    id: rawNode.id,
    position,
    ...(typeof rawNode.zIndex === "number" && Number.isFinite(rawNode.zIndex) && { zIndex: rawNode.zIndex }),
  };
  const data = rawNode.data;
  const style = DEFAULT_ELEMENT_STYLE;

  switch (rawNode.type) {
    case "conversation": {
      const prompt = readString(data.prompt, "").trim();
      const response = readString(data.response, "").trim();
      const text = [prompt, response].filter(Boolean).join("\n\n");
      if (!text) return null;
      const node: TextElementNode = {
        ...base,
        type: "textElement",
        data: {
          text,
          width: readSize(data.width, LEGACY_CONVERSATION_WIDTH),
          strokeColor: style.strokeColor,
          fontSize: LEGACY_CONVERSATION_FONT_SIZE,
          fontFamily: "sans",
          fontWeight: "normal",
          opacity: style.opacity,
        },
      };
      return node;
    }
    case "textElement": {
      const node: TextElementNode = {
        ...base,
        type: "textElement",
        data: {
          text: readString(data.text, ""),
          width: readSize(data.width, ELEMENT_DEFAULT_SIZE),
          strokeColor: readString(data.strokeColor, style.strokeColor),
          fontSize: readNumber(data.fontSize, style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
          fontFamily: readEnum(data.fontFamily, ["casual", "hand", "sans", "serif", "mono"], style.fontFamily),
          fontWeight: readEnum(data.fontWeight, ["normal", "bold"], style.fontWeight),
          opacity: readNumber(data.opacity, style.opacity, 0, MAX_OPACITY),
        },
      };
      return node;
    }
    case "shapeElement": {
      const node: ShapeElementNode = {
        ...base,
        type: "shapeElement",
        data: {
          shapeKind: readEnum(data.shapeKind, ["rectangle", "ellipse", "diamond"], "rectangle"),
          width: readSize(data.width, ELEMENT_DEFAULT_SIZE),
          height: readSize(data.height, ELEMENT_DEFAULT_SIZE),
          seed: readNumber(data.seed, createSeed()),
          label: readString(data.label, ""),
          note: readString(data.note, ""),
          strokeColor: readString(data.strokeColor, style.strokeColor),
          backgroundColor: readString(data.backgroundColor, style.backgroundColor),
          fillStyle: readEnum(data.fillStyle, ["hachure", "cross-hatch", "solid"], style.fillStyle),
          strokeWidth: readNumber(data.strokeWidth, style.strokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH),
          strokeStyle: readEnum(data.strokeStyle, ["solid", "dashed", "dotted"], style.strokeStyle),
          sloppiness: readEnum(data.sloppiness, ["clean", "sketchy"], style.sloppiness),
          opacity: readNumber(data.opacity, style.opacity, 0, MAX_OPACITY),
          fontSize: readNumber(data.fontSize, style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
          fontFamily: readEnum(data.fontFamily, ["casual", "hand", "sans", "serif", "mono"], style.fontFamily),
        },
      };
      return node;
    }
    case "lineElement": {
      const points = Array.isArray(data.points) ? data.points.map(readPoint).filter((point): point is Point => point !== null) : [];
      if (points.length < 2) return null;
      const node: LineElementNode = {
        ...base,
        type: "lineElement",
        data: {
          kind: readEnum(data.kind, ["line", "arrow"], "line"),
          points,
          seed: readNumber(data.seed, createSeed()),
          startBinding: readBinding(data.startBinding),
          endBinding: readBinding(data.endBinding),
          strokeColor: readString(data.strokeColor, style.strokeColor),
          strokeWidth: readNumber(data.strokeWidth, style.strokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH),
          strokeStyle: readEnum(data.strokeStyle, ["solid", "dashed", "dotted"], style.strokeStyle),
          sloppiness: readEnum(data.sloppiness, ["clean", "sketchy"], style.sloppiness),
          opacity: readNumber(data.opacity, style.opacity, 0, MAX_OPACITY),
        },
      };
      return node;
    }
    case "pictogramElement": {
      if (!isPictogramName(data.icon)) return null;
      const node: PictogramElementNode = {
        ...base,
        type: "pictogramElement",
        data: {
          icon: data.icon,
          width: readSize(data.width, ELEMENT_DEFAULT_SIZE),
          height: readSize(data.height, ELEMENT_DEFAULT_SIZE),
          seed: readNumber(data.seed, createSeed()),
          label: readString(data.label, ""),
          strokeColor: readString(data.strokeColor, style.strokeColor),
          strokeWidth: readNumber(data.strokeWidth, style.strokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH),
          sloppiness: readEnum(data.sloppiness, ["clean", "sketchy"], style.sloppiness),
          opacity: readNumber(data.opacity, style.opacity, 0, MAX_OPACITY),
          fontSize: readNumber(data.fontSize, style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
          fontFamily: readEnum(data.fontFamily, ["casual", "hand", "sans", "serif", "mono"], style.fontFamily),
        },
      };
      return node;
    }
    case "imageElement": {
      if (typeof data.src !== "string" || !data.src.startsWith("data:image/")) return null;
      const node: ImageElementNode = {
        ...base,
        type: "imageElement",
        data: {
          src: data.src,
          width: readSize(data.width, ELEMENT_DEFAULT_SIZE),
          height: readSize(data.height, ELEMENT_DEFAULT_SIZE),
          opacity: readNumber(data.opacity, style.opacity, 0, MAX_OPACITY),
        },
      };
      return node;
    }
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readSize(value: unknown, fallback: number): number {
  return readNumber(value, fallback, MIN_ELEMENT_SIZE, MAX_ELEMENT_SIZE);
}

function readEnum<Value extends string>(value: unknown, allowed: readonly Value[], fallback: Value): Value {
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function readPoint(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function readBinding(value: unknown): Binding | null {
  if (!isRecord(value) || typeof value.elementId !== "string") return null;
  const focus = readPoint(value.focus);
  return focus ? { elementId: value.elementId, focus } : null;
}

function readViewport(value: unknown): Viewport | null {
  const point = readPoint(value);
  if (!point || !isRecord(value)) return null;
  return { ...point, zoom: readNumber(value.zoom, 1, MIN_ZOOM, MAX_ZOOM) };
}
