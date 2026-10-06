"use client";

import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeBranch } from "@fortawesome/free-solid-svg-icons";
import type { BranchEdge } from "../types";

const BRANCH_ICON_SIZE = 18;
// Set on the canvas wrapper from the "Thread lines" setting.
const THREAD_LINE_OPACITY = "var(--thread-line-opacity, 1)";

// One-time SVG marker definitions, referenced by id from the edge
// components below. Rendered once as a sibling of the ReactFlow canvas
// (see CanvasChat.tsx) so the `url(#...)` references resolve document-wide.
export function CanvasEdgeMarkerDefs() {
  return (
    <svg width={0} height={0} className="absolute">
      <defs>
        <marker id="arrow-branch" markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill="var(--color-connector)" />
        </marker>
      </defs>
    </svg>
  );
}

export function BranchEdgeComponent({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
}: EdgeProps<BranchEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <path
        d={edgePath}
        stroke="var(--color-connector)"
        strokeOpacity={1}
        strokeWidth={1.5}
        fill="none"
        strokeDasharray="5 4"
        markerEnd="url(#arrow-branch)"
        style={{ opacity: THREAD_LINE_OPACITY }}
      />
      {/* Midpoint branch glyph — visually distinguishes this from a plain line */}
      <EdgeLabelRenderer>
        <div
          data-edge-id={id}
          className="absolute flex items-center justify-center rounded-full
                     bg-surface-overlay border border-border pointer-events-none"
          style={{
            width: BRANCH_ICON_SIZE,
            height: BRANCH_ICON_SIZE,
            left: labelX,
            top: labelY,
            transform: "translate(-50%, -50%)",
            opacity: THREAD_LINE_OPACITY,
          }}
        >
          <FontAwesomeIcon icon={faCodeBranch} className="w-2.5 h-2.5 text-foreground-muted" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
