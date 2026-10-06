"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Modal from "./Modal";
import type { ExportFormat } from "../lib/exportImage";
import { cn } from "../lib/cn";

const SCALE_OPTIONS = [1, 2, 3];
const DEFAULT_SCALE = 2;

export interface ExportSettings {
  format: ExportFormat;
  isSelectionOnly: boolean;
  hasBackground: boolean;
  scale: number;
}

interface Props {
  isOpen: boolean;
  hasSelection: boolean;
  isExporting: boolean;
  onClose: () => void;
  onExport: (settings: ExportSettings) => void;
}

export default function ExportDialog({ isOpen, hasSelection, isExporting, onClose, onExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [isSelectionOnly, setIsSelectionOnly] = useState(false);
  const [hasBackground, setHasBackground] = useState(true);
  const [scale, setScale] = useState(DEFAULT_SCALE);

  useEffect(() => {
    if (isOpen) setIsSelectionOnly(hasSelection);
  }, [isOpen, hasSelection]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export image">
      <div className="flex flex-col gap-4">
        <Field label="Format">
          <Segmented
            options={[
              { value: "png", label: "PNG" },
              { value: "svg", label: "SVG" },
            ]}
            value={format}
            onChange={setFormat}
          />
        </Field>

        {format === "png" && (
          <Field label="Scale">
            <Segmented
              options={SCALE_OPTIONS.map((option) => ({ value: option, label: `${option}×` }))}
              value={scale}
              onChange={setScale}
            />
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={hasBackground}
            onChange={(event) => setHasBackground(event.target.checked)}
            className="accent-accent"
          />
          Include background
        </label>

        <label
          className={cn(
            "flex items-center gap-2 text-sm",
            hasSelection ? "text-foreground cursor-pointer" : "text-foreground-subtle",
          )}
        >
          <input
            type="checkbox"
            disabled={!hasSelection}
            checked={isSelectionOnly && hasSelection}
            onChange={(event) => setIsSelectionOnly(event.target.checked)}
            className="accent-accent"
          />
          Only selected elements
        </label>

        <button
          disabled={isExporting}
          onClick={() => onExport({ format, isSelectionOnly: isSelectionOnly && hasSelection, hasBackground, scale })}
          className={cn(
            "mt-1 px-3 py-2 rounded-md text-sm font-semibold border-none transition-colors",
            isExporting ? "bg-surface-subtle text-foreground-muted cursor-wait" : "bg-accent text-white hover:bg-accent-hover cursor-pointer",
          )}
        >
          {isExporting ? "Exporting…" : `Export ${format.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">{label}</span>
      {children}
    </div>
  );
}

function Segmented<Value extends string | number>({
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
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-semibold border-none cursor-pointer transition-colors",
            option.value === value ? "bg-accent text-white" : "bg-transparent text-foreground-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
