"use client";

import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import type { ResizeHandleKind } from "../types";

const CORNER_POSITIONS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const EDGE_CONTROLS: {
  position: "top" | "right" | "bottom" | "left";
  resizeDirection: "horizontal" | "vertical";
}[] = [
  { position: "top", resizeDirection: "vertical" },
  { position: "right", resizeDirection: "horizontal" },
  { position: "bottom", resizeDirection: "vertical" },
  { position: "left", resizeDirection: "horizontal" },
];

const HANDLE_VISUAL_SIZE = 8;
const EDGE_VISUAL_THICKNESS = 4;
// Hit areas are bigger than the visible square so a resize handle can be
// grabbed without hunting for it. Overridable per caller: on a small
// element (a one-line text box) the defaults would cover most of it and
// swallow the clicks meant for its own content.
const DEFAULT_CORNER_HIT_SIZE = 20;
const DEFAULT_EDGE_HIT_THICKNESS = 16;
const CORNER_Z_INDEX = 16;
// Below AnchorHandles (z-20) so the anchor square at each edge's center
// keeps priority for connecting.
const EDGE_Z_INDEX = 15;

export type ResizeEdges = "all" | "horizontal" | "none";

interface Props {
  minWidth: number;
  minHeight: number;
  onResize: (width: number, height: number, x: number, y: number, handleKind: ResizeHandleKind) => void;
  edges?: ResizeEdges;
  keepAspectRatioOnCorners?: boolean;
  cornerHitSize?: number;
  edgeHitThickness?: number;
}

// Rendered only while the element is selected. Pointer events are forced
// on because some elements (transparent shapes) switch their wrapper's
// pointer events off so clicks pass through their empty interior.
export default function ResizeHandles({
  minWidth,
  minHeight,
  onResize,
  edges = "all",
  keepAspectRatioOnCorners = false,
  cornerHitSize = DEFAULT_CORNER_HIT_SIZE,
  edgeHitThickness = DEFAULT_EDGE_HIT_THICKNESS,
}: Props) {
  const makeResizeHandler =
    (handleKind: ResizeHandleKind) => (_: unknown, params: { width: number; height: number; x: number; y: number }) =>
      onResize(params.width, params.height, params.x, params.y, handleKind);

  const visibleEdges = EDGE_CONTROLS.filter(
    ({ resizeDirection }) => edges === "all" || (edges === "horizontal" && resizeDirection === "horizontal"),
  );

  return (
    <>
      {CORNER_POSITIONS.map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={keepAspectRatioOnCorners}
          onResize={makeResizeHandler("corner")}
          style={{
            width: cornerHitSize,
            height: cornerHitSize,
            background: "transparent",
            border: "none",
            borderRadius: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "all",
            zIndex: CORNER_Z_INDEX,
          }}
        >
          <div
            className="pointer-events-none rounded-[2px] border-2 border-surface-overlay bg-accent"
            style={{ width: HANDLE_VISUAL_SIZE, height: HANDLE_VISUAL_SIZE }}
          />
        </NodeResizeControl>
      ))}

      {visibleEdges.map(({ position, resizeDirection }) => {
        const isVertical = position === "left" || position === "right";
        return (
          <NodeResizeControl
            key={position}
            position={position}
            resizeDirection={resizeDirection}
            variant={ResizeControlVariant.Line}
            minWidth={minWidth}
            minHeight={minHeight}
            onResize={makeResizeHandler("edge")}
            className="group/edge"
            style={{
              ...(isVertical ? { width: edgeHitThickness } : { height: edgeHitThickness }),
              background: "transparent",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "all",
              zIndex: EDGE_Z_INDEX,
            }}
          >
            <div
              className="pointer-events-none rounded-full bg-accent opacity-0 transition-opacity group-hover/edge:opacity-100"
              style={{
                width: isVertical ? EDGE_VISUAL_THICKNESS : "100%",
                height: isVertical ? "100%" : EDGE_VISUAL_THICKNESS,
              }}
            />
          </NodeResizeControl>
        );
      })}
    </>
  );
}
