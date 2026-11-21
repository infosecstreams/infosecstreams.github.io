import { SESSIONS } from './sessions';
// Home hero: the rack, drawn with Rive's low-level renderer (the rivekit route:
// RuntimeLoader -> rt.load -> artboardByName -> StateMachineInstance ->
// makeRenderer, and we draw every frame ourselves). The high-level Rive() API
// is never used. /rive/rive.js + rive.wasm are @rive-app/webgl2 2.51.0,
// vendored; /rive/rack.riv comes from scripts/rive/build_rack.py.
//
// One sled per listed streamer, in a random slot. live.ts sends the data in a
// 'streams' event; this script lights LEDs, sizes bars, follows the cursor and
// prints the record for the sled under it into the terminal (real text).
// Clicking a sled slides it out as a rack console: the drawer front travels out
// of its slot (moved here), the deck and lid unfold (the .riv's 'open'
// animation, scrubbed forwards to open and backwards to close), and the
// streamer's card shows on the console's screen (HTML laid over it).

interface Streamer {
  login: string; display_name?: string; status: 'online' | 'prelive' | 'offline';
  title?: string; category?: string; language?: string; viewers?: number; started_at?: string; hours_30d?: number;
}
interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
interface RvNode { x: number; y: number; scaleX: number; scaleY: number }
interface RvArtboard { bounds: Bounds; advance(dt: number): void; draw(r: RvRenderer): void; node(n: string): RvNode; stateMachineByName(n: string): unknown; animationByName(n: string): unknown }
interface RvAnim { time: number; apply(mix: number): void }
interface RvSM { advance(dt: number): void }
interface RvRenderer { clear(): void; save(): void; restore(): void; flush(): void; align(fit: unknown, al: unknown, frame: Bounds, b: Bounds): void }
interface RvRuntime {
  load(b: Uint8Array): Promise<{ artboardByName(n: string): RvArtboard }>;
  makeRenderer(c: HTMLCanvasElement, useOffscreen?: boolean): RvRenderer;
  StateMachineInstance: new (sm: unknown, ab: RvArtboard) => RvSM;
  LinearAnimationInstance: new (a: unknown, ab: RvArtboard) => RvAnim;
  Fit: { contain: unknown }; Alignment: { center: unknown };
  requestAnimationFrame(cb: (t: number) => void): number;
  resolveAnimationFrame?: () => void;
}
interface RiveGlobal { RuntimeLoader: { setWasmUrl(u: string): void; getInstance(cb: (rt: RvRuntime) => void): void } }
interface Con { x: number; y: number; w: number; h: number; front: [number, number]; sx: number; sy: number; open: number; travel: number }
interface Geo { width: number; height: number; sledW: number; sledH: number; sleds: [number, number][]; con: Con }

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
  document.addEventListener('streams', (e) => {
    const d = (e as CustomEvent<{ ok: boolean; streamers: Streamer[] }>).detail;
    list = new Array(geo.sleds.length);
    for (const s of d.streamers) {
      const id = s.login.toLowerCase();
      let k = slotOf.get(id);
      if (k == null) { k = free.shift(); if (k == null) continue; slotOf.set(id, k); }
      list[k] = s;
    }
    maxH = Math.max(1, ...list.map((s) => s?.hours_30d ?? 0));
    paintNodes();
    // the card on an open console follows the live data
    const s = list[conIdx];
    const key = s ? `${s.status}|${s.viewers}|${s.title}|${s.category}` : '';
    if (s && conDir >= 0 && key !== conKey) { conKey = key; fill(); }
    kick();
  });

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
  interface Stats { last_live_at?: string; streams_30d?: number; median_stream_hours_30d?: number; avg_stream_hours_30d?: number; stream_days_per_week_30d?: number; avg_viewers_30d?: number }
  const stats = new Map<string, Promise<Stats | null>>();
  const statsFor = (login: string) => {
    if (!stats.has(login)) stats.set(login, fetch(`${API}stats/${encodeURIComponent(login)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return stats.get(login)!;
  };
  const pagePath = hero.dataset.page!;
  let conIdx = -1;        // the sled that is out (or on its way), -1: none
  let conT = 0;           // seconds into the 'open' animation
  let conDir = 0;         // +1 opening, -1 closing, 0 at rest
  let conKey = '';
  const CON = geo.con;

  function card(s: Streamer, st?: Stats | null) {
    const login = s.login.toLowerCase();
    const name = esc(s.display_name || s.login);
    const row = app.querySelector(`li[data-login="${CSS.escape(login)}"]`);
    const tw = row?.querySelector<HTMLAnchorElement>('a.tw'), yt = row?.querySelector<HTMLAnchorElement>('a.yt[href]');
    const kv = (k: string, v: string) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
    const state = s.status === 'online'
      ? `<span class="con-st on"><i class="led"></i>${esc(f('live'))}</span>`
      : s.status === 'prelive' ? `<span class="con-st pre"><i class="led pre"></i>${esc(f('prelive'))}</span>`
        : `<span class="con-st">${esc(f('offline'))}</span>`;
    let body = '';
    if (s.status !== 'offline') {
      const meta = [s.category, s.language ? names?.of(s.language) ?? s.language : ''].filter(Boolean).map((x) => esc(x)).join(' · ');
      const live = s.status === 'online'
        ? [s.viewers != null ? esc(f('viewers', { n: numF.format(s.viewers) })) : '', s.started_at ? esc(f('upFor', { t: dur(Date.now() - Date.parse(s.started_at)) })) : ''].filter(Boolean).join(' · ')
        : '';
      body = `<div class="con-live">${s.status === 'online'
        ? `<img class="con-th" src="${esc(thumb(login, 320, 180))}" srcset="${esc(thumb(login, 640, 360))} 2x" width="320" height="180" alt="" decoding="async">` : ''}
        <div class="con-d"><p class="con-t">${esc(s.title || '')}</p><p class="con-m">${meta}</p>${live ? `<p class="con-m">${live}</p>` : ''}</div></div>
        <dl class="con-kv">${kv(f('h30'), hrs(s.hours_30d))}</dl>`;
    } else {
      body = `<p class="con-m con-last">${st === undefined ? esc(f('loading')) : st?.last_live_at ? esc(f('lastLive', { t: ago(st.last_live_at) })) : esc(f('neverLive'))}</p>
      <dl class="con-kv">
        ${kv(f('h30'), hrs(s.hours_30d))}
        ${st ? kv(f('streams30'), st.streams_30d != null ? numF.format(st.streams_30d) : '—') : ''}
        ${st ? kv(f('avgLen'), hrs(st.median_stream_hours_30d ?? st.avg_stream_hours_30d)) : ''}
        ${st ? kv(f('daysWeek'), st.stream_days_per_week_30d != null ? numF.format(st.stream_days_per_week_30d) : '—') : ''}
      </dl>`;
    }
    const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
    return `<div class="con-top"><h2 class="con-n" id="con-n">${name}</h2>${state}
        <button class="con-x" type="button" aria-label="${esc(f('close'))}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg></button></div>
      <div class="con-body">${body}</div>
      <div class="con-ft"><a class="con-go" href="${pagePath}?u=${encodeURIComponent(login)}">${esc(f('allStats'))} <span aria-hidden="true">→</span></a>
        <span class="lk">${tw ? `<a class="tw" href="${esc(tw.href)}" target="_blank" rel="noopener" aria-label="${esc(tw.getAttribute('aria-label') || 'Twitch')}">${icon('twitch')}</a>` : ''}
        ${yt ? `<a class="yt" href="${esc(yt.href)}" target="_blank" rel="noopener" aria-label="${esc(yt.getAttribute('aria-label') || 'YouTube')}">${icon('youtube')}</a>` : ''}</span></div>`;
  }
  function fill() {
    const s = list[conIdx];
    if (!s) return;
    const login = s.login.toLowerCase();
    if (s.status !== 'offline') { scr.innerHTML = card(s); return; }
    scr.innerHTML = card(s);
    void statsFor(login).then((st) => { if (list[conIdx]?.login.toLowerCase() === login) scr.innerHTML = card(s, st); });
  }
  // With the runtime drawing, the HTML screen shows once the lid is up; on the
  // static rack (no WebGL, or before the runtime loads) CSS unfolds it.
  const showScreen = (on: boolean) => conEl.classList.toggle('lit', on);
  function openCon(i: number) {
    if (!list[i]) return;
    select(-1);
    conIdx = i; conKey = ''; fill();
    conEl.hidden = false;
    box.classList.add('con-open');
    if (!rt || reduce.matches) { conT = CON.open; conDir = 0; requestAnimationFrame(() => showScreen(true)); }
    else { conDir = 1; if (conT >= CON.open) conT = 0; }
    conEl.focus({ preventScroll: true });
    kick();
  }
  function closeCon() {
    if (conIdx < 0 || conDir === -1) return;
    showScreen(false);
    box.classList.remove('con-open');
    if (!rt || reduce.matches) { conT = 0; conDir = 0; conIdx = -1; conEl.hidden = true; kick(); return; }
    conDir = -1; kick();
  }
  conEl.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.con-x')) closeCon();
    else if (!(e.target as Element).closest('.con-scr')) closeCon();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && conIdx >= 0) closeCon(); });

  box.addEventListener('pointermove', (e) => {
    if (conIdx >= 0) return;
    kick();
    const [x, y] = toArt(e);
    const i = hit(x, y);
    if (e.pointerType === 'mouse') select(i >= 0 && list[i] ? i : -1);
  });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse' || conIdx >= 0) return; select(-1); kick(); });
  box.addEventListener('click', (e) => {
    if (conIdx >= 0 || (e.target as Element).closest('#con')) return;
    const [x, y] = toArt(e as PointerEvent);
    const i = hit(x, y);
    if (i >= 0 && list[i]) openCon(i);
  });

  // ---- Rive (low-level) ----
  let rt: RvRuntime | null = null, ab: RvArtboard | null = null, sm: RvSM | null = null, renderer: RvRenderer | null = null;
  const nodes: { on: RvNode; pre: RvNode; bar: RvNode }[] = [];
  let selNode: RvNode, selBar: RvNode, scanNode: RvNode;
  let conNode: RvNode, holeNode: RvNode, frontNode: RvNode, conOn: RvNode, conPre: RvNode, conBar: RvNode, openAnim: RvAnim;
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  // The console's pose at conT: the front travels out of the slot, then the
  // 'open' timeline (deck, lid, scrim, backlight) takes over.
  function poseCon(pulse: number) {
    const s = list[conIdx];
    conNode.scaleX = conNode.scaleY = s ? 1 : 0;
    if (!s) return;
    const [sx, sy] = geo.sleds[conIdx];
    const e = ease(Math.min(1, conT / CON.travel));
    holeNode.x = sx; holeNode.y = sy;
    frontNode.x = lerp(sx, CON.front[0], e); frontNode.y = lerp(sy, CON.front[1], e);
    frontNode.scaleX = lerp(1 / CON.sx, 1, e); frontNode.scaleY = lerp(1 / CON.sy, 1, e);
    conOn.scaleX = conOn.scaleY = s.status === 'online' ? pulse : 0;
    conPre.scaleX = conPre.scaleY = s.status === 'prelive' ? 1 : 0;
    conBar.scaleX = s.hours_30d ? Math.max(0.02, s.hours_30d / maxH) : 0.001;
    openAnim.time = conT; openAnim.apply(1);
  }
  // Frames are drawn only while something changes: a pointer move, new data, a
  // glide still settling, or the scan sweep. Otherwise the page is idle.
  let pending = false;
  function kick() { if (rt && !pending) { pending = true; prev = 0; rt.requestAnimationFrame(loop); } }
  const cur = { x: 0, y: 0, s: 0, bar: 0 };

  // Before the runtime loads, the static SVG rack shows the same LEDs and bars.
  function paintSvg() {
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
  // screen; full rate while the selection or parallax is still moving. Nothing
  // at all while it is off screen, the tab is hidden, or motion is reduced.
  function loop(t: number) {
    pending = false;
    if (!rt || !ab || !renderer) return;
    if (!visible || document.hidden) return;   // kick() restarts it
    const tgt = sel >= 0 ? geo.sleds[sel] : null;
    let moving = Math.abs(cur.s - (tgt ? 1 : 0)) > 0.002
      || (!!tgt && (Math.abs(cur.x - tgt[0]) > 0.1 || Math.abs(cur.y - tgt[1]) > 0.1));
    const ambient = !reduce.matches && !lean;
    if (conDir) moving = true;
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
        // the console: closing runs a little faster than opening
        if (conDir) {
          conT = Math.min(CON.open, Math.max(0, conT + dt * conDir * (conDir < 0 ? 1.6 : 1)));
          if (conDir > 0 && conT >= CON.open - 0.1) showScreen(true);
          if (conDir > 0 && conT >= CON.open) conDir = 0;
          if (conDir < 0 && conT <= 0) { conDir = 0; conIdx = -1; conEl.hidden = true; }
        }
        poseCon(pulse);
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
        box.classList.remove('rive-on'); rt = null;
        if (conIdx >= 0) { if (conDir < 0) { conIdx = -1; conEl.hidden = true; } else showScreen(true); conT = CON.open; conDir = 0; }
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
  async function boot() {
    if (booting) return; booting = true;
    // ?rive forces the runtime on (review and testing on machines without a GPU).
    if (!force && softwareGL()) return;
    try {
      const bytes = fetch('/rive/rack.riv').then((r) => r.arrayBuffer());
      await loadScript('/rive/rive.js');
      const rive = (window as unknown as { rive: RiveGlobal }).rive;
      rive.RuntimeLoader.setWasmUrl('/rive/rive.wasm');
      rt = await new Promise<RvRuntime>((res) => rive.RuntimeLoader.getInstance(res));
      const file = await rt.load(new Uint8Array(await bytes));
      ab = file.artboardByName('Rack');
      sm = new rt.StateMachineInstance(ab.stateMachineByName('Rack'), ab);
      for (let i = 0; i < geo.sleds.length; i++) nodes.push({ on: ab.node(`on${i}`), pre: ab.node(`pre${i}`), bar: ab.node(`bar${i}`) });
      selNode = ab.node('sel'); selBar = ab.node('selbar'); scanNode = ab.node('scan');
      conNode = ab.node('con'); holeNode = ab.node('hole'); frontNode = ab.node('cfront');
      conOn = ab.node('con_on'); conPre = ab.node('con_pre'); conBar = ab.node('con_bar');
      openAnim = new rt.LinearAnimationInstance(ab.animationByName('open'), ab);
      paintNodes();
      renderer = rt.makeRenderer(canvas, false);
      kick();
    } catch (e) {
      console.warn('Rive did not load; the static rack stays.', e);
    }
  }
  // The runtime (~150 KB JS + ~1 MB WASM, gzipped) loads once the page has
  // settled, or at once on the visitor's first move, touch, key or scroll.
  // Until then the static rack above shows the same data.
  const intents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
  const go = () => { for (const ev of intents) removeEventListener(ev, go); void boot(); };
  for (const ev of intents) addEventListener(ev, go, { passive: true });
  const settled = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : go()), 1200);
  if (document.readyState === 'complete') settled(); else addEventListener('load', settled, { once: true });
}
export {};
