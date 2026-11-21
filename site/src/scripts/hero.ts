import { SESSIONS } from './sessions';
import { makeConsole } from './console';
import { heatmap } from '../lib/streamer-render';
import type { RiveGlobal, RvArtboard, RvNode, RvRenderer, RvRuntime, RvSM } from './rv';
// Home hero: the rack, drawn with Rive's low-level renderer (the rivekit route:
// RuntimeLoader -> rt.load -> artboardByName -> StateMachineInstance ->
// makeRenderer, and we draw every frame ourselves). The high-level Rive() API
// is never used. rive.js + rive.wasm (src/assets/rive/) are @rive-app/webgl2
// 2.51.0, vendored; rack.riv comes from scripts/rive/build_rack.py. All three
// ship with content-hashed URLs (data-rive), so browsers keep them across deploys.
//
// One sled per listed streamer, in a random slot. live.ts sends the data in a
// 'streams' event; this script lights LEDs, sizes bars, follows the cursor and
// prints the record for the sled under it into the terminal (real text).
// Clicking a sled slides it out of the rack as a console that fills most of
// the window (console.ts); the streamer's card shows on its screen.

interface Streamer {
  login: string; display_name?: string; status: 'online' | 'prelive' | 'offline';
  title?: string; category?: string; language?: string; viewers?: number; started_at?: string; hours_30d?: number;
}
interface Geo { width: number; height: number; sledW: number; sledH: number; sleds: [number, number][] }

const hero = document.getElementById('hero');
if (hero) startHero(hero);

