"use client";

import { SWATCHES } from "../lib/color";
import { cn } from "../lib/cn";

interface Props {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

export default function ColorSwatches({ color, onChange, className }: Props) {
  return (
    <div className={cn("flex gap-1.5 flex-wrap", className)}>
      {SWATCHES.map(({ label, value }) => (
        <button
          key={value}
          title={label}
          onClick={() => onChange(value)}
          className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 transition-transform hover:scale-125"
          style={{
            background: value,
            outline: color === value ? "2px solid var(--color-accent)" : "1.5px solid rgba(0,0,0,0.15)",
            outlineOffset: color === value ? "2px" : "0",
          }}
        />
      ))}
    </div>
  );
}
