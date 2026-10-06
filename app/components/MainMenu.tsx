"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBars,
  faFolderOpen,
  faFloppyDisk,
  faFileExport,
  faBroom,
  faKeyboard,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "../lib/cn";

interface MenuItem {
  label: string;
  shortcut?: string;
  icon: IconDefinition;
  onSelect: () => void;
  isDestructive?: boolean;
}

interface Props {
  onOpenFile: () => void;
  onSaveFile: () => void;
  onExportImage: () => void;
  onClearCanvas: () => void;
  onShowShortcuts: () => void;
}

export default function MainMenu({ onOpenFile, onSaveFile, onExportImage, onClearCanvas, onShowShortcuts }: Props) {
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

  const items: MenuItem[] = [
    { label: "Open…", shortcut: "Ctrl+O", icon: faFolderOpen, onSelect: onOpenFile },
    { label: "Save to file…", shortcut: "Ctrl+S", icon: faFloppyDisk, onSelect: onSaveFile },
    { label: "Export image…", shortcut: "Ctrl+Shift+E", icon: faFileExport, onSelect: onExportImage },
    { label: "Keyboard shortcuts", shortcut: "?", icon: faKeyboard, onSelect: onShowShortcuts },
    { label: "Clear canvas", icon: faBroom, onSelect: onClearCanvas, isDestructive: true },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((open) => !open)}
        title="Menu"
        aria-label="Menu"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex items-center px-2.5 py-1 rounded-md text-sm border border-transparent cursor-pointer transition-colors",
          isOpen
            ? "bg-surface-subtle text-foreground border-border"
            : "text-foreground-muted hover:bg-surface-subtle hover:text-foreground hover:border-border",
        )}
      >
        <FontAwesomeIcon icon={faBars} className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[240px] py-1.5 rounded-xl bg-surface-overlay border border-border shadow-card animate-node-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left bg-transparent border-none cursor-pointer transition-colors hover:bg-surface-subtle",
                item.isDestructive ? "text-foreground-muted hover:text-foreground" : "text-foreground",
              )}
            >
              <FontAwesomeIcon icon={item.icon} className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-[11px] text-foreground-muted">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
