"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { PICTOGRAM_NAMES, PICTOGRAM_SECTIONS, getPictogramKeywords, type PictogramName } from "../lib/pictograms";
import { getPictogramPaths } from "../lib/roughShapes";
import { cn } from "../lib/cn";
import RoughPaths from "./RoughPaths";

const PREVIEW_SIZE = 36;
const PREVIEW_STROKE_WIDTH = 1.5;
const PREVIEW_SEED = 11;

interface Props {
  // The icon shared by the selection, or null when they differ.
  currentIcon: PictogramName | null;
  onPick: (icon: PictogramName) => void;
  style?: CSSProperties;
}

// The pictogram library, opened beside the canvas when a pictogram is
// selected: pick another picture for it, section by section, with a search
// over names and the words people use for them.
export default function PictogramPanel({ currentIcon, onPick, style }: Props) {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (name: PictogramName) => !needle || name.includes(needle) || getPictogramKeywords(name).some((keyword) => keyword.includes(needle));
    return PICTOGRAM_SECTIONS.map((section) => ({ ...section, names: section.names.filter(matches) })).filter((section) => section.names.length > 0);
  }, [query]);

  return (
    <div
      role="region"
      aria-label="Pictogram library"
      className="fixed z-[950] w-[244px] max-h-[calc(100vh-140px)] flex flex-col rounded-xl bg-surface-raised border border-border select-none font-sans animate-node-in"
      style={style}
    >
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3 h-3 shrink-0 text-foreground-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          aria-label="Search pictograms"
          placeholder={`Search ${PICTOGRAM_NAMES.length} pictograms…`}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12.5px] text-foreground placeholder:text-foreground-muted"
        />
      </div>
      <div className="cc-scroll overflow-y-auto p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-foreground-muted">Nothing called “{query.trim()}”.</p>
        ) : (
          sections.map((section) => (
            <section key={section.title} aria-label={section.title} className="mb-2 last:mb-0">
              <h3 className="px-2 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-foreground-muted">{section.title}</h3>
              <div className="grid grid-cols-3 gap-1">
                {section.names.map((name) => (
                  <PictogramChoice key={name} name={name} isCurrent={name === currentIcon} onPick={() => onPick(name)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function PictogramChoice({ name, isCurrent, onPick }: { name: PictogramName; isCurrent: boolean; onPick: () => void }) {
  const paths = useMemo(
    () => getPictogramPaths({ icon: name, size: PREVIEW_SIZE, seed: PREVIEW_SEED, strokeWidth: PREVIEW_STROKE_WIDTH, sloppiness: "sketchy" }),
    [name],
  );
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isCurrent}
      title={name}
      className={cn(
        "flex flex-col items-center gap-1 pt-2 pb-1.5 rounded-lg border cursor-pointer text-foreground transition-colors",
        isCurrent ? "bg-surface-subtle border-accent" : "bg-transparent border-transparent hover:bg-surface-subtle",
      )}
    >
      <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="overflow-visible" aria-hidden>
        <RoughPaths paths={paths} strokeColor="currentColor" strokeWidth={PREVIEW_STROKE_WIDTH} strokeStyle="solid" />
      </svg>
      <span className="text-[11px] text-foreground-muted">{name.replace(/-/g, " ")}</span>
    </button>
  );
}
