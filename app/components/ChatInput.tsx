'use client';

import { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeBranch, faXmark, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import type { ChatStyle, ResponseStyle } from '../lib/useSettings';
import { cn } from '../lib/cn';
import Dropdown, { type DropdownOption } from './Dropdown';

const BRANCH_PREVIEW_MAX_LENGTH = 52;

const RESPONSE_STYLE_OPTIONS: DropdownOption<ResponseStyle>[] = [
  { value: 'concise', label: 'Concise', description: 'Short answers that fit the card' },
  { value: 'detailed', label: 'Detailed', description: 'Thorough, structured answers' },
];

interface Props {
  activeNodeId: string | null;
  activeNodePrompt?: string;
  // Owned by the parent so a message held back (e.g. by the folder permission
  // prompt) stays in the box until it's actually sent.
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: () => void;
  onClearActive: () => void;
  chatStyle: ChatStyle;
  responseStyle: ResponseStyle;
  onResponseStyleChange: (responseStyle: ResponseStyle) => void;
}

export default function ChatInput({
  activeNodeId,
  activeNodePrompt,
  draft,
  onDraftChange,
  onSubmit,
  onClearActive,
  chatStyle,
  responseStyle,
  onResponseStyleChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isTerminal = chatStyle === 'terminal';
  const canSubmit = draft.trim() !== '';

  useEffect(() => {
    if (activeNodeId) inputRef.current?.focus();
  }, [activeNodeId]);

  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[640px] max-w-[calc(100vw-32px)]', isTerminal ? 'font-mono' : 'font-sans')}>
      {/* Branch context banner — slides down when active */}
      <div style={{ display: 'grid', gridTemplateRows: activeNodeId ? '1fr' : '0fr', transition: 'grid-template-rows 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="overflow-hidden">
          <div
            className={cn(
              'flex items-center justify-between gap-2 px-3 py-1.5 border border-b-0 rounded-t-[10px] text-xs',
              isTerminal
                ? 'bg-terminal-chrome border-terminal-border text-terminal-text'
                : 'bg-branch-surface border-branch-border text-branch-fg',
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <FontAwesomeIcon icon={faCodeBranch} className={cn('shrink-0 w-2.5 h-2.5', isTerminal ? 'text-terminal-text' : 'text-accent')} />
              <span className="truncate">
                Branching from&nbsp;
                <em className="not-italic font-semibold">
                  &ldquo;{activeNodePrompt?.slice(0, BRANCH_PREVIEW_MAX_LENGTH)}
                  {(activeNodePrompt?.length ?? 0) > BRANCH_PREVIEW_MAX_LENGTH ? '…' : ''}&rdquo;
                </em>
              </span>
            </div>
            <button
              onClick={onClearActive}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer text-inherit"
              title="Cancel branch"
              aria-label="Cancel branch"
            >
              <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Input row */}
      <div
        className={cn(
          'flex items-center border transition-colors duration-200',
          activeNodeId ? 'rounded-b-xl rounded-t-none' : 'rounded-xl',
          isTerminal
            ? cn('bg-terminal-surface', activeNodeId ? 'border-terminal-text' : 'border-terminal-border')
            : cn('bg-surface-overlay', activeNodeId ? 'border-accent' : 'border-border'),
        )}
      >
        {isTerminal && <span className="pl-4 text-sm text-terminal-dim select-none">$</span>}
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
            if (event.key === 'Escape' && activeNodeId) onClearActive();
          }}
          placeholder={activeNodeId ? 'Continue this thread…' : 'Start a new conversation…'}
          className={cn(
            'flex-1 min-w-0 py-[15px] bg-transparent border-none outline-none text-sm',
            isTerminal
              ? 'pl-2 pr-4 text-terminal-bright placeholder:text-terminal-dim'
              : 'px-4 text-foreground placeholder:text-foreground-muted',
          )}
          style={{ caretColor: isTerminal ? 'var(--color-terminal-text)' : 'var(--color-foreground)' }}
        />

        <Dropdown
          label="Response style"
          value={responseStyle}
          options={RESPONSE_STYLE_OPTIONS}
          onChange={onResponseStyleChange}
          opensUpward
          style={{ marginRight: 8 }}
          buttonClassName={cn(
            'px-2.5 py-1 text-[11.5px] font-semibold',
            isTerminal
              ? 'bg-transparent border-terminal-border text-terminal-text hover:border-terminal-text'
              : 'rounded-md bg-surface-subtle border-border text-foreground-muted hover:text-foreground',
          )}
          menuClassName={
            isTerminal
              ? 'bg-terminal-chrome border-terminal-border text-terminal-text font-mono'
              : 'bg-surface-overlay border-border text-foreground'
          }
        />

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            'self-stretch px-5 shrink-0 flex items-center gap-1.5 text-sm font-semibold border-none transition-colors duration-150',
            activeNodeId ? 'rounded-br-xl' : 'rounded-r-xl',
            isTerminal
              ? canSubmit
                ? 'bg-terminal-text text-terminal-surface cursor-pointer'
                : 'bg-transparent text-terminal-dim cursor-default'
              : canSubmit
                ? 'bg-accent text-white hover:bg-accent-hover cursor-pointer'
                : 'bg-transparent text-foreground-muted cursor-default',
          )}
        >
          Send <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3" />
        </button>
      </div>

      {/* Hint */}
      {!activeNodeId && (
        <p className={cn('mt-1.5 text-center text-[11px] tracking-wide', isTerminal ? 'text-terminal-dim' : 'text-foreground-muted')}>
          Press <strong className="font-semibold">Branch</strong> on any node to continue a thread
          · <strong className="font-semibold">Esc</strong> to deselect
        </p>
      )}
    </div>
  );
}
