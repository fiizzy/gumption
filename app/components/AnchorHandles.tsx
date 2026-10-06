"use client";

import type { CSSProperties } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "../lib/cn";

// Side-midpoint-only anchor points (the corners are reserved for resize
// handles instead — see ResizeHandles — to avoid the two systems fighting
// over the same 4 spots). One handle per side: CanvasChat runs xyflow in
// loose connection mode, so each handle works as both start and end.
const ANCHOR_POINTS = [
  { side: "top", position: Position.Top, top: "0%", left: "50%" },
  { side: "right", position: Position.Right, top: "50%", left: "100%" },
  { side: "bottom", position: Position.Bottom, top: "100%", left: "50%" },
  { side: "left", position: Position.Left, top: "50%", left: "0%" },
] as const;

export const ANCHOR_HANDLE_PREFIX = "anchor-";

const HANDLE_VISUAL_SIZE = 8;
// Hit area is deliberately much bigger than the visible square — an 8px
// target is hard to land a drag on.
const HANDLE_HIT_SIZE = 22;
// Above ResizeHandles' edge strips (z-index 15/16), which sit at these
// exact same side-midpoints and would otherwise swallow the drag/drop.
const HANDLE_Z_INDEX = 20;

interface Props {
  // Reveal the visible squares when selected (and on hover otherwise).
  visible: boolean;
}

// Shared by every bindable element type — dragging from one of these to
// another element's anchor creates an arrow bound at both ends (see
// CanvasChat's onConnect). Pointer events are forced on because transparent
// shapes switch their wrapper's pointer events off.
export default function AnchorHandles({ visible }: Props) {
  const handleStyle = (top: string, left: string): CSSProperties => ({
    top,
    left,
    width: HANDLE_HIT_SIZE,
    height: HANDLE_HIT_SIZE,
    transform: "translate(-50%, -50%)",
    background: "transparent",
    border: "none",
    borderRadius: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "all",
    zIndex: HANDLE_Z_INDEX,
  });

  return (
    <>
      {ANCHOR_POINTS.map(({ side, position, top, left }) => (
        <Handle
          key={side}
          type="source"
          position={position}
          id={`${ANCHOR_HANDLE_PREFIX}${side}`}
          style={handleStyle(top, left)}
        >
          <div
            className={cn(
              "pointer-events-none rounded-[2px] border-2 border-surface-overlay bg-accent transition-opacity",
              visible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{ width: HANDLE_VISUAL_SIZE, height: HANDLE_VISUAL_SIZE }}
          />
        </Handle>
      ))}
    </>
  );
}
