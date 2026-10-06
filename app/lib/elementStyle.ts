import type { ElementStyle, FontFamily, StrokeStyle } from "../types";
import { THEME_STROKE_COLOR, TRANSPARENT_COLOR } from "./color";

export const DEFAULT_ELEMENT_STYLE: ElementStyle = {
  strokeColor: THEME_STROKE_COLOR,
  backgroundColor: TRANSPARENT_COLOR,
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  sloppiness: "sketchy",
  opacity: 100,
  fontSize: 20,
  fontFamily: "hand",
  fontWeight: "normal",
};

export const STROKE_WIDTH_OPTIONS = [
  { label: "Thin", value: 1 },
  { label: "Bold", value: 2 },
  { label: "Extra bold", value: 4 },
];

export const FONT_SIZE_OPTIONS = [
  { label: "S", title: "Small", value: 16 },
  { label: "M", title: "Medium", value: 20 },
  { label: "L", title: "Large", value: 28 },
  { label: "XL", title: "Extra large", value: 36 },
];

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
export const LINE_HEIGHT = 1.25;

// Mirrors Excalidraw's patterns — gaps grow with stroke width so thick
// dashed/dotted lines don't visually merge back into a solid line.
export function getStrokeDashArray(strokeStyle: StrokeStyle, strokeWidth: number): string | undefined {
  if (strokeStyle === "dashed") return `8 ${8 + strokeWidth}`;
  if (strokeStyle === "dotted") return `1.5 ${6 + strokeWidth}`;
  return undefined;
}

export const FONT_FAMILY_CLASS: Record<Exclude<FontFamily, "hand">, string> = {
  sans: "font-sans",
  mono: "font-mono",
};

export function pickStyle<Key extends keyof ElementStyle>(
  style: ElementStyle,
  keys: readonly Key[],
): Pick<ElementStyle, Key> {
  const picked = {} as Pick<ElementStyle, Key>;
  for (const key of keys) picked[key] = style[key];
  return picked;
}

export const SHAPE_STYLE_KEYS = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "sloppiness",
  "opacity",
  "fontSize",
  "fontFamily",
] as const;

export const LINE_STYLE_KEYS = [
  "strokeColor",
  "strokeWidth",
  "strokeStyle",
  "sloppiness",
  "opacity",
] as const;

export const TEXT_STYLE_KEYS = [
  "strokeColor",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "opacity",
] as const;

export const IMAGE_STYLE_KEYS = ["opacity"] as const;

export function createSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
