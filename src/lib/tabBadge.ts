import { useEffect } from 'react';
import { toPersianDigits } from './jalali';

// Shows the number of unread notifications in the browser tab ("(۳) پرتال ...") and a red dot on
// the tab icon, so people who keep the portal open in a background tab notice new messages.

const baseTitle = document.title;
let originalIcons: { link: HTMLLinkElement; href: string; type: string | null }[] | null = null;
let badgeIcon: Promise<string | null> | null = null;

/** The portal icon with a red dot in its corner, as a data URL (null when it cannot be drawn). */
function drawBadgeIcon() {
  return new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size - 15, 15, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = '/favicon.png';
  });
}

/** Puts the given icon on the tab, or the original icons back when href is null. */
function setTabIcon(href: string | null) {
  originalIcons ??= Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).map((link) => ({
    link,
    href: link.getAttribute('href') ?? '',
    type: link.getAttribute('type'),
  }));
  for (const { link, href: original, type } of originalIcons) {
    link.setAttribute('href', href ?? original);
    if (href) link.setAttribute('type', 'image/png');
    else if (type) link.setAttribute('type', type);
  }
}

export function useTabBadge(unread: number) {
  const count = Math.max(0, unread);
  useEffect(() => {
    document.title = count > 0 ? `(${toPersianDigits(count > 99 ? '99+' : count)}) ${baseTitle}` : baseTitle;
    if (count === 0) {
      if (originalIcons) setTabIcon(null);
      return;
    }
    let cancelled = false;
    badgeIcon ??= drawBadgeIcon();
    void badgeIcon.then((href) => {
      if (!cancelled && href) setTabIcon(href);
    });
    return () => {
      cancelled = true;
    };
  }, [count]);
}
