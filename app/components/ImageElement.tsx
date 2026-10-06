"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { HydratedImageElementNode } from "../types";
import { cn } from "../lib/cn";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";

const IMAGE_MIN_SIZE = 16;
const SELECTION_OUTLINE_OFFSET = 4;

function ImageElement({ data, selected }: NodeProps<HydratedImageElementNode>) {
  const { src, width, height, opacity, isBindingTarget, onResizeElement } = data;

  return (
    <div
      className={cn("relative group cursor-move", isBindingTarget && "outline-4 outline-solid outline-accent/50")}
      style={{ width, height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static export with inline data URLs; next/image adds nothing here */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="block w-full h-full select-none pointer-events-none"
        style={{ opacity: opacity / 100 }}
      />

      {selected && (
        <div
          className="absolute pointer-events-none border border-accent rounded-sm"
          style={{ inset: -SELECTION_OUTLINE_OFFSET }}
        />
      )}

      <AnchorHandles visible={selected} />
      {selected && (
        <ResizeHandles
          minWidth={IMAGE_MIN_SIZE}
          minHeight={IMAGE_MIN_SIZE}
          edges="none"
          keepAspectRatioOnCorners
          onResize={onResizeElement}
        />
      )}
    </div>
  );
}

export default memo(ImageElement);
