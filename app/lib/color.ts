// Drawing-element colors are stored as plain CSS color values. The two
// "theme" entries are real CSS keywords rather than sentinels — elements
// render inside a `text-foreground` wrapper, so `currentColor` follows the
// light/dark theme everywhere (SVG strokes, label text, exported images)
// with no resolver step.
export const THEME_STROKE_COLOR = "currentColor";
export const TRANSPARENT_COLOR = "transparent";

export const STROKE_SWATCHES = [
  { label: "Default", value: THEME_STROKE_COLOR },
  { label: "Red", value: "#e03131" },
  { label: "Green", value: "#2f9e44" },
  { label: "Blue", value: "#1971c2" },
  { label: "Orange", value: "#f08c00" },
  { label: "Violet", value: "#9c36b5" },
];

// Translucent fills read correctly on both the light and dark canvas and
// keep `currentColor` labels legible on top of them.
export const BACKGROUND_SWATCHES = [
  { label: "Transparent", value: TRANSPARENT_COLOR },
  { label: "Red", value: "#fa525259" },
  { label: "Green", value: "#40c05759" },
  { label: "Blue", value: "#339af059" },
  { label: "Yellow", value: "#fcc41959" },
  { label: "Violet", value: "#845ef759" },
];

// Quieter tints for the diagrams the agent draws. Colour there carries
// meaning (one tint per lane or concern across a dozen shapes), so it has
// to sit behind the labels rather than compete with them.
export const DIAGRAM_FILL_SWATCHES = [
  { label: "Red", value: "#e07a7340" },
  { label: "Green", value: "#6cbf8440" },
  { label: "Blue", value: "#6a9fe040" },
  { label: "Yellow", value: "#d9b85c40" },
  { label: "Violet", value: "#a28ce040" },
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const HEX_WITHOUT_ALPHA_LENGTH = 7;
const MAX_ALPHA_BYTE = 255;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

// Scales the alpha of a translucent hex colour; opaque and non-hex values
// come back unchanged.
export function scaleHexAlpha(color: string, factor: number): string {
  if (!isHexColor(color) || color.length === HEX_WITHOUT_ALPHA_LENGTH) return color;
  const alpha = parseInt(color.slice(HEX_WITHOUT_ALPHA_LENGTH), 16) / MAX_ALPHA_BYTE;
  const scaled = Math.round(Math.min(1, alpha * factor) * MAX_ALPHA_BYTE);
  return `${color.slice(0, HEX_WITHOUT_ALPHA_LENGTH)}${scaled.toString(16).padStart(2, "0")}`;
}
