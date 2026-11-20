// Home hero: the rack, drawn with Rive's low-level renderer (the rivekit route:
// RuntimeLoader -> rt.load -> artboardByName -> StateMachineInstance ->
// makeRenderer, and we draw every frame ourselves). The high-level Rive() API
// is never used. /rive/rive.js + rive.wasm are @rive-app/webgl2 2.51.0,
// vendored; /rive/rack.riv comes from scripts/rive/build_rack.py.
//
// One sled per listed streamer, most hours first. live.ts sends the data in a
// 'streams' event; this script lights LEDs, sizes bars, follows the cursor and
// writes `whois` for the sled under it into the terminal (real text).

interface Streamer {
  login: string; display_name?: string; status: 'online' | 'prelive' | 'offline';
  title?: string; category?: string; language?: string; viewers?: number; started_at?: string; hours_30d?: number;
}
interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
interface RvNode { x: number; y: number; scaleX: number; scaleY: number }
interface RvArtboard { bounds: Bounds; advance(dt: number): void; draw(r: RvRenderer): void; node(n: string): RvNode; stateMachineByName(n: string): unknown }
interface RvSM { advance(dt: number): void }
interface RvRenderer { clear(): void; save(): void; restore(): void; flush(): void; align(fit: unknown, al: unknown, frame: Bounds, b: Bounds): void }
interface RvRuntime {
  load(b: Uint8Array): Promise<{ artboardByName(n: string): RvArtboard }>;
  makeRenderer(c: HTMLCanvasElement, useOffscreen?: boolean): RvRenderer;
  StateMachineInstance: new (sm: unknown, ab: RvArtboard) => RvSM;
  Fit: { contain: unknown }; Alignment: { center: unknown };
  requestAnimationFrame(cb: (t: number) => void): number;
  resolveAnimationFrame?: () => void;
}
interface RiveGlobal { RuntimeLoader: { setWasmUrl(u: string): void; getInstance(cb: (rt: RvRuntime) => void): void } }
interface Geo { width: number; height: number; sledW: number; sledH: number; sleds: [number, number][] }

const hero = document.getElementById('hero');
if (hero) startHero(hero);

