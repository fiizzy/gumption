import type {
  Binding,
  CanvasNode,
  ConversationNode,
  ImageElementNode,
  LineElementNode,
  Point,
  ShapeElementNode,
  TextElementNode,
  Viewport,
} from "../types";
import { DEFAULT_COLOR } from "./color";
import { DEFAULT_TERMINAL_THEME, TERMINAL_THEME_VALUES } from "./terminalThemes";
import { DEFAULT_ELEMENT_STYLE, MAX_FONT_SIZE, MIN_FONT_SIZE, createSeed } from "./elementStyle";

export const CANVAS_DOCUMENT_TYPE = "canvas-chat";
export const CLIPBOARD_PAYLOAD_TYPE = "canvas-chat/clipboard";
export const CANVAS_DOCUMENT_VERSION = 1;
export const CANVAS_FILE_EXTENSION = "canvaschat";

export const INTERRUPTED_RESPONSE_MESSAGE =
  "⚠ This response was interrupted before it finished. Branch from the parent to ask again.";

const CONVERSATION_DEFAULT_WIDTH = 380;
const CONVERSATION_DEFAULT_HEIGHT = 260;
const ELEMENT_DEFAULT_SIZE = 100;
const MIN_ELEMENT_SIZE = 1;
const MAX_ELEMENT_SIZE = 100_000;
const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 32;
const MAX_OPACITY = 100;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

export interface CanvasDocument {
  type: typeof CANVAS_DOCUMENT_TYPE;
  version: number;
  nodes: CanvasNode[];
  viewport: Viewport | null;
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

export function createCanvasDocument(nodes: CanvasNode[], viewport: Viewport | null): CanvasDocument {
  return {
    type: CANVAS_DOCUMENT_TYPE,
    version: CANVAS_DOCUMENT_VERSION,
    nodes: toPersistedNodes(nodes),
    viewport,
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

interface ParseOptions {
  // Chat nodes saved mid-generation come back as "loading"; unless their
  // request is still in flight in this session, the reply is never coming.
  isRequestInFlight?: (nodeId: string) => boolean;
}

export function parseCanvasDocument(value: unknown, options: ParseOptions = {}): CanvasDocument {
  if (!isRecord(value) || value.type !== CANVAS_DOCUMENT_TYPE || !Array.isArray(value.nodes)) {
    throw new Error("This file isn't a Canvas Chat document.");
  }
  const version = readNumber(value.version, CANVAS_DOCUMENT_VERSION);
  if (version > CANVAS_DOCUMENT_VERSION) {
    throw new Error("This document was saved by a newer version of Canvas Chat.");
  }
  return {
    type: CANVAS_DOCUMENT_TYPE,
    version: CANVAS_DOCUMENT_VERSION,
    nodes: normalizeNodes(value.nodes, options),
    viewport: readViewport(value.viewport),
  };
}

export function normalizeNodes(rawNodes: unknown[], options: ParseOptions = {}): CanvasNode[] {
  const seenIds = new Set<string>();
  const nodes: CanvasNode[] = [];
  for (const rawNode of rawNodes) {
    const node = normalizeNode(rawNode, options);
    if (!node || seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    nodes.push(node);
  }
  return nodes;
}

function normalizeNode(rawNode: unknown, options: ParseOptions): CanvasNode | null {
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
      const isLoading = data.loading === true && !!options.isRequestInFlight?.(rawNode.id);
      const wasInterrupted = data.loading === true && !isLoading;
      const node: ConversationNode = {
        ...base,
        type: "conversation",
        data: {
          prompt: readString(data.prompt, ""),
          response: wasInterrupted ? INTERRUPTED_RESPONSE_MESSAGE : readString(data.response, ""),
          responseStyle: readEnum(data.responseStyle, ["concise", "detailed"], "concise"),
          loading: isLoading,
          minimized: data.minimized === true,
          color: readString(data.color, DEFAULT_COLOR),
          terminalTheme: readEnum(data.terminalTheme, TERMINAL_THEME_VALUES, DEFAULT_TERMINAL_THEME),
          branchParentId: typeof data.branchParentId === "string" ? data.branchParentId : null,
          width: readSize(data.width, CONVERSATION_DEFAULT_WIDTH),
          height: readSize(data.height, CONVERSATION_DEFAULT_HEIGHT),
          isHeightPinned: data.isHeightPinned === true,
          isThreadStacked: data.isThreadStacked === true,
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
      const points = Array.isArray(data.points) ? data.points.map(readPoint) : [];
      if (points.length !== 2 || !points[0] || !points[1]) return null;
      const node: LineElementNode = {
        ...base,
        type: "lineElement",
        data: {
          kind: readEnum(data.kind, ["line", "arrow"], "line"),
          points: [points[0], points[1]],
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
