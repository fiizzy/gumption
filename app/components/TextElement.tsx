"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { HydratedTextElementNode } from "../types";
import { LINE_HEIGHT } from "../lib/elementStyle";
import { TEXT_PADDING_X, TEXT_PADDING_Y } from "../lib/geometry";
import { getFontFamilyClass } from "../lib/fonts";
import { cn } from "../lib/cn";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";
import EditableText from "./EditableText";

const TEXT_MIN_WIDTH = 24;
const TEXT_MIN_HEIGHT = 8;
// A one-line text box is short, so the default hit areas would cover most
// of it and swallow the double-click meant to start editing.
const TEXT_CORNER_HIT_SIZE = 14;
const TEXT_EDGE_HIT_THICKNESS = 10;
const SELECTION_OUTLINE_OFFSET = 4;

function TextElement({ data, selected }: NodeProps<HydratedTextElementNode>) {
  const {
    text,
    width,
    strokeColor,
    fontSize,
    fontFamily,
    fontWeight,
    opacity,
    isEditing,
    isBindingTarget,
    onTextChange,
    onStopEditing,
    onResizeElement,
  } = data;

  return (
    <div
      className={cn(
        "relative group text-foreground cursor-move rounded-sm",
        isBindingTarget && "outline-2 outline-solid outline-accent/60",
      )}
      style={{ width }}
    >
      <EditableText
        text={text}
        isEditing={isEditing}
        placeholder="Type something…"
        onChange={onTextChange}
        onStopEditing={onStopEditing}
        className={getFontFamilyClass(fontFamily)}
        style={{
          color: strokeColor,
          opacity: opacity / 100,
          fontSize,
          fontWeight: fontWeight === "bold" ? 700 : 400,
          lineHeight: LINE_HEIGHT,
          padding: `${TEXT_PADDING_Y}px ${TEXT_PADDING_X}px`,
          minHeight: fontSize * LINE_HEIGHT + TEXT_PADDING_Y * 2,
        }}
      />

      {selected && !isEditing && (
        <div
          className="absolute pointer-events-none border border-accent rounded-sm"
          style={{ inset: -SELECTION_OUTLINE_OFFSET }}
        />
      )}

      {!isEditing && <AnchorHandles visible={selected} />}
      {selected && !isEditing && (
        <ResizeHandles
          minWidth={TEXT_MIN_WIDTH}
          minHeight={TEXT_MIN_HEIGHT}
          edges="horizontal"
          keepAspectRatioOnCorners
          cornerHitSize={TEXT_CORNER_HIT_SIZE}
          edgeHitThickness={TEXT_EDGE_HIT_THICKNESS}
          onResize={(newWidth, _newHeight, x, y, handleKind) => onResizeElement(newWidth, x, y, handleKind)}
        />
      )}
    </div>
  );
}

export default memo(TextElement);
