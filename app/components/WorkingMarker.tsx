"use client";

import { useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { Point } from "../types";
import { getShapePaths } from "../lib/roughShapes";
import { TRANSPARENT_COLOR } from "../lib/color";
import { getFontFamilyClass } from "../lib/fonts";
import { cn } from "../lib/cn";
import ActivitySpinner from "./ActivitySpinner";
import RoughPaths from "./RoughPaths";

export type WorkingMarkerPhase = "working" | "done" | "stopped";

const MARKER_HEIGHT = 44;
const MARKER_WIDTH: Record<WorkingMarkerPhase, number> = { working: 260, done: 104, stopped: 124 };
const MARKER_FONT_SIZE = 18;
const MARKER_STROKE_WIDTH = 1.5;
const MARKER_SEED = 7;
const LABELS: Record<WorkingMarkerPhase, string> = { working: "Working…", done: "Done", stopped: "Stopped" };

interface Props {
  position: Point;
  phase: WorkingMarkerPhase;
  onCancel: () => void;
  onFadeEnd: () => void;
}

// The hand-drawn "work in progress" sign that sits above a diagram while
// it streams in. Drawn in the same sketchy hand as the diagram so it reads
// as part of the whiteboard, and dashed so it reads as temporary. Lives in
// flow space, so it pans and zooms with the canvas.
export default function WorkingMarker({ position, phase, onCancel, onFadeEnd }: Props) {
  const width = MARKER_WIDTH[phase];
  const paths = useMemo(
    () =>
      getShapePaths({
        shapeKind: "rectangle",
        width,
        height: MARKER_HEIGHT,
        seed: MARKER_SEED,
        strokeWidth: MARKER_STROKE_WIDTH,
        strokeStyle: "dashed",
        sloppiness: "sketchy",
        backgroundColor: TRANSPARENT_COLOR,
        fillStyle: "hachure",
      }),
    [width],
  );
  const isFading = phase !== "working";

  return (
    <ViewportPortal>
      <div
        role="status"
        aria-label={LABELS[phase]}
        onAnimationEnd={isFading ? onFadeEnd : undefined}
        className={cn(
          "nopan nodrag absolute flex items-center gap-3 px-4 text-foreground select-none",
          getFontFamilyClass("casual"),
          isFading && "animate-marker-out",
        )}
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, width, height: MARKER_HEIGHT, fontSize: MARKER_FONT_SIZE }}
      >
        <svg className="absolute inset-0 overflow-visible pointer-events-none" width={width} height={MARKER_HEIGHT} aria-hidden>
          <RoughPaths paths={paths} strokeColor="currentColor" strokeWidth={MARKER_STROKE_WIDTH} strokeStyle="dashed" />
        </svg>
        {phase === "working" && <ActivitySpinner className="relative text-[16px]" />}
        <span className="relative flex-1 whitespace-nowrap">{LABELS[phase]}</span>
        {phase === "working" && (
          <button
            type="button"
            onClick={onCancel}
            className="relative h-7 px-1.5 rounded bg-transparent border-none cursor-pointer text-foreground-muted underline decoration-dashed underline-offset-4 hover:text-foreground"
            style={{ fontSize: MARKER_FONT_SIZE, fontFamily: "inherit" }}
          >
            Cancel
          </button>
        )}
      </div>
    </ViewportPortal>
  );
}
