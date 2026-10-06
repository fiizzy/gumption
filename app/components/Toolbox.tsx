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
      {/* Top-center floating toolbox: lock + navigation + drawing tools */}
      <div
        role="toolbar"
        aria-label="Tools"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2
                   px-3 py-2 rounded-2xl bg-surface-raised border border-border shadow-card
                   select-none font-sans"
      >
        <ModeButton
          isActive={isToolLocked}
          onClick={onToggleToolLock}
          title="Keep selected tool active after drawing — Q"
        >
          <FontAwesomeIcon icon={isToolLocked ? faLock : faLockOpen} className="w-3 h-3" />
        </ModeButton>

        <Divider />

        <ToolGroup>
          {NAVIGATION_TOOLS.map((tool) => (
            <ToolButton key={tool.mode} tool={tool} isActive={mode === tool.mode} onSelect={onSetMode} />
          ))}
        </ToolGroup>

        <Divider />

        <ToolGroup>
          {DRAWING_TOOLS.map((tool) => (
            <ToolButton key={tool.mode} tool={tool} isActive={mode === tool.mode} onSelect={onSetMode} />
          ))}
          <ModeButton isActive={false} onClick={onInsertImage} title="Insert image — 9" numberKey="9">
            <FontAwesomeIcon icon={faImage} className="w-3.5 h-3.5" />
          </ModeButton>
        </ToolGroup>
      </div>

      {/* Top-right floating cluster: history, fit view, zoom, theme, menu */}
      <div
        className="fixed top-4 right-4 z-[1000] flex items-center gap-2
                   px-3 py-2 rounded-2xl bg-surface-raised border border-border shadow-card
                   select-none font-sans"
      >
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={onUndo} title="Undo (Ctrl+Z)" isDisabled={!canUndo} className="px-2.5">
            <FontAwesomeIcon icon={faRotateLeft} className="w-3 h-3" />
          </ToolbarButton>
          <ToolbarButton onClick={onRedo} title="Redo (Ctrl+Shift+Z)" isDisabled={!canRedo} className="px-2.5">
            <FontAwesomeIcon icon={faRotateRight} className="w-3 h-3" />
          </ToolbarButton>
        </div>

        <Divider />

        {nodeCount > 0 && (
          <>
            <ToolbarButton onClick={onFitAll} title="Fit all elements (Shift+1)">
              <FontAwesomeIcon icon={faExpand} className="w-3 h-3" /> Fit
            </ToolbarButton>
            <Divider />
          </>
        )}

        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={onZoomOut} title="Zoom out (Ctrl+−)" className="px-2.5">
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-3 h-3" />
          </ToolbarButton>
          <ZoomResetButton onZoomReset={onZoomReset} />
          <ToolbarButton onClick={onZoomIn} title="Zoom in (Ctrl+=)" className="px-2.5">
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-3 h-3" />
          </ToolbarButton>
        </div>

        <Divider />

        <ToolbarButton
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="px-2.5"
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} className="w-3.5 h-3.5" />
        </ToolbarButton>

        {menuSlot}
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

// The only part of the toolbox that depends on the viewport — isolated so
// panning/zooming re-renders this button rather than the whole canvas UI.
function ZoomResetButton({ onZoomReset }: { onZoomReset: () => void }) {
  const zoomPercentage = Math.round(useViewport().zoom * 100);
  return (
    <ToolbarButton
      onClick={onZoomReset}
      title="Reset zoom (Ctrl+0)"
      className={cn(
        'min-w-[52px] justify-center text-xs font-semibold tabular-nums',
        zoomPercentage !== 100 && 'text-accent',
      )}
    >
      {zoomPercentage}%
    </ToolbarButton>
  );
}

function Divider() {
  return <div className="w-px h-[18px] bg-border shrink-0" />;
}

function ToolGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-subtle border border-border shrink-0">
      {children}
    </div>
  );
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
    <ModeButton
      isActive={isActive}
      onClick={() => onSelect(tool.mode)}
      title={`${tool.label} — ${tool.keys}`}
      numberKey={tool.numberKey}
    >
      <FontAwesomeIcon icon={tool.icon} className="w-3.5 h-3.5" />
    </ModeButton>
  );
}

function ModeButton({
  children,
  isActive,
  onClick,
  title,
  numberKey,
}: {
  children: ReactNode;
  isActive: boolean;
  onClick: () => void;
  title: string;
  numberKey?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn(
        'relative inline-flex items-center justify-center w-8 h-8 rounded-md border-none',
        'transition-colors duration-150 cursor-pointer shrink-0',
        isActive
          ? 'bg-accent text-white shadow-card'
          : 'bg-transparent text-foreground-muted hover:bg-surface hover:text-foreground',
      )}
    >
      {children}
      {numberKey && (
        <span className="absolute bottom-0 right-0.5 text-[8.5px] leading-none font-semibold opacity-60">
          {numberKey}
        </span>
      )}
    </button>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  isDisabled = false,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  isDisabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm',
        'text-foreground-muted bg-transparent border border-transparent',
        'transition-colors duration-150 shrink-0 font-sans',
        isDisabled
          ? 'opacity-40 cursor-default'
          : 'cursor-pointer hover:bg-surface-subtle hover:text-foreground hover:border-border',
        className,
      )}
    >
      {children}
    </button>
  );
}
