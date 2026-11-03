import { useEffect, useState } from 'react';

/** The person's own look (dark mode, text size, colour), saved on this device (public/appearance.js applies it before the page is drawn). */
export type Theme = 'light' | 'dark' | 'system';
export type TextSize = 'normal' | 'large' | 'larger';
/** The person's own colour for buttons, the menu bar and highlights; 'roya' is the company's crimson. */
export type Accent = 'roya' | 'graphite' | 'navy' | 'teal' | 'green' | 'violet';
export const ACCENTS: readonly Accent[] = ['roya', 'graphite', 'navy', 'teal', 'green', 'violet'];

const THEME_KEY = 'roya.theme';
const SIZE_KEY = 'roya.textSize';
const ACCENT_KEY = 'roya.accent';
const CHANGE = 'roya:appearance';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts until the page is closed.
  }
};

export function getTheme(): Theme {
  const value = read(THEME_KEY);
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function getTextSize(): TextSize {
  const value = read(SIZE_KEY);
  return value === 'large' || value === 'larger' ? value : 'normal';
}

export function getAccent(): Accent {
  const value = read(ACCENT_KEY);
  return (ACCENTS as readonly string[]).includes(value ?? '') ? (value as Accent) : 'roya';
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

/** Puts the saved look on the page. */
export function applyAppearance(theme = getTheme(), size = getTextSize(), accent = getAccent()) {
  const root = document.documentElement;
  if (accent === 'roya') root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark()));
  if (size === 'normal') root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', size);
}

export function setTheme(theme: Theme) {
  write(THEME_KEY, theme);
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE));
}

export function setTextSize(size: TextSize) {
  write(SIZE_KEY, size);
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE));
}

export function setAccent(accent: Accent) {
  write(ACCENT_KEY, accent);
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE));
}

/** The current choices; follows changes made in this tab, in other tabs, and the device's own dark mode. */
export function useAppearance() {
  const [state, setState] = useState(() => ({ theme: getTheme(), textSize: getTextSize(), accent: getAccent() }));
  useEffect(() => {
    const sync = () => {
      applyAppearance();
      setState({ theme: getTheme(), textSize: getTextSize(), accent: getAccent() });
    };
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener(CHANGE, sync);
    window.addEventListener('storage', sync);
    media?.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener('storage', sync);
      media?.removeEventListener?.('change', sync);
    };
  }, []);
  return state;
}
