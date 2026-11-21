// The streamer page's body, as HTML: used at build time (so each streamer's
// page is a real, indexable page with their numbers in it) and again in the
// browser (src/scripts/streamer.ts) with fresh data and the visitor's
// timezone. Pure: no DOM, no fetching.

export interface Stats {
  login: string; display_name?: string; recording_since?: string; last_live_at?: string;
  hours?: { '7d'?: number; '30d'?: number; '90d'?: number; all?: number };
  streams_30d?: number; avg_stream_hours_30d?: number; median_stream_hours_30d?: number;
  longest_stream_hours_30d?: number; longest_stream_hours_all?: number; stream_days_per_week_30d?: number;
  current_streak_weeks?: number; longest_streak_weeks?: number;
  followers?: number; followers_gained_30d?: number; avg_viewers_30d?: number; avg_viewers_prev_30d?: number;
  peak_viewers_30d?: number; hours_watched_30d?: number;
  heatmap_90d?: number[][];
  recent_streams?: { started_at: string; ended_at?: string; hours: number; categories?: string[]; avg_viewers?: number; peak_viewers?: number }[];
  recent_titles?: { at: string; title: string; category?: string }[];
  recent_vods?: { title: string; url: string; views?: number; duration_s?: number; created_at: string }[];
  top_clips_30d?: { title: string; url: string; views?: number; created_at?: string }[];
  topics_30d?: { topic: string; streams: number }[];
  categories_30d?: { category: string; hours: number }[];
  raid_partners_90d?: { login: string; display_name?: string; raids_out: number; raids_in: number }[];
}
export interface Live { login: string; status: string; title?: string; category?: string; language?: string; viewers?: number; started_at?: string; prelive_since?: string }

export interface Ctx {
  lang: string;
  ui: Record<string, string>;
  /** Link to another streamer's page here, or null when they are not on the list. */
  page(login: string): string | null;
  /** Preview image URL (live only). */
  thumb?(login: string): string;
  /** Hours to add to UTC for "usually live" and times; undefined = UTC (build time). */
  tzOffset?: number;
}

