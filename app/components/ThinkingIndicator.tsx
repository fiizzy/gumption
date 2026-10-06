"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

// Claude Code's spinner glyphs, played forwards then backwards. An animation
// mirroring Claude Code's own, rather than a functional icon.
const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const SPINNER_FRAME_MS = 120;
const THINKING_VERBS = ["Thinking", "Pondering", "Mulling", "Noodling", "Cogitating", "Percolating", "Musing"];
const VERB_ROTATION_MS = 3000;
const SECOND_MS = 1000;

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  Read: "Reading files",
  Glob: "Searching files",
  Grep: "Searching code",
  LS: "Listing files",
  Edit: "Editing",
  MultiEdit: "Editing",
  Write: "Writing",
  NotebookEdit: "Editing notebook",
  WebSearch: "Searching the web",
  WebFetch: "Fetching a page",
  TodoWrite: "Planning",
};

interface Props {
  // Tool Claude is currently using, if any — shown instead of a thinking verb.
  activity: string | null;
  isTerminal: boolean;
}

export default function ThinkingIndicator({ activity, isTerminal }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), SPINNER_FRAME_MS);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - startedAt;
  const frame = SPINNER_FRAMES[Math.floor(elapsed / SPINNER_FRAME_MS) % SPINNER_FRAMES.length];
  const verb = activity
    ? (TOOL_ACTIVITY_LABELS[activity] ?? `Using ${activity}`)
    : THINKING_VERBS[Math.floor(elapsed / VERB_ROTATION_MS) % THINKING_VERBS.length];

  return (
    <div
      role="status"
      aria-label={`${verb}…`}
      className={cn("flex items-center gap-2 text-[13px] font-mono", isTerminal ? "text-terminal-text" : "text-accent")}
    >
      <span aria-hidden className="inline-block w-3 text-center">
        {frame}
      </span>
      <span>{verb}…</span>
      <span className={isTerminal ? "text-terminal-dim" : "text-foreground-muted"}>
        ({Math.floor(elapsed / SECOND_MS)}s)
      </span>
    </div>
  );
}
