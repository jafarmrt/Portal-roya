import React, { useEffect, useState } from 'react';
import type { BadgeTier } from '../../../shared/recognitionTutorial';
import { api } from '../../lib/api';
import { BadgeMedal, TIER_NAMES } from './Badge';
import './thanks.css';

/**
 * A colleague's «سپاس» badges in their profile (2.5): only the ones earned, and only if they chose to
 * show them in «گنجینهٔ من». Nothing at all otherwise, not even an empty line.
 */
export const ProfileBadges: React.FC<{ userId: string }> = ({ userId }) => {
  const [badges, setBadges] = useState<{ key: string; name: string; about: string; tier: BadgeTier }[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .get<{ badges: typeof badges }>(`/api/recognitions/badges/${encodeURIComponent(userId)}`)
      .then((r) => alive && setBadges(r.badges))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);
  if (badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="نشان‌های سپاس">
      {badges.map((b) => (
        <li
          key={b.key}
          title={b.about}
          className="inline-flex items-center gap-1 ps-0.5 pe-2 py-0.5 rounded-full bg-gold-soft border border-gold/50 text-[11px] font-bold text-ink"
        >
          <BadgeMedal tier={b.tier} size={18} />
          {b.name}
          {b.key !== 'values' && <span className="font-normal text-muted">{TIER_NAMES[b.tier]}</span>}
        </li>
      ))}
    </ul>
  );
};
