// The site's only script: live status, schedule, search and filters.
// Everything it touches is already in the HTML; with JS off or the API down
// the page is the full, working roster. Every box it fills has a size fixed by
// CSS (spotlight media 16:9, "On now" N rows, topic row), so data never shifts
// the page.

type Status = 'online' | 'prelive' | 'offline';
interface Streamer {
  id: string; login: string; display_name?: string; status: Status;
  category?: string; title?: string; tags?: string[]; language?: string;
  started_at?: string; viewers?: number; prelive_since?: string; next_stream_at?: string; hours_30d?: number;
}
interface Segment {
  id: string; login: string; display_name?: string; start: string; end?: string;
  title?: string; category?: string; canceled?: boolean;
}
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
  const ROWS = 5;
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
  const wkF = lazy(() => new Intl.DateTimeFormat(lang, { weekday: 'short' }));
  const num = (n: number) => numF().format(n);
  const clock = (d: Date) => clockF().format(d);
  const langName = (c?: string) => (c ? namesF()?.of(c) ?? c : '');

  const ago = (iso: string) => Date.now() - Date.parse(iso);
  const relTime = (iso: string) => {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    const r = relF();
    return Math.abs(m) < 60 ? r.format(m, 'minute') : Math.abs(m) < 48 * 60 ? r.format(Math.round(m / 60), 'hour') : r.format(Math.round(m / 1440), 'day');
  };
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

  const q = $<HTMLInputElement>('#q'), fLang = $<HTMLSelectElement>('#f-lang'), fLive = $<HTMLInputElement>('#f-live');
  const topicsEl = $('#topics'), spot = $('#spot'), onnow = $('#onnow'), onN = $('#on-n'), more = $<HTMLButtonElement>('#more');
  const rows = [...app.querySelectorAll<HTMLElement>('.roster li[data-login]')];
  const sched = $('#sched'), badge = $('#badge'), count = $('#count'), empty = $('#empty');

  // ---- filters (persisted in the URL query) ----
  const params = new URLSearchParams(location.search);
  if (q) q.value = params.get('q') ?? '';
  if (fLive) fLive.checked = params.get('live') === '1';
  let topic = params.get('topic') ?? '';
  const wantedLang = params.get('lang') ?? '';

  function matches(s: Streamer | undefined, login: string, extra = '', topics = topicsFor(s)) {
    const text = (q?.value ?? '').trim().toLowerCase();
    if (fLive?.checked && s?.status !== 'online' && s?.status !== 'prelive') return false;
    if (fLang?.value && s?.language !== fLang.value) return false;
    if (topic && !topics.includes(topic)) return false;
    if (!text) return true;
    const hay = `${login} ${s?.display_name ?? ''} ${s?.title ?? ''} ${s?.category ?? ''} ${topics.join(' ')} ${extra}`.toLowerCase();
    return text.split(/\s+/).every((w) => hay.includes(w));
  }

  function apply() {
    let shown = 0;
    for (const tr of rows) {
      const ok = matches(byLogin.get(tr.dataset.login!), tr.dataset.login!);
      tr.hidden = !ok;
      if (ok) shown++;
    }
    for (const li of onnow?.querySelectorAll<HTMLElement>('li[data-login]') ?? []) {
      const login = li.dataset.login!;
      const s = li.classList.contains('next')
        ? ({ id: '', login, status: 'online', title: li.dataset.text } as Streamer)
        : byLogin.get(login);
      li.hidden = (li.classList.contains('next') && !!fLive?.checked) || !matches(s, login, li.dataset.text ?? '', (li.dataset.topics ?? '').split('|').filter(Boolean));
    }
    for (const li of sched?.querySelectorAll<HTMLElement>('li.ev') ?? []) {
      const login = li.dataset.login!;
      const seg = { ...(byLogin.get(login) ?? { id: '', login }), status: 'online', title: li.dataset.text } as Streamer;
      li.hidden = !!fLive?.checked || !matches(seg, login, '', (li.dataset.topics ?? '').split('|').filter(Boolean));
    }
    for (const d of sched?.querySelectorAll<HTMLElement>('li.day') ?? []) {
      let n = d.nextElementSibling as HTMLElement | null, any = false;
      while (n && n.classList.contains('ev')) { any ||= !n.hidden; n = n.nextElementSibling as HTMLElement | null; }
      d.hidden = !any;
    }
    for (const b of topicsEl?.querySelectorAll<HTMLButtonElement>('button') ?? []) b.setAttribute('aria-pressed', String(b.dataset.topic === topic));
    if (count) count.textContent = f('showing', { shown, total: rows.length });
    empty?.classList.toggle('show', shown === 0);
    const p = new URLSearchParams();
    if (q?.value.trim()) p.set('q', q.value.trim());
    if (fLang?.value) p.set('lang', fLang.value);
    if (topic) p.set('topic', topic);
    if (fLive?.checked) p.set('live', '1');
    const s = p.toString();
    const clear = $('#clear');
    if (clear) clear.hidden = !s;
    history.replaceState(history.state, '', s ? `?${s}${location.hash}` : location.pathname + location.hash);
  }

  q?.addEventListener('input', apply);
  for (const el of [fLang, fLive]) el?.addEventListener('change', apply);
  topicsEl?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-topic]');
    if (!b) return;
    topic = topic === b.dataset.topic ? '' : b.dataset.topic!;
    apply();
  });
  $('#clear')?.addEventListener('click', () => {
    if (q) q.value = '';
    if (fLang) fLang.value = '';
    if (fLive) fLive.checked = false;
    topic = '';
    apply();
    q?.focus();
  });
  more?.addEventListener('click', () => {
    const open = onnow!.classList.toggle('all');
    more.textContent = open ? ui.showLess : f('showAll', { n: more.dataset.n! });
    more.setAttribute('aria-expanded', String(open));
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
  const since = (iso: string) => `<span data-since="${esc(iso)}">${esc(duration(ago(iso)))}</span>`;
  const until = (iso: string, wrap = true) => `<span data-until="${esc(iso)}"${wrap ? '' : ' class="rel"'}>${esc(wrap ? f('startsIn', { t: relTime(iso) }) : relTime(iso))}</span>`;
  const name = (s: { display_name?: string; login: string }) => esc(s.display_name || s.login);
  const viewersLabel = ui.viewers.replace('{n}', '').trim().replace(/^./, (c) => c.toUpperCase());
  const startsSoon = (s: Streamer) => s.next_stream_at && Date.parse(s.next_stream_at) > Date.now() ? s.next_stream_at : '';

  function liveSorted() {
    return [...byLogin.values()]
      .filter((s) => s.status === 'online' || s.status === 'prelive')
      .sort((a, b) => (a.status === b.status ? (b.viewers ?? 0) - (a.viewers ?? 0) : a.status === 'online' ? -1 : 1));
  }
  const nextSegments = () => {
    const now = Date.now();
    return segments.filter((s) => !s.canceled && Date.parse(s.start) > now && byLogin.get(s.login.toLowerCase())?.status !== 'online');
  };

  function renderSpot(live: Streamer[]) {
    if (!spot) return;
    const media = spot.querySelector('.spot-media')!, txt = spot.querySelector('.spot-txt')!;
    const top = live[0];
    if (statusOk === false) {
      txt.innerHTML = `<p class="eyebrow">${esc(ui.unavailable)}</p><p class="spot-t">${esc(ui.tagline)}</p>`;
      return;
    }
    if (top) {
      const online = top.status === 'online';
      const topics = topicsFor(top);
      const key = `${top.login}|${top.status}|${top.title}|${Math.floor(Date.now() / 300000)}`;
      if (spot.dataset.k !== key) {
        spot.dataset.k = key;
        media.outerHTML = `<a class="spot-media" href="${twitch(top.login)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">`
          + (online ? thumbImg(top, 480, 270, 'fetchpriority="high"') + `<span class="lv"><i class="dot on"></i>${esc(ui.live)}</span>` : `<span class="when"><span class="ring"></span></span>`)
          + `</a>`;
      }
      const meter = (label: string, value: string) => (value ? `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>` : '');
      txt.innerHTML = `<p class="eyebrow">${tag(top)}<b>${name(top)}</b>${!online && startsSoon(top) ? until(startsSoon(top)) : ''}</p>`
        + `<h2 class="spot-t" title="${esc(top.title)}">${esc(top.title || top.category || '')}</h2>`
        + `<p class="spot-c">${esc((topics.length ? topics : [top.category]).filter(Boolean).join(' · '))}</p>`
        + `<dl class="meters">${meter(viewersLabel, online && top.viewers != null ? esc(num(top.viewers)) : '')}`
        + `${meter(ui.live, online && top.started_at ? since(top.started_at) : '')}${meter(ui.language, esc(langName(top.language)))}</dl>`
        + `<div class="acts"><a class="btn" href="${twitch(top.login)}" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-twitch" /></svg>${esc(ui.watch)}</a>`
        + (live[1] ? `<a class="btn2" href="${twitch(live[1].login)}" target="_blank" rel="noopener">${esc(ui.nextUpLabel)}: ${name(live[1])}</a>` : '') + `</div>`;
      return;
    }
    // Nobody live: the spotlight shows who's next.
    const nx = nextSegments()[0];
    spot.dataset.k = '';
    if (nx) {
      const d = new Date(nx.start);
      media.outerHTML = `<div class="spot-media"><span class="when"><span>${esc(dayF().format(d))}</span><b>${esc(clock(d))}</b><span data-until="${esc(nx.start)}" class="rel">${esc(relTime(nx.start))}</span></span></div>`;
      txt.innerHTML = `<p class="eyebrow">${esc(ui.nobodyLive)} ${esc(ui.nextUpLabel)}: <b>${name(nx)}</b></p>`
        + `<h2 class="spot-t">${esc(nx.title || '')}</h2>`
        + `<div class="acts"><a class="btn" href="${esc(app.querySelector<HTMLAnchorElement>('.cal')?.href ?? '#')}"><svg class="ic" aria-hidden="true"><use href="#i-cal" /></svg>${esc(ui.addToCalendar)}</a></div>`;
    } else {
      media.outerHTML = `<div class="spot-media" aria-hidden="true"><span class="spot-ph"></span></div>`;
      txt.innerHTML = `<p class="eyebrow">${esc(ui.nobodyLive)}</p><p class="spot-t">${esc(ui.tagline)}</p>`;
    }
  }

  function renderOnNow(live: Streamer[]) {
    if (!onnow) return;
    const rest = live.slice(1);
    const nLive = live.filter((s) => s.status === 'online').length;
    const items: string[] = rest.map((s) => {
      const online = s.status === 'online';
      const topics = topicsFor(s);
      const when = online ? (s.started_at ? since(s.started_at) : '') : startsSoon(s) ? until(startsSoon(s)) : '';
      const status = tag(s) + (when ? ` · ${when}` : '');
      return `<li class="${online ? 'on' : 'pre'}" data-login="${esc(s.login.toLowerCase())}" data-topics="${esc(topics.join('|'))}">`
        + `<a class="th" href="${twitch(s.login)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${online ? thumbImg(s, 102, 57, 'loading="lazy"') : '<span class="ring"></span>'}</a>`
        + `<span class="who"><a href="${twitch(s.login)}" target="_blank" rel="noopener">${name(s)}</a><span class="m">${status}</span></span>`
        + `<span class="what"><span class="t" title="${esc(s.title)}">${esc(s.title)}</span><span class="c">${esc([...(topics.length ? topics : [s.category]), langName(s.language)].filter(Boolean).join(' · '))}</span></span>`
        + `<span class="num">${online && s.viewers != null ? `${esc(num(s.viewers))}<span class="sr"> ${esc(viewersLabel)}</span>` : ''}</span></li>`;
    });
    // Fill the remaining rows with what's next on the schedule.
    for (const sg of nextSegments().slice(0, Math.max(0, ROWS - items.length))) {
      const d = new Date(sg.start);
      const topics = topicsOf(sg.title ?? '');
      items.push(`<li class="next" data-login="${esc(sg.login.toLowerCase())}" data-text="${esc(sg.title)}" data-topics="${esc(topics.join('|'))}">`
        + `<span class="th">${esc(clock(d))}</span>`
        + `<span class="who"><a href="${twitch(sg.login)}" target="_blank" rel="noopener">${name(sg)}</a><span class="m">${esc(ui.nextUpLabel)} · ${until(sg.start, false)}</span></span>`
        + `<span class="what"><span class="t">${esc(sg.title)}</span><span class="c">${esc((topics.length ? topics : [sg.category]).filter(Boolean).join(' · '))}</span></span><span class="num"></span></li>`);
    }
    if (!items.length) items.push(`<li><span class="msg">${esc(statusOk === false ? ui.unavailable : ui.nobodyLive)}</span></li>`);
    while (items.length < ROWS) items.push('<li class="ph" aria-hidden="true"></li>');
    onnow.innerHTML = items.join('');
    if (onN) onN.textContent = nLive ? String(nLive) : '';
    const liveRows = rest.length;
    if (more) {
      more.hidden = liveRows <= ROWS;
      more.dataset.n = String(liveRows);
      if (!onnow.classList.contains('all')) more.textContent = f('showAll', { n: liveRows });
    }
  }

  function renderTopics(live: Streamer[]) {
    if (!topicsEl) return;
    const counts = new Map<string, number>();
    for (const s of live) for (const t of topicsFor(s)) counts.set(t, (counts.get(t) ?? 0) + 1);
    if (topic && !counts.has(topic)) counts.set(topic, 0);
    const order = TOPICS.map(([t]) => t).filter((t) => counts.has(t));
    const key = order.map((t) => `${t}:${counts.get(t)}`).join(',');
    if (topicsEl.dataset.k === key) return;
    topicsEl.dataset.k = key;
    topicsEl.innerHTML = order.map((t) => `<button type="button" data-topic="${esc(t)}" aria-pressed="${t === topic}">${esc(t)} <b>${counts.get(t)}</b></button>`).join('');
  }

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

  function nowText(s: Streamer | undefined) {
    if (!s) return '';
    if (s.status === 'online') return [s.title, s.viewers != null ? f('viewers', { n: num(s.viewers) }) : ''].filter(Boolean).join(' · ');
    if (s.status === 'prelive') return s.title ?? '';
    return '';
  }

  // The list is the page: live, then getting ready, then 30-day rank (as the
  // old sort.js). Rows carry their rank in data-rank; only moved rows are touched.
  const order = (tr: HTMLElement) => {
    const st = byLogin.get(tr.dataset.login!)?.status;
    return (st === 'online' ? 0 : st === 'prelive' ? 1 : 2) * 1e4 + Number(tr.dataset.rank);
  };
  function nextFor() {
    const m = new Map<string, Segment>(), now = Date.now();
    for (const sg of segments) if (!sg.canceled && Date.parse(sg.start) > now && !m.has(sg.login.toLowerCase())) m.set(sg.login.toLowerCase(), sg);
    return m;
  }
  function renderRows() {
    const max = Math.max(1, ...[...byLogin.values()].map((s) => s.hours_30d ?? 0));
    const next = nextFor();
    const bucket = Math.floor(Date.now() / 300000);
    for (const tr of rows) {
      const s = byLogin.get(tr.dataset.login!);
      const online = s?.status === 'online', pre = s?.status === 'prelive';
      const sg = !online && !pre ? next.get(tr.dataset.login!) : undefined;
      const hrs = s?.hours_30d;
      const k = `${s?.status}|${s?.title}|${s?.viewers}|${s?.started_at}|${hrs}|${sg?.start}|${online ? bucket : ''}`;
      if (tr.dataset.k === k) continue;
      tr.dataset.k = k;
      tr.className = online ? 'on' : pre ? 'pre' : '';
      const when = online && s!.started_at ? ` · ${since(s!.started_at)}` : pre && startsSoon(s!) ? ` · ${until(startsSoon(s!))}` : '';
      tr.querySelector('.st')!.innerHTML = s && (online || pre) ? tag(s, when) : '';
      tr.querySelector('.th')!.innerHTML = online ? thumbImg(s!, 144, 81, 'loading="lazy"') : pre ? '<span class="ring"></span>' : '';
      const now = tr.querySelector<HTMLElement>('.now')!;
      if (online || pre) {
        const topics = topicsFor(s);
        const meta = [...(topics.length ? topics : [s!.category]), langName(s!.language), online && s!.viewers != null ? f('viewers', { n: num(s!.viewers) }) : ''].filter(Boolean).join(' · ');
        now.innerHTML = `<span class="t">${esc(s!.title || s!.category || '')}</span><span class="c">${esc(meta)}</span>`;
        now.title = s!.title ?? '';
      } else if (sg) {
        const d = new Date(sg.start);
        // Within a day the relative time says it all; further out, the weekday and time.
        now.innerHTML = Date.parse(sg.start) - Date.now() < 864e5
          ? `${esc(ui.nextUpLabel)} · ${esc(clock(d))} · ${until(sg.start, false)}`
          : `${esc(ui.nextUpLabel)} · ${esc(wkF().format(d))} ${esc(clock(d))}`;
        now.title = sg.title ?? '';
      } else {
        now.textContent = '';
        now.title = '';
      }
      const act = tr.querySelector<HTMLElement>('.act');
      if (act) {
        act.querySelector('b')!.style.width = hrs != null ? `${Math.round((hrs / max) * 100)}%` : '0';
        act.querySelector('span')!.textContent = hrs != null ? `${Math.round(hrs)}h` : '';
        act.title = hrs != null ? f('hours30d', { n: Math.round(hrs) }) : '';
      }
    }
    const list = rows[0]?.parentElement;
    if (list) {
      const want = [...rows].sort((a, b) => order(a) - order(b));
      const cur = [...list.children].filter((c) => (c as HTMLElement).dataset.rank != null);
      if (want.some((tr, i) => tr !== cur[i])) list.append(...want);
      let lastLive: HTMLElement | undefined;
      for (const tr of want) if (tr.classList.contains('on') || tr.classList.contains('pre')) lastLive = tr;
      for (const tr of want) tr.classList.toggle('last-live', tr === lastLive);
      list.classList.add('ready');
    }
  }

  // Yield to the browser between render steps so no single task blocks input.
  const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));
  let renderSeq = 0;

  async function renderStatus() {
    const seq = ++renderSeq;
    const live = liveSorted();
    const n = live.filter((s) => s.status === 'online').length;
    document.title = n ? `${f('liveNow', { n })} · ${baseTitle}` : baseTitle;
    document.documentElement.classList.toggle('on-air', n > 0);
    if (badge) {
      badge.classList.toggle('on', n > 0);
      badge.lastElementChild!.textContent = statusOk === false ? ui.unavailable : n ? f('liveNow', { n }) : ui.nobodyLive;
    }
    renderSpot(live);
    renderTopics(live);

    await yieldTask();
    if (seq !== renderSeq) return; // a newer response is already rendering
    renderOnNow(live);

    await yieldTask();
    if (seq !== renderSeq) return;
    renderRows();

    await yieldTask();
    if (seq !== renderSeq) return;
    fillLangs();
    apply();
  }

  function renderSchedule(ok: boolean) {
    if (!sched) return;
    const now = Date.now();
    // Only segments that haven't started: schedule.json also carries today's
    // past and in-progress ones, and a streamer who is live is in On now.
    const upcoming = segments.filter((s) => !s.canceled && Date.parse(s.start) > now).slice(0, 40);
    if (!ok || !upcoming.length) {
      sched.innerHTML = `<li class="note">${esc(ok ? ui.upcomingEmpty : ui.unavailable)}</li>`;
    } else {
      let day = '';
      sched.innerHTML = upcoming.map((s) => {
        const d = new Date(s.start);
        const label = dayF().format(d);
        const head = label !== day ? `<li class="day">${esc(label)}</li>` : '';
        day = label;
        const text = [s.title, s.category].filter(Boolean).join(' · ');
        return `${head}<li class="ev" data-login="${esc(s.login.toLowerCase())}" data-text="${esc(text)}" data-topics="${esc(topicsOf(s.title ?? '').join('|'))}">`
          + `<time datetime="${esc(s.start)}">${esc(clock(d))}</time>`
          + `<span class="rel" data-until="${esc(s.start)}">${esc(relTime(s.start))}</span>`
          + `<span class="what"><a href="${twitch(s.login)}" target="_blank" rel="noopener">${name(s)}</a><span title="${esc(text)}">${esc(text)}</span></span></li>`;
      }).join('');
    }
    // The rows show each streamer's next stream; the spotlight and On now use it too.
    if (statusOk !== undefined) {
      renderRows();
      const live = liveSorted();
      renderSpot(live);
      renderOnNow(live);
    }
    apply();
  }

  // A segment that has started drops out of the schedule, spotlight and On now
  // on the next 30 s status poll, not the 5 min schedule poll.
  function dropStarted() {
    const now = Date.now();
    if (!segments.length || ![...app.querySelectorAll<HTMLElement>('[data-until]')].some((el) => Date.parse(el.dataset.until!) <= now)) return false;
    renderSchedule(true);
    return true;
  }

  function refreshTimes() {
    if (dropStarted()) return;
    for (const el of app.querySelectorAll<HTMLElement>('[data-since]')) el.textContent = duration(ago(el.dataset.since!));
    for (const el of app.querySelectorAll<HTMLElement>('[data-until]')) {
      el.textContent = el.classList.contains('rel') ? relTime(el.dataset.until!) : f('startsIn', { t: relTime(el.dataset.until!) });
    }
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
  const warm = [numF, relF, clockF, dayF, namesF, collF];
  const warmNext = () => { const w = warm.shift(); if (w) { w(); setTimeout(warmNext, 0); } };
  const go = () => {
    setTimeout(() => rows[0]?.parentElement?.classList.add('ready'), 2500);
    warmNext();
    poller('status.json', 30_000, (text) => {
      try {
        if (!text) throw 0;
        const data = JSON.parse(text) as { streamers?: Streamer[] };
        byLogin = new Map((data.streamers ?? []).map((s) => [s.login.toLowerCase(), s]));
        statusOk = true;
        dropStarted();
      } catch {
        // Keep the last good data on a transient failure; say so only if we never had any.
        if (statusOk) return refreshTimes();
        statusOk = false;
      }
      void renderStatus();
    });
    if (sched || onnow) {
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
