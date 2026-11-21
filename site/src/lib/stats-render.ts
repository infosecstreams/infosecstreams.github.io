// The community stats page (/stats), as HTML: built with the bot's stats.json
// and raids.json at build time, rendered again in the browser with fresh data
// and the visitor's timezone (src/scripts/stats.ts). Pure: no DOM, no fetching.
import { esc, heatmap } from './streamer-render';

export interface Community {
  generated_at: string; recording_since?: string;
  totals?: { hours_7d?: number; hours_30d?: number; streams_30d?: number; active_streamers_30d?: number; hours_watched_30d?: number; tracked_streamers?: number };
  categories_30d?: { category: string; hours: number; infosec?: boolean }[];
  live_heatmap_90d?: number[][];
  streamers?: { login: string; display_name?: string; hours_7d?: number; hours_30d?: number; streams_30d?: number; current_streak_weeks?: number; raids_out_30d?: number; raids_in_30d?: number }[];
  topics_30d?: { topic: string; streams: number }[];
  top_clips_30d?: { title: string; url: string; views?: number; created_at?: string; streamer_login?: string }[];
  raids_30d?: number;
}
export interface Raids {
  since?: string;
  nodes: { id: string; login: string; display_name?: string; roster?: boolean }[];
  edges: { from: string; to: string; raids: number; viewers?: number; last_at?: string }[];
}
export interface Ctx {
  lang: string;
  ui: Record<string, string>;
  /** A streamer's page here, or null when they're not on the list. */
  page(login: string): string | null;
  /** Hours to add to UTC; undefined = UTC (build time). */
  tzOffset?: number;
}

