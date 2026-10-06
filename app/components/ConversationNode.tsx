"use client";

import { memo, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripVertical,
  faCrosshairs,
  faUpRightAndDownLeftFromCenter,
  faChevronDown,
  faChevronUp,
  faChevronLeft,
  faChevronRight,
  faCodeBranch,
  faLayerGroup,
  faTerminal,
} from "@fortawesome/free-solid-svg-icons";
import type { HydratedConversationNode, ResponseStyle, TerminalTheme, ThreadSummary } from "../types";
import { TERMINAL_THEMES, getTerminalThemeClass } from "../lib/terminalThemes";
import { cn } from "../lib/cn";
import { DEFAULT_COLOR, SWATCHES, isLightColor } from "../lib/color";
import { ChatStyleContext } from "../lib/chatStyleContext";
import { MAX_VISIBLE_DECK_LAYERS } from "../lib/threadStacks";
import ColorSwatches from "./ColorSwatches";
import MarkdownContent from "./MarkdownContent";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";
import CopyButton from "./CopyButton";
import ThinkingIndicator from "./ThinkingIndicator";

// Handles are invisible connection points that only exist so the custom
// "branch" edge knows which side of the card to attach to — end
// users never drag new connections from them (isConnectable={false}).
const HANDLE_STYLE = { opacity: 0, width: 1, height: 1, pointerEvents: "none" as const };

export const CONVERSATION_MIN_WIDTH = 280;
const CONVERSATION_MIN_HEIGHT = 160;
// A card grows with its reply up to this height, then scrolls inside.
const AUTO_HEIGHT_MAX = 640;
// Collapsed "peek" strip height.
const MINIMIZED_PEEK_HEIGHT = 96;
const TITLE_MAX_LENGTH = 48;
const BRANCH_PREVIEW_MAX_LENGTH = 42;
// Each card behind a deck's top card is shifted this far up-and-right.
const DECK_LAYER_OFFSET = 7;
const DECK_LAYER_OPACITY_STEP = 0.18;
// While streaming, keep following the newest text unless the user has
// scrolled further up than this.
const FOLLOW_SCROLL_THRESHOLD = 48;

const RESPONSE_STYLE_LABEL: Record<ResponseStyle, string> = {
  concise: "Concise",
  detailed: "Detailed",
};

// Colors/classes that differ between the standard card (optionally tinted)
// and the terminal card.
export interface CardPalette {
  surface: string;
  borderClass: string;
  activeBorderClass: string;
  textClass: string;
  mutedClass: string;
  replyLabelClass: string;
  chipTextClass: string;
  chipBackground: string;
  chipBorder: string;
  separator: string;
  dividerClass: string;
  fontClass: string;
}

export const TERMINAL_PALETTE: CardPalette = {
  surface: "var(--color-terminal-surface)",
  borderClass: "border-terminal-border",
  activeBorderClass: "border-terminal-text",
  textClass: "text-terminal-bright",
  mutedClass: "text-terminal-text",
  replyLabelClass: "text-terminal-dim",
  chipTextClass: "text-terminal-dim",
  chipBackground: "transparent",
  chipBorder: "var(--color-terminal-border)",
  separator: "var(--color-terminal-border)",
  dividerClass: "border-terminal-border",
  fontClass: "font-mono",
};

// When the card has a user-selected tint, pick dark-on-light or
// light-on-dark overlay colors based on that tint's own brightness.
export function getStandardPalette(color: string): CardPalette {
  const hasTint = color !== DEFAULT_COLOR;
  const tintIsLight = hasTint && isLightColor(color);
  const pick = (untinted: string, onLight: string, onDark: string) =>
    !hasTint ? untinted : tintIsLight ? onLight : onDark;
  return {
    surface: hasTint ? color : "var(--color-surface-overlay)",
    borderClass: "border-border",
    activeBorderClass: "border-accent",
    textClass: pick("text-foreground", "text-[#09090b]", "text-white"),
    mutedClass: pick("text-foreground-muted", "text-[#52525b]", "text-white/75"),
    replyLabelClass: "text-accent",
    chipTextClass: pick("text-foreground-muted", "text-[#52525b]", "text-white/85"),
    chipBackground: pick("var(--color-surface-subtle)", "rgba(0,0,0,0.06)", "rgba(255,255,255,0.16)"),
    chipBorder: pick("var(--color-border)", "rgba(0,0,0,0.1)", "rgba(255,255,255,0.26)"),
    separator: pick("var(--color-border-subtle)", "rgba(0,0,0,0.06)", "rgba(255,255,255,0.2)"),
    dividerClass: "border-border-subtle",
    fontClass: "font-sans",
  };
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
}

