// UI strings live in src/i18n/<lang>.json (Crowdin source: en.json).
// Missing keys in a translation fall back to English.
import en from '../i18n/en.json';
import ar from '../i18n/ar.json';
import de from '../i18n/de.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';
import hi from '../i18n/hi.json';
import it from '../i18n/it.json';
import pt from '../i18n/pt.json';
import tr from '../i18n/tr.json';
import zh from '../i18n/zh.json';

export type Strings = typeof en;
export const DEFAULT_LANG = 'en';
// Order of the language menu: English first, then by native name as before.
export const LANGS = ['en', 'ar', 'de', 'es', 'fr', 'hi', 'it', 'pt', 'tr', 'zh'] as const;
export type Lang = (typeof LANGS)[number];
export const OTHER_LANGS = LANGS.filter((l) => l !== DEFAULT_LANG);
export const RTL = new Set<string>(['ar']);
// og:locale needs a region.
export const OG_LOCALE: Record<Lang, string> = {
  en: 'en_US', ar: 'ar_AR', de: 'de_DE', es: 'es_ES', fr: 'fr_FR',
  hi: 'hi_IN', it: 'it_IT', pt: 'pt_BR', tr: 'tr_TR', zh: 'zh_CN',
};

const raw: Record<Lang, unknown> = { en, ar, de, es, fr, hi, it, pt, tr, zh };

function merge<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || typeof over !== 'object' || over === null) {
    return (typeof over === typeof base && over !== '' ? over : base) as T;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) {
    out[k] = merge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k]);
  }
  return out as T;
}

export function strings(lang: Lang): Strings {
  return lang === DEFAULT_LANG ? en : merge(en, raw[lang]);
}

export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type Page = '' | 'inactive' | 'faq' | 'resources';
export const PAGES: Page[] = ['', 'inactive', 'faq', 'resources'];

/** Site path of a page in a language: '/', '/faq', '/de/', '/de/faq'. */
export function pathFor(lang: Lang, page: Page): string {
  const prefix = lang === DEFAULT_LANG ? '' : `/${lang}`;
  return page ? `${prefix}/${page}` : `${prefix}/`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Inline Markdown as used in the translated texts: `code`, **bold**, [text](url).
 * Internal links ("/faq") are localised; external links open in a new tab.
 */
export function md(s: string, lang: Lang): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      if (href.startsWith('/')) {
        const page = href.replace(/^\/+/, '') as Page;
        return `<a href="${pathFor(lang, PAGES.includes(page) ? page : '')}">${text}</a>`;
      }
      return `<a href="${href}" rel="noopener" target="_blank">${text}</a>`;
    });
}

export function mdBlocks(s: string, lang: Lang): string {
  return s.split(/\n\n+/).map((p) => `<p>${md(p, lang)}</p>`).join('');
}
