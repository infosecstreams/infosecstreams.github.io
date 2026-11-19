// Service worker, served as /sw.js with a per-deploy version (src/pages/sw.js.ts).
// - Pages and other same-origin files: stale-while-revalidate, so repeat visits
//   render from cache instantly while a fresh copy is fetched for next time.
// - /_astro/* (content-hashed): cache-first, never revalidated.
// - The live API (/api/*, cross-origin p.infosecstreams.com) is never touched,
//   so live status is never stale.
// A new deploy changes VERSION; the new worker takes over and drops old pages.
const VERSION = '__VERSION__';
const PAGES = `pages-${VERSION}`;
const ASSETS = 'assets';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== PAGES && key !== ASSETS) await caches.delete(key);
    const assets = await caches.open(ASSETS);
    const keys = await assets.keys();
    for (const req of keys.slice(0, Math.max(0, keys.length - 60))) await assets.delete(req);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(mock-)?api\//.test(url.pathname) || url.pathname === '/sw.js') return;

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) event.waitUntil(cache.put(req, res.clone()));
      return res;
    })());
    return;
  }

  // Filters live in the query string; the page itself doesn't vary with it.
  const key = url.origin + url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(PAGES);
    const hit = await cache.match(key);
    const fresh = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') return cache.put(key, res.clone()).then(() => res);
      return res;
    });
    if (hit) {
      event.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    return fresh;
  })());
});
