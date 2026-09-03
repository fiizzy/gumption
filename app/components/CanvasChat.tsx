'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeBranch, faLayerGroup, faXmark } from '@fortawesome/free-solid-svg-icons';
import ConversationNodeComponent, { DEFAULT_COLOR } from './ConversationNode';
import CanvasElementComponent from './CanvasElement';
import { BranchEdgeComponent, CanvasEdgeMarkerDefs } from './CanvasEdges';
import ChatInput from './ChatInput';
import Joystick from './Joystick';
import Toolbar, { TOOLBAR_H } from './Toolbar';
import type { Mode } from './Toolbar';
import {
  CanvasNode,
  ConversationNode as ConversationNodeState,
  TextElementNode,
  ShapeElementNode,
  HydratedCanvasNode,
  CanvasEdge,
  ShapeKind,
} from '../types';
import { simulateAI } from '../lib/ai';

const NODE_W     = 380;
const NODE_H_EST = 220;
const SCALE_MIN  = 0.1;
const SCALE_MAX  = 4;

const MODE_LABEL: Record<Mode, string> = {
  select: 'Select mode', pan: 'Pan mode', text: 'Text mode',
  'shape-square': 'Square tool', 'shape-circle': 'Circle tool',
};

// Module-level so identity is stable across renders — xyflow re-measures
// and re-warns if nodeTypes/edgeTypes objects change identity every pass.
const nodeTypes = {
  conversation: ConversationNodeComponent,
  textElement: CanvasElementComponent,
  shapeElement: CanvasElementComponent,
};
const edgeTypes = {
  branch: BranchEdgeComponent,
};

interface ModalContent { prompt: string; response: string; parentPrompt?: string; }

export default function CanvasChat() {
  return (
    <ReactFlowProvider>
      <CanvasChatInner />
    </ReactFlowProvider>
  );
}

