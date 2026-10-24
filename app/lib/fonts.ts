import localFont from "next/font/local";
import type { FontFamily } from "../types";

// Fonts for canvas text (text elements and shape labels) only; the app's
// own chrome uses the system UI font. The files are vendored in app/fonts
// (see the README there) so the faces load with no network at build or
// run time: next/font/google silently swaps in a system font whenever its
// download fails, which left the dev build without any handwriting.
const clearHandwriting = localFont({ src: "../fonts/patrick-hand-latin.woff2", weight: "400", display: "swap" });
const sketchyHandwriting = localFont({ src: "../fonts/nothing-you-could-do-latin.woff2", weight: "400", display: "swap" });
const sans = localFont({ src: "../fonts/inter-variable-latin.woff2", weight: "100 900", display: "swap" });
const serif = localFont({ src: "../fonts/lora-variable-latin.woff2", weight: "400 700", display: "swap" });
const mono = localFont({ src: "../fonts/jetbrains-mono-variable-latin.woff2", weight: "100 800", display: "swap" });

const FONT_FAMILY_CLASS: Record<FontFamily, string> = {
  casual: clearHandwriting.className,
  hand: sketchyHandwriting.className,
  sans: sans.className,
  serif: serif.className,
  mono: mono.className,
};

export const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "casual", label: "Handwritten" },
  { value: "hand", label: "Sketchy" },
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Code" },
];

export function getFontFamilyClass(fontFamily: FontFamily): string {
  return FONT_FAMILY_CLASS[fontFamily];
}
