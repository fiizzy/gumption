'use client';

import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeBranch, faXmark, faPaperPlane } from '@fortawesome/free-solid-svg-icons';

interface Props {
  activeNodeId: string | null;
  activeNodePrompt?: string;
  onSubmit: (prompt: string) => void;
  onClearActive: () => void;
}

export default function ChatInput({ activeNodeId, activeNodePrompt, onSubmit, onClearActive }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeNodeId) inputRef.current?.focus();
  }, [activeNodeId]);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onSubmit(t);
    setValue('');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[580px] max-w-[calc(100vw-32px)] font-sans"
         style={{ filter: 'drop-shadow(var(--shadow-input))' }}>

      {/* Branch context banner — slides down when active */}
      <div style={{ display: 'grid', gridTemplateRows: activeNodeId ? '1fr' : '0fr', transition: 'grid-template-rows 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5
                          bg-branch-surface border border-branch-border border-b-0
                          rounded-t-[10px] text-xs text-branch-fg">
            <div className="flex items-center gap-1.5 min-w-0">
              <FontAwesomeIcon icon={faCodeBranch} className="text-accent shrink-0 w-2.5 h-2.5" />
              <span className="truncate">
                Branching from&nbsp;
                <em className="not-italic font-semibold">
                  &ldquo;{activeNodePrompt?.slice(0, 52)}{(activeNodePrompt?.length ?? 0) > 52 ? '…' : ''}&rdquo;
                </em>
              </span>
            </div>
            <button
              onClick={onClearActive}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity
                         bg-transparent border-none cursor-pointer text-branch-fg"
              title="Cancel branch"
            >
              <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Input row */}
      <div className={`flex overflow-hidden bg-surface-overlay border transition-colors duration-200
                       ${activeNodeId
                         ? 'border-accent rounded-b-xl rounded-t-none'
                         : 'border-border rounded-xl'
                       }`}
           style={{ boxShadow: 'var(--shadow-input)' }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape' && activeNodeId) onClearActive();
          }}
          placeholder={activeNodeId ? 'Continue this thread…' : 'Start a new conversation…'}
          className="flex-1 px-4 py-[15px] bg-transparent border-none outline-none
                     text-sm text-foreground placeholder:text-foreground-subtle font-sans"
          style={{ caretColor: 'var(--color-foreground)' }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className={`px-5 shrink-0 flex items-center gap-1.5 text-sm font-semibold border-none transition-colors duration-150 cursor-pointer font-sans
                      ${value.trim()
                        ? 'bg-accent text-white hover:bg-accent-hover'
                        : 'bg-transparent text-foreground-subtle cursor-default'
                      }`}
        >
          Send <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3" />
        </button>
      </div>

      {/* Hint */}
      {!activeNodeId && (
        <p className="mt-1.5 text-center text-[11px] text-foreground-subtle tracking-wide">
          Press <strong className="text-foreground-muted font-semibold">Branch</strong> on any node to continue a thread
          · <strong className="text-foreground-muted font-semibold">Esc</strong> to deselect
        </p>
      )}
    </div>
  );
}
