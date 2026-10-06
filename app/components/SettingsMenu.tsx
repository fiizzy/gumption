"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";
import { GRID_COLUMN_OPTIONS, type GridColumns, type Settings } from "../lib/useSettings";
import { cn } from "../lib/cn";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export default function SettingsMenu({ settings, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((open) => !open)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex items-center px-2.5 py-1 rounded-md text-sm border border-transparent cursor-pointer transition-colors",
          isOpen
            ? "bg-surface-subtle text-foreground border-border"
            : "text-foreground-muted hover:bg-surface-subtle hover:text-foreground hover:border-border",
        )}
      >
        <FontAwesomeIcon icon={faSliders} className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-full mt-2 w-[280px] p-4 flex flex-col gap-4 rounded-xl bg-surface-overlay border border-border shadow-card animate-node-in"
        >
          <Setting label="Chat style">
            <Segmented
              options={[
                { value: "standard", label: "Standard" },
                { value: "terminal", label: "Terminal" },
              ]}
              value={settings.chatStyle}
              onChange={(chatStyle) => onChange({ chatStyle })}
            />
          </Setting>

          <Setting label="Stack threads" description="Collapse each thread into a deck showing its latest card.">
            <button
              role="switch"
              aria-checked={settings.stackThreads}
              aria-label="Stack threads"
              onClick={() => onChange({ stackThreads: !settings.stackThreads })}
              className={cn(
                "relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors shrink-0",
                settings.stackThreads ? "bg-accent" : "bg-surface-subtle",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-[left]",
                  settings.stackThreads ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
          </Setting>

          <Setting label="Arrange chats" description="Keep chat cards in a grid with this many columns.">
            <Segmented<GridColumns>
              options={[
                { value: null, label: "Off" },
                ...GRID_COLUMN_OPTIONS.map((columns) => ({ value: columns, label: `${columns}×${columns}` })),
              ]}
              value={settings.gridColumns}
              onChange={(gridColumns) => onChange({ gridColumns })}
            />
          </Setting>
        </div>
      )}
    </div>
  );
}

function Setting({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {description && <span className="text-[11.5px] text-foreground-muted leading-snug">{description}</span>}
      <div className="flex">{children}</div>
    </div>
  );
}

function Segmented<Value extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-surface-subtle border border-border self-start">
      {options.map((option) => (
        <button
          key={String(option.value)}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-semibold border-none cursor-pointer transition-colors",
            option.value === value ? "bg-accent text-white" : "bg-transparent text-foreground-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
