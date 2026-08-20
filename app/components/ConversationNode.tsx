'use client';

import { useRef, useEffect, useState } from 'react';
import { NodeData } from '../types';
import { TOOLBAR_H } from './Toolbar';

interface Props {
  node: NodeData;
  panX: number;
  panY: number;
  scale: number;
  isActive: boolean;
  isSelected: boolean;
  selectedCount: number;
  parentPrompt?: string;
  onBranch: () => void;
  onMove: (x: number, y: number) => void;
  onGroupDragStart: () => void;
  onGroupMove: (dx: number, dy: number) => void;
  onColorChange: (color: string) => void;
  onToggleMinimize: () => void;
  onDimsChange: (w: number, h: number) => void;
}

const SWATCHES      = ['#f8fafc','#dbeafe','#dcfce7','#fefce8','#ede9fe','#fce7f3','#ffedd5','#f1f5f9'];
const SWATCH_LABELS = ['White','Blue','Green','Yellow','Violet','Pink','Peach','Slate'];

export default function ConversationNode({
  node, panX, panY, scale, isActive, isSelected, selectedCount, parentPrompt,
  onBranch, onMove, onGroupDragStart, onGroupMove, onColorChange, onToggleMinimize, onDimsChange,
}: Props) {
  const nodeRef    = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartMouse = useRef({ x: 0, y: 0 }); // for group drag

  // Keep refs current for global listeners
  const panRef   = useRef({ x: panX, y: panY });
  const scaleRef = useRef(scale);
  const onMoveRef          = useRef(onMove);
  const onGroupDragStartRef = useRef(onGroupDragStart);
  const onGroupMoveRef      = useRef(onGroupMove);
  const nodeRef2  = useRef(node);
  const isSelectedRef    = useRef(isSelected);
  const selectedCountRef = useRef(selectedCount);

  useEffect(() => { panRef.current          = { x: panX, y: panY }; }, [panX, panY]);
  useEffect(() => { scaleRef.current        = scale;           }, [scale]);
  useEffect(() => { onMoveRef.current       = onMove;          }, [onMove]);
  useEffect(() => { onGroupDragStartRef.current = onGroupDragStart; }, [onGroupDragStart]);
  useEffect(() => { onGroupMoveRef.current  = onGroupMove;     }, [onGroupMove]);
  useEffect(() => { nodeRef2.current        = node;            }, [node]);
  useEffect(() => { isSelectedRef.current   = isSelected;      }, [isSelected]);
  useEffect(() => { selectedCountRef.current = selectedCount;  }, [selectedCount]);

  const [showColors, setShowColors] = useState(false);

  // ── ResizeObserver: report layout dimensions to parent ───────
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (nodeRef.current) onDimsChange(nodeRef.current.offsetWidth, nodeRef.current.offsetHeight);
    });
    obs.observe(el);
    onDimsChange(el.offsetWidth, el.offsetHeight);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global drag listeners (set up once) ──────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const s = scaleRef.current, p = panRef.current;
      if (isSelectedRef.current && selectedCountRef.current > 1) {
        // Group drag: send world-space delta from drag start to parent
        const dx = (e.clientX          - dragStartMouse.current.x) / s;
        const dy = (e.clientY - TOOLBAR_H - dragStartMouse.current.y) / s;
        onGroupMoveRef.current(dx, dy);
      } else {
        // Single node drag
        onMoveRef.current(
          (e.clientX          - dragOffset.current.x - p.x) / s,
          (e.clientY - TOOLBAR_H - dragOffset.current.y - p.y) / s,
        );
      }
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  // ── Start drag on header mousedown ───────────────────────────
  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    const n = nodeRef2.current;
    const s = scaleRef.current, p = panRef.current;
    if (isSelectedRef.current && selectedCountRef.current > 1) {
      // Group drag: record mouse start position in canvas-area coords
      dragStartMouse.current = { x: e.clientX, y: e.clientY - TOOLBAR_H };
      onGroupDragStartRef.current();
    } else {
      // Single drag: record offset from node top-left to mouse
      dragOffset.current = {
        x: e.clientX          - (n.x * s + p.x),
        y: e.clientY - TOOLBAR_H - (n.y * s + p.y),
      };
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const promptSnippet = node.prompt.length > 36 ? node.prompt.slice(0, 36) + '…' : node.prompt;
  const hasTint = node.color !== '#f8fafc';
  const textColor  = hasTint ? '#09090b' : 'var(--text)';
  const mutedColor = hasTint ? '#52525b' : 'var(--text-muted)';

  return (
    <div
      ref={nodeRef}
      className="cc-node-enter"
      style={{
        // Positioned in world space — the parent world container handles scale/pan via CSS transform
        position: 'absolute',
        left: node.x,
        top:  node.y,
        width: 300,
        pointerEvents: 'auto',        // re-enable (parent sets pointerEvents: none)
        background: hasTint ? node.color : 'var(--card-bg)',
        border: (isActive || isSelected) ? '1.5px solid var(--accent)' : '1px solid var(--card-border)',
        borderRadius: 12,
        boxShadow: isActive
          ? 'var(--shadow-card-active)'
          : isSelected
            ? '0 0 0 3px rgba(94,106,210,0.3), var(--shadow-card)'
            : 'var(--shadow-card)',
        userSelect: 'none',
        zIndex: isActive ? 20 : 5,
        transition: 'box-shadow 0.18s, border-color 0.18s',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      }}
    >
      {/* ── Header / drag handle ── */}
      <div
        onMouseDown={startDrag}
        style={{
          cursor: 'grab',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: node.minimized ? 'none' : '1px solid var(--card-sep)',
        }}
      >
        {/* Grip dots */}
        <svg width="10" height="14" viewBox="0 0 10 14" fill={mutedColor} style={{ flexShrink: 0, opacity: 0.45 }}>
          <circle cx="2" cy="3"  r="1.2"/><circle cx="8" cy="3"  r="1.2"/>
          <circle cx="2" cy="7"  r="1.2"/><circle cx="8" cy="7"  r="1.2"/>
          <circle cx="2" cy="11" r="1.2"/><circle cx="8" cy="11" r="1.2"/>
        </svg>

        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600, color: textColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {promptSnippet}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: mutedColor, padding: '1px 3px', lineHeight: 1,
            fontSize: 11, flexShrink: 0, opacity: 0.65,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.65'; }}
          title={node.minimized ? 'Expand' : 'Collapse'}
        >
          {node.minimized ? '▼' : '▲'}
        </button>
      </div>

      {/* ── Animated body (grid-template-rows trick) ── */}
      <div style={{
        display: 'grid',
        gridTemplateRows: node.minimized ? '0fr' : '1fr',
        transition: 'grid-template-rows 0.26s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{
          overflow: 'hidden',
          opacity: node.minimized ? 0 : 1,
          transition: 'opacity 0.18s ease',
        }}>
          <div style={{ padding: '10px 14px 13px' }}>

            {/* Branch context chip */}
            {node.parentId && parentPrompt && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: mutedColor,
                background: hasTint ? 'rgba(0,0,0,0.06)' : 'var(--badge-bg)',
                border: `1px solid ${hasTint ? 'rgba(0,0,0,0.1)' : 'var(--card-border)'}`,
                borderRadius: 20, padding: '3px 8px', marginBottom: 10,
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ color: 'var(--accent)', fontSize: 10 }}>↗</span>
                {parentPrompt.slice(0, 42)}{parentPrompt.length > 42 ? '…' : ''}
              </div>
            )}

            {/* You */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: mutedColor, marginBottom: 4 }}>You</div>
              <p style={{ fontSize: 13, color: textColor, lineHeight: 1.6, margin: 0 }}>{node.prompt}</p>
            </div>

            <div style={{ height: 1, background: hasTint ? 'rgba(0,0,0,0.06)' : 'var(--card-sep)', margin: '10px 0' }} />

            {/* AI */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>AI</div>
              {node.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: mutedColor, fontSize: 13 }}>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                        display: 'inline-block',
                        animation: `cc-thinking 1.2s ${delay}s ease-in-out infinite`,
                      }} />
                    ))}
                  </span>
                  <span style={{ fontStyle: 'italic' }}>Thinking…</span>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: mutedColor, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{node.response}</p>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                className={`cc-node-action-btn${isActive ? ' active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onBranch(); }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2v5a3 3 0 0 0 3 3h2M10 7l-3-3 3-3" />
                </svg>
                {isActive ? 'Branching…' : 'Branch'}
              </button>

              <button
                className="cc-node-action-btn"
                onClick={(e) => { e.stopPropagation(); setShowColors((s) => !s); }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: node.color, border: '1px solid var(--swatch-border)',
                  display: 'inline-block', flexShrink: 0,
                }} />
                Color
              </button>
            </div>

            {/* Swatches */}
            {showColors && (
              <div
                style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
                onClick={(e) => e.stopPropagation()}
              >
                {SWATCHES.map((s, i) => (
                  <button
                    key={s}
                    title={SWATCH_LABELS[i]}
                    onClick={() => { onColorChange(s); setShowColors(false); }}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', background: s,
                      border: node.color === s ? '2px solid var(--accent)' : '1.5px solid var(--swatch-border)',
                      cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.2)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
