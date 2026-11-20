// The site's only script: live status, sorting, schedule, search and filters.
// Everything it touches is already in the HTML; with JS off or the API down
// the page is the full, working, ranked table. The table is shown once the
// first status is in (2.5 s fallback), so rows never visibly jump.

type Status = 'online' | 'prelive' | 'offline';
interface Streamer {
  id: string; login: string; display_name?: string; status: Status;
  category?: string; title?: string; tags?: string[]; language?: string;
  started_at?: string; viewers?: number; prelive_since?: string; next_stream_at?: string; hours_30d?: number;
}
interface Segment {
  id: string; login: string; display_name?: string; start: string; end?: string;
  title?: string; category?: string; canceled?: boolean;
  track_record?: { kept: number; total: number; estimated?: number };
}

// Accuracy over optimism: the page never says more than the data backs up.
// "Getting ready" (a category switch or title change before going live) shows
// for 20 minutes at most; a schedule shows only for streamers who went live for
// at least 75% of their judged scheduled streams, with at least 4 kept.
const PRELIVE_MAX_MS = 20 * 60_000;
const proven = (sg: Segment) => {
  const t = sg.track_record;
  return !!t && t.kept >= 4 && t.kept / t.total >= 0.75;
};
// next_stream_at comes from unproven schedules too, so it is never shown.
const trusted = (s: Streamer): Streamer =>
  s.status === 'prelive' && (!s.prelive_since || Date.now() - Date.parse(s.prelive_since) > PRELIVE_MAX_MS)
    ? { ...s, status: 'offline', next_stream_at: undefined }
    : { ...s, next_stream_at: undefined };
type UI = Record<string, string>;

// Topics come from stream titles and Twitch tags. Names are community jargon,
// the same in every language.
const TOPICS: [string, RegExp][] = [
  ['HTB', /\b(htb|hack ?the ?box)\b/i],
  ['THM', /\b(thm|try ?hack ?me)\b/i],
  ['CTF', /\bctfs?\b|capture the flag/i],
  ['Red team', /red ?team|\bactive directory\b|\bAD\b|bloodhound|\bc2\b|offensive/],
  ['Blue team', /blue ?team|\bsoc\b|\bsiem\b|detection|threat hunt|wazuh|splunk|sentinel/i],
  ['Pentest', /pen ?test|exploit|owasp|burp/i],
  ['Bug bounty', /bug ?bounty|\brecon\b/i],
  ['Malware', /malware|revers(e|ing)|ghidra|\bida\b|crackme|stealer|ransomware/i],
  ['DFIR', /dfir|forensic|incident response|triag/i],
  ['OSINT', /osint/i],
  ['Cloud', /\bcloud\b|\baws\b|azure|\bgcp\b|kubernetes|\bk8s\b/i],
  ['Homelab', /home ?lab/i],
];
const topicsOf = (text: string) => TOPICS.filter(([, re]) => re.test(text)).map(([t]) => t);

const app = document.getElementById('app');
if (app) start(app);

