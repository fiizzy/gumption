'use client';

const TOOLBAR_H = 52;

interface Props {
  nodeCount: number;
  theme: 'light' | 'dark';
  scale: number;
  onToggleTheme: () => void;
  onFitAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export { TOOLBAR_H };

export default function Toolbar({
  nodeCount, theme, scale,
  onToggleTheme, onFitAll,
  onZoomIn, onZoomOut, onZoomReset,
}: Props) {
  const pct = Math.round(scale * 100);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: TOOLBAR_H,
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--toolbar-border)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 10, zIndex: 1000, userSelect: 'none',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 18, color: 'var(--accent)', lineHeight: 1 }}>✦</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Canvas Chat
        </span>
      </div>

      <Divider />

      {/* Node count */}
      {nodeCount > 0 && (
        <span style={{
          fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--badge-bg)', padding: '2px 8px', borderRadius: 20,
          flexShrink: 0,
        }}>
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Fit view */}
      {nodeCount > 0 && (
        <button className="cc-toolbar-btn" onClick={onFitAll} title="Fit all nodes (Shift+1)">
          <FitIcon />
          Fit view
        </button>
      )}

      <Divider />

      {/* Zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          className="cc-toolbar-btn"
          onClick={onZoomOut}
          title="Zoom out (Ctrl+−)"
          style={{ padding: '5px 9px', fontSize: 16, lineHeight: 1 }}
        >
          −
        </button>

        {/* Percentage: click to reset to 100% */}
        <button
          className="cc-toolbar-btn"
          onClick={onZoomReset}
          title="Reset zoom to 100% (Ctrl+0)"
          style={{
            padding: '4px 8px', minWidth: 52, justifyContent: 'center',
            fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            color: pct !== 100 ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {pct}%
        </button>

        <button
          className="cc-toolbar-btn"
          onClick={onZoomIn}
          title="Zoom in (Ctrl+=)"
          style={{ padding: '5px 9px', fontSize: 16, lineHeight: 1 }}
        >
          +
        </button>
      </div>

      <Divider />

      {/* Theme toggle */}
      <button
        className="cc-toolbar-btn"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        style={{ padding: '5px 9px', gap: 5 }}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </div>
  );
}

// ── Tiny helpers ───────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--toolbar-border)', flexShrink: 0 }} />;
}

function FitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1.1 1.1M10.3 10.3l1.1 1.1M10.3 2.6l-1.1 1.1M3.7 10.3l-1.1 1.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9A5.5 5.5 0 0 1 5 2a5.5 5.5 0 1 0 7 7z" />
    </svg>
  );
}
