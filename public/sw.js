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
