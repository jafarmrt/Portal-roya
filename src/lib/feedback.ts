/**
 * Small answers to the person's own actions: a light buzz on phones, a "pop", and a few paper pieces
 * when a greeting card goes out. Nothing here runs when the device asks for less motion, and the paper
 * pieces only appear on a computer (phones get no particle effects at all).
 */

const query = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
const reducedMotion = () => query('(prefers-reduced-motion: reduce)');

/** A very short vibration on phones that have one (Android); iPhones ignore it. */
export function haptic(ms = 10) {
  if (reducedMotion() || !query('(pointer: coarse)')) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers refuse vibration outside a tap; that is fine.
  }
}

/** Replays the springy "pop" on an element (a tick, an emoji). */
export function pop(el: Element | null | undefined) {
  if (!el || reducedMotion()) return;
  el.classList.remove('pop');
  // Reading the size restarts the animation when the class comes back.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('pop');
}

const COLOURS = ['#DC2626', '#E9C46A', '#D97B5F', '#9BB088', '#F87171', '#FBBF24'];

/** A small burst of paper around an element, on computers only. */
export function confettiFrom(el: Element | null | undefined, pieces = 18) {
  if (!el || reducedMotion() || !query('(hover: hover) and (pointer: fine)')) return;
  const box = el.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.5;
    const distance = 50 + Math.random() * 60;
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = COLOURS[i % COLOURS.length];
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 30}px`);
    piece.style.setProperty('--rot', `${Math.round(Math.random() * 540 - 270)}deg`);
    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 1000);
  }
}
