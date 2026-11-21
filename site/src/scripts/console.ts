// The rack console: a clicked sled slides out of the rack and becomes a
// rack-mount console that fills most of the window.
//
//  - The drawer front and the keyboard deck are drawn by Rive's low-level
//    renderer on a full-window canvas, from the .riv's 'Console' artboard
//    (unit pieces laid out here at the window's size, crisp at any width).
//  - The screen lid flips open in 3D on its hinge. A 2D renderer can't do
//    perspective, so the lid is a CSS 3D panel (front: bezel and screen with
//    the streamer's card and player; back: the lid's shell).
//
// Motion is two springs, not a timeline, so it never stops dead and can turn
// around mid-flight: `fly` carries the drawer from its slot to the middle of
// the window, `unfold` pulls the deck out and swings the lid up (a little past
// upright, then back). They overlap; closing folds the lid first, then flies
// the drawer home. Without the runtime the same springs run: the window dims
// and the lid flips open where the console stands.

import type { RvArtboard, RvFile, RvMat, RvNode, RvRenderer, RvRuntime } from './rv';

export interface Rect { x: number; y: number; w: number; h: number }
interface Opts {
  el: HTMLElement;                       // #con, fixed over the window
  sledRect(i: number): Rect;             // where sled i is now, viewport px
  led(i: number): 'online' | 'prelive' | 'offline';
  share(i: number): number;              // 30-day bar, 0..1
  onOpen(i: number): void;               // fill the screen
  onShown(i: number): void;              // fully open and settled
  onSlot(i: number): void;               // the rack shows sled i's slot empty (-1: back in)
  reduce: MediaQueryList;
}
interface Spring { x: number; v: number; t: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (a: number, b: number, x: number) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

export function makeConsole(o: Opts) {
  const el = o.el;
  const bg = el.querySelector<HTMLElement>('.con-bg')!;
  const cv = el.querySelector<HTMLCanvasElement>('canvas')!;
  const lid = el.querySelector<HTMLElement>('.con-lid')!;
  const scr = el.querySelector<HTMLElement>('.con-scr')!;
  const floor = el.querySelector<HTMLElement>('.con-floor')!;
  const tag = el.querySelector<HTMLElement>('.con-tag')!;

  let rt: RvRuntime | null = null, ab: RvArtboard | null = null, rend: RvRenderer | null = null, mat: RvMat | null = null;
  const N: Record<string, RvNode> = {};
  const NAMES = ['console', 'deck', 'dk', 'dkGlow', 'dkShade', 'dkLip', 'dkLipHi', 'dkL', 'dkR', 'keys', 'pad',
    'front', 'ear0', 'ear1', 'fc', 'fcHi', 'fcT', 'fcB', 'fcL', 'fcR', 'hd0', 'hd1', 'plate', 'plateEdge', 'vents',
    'pwr', 'pwrCore', 'led', 'on', 'pre', ...[...Array(10).keys()].flatMap((k) => [`mo${k}`, `mi${k}`])];

  let idx = -1, closing = false, running = false, shown = false, prev = 0, prevFocus: Element | null = null;
  const fly: Spring = { x: 0, v: 0, t: 0 }, unf: Spring = { x: 0, v: 0, t: 0 };

  // ---- layout, in CSS px: the console centred in the window ----
  const L = { W: 0, LH: 0, DH: 0, FH: 0, cx: 0, cy: 0, dpr: 1, vw: 0, vh: 0 };
  function layout() {
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const W = Math.round(Math.min(1080, vw - (vw < 640 ? 36 : 80)));   // room for the rack ears
    const FH = Math.round(clamp(W / 15, 24, 60)), DH = Math.round(clamp(W / 16, 18, 66));
    // wide windows get a landscape screen; phones a tall one
    const LH = Math.round(Math.max(220, Math.min(W * (vw < 640 ? 1.45 : 0.6), vh - (vh < 600 ? 24 : 72) - DH - FH)));
    Object.assign(L, { vw, vh, W, FH, DH, LH, cx: Math.round((vw - W) / 2), cy: Math.round(Math.max(12, (vh - LH - DH - FH) / 2)), dpr: Math.min(2, devicePixelRatio || 1) });
    const l = lid.style;
    l.left = `${L.cx}px`; l.top = `${L.cy}px`; l.width = `${W}px`; l.height = `${LH}px`;
    l.setProperty('--b', `${Math.round(clamp(W * 0.02, 8, 18))}px`);
    // the eye: level with the middle of the screen
    el.style.perspectiveOrigin = `${L.cx + W / 2}px ${L.cy + LH * 0.45}px`;
    const fl = floor.style;                    // the console's shadow on the "floor"
    fl.left = `${L.cx - W * 0.06}px`; fl.width = `${W * 1.12}px`; fl.top = `${L.cy + LH + DH + FH - 10}px`;
    if (rt) {
      const w = Math.round(vw * L.dpr), h = Math.round(vh * L.dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      place();
      const p = plateRect(), ts = tag.style;
      ts.left = `${p.x}px`; ts.top = `${p.y}px`; ts.width = `${p.w}px`; ts.height = `${p.h}px`;
    }
  }
  // Each piece is a unit square (or circle) in the artboard: set its box.
  const R = (n: string, x: number, y: number, w: number, h: number) => { const k = N[n]; k.x = x; k.y = y; k.scaleX = w; k.scaleY = h; };
  const D = (n: string, x: number, y: number, d: number) => R(n, x, y, d, d);
  const S = (n: string, x: number, y: number, k: number) => { const g = N[n]; g.x = x; g.y = y; g.scaleX = g.scaleY = k; };
  // Front panel, left to right: ear | handle | LEDs | label plate | meter … vents | handle | ear
  const F = () => {
    const { W, FH } = L, k = FH / 100;
    const plate = { x: FH * 0.95, y: FH * 0.24, w: Math.min(W * 0.24, FH * 5), h: FH * 0.52 };
    const seg = { x: plate.x + plate.w + FH * 0.55, w: FH * 0.3, gap: FH * 0.1, h: FH * 0.16 };
    return { k, plate, seg, hd1: W - FH * 0.18 - 16 * k };
  };
  function place() {
    const { W, LH, DH, FH } = L;
    N.deck.x = 0; N.deck.y = LH + DH;                  // pulls out downwards from the hinge
    R('dk', 0, -DH, W, DH); R('dkShade', 0, -DH, W, Math.max(2, DH * 0.12));
    R('dkLip', 0, -3, W, 3); R('dkLipHi', 0, -3, W, 1);
    R('dkL', 0, -DH, 1, DH); R('dkR', W - 1, -DH, 1, DH);
    const ky = -DH * 0.83, kh = DH * 0.66;
    const kk = N.keys; kk.x = W * 0.045; kk.y = ky; kk.scaleX = (W * 0.69) / 1000; kk.scaleY = kh / 196;
    const pd = N.pad; pd.x = W * 0.77; pd.y = ky; pd.scaleX = (W * 0.185) / 300; pd.scaleY = kh / 196;
    N.front.x = 0; N.front.y = LH + DH;
    const { k, plate, hd1 } = F();
    S('ear0', -40 * k, 0, k); S('ear1', W, 0, k);
    R('fc', 0, 0, W, FH); R('fcHi', 0, 0, W, FH * 0.45);
    R('fcT', 0, 0, W, 1); R('fcB', 0, FH - 1, W, 1); R('fcL', 0, 0, 1, FH); R('fcR', W - 1, 0, 1, FH);
    S('hd0', FH * 0.18, 0, k); S('hd1', hd1, 0, k);
    R('plateEdge', plate.x - 1, plate.y - 1, plate.w + 2, plate.h + 2); R('plate', plate.x, plate.y, plate.w, plate.h);
    const vk = k * 0.8;
    S('vents', hd1 - FH * 0.4 - 240 * vk, FH * 0.1, vk);
    D('pwr', FH * 0.64, FH * 0.32, FH * 0.13); D('pwrCore', FH * 0.64, FH * 0.32, FH * 0.06);
    D('led', FH * 0.64, FH * 0.68, FH * 0.17); D('pre', FH * 0.64, FH * 0.68, FH * 0.17);
  }
  function lights(t: number, screen: number) {
    const { FH, W, DH } = L, d = FH * 0.17, st = o.led(idx);
    const pulse = st === 'online' && !o.reduce.matches ? 1 + 0.08 * Math.sin(t / 420) : 1;
    D('on', FH * 0.64, FH * 0.68, st === 'online' ? d * 1.7 * pulse : 0);
    N.pre.scaleX = N.pre.scaleY = st === 'prelive' ? d : 0;
    // the 30-day meter: ten segments, lit in proportion
    const { seg } = F(), share = o.share(idx), lit = share > 0 ? Math.max(1, Math.round(share * 10)) : 0;
    for (let i = 0; i < 10; i++) {
      const x = seg.x + i * (seg.w + seg.gap), y = FH / 2 - seg.h / 2;
      R(`mo${i}`, x, y, seg.w, seg.h);
      R(`mi${i}`, x, y, i < lit ? seg.w : 0, i < lit ? seg.h : 0);
    }
    R('dkGlow', W * 0.03, -DH, W * 0.94, Math.max(0.01, DH * 0.35 * screen));
  }
  // where the label plate sits once the console is out (the page writes the name there)
  const plateRect = () => { const { plate } = F(); return { x: L.cx + plate.x, y: L.cy + L.LH + L.DH + plate.y, w: plate.w, h: plate.h }; };

  // ---- one frame: the canvas (drawer, deck) and the 3D lid ----
  function draw(t: number) {
    if (!rt || !ab || !rend || !mat || idx < 0) return;
    const S = o.sledRect(idx), f = fly.x, y0 = L.LH + L.DH;
    // fly 0: the front sits exactly on the sled; fly 1: full size, centred.
    const sx = lerp(S.w / L.W, 1, f), sy = lerp(S.h / L.FH, 1, f);
    const tx = lerp(S.x, L.cx, f), ty = lerp(S.y, L.cy + y0, f) - y0 * sy;
    N.deck.scaleY = clamp(unf.x * 1.8, 0, 1.04);
    lights(t, smooth(0.35, 0.95, Math.max(0, (unf.x - 0.2) / 0.8)));
    ab.advance(0);
    rend.clear(); rend.save();
    mat.xx = sx * L.dpr; mat.xy = 0; mat.yx = 0; mat.yy = sy * L.dpr; mat.tx = tx * L.dpr; mat.ty = ty * L.dpr;
    rend.transform(mat);
    ab.draw(rend); rend.restore(); rend.flush();
  }
  function dom() {
    bg.style.opacity = String(clamp(fly.x * 1.15));
    floor.style.opacity = String(smooth(0.6, 1, fly.x));
    // The lid lies flat towards you (-90deg) and swings up on the hinge; the
    // spring lets it go a few degrees past upright before it settles.
    const u = Math.max(0, (unf.x - 0.2) / 0.8);
    lid.style.visibility = u > 0.004 ? 'visible' : 'hidden';
    lid.style.transform = `rotateX(${(-90 * (1 - u)).toFixed(3)}deg)`;
    const a = smooth(0.35, 0.95, u);           // the screen powers on as it rises
    scr.style.setProperty('--on', a.toFixed(3));
    el.classList.toggle('lit', a > 0.6);
  }
  // Semi-implicit Euler in small steps: stable at any frame rate.
  function step(s: Spring, k: number, c: number, dt: number) {
    const n = Math.ceil(dt / 0.004), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (k * (s.t - s.x) - c * s.v) * h; s.x += s.v * h; }
    if (s.x < 0) { s.x = 0; s.v = 0; }
  }
  const still = (s: Spring) => Math.abs(s.x - s.t) < 0.0015 && Math.abs(s.v) < 0.01;
  const raf = (cb: (t: number) => void) => (rt ? rt.requestAnimationFrame(cb) : requestAnimationFrame(cb));
  function frame(t: number) {
    if (!running) return;
    const dt = prev ? Math.min(1 / 30, (t - prev) / 1000) : 1 / 60; prev = t;
    if (!closing) { fly.t = 1; if (fly.x > 0.5) unf.t = 1; }
    else { unf.t = 0; if (unf.x < 0.25) fly.t = 0; }
    // opening: some give at the end; closing: quicker, no bounce
    if (closing) { step(unf, 300, 36, dt); step(fly, 320, 36, dt); }
    else { step(fly, 170, 23, dt); step(unf, 120, 15, dt); }
    const done = still(fly) && still(unf) && (closing || unf.t === 1);
    if (done) { fly.x = fly.t; unf.x = unf.t; fly.v = unf.v = 0; }
    draw(t); dom();
    if (done && closing) return finish();
    if (done) {
      running = false; lid.style.willChange = '';
      if (!shown) { shown = true; o.onShown(idx); }
      if (o.led(idx) === 'online' && !o.reduce.matches && rt) idle();
      return;
    }
    raf(frame);
    rt?.resolveAnimationFrame?.();
  }
  // Open and settled: only the live LED breathes, at a calm rate.
  let idleT = 0;
  function idle() {
    clearTimeout(idleT);
    idleT = window.setTimeout(() => {
      if (running || idx < 0 || closing || !rt) return;
      rt.requestAnimationFrame((t) => { if (!running && idx >= 0 && !closing && rt) { draw(t); rt.resolveAnimationFrame?.(); idle(); } });
    }, 50);
  }
  function go() { lid.style.willChange = 'transform'; if (running) return; running = true; prev = 0; raf(frame); }

  // ---- open / close ----
  function open(i: number) {
    if (idx >= 0) return;
    idx = i; closing = false; shown = false;
    el.hidden = false;
    el.classList.toggle('drawn', !!rt);
    layout();
    o.onOpen(i); o.onSlot(i);
    prevFocus = document.activeElement;
    el.focus({ preventScroll: true });
    fly.v = unf.v = 0;
    if (o.reduce.matches) {
      fly.x = unf.x = fly.t = unf.t = 1;
      el.classList.add('fade'); draw(performance.now()); dom();
      shown = true; o.onShown(i);
      return;
    }
    // Without the drawer drawn there is nothing to fly: start at the lid.
    if (!rt) { fly.x = 0.5; }
    go();
  }
  function close() {
    if (idx < 0 || closing) return;
    closing = true;
    el.classList.remove('lit');
    if (prevFocus instanceof HTMLElement && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    if (o.reduce.matches) return finish();
    go();
  }
  function finish() {
    running = false; closing = false; shown = false;
    el.hidden = true; el.classList.remove('lit', 'fade', 'drawn');
    fly.x = unf.x = fly.v = unf.v = 0;
    scr.innerHTML = '';                        // stops a playing stream
    lid.style.willChange = '';
    const i = idx; idx = -1;
    if (i >= 0) o.onSlot(-1);
  }

  // Close on the × or anywhere outside the screen. composedPath() is taken
  // when the click happens, so it still holds if a handler on the screen has
  // since swapped the clicked element out (e.g. the preview for the player).
  el.addEventListener('click', (e) => {
    const path = e.composedPath();
    const x = path.find((n) => n instanceof Element && n.classList.contains('con-x'));
    if (x || !path.includes(scr)) close();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;               // keep focus inside while open
    const f = [...el.querySelectorAll<HTMLElement>('a[href], button, iframe')].filter((x) => x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  addEventListener('resize', () => {
    if (idx < 0) return;
    layout();
    if (!running) { draw(performance.now()); dom(); }
  });

  return {
    open, close,
    get index() { return idx; },
    get busy() { return idx >= 0; },
    // Hand over the runtime once it is up; from then on the drawer is drawn.
    attach(r: RvRuntime, file: RvFile) {
      try {
        ab = file.artboardByName('Console');
        for (const n of NAMES) N[n] = ab.node(n);
        rend = r.makeRenderer(cv, false);
        mat = new r.Mat2D();
        rt = r;
      } catch (e) { rt = null; console.warn('Rive console unavailable; CSS fallback.', e); }
    },
    detach() { rt = null; },
  };
}
