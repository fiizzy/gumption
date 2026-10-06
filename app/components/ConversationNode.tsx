"use client";

import { memo, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripVertical,
  faCrosshairs,
  faUpRightAndDownLeftFromCenter,
  faChevronDown,
  faChevronUp,
  faCodeBranch,
  faLayerGroup,
  faTerminal,
} from "@fortawesome/free-solid-svg-icons";
import type { HydratedConversationNode, ResponseStyle } from "../types";
import { cn } from "../lib/cn";
import { DEFAULT_COLOR, isLightColor } from "../lib/color";
import { ChatStyleContext } from "../lib/chatStyleContext";
import { MAX_VISIBLE_DECK_LAYERS } from "../lib/threadStacks";
import ColorSwatches from "./ColorSwatches";
import MarkdownContent from "./MarkdownContent";
import AnchorHandles from "./AnchorHandles";
import ResizeHandles from "./ResizeHandles";
import CopyButton from "./CopyButton";

// Handles are invisible connection points that only exist so the custom
// "branch" edge knows which side of the card to attach to — end
// users never drag new connections from them (isConnectable={false}).
const HANDLE_STYLE = { opacity: 0, width: 1, height: 1, pointerEvents: "none" as const };

const CONVERSATION_MIN_WIDTH = 280;
const CONVERSATION_MIN_HEIGHT = 160;
// Collapsed "peek" strip height — fixed rather than content-derived, since
// the card's overall height is user-resizable (data.height).
const MINIMIZED_PEEK_HEIGHT = 96;
const TITLE_MAX_LENGTH = 48;
const BRANCH_PREVIEW_MAX_LENGTH = 42;
// Each card behind a deck's top card is shifted this far up-and-right.
const DECK_LAYER_OFFSET = 7;
const DECK_LAYER_OPACITY_STEP = 0.18;
const TERMINAL_TINT_STRIP_WIDTH = 3;

const RESPONSE_STYLE_LABEL: Record<ResponseStyle, string> = {
  concise: "Concise",
  detailed: "Detailed",
};

