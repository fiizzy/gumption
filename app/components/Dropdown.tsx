"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { cn } from "../lib/cn";

export interface DropdownOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  // Lets an option preview itself, e.g. a font rendered in that font.
  labelClassName?: string;
}

interface Props<Value extends string> {
  label: string;
  value: Value;
  options: DropdownOption<Value>[];
  onChange: (value: Value) => void;
  // Opens upwards — for controls docked at the bottom of the screen.
  opensUpward?: boolean;
  buttonClassName?: string;
  menuClassName?: string;
  style?: CSSProperties;
}

export default function Dropdown<Value extends string>({
  label,
  value,
  options,
  onChange,
  opensUpward = false,
  buttonClassName,
  menuClassName,
  style,
}: Props<Value>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

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
    <div ref={containerRef} className="relative" style={style}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "inline-flex items-center gap-1.5 cursor-pointer border transition-colors",
          buttonClassName,
        )}
      >
        <span className={selected.labelClassName}>{selected.label}</span>
        <FontAwesomeIcon icon={faChevronDown} className={cn("w-2 h-2 opacity-60 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute right-0 z-50 min-w-full py-1 rounded-lg border animate-node-in",
            opensUpward ? "bottom-full mb-1.5" : "top-full mt-1.5",
            menuClassName ?? "bg-surface-overlay border-border",
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer text-inherit hover:bg-black/10"
              >
                <FontAwesomeIcon icon={faCheck} className={cn("w-2.5 h-2.5 mt-1 shrink-0", !isSelected && "invisible")} />
                <span className="flex flex-col min-w-0">
                  <span className={cn("text-[12.5px] whitespace-nowrap", option.labelClassName)}>{option.label}</span>
                  {option.description && <span className="text-[11px] opacity-60 whitespace-nowrap">{option.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
