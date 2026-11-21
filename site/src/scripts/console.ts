// The rack console: a clicked sled slides out of the rack and becomes a
// rack-mount console that fills most of the window. Drawn by Rive's low-level
// renderer on its own full-window canvas, from the .riv's 'Console' artboard
// (unit pieces laid out here at the window's size, so it is crisp anywhere).
//
// Motion is two springs, not a timeline, so it never stops dead and can turn
// around mid-flight: `fly` carries the drawer front from its slot to the
// middle of the window (position and scale), `unfold` pulls the keyboard deck
// out and lifts the screen lid. They overlap: the lid starts lifting while the
// drawer is still arriving, and on close the lid folds before the drawer flies
// home. The HTML screen (the streamer's card) is laid over the lid's screen.
// Without the runtime, CSS does a simpler version of the same move.

import type { RvArtboard, RvFile, RvMat, RvNode, RvRenderer, RvRuntime } from './rv';

export interface Rect { x: number; y: number; w: number; h: number }
interface Opts {
  el: HTMLElement;                       // #con, fixed over the window
  sledRect(i: number): Rect;             // where sled i is now, viewport px
  led(i: number): 'online' | 'prelive' | 'offline';
  share(i: number): number;              // 30-day bar, 0..1
  onOpen(i: number): void;               // fill the screen
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

  let rt: RvRuntime | null = null, ab: RvArtboard | null = null, rend: RvRenderer | null = null, mat: RvMat | null = null;
  const N: Record<string, RvNode> = {};
  const NAMES = ['console', 'deck', 'dk', 'dkL', 'dkR', 'keys', 'lid', 'bz', 'scr', 'scT', 'scB', 'scL', 'scR', 'bzT', 'bzL', 'bzR', 'pwr',
    'front', 'hdl0', 'hdl1', 'fc', 'fcT', 'fcB', 'fcL', 'fcR', 'v0', 'v1', 'v2', 'trk', 'bar', 'led', 'on', 'pre'];

  let idx = -1, closing = false, running = false, prev = 0, prevFocus: Element | null = null;
  const fly: Spring = { x: 0, v: 0, t: 0 }, unf: Spring = { x: 0, v: 0, t: 0 };