// Colors/classes that differ between the standard card (optionally tinted)
// and the terminal card.
interface CardPalette {
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

const TERMINAL_PALETTE: CardPalette = {
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
function getStandardPalette(color: string): CardPalette {
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
    branchParentPromptPreview,
    isBranchActive,
    isBindingTarget,
    deck,
    canRestack,
    onToggleBranch,
    onFocusNode,
    onExpandNode,
    onColorChange,
    onToggleMinimize,
    onResizeElement,
    onExpandThread,
    onRestackThread,
  } = data;

  const [showColors, setShowColors] = useState(false);
  const isTerminal = useContext(ChatStyleContext) === "terminal";
  const palette = isTerminal ? TERMINAL_PALETTE : getStandardPalette(color);
  const hasTint = color !== DEFAULT_COLOR;

  // Title mirrors the AI's reply (first line, truncated) once one exists,
  // falling back to the prompt while the response is still loading.
  const titleSource = response.split("\n")[0].trim() || prompt;
  const isHighlighted = isBranchActive || selected;
  const deckLayerCount = deck ? Math.min(deck.cardCount - 1, MAX_VISIBLE_DECK_LAYERS) : 0;
  const cardFrameClass = cn("rounded-xl border", isHighlighted ? palette.activeBorderClass : palette.borderClass);

  return (
    <div
      style={{
        width,
        // Minimized height is intrinsic (header + fixed peek + footer);
        // expanded height is the user-resized value, with the body flexing
        // to fill whatever's left after the fixed header/footer.
        height: minimized ? undefined : height,
        background: palette.surface,
      }}
      className={cn(
        "animate-node-in cursor-pointer group flex flex-col relative transition-[border-color] duration-200",
        palette.fontClass,
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

      {/* Not rendered at all while minimized — the card's actual DOM height
          is the collapsed peek strip then, not data.height, so resizing
          against it would corrupt the stored size for once it's expanded. */}
      {selected && !minimized && (
        <ResizeHandles
          minWidth={CONVERSATION_MIN_WIDTH}
          minHeight={CONVERSATION_MIN_HEIGHT}
          onResize={onResizeElement}
        />
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
        style={
          isTerminal
            ? {
                background: "var(--color-terminal-chrome)",
                boxShadow: hasTint ? `inset ${TERMINAL_TINT_STRIP_WIDTH}px 0 0 ${color}` : undefined,
              }
            : undefined
        }
      >
        <FontAwesomeIcon
          icon={isTerminal ? faTerminal : faGripVertical}
          className={cn("shrink-0 w-2.5 h-2.5", isTerminal ? "text-terminal-dim" : cn("opacity-40", palette.mutedClass))}
        />

        <span
          className={cn(
            "flex-1 truncate",
            isTerminal ? "text-[13px] text-terminal-text" : "text-[14px] font-semibold tracking-tight",
            !isTerminal && palette.textClass,
          )}
        >
          {truncate(titleSource, TITLE_MAX_LENGTH)}
        </span>

        <HeaderButton
          title="Centre on screen at 100 % zoom"
          className={palette.mutedClass}
          onClick={onFocusNode}
        >
          <FontAwesomeIcon icon={faCrosshairs} className="w-3 h-3" />
        </HeaderButton>
        <HeaderButton title="Open full content" className={palette.mutedClass} onClick={onExpandNode}>
          <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} className="w-3 h-3" />
        </HeaderButton>
        <HeaderButton title={minimized ? "Expand" : "Collapse"} className={palette.mutedClass} onClick={onToggleMinimize}>
          <FontAwesomeIcon icon={minimized ? faChevronDown : faChevronUp} className="w-2.5 h-2.5" />
        </HeaderButton>
      </div>

      {/* ── Body — fills the remaining resized height and scrolls internally;
          collapses to a fixed peek strip with a fade-out gradient ── */}
      <div
        className="relative overflow-hidden transition-[height] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] nodrag"
        style={minimized ? { height: MINIMIZED_PEEK_HEIGHT } : { flex: "1 1 auto", minHeight: 0 }}
      >
        <div className="cc-scroll nowheel overflow-y-auto h-full px-3.5 pt-2.5 pb-3.5 cursor-auto">
          {branchParentPromptPreview && (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 mb-2.5 max-w-full truncate",
                palette.chipTextClass,
              )}
              style={{ background: palette.chipBackground, border: `1px solid ${palette.chipBorder}` }}
            >
              <FontAwesomeIcon
                icon={faCodeBranch}
                className={cn("w-2 h-2", isTerminal ? "text-terminal-text" : "text-accent")}
              />
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
              <p className={cn("text-[10px] font-bold uppercase tracking-[0.08em] mb-1", palette.mutedClass)}>
                You
              </p>
              <p className={cn("text-[14.5px] leading-relaxed m-0", palette.textClass)}>{prompt}</p>
            </div>
          )}

          {!isTerminal && <div className="my-2.5 h-px" style={{ background: palette.separator }} />}

          <div className="mb-3">
            <div className="flex items-center justify-between mb-1 gap-2">
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.08em] m-0",
                  palette.replyLabelClass,
                )}
              >
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
            {loading ? (
              isTerminal ? (
                <div className="flex items-center gap-2 text-[13.5px] text-terminal-text">
                  <span>thinking</span>
                  <span className="inline-block w-2 h-4 bg-terminal-text animate-cursor-blink" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[14.5px] text-foreground-muted">
                  <span className="flex gap-[3px]">
                    {[0, 0.15, 0.3].map((delay, index) => (
                      <span
                        key={index}
                        className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-thinking"
                        style={{ animationDelay: `${delay}s` }}
                      />
                    ))}
                  </span>
                  <span className="italic">Thinking…</span>
                </div>
              )
            ) : (
              <MarkdownContent
                content={response}
                className={cn(
                  isTerminal ? "cc-terminal-markdown text-[13.5px] leading-[1.6]" : "text-[14.5px] leading-[1.65]",
                  palette.mutedClass,
                )}
              />
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
          style={{ background: `linear-gradient(to bottom, transparent, ${palette.surface})` }}
        />
      </div>

      {/* ── Actions footer — fixed like the header, never scrolls or collapses ── */}
      <div className={cn("nodrag cursor-auto shrink-0 px-3.5 pt-2.5 pb-4 border-t", palette.dividerClass)}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CardButton isTerminal={isTerminal} isActive={isBranchActive} onClick={onToggleBranch}>
            <FontAwesomeIcon icon={faCodeBranch} className="w-2.5 h-2.5" />
            {isBranchActive ? "Branching…" : "Branch"}
          </CardButton>

          <CardButton isTerminal={isTerminal} onClick={() => setShowColors((shown) => !shown)}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: color, border: "1.5px solid rgba(0,0,0,0.15)" }}
            />
            Color
          </CardButton>

          {deck && (
            <CardButton isTerminal={isTerminal} onClick={onExpandThread} title="Fan this thread out">
              <FontAwesomeIcon icon={faLayerGroup} className="w-2.5 h-2.5" />
              {deck.cardCount} in thread
            </CardButton>
          )}
          {canRestack && (
            <CardButton isTerminal={isTerminal} onClick={onRestackThread} title="Stack this thread back into a deck">
              <FontAwesomeIcon icon={faLayerGroup} className="w-2.5 h-2.5" />
              Stack
            </CardButton>
          )}
        </div>

        {showColors && (
          <ColorSwatches
            color={color}
            onChange={(value) => {
              onColorChange(value);
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
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  isActive?: boolean;
  isTerminal: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
