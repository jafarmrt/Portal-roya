import { useEffect, useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { canPlayEffects, todayTheme } from '../../lib/dayTheme';

// How much «سپاس» moves. Three rules, the same as the portal's festive effects and one more:
// - nothing moves on a day of mourning, when the device asks for less motion, or when the colleague
//   has switched the effects off for themselves;
// - a phone or tablet gets a light version (a short fade and a count, no 3D, no sparks);
// - a computer gets all of it.

export type EffectsLevel = 'full' | 'light' | 'none';

const KEY = 'roya.thanksEffects';
const CHANGE = 'roya:thanksEffects';

const query = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** The colleague's own choice, saved on this device; on until they switch it off. */
export function effectsWanted() {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setEffectsWanted(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch {
    // A private window may refuse storage; the choice then lasts until the page is closed.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function effectsLevel(mourning: boolean): EffectsLevel {
  if (mourning || !effectsWanted() || query('(prefers-reduced-motion: reduce)')) return 'none';
  return canPlayEffects() ? 'full' : 'light';
}

/** The level for this colleague today, following their choice and the size of the window. */
export function useEffectsLevel(): EffectsLevel {
  const { customHolidays, appSettings } = usePortal();
  const mourning = todayTheme(customHolidays, appSettings?.foundingDate ?? '')?.tone === 'mourning';
  const [level, setLevel] = useState(() => effectsLevel(mourning));
  useEffect(() => {
    const sync = () => setLevel(effectsLevel(mourning));
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('resize', sync);
    };
  }, [mourning]);
  return level;
}

/** Counts from 0 up to `target` over `ms` (at once when nothing should move). */
export function useCountUp(target: number, ms: number, run: boolean) {
  const [value, setValue] = useState(run && ms > 0 ? 0 : target);
  useEffect(() => {
    if (!run || ms <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Fast at first, settling at the end.
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, run]);
  return value;
}

/**
 * Coins fly from where they are (the wallet's lifted coins, a «من هم» button) to where they go, on a
 * computer; elsewhere nothing flies.
 */
export async function flyCoins(from: DOMRect[], target: Element | null, fx: EffectsLevel) {
  if (fx !== 'full' || !target || from.length === 0) return;
  const to = target.getBoundingClientRect();
  const flights = from.slice(-8).map((box, i) => {
    const coin = document.createElement('span');
    coin.className = 'sp-flying';
    coin.style.left = `${box.left + box.width / 2 - 13}px`;
    coin.style.top = `${box.top + box.height / 2 - 13}px`;
    document.body.appendChild(coin);
    const dx = to.left + to.width / 2 - (box.left + box.width / 2);
    const dy = to.top + to.height / 2 - (box.top + box.height / 2);
    const flight = coin.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotateY(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 110}px) scale(1.6) rotateY(400deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.8) rotateY(720deg)`, opacity: 0.3 },
      ],
      { duration: 780, delay: i * 70, easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)', fill: 'both' },
    );
    return flight.finished.catch(() => undefined).then(() => coin.remove());
  });
  await Promise.all(flights);
}