interface TranscriptProps {
  prompt: string;
  response: string;
  responseStyle: ResponseStyle;
  loading: boolean;
  activity: string | null;
  branchParentPromptPreview: string | undefined;
  isTerminal: boolean;
  palette: CardPalette;
}

// The prompt + reply body — shared by the card and the full-view modal so
// both always look alike in either chat style.
export function ConversationTranscript({
  prompt,
  response,
  responseStyle,
  loading,
  activity,
  branchParentPromptPreview,
  isTerminal,
  palette,
}: TranscriptProps) {
  return (
    <>
      {branchParentPromptPreview && (
        <div
          className={cn(
            "inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 mb-2.5 max-w-full truncate",
            palette.chipTextClass,
          )}
          style={{ background: palette.chipBackground, border: `1px solid ${palette.chipBorder}` }}
        >
          <FontAwesomeIcon icon={faCodeBranch} className={cn("w-2 h-2", isTerminal ? "text-terminal-text" : "text-accent")} />
          {truncate(branchParentPromptPreview, BRANCH_PREVIEW_MAX_LENGTH)}
        </div>
      )}

      {isTerminal ? (
        <p className="text-[13.5px] leading-relaxed m-0 mb-2.5 whitespace-pre-wrap break-words">
          <span className="text-terminal-dim">you@canvas:~$ </span>
          <span className="text-terminal-bright">{prompt}</span>
        </p>
      ) : (
        <div className="mb-2.5">
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.08em] mb-1", palette.mutedClass)}>You</p>
          <p className={cn("text-[14.5px] leading-relaxed m-0 whitespace-pre-wrap", palette.textClass)}>{prompt}</p>
        </div>
      )}

      {!isTerminal && <div className="my-2.5 h-px" style={{ background: palette.separator }} />}

      <div className="mb-1">
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.08em] m-0", palette.replyLabelClass)}>
            {isTerminal ? `claude · ${RESPONSE_STYLE_LABEL[responseStyle].toLowerCase()}` : "AI"}
            {!isTerminal && (
              <span className={cn("ml-1.5 font-semibold normal-case tracking-normal opacity-80", palette.mutedClass)}>
                · {RESPONSE_STYLE_LABEL[responseStyle]}
              </span>
            )}
          </p>
          {!loading && response && (
            <CopyButton text={response} className={cn("opacity-60 hover:opacity-100 p-0.5", palette.mutedClass)} />
          )}
        </div>
        {response && (
          <MarkdownContent
            content={response}
            className={cn(
              isTerminal ? "cc-terminal-markdown text-[13.5px] leading-[1.6]" : "text-[14.5px] leading-[1.65]",
              palette.mutedClass,
            )}
          />
        )}
        {loading && (
          <div className={response ? "mt-2" : undefined}>
            <ThinkingIndicator activity={activity} isTerminal={isTerminal} />
          </div>
        )}
      </div>
    </>
  );
}

