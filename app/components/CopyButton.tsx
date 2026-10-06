"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { copyText } from "../lib/clipboard";
import { cn } from "../lib/cn";

const COPIED_FEEDBACK_MS = 1500;

interface Props {
  text: string;
  label?: string;
  className?: string;
}

// Copies plain text; pasting it onto the canvas (Ctrl+V) drops it in as a
// text element.
export default function CopyButton({ text, label = "Copy", className }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const statusLabel = status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        copyText(text).then(
          () => setStatus("copied"),
          () => setStatus("failed"),
        );
      }}
      title={status === "idle" ? `${label} — then Ctrl+V on the canvas to paste it as text` : statusLabel}
      aria-label={statusLabel}
      className={cn(
        "nodrag inline-flex items-center gap-1 bg-transparent border-none cursor-pointer transition-opacity",
        className,
      )}
    >
      <FontAwesomeIcon icon={status === "copied" ? faCheck : faCopy} className="w-3 h-3" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{statusLabel}</span>
    </button>
  );
}
