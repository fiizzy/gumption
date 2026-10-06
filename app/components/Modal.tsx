"use client";

import { useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "../lib/cn";

const SIZE_CLASS = {
  small: "max-w-md",
  large: "max-w-2xl",
} as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: keyof typeof SIZE_CLASS;
}

export default function Modal({ isOpen, onClose, title, children, size = "small" }: Props) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-8"
      style={{
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "bg-surface-overlay border border-border rounded-xl w-full max-h-[85vh] flex flex-col font-sans animate-node-in",
          SIZE_CLASS[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground tracking-tight">
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground
                       bg-transparent border-none cursor-pointer transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="cc-scroll overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
