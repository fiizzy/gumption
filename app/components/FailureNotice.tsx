"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCheck, faCopy, faXmark } from "@fortawesome/free-solid-svg-icons";
import { openExternalLink, type AgentFailure } from "../lib/claudeCode";

const COPIED_FEEDBACK_MS = 1500;
// Raw error text is shown whole behind Details; past this height it scrolls
// rather than pushing the panel around.
const DETAILS_MAX_HEIGHT = 140;

interface Props {
  failure: AgentFailure;
  retryLabel: string;
  onRetry: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
}

// A failure, or something that would cause one, with its fix attached: a
// title, one plain sentence, the command to run or page to open, and the
// raw text behind Details for anyone filing a bug.
export default function FailureNotice({ failure, retryLabel, onRetry, onDismiss, showDetails = false }: Props) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-[12px] leading-5 text-foreground-muted">
      <div className="flex items-start gap-2.5">
        <p className="flex-1 min-w-0 break-words">
          <span className="font-semibold text-foreground">{failure.title}</span> {failure.explanation}
        </p>
        {onDismiss && <DismissButton onClick={onDismiss} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {failure.actions.map((action) => {
          if (action.kind === "command") return <CommandChip key={action.command} command={action.command} />;
          if (action.kind === "link") {
            return (
              <button
                key={action.url}
                type="button"
                onClick={() => void openExternalLink(action.url)}
                className="h-7 px-2 flex items-center gap-1.5 rounded-md bg-transparent border-none cursor-pointer text-[12px] font-semibold text-accent hover:bg-surface-subtle"
              >
                {action.label}
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="w-2.5 h-2.5" aria-hidden />
              </button>
            );
          }
          return (
            <TextButton key="retry" onClick={onRetry}>
              {retryLabel}
            </TextButton>
          );
        })}
        {showDetails && (
          <button
            type="button"
            aria-expanded={isDetailsOpen}
            onClick={() => setIsDetailsOpen((open) => !open)}
            className="h-7 px-2 rounded-md bg-transparent border-none cursor-pointer text-[12px] text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
          >
            {isDetailsOpen ? "Hide details" : "Details"}
          </button>
        )}
      </div>
      {showDetails && isDetailsOpen && (
        <div className="flex items-start gap-2">
          <pre
            className="flex-1 min-w-0 px-2.5 py-2 rounded-md bg-surface-subtle font-mono text-[11px] leading-4 text-foreground whitespace-pre-wrap break-all overflow-y-auto cc-scroll select-text"
            style={{ maxHeight: DETAILS_MAX_HEIGHT }}
          >
            {failure.details}
          </pre>
          <CopyTextButton text={failure.details} label="Copy details" />
        </div>
      )}
    </div>
  );
}

function CommandChip({ command }: { command: string }) {
  return (
    <span className="flex items-center gap-1 max-w-full pl-2.5 pr-0.5 h-7 rounded-md bg-surface-subtle">
      <code className="font-mono text-[11.5px] text-foreground truncate select-all">{command}</code>
      <CopyTextButton text={command} label="Copy command" />
    </span>
  );
}

export function TextButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2 shrink-0 rounded-md bg-transparent border-none cursor-pointer text-[12px] font-semibold text-accent hover:bg-surface-subtle"
    >
      {children}
    </button>
  );
}

export function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
    >
      <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
    </button>
  );
}

function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setIsCopied(true));
      }}
      aria-label={isCopied ? "Copied" : label}
      title={isCopied ? "Copied" : label}
      className="w-6 h-6 shrink-0 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground"
    >
      <FontAwesomeIcon icon={isCopied ? faCheck : faCopy} className="w-3 h-3" />
    </button>
  );
}