const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export function renderCommunity(st: Community | null, raids: Raids | null, c: Ctx): string {
  const { lang, ui } = c;
  const f = (k: string, v: Record<string, string | number>) => (ui[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const n = (x?: number) => (x == null ? '' : num.format(x));
  const hrs = (x?: number) => (x == null ? '' : `${num.format(x)} h`);
  const utc = c.tzOffset == null;
  const day = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) });
  const panel = (title: string, inner: string, cls = '', note = '') => !inner ? '' : `<section class="panel ${cls}"><h2 class="panel-h">${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</h2>${inner}</section>`;
  const who = (login: string, name?: string) => { const h = c.page(login.toLowerCase()); const nm = esc(name || login); return h ? `<a href="${h}" dir="auto">${nm}</a>` : `<span dir="auto">${nm}</span>`; };
  if (!st) return `<p class="status">${esc(ui.unavailable)}</p>`;
  const out: string[] = [];

  // ---- the month in numbers ----
  const t = st.totals ?? {};
  const tiles = ([[ui.hours30, hrs(t.hours_30d)], [ui.streams30, n(t.streams_30d)], [ui.active30, n(t.active_streamers_30d)],
    [ui.watched30, hrs(t.hours_watched_30d || undefined)], [ui.hours7, hrs(t.hours_7d)], [ui.raids30, n(st.raids_30d)]] as [string, string][])
    .filter(([, v]) => v);
  out.push(panel(ui.totals, `<dl class="tiles">${tiles.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`, 'wide'));

  // ---- most active ----
  const top = (st.streamers ?? []).filter((s) => (s.hours_30d ?? 0) > 0).sort((a, b) => (b.hours_30d ?? 0) - (a.hours_30d ?? 0)).slice(0, 12);
  const max = Math.max(1, ...top.map((s) => s.hours_30d ?? 0));
  out.push(panel(ui.top, top.length ? `<ol class="rows top">${top.map((s, i) => {
    const lit = Math.max(1, Math.round(((s.hours_30d ?? 0) / max) * 10));
    return `<li><span class="d">${i + 1}</span><span class="tt">${who(s.login, s.display_name)}</span>`
      + `<span class="m" aria-hidden="true">${Array.from({ length: 10 }, (_, k) => `<i${k < lit ? ' class="lit"' : ''}></i>`).join('')}</span>`
      + `<span class="h">${hrs(s.hours_30d)}</span><span class="c">${esc(f('nStreams', { n: n(s.streams_30d) || 0 }))}</span></li>`;
  }).join('')}</ol>` : ''));

  // ---- when ----
  const hm = heatmap(st.live_heatmap_90d, lang, c.tzOffset, ui.when);
  out.push(panel(ui.when, hm, '', utc ? 'UTC' : ui.localTime));

  // ---- topics and categories ----
  // categories the bot counts as security work (the hours the site uses everywhere)
  const cats = (st.categories_30d ?? []).filter((x) => x.infosec !== false && !/backfill/i.test(x.category));
  const chips = (st.topics_30d ?? []).map((x) => `<span>${esc(x.topic)} <b>${x.streams}</b></span>`).join('');
  out.push(panel(ui.topics, (chips ? `<p class="chips">${chips}</p>` : '')
    + (cats.length ? `<dl class="kv">${cats.map((x) => `<div><dt>${esc(x.category)}</dt><dd>${hrs(x.hours)}</dd></div>`).join('')}</dl>` : '')));

  // ---- streaks ----
  const streaks = (st.streamers ?? []).filter((s) => (s.current_streak_weeks ?? 0) >= 2).sort((a, b) => (b.current_streak_weeks ?? 0) - (a.current_streak_weeks ?? 0)).slice(0, 8);
  out.push(panel(ui.streaks, streaks.length ? `<ol class="rows">${streaks.map((s) => `<li><span class="tt">${who(s.login, s.display_name)}</span><span class="h">${esc(f('weeks', { n: s.current_streak_weeks ?? 0 }))}</span></li>`).join('')}</ol>` : '', '', ui.streaksNote));

  // ---- raids ----
  if (raids?.edges.length) {
    const byId = new Map(raids.nodes.map((x) => [x.id, x]));
    const recent = [...raids.edges].sort((a, b) => Date.parse(b.last_at ?? '') - Date.parse(a.last_at ?? '')).slice(0, 8);
    const list = `<ol class="rows raids">${recent.map((e) => {
      const a = byId.get(e.from), b = byId.get(e.to);
      return `<li><span class="d">${e.last_at ? esc(day.format(new Date(e.last_at))) : ''}</span><span class="tt">${a ? who(a.login, a.display_name) : ''} <span class="ar" aria-label="${esc(ui.raided)}">→</span> ${b ? who(b.login, b.display_name) : ''}</span>`
        + `<span class="c">${e.raids > 1 ? `${e.raids}×` : ''}${e.viewers ? ` ${esc(f('viewersN', { n: n(e.viewers) }))}` : ''}</span></li>`;
    }).join('')}</ol>`;
    out.push(panel(ui.raids, raidMap(raids, c) + list, 'wide', ui.raidsNote));
  }

  // ---- clips (the Twitch logo is the link) ----
  const names = new Map((st.streamers ?? []).map((x) => [x.login.toLowerCase(), x.display_name ?? x.login]));
  const clips = (st.top_clips_30d ?? []).slice(0, 8);
  out.push(panel(ui.clips, clips.length ? `<ol class="rows">${clips.map((v) => `<li><span class="d">${v.created_at ? esc(day.format(new Date(v.created_at))) : ''}</span>`
    + `<span class="tt">${esc(v.title)}${v.streamer_login ? ` <span class="by">· ${who(v.streamer_login, names.get(v.streamer_login.toLowerCase()))}</span>` : ''}</span>`
    + `<span class="h">${v.views != null ? esc(f('views', { n: n(v.views) })) : ''}</span>`
    + `<a class="tw-ic" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="${esc(ui.onTwitch)}: ${esc(v.title)}">${icon('twitch')}</a></li>`).join('')}</ol>` : '', 'wide'));

  if (st.recording_since) out.push(`<p class="since">${esc(f('since', { d: new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) }).format(new Date(st.recording_since)) }))}</p>`);
  return out.join('');
}

