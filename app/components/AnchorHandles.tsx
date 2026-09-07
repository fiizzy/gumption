"use client";

import type { CSSProperties } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "../lib/cn";

// Side-midpoint-only anchor points (the corners are reserved for resize
// handles instead — see ResizeHandles — to avoid the two systems fighting
// over the same 4 spots). Each point is usable as both a connection source
// and target, so any two anchorable elements can connect from/to any side,
// in either direction.
const ANCHOR_POINTS = [
  { id: "top", position: Position.Top, top: "0%", left: "50%" },
  { id: "right", position: Position.Right, top: "50%", left: "100%" },
  { id: "bottom", position: Position.Bottom, top: "100%", left: "50%" },
  { id: "left", position: Position.Left, top: "50%", left: "0%" },
] as const;

const HANDLE_VISUAL_SIZE = 8;
// Hit area is deliberately much bigger than the visible square — an 8px
// target is hard to land a drag on, so both the visible source dot and the
// (fully invisible) target both get a generous click/drop radius around it.
const HANDLE_HIT_SIZE = 22;
const TARGET_HIT_SIZE = 22;

interface Props {
  // Reveal the visible square handles on hover/select, same convention as
  // every other per-element affordance (color chip, resize handles, ...).
  visible: boolean;
}

// Shared by ConversationNode and CanvasElement — every anchorable node type
// renders the exact same 4 side points so any of them can connect to any
// other (chat-node-to-chat-node is rejected separately, in CanvasChat's
// isValidConnection, not by omitting handles here).
export default function AnchorHandles({ visible }: Props) {
  const handleBoxStyle = (top: string, left: string): CSSProperties => ({
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
  });

  return (
    <>
      {ANCHOR_POINTS.flatMap(({ id, position, top, left }) => [
        <Handle
          key={`${id}-source`}
          type="source"
          position={position}
          id={`anchor-${id}-source`}
          className="z-20"
          style={handleBoxStyle(top, left)}
        >
          <div
            className={cn(
              "pointer-events-none rounded-[2px] border-2 border-surface-overlay bg-accent transition-opacity",
              visible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{ width: HANDLE_VISUAL_SIZE, height: HANDLE_VISUAL_SIZE }}
          />
        </Handle>,
        <Handle
          key={`${id}-target`}
          type="target"
          position={position}
          id={`anchor-${id}-target`}
          style={{
            top,
            left,
            width: TARGET_HIT_SIZE,
            height: TARGET_HIT_SIZE,
            transform: "translate(-50%, -50%)",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            opacity: 0,
            // Was missing before — ResizeHandles' edge strips (z-index
            // 15/16) sit at these exact same side-midpoints and, lacking
            // this, would paint over the target and silently swallow every
            // drop, which is why connections often failed to land at all.
            zIndex: 20,
          }}
        />,
      ])}
    </>
  );
}