function ConversationNode({ data, selected }: NodeProps<HydratedConversationNode>) {
  const {
    prompt,
    response,
    responseStyle,
    loading,
    minimized,
    color,
    width,
    height,
    isHeightPinned,
    branchParentPromptPreview,
    isBranchActive,
    isBindingTarget,
    thread,
    activity,
    onToggleBranch,
    onFocusNode,
    onExpandNode,
    onColorChange,
    onToggleMinimize,
    onResizeElement,
    onToggleThreadStack,
    onThreadColorChange,
    onTerminalThemeChange,
    onThreadTerminalThemeChange,
    terminalTheme,
    onShowAdjacentInDeck,
  } = data;

  const [showColors, setShowColors] = useState(false);
  const isTerminal = useContext(ChatStyleContext) === "terminal";
  const palette = isTerminal ? TERMINAL_PALETTE : getStandardPalette(color);
  const isDeckTop = !!thread?.isStacked && thread.deckIndex !== null;

  // Follow the reply as it streams in, unless the user scrolled up to read.
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFollowingReplyRef = useRef(true);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (loading && scroller && isFollowingReplyRef.current) scroller.scrollTop = scroller.scrollHeight;
  }, [response, loading]);

  // Title mirrors the AI's reply (first line, truncated) once one exists,
  // falling back to the prompt while the response is still loading.
  const titleSource = response.split("\n")[0].trim() || prompt;
  const isHighlighted = isBranchActive || selected;
  const deckLayerCount = isDeckTop ? Math.min(thread.cardCount - 1, MAX_VISIBLE_DECK_LAYERS) : 0;
  const cardFrameClass = cn("rounded-xl border", isHighlighted ? palette.activeBorderClass : palette.borderClass);
  const isAutoHeight = !isHeightPinned && !minimized;

  return (
    <div
      style={{
        width,
        // Auto: grows with the content up to a cap. Pinned: the size the user
        // resized it to. Minimized: header + fixed peek strip + footer.
        height: minimized || isAutoHeight ? undefined : height,
        minHeight: minimized ? undefined : CONVERSATION_MIN_HEIGHT,
        maxHeight: isAutoHeight ? AUTO_HEIGHT_MAX : undefined,
        background: palette.surface,
      }}
      className={cn(
        "animate-node-in cursor-pointer group flex flex-col relative transition-[border-color] duration-200",
        palette.fontClass,
        isTerminal && getTerminalThemeClass(terminalTheme),
        cardFrameClass,
        isBindingTarget && "outline-4 outline-solid outline-accent/50",
      )}
    >
      {/* Deck — the cards underneath, peeking out like a pack of cards. */}
      {Array.from({ length: deckLayerCount }, (_, index) => {
        const depth = index + 1;
        return (
          <div
            key={depth}
            aria-hidden
            className={cn("absolute pointer-events-none", cardFrameClass)}
            style={{
              inset: -1,
              background: palette.surface,
              transform: `translate(${depth * DECK_LAYER_OFFSET}px, ${-depth * DECK_LAYER_OFFSET}px)`,
              opacity: 1 - depth * DECK_LAYER_OPACITY_STEP,
              zIndex: -depth,
            }}
          />
        );
      })}

      {isDeckTop && (
        <>
          <DeckArrow
            direction={-1}
            isDisabled={thread.deckIndex === 0}
            isTerminal={isTerminal}
            onClick={() => onShowAdjacentInDeck(-1)}
          />
          <DeckArrow
            direction={1}
            isDisabled={thread.deckIndex === thread.cardCount - 1}
            isTerminal={isTerminal}
            onClick={() => onShowAdjacentInDeck(1)}
          />
        </>
      )}

      {thread && (
        <ThreadMenu
          thread={thread}
          colorPicker={
            isTerminal
              ? {
                  label: "Terminal theme",
                  value: terminalTheme,
                  swatches: TERMINAL_THEMES,
                  onChange: (value) => onThreadTerminalThemeChange(value as TerminalTheme),
                }
              : { label: "Thread color", value: color, swatches: SWATCHES, onChange: onThreadColorChange }
          }
          isTerminal={isTerminal}
          isAlwaysVisible={selected}
          onToggleStack={onToggleThreadStack}
        />
      )}

      {/* Not rendered while minimized — the card's DOM height is then the
          peek strip, and resizing against it would corrupt the stored size. */}
      {selected && !minimized && (
        <ResizeHandles minWidth={CONVERSATION_MIN_WIDTH} minHeight={CONVERSATION_MIN_HEIGHT} onResize={onResizeElement} />
      )}

      <Handle type="target" position={Position.Top} id="branchTarget" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="branchSource" isConnectable={false} style={HANDLE_STYLE} />

      <AnchorHandles visible={selected} />

      {/* ── Header / drag handle — clicking it selects the card; only the
          chevron collapses/expands it ── */}
      <div
        className={cn(
          "drag-handle shrink-0 flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing rounded-t-xl",
          !minimized && cn("border-b", palette.dividerClass),
        )}
        style={isTerminal ? { background: "var(--color-terminal-chrome)" } : undefined}
      >
        <FontAwesomeIcon
          icon={isTerminal ? faTerminal : faGripVertical}
          className={cn("shrink-0 w-2.5 h-2.5", isTerminal ? "text-terminal-dim" : cn("opacity-40", palette.mutedClass))}
        />
        <span
          className={cn(
            "flex-1 truncate",
            isTerminal ? "text-[13px] text-terminal-text" : cn("text-[14px] font-semibold tracking-tight", palette.textClass),
          )}
        >
          {truncate(titleSource, TITLE_MAX_LENGTH)}
        </span>
        <HeaderButton title="Centre on screen at 100 % zoom" className={palette.mutedClass} onClick={onFocusNode}>
          <FontAwesomeIcon icon={faCrosshairs} className="w-3 h-3" />
        </HeaderButton>
        <HeaderButton title="Open full content" className={palette.mutedClass} onClick={onExpandNode}>
          <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} className="w-3 h-3" />
        </HeaderButton>
        <HeaderButton title={minimized ? "Expand" : "Collapse"} className={palette.mutedClass} onClick={onToggleMinimize}>
          <FontAwesomeIcon icon={minimized ? faChevronDown : faChevronUp} className="w-2.5 h-2.5" />
        </HeaderButton>
      </div>

      {/* ── Body — scrolls internally once the card hits its height (cap or
          pinned); collapses to a fixed peek strip with a fade-out gradient ── */}
      <div
        className="relative overflow-hidden nodrag flex flex-col"
        style={minimized ? { height: MINIMIZED_PEEK_HEIGHT } : { flex: isAutoHeight ? "0 1 auto" : "1 1 auto", minHeight: 0 }}
      >
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const scroller = event.currentTarget;
            isFollowingReplyRef.current =
              scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_SCROLL_THRESHOLD;
          }}
          className="cc-scroll nowheel overflow-y-auto min-h-0 px-3.5 pt-2.5 pb-3 cursor-auto"
        >
          <ConversationTranscript
            prompt={prompt}
            response={response}
            responseStyle={responseStyle}
            loading={loading}
            activity={activity}
            branchParentPromptPreview={branchParentPromptPreview}
            isTerminal={isTerminal}
            palette={palette}
          />
        </div>

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-14 transition-opacity duration-200",
            minimized ? "opacity-100" : "opacity-0",
          )}
          style={{ background: `linear-gradient(to bottom, transparent, ${palette.surface})` }}
        />
      </div>

      {/* ── Actions footer — fixed like the header, never scrolls or collapses ── */}
      <div className={cn("nodrag cursor-auto shrink-0 px-3.5 pt-2.5 pb-3.5 border-t mt-auto", palette.dividerClass)}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CardButton isTerminal={isTerminal} isActive={isBranchActive} onClick={onToggleBranch}>
            <FontAwesomeIcon icon={faCodeBranch} className="w-2.5 h-2.5" />
            {isBranchActive ? "Branching…" : "Branch"}
          </CardButton>
          <CardButton isTerminal={isTerminal} onClick={() => setShowColors((shown) => !shown)}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
              style={{ background: isTerminal ? "var(--color-terminal-text)" : color }}
            />
            {isTerminal ? "Theme" : "Color"}
          </CardButton>
          {isDeckTop && (
            <span className={cn("ml-auto text-[11px] tabular-nums", palette.mutedClass)}>
              {thread.deckIndex! + 1} / {thread.cardCount}
            </span>
          )}
        </div>
        {showColors && (
          <ColorSwatches
            color={isTerminal ? terminalTheme : color}
            swatches={isTerminal ? TERMINAL_THEMES : SWATCHES}
            onChange={(value) => {
              if (isTerminal) onTerminalThemeChange(value as TerminalTheme);
              else onColorChange(value);
              setShowColors(false);
            }}
            className="mt-2"
          />
        )}
      </div>
    </div>
  );
}

