'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowPointer,
  faHand,
  faFont,
  faSquare,
  faCircle,
  faExpand,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';

export const TOOLBAR_H = 52;
export const SIDEBAR_EXPANDED_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 48;

export type Mode = 'select' | 'pan' | 'text' | 'shape-square' | 'shape-circle';

interface Props {
  nodeCount: number;
  theme: 'light' | 'dark';
  scale: number;
  mode: Mode;
  isProjectsSidebarCollapsed: boolean;
  onSetMode: (mode: Mode) => void;
  onToggleTheme: () => void;
  onFitAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export default function Toolbar({ nodeCount, theme, scale, mode, isProjectsSidebarCollapsed, onSetMode, onToggleTheme, onFitAll, onZoomIn, onZoomOut, onZoomReset }: Props) {
  const pct = Math.round(scale * 100);
  const sidebarWidth = isProjectsSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  return (
    <div
      style={{ height: TOOLBAR_H, left: sidebarWidth }}
      className="fixed top-0 right-0 z-[1000] flex items-center gap-3 px-4
                 bg-surface-raised border-b border-border select-none font-sans
                 transition-[left] duration-200 ease-in-out"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-lg text-accent leading-none">&#10038;</span>
        <span className="text-sm font-semibold text-foreground tracking-tight">Canvas Chat</span>
      </div>

      <Divider />

      {/* Mode toggle: select vs pan */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-subtle border border-border shrink-0">
        <ModeBtn active={mode === 'select'} onClick={() => onSetMode('select')}
                 title="Select (Press Tab to switch or hold Space to activate)">
          <FontAwesomeIcon icon={faArrowPointer} className="w-3.5 h-3.5" />
        </ModeBtn>
        <ModeBtn active={mode === 'pan'} onClick={() => onSetMode('pan')}
                 title="Pan (Press Tab to switch or hold Space to activate)">
          <FontAwesomeIcon icon={faHand} className="w-3.5 h-3.5" />
        </ModeBtn>
      </div>

      <Divider />

      {/* Draw tools: text + shapes — centered in the navbar */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5 p-0.5
                       rounded-lg bg-surface-subtle border border-border shrink-0">
        <ModeBtn active={mode === 'text'} onClick={() => onSetMode('text')} title="Text">
          <FontAwesomeIcon icon={faFont} className="w-3.5 h-3.5" />
        </ModeBtn>
        <ModeBtn active={mode === 'shape-square'} onClick={() => onSetMode('shape-square')} title="Square">
          <FontAwesomeIcon icon={faSquare} className="w-3.5 h-3.5" />
        </ModeBtn>
        <ModeBtn active={mode === 'shape-circle'} onClick={() => onSetMode('shape-circle')} title="Circle">
          <FontAwesomeIcon icon={faCircle} className="w-3.5 h-3.5" />
        </ModeBtn>
      </div>

      {/* Node count */}
      {nodeCount > 0 && (
        <span className="text-xs text-foreground-muted bg-surface-subtle px-2.5 py-0.5 rounded-full shrink-0">
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        </span>
      )}

      <div className="flex-1" />

      {/* Fit view */}
      {nodeCount > 0 && (
        <TBtn onClick={onFitAll} title="Fit all nodes">
          <FontAwesomeIcon icon={faExpand} className="w-3 h-3" /> Fit view
        </TBtn>
      )}

      <Divider />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <TBtn onClick={onZoomOut} title="Zoom out (Ctrl+−)" className="px-2.5">
          <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-3 h-3" />
        </TBtn>

        <TBtn
          onClick={onZoomReset}
          title="Reset zoom (Ctrl+0)"
          className={`min-w-[52px] justify-center text-xs font-semibold tabular-nums ${pct !== 100 ? 'text-accent' : ''}`}
        >
          {pct}%
        </TBtn>

        <TBtn onClick={onZoomIn} title="Zoom in (Ctrl+=)" className="px-2.5">
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-3 h-3" />
        </TBtn>
      </div>

      <Divider />

      {/* Theme toggle */}
      <TBtn onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className="gap-1.5">
        <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} className="w-3.5 h-3.5" />
        {theme === 'dark' ? 'Light' : 'Dark'}
      </TBtn>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function Divider() {
  return <div className="w-px h-[18px] bg-border shrink-0" />;
}

function ModeBtn({ children, active, onClick, title }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border-none
                  transition-colors duration-150 cursor-pointer shrink-0
                  ${active
                    ? 'bg-accent text-white shadow-[0_1px_4px_rgba(94,106,210,0.5)]'
                    : 'bg-transparent text-foreground-muted hover:bg-surface hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function TBtn({ children, onClick, title, className = '' }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm
                  text-foreground-muted bg-transparent border border-transparent
                  hover:bg-surface-subtle hover:text-foreground hover:border-border
                  transition-colors duration-150 cursor-pointer shrink-0 font-sans ${className}`}
    >
      {children}
    </button>
  );
}
