// Sentinel value — "no tint", the card/shape/text just uses the app's
// normal theme-aware surface/foreground color instead of a flat background.
export const DEFAULT_COLOR = "#f8fafc";

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

// Perceived-brightness check (YIQ) — decides whether a solid tint needs
// dark or light text/borders on top of it to stay legible.
export function isLightColor(hex: string): boolean {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const yiq = (red * 299 + green * 587 + blue * 114) / 1000;
  return yiq >= 140;
}
