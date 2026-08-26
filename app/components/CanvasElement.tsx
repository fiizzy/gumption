'use client';

import { useRef, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { CanvasElementData } from '../types';
import { TOOLBAR_H } from './Toolbar';
import { DEFAULT_COLOR, SWATCHES } from './ConversationNode';
import { cn } from '../lib/cn';

const SHAPE_SIZE = 140;
const TEXT_MIN_WIDTH = 160;
const TEXT_MAX_WIDTH = 340;

interface Props {
  element: CanvasElementData;
  panX: number;
  panY: number;
  scale: number;
  isSelected: boolean;
  selectedCount: number;
  autoEdit?: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onGroupDragStart: () => void;
  onGroupMove: (dx: number, dy: number) => void;
  onTextChange: (text: string) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onDimsChange: (w: number, h: number) => void;
}

export default function CanvasElement({
  element, panX, panY, scale, isSelected, selectedCount, autoEdit,
  onSelect, onMove, onGroupDragStart, onGroupMove, onTextChange, onColorChange, onDelete, onDimsChange,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartClient = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);

  const [isEditing, setIsEditing] = useState(!!autoEdit && element.type === 'text');
  const [showColors, setShowColors] = useState(false);

  // Refs to avoid stale closures in global listeners
  const panRef = useRef({ x: panX, y: panY });
  const scaleRef = useRef(scale);
  const onMoveRef = useRef(onMove);
  const onGroupDragStartRef = useRef(onGroupDragStart);
  const onGroupMoveRef = useRef(onGroupMove);
  const elementRef = useRef(element);
  const isSelectedRef = useRef(isSelected);
  const selectedCountRef = useRef(selectedCount);

  useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onGroupDragStartRef.current = onGroupDragStart; }, [onGroupDragStart]);
  useEffect(() => { onGroupMoveRef.current = onGroupMove; }, [onGroupMove]);
  useEffect(() => { elementRef.current = element; }, [element]);
  useEffect(() => { isSelectedRef.current = isSelected; }, [isSelected]);
  useEffect(() => { selectedCountRef.current = selectedCount; }, [selectedCount]);

  // Report layout dimensions to the parent (shared dims map, used for
  // selection-rect hit-testing — same mechanism conversation nodes use).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (boxRef.current) onDimsChange(boxRef.current.offsetWidth, boxRef.current.offsetHeight);
    });
    obs.observe(el);
    onDimsChange(el.offsetWidth, el.offsetHeight);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus + place caret when entering edit mode
  useEffect(() => {
    if (!isEditing) return;
    const el = textRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isEditing]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (!hasDragged.current) {
        const dx = e.clientX - dragStartClient.current.x;
        const dy = e.clientY - dragStartClient.current.y;
        if (Math.hypot(dx, dy) > 4) hasDragged.current = true;
      }
      const s = scaleRef.current, p = panRef.current;
      if (isSelectedRef.current && selectedCountRef.current > 1) {
        const dx = (e.clientX - dragStartMouse.current.x) / s;
        const dy = (e.clientY - TOOLBAR_H - dragStartMouse.current.y) / s;
        onGroupMoveRef.current(dx, dy);
      } else {
        onMoveRef.current(
          (e.clientX - dragOffset.current.x - p.x) / s,
          (e.clientY - TOOLBAR_H - dragOffset.current.y - p.y) / s,
        );
      }
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if (isEditing) return; // let clicks place the caret instead of dragging
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    isDragging.current = true;
    hasDragged.current = false;
    dragStartClient.current = { x: e.clientX, y: e.clientY };
    const el = elementRef.current, s = scaleRef.current, p = panRef.current;
    if (isSelectedRef.current && selectedCountRef.current > 1) {
      dragStartMouse.current = { x: e.clientX, y: e.clientY - TOOLBAR_H };
      onGroupDragStartRef.current();
    } else {
      dragOffset.current = {
        x: e.clientX - (el.x * s + p.x),
        y: e.clientY - TOOLBAR_H - (el.y * s + p.y),
      };
    }
  };

  const hasTint = element.color !== DEFAULT_COLOR;
  const isShape = element.type === 'shape';

  return (
    <div
      ref={boxRef}
      onMouseDown={startDrag}
      onDoubleClick={(e) => {
        if (element.type !== 'text') return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        userSelect: isEditing ? 'text' : 'none',
        cursor: isShape ? undefined : isEditing ? 'text' : 'grab',
        ...(isShape
          ? {
              width: SHAPE_SIZE,
              height: SHAPE_SIZE,
              background: hasTint ? element.color : 'var(--color-surface-overlay)',
              borderRadius: element.shapeKind === 'circle' ? '9999px' : 12,
            }
          : { minWidth: TEXT_MIN_WIDTH, maxWidth: TEXT_MAX_WIDTH }),
      }}
      className={cn(
        'animate-node-in pointer-events-auto font-sans',
        isShape && 'border cursor-grab active:cursor-grabbing',
        isShape && (isSelected ? 'border-accent z-20 shadow-card-active' : 'border-border z-[5] shadow-card'),
        !isShape && 'rounded-md',
        !isShape && isSelected && 'outline outline-2 outline-accent outline-offset-4 z-20',
        !isShape && !isSelected && 'z-[5]',
      )}
    >
      <div
        ref={textRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onInput={(e) => onTextChange(e.currentTarget.textContent ?? '')}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.currentTarget.blur(); }
          e.stopPropagation();
        }}
        onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
        style={{
          color: !isShape ? (hasTint ? element.color : 'var(--color-foreground)') : undefined,
          padding: isShape ? undefined : '6px 2px',
        }}
        className={cn(
          'outline-none whitespace-pre-wrap break-words text-[16px] leading-snug',
          !isShape && "empty:before:content-['Type_something…'] empty:before:text-foreground-subtle empty:before:pointer-events-none",
          isShape && 'w-full h-full',
        )}
      >
        {element.text}
      </div>

      {/* Floating action chip — color + delete, shown when selected */}
      {isSelected && !isEditing && (
        <div
          className="absolute -top-9 left-0 flex items-center gap-1 px-1 py-1 rounded-lg
                     bg-surface-overlay border border-border shadow-card z-30"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowColors((s) => !s)}
            title="Color"
            className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer"
          >
            <span
              className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
              style={{ background: element.color, border: '1.5px solid rgba(0,0,0,0.15)' }}
            />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent
                       text-foreground-muted hover:text-foreground hover:bg-surface-subtle cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        </div>
      )}

      {isSelected && showColors && !isEditing && (
        <div
          className="absolute -top-[74px] left-0 flex gap-1.5 p-2 rounded-lg flex-wrap w-[168px]
                     bg-surface-overlay border border-border shadow-card z-30"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {SWATCHES.map(({ label, value }) => (
            <button
              key={value}
              title={label}
              onClick={() => { onColorChange(value); setShowColors(false); }}
              className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 transition-transform hover:scale-125"
              style={{
                background: value,
                outline: element.color === value ? '2px solid var(--color-accent)' : '1.5px solid rgba(0,0,0,0.15)',
                outlineOffset: element.color === value ? '2px' : '0',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