function startHero(hero: HTMLElement) {
  const geo: Geo = JSON.parse(hero.dataset.geo!);
  const ui: Record<string, string> = JSON.parse(hero.dataset.ui!);
  const term = document.getElementById('term')!;
  const box = document.getElementById('rack-box')!;
  const canvas = document.getElementById('rack-c') as HTMLCanvasElement;
  const lang = document.documentElement.lang;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const f = (k: string, v: Record<string, string | number>) => (ui[k] ?? '').replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const name = (s: Streamer) => s.display_name || s.login;
  const twitch = (s: Streamer) => `https://www.twitch.tv/${encodeURIComponent(s.login)}`;
  const up = (iso?: string) => {
    if (!iso) return '';
    const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };
  let langName: (c?: string) => string = (c) => c ?? '';
  try { const d = new Intl.DisplayNames([lang], { type: 'language' }); langName = (c) => (c ? d.of(c) ?? c : ''); } catch { /* keep codes */ }

  // ---- data ----
  let list: Streamer[] = [];
  let ok: boolean | undefined;
  let maxH = 1;
  document.addEventListener('streams', (e) => {
    const d = (e as CustomEvent<{ ok: boolean; streamers: Streamer[] }>).detail;
    list = d.streamers.slice(0, geo.sleds.length);
    ok = d.ok;
    maxH = Math.max(1, ...list.map((s) => s.hours_30d ?? 0));
    paintNodes();
    kick();
    if (sel < 0) writeIdle();
    else if (list[sel]) writeWhois(list[sel], false);
  });

  // ---- terminal (plain HTML) ----
  const led = (s: Streamer) => `<i class="led ${s.status === 'online' ? 'on' : s.status === 'prelive' ? 'pre' : ''}" aria-hidden="true"></i>`;
  let typing = 0;
  function type(cmd: string, then: () => string) {
    clearTimeout(typing);
    const done = () => { term.innerHTML = `<p class="cmd"><span class="ps">~&gt;</span> ${esc(cmd)}</p>${then()}<p class="cmd"><span class="ps">~&gt;</span> <span class="caret"></span></p>`; };
    if (reduce.matches) return done();
    let n = 0;
    const step = () => {
      n += 2;
      term.innerHTML = `<p class="cmd"><span class="ps">~&gt;</span> ${esc(cmd.slice(0, n))}<span class="caret"></span></p>`;
      if (n < cmd.length) typing = window.setTimeout(step, 16); else done();
    };
    step();
  }
  function writeIdle() {
    const live = list.filter((s) => s.status === 'online');
    const pre = list.filter((s) => s.status === 'prelive');
    const lines = [...live, ...pre].slice(0, 5).map((s) =>
      `<p class="row">${led(s)}<a href="${twitch(s)}" target="_blank" rel="noopener">${esc(name(s))}</a>`
      + `<span class="dim">${s.status === 'online' ? esc([s.viewers != null ? f('viewers', { n: s.viewers }) : '', up(s.started_at)].filter(Boolean).join(' · ')) : esc(ui.prelive)}</span></p>`);
    const summary = ok === false ? ui.unavailable : ok === undefined ? ui.checking
      : live.length || pre.length ? `${live.length} ${ui.live.toLowerCase()} · ${pre.length} ${ui.prelive.toLowerCase()} · ${f('streamers', { n: list.length })}` : ui.nobodyLive;
    type('streams --live', () => lines.join('') + `<p class="out">${esc(summary)}</p>`);
  }
  function writeWhois(s: Streamer, animate = true) {
    const status = s.status === 'online'
      ? `${led(s)}${esc(ui.live.toLowerCase())}${s.viewers != null ? ` · ${esc(f('viewers', { n: s.viewers }))}` : ''}${s.started_at ? ` · up ${esc(up(s.started_at))}` : ''}`
      : s.status === 'prelive' ? `${led(s)}${esc(ui.prelive.toLowerCase())}` : `${led(s)}${esc(ui.offline.toLowerCase())}`;
    const rows: [string, string][] = [
      ['handle', `<a href="${twitch(s)}" target="_blank" rel="noopener">${esc(name(s))}</a>`],
      ['status', status],
      ['30d', esc(s.hours_30d != null ? f('hours30d', { n: Math.round(s.hours_30d) }) : '—')],
    ];
    if (s.status !== 'offline' && s.title) rows.push(['title', esc(s.title)]);
    if (s.status !== 'offline' && s.language) rows.push(['lang', esc(langName(s.language))]);
    const body = () => rows.map(([k, v]) => `<p class="kv"><span class="k">${k}</span><span class="v">${v}</span></p>`).join('');
    if (!animate) { clearTimeout(typing); term.innerHTML = `<p class="cmd"><span class="ps">~&gt;</span> whois ${esc(s.login.toLowerCase())}</p>${body()}<p class="cmd"><span class="ps">~&gt;</span> <span class="caret"></span></p>`; return; }
    type(`whois ${s.login.toLowerCase()}`, body);
  }

  // ---- pointer: which sled is under the cursor ----
  let sel = -1, px = 0.5, py = 0.5, lastMove = 0;
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
    if (i >= 0 && list[i]) writeWhois(list[i]); else writeIdle();
  }
  box.addEventListener('pointermove', (e) => {
    const b = box.getBoundingClientRect();
    px = (e.clientX - b.left) / b.width; py = (e.clientY - b.top) / b.height; lastMove = performance.now();
    scanUntil = Math.max(scanUntil, lastMove + 1500);
    kick();
    const [x, y] = toArt(e);
    const i = hit(x, y);
    select(i >= 0 && list[i] ? i : -1);
  });
  box.addEventListener('pointerleave', () => { px = py = 0.5; select(-1); kick(); });
  box.addEventListener('click', () => { if (sel >= 0 && list[sel]) window.open(twitch(list[sel]), '_blank', 'noopener'); });

  // Nobody pointing: walk through who is live (or the most active), slowly.
  let tourIx = 0;
  setInterval(() => {
    if (!rt || reduce.matches || document.hidden || !visible || performance.now() - lastMove < 6000 || !list.length) return;
    const live = list.map((s, i) => (s.status !== 'offline' ? i : -1)).filter((i) => i >= 0);
    const pool = live.length ? live : [0, 1, 2, 3, 4].filter((i) => list[i]);
    select(pool[tourIx++ % pool.length]);
  }, 4500);

  // ---- Rive (low-level) ----
  let rt: RvRuntime | null = null, ab: RvArtboard | null = null, sm: RvSM | null = null, renderer: RvRenderer | null = null;
  const nodes: { on: RvNode; pre: RvNode; bar: RvNode }[] = [];
  let selNode: RvNode, selBar: RvNode, rackNode: RvNode, frameNode: RvNode, scanNode: RvNode;
  // Frames are drawn only while something changes: a pointer move, new data, a
  // glide still settling, or the scan sweep. Otherwise the page is idle.
  let pending = false, scanUntil = 0;
  function kick() { if (rt && !pending) { pending = true; prev = 0; rt.requestAnimationFrame(loop); } }
  const cur = { x: 0, y: 0, s: 0, bar: 0, px: 0, py: 0 };

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
  let prev = 0;
  function loop(t: number) {
    pending = false;
    if (!rt || !ab || !renderer) return;
    const dt = prev ? Math.min(0.05, (t - prev) / 1000) : 0; prev = t;
    let again = false;
    if (visible && !document.hidden) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        // selection glides to its sled; parallax follows the cursor
        const k = 1 - Math.exp(-dt / 0.07);
        const target = sel >= 0 ? geo.sleds[sel] : null;
        if (target) { cur.x += (target[0] - cur.x) * (cur.s ? k : 1); cur.y += (target[1] - cur.y) * (cur.s ? k : 1); }
        cur.s += ((target ? 1 : 0) - cur.s) * k;
        cur.bar += (((target && list[sel]?.hours_30d) ? list[sel].hours_30d! / maxH : 0) - cur.bar) * k;
        const m = reduce.matches ? 0 : 1;
        cur.px += ((px - 0.5) * m - cur.px) * k; cur.py += ((py - 0.5) * m - cur.py) * k;
        selNode.x = cur.x; selNode.y = cur.y; selNode.scaleX = selNode.scaleY = cur.s < 0.02 ? 0 : 1;
        selBar.scaleX = Math.max(0.001, cur.bar);
        rackNode.x = -cur.px * 6; rackNode.y = -cur.py * 4;
        frameNode.x = -cur.px * 2; frameNode.y = -cur.py * 1.5;
        // live LEDs breathe
        const scanning = !reduce.matches && t < scanUntil;
        scanNode.scaleY = scanning ? 1 : 0;
        if (scanning) sm!.advance(dt);
        const settle = (a: number, b: number) => Math.abs(a - b) > 0.002;
        const tgt = sel >= 0 ? geo.sleds[sel] : null;
        again = scanning || settle(cur.s, tgt ? 1 : 0) || settle(cur.px, (px - 0.5) * m) || settle(cur.py, (py - 0.5) * m)
          || (!!tgt && (Math.abs(cur.x - tgt[0]) > 0.1 || Math.abs(cur.y - tgt[1]) > 0.1));
        ab.advance(dt);
        renderer.clear(); renderer.save();
        renderer.align(rt.Fit.contain, rt.Alignment.center, { minX: 0, minY: 0, maxX: w, maxY: h }, ab.bounds);
        ab.draw(renderer); renderer.restore(); renderer.flush();
        if (!box.classList.contains('rive-on')) box.classList.add('rive-on');
      }
    }
    rt.resolveAnimationFrame?.();
    if (again) { pending = true; rt.requestAnimationFrame(loop); }
  }

  function loadScript(src: string) {
    return new Promise<void>((res, rej) => {
      if ((window as unknown as { rive?: RiveGlobal }).rive) return res();
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('rive.js failed'));
      document.head.appendChild(s);
    });
  }
  let booting = false;
  async function boot() {
    if (booting) return; booting = true;
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
      selNode = ab.node('sel'); selBar = ab.node('selbar'); rackNode = ab.node('rack'); frameNode = ab.node('frame'); scanNode = ab.node('scan');
      paintNodes();
      renderer = rt.makeRenderer(canvas, false);
      scanUntil = performance.now() + 6000;   // one sweep down the rack as it comes up
      kick();
    } catch (e) {
      console.warn('Rive did not load; the static rack stays.', e);
    }
  }
  // The runtime (~150 KB JS + ~1 MB WASM, gzipped) loads on the visitor's
  // first move, touch, key or scroll: never on a page nobody is using. Until
  // then the static rack above shows the same data.
  const intents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
  const onIntent = () => { for (const ev of intents) removeEventListener(ev, onIntent); void boot(); };
  for (const ev of intents) addEventListener(ev, onIntent, { passive: true });
}
export {};
