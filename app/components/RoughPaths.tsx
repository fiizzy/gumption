"use client";

import type { StrokeStyle } from "../types";
import type { RoughPath } from "../lib/roughShapes";
import { getStrokeDashArray } from "../lib/elementStyle";
import { scaleHexAlpha } from "../lib/color";

const FILL_SKETCH_WEIGHT_RATIO = 0.3;
const FILL_SKETCH_MIN_WEIGHT = 0.5;
// Hatch lines are drawn in the fill's own translucent tint, a little
// stronger than the fill so they still read as lines without turning into
// stripes.
const FILL_SKETCH_ALPHA_FACTOR = 1.6;

interface Props {
  paths: RoughPath[];
  strokeColor: string;
  backgroundColor?: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
}

// Colors go through `style` rather than presentation attributes so CSS
// values like `currentColor` resolve consistently, including in exports.
export default function RoughPaths({ paths, strokeColor, backgroundColor, strokeWidth, strokeStyle }: Props) {
  const strokeDashArray = getStrokeDashArray(strokeStyle, strokeWidth);
  const sketchColor = backgroundColor ? scaleHexAlpha(backgroundColor, FILL_SKETCH_ALPHA_FACTOR) : undefined;

  return (
    <>
      {paths.map((path, index) => {
        if (path.kind === "fill") {
          return <path key={index} d={path.d} style={{ fill: backgroundColor, stroke: "none" }} />;
        }
        if (path.kind === "fillSketch") {
          return (
            <path
              key={index}
              d={path.d}
              fill="none"
              strokeWidth={Math.max(FILL_SKETCH_MIN_WEIGHT, strokeWidth * FILL_SKETCH_WEIGHT_RATIO)}
              strokeLinecap="round"
              style={{ stroke: sketchColor }}
            />
          );
        }
        return (
          <path
            key={index}
            d={path.d}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={path.isSolid ? undefined : strokeDashArray}
            style={{ stroke: strokeColor }}
          />
        );
      })}
    </>
  );
}
