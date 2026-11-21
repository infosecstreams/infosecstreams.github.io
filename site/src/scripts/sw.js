// Service worker, served as /sw.js with a per-deploy version (src/pages/sw.js.ts).
// - Pages: network first (a cached page may point at assets a later deploy
//   removed); the cached copy is the fallback when offline or the network is
//   very slow. Prerender-on-hover keeps navigation instant.
// - Other same-origin files: stale-while-revalidate.
// - /_astro/* (content-hashed): cache-first, never revalidated.
// - The live API (cross-origin p.infosecstreams.com/streamstatus/) is never touched,
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
  const html = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  event.respondWith((async () => {
    const cache = await caches.open(PAGES);
    const fresh = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') return cache.put(key, res.clone()).then(() => res);
      return res;
    });
    // Pages: network first. A saved page can point at script files a later
    // deploy removed, so it is only served when the network fails or is very
    // slow (offline, flaky Wi-Fi). Speed comes from prerender-on-hover.
    if (html) {
      const slow = new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await Promise.race([fresh, slow.then(() => { throw new Error('slow'); })]);
        return res;
      } catch {
        const hit = await cache.match(key);
        if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
        return fresh;
      }
    }
    // Other files (fonts, images): stale-while-revalidate.
    const hit = await cache.match(key);
    if (hit) {
      event.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    return fresh;
  })());
});