function CanvasChatInner() {
  const [nodes, setNodes]               = useState<CanvasNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [theme, setTheme]               = useState<'light' | 'dark'>('dark');
  const [modal, setModal]               = useState<ModalContent | null>(null);
  const modalRef = useRef<ModalContent | null>(null);
  useEffect(() => { modalRef.current = modal; }, [modal]);

  const nodesRef = useRef<CanvasNode[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const {
    getNode, getNodes, getViewport, setViewport, screenToFlowPosition, zoomIn, zoomOut,
  } = useReactFlow<CanvasNode, CanvasEdge>();
  const { zoom: currentZoom } = useViewport(); // reactive — drives the Toolbar's live percentage readout

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const getContainerCenter = useCallback(() => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    return {
      centerX: (rect?.width ?? window.innerWidth) / 2,
      centerY: (rect?.height ?? window.innerHeight - TOOLBAR_H) / 2,
    };
  }, []);

  // Falls back to the estimated card size before a node has been measured
  // (e.g. the instant it's created, one render before layout settles).
  const getNodeDims = useCallback((id: string) => {
    const node = getNode(id);
    return { w: node?.measured?.width ?? NODE_W, h: node?.measured?.height ?? NODE_H_EST };
  }, [getNode]);

  // ── Interaction mode: select vs pan ────────────────────────────
  // `mode` is the persistent tool, toggled by Tab (or the toolbar).
  // Holding Space temporarily forces pan on top of it, then releases
  // back to `mode` — the two never fight because effectiveMode below
  // is the only thing the canvas actually reads.
  const [mode, setModeState] = useState<Mode>('select');
  const modeRef = useRef<Mode>('select');

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const spaceDownRef = useRef(false);

  const effectiveMode: Mode = isSpaceDown ? 'pan' : mode;

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
    if (!spaceDownRef.current) announceMode(MODE_LABEL[next]);
  }, [announceMode]);

  const toggleMode = useCallback(() => {
    setMode(modeRef.current === 'select' ? 'pan' : 'select');
  }, [setMode]);

  // ── Viewport navigation ──────────────────────────────────────
  const centerOn = useCallback((worldX: number, worldY: number) => {
    const { centerX, centerY } = getContainerCenter();
    const zoom = getViewport().zoom;
    setViewport({
      x: centerX - (worldX + NODE_W / 2) * zoom,
      y: centerY - (worldY + NODE_H_EST / 2) * zoom,
      zoom,
    }, { duration: 500 });
  }, [getContainerCenter, getViewport, setViewport]);

  const focusNode = useCallback((nodeId: string) => {
    const node = getNode(nodeId);
    if (!node) return;
    const { w, h } = getNodeDims(nodeId);
    const { centerX, centerY } = getContainerCenter();
    setViewport({
      x: centerX - (node.position.x + w / 2),
      y: centerY - (node.position.y + h / 2),
      zoom: 1,
    }, { duration: 500 });
  }, [getNode, getNodeDims, getContainerCenter, setViewport]);

  // Centres the centroid of all nodes at 100% zoom (deliberately not
  // xyflow's bounding-box fitView — this keeps the original fit-all feel).
  const fitAll = useCallback(() => {
    const allNodes = getNodes();
    if (!allNodes.length) return;
    let centroidSumX = 0, centroidSumY = 0;
    allNodes.forEach((node) => {
      const { w, h } = getNodeDims(node.id);
      centroidSumX += node.position.x + w / 2;
      centroidSumY += node.position.y + h / 2;
    });
    const centroidX = centroidSumX / allNodes.length;
    const centroidY = centroidSumY / allNodes.length;
    const { centerX, centerY } = getContainerCenter();
    setViewport({ x: centerX - centroidX, y: centerY - centroidY, zoom: 1 }, { duration: 500 });
  }, [getNodes, getNodeDims, getContainerCenter, setViewport]);

  const resetZoomKeepingCenter = useCallback(() => {
    const { centerX, centerY } = getContainerCenter();
    const viewport = getViewport();
    setViewport({
      x: centerX - (centerX - viewport.x) / viewport.zoom,
      y: centerY - (centerY - viewport.y) / viewport.zoom,
      zoom: 1,
    }, { duration: 300 });
  }, [getContainerCenter, getViewport, setViewport]);

  // ── Keyboard: zoom shortcuts + Tab-to-toggle-mode + hold-Space-to-pan + Delete ──
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModal(null); return; }

      // Delete/Backspace — remove selected canvas elements (text/shapes only, never chat nodes)
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTyping(event.target)) {
        const deletableIds = nodesRef.current
          .filter((node) => node.selected && node.type !== 'conversation')
          .map((node) => node.id);
        if (deletableIds.length > 0) {
          event.preventDefault();
          setNodes((prev) => prev.filter((node) => !deletableIds.includes(node.id)));
        }
        return;
      }

      // Tab — toggle the persistent select/pan tool; skip if user is typing in a form field
      if (event.code === 'Tab' && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        toggleMode();
        return;
      }

      // Space (held) — temporarily force pan mode; skip if user is typing in a form field
      if (event.code === 'Space' && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setIsSpaceDown(true);
          if (modeRef.current !== 'pan') announceMode('Pan mode');
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomIn({ duration: 200 }); }
      if (event.key === '-')                      { event.preventDefault(); zoomOut({ duration: 200 }); }
      if (event.key === '0')                      { event.preventDefault(); resetZoomKeepingCenter(); }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && spaceDownRef.current) {
        spaceDownRef.current = false;
        setIsSpaceDown(false);
        if (modeRef.current === 'select') announceMode('Select mode');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [toggleMode, announceMode, zoomIn, zoomOut, resetZoomKeepingCenter]);

  // ── xyflow-driven node changes: position (drag), measured size, selection ──
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  // ── Shared data-field updaters ─────────────────────────────────
  const updateColor = useCallback((id: string, color: string) =>
    setNodes((prev) => prev.map((node) =>
      node.id === id ? ({ ...node, data: { ...node.data, color } } as CanvasNode) : node,
    )), []);

  const toggleMinimize = useCallback((id: string) =>
    setNodes((prev) => prev.map((node) =>
      node.id === id && node.type === 'conversation'
        ? { ...node, data: { ...node.data, minimized: !node.data.minimized } }
        : node,
    )), []);

  const updateElementText = useCallback((id: string, text: string) =>
    setNodes((prev) => prev.map((node) =>
      node.id === id && node.type === 'textElement'
        ? { ...node, data: { ...node.data, text } }
        : node,
    )), []);

  const deleteElement = useCallback((id: string) =>
    setNodes((prev) => prev.filter((node) => node.id !== id)), []);

  // Nudges a candidate spot straight down, step by step, until its box (using
  // each existing chat node's real measured size where known) no longer
  // overlaps any existing chat node — so branch/chain placement never lands
  // a fresh node on top of one that's already there. Only checks against
  // other chat nodes, matching the original behavior of never dodging
  // freeform text/shape elements.
  const findFreeSpot = useCallback((x: number, y: number, w: number, h: number) => {
    const GAP = 24;
    let nextY = y;
    for (let tries = 0; tries < 200; tries++) {
      const collides = nodesRef.current.some((node) => {
        if (node.type !== 'conversation') return false;
        const { w: nodeW, h: nodeH } = getNodeDims(node.id);
        return x < node.position.x + nodeW + GAP && x + w + GAP > node.position.x &&
               nextY < node.position.y + nodeH + GAP && nextY + h + GAP > node.position.y;
      });
      if (!collides) break;
      nextY += NODE_H_EST + GAP;
    }
    return { x, y: nextY };
  }, [getNodeDims]);

  // ── Add a freeform text/shape element ───────────────────────────
  const addElement = useCallback((toolMode: 'text' | 'shape-square' | 'shape-circle', worldX: number, worldY: number) => {
    const elementId = crypto.randomUUID();
    const deselectRest = (prev: CanvasNode[]) => prev.map((node) => (node.selected ? { ...node, selected: false } : node));

    if (toolMode === 'text') {
      const width = 200;
      const newTextNode: TextElementNode = {
        id: elementId,
        type: 'textElement',
        position: { x: worldX - width / 2, y: worldY - 12 },
        selected: true,
        data: { text: '', color: DEFAULT_COLOR, autoEdit: true },
      };
      setNodes((prev) => [...deselectRest(prev), newTextNode]);
    } else {
      const shapeKind: ShapeKind = toolMode === 'shape-square' ? 'square' : 'circle';
      const halfSize = 70; // half of CanvasElement's fixed SHAPE_SIZE (140) — centers the shape on the click
      const newShapeNode: ShapeElementNode = {
        id: elementId,
        type: 'shapeElement',
        position: { x: worldX - halfSize, y: worldY - halfSize },
        selected: true,
        data: { shapeKind, color: '#93c5fd' },
      };
      setNodes((prev) => [...deselectRest(prev), newShapeNode]);
    }
    setMode('select');
  }, [setMode]);

  const onPaneClick = useCallback((event: ReactMouseEvent) => {
    if (mode === 'text' || mode === 'shape-square' || mode === 'shape-circle') {
      const worldPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addElement(mode, worldPosition.x, worldPosition.y);
      return;
    }
    // Safety net — xyflow already clears selection on a bare pane click,
    // this just guarantees it regardless of internal version behavior.
    setNodes((prev) => prev.map((node) => (node.selected ? { ...node, selected: false } : node)));
  }, [mode, screenToFlowPosition, addElement]);

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
    const conversationNodes = allNodes.filter((node): node is ConversationNodeState => node.type === 'conversation');
    const lastConversationNode = conversationNodes.length > 0 ? conversationNodes[conversationNodes.length - 1] : undefined;
    const branchParentNode = activeNodeId ? conversationNodes.find((node) => node.id === activeNodeId) : undefined;
    const branchParentId = branchParentNode?.id ?? null;

    let x: number, y: number;
    if (branchParentNode && branchParentNode.id !== lastConversationNode?.id) {
      // Explicit fork off an earlier node — branch out to the side.
      const { w: parentW } = getNodeDims(branchParentNode.id);
      const siblingCount = conversationNodes.filter((node) => node.data.branchParentId === branchParentNode.id).length;
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
      type: 'conversation',
      position: { x, y },
      selected: true,
      data: {
        prompt, response: '', loading: true, minimized: false,
        color: branchParentNode?.data.color ?? DEFAULT_COLOR,
        branchParentId,
      },
    };
    setNodes((prev) => [...prev.map((node) => (node.selected ? { ...node, selected: false } : node)), newConversationNode]);
    setActiveNodeId(nodeId);
    centerOn(x, y);

    try {
      const response = await simulateAI(prompt, branchParentNode?.data.prompt, branchParentNode?.data.response);
      setNodes((prev) => prev.map((node) =>
        node.id === nodeId && node.type === 'conversation'
          ? { ...node, data: { ...node.data, response, loading: false } }
          : node,
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNodes((prev) => prev.map((node) =>
        node.id === nodeId && node.type === 'conversation'
          ? { ...node, data: { ...node.data, response: `⚠ ${message}`, loading: false } }
          : node,
      ));
    }
  };

  // ── Hydration — attaches derived values + interaction callbacks fresh
  // every render, so nothing captured in persisted state can go stale ──
  const flowNodes = useMemo<HydratedCanvasNode[]>(() => nodes.map((node): HydratedCanvasNode => {
    if (node.type === 'conversation') {
      const branchParentNode = node.data.branchParentId
        ? nodes.find((candidate) => candidate.id === node.data.branchParentId)
        : undefined;
      const branchParentPromptPreview = branchParentNode?.type === 'conversation'
        ? branchParentNode.data.prompt
        : undefined;
      return {
        ...node,
        dragHandle: '.drag-handle',
        data: {
          ...node.data,
          branchParentPromptPreview,
          isBranchActive: activeNodeId === node.id,
          onToggleBranch: () => setActiveNodeId((prev) => (prev === node.id ? null : node.id)),
          onFocusNode: () => focusNode(node.id),
          onExpandNode: () => setModal({ prompt: node.data.prompt, response: node.data.response, parentPrompt: branchParentPromptPreview }),
          onColorChange: (color: string) => updateColor(node.id, color),
          onToggleMinimize: () => toggleMinimize(node.id),
        },
      };
    }
    if (node.type === 'textElement') {
      return {
        ...node,
        data: {
          ...node.data,
          onTextChange: (text: string) => updateElementText(node.id, text),
          onColorChange: (color: string) => updateColor(node.id, color),
          onDeleteElement: () => deleteElement(node.id),
        },
      };
    }
    return {
      ...node,
      data: {
        ...node.data,
        onColorChange: (color: string) => updateColor(node.id, color),
        onDeleteElement: () => deleteElement(node.id),
      },
    };
  }), [nodes, activeNodeId, focusNode, updateColor, toggleMinimize, updateElementText, deleteElement]);

  // ── Connector edges — derived from each conversation node's branch parent ──
  const flowEdges = useMemo<CanvasEdge[]>(() => {
    const edges: CanvasEdge[] = [];
    nodes.forEach((node) => {
      if (node.type !== 'conversation') return;
      if (node.data.branchParentId) {
        edges.push({
          id: `branch-${node.id}`, type: 'branch',
          source: node.data.branchParentId, sourceHandle: 'branchSource',
          target: node.id, targetHandle: 'branchTarget',
          selectable: false, deletable: false, data: {},
        });
      }
    });
    return edges;
  }, [nodes]);

  const conversationNodeCount = nodes.filter((node) => node.type === 'conversation').length;
  const selectedCount = nodes.filter((node) => node.selected).length;
  const activeNode = activeNodeId ? nodes.find((node) => node.id === activeNodeId) : undefined;
  const activeNodePrompt = activeNode?.type === 'conversation' ? activeNode.data.prompt : undefined;

  const paneCursor = effectiveMode === 'pan'
    ? 'grab'
    : effectiveMode === 'text' || effectiveMode === 'shape-square' || effectiveMode === 'shape-circle'
      ? 'crosshair'
      : 'default';

  return (
    <div
      data-theme={theme}
      className="w-screen h-screen overflow-hidden relative bg-surface font-sans"
    >
      <Toolbar
        nodeCount={conversationNodeCount} theme={theme} scale={currentZoom}
        mode={effectiveMode} onSetMode={setMode}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onFitAll={fitAll}
        onZoomIn={() => zoomIn({ duration: 200 })}
        onZoomOut={() => zoomOut({ duration: 200 })}
        onZoomReset={resetZoomKeepingCenter}
      />

      {/* ── Canvas area ─────────────────────────────────────── */}
      <div
        ref={canvasWrapperRef}
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{ top: TOOLBAR_H }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <CanvasEdgeMarkerDefs />
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          style={{ cursor: paneCursor }}
          minZoom={SCALE_MIN}
          maxZoom={SCALE_MAX}
          panOnDrag={effectiveMode === 'pan' ? [0, 1] : [1]}
          selectionOnDrag={effectiveMode === 'select'}
          selectionKeyCode={null}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          nodesConnectable={false}
          elevateNodesOnSelect
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.5} color="var(--color-canvas-dot)" />
        </ReactFlow>
      </div>

      {/* Selection count badge */}
      {selectedCount > 0 && (
        <div className="fixed bottom-[110px] right-5 z-[200] flex items-center gap-2
                        px-3.5 py-1.5 rounded-full text-xs font-semibold
                        bg-surface-overlay border border-accent text-foreground shadow-card">
          <FontAwesomeIcon icon={faLayerGroup} className="text-accent w-3 h-3" />
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
          <button onClick={() => setNodes((prev) => prev.map((node) => (node.selected ? { ...node, selected: false } : node)))}
                  className="text-foreground-muted bg-transparent border-none cursor-pointer hover:text-foreground transition-colors">
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Mode-switch toast — fades in, holds, fades out */}
      {modeToast && (
        <div
          key={modeToast.id}
          onAnimationEnd={() => setModeToast((t) => (t && t.id === modeToast.id ? null : t))}
          className="fixed left-1/2 z-[1500] pointer-events-none
                     px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-accent
                     shadow-[0_4px_16px_rgba(94,106,210,.45)] animate-mode-toast"
          style={{ top: TOOLBAR_H + 14 }}
        >
          {modeToast.text}
        </div>
      )}

      {/* Active branch badge */}
      {activeNodeId && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2
                     px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-accent"
          style={{ top: TOOLBAR_H + 14, boxShadow: '0 4px 16px rgba(94,106,210,.45)' }}
        >
          <FontAwesomeIcon icon={faCodeBranch} className="opacity-80 w-3 h-3" />
          Branch mode — type below to continue this thread
          <button onClick={() => setActiveNodeId(null)}
                  className="opacity-70 hover:opacity-100 transition-opacity bg-transparent border-none text-white cursor-pointer">
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {conversationNodeCount === 0 && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                        text-center pointer-events-none z-[1]">
          <div className="text-4xl text-foreground-subtle mb-4">✦</div>
          <div className="text-lg font-semibold text-foreground-muted mb-2 tracking-tight">Canvas Chat</div>
          <div className="text-[13px] text-foreground-subtle leading-7 max-w-[280px]">
            Type below to start ·{' '}
            <strong className="text-foreground-muted font-semibold">Drag</strong> to select ·{' '}
            <strong className="text-foreground-muted font-semibold">Tab</strong> to switch ·{' '}
            <strong className="text-foreground-muted font-semibold">hold Space</strong> to pan
          </div>
        </div>
      )}

      <Joystick
        onPan={(deltaX, deltaY) => {
          const viewport = getViewport();
          setViewport({ x: viewport.x + deltaX, y: viewport.y + deltaY, zoom: viewport.zoom });
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
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setModal(null)}
        >
          <div
            className="bg-surface-overlay border border-border rounded-2xl shadow-card-active
                       w-full max-w-2xl max-h-[80vh] flex flex-col font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <span className="text-sm font-semibold text-foreground tracking-tight">Full conversation</span>
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
                <div className="inline-flex items-center gap-1.5 text-xs text-foreground-muted
                                bg-surface-subtle border border-border rounded-full px-3 py-1 self-start">
                  <FontAwesomeIcon icon={faCodeBranch} className="text-accent w-2.5 h-2.5" />
                  Branched from: &ldquo;{modal.parentPrompt.slice(0, 80)}{modal.parentPrompt.length > 80 ? '…' : ''}&rdquo;
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-2">You</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{modal.prompt}</p>
              </div>

              <div className="h-px bg-border-subtle" />

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-2">AI</p>
                {modal.response ? (
                  <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">{modal.response}</p>
                ) : (
                  <p className="text-sm text-foreground-subtle italic">Still generating…</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
