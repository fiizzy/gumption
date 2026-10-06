"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { ConversationNodeData } from "../types";
import type { ChatStyle } from "../lib/useSettings";
import { DEFAULT_COLOR } from "../lib/color";
import { cn } from "../lib/cn";
import { getTerminalThemeClass } from "../lib/terminalThemes";
import { ConversationTranscript, TERMINAL_PALETTE, getStandardPalette } from "./ConversationNode";

const TITLE_MAX_LENGTH = 72;

interface Props {
  // The live card data, so a reply that's still streaming keeps updating here.
  conversation: ConversationNodeData | null;
  parentPrompt: string | undefined;
  activity: string | null;
  chatStyle: ChatStyle;
  onClose: () => void;
}

export default function ConversationModal({ conversation, parentPrompt, activity, chatStyle, onClose }: Props) {
  if (!conversation) return null;
  const isTerminal = chatStyle === "terminal";
  const palette = isTerminal ? TERMINAL_PALETTE : getStandardPalette(DEFAULT_COLOR);
  const title = conversation.prompt.length > TITLE_MAX_LENGTH
    ? conversation.prompt.slice(0, TITLE_MAX_LENGTH) + "…"
    : conversation.prompt;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-8 bg-black/65" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full conversation"
        className={cn(
          "w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border",
          palette.fontClass,
          palette.borderClass,
          isTerminal && getTerminalThemeClass(conversation.terminalTheme),
        )}
        style={{ background: palette.surface }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={cn("flex items-center gap-2.5 px-5 py-3.5 border-b shrink-0 rounded-t-xl", palette.dividerClass)}
          style={isTerminal ? { background: "var(--color-terminal-chrome)" } : undefined}
        >
          {isTerminal && <FontAwesomeIcon icon={faTerminal} className="w-3 h-3 text-terminal-dim" />}
          <span className={cn("flex-1 truncate text-sm", isTerminal ? "text-terminal-text" : "font-semibold text-foreground tracking-tight")}>
            {isTerminal ? `claude@canvas — ${title}` : "Full conversation"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className={cn("bg-transparent border-none cursor-pointer transition-opacity opacity-70 hover:opacity-100", palette.mutedClass)}
          >
            <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="cc-scroll overflow-y-auto flex-1 px-6 py-5">
          <ConversationTranscript
            prompt={conversation.prompt}
            response={conversation.response}
            responseStyle={conversation.responseStyle}
            loading={conversation.loading}
            activity={activity}
            branchParentPromptPreview={parentPrompt}
            isTerminal={isTerminal}
            palette={palette}
          />
        </div>
      </div>
    </div>
  );
}
