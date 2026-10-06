"use client";

import { useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import type { HydratedLineElementNode } from "../types";
import { getLinePaths } from "../lib/roughShapes";
import RoughPaths from "./RoughPaths";

const ENDPOINT_SIZE = 12;
const HIT_STROKE_MIN_WIDTH = 16;
const HIT_STROKE_PADDING = 10;
const SELECTION_HIGHLIGHT_PADDING = 6;
const SELECTION_HIGHLIGHT_OPACITY = 0.25;

type Props = NodeProps<HydratedLineElementNode>;

export default function LineElement({ data, selected }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const [draggingEndpointIndex, setDraggingEndpointIndex] = useState<0 | 1 | null>(null);

  const {
    kind,
    points,
    seed,
    strokeColor,
    strokeWidth,
    strokeStyle,
    sloppiness,
    opacity,
    onEndpointDrag,
    onEndpointDragEnd,
  } = data;
  const [start, end] = points;
  const width = Math.max(Math.abs(end.x - start.x), 1);
  const height = Math.max(Math.abs(end.y - start.y), 1);

  const roughPaths = useMemo(
    () => getLinePaths({ kind, points, seed, strokeWidth, strokeStyle, sloppiness }),
    [kind, points, seed, strokeWidth, strokeStyle, sloppiness],
  );

  const beginEndpointDrag = (index: 0 | 1) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingEndpointIndex(index);
  };

  const continueEndpointDrag = (index: 0 | 1) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingEndpointIndex !== index) return;
    event.stopPropagation();
    onEndpointDrag(index, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const endEndpointDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingEndpointIndex === null) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingEndpointIndex(null);
    onEndpointDragEnd();
  };

  return (
    <div className="relative text-foreground" style={{ width, height }}>
      <svg className="absolute inset-0 overflow-visible" width={width} height={height}>
        {selected && (
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="var(--color-accent)"
            strokeWidth={strokeWidth + SELECTION_HIGHLIGHT_PADDING}
            strokeLinecap="round"
            opacity={SELECTION_HIGHLIGHT_OPACITY}
            pointerEvents="none"
          />
        )}
        {/* Wide invisible stroke — the actual click/drag hit target for a
            thin line; the node's own box is click-through (see CanvasChat). */}
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="transparent"
          strokeWidth={Math.max(HIT_STROKE_MIN_WIDTH, strokeWidth + HIT_STROKE_PADDING)}
          strokeLinecap="round"
          pointerEvents="stroke"
          className="cursor-move"
        />
        <g pointerEvents="none" style={{ opacity: opacity / 100 }}>
          <RoughPaths paths={roughPaths} strokeColor={strokeColor} strokeWidth={strokeWidth} strokeStyle={strokeStyle} />
        </g>
      </svg>

      {selected &&
        ([0, 1] as const).map((index) => (
          <div
            key={index}
            onPointerDown={beginEndpointDrag(index)}
            onPointerMove={continueEndpointDrag(index)}
            onPointerUp={endEndpointDrag}
            onPointerCancel={endEndpointDrag}
            className="nodrag nopan absolute rounded-full bg-surface-overlay border-2 border-accent cursor-crosshair z-20"
            style={{
              width: ENDPOINT_SIZE,
              height: ENDPOINT_SIZE,
              left: points[index].x - ENDPOINT_SIZE / 2,
              top: points[index].y - ENDPOINT_SIZE / 2,
              pointerEvents: "all",
            }}
          />
        ))}
    </div>
  );
}
