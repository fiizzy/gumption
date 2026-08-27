"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";
import { BranchEdge, LinkEdge } from "../types";

// One-time SVG marker definitions, referenced by id from both edge types
// below. Rendered once as a sibling of the ReactFlow canvas (see
// CanvasChat.tsx) so the `url(#...)` references resolve document-wide.
export function CanvasEdgeMarkerDefs() {
  return (
    <svg width={0} height={0} className="absolute">
      <defs>
        <marker id="arrow-branch" markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill="var(--color-connector)" />
        </marker>
        <marker id="arrow-link" markerWidth="6" markerHeight="4" refX="4" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="var(--color-connector)" fillOpacity="0.5" />
        </marker>
      </defs>
    </svg>
  );
}

export function BranchEdgeComponent({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
}: EdgeProps<BranchEdge>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <path
      d={edgePath}
      stroke="var(--color-connector)"
      strokeOpacity={1}
      strokeWidth={1.5}
      fill="none"
      strokeDasharray="5 4"
      markerEnd="url(#arrow-branch)"
    />
  );
}

export function LinkEdgeComponent({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
}: EdgeProps<LinkEdge>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <path
      d={edgePath}
      stroke="var(--color-connector)"
      strokeOpacity={0.7}
      strokeWidth={1.5}
      fill="none"
      strokeDasharray="4 5"
      markerEnd="url(#arrow-link)"
    />
  );
}