  // ---- layout, in CSS px: the console centred in the window ----
  const L = { W: 0, LH: 0, DH: 0, FH: 0, B: 0, cx: 0, cy: 0, dpr: 1, vw: 0, vh: 0 };
  function layout() {
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const W = Math.round(Math.min(1080, vw - (vw < 640 ? 20 : 64)));
    const FH = Math.round(clamp(W / 15, 24, 60)), DH = Math.round(clamp(W / 26, 14, 38));
    const B = Math.round(clamp(W * 0.02, 8, 18));
    // wide windows get a landscape screen; phones a tall one
    const LH = Math.round(Math.max(220, Math.min(W * (vw < 640 ? 1.45 : 0.6), vh - (vh < 600 ? 24 : 72) - DH - FH)));
    Object.assign(L, { vw, vh, W, FH, DH, B, LH, cx: Math.round((vw - W) / 2), cy: Math.round(Math.max(12, (vh - LH - DH - FH) / 2)), dpr: Math.min(2, devicePixelRatio || 1) });
    const s = scr.style, sh = LH - 2 * B - 6;
    s.left = `${L.cx + B}px`; s.top = `${L.cy + B}px`; s.width = `${W - 2 * B}px`; s.height = `${sh}px`;
    const l = lid.style;
    l.left = `${L.cx}px`; l.top = `${L.cy}px`; l.width = `${W}px`; l.height = `${LH}px`;
    if (rt) {
      const w = Math.round(vw * L.dpr), h = Math.round(vh * L.dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      place();
    }
  }
  // Each piece is a unit square (or circle) in the artboard: set its box.
  const R = (n: string, x: number, y: number, w: number, h: number) => { const k = N[n]; k.x = x; k.y = y; k.scaleX = w; k.scaleY = h; };
  const D = (n: string, x: number, y: number, d: number) => R(n, x, y, d, d);
  function place() {
    const { W, LH, DH, FH, B } = L, sh = LH - 2 * B - 6;
    N.lid.x = 0; N.lid.y = LH;                         // hinge: children sit above it
    R('bz', 0, -LH, W, LH); R('bzT', 0, -LH, W, 1); R('bzL', 0, -LH, 1, LH); R('bzR', W - 1, -LH, 1, LH);
    R('scr', B, -LH + B, W - 2 * B, sh);
    R('scT', B, -LH + B, W - 2 * B, 1); R('scB', B, -LH + B + sh - 1, W - 2 * B, 1);
    R('scL', B, -LH + B, 1, sh); R('scR', W - B - 1, -LH + B, 1, sh);
    D('pwr', W - B - 3, -(B + 6) / 2, 4);
    N.deck.x = 0; N.deck.y = LH + DH;                  // pulls out downwards from the hinge
    R('dk', 0, -DH, W, DH); R('dkL', 0, -DH, 1, DH); R('dkR', W - 1, -DH, 1, DH);
    const k = N.keys; k.scaleX = (W * 0.84) / 884; k.scaleY = (DH * 0.62) / 30; k.x = W * 0.08; k.y = -DH * 0.81;
    N.front.x = 0; N.front.y = LH + DH;
    R('fc', 0, 0, W, FH); R('fcT', 0, 0, W, 1); R('fcB', 0, FH - 1, W, 1); R('fcL', 0, 0, 1, FH); R('fcR', W - 1, 0, 1, FH);
    const hw = Math.max(5, FH * 0.24);
    R('hdl0', -hw, FH * 0.2, hw, FH * 0.6); R('hdl1', W, FH * 0.2, hw, FH * 0.6);
    const d = FH * 0.24, lx = FH * 0.72;
    D('led', lx, FH / 2, d); D('pre', lx, FH / 2, d);
    const tx = FH * 1.35, tw = W - tx - FH * 1.5;
    R('trk', tx, FH / 2 - FH * 0.07, tw, FH * 0.14);
    for (let v = 0; v < 3; v++) R(`v${v}`, W - FH * 1.05 + v * FH * 0.3, FH * 0.22, Math.max(1.5, FH * 0.07), FH * 0.56);
  }
  function lights(t: number) {
    const { FH, W } = L, d = FH * 0.24, st = o.led(idx);
    const pulse = st === 'online' && !o.reduce.matches ? 1 + 0.08 * Math.sin(t / 420) : 1;
    D('on', FH * 0.72, FH / 2, st === 'online' ? d * 2.2 * pulse : 0);
    N.pre.scaleX = N.pre.scaleY = st === 'prelive' ? d : 0;
    const tx = FH * 1.35, tw = W - tx - FH * 1.5;
    R('bar', tx, FH / 2 - FH * 0.07, Math.max(0.5, tw * o.share(idx)), FH * 0.14);
  }

  // ---- drawing (runtime) ----
  function draw(t: number) {
    if (!rt || !ab || !rend || !mat || idx < 0) return;
    const S = o.sledRect(idx), f = fly.x, y0 = L.LH + L.DH;
    // fly 0: the front sits exactly on the sled; fly 1: full size, centred.
    const sx = lerp(S.w / L.W, 1, f), sy = lerp(S.h / L.FH, 1, f);
    const tx = lerp(S.x, L.cx, f), ty = lerp(S.y, L.cy + y0, f) - y0 * sy;
    N.deck.scaleY = clamp(unf.x * 1.8, 0, 1.04);
    N.lid.scaleY = Math.max(0, (unf.x - 0.22) / 0.78);
    lights(t);
    ab.advance(0);
    rend.clear(); rend.save();
    mat.xx = sx * L.dpr; mat.xy = 0; mat.yx = 0; mat.yy = sy * L.dpr; mat.tx = tx * L.dpr; mat.ty = ty * L.dpr;
    rend.transform(mat);
    ab.draw(rend); rend.restore(); rend.flush();
  }
  // What the page shows around the canvas follows the same springs.
  function dom() {
    bg.style.opacity = String(clamp(fly.x * 1.15));
    const a = smooth(0.62, 1, unf.x);
    scr.style.opacity = String(a);
    scr.style.transform = `translateY(${((1 - a) * 12).toFixed(2)}px)`;
    el.classList.toggle('lit', a > 0.5);
  }
  // Semi-implicit Euler in small steps: stable at any frame rate.
  function step(s: Spring, k: number, c: number, dt: number) {
    const n = Math.ceil(dt / 0.004), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (k * (s.t - s.x) - c * s.v) * h; s.x += s.v * h; }
    if (s.x < 0) { s.x = 0; s.v = 0; }
  }
  const still = (s: Spring) => Math.abs(s.x - s.t) < 0.0015 && Math.abs(s.v) < 0.01;
  function frame(t: number) {
    if (!running) return;
    const dt = prev ? Math.min(1 / 30, (t - prev) / 1000) : 1 / 60; prev = t;
    if (!closing) { fly.t = 1; if (fly.x > 0.5) unf.t = 1; }
    else { unf.t = 0; if (unf.x < 0.3) fly.t = 0; }
    // opening: a little give at the end; closing: quicker, no bounce
    if (closing) { step(unf, 380, 40, dt); step(fly, 320, 36, dt); }
    else { step(fly, 170, 23, dt); step(unf, 150, 19.5, dt); }
    const done = still(fly) && still(unf) && (closing || unf.t === 1);
    if (done) { fly.x = fly.t; unf.x = unf.t; fly.v = unf.v = 0; }
    draw(t); dom();
    if (done && closing) return finish();
    // Open and settled: keep the live LED breathing at a calm rate, else stop.
    if (done) {
      running = false;
      if (o.led(idx) === 'online' && !o.reduce.matches && rt) idle();
      return;
    }
    rt ? rt.requestAnimationFrame(frame) : requestAnimationFrame(frame);
    rt?.resolveAnimationFrame?.();
  }
  let idleT = 0;
  function idle() {
    clearTimeout(idleT);
    idleT = window.setTimeout(() => {
      if (running || idx < 0 || closing) return;
      rt!.requestAnimationFrame((t) => { if (!running && idx >= 0 && !closing) { draw(t); rt!.resolveAnimationFrame?.(); idle(); } });
    }, 50);
  }
  function go() { if (running) return; running = true; prev = 0; rt ? rt.requestAnimationFrame(frame) : requestAnimationFrame(frame); }

