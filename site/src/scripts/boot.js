// Inlined into every page by Base.astro (minified at build). Runs after load.
// Placeholders filled at build: __PLAUSIBLE_HOST__, __PLAUSIBLE_DOMAIN__, __SW__.
(() => {
  // 1. Prefetch on hover/touch where speculation rules aren't supported
  // (Safari, Firefox). <link rel=prefetch> where it works, else a low-priority
  // fetch that warms the HTTP cache and the service worker's cache.
  const spec = window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules');
  if (!spec) {
    const seen = new Set([location.pathname]);
    const linkOk = document.createElement('link').relList.supports('prefetch');
    const warm = (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.origin !== location.origin || a.target === '_blank' || seen.has(a.pathname) || /^\/(mock-)?api\//.test(a.pathname)) return;
      seen.add(a.pathname);
      if (linkOk) {
        const l = document.createElement('link');
        l.rel = 'prefetch';
        l.href = a.pathname;
        document.head.append(l);
      } else {
        fetch(a.pathname, { credentials: 'same-origin', priority: 'low' }).catch(() => {});
      }
    };
    addEventListener('mouseover', warm, { passive: true });
    addEventListener('touchstart', warm, { passive: true });
    addEventListener('focusin', warm, { passive: true });
  }

  // 2. Real-user metrics (sampled 1 in 4), sent once when the page is hidden.
  // Plausible custom event "Web Vitals" with bucketed values as props.
  const vitals = { lcp: 0, cls: 0, inp: 0 };
  const watch = (type, fn, opts) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...opts }); } catch { /* unsupported */ }
  };
  if (Math.random() < 0.25) {
    watch('largest-contentful-paint', (e) => { vitals.lcp = e.startTime; });
    // Sum of unexpected shifts (an upper bound of CLS's worst session window).
    watch('layout-shift', (e) => { if (!e.hadRecentInput) vitals.cls += e.value; });
    watch('event', (e) => { if (e.interactionId) vitals.inp = Math.max(vitals.inp, e.duration); }, { durationThreshold: 16 });
    let sent = false;
    addEventListener('visibilitychange', () => {
      if (sent || document.visibilityState !== 'hidden') return;
      sent = true;
      const nav = performance.getEntriesByType('navigation')[0];
      const ms = (v, step) => (v ? String(Math.round(v / step) * step) : 'n/a');
      const props = {
        lcp: ms(vitals.lcp, 100),
        cls: vitals.cls.toFixed(2),
        inp: ms(vitals.inp, 25),
        ttfb: ms(nav && nav.responseStart, 50),
        nav: nav ? (nav.deliveryType || (nav.transferSize === 0 ? 'cache' : 'network')) + (document.prerendering || (nav.activationStart > 0) ? '+prerender' : '') : 'n/a',
      };
      const body = JSON.stringify({ name: 'Web Vitals', url: location.href, domain: '__PLAUSIBLE_DOMAIN__', props, interactive: false });
      navigator.sendBeacon && navigator.sendBeacon('https://__PLAUSIBLE_HOST__/api/event', body);
    });
  }

  addEventListener('load', () => setTimeout(() => {
    // 3. Analytics after the page is idle, never competing with it.
    const s = document.createElement('script');
    s.src = 'https://__PLAUSIBLE_HOST__/js/plausible.outbound-links.js';
    s.dataset.domain = '__PLAUSIBLE_DOMAIN__';
    document.head.append(s);
    // 4. Service worker: repeat visits come from cache (see /sw.js).
    if (__SW__ && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, 1500));
})();
