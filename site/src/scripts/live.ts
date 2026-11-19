// The site's only script: live status, schedule, search and filters.
// Everything it touches is already in the HTML; with JS off or the API down
// the page is the full, working roster.

type Status = 'online' | 'prelive' | 'offline';
interface Streamer {
  id: string; login: string; display_name?: string; status: Status;
  category?: string; title?: string; language?: string;
  started_at?: string; viewers?: number; prelive_since?: string; next_stream_at?: string; hours_30d?: number;
}
interface Segment {
  id: string; login: string; display_name?: string; start: string; end?: string;
  title?: string; category?: string; canceled?: boolean;
}
type UI = Record<string, string>;

const app = document.getElementById('app');
if (app) start(app);

function start(app: HTMLElement) {
  const API = app.dataset.api!;
  const lang = document.documentElement.lang;
  const ui: UI = JSON.parse(app.dataset.ui!);
  const $ = <T extends Element = HTMLElement>(s: string) => app.querySelector<T>(s);
  const f = (k: string, v: Record<string, string | number>) => ui[k].replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // Intl formatters are costly to build; make them on first use (after first paint).
  const lazy = <T,>(make: () => T) => { let v: T | undefined; return () => (v ??= make()); };
  const numF = lazy(() => new Intl.NumberFormat(lang, { notation: 'compact' }));
  const relF = lazy(() => new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' }));
  const clockF = lazy(() => new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }));
  const dayF = lazy(() => new Intl.DateTimeFormat(lang, { weekday: 'long', month: 'short', day: 'numeric' }));
  const namesF = lazy(() => { try { return new Intl.DisplayNames([lang], { type: 'language' }); } catch { return undefined; } });
  const num = { format: (n: number) => numF().format(n) };
  const rel = { format: (v: number, u: Intl.RelativeTimeFormatUnit) => relF().format(v, u) };
  const clock = { format: (d: Date) => clockF().format(d) };
  const dayFmt = { format: (d: Date) => dayF().format(d) };
  const langName = (c?: string) => (c ? namesF()?.of(c) ?? c : '');

  const ago = (iso: string) => Date.now() - Date.parse(iso);
  const relTime = (iso: string) => {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    return Math.abs(m) < 60 ? rel.format(m, 'minute') : Math.abs(m) < 48 * 60 ? rel.format(Math.round(m / 60), 'hour') : rel.format(Math.round(m / 1440), 'day');
  };
  const duration = (ms: number) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    const D = (Intl as unknown as { DurationFormat?: new (l: string, o: object) => { format(d: object): string } }).DurationFormat;
    if (D) return new D(lang, { style: 'narrow' }).format(h ? { hours: h, minutes: m } : { minutes: m });
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const twitch = (login: string) => `https://www.twitch.tv/${encodeURIComponent(login)}`;

  // ---- state ----
  let byLogin = new Map<string, Streamer>();
  let statusOk: boolean | undefined;
  let segments: Segment[] = [];
  const baseTitle = document.title;

  const q = $<HTMLInputElement>('#q'), fLang = $<HTMLSelectElement>('#f-lang'), fCat = $<HTMLSelectElement>('#f-cat'), fLive = $<HTMLInputElement>('#f-live');
  const rows = [...app.querySelectorAll<HTMLElement>('.roster li[data-login]')];
  const strip = $('#strip'), sched = $('#sched'), badge = $('#badge'), count = $('#count'), empty = $('#empty');

  // ---- filters (persisted in the URL query) ----
  const params = new URLSearchParams(location.search);
  if (q) q.value = params.get('q') ?? '';
  if (fLive) fLive.checked = params.get('live') === '1';
  const wanted = { lang: params.get('lang') ?? '', cat: params.get('cat') ?? '' };

  function fillSelect(sel: HTMLSelectElement | null, values: string[], label: (v: string) => string, want: string) {
    if (!sel) return;
    const cur = sel.value || want;
    const coll = new Intl.Collator(lang);
    const opts = [...new Set([...values, ...(cur ? [cur] : [])])].filter(Boolean).map((v) => [v, label(v)] as const).sort((a, b) => coll.compare(a[1], b[1]));
    const key = opts.map((o) => o[0]).join('\n');
    if (sel.dataset.k === key) return;
    sel.dataset.k = key;
    sel.length = 1;
    for (const [v, l] of opts) sel.add(new Option(l, v, false, v === cur));
  }

  function matches(s: Streamer | undefined, login: string, extra = '') {
    const text = (q?.value ?? '').trim().toLowerCase();
    if (fLive?.checked && s?.status !== 'online' && s?.status !== 'prelive') return false;
    if (fLang?.value && s?.language !== fLang.value) return false;
    if (fCat?.value && s?.category !== fCat.value) return false;
    if (!text) return true;
    const hay = `${login} ${s?.display_name ?? ''} ${s?.title ?? ''} ${s?.category ?? ''} ${extra}`.toLowerCase();
    return text.split(/\s+/).every((w) => hay.includes(w));
  }

  function apply() {
    let shown = 0;
    for (const tr of rows) {
      const ok = matches(byLogin.get(tr.dataset.login!), tr.dataset.login!);
      tr.hidden = !ok;
      if (ok) shown++;
    }
    for (const c of strip?.querySelectorAll<HTMLElement>('.card') ?? []) c.hidden = !matches(byLogin.get(c.dataset.login!), c.dataset.login!);
    for (const li of sched?.querySelectorAll<HTMLElement>('li.ev') ?? []) {
      // Scheduled streams aren't live: hidden by "live only", else filtered like the roster.
      const login = li.dataset.login!;
      const seg: Streamer = { ...(byLogin.get(login) ?? { id: '', login }), status: 'online', title: li.dataset.text, category: li.dataset.cat };
      li.hidden = !!fLive?.checked || !matches(seg, login);
    }
    for (const d of sched?.querySelectorAll<HTMLElement>('li.day') ?? []) {
      let n = d.nextElementSibling as HTMLElement | null, any = false;
      while (n && n.classList.contains('ev')) { any ||= !n.hidden; n = n.nextElementSibling as HTMLElement | null; }
      d.hidden = !any;
    }
    if (count) count.textContent = f('showing', { shown, total: rows.length });
    empty?.classList.toggle('show', shown === 0);
    const p = new URLSearchParams();
    if (q?.value.trim()) p.set('q', q.value.trim());
    if (fLang?.value) p.set('lang', fLang.value);
    if (fCat?.value) p.set('cat', fCat.value);
    if (fLive?.checked) p.set('live', '1');
    const s = p.toString();
    const clear = $('#clear');
    if (clear) clear.hidden = !s;
    history.replaceState(history.state, '', s ? `?${s}${location.hash}` : location.pathname + location.hash);
  }

  q?.addEventListener('input', apply);
  for (const el of [fLang, fCat, fLive]) el?.addEventListener('change', apply);
  $('#clear')?.addEventListener('click', () => {
    if (q) q.value = '';
    if (fLang) fLang.value = '';
    if (fCat) fCat.value = '';
    if (fLive) fLive.checked = false;
    apply();
    q?.focus();
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === '/' && q && !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !t.isContentEditable) {
      e.preventDefault();
      q.focus();
      q.select();
    } else if (e.key === 'Escape' && t === q && q.value) {
      q.value = '';
      apply();
    }
  });

  // ---- rendering ----
  const tag = (s: Streamer, extra = '') => s.status === 'online'
    ? `<span class="tag on"><i class="dot"></i>${esc(ui.live)}${extra}</span>`
    : `<span class="tag pre"><i class="dot"></i>${esc(ui.prelive)}${extra}</span>`;

  // Time-relative text is refreshed in place every poll.
  const timeSpan = (s: Streamer) => {
    if (s.status === 'online' && s.started_at) return `<span data-since="${esc(s.started_at)}">${esc(duration(ago(s.started_at)))}</span>`;
    if (s.status === 'prelive' && s.next_stream_at && Date.parse(s.next_stream_at) > Date.now())
      return `<span data-until="${esc(s.next_stream_at)}">${esc(f('startsIn', { t: relTime(s.next_stream_at) }))}</span>`;
    return '';
  };

  function nowText(s: Streamer | undefined) {
    if (!s) return '';
    if (s.status === 'online') {
      return [s.title, s.category, s.viewers != null ? f('viewers', { n: num.format(s.viewers) }) : ''].filter(Boolean).join(' · ');
    }
    if (s.status === 'prelive') return [s.title, s.category].filter(Boolean).join(' · ');
    return s.hours_30d != null ? f('hours30d', { n: Math.round(s.hours_30d) }) : '';
  }

  // Yield to the browser between render steps so no single task blocks input.
  const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));
  let renderSeq = 0;

  async function renderStatus() {
    const seq = ++renderSeq;
    const live = [...byLogin.values()]
      .filter((s) => s.status === 'online' || s.status === 'prelive')
      .sort((a, b) => (a.status === b.status ? (b.viewers ?? 0) - (a.viewers ?? 0) : a.status === 'online' ? -1 : 1));
    const n = live.filter((s) => s.status === 'online').length;

    document.title = n ? `${f('liveNow', { n })} · ${baseTitle}` : baseTitle;
    if (badge) {
      badge.classList.toggle('on', n > 0);
      badge.lastElementChild!.textContent = statusOk === false ? '' : n ? f('liveNow', { n }) : ui.nobodyLive;
    }

    if (strip) {
      if (statusOk === false) strip.innerHTML = `<p class="msg">${esc(ui.unavailable)}</p>`;
      else if (!live.length) strip.innerHTML = `<p class="msg">${esc(ui.nobodyLive)} <span id="next"></span></p>`;
      else {
        strip.innerHTML = live.map((s) => {
          const name = s.display_name || s.login;
          const meta2 = [s.category, langName(s.language)].filter(Boolean).map(esc).join(' · ');
          const when = timeSpan(s);
          const viewers = s.status === 'online' && s.viewers != null ? `<span>${esc(f('viewers', { n: num.format(s.viewers) }))}</span>` : '';
          return `<a class="card ${s.status === 'online' ? 'on' : 'pre'}" href="${twitch(s.login)}" target="_blank" rel="noopener" data-login="${esc(s.login.toLowerCase())}">`
            + `<span class="row">${tag(s, when ? ' · ' + when : '')}${viewers}</span><span class="nm">${esc(name)}</span>`
            + `<span class="tt" title="${esc(s.title)}">${esc(s.title)}</span><span class="mt">${meta2}</span></a>`;
        }).join('');
      }
    }

    await yieldTask();
    if (seq !== renderSeq) return; // a newer response is already rendering
    // Touch only rows whose content changed: the inactive page has 300+.
    for (const tr of rows) {
      const s = byLogin.get(tr.dataset.login!);
      const html = s && s.status !== 'offline' ? tag(s) : '';
      const text = nowText(s);
      const k = html + '\n' + text;
      if (tr.dataset.k === k) continue;
      tr.dataset.k = k;
      tr.className = s?.status === 'online' ? 'on' : s?.status === 'prelive' ? 'pre' : '';
      tr.querySelector('.st')!.innerHTML = html;
      const now = tr.querySelector<HTMLElement>('.now')!;
      now.textContent = text;
      now.title = text;
    }

    await yieldTask();
    if (seq !== renderSeq) return;
    const langs = [...byLogin.values()].map((s) => s.language ?? '');
    const cats = [...byLogin.values()].filter((s) => s.status !== 'offline').map((s) => s.category ?? '');
    fillSelect(fLang, langs, langName, wanted.lang);
    fillSelect(fCat, cats, (v) => v, wanted.cat);
    renderNext();
    apply();
  }

  function renderNext() {
    const el = document.getElementById('next');
    const nx = segments.find((s) => !s.canceled && Date.parse(s.start) > Date.now());
    if (el) el.innerHTML = nx ? esc(f('nextUp', { name: nx.display_name || nx.login, t: relTime(nx.start) })) : '';
  }

  function renderSchedule(ok: boolean) {
    if (!sched) return;
    const now = Date.now();
    const upcoming = segments.filter((s) => !s.canceled && Date.parse(s.end ?? s.start) > now).slice(0, 40);
    if (!ok || !upcoming.length) {
      sched.innerHTML = `<li class="note">${esc(ok ? ui.upcomingEmpty : ui.unavailable)}</li>`;
      return;
    }
    let day = '';
    sched.innerHTML = upcoming.map((s) => {
      const d = new Date(s.start);
      const label = dayFmt.format(d);
      const head = label !== day ? `<li class="day">${esc(label)}</li>` : '';
      day = label;
      const text = [s.title, s.category].filter(Boolean).join(' · ');
      return `${head}<li class="ev" data-login="${esc(s.login.toLowerCase())}" data-text="${esc(text)}" data-cat="${esc(s.category)}">`
        + `<time datetime="${esc(s.start)}">${esc(clock.format(d))}</time>`
        + `<span class="rel" data-until="${esc(s.start)}">${esc(relTime(s.start))}</span>`
        + `<span class="what"><a href="${twitch(s.login)}" target="_blank" rel="noopener">${esc(s.display_name || s.login)}</a><span title="${esc(text)}">${esc(text)}</span></span></li>`;
    }).join('');
    renderNext();
    apply();
  }

  function refreshTimes() {
    for (const el of app.querySelectorAll<HTMLElement>('[data-since]')) el.textContent = duration(ago(el.dataset.since!));
    for (const el of app.querySelectorAll<HTMLElement>('[data-until]')) {
      el.textContent = el.classList.contains('rel') ? relTime(el.dataset.until!) : f('startsIn', { t: relTime(el.dataset.until!) });
    }
    renderNext();
  }

  // ---- polling ----
  // `cache: 'no-cache'` makes the browser revalidate with the stored ETag on
  // every poll, so an unchanged response is a bodyless 304 (no CORS preflight
  // needed). Unchanged text skips the re-render.
  function poller(path: string, every: number, onData: (text: string | null) => void) {
    let timer = 0, last = '', lastAt = 0, first = true;
    const run = async () => {
      clearTimeout(timer);
      lastAt = Date.now();
      try {
        // The first request matches the <link rel=preload> in the head (same
        // mode, credentials and cache mode), so it reuses that response.
        const r = await fetch(API + path, first ? {} : { cache: 'no-cache' });
        first = false;
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        if (text !== last) { last = text; onData(text); } else refreshTimes();
      } catch {
        last = '';
        onData(null);
      }
      if (!document.hidden) timer = window.setTimeout(run, every);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else timer = window.setTimeout(run, Math.max(0, every - (Date.now() - lastAt)));
    });
    run();
  }

  // Build the Intl formatters one per task while the first fetch is in flight.
  const warm = [numF, relF, clockF, dayF, namesF];
  const warmNext = () => { const w = warm.shift(); if (w) { w(); setTimeout(warmNext, 0); } };
  const go = () => {
    warmNext();
    if (rows.length || strip) {
      poller('status.json', 30_000, (text) => {
        try {
          if (!text) throw 0;
          const data = JSON.parse(text) as { streamers?: Streamer[] };
          byLogin = new Map((data.streamers ?? []).map((s) => [s.login.toLowerCase(), s]));
          statusOk = true;
        } catch {
          // Keep the last good data on a transient failure; say so only if we never had any.
          if (statusOk) return refreshTimes();
          statusOk = false;
        }
        void renderStatus();
      });
    }
    if (sched) {
      poller('schedule.json', 300_000, (text) => {
        try {
          if (!text) throw 0;
          segments = ((JSON.parse(text) as { segments?: Segment[] }).segments ?? []).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
          renderSchedule(true);
        } catch {
          if (!segments.length) renderSchedule(false);
        }
      });
    }
  };
  if (params.toString()) apply();
  // Don't poll from a page that is only being prerendered on hover.
  const doc = document as Document & { prerendering?: boolean };
  // Fetch once the first paint is done, so it never competes with it.
  const soon = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 800 }) : setTimeout(go, 1));
  if (doc.prerendering) document.addEventListener('prerenderingchange', soon, { once: true });
  else soon();
}
