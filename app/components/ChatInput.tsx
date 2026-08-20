'use client';

import { useState, useRef, useEffect } from 'react';

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
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 580,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 200,
        filter: 'var(--shadow-input)',
      }}
    >
      {/* Branch context banner */}
      <div style={{
        display: 'grid',
        gridTemplateRows: activeNodeId ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            background: 'var(--branch-bg)',
            border: '1px solid var(--branch-border)',
            borderBottom: 'none',
            borderRadius: '10px 10px 0 0',
            padding: '7px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <span style={{ color: 'var(--accent)', fontSize: 12, flexShrink: 0 }}>↗</span>
              <span style={{
                fontSize: 12, color: 'var(--branch-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Branching from&nbsp;
                <em style={{ fontStyle: 'normal', fontWeight: 600 }}>
                  &ldquo;{activeNodePrompt?.slice(0, 52)}{(activeNodePrompt?.length ?? 0) > 52 ? '…' : ''}&rdquo;
                </em>
              </span>
            </div>
            <button
              onClick={onClearActive}
              style={{
                background: 'none', border: 'none', color: 'var(--branch-text)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, opacity: 0.7,
                padding: '0 2px', flexShrink: 0,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
              title="Cancel branch"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {/* Input row */}
      <div style={{
        display: 'flex',
        background: 'var(--input-bg)',
        borderRadius: activeNodeId ? '0 0 12px 12px' : '12px',
        border: '1px solid',
        borderColor: activeNodeId ? 'var(--accent)' : 'var(--input-border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-input)',
        transition: 'border-color 0.2s',
      }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape' && activeNodeId) onClearActive();
          }}
          placeholder={activeNodeId ? 'Continue this thread…' : 'Start a new conversation…'}
          style={{
            flex: 1,
            padding: '15px 16px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          style={{
            padding: '0 20px',
            background: value.trim() ? 'var(--accent)' : 'transparent',
            border: 'none',
            color: value.trim() ? '#fff' : 'var(--text-faint)',
            cursor: value.trim() ? 'pointer' : 'default',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'background 0.15s, color 0.15s',
            flexShrink: 0,
          }}
        >
          Send ↵
        </button>
      </div>

      {/* Hint */}
      {!activeNodeId && (
        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-faint)',
          marginTop: 7,
          letterSpacing: '0.01em',
        }}>
          Press <strong style={{ color: 'var(--text-muted)' }}>Branch</strong> on any node to continue a thread · <strong style={{ color: 'var(--text-muted)' }}>Esc</strong> to deselect
        </p>
      )}
    </div>
  );
}
