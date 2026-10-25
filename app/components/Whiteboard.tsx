"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ConnectionMode,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type NodeChange,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faXmark } from "@fortawesome/free-solid-svg-icons";
import ShapeElementComponent from "./ShapeElement";
import TextElementComponent from "./TextElement";
import LineElementComponent from "./LineElement";
import ImageElementComponent from "./ImageElement";
import PictogramElementComponent from "./PictogramElement";
import PictogramPanel from "./PictogramPanel";
import CanvasEmptyState from "./CanvasEmptyState";
import WorkingMarker, { type WorkingMarkerPhase } from "./WorkingMarker";
import Toolbox from "./Toolbox";
import type { DrawingMode, Mode } from "./Toolbox";
import StylePanel, { type StyleSource } from "./StylePanel";
import MainMenu from "./MainMenu";
import ConfirmDialog, { type ConfirmRequest } from "./ConfirmDialog";
import ExportDialog, { type ExportSettings } from "./ExportDialog";
import ShortcutsDialog from "./ShortcutsDialog";
import { ANCHOR_HANDLE_PREFIX } from "./AnchorHandles";
import ChatPanel, { CHAT_PANEL_WIDTH, CHAT_PANEL_COLLAPSED_WIDTH } from "./ChatPanel";
import {
  DEFAULT_ELEMENT_STYLE,
  IMAGE_STYLE_KEYS,
  LINE_STYLE_KEYS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SHAPE_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  createSeed,
  pickStyle,
} from "../lib/elementStyle";
import {
  ANCHOR_FOCUS,
  detachLineBindings,
  findBindingAt,
  findTopmostShapeAt,
  getBoxesBounds,
  getLinePoints,
  getLineGeometry,
  getNodeBox,
  pointFromFocus,
  resolveLineBindings,
  snapAngle,
  sortTopmostFirst,
  type AnchorSide,
  type Box,
  type BindingCandidate,
} from "../lib/geometry";
import { useCanvasHistory } from "../lib/useCanvasHistory";
import { useDiagramSession, type DiagramSessionStatus } from "../lib/useDiagramSession";
import { canCheckClaudeCode, checkClaudeCode, type ClaudeCodeStatus } from "../lib/claudeCode";
import { modelArgumentFor, readStoredModelChoice, writeStoredModelChoice, type ModelChoice } from "../lib/modelPreference";
import { chosenKindFor, readStoredKindChoice, writeStoredKindChoice, type DiagramKindChoice } from "../lib/kindPreference";
import { carryArtboardMembers, findArtboard, findEditTarget, withArtboardMembers, withoutArtboard, type EditTarget } from "../lib/artboards";
import { FRAME_PADDING, type DiagramChange } from "../lib/diagram/builder";
import { toChatTurns, type ChatMessage } from "../lib/chat";
import { isPictogramName, type PictogramName } from "../lib/pictograms";
import { DEFAULT_PROJECT_TITLE, useProjects } from "../lib/useProjects";
import {
  CANVAS_FILE_EXTENSION,
  createCanvasDocument,
  createClipboardText,
  parseCanvasDocument,
  parseClipboardText,
  type CanvasDocument,
} from "../lib/serialization";
import { cloneNodes } from "../lib/cloneNodes";
import { isImageFile, loadImageFile } from "../lib/imageFiles";
import { openTextFile, pickFiles, saveFile, type FileTypeFilter } from "../lib/fileAccess";
import { renderCanvasImage } from "../lib/exportImage";
import type {
  Binding,
  CanvasNode,
  ElementStyle,
  HydratedCanvasNode,
  ImageElementNode,
  PictogramElementNode,
  LineElementNode,
  LineKind,
  Point,
  ResizeHandleKind,
  ShapeElementNode,
  ShapeKind,
  TextElementNode,
} from "../types";
import { invoke } from "@tauri-apps/api/core";

const SCALE_MIN = 0.1;
const SCALE_MAX = 4;
const SHAPE_DEFAULT_SIZE = 140;
const SHAPE_MIN_DRAG_SIZE = 8;
const TOP_PANEL_CLEARANCE = 64; // clears the floating toolbox (top-3 + its own height)
const STYLE_PANEL_GUTTER = 16;
const DRAG_COMMIT_THRESHOLD_PX = 4; // screen px — below this a drag is treated as a click
const SNAP_RADIUS_PX = 20; // screen px — how close an endpoint must be to bind/snap to an element
const TEXT_DEFAULT_WIDTH = 240;
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;
const DUPLICATE_OFFSET = 10;
const IMAGE_MAX_INITIAL_SIZE = 480;
const IMAGE_STACK_OFFSET = 24;
const VIEWPORT_ANIMATION_MS = 500;
const ZOOM_ANIMATION_MS = 200;
const PAN_ON_SCROLL_SPEED = 1;
// Keeps fitted content clear of the floating toolbar (top) and command bar
// (bottom), which sit over the canvas.
const FIT_VIEW_PADDING = { top: "88px", bottom: "140px", left: "40px", right: "40px" } as const;
// The chat panel floats over the left of the canvas, so the area that
// counts as visible for fitting, following and centring starts past it.
const CHAT_PANEL_GUTTER = 40;
const FIT_SELECTION_MAX_ZOOM = 2;
const NOTICE_DURATION_MS = 4000;
const THEME_STORAGE_KEY = "canvas-chat:theme";
const EMPTY_ID_SET: ReadonlySet<string> = new Set();
const NO_EDGES: Edge[] = [];

// Where a new diagram starts: beside whatever is already drawn, otherwise
// a little up and left of the viewport centre so it grows into view.
const DIAGRAM_SPACING = 160;
const DIAGRAM_ORIGIN_OFFSET = { x: 320, y: 220 } as const;
// The working sign sits above the artboard's top-left corner, clear of
// the artboard's name tag.
const WORKING_MARKER_LIFT = 72;
// The area the view jumps to the moment a request is sent: room for the
// sign, the title, the lane labels and the first row, before any of it
// has arrived.
const INITIAL_FOLLOW_SIZE = { width: 640, height: 320 } as const;
const WORKING_MARKER_LINGER_MS = 2200;
// The viewport follows a streaming diagram: checked at most this often,
// kept inside the chrome, and left alone right after the user pans.
const FOLLOW_THROTTLE_MS = 350;
const FOLLOW_ANIMATION_MS = 380;
const FOLLOW_PADDING = 48;
const FOLLOW_INSET = { top: 88, bottom: 140, left: 40, right: 40 } as const;
const USER_VIEWPORT_GRACE_MS = 2500;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const CANVAS_FILE_FILTER: FileTypeFilter = {
  name: "Gumption whiteboard",
  extensions: [CANVAS_FILE_EXTENSION, "json"],
  mimeType: "application/json",
};
const EXPORT_FILE_FILTERS: Record<ExportSettings["format"], FileTypeFilter> = {
  png: { name: "PNG image", extensions: ["png"], mimeType: "image/png" },
  svg: { name: "SVG image", extensions: ["svg"], mimeType: "image/svg+xml" },
};

// Only the Tab/Space select-pan toggles announce themselves — those
// switch modes without the pointer anywhere near the toolbar.
const MODE_LABEL: Record<"select" | "pan", string> = {
  select: "Select mode",
  pan: "Pan mode",
};

const SHAPE_KIND_BY_MODE: Partial<Record<Mode, ShapeKind>> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
};

// Single-key tool shortcuts, matching Excalidraw's (7 is its pencil, which
// this app doesn't have; 9 inserts an image and is handled separately).
const TOOL_SHORTCUTS: Record<string, Mode> = {
  v: "select",
  "1": "select",
  h: "pan",
  r: "rectangle",
  "2": "rectangle",
  d: "diamond",
  "3": "diamond",
  o: "ellipse",
  "4": "ellipse",
  a: "arrow",
  "5": "arrow",
  l: "line",
  "6": "line",
  t: "text",
  "8": "text",
};

// Module-level so identity is stable across renders — xyflow re-measures
// and re-warns if the nodeTypes object changes identity every pass.
const nodeTypes = {
  textElement: TextElementComponent,
  shapeElement: ShapeElementComponent,
  lineElement: LineElementComponent,
  imageElement: ImageElementComponent,
  pictogramElement: PictogramElementComponent,
};

type DragDrawMode = Exclude<DrawingMode, "text">;

interface DrawPreview {
  kind: DragDrawMode;
  start: Point;
  end: Point;
}

interface Notice {
  id: number;
  text: string;
  tone: "info" | "error";
}

// Sliders, checkboxes, color pickers etc. keep focus after use but never
// take typed characters, so they must not swallow canvas shortcuts.
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)) ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isDragDrawMode(mode: Mode): mode is DragDrawMode {
  return mode === "rectangle" || mode === "ellipse" || mode === "diamond" || mode === "line" || mode === "arrow";
}

function getNextZIndex(nodes: CanvasNode[]): number {
  return nodes.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0) + 1;
}

function deselectAll(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => (node.selected ? ({ ...node, selected: false } as CanvasNode) : node));
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining === 0) resolve();
      else requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

type LayerDirection = "front" | "forward" | "backward" | "back";