export default memo(ConversationNode);

const DECK_ARROW_SIZE = 28;
const DECK_ARROW_OFFSET = -(DECK_ARROW_SIZE / 2 + 6);

// Flips between the cards of a stacked thread.
function DeckArrow({
  direction,
  isDisabled,
  isTerminal,
  onClick,
}: {
  direction: -1 | 1;
  isDisabled: boolean;
  isTerminal: boolean;
  onClick: () => void;
}) {
  const label = direction === -1 ? "Previous card in thread" : "Next card in thread";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={isDisabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "nodrag absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full border transition-colors",
        isTerminal
          ? "bg-terminal-chrome border-terminal-border text-terminal-text hover:border-terminal-text"
          : "bg-surface-raised border-border text-foreground-muted hover:text-foreground hover:border-accent",
        isDisabled ? "opacity-30 cursor-default" : "cursor-pointer",
      )}
      style={{
        width: DECK_ARROW_SIZE,
        height: DECK_ARROW_SIZE,
        ...(direction === -1 ? { left: DECK_ARROW_OFFSET } : { right: DECK_ARROW_OFFSET }),
      }}
    >
      <FontAwesomeIcon icon={direction === -1 ? faChevronLeft : faChevronRight} className="w-2.5 h-2.5" />
    </button>
  );
}

