"use client";

import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import { cn } from "../lib/cn";

// Corners resize both axes and reveal on hovering the node — or stay shown
// while selected — the same convention AnchorHandles uses (requires the
// node's own outer wrapper to have the Tailwind `group` class). Edges
// resize a single axis and reveal themselves purely on hovering that edge
// specifically; both interactive hit areas exist regardless of visibility,
// matching AnchorHandles' always-present-but-visually-toggled handles.
// Edges render as a full-length strip rather than a single dot so they
// never visually collide with the small anchor square sitting at the exact
// center of the same edge.
const CORNER_CONTROLS: { position: "top-left" | "top-right" | "bottom-right" | "bottom-left" }[] = [
  { position: "top-left" },
  { position: "top-right" },
  { position: "bottom-right" },
  { position: "bottom-left" },
];

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
// Hit area bigger than the visible square, same reasoning as AnchorHandles
// — a resize handle you can actually land a drag on without hunting for it.
// Overridable per caller: a small element (like a freshly-placed text box)
// can be mostly *covered* by the default sizes, which then swallow the
// plain clicks that were supposed to reach the element's own content.
const DEFAULT_CORNER_HIT_SIZE = 20;
const DEFAULT_EDGE_HIT_THICKNESS = 28;

export type ResizeHandleKind = "corner" | "edge";

interface Props {
  isVisible: boolean;
  minWidth: number;
  minHeight: number;
  onResize: (width: number, height: number, x: number, y: number, handleKind: ResizeHandleKind) => void;
  cornerHitSize?: number;
  edgeHitThickness?: number;
}

export default function ResizeHandles({
  isVisible,
  minWidth,
  minHeight,
  onResize,
  cornerHitSize = DEFAULT_CORNER_HIT_SIZE,
  edgeHitThickness = DEFAULT_EDGE_HIT_THICKNESS,
}: Props) {
  const makeResizeHandler =
    (handleKind: ResizeHandleKind) => (_: unknown, params: { width: number; height: number; x: number; y: number }) =>
      onResize(params.width, params.height, params.x, params.y, handleKind);

  return (
    <>
      {CORNER_CONTROLS.map(({ position }) => (
        <NodeResizeControl
          key={position}
          position={position}
          minWidth={minWidth}
          minHeight={minHeight}
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
            // Above both the edge strips (z-index 15 below) and the
            // node's own content, so corners still win in the overlap.
            zIndex: 16,
          }}
        >
          <div
            className={cn(
              "pointer-events-none rounded-[2px] border-2 border-surface-overlay bg-accent transition-opacity",
              isVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{ width: HANDLE_VISUAL_SIZE, height: HANDLE_VISUAL_SIZE }}
          />
        </NodeResizeControl>
      ))}

      {EDGE_CONTROLS.map(({ position, resizeDirection }) => {
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
              // Half this band sits inside the shape's own bounds, where the
              // node's header/body/text content would otherwise sit on top
              // of it in normal DOM-order stacking and swallow the hover —
              // this keeps the inward half just as reachable as the outward
              // half. Still below AnchorHandles (z-20) so the anchor square
              // at this edge's exact center keeps priority for connecting.
              zIndex: 15,
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
