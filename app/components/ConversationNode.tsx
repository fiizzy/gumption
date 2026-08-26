"use client";

import { useRef, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripVertical,
  faCrosshairs,
  faUpRightAndDownLeftFromCenter,
  faChevronDown,
  faChevronUp,
  faCodeBranch,
} from "@fortawesome/free-solid-svg-icons";
import { NodeData } from "../types";
import { TOOLBAR_H } from "./Toolbar";
import { cn } from "../lib/cn";

interface Props {
  node: NodeData;
  panX: number;
  panY: number;
  scale: number;
  isActive: boolean;
  isSelected: boolean;
  selectedCount: number;
  parentPrompt?: string;
  onBranch: () => void;
  onSelect: () => void;
  onFocus: () => void;
  onExpand: () => void;
  onMove: (x: number, y: number) => void;
  onGroupDragStart: () => void;
  onGroupMove: (dx: number, dy: number) => void;
  onColorChange: (color: string) => void;
  onToggleMinimize: () => void;
  onDimsChange: (w: number, h: number) => void;
}

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
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140;
}

export default function ConversationNode({
  node,
  panX,
  panY,
  scale,
  isActive,
  isSelected,
  selectedCount,
  parentPrompt,
  onBranch,
  onSelect,
  onFocus,
  onExpand,
  onMove,
  onGroupDragStart,
  onGroupMove,
  onColorChange,
  onToggleMinimize,
  onDimsChange,
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartMouse = useRef({ x: 0, y: 0 });

  // Distinguishes a plain click on the header from a drag, so the header
  // can toggle collapse on click without fighting the drag-to-move handle.
  const dragStartClient = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);

  // Refs to avoid stale closures in global listeners
  const panRef = useRef({ x: panX, y: panY });
  const scaleRef = useRef(scale);
  const onMoveRef = useRef(onMove);
  const onGroupDragStartRef = useRef(onGroupDragStart);
  const onGroupMoveRef = useRef(onGroupMove);
  const nodeRef2 = useRef(node);
  const isSelectedRef = useRef(isSelected);
  const selectedCountRef = useRef(selectedCount);

  useEffect(() => {
    panRef.current = { x: panX, y: panY };
  }, [panX, panY]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    onGroupDragStartRef.current = onGroupDragStart;
  }, [onGroupDragStart]);
  useEffect(() => {
    onGroupMoveRef.current = onGroupMove;
  }, [onGroupMove]);
  useEffect(() => {
    nodeRef2.current = node;
  }, [node]);
  useEffect(() => {
    isSelectedRef.current = isSelected;
  }, [isSelected]);
  useEffect(() => {
    selectedCountRef.current = selectedCount;
  }, [selectedCount]);

  const [showColors, setShowColors] = useState(false);

  // Natural (expanded, max-h-72-clamped) height of the body — drives the
  // collapsed 30% peek height below, so it tracks streaming AI text too.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) =>
      setBodyHeight(entries[0].contentRect.height),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ResizeObserver — report layout dimensions to parent
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (nodeRef.current)
        onDimsChange(nodeRef.current.offsetWidth, nodeRef.current.offsetHeight);
    });
    obs.observe(el);
    onDimsChange(el.offsetWidth, el.offsetHeight);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global drag listeners (set up once, read latest values via refs)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (!hasDragged.current) {
        const dx = e.clientX - dragStartClient.current.x;
        const dy = e.clientY - dragStartClient.current.y;
        if (Math.hypot(dx, dy) > 4) hasDragged.current = true;
      }
      const s = scaleRef.current,
        p = panRef.current;
      if (isSelectedRef.current && selectedCountRef.current > 1) {
        const dx = (e.clientX - dragStartMouse.current.x) / s;
        const dy = (e.clientY - TOOLBAR_H - dragStartMouse.current.y) / s;
        onGroupMoveRef.current(dx, dy);
      } else {
        onMoveRef.current(
          (e.clientX - dragOffset.current.x - p.x) / s,
          (e.clientY - TOOLBAR_H - dragOffset.current.y - p.y) / s,
        );
      }
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    hasDragged.current = false;
    dragStartClient.current = { x: e.clientX, y: e.clientY };
    const n = nodeRef2.current,
      s = scaleRef.current,
      p = panRef.current;
    if (isSelectedRef.current && selectedCountRef.current > 1) {
      dragStartMouse.current = { x: e.clientX, y: e.clientY - TOOLBAR_H };
      onGroupDragStartRef.current();
    } else {
      dragOffset.current = {
        x: e.clientX - (n.x * s + p.x),
        y: e.clientY - TOOLBAR_H - (n.y * s + p.y),
      };
    }
  };

  // When the node has a user-selected tint, pick dark-on-light or
  // light-on-dark overlay colors based on that tint's own brightness —
  // the swatches now include solid, more saturated colors, so a single
  // "always use dark text" rule no longer holds for all of them.
  const hasTint = node.color !== DEFAULT_COLOR;
  const tintIsLight = hasTint && isLightColor(node.color);
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
  const responseFirstLine = node.response.split("\n")[0].trim();
  const titleSource = responseFirstLine || node.prompt;
  const titleSnippet =
    titleSource.length > 48 ? titleSource.slice(0, 48) + "…" : titleSource;

  return (
    <div
      ref={nodeRef}
      style={{
        /* Dynamic positioning lives here — everything else is Tailwind */
        position: "absolute",
        left: node.x,
        top: node.y,
        width: 380,
        background: hasTint ? node.color : "var(--color-surface-overlay)",
        userSelect: "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "animate-node-in pointer-events-auto rounded-xl border font-sans cursor-pointer",
        "transition-[box-shadow,border-color] duration-200",
        isActive || isSelected
          ? "border-accent z-20 shadow-card-active"
          : "border-border z-[5] shadow-card",
      )}
    >
      {/* ── Header / drag handle — click anywhere on it to collapse/expand ── */}
      <div
        onMouseDown={startDrag}
        onClick={() => {
          if (!hasDragged.current) onToggleMinimize();
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 cursor-pointer active:cursor-grabbing",
          !node.minimized && "border-b border-border-subtle",
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
            onFocus();
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
            onExpand();
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
          title={node.minimized ? "Expand" : "Collapse"}
        >
          <FontAwesomeIcon
            icon={node.minimized ? faChevronDown : faChevronUp}
            className="w-2.5 h-2.5"
          />
        </button>
      </div>

      {/* ── Animated body — collapses to a 30% peek with a fade-out gradient ── */}
      <div
        className="relative overflow-hidden transition-[height] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          height: node.minimized ? bodyHeight * 0.4 : bodyHeight || "auto",
        }}
      >
        {/* When selected the body is also a drag target.
            Max-height + scroll keeps cards compact; modal icon gives access to full text. */}
        <div
          ref={bodyRef}
          className={cn(
            "cc-scroll overflow-y-auto max-h-72 px-3.5 pt-2.5 pb-3.5",
            isSelected && "cursor-grab",
          )}
          onMouseDown={isSelected ? startDrag : undefined}
        >
          {/* Branch-from chip */}
          {node.parentId && parentPrompt && (
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
              {parentPrompt.slice(0, 42)}
              {parentPrompt.length > 42 ? "…" : ""}
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
              {node.prompt}
            </p>
          </div>

          {/* Separator */}
          <div className="my-2.5 h-px" style={{ background: sepBg }} />

          {/* AI */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1 text-accent">
              AI
            </p>
            {node.loading ? (
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
                {node.response}
              </p>
            )}
          </div>
        </div>

        {/* Fade-out gradient over the peeked text when collapsed */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-14 transition-opacity duration-200",
            node.minimized ? "opacity-100" : "opacity-0",
          )}
          style={{
            background: `linear-gradient(to bottom, transparent, ${hasTint ? node.color : "var(--color-surface-overlay)"})`,
          }}
        />
      </div>

      {/* ── Actions footer — fixed like the header, never scrolls or collapses ── */}
      <div className="px-3.5 pt-2.5 pb-4 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 flex-wrap">
          <NBtn
            active={isActive}
            onClick={(e) => {
              e.stopPropagation();
              onBranch();
            }}
          >
            <FontAwesomeIcon icon={faCodeBranch} className="w-2.5 h-2.5" />
            {isActive ? "Branching…" : "Branch"}
          </NBtn>

          <NBtn
            onClick={(e) => {
              e.stopPropagation();
              setShowColors((s) => !s);
            }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                background: node.color,
                border: "1.5px solid rgba(0,0,0,0.15)",
              }}
            />
            Color
          </NBtn>
        </div>

        {/* Color swatches */}
        {showColors && (
          <div
            className="flex gap-1.5 mt-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
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
                    node.color === value
                      ? "2px solid var(--color-accent)"
                      : "1.5px solid rgba(0,0,0,0.15)",
                  outlineOffset: node.color === value ? "2px" : "0",
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
