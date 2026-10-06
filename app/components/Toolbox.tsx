'use client';

import type { ReactNode } from 'react';
import { useViewport } from '@xyflow/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowPointer,
  faHand,
  faFont,
  faSquare,
  faCircle,
  faDiamond,
  faMinus,
  faArrowRight,
  faImage,
  faLock,
  faLockOpen,
  faExpand,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faRotateLeft,
  faRotateRight,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../lib/cn';

export type Mode =
  | 'select'
  | 'pan'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow';

export type DrawingMode = Exclude<Mode, 'select' | 'pan'>;

interface ToolDefinition {
  mode: Mode;
  label: string;
  icon: IconDefinition;
  keys: string;
  // The small number shown in the button corner, Excalidraw-style.
  numberKey?: string;
}

const NAVIGATION_TOOLS: ToolDefinition[] = [
  { mode: 'select', label: 'Select', icon: faArrowPointer, keys: 'V or 1', numberKey: '1' },
  { mode: 'pan', label: 'Pan', icon: faHand, keys: 'H, or hold Space' },
];

const DRAWING_TOOLS: ToolDefinition[] = [
  { mode: 'rectangle', label: 'Rectangle', icon: faSquare, keys: 'R or 2', numberKey: '2' },
  { mode: 'diamond', label: 'Diamond', icon: faDiamond, keys: 'D or 3', numberKey: '3' },
  { mode: 'ellipse', label: 'Ellipse', icon: faCircle, keys: 'O or 4', numberKey: '4' },
  { mode: 'arrow', label: 'Arrow', icon: faArrowRight, keys: 'A or 5', numberKey: '5' },
  { mode: 'line', label: 'Line', icon: faMinus, keys: 'L or 6', numberKey: '6' },
  { mode: 'text', label: 'Text', icon: faFont, keys: 'T or 8', numberKey: '8' },
];

const BAR_CLASS = 'fixed top-3 z-[1000] flex items-center gap-0.5 p-1 rounded-xl bg-surface-raised border border-border select-none font-sans';

interface Props {
  nodeCount: number;
  theme: 'light' | 'dark';
  mode: Mode;
  isToolLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSetMode: (mode: Mode) => void;
  onToggleToolLock: () => void;
  onInsertImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTheme: () => void;
  onFitAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  menuSlot: ReactNode;
}

export default function Toolbox({
  nodeCount,
  theme,
  mode,
  isToolLocked,
  canUndo,
  canRedo,
  onSetMode,
  onToggleToolLock,
  onInsertImage,
  onUndo,
  onRedo,
  onToggleTheme,
  onFitAll,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  menuSlot,
}: Props) {
  return (
    <>
      {/* Top-center: lock + navigation + drawing tools */}
      <div role="toolbar" aria-label="Tools" className={cn(BAR_CLASS, 'left-1/2 -translate-x-1/2')}>
        <IconButton
          title="Keep selected tool active after drawing — Q"
          isActive={isToolLocked}
          onClick={onToggleToolLock}
        >
          <FontAwesomeIcon icon={isToolLocked ? faLock : faLockOpen} className="w-3 h-3" />
        </IconButton>
        <Divider />
        {NAVIGATION_TOOLS.map((tool) => (
          <ToolButton key={tool.mode} tool={tool} isActive={mode === tool.mode} onSelect={onSetMode} />
        ))}
        <Divider />
        {DRAWING_TOOLS.map((tool) => (
          <ToolButton key={tool.mode} tool={tool} isActive={mode === tool.mode} onSelect={onSetMode} />
        ))}
        <IconButton title="Insert image — 9" onClick={onInsertImage} numberKey="9">
          <FontAwesomeIcon icon={faImage} className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      {/* Top-right: history, view, theme, settings, menu */}
      <div className={cn(BAR_CLASS, 'right-3')}>
        <IconButton title="Undo (Ctrl+Z)" isDisabled={!canUndo} onClick={onUndo}>
          <FontAwesomeIcon icon={faRotateLeft} className="w-3 h-3" />
        </IconButton>
        <IconButton title="Redo (Ctrl+Shift+Z)" isDisabled={!canRedo} onClick={onRedo}>
          <FontAwesomeIcon icon={faRotateRight} className="w-3 h-3" />
        </IconButton>
        <Divider />
        <IconButton title="Zoom out (Ctrl+−)" onClick={onZoomOut}>
          <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-3 h-3" />
        </IconButton>
        <ZoomResetButton onZoomReset={onZoomReset} />
        <IconButton title="Zoom in (Ctrl+=)" onClick={onZoomIn}>
          <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-3 h-3" />
        </IconButton>
        <IconButton title="Fit all elements (Shift+1)" isDisabled={nodeCount === 0} onClick={onFitAll}>
          <FontAwesomeIcon icon={faExpand} className="w-3 h-3" />
        </IconButton>
        <Divider />
        <IconButton title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={onToggleTheme}>
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} className="w-3.5 h-3.5" />
        </IconButton>
        {menuSlot}
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

// Shared look for every square toolbar button — also used by the settings
// and main-menu triggers so the whole bar stays uniform.
export const TOOLBAR_ICON_BUTTON_CLASS =
  'relative inline-flex items-center justify-center w-8 h-8 rounded-lg border-none transition-colors duration-150 shrink-0';

export function toolbarIconButtonStateClass(isActive: boolean, isDisabled = false): string {
  if (isDisabled) return 'bg-transparent text-foreground-muted opacity-35 cursor-default';
  return isActive
    ? 'bg-accent text-white cursor-pointer'
    : 'bg-transparent text-foreground-muted hover:bg-surface-subtle hover:text-foreground cursor-pointer';
}

// The only part of the toolbar that depends on the viewport — isolated so
// panning/zooming re-renders this button rather than the whole canvas UI.
function ZoomResetButton({ onZoomReset }: { onZoomReset: () => void }) {
  const zoomPercentage = Math.round(useViewport().zoom * 100);
  return (
    <button
      onClick={onZoomReset}
      title="Reset zoom (Ctrl+0)"
      aria-label="Reset zoom (Ctrl+0)"
      className={cn(
        'h-8 min-w-[46px] px-1.5 rounded-lg border-none bg-transparent cursor-pointer text-[11.5px] font-semibold tabular-nums transition-colors',
        'hover:bg-surface-subtle',
        zoomPercentage !== 100 ? 'text-accent' : 'text-foreground-muted hover:text-foreground',
      )}
    >
      {zoomPercentage}%
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 mx-1 bg-border shrink-0" />;
}

function ToolButton({
  tool,
  isActive,
  onSelect,
}: {
  tool: ToolDefinition;
  isActive: boolean;
  onSelect: (mode: Mode) => void;
}) {
  return (
    <IconButton
      title={`${tool.label} — ${tool.keys}`}
      isActive={isActive}
      onClick={() => onSelect(tool.mode)}
      numberKey={tool.numberKey}
    >
      <FontAwesomeIcon icon={tool.icon} className="w-3.5 h-3.5" />
    </IconButton>
  );
}

function IconButton({
  children,
  title,
  onClick,
  isActive = false,
  isDisabled = false,
  numberKey,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  numberKey?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      disabled={isDisabled}
      className={cn(TOOLBAR_ICON_BUTTON_CLASS, toolbarIconButtonStateClass(isActive, isDisabled))}
    >
      {children}
      {numberKey && (
        <span className="absolute bottom-0.5 right-1 text-[8px] leading-none font-semibold opacity-50">{numberKey}</span>
      )}
    </button>
  );
}
