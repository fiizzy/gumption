import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { FillStyle, LineKind, Point, ShapeKind, Sloppiness, StrokeStyle } from "../types";
import { TRANSPARENT_COLOR } from "./color";
import { PICTOGRAM_BOX_SIZE, getPictogramPathData, isPictogramName } from "./pictograms";

const generator = rough.generator();

// rough.js needs *some* stroke/fill value to decide which path sets to
// generate; actual colors are applied by the renderer (so CSS values like
// currentColor work), never read back from these placeholders.
const PLACEHOLDER_COLOR = "black";
const SKETCHY_ROUGHNESS = 1;
const SKETCHY_BOWING = 1;
const CORNER_RADIUS_RATIO = 0.25;
const MAX_CORNER_RADIUS = 32;
// Hatching stays fine at every stroke width: the gap grows only a little
// with the stroke, and the hatch lines are a fraction of it.
const HACHURE_GAP_BASE = 2.5;
const HACHURE_GAP_PER_STROKE_WIDTH = 0.5;
const FILL_WEIGHT_PER_STROKE_WIDTH = 0.3;
const ARROWHEAD_BASE_LENGTH = 16;
const ARROWHEAD_LENGTH_PER_STROKE_WIDTH = 2;
const ARROWHEAD_MAX_SHARE_OF_LINE = 0.5;
const ARROWHEAD_HALF_ANGLE = Math.PI / 7;

export type RoughPathKind = "stroke" | "fill" | "fillSketch";

export interface RoughPath {
  kind: RoughPathKind;
  d: string;
  // Arrowheads always render solid even on dashed/dotted lines.
  isSolid: boolean;
}

interface StrokeOptions {
  seed: number;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  sloppiness: Sloppiness;
}

function buildOptions({ seed, strokeWidth, strokeStyle, sloppiness }: StrokeOptions, fill?: { fillStyle: FillStyle }): Options {
  const isSketchy = sloppiness === "sketchy";
  return {
    seed,
    roughness: isSketchy ? SKETCHY_ROUGHNESS : 0,
    bowing: isSketchy ? SKETCHY_BOWING : 0,
    // A doubled sketch stroke turns dashes into blobs, so dashed/dotted
    // strokes are always drawn once.
    disableMultiStroke: !isSketchy || strokeStyle !== "solid",
    preserveVertices: !isSketchy,
    strokeWidth,
    stroke: PLACEHOLDER_COLOR,
    fill: fill ? PLACEHOLDER_COLOR : undefined,
    fillStyle: fill?.fillStyle,
    hachureGap: HACHURE_GAP_BASE + strokeWidth * HACHURE_GAP_PER_STROKE_WIDTH,
    fillWeight: strokeWidth * FILL_WEIGHT_PER_STROKE_WIDTH,
  };
}

function toRoughPaths(drawable: ReturnType<typeof generator.line>, isSolid = false): RoughPath[] {
  return drawable.sets.map((set) => ({
    kind: set.type === "path" ? "stroke" : set.type === "fillPath" ? "fill" : "fillSketch",
    d: generator.opsToPath(set),
    isSolid,
  }));
}

function getRectangleCornerRadius(width: number, height: number): number {
  return Math.min(MAX_CORNER_RADIUS, Math.min(width, height) * CORNER_RADIUS_RATIO);
}

// The crisp outline of a shape in its own 0..width/0..height box — doubles
// as the rough.js input for rectangles and as the invisible hit-test path.
export function getShapeOutlinePath(shapeKind: ShapeKind, width: number, height: number): string {
  if (shapeKind === "ellipse") {
    const radiusX = width / 2;
    const radiusY = height / 2;
    return `M 0 ${radiusY} A ${radiusX} ${radiusY} 0 1 0 ${width} ${radiusY} A ${radiusX} ${radiusY} 0 1 0 0 ${radiusY} Z`;
  }
  if (shapeKind === "diamond") {
    return `M ${width / 2} 0 L ${width} ${height / 2} L ${width / 2} ${height} L 0 ${height / 2} Z`;
  }
  const radius = getRectangleCornerRadius(width, height);
  return [
    `M ${radius} 0`,
    `L ${width - radius} 0 Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius} Q ${width} ${height} ${width - radius} ${height}`,
    `L ${radius} ${height} Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius} Q 0 0 ${radius} 0 Z`,
  ].join(" ");
}

