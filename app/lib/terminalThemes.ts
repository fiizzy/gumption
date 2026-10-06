import type { TerminalTheme } from "../types";

export const DEFAULT_TERMINAL_THEME: TerminalTheme = "green";

// The colors themselves live in globals.css (.cc-terminal-theme-*); `preview`
// is only the swatch shown in the theme pickers — each theme's text color.
export const TERMINAL_THEMES: { value: TerminalTheme; label: string; preview: string }[] = [
  { value: "green", label: "Green", preview: "#4ade80" },
  { value: "red", label: "Red", preview: "#f87171" },
  { value: "blue", label: "Blue", preview: "#60a5fa" },
  { value: "mono", label: "Black & white", preview: "#e4e4e4" },
];

export const TERMINAL_THEME_VALUES = TERMINAL_THEMES.map((theme) => theme.value);

export function getTerminalThemeClass(theme: TerminalTheme): string {
  return `cc-terminal-theme-${theme}`;
}
