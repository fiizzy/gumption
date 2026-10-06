import { Inter, JetBrains_Mono, Lora, Nothing_You_Could_Do, Patrick_Hand } from "next/font/google";
import type { FontFamily } from "../types";

// Fonts for freeform canvas text (text elements and shape labels) only —
// chat cards, the terminal and the rest of the UI don't use these.
const sketchyHandwriting = Nothing_You_Could_Do({ subsets: ["latin"], weight: "400" });
const clearHandwriting = Patrick_Hand({ subsets: ["latin"], weight: "400" });
const sans = Inter({ subsets: ["latin"] });
const serif = Lora({ subsets: ["latin"] });
const mono = JetBrains_Mono({ subsets: ["latin"] });

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
