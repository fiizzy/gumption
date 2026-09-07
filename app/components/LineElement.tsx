"use client";

import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import type { HydratedLineElementNode, Point } from "../types";

const ENDPOINT_SIZE = 12;
const HIT_STROKE_WIDTH = 16;
const DASHED_PATTERN = "8 6";

type Props = NodeProps<HydratedLineElementNode>;

export default function LineElement({
  id,
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const [draggingIndex, setDraggingIndex] = useState<0 | 1 | null>(null);

  const { points, kind, color, strokeStyle, onPointsChange, onDeleteElement, onSnapPoint } = data;
  const width = Math.max(Math.abs(points[1].x - points[0].x), 1);
  const height = Math.max(Math.abs(points[1].y - points[0].y), 1);

  const beginDrag = (index: 0 | 1) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingIndex(index);
  };

  const continueDrag = (index: 0 | 1) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIndex !== index) return;
    event.stopPropagation();
    const otherIndex: 0 | 1 = index === 0 ? 1 : 0;
    const otherAbsolute: Point = {
      x: positionAbsoluteX + points[otherIndex].x,
      y: positionAbsoluteY + points[otherIndex].y,
    };
    const draggedAbsoluteRaw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const draggedAbsolute = onSnapPoint(draggedAbsoluteRaw);
    const newMinX = Math.min(draggedAbsolute.x, otherAbsolute.x);
    const newMinY = Math.min(draggedAbsolute.y, otherAbsolute.y);
    const newPoints: [Point, Point] = [points[0], points[1]];
    newPoints[index] = { x: draggedAbsolute.x - newMinX, y: draggedAbsolute.y - newMinY };
    newPoints[otherIndex] = { x: otherAbsolute.x - newMinX, y: otherAbsolute.y - newMinY };
    onPointsChange(newPoints, { x: newMinX, y: newMinY });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingIndex(null);
  };

  const markerId = `arrow-line-${id}`;

  return (
    <div className="relative" style={{ width, height, cursor: "grab" }}>
      <svg
        className="absolute inset-0 w-full h-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <marker id={markerId} markerWidth="7" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill={color} />
          </marker>
        </defs>
        {/* Wide transparent stroke — the actual click/drag hit target for a thin line */}
        <line
          x1={points[0].x} y1={points[0].y}
          x2={points[1].x} y2={points[1].y}
          stroke="transparent"
          strokeWidth={HIT_STROKE_WIDTH}
        />
        <line
          x1={points[0].x} y1={points[0].y}
          x2={points[1].x} y2={points[1].y}
          stroke={color}
          strokeWidth={selected ? 2.5 : 2}
          strokeDasharray={strokeStyle === "dashed" ? DASHED_PATTERN : undefined}
          markerEnd={kind === "arrow" ? `url(#${markerId})` : undefined}
        />
      </svg>

      {selected && (
        <>
          {([0, 1] as const).map((index) => (
            <div
              key={index}
              onPointerDown={beginDrag(index)}
              onPointerMove={continueDrag(index)}
              onPointerUp={endDrag}
              className="nodrag absolute rounded-full bg-surface-overlay border-2 border-accent cursor-grab active:cursor-grabbing z-20"
              style={{
                width: ENDPOINT_SIZE,
                height: ENDPOINT_SIZE,
                left: points[index].x - ENDPOINT_SIZE / 2,
                top: points[index].y - ENDPOINT_SIZE / 2,
              }}
            />
          ))}
          <button
            onClick={onDeleteElement}
            title="Delete"
            className="nodrag absolute w-6 h-6 flex items-center justify-center rounded-md border border-border bg-surface-overlay
                       text-foreground-muted hover:text-foreground hover:bg-surface-subtle cursor-pointer z-20"
            style={{
              left: (points[0].x + points[1].x) / 2 - 12,
              top: (points[0].y + points[1].y) / 2 - 12,
            }}
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}
