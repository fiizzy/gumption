"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  useViewport,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCodeBranch,
  faLayerGroup,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ConversationNodeComponent from "./ConversationNode";
import CanvasElementComponent from "./CanvasElement";
import LineElementComponent from "./LineElement";
import { BranchEdgeComponent, AnchorEdgeComponent, CanvasEdgeMarkerDefs } from "./CanvasEdges";
import ChatInput from "./ChatInput";
import Joystick from "./Joystick";
import Toolbox from "./Toolbox";
import type { Mode } from "./Toolbox";
import StylePanel from "./StylePanel";
import MarkdownContent from "./MarkdownContent";
import ProjectsSidebar, { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "./ProjectsSidebar";
import { DEFAULT_COLOR } from "../lib/color";
import type {
  CanvasNode,
  ConversationNode as ConversationNodeState,
  TextElementNode,
  ShapeElementNode,
  LineElementNode,
  HydratedCanvasNode,
  CanvasEdge,
  AnchorEdge,
  ShapeKind,
  StrokeStyle,
  FontWeight,
  Point,
  Harness,
} from "../types";
import { simulateAI } from "../lib/ai";
import { invoke } from "@tauri-apps/api/core";

const NODE_W = 380;
const NODE_H_EST = 220;
const SCALE_MIN = 0.1;
const SCALE_MAX = 4;
const SHAPE_DEFAULT_SIZE = 140;
const SHAPE_MIN_DRAG_SIZE = 24; // px, in flow space — floor for a drag-drawn shape's width/height
const CONVERSATION_DEFAULT_HEIGHT = 260;
const TOP_PANEL_CLEARANCE = 80; // clears the floating toolbox (top-4 + its own height)
const DRAG_COMMIT_THRESHOLD = 4; // px, in flow space — below this a drag is treated as an accidental click
const SNAP_RADIUS = 24; // px, in flow space — how close a line/arrow endpoint must be to a node anchor to snap to it
const TEXT_ELEMENT_DEFAULT_SIZE = { width: 200, height: 40 }; // starting size for a newly created text element
const TEXT_DEFAULT_FONT_SIZE = 16;
const TEXT_MIN_FONT_SIZE = 10; // floor so scaling a corner down never shrinks text to unreadable/zero

const MODE_LABEL: Record<Mode, string> = {
  select: "Select mode",
  pan: "Pan mode",
  text: "Text mode",
  "shape-square": "Square tool",
  "shape-circle": "Circle tool",
  "shape-diamond": "Diamond tool",
  line: "Line tool — click and drag",
  arrow: "Arrow tool — click and drag",
};

// Module-level so identity is stable across renders — xyflow re-measures
// and re-warns if nodeTypes/edgeTypes objects change identity every pass.
const nodeTypes = {
  conversation: ConversationNodeComponent,
  textElement: CanvasElementComponent,
  shapeElement: CanvasElementComponent,
  lineElement: LineElementComponent,
};
const edgeTypes = {
  branch: BranchEdgeComponent,
  anchor: AnchorEdgeComponent,
};

interface ModalContent {
  prompt: string;
  response: string;
  parentPrompt?: string;
}

type DrawKind = "line" | "arrow" | "shape-square" | "shape-circle" | "shape-diamond";

interface DrawPreview {
  kind: DrawKind;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
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
  const [linkEdges, setLinkEdges] = useState<AnchorEdge[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [selectedHarness, setSelectedHarness] = useState<Harness>("claude");
  const [isProjectsSidebarCollapsed, setIsProjectsSidebarCollapsed] =
    useState(false);
  const [modal, setModal] = useState<ModalContent | null>(null);
  const modalRef = useRef<ModalContent | null>(null);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);

  const nodesRef = useRef<CanvasNode[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const linkEdgesRef = useRef<AnchorEdge[]>([]);
  useEffect(() => {
    linkEdgesRef.current = linkEdges;
  }, [linkEdges]);

  // Keep the WebView2 window's native theme in sync with the app's own
  // light/dark toggle — a mismatch between the two is what caused typed
  // text to render inverted, since CSS color-scheme alone doesn't cover
  // WebView2's native control theming. No-ops harmlessly outside Tauri
  // (e.g. a plain browser preview), where this command doesn't exist.
  useEffect(() => {
    invoke("set_window_theme", { theme }).catch(() => {});
  }, [theme]);

  const {
    getNode,
    getNodes,
    getViewport,
    setViewport,
    screenToFlowPosition,
    flowToScreenPosition,
    zoomIn,
    zoomOut,
  } = useReactFlow<CanvasNode, CanvasEdge>();
  const { zoom: currentZoom } = useViewport(); // reactive — drives the Toolbox's live percentage readout

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const getContainerCenter = useCallback(() => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    return {
      centerX: (rect?.width ?? window.innerWidth) / 2,
      centerY: (rect?.height ?? window.innerHeight) / 2,
    };
  }, []);

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
  // `mode` is the persistent tool, toggled by Tab (or the toolbox).
  // Holding Space temporarily forces pan on top of it, then releases
  // back to `mode` — the two never fight because effectiveMode below
  // is the only thing the canvas actually reads.
  const [mode, setModeState] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const spaceDownRef = useRef(false);

  const effectiveMode: Mode = isSpaceDown ? "pan" : mode;
  const isTextMode = effectiveMode === "text";
  // Square/circle/diamond are drag-drawn (Figma-style: drag defines the
  // bounds, a plain click falls back to a default size) — same drag-gesture
  // machinery as line/arrow, just committing a different element shape.
  const isDragShapeMode =
    effectiveMode === "shape-square" ||
    effectiveMode === "shape-circle" ||
    effectiveMode === "shape-diamond";
  const isDrawLineMode = effectiveMode === "line" || effectiveMode === "arrow";
  const isDragMode = isDragShapeMode || isDrawLineMode;

  const [modeToast, setModeToast] = useState<{
    text: string;
    id: number;
  } | null>(null);
  const modeToastId = useRef(0);
  const announceMode = useCallback((text: string) => {
    modeToastId.current += 1;
    setModeToast({ text, id: modeToastId.current });
  }, []);

  const setMode = useCallback(
    (next: Mode) => {
      if (modeRef.current === next) return;
      modeRef.current = next;
      setModeState(next);
      if (!spaceDownRef.current) announceMode(MODE_LABEL[next]);
    },
    [announceMode],
  );

  const toggleMode = useCallback(() => {
    setMode(modeRef.current === "select" ? "pan" : "select");
  }, [setMode]);

  // ── Viewport navigation ──────────────────────────────────────
  const centerOn = useCallback(
    (worldX: number, worldY: number) => {
      const { centerX, centerY } = getContainerCenter();
      const zoom = getViewport().zoom;
      setViewport(
        {
          x: centerX - (worldX + NODE_W / 2) * zoom,
          y: centerY - (worldY + NODE_H_EST / 2) * zoom,
          zoom,
        },
        { duration: 500 },
      );
    },
    [getContainerCenter, getViewport, setViewport],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) return;
      const { w, h } = getNodeDims(nodeId);
      const { centerX, centerY } = getContainerCenter();
      setViewport(
        {
          x: centerX - (node.position.x + w / 2),
          y: centerY - (node.position.y + h / 2),
          zoom: 1,
        },
        { duration: 500 },
      );
    },
    [getNode, getNodeDims, getContainerCenter, setViewport],
  );

  // Centres the centroid of all nodes at 100% zoom (deliberately not
  // xyflow's bounding-box fitView — this keeps the original fit-all feel).
  const fitAll = useCallback(() => {
    const allNodes = getNodes();
    if (!allNodes.length) return;
    let centroidSumX = 0,
      centroidSumY = 0;
    allNodes.forEach((node) => {
      const { w, h } = getNodeDims(node.id);
      centroidSumX += node.position.x + w / 2;
      centroidSumY += node.position.y + h / 2;
    });
    const centroidX = centroidSumX / allNodes.length;
    const centroidY = centroidSumY / allNodes.length;
    const { centerX, centerY } = getContainerCenter();
    setViewport(
      { x: centerX - centroidX, y: centerY - centroidY, zoom: 1 },
      { duration: 500 },
    );
  }, [getNodes, getNodeDims, getContainerCenter, setViewport]);

  const resetZoomKeepingCenter = useCallback(() => {
    const { centerX, centerY } = getContainerCenter();
    const viewport = getViewport();
    setViewport(
      {
        x: centerX - (centerX - viewport.x) / viewport.zoom,
        y: centerY - (centerY - viewport.y) / viewport.zoom,
        zoom: 1,
      },
      { duration: 300 },
    );
  }, [getContainerCenter, getViewport, setViewport]);

  // ── Keyboard: zoom shortcuts + Tab-to-toggle-mode + hold-Space-to-pan + Delete ──
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }

      // Delete/Backspace — remove selected canvas elements (text/shape/line,
      // never chat nodes) and selected anchor connectors.
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !isTyping(event.target)
      ) {
        const deletableIds = nodesRef.current
          .filter((node) => node.selected && node.type !== "conversation")
          .map((node) => node.id);
        const selectedAnchorEdgeIds = linkEdgesRef.current
          .filter((edge) => edge.selected)
          .map((edge) => edge.id);
        if (deletableIds.length > 0 || selectedAnchorEdgeIds.length > 0) {
          event.preventDefault();
          if (deletableIds.length > 0) {
            setNodes((prev) =>
              prev.filter((node) => !deletableIds.includes(node.id)),
            );
          }
          if (selectedAnchorEdgeIds.length > 0) {
            setLinkEdges((prev) =>
              prev.filter((edge) => !selectedAnchorEdgeIds.includes(edge.id)),
            );
          }
        }
        return;
      }

      // Tab — toggle the persistent select/pan tool; skip if user is typing in a form field
      if (event.code === "Tab" && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        toggleMode();
        return;
      }

      // Space (held) — temporarily force pan mode; skip if user is typing in a form field
      if (event.code === "Space" && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setIsSpaceDown(true);
          if (modeRef.current !== "pan") announceMode("Pan mode");
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn({ duration: 200 });
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomOut({ duration: 200 });
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoomKeepingCenter();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && spaceDownRef.current) {
        spaceDownRef.current = false;
        setIsSpaceDown(false);
        if (modeRef.current === "select") announceMode("Select mode");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [toggleMode, announceMode, zoomIn, zoomOut, resetZoomKeepingCenter]);

  // ── xyflow-driven node/edge changes: position (drag), measured size, selection ──
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasEdge>[]) => {
    // Branch edges are selectable:false/deletable:false, so xyflow never
    // actually produces changes referencing them — this narrows the (purely
    // static) CanvasEdge change type down to the AnchorEdge state it's
    // applied to; a change for an id linkEdges doesn't contain is a no-op.
    setLinkEdges((prev) => applyEdgeChanges(changes as EdgeChange<AnchorEdge>[], prev));
  }, []);

  // Any two anchorable elements may connect to each other — shape-to-shape,
  // shape-to-chat-node, text-to-anything, etc. — from/to any of their 8
  // anchor points, in either direction. The one thing this must never allow
  // is chat-node-to-chat-node, since that's exclusively what the separate
  // (invisible, non-interactive) branchSource/branchTarget handles and the
  // derived branch edge are for — that path is untouched by any of this.
  const isValidAnchorConnection = useCallback(
    (connection: CanvasEdge | Connection) => {
      const sourceHandle =
        "sourceHandle" in connection ? connection.sourceHandle : undefined;
      const targetHandle =
        "targetHandle" in connection ? connection.targetHandle : undefined;
      if (typeof sourceHandle !== "string" || !sourceHandle.startsWith("anchor-")) return false;
      if (typeof targetHandle !== "string" || !targetHandle.startsWith("anchor-")) return false;
      if (connection.source === connection.target) return false;
      const sourceType = getNode(connection.source)?.type;
      const targetType = getNode(connection.target)?.type;
      if (sourceType === "conversation" && targetType === "conversation") return false;
      return true;
    },
    [getNode],
  );

  const onConnect = useCallback((connection: Connection) => {
    setLinkEdges((prev) =>
      addEdge(
        { ...connection, type: "anchor", selectable: true, deletable: true, data: {} },
        prev,
      ),
    );
  }, []);

  // ── Shared data-field updaters ─────────────────────────────────
  const updateColor = useCallback(
    (id: string, color: string) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id
            ? ({ ...node, data: { ...node.data, color } } as CanvasNode)
            : node,
        ),
      ),
    [],
  );

  // Style panel operates over the whole selection at once, so a multi-select
  // (e.g. two shapes) restyles together in one click.
  const updateColorForSelection = useCallback((color: string) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.selected
          ? ({ ...node, data: { ...node.data, color } } as CanvasNode)
          : node,
      ),
    );
  }, []);

  const updateFontWeightForSelection = useCallback((fontWeight: FontWeight) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.selected && node.type === "textElement"
          ? ({ ...node, data: { ...node.data, fontWeight } } as CanvasNode)
          : node,
      ),
    );
  }, []);

  const updateStrokeStyleForSelection = useCallback((strokeStyle: StrokeStyle) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.selected && (node.type === "shapeElement" || node.type === "lineElement")
          ? ({ ...node, data: { ...node.data, strokeStyle } } as CanvasNode)
          : node,
      ),
    );
  }, []);

  const resizeShapeElement = useCallback(
    (id: string, width: number, height: number, x: number, y: number) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id && node.type === "shapeElement"
            ? { ...node, position: { x, y }, data: { ...node.data, width, height } }
            : node,
        ),
      ),
    [],
  );

  const resizeTextElement = useCallback(
    (id: string, width: number, height: number, x: number, y: number, handleKind: "corner" | "edge") =>
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== id || node.type !== "textElement") return node;
          // Corners scale the font proportionally along with the box —
          // "make the text bigger/smaller" — using width's growth ratio as
          // the scale factor; edges only reflow/rewrap at the same size.
          const fontSize =
            handleKind === "corner" && node.data.width > 0
              ? Math.max(TEXT_MIN_FONT_SIZE, Math.round(node.data.fontSize * (width / node.data.width)))
              : node.data.fontSize;
          return { ...node, position: { x, y }, data: { ...node.data, width, height, fontSize } };
        }),
      ),
    [],
  );

  const resizeConversationNode = useCallback(
    (id: string, width: number, height: number, x: number, y: number) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id && node.type === "conversation"
            ? { ...node, position: { x, y }, data: { ...node.data, width, height } }
            : node,
        ),
      ),
    [],
  );

  const updateLinePoints = useCallback(
    (id: string, points: [Point, Point], position: Point) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id && node.type === "lineElement"
            ? { ...node, position, data: { ...node.data, points } }
            : node,
        ),
      ),
    [],
  );

  const toggleMinimize = useCallback(
    (id: string) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id && node.type === "conversation"
            ? {
                ...node,
                data: { ...node.data, minimized: !node.data.minimized },
              }
            : node,
        ),
      ),
    [],
  );

  const updateElementText = useCallback(
    (id: string, text: string) =>
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id && node.type === "textElement"
            ? { ...node, data: { ...node.data, text } }
            : node,
        ),
      ),
    [],
  );

  const deleteElement = useCallback(
    (id: string) => setNodes((prev) => prev.filter((node) => node.id !== id)),
    [],
  );

  // Nudges a candidate spot straight down, step by step, until its box (using
  // each existing chat node's real measured size where known) no longer
  // overlaps any existing chat node — so branch/chain placement never lands
  // a fresh node on top of one that's already there. Only checks against
  // other chat nodes, matching the original behavior of never dodging
  // freeform text/shape/line elements.
  const findFreeSpot = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const GAP = 24;
      let nextY = y;
      for (let tries = 0; tries < 200; tries++) {
        const collides = nodesRef.current.some((node) => {
          if (node.type !== "conversation") return false;
          const { w: nodeW, h: nodeH } = getNodeDims(node.id);
          return (
            x < node.position.x + nodeW + GAP &&
            x + w + GAP > node.position.x &&
            nextY < node.position.y + nodeH + GAP &&
            nextY + h + GAP > node.position.y
          );
        });
        if (!collides) break;
        nextY += NODE_H_EST + GAP;
      }
      return { x, y: nextY };
    },
    [getNodeDims],
  );

  // ── Add a freeform text element (still single-click — text has no
  // intrinsic drag-drawn size the way shapes/lines do) ─────────────
  const addTextElement = useCallback((worldX: number, worldY: number) => {
    const elementId = crypto.randomUUID();
    const { width, height } = TEXT_ELEMENT_DEFAULT_SIZE;
    const newTextNode: TextElementNode = {
      id: elementId,
      type: "textElement",
      position: { x: worldX - width / 2, y: worldY - height / 2 },
      selected: true,
      data: {
        text: "",
        color: DEFAULT_COLOR,
        autoEdit: true,
        fontWeight: "normal",
        fontSize: TEXT_DEFAULT_FONT_SIZE,
        width,
        height,
      },
    };
    setNodes((prev) => [
      ...prev.map((node) => (node.selected ? ({ ...node, selected: false } as CanvasNode) : node)),
      newTextNode,
    ]);
    setMode("select");
  }, [setMode]);

  // ── Add a shape from a drag-drawn bounding box (Figma-style: drag sets
  // the size; a plain click falls back to a centered default-sized shape) ──
  const addShapeElement = useCallback(
    (shapeKind: ShapeKind, start: Point, end: Point, isClick: boolean) => {
      const elementId = crypto.randomUUID();
      const width = isClick
        ? SHAPE_DEFAULT_SIZE
        : Math.max(Math.abs(end.x - start.x), SHAPE_MIN_DRAG_SIZE);
      const height = isClick
        ? SHAPE_DEFAULT_SIZE
        : Math.max(Math.abs(end.y - start.y), SHAPE_MIN_DRAG_SIZE);
      const x = isClick ? start.x - width / 2 : Math.min(start.x, end.x);
      const y = isClick ? start.y - height / 2 : Math.min(start.y, end.y);
      const newShapeNode: ShapeElementNode = {
        id: elementId,
        type: "shapeElement",
        position: { x, y },
        selected: true,
        data: { shapeKind, color: "#93c5fd", width, height, strokeStyle: "solid" },
      };
      setNodes((prev) => [
        ...prev.map((node) => (node.selected ? ({ ...node, selected: false } as CanvasNode) : node)),
        newShapeNode,
      ]);
      setMode("select");
    },
    [setMode],
  );

  // ── Add a line/arrow element from two committed flow-space points ──
  const addLineElement = useCallback(
    (kind: "line" | "arrow", start: Point, end: Point) => {
      const elementId = crypto.randomUUID();
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const points: [Point, Point] = [
        { x: start.x - minX, y: start.y - minY },
        { x: end.x - minX, y: end.y - minY },
      ];
      const newLineNode: LineElementNode = {
        id: elementId,
        type: "lineElement",
        position: { x: minX, y: minY },
        selected: true,
        data: { kind, points, color: "#93c5fd", strokeStyle: "solid" },
      };
      setNodes((prev) => [
        ...prev.map((node) => (node.selected ? ({ ...node, selected: false } as CanvasNode) : node)),
        newLineNode,
      ]);
      setMode("select");
    },
    [setMode],
  );

  // ── Snapping — lets a line/arrow endpoint "stick" to a nearby element's
  // anchor point, the same magnetic feel as dragging a handle to connect
  // nodes, while leaving the point exactly where dropped when nothing is
  // close (still fully freeform). Mirrors AnchorHandles' side-midpoint-only
  // layout, so a line/arrow snaps exactly onto the same spots you can drag
  // a real connector from/to.
  const getAnchorCandidates = useCallback((): Point[] => {
    const candidates: Point[] = [];
    const pushSidePoints = (x: number, y: number, w: number, h: number) => {
      candidates.push(
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      );
    };
    nodesRef.current.forEach((node) => {
      const measured = getNode(node.id)?.measured;
      const { x, y } = node.position;
      if (node.type === "conversation" || node.type === "shapeElement" || node.type === "textElement") {
        pushSidePoints(x, y, measured?.width ?? node.data.width, measured?.height ?? node.data.height);
      }
    });
    return candidates;
  }, [getNode]);

  const snapToAnchor = useCallback(
    (point: Point): Point => {
      let closest: Point | null = null;
      let closestDist = SNAP_RADIUS;
      for (const candidate of getAnchorCandidates()) {
        const dist = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (dist < closestDist) {
          closestDist = dist;
          closest = candidate;
        }
      }
      return closest ?? point;
    },
    [getAnchorCandidates],
  );

  // ── Drag-to-draw gesture — shape/line/arrow tools all commit on drag
  // rather than a single click, so they share pane-level mouse listeners
  // rather than onPaneClick. ──
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null);

  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper || !isDragMode) return;
    const drawKind = effectiveMode as DrawKind;
    const isLineKind = drawKind === "line" || drawKind === "arrow";

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest(".react-flow__node")) return;

      const startFlowRaw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const startFlow = isLineKind ? snapToAnchor(startFlowRaw) : startFlowRaw;
      const startScreen = flowToScreenPosition(startFlow);

      setDrawPreview({
        kind: drawKind,
        startClientX: startScreen.x,
        startClientY: startScreen.y,
        currentClientX: startScreen.x,
        currentClientY: startScreen.y,
      });

      const onMouseMove = (moveEvent: MouseEvent) => {
        const flowRaw = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        const flowSnapped = isLineKind ? snapToAnchor(flowRaw) : flowRaw;
        const screenSnapped = flowToScreenPosition(flowSnapped);
        setDrawPreview((prev) =>
          prev ? { ...prev, currentClientX: screenSnapped.x, currentClientY: screenSnapped.y } : prev,
        );
      };
      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setDrawPreview(null);

        const endFlowRaw = screenToFlowPosition({ x: upEvent.clientX, y: upEvent.clientY });
        const endFlow = isLineKind ? snapToAnchor(endFlowRaw) : endFlowRaw;
        const dx = Math.abs(endFlow.x - startFlow.x);
        const dy = Math.abs(endFlow.y - startFlow.y);
        const isClick = dx < DRAG_COMMIT_THRESHOLD && dy < DRAG_COMMIT_THRESHOLD;

        if (isLineKind) {
          if (isClick) {
            setMode("select");
            return;
          }
          addLineElement(drawKind, startFlow, endFlow);
        } else {
          const shapeKind: ShapeKind =
            drawKind === "shape-square" ? "square" : drawKind === "shape-circle" ? "circle" : "diamond";
          addShapeElement(shapeKind, startFlow, endFlow, isClick);
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    wrapper.addEventListener("mousedown", onMouseDown);
    return () => wrapper.removeEventListener("mousedown", onMouseDown);
  }, [
    isDragMode,
    effectiveMode,
    screenToFlowPosition,
    flowToScreenPosition,
    snapToAnchor,
    setMode,
    addLineElement,
    addShapeElement,
  ]);

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (mode === "text") {
        const worldPosition = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addTextElement(worldPosition.x, worldPosition.y);
        return;
      }
      // Safety net — xyflow already clears selection on a bare pane click,
      // this just guarantees it regardless of internal version behavior.
      setNodes((prev) =>
        prev.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
      );
    },
    [mode, screenToFlowPosition, addTextElement],
  );

  // ── Add a chat node + call the AI ───────────────────────────────
  //
  // Branching is the only way conversation nodes ever connect — there is no
  // separate "chained but unrelated" link type. `activeNodeId` carries the
  // just-created node forward automatically (see the `setActiveNodeId(nodeId)`
  // below) so simply continuing to type keeps branching from — and flowing
  // straight down from — whatever you last sent, with no need to press
  // "Branch" again. Explicitly clicking "Branch" on an older node (or
  // clearing the active node) is what redirects or detaches that default.
  const addNode = async (prompt: string) => {
    const nodeId = crypto.randomUUID();
    const allNodes = nodesRef.current;
    const conversationNodes = allNodes.filter(
      (node): node is ConversationNodeState => node.type === "conversation",
    );
    const lastConversationNode =
      conversationNodes.length > 0
        ? conversationNodes[conversationNodes.length - 1]
        : undefined;
    const branchParentNode = activeNodeId
      ? conversationNodes.find((node) => node.id === activeNodeId)
      : undefined;
    const branchParentId = branchParentNode?.id ?? null;

    let x: number, y: number;
    if (branchParentNode && branchParentNode.id !== lastConversationNode?.id) {
      // Explicit fork off an earlier node — branch out to the side.
      const { w: parentW } = getNodeDims(branchParentNode.id);
      const siblingCount = conversationNodes.filter(
        (node) => node.data.branchParentId === branchParentNode.id,
      ).length;
      x = branchParentNode.position.x + parentW + 52;
      y = branchParentNode.position.y + siblingCount * (NODE_H_EST + 24);
    } else if (branchParentNode) {
      // Continuing straight from the most recent node — keep flowing downward.
      const { h: parentH } = getNodeDims(branchParentNode.id);
      x = branchParentNode.position.x;
      y = branchParentNode.position.y + parentH + 52;
    } else {
      // No active thread — a fresh, untethered conversation.
      const { centerX, centerY } = getContainerCenter();
      const viewport = getViewport();
      x = (centerX - viewport.x) / viewport.zoom - NODE_W / 2;
      y = (centerY - viewport.y) / viewport.zoom - NODE_H_EST / 2;
    }
    ({ x, y } = findFreeSpot(x, y, NODE_W, NODE_H_EST));

    const newConversationNode: ConversationNodeState = {
      id: nodeId,
      type: "conversation",
      position: { x, y },
      selected: true,
      data: {
        prompt,
        response: "",
        loading: true,
        minimized: false,
        color: branchParentNode?.data.color ?? DEFAULT_COLOR,
        branchParentId,
        width: branchParentNode?.data.width ?? NODE_W,
        height: branchParentNode?.data.height ?? CONVERSATION_DEFAULT_HEIGHT,
      },
    };
    setNodes((prev) => [
      ...prev.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
      newConversationNode,
    ]);
    setActiveNodeId(nodeId);
    centerOn(x, y);

    try {
      const response = await simulateAI(
        prompt,
        branchParentNode?.data.prompt,
        branchParentNode?.data.response,
      );
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId && node.type === "conversation"
            ? { ...node, data: { ...node.data, response, loading: false } }
            : node,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId && node.type === "conversation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  response: `⚠ ${message}`,
                  loading: false,
                },
              }
            : node,
        ),
      );
    }
  };

  // ── Hydration — attaches derived values + interaction callbacks fresh
  // every render, so nothing captured in persisted state can go stale ──
  const flowNodes = useMemo<HydratedCanvasNode[]>(
    () =>
      nodes.map((node): HydratedCanvasNode => {
        if (node.type === "conversation") {
          const branchParentNode = node.data.branchParentId
            ? nodes.find(
                (candidate) => candidate.id === node.data.branchParentId,
              )
            : undefined;
          const branchParentPromptPreview =
            branchParentNode?.type === "conversation"
              ? branchParentNode.data.prompt
              : undefined;
          return {
            ...node,
            dragHandle: ".drag-handle",
            data: {
              ...node.data,
              branchParentPromptPreview,
              isBranchActive: activeNodeId === node.id,
              onToggleBranch: () =>
                setActiveNodeId((prev) => (prev === node.id ? null : node.id)),
              onFocusNode: () => focusNode(node.id),
              onExpandNode: () =>
                setModal({
                  prompt: node.data.prompt,
                  response: node.data.response,
                  parentPrompt: branchParentPromptPreview,
                }),
              onColorChange: (color: string) => updateColor(node.id, color),
              onToggleMinimize: () => toggleMinimize(node.id),
              onResizeElement: (width: number, height: number, x: number, y: number) =>
                resizeConversationNode(node.id, width, height, x, y),
            },
          };
        }
        if (node.type === "textElement") {
          return {
            ...node,
            data: {
              ...node.data,
              onTextChange: (text: string) => updateElementText(node.id, text),
              onColorChange: (color: string) => updateColor(node.id, color),
              onDeleteElement: () => deleteElement(node.id),
              onResizeElement: (width: number, height: number, x: number, y: number, handleKind: "corner" | "edge") =>
                resizeTextElement(node.id, width, height, x, y, handleKind),
            },
          };
        }
        if (node.type === "shapeElement") {
          return {
            ...node,
            data: {
              ...node.data,
              onColorChange: (color: string) => updateColor(node.id, color),
              onDeleteElement: () => deleteElement(node.id),
              onResizeElement: (width: number, height: number, x: number, y: number) =>
                resizeShapeElement(node.id, width, height, x, y),
            },
          };
        }
        return {
          ...node,
          data: {
            ...node.data,
            onColorChange: (color: string) => updateColor(node.id, color),
            onDeleteElement: () => deleteElement(node.id),
            onPointsChange: (points: [Point, Point], position: Point) =>
              updateLinePoints(node.id, points, position),
            onSnapPoint: (point: Point) => snapToAnchor(point),
          },
        };
      }),
    [
      nodes,
      activeNodeId,
      focusNode,
      updateColor,
      toggleMinimize,
      updateElementText,
      deleteElement,
      resizeShapeElement,
      resizeTextElement,
      resizeConversationNode,
      updateLinePoints,
      snapToAnchor,
    ],
  );

  // ── Connector edges — branch edges are derived from each conversation
  // node's branch parent (as before, unchanged); anchor edges are real,
  // user-created state living in `linkEdges`. ──
  const flowEdges = useMemo<CanvasEdge[]>(() => {
    const branchEdges: CanvasEdge[] = [];
    nodes.forEach((node) => {
      if (node.type !== "conversation") return;
      if (node.data.branchParentId) {
        branchEdges.push({
          id: `branch-${node.id}`,
          type: "branch",
          source: node.data.branchParentId,
          sourceHandle: "branchSource",
          target: node.id,
          targetHandle: "branchTarget",
          selectable: false,
          deletable: false,
          data: {},
        });
      }
    });
    return [...branchEdges, ...linkEdges];
  }, [nodes, linkEdges]);

  const conversationNodeCount = nodes.filter(
    (node) => node.type === "conversation",
  ).length;
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedCount = selectedNodes.length;
  const activeNode = activeNodeId
    ? nodes.find((node) => node.id === activeNodeId)
    : undefined;
  const activeNodePrompt =
    activeNode?.type === "conversation" ? activeNode.data.prompt : undefined;

  const paneCursor =
    effectiveMode === "pan"
      ? "grab"
      : isTextMode || isDragMode
        ? "crosshair"
        : "default";

  // Screen-space (canvas-wrapper-relative) coordinates for the live
  // shape/line/arrow drag preview, recomputed from the raw client
  // coordinates tracked in `drawPreview` each time it changes.
  const drawPreviewScreen = (() => {
    if (!drawPreview) return null;
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      kind: drawPreview.kind,
      x1: drawPreview.startClientX - rect.left,
      y1: drawPreview.startClientY - rect.top,
      x2: drawPreview.currentClientX - rect.left,
      y2: drawPreview.currentClientY - rect.top,
    };
  })();

  return (
    <div
      data-theme={theme}
      className="w-screen h-screen overflow-hidden relative bg-surface font-sans"
    >
      <Toolbox
        nodeCount={conversationNodeCount}
        theme={theme}
        scale={currentZoom}
        mode={effectiveMode}
        onSetMode={setMode}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onFitAll={fitAll}
        onZoomIn={() => zoomIn({ duration: 200 })}
        onZoomOut={() => zoomOut({ duration: 200 })}
        onZoomReset={resetZoomKeepingCenter}
        stylePanelSlot={
          selectedCount > 0 ? (
            <StylePanel
              selection={selectedNodes}
              onColorChange={updateColorForSelection}
              onFontWeightChange={updateFontWeightForSelection}
              onStrokeStyleChange={updateStrokeStyleForSelection}
            />
          ) : undefined
        }
      />

      <ProjectsSidebar
        isCollapsed={isProjectsSidebarCollapsed}
        onToggleCollapsed={() =>
          setIsProjectsSidebarCollapsed((collapsed) => !collapsed)
        }
        harness={selectedHarness}
        onHarnessChange={setSelectedHarness}
      />

      {/* ── Canvas area — full-bleed; the toolbox floats above it ──── */}
      <div
        ref={canvasWrapperRef}
        className={`absolute top-0 right-0 bottom-0 overflow-hidden transition-[left] duration-200 ease-in-out ${
          effectiveMode === "pan" ? "cc-pan-mode" : ""
        }`}
        style={{
          left: isProjectsSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <CanvasEdgeMarkerDefs />
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidAnchorConnection}
          onPaneClick={onPaneClick}
          style={{ cursor: paneCursor }}
          minZoom={SCALE_MIN}
          maxZoom={SCALE_MAX}
          panOnDrag={effectiveMode === "pan" ? [0, 1] : isDragMode ? false : [1]}
          nodesDraggable={effectiveMode !== "pan"}
          selectionOnDrag={effectiveMode === "select"}
          selectionKeyCode={null}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          nodesConnectable
          elevateNodesOnSelect
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
          <FontAwesomeIcon
            icon={faLayerGroup}
            className="text-accent w-3 h-3"
          />
          {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
          <button
            onClick={() =>
              setNodes((prev) =>
                prev.map((node) =>
                  node.selected ? { ...node, selected: false } : node,
                ),
              )
            }
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
          onAnimationEnd={() =>
            setModeToast((t) => (t && t.id === modeToast.id ? null : t))
          }
          className="fixed left-1/2 z-[1500] pointer-events-none
                     px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-accent
                     shadow-[0_4px_16px_rgba(94,106,210,.45)] animate-mode-toast"
          style={{ top: TOP_PANEL_CLEARANCE }}
        >
          {modeToast.text}
        </div>
      )}

      {/* Active branch badge */}
      {activeNodeId && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2
                     px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-accent"
          style={{
            top: TOP_PANEL_CLEARANCE,
            boxShadow: "0 4px 16px rgba(94,106,210,.45)",
          }}
        >
          <FontAwesomeIcon icon={faCodeBranch} className="opacity-80 w-3 h-3" />
          Branch mode — type below to continue this thread
          <button
            onClick={() => setActiveNodeId(null)}
            className="opacity-70 hover:opacity-100 transition-opacity bg-transparent border-none text-white cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {conversationNodeCount === 0 && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                        text-center pointer-events-none z-[1]"
        >
          <div className="text-4xl text-foreground-subtle mb-4">✦</div>
          <div className="text-lg font-semibold text-foreground-muted mb-2 tracking-tight">
            Canvas Chat
          </div>
          <div className="text-[13px] text-foreground-subtle leading-7 max-w-[280px]">
            Type below to start ·{" "}
            <strong className="text-foreground-muted font-semibold">
              Drag
            </strong>{" "}
            to select ·{" "}
            <strong className="text-foreground-muted font-semibold">Tab</strong>{" "}
            to switch ·{" "}
            <strong className="text-foreground-muted font-semibold">
              hold Space
            </strong>{" "}
            to pan
          </div>
        </div>
      )}

      <Joystick
        onPan={(deltaX, deltaY) => {
          const viewport = getViewport();
          setViewport({
            x: viewport.x + deltaX,
            y: viewport.y + deltaY,
            zoom: viewport.zoom,
          });
        }}
        onStart={() => {}}
      />

      <ChatInput
        activeNodeId={activeNodeId}
        activeNodePrompt={activeNodePrompt}
        onSubmit={addNode}
        onClearActive={() => setActiveNodeId(null)}
      />

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
            className="bg-surface-overlay border border-border rounded-2xl shadow-card-active
                       w-full max-w-2xl max-h-[80vh] flex flex-col font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <span className="text-sm font-semibold text-foreground tracking-tight">
                Full conversation
              </span>
              <button
                onClick={() => setModal(null)}
                className="text-foreground-muted hover:text-foreground
                           bg-transparent border-none cursor-pointer transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="cc-scroll overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
              {modal.parentPrompt && (
                <div
                  className="inline-flex items-center gap-1.5 text-xs text-foreground-muted
                                bg-surface-subtle border border-border rounded-full px-3 py-1 self-start"
                >
                  <FontAwesomeIcon
                    icon={faCodeBranch}
                    className="text-accent w-2.5 h-2.5"
                  />
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-2">
                  AI
                </p>
                {modal.response ? (
                  <MarkdownContent
                    content={modal.response}
                    className="text-sm text-foreground-muted leading-relaxed"
                  />
                ) : (
                  <p className="text-sm text-foreground-subtle italic">
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
  kind: DrawKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SHAPE_PREVIEW_CORNER_RADIUS = 8;

// Live outline shown while dragging out a new shape/line/arrow, in the
// canvas wrapper's own screen space (not flow space — no pan/zoom happens
// mid-gesture since panOnDrag is disabled for these tools).
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
      ) : preview.kind === "shape-diamond" ? (
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
          rx={preview.kind === "shape-circle" ? width / 2 : SHAPE_PREVIEW_CORNER_RADIUS}
          ry={preview.kind === "shape-circle" ? height / 2 : SHAPE_PREVIEW_CORNER_RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}