// Rewrites every node's zIndex to its position in a single stacking order,
// moving the selection within it. Normalizing each time keeps the values
// small and makes "one step" moves well-defined.
function reorderLayers(nodes: CanvasNode[], direction: LayerDirection): CanvasNode[] {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  if (selectedIds.size === 0) return nodes;
  let order = sortTopmostFirst(nodes)
    .reverse()
    .map((node) => node.id);
  const isSelected = (id: string) => selectedIds.has(id);
  if (direction === "front") order = [...order.filter((id) => !isSelected(id)), ...order.filter(isSelected)];
  if (direction === "back") order = [...order.filter(isSelected), ...order.filter((id) => !isSelected(id))];
  if (direction === "forward") {
    for (let index = order.length - 2; index >= 0; index--) {
      if (isSelected(order[index]) && !isSelected(order[index + 1])) {
        [order[index], order[index + 1]] = [order[index + 1], order[index]];
      }
    }
  }
  if (direction === "backward") {
    for (let index = 1; index < order.length; index++) {
      if (isSelected(order[index]) && !isSelected(order[index - 1])) {
        [order[index], order[index - 1]] = [order[index - 1], order[index]];
      }
    }
  }
  const zIndexById = new Map(order.map((id, index) => [id, index]));
  return nodes.map((node) => {
    const zIndex = zIndexById.get(node.id)!;
    return node.zIndex === zIndex ? node : ({ ...node, zIndex } as CanvasNode);
  });
}

// Streamed diagram changes land unselected and keep the stacking of nodes
// they replace; brand-new nodes go on top. Lines the user bound to a shape
// the agent then removed are frozen in place rather than left dangling.
function applyDiagramChangeToNodes(previous: CanvasNode[], change: DiagramChange): CanvasNode[] {
  const removedIds = new Set(change.removedIds);
  const upsertedById = new Map(change.upserted.map((node) => [node.id, node]));
  const detached = removedIds.size
    ? detachLineBindings(previous, (line, binding) => removedIds.has(binding.elementId) && !removedIds.has(line.id))
    : previous;
  let zIndex = getNextZIndex(detached);
  const next: CanvasNode[] = [];
  for (const node of detached) {
    if (removedIds.has(node.id)) continue;
    const replacement = upsertedById.get(node.id);
    if (!replacement) {
      next.push(node);
      continue;
    }
    upsertedById.delete(node.id);
    next.push({ ...replacement, zIndex: node.zIndex, selected: node.selected } as CanvasNode);
  }
  for (const node of upsertedById.values()) next.push({ ...node, selected: false, zIndex: zIndex++ } as CanvasNode);
  return next;
}

function readStoredTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function Whiteboard() {
  return (
    <ReactFlowProvider>
      <WhiteboardInner />
    </ReactFlowProvider>
  );
}