  // ---- CSS fallback (no runtime yet, or none): the lid alone flies out ----
  let anims: Animation[] = [];
  function cssMove(open: boolean) {
    anims.forEach((a) => a.cancel());
    const S = o.sledRect(idx);
    const from = `translate(${S.x - L.cx}px, ${S.y - L.cy}px) scale(${S.w / L.W}, ${S.h / L.LH})`;
    const kf = [{ transform: from, opacity: 0.4 }, { transform: 'none', opacity: 1 }];
    const opt = (d: number, delay = 0): KeyframeAnimationOptions => ({ duration: d, delay, easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'both', direction: open ? 'normal' : 'reverse' });
    lid.style.transformOrigin = '0 0';
    anims = [
      lid.animate(kf, opt(open ? 560 : 300)),
      bg.animate([{ opacity: 0 }, { opacity: 1 }], opt(open ? 300 : 260)),
      scr.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], opt(open ? 260 : 120, open ? 340 : 0)),
    ];
    el.classList.toggle('lit', open);
    if (!open) void anims[0].finished.then(finish, () => {});
  }

  // ---- open / close ----
  function open(i: number) {
    if (idx >= 0) return;
    idx = i; closing = false;
    el.hidden = false;
    el.classList.toggle('drawn', !!rt);
    layout();
    o.onOpen(i); o.onSlot(i);
    prevFocus = document.activeElement;
    el.focus({ preventScroll: true });
    if (o.reduce.matches) {
      fly.x = unf.x = fly.t = unf.t = 1; fly.v = unf.v = 0;
      el.classList.add('fade'); draw(performance.now()); dom(); bg.style.opacity = '1';
      return;
    }
    if (!rt) { scr.style.opacity = ''; scr.style.transform = ''; bg.style.opacity = ''; return cssMove(true); }
    fly.v = unf.v = 0; go();
  }
  function close() {
    if (idx < 0 || closing) return;
    closing = true;
    el.classList.remove('lit');
    if (prevFocus instanceof HTMLElement && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    if (o.reduce.matches) return finish();
    if (!el.classList.contains('drawn')) return cssMove(false);
    go();
  }
  function finish() {
    running = false; closing = false;
    anims.forEach((a) => a.cancel()); anims = [];
    el.hidden = true; el.classList.remove('lit', 'fade', 'drawn');
    fly.x = unf.x = fly.v = unf.v = 0;
    scr.innerHTML = '';
    const i = idx; idx = -1;
    if (i >= 0) o.onSlot(-1);
  }

  el.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.con-x') || !t.closest('.con-scr')) close();
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
    if (rt && !running) draw(performance.now());
  });

  return {
    open, close,
    get index() { return idx; },
    get busy() { return idx >= 0; },
    // Hand over the runtime once it is up; from then on the console is drawn.
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
