"use client";

import { useRef, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripVertical,
  faCrosshairs,
  faUpRightAndDownLeftFromCenter,
  faChevronDown,
  faChevronUp,
  faCodeBranch,
} from "@fortawesome/free-solid-svg-icons";
import { HydratedConversationNode } from "../types";
import { cn } from "../lib/cn";

// Sentinel value — "no tint", the card just uses the app's normal
// theme-aware surface color instead of a flat background.
export const DEFAULT_COLOR = "#f8fafc";

export const SWATCHES = [
  { label: "Default", value: DEFAULT_COLOR },
  { label: "Blue", value: "#93c5fd" },
  { label: "Green", value: "#86efac" },
  { label: "Amber", value: "#fcd34d" },
  { label: "Red", value: "#fca5a5" },
  { label: "Violet", value: "#c4b5fd" },
  { label: "Pink", value: "#f9a8d4" },
  { label: "Orange", value: "#fdba74" },
];

// Perceived-brightness check (YIQ) — decides whether a solid tint needs
// dark or light text/borders on top of it to stay legible.
function isLightColor(hex: string): boolean {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const yiq = (red * 299 + green * 587 + blue * 114) / 1000;
  return yiq >= 140;
}

// Handles are invisible connection points that only exist so the custom
// "branch" edge knows which side of the card to attach to — end
// users never drag new connections from them (isConnectable={false}).
const HANDLE_STYLE = { opacity: 0, width: 1, height: 1, pointerEvents: "none" as const };

