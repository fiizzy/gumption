'use client';

import { useRef, useState, useEffect } from 'react';
import { MAX_SPEED } from './joystick.constants';

// ── Layout constants ──────────────────────────────────────────
const BASE   = 88;           // outer ring diameter (px)
const THUMB  = 34;           // thumb diameter (px)
const TRAVEL = (BASE - THUMB) / 2 - 6; // max thumb displacement from centre

interface Props {
  /** Called every animation frame while the joystick is pushed.
   *  dx / dy are the pan deltas to apply (screen px, already sign-corrected). */
  onPan: (dx: number, dy: number) => void;
  /** Called once on pointerdown so the parent can cancel any running animation. */
  onStart: () => void;
}

export default function Joystick({ onPan, onStart }: Props) {
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [active,   setActive]   = useState(false);

  // All hot-path state lives in refs to avoid stale closures in the rAF loop
  const baseRef   = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const posRef    = useRef({ x: 0, y: 0 });
  const onPanRef  = useRef(onPan);
  const rafRef    = useRef(0);
  const lastT     = useRef(0);

  useEffect(() => { onPanRef.current = onPan; }, [onPan]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── rAF loop — runs while the joystick is held ───────────────
  const startLoop = () => {
    lastT.current = 0;
    const loop = (t: number) => {
      const dt   = lastT.current ? t - lastT.current : 16;
      lastT.current = t;
      const { x, y } = posRef.current;
      const dist = Math.sqrt(x * x + y * y);
      if (dist > 0.5) {
        // Quadratic scaling: fine control near centre, fast at edge
        const ratio = dist / TRAVEL;
        const speed = ratio * ratio * MAX_SPEED * (dt / 1000);
        // Negate: push right → viewport moves right → pan.x decreases
        onPanRef.current(-(x / dist) * speed, -(y / dist) * speed);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // ── Pointer handlers ─────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    activeRef.current = true;
    setActive(true);
    onStart();
    startLoop();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeRef.current || !baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > TRAVEL) { dx = (dx / dist) * TRAVEL; dy = (dy / dist) * TRAVEL; }
    posRef.current = { x: dx, y: dy };
    setThumbPos({ x: dx, y: dy });
  };

  const onPointerUp = () => {
    activeRef.current = false;
    setActive(false);
    posRef.current = { x: 0, y: 0 };
    setThumbPos({ x: 0, y: 0 });
    lastT.current = 0;
    cancelAnimationFrame(rafRef.current);
  };

  // ── Render ────────────────────────────────────────────────────
  const centreOffset = (BASE - THUMB) / 2;

  return (
    <div
      ref={baseRef}
      className="fixed bottom-8 left-8 z-[200] select-none touch-none cursor-grab"
      style={{ width: BASE, height: BASE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* ── Outer ring ── */}
      <div
        className="absolute inset-0 rounded-full border border-border"
        style={{
          background: 'var(--color-surface-overlay)',
          opacity: 0.85,
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-card)',
        }}
      />

      {/* ── Groove ring (inner guide) ── */}
      <div
        className="absolute rounded-full border border-border-subtle"
        style={{
          inset: 10,
          opacity: 0.5,
        }}
      />

      {/* ── Cardinal direction arrows ── */}
      {(['N','S','W','E'] as const).map((dir) => {
        const isNS  = dir === 'N' || dir === 'S';
        const angle = { N: 0, E: 90, S: 180, W: 270 }[dir];
        return (
          <div
            key={dir}
            className="absolute flex items-center justify-center pointer-events-none"
            style={{
              ...(dir === 'N' && { top: 5,  left: '50%', transform: 'translateX(-50%)' }),
              ...(dir === 'S' && { bottom: 5, left: '50%', transform: 'translateX(-50%)' }),
              ...(dir === 'W' && { left: 5,  top: '50%', transform: 'translateY(-50%)' }),
              ...(dir === 'E' && { right: 5, top: '50%', transform: 'translateY(-50%)' }),
            }}
          >
            <svg
              width={isNS ? 8 : 6}
              height={isNS ? 6 : 8}
              viewBox="0 0 8 6"
              fill="currentColor"
              style={{
                color: 'var(--color-foreground-subtle)',
                transform: `rotate(${angle}deg)`,
                opacity: 0.6,
              }}
            >
              <path d="M4 0L8 6H0Z" />
            </svg>
          </div>
        );
      })}

      {/* ── Thumb ── */}
      <div
        className="absolute rounded-full border pointer-events-none"
        style={{
          width: THUMB,
          height: THUMB,
          left: centreOffset,
          top:  centreOffset,
          transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`,
          transition: active ? 'none' : 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          background: active ? 'var(--color-accent)' : 'var(--color-surface-subtle)',
          borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
          boxShadow: active ? 'var(--shadow-card-active)' : 'var(--shadow-card)',
        }}
      />
    </div>
  );
}
