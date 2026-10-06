"use client";

import { memo, useMemo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { HydratedShapeElementNode } from "../types";
import { TRANSPARENT_COLOR } from "../lib/color";
import { LINE_HEIGHT } from "../lib/elementStyle";
import { getFontFamilyClass } from "../lib/fonts";
import { getShapeOutlinePath, getShapePaths } from "../lib/roughShapes";
import { cn } from "../lib/cn";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";
import RoughPaths from "./RoughPaths";
import EditableText from "./EditableText";

const SHAPE_MIN_SIZE = 16;
const HIT_STROKE_MIN_WIDTH = 12;
const HIT_STROKE_PADDING = 8;
const SELECTION_OUTLINE_OFFSET = 4;
const BINDING_HIGHLIGHT_WIDTH = 6;
const BINDING_HIGHLIGHT_OPACITY = 0.45;
const LABEL_PADDING = 8;

function ShapeElement({ data, selected }: NodeProps<HydratedShapeElementNode>) {
  const {
    shapeKind,
    width,
    height,
    seed,
    label,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    sloppiness,
    opacity,
    fontSize,
    fontFamily,
    isEditing,
    isBindingTarget,
    onLabelChange,
    onStopEditing,
    onResizeElement,
  } = data;

  const roughPaths = useMemo(
    () => getShapePaths({ shapeKind, width, height, seed, strokeWidth, strokeStyle, sloppiness, backgroundColor, fillStyle }),
    [shapeKind, width, height, seed, strokeWidth, strokeStyle, sloppiness, backgroundColor, fillStyle],
  );
  const outlinePath = useMemo(() => getShapeOutlinePath(shapeKind, width, height), [shapeKind, width, height]);
  const hasFill = backgroundColor !== TRANSPARENT_COLOR;

  return (
    <div className="relative group text-foreground" style={{ width, height }}>
      <svg className="absolute inset-0 overflow-visible" width={width} height={height} style={{ opacity: opacity / 100 }}>
        {/* Invisible hit target: the stroke band always, the interior only
            when filled — so a transparent shape drawn around other
            elements doesn't block clicking them. */}
        <path
          d={outlinePath}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(HIT_STROKE_MIN_WIDTH, strokeWidth + HIT_STROKE_PADDING)}
          pointerEvents={hasFill ? "all" : "stroke"}
          className="cursor-move"
        />
        <g pointerEvents="none">
          <RoughPaths
            paths={roughPaths}
            strokeColor={strokeColor}
            backgroundColor={backgroundColor}
            strokeWidth={strokeWidth}
            strokeStyle={strokeStyle}
          />
        </g>
        {isBindingTarget && (
          <path
            d={outlinePath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={BINDING_HIGHLIGHT_WIDTH}
            opacity={BINDING_HIGHLIGHT_OPACITY}
            pointerEvents="none"
          />
        )}
      </svg>

      {selected && !isEditing && (
        <div
          className="absolute pointer-events-none border border-accent rounded-sm"
          style={{ inset: -SELECTION_OUTLINE_OFFSET }}
        />
      )}

      {(label || isEditing) && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ padding: LABEL_PADDING, opacity: opacity / 100 }}
        >
          <EditableText
            text={label}
            isEditing={isEditing}
            onChange={onLabelChange}
            onStopEditing={onStopEditing}
            className={cn("text-center max-w-full min-w-[1ch]", !isEditing && "cursor-move", getFontFamilyClass(fontFamily))}
            style={{ color: strokeColor, fontSize, lineHeight: LINE_HEIGHT, pointerEvents: "auto" }}
          />
        </div>
      )}

      {!isEditing && <AnchorHandles visible={selected} />}
      {selected && !isEditing && (
        <ResizeHandles minWidth={SHAPE_MIN_SIZE} minHeight={SHAPE_MIN_SIZE} onResize={onResizeElement} />
      )}
    </div>
  );
}

export default memo(ShapeElement);
