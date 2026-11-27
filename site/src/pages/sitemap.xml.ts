// One sitemap with every page in every language, cross-linked with hreflang.
import type { APIRoute } from 'astro';
import { LANGS, PAGES, pathFor } from '../lib/i18n';
import { active } from '../lib/roster';
import { statsAtBuild } from '../lib/build-stats';

export const GET: APIRoute = async ({ site }) => {
  const origin = site!.origin;
  const urls = PAGES.flatMap((page) =>
    LANGS.map((lang) => {
      const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${origin}${pathFor(l, page)}"/>`).join('')
        + `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${pathFor('en', page)}"/>`;
      return `<url><loc>${origin}${pathFor(lang, page)}</loc>${alts}<changefreq>${page === '' ? 'hourly' : 'weekly'}</changefreq><priority>${page === '' ? '1.0' : '0.6'}</priority></url>`;
    }),
  );
  // Active streamers' pages (inactive ones stay out of search), less those
  // with no stats: their pages are noindex (src/views/Streamer.astro).
  const logins = [...new Set(active.map((s) => s.login.toLowerCase()))];
  const has = await Promise.all(logins.map((l) => statsAtBuild(l)));
  const people = logins.filter((_, i) => has[i]).flatMap((login) =>
    LANGS.map((lang) => {
      const at = (l: typeof lang) => `${origin}${pathFor(l, 'streamer')}/${encodeURIComponent(login)}`;
      const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${at(l)}"/>`).join('')
        + `<xhtml:link rel="alternate" hreflang="x-default" href="${at('en')}"/>`;
      return `<url><loc>${at(lang)}</loc>${alts}<changefreq>daily</changefreq><priority>0.5</priority></url>`;
    }),
  );
  urls.push(...people);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
