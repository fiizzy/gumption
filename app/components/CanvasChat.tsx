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
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeBranch, faLayerGroup, faXmark } from "@fortawesome/free-solid-svg-icons";
import ConversationNodeComponent from "./ConversationNode";
import ShapeElementComponent from "./ShapeElement";
import TextElementComponent from "./TextElement";
import LineElementComponent from "./LineElement";
import ImageElementComponent from "./ImageElement";
import { BranchEdgeComponent, CanvasEdgeMarkerDefs } from "./CanvasEdges";
import ChatInput from "./ChatInput";
import Joystick from "./Joystick";
import Toolbox from "./Toolbox";
import type { DrawingMode, Mode } from "./Toolbox";
import StylePanel, { type StyleSource } from "./StylePanel";
import MainMenu from "./MainMenu";
import ConfirmDialog, { type ConfirmRequest } from "./ConfirmDialog";
import ExportDialog, { type ExportSettings } from "./ExportDialog";
import ShortcutsDialog from "./ShortcutsDialog";
import MarkdownContent from "./MarkdownContent";
import CopyButton from "./CopyButton";
import { ANCHOR_HANDLE_PREFIX } from "./AnchorHandles";
import ProjectsSidebar, { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "./ProjectsSidebar";
import { DEFAULT_COLOR, SWATCHES } from "../lib/color";
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
  getLineEndpoints,
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
  BranchEdge,
  CanvasNode,
  ConversationNode as ConversationNodeState,
  ElementStyle,
  Harness,
  HydratedCanvasNode,
  ImageElementNode,
  LineElementNode,
  LineKind,
  Point,
  ResizeHandleKind,
  ShapeElementNode,
  ShapeKind,
  TextElementNode,
} from "../types";
import { simulateAI } from "../lib/ai";
import { invoke } from "@tauri-apps/api/core";

const NODE_W = 380;
const NODE_H_EST = 220;
const SCALE_MIN = 0.1;
const SCALE_MAX = 4;
const SHAPE_DEFAULT_SIZE = 140;
const SHAPE_MIN_DRAG_SIZE = 8;
const CONVERSATION_DEFAULT_HEIGHT = 260;
const TOP_PANEL_CLEARANCE = 80; // clears the floating toolbox (top-4 + its own height)
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
const FIT_SELECTION_PADDING = 0.2;
const FIT_SELECTION_MAX_ZOOM = 2;
const NOTICE_DURATION_MS = 4000;
const THEME_STORAGE_KEY = "canvas-chat:theme";
const BRANCH_GAP = 52;
const FREE_SPOT_GAP = 24;
const FREE_SPOT_MAX_TRIES = 200;
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

