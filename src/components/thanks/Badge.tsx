import React from 'react';
import type { BadgeTier } from '../../../shared/recognitionTutorial';

// The badges of «سپاس» (phase 2, 2.5), drawn as the coin's eight-pointed star on a medal.

export const TIER_NAMES = ['', 'مسی', 'نقره‌ای', 'طلایی'] as const;

/** A badge as a shamseh medal (the coin's eight-pointed star) in copper, silver or gold; grey until earned. */
export const BadgeMedal: React.FC<{ tier: BadgeTier; size?: number; className?: string }> = ({ tier, size = 56, className = '' }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} className={`sp-medal sp-medal-${tier} ${className}`} aria-hidden="true">
    <circle cx="32" cy="32" r="29" className="sp-medal-rim" />
    <circle cx="32" cy="32" r="24" className="sp-medal-face" />
    <path
      className="sp-medal-star"
      d="M32 13 L36.6 24.9 L45.4 18.6 L41.5 28.6 L51 32 L41.5 35.4 L45.4 45.4 L36.6 39.1 L32 51 L27.4 39.1 L18.6 45.4 L22.5 35.4 L13 32 L22.5 28.6 L18.6 18.6 L27.4 24.9 Z"
    />
  </svg>
);

