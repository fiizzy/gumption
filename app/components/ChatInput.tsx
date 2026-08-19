'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  activeNodeId: string | null;
  activeNodePrompt?: string;
  onSubmit: (prompt: string) => void;
  onClearActive: () => void;
}

export default function ChatInput({
  activeNodeId,
  activeNodePrompt,
  onSubmit,
  onClearActive,
}: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeNodeId) inputRef.current?.focus();
  }, [activeNodeId]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 620,
        maxWidth: 'calc(100vw - 40px)',
        zIndex: 200,
        filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.6))',
      }}
    >
      {activeNodeId && (
        <div
          style={{
            background: '#1e3a5f',
            borderRadius: '10px 10px 0 0',
            padding: '6px 14px',
            fontSize: 12,
            color: '#93c5fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Branching from:{' '}
            <em style={{ color: '#bfdbfe' }}>
              &ldquo;{activeNodePrompt?.slice(0, 60)}{(activeNodePrompt?.length ?? 0) > 60 ? '…' : ''}&rdquo;
            </em>
          </span>
          <button
            onClick={onClearActive}
            style={{
              background: 'none',
              border: 'none',
              color: '#60a5fa',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 2px',
              flexShrink: 0,
            }}
            title="Cancel branch"
          >
            ×
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          background: '#1e293b',
          borderRadius: activeNodeId ? '0 0 14px 14px' : '14px',
          border: activeNodeId ? '2px solid #3b82f6' : '1px solid #334155',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={activeNodeId ? 'Branch the conversation…' : 'Start a new conversation…'}
          style={{
            flex: 1,
            padding: '16px 18px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          style={{
            padding: '0 22px',
            background: value.trim() ? '#3b82f6' : '#1e3a5f',
            border: 'none',
            color: value.trim() ? '#fff' : '#475569',
            cursor: value.trim() ? 'pointer' : 'default',
            fontSize: 14,
            fontWeight: 600,
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>

      {!activeNodeId && (
        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: '#475569',
            marginTop: 6,
          }}
        >
          Press <kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: 4, border: '1px solid #334155' }}>Branch</kbd> on any node to continue a thread
        </p>
      )}
    </div>
  );
}