function startHero(hero: HTMLElement) {
  const geo: Geo = JSON.parse(hero.dataset.geo!);
  const term = document.getElementById('term')!;
  const box = document.getElementById('rack-box')!;
  const canvas = document.getElementById('rack-c') as HTMLCanvasElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // ---- data ----
  // Each streamer gets a random sled the first time it is seen and keeps it
  // while the page is open (so the rack doesn't read as a ranking).
  let list: (Streamer | undefined)[] = [];
  let maxH = 1;
  const slotOf = new Map<string, number>();
  const free = [...geo.sleds.keys()];
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  type Detail = { ok: boolean; streamers: Streamer[] };
  document.addEventListener('streams', (e) => onStreams((e as CustomEvent<Detail>).detail));
  // live.ts may have sent its first data before this script started listening.
  queueMicrotask(() => { const d = (window as unknown as { __streams?: Detail }).__streams; if (d && !list.length) onStreams(d); });
  function onStreams(d: Detail) {
    list = new Array(geo.sleds.length);
    // More streamers than sleds: the one in a shared link (?s=) gets a sled
    // first, then whoever is live, then by 30-day hours (the list's order).
    const rank = (x: Streamer) => (x.login.toLowerCase() === deep ? 0 : x.status === 'online' ? 1 : x.status === 'prelive' ? 2 : 3);
    const order = d.streamers.map((x, i) => [x, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([x]) => x);
    for (const s of order) {
      const id = s.login.toLowerCase();
      let k = slotOf.get(id);
      if (k == null) { k = free.shift(); if (k == null) continue; slotOf.set(id, k); }
      list[k] = s;
    }
    maxH = Math.max(1, ...list.map((s) => s?.hours_30d ?? 0));
    paintNodes();
    // the card on an open console follows the live data (not while a player runs)
    const s = con && con.index >= 0 ? list[con.index] : undefined;
    const key = s ? `${s.status}|${s.viewers}|${s.title}|${s.category}` : '';
    if (s && key !== conKey) { conKey = key; fill(con.index); }
    kick();
    // A shared link (?s=<login>) opens that streamer's console once the data is in.
    if (deep) {
      const i = slotOf.get(deep); deep = '';
      if (i != null && list[i]) { go(); void Promise.race([riveReady, sleep(1500)]).then(() => { if (!con.busy) con.open(i); }); }
    }
  }
  let deep = (new URLSearchParams(location.search).get('s') ?? '').trim().toLowerCase();

  // ---- terminal (plain HTML; decorative: the list below carries the data) ----
  const MAX_LINES = 10;
  const PS = '<span class="ps">~&gt;</span> ';
  let lines: string[] = [];
  let job = 0;                       // bumping it cancels whatever is typing
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const draw = (tail?: string) => {
    term.innerHTML = [...lines, tail ?? `<p class="cmd">${PS}<span class="caret"></span></p>`].slice(-MAX_LINES).join('');
  };
  const tone = (l: string) => (/\[\+\]|Cracked|ESTABLISHED/.test(l) ? 'ok' : /\[-\]|error/i.test(l) ? 'bad' : '');
  async function run(cmd: string, out: string[], gen: number, cps: number) {
    if (reduce.matches) {
      lines.push(`<p class="cmd">${PS}${esc(cmd)}</p>`, ...out); draw(); return gen === job;
    }
    for (let n = 1; n <= cmd.length; n++) {
      if (gen !== job) return false;
      draw(`<p class="cmd">${PS}${esc(cmd.slice(0, n))}<span class="caret"></span></p>`);
      await sleep(1000 / cps * (0.6 + Math.random() * 0.9));
    }
    lines.push(`<p class="cmd">${PS}${esc(cmd)}</p>`);
    draw('');
    await sleep(cps > 60 ? 60 : 380);    // the tool thinking
    for (const l of out) {
      if (gen !== job) return false;
      lines.push(l); draw('');
      await sleep(cps > 60 ? 12 : 45 + Math.random() * 110);
    }
    draw();
    return gen === job;
  }
  // Idle: the kind of work these streams show (sessions.ts).
  let si = 0;
  async function session() {
    const gen = ++job;
    while (gen === job) {
      for (const [cmd, out] of SESSIONS[si]) {
        if (!(await run(cmd, out.map((l) => `<p class="out ${tone(l)}">${esc(l)}</p>`), gen, 26))) return;
        if (reduce.matches) continue;
        await sleep(1500);
      }
      if (reduce.matches) return;
      await sleep(2200);
      if (gen !== job) return;
      lines = [];
      si = (si + 1) % SESSIONS.length;
    }
  }
  // Pointing at a sled: that streamer's record from our own status.json, via jq.
  function json(s: Streamer) {
    const rec: [string, string | number | undefined][] = [
      ['login', s.login.toLowerCase()], ['status', s.status],
      ['title', s.status !== 'offline' ? s.title : undefined], ['category', s.status !== 'offline' ? s.category : undefined],
      ['language', s.status !== 'offline' ? s.language : undefined], ['viewers', s.status === 'online' ? s.viewers : undefined],
      ['started_at', s.status === 'online' ? s.started_at : undefined], ['hours_30d', s.hours_30d],
    ];
    const kept = rec.filter(([, v]) => v != null && v !== '');
    return ['<p class="out">{</p>', ...kept.map(([k, v], i) => {
      const val = typeof v === 'number' ? `<span class="n">${v}</span>`
        : `<span class="s">${esc(JSON.stringify(v))}</span>`;
      return `<p class="out">  <span class="k">"${k}"</span>: ${val}${i < kept.length - 1 ? ',' : ''}</p>`;
    }), '<p class="out">}</p>'];
  }
  let resume = 0;
  function showStreamer(s: Streamer) {
    clearTimeout(resume);
    const gen = ++job;
    lines = [];
    void run(`jq '.streamers[] | select(.login=="${s.login.toLowerCase()}")' status.json`, json(s), gen, 140);
  }
  function backToSession() {
    clearTimeout(resume);
    resume = window.setTimeout(() => { lines = []; void session(); }, 900);
  }
  void session();

  // ---- pointer: which sled is under the cursor ----
  let sel = -1;
  const toArt = (e: PointerEvent) => {
    const b = box.getBoundingClientRect(), s = Math.min(b.width / geo.width, b.height / geo.height);
    return [(e.clientX - b.left - (b.width - geo.width * s) / 2) / s, (e.clientY - b.top - (b.height - geo.height * s) / 2) / s];
  };
  const hit = (x: number, y: number) => geo.sleds.findIndex(([sx, sy]) => x >= sx && x <= sx + geo.sledW && y >= sy - 1 && y <= sy + geo.sledH + 1);
  function select(i: number) {
    if (i === sel) return;
    sel = i;
    kick();
    box.style.cursor = i >= 0 && list[i] ? 'pointer' : '';
    if (i >= 0 && list[i]) showStreamer(list[i]!); else backToSession();
  }
  // ---- the console: click (or tap) a sled and it slides out ----
  const conEl = document.getElementById('con')!;
  const scr = conEl.querySelector<HTMLElement>('.con-scr')!;
  const app = document.getElementById('app')!;
  const API = app.dataset.api!, THUMB = app.dataset.thumb!;
  const ui: Record<string, string> = JSON.parse(conEl.dataset.ui!);
  const lang = document.documentElement.lang;
  const f = (k: string, v: Record<string, string | number> = {}) => (ui[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const numF = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const rel = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  let names: Intl.DisplayNames | undefined;
  try { names = new Intl.DisplayNames([lang], { type: 'language' }); } catch { /* old browser */ }
  const ago = (iso: string) => {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    return Math.abs(m) < 60 ? rel.format(m, 'minute') : Math.abs(m) < 2880 ? rel.format(Math.round(m / 60), 'hour') : rel.format(Math.round(m / 1440), 'day');
  };
  const dur = (ms: number) => { const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4); return h ? `${h}h ${m}m` : `${m}m`; };
  const hrs = (x?: number) => (x == null ? '—' : `${numF.format(x)} h`);
  const thumb = (login: string, w: number, h: number) =>
    THUMB.replace('{login}', encodeURIComponent(login)).replace('{w}', String(w)).replace('{h}', String(h))
    + (/^https:/.test(THUMB) ? `?t=${Math.floor(Date.now() / 300000)}` : '');
  const stats = new Map<string, Promise<Stats | null>>();
  const statsFor = (login: string) => {
    if (!stats.has(login)) stats.set(login, fetch(`${API}stats/${encodeURIComponent(login)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return stats.get(login)!;
  };
  const pagePath = hero.dataset.page!;
  let conKey = '';
  interface Stats {
    last_live_at?: string; streams_30d?: number; median_stream_hours_30d?: number; avg_stream_hours_30d?: number;
    stream_days_per_week_30d?: number; avg_viewers_30d?: number; followers?: number; peak_viewers_30d?: number;
    recent_streams?: { started_at: string; ended_at?: string; hours: number; categories?: string[] }[];
    heatmap_90d?: number[][];
  }
  const day = new Intl.DateTimeFormat(lang, { weekday: 'short', month: 'short', day: 'numeric' });
  const n0 = (x?: number) => (x == null ? '—' : numF.format(x));
  const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // The screen: who it is, what they are doing now, and the last 30 days.
  function card(s: Streamer, st?: Stats | null) {
    const login = s.login.toLowerCase();
    const name = esc(s.display_name || s.login);
    const row = app.querySelector(`li[data-login="${CSS.escape(login)}"]`);
    const tw = row?.querySelector<HTMLAnchorElement>('a.tw'), yt = row?.querySelector<HTMLAnchorElement>('a.yt[href]');
    // tiles without a value are left out ("when unsure, show nothing")
    const kv = (k: string, v: string) => (v === '—' ? '' : `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`);
    const state = s.status === 'online'
      ? `<span class="con-st on"><i class="led"></i>${esc(f('live'))}</span>`
      : s.status === 'prelive' ? `<span class="con-st pre"><i class="led pre"></i>${esc(f('prelive'))}</span>`
        : `<span class="con-st">${esc(f('offline'))}</span>`;
    const recent = (st?.recent_streams ?? []).slice(0, 4).map((r) =>
      `<li><span>${esc(day.format(new Date(r.started_at)))}</span><span>${esc(dur(r.hours * 36e5))}</span><span>${esc(r.categories?.find((c) => !/backfill/i.test(c)) ?? '')}</span></li>`).join('');
    const rec = recent ? `<div class="con-rec"><h3>${esc(f('recent'))}</h3><ol>${recent}</ol></div>` : '';
    let now = '';
    if (s.status !== 'offline') {
      const meta = [s.category, s.language ? names?.of(s.language) ?? s.language : ''].filter(Boolean).map((x) => esc(x)).join(' · ');
      const live = s.status === 'online'
        ? [s.viewers != null ? esc(f('viewers', { n: numF.format(s.viewers) })) : '', s.started_at ? esc(f('upFor', { t: dur(Date.now() - Date.parse(s.started_at)) })) : ''].filter(Boolean).join(' · ')
        : '';
      now = `<div class="con-now">${s.status === 'online'
        ? `<div class="con-pl"><img src="${esc(thumb(login, 640, 360))}" srcset="${esc(thumb(login, 1280, 720))} 2x" width="640" height="360" alt="" decoding="async"></div>` : ''}
        <div class="con-d"><p class="con-t">${esc(s.title || '')}</p><p class="con-m">${meta}</p>${live ? `<p class="con-m">${live}</p>` : ''}${rec}</div></div>`;
    } else {
      const hm = heatmap(st?.heatmap_90d, lang, -new Date().getTimezoneOffset() / 60, f('usually'));
      now = `<p class="con-last">${st === undefined ? esc(f('loading')) : st?.last_live_at ? esc(f('lastLive', { t: ago(st.last_live_at) })) : esc(f('neverLive'))}</p>
        <div class="con-off">${rec}${hm ? `<div class="con-heat"><h3>${esc(f('usually'))} <small>${esc(f('localTime'))}</small></h3>${hm}</div>` : ''}</div>`;
    }
    const facts = `<dl class="con-kv">
        ${kv(f('h30'), hrs(s.hours_30d))}
        ${kv(f('streams30'), n0(st?.streams_30d))}
        ${kv(f('avgLen'), hrs(st?.median_stream_hours_30d ?? st?.avg_stream_hours_30d))}
        ${kv(f('daysWeek'), n0(st?.stream_days_per_week_30d))}
        ${kv(f('avgViewers'), n0(st?.avg_viewers_30d))}
        ${kv(f('followers'), n0(st?.followers))}
      </dl>`;
    return `<div class="con-top"><h2 class="con-n" id="con-n">${name}</h2>${state}
        <button class="con-x" type="button" aria-label="${esc(f('close'))}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg></button></div>
      <div class="con-body">${now}${facts}</div>
      <div class="con-ft"><a class="con-go" href="${pagePath}/${encodeURIComponent(login)}">${esc(f('allStats'))} <span aria-hidden="true">→</span></a>
        <button class="con-share" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2"/></svg><span>${esc(f('copyLink'))}</span></button>
        <span class="lk">${tw ? `<a class="tw" href="${esc(tw.href)}" target="_blank" rel="noopener" aria-label="${esc(tw.getAttribute('aria-label') || 'Twitch')}">${icon('twitch')}</a>` : ''}
        ${yt ? `<a class="yt" href="${esc(yt.href)}" target="_blank" rel="noopener" aria-label="${esc(yt.getAttribute('aria-label') || 'YouTube')}">${icon('youtube')}</a>` : ''}</span></div>`;
  }
  // The stream itself plays on the screen once the lid is up: Twitch's player,
  // muted (browsers only autoplay muted; its own controls unmute). Twitch
  // asks for at least 400 x 300, so smaller screens keep the preview image.
  function embed(i: number) {
    const s = list[i], pl = scr.querySelector<HTMLElement>('.con-pl');
    if (!s || s.status !== 'online' || !pl || pl.querySelector('iframe')) return;
    if (pl.offsetWidth < 400 || pl.offsetHeight < 300) return;
    const q = new URLSearchParams({ channel: s.login.toLowerCase(), parent: location.hostname, muted: 'true', autoplay: String(!reduce.matches) });
    const fr = document.createElement('iframe');
    fr.src = `https://player.twitch.tv/?${q}`;
    fr.title = f('livePlayer', { name: s.display_name || s.login });
    fr.allow = 'autoplay; fullscreen; picture-in-picture';
    fr.allowFullscreen = true;
    fr.addEventListener('load', () => pl.classList.add('playing'), { once: true });
    pl.appendChild(fr);
  }
  // New data while the console is open: swap the text parts, never the player.
  function patch(html: string) {
    const t = document.createElement('div'); t.innerHTML = html;
    for (const sel of ['.con-st', '.con-d', '.con-kv', '.con-last']) {
      const a = scr.querySelector(sel), b = t.querySelector(sel);
      if (a && b) a.replaceWith(b);
    }
  }
  const statsCache = new Map<string, Stats | null>();
  function fill(i: number) {
    const s = list[i];
    if (!s) return;
    const login = s.login.toLowerCase();
    const html = card(s, statsCache.get(login));
    // keep a running player while the stream is still live
    if (scr.querySelector('.con-pl iframe') && s.status === 'online') patch(html); else scr.innerHTML = html;
    if (statsCache.has(login)) return;
    void statsFor(login).then((st) => {
      statsCache.set(login, st);
      if (con.index !== i) return;
      const html = card(list[i] ?? s, st);
      if (scr.querySelector('.con-pl iframe')) patch(html); else scr.innerHTML = html;
    });
  }

  const sledRect = (i: number) => {
    const b = box.getBoundingClientRect(), s = Math.min(b.width / geo.width, b.height / geo.height);
    const ox = b.left + (b.width - geo.width * s) / 2, oy = b.top + (b.height - geo.height * s) / 2;
    return { x: ox + geo.sleds[i][0] * s, y: oy + geo.sleds[i][1] * s, w: geo.sledW * s, h: geo.sledH * s };
  };
  let slot = -1;   // the sled whose slot shows empty while it is out
  const con = makeConsole({
    el: conEl, reduce, sledRect,
    led: (i) => list[i]?.status ?? 'offline',
    share: (i) => (list[i]?.hours_30d ? Math.max(0.02, list[i]!.hours_30d! / maxH) : 0),
    onOpen: (i) => { conKey = ''; select(-1); fill(i); conEl.querySelector('.con-tag')!.textContent = list[i]?.login ?? ''; },
    onShown: (i) => embed(i),
    onSlot: (i) => { slot = i; paintHole(); paintNames(); kick(); setUrl(i >= 0 ? list[i]?.login.toLowerCase() ?? null : null); },
  });

  // The open console's address: ?s=<login>, so it can be shared (and Back/reload keeps it).
  function setUrl(login: string | null) {
    const u = new URL(location.href);
    if (login) u.searchParams.set('s', login); else u.searchParams.delete('s');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  }
  scr.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.con-share');
    const s = list[con.index];
    if (!b || !s) return;
    // /s/<login>: a page whose link preview shows this streamer, then opens their console
    const url = `${location.origin}${location.pathname.replace(/\/?$/, '/')}s/${encodeURIComponent(s.login.toLowerCase())}`;
    const done = () => { const l = b.querySelector('span')!; l.textContent = f('linkCopied'); setTimeout(() => { l.textContent = f('copyLink'); }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('', url));
    else prompt('', url);
  });

  // ---- keyboard: the rack is one focusable control; arrows choose, Enter opens ----
  const say = document.getElementById('rack-say')!;
  const hoursF = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  function announce(i: number) {
    const s = list[i];
    if (!s) return;
    const st = s.status === 'online'
      ? [f('live'), s.viewers != null ? f('viewers', { n: numF.format(s.viewers) }) : ''].filter(Boolean).join(', ')
      : s.status === 'prelive' ? f('prelive') : f('offline');
    say.textContent = `${s.display_name || s.login}: ${st}. ${f('h30')}: ${f('hoursShort', { n: hoursF.format(s.hours_30d ?? 0) })}`;
  }
  function move(d: number) {
    const n = geo.sleds.length;
    let i = sel;
    if (i < 0) i = d > 0 ? -1 : n;
    do { i += d; } while (i >= 0 && i < n && !list[i]);
    if (i < 0 || i >= n) {
      // past the end of a row or column: wrap to the first/last streamer
      i = d > 0 ? list.findIndex(Boolean) : n - 1 - [...list].reverse().findIndex(Boolean);
    }
    if (i < 0 || i >= n || !list[i]) return;
    select(i); announce(i); kick();
  }
  box.addEventListener('keydown', (e) => {
    if (con.busy) return;
    const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 } as Record<string, number>)[e.key];
    if (d) { e.preventDefault(); go(); move(document.documentElement.dir === 'rtl' && Math.abs(d) === 1 ? -d : d); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); select(-1); move(e.key === 'Home' ? 1 : -1); return; }
    if ((e.key === 'Enter' || e.key === ' ') && sel >= 0 && list[sel]) { e.preventDefault(); con.open(sel); }
  });
  box.addEventListener('blur', () => { if (!con.busy) { select(-1); kick(); } });

  box.addEventListener('pointermove', (e) => {
    if (con.busy) return;
    kick();
    const [x, y] = toArt(e);
    const i = hit(x, y);
    if (e.pointerType === 'mouse') select(i >= 0 && list[i] ? i : -1);
  });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse' || con.busy) return; select(-1); kick(); });
  box.addEventListener('click', (e) => {
    if (con.busy) return;
    const [x, y] = toArt(e as PointerEvent);
    const i = hit(x, y);
    if (i >= 0 && list[i]) {
      // the runtime is usually on its way by now (pointing at the rack starts it): give it a moment
      if (booting && !rt) void Promise.race([riveReady, sleep(400)]).then(() => { if (!con.busy) con.open(i); });
      else con.open(i);
    }
  });

  // ---- Rive (low-level) ----
  let rt: RvRuntime | null = null, ab: RvArtboard | null = null, sm: RvSM | null = null, renderer: RvRenderer | null = null;
  const nodes: { on: RvNode; pre: RvNode; bar: RvNode }[] = [];
  let selNode: RvNode, selBar: RvNode, scanNode: RvNode;
  let conNode: RvNode, holeNode: RvNode;
  // The slot a sled left while it is out as the console: empty, in the canvas
  // and on the static rack.
  function paintHole() {
    if (ab) {
      conNode.scaleX = conNode.scaleY = slot >= 0 ? 1 : 0;
      if (slot >= 0) { holeNode.x = geo.sleds[slot][0]; holeNode.y = geo.sleds[slot][1]; }
    }
    const svg = box.querySelector('svg');
    let r = svg?.querySelector<SVGRectElement>('#r-hole');
    if (svg && !r) {
      r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.id = 'r-hole'; r.setAttribute('fill', '#050608'); r.setAttribute('stroke', '#2a2d31');
      r.setAttribute('width', String(geo.sledW)); r.setAttribute('height', String(geo.sledH));
      svg.appendChild(r);
    }
    if (r) {
      r.setAttribute('visibility', slot >= 0 ? 'visible' : 'hidden');
      if (slot >= 0) { r.setAttribute('x', String(geo.sleds[slot][0])); r.setAttribute('y', String(geo.sleds[slot][1])); }
    }
  }
  // Frames are drawn only while something changes: a pointer move, new data, a
  // glide still settling, or the scan sweep. Otherwise the page is idle.
  let pending = false;
  function kick() { if (rt && !pending) { pending = true; prev = 0; rt.requestAnimationFrame(loop); } }
  const cur = { x: 0, y: 0, s: 0, bar: 0 };

  // Before the runtime loads, the static SVG rack shows the same LEDs and bars.
  const plates = [...box.querySelectorAll<HTMLElement>('.rack-names span')];
  function paintNames() {
    plates.forEach((el, i) => {
      const s = i === slot ? undefined : list[i];
      const name = s ? s.display_name || s.login : '';
      if (el.textContent !== name) el.textContent = name;
      el.className = s?.status === 'online' ? 'on' : s?.status === 'prelive' ? 'pre' : '';
    });
  }
  function paintSvg() {
    paintNames();
    const svg = box.querySelector('svg');
    if (!svg) return;
    for (let i = 0; i < geo.sleds.length; i++) {
      const s = list[i];
      const show = (id: string, on: boolean) => svg.getElementById(id)?.setAttribute('visibility', on ? 'visible' : 'hidden');
      show(`r-on${i}`, s?.status === 'online');
      show(`r-pre${i}`, s?.status === 'prelive');
      const bar = svg.getElementById(`r-bar${i}`) as SVGRectElement | null;
      if (bar) {
        bar.dataset.w ??= bar.getAttribute('width')!;
        const share = s?.hours_30d ? Math.max(0.02, s.hours_30d / maxH) : 0;
        bar.setAttribute('width', String(Number(bar.dataset.w) * share));
        bar.setAttribute('visibility', share ? 'visible' : 'hidden');
      }
    }
  }
  function paintNodes() {
    paintSvg();
    if (!ab) return;
    nodes.forEach((n, i) => {
      const s = list[i];
      const on = s?.status === 'online' ? 1 : 0, pre = s?.status === 'prelive' ? 1 : 0;
      n.on.scaleX = n.on.scaleY = on;
      n.pre.scaleX = n.pre.scaleY = pre;
      n.bar.scaleX = s?.hours_30d ? Math.max(0.02, s.hours_30d / maxH) : 0;
    });
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(box);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  let prev = 0, lastDraw = 0, cost = 0, frames = 0, lean = false;
  // Ambient (scan sweep, live LEDs breathing) at ~30 fps while the rack is on
  // screen; full rate while the selection or the console is still moving. Nothing
  // at all while it is off screen, the tab is hidden, or motion is reduced.
  function loop(t: number) {
    pending = false;
    if (!rt || !ab || !renderer) return;
    if (!visible || document.hidden) return;   // kick() restarts it
    const tgt = sel >= 0 ? geo.sleds[sel] : null;
    const moving = Math.abs(cur.s - (tgt ? 1 : 0)) > 0.002
      || (!!tgt && (Math.abs(cur.x - tgt[0]) > 0.1 || Math.abs(cur.y - tgt[1]) > 0.1));
    // behind an open console the rack holds still
    const ambient = !reduce.matches && !lean && !con.busy;
    if (moving || t - lastDraw >= 33 || !lastDraw) {
      const t0 = performance.now();
      const dt = prev ? Math.min(0.05, (t - prev) / 1000) : 0; prev = t; lastDraw = t;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        // the selection glides to its sled
        const k = 1 - Math.exp(-dt / 0.07);
        if (tgt) { cur.x += (tgt[0] - cur.x) * (cur.s > 0.02 ? k : 1); cur.y += (tgt[1] - cur.y) * (cur.s > 0.02 ? k : 1); }
        cur.s += ((tgt ? 1 : 0) - cur.s) * k;
        cur.bar += (((tgt && list[sel]?.hours_30d) ? list[sel]!.hours_30d! / maxH : 0) - cur.bar) * k;
        selNode.x = cur.x; selNode.y = cur.y; selNode.scaleX = selNode.scaleY = cur.s < 0.02 ? 0 : 1;
        selBar.scaleX = Math.max(0.001, cur.bar);
        scanNode.scaleY = ambient ? 1 : 0;
        const pulse = ambient ? 0.88 + 0.14 * Math.sin(t / 420) : 1;
        if (ambient) {
          sm!.advance(dt);
          nodes.forEach((n, i) => { if (list[i]?.status === 'online') n.on.scaleX = n.on.scaleY = pulse; });
        }
        ab.advance(dt);
        renderer.clear(); renderer.save();
        renderer.align(rt.Fit.contain, rt.Alignment.center, { minX: 0, minY: 0, maxX: w, maxY: h }, ab.bounds);
        ab.draw(renderer); renderer.restore(); renderer.flush();
        if (!box.classList.contains('rive-on')) box.classList.add('rive-on');
      }
      // Keep it snappy on slow machines: a frame over ~16 ms on average drops
      // the ambient motion (frames only on interaction); over ~45 ms the
      // static rack takes over again.
      cost = cost ? cost * 0.8 + (performance.now() - t0) * 0.2 : performance.now() - t0;
      if (!force && ++frames > 8 && cost > 45) {
        box.classList.remove('rive-on'); rt = null; con.detach();
        return;
      }
      if (!force && frames > 8 && cost > 16) lean = true;
    }
    rt.resolveAnimationFrame?.();
    if (ambient || moving) { pending = true; rt.requestAnimationFrame(loop); }
  }

  function loadScript(src: string) {
    return new Promise<void>((res, rej) => {
      if ((window as unknown as { rive?: RiveGlobal }).rive) return res();
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('rive.js failed'));
      document.head.appendChild(s);
    });
  }
  // A software WebGL renderer (no GPU) would make every frame a long task: keep
  // the static rack there and skip the download.
  function softwareGL() {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch { return true; }
  }
  const force = new URLSearchParams(location.search).has('rive');
  let booting = false;
  let readyNow: () => void = () => {};
  const riveReady = new Promise<void>((r) => { readyNow = r; });
  async function boot() {
    if (booting) return; booting = true;
    // ?rive forces the runtime on (review and testing on machines without a GPU).
    if (!force && softwareGL()) return readyNow();
    try {
      const [jsUrl, wasmUrl, rivUrl] = JSON.parse(hero.dataset.rive!) as string[];
      const bytes = fetch(rivUrl).then((r) => r.arrayBuffer());
      await loadScript(jsUrl);
      const rive = (window as unknown as { rive: RiveGlobal }).rive;
      rive.RuntimeLoader.setWasmUrl(wasmUrl);
      rt = await new Promise<RvRuntime>((res) => rive.RuntimeLoader.getInstance(res));
      const file = await rt.load(new Uint8Array(await bytes));
      ab = file.artboardByName('Rack');
      sm = new rt.StateMachineInstance(ab.stateMachineByName('Rack'), ab);
      for (let i = 0; i < geo.sleds.length; i++) nodes.push({ on: ab.node(`on${i}`), pre: ab.node(`pre${i}`), bar: ab.node(`bar${i}`) });
      selNode = ab.node('sel'); selBar = ab.node('selbar'); scanNode = ab.node('scan');
      conNode = ab.node('con'); holeNode = ab.node('hole');
      paintNodes(); paintHole();
      con.attach(rt, file);
      renderer = rt.makeRenderer(canvas, false);
      kick();
    } catch (e) {
      console.warn('Rive did not load; the static rack stays.', e);
    }
    readyNow();
  }
  // The runtime (~150 KB JS + ~1 MB WASM, gzipped; cached across deploys)
  // loads once the page has settled on a fast connection and a capable device,
  // or as soon as the visitor reaches for the rack (pointer over it, focus,
  // touch). Never when the browser asks to save data or the connection is slow:
  // the static rack and the CSS console do the same job there.
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const lite = !force && (!!net?.saveData || /(^|-)2g|3g/.test(net?.effectiveType ?? ''));
  const weak = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) < 4 || (navigator.hardwareConcurrency || 8) < 4;
  const go = () => { if (!lite) void boot(); };
  if (lite) readyNow();
  else {
    for (const ev of ['pointerenter', 'focus', 'touchstart'] as const) box.addEventListener(ev, go, { passive: true, once: true });
    if (!weak) {
      const settled = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : go()), 1200);
      if (document.readyState === 'complete') settled(); else addEventListener('load', settled, { once: true });
    }
  }
}
export {};