interface ShapePathInput extends StrokeOptions {
  shapeKind: ShapeKind;
  width: number;
  height: number;
  backgroundColor: string;
  fillStyle: FillStyle;
}

export function getShapePaths(input: ShapePathInput): RoughPath[] {
  const { shapeKind, width, height, backgroundColor, fillStyle } = input;
  const hasFill = backgroundColor !== TRANSPARENT_COLOR;
  const options = buildOptions(input, hasFill ? { fillStyle } : undefined);

  if (shapeKind === "ellipse") {
    return toRoughPaths(generator.ellipse(width / 2, height / 2, width, height, options));
  }
  if (shapeKind === "diamond") {
    return toRoughPaths(
      generator.polygon(
        [
          [width / 2, 0],
          [width, height / 2],
          [width / 2, height],
          [0, height / 2],
        ],
        options,
      ),
    );
  }
  return toRoughPaths(generator.path(getShapeOutlinePath("rectangle", width, height), options));
}

interface LinePathInput extends StrokeOptions {
  kind: LineKind;
  points: Point[];
  curved?: boolean;
}

// A line through its points, drawn as one stroke (straight runs, or one
// smooth curve through them), with an arrowhead on the last segment when
// it is an arrow.
export function getLinePaths(input: LinePathInput): RoughPath[] {
  const { points, curved = false } = input;
  if (points.length < 2) return [];
  const start = points[points.length - 2];
  const end = points[points.length - 1];
  const options = buildOptions(input);
  const pointPairs = points.map((point): [number, number] => [point.x, point.y]);
  const paths = toRoughPaths(
    points.length === 2
      ? generator.line(points[0].x, points[0].y, end.x, end.y, options)
      : curved
        ? generator.curve(pointPairs, options)
        : generator.linearPath(pointPairs, options),
  );
  if (input.kind !== "arrow") return paths;

  const lineLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (lineLength === 0) return paths;
  const headLength = Math.min(
    ARROWHEAD_BASE_LENGTH + input.strokeWidth * ARROWHEAD_LENGTH_PER_STROKE_WIDTH,
    lineLength * ARROWHEAD_MAX_SHARE_OF_LINE,
  );
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const wing = (side: 1 | -1): [number, number] => [
    end.x - Math.cos(angle + side * ARROWHEAD_HALF_ANGLE) * headLength,
    end.y - Math.sin(angle + side * ARROWHEAD_HALF_ANGLE) * headLength,
  ];
  const headOptions = buildOptions({ ...input, strokeStyle: "solid" });
  return [
    ...paths,
    ...toRoughPaths(generator.linearPath([wing(1), [end.x, end.y], wing(-1)], headOptions), true),
  ];
}

interface PictogramPathInput {
  icon: string;
  size: number;
  seed: number;
  strokeWidth: number;
  sloppiness: Sloppiness;
}

// A library pictogram scaled from its 100-unit box to `size`, one rough
// path set per stroke so the renderer can reveal them one at a time.
export function getPictogramPaths({ icon, size, seed, strokeWidth, sloppiness }: PictogramPathInput): RoughPath[] {
  if (!isPictogramName(icon) || size <= 0) return [];
  const scale = size / PICTOGRAM_BOX_SIZE;
  const options = buildOptions({ seed, strokeWidth, strokeStyle: "solid", sloppiness });
  return getPictogramPathData(icon).flatMap((path, index) =>
    toRoughPaths(generator.path(scalePath(path, scale), { ...options, seed: seed + index }), true),
  );
}

const PATH_NUMBER_PATTERN = /-?\d*\.?\d+/g;
const PATH_ARC_FLAG_COMMAND = "A";

// Scales every coordinate of a path; the two arc flags stay untouched.
function scalePath(path: string, scale: number): string {
  return path
    .split(" ")
    .reduce<{ parts: string[]; command: string; index: number }>(
      (state, token) => {
        if (/^[A-Za-z]$/.test(token)) return { parts: [...state.parts, token], command: token, index: 0 };
        const isArcFlag = state.command === PATH_ARC_FLAG_COMMAND && (state.index === 3 || state.index === 4);
        const scaled = isArcFlag ? token : token.replace(PATH_NUMBER_PATTERN, (number) => String(Number(number) * scale));
        return { parts: [...state.parts, scaled], command: state.command, index: state.index + 1 };
      },
      { parts: [], command: "", index: 0 },
    )
    .parts.join(" ");
}
