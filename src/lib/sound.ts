/**
 * A short, soft chime for an emoji from a colleague. It is drawn with the browser's audio engine, so
 * there is no sound file to download. The switch is kept per device (a phone in a meeting may want
 * silence while the desk computer does not); it is on unless the person turns it off.
 */

const KEY = 'portal:kudos-sound';
const LAST_KEY = 'portal:kudos-sound-last';
const listeners = new Set<() => void>();

let context: AudioContext | null = null;

const audioContext = () => {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
};

/**
 * Browsers only let a page make sound after the person has clicked or typed in it once. The audio
 * engine is woken on the first such touch, so a later emoji can be heard without another click.
 */
export function unlockSound() {
  const wake = () => {
    const ctx = audioContext();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
    if (ctx?.state === 'running') {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    }
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
}

export const kudosSoundOn = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export function setKudosSound(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Private mode without storage: the choice lasts until the page is closed.
  }
  listeners.forEach((l) => l());
}

export const subscribeKudosSound = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Two soft rising notes, about half a second long. */
export function playChime() {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return false;
  const start = ctx.currentTime + 0.01;
  [
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.13 },
  ].forEach(({ freq, at }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.18, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.45);
  });
  return true;
}

/**
 * Chimes once for the newest emoji, unless the person turned the sound off. With the portal open in
 * several tabs, only the first tab to see an emoji plays it.
 */
export function chimeForKudos(id: number) {
  if (!kudosSoundOn()) return;
  try {
    if (Number(localStorage.getItem(LAST_KEY)) >= id) return;
    localStorage.setItem(LAST_KEY, String(id));
  } catch {
    // Without storage every tab may chime; harmless.
  }
  playChime();
}
