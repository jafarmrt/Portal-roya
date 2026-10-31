import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { THEME_EFFECT_MS, type ThemeEffect as Effect } from '../../lib/dayTheme';

// A light decoration drawn over the page for about a minute: petals, leaves, snow and so on drift
// across the screen without catching the mouse. Shapes are drawn on a canvas; a few emoji are mixed in.

type Shape = 'petal' | 'leaf' | 'seed' | 'flake' | 'confetti' | 'spark' | 'mote';

interface Spec {
  shapes: Shape[];
  colors: string[];
  glyphs: string[];
  /** Share of emoji among the pieces. */
  glyphShare: number;
  /** Pieces on screen at once. */
  count: number;
  /** Pixels per second; negative rises. */
  speed: [number, number];
  size: [number, number];
}

const SPECS: Record<Effect, Spec> = {
  blossoms: { shapes: ['petal'], colors: ['#F9A8D4', '#FBCFE8', '#F472B6', '#FDE2E4', '#FFFFFF'], glyphs: ['🌸', '🌼'], glyphShare: 0.15, count: 38, speed: [35, 70], size: [9, 16] },
  summer: { shapes: ['mote'], colors: ['#FCD34D', '#FBBF24', '#FDE68A'], glyphs: ['🌻', '🦋', '🍉', '☀️'], glyphShare: 0.35, count: 26, speed: [-45, -22], size: [6, 12] },
  leaves: { shapes: ['leaf'], colors: ['#D97706', '#B45309', '#EA580C', '#CA8A04', '#9A3412'], glyphs: ['🍁', '🍂'], glyphShare: 0.3, count: 32, speed: [40, 80], size: [12, 20] },
  yalda: { shapes: ['seed'], colors: ['#B91C1C', '#DC2626', '#991B1B', '#E11D48'], glyphs: ['🍉', '✨', '🕯️'], glyphShare: 0.18, count: 40, speed: [45, 85], size: [6, 10] },
  snow: { shapes: ['flake'], colors: ['#BFDBFE', '#DBEAFE', '#93C5FD', '#E0F2FE'], glyphs: ['❄️'], glyphShare: 0.15, count: 55, speed: [25, 55], size: [4, 9] },
  confetti: { shapes: ['confetti'], colors: ['#DC2626', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'], glyphs: ['🎉'], glyphShare: 0.05, count: 60, speed: [70, 130], size: [6, 11] },
  lights: { shapes: ['spark'], colors: ['#FBBF24', '#FDE68A', '#F59E0B', '#FFFFFF'], glyphs: ['✨'], glyphShare: 0.2, count: 34, speed: [-35, -15], size: [5, 10] },
};

interface Piece {
  x: number;
  y: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  phase: number;
  sway: number;
  color: string;
  shape: Shape;
  glyph: string | null;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const FADE_MS = 6_000;

function makePiece(spec: Spec, width: number, height: number, anywhere: boolean): Piece {
  const vy = rand(...spec.speed);
  const size = rand(...spec.size);
  const glyph = Math.random() < spec.glyphShare ? pick(spec.glyphs) : null;
  return {
    x: rand(0, width),
    // New pieces enter from the edge they move away from; the first ones are spread over the screen.
    y: anywhere ? rand(0, height) : vy > 0 ? -30 : height + 30,
    vy,
    size: glyph ? size + 10 : size,
    rot: rand(0, Math.PI * 2),
    vrot: rand(-1.5, 1.5),
    phase: rand(0, Math.PI * 2),
    sway: rand(15, 45),
    color: pick(spec.colors),
    shape: pick(spec.shapes),
    glyph,
  };
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, t: number) {
  const x = p.x + Math.sin(t / 1000 + p.phase) * p.sway;
  ctx.save();
  ctx.translate(x, p.y);
  ctx.rotate(p.rot);
  if (p.glyph) {
    ctx.font = `${p.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph, 0, 0);
    ctx.restore();
    return;
  }
  const s = p.size;
  ctx.fillStyle = p.color;
  switch (p.shape) {
    case 'petal':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.45, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.8, 0, 0, s);
      ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 40, 10, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.stroke();
      break;
    case 'seed':
      // A pomegranate seed: a rounded drop with a highlight.
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.6, s * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-s * 0.2, -s * 0.3, s * 0.15, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flake':
      ctx.shadowColor = 'rgba(59, 130, 246, 0.35)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'confetti':
      ctx.fillRect(-s / 2, -s / 4, s, s / 2);
      break;
    case 'spark':
    case 'mote': {
      // A soft glowing star that twinkles.
      ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t / 300 + p.phase);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = s * 1.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? s : s * 0.35;
        const a = (i * Math.PI) / 4;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Plays the effect over the whole window, then calls onDone; the button stops it at once. */
export const ThemeEffect: React.FC<{ effect: Effect; onDone: () => void; durationMs?: number }> = ({ effect, onDone, durationMs = THEME_EFFECT_MS }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      doneRef.current();
      return;
    }
    const spec = SPECS[effect];
    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let pieces = Array.from({ length: spec.count }, () => makePiece(spec, width, height, true));
    // Time only runs while the page is in view, so a hidden tab does not use up the minute.
    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      elapsed += dt;
      if (elapsed >= durationMs) {
        doneRef.current();
        return;
      }
      const fading = elapsed > durationMs - FADE_MS;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = fading ? Math.max(0, (durationMs - elapsed) / FADE_MS) : Math.min(1, elapsed / 800);
      pieces = pieces.flatMap((p) => {
        p.y += (p.vy * dt) / 1000;
        p.rot += (p.vrot * dt) / 1000;
        const gone = p.vy > 0 ? p.y > height + 40 : p.y < -40;
        if (!gone) return [p];
        // Pieces that leave the screen come back while it plays, and stop coming as it fades.
        return fading ? [] : [makePiece(spec, width, height, false)];
      });
      for (const p of pieces) drawPiece(ctx, p, elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [effect, durationMs]);

  return createPortal(
    <>
      <canvas ref={canvasRef} aria-hidden data-testid="theme-effect" className="fixed inset-0 w-screen h-screen pointer-events-none z-[55]" />
      <button
        type="button"
        onClick={() => doneRef.current()}
        className="fixed bottom-5 left-5 z-[56] flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/90 border border-line shadow-md text-xs font-bold text-ink-soft hover:bg-white"
      >
        <X className="w-3.5 h-3.5" />
        توقف افکت
      </button>
    </>,
    document.body,
  );
};
