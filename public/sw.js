// Service worker of the portal, so it can be installed on phones as an app.
// It caches only the "can't reach the portal" page. Every page and file still comes from the server,
// so a release installed with update.sh shows on the next open; /api (live updates included) and
// /uploads are never touched. Bump CACHE when offline.html or its icon changes.
const CACHE = 'roya-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' skips the browser's 7-day copy, so the newest page is stored.
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon-192.png'].map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      // Lets the browser start loading the page while the worker wakes up, so pages are not slower.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(request));
      } catch {
        const offline = await caches.match(OFFLINE_URL);
        return offline || Response.error();
      }
    })(),
  );
});

// --- Notifications on the phone or computer (Web Push) ---
// The server sends { title, body, url, tag }; the tag is that of the bell notification, and the open
// portal page shows the same tag for its own (no-internet) notifications, so none shows twice.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'پرتال رویا';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'fa',
      tag: data.tag || undefined,
      data: { url: data.url || '/#notifications' },
    }),
  );
});

// Opens the notification's page: in a portal window that is already open, or in a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open-link', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Browsers sometimes renew a push address; the new one is saved for whoever is signed in.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      // Some browsers hand over only the new address, some only the old one (then it is renewed here).
      const key = event.oldSubscription && event.oldSubscription.options.applicationServerKey;
      const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      // Neither: the open portal subscribes again by itself the next time it is opened.
      if (!sub) return;
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
      });
    })().catch(() => undefined),
  );
});
