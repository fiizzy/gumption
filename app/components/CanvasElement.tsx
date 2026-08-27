"use client";

import { useRef, useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { HydratedTextElementNode, HydratedShapeElementNode } from "../types";
import { DEFAULT_COLOR, SWATCHES } from "./ConversationNode";
import { cn } from "../lib/cn";

const SHAPE_SIZE = 140;
const TEXT_MIN_WIDTH = 160;
const TEXT_MAX_WIDTH = 340;

type Props = NodeProps<HydratedTextElementNode> | NodeProps<HydratedShapeElementNode>;

export default function CanvasElement({ type, data, selected }: Props) {
  const isShape = type === "shapeElement";

  const textEditRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(
    !isShape && !!(data as HydratedTextElementNode["data"]).autoEdit,
  );
  const [showColors, setShowColors] = useState(false);

  // Focus + place caret when entering edit mode
  useEffect(() => {
    if (!isEditing) return;
    const editableElement = textEditRef.current;
    if (!editableElement) return;
    editableElement.focus();
    const range = document.createRange();
    range.selectNodeContents(editableElement);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing]);

  const { color, onColorChange, onDeleteElement } = data;
  const hasTint = color !== DEFAULT_COLOR;

  return (
    <div
      onDoubleClick={(e) => {
        if (isShape) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      style={{
        userSelect: isEditing ? "text" : "none",
        cursor: isShape ? undefined : isEditing ? "text" : "grab",
        ...(isShape
          ? {
              width: SHAPE_SIZE,
              height: SHAPE_SIZE,
              background: hasTint ? color : "var(--color-surface-overlay)",
              borderRadius:
                (data as HydratedShapeElementNode["data"]).shapeKind === "circle"
                  ? "9999px"
                  : 12,
            }
          : { minWidth: TEXT_MIN_WIDTH, maxWidth: TEXT_MAX_WIDTH }),
      }}
      className={cn(
        "animate-node-in font-sans",
        isShape && "border cursor-grab active:cursor-grabbing",
        isShape && (selected ? "border-accent shadow-card-active" : "border-border shadow-card"),
        !isShape && "rounded-md",
        !isShape && selected && "outline outline-2 outline-accent outline-offset-4",
      )}
    >
      <div
        ref={textEditRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onInput={(e) => {
          if (!isShape) (data as HydratedTextElementNode["data"]).onTextChange(e.currentTarget.textContent ?? "");
        }}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.currentTarget.blur(); }
          e.stopPropagation();
        }}
        onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
        style={{
          color: !isShape ? (hasTint ? color : "var(--color-foreground)") : undefined,
          padding: isShape ? undefined : "6px 2px",
        }}
        className={cn(
          "outline-none whitespace-pre-wrap break-words text-[16px] leading-snug",
          isEditing && "nodrag cursor-auto",
          !isShape && "empty:before:content-['Type_something…'] empty:before:text-foreground-subtle empty:before:pointer-events-none",
          isShape && "w-full h-full",
        )}
      >
        {!isShape ? (data as HydratedTextElementNode["data"]).text : undefined}
      </div>

      {/* Floating action chip — color + delete, shown when selected */}
      {selected && !isEditing && (
        <div
          className="nodrag cursor-auto absolute -top-9 left-0 flex items-center gap-1 px-1 py-1 rounded-lg
                     bg-surface-overlay border border-border shadow-card z-30"
        >
          <button
            onClick={() => setShowColors((s) => !s)}
            title="Color"
            className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer"
          >
            <span
              className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
              style={{ background: color, border: "1.5px solid rgba(0,0,0,0.15)" }}
            />
          </button>
          <button
            onClick={onDeleteElement}
            title="Delete"
            className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent
                       text-foreground-muted hover:text-foreground hover:bg-surface-subtle cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {selected && showColors && !isEditing && (
        <div
          className="nodrag cursor-auto absolute -top-[74px] left-0 flex gap-1.5 p-2 rounded-lg flex-wrap w-[168px]
                     bg-surface-overlay border border-border shadow-card z-30"
        >
          {SWATCHES.map(({ label, value }) => (
            <button
              key={value}
              title={label}
              onClick={() => { onColorChange(value); setShowColors(false); }}
              className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 transition-transform hover:scale-125"
              style={{
                background: value,
                outline: color === value ? "2px solid var(--color-accent)" : "1.5px solid rgba(0,0,0,0.15)",
                outlineOffset: color === value ? "2px" : "0",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
