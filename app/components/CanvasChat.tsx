'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeBranch, faLayerGroup, faXmark } from '@fortawesome/free-solid-svg-icons';
import ConversationNode, { DEFAULT_COLOR } from './ConversationNode';
import CanvasElementView from './CanvasElement';
import ChatInput from './ChatInput';
import Joystick from './Joystick';
import Toolbar, { TOOLBAR_H } from './Toolbar';
import type { Mode } from './Toolbar';
import { NodeData, NodeDims, CanvasElementData } from '../types';
import { simulateAI } from '../lib/ai';

const NODE_W     = 380;
const NODE_H_EST = 220;
const SCALE_MIN  = 0.1;
const SCALE_MAX  = 4;

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

const MODE_LABEL: Record<Mode, string> = {
  select: 'Select mode', pan: 'Pan mode', text: 'Text mode',
  'shape-square': 'Square tool', 'shape-circle': 'Circle tool',
};

interface ModalContent { prompt: string; response: string; parentPrompt?: string; }

export default function CanvasChat() {
  const [nodes, setNodes]             = useState<NodeData[]>([]);
  const [elements, setElements]       = useState<CanvasElementData[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeDims, setNodeDims]       = useState<Record<string, NodeDims>>({});
  const [theme, setTheme]             = useState<'light' | 'dark'>('dark');
  const [modal, setModal]             = useState<ModalContent | null>(null);
  const modalRef = useRef<ModalContent | null>(null);
  useEffect(() => { modalRef.current = modal; }, [modal]);

  // ── Pan & scale ───────────────────────────────────────────────
  const [pan, _setPan]     = useState({ x: 0, y: 0 });
  const [scale, _setScale] = useState(1);
  const panRef   = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const setPan = useCallback((p: { x: number; y: number }) => { panRef.current = p; _setPan(p); }, []);
  const setScale = useCallback((s: number) => { scaleRef.current = s; _setScale(s); }, []);

  // ── Stale-closure-safe refs ───────────────────────────────────
  const nodesRef    = useRef<NodeData[]>([]);
  const elementsRef = useRef<CanvasElementData[]>([]);
  const nodeDimsRef = useRef<Record<string, NodeDims>>({});
  useEffect(() => { nodesRef.current    = nodes;    }, [nodes]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { nodeDimsRef.current = nodeDims; }, [nodeDims]);

  // ── Selection state ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // ── Right-click selection rect (canvas-area coords) ──────────
  interface SelectRect { x1: number; y1: number; x2: number; y2: number; }
  const [selectRect, setSelectRect] = useState<SelectRect | null>(null);
  const isSelecting  = useRef(false);
  const selectStart  = useRef({ x: 0, y: 0 });

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

  // ── Group drag ────────────────────────────────────────────────
  const groupInitPositions = useRef<Record<string, { x: number; y: number }>>({});

  const handleGroupDragStart = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodesRef.current.forEach((n) => {
      if (selectedIdsRef.current.has(n.id)) positions[n.id] = { x: n.x, y: n.y };
    });
    elementsRef.current.forEach((el) => {
      if (selectedIdsRef.current.has(el.id)) positions[el.id] = { x: el.x, y: el.y };
    });
    groupInitPositions.current = positions;
  }, []);

  const handleGroupMove = useCallback((dx: number, dy: number) => {
    setNodes((prev) => prev.map((n) => {
      const init = groupInitPositions.current[n.id];
      return init ? { ...n, x: init.x + dx, y: init.y + dy } : n;
    }));
    setElements((prev) => prev.map((el) => {
      const init = groupInitPositions.current[el.id];
      return init ? { ...el, x: init.x + dx, y: init.y + dy } : el;
    }));
  }, []);

  // ── Animation ─────────────────────────────────────────────────
  const animFrameRef = useRef(0);
  const animateToView = useCallback((targetPanX: number, targetPanY: number, targetScale?: number) => {
    cancelAnimationFrame(animFrameRef.current);
    const startX = panRef.current.x, startY = panRef.current.y, startS = scaleRef.current;
    const endS = targetScale ?? startS;
    const t0 = performance.now(), dur = 500;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1), e = easeOutCubic(t);
      setPan({ x: startX + (targetPanX - startX) * e, y: startY + (targetPanY - startY) * e });
      if (targetScale !== undefined) setScale(startS + (endS - startS) * e);
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [setPan, setScale]);

  const centerOn = useCallback((wx: number, wy: number) => {
    const vw = window.innerWidth, vh = window.innerHeight, s = scaleRef.current;
    animateToView(vw / 2 - (wx + NODE_W / 2) * s, (vh - TOOLBAR_H) / 2 - (wy + NODE_H_EST / 2) * s);
  }, [animateToView]);

  // ── Zoom ──────────────────────────────────────────────────────
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const cay = cy - TOOLBAR_H;
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scaleRef.current * factor));
    const ratio = newScale / scaleRef.current;
    setPan({ x: cx - (cx - panRef.current.x) * ratio, y: cay - (cay - panRef.current.y) * ratio });
    setScale(newScale);
  }, [setPan, setScale]);

  useEffect(() => {
    const insideScrollable = (target: EventTarget | null, dy: number): boolean => {
      let el = target instanceof Element ? target : null;
      while (el && el !== document.body) {
        const { overflowY } = getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const canScrollUp   = dy < 0 && el.scrollTop > 0;
          const canScrollDown = dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight;
          if (canScrollUp || canScrollDown) return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (modalRef.current) return; // modal open — let it (or nothing) handle the scroll natively
      if (e.target instanceof HTMLInputElement) return;
      if (insideScrollable(e.target, e.deltaY)) return;
      e.preventDefault();
      cancelAnimationFrame(animFrameRef.current);
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0008));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Keyboard: zoom shortcuts + Tab-to-toggle-mode + hold-Space-to-pan ──
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setModal(null); return; }
      // Delete/Backspace — remove selected canvas elements (text/shapes only, never chat nodes)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping(e.target) && selectedIdsRef.current.size > 0) {
        const elIds = new Set(elementsRef.current.map((el) => el.id));
        const toDelete = [...selectedIdsRef.current].filter((id) => elIds.has(id));
        if (toDelete.length > 0) {
          e.preventDefault();
          setElements((p) => p.filter((el) => !toDelete.includes(el.id)));
          setSelectedIds((prev) => { const n = new Set(prev); toDelete.forEach((id) => n.delete(id)); return n; });
        }
        return;
      }
      // Tab — toggle the persistent select/pan tool; skip if user is typing in a form field
      if (e.code === 'Tab' && !e.repeat && !isTyping(e.target)) {
        e.preventDefault();
        toggleMode();
        return;
      }
      // Space (held) — temporarily force pan mode; skip if user is typing in a form field
      if (e.code === 'Space' && !e.repeat && !isTyping(e.target)) {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setIsSpaceDown(true);
          if (modeRef.current !== 'pan') announceMode('Pan mode');
        }
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomAt(cx, cy, 1.25); }
      if (e.key === '-')                   { e.preventDefault(); zoomAt(cx, cy, 0.8); }
      if (e.key === '0') {
        e.preventDefault();
        const s = scaleRef.current, cay = cy - TOOLBAR_H;
        animateToView(cx - (cx - panRef.current.x) / s, cay - (cay - panRef.current.y) / s, 1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceDownRef.current) {
        spaceDownRef.current = false;
        setIsSpaceDown(false);
        if (modeRef.current === 'select') announceMode('Select mode');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [zoomAt, animateToView, toggleMode, announceMode]);

  // ── Panning state ─────────────────────────────────────────────
  const isPanning  = useRef(false);
  const panStart   = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const startPan = (mx: number, my: number) => {
    cancelAnimationFrame(animFrameRef.current);
    isPanning.current = true;
    panStart.current  = { mx, my, px: panRef.current.x, py: panRef.current.y };
  };

  // ── Global mouse move + up (pan, selection rect) ──────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isPanning.current) {
        setPan({
          x: panStart.current.px + (e.clientX - panStart.current.mx),
          y: panStart.current.py + (e.clientY - panStart.current.my),
        });
      }
      if (isSelecting.current) {
        setSelectRect({ x1: selectStart.current.x, y1: selectStart.current.y,
                        x2: e.clientX, y2: e.clientY - TOOLBAR_H });
      }
    };

    const onUp = (e: MouseEvent) => {
      isPanning.current = false;

      if (isSelecting.current) {
        isSelecting.current = false;
        const dx = Math.abs(e.clientX - selectStart.current.x);
        const dy = Math.abs(e.clientY - TOOLBAR_H - selectStart.current.y);

        if (dx > 5 || dy > 5) {
          // Real drag — hit-test nodes that intersect the rect
          const selLeft   = Math.min(selectStart.current.x, e.clientX);
          const selTop    = Math.min(selectStart.current.y, e.clientY - TOOLBAR_H);
          const selRight  = Math.max(selectStart.current.x, e.clientX);
          const selBottom = Math.max(selectStart.current.y, e.clientY - TOOLBAR_H);
          const s = scaleRef.current, p = panRef.current;
          const hit = new Set<string>();
          nodesRef.current.forEach((n) => {
            const d  = nodeDimsRef.current[n.id] ?? { w: NODE_W, h: NODE_H_EST };
            const nl = n.x * s + p.x, nt = n.y * s + p.y;
            const nr = nl + d.w * s,  nb = nt + d.h * s;
            if (nl < selRight && nr > selLeft && nt < selBottom && nb > selTop) hit.add(n.id);
          });
          elementsRef.current.forEach((el) => {
            const d  = nodeDimsRef.current[el.id] ?? { w: 140, h: 140 };
            const nl = el.x * s + p.x, nt = el.y * s + p.y;
            const nr = nl + d.w * s,  nb = nt + d.h * s;
            if (nl < selRight && nr > selLeft && nt < selBottom && nb > selTop) hit.add(el.id);
          });
          setSelectedIds(hit);
        } else {
          // Bare click on canvas — clear selection
          setSelectedIds(new Set());
        }
        setSelectRect(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [setPan]);

  // ── Background mousedown ──────────────────────────────────────
  // Left-drag  → selection rect (Figma-style), select mode only
  // Middle-drag → pan
  // Pan mode    → every drag pans (handled by the full-canvas overlay below)
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      // Middle-click → pan
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;

    if (mode === 'text' || mode === 'shape-square' || mode === 'shape-circle') {
      e.preventDefault();
      const s = scaleRef.current, p = panRef.current;
      const wx = (e.clientX - p.x) / s;
      const wy = (e.clientY - TOOLBAR_H - p.y) / s;
      addElement(mode, wx, wy);
      return;
    }

    // Left-click drag on empty canvas → draw selection rect
    cancelAnimationFrame(animFrameRef.current);
    isSelecting.current = true;
    selectStart.current = { x: e.clientX, y: e.clientY - TOOLBAR_H };
    setSelectRect({ x1: e.clientX, y1: e.clientY - TOOLBAR_H, x2: e.clientX, y2: e.clientY - TOOLBAR_H });
  };

  // ── Joystick pan ─────────────────────────────────────────────
  // Must NOT use the setPan wrapper here — that wrapper does
  // `panRef.current = p` literally, so passing a function would
  // corrupt panRef and break all subsequent position calculations.
  const handleJoystickPan = useCallback((dx: number, dy: number) => {
    const next = { x: panRef.current.x + dx, y: panRef.current.y + dy };
    panRef.current = next;   // keep ref in sync immediately
    _setPan(next);           // trigger re-render
  }, []);

  // ── Node click-to-select ─────────────────────────────────────
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedIds(new Set([nodeId]));
  }, []);

  // ── Node helpers ──────────────────────────────────────────────
  const updateNodePos = useCallback((id: string, x: number, y: number) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, x, y } : n)), []);
  const updateNodeColor = useCallback((id: string, color: string) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, color } : n)), []);
  const toggleMinimize = useCallback((id: string) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, minimized: !n.minimized } : n)), []);
  const updateDims = useCallback((id: string, w: number, h: number) =>
    setNodeDims((p) => ({ ...p, [id]: { w, h } })), []);

  // ── Canvas element (text / shape) helpers ──────────────────────
  const updateElementPos = useCallback((id: string, x: number, y: number) =>
    setElements((p) => p.map((el) => el.id === id ? { ...el, x, y } : el)), []);
  const updateElementText = useCallback((id: string, text: string) =>
    setElements((p) => p.map((el) => el.id === id ? { ...el, text } : el)), []);
  const updateElementColor = useCallback((id: string, color: string) =>
    setElements((p) => p.map((el) => el.id === id ? { ...el, color } : el)), []);
  const deleteElement = useCallback((id: string) => {
    setElements((p) => p.filter((el) => el.id !== id));
    setSelectedIds((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const [autoEditId, setAutoEditId] = useState<string | null>(null);

  const addElement = useCallback((toolMode: 'text' | 'shape-square' | 'shape-circle', wx: number, wy: number) => {
    const id = crypto.randomUUID();
    if (toolMode === 'text') {
      const w = 200;
      const el: CanvasElementData = { id, type: 'text', x: wx - w / 2, y: wy - 12, text: '', color: DEFAULT_COLOR };
      setElements((p) => [...p, el]);
      setAutoEditId(id);
    } else {
      const shapeKind = toolMode === 'shape-square' ? 'square' : 'circle';
      const half = 70; // half of CanvasElement's fixed SHAPE_SIZE (140) — centers the shape on the click
      const el: CanvasElementData = { id, type: 'shape', shapeKind, x: wx - half, y: wy - half, text: '', color: '#93c5fd' };
      setElements((p) => [...p, el]);
    }
    setSelectedIds(new Set([id]));
    setMode('select');
  }, [setMode]);

  // Nudges a candidate spot straight down, step by step, until its box
  // (using each existing node's real measured size where known) no longer
  // overlaps any existing node — so branch/chain placement never lands a
  // fresh node on top of one that's already there.
  const findFreeSpot = useCallback((x: number, y: number, w: number, h: number) => {
    const all = nodesRef.current, dims = nodeDimsRef.current;
    const GAP = 24;
    let ny = y;
    for (let tries = 0; tries < 200; tries++) {
      const collides = all.some((n) => {
        const d = dims[n.id] ?? { w: NODE_W, h: NODE_H_EST };
        return x < n.x + d.w + GAP && x + w + GAP > n.x &&
               ny < n.y + d.h + GAP && ny + h + GAP > n.y;
      });
      if (!collides) break;
      ny += NODE_H_EST + GAP;
    }
    return { x, y: ny };
  }, []);

  // ── Add node ──────────────────────────────────────────────────
  const addNode = async (prompt: string) => {
    const id = crypto.randomUUID();
    const parentId = activeNodeId;
    const all = nodesRef.current, dims = nodeDimsRef.current, s = scaleRef.current;

    let x: number, y: number;
    if (parentId) {
      const parent = all.find((n) => n.id === parentId);
      if (parent) {
        const pd = dims[parentId] ?? { w: NODE_W, h: NODE_H_EST };
        const siblings = all.filter((n) => n.parentId === parentId).length;
        x = parent.x + pd.w + 52; y = parent.y + siblings * (NODE_H_EST + 24);
      } else { x = 80; y = 80; }
    } else if (all.length > 0) {
      const last = all[all.length - 1];
      const ld = dims[last.id] ?? { w: NODE_W, h: NODE_H_EST };
      x = last.x + ld.w + 52; y = last.y;
    } else {
      const vw = window.innerWidth, vh = window.innerHeight;
      x = (vw / 2 - panRef.current.x) / s - NODE_W    / 2;
      y = ((vh - TOOLBAR_H) / 2 - panRef.current.y) / s - NODE_H_EST / 2;
    }
    ({ x, y } = findFreeSpot(x, y, NODE_W, NODE_H_EST));

    const linkedFromId = !parentId && all.length > 0 ? all[all.length - 1].id : null;
    const parentColor = parentId ? all.find((n) => n.id === parentId)?.color : undefined;
    setNodes((p) => [...p, { id, parentId, linkedFromId, prompt, response: '', x, y, color: parentColor ?? '#f8fafc', minimized: false, loading: true }]);
    setActiveNodeId(null);
    setSelectedIds(new Set([id])); // auto-highlight the new node
    centerOn(x, y);

    const parent = parentId ? all.find((n) => n.id === parentId) : undefined;
    try {
      const response = await simulateAI(prompt, parent?.prompt, parent?.response);
      setNodes((p) => p.map((n) => n.id === id ? { ...n, response, loading: false } : n));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNodes((p) => p.map((n) => n.id === id ? { ...n, response: `⚠ ${message}`, loading: false } : n));
    }
  };

  // ── Focus a single node (centre + 100 % zoom) ────────────────
  const focusNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const dims = nodeDimsRef.current[nodeId] ?? { w: NODE_W, h: NODE_H_EST };
    const vw = window.innerWidth, vh = window.innerHeight;
    animateToView(
      vw / 2 - (node.x + dims.w / 2),
      (vh - TOOLBAR_H) / 2 - (node.y + dims.h / 2),
      1,
    );
  }, [animateToView]);

  // ── Fit all — centres the centroid of all nodes at 100 % zoom ──
  const fitAll = useCallback(() => {
    const all = nodesRef.current, dims = nodeDimsRef.current;
    if (!all.length) return;
    let sumX = 0, sumY = 0;
    all.forEach((n) => {
      const d = dims[n.id] ?? { w: NODE_W, h: NODE_H_EST };
      sumX += n.x + d.w / 2;
      sumY += n.y + d.h / 2;
    });
    const cx = sumX / all.length, cy = sumY / all.length;
    const vw = window.innerWidth, vh = window.innerHeight;
    animateToView(vw / 2 - cx, (vh - TOOLBAR_H) / 2 - cy, 1);
  }, [animateToView]);

  // ── Connector edges ───────────────────────────────────────────
  interface Edge { id: string; x1: number; y1: number; x2: number; y2: number; kind: 'branch' | 'link'; }

  const buildEdge = (sourceId: string, child: (typeof nodes)[0], kind: Edge['kind']): Edge | null => {
    const parent = nodes.find((p) => p.id === sourceId);
    if (!parent) return null;
    const pd = nodeDims[parent.id] ?? { w: NODE_W, h: NODE_H_EST };
    const cd = nodeDims[child.id]  ?? { w: NODE_W, h: NODE_H_EST };
    if (kind === 'link') {
      return { id: `link-${child.id}`, kind,
        x1: parent.x + pd.w, y1: parent.y + pd.h / 2,
        x2: child.x,         y2: child.y  + cd.h / 2 };
    }
    return { id: `branch-${child.id}`, kind,
      x1: parent.x + pd.w / 2, y1: parent.y + pd.h,
      x2: child.x  + cd.w / 2, y2: child.y };
  };

  const edges: Edge[] = nodes.flatMap((n) => {
    const res: Edge[] = [];
    if (n.parentId)     { const e = buildEdge(n.parentId,     n, 'branch'); if (e) res.push(e); }
    if (n.linkedFromId) { const e = buildEdge(n.linkedFromId, n, 'link');   if (e) res.push(e); }
    return res;
  });

  // ── Grid ──────────────────────────────────────────────────────
  const gridSize = 28 * scale;
  const bpx = ((pan.x % gridSize) + gridSize) % gridSize;
  const bpy = ((pan.y % gridSize) + gridSize) % gridSize;

  // ── Selection rect bounds (canvas-area coords) ────────────────
  const selBounds = selectRect ? {
    left:   Math.min(selectRect.x1, selectRect.x2),
    top:    Math.min(selectRect.y1, selectRect.y2),
    width:  Math.abs(selectRect.x2 - selectRect.x1),
    height: Math.abs(selectRect.y2 - selectRect.y1),
  } : null;

  return (
    <div
      data-theme={theme}
      className="w-screen h-screen overflow-hidden relative bg-surface font-sans"
    >
      <Toolbar
        nodeCount={nodes.length} theme={theme} scale={scale}
        mode={effectiveMode} onSetMode={setMode}
        onToggleTheme={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
        onFitAll={fitAll}
        onZoomIn={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25)}
        onZoomOut={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8)}
        onZoomReset={() => {
          const cx = window.innerWidth / 2, cay = window.innerHeight / 2 - TOOLBAR_H;
          animateToView(cx - (cx - panRef.current.x) / scaleRef.current,
                        cay - (cay - panRef.current.y) / scaleRef.current, 1);
        }}
      />

      {/* ── Canvas area ─────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{ top: TOOLBAR_H }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Dot-grid background */}
        <div
          onMouseDown={handleBgMouseDown}
          className={`absolute inset-0 ${
            effectiveMode === 'pan' ? 'cursor-grab'
            : effectiveMode === 'text' || effectiveMode === 'shape-square' || effectiveMode === 'shape-circle' ? 'cursor-crosshair'
            : 'cursor-default'
          }`}
          style={{
            backgroundImage: 'radial-gradient(circle, var(--color-canvas-dot) 1.5px, transparent 1.5px)',
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundPosition: `${bpx}px ${bpy}px`,
          }}
        />

        {/* World container — single CSS transform for pan + zoom */}
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{ transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {/* SVG connector lines (world-space coordinates) */}
          <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
            <defs>
              <marker id="arrow-branch" markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="var(--color-connector)" />
              </marker>
              <marker id="arrow-link" markerWidth="6" markerHeight="4" refX="4" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--color-connector)" fillOpacity="0.5" />
              </marker>
            </defs>
            {edges.map((e) => {
              const isBranch = e.kind === 'branch';
              const midX = (e.x1 + e.x2) / 2, midY = (e.y1 + e.y2) / 2;
              const d = isBranch
                ? `M ${e.x1} ${e.y1} C ${e.x1} ${midY} ${e.x2} ${midY} ${e.x2} ${e.y2}`
                : `M ${e.x1} ${e.y1} C ${midX} ${e.y1} ${midX} ${e.y2} ${e.x2} ${e.y2}`;
              return (
                <path key={e.id} d={d}
                  stroke="var(--color-connector)" strokeOpacity={isBranch ? 1 : 0.7}
                  strokeWidth={1.5} fill="none"
                  strokeDasharray={isBranch ? '5 4' : '4 5'}
                  markerEnd={isBranch ? 'url(#arrow-branch)' : 'url(#arrow-link)'} />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const parentNode = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
            return (
              <ConversationNode
                key={node.id} node={node}
                panX={pan.x} panY={pan.y} scale={scale}
                isActive={activeNodeId === node.id}
                isSelected={selectedIds.has(node.id)}
                selectedCount={selectedIds.size}
                parentPrompt={parentNode?.prompt}
                onBranch={() => setActiveNodeId((prev) => prev === node.id ? null : node.id)}
                onSelect={() => handleNodeSelect(node.id)}
                onFocus={() => focusNode(node.id)}
                onExpand={() => setModal({ prompt: node.prompt, response: node.response, parentPrompt: parentNode?.prompt })}
                onMove={(x, y) => updateNodePos(node.id, x, y)}
                onGroupDragStart={handleGroupDragStart}
                onGroupMove={handleGroupMove}
                onColorChange={(color) => updateNodeColor(node.id, color)}
                onToggleMinimize={() => toggleMinimize(node.id)}
                onDimsChange={(w, h) => updateDims(node.id, w, h)}
              />
            );
          })}

          {/* Freeform canvas elements — text & shapes */}
          {elements.map((el) => (
            <CanvasElementView
              key={el.id} element={el}
              panX={pan.x} panY={pan.y} scale={scale}
              isSelected={selectedIds.has(el.id)}
              selectedCount={selectedIds.size}
              autoEdit={autoEditId === el.id}
              onSelect={() => handleNodeSelect(el.id)}
              onMove={(x, y) => updateElementPos(el.id, x, y)}
              onGroupDragStart={handleGroupDragStart}
              onGroupMove={handleGroupMove}
              onTextChange={(text) => updateElementText(el.id, text)}
              onColorChange={(color) => updateElementColor(el.id, color)}
              onDelete={() => deleteElement(el.id)}
              onDimsChange={(w, h) => updateDims(el.id, w, h)}
            />
          ))}
        </div>

        {/* Selection rectangle */}
        {selBounds && (
          <div
            className="absolute pointer-events-none z-50 rounded border-[1.5px] border-dashed border-accent bg-accent/[0.07]"
            style={{ left: selBounds.left, top: selBounds.top, width: selBounds.width, height: selBounds.height }}
          />
        )}

        {/* Pan-mode overlay — captures every drag across the whole canvas, over nodes too */}
        {effectiveMode === 'pan' && (
          <div
            onMouseDown={(e) => startPan(e.clientX, e.clientY)}
            className="absolute inset-0 cursor-grab active:cursor-grabbing z-[900]"
          />
        )}
      </div>

      {/* Selection count badge */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-[110px] right-5 z-[200] flex items-center gap-2
                        px-3.5 py-1.5 rounded-full text-xs font-semibold
                        bg-surface-overlay border border-accent text-foreground shadow-card">
          <FontAwesomeIcon icon={faLayerGroup} className="text-accent w-3 h-3" />
          {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          <button onClick={() => setSelectedIds(new Set())}
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
      {nodes.length === 0 && (
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
        onPan={handleJoystickPan}
        onStart={() => cancelAnimationFrame(animFrameRef.current)}
      />

      <ChatInput
        activeNodeId={activeNodeId}
        activeNodePrompt={activeNodeId ? nodes.find((n) => n.id === activeNodeId)?.prompt : undefined}
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
