'use client';

import { useRef, useEffect, useState } from 'react';
import { NodeData } from '../types';

interface Props {
  node: NodeData;
  panX: number;
  panY: number;
  isActive: boolean;
  parentPrompt?: string;
  onBranch: () => void;
  onMove: (x: number, y: number) => void;
  onColorChange: (color: string) => void;
  onToggleMinimize: () => void;
  onDimsChange: (w: number, h: number) => void;
}

const SWATCHES = [
  { label: 'White', value: '#f8fafc' },
  { label: 'Sky', value: '#e0f2fe' },
  { label: 'Mint', value: '#dcfce7' },
  { label: 'Lemon', value: '#fefce8' },
  { label: 'Lavender', value: '#ede9fe' },
  { label: 'Rose', value: '#ffe4e6' },
  { label: 'Peach', value: '#ffedd5' },
  { label: 'Slate', value: '#e2e8f0' },
];

export default function ConversationNode({
  node,
  panX,
  panY,
  isActive,
  parentPrompt,
  onBranch,
  onMove,
  onColorChange,
  onToggleMinimize,
  onDimsChange,
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panRef = useRef({ x: panX, y: panY });
  const onMoveRef = useRef(onMove);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  // Report dimensions via ResizeObserver
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (!nodeRef.current) return;
      const { offsetWidth, offsetHeight } = nodeRef.current;
      onDimsChange(offsetWidth, offsetHeight);
    });
    obs.observe(el);
    onDimsChange(el.offsetWidth, el.offsetHeight);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global drag listeners — set up once
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onMoveRef.current(
        e.clientX - dragOffset.current.x - panRef.current.x,
        e.clientY - dragOffset.current.y - panRef.current.y,
      );
    };
    const handleUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    const screenX = node.x + panRef.current.x;
    const screenY = node.y + panRef.current.y;
    dragOffset.current = { x: e.clientX - screenX, y: e.clientY - screenY };
  };

  const screenX = node.x + panX;
  const screenY = node.y + panY;

  const promptTitle = node.prompt.length > 38
    ? node.prompt.slice(0, 38) + '…'
    : node.prompt;

  return (
    <div
      ref={nodeRef}
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY,
        width: 288,
        background: node.color,
        border: isActive ? '2px solid #3b82f6' : '1.5px solid rgba(0,0,0,0.12)',
        borderRadius: 14,
        boxShadow: isActive
          ? '0 0 0 4px rgba(59,130,246,0.25), 0 8px 24px rgba(0,0,0,0.35)'
          : '0 4px 16px rgba(0,0,0,0.3)',
        userSelect: 'none',
        zIndex: isActive ? 20 : 5,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={startDrag}
        style={{
          cursor: 'grab',
          padding: '10px 12px',
          borderBottom: node.minimized ? 'none' : '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: node.minimized ? 14 : '14px 14px 0 0',
        }}
      >
        <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>⠿</span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: '#0f172a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {promptTitle}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            color: '#64748b',
            padding: '0 2px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          title={node.minimized ? 'Expand' : 'Minimize'}
        >
          {node.minimized ? '▼' : '▲'}
        </button>
      </div>

      {!node.minimized && (
        <div style={{ padding: '10px 14px 12px' }}>
          {/* Branch context label */}
          {node.parentId && parentPrompt && (
            <div
              style={{
                fontSize: 11,
                color: '#64748b',
                marginBottom: 10,
                padding: '5px 8px',
                background: 'rgba(0,0,0,0.05)',
                borderRadius: 6,
                borderLeft: '3px solid #94a3b8',
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}
            >
              Branched from: &ldquo;{parentPrompt.slice(0, 55)}{parentPrompt.length > 55 ? '…' : ''}&rdquo;
            </div>
          )}

          {/* User prompt */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              You
            </div>
            <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.55 }}>
              {node.prompt}
            </div>
          </div>

          {/* AI response */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              AI
            </div>
            {node.loading ? (
              <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }}>●</span>
                <span>Thinking…</span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {node.response}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onBranch(); }}
              style={{
                fontSize: 12,
                padding: '5px 12px',
                borderRadius: 8,
                background: isActive ? '#1d4ed8' : '#3b82f6',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {isActive ? '✓ Branching' : 'Branch'}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setShowColors((s) => !s); }}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.07)',
                color: '#475569',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Color
            </button>
          </div>

          {/* Color swatches */}
          {showColors && (
            <div
              style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
              onClick={(e) => e.stopPropagation()}
            >
              {SWATCHES.map((s) => (
                <button
                  key={s.value}
                  title={s.label}
                  onClick={() => { onColorChange(s.value); setShowColors(false); }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: s.value,
                    border: node.color === s.value ? '2.5px solid #3b82f6' : '1.5px solid rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