export default function ConversationNode({
  data,
  selected,
}: NodeProps<HydratedConversationNode>) {
  const {
    prompt,
    response,
    loading,
    minimized,
    color,
    branchParentPromptPreview,
    isBranchActive,
    onToggleBranch,
    onFocusNode,
    onExpandNode,
    onColorChange,
    onToggleMinimize,
  } = data;

  const [showColors, setShowColors] = useState(false);

  // Natural (expanded, max-h-72-clamped) height of the body — drives the
  // collapsed 30% peek height below, so it tracks streaming AI text too.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useEffect(() => {
    const bodyElement = bodyRef.current;
    if (!bodyElement) return;
    const observer = new ResizeObserver((entries) =>
      setBodyHeight(entries[0].contentRect.height),
    );
    observer.observe(bodyElement);
    return () => observer.disconnect();
  }, []);

  // When the node has a user-selected tint, pick dark-on-light or
  // light-on-dark overlay colors based on that tint's own brightness —
  // the swatches now include solid, more saturated colors, so a single
  // "always use dark text" rule no longer holds for all of them.
  const hasTint = color !== DEFAULT_COLOR;
  const tintIsLight = hasTint && isLightColor(color);
  const textCls = !hasTint
    ? "text-foreground"
    : tintIsLight
      ? "text-[#09090b]"
      : "text-white";
  const mutedCls = !hasTint
    ? "text-foreground-muted"
    : tintIsLight
      ? "text-[#52525b]"
      : "text-white/75";
  const chipTextCls = !hasTint
    ? "text-foreground-muted"
    : tintIsLight
      ? "text-[#52525b]"
      : "text-white/85";
  const sepBg = !hasTint
    ? "var(--color-border-subtle)"
    : tintIsLight
      ? "rgba(0,0,0,0.06)"
      : "rgba(255,255,255,0.2)";
  const chipBg = !hasTint
    ? "var(--color-surface-subtle)"
    : tintIsLight
      ? "rgba(0,0,0,0.06)"
      : "rgba(255,255,255,0.16)";
  const chipBorder = !hasTint
    ? "var(--color-border)"
    : tintIsLight
      ? "rgba(0,0,0,0.1)"
      : "rgba(255,255,255,0.26)";

  // Title mirrors the AI's reply (first line, truncated) once one exists,
  // falling back to the prompt while the response is still loading.
  const responseFirstLine = response.split("\n")[0].trim();
  const titleSource = responseFirstLine || prompt;
  const titleSnippet =
    titleSource.length > 48 ? titleSource.slice(0, 48) + "…" : titleSource;

  return (
    <div
      style={{
        width: 380,
        background: hasTint ? color : "var(--color-surface-overlay)",
      }}
      className={cn(
        "animate-node-in font-sans cursor-pointer",
        "transition-[box-shadow,border-color] duration-200 rounded-xl border",
        isBranchActive || selected
          ? "border-accent shadow-card-active"
          : "border-border shadow-card",
      )}
    >
      <Handle type="target" position={Position.Top} id="branchTarget" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="branchSource" isConnectable={false} style={HANDLE_STYLE} />

      {/* ── Header / drag handle — click anywhere on it to collapse/expand ── */}
      <div
        onClick={onToggleMinimize}
        className={cn(
          "drag-handle flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing",
          !minimized && "border-b border-border-subtle",
        )}
      >
        {/* Grip handle */}
        <FontAwesomeIcon
          icon={faGripVertical}
          className={cn("shrink-0 opacity-40 w-2.5 h-2.5", mutedCls)}
        />

        <span
          className={cn(
            "flex-1 text-[14px] font-semibold truncate tracking-tight",
            textCls,
          )}
        >
          {titleSnippet}
        </span>

        {/* Focus — centre this node at 100 % zoom */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFocusNode();
          }}
          className={cn(
            "shrink-0 opacity-40 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0.5",
            mutedCls,
          )}
          title="Centre on screen at 100 % zoom"
        >
          <FontAwesomeIcon icon={faCrosshairs} className="w-3 h-3" />
        </button>

        {/* Expand — open full content in modal */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpandNode();
          }}
          className={cn(
            "shrink-0 opacity-40 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0.5",
            mutedCls,
          )}
          title="Open full content"
        >
          <FontAwesomeIcon
            icon={faUpRightAndDownLeftFromCenter}
            className="w-3 h-3"
          />
        </button>

        {/* Minimize / expand */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMinimize();
          }}
          className={cn(
            "shrink-0 px-0.5 opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer",
            mutedCls,
          )}
          title={minimized ? "Expand" : "Collapse"}
        >
          <FontAwesomeIcon
            icon={minimized ? faChevronDown : faChevronUp}
            className="w-2.5 h-2.5"
          />
        </button>
      </div>

      {/* ── Animated body — collapses to a 30% peek with a fade-out gradient ── */}
      <div
        className="relative overflow-hidden transition-[height] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] nodrag"
        style={{
          height: minimized ? bodyHeight * 0.4 : bodyHeight || "auto",
        }}
      >
        <div
          ref={bodyRef}
          className="cc-scroll overflow-y-auto max-h-72 px-3.5 pt-2.5 pb-3.5 cursor-auto"
        >
          {/* Branch-from chip */}
          {branchParentPromptPreview && (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 mb-2.5 max-w-full truncate",
                chipTextCls,
              )}
              style={{
                background: chipBg,
                border: `1px solid ${chipBorder}`,
              }}
            >
              <FontAwesomeIcon
                icon={faCodeBranch}
                className="text-accent w-2 h-2"
              />
              {branchParentPromptPreview.slice(0, 42)}
              {branchParentPromptPreview.length > 42 ? "…" : ""}
            </div>
          )}

          {/* You */}
          <div className="mb-2.5">
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.08em] mb-1",
                mutedCls,
              )}
            >
              You
            </p>
            <p className={cn("text-[14.5px] leading-relaxed m-0", textCls)}>
              {prompt}
            </p>
          </div>

          {/* Separator */}
          <div className="my-2.5 h-px" style={{ background: sepBg }} />

          {/* AI */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1 text-accent">
              AI
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-[14.5px] text-foreground-muted">
                <span className="flex gap-[3px]">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <span
                      key={i}
                      className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-thinking"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </span>
                <span className="italic">Thinking…</span>
              </div>
            ) : (
              <p
                className={cn(
                  "text-[14.5px] leading-[1.65] m-0 whitespace-pre-wrap",
                  mutedCls,
                )}
              >
                {response}
              </p>
            )}
          </div>
        </div>

        {/* Fade-out gradient over the peeked text when collapsed */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-14 transition-opacity duration-200",
            minimized ? "opacity-100" : "opacity-0",
          )}
          style={{
            background: `linear-gradient(to bottom, transparent, ${hasTint ? color : "var(--color-surface-overlay)"})`,
          }}
        />
      </div>

      {/* ── Actions footer — fixed like the header, never scrolls or collapses ── */}
      <div className="nodrag cursor-auto px-3.5 pt-2.5 pb-4 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 flex-wrap">
          <NBtn active={isBranchActive} onClick={onToggleBranch}>
            <FontAwesomeIcon icon={faCodeBranch} className="w-2.5 h-2.5" />
            {isBranchActive ? "Branching…" : "Branch"}
          </NBtn>

          <NBtn onClick={() => setShowColors((s) => !s)}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                background: color,
                border: "1.5px solid rgba(0,0,0,0.15)",
              }}
            />
            Color
          </NBtn>
        </div>

        {/* Color swatches */}
        {showColors && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {SWATCHES.map(({ label, value }) => (
              <button
                key={value}
                title={label}
                onClick={() => {
                  onColorChange(value);
                  setShowColors(false);
                }}
                className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 transition-transform hover:scale-125"
                style={{
                  background: value,
                  outline:
                    color === value
                      ? "2px solid var(--color-accent)"
                      : "1.5px solid rgba(0,0,0,0.15)",
                  outlineOffset: color === value ? "2px" : "0",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Node action button ─────────────────────────────────────── */
function NBtn({
  children,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors duration-100 font-sans",
        active
          ? "bg-accent border-accent text-white"
          : "bg-black/50 border-white/10 text-white/90 hover:bg-black/60 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