function start(app: HTMLElement) {
  const API = app.dataset.api!;
  const THUMB = app.dataset.thumb!;
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
  const collF = lazy(() => new Intl.Collator(lang));
  const num = (n: number) => numF().format(n);
  const clock = (d: Date) => clockF().format(d);
  const langName = (c?: string) => (c ? namesF()?.of(c) ?? c : '');

  const ago = (iso: string) => Date.now() - Date.parse(iso);
  const duration = (ms: number) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    const D = (Intl as unknown as { DurationFormat?: new (l: string, o: object) => { format(d: object): string } }).DurationFormat;
    if (D) return new D(lang, { style: 'narrow' }).format(h ? { hours: h, minutes: m } : { minutes: m });
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const twitch = (login: string) => `https://www.twitch.tv/${encodeURIComponent(login)}`;
  // Twitch refreshes previews about every 5 minutes; the bucket lets the browser cache in between.
  const thumb = (login: string, w: number, h: number) =>
    THUMB.replace('{login}', encodeURIComponent(login.toLowerCase())).replace('{w}', String(w)).replace('{h}', String(h))
    + (/^https:/.test(THUMB) ? `?t=${Math.floor(Date.now() / 300000)}` : '');
  const thumbImg = (s: Streamer, w: number, h: number, extra = '') =>
    `<img src="${esc(thumb(s.login, w, h))}" srcset="${esc(thumb(s.login, w * 2, h * 2))} 2x" width="${w}" height="${h}" alt="${esc(f('livePreview', { name: s.display_name || s.login }))}" decoding="async" ${extra}>`;

  // ---- state ----
  let byLogin = new Map<string, Streamer>();
  let statusOk: boolean | undefined;
  let segments: Segment[] = [];
  const baseTitle = document.title;
  const topicCache = new Map<string, string[]>();
  const topicsFor = (s: Streamer | undefined) => {
    if (!s || s.status === 'offline') return [];
    const key = `${s.title}|${(s.tags ?? []).join(',')}`;
    let t = topicCache.get(key);
    if (!t) { t = topicsOf(`${s.title ?? ''} ${(s.tags ?? []).join(' ')}`); topicCache.set(key, t); }
    return t;
  };

  const q = $<HTMLInputElement>('#q'), fLang = $<HTMLSelectElement>('#f-lang'), fLive = $<HTMLInputElement>('#f-live'), fSort = $<HTMLSelectElement>('#f-sort');
  const band = $('#band'), rest = $('#rest'), liveSec = $('#live-sec'), liveN = $('#live-n'), listNote = $('#list-note');
  const rows = [...app.querySelectorAll<HTMLLIElement>('li[data-login]')];
  const sched = $('#sched'), regular = $('#regular'), badge = $('#badge'), empty = $('#empty');

  // ---- filters and sort (persisted in the URL query) ----
  type SortKey = 'status' | 'name' | 'lang' | 'viewers' | 'hours';
  const SORTS: SortKey[] = ['status', 'name', 'lang', 'viewers', 'hours'];
  const params = new URLSearchParams(location.search);
  if (q) q.value = params.get('q') ?? '';
  if (fLive) fLive.checked = params.get('live') === '1';
  const wantedLang = params.get('lang') ?? '';
  let sortKey: SortKey = SORTS.includes(params.get('sort') as SortKey) ? (params.get('sort') as SortKey) : 'status';
  if (fSort) fSort.value = sortKey;

  function matches(s: Streamer | undefined, login: string) {
    const text = (q?.value ?? '').trim().toLowerCase();
    if (fLive?.checked && s?.status !== 'online' && s?.status !== 'prelive') return false;
    if (fLang?.value && s?.language !== fLang.value) return false;
    if (!text) return true;
    const hay = `${login} ${s?.display_name ?? ''} ${s?.title ?? ''} ${s?.category ?? ''} ${topicsFor(s).join(' ')}`.toLowerCase();
    return text.split(/\s+/).every((w) => hay.includes(w));
  }

  function apply() {
    let shown = 0, shownLive = 0;
    for (const li of rows) {
      const ok = matches(byLogin.get(li.dataset.login!), li.dataset.login!);
      li.hidden = !ok;
      if (ok) { shown++; if (li.parentElement === band) shownLive++; }
    }
    if (liveSec) liveSec.hidden = shownLive === 0;
    empty?.classList.toggle('show', shown === 0);
    // Keep params this script doesn't own.
    const p = new URLSearchParams(location.search);
    for (const k of ['q', 'lang', 'live', 'sort', 'topic', 'variant']) p.delete(k);
    if (q?.value.trim()) p.set('q', q.value.trim());
    if (fLang?.value) p.set('lang', fLang.value);
    if (fLive?.checked) p.set('live', '1');
    if (sortKey !== 'status') p.set('sort', sortKey);
    const s = p.toString();
    history.replaceState(history.state, '', s ? `?${s}${location.hash}` : location.pathname + location.hash);
  }

  q?.addEventListener('input', apply);
  for (const el of [fLang, fLive]) el?.addEventListener('change', apply);
  fSort?.addEventListener('change', () => {
    sortKey = fSort.value as SortKey;
    renderRows();
    apply();
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
  const name = (s: { display_name?: string; login: string }) => esc(s.display_name || s.login);

  function fillLangs() {
    if (!fLang) return;
    const cur = fLang.value || wantedLang;
    const vals = [...new Set([...[...byLogin.values()].map((s) => s.language ?? ''), cur])].filter(Boolean)
      .map((v) => [v, langName(v)] as const).sort((a, b) => collF().compare(a[1], b[1]));
    const key = vals.map((v) => v[0]).join(',');
    if (fLang.dataset.k === key) return;
    fLang.dataset.k = key;
    fLang.length = 1;
    for (const [v, l] of vals) fLang.add(new Option(l, v, false, v === cur));
  }

  const statusRank = (s?: Streamer) => (s?.status === 'online' ? 0 : s?.status === 'prelive' ? 1 : 2);
  function compare(a: HTMLElement, b: HTMLElement) {
    const sa = byLogin.get(a.dataset.login!), sb = byLogin.get(b.dataset.login!);
    const rank = Number(a.dataset.rank) - Number(b.dataset.rank);
    const hours = (sb?.hours_30d ?? -1) - (sa?.hours_30d ?? -1);
    switch (sortKey) {
      // Live, then getting ready, then most streamed in 30 days (as the old sort.js).
      case 'status': return statusRank(sa) - statusRank(sb) || hours || rank;
      case 'hours': return hours || rank;
      case 'viewers': return (sb?.viewers ?? -1) - (sa?.viewers ?? -1) || statusRank(sa) - statusRank(sb) || hours || rank;
      case 'name': return collF().compare(a.dataset.login!, b.dataset.login!);
      case 'lang': {
        const la = langName(sa?.language), lb = langName(sb?.language);
        return (!la ? 1 : 0) - (!lb ? 1 : 0) || collF().compare(la, lb) || hours || rank;
      }
    }
  }

  function renderRows() {
    const now = Date.now();
    const maxHours = Math.max(1, ...rows.map((r) => byLogin.get(r.dataset.login!)?.hours_30d ?? 0));
    for (const li of rows) {
      const s = byLogin.get(li.dataset.login!);
      const online = s?.status === 'online', pre = s?.status === 'prelive';
      const k = `${s?.status}|${s?.title}|${s?.viewers}|${s?.started_at}|${s?.hours_30d}|${maxHours}|${s?.language}|${online ? Math.floor(now / 300000) : ''}`;
      if (li.dataset.k === k) continue;
      li.dataset.k = k;
      li.className = online ? 'on' : pre ? 'pre' : '';
      const el = (c: string) => li.querySelector<HTMLElement>(c)!;
      el('.th').innerHTML = online
        ? thumbImg(s!, 176, 99, 'loading="lazy"') + `<span class="pill">${esc(ui.live)}</span>${s!.viewers != null ? `<span class="vw">${esc(f('viewers', { n: num(s!.viewers) }))}</span>` : ''}`
        : pre ? `<span class="pill pre">${esc(ui.prelive)}</span>` : '';
      el('.t').textContent = online || pre ? s!.title || '' : '';
      el('.t').title = online || pre ? s!.title || '' : '';
      // One quiet line: how long, what, which language.
      const up = online && s!.started_at ? `<span data-since="${esc(s!.started_at)}">${esc(duration(ago(s!.started_at)))}</span>` : '';
      el('.meta').innerHTML = online || pre
        ? [up, esc(s!.category ?? ''), esc(langName(s!.language))].filter(Boolean).join(' · ')
        : '';
      // 30-day activity as a ten-segment LED meter, scaled to the most active streamer.
      const lit = s?.hours_30d ? Math.max(1, Math.round((s.hours_30d / maxHours) * 10)) : 0;
      li.querySelectorAll<HTMLElement>('.m i').forEach((seg, i) => seg.classList.toggle('lit', i < lit));
      el('.h').textContent = s?.hours_30d != null ? f('hoursShort', { n: Math.round(s.hours_30d) }) : '';
      el('.h').title = s?.hours_30d != null ? f('hours30d', { n: Math.round(s.hours_30d) }) : '';
      li.querySelector<HTMLElement>('.watch')!.hidden = !online;
    }
    // Live first: live and getting-ready streamers move up into "Live now".
    const want = [...rows].sort(compare);
    const lead = sortKey === 'status' ? want.filter((li) => statusRank(byLogin.get(li.dataset.login!)) < 2) : [];
    const tail = want.filter((li) => !lead.includes(li));
    const same = (list: Element | null, items: HTMLElement[]) => !!list && list.children.length === items.length && items.every((li, i) => list.children[i] === li);
    if (!same(band, lead)) band?.replaceChildren(...lead);
    if (!same(rest, tail)) rest?.replaceChildren(...tail);
    if (liveN) liveN.textContent = String(lead.filter((li) => li.classList.contains('on')).length || '');
    if (listNote) listNote.hidden = sortKey !== 'status' && sortKey !== 'hours';
    app.classList.add('ready');
  }

  // Yield to the browser between render steps so no single task blocks input.
  const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));
  let renderSeq = 0;

  async function renderStatus() {
    const seq = ++renderSeq;
    const vals = [...byLogin.values()];
    const listed = new Set(rows.map((r) => r.dataset.login));
    const n = vals.filter((s) => s.status === 'online' && listed.has(s.login.toLowerCase())).length;
    document.title = n ? `${f('liveNow', { n })} · ${baseTitle}` : baseTitle;
    document.documentElement.classList.toggle('on-air', n > 0);
    // Said once, quietly, above the list: only when nobody is live or the data is missing.
    if (badge) badge.textContent = statusOk === false ? ui.unavailable : n ? '' : ui.nobodyLive;
    await yieldTask();
    if (seq !== renderSeq) return; // a newer response is already rendering
    renderRows();
    await yieldTask();
    if (seq !== renderSeq) return;
    fillLangs();
    apply();
  }

  function renderSchedule(ok: boolean) {
    if (!sched || !regular) return;
    const now = Date.now();
    // Proven schedules only, not yet started, not live now, next 7 days.
    const upcoming = segments.filter((s) => !s.canceled && Date.parse(s.start) > now && Date.parse(s.start) - now < 7 * 864e5
      && byLogin.get(s.login.toLowerCase())?.status !== 'online').slice(0, 12);
    regular.hidden = !ok || !upcoming.length;
    let day = '';
    sched.innerHTML = upcoming.map((s) => {
      const d = new Date(s.start);
      const label = dayF().format(d);
      const head = label !== day ? `<li class="day">${esc(label)}</li>` : '';
      day = label;
      return `${head}<li class="ev"><time datetime="${esc(s.start)}">${esc(clock(d))}</time>`
        + `<a href="${twitch(s.login)}" target="_blank" rel="noopener">${name(s)}</a><span class="what">${esc(s.title ?? '')}</span></li>`;
    }).join('');
  }

  function refreshTimes() {
    for (const el of app.querySelectorAll<HTMLElement>('[data-since]')) el.textContent = duration(ago(el.dataset.since!));
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
        if (text !== last) { last = text; onData(text); } else onData('');
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
  const warm = [numF, relF, clockF, dayF, namesF, collF];
  const warmNext = () => { const w = warm.shift(); if (w) { w(); setTimeout(warmNext, 0); } };
  const go = () => {
    setTimeout(() => app.classList.add('ready'), 2500);
    warmNext();
    let raw: Streamer[] = [];
    poller('status.json', 30_000, (text) => {
      // '' = unchanged; still re-check the 20-minute "getting ready" cap and uptimes.
      if (text === '') { byLogin = new Map(raw.map((s) => [s.login.toLowerCase(), trusted(s)])); refreshTimes(); void renderStatus(); return; }
      try {
        if (!text) throw 0;
        raw = (JSON.parse(text) as { streamers?: Streamer[] }).streamers ?? [];
        byLogin = new Map(raw.map((s) => [s.login.toLowerCase(), trusted(s)]));
        statusOk = true;
      } catch {
        // Keep the last good data on a transient failure; say so only if we never had any.
        if (statusOk) return refreshTimes();
        statusOk = false;
      }
      void renderStatus();
      renderSchedule(true);
    });
    if (sched) {
      poller('schedule.json', 300_000, (text) => {
        if (text === '') return renderSchedule(true);
        try {
          if (!text) throw 0;
          segments = ((JSON.parse(text) as { segments?: Segment[] }).segments ?? []).filter(proven).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
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
