// Streamer page (/streamer/<login>): the page was built with the stats as
// they were at build time; this refreshes them from the bot's
// stats/<login>.json (refreshed every 10 minutes server-side), adds live
// state from status.json, and shows times in the visitor's timezone.
// Only the Twitch and YouTube logos lead off the site.
import { esc, dur, renderStats, type Live, type Stats } from '../lib/streamer-render';

const root = document.getElementById('sp');
if (root) void startStreamer(root);

async function startStreamer(root: HTMLElement) {
  const API = root.dataset.api!, THUMB = root.dataset.thumb!;
  const ui: Record<string, string> = JSON.parse(root.dataset.ui!);
  const listed = new Set<string>(JSON.parse(root.dataset.roster!));
  const base = root.dataset.base!;                   // /streamer or /de/streamer
  const login = root.dataset.login!;
  const lang = document.documentElement.lang;
  const $ = (id: string) => document.getElementById(id)!;
  const f = (k: string, v: Record<string, string | number>) => (ui[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const rel = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const ago = (iso: string) => {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    return Math.abs(m) < 60 ? rel.format(m, 'minute') : Math.abs(m) < 2880 ? rel.format(Math.round(m / 60), 'hour') : rel.format(Math.round(m / 1440), 'day');
  };
  const thumb = (l: string) => THUMB.replace('{login}', l).replace('{w}', '320').replace('{h}', '180') + (/^https:/.test(THUMB) ? `?t=${Math.floor(Date.now() / 300000)}` : '');

  const [stats, live] = await Promise.all([
    fetch(`${API}stats/${encodeURIComponent(login)}.json`).then((r) => (r.ok ? (r.json() as Promise<Stats>) : null)).catch(() => null),
    fetch(`${API}status.json`).then((r) => r.json() as Promise<{ streamers: Live[] }>).then((d) => d.streamers.find((s) => s.login.toLowerCase() === login) ?? null).catch(() => null),
  ]);
  if (stats?.display_name) $('sp-name').textContent = stats.display_name;

  // ---- status line ----
  // "Getting ready" shows for 20 minutes at most, as on the list.
  const pre = live?.status === 'prelive' && !!live.prelive_since && Date.now() - Date.parse(live.prelive_since) < 20 * 60_000;
  const online = live?.status === 'online';
  $('sp-status').innerHTML = online
    ? `<i class="led on" aria-hidden="true"></i><b>${esc(ui.live)}</b>${live!.viewers != null ? ` · ${esc(f('viewers', { n: num.format(live!.viewers) }))}` : ''}${live!.started_at ? ` · ${esc(f('upFor', { t: dur(Date.now() - Date.parse(live!.started_at)) }))}` : ''}`
    : pre ? `<i class="led pre" aria-hidden="true"></i><b>${esc(ui.prelive)}</b>`
    : `<i class="led" aria-hidden="true"></i>${esc(ui.offline)} · ${esc(stats?.last_live_at ? f('lastLive', { t: ago(stats.last_live_at) }) : ui.neverLive)}`;

  // Keep the built page when the API is down; otherwise re-render, fresh and local.
  if (!stats && !online && !pre && root.dataset.built === '1') return;
  const shown = online || pre ? live : null;
  $('sp-body').innerHTML = renderStats(stats, shown && { ...shown, status: pre ? 'prelive' : shown.status }, {
    lang, ui, thumb, tzOffset: -new Date().getTimezoneOffset() / 60,
    page: (l) => (listed.has(l) ? `${base}/${encodeURIComponent(l)}` : null),
  });
}

export {};
