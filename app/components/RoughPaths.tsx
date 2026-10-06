"use client";

import type { StrokeStyle } from "../types";
import type { RoughPath } from "../lib/roughShapes";
import { getStrokeDashArray } from "../lib/elementStyle";
import { isHexColor } from "../lib/color";

const HEX_WITHOUT_ALPHA_LENGTH = 7;
const FILL_SKETCH_WEIGHT_RATIO = 0.5;

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
  // The background palette is translucent so solid fills stay subtle; hachure
  // lines are thin, so they use the same hue at full strength to stay visible.
  const sketchColor =
    backgroundColor && isHexColor(backgroundColor)
      ? backgroundColor.slice(0, HEX_WITHOUT_ALPHA_LENGTH)
      : backgroundColor;

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
              strokeWidth={strokeWidth * FILL_SKETCH_WEIGHT_RATIO}
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
