'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ConversationNode from './ConversationNode';
import ChatInput from './ChatInput';
import { NodeData, NodeDims } from '../types';
import { simulateAI } from '../lib/ai';

export default function CanvasChat() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeDims, setNodeDims] = useState<Record<string, NodeDims>>({});

  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const rootCount = useRef(0);

  // Canvas pan
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    isPanning.current = true;
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
    };
    const handleUp = () => {
      isPanning.current = false;
      const bg = document.getElementById('canvas-bg');
      if (bg) bg.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const updateNodePos = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  const updateNodeColor = useCallback((id: string, color: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, minimized: !n.minimized } : n)));
  }, []);

  const updateDims = useCallback((id: string, w: number, h: number) => {
    setNodeDims((prev) => ({ ...prev, [id]: { w, h } }));
  }, []);

  const addNode = async (prompt: string) => {
    const id = crypto.randomUUID();
    const parentId = activeNodeId;

    let x: number;
    let y: number;

    if (parentId) {
      const parent = nodes.find((n) => n.id === parentId);
      if (parent) {
        const siblings = nodes.filter((n) => n.parentId === parentId).length;
        const parentDim = nodeDims[parentId] ?? { w: 288, h: 180 };
        x = parent.x + parentDim.w + 60;
        y = parent.y + siblings * 220;
      } else {
        x = 200;
        y = 200;
      }
    } else {
      const col = rootCount.current % 3;
      const row = Math.floor(rootCount.current / 3);
      x = 80 + col * 340;
      y = 80 + row * 280;
      rootCount.current += 1;
    }

    const newNode: NodeData = {
      id,
      parentId,
      prompt,
      response: '',
      x,
      y,
      color: '#f8fafc',
      minimized: false,
      loading: true,
    };

    setNodes((prev) => [...prev, newNode]);
    setActiveNodeId(null);

    const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
    const response = await simulateAI(prompt, parent?.prompt, parent?.response);
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, response, loading: false } : n)),
    );
  };

  // Build connector lines
  interface Edge {
    id: string;
    x1: number; y1: number;
    x2: number; y2: number;
  }
  const edges: Edge[] = nodes
    .filter((n) => n.parentId !== null)
    .flatMap((child) => {
      const parent = nodes.find((p) => p.id === child.parentId);
      if (!parent) return [];
      const pd = nodeDims[parent.id] ?? { w: 288, h: 100 };
      const cd = nodeDims[child.id] ?? { w: 288, h: 100 };
      return [{
        id: child.id,
        x1: parent.x + pan.x + pd.w / 2,
        y1: parent.y + pan.y + pd.h,
        x2: child.x + pan.x + cd.w / 2,
        y2: child.y + pan.y,
      }];
    });

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: '#0f172a',
      }}
    >
      {/* Dot-grid background (also the pan target) */}
      <div
        id="canvas-bg"
        onMouseDown={handleBgMouseDown}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'default',
          backgroundImage: 'radial-gradient(circle, #1e3a5f 1.5px, transparent 1.5px)',
          backgroundSize: '28px 28px',
          backgroundPosition: `${pan.x % 28}px ${pan.y % 28}px`,
        }}
      />

      {/* SVG connector lines */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="6"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#475569" />
          </marker>
        </defs>
        {edges.map((e) => {
          const midY = (e.y1 + e.y2) / 2;
          const d = `M ${e.x1} ${e.y1} C ${e.x1} ${midY} ${e.x2} ${midY} ${e.x2} ${e.y2}`;
          return (
            <path
              key={e.id}
              d={d}
              stroke="#334155"
              strokeWidth={2}
              fill="none"
              strokeDasharray="6 4"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>

      {/* Conversation nodes */}
      {nodes.map((node) => {
        const parentNode = node.parentId
          ? nodes.find((n) => n.id === node.parentId)
          : undefined;
        return (
          <ConversationNode
            key={node.id}
            node={node}
            panX={pan.x}
            panY={pan.y}
            isActive={activeNodeId === node.id}
            parentPrompt={parentNode?.prompt}
            onBranch={() =>
              setActiveNodeId((prev) => (prev === node.id ? null : node.id))
            }
            onMove={(x, y) => updateNodePos(node.id, x, y)}
            onColorChange={(color) => updateNodeColor(node.id, color)}
            onToggleMinimize={() => toggleMinimize(node.id)}
            onDimsChange={(w, h) => updateDims(node.id, w, h)}
          />
        );
      })}

      {/* Active node indicator badge */}
      {activeNodeId && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1d4ed8',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 20,
            zIndex: 200,
            boxShadow: '0 4px 16px rgba(29,78,216,0.5)',
          }}
        >
          Branch mode active — type below to create a child node
        </div>
      )}

      {/* Empty state hint */}
      {nodes.length === 0 && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#334155',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>✦</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
            Canvas Chat
          </div>
          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            Type a message below to start your first conversation node.<br />
            Branch any node to explore parallel threads.
          </div>
        </div>
      )}

      <ChatInput
        activeNodeId={activeNodeId}
        activeNodePrompt={
          activeNodeId
            ? nodes.find((n) => n.id === activeNodeId)?.prompt
            : undefined
        }
        onSubmit={addNode}
        onClearActive={() => setActiveNodeId(null)}
      />
    </div>
  );
}
