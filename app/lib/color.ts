// Sentinel value — "no tint", the card just uses the app's normal
// theme-aware surface/foreground color instead of a flat background.
export const DEFAULT_COLOR = "#f8fafc";

// Chat-card tints.
export const SWATCHES = [
  { label: "Default", value: DEFAULT_COLOR },
  { label: "Blue", value: "#93c5fd" },
  { label: "Green", value: "#86efac" },
  { label: "Amber", value: "#fcd34d" },
  { label: "Red", value: "#fca5a5" },
  { label: "Violet", value: "#c4b5fd" },
  { label: "Pink", value: "#f9a8d4" },
  { label: "Orange", value: "#fdba74" },
];

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

// Perceived-brightness check (YIQ) — decides whether a solid tint needs
// dark or light text/borders on top of it to stay legible.
export function isLightColor(hex: string): boolean {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const yiq = (red * 299 + green * 587 + blue * 114) / 1000;
  return yiq >= 140;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}
