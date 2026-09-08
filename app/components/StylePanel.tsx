"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBold, faGripLines, faAnglesUp, faAnglesDown } from "@fortawesome/free-solid-svg-icons";
import ColorSwatches from "./ColorSwatches";
import type { CanvasNode, FontWeight, StrokeStyle } from "../types";
import { cn } from "../lib/cn";

interface Props {
  selection: CanvasNode[];
  onColorChange: (color: string) => void;
  onFontWeightChange: (fontWeight: FontWeight) => void;
  onStrokeStyleChange: (strokeStyle: StrokeStyle) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

// Docked in the toolbox rather than floating next to whatever's selected —
// simpler to position, and it naturally handles multi-select by only
// showing the fields every selected element's type actually has.
export default function StylePanel({
  selection,
  onColorChange,
  onFontWeightChange,
  onStrokeStyleChange,
  onBringToFront,
  onSendToBack,
}: Props) {
  const [showColors, setShowColors] = useState(false);

  if (selection.length === 0) return null;

  const first = selection[0];
  const firstColor = first.data.color as string;
  const allText = selection.every((node) => node.type === "textElement");
  const allStrokeable = selection.every(
    (node) => node.type === "shapeElement" || node.type === "lineElement",
  );
  const firstFontWeight = allText ? (first.data.fontWeight as FontWeight) : undefined;
  const firstStrokeStyle = allStrokeable ? (first.data.strokeStyle as StrokeStyle) : undefined;

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setShowColors((s) => !s)}
          title="Color"
          className="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent hover:bg-surface-subtle cursor-pointer"
        >
          <span
            className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
            style={{ background: firstColor, border: "1.5px solid rgba(0,0,0,0.15)" }}
          />
        </button>
        {showColors && (
          <div
            className="absolute top-full mt-2 left-0 p-2 rounded-lg w-[168px]
                       bg-surface-overlay border border-border shadow-card z-30"
          >
            <ColorSwatches
              color={firstColor}
              onChange={(color) => {
                onColorChange(color);
                setShowColors(false);
              }}
            />
          </div>
        )}
      </div>

      {firstFontWeight !== undefined && (
        <button
          onClick={() => onFontWeightChange(firstFontWeight === "bold" ? "normal" : "bold")}
          title="Bold"
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-md border-none cursor-pointer transition-colors",
            firstFontWeight === "bold"
              ? "bg-accent text-white"
              : "bg-transparent text-foreground-muted hover:bg-surface-subtle",
          )}
        >
          <FontAwesomeIcon icon={faBold} className="w-3 h-3" />
        </button>
      )}

      {firstStrokeStyle !== undefined && (
        <button
          onClick={() => onStrokeStyleChange(firstStrokeStyle === "dashed" ? "solid" : "dashed")}
          title="Dashed stroke"
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-md border-none cursor-pointer transition-colors",
            firstStrokeStyle === "dashed"
              ? "bg-accent text-white"
              : "bg-transparent text-foreground-muted hover:bg-surface-subtle",
          )}
        >
          <FontAwesomeIcon icon={faGripLines} className="w-3 h-3" />
        </button>
      )}

      {/* Layering — every selectable element type has a z-index, so unlike
          font weight/stroke style above these two are never gated on the
          selection's composition. */}
      <button
        onClick={onBringToFront}
        title="Bring to front"
        className="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent text-foreground-muted hover:bg-surface-subtle cursor-pointer"
      >
        <FontAwesomeIcon icon={faAnglesUp} className="w-3 h-3" />
      </button>
      <button
        onClick={onSendToBack}
        title="Send to back"
        className="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent text-foreground-muted hover:bg-surface-subtle cursor-pointer"
      >
        <FontAwesomeIcon icon={faAnglesDown} className="w-3 h-3" />
      </button>
    </div>
  );
}
