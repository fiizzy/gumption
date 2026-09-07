"use client";

import { useRef, useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Nothing_You_Could_Do } from "next/font/google";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { HydratedTextElementNode, HydratedShapeElementNode } from "../types";
import { DEFAULT_COLOR } from "../lib/color";
import { cn } from "../lib/cn";
import ColorSwatches from "./ColorSwatches";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";

// Freeform text elements only — everything else (chat cards, shape labels,
// the rest of the UI) keeps the app's normal sans-serif font.
const textFont = Nothing_You_Could_Do({ subsets: ["latin"], weight: "400" });

const SHAPE_MIN_SIZE = 40;
const TEXT_MIN_WIDTH = 120;
const TEXT_MIN_HEIGHT = 32;
const DIAMOND_POINTS = "50,2 98,50 50,98 2,50";
const DASHED_PATTERN = "8 6";
// Smaller than ResizeHandles' shape/chat-node defaults (20/28) — a text
// element's default box is only 40px tall, so the full-size hit areas would
// cover almost the entire box and swallow the plain clicks meant to enter
// edit mode, leaving only a thin gap (e.g. right where "Type something…"
// renders) actually clickable.
const TEXT_CORNER_HIT_SIZE = 14;
const TEXT_EDGE_HIT_THICKNESS = 12;

type Props = NodeProps<HydratedTextElementNode> | NodeProps<HydratedShapeElementNode>;

export default function CanvasElement({ type, data, selected }: Props) {
  const isShape = type === "shapeElement";
  const shapeData = isShape ? (data as HydratedShapeElementNode["data"]) : undefined;
  const textData = !isShape ? (data as HydratedTextElementNode["data"]) : undefined;
  const isDiamond = shapeData?.shapeKind === "diamond";

  const textEditRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(!isShape && !!textData?.autoEdit);
  const [showColors, setShowColors] = useState(false);

  // Seed the DOM once when entering edit mode, then focus + place the caret
  // at the end. While editing, the div's children are deliberately left out
  // of the JSX below (see the `{!isEditing && textData?.text}` render) so
  // React never re-renders its text content on every keystroke — a
  // React-controlled contentEditable resets the caret to the start of the
  // element on every re-render, which made typed text build up back-to-front.
  // The DOM owns the content while editing; onInput below keeps parent
  // state in sync purely for read-outs elsewhere (title preview, etc).
  //
  // The actual focus+caret call is deferred and retried across a few
  // frames: when a brand-new text element is placed via the text tool,
  // this effect's mount coincides with xyflow's own click/selection
  // handling for the pane click that created it, which can steal focus
  // back to the canvas immediately afterward — sometimes more than one
  // frame later — if we only try once. Re-asserting focus for a few frames
  // (stopping as soon as it actually sticks) makes this reliable regardless
  // of exactly when the competing focus change happens, so placing a text
  // element is a genuine two-click-then-type flow with no extra click needed.
  useEffect(() => {
    if (!isEditing) return;
    const editableElement = textEditRef.current;
    if (!editableElement) return;
    editableElement.textContent = textData?.text ?? "";

    const placeCaretAtEnd = () => {
      editableElement.focus();
      const range = document.createRange();
      range.selectNodeContents(editableElement);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    let attemptsLeft = 5;
    let frame = requestAnimationFrame(function tryFocus() {
      placeCaretAtEnd();
      attemptsLeft -= 1;
      if (attemptsLeft > 0 && document.activeElement !== editableElement) {
        frame = requestAnimationFrame(tryFocus);
      }
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const { color, onColorChange, onDeleteElement } = data;
  const hasTint = color !== DEFAULT_COLOR;
  const shapeFill = hasTint ? color : "var(--color-surface-overlay)";
  const width = shapeData ? shapeData.width : textData!.width;
  const height = shapeData ? shapeData.height : textData!.height;
  const onResizeElement = shapeData ? shapeData.onResizeElement : textData!.onResizeElement;

  return (
    <div
      onDoubleClick={(e) => {
        if (isShape) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      onClick={(e) => {
        // A genuine drag doesn't fire a click at all (xyflow's drag
        // handling consumes the gesture), so it's safe to enter edit mode
        // on every click, not just a second one — dragging still works.
        if (isShape || isEditing) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      style={{
        userSelect: isEditing ? "text" : "none",
        cursor: isShape ? undefined : isEditing ? "text" : "grab",
        width,
        height,
        background: shapeData && !isDiamond ? shapeFill : undefined,
        borderRadius: shapeData
          ? shapeData.shapeKind === "circle"
            ? "9999px"
            : shapeData.shapeKind === "square"
              ? 12
              : undefined
          : undefined,
        borderStyle: shapeData && !isDiamond ? shapeData.strokeStyle : undefined,
      }}
      className={cn(
        "animate-node-in font-sans relative group",
        isShape && "cursor-grab active:cursor-grabbing",
        isShape && !isDiamond && "border",
        isShape && !isDiamond && (selected ? "border-accent" : "border-border"),
        !isShape && "rounded-md",
        !isShape && selected && "outline outline-2 outline-accent outline-offset-4",
      )}
    >
      {/* Anchor + resize points — lets this shape/text element connect to
          (or from) any other shape/text/chat-node element on any side, and
          be resized from its corners/edges. Hidden while actively editing
          text so they don't compete with placing the caret. */}
      {!isEditing && (
        <>
          <AnchorHandles visible={selected} />
          <ResizeHandles
            isVisible={selected}
            minWidth={isShape ? SHAPE_MIN_SIZE : TEXT_MIN_WIDTH}
            minHeight={isShape ? SHAPE_MIN_SIZE : TEXT_MIN_HEIGHT}
            onResize={onResizeElement}
            {...(!isShape && { cornerHitSize: TEXT_CORNER_HIT_SIZE, edgeHitThickness: TEXT_EDGE_HIT_THICKNESS })}
          />
        </>
      )}

      {isDiamond && shapeData && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={DIAMOND_POINTS}
            fill={shapeFill}
            stroke={selected ? "var(--color-accent)" : "var(--color-border)"}
            strokeWidth={selected ? 3 : 1.5}
            strokeDasharray={shapeData.strokeStyle === "dashed" ? DASHED_PATTERN : undefined}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      <div
        ref={textEditRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onInput={(e) => {
          if (textData) textData.onTextChange(e.currentTarget.textContent ?? "");
        }}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.currentTarget.blur(); }
          e.stopPropagation();
        }}
        onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
        style={{
          color: textData ? (hasTint ? color : "var(--color-foreground)") : undefined,
          caretColor: textData ? (hasTint ? color : "var(--color-foreground)") : undefined,
          padding: isShape ? undefined : "6px 8px",
          fontWeight: textData?.fontWeight === "bold" ? 700 : 400,
          fontSize: textData?.fontSize,
        }}
        className={cn(
          "outline-none whitespace-pre-wrap break-words leading-snug w-full h-full relative",
          isEditing && "nodrag cursor-auto",
          !isShape && textFont.className,
          !isShape && "cc-scroll overflow-y-auto",
          !isShape && "empty:before:content-['Type_something…'] empty:before:text-foreground-subtle empty:before:pointer-events-none",
        )}
      >
        {!isEditing ? textData?.text : undefined}
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
          className="nodrag cursor-auto absolute -top-[74px] left-0 p-2 rounded-lg w-[168px]
                     bg-surface-overlay border border-border shadow-card z-30"
        >
          <ColorSwatches
            color={color}
            onChange={(value) => { onColorChange(value); setShowColors(false); }}
          />
        </div>
      )}
    </div>
  );
}