// Per-thread settings: shown on hover (or while the card is selected) for
// any card that belongs to a thread.
interface ColorPicker {
  label: string;
  value: string;
  swatches: { label: string; value: string; preview?: string }[];
  onChange: (value: string) => void;
}

function ThreadMenu({
  thread,
  colorPicker,
  isTerminal,
  isAlwaysVisible,
  onToggleStack,
}: {
  thread: ThreadSummary;
  // Card tints in the standard style; terminal themes in the terminal style.
  colorPicker: ColorPicker;
  isTerminal: boolean;
  isAlwaysVisible: boolean;
  onToggleStack: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  const surfaceClass = isTerminal
    ? "bg-terminal-chrome border-terminal-border text-terminal-text"
    : "bg-surface-raised border-border text-foreground-muted";

  return (
    <div
      ref={containerRef}
      className={cn(
        "nodrag absolute -top-9 right-0 z-30 transition-opacity",
        isAlwaysVisible || isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        title="Thread settings"
        aria-label="Thread settings"
        aria-expanded={isOpen}
        className={cn("flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11.5px] font-medium cursor-pointer", surfaceClass)}
      >
        <FontAwesomeIcon icon={faLayerGroup} className="w-2.5 h-2.5" />
        Thread · {thread.cardCount}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Thread settings"
          className={cn("absolute right-0 top-full mt-1.5 w-[220px] p-3 flex flex-col gap-3 rounded-lg border cursor-auto", surfaceClass)}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={cn("text-[12.5px] font-medium", isTerminal ? "text-terminal-bright" : "text-foreground")}>
              Stack thread
            </span>
            <button
              role="switch"
              aria-checked={thread.isStacked}
              aria-label="Stack thread"
              onClick={onToggleStack}
              className={cn(
                "relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors shrink-0",
                thread.isStacked ? (isTerminal ? "bg-terminal-text" : "bg-accent") : "bg-surface-subtle",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left]",
                  thread.isStacked ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={cn("text-[12.5px] font-medium", isTerminal ? "text-terminal-bright" : "text-foreground")}>
              {colorPicker.label}
            </span>
            <ColorSwatches color={colorPicker.value} swatches={colorPicker.swatches} onChange={colorPicker.onChange} />
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className={cn(
        "shrink-0 opacity-50 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0.5",
        className,
      )}
    >
      {children}
    </button>
  );
}

function CardButton({
  children,
  onClick,
  isActive = false,
  isTerminal,
}: {
  children: ReactNode;
  onClick: () => void;
  isActive?: boolean;
  isTerminal: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border cursor-pointer transition-colors duration-100",
        isTerminal
          ? cn(
              "rounded-none font-mono",
              isActive
                ? "bg-terminal-text border-terminal-text text-terminal-surface"
                : "bg-transparent border-terminal-border text-terminal-text hover:border-terminal-text",
            )
          : cn(
              "rounded-md font-sans",
              isActive
                ? "bg-accent border-accent text-white"
                : "bg-black/50 border-white/10 text-white/90 hover:bg-black/60 hover:text-white",
            ),
      )}
    >
      {children}
    </button>
  );
}
