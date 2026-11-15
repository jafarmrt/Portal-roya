import React, { useId, useRef } from 'react';
import { toPersianDigits } from '../../lib/jalali';
import type { EffectsLevel } from './effects';

// «سکهٔ سپاس»: gold, with an eight-pointed shamseh, readable from the size of a pinhead to the size of
// a seal. Drawn here once and used flat (lists, badges), in 3D (the seal of an envelope) and as the
// stacks of the month's wallet.

const STAR = 'M50 22 58.2 30.2 69.8 30.2 69.8 41.8 78 50 69.8 58.2 69.8 69.8 58.2 69.8 50 78 41.8 69.8 30.2 69.8 30.2 58.2 22 50 30.2 41.8 30.2 30.2 41.8 30.2Z';

/** One face of the coin. `plain` leaves the star out (the back). */
export const CoinFace: React.FC<{ plain?: boolean; className?: string }> = ({ plain, className = '' }) => {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={`sp-coin-face ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}g`} cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="#fff6d2" />
          <stop offset="0.45" stopColor="#f6d36b" />
          <stop offset="0.82" stopColor="#dea92b" />
          <stop offset="1" stopColor="#b98718" />
        </radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9dc85" />
          <stop offset="1" stopColor="#c8941d" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48.5" fill={`url(#${id}g)`} stroke="#a9790f" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="42.5" fill="none" stroke="#7a5407" strokeOpacity="0.4" strokeWidth="1.6" />
      <circle cx="50" cy="50" r="44.4" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
      {/* The beaded rim */}
      <circle cx="50" cy="50" r="46.4" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="0.1 6.2" strokeLinecap="round" />
      {plain ? (
        <>
          <circle cx="50" cy="50" r="27" fill="none" stroke="#7a5407" strokeOpacity="0.35" strokeWidth="2" />
          <circle cx="50" cy="50" r="19" fill={`url(#${id}s)`} stroke="#8a620b" strokeWidth="1" />
        </>
      ) : (
        <>
          {/* The shamseh, pressed into the gold: a shadow below it, a light above. */}
          <path d={STAR} transform="translate(1.2 1.4)" fill="#7a5407" fillOpacity="0.35" />
          <path d={STAR} transform="translate(-0.8 -0.9)" fill="#fff" fillOpacity="0.55" />
          <path d={STAR} fill={`url(#${id}s)`} stroke="#8a620b" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="50" cy="50" r="11.5" fill={`url(#${id}g)`} stroke="#8a620b" strokeWidth="1" />
          <circle cx="50" cy="50" r="4.2" fill="#a9790f" fillOpacity="0.55" />
        </>
      )}
    </svg>
  );
};

/** The coin with two faces and an edge, standing in space. `turning` lets it turn slowly while it waits. */
export const Coin3D: React.FC<{ size?: number; turning?: boolean; className?: string }> = ({ size = 64, turning, className = '' }) => {
  const slices = 9;
  const thick = size * 0.1;
  return (
    <span className={`sp-coin3d ${turning ? 'is-turning' : ''} ${className}`} style={{ '--sp-size': `${size}px` } as React.CSSProperties} aria-hidden="true">
      <span className="sp-coin3d-body">
        {Array.from({ length: slices }, (_, i) => (
          <i key={i} style={{ transform: `translateZ(${(i / (slices - 1) - 0.5) * thick}px)` }} />
        ))}
        <span className="sp-coin3d-face sp-coin3d-front">
          <CoinFace />
          <span className="sp-coin-shine" />
        </span>
        <span className="sp-coin3d-face sp-coin3d-back">
          <CoinFace plain />
        </span>
      </span>
    </span>
  );
};

const PER_STACK = 10;
const MAX_STACKS = 10;

/**
 * The month's wallet as stacks of ten coins: what is left stands, what was given is gone, and the
 * coins of the amount being chosen lift off the last stack. With a very large allowance one coin on
 * screen stands for a few. On a computer the stacks are real 3D and turn a little with the mouse.
 */
export const CoinTray: React.FC<{
  allowance: number;
  left: number;
  /** Coins about to be given: lifted and glowing. */
  picked?: number;
  size?: 'sm' | 'md';
  fx: EffectsLevel;
  /** Plays the coins dropping in. */
  filling?: boolean;
  className?: string;
}> = ({ allowance, left, picked = 0, size = 'sm', fx, filling, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const unit = Math.max(1, Math.ceil(allowance / (PER_STACK * MAX_STACKS)));
  const stacks = Math.min(MAX_STACKS, Math.max(1, Math.ceil(allowance / unit / PER_STACK)));
  const standing = Math.min(stacks * PER_STACK, Math.ceil(left / unit));
  const lifted = Math.min(standing, picked > 0 ? Math.max(1, Math.round(picked / unit)) : 0);

  const onMove = (e: React.PointerEvent) => {
    if (fx !== 'full' || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    ref.current.style.setProperty('--sp-rz', `${(-9 + x * 26).toFixed(1)}deg`);
  };
  const onLeave = () => ref.current?.style.removeProperty('--sp-rz');

  return (
    <div
      ref={ref}
      className={`sp-tray is-3d ${filling ? 'is-filling' : ''} ${className}`}
      data-size={size}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      role="img"
      aria-label={`${toPersianDigits(left)} سکه از ${toPersianDigits(allowance)} سکهٔ این ماه مانده است`}
    >
      <div className="sp-tray-floor">
        {Array.from({ length: stacks }, (_, s) => {
          const count = Math.max(0, Math.min(PER_STACK, standing - s * PER_STACK));
          return (
            <div key={s} className="sp-stack">
              {Array.from({ length: count }, (_, i) => {
                const n = s * PER_STACK + i;
                return <span key={i} className={`sp-disc ${n >= standing - lifted ? 'is-picked' : ''}`} style={{ '--i': i, '--n': n } as React.CSSProperties} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The amount of a recognition as a small gold pill: a coin and the number. */
export const CoinBadge: React.FC<{ amount: number; className?: string; title?: string }> = ({ amount, className = '', title }) => (
  <span className={`sp-coin-badge text-xs ${className}`} title={title}>
    <span>
      <CoinFace />
    </span>
    {toPersianDigits(amount)} سکه
  </span>
);

/** A small sealed envelope with the coin as its seal. */
export const MiniEnvelope: React.FC<{ waiting?: boolean }> = ({ waiting }) => (
  <span className={`sp-mini-env ${waiting ? 'is-waiting' : ''}`} aria-hidden="true">
    <span>
      <CoinFace />
    </span>
  </span>
);
