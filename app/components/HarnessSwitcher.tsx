"use client";

import { FontAwesomeIcon, type FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { faRobot, faTerminal } from "@fortawesome/free-solid-svg-icons";
import type { Harness } from "../types";
import { cn } from "../lib/cn";

interface Props {
  harness: Harness;
  onChange: (harness: Harness) => void;
  // Icon-only, stacked vertically — for the collapsed sidebar rail.
  compact?: boolean;
}

// Placeholder glyphs, not brand logos — only Claude is actually wired up
// to app/lib/ai.ts today, so Codex here is dummy UI for a future harness.
const HARNESSES: { id: Harness; label: string; icon: FontAwesomeIconProps["icon"] }[] = [
  { id: "claude", label: "Claude", icon: faRobot },
  { id: "codex", label: "Codex", icon: faTerminal },
];

export default function HarnessSwitcher({ harness, onChange, compact = false }: Props) {
  return (
    <div
      className={cn(
        "flex gap-0.5 p-0.5 rounded-lg bg-surface-subtle border border-border shrink-0",
        compact ? "flex-col" : "items-center",
      )}
    >
      {HARNESSES.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={label}
          className={cn(
            "inline-flex items-center rounded-md border-none text-xs font-medium",
            "transition-colors duration-150 cursor-pointer",
            compact ? "w-8 h-8 justify-center" : "gap-1.5 px-2 h-7",
            harness === id
              ? "bg-accent text-white"
              : "bg-transparent text-foreground-muted hover:bg-surface hover:text-foreground",
          )}
        >
          <FontAwesomeIcon icon={icon} className="w-3 h-3 shrink-0" />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
