"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { cn } from "../lib/cn";

const FOCUS_ATTEMPTS = 5;
// contentEditable inserts non-breaking spaces for typed spaces in some
// positions; stored text should only ever contain regular ones.
const NON_BREAKING_SPACE_PATTERN = /\u00a0/g;

interface Props {
  text: string;
  isEditing: boolean;
  placeholder?: string;
  onChange: (text: string) => void;
  onStopEditing: () => void;
  className?: string;
  style?: CSSProperties;
}

// Text that becomes an in-place plain-text editor while `isEditing`.
//
// While editing, the div's children are deliberately left out of the JSX so
// React never re-renders its text on every keystroke — a React-controlled
// contentEditable resets the caret to the start on each render, which made
// typed text build up back-to-front. The DOM owns the content while editing
// and onInput mirrors it up; once editing ends React renders the string
// child again, which it applies as a single textContent replacement.
export default function EditableText({
  text,
  isEditing,
  placeholder,
  onChange,
  onStopEditing,
  className,
  style,
}: Props) {
  const editableRef = useRef<HTMLDivElement>(null);

  // Focus is re-asserted for a few frames: the edit often starts from the
  // same click/double-click that xyflow is still handling, and its
  // selection logic can pull focus back to the pane a frame or two later.
  useEffect(() => {
    if (!isEditing) return;
    const editableElement = editableRef.current;
    if (!editableElement) return;
    editableElement.textContent = text;

    const placeCaretAtEnd = () => {
      editableElement.focus();
      const range = document.createRange();
      range.selectNodeContents(editableElement);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    placeCaretAtEnd();
    let attemptsLeft = FOCUS_ATTEMPTS;
    let frame = requestAnimationFrame(function tryFocus() {
      placeCaretAtEnd();
      attemptsLeft -= 1;
      if (attemptsLeft > 0 && document.activeElement !== editableElement) {
        frame = requestAnimationFrame(tryFocus);
      }
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  return (
    <div
      ref={editableRef}
      contentEditable={isEditing ? "plaintext-only" : false}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(event) => onChange(event.currentTarget.innerText.replace(NON_BREAKING_SPACE_PATTERN, " "))}
      onBlur={() => {
        if (isEditing) onStopEditing();
      }}
      onKeyDown={(event) => {
        if (!isEditing) return;
        event.stopPropagation();
        if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onMouseDown={(event) => {
        if (isEditing) event.stopPropagation();
      }}
      className={cn(
        "outline-none whitespace-pre-wrap break-words",
        isEditing && "nodrag nopan nowheel cursor-text select-text",
        placeholder && "empty:before:content-[attr(data-placeholder)] empty:before:text-foreground-subtle empty:before:pointer-events-none",
        className,
      )}
      style={style}
    >
      {isEditing ? undefined : text}
    </div>
  );
}
