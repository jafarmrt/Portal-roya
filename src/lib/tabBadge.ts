import { useEffect, useSyncExternalStore } from 'react';
import { toPersianDigits } from './jalali';

// Shows the number of unread notifications (and emoji from colleagues still in their banner) in the
// browser tab: "(۳) پرتال ..." in the title and a red badge with the number on the tab icon. While the
// portal is in a background tab and something new arrives, the title also blinks until the tab is opened.

const baseTitle = document.title;
const BLINK_TITLE = '🔔 اعلان تازه';
const BLINK_MS = 1500;

let originalIcons: HTMLLinkElement[] | null = null;
let badgeLink: HTMLLinkElement | null = null;
const badgeIcons = new Map<string, Promise<string | null>>();
let source: Promise<HTMLImageElement | null> | null = null;

const loadIcon = () =>
  (source ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = '/favicon.png';
  }));

/** The portal icon with a red badge holding the number, as a data URL (null when it cannot be drawn). */
function drawBadgeIcon(label: string) {
  return loadIcon().then((image) => {
    if (!image) return null;
    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, size, size);
      const r = label.length > 1 ? 24 : 21;
      const cx = size - r - 1;
      const cy = r + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${label.length > 1 ? 26 : 32}px Vazirmatn, Tahoma, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 2);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  });
}

/**
 * Puts the given icon on the tab, or the original icons back when href is null. The icon links are
 * swapped for a new one (not edited in place), which every browser picks up at once.
 */
function setTabIcon(href: string | null) {
  originalIcons ??= Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
  if (href) {
    if (!badgeLink) {
      badgeLink = document.createElement('link');
      badgeLink.rel = 'icon';
      badgeLink.type = 'image/png';
    }
    badgeLink.href = href;
    originalIcons.forEach((link) => link.remove());
    document.head.appendChild(badgeLink);
  } else {
    badgeLink?.remove();
    badgeLink = null;
    originalIcons.forEach((link) => document.head.contains(link) || document.head.appendChild(link));
  }
}

// Emoji from colleagues are not notifications, but still count on the tab while their banner is open.
let extra = 0;
const listeners = new Set<() => void>();
export function setTabExtra(count: number) {
  if (count === extra) return;
  extra = count;
  listeners.forEach((l) => l());
}
const subscribeExtra = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

let lastCount = 0;

export function useTabBadge(unread: number) {
  const more = useSyncExternalStore(subscribeExtra, () => extra);
  const count = Math.max(0, unread) + more;

  useEffect(() => {
    const title = count > 0 ? `(${toPersianDigits(count > 99 ? '99+' : count)}) ${baseTitle}` : baseTitle;
    document.title = title;
    const grew = count > lastCount;
    lastCount = count;

    let blink: number | undefined;
    const stopBlink = () => {
      window.clearInterval(blink);
      blink = undefined;
      document.title = title;
    };
    const onVisible = () => document.visibilityState === 'visible' && stopBlink();
    if (grew && document.visibilityState === 'hidden') {
      let on = false;
      blink = window.setInterval(() => {
        on = !on;
        document.title = on ? BLINK_TITLE : title;
      }, BLINK_MS);
      document.addEventListener('visibilitychange', onVisible);
    }

    let cancelled = false;
    if (count === 0) {
      if (originalIcons) setTabIcon(null);
    } else {
      const label = count > 9 ? '9+' : toPersianDigits(count);
      if (!badgeIcons.has(label)) badgeIcons.set(label, drawBadgeIcon(label));
      void badgeIcons.get(label)!.then((href) => {
        if (!cancelled && href) setTabIcon(href);
      });
    }
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (blink !== undefined) stopBlink();
    };
  }, [count]);
}