const CANVAS_FILE_FILTER: FileTypeFilter = {
  name: "Canvas Chat",
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
// and re-warns if nodeTypes/edgeTypes objects change identity every pass.
const nodeTypes = {
  conversation: ConversationNodeComponent,
  textElement: TextElementComponent,
  shapeElement: ShapeElementComponent,
  lineElement: LineElementComponent,
  imageElement: ImageElementComponent,
};
const edgeTypes = {
  branch: BranchEdgeComponent,
};

interface ModalContent {
  prompt: string;
  response: string;
  parentPrompt?: string;
}

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

function readStoredTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function CanvasChat() {
  return (
    <ReactFlowProvider>
      <CanvasChatInner />
    </ReactFlowProvider>
  );
}

function CanvasChatInner() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [selectedHarness, setSelectedHarness] = useState<Harness>("claude");
  const [isProjectsSidebarCollapsed, setIsProjectsSidebarCollapsed] = useState(false);
  const [modal, setModal] = useState<ModalContent | null>(null);
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

  // Bound line endpoints are derived from their targets' current geometry;
  // everything downstream (rendering, export, copy, save) reads this.
  const resolvedNodes = useMemo(() => resolveLineBindings(nodes), [nodes]);

  const themeRootRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const lastPointerFlowPositionRef = useRef<Point | null>(null);
  // Chat nodes whose AI request is still running — a saved "loading" node is
  // only treated as interrupted when its request isn't among these.
  const inFlightRequestIdsRef = useRef(new Set<string>());

  const {
    getNode,
    getNodes,
    getViewport,
    setViewport,
    screenToFlowPosition,
    zoomIn,
    zoomOut,
    fitView,
  } = useReactFlow<CanvasNode, BranchEdge>();
  const viewport = useViewport(); // reactive — drives the zoom readout and draw preview

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

  const history = useCanvasHistory({ nodes, setNodes, isEditing: editingId !== null });

  // ── Projects / persistence ────────────────────────────────────
  const applyDocument = useCallback(
    (document: CanvasDocument) => {
      setNodes(document.nodes);
      history.reset(document.nodes);
      setActiveNodeId(null);
      setEditingId(null);
      setModal(null);
      setViewport(document.viewport ?? { x: 0, y: 0, zoom: 1 });
    },
    [history, setViewport],
  );

  const projects = useProjects({
    getSnapshot: () => ({ nodes: nodesRef.current, viewport: getViewport() }),
    applyDocument,
    isRequestInFlight: (nodeId) => inFlightRequestIdsRef.current.has(nodeId),
    onError: (message) => notify(message, "error"),
  });
  const { notifyNodesChanged } = projects;

  useEffect(() => {
    if (projects.isReady) notifyNodesChanged(nodes);
  }, [nodes, projects.isReady, notifyNodesChanged]);

  const canvasWrapperCenter = useCallback(() => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    return {
      centerX: (rect?.width ?? window.innerWidth) / 2,
      centerY: (rect?.height ?? window.innerHeight) / 2,
    };
  }, []);

  const getViewportCenterFlowPosition = useCallback((): Point => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [screenToFlowPosition]);

  // Falls back to the estimated card size before a node has been measured
  // (e.g. the instant it's created, one render before layout settles).
  const getNodeDims = useCallback(
    (id: string) => {
      const node = getNode(id);
      return {
        w: node?.measured?.width ?? NODE_W,
        h: node?.measured?.height ?? NODE_H_EST,
      };
    },
    [getNode],
  );

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
  const centerOn = useCallback(
    (worldX: number, worldY: number) => {
      const { centerX, centerY } = canvasWrapperCenter();
      const zoom = getViewport().zoom;
      setViewport(
        {
          x: centerX - (worldX + NODE_W / 2) * zoom,
          y: centerY - (worldY + NODE_H_EST / 2) * zoom,
          zoom,
        },
        { duration: VIEWPORT_ANIMATION_MS },
      );
    },
    [canvasWrapperCenter, getViewport, setViewport],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) return;
      const { w, h } = getNodeDims(nodeId);
      const { centerX, centerY } = canvasWrapperCenter();
      setViewport(
        {
          x: centerX - (node.position.x + w / 2),
          y: centerY - (node.position.y + h / 2),
          zoom: 1,
        },
        { duration: VIEWPORT_ANIMATION_MS },
      );
    },
    [getNode, getNodeDims, canvasWrapperCenter, setViewport],
  );

  // Centres the centroid of all nodes at 100% zoom (deliberately not
  // xyflow's bounding-box fitView — this keeps the original fit-all feel).
  const fitAll = useCallback(() => {
    const allNodes = getNodes();
    if (!allNodes.length) return;
    let centroidSumX = 0;
    let centroidSumY = 0;
    allNodes.forEach((node) => {
      const { w, h } = getNodeDims(node.id);
      centroidSumX += node.position.x + w / 2;
      centroidSumY += node.position.y + h / 2;
    });
    const centroidX = centroidSumX / allNodes.length;
    const centroidY = centroidSumY / allNodes.length;
    const { centerX, centerY } = canvasWrapperCenter();
    setViewport(
      { x: centerX - centroidX, y: centerY - centroidY, zoom: 1 },
      { duration: VIEWPORT_ANIMATION_MS },
    );
  }, [getNodes, getNodeDims, canvasWrapperCenter, setViewport]);

  const zoomToSelection = useCallback(() => {
    const selectedNodes = nodesRef.current.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;
    void fitView({
      nodes: selectedNodes.map((node) => ({ id: node.id })),
      padding: FIT_SELECTION_PADDING,
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
      const deletedIds = new Set(previous.filter((node) => node.selected).map((node) => node.id));
      if (deletedIds.size === 0) return previous;
      const detached = detachLineBindings(
        previous,
        (line, binding) => deletedIds.has(binding.elementId) && !deletedIds.has(line.id),
      );
      return detached.filter((node) => !deletedIds.has(node.id));
    });
  }, []);

  const duplicateSelection = useCallback(() => {
    const selectedNodes = resolveLineBindings(nodesRef.current).filter((node) => node.selected);
    insertNodes(cloneNodes(selectedNodes, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }));
  }, [insertNodes]);

  const selectAll = useCallback(() => {
    setNodes((previous) =>
      previous.map((node) => (node.selected ? node : ({ ...node, selected: true } as CanvasNode))),
    );
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
      const selectedIds = new Set(nodesRef.current.filter((node) => node.selected).map((node) => node.id));
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
        if (!node.selected || node.type === "conversation") return node;
        const applicableEntries = Object.entries(patch).filter(([key]) => key in node.data);
        if (applicableEntries.length === 0) return node;
        return { ...node, data: { ...node.data, ...Object.fromEntries(applicableEntries) } } as CanvasNode;
      }),
    );
  }, []);

  const updateCardColorForSelection = useCallback((color: string) => {
    setNodes((previous) =>
      previous.map((node) =>
        node.selected && node.type === "conversation" ? { ...node, data: { ...node.data, color } } : node,
      ),
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
      const { position, points } = getLineGeometry(start, end);
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

  // ── xyflow-driven node changes: position (drag), measured size, selection ──
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    // Element sizes come from `data`; letting the resizer also pin xyflow's
    // own width/height would freeze intrinsic sizes (e.g. text height).
    const sanitizedChanges = changes.map((change) =>
      change.type === "dimensions" && change.setAttributes ? { ...change, setAttributes: false } : change,
    );
    setNodes((previous) => applyNodeChanges(sanitizedChanges, previous));
  }, []);

  const onNodeDragStart = useCallback(
    (_event: unknown, _node: Node, draggedNodes: Node[]) => {
      detachLinesMovedApart(new Set(draggedNodes.map((node) => node.id)));
    },
    [detachLinesMovedApart],
  );
  const onSelectionDragStart = useCallback(
    (_event: unknown, draggedNodes: Node[]) => {
      detachLinesMovedApart(new Set(draggedNodes.map((node) => node.id)));
    },
    [detachLinesMovedApart],
  );

  // Chat nodes connect to each other only through branching (the separate
  // branchSource/branchTarget handles), never through drawn arrows.
  const isValidConnection = useCallback(
    (connection: Connection | BranchEdge) => {
      const { sourceHandle, targetHandle } = connection;
      if (typeof sourceHandle !== "string" || !sourceHandle.startsWith(ANCHOR_HANDLE_PREFIX)) return false;
      if (typeof targetHandle !== "string" || !targetHandle.startsWith(ANCHOR_HANDLE_PREFIX)) return false;
      if (connection.source === connection.target) return false;
      const sourceType = getNode(connection.source)?.type;
      const targetType = getNode(connection.target)?.type;
      return !(sourceType === "conversation" && targetType === "conversation");
    },
    [getNode],
  );

  // Dragging between two anchor handles draws an arrow bound at both ends.
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodesRef.current.find((node) => node.id === connection.source);
      const targetNode = nodesRef.current.find((node) => node.id === connection.target);
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
    [createLine],
  );

  const moveLineEndpoint = useCallback(
    (lineId: string, endpointIndex: 0 | 1, flowPoint: Point) => {
      const currentNodes = nodesRef.current;
      const line = resolveLineBindings(currentNodes).find(
        (node): node is LineElementNode => node.id === lineId && node.type === "lineElement",
      );
      if (!line) return;
      const otherBinding = endpointIndex === 0 ? line.data.endBinding : line.data.startBinding;
      const excludedIds = new Set([lineId, ...(otherBinding ? [otherBinding.elementId] : [])]);
      const candidate = findBindingAt(flowPoint, currentNodes, excludedIds, getSnapRadius());
      setBindingTargetId(candidate?.binding.elementId ?? null);
      const endpoints = getLineEndpoints(line);
      endpoints[endpointIndex] = candidate?.point ?? flowPoint;
      const { position, points } = getLineGeometry(endpoints[0], endpoints[1]);
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
    [getSnapRadius, updateNodeData],
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (mode === "text") {
        const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const textUnderPointer = sortTopmostFirst(nodesRef.current).find((node) => {
          if (node.type !== "textElement") return false;
          const box = getNodeBox(node);
          return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
        });
        const target = textUnderPointer ?? findTopmostShapeAt(point, nodesRef.current);
        if (target) startEditing(target.id);
        else createTextAt(point);
        finishCreation();
        return;
      }
      setNodes((previous) => deselectAll(previous));
    },
    [mode, screenToFlowPosition, startEditing, createTextAt, finishCreation],
  );

  // Double-clicking empty canvas adds text there; inside a shape (even a
  // transparent one, whose interior is click-through) it edits the label.
  const onCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (effectiveMode !== "select") return;
      if ((event.target as Element).closest(".react-flow__node")) return;
      if (!(event.target as Element).closest(".react-flow__pane")) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const shape = findTopmostShapeAt(point, nodesRef.current);
      if (shape) startEditing(shape.id);
      else createTextAt(point);
    },
    [effectiveMode, screenToFlowPosition, startEditing, createTextAt],
  );

  const onNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      if (node.type === "shapeElement" || node.type === "textElement") startEditing(node.id);
    },
    [startEditing],
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
        ? findBindingAt(startRaw, nodesRef.current, EMPTY_ID_SET, snapRadius)
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
          endCandidate = findBindingAt(raw, nodesRef.current, excludedIds, snapRadius);
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
  }, [isDragMode, effectiveMode, screenToFlowPosition, getSnapRadius, createLine, createShape, finishCreation]);

  // ── Add a chat node + call the AI ───────────────────────────────
  //
  // Branching is the only way conversation nodes ever connect. `activeNodeId`
  // carries the just-created node forward automatically so simply continuing
  // to type keeps branching from — and flowing straight down from — whatever
  // you last sent. Explicitly clicking "Branch" on an older node (or clearing
  // the active node) is what redirects or detaches that default.
  const findFreeSpot = useCallback(
    (x: number, y: number, w: number, h: number) => {
      let nextY = y;
      for (let tries = 0; tries < FREE_SPOT_MAX_TRIES; tries++) {
        const collides = nodesRef.current.some((node) => {
          if (node.type !== "conversation") return false;
          const { w: nodeW, h: nodeH } = getNodeDims(node.id);
          return (
            x < node.position.x + nodeW + FREE_SPOT_GAP &&
            x + w + FREE_SPOT_GAP > node.position.x &&
            nextY < node.position.y + nodeH + FREE_SPOT_GAP &&
            nextY + h + FREE_SPOT_GAP > node.position.y
          );
        });
        if (!collides) break;
        nextY += NODE_H_EST + FREE_SPOT_GAP;
      }
      return { x, y: nextY };
    },
    [getNodeDims],
  );

  const addConversationNode = async (prompt: string) => {
    const nodeId = crypto.randomUUID();
    const conversationNodes = nodesRef.current.filter(
      (node): node is ConversationNodeState => node.type === "conversation",
    );
    const lastConversationNode = conversationNodes[conversationNodes.length - 1];
    const branchParentNode = activeNodeId
      ? conversationNodes.find((node) => node.id === activeNodeId)
      : undefined;

    let x: number, y: number;
    if (branchParentNode && branchParentNode.id !== lastConversationNode?.id) {
      // Explicit fork off an earlier node — branch out to the side.
      const { w: parentW } = getNodeDims(branchParentNode.id);
      const siblingCount = conversationNodes.filter(
        (node) => node.data.branchParentId === branchParentNode.id,
      ).length;
      x = branchParentNode.position.x + parentW + BRANCH_GAP;
      y = branchParentNode.position.y + siblingCount * (NODE_H_EST + FREE_SPOT_GAP);
    } else if (branchParentNode) {
      // Continuing straight from the most recent node — keep flowing downward.
      const { h: parentH } = getNodeDims(branchParentNode.id);
      x = branchParentNode.position.x;
      y = branchParentNode.position.y + parentH + BRANCH_GAP;
    } else {
      // No active thread — a fresh, untethered conversation.
      const center = getViewportCenterFlowPosition();
      x = center.x - NODE_W / 2;
      y = center.y - NODE_H_EST / 2;
    }
    ({ x, y } = findFreeSpot(x, y, NODE_W, NODE_H_EST));

    insertNodes([
      {
        id: nodeId,
        type: "conversation",
        position: { x, y },
        data: {
          prompt,
          response: "",
          loading: true,
          minimized: false,
          color: branchParentNode?.data.color ?? DEFAULT_COLOR,
          branchParentId: branchParentNode?.id ?? null,
          width: branchParentNode?.data.width ?? NODE_W,
          height: branchParentNode?.data.height ?? CONVERSATION_DEFAULT_HEIGHT,
        },
      },
    ]);
    setActiveNodeId(nodeId);
    centerOn(x, y);

    const requestProjectId = projects.currentProjectIdRef.current;
    inFlightRequestIdsRef.current.add(nodeId);
    let response: string;
    try {
      response = await simulateAI(
        prompt,
        branchParentNode?.data.prompt,
        branchParentNode?.data.response,
        projects.currentProject?.workingFolder,
      );
    } catch (error) {
      response = `⚠ ${errorMessage(error)}`;
    }
    inFlightRequestIdsRef.current.delete(nodeId);

    const applyResponse = (node: CanvasNode): CanvasNode["data"] =>
      node.type === "conversation" ? { ...node.data, response, loading: false } : node.data;
    if (requestProjectId === projects.currentProjectIdRef.current) {
      history.patchNodeEverywhere(nodeId, applyResponse);
    } else if (requestProjectId) {
      void projects.updateStoredNode(requestProjectId, nodeId, applyResponse);
    }
  };

  // A deleted (or undone) active node can't be branched from any more.
  useEffect(() => {
    if (activeNodeId && !nodes.some((node) => node.id === activeNodeId)) setActiveNodeId(null);
  }, [nodes, activeNodeId]);

  useEffect(() => {
    if (editingId && !nodes.some((node) => node.id === editingId)) setEditingId(null);
  }, [nodes, editingId]);

  // ── File operations ───────────────────────────────────────────
  const projectTitle = projects.currentProject?.title ?? DEFAULT_PROJECT_TITLE;

  const saveToFile = useCallback(async () => {
    try {
      const document = createCanvasDocument(resolveLineBindings(nodesRef.current), getViewport());
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
      setActiveNodeId(null);
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
      message: "Remove every element and chat from this canvas? You can undo it afterwards with Ctrl+Z.",
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

  // Branch edges are part of the export only when both of their chat nodes are.
  const branchEdges = useMemo<BranchEdge[]>(() => {
    const existingIds = new Set(nodes.map((node) => node.id));
    return nodes.flatMap((node): BranchEdge[] =>
      node.type === "conversation" && node.data.branchParentId && existingIds.has(node.data.branchParentId)
        ? [
            {
              id: `branch-${node.id}`,
              type: "branch",
              source: node.data.branchParentId,
              sourceHandle: "branchSource",
              target: node.id,
              targetHandle: "branchTarget",
              selectable: false,
              deletable: false,
              data: {},
            },
          ]
        : [],
    );
  }, [nodes]);

  const exportImage = useCallback(
    async (settings: ExportSettings) => {
      const viewportElement = canvasWrapperRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
      const allNodes = resolveLineBindings(nodesRef.current);
      const exportedNodes = settings.isSelectionOnly ? allNodes.filter((node) => node.selected) : allNodes;
      const bounds: Box | null = getBoxesBounds(exportedNodes.map(getNodeBox));
      if (!viewportElement || !bounds) {
        notify("There's nothing to export yet.", "error");
        return;
      }
      const exportedIds = new Set(exportedNodes.map((node) => node.id));
      const exportedEdgeIds = new Set(
        branchEdges
          .filter((edge) => exportedIds.has(edge.source) && exportedIds.has(edge.target))
          .map((edge) => edge.id),
      );
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
            if (element.classList.contains("react-flow__edge")) return exportedEdgeIds.has(element.getAttribute("data-id") ?? "");
            const labelEdgeId = element.getAttribute("data-edge-id");
            return labelEdgeId === null || exportedEdgeIds.has(labelEdgeId);
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
    [branchEdges, notify, projectTitle],
  );

  const isAnyDialogOpen = modal !== null || confirmRequest !== null || isExportOpen || isShortcutsOpen;

  // ── Keyboard shortcuts ─────────────────────────────────────────
  // Handlers read the latest closures through a ref so the window
  // listeners are registered once rather than on every render.
  const keyDownHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const keyUpHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyDownHandlerRef.current = (event: KeyboardEvent) => {
      if (isAnyDialogOpen) {
        if (event.key === "Escape") setModal(null);
        return;
      }
      if (isEditableTarget(event.target)) return;

      const isModifierPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const hasSelection = nodesRef.current.some((node) => node.selected);

      if (isModifierPressed) {
        const handled = (() => {
          if (key === "z" && !event.shiftKey) return history.undo(), true;
          if ((key === "z" && event.shiftKey) || key === "y") return history.redo(), true;
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

  // ── Hydration — attaches derived values + interaction callbacks fresh
  // every render, so nothing captured in persisted state can go stale ──
  const flowNodes = useMemo<HydratedCanvasNode[]>(
    () =>
      resolvedNodes.map((node): HydratedCanvasNode => {
        const isEditing = editingId === node.id;
        const isBindingTarget = bindingTargetId === node.id;
        const editingOverrides = isEditing ? { draggable: false } : {};
        // xyflow keeps a node visibility:hidden until it has measured it a
        // frame later — and a hidden element can't take focus, which made the
        // first keystrokes into a brand-new text element go missing. Known
        // initial dimensions let it render visible from the first frame.
        const { width: initialWidth, height: initialHeight } = getNodeBox(node);
        node = { ...node, initialWidth, initialHeight };
        switch (node.type) {
          case "conversation": {
            const branchParentNode = node.data.branchParentId
              ? resolvedNodes.find((candidate) => candidate.id === node.data.branchParentId)
              : undefined;
            const branchParentPromptPreview =
              branchParentNode?.type === "conversation" ? branchParentNode.data.prompt : undefined;
            return {
              ...node,
              dragHandle: ".drag-handle",
              data: {
                ...node.data,
                branchParentPromptPreview,
                isBranchActive: activeNodeId === node.id,
                isBindingTarget,
                onToggleBranch: () => setActiveNodeId((previous) => (previous === node.id ? null : node.id)),
                onFocusNode: () => focusNode(node.id),
                onExpandNode: () =>
                  setModal({
                    prompt: node.data.prompt,
                    response: node.data.response,
                    parentPrompt: branchParentPromptPreview,
                  }),
                onColorChange: (color: string) =>
                  updateNodeData<ConversationNodeState>(node.id, "conversation", (current) => ({
                    data: { ...current.data, color },
                  })),
                onToggleMinimize: () =>
                  updateNodeData<ConversationNodeState>(node.id, "conversation", (current) => ({
                    data: { ...current.data, minimized: !current.data.minimized },
                  })),
                onResizeElement: (width: number, height: number, x: number, y: number) =>
                  updateNodeData<ConversationNodeState>(node.id, "conversation", (current) => ({
                    position: { x, y },
                    data: { ...current.data, width, height },
                  })),
              },
            };
          }
          case "textElement":
            return {
              ...node,
              ...editingOverrides,
              data: {
                ...node.data,
                isEditing,
                isBindingTarget,
                onTextChange: (text: string) =>
                  updateNodeData<TextElementNode>(node.id, "textElement", (current) => ({
                    data: { ...current.data, text },
                  })),
                onStopEditing: stopEditing,
                onResizeElement: (width: number, x: number, y: number, handleKind: ResizeHandleKind) =>
                  resizeTextElement(node.id, width, x, y, handleKind),
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
                  updateNodeData<ShapeElementNode>(node.id, "shapeElement", (current) => ({
                    data: { ...current.data, label },
                  })),
                onStopEditing: stopEditing,
                onResizeElement: (width: number, height: number, x: number, y: number) =>
                  updateNodeData<ShapeElementNode>(node.id, "shapeElement", (current) => ({
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
                  moveLineEndpoint(node.id, endpointIndex, flowPoint),
                onEndpointDragEnd: () => setBindingTargetId(null),
              },
            };
          case "imageElement":
            return {
              ...node,
              data: {
                ...node.data,
                isBindingTarget,
                onResizeElement: (width: number, height: number, x: number, y: number) =>
                  updateNodeData<ImageElementNode>(node.id, "imageElement", (current) => ({
                    position: { x, y },
                    data: { ...current.data, width, height },
                  })),
              },
            };
        }
      }),
    [
      resolvedNodes,
      editingId,
      bindingTargetId,
      activeNodeId,
      focusNode,
      updateNodeData,
      stopEditing,
      resizeTextElement,
      moveLineEndpoint,
    ],
  );

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedCount = selectedNodes.length;
  const activeNode = activeNodeId ? nodes.find((node) => node.id === activeNodeId) : undefined;
  const activeNodePrompt = activeNode?.type === "conversation" ? activeNode.data.prompt : undefined;

  // Style panel: the selection's elements, or a prototype of the active
  // drawing tool's element so its style can be chosen before drawing.
  const styleSources = useMemo<StyleSource[]>(() => {
    if (selectedNodes.length > 0) {
      return selectedNodes.filter((node) => node.type !== "conversation").map((node) => node.data);
    }
    if (mode === "rectangle" || mode === "ellipse" || mode === "diamond") return [pickStyle(currentStyle, SHAPE_STYLE_KEYS)];
    if (mode === "line" || mode === "arrow") return [pickStyle(currentStyle, LINE_STYLE_KEYS)];
    if (mode === "text") return [{ text: "", ...pickStyle(currentStyle, TEXT_STYLE_KEYS) }];
    return [];
  }, [selectedNodes, mode, currentStyle]);
  const selectedCardColor =
    selectedNodes.find((node): node is ConversationNodeState => node.type === "conversation")?.data.color ?? null;
  const isStylePanelVisible = styleSources.length > 0 || selectedCount > 0;
  const sidebarWidth = isProjectsSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const paneCursor = effectiveMode === "pan" ? "grab" : isCreationMode ? "crosshair" : "default";

  // Wrapper-relative screen coordinates for the live shape/line/arrow
  // preview — derived from flow coordinates and the (reactive) viewport.
  const drawPreviewScreen = drawPreview
    ? {
        kind: drawPreview.kind,
        x1: drawPreview.start.x * viewport.zoom + viewport.x,
        y1: drawPreview.start.y * viewport.zoom + viewport.y,
        x2: drawPreview.end.x * viewport.zoom + viewport.x,
        y2: drawPreview.end.y * viewport.zoom + viewport.y,
      }
    : null;

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
        scale={viewport.zoom}
        mode={effectiveMode}
        isToolLocked={isToolLocked}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
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
          cardColor={selectedCardColor}
          cardSwatches={SWATCHES}
          hasSelection={selectedCount > 0}
          onStyleChange={updateStyle}
          onCardColorChange={updateCardColorForSelection}
          onBringToFront={() => changeLayer("front")}
          onBringForward={() => changeLayer("forward")}
          onSendBackward={() => changeLayer("backward")}
          onSendToBack={() => changeLayer("back")}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
          style={{ left: sidebarWidth + STYLE_PANEL_GUTTER, top: TOP_PANEL_CLEARANCE }}
        />
      )}

      <ProjectsSidebar
        isCollapsed={isProjectsSidebarCollapsed}
        onToggleCollapsed={() => setIsProjectsSidebarCollapsed((collapsed) => !collapsed)}
        harness={selectedHarness}
        onHarnessChange={setSelectedHarness}
        projects={projects.projects}
        currentProjectId={projects.currentProjectId}
        onSelectProject={(projectId) => void projects.openProject(projectId)}
        onCreateProject={(title, workingFolder) => void projects.createProject(title, workingFolder)}
        onRenameProject={projects.renameProject}
        onChangeWorkingFolder={projects.setWorkingFolder}
        onDeleteProject={requestDeleteProject}
      />

      {/* ── Canvas area — full-bleed; the toolbox floats above it ──── */}
      <div
        ref={canvasWrapperRef}
        className={`absolute top-0 right-0 bottom-0 overflow-hidden transition-[left] duration-200 ease-in-out ${
          effectiveMode === "pan" ? "cc-pan-mode" : isCreationMode ? "cc-create-mode" : ""
        }`}
        style={{ left: sidebarWidth }}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={onCanvasDoubleClick}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
        onPointerDownCapture={() => {
          // xyflow's pane swallows the mousedown default, so a focused chat
          // input would otherwise keep focus (and eat Delete/shortcut keys)
          // after clicking the canvas.
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
        <CanvasEdgeMarkerDefs />
        <ReactFlow<CanvasNode, BranchEdge>
          nodes={flowNodes}
          edges={branchEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDragStart={onNodeDragStart}
          onSelectionDragStart={onSelectionDragStart}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
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
        </ReactFlow>

        {/* Live preview while dragging out a new shape/line/arrow */}
        {drawPreviewScreen && <DrawPreviewOverlay preview={drawPreviewScreen} />}
      </div>

      {/* Selection count badge */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-[110px] right-5 z-[200] flex items-center gap-2
                        px-3.5 py-1.5 rounded-full text-xs font-semibold
                        bg-surface-overlay border border-accent text-foreground shadow-card"
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
                     shadow-card animate-mode-toast"
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
                      px-4 py-2 rounded-xl text-[13px] font-medium shadow-card animate-node-in border
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

      {/* Active branch badge */}
      {activeNodeId && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2
                     px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-accent shadow-card"
          style={{ top: TOP_PANEL_CLEARANCE }}
        >
          <FontAwesomeIcon icon={faCodeBranch} className="opacity-80 w-3 h-3" />
          Branch mode — type below to continue this thread
          <button
            onClick={() => setActiveNodeId(null)}
            aria-label="Stop branching"
            className="opacity-70 hover:opacity-100 transition-opacity bg-transparent border-none text-white cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {projects.isReady && nodes.length === 0 && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                        text-center pointer-events-none z-[1]"
          style={{ marginLeft: sidebarWidth / 2 }}
        >
          <div className="text-4xl text-foreground-muted mb-4">✦</div>
          <div className="text-lg font-semibold text-foreground-muted mb-2 tracking-tight">
            {projectTitle}
          </div>
          <div className="text-[13px] text-foreground-muted leading-7 max-w-[340px]">
            Type below to start a chat · pick a tool (or press{" "}
            <strong className="text-foreground font-semibold">R</strong>,{" "}
            <strong className="text-foreground font-semibold">A</strong>,{" "}
            <strong className="text-foreground font-semibold">T</strong>) to draw ·{" "}
            <strong className="text-foreground font-semibold">double-click</strong> to add text ·{" "}
            <strong className="text-foreground font-semibold">?</strong> for shortcuts
          </div>
        </div>
      )}

      <Joystick
        onPan={(deltaX, deltaY) => {
          const current = getViewport();
          setViewport({ x: current.x + deltaX, y: current.y + deltaY, zoom: current.zoom });
        }}
        onStart={() => {}}
        leftOffset={sidebarWidth}
      />

      <ChatInput
        activeNodeId={activeNodeId}
        activeNodePrompt={activeNodePrompt}
        onSubmit={(prompt) => void addConversationNode(prompt)}
        onClearActive={() => setActiveNodeId(null)}
      />

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <ExportDialog
        isOpen={isExportOpen}
        hasSelection={selectedCount > 0}
        isExporting={isExporting}
        onClose={() => setIsExportOpen(false)}
        onExport={(settings) => void exportImage(settings)}
      />
      <ShortcutsDialog isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* ── Full-content modal ─────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-8"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Full conversation"
            className="bg-surface-overlay border border-border rounded-2xl shadow-card-active
                       w-full max-w-2xl max-h-[80vh] flex flex-col font-sans"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <span className="text-sm font-semibold text-foreground tracking-tight">
                Full conversation
              </span>
              <button
                onClick={() => setModal(null)}
                aria-label="Close"
                className="text-foreground-muted hover:text-foreground
                           bg-transparent border-none cursor-pointer transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="cc-scroll overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
              {modal.parentPrompt && (
                <div
                  className="inline-flex items-center gap-1.5 text-xs text-foreground-muted
                                bg-surface-subtle border border-border rounded-full px-3 py-1 self-start"
                >
                  <FontAwesomeIcon icon={faCodeBranch} className="text-accent w-2.5 h-2.5" />
                  Branched from: &ldquo;{modal.parentPrompt.slice(0, 80)}
                  {modal.parentPrompt.length > 80 ? "…" : ""}&rdquo;
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-2">
                  You
                </p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {modal.prompt}
                </p>
              </div>

              <div className="h-px bg-border-subtle" />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent m-0">
                    AI
                  </p>
                  {modal.response && (
                    <CopyButton text={modal.response} className="text-foreground-muted hover:text-foreground" />
                  )}
                </div>
                {modal.response ? (
                  <MarkdownContent
                    content={modal.response}
                    className="text-sm text-foreground-muted leading-relaxed"
                  />
                ) : (
                  <p className="text-sm text-foreground-muted italic">
                    Still generating…
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DrawPreviewScreen {
  kind: DragDrawMode;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SHAPE_PREVIEW_CORNER_RADIUS = 8;

// Live outline shown while dragging out a new shape/line/arrow, in the
// canvas wrapper's own screen space.
function DrawPreviewOverlay({ preview }: { preview: DrawPreviewScreen }) {
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
