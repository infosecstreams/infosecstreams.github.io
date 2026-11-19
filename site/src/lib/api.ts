// Base URL of the bot's public API (CONTRACT.md). `npm run dev` uses the mock
// served by astro.config.mjs; `PUBLIC_API_BASE=/mock-api/ npm run build` makes
// a build that reads the fixtures written by scripts/write-mock.mjs.
export const API_BASE: string =
  import.meta.env.PUBLIC_API_BASE || (import.meta.env.DEV ? '/mock-api/' : 'https://p.infosecstreams.com/api/');

/** webcal:// for absolute https bases so calendar apps subscribe instead of downloading. */
export const CALENDAR_URL = `${API_BASE.replace(/^https:\/\//, 'webcal://')}schedule.ics`;