// ---- the raid map: who raids whom ----
// Each group of streamers connected by raids is laid out on its own (a small
// force simulation), then the groups are packed in rows: small graphs stay
// legible and nobody's label lands on someone else. Deterministic, so the
// build and the browser draw the same picture.
export function raidMap(raids: Raids, c: Ctx): string {
  const N = raids.nodes.length;
  if (!N) return '';
  const at = new Map(raids.nodes.map((x, i) => [x.id, i]));
  const links = raids.edges.map((e) => [at.get(e.from), at.get(e.to)] as const).filter((l): l is readonly [number, number] => l[0] != null && l[1] != null && l[0] !== l[1]);
  // connected groups
  const parent = raids.nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b] of links) parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  raids.nodes.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  const comps = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
  const pos = raids.nodes.map(() => ({ x: 0, y: 0 }));
  const K = 90;                                         // preferred distance between neighbours
  const boxes: { w: number; h: number; idx: number[] }[] = [];
  for (const idx of comps) {
    const n = idx.length;
    idx.forEach((i, j) => { pos[i] = { x: Math.cos((j / n) * 2 * Math.PI) * K * 0.8 * (n > 1 ? 1 : 0), y: Math.sin((j / n) * 2 * Math.PI) * K * 0.6 * (n > 1 ? 1 : 0) }; });
    const own = links.filter(([a]) => idx.includes(a));
    for (let it = 0, temp = K; it < 250 && n > 2; it++, temp *= 0.98) {
      const d = idx.map(() => ({ x: 0, y: 0 }));
      idx.forEach((i, a) => idx.forEach((j, b) => {
        if (a >= b) return;
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, dd = Math.max(0.01, Math.hypot(dx, dy)), r = (K * K) / dd;
        d[a].x += (dx / dd) * r; d[a].y += (dy / dd) * r; d[b].x -= (dx / dd) * r; d[b].y -= (dy / dd) * r;
      }));
      for (const [i, j] of own) {
        const a = idx.indexOf(i), b = idx.indexOf(j);
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, dd = Math.max(0.01, Math.hypot(dx, dy)), r = (dd * dd) / K;
        d[a].x -= (dx / dd) * r; d[a].y -= (dy / dd) * r; d[b].x += (dx / dd) * r; d[b].y += (dy / dd) * r;
      }
      idx.forEach((i, a) => { const dd = Math.max(0.01, Math.hypot(d[a].x, d[a].y)); pos[i].x += (d[a].x / dd) * Math.min(dd, temp); pos[i].y += (d[a].y / dd) * Math.min(dd, temp) * 0.7; });
    }
    if (n === 2) { pos[idx[0]] = { x: -K * 0.6, y: 0 }; pos[idx[1]] = { x: K * 0.6, y: 0 }; }
    const xs = idx.map((i) => pos[i].x), ys = idx.map((i) => pos[i].y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    idx.forEach((i) => { pos[i].x -= x0; pos[i].y -= y0; });
    boxes.push({ w: Math.max(...xs) - x0, h: Math.max(...ys) - y0, idx });
  }
  // pack the groups in rows, leaving room for labels either side
  const W = 760, LAB = 120, GAP = 36;
  let x = LAB, y = 28, rowH = 0;
  for (const b of boxes) {
    if (x + b.w + LAB > W && x > LAB) { x = LAB; y += rowH + GAP; rowH = 0; }
    b.idx.forEach((i) => { pos[i].x += x; pos[i].y += y; });
    x += b.w + LAB * 2 + GAP; rowH = Math.max(rowH, b.h);
  }
  const H = Math.max(120, y + rowH + 28);
  const edges = raids.edges.map((e) => {
    const a = at.get(e.from), b = at.get(e.to);
    if (a == null || b == null || a === b) return '';
    const { x: ax, y: ay } = pos[a], { x: bx, y: by } = pos[b];
    const mx = (ax + bx) / 2 - (by - ay) * 0.18, my = (ay + by) / 2 + (bx - ax) * 0.18;     // a slight bend
    const d = Math.max(0.01, Math.hypot(bx - mx, by - my)), ex = bx - ((bx - mx) / d) * 9, ey = by - ((by - my) / d) * 9;
    return `<path class="e" data-a="${e.from}" data-b="${e.to}" d="M${ax.toFixed(1)} ${ay.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke-width="${Math.min(4, 1 + e.raids * 0.6).toFixed(1)}" marker-end="url(#rm-ar)"/>`;
  }).join('');
  const nodes = raids.nodes.map((n, i) => {
    const { x: px, y: py } = pos[i];
    // label away from the group's middle
    const mates = comps.find((g) => g.includes(i))!;
    const cx = mates.reduce((s, j) => s + pos[j].x, 0) / mates.length;
    const right = px >= cx;
    const href = c.page(n.login.toLowerCase());
    const label = `<text x="${(px + (right ? 10 : -10)).toFixed(1)}" y="${(py + 4).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(n.display_name || n.login)}</text>`;
    const g = `<g class="n${n.roster ? ' on' : ''}" data-id="${n.id}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${n.roster ? 5.5 : 4}"/>${label}</g>`;
    return href ? `<a href="${href}">${g}</a>` : g;
  }).join('');
  return `<div class="rmap"><svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${esc(c.ui.raids)}"><defs><marker id="rm-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${edges}${nodes}</svg></div>`;
}