function WhiteboardInner() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  // What the open project loaded with, so loading never counts as an edit.
  const loadedMessagesRef = useRef<ChatMessage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bindingTargetId, setBindingTargetId] = useState<string | null>(null);
  const [currentStyle, setCurrentStyle] = useState<ElementStyle>(DEFAULT_ELEMENT_STYLE);
  const [isToolLocked, setIsToolLocked] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const nodesRef = useRef<CanvasNode[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // The canvas as displayed: bound line endpoints are derived from their
  // targets' current geometry.
  const displayedNodes = useMemo(() => resolveLineBindings(nodes), [nodes]);
  const displayedNodesRef = useRef<CanvasNode[]>([]);
  useEffect(() => {
    displayedNodesRef.current = displayedNodes;
  }, [displayedNodes]);
  const getVisibleNodes = useCallback(() => displayedNodesRef.current, []);

  const themeRootRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const lastPointerFlowPositionRef = useRef<Point | null>(null);
  const commandInputRef = useRef<HTMLTextAreaElement>(null);

  const {
    getNode,
    getNodes,
    getViewport,
    setViewport,
    screenToFlowPosition,
    zoomIn,
    zoomOut,
    fitView,
  } = useReactFlow<CanvasNode, Edge>();

  const noticeIdRef = useRef(0);
  const notify = useCallback((text: string, tone: Notice["tone"] = "info") => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, text, tone });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice((current) => (current?.id === notice.id ? null : current)),
      NOTICE_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  // Keep the WebView2 window's native theme in sync with the app's own
  // light/dark toggle — a mismatch between the two is what caused typed
  // text to render inverted, since CSS color-scheme alone doesn't cover
  // WebView2's native control theming. No-ops harmlessly outside Tauri.
  useEffect(() => {
    invoke("set_window_theme", { theme }).catch(() => {});
  }, [theme]);

  // Persisted on toggle rather than in an effect, so the initial default
  // can never overwrite the stored preference before it has been read.
  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme preference is a convenience; nothing to do if storage is unavailable.
    }
  }, [theme]);

  // ── The whiteboard agent: a streamed diagram is one undo step ─────
  const lastUserViewportChangeAtRef = useRef(0);
  const followTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFollowBoundsRef = useRef<Box | null>(null);
  const chatWidth = isChatCollapsed ? CHAT_PANEL_COLLAPSED_WIDTH : CHAT_PANEL_WIDTH;
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  // `isRequested` marks a jump the person asked for by sending a request,
  // which ignores the grace period that keeps streaming updates from
  // fighting their own panning.
  const followDiagram = useCallback(
    (bounds: Box, { isRequested = false } = {}) => {
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (!isRequested && Date.now() - lastUserViewportChangeAtRef.current < USER_VIEWPORT_GRACE_MS) return;
      const viewport = getViewport();
      const insetLeft = chatWidthRef.current + FOLLOW_INSET.left;
      const availableWidth = rect.width - insetLeft - FOLLOW_INSET.right;
      const availableHeight = rect.height - FOLLOW_INSET.top - FOLLOW_INSET.bottom;
      const visible = {
        x: (insetLeft - viewport.x) / viewport.zoom,
        y: (FOLLOW_INSET.top - viewport.y) / viewport.zoom,
        width: availableWidth / viewport.zoom,
        height: availableHeight / viewport.zoom,
      };
      const fits =
        bounds.x >= visible.x &&
        bounds.y >= visible.y &&
        bounds.x + bounds.width <= visible.x + visible.width &&
        bounds.y + bounds.height <= visible.y + visible.height;
      if (fits) return;
      const zoom = Math.max(
        SCALE_MIN,
        Math.min(1, availableWidth / (bounds.width + FOLLOW_PADDING * 2), availableHeight / (bounds.height + FOLLOW_PADDING * 2)),
      );
      setViewport(
        {
          x: insetLeft + availableWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
          y: FOLLOW_INSET.top + availableHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
          zoom,
        },
        { duration: prefersReducedMotion() ? 0 : FOLLOW_ANIMATION_MS },
      );
    },
    [getViewport, setViewport],
  );

  const scheduleFollow = useCallback(
    (bounds: Box) => {
      pendingFollowBoundsRef.current = bounds;
      if (followTimerRef.current) return;
      followTimerRef.current = setTimeout(() => {
        followTimerRef.current = null;
        if (pendingFollowBoundsRef.current) followDiagram(pendingFollowBoundsRef.current);
      }, FOLLOW_THROTTLE_MS);
    },
    [followDiagram],
  );

  const applyDiagramChange = useCallback((change: DiagramChange) => {
    setNodes((previous) => applyDiagramChangeToNodes(previous, change));
  }, []);

  // Whether Claude Code is installed and current, checked at launch so a
  // missing or stale install is reported before the first request.
  const [claudeCode, setClaudeCode] = useState<ClaudeCodeStatus>({ kind: "unknown" });
  const claudeCodeRef = useRef(claudeCode);
  useEffect(() => {
    claudeCodeRef.current = claudeCode;
  }, [claudeCode]);
  const recheckClaudeCode = useCallback(async () => {
    if (!canCheckClaudeCode()) return;
    setClaudeCode({ kind: "checking" });
    setClaudeCode(await checkClaudeCode());
  }, []);
  useEffect(() => {
    void recheckClaudeCode();
  }, [recheckClaudeCode]);

  const [modelChoice, setModelChoice] = useState<ModelChoice>("default");
  useEffect(() => {
    setModelChoice(readStoredModelChoice());
  }, []);
  const changeModel = useCallback((choice: ModelChoice) => {
    setModelChoice(choice);
    writeStoredModelChoice(choice);
  }, []);
  const [kindChoice, setKindChoice] = useState<DiagramKindChoice>("auto");
  useEffect(() => {
    setKindChoice(readStoredKindChoice());
  }, []);
  const changeKind = useCallback((choice: DiagramKindChoice) => {
    setKindChoice(choice);
    writeStoredKindChoice(choice);
  }, []);

  const diagram = useDiagramSession({
    applyChange: applyDiagramChange,
    onBoundsChange: scheduleFollow,
    getClaudeCodeStatus: () => claudeCodeRef.current,
  });
  const isDrawing = diagram.isWorking;
  const [diagramOrigin, setDiagramOrigin] = useState<Point | null>(null);
  const [workingMarkerPhase, setWorkingMarkerPhase] = useState<WorkingMarkerPhase | null>(null);

  // The on-canvas sign tracks the session: up while working, then a brief
  // "Done"/"Stopped" that fades on its own. A failure has nothing on the
  // canvas to point at, so only the command bar reports it.
  useEffect(() => {
    const { phase } = diagram.status;
    if (phase === "working") {
      setWorkingMarkerPhase("working");
      return;
    }
    if (phase === "done" || phase === "stopped") {
      setWorkingMarkerPhase(phase);
      const timer = setTimeout(() => setWorkingMarkerPhase(null), WORKING_MARKER_LINGER_MS);
      return () => clearTimeout(timer);
    }
    setWorkingMarkerPhase(null);
  }, [diagram.status]);

  const history = useCanvasHistory({ nodes, setNodes, isEditing: editingId !== null || isDrawing });

  // ── Projects / persistence ────────────────────────────────────
  const applyDocument = useCallback(
    (document: CanvasDocument) => {
      setNodes(document.nodes);
      history.reset(document.nodes);
      setEditingId(null);
      loadedMessagesRef.current = document.messages;
      setMessages(document.messages);
      setViewport(document.viewport ?? { x: 0, y: 0, zoom: 1 });
    },
    [history, setViewport],
  );

  const projects = useProjects({
    getSnapshot: () => ({ nodes: nodesRef.current, viewport: getViewport(), messages: messagesRef.current }),
    applyDocument,
    onError: (message) => notify(message, "error"),
  });
  const { notifyNodesChanged, notifyContentChanged } = projects;

  useEffect(() => {
    if (projects.isReady) notifyNodesChanged(nodes);
  }, [nodes, projects.isReady, notifyNodesChanged]);

  useEffect(() => {
    if (projects.isReady && messages !== loadedMessagesRef.current) notifyContentChanged();
  }, [messages, projects.isReady, notifyContentChanged]);

  // The centre of the part of the canvas not covered by the chat panel.
  const canvasWrapperCenter = useCallback(() => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    return {
      centerX: chatWidthRef.current + (width - chatWidthRef.current) / 2,
      centerY: height / 2,
    };
  }, []);

  const getViewportCenterFlowPosition = useCallback((): Point => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { centerX, centerY } = canvasWrapperCenter();
    return screenToFlowPosition({ x: rect.left + centerX, y: rect.top + centerY });
  }, [canvasWrapperCenter, screenToFlowPosition]);

  // ── Interaction mode: select / pan / draw tools ────────────────
  // `mode` is the persistent tool. Holding Space temporarily forces pan on
  // top of it, then releases back to `mode` — effectiveMode below is the
  // only thing the canvas actually reads.
  const [mode, setModeState] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const spaceDownRef = useRef(false);

  const effectiveMode: Mode = isSpaceDown ? "pan" : mode;
  const isTextMode = effectiveMode === "text";
  const isDragMode = isDragDrawMode(effectiveMode);
  const isCreationMode = isTextMode || isDragMode;

  const [modeToast, setModeToast] = useState<{ text: string; id: number } | null>(null);
  const modeToastId = useRef(0);
  const announceMode = useCallback((text: string) => {
    modeToastId.current += 1;
    setModeToast({ text, id: modeToastId.current });
  }, []);

  const setMode = useCallback((next: Mode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    setModeState(next);
  }, []);

  const finishCreation = useCallback(() => {
    if (!isToolLocked) setMode("select");
  }, [isToolLocked, setMode]);

  // ── Viewport navigation ──────────────────────────────────────
  // Brings everything into view. Never zooms in past 100% — when it all
  // fits, this just centres it at its natural size; when it doesn't, it
  // zooms out as far as needed instead of leaving part of the canvas
  // off-screen.
  const fitAll = useCallback(() => {
    const allNodes = getNodes();
    if (allNodes.length === 0) return;
    void fitView({
      nodes: allNodes.map((node) => ({ id: node.id })),
      padding: { ...FIT_VIEW_PADDING, left: `${chatWidthRef.current + CHAT_PANEL_GUTTER}px` },
      maxZoom: 1,
      duration: VIEWPORT_ANIMATION_MS,
    });
  }, [getNodes, fitView]);

  const zoomToSelection = useCallback(() => {
    const selectedNodes = nodesRef.current.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;
    void fitView({
      nodes: selectedNodes.map((node) => ({ id: node.id })),
      padding: { ...FIT_VIEW_PADDING, left: `${chatWidthRef.current + CHAT_PANEL_GUTTER}px` },
      maxZoom: FIT_SELECTION_MAX_ZOOM,
      duration: VIEWPORT_ANIMATION_MS,
    });
  }, [fitView]);

  const resetZoomKeepingCenter = useCallback(() => {
    const { centerX, centerY } = canvasWrapperCenter();
    const current = getViewport();
    setViewport(
      {
        x: centerX - (centerX - current.x) / current.zoom,
        y: centerY - (centerY - current.y) / current.zoom,
        zoom: 1,
      },
      { duration: ZOOM_ANIMATION_MS },
    );
  }, [canvasWrapperCenter, getViewport, setViewport]);

  // ── Selection, editing, and the element operations ─────────────
  const selectOnly = useCallback((ids: ReadonlySet<string>) => {
    setNodes((previous) =>
      previous.map((node) => {
        const shouldSelect = ids.has(node.id);
        return !!node.selected === shouldSelect ? node : ({ ...node, selected: shouldSelect } as CanvasNode);
      }),
    );
  }, []);

  const startEditing = useCallback(
    (nodeId: string) => {
      setEditingId(nodeId);
      selectOnly(new Set([nodeId]));
    },
    [selectOnly],
  );

  // Excalidraw-style: a text element left empty when editing ends is removed.
  const stopEditing = useCallback(() => {
    const finishedId = editingId;
    setEditingId(null);
    if (!finishedId) return;
    setNodes((previous) =>
      previous.filter(
        (node) => !(node.id === finishedId && node.type === "textElement" && node.data.text.trim() === ""),
      ),
    );
  }, [editingId]);

  const insertNodes = useCallback((newNodes: CanvasNode[]) => {
    if (newNodes.length === 0) return;
    setNodes((previous) => {
      let zIndex = getNextZIndex(previous);
      return [
        ...deselectAll(previous),
        ...newNodes.map((node) => ({ ...node, selected: true, zIndex: zIndex++ }) as CanvasNode),
      ];
    });
  }, []);

  const deleteSelection = useCallback(() => {
    setEditingId(null);
    setNodes((previous) => {
      // An artboard goes with everything on it.
      const deletedIds = withArtboardMembers(previous, new Set(previous.filter((node) => node.selected).map((node) => node.id)));
      if (deletedIds.size === 0) return previous;
      const detached = detachLineBindings(
        previous,
        (line, binding) => deletedIds.has(binding.elementId) && !deletedIds.has(line.id),
      );
      return detached.filter((node) => !deletedIds.has(node.id));
    });
  }, []);

  const duplicateSelection = useCallback(() => {
    const displayed = displayedNodesRef.current;
    const copiedIds = withArtboardMembers(displayed, new Set(displayed.filter((node) => node.selected).map((node) => node.id)));
    const copied = displayed.filter((node) => copiedIds.has(node.id));
    insertNodes(cloneNodes(copied, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }).map(withoutArtboard));
  }, [insertNodes]);

  const selectAll = useCallback(() => {
    setNodes((previous) => previous.map((node) => (node.selected ? node : ({ ...node, selected: true } as CanvasNode))));
  }, []);

  // Moving lines away from targets that aren't moving with them unbinds
  // those ends (the same rule Excalidraw uses); targets moving along keep
  // dragging their lines with them.
  const detachLinesMovedApart = useCallback((movedIds: ReadonlySet<string>) => {
    setNodes((previous) =>
      detachLineBindings(previous, (line, binding) => movedIds.has(line.id) && !movedIds.has(binding.elementId)),
    );
  }, []);

  const nudgeSelection = useCallback(
    (deltaX: number, deltaY: number) => {
      const selectedIds = withArtboardMembers(nodesRef.current, new Set(nodesRef.current.filter((node) => node.selected).map((node) => node.id)));
      if (selectedIds.size === 0) return;
      detachLinesMovedApart(selectedIds);
      setNodes((previous) =>
        previous.map((node) =>
          selectedIds.has(node.id)
            ? ({ ...node, position: { x: node.position.x + deltaX, y: node.position.y + deltaY } } as CanvasNode)
            : node,
        ),
      );
    },
    [detachLinesMovedApart],
  );

  const changeLayer = useCallback((direction: LayerDirection) => {
    setNodes((previous) => reorderLayers(previous, direction));
  }, []);

  // Applies to every selected element that has the property, and becomes
  // the default for elements drawn next — same as Excalidraw.
  const updateStyle = useCallback((patch: Partial<ElementStyle>) => {
    setCurrentStyle((style) => ({ ...style, ...patch }));
    setNodes((previous) =>
      previous.map((node) => {
        if (!node.selected) return node;
        const applicableEntries = Object.entries(patch).filter(([key]) => key in node.data);
        if (applicableEntries.length === 0) return node;
        return { ...node, data: { ...node.data, ...Object.fromEntries(applicableEntries) } } as CanvasNode;
      }),
    );
  }, []);

  const updateNodeData = useCallback(
    <NodeType extends CanvasNode>(id: string, type: NodeType["type"], patch: (node: NodeType) => Partial<NodeType>) =>
      setNodes((previous) =>
        previous.map((node) => (node.id === id && node.type === type ? ({ ...node, ...patch(node as NodeType) } as CanvasNode) : node)),
      ),
    [],
  );

  const resizeTextElement = useCallback(
    (id: string, width: number, x: number, y: number, handleKind: ResizeHandleKind) =>
      updateNodeData<TextElementNode>(id, "textElement", (node) => {
        // Corners scale the font along with the box — "make the text
        // bigger/smaller"; edges only rewrap at the same size.
        const fontSize =
          handleKind === "corner" && node.data.width > 0
            ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(node.data.fontSize * (width / node.data.width))))
            : node.data.fontSize;
        return { position: { x, y }, data: { ...node.data, width, fontSize } };
      }),
    [updateNodeData],
  );

  // ── Snapping/binding radius in flow units for the current zoom ──
  const getSnapRadius = useCallback(() => SNAP_RADIUS_PX / getViewport().zoom, [getViewport]);

  // ── Element factories ──────────────────────────────────────────
  const createTextAt = useCallback(
    (point: Point, initialText = "") => {
      const style = pickStyle(currentStyle, TEXT_STYLE_KEYS);
      const textNode: TextElementNode = {
        id: crypto.randomUUID(),
        type: "textElement",
        position: { x: point.x, y: point.y - style.fontSize / 2 },
        data: { text: initialText, width: TEXT_DEFAULT_WIDTH, ...style },
      };
      insertNodes([textNode]);
      if (!initialText) setEditingId(textNode.id);
    },
    [currentStyle, insertNodes],
  );

  const createLine = useCallback(
    (kind: LineKind, start: Point, end: Point, startBinding: Binding | null, endBinding: Binding | null) => {
      const { position, points } = getLineGeometry([start, end]);
      const lineNode: LineElementNode = {
        id: crypto.randomUUID(),
        type: "lineElement",
        position,
        data: {
          kind,
          points,
          seed: createSeed(),
          startBinding,
          endBinding,
          ...pickStyle(currentStyle, LINE_STYLE_KEYS),
        },
      };
      insertNodes([lineNode]);
    },
    [currentStyle, insertNodes],
  );

  const createShape = useCallback(
    (shapeKind: ShapeKind, start: Point, end: Point, isClick: boolean) => {
      const width = isClick ? SHAPE_DEFAULT_SIZE : Math.max(Math.abs(end.x - start.x), SHAPE_MIN_DRAG_SIZE);
      const height = isClick ? SHAPE_DEFAULT_SIZE : Math.max(Math.abs(end.y - start.y), SHAPE_MIN_DRAG_SIZE);
      const shapeNode: ShapeElementNode = {
        id: crypto.randomUUID(),
        type: "shapeElement",
        position: {
          x: isClick ? start.x - width / 2 : Math.min(start.x, end.x),
          y: isClick ? start.y - height / 2 : Math.min(start.y, end.y),
        },
        data: {
          shapeKind,
          width,
          height,
          seed: createSeed(),
          label: "",
          note: "",
          ...pickStyle(currentStyle, SHAPE_STYLE_KEYS),
        },
      };
      insertNodes([shapeNode]);
    },
    [currentStyle, insertNodes],
  );

  const insertImageFiles = useCallback(
    async (files: File[], at: Point) => {
      const imageFiles = files.filter(isImageFile);
      if (imageFiles.length === 0) {
        if (files.length > 0) notify("Only image files can be added to the canvas.", "error");
        return;
      }
      const imageNodes: ImageElementNode[] = [];
      for (const [index, file] of imageFiles.entries()) {
        try {
          const image = await loadImageFile(file);
          const scale = Math.min(1, IMAGE_MAX_INITIAL_SIZE / Math.max(image.width, image.height));
          const width = image.width * scale;
          const height = image.height * scale;
          const offset = index * IMAGE_STACK_OFFSET;
          imageNodes.push({
            id: crypto.randomUUID(),
            type: "imageElement",
            position: { x: at.x - width / 2 + offset, y: at.y - height / 2 + offset },
            data: { src: image.src, width, height, ...pickStyle(currentStyle, IMAGE_STYLE_KEYS) },
          });
        } catch (error) {
          notify(errorMessage(error), "error");
        }
      }
      insertNodes(imageNodes);
      if (imageNodes.length > 0) setMode("select");
    },
    [currentStyle, insertNodes, notify, setMode],
  );

  const getPastePosition = useCallback(
    () => lastPointerFlowPositionRef.current ?? getViewportCenterFlowPosition(),
    [getViewportCenterFlowPosition],
  );

  const promptForImages = useCallback(async () => {
    const files = await pickFiles({ accept: "image/*", multiple: true });
    if (files.length > 0) await insertImageFiles(files, getViewportCenterFlowPosition());
  }, [getViewportCenterFlowPosition, insertImageFiles]);

  // ── Asking the agent to draw ──────────────────────────────────
  const [commandDraft, setCommandDraft] = useState("");
  const lastPromptRef = useRef("");

  const getDiagramOrigin = useCallback((): Point => {
    const existingBounds = getBoxesBounds(nodesRef.current.map(getNodeBox));
    if (existingBounds) return { x: existingBounds.x + existingBounds.width + DIAGRAM_SPACING, y: existingBounds.y };
    const center = getViewportCenterFlowPosition();
    return { x: center.x - DIAGRAM_ORIGIN_OFFSET.x, y: center.y - DIAGRAM_ORIGIN_OFFSET.y };
  }, [getViewportCenterFlowPosition]);

  // The drawing the next request changes: the artboard that is selected or
  // holds the selection. With none, the request draws something new.
  const editTarget = useMemo(() => findEditTarget(nodes), [nodes]);
  const editTargetRef = useRef<EditTarget | null>(null);
  editTargetRef.current = editTarget;
  const lastEditTargetRef = useRef<EditTarget | null>(null);
  const editingRunRef = useRef(false);

  // `replacesLastMessage` is for a retry: the failed request is swapped
  // for the new one instead of repeated, against the same drawing.
  const requestDiagram = useCallback(
    (prompt: string, { replacesLastMessage = false } = {}) => {
      const trimmed = prompt.trim();
      if (!trimmed || isDrawing) return;
      const target = replacesLastMessage ? lastEditTargetRef.current : editTargetRef.current;
      lastPromptRef.current = trimmed;
      lastEditTargetRef.current = target;
      editingRunRef.current = target !== null;
      setCommandDraft("");
      setEditingId(null);
      setMode("select");
      setNodes((previous) => deselectAll(previous));
      const history = replacesLastMessage ? messagesRef.current.slice(0, -1) : messagesRef.current;
      const transcript = toChatTurns(history);
      setMessages([...history, { id: crypto.randomUUID(), role: "user", text: trimmed, createdAt: Date.now(), diagram: null }]);
      // A change happens where the drawing already is; a new drawing goes
      // beside everything else. Either way the view goes there at once, so
      // the person watches the part that is changing.
      const origin = target ? target.framePosition : getDiagramOrigin();
      // The sign is anchored to the artboard's corner: a new drawing's frame
      // sits a padding outside its origin.
      const corner = target ? origin : { x: origin.x - FRAME_PADDING, y: origin.y - FRAME_PADDING };
      setDiagramOrigin(corner);
      followDiagram(target ? target.bounds : { x: corner.x, y: corner.y - WORKING_MARKER_LIFT, ...INITIAL_FOLLOW_SIZE }, { isRequested: true });
      diagram.start({
        prompt: trimmed,
        transcript,
        origin,
        style: currentStyle,
        codebaseFolder: projects.currentProject?.workingFolder ?? null,
        model: modelArgumentFor(modelChoice),
        kind: chosenKindFor(kindChoice),
        edit: target ? { state: target.state, memberIds: target.memberIds, framePosition: target.framePosition } : null,
      });
    },
    [currentStyle, diagram, followDiagram, getDiagramOrigin, isDrawing, kindChoice, modelChoice, projects.currentProject?.workingFolder, setMode],
  );

  // Shows a drawing from the chat: the view goes to its artboard.
  const showArtboard = useCallback(
    (artboardId: string) => {
      const artboard = findArtboard(nodesRef.current, artboardId);
      if (artboard) followDiagram(getNodeBox(artboard), { isRequested: true });
    },
    [followDiagram],
  );

  // Picks a drawing to change: selects its artboard, shows it, and puts the
  // cursor in the composer.
  const editArtboard = useCallback(
    (artboardId: string) => {
      if (!findArtboard(nodesRef.current, artboardId)) return;
      setEditingId(null);
      setMode("select");
      setNodes((previous) =>
        previous.map((node) => {
          const shouldSelect = node.id === artboardId;
          return node.selected === shouldSelect ? node : ({ ...node, selected: shouldSelect } as CanvasNode);
        }),
      );
      showArtboard(artboardId);
      commandInputRef.current?.focus();
    },
    [setMode, showArtboard],
  );

  const clearEditTarget = useCallback(() => {
    setNodes((previous) => deselectAll(previous));
  }, []);

  // The reply joins the conversation once the run has settled; while the
  // agent works, the chat shows it live from the session status.
  const recordedStatusRef = useRef<DiagramSessionStatus | null>(null);
  useEffect(() => {
    const status = diagram.status;
    if ((status.phase !== "done" && status.phase !== "stopped") || recordedStatusRef.current === status) return;
    recordedStatusRef.current = status;
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: status.text,
      createdAt: Date.now(),
      diagram: {
        summary: status.phase === "done" ? status.summary : "",
        counts: status.counts,
        outline: status.outline,
        skippedCount: status.phase === "done" ? status.skippedCount : 0,
        wasStopped: status.phase === "stopped",
        isUndone: false,
        artboardId: status.artboardId,
        wasEdit: editingRunRef.current,
      },
    };
    setMessages((previous) => [...previous, reply]);
  }, [diagram.status]);

  const undoLastDiagram = useCallback(() => {
    diagram.dismiss();
    history.undo();
    setMessages((previous) => {
      const last = previous[previous.length - 1];
      if (!last || last.role !== "assistant" || !last.diagram) return previous;
      return [...previous.slice(0, -1), { ...last, diagram: { ...last.diagram, isUndone: true } }];
    });
  }, [diagram, history]);

  const retryLastDiagram = useCallback(() => {
    diagram.dismiss();
    requestDiagram(lastPromptRef.current, { replacesLastMessage: messagesRef.current[messagesRef.current.length - 1]?.role === "user" });
  }, [diagram, requestDiagram]);

  // ── xyflow-driven node changes: position (drag), measured size, selection ──
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    // Element sizes come from `data`; letting the resizer also pin xyflow's
    // own width/height would freeze intrinsic sizes (e.g. text height).
    const sanitizedChanges = changes.map((change) =>
      change.type === "dimensions" && change.setAttributes ? { ...change, setAttributes: false } : change,
    );
    // Dragging an artboard brings everything on it along.
    setNodes((previous) => applyNodeChanges(carryArtboardMembers(previous, sanitizedChanges), previous));
  }, []);

  const onNodeDragStart = useCallback(
    (_event: unknown, _node: Node, draggedNodes: Node[]) => {
      detachLinesMovedApart(withArtboardMembers(nodesRef.current, new Set(draggedNodes.map((node) => node.id))));
    },
    [detachLinesMovedApart],
  );
  const onSelectionDragStart = useCallback(
    (_event: unknown, draggedNodes: Node[]) => {
      detachLinesMovedApart(withArtboardMembers(nodesRef.current, new Set(draggedNodes.map((node) => node.id))));
    },
    [detachLinesMovedApart],
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const { sourceHandle, targetHandle } = connection;
    if (typeof sourceHandle !== "string" || !sourceHandle.startsWith(ANCHOR_HANDLE_PREFIX)) return false;
    if (typeof targetHandle !== "string" || !targetHandle.startsWith(ANCHOR_HANDLE_PREFIX)) return false;
    return connection.source !== connection.target;
  }, []);

  // Dragging between two anchor handles draws an arrow bound at both ends.
  const onConnect = useCallback(
    (connection: Connection) => {
      const visibleNodes = getVisibleNodes();
      const sourceNode = visibleNodes.find((node) => node.id === connection.source);
      const targetNode = visibleNodes.find((node) => node.id === connection.target);
      const sourceSide = connection.sourceHandle?.slice(ANCHOR_HANDLE_PREFIX.length) as AnchorSide | undefined;
      const targetSide = connection.targetHandle?.slice(ANCHOR_HANDLE_PREFIX.length) as AnchorSide | undefined;
      if (!sourceNode || !targetNode || !sourceSide || !targetSide) return;
      if (!(sourceSide in ANCHOR_FOCUS) || !(targetSide in ANCHOR_FOCUS)) return;
      const startFocus = ANCHOR_FOCUS[sourceSide];
      const endFocus = ANCHOR_FOCUS[targetSide];
      createLine(
        "arrow",
        pointFromFocus(getNodeBox(sourceNode), startFocus),
        pointFromFocus(getNodeBox(targetNode), endFocus),
        { elementId: sourceNode.id, focus: { ...startFocus } },
        { elementId: targetNode.id, focus: { ...endFocus } },
      );
    },
    [createLine, getVisibleNodes],
  );

  const moveLineEndpoint = useCallback(
    (lineId: string, endpointIndex: 0 | 1, flowPoint: Point) => {
      const currentNodes = getVisibleNodes();
      const line = currentNodes.find(
        (node): node is LineElementNode => node.id === lineId && node.type === "lineElement",
      );
      if (!line) return;
      const otherBinding = endpointIndex === 0 ? line.data.endBinding : line.data.startBinding;
      const excludedIds = new Set([lineId, ...(otherBinding ? [otherBinding.elementId] : [])]);
      const candidate = findBindingAt(flowPoint, currentNodes, excludedIds, getSnapRadius());
      setBindingTargetId(candidate?.binding.elementId ?? null);
      const linePoints = getLinePoints(line);
      linePoints[endpointIndex === 0 ? 0 : linePoints.length - 1] = candidate?.point ?? flowPoint;
      const { position, points } = getLineGeometry(linePoints);
      const binding = candidate?.binding ?? null;
      updateNodeData<LineElementNode>(lineId, "lineElement", (node) => ({
        position,
        data: {
          ...node.data,
          points,
          ...(endpointIndex === 0 ? { startBinding: binding } : { endBinding: binding }),
        },
      }));
    },
    [getSnapRadius, getVisibleNodes, updateNodeData],
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (mode === "text") {
        const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const textUnderPointer = sortTopmostFirst(getVisibleNodes()).find((node) => {
          if (node.type !== "textElement") return false;
          const box = getNodeBox(node);
          return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
        });
        const target = textUnderPointer ?? findTopmostShapeAt(point, getVisibleNodes());
        if (target) startEditing(target.id);
        else createTextAt(point);
        finishCreation();
        return;
      }
      setNodes((previous) => deselectAll(previous));
    },
    [mode, screenToFlowPosition, getVisibleNodes, startEditing, createTextAt, finishCreation],
  );

  // Double-clicking empty canvas adds text there; inside a shape (even a
  // transparent one, whose interior is click-through) it edits the label.
  const onCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (effectiveMode !== "select") return;
      if ((event.target as Element).closest(".react-flow__node")) return;
      if (!(event.target as Element).closest(".react-flow__pane")) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const shape = findTopmostShapeAt(point, getVisibleNodes());
      if (shape) startEditing(shape.id);
      else createTextAt(point);
    },
    [effectiveMode, screenToFlowPosition, getVisibleNodes, startEditing, createTextAt],
  );

  const onNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      // An artboard has no label to type into: double-clicking it picks the
      // drawing to change and puts the cursor in the composer.
      if (findArtboard(nodesRef.current, node.id)) {
        editArtboard(node.id);
        return;
      }
      if (node.type === "shapeElement" || node.type === "textElement") startEditing(node.id);
    },
    [editArtboard, startEditing],
  );

  // ── Drag-to-draw gesture — shape/line/arrow tools commit on drag ──
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null);

  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper || !isDragMode) return;
    const drawKind = effectiveMode as DragDrawMode;
    const isLineKind = drawKind === "line" || drawKind === "arrow";

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!(event.target as Element).closest(".react-flow__pane, .react-flow__node")) return;
      const snapRadius = getSnapRadius();
      const startRaw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const startCandidate: BindingCandidate | null = isLineKind
        ? findBindingAt(startRaw, getVisibleNodes(), EMPTY_ID_SET, snapRadius)
        : null;
      const start = startCandidate?.point ?? startRaw;
      let endCandidate: BindingCandidate | null = null;
      const startClient = { x: event.clientX, y: event.clientY };

      setDrawPreview({ kind: drawKind, start, end: start });
      setBindingTargetId(startCandidate?.binding.elementId ?? null);

      const computeEnd = (pointerEvent: MouseEvent): Point => {
        let raw = screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY });
        if (isLineKind) {
          if (pointerEvent.shiftKey) raw = snapAngle(start, raw);
          const excludedIds = startCandidate ? new Set([startCandidate.binding.elementId]) : EMPTY_ID_SET;
          endCandidate = findBindingAt(raw, getVisibleNodes(), excludedIds, snapRadius);
          return endCandidate?.point ?? raw;
        }
        if (pointerEvent.shiftKey) {
          const size = Math.max(Math.abs(raw.x - start.x), Math.abs(raw.y - start.y));
          raw = { x: start.x + Math.sign(raw.x - start.x || 1) * size, y: start.y + Math.sign(raw.y - start.y || 1) * size };
        }
        return raw;
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        const end = computeEnd(moveEvent);
        setDrawPreview((previous) => (previous ? { ...previous, end } : previous));
        setBindingTargetId(endCandidate?.binding.elementId ?? null);
      };
      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setDrawPreview(null);
        setBindingTargetId(null);

        const end = computeEnd(upEvent);
        const isClick =
          Math.abs(upEvent.clientX - startClient.x) < DRAG_COMMIT_THRESHOLD_PX &&
          Math.abs(upEvent.clientY - startClient.y) < DRAG_COMMIT_THRESHOLD_PX;

        if (isLineKind) {
          if (!isClick) createLine(drawKind, start, end, startCandidate?.binding ?? null, endCandidate?.binding ?? null);
        } else {
          createShape(SHAPE_KIND_BY_MODE[drawKind]!, start, end, isClick);
        }
        finishCreation();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    wrapper.addEventListener("mousedown", onMouseDown);
    return () => wrapper.removeEventListener("mousedown", onMouseDown);
  }, [isDragMode, effectiveMode, screenToFlowPosition, getSnapRadius, getVisibleNodes, createLine, createShape, finishCreation]);

  useEffect(() => {
    if (editingId && !nodes.some((node) => node.id === editingId)) setEditingId(null);
  }, [nodes, editingId]);

  // ── File operations ───────────────────────────────────────────
  const projectTitle = projects.currentProject?.title ?? DEFAULT_PROJECT_TITLE;

  const saveToFile = useCallback(async () => {
    try {
      const document = createCanvasDocument(resolveLineBindings(nodesRef.current), getViewport(), messagesRef.current);
      const didSave = await saveFile({
        suggestedName: `${projectTitle}.${CANVAS_FILE_EXTENSION}`,
        filter: CANVAS_FILE_FILTER,
        contents: JSON.stringify(document, null, 2),
      });
      if (didSave) notify("Saved to file");
    } catch (error) {
      notify(`Couldn't save the file: ${errorMessage(error)}`, "error");
    }
  }, [getViewport, notify, projectTitle]);

  const loadFromFile = useCallback(async () => {
    try {
      const file = await openTextFile(CANVAS_FILE_FILTER);
      if (!file) return;
      const document = parseCanvasDocument(JSON.parse(file.contents));
      setEditingId(null);
      setNodes(document.nodes);
      if (document.viewport) setViewport(document.viewport);
      notify(`Opened ${file.name} — Ctrl+Z to go back`);
    } catch (error) {
      notify(`Couldn't open the file: ${errorMessage(error)}`, "error");
    }
  }, [notify, setViewport]);

  const requestOpenFile = useCallback(() => {
    if (nodesRef.current.length === 0) {
      void loadFromFile();
      return;
    }
    setConfirmRequest({
      title: "Open file",
      message: "Opening a file replaces everything on this canvas. You can undo it afterwards with Ctrl+Z.",
      confirmLabel: "Open file",
      onConfirm: () => void loadFromFile(),
    });
  }, [loadFromFile]);

  const requestClearCanvas = useCallback(() => {
    if (nodesRef.current.length === 0) return;
    setConfirmRequest({
      title: "Clear canvas",
      message: "Remove everything from this canvas? You can undo it afterwards with Ctrl+Z.",
      confirmLabel: "Clear canvas",
      onConfirm: () => {
        setEditingId(null);
        setNodes([]);
      },
    });
  }, []);

  const requestDeleteProject = useCallback(
    (projectId: string) => {
      const project = projects.projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      setConfirmRequest({
        title: "Delete project",
        message: `Delete “${project.title}” and its canvas? This can't be undone.`,
        confirmLabel: "Delete project",
        onConfirm: () => void projects.deleteProject(projectId),
      });
    },
    [projects],
  );

  const exportImage = useCallback(
    async (settings: ExportSettings) => {
      const viewportElement = canvasWrapperRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
      const allNodes = getVisibleNodes();
      const exportedNodes = settings.isSelectionOnly ? allNodes.filter((node) => node.selected) : allNodes;
      const bounds: Box | null = getBoxesBounds(exportedNodes.map(getNodeBox));
      if (!viewportElement || !bounds) {
        notify("There's nothing to export yet.", "error");
        return;
      }
      const exportedIds = new Set(exportedNodes.map((node) => node.id));
      const previouslySelectedIds = new Set(allNodes.filter((node) => node.selected).map((node) => node.id));

      setIsExporting(true);
      setEditingId(null);
      setNodes((previous) => deselectAll(previous));
      await waitForFrames(2);
      try {
        const backgroundColor = settings.hasBackground && themeRootRef.current
          ? getComputedStyle(themeRootRef.current).getPropertyValue("--color-surface").trim()
          : null;
        const contents = await renderCanvasImage({
          viewportElement,
          bounds,
          format: settings.format,
          backgroundColor,
          pixelRatio: settings.scale,
          includeElement: (element) => {
            if (element.classList.contains("react-flow__handle")) return false;
            if (element.classList.contains("react-flow__resize-control")) return false;
            if (element.classList.contains("react-flow__node")) return exportedIds.has(element.getAttribute("data-id") ?? "");
            return element.getAttribute("role") !== "status";
          },
        });
        const didSave = await saveFile({
          suggestedName: `${projectTitle}.${settings.format}`,
          filter: EXPORT_FILE_FILTERS[settings.format],
          contents,
        });
        if (didSave) {
          setIsExportOpen(false);
          notify(`Exported ${settings.format.toUpperCase()}`);
        }
      } catch (error) {
        notify(`Export failed: ${errorMessage(error)}`, "error");
      } finally {
        setNodes((previous) =>
          previous.map((node) =>
            previouslySelectedIds.has(node.id) ? ({ ...node, selected: true } as CanvasNode) : node,
          ),
        );
        setIsExporting(false);
      }
    },
    [getVisibleNodes, notify, projectTitle],
  );

  const isAnyDialogOpen = confirmRequest !== null || isExportOpen || isShortcutsOpen;

  // ── Keyboard shortcuts ─────────────────────────────────────────
  // Handlers read the latest closures through a ref so the window
  // listeners are registered once rather than on every render.
  const keyDownHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const keyUpHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyDownHandlerRef.current = (event: KeyboardEvent) => {
      if (isAnyDialogOpen) return;
      if (isEditableTarget(event.target)) return;

      const isModifierPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const hasSelection = nodesRef.current.some((node) => node.selected);

      if (isModifierPressed) {
        const handled = (() => {
          // While a diagram streams in, the whole run is one pending undo
          // step; undoing underneath it would leave later strokes dangling.
          if (key === "z" && !event.shiftKey) return isDrawing || history.undo(), true;
          if ((key === "z" && event.shiftKey) || key === "y") return isDrawing || history.redo(), true;
          if (key === "a") return selectAll(), true;
          if (key === "d") return duplicateSelection(), true;
          if (key === "s") return void saveToFile(), true;
          if (key === "o") return requestOpenFile(), true;
          if (key === "e" && event.shiftKey) return setIsExportOpen(true), true;
          if (event.code === "BracketRight") return changeLayer(event.shiftKey ? "front" : "forward"), true;
          if (event.code === "BracketLeft") return changeLayer(event.shiftKey ? "back" : "backward"), true;
          if (key === "=" || key === "+") return zoomIn({ duration: ZOOM_ANIMATION_MS }), true;
          if (key === "-") return zoomOut({ duration: ZOOM_ANIMATION_MS }), true;
          if (key === "0") return resetZoomKeepingCenter(), true;
          return false;
        })();
        if (handled) event.preventDefault();
        return;
      }
      if (event.altKey) return;

      switch (event.key) {
        case "Escape":
          if (modeRef.current !== "select") setMode("select");
          else setNodes((previous) => deselectAll(previous));
          return;
        case "Delete":
        case "Backspace":
          if (hasSelection) {
            event.preventDefault();
            deleteSelection();
          }
          return;
        case "Enter": {
          const selectedNodes = nodesRef.current.filter((node) => node.selected);
          const [onlySelected] = selectedNodes;
          if (selectedNodes.length === 1 && (onlySelected.type === "shapeElement" || onlySelected.type === "textElement")) {
            event.preventDefault();
            startEditing(onlySelected.id);
          }
          return;
        }
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (!hasSelection || (event.target instanceof HTMLInputElement && event.target.type === "range")) return;
          event.preventDefault();
          const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
          const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          nudgeSelection(deltaX, deltaY);
          return;
        }
        case "/":
          event.preventDefault();
          commandInputRef.current?.focus();
          return;
        case "?":
          setIsShortcutsOpen(true);
          return;
        case "!":
          fitAll();
          return;
        case "@":
          zoomToSelection();
          return;
      }

      // Tab — toggle the persistent select/pan tool.
      if (event.code === "Tab" && !event.repeat) {
        event.preventDefault();
        const nextMode = modeRef.current === "select" ? "pan" : "select";
        setMode(nextMode);
        announceMode(MODE_LABEL[nextMode]);
        return;
      }

      // Space (held) — temporarily force pan mode.
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setIsSpaceDown(true);
          if (modeRef.current !== "pan") announceMode("Pan mode");
        }
        return;
      }

      // Shift+1 / Shift+2 arrive as "!" / "@" on US layouts (handled above);
      // `code` covers other layouts.
      if (event.shiftKey && event.code === "Digit1") return fitAll();
      if (event.shiftKey && event.code === "Digit2") return zoomToSelection();
      if (event.shiftKey || event.repeat) return;

      if (key === "q") {
        setIsToolLocked((locked) => !locked);
        return;
      }
      if (key === "9") {
        void promptForImages();
        return;
      }
      const toolMode = TOOL_SHORTCUTS[key];
      if (toolMode) setMode(toolMode);
    };

    keyUpHandlerRef.current = (event: KeyboardEvent) => {
      if (event.code === "Space" && spaceDownRef.current) {
        spaceDownRef.current = false;
        setIsSpaceDown(false);
        if (modeRef.current === "select") announceMode("Select mode");
      }
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyDownHandlerRef.current(event);
    const onKeyUp = (event: KeyboardEvent) => keyUpHandlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Clipboard — native copy/cut/paste events, so it works without
  // clipboard permissions and interoperates with other apps' text/images ──
  const clipboardHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});
  useEffect(() => {
    clipboardHandlerRef.current = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || isAnyDialogOpen || !event.clipboardData) return;
      if (event.type === "paste") {
        const position = getPastePosition();
        const files = Array.from(event.clipboardData.files);
        if (files.some(isImageFile)) {
          event.preventDefault();
          void insertImageFiles(files, position);
          return;
        }
        const text = event.clipboardData.getData("text/plain");
        const pastedNodes = parseClipboardText(text);
        if (pastedNodes && pastedNodes.length > 0) {
          event.preventDefault();
          const bounds = getBoxesBounds(pastedNodes.map(getNodeBox))!;
          insertNodes(
            cloneNodes(pastedNodes, {
              x: position.x - (bounds.x + bounds.width / 2),
              y: position.y - (bounds.y + bounds.height / 2),
            }),
          );
          return;
        }
        if (text.trim()) {
          event.preventDefault();
          createTextAt(position, text);
        }
        return;
      }
      const selectedNodes = resolveLineBindings(nodesRef.current).filter((node) => node.selected);
      if (selectedNodes.length === 0) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", createClipboardText(selectedNodes));
      if (event.type === "cut") deleteSelection();
    };
  });

  useEffect(() => {
    const onClipboardEvent = (event: ClipboardEvent) => clipboardHandlerRef.current(event);
    document.addEventListener("copy", onClipboardEvent);
    document.addEventListener("cut", onClipboardEvent);
    document.addEventListener("paste", onClipboardEvent);
    return () => {
      document.removeEventListener("copy", onClipboardEvent);
      document.removeEventListener("cut", onClipboardEvent);
      document.removeEventListener("paste", onClipboardEvent);
    };
  }, []);

  // ── Hydration — attaches derived values + interaction callbacks to each
  // node. Callbacks go through `nodeActionsRef`, so they can be created once
  // per node yet always reach the latest handlers. Hydrated nodes are cached
  // and reused while their source node and flags are unchanged: xyflow (and
  // the memoized node components) then skip re-rendering them. ──
  const nodeActions = {
    updateNodeData,
    stopEditing,
    resizeTextElement,
    moveLineEndpoint,
    clearBindingTarget: () => setBindingTargetId(null),
  };
  const nodeActionsRef = useRef(nodeActions);
  useEffect(() => {
    nodeActionsRef.current = nodeActions;
  });

  const hydrationCacheRef = useRef(new Map<string, { source: CanvasNode; flags: string; hydrated: HydratedCanvasNode }>());

  const flowNodes = useMemo<HydratedCanvasNode[]>(() => {
    const actions = nodeActionsRef;

    const hydrate = (source: CanvasNode, isEditing: boolean, isBindingTarget: boolean): HydratedCanvasNode => {
      // xyflow keeps a node visibility:hidden until it has measured it a
      // frame later — and a hidden element can't take focus, which made the
      // first keystrokes into a brand-new text element go missing. Known
      // initial dimensions let it render visible from the first frame.
      const { width: initialWidth, height: initialHeight } = getNodeBox(source);
      const node = { ...source, initialWidth, initialHeight };
      const id = node.id;
      const editingOverrides = isEditing ? { draggable: false } : {};
      switch (node.type) {
        case "textElement":
          return {
            ...node,
            ...editingOverrides,
            data: {
              ...node.data,
              isEditing,
              isBindingTarget,
              onTextChange: (text: string) =>
                actions.current.updateNodeData<TextElementNode>(id, "textElement", (current) => ({
                  data: { ...current.data, text },
                })),
              onStopEditing: () => actions.current.stopEditing(),
              onResizeElement: (width: number, x: number, y: number, handleKind: ResizeHandleKind) =>
                actions.current.resizeTextElement(id, width, x, y, handleKind),
            },
          };
        case "shapeElement":
          return {
            ...node,
            ...editingOverrides,
            // Unselected shapes are click-through except where their
            // stroke (or fill) is actually painted; see ShapeElement.
            style: node.selected ? undefined : { pointerEvents: "none" },
            data: {
              ...node.data,
              isEditing,
              isBindingTarget,
              onLabelChange: (label: string) =>
                actions.current.updateNodeData<ShapeElementNode>(id, "shapeElement", (current) => ({
                  data: { ...current.data, label },
                })),
              onStopEditing: () => actions.current.stopEditing(),
              onResizeElement: (width: number, height: number, x: number, y: number) =>
                actions.current.updateNodeData<ShapeElementNode>(id, "shapeElement", (current) => ({
                  position: { x, y },
                  data: { ...current.data, width, height },
                })),
            },
          };
        case "lineElement":
          return {
            ...node,
            style: { pointerEvents: "none" },
            data: {
              ...node.data,
              onEndpointDrag: (endpointIndex: 0 | 1, flowPoint: Point) =>
                actions.current.moveLineEndpoint(id, endpointIndex, flowPoint),
              onEndpointDragEnd: () => actions.current.clearBindingTarget(),
            },
          };
        case "imageElement":
          return {
            ...node,
            data: {
              ...node.data,
              isBindingTarget,
              onResizeElement: (width: number, height: number, x: number, y: number) =>
                actions.current.updateNodeData<ImageElementNode>(id, "imageElement", (current) => ({
                  position: { x, y },
                  data: { ...current.data, width, height },
                })),
            },
          };
        case "pictogramElement":
          return { ...node, data: { ...node.data, isBindingTarget } };
      }
    };

    const previousCache = hydrationCacheRef.current;
    const nextCache = new Map<string, { source: CanvasNode; flags: string; hydrated: HydratedCanvasNode }>();
    const hydrated = displayedNodes.map((node) => {
      const isEditing = editingId === node.id;
      const isBindingTarget = bindingTargetId === node.id;
      const flags = `${isEditing}|${isBindingTarget}`;
      const cached = previousCache.get(node.id);
      const result =
        cached && cached.source === node && cached.flags === flags ? cached.hydrated : hydrate(node, isEditing, isBindingTarget);
      nextCache.set(node.id, { source: node, flags, hydrated: result });
      return result;
    });
    hydrationCacheRef.current = nextCache;
    return hydrated;
  }, [displayedNodes, editingId, bindingTargetId]);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedCount = selectedNodes.length;

  // Style panel: the selection's elements, or a prototype of the active
  // drawing tool's element so its style can be chosen before drawing.
  const styleSources = useMemo<StyleSource[]>(() => {
    if (selectedNodes.length > 0) return selectedNodes.map((node) => node.data);
    if (mode === "rectangle" || mode === "ellipse" || mode === "diamond") return [pickStyle(currentStyle, SHAPE_STYLE_KEYS)];
    if (mode === "line" || mode === "arrow") return [pickStyle(currentStyle, LINE_STYLE_KEYS)];
    if (mode === "text") return [{ text: "", ...pickStyle(currentStyle, TEXT_STYLE_KEYS) }];
    return [];
  }, [selectedNodes, mode, currentStyle]);
  const isStylePanelVisible = styleSources.length > 0 || selectedCount > 0;
  const selectedPictograms = selectedNodes.filter((node): node is PictogramElementNode => node.type === "pictogramElement");
  const sharedPictogramIcon =
    selectedPictograms.length > 0 && selectedPictograms.every((node) => node.data.icon === selectedPictograms[0].data.icon) && isPictogramName(selectedPictograms[0].data.icon)
      ? selectedPictograms[0].data.icon
      : null;
  const pickPictogram = (icon: PictogramName) => {
    for (const node of selectedPictograms) {
      updateNodeData<PictogramElementNode>(node.id, "pictogramElement", (current) => ({ data: { ...current.data, icon } }));
    }
  };
  const sidebarWidth = chatWidth;
  const paneCursor = effectiveMode === "pan" ? "grab" : isCreationMode ? "crosshair" : "default";

  const onCanvasDragOver = (event: ReactDragEvent) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const onCanvasDrop = (event: ReactDragEvent) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void insertImageFiles(files, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  return (
    <div
      ref={themeRootRef}
      data-theme={theme}
      className="w-screen h-screen overflow-hidden relative bg-surface font-sans"
    >
      <Toolbox
        nodeCount={nodes.length}
        theme={theme}
        mode={effectiveMode}
        isToolLocked={isToolLocked}
        canUndo={history.canUndo && !isDrawing}
        canRedo={history.canRedo && !isDrawing}
        onSetMode={setMode}
        onToggleToolLock={() => setIsToolLocked((locked) => !locked)}
        onInsertImage={() => void promptForImages()}
        onUndo={history.undo}
        onRedo={history.redo}
        onToggleTheme={toggleTheme}
        onFitAll={fitAll}
        onZoomIn={() => zoomIn({ duration: ZOOM_ANIMATION_MS })}
        onZoomOut={() => zoomOut({ duration: ZOOM_ANIMATION_MS })}
        onZoomReset={resetZoomKeepingCenter}
        menuSlot={
          <MainMenu
            onOpenFile={requestOpenFile}
            onSaveFile={() => void saveToFile()}
            onExportImage={() => setIsExportOpen(true)}
            onClearCanvas={requestClearCanvas}
            onShowShortcuts={() => setIsShortcutsOpen(true)}
          />
        }
      />

      {isStylePanelVisible && (
        <StylePanel
          sources={styleSources}
          hasSelection={selectedCount > 0}
          onStyleChange={updateStyle}
          onBringToFront={() => changeLayer("front")}
          onBringForward={() => changeLayer("forward")}
          onSendBackward={() => changeLayer("backward")}
          onSendToBack={() => changeLayer("back")}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
          style={{ left: sidebarWidth + STYLE_PANEL_GUTTER, top: TOP_PANEL_CLEARANCE }}
        />
      )}

      {selectedPictograms.length > 0 && editingId === null && (
        <PictogramPanel currentIcon={sharedPictogramIcon} onPick={pickPictogram} style={{ right: STYLE_PANEL_GUTTER, top: TOP_PANEL_CLEARANCE }} />
      )}

      <ChatPanel
        isCollapsed={isChatCollapsed}
        onToggleCollapsed={() => setIsChatCollapsed((collapsed) => !collapsed)}
        projects={projects.projects}
        currentProject={projects.currentProject}
        onSelectProject={(projectId) => void projects.openProject(projectId)}
        onCreateProject={(title, workingFolder) => void projects.createProject(title, workingFolder)}
        onRenameProject={projects.renameProject}
        onChangeWorkingFolder={projects.setWorkingFolder}
        onDeleteProject={requestDeleteProject}
        messages={messages}
        status={diagram.status}
        draft={commandDraft}
        onDraftChange={setCommandDraft}
        onSubmit={() => requestDiagram(commandDraft)}
        onStop={diagram.stop}
        onUndoResult={undoLastDiagram}
        onRetry={retryLastDiagram}
        onDismissStatus={diagram.dismiss}
        claudeCode={claudeCode}
        onRecheckClaudeCode={() => void recheckClaudeCode()}
        model={modelChoice}
        onModelChange={changeModel}
        kind={kindChoice}
        onKindChange={changeKind}
        editTargetName={editTarget?.name ?? null}
        onClearEditTarget={clearEditTarget}
        onShowArtboard={showArtboard}
        onEditArtboard={editArtboard}
        inputRef={commandInputRef}
      />

      {/* ── Canvas area — full-bleed; the toolbox floats above it ──── */}
      <div
        ref={canvasWrapperRef}
        className={`absolute inset-0 overflow-hidden ${effectiveMode === "pan" ? "cc-pan-mode" : isCreationMode ? "cc-create-mode" : ""}`}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={onCanvasDoubleClick}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
        onPointerDownCapture={() => {
          // xyflow's pane swallows the mousedown default, so a focused
          // command bar would otherwise keep focus (and eat Delete/shortcut
          // keys) after clicking the canvas.
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && isEditableTarget(focused) && !canvasWrapperRef.current?.contains(focused)) {
            focused.blur();
          }
        }}
        onPointerMove={(event) => {
          lastPointerFlowPositionRef.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        }}
        onPointerLeave={() => {
          lastPointerFlowPositionRef.current = null;
        }}
      >
        <ReactFlow<CanvasNode, Edge>
          nodes={flowNodes}
          edges={NO_EDGES}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDragStart={onNodeDragStart}
          onSelectionDragStart={onSelectionDragStart}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onMoveStart={(event) => {
            // A programmatic setViewport passes no event; only the user's
            // own panning pauses the follow-along.
            if (event) lastUserViewportChangeAtRef.current = Date.now();
          }}
          onMoveEnd={projects.scheduleSave}
          connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
          style={{ cursor: paneCursor }}
          minZoom={SCALE_MIN}
          maxZoom={SCALE_MAX}
          panOnDrag={effectiveMode === "pan" ? [0, 1] : isDragMode ? false : [1]}
          panOnScroll
          panOnScrollSpeed={PAN_ON_SCROLL_SPEED}
          zoomOnScroll={false}
          nodesDraggable={effectiveMode === "select"}
          elementsSelectable={!isCreationMode}
          selectionOnDrag={effectiveMode === "select"}
          selectionKeyCode={null}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          nodesConnectable
          connectionMode={ConnectionMode.Loose}
          // Click-a-handle-then-another connecting surprised people who were
          // only clicking an edge midpoint to select; dragging still connects.
          connectOnClick={false}
          // Off deliberately — xyflow's default temporarily bumps a
          // selected/dragged node's stacking above everything else, which
          // would override the explicit layer ordering the moment it's
          // touched. With this off, a node's zIndex (set only by the layer
          // actions and on creation) is the sole thing governing stacking.
          elevateNodesOnSelect={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.5}
            color="var(--color-canvas-dot)"
          />
          {workingMarkerPhase && diagramOrigin && (
            <WorkingMarker
              position={{ x: diagramOrigin.x, y: diagramOrigin.y - WORKING_MARKER_LIFT }}
              phase={workingMarkerPhase}
              onCancel={diagram.stop}
              onFadeEnd={() => setWorkingMarkerPhase(null)}
            />
          )}
        </ReactFlow>

        {/* Live preview while dragging out a new shape/line/arrow */}
        {drawPreview && <DrawPreviewOverlay preview={drawPreview} />}
      </div>

      {/* Selection count badge */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-[110px] right-5 z-[200] flex items-center gap-2
                        px-3.5 py-1.5 rounded-full text-xs font-semibold
                        bg-surface-overlay border border-accent text-foreground"
        >
          <FontAwesomeIcon icon={faLayerGroup} className="text-accent w-3 h-3" />
          {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
          <button
            onClick={() => setNodes((previous) => deselectAll(previous))}
            aria-label="Clear selection"
            className="text-foreground-muted bg-transparent border-none cursor-pointer hover:text-foreground transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Mode-switch toast — fades in, holds, fades out */}
      {modeToast && (
        <div
          key={modeToast.id}
          onAnimationEnd={() => setModeToast((toast) => (toast && toast.id === modeToast.id ? null : toast))}
          className="fixed left-1/2 z-[1500] pointer-events-none
                     px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-accent
                     animate-mode-toast"
          style={{ top: TOP_PANEL_CLEARANCE }}
        >
          {modeToast.text}
        </div>
      )}

      {/* Notices — confirmations and errors */}
      {notice && (
        <div
          key={notice.id}
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fixed left-1/2 -translate-x-1/2 bottom-[120px] z-[1600] flex items-center gap-2 max-w-[560px]
                      px-4 py-2 rounded-xl text-[13px] font-medium animate-node-in border
                      ${notice.tone === "error" ? "bg-surface-overlay border-accent text-foreground" : "bg-surface-overlay border-border text-foreground"}`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="text-foreground-muted bg-transparent border-none cursor-pointer hover:text-foreground"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {projects.isReady && nodes.length === 0 && diagram.status.phase === "idle" && (
        <CanvasEmptyState projectTitle={projectTitle} style={{ marginLeft: sidebarWidth / 2 }} />
      )}

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <ExportDialog
        isOpen={isExportOpen}
        hasSelection={selectedCount > 0}
        isExporting={isExporting}
        onClose={() => setIsExportOpen(false)}
        onExport={(settings) => void exportImage(settings)}
      />
      <ShortcutsDialog isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
}


const SHAPE_PREVIEW_CORNER_RADIUS = 8;

// Live outline shown while dragging out a new shape/line/arrow, in the
// canvas wrapper's own screen space. Subscribes to the viewport itself so
// pan/zoom re-renders only this overlay, not the whole canvas.
function DrawPreviewOverlay({ preview: flowPreview }: { preview: DrawPreview }) {
  const viewport = useViewport();
  const preview = {
    kind: flowPreview.kind,
    x1: flowPreview.start.x * viewport.zoom + viewport.x,
    y1: flowPreview.start.y * viewport.zoom + viewport.y,
    x2: flowPreview.end.x * viewport.zoom + viewport.x,
    y2: flowPreview.end.y * viewport.zoom + viewport.y,
  };
  const isLineKind = preview.kind === "line" || preview.kind === "arrow";
  const x = Math.min(preview.x1, preview.x2);
  const y = Math.min(preview.y1, preview.y2);
  const width = Math.abs(preview.x2 - preview.x1);
  const height = Math.abs(preview.y2 - preview.y1);

  return (
    <svg className="absolute inset-0 pointer-events-none z-[500]" width="100%" height="100%">
      <defs>
        <marker id="arrow-preview" markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill="var(--color-accent)" />
        </marker>
      </defs>
      {isLineKind ? (
        <line
          x1={preview.x1}
          y1={preview.y1}
          x2={preview.x2}
          y2={preview.y2}
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
          markerEnd={preview.kind === "arrow" ? "url(#arrow-preview)" : undefined}
        />
      ) : preview.kind === "diamond" ? (
        <polygon
          points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={preview.kind === "ellipse" ? width / 2 : SHAPE_PREVIEW_CORNER_RADIUS}
          ry={preview.kind === "ellipse" ? height / 2 : SHAPE_PREVIEW_CORNER_RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}
