"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

// Claude Code's spinner glyphs, played forwards then backwards.
const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const SPINNER_FRAME_MS = 120;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface Props {
  className?: string;
}

// Indeterminate: nobody knows how long a drawing takes. Freezes under the
// reduced motion setting; the text beside it still carries the status.
export default function ActivitySpinner({ className }: Props) {
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const interval = setInterval(() => setFrameIndex((index) => (index + 1) % SPINNER_FRAMES.length), SPINNER_FRAME_MS);
    return () => clearInterval(interval);
  }, []);
  return (
    <span aria-hidden className={cn("inline-block w-3 text-center font-mono text-[13px] leading-6 text-accent", className)}>
      {SPINNER_FRAMES[frameIndex]}
    </span>
  );
}
