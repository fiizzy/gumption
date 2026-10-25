"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import type { HydratedPictogramElementNode } from "../types";
import { LINE_HEIGHT } from "../lib/elementStyle";
import { getFontFamilyClass } from "../lib/fonts";
import { getPictogramPaths } from "../lib/roughShapes";
import { PICTOGRAM_LABEL_GAP as LABEL_GAP } from "../lib/pictograms";
import { cn } from "../lib/cn";
import AnchorHandles from "./AnchorHandles";
import RoughPaths from "./RoughPaths";

const SELECTION_OUTLINE_OFFSET = 4;

// Watching the picture appear stroke by stroke is the point of a
// pictogram: each path is revealed in turn, like a pen drawing it.
const STROKE_DRAW_MS = 320;
const STROKE_STAGGER_MS = 110;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function PictogramElement({ data, selected }: NodeProps<HydratedPictogramElementNode>) {
  const { icon, width, height, seed, label, strokeColor, strokeWidth, sloppiness, opacity, fontSize, fontFamily, isBindingTarget } = data;
  const labelHeight = label ? fontSize * LINE_HEIGHT + LABEL_GAP : 0;
  const pictureSize = Math.max(0, Math.min(width, height - labelHeight));
  const roughPaths = useMemo(
    () => getPictogramPaths({ icon, size: pictureSize, seed, strokeWidth, sloppiness }),
    [icon, pictureSize, seed, strokeWidth, sloppiness],
  );
  const pictureRef = useRef<SVGGElement>(null);

  // Runs when the element first appears and whenever its picture changes;
  // a restyle or resize swaps the paths in place without replaying it.
  useEffect(() => {
    const group = pictureRef.current;
    if (!group || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const strokes = Array.from(group.querySelectorAll<SVGPathElement>("path"));
    const animations = strokes.map((stroke, index) => {
      const length = stroke.getTotalLength();
      stroke.style.strokeDasharray = `${length}`;
      stroke.style.strokeDashoffset = `${length}`;
      const animation = stroke.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
        duration: STROKE_DRAW_MS,
        delay: index * STROKE_STAGGER_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      animation.onfinish = () => {
        stroke.style.strokeDasharray = "";
        stroke.style.strokeDashoffset = "";
      };
      return animation;
    });
    return () => animations.forEach((animation) => animation.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icon]);

  return (
    <div
      className={cn("relative group text-foreground cursor-move", isBindingTarget && "outline-2 outline-solid outline-accent/60 rounded-sm")}
      style={{ width, height, opacity: opacity / 100 }}
    >
      <svg className="absolute overflow-visible pointer-events-none" width={pictureSize} height={pictureSize} style={{ left: (width - pictureSize) / 2, top: 0 }}>
        <g ref={pictureRef}>
          <RoughPaths paths={roughPaths} strokeColor={strokeColor} strokeWidth={strokeWidth} strokeStyle="solid" />
        </g>
      </svg>
      {label && (
        <div
          className={cn("absolute left-0 right-0 text-center px-1", getFontFamilyClass(fontFamily))}
          style={{ top: pictureSize + LABEL_GAP, color: strokeColor, fontSize, lineHeight: LINE_HEIGHT }}
        >
          {label}
        </div>
      )}

      {selected && (
        <div className="absolute pointer-events-none border border-accent rounded-sm" style={{ inset: -SELECTION_OUTLINE_OFFSET }} />
      )}
      <AnchorHandles visible={selected} />
    </div>
  );
}

export default memo(PictogramElement);