export const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const dur = (ms: number) => { const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4); return h ? `${h}h ${m}m` : `${m}m`; };
const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export function renderStats(stats: Stats | null, live: Live | null, c: Ctx): string {
  const { lang, ui } = c;
  const utc = c.tzOffset == null;
  const f = (k: string, v: Record<string, string | number>) => (ui[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const n = (x?: number) => (x == null ? '—' : num.format(x));
  const hrs = (x?: number) => (x == null ? '—' : `${num.format(x)} h`);
  const tz = utc ? { timeZone: 'UTC' } : {};
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', month: 'short', day: 'numeric', ...tz });
  const clock = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', ...tz, ...(utc ? { timeZoneName: 'short' } : {}) });
  const date = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric', ...tz });

  const out: string[] = [];
  const panel = (title: string, inner: string, cls = '', note = '') => `<section class="panel ${cls}"><h2 class="panel-h">${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</h2>${inner}</section>`;
  const kv = (rows: [string, string][]) => `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  const online = live?.status === 'online', pre = live?.status === 'prelive';
  if (live && (online || pre)) {
    const th = online && c.thumb ? `<span class="th"><img src="${esc(c.thumb(live.login.toLowerCase()))}" width="320" height="180" alt=""></span>` : '';
    out.push(panel(online ? ui.live : ui.prelive, `<div class="sp-live">${th}<div><p class="t">${esc(live.title ?? '')}</p><p class="meta">${esc([live.category, live.language].filter(Boolean).join(' · '))}</p></div></div>`, 'wide'));
  }
  if (!stats) {
    out.push(`<p class="status">${esc(ui.unavailable)}</p>`);
    return out.join('');
  }

  // ---- numbers ----
  const h = stats.hours ?? {};
  out.push(panel(ui.activity, kv([
    [ui.hours, `<span class="hrow"><span><small>${esc(ui.h7)}</small>${hrs(h['7d'])}</span><span><small>${esc(ui.h30)}</small>${hrs(h['30d'])}</span><span><small>${esc(ui.h90)}</small>${hrs(h['90d'])}</span><span><small>${esc(ui.hAll)}</small>${hrs(h.all)}</span></span>`],
    [ui.streams30, n(stats.streams_30d)],
    [ui.avgLen, hrs(stats.median_stream_hours_30d ?? stats.avg_stream_hours_30d)],
    [ui.longest, hrs(stats.longest_stream_hours_all ?? stats.longest_stream_hours_30d)],
    [ui.daysWeek, n(stats.stream_days_per_week_30d)],
    [ui.streak, stats.current_streak_weeks != null ? esc(f('streakVal', { n: stats.current_streak_weeks, b: stats.longest_streak_weeks ?? stats.current_streak_weeks })) : '—'],
  ])));
  const trend = stats.avg_viewers_30d != null && stats.avg_viewers_prev_30d
    ? ` <span class="${stats.avg_viewers_30d >= stats.avg_viewers_prev_30d ? 'up' : 'down'}">${stats.avg_viewers_30d >= stats.avg_viewers_prev_30d ? '+' : ''}${num.format(Math.round((stats.avg_viewers_30d / stats.avg_viewers_prev_30d - 1) * 100))}%</span>` : '';
  out.push(panel(ui.audience, kv([
    [ui.followers, `${n(stats.followers)}${stats.followers_gained_30d ? ` <span class="up">+${n(stats.followers_gained_30d)}</span>` : ''}`],
    [ui.avgViewers, `${n(stats.avg_viewers_30d)}${trend}`],
    [ui.peakViewers, n(stats.peak_viewers_30d)],
    [ui.hoursWatched, hrs(stats.hours_watched_30d || undefined)],
  ])));

  // ---- usually live: the 90-day heatmap (UTC, Monday first), shifted to the viewer's timezone ----
  const heat = stats.heatmap_90d;
  if (heat?.length === 7 && heat.some((r) => r.some((v) => v > 0))) {
    const off = Math.round(c.tzOffset ?? 0);
    const at = (d: number, hr: number) => { const i = (((d * 24 + hr - off) % 168) + 168) % 168; return heat[Math.floor(i / 24)][i % 24] ?? 0; };
    const max = Math.max(...heat.flat(), 0.01);
    const wk = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
    const monday = new Date(Date.UTC(2024, 0, 1));                      // a Monday
    const rows = Array.from({ length: 7 }, (_, d) => {
      const label = wk.format(new Date(monday.getTime() + d * 864e5));
      const cells = Array.from({ length: 24 }, (_, hr) => { const v = at(d, hr) / max; return `<i class="l${v > 0.66 ? 3 : v > 0.33 ? 2 : v > 0.02 ? 1 : 0}"></i>`; }).join('');
      return `<div class="hm-row"><span>${esc(label)}</span>${cells}</div>`;
    }).join('');
    const axis = `<div class="hm-row hm-axis"><span></span>${Array.from({ length: 24 }, (_, hr) => `<b>${hr % 6 === 0 ? hr : ''}</b>`).join('')}</div>`;
    out.push(panel(ui.usually, `<div class="hm" role="img" aria-label="${esc(ui.usually)}">${rows}${axis}</div>`, '', utc ? 'UTC' : ui.localTime));
  }

  // ---- recent streams ----
  if (stats.recent_streams?.length) {
    out.push(panel(ui.recent, `<ol class="rows">${stats.recent_streams.map((r) => {
      const a = new Date(r.started_at), b = r.ended_at ? new Date(r.ended_at) : null;
      const v = r.avg_viewers != null ? `${esc(ui.avgShort)} ${n(r.avg_viewers)} · ${esc(ui.peakShort)} ${n(r.peak_viewers)}` : '';
      return `<li><span class="d">${esc(day.format(a))}</span><span class="c">${esc(clock.format(a))}${b ? `–${esc(clock.format(b))}` : ''}</span><span class="h">${hrs(r.hours)}</span><span class="v">${v}</span></li>`;
    }).join('')}</ol>`));
  }

  // ---- what they stream ----
  const chips: string[] = [];
  for (const t of stats.topics_30d ?? []) chips.push(`<span>${esc(t.topic)} <b>${t.streams}</b></span>`);
  const cats = (stats.categories_30d ?? []).filter((x) => !/backfill/i.test(x.category));
  if (chips.length || cats.length || stats.recent_titles?.length) {
    out.push(panel(ui.topics, (chips.length ? `<p class="chips">${chips.join('')}</p>` : '')
      + (cats.length ? kv(cats.map((x) => [x.category, hrs(x.hours)])) : '')
      + (stats.recent_titles?.length ? `<ol class="rows titles">${stats.recent_titles.slice(0, 5).map((t) => `<li><span class="d">${esc(day.format(new Date(t.at)))}</span><span class="tt">${esc(t.title)}</span></li>`).join('')}</ol>` : '')));
  }

  // ---- VODs and clips (each with the Twitch logo as its link) ----
  const media = (items: { title: string; url: string; views?: number; duration_s?: number; created_at?: string }[]) => `<ol class="rows">${items.map((v) =>
    `<li><span class="d">${v.created_at ? esc(day.format(new Date(v.created_at))) : ''}</span><span class="tt">${esc(v.title)}</span><span class="h">${v.duration_s ? esc(dur(v.duration_s * 1000)) : ''}</span><a class="tw-ic" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="${esc(ui.onTwitch)}: ${esc(v.title)}">${icon('twitch')}</a></li>`).join('')}</ol>`;
  if (stats.recent_vods?.length) out.push(panel(ui.vods, media(stats.recent_vods), 'wide'));
  if (stats.top_clips_30d?.length) out.push(panel(ui.clips, media(stats.top_clips_30d), 'wide'));

  // ---- raids (partners on the list link to their page here) ----
  if (stats.raid_partners_90d?.length) {
    out.push(panel(ui.raids, `<ol class="rows">${stats.raid_partners_90d.map((p) => {
      const nm = esc(p.display_name || p.login), href = c.page(p.login.toLowerCase());
      const who = href ? `<a href="${href}">${nm}</a>` : nm;
      return `<li><span class="tt">${who}</span><span class="c">${p.raids_out ? `${esc(ui.raidOut)} ${p.raids_out}×` : ''}${p.raids_out && p.raids_in ? ' · ' : ''}${p.raids_in ? `${esc(ui.raidIn)} ${p.raids_in}×` : ''}</span></li>`;
    }).join('')}</ol>`));
  }

  if (stats.recording_since) out.push(`<p class="since">${esc(f('since', { d: date.format(new Date(stats.recording_since)) }))}</p>`);
  return out.join('');
}
