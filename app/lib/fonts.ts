import { Nothing_You_Could_Do } from "next/font/google";
import type { FontFamily } from "../types";
import { FONT_FAMILY_CLASS } from "./elementStyle";

const handwritingFont = Nothing_You_Could_Do({ subsets: ["latin"], weight: "400" });

export function getFontFamilyClass(fontFamily: FontFamily): string {
  return fontFamily === "hand" ? handwritingFont.className : FONT_FAMILY_CLASS[fontFamily];
}
