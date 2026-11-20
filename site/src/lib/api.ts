// Base URL of the bot's public API (CONTRACT.md). `npm run dev` uses the mock
// served by astro.config.mjs; `PUBLIC_API_BASE=/mock-api/ npm run build` makes
// a build that reads the fixtures written by scripts/write-mock.mjs.
export const API_BASE: string =
  import.meta.env.PUBLIC_API_BASE || (import.meta.env.DEV ? '/mock-api/' : 'https://p.infosecstreams.com/streamstatus/');

/** webcal:// for absolute https bases so calendar apps subscribe instead of downloading. */
export const CALENDAR_URL = `${API_BASE.replace(/^https:\/\//, 'webcal://')}schedule.ics`;

// Twitch's public live preview image for a channel (no API call needed). Only
// requested for channels status.json reports as live; {login} {w} {h} are filled in.
export const THUMB_TEMPLATE: string =
  import.meta.env.PUBLIC_THUMB_TEMPLATE ||
  (import.meta.env.DEV ? '/mock-api/thumbs/{login}.svg' : 'https://static-cdn.jtvnw.net/previews-ttv/live_user_{login}-{w}x{h}.jpg');
export const THUMB_ORIGIN = /^https?:/.test(THUMB_TEMPLATE) ? new URL(THUMB_TEMPLATE.replace(/[{}]/g, '')).origin : '';
