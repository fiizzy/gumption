"use client";

import type { CSSProperties } from "react";

interface Props {
  projectTitle: string;
  style?: CSSProperties;
}

// Shown on an empty canvas: the project's name and how to start. The
// prompts to try live in the chat panel, where typing happens.
export default function CanvasEmptyState({ projectTitle, style }: Props) {
  return (
    <div
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center pointer-events-none z-[1] max-w-[460px] font-sans"
      style={style}
    >
      <div className="text-lg font-semibold text-foreground-muted tracking-tight">{projectTitle}</div>
      <p className="mt-2 text-[13px] text-foreground-muted leading-6">Ask in the chat on the left, and the answer gets sketched here.</p>
      <p className="mt-4 text-[11.5px] text-foreground-muted">
        Or draw by hand: <strong className="text-foreground font-semibold">R</strong>,{" "}
        <strong className="text-foreground font-semibold">A</strong>,{" "}
        <strong className="text-foreground font-semibold">T</strong> ·{" "}
        <strong className="text-foreground font-semibold">?</strong> for shortcuts
      </p>
    </div>
  );
}
