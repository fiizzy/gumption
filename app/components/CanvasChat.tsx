'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ConversationNode from './ConversationNode';
import ChatInput from './ChatInput';
import Toolbar, { TOOLBAR_H } from './Toolbar';
import { NodeData, NodeDims } from '../types';
import { simulateAI } from '../lib/ai';

const NODE_W     = 300;
const NODE_H_EST = 220;
const SCALE_MIN  = 0.1;
const SCALE_MAX  = 4;

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

export default function CanvasChat() {
  const [nodes, setNodes]             = useState<NodeData[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeDims, setNodeDims]       = useState<Record<string, NodeDims>>({});
  const [theme, setTheme]             = useState<'light' | 'dark'>('dark');

  // ── Pan & scale ───────────────────────────────────────────────
  const [pan, _setPan]     = useState({ x: 0, y: 0 });
  const [scale, _setScale] = useState(1);
  const panRef   = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const setPan = useCallback((p: { x: number; y: number }) => { panRef.current = p; _setPan(p); }, []);
  const setScale = useCallback((s: number) => { scaleRef.current = s; _setScale(s); }, []);

  // ── Stale-closure-safe refs ───────────────────────────────────
  const nodesRef    = useRef<NodeData[]>([]);
  const nodeDimsRef = useRef<Record<string, NodeDims>>({});
  useEffect(() => { nodesRef.current    = nodes;    }, [nodes]);
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

  // ── Space-to-pan ──────────────────────────────────────────────
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const isSpaceDownRef = useRef(false);

  // ── Group drag ────────────────────────────────────────────────
  const groupInitPositions = useRef<Record<string, { x: number; y: number }>>({});

  const handleGroupDragStart = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodesRef.current.forEach((n) => {
      if (selectedIdsRef.current.has(n.id)) positions[n.id] = { x: n.x, y: n.y };
    });
    groupInitPositions.current = positions;
  }, []);

  const handleGroupMove = useCallback((dx: number, dy: number) => {
    setNodes((prev) => prev.map((n) => {
      const init = groupInitPositions.current[n.id];
      return init ? { ...n, x: init.x + dx, y: init.y + dy } : n;
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
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      cancelAnimationFrame(animFrameRef.current);
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0008));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Keyboard: zoom shortcuts + space-to-pan ───────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Space-to-pan — skip if user is typing
      if (e.code === 'Space' && !e.repeat &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        isSpaceDownRef.current = true;
        setIsSpaceDown(true);
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
      if (e.code === 'Space') { isSpaceDownRef.current = false; setIsSpaceDown(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [zoomAt, animateToView]);

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
        // Hit-test: which nodes intersect the selection rect (canvas-area coords)?
        const selLeft   = Math.min(selectStart.current.x, e.clientX);
        const selTop    = Math.min(selectStart.current.y, e.clientY - TOOLBAR_H);
        const selRight  = Math.max(selectStart.current.x, e.clientX);
        const selBottom = Math.max(selectStart.current.y, e.clientY - TOOLBAR_H);
        const s = scaleRef.current, p = panRef.current;
        const hit = new Set<string>();
        nodesRef.current.forEach((n) => {
          const d   = nodeDimsRef.current[n.id] ?? { w: NODE_W, h: NODE_H_EST };
          const nl  = n.x * s + p.x,  nt = n.y * s + p.y;
          const nr  = nl + d.w * s,   nb = nt + d.h * s;
          if (nl < selRight && nr > selLeft && nt < selBottom && nb > selTop) hit.add(n.id);
        });
        setSelectedIds(hit);
        setSelectRect(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [setPan]);

  // ── Background mousedown (left = pan, right = selection) ──────
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      isSelecting.current = true;
      selectStart.current = { x: e.clientX, y: e.clientY - TOOLBAR_H };
      setSelectRect({ x1: e.clientX, y1: e.clientY - TOOLBAR_H, x2: e.clientX, y2: e.clientY - TOOLBAR_H });
      return;
    }
    if (e.button !== 0) return;
    if (selectedIdsRef.current.size > 0) setSelectedIds(new Set()); // click background = deselect
    if (e.target !== e.currentTarget) return;
    startPan(e.clientX, e.clientY);
  };

  // ── Node helpers ──────────────────────────────────────────────
  const updateNodePos = useCallback((id: string, x: number, y: number) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, x, y } : n)), []);
  const updateNodeColor = useCallback((id: string, color: string) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, color } : n)), []);
  const toggleMinimize = useCallback((id: string) =>
    setNodes((p) => p.map((n) => n.id === id ? { ...n, minimized: !n.minimized } : n)), []);
  const updateDims = useCallback((id: string, w: number, h: number) =>
    setNodeDims((p) => ({ ...p, [id]: { w, h } })), []);

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

    const linkedFromId = !parentId && all.length > 0 ? all[all.length - 1].id : null;
    setNodes((p) => [...p, { id, parentId, linkedFromId, prompt, response: '', x, y, color: '#f8fafc', minimized: false, loading: true }]);
    setActiveNodeId(null);
    centerOn(x, y);

    const parent = parentId ? all.find((n) => n.id === parentId) : undefined;
    const response = await simulateAI(prompt, parent?.prompt, parent?.response);
    setNodes((p) => p.map((n) => n.id === id ? { ...n, response, loading: false } : n));
  };

  // ── Fit all ───────────────────────────────────────────────────
  const fitAll = useCallback(() => {
    const all = nodesRef.current, dims = nodeDimsRef.current;
    if (!all.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    all.forEach((n) => {
      const d = dims[n.id] ?? { w: NODE_W, h: NODE_H_EST };
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + d.w); maxY = Math.max(maxY, n.y + d.h);
    });
    const pad = 64, vw = window.innerWidth, vh = window.innerHeight - TOOLBAR_H;
    const newScale = Math.max(SCALE_MIN, Math.min(1.5,
      Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2))));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    animateToView(vw / 2 - cx * newScale, vh / 2 - cy * newScale, newScale);
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
    <div data-theme={theme} style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      background: 'var(--canvas-bg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    }}>
      <Toolbar
        nodeCount={nodes.length} theme={theme} scale={scale}
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

      {/* ── Canvas area ───────────────────────────────────────── */}
      <div
        style={{ position: 'absolute', top: TOOLBAR_H, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Dot-grid — left-click pan, right-click selection */}
        <div
          onMouseDown={handleBgMouseDown}
          style={{
            position: 'absolute', inset: 0,
            cursor: 'default',
            backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1.5px, transparent 1.5px)',
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundPosition: `${bpx}px ${bpy}px`,
          }}
        />

        {/* ── World container ──────────────────────────────────── */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          pointerEvents: 'none',
        }}>
          {/* SVG connector lines */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id="arrow-branch" markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="var(--connector)" />
              </marker>
              <marker id="arrow-link" markerWidth="6" markerHeight="4" refX="4" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--connector)" fillOpacity="0.5" />
              </marker>
            </defs>
            {edges.map((e) => {
              const isBranch = e.kind === 'branch';
              const midX = (e.x1 + e.x2) / 2, midY = (e.y1 + e.y2) / 2;
              const d = isBranch
                ? `M ${e.x1} ${e.y1} C ${e.x1} ${midY} ${e.x2} ${midY} ${e.x2} ${e.y2}`
                : `M ${e.x1} ${e.y1} C ${midX} ${e.y1} ${midX} ${e.y2} ${e.x2} ${e.y2}`;
              return (
                <path key={e.id} d={d} stroke="var(--connector)" strokeOpacity={isBranch ? 1 : 0.7}
                  strokeWidth={1.5} fill="none" strokeDasharray={isBranch ? '5 4' : '4 5'}
                  markerEnd={isBranch ? 'url(#arrow-branch)' : 'url(#arrow-link)'} />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const parentNode = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
            const isSelected = selectedIds.has(node.id);
            return (
              <ConversationNode
                key={node.id}
                node={node}
                panX={pan.x} panY={pan.y} scale={scale}
                isActive={activeNodeId === node.id}
                isSelected={isSelected}
                selectedCount={selectedIds.size}
                parentPrompt={parentNode?.prompt}
                onBranch={() => setActiveNodeId((prev) => prev === node.id ? null : node.id)}
                onMove={(x, y) => updateNodePos(node.id, x, y)}
                onGroupDragStart={handleGroupDragStart}
                onGroupMove={handleGroupMove}
                onColorChange={(color) => updateNodeColor(node.id, color)}
                onToggleMinimize={() => toggleMinimize(node.id)}
                onDimsChange={(w, h) => updateDims(node.id, w, h)}
              />
            );
          })}
        </div>

        {/* ── Right-click selection rectangle ──────────────────── */}
        {selBounds && (
          <div style={{
            position: 'absolute',
            left: selBounds.left, top: selBounds.top,
            width: selBounds.width, height: selBounds.height,
            border: '1.5px dashed var(--accent)',
            background: 'rgba(94,106,210,0.07)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 50,
          }} />
        )}

        {/* ── Space-to-pan overlay ──────────────────────────────── */}
        {isSpaceDown && (
          <div
            onMouseDown={(e) => startPan(e.clientX, e.clientY)}
            style={{ position: 'absolute', inset: 0, cursor: 'grab', zIndex: 900 }}
          />
        )}
      </div>

      {/* ── Selection count badge ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 110, right: 20,
          background: 'var(--card-bg)', border: '1px solid var(--accent)',
          color: 'var(--text)', fontSize: 12, fontWeight: 600,
          padding: '6px 14px', borderRadius: 20, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: 'var(--shadow-card)',
        }}>
          <span style={{ color: 'var(--accent)' }}>◈</span>
          {selectedIds.size} node{selectedIds.size > 1 ? 's' : ''} selected
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* ── Space-to-pan hint ─────────────────────────────────── */}
      {isSpaceDown && (
        <div style={{
          position: 'fixed', bottom: 110, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          color: 'var(--text-muted)', fontSize: 12,
          padding: '5px 14px', borderRadius: 20, zIndex: 200,
          pointerEvents: 'none',
        }}>
          Space — drag to pan
        </div>
      )}

      {/* ── Active branch badge ───────────────────────────────── */}
      {activeNodeId && (
        <div style={{
          position: 'fixed', top: TOOLBAR_H + 14, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: '#fff',
          fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 20, zIndex: 200,
          boxShadow: '0 4px 16px rgba(94,106,210,.45)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ opacity: 0.8 }}>↗</span>
          Branch mode — type below to continue this thread
          <button onClick={() => setActiveNodeId(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7, fontSize: 15 }}>×</button>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {nodes.length === 0 && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none', zIndex: 1,
        }}>
          <div style={{ fontSize: 36, color: 'var(--text-faint)', marginBottom: 16 }}>✦</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '-0.02em' }}>Canvas Chat</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.7, maxWidth: 280 }}>
            Type below to start · <strong style={{ color: 'var(--text-muted)' }}>Right-click drag</strong> to select · <strong style={{ color: 'var(--text-muted)' }}>Space+drag</strong> to pan
          </div>
        </div>
      )}

      <ChatInput
        activeNodeId={activeNodeId}
        activeNodePrompt={activeNodeId ? nodes.find((n) => n.id === activeNodeId)?.prompt : undefined}
        onSubmit={addNode}
        onClearActive={() => setActiveNodeId(null)}
      />
    </div>
  );
}
