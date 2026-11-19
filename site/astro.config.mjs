// @ts-check
import { defineConfig } from 'astro/config';
import { generate, ics } from './mock/fixtures.mjs';

/** Dev server only: serves mock API responses at /mock-api/ (see mock/fixtures.mjs). */
function mockApi() {
  return {
    name: 'mock-api',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use('/mock-api/', (req, res, next) => {
        const { status, schedule } = generate();
        const body = { '/status.json': status, '/schedule.json': schedule }[req.url?.split('?')[0] ?? ''];
        if (req.url?.startsWith('/schedule.ics')) {
          res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          return res.end(ics(schedule));
        }
        if (!body) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      });
    },
  };
}

export default defineConfig({
  site: 'https://infosecstreams.com',
  // /faq is served from faq.html and /de/ from de/index.html, which keeps every
  // URL the Jekyll site had.
  trailingSlash: 'ignore',
  build: { format: 'preserve', inlineStylesheets: 'always' },
  compressHTML: true,
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ar', 'de', 'es', 'fr', 'hi', 'it', 'pt', 'tr', 'zh'],
    routing: { prefixDefaultLocale: false },
  },
  vite: { plugins: [mockApi()] },
});
