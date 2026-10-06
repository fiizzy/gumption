"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSlash, faPalette } from "@fortawesome/free-solid-svg-icons";
import { SWATCHES, TRANSPARENT_COLOR, isHexColor } from "../lib/color";
import { cn } from "../lib/cn";

const HEX_WITHOUT_ALPHA_LENGTH = 7;
// The native picker only accepts #rrggbb; non-hex values (currentColor,
// transparent) open it on a neutral starting point.
const PICKER_FALLBACK_COLOR = "#808080";

interface Swatch {
  label: string;
  value: string;
}

interface Props {
  color: string;
  onChange: (color: string) => void;
  swatches?: Swatch[];
  allowCustom?: boolean;
  className?: string;
}

export default function ColorSwatches({ color, onChange, swatches = SWATCHES, allowCustom = false, className }: Props) {
  const isCustomColor = !swatches.some((swatch) => swatch.value === color);
  return (
    <div className={cn("flex gap-1.5 flex-wrap items-center text-foreground", className)}>
      {swatches.map(({ label, value }) => (
        <button
          key={value}
          title={label}
          aria-label={label}
          aria-pressed={color === value}
          onClick={() => onChange(value)}
          className="relative w-5 h-5 rounded-full cursor-pointer border-0 p-0 transition-transform hover:scale-125 flex items-center justify-center bg-surface"
          style={{
            outline: color === value ? "2px solid var(--color-accent)" : "1.5px solid var(--color-border)",
            outlineOffset: color === value ? "2px" : "0",
          }}
        >
          <span className="absolute inset-0 rounded-full" style={{ background: value }} />
          {value === TRANSPARENT_COLOR && (
            <FontAwesomeIcon icon={faSlash} className="relative w-2.5 h-2.5 text-foreground-muted" />
          )}
        </button>
      ))}
      {allowCustom && (
        <label
          title="Custom color"
          className="relative w-5 h-5 rounded-full cursor-pointer flex items-center justify-center text-foreground-muted hover:text-foreground transition-transform hover:scale-125"
          style={{
            background: isCustomColor ? color : undefined,
            outline: isCustomColor ? "2px solid var(--color-accent)" : "1.5px solid var(--color-border)",
            outlineOffset: isCustomColor ? "2px" : "0",
          }}
        >
          {!isCustomColor && <FontAwesomeIcon icon={faPalette} className="w-2.5 h-2.5" />}
          <input
            type="color"
            aria-label="Custom color"
            className="absolute inset-0 opacity-0 cursor-pointer"
            value={isHexColor(color) ? color.slice(0, HEX_WITHOUT_ALPHA_LENGTH) : PICKER_FALLBACK_COLOR}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
