// Mock status.json / schedule.json / schedule.ics in the shapes of
// ~/repos/infosecstreams-notes/CONTRACT.md, with times relative to `now`, so
// the site can be developed and screenshotted before the bot API is deployed.
import { readFileSync } from 'node:fs';

const logins = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    .split('\n').map((l) => l.split(',')[0].trim()).filter((l) => /^\w+$/.test(l));

const iso = (ms) => new Date(Math.floor(ms / 60000) * 60000).toISOString().replace('.000Z', 'Z');
const MIN = 60_000, H = 60 * MIN;

const LIVE = [
  { category: 'Science & Technology', title: 'Building a home SOC lab with Wazuh — part 3: detection rules', language: 'en', viewers: 312, up: 2 * H + 14 * MIN, tags: ['English', 'BlueTeam', 'cybersecurity'] },
  { category: 'Science & Technology', title: 'HTB Season: Insane box, no spoilers — !discord', language: 'en', viewers: 188, up: 1 * H + 5 * MIN, tags: ['English', 'hacking', 'CTF'] },
  { category: 'Science & Technology', title: 'Pentest de una API REST en vivo: OWASP API Top 10', language: 'es', viewers: 141, up: 3 * H + 2 * MIN, tags: ['Español', 'pentesting'] },
  { category: 'Software and Game Development', title: 'Reversing a crackme in Ghidra, then writing the keygen in Rust', language: 'en', viewers: 87, up: 48 * MIN, tags: ['English', 'reverseengineering'] },
  { category: 'Science & Technology', title: 'TryHackMe: Wreath network, pivoting through the whole thing', language: 'en', viewers: 54, up: 1 * H + 37 * MIN, tags: ['English', 'tryhackme'] },
  { category: 'Just Chatting', title: 'DFIR Q&A : trier un incident ransomware en direct', language: 'fr', viewers: 19, up: 21 * MIN, tags: ['Français', 'blueteam'] },
];

export function generate(now = Date.now()) {
  const active = logins('streamers.csv');
  const inactive = logins('inactive_streamers.csv');
  const pick = (i) => active[(i * 7 + 3) % active.length];
  const live = LIVE.map((l, i) => ({ ...l, login: pick(i) }));
  const prelive = [active[5 % active.length], active[12 % active.length]];
  const langs = ['en', 'en', 'en', 'de', 'es', 'fr', 'pt', 'en', 'it', 'tr'];
  const streamers = [...active, ...inactive].map((login, i) => {
    // Like the bot: category/title/language only for online and pre-live streamers.
    const s = { id: String(100000 + i), login: login.toLowerCase(), display_name: login, status: 'offline' };
    if (i < active.length) s.hours_30d = Math.round((80 - i * 1.7) * 10) / 10;
    const l = live.find((x) => x.login === login);
    if (l) Object.assign(s, { status: 'online', category: l.category, title: l.title, language: l.language, tags: l.tags, started_at: iso(now - l.up), viewers: l.viewers });
    if (login === prelive[0]) Object.assign(s, { status: 'prelive', language: 'en', category: 'Science & Technology', title: 'Malware Monday: unpacking a fresh infostealer', prelive_since: iso(now - 6 * MIN), next_stream_at: iso(now + 12 * MIN) });
    if (login === prelive[1]) Object.assign(s, { status: 'prelive', language: langs[i % langs.length], category: 'Science & Technology', title: 'Red team lab: AD attack paths with BloodHound', prelive_since: iso(now - 2 * MIN) });
    return s;
  });
  const start = Math.ceil(now / (30 * MIN)) * 30 * MIN;
  const titles = ['CTF night', 'Intro to Active Directory attacks', 'Bug bounty recon live', 'Detection engineering office hours', 'Malware analysis 101', 'HackTheBox: retired machines', 'Homelab hardening', 'Rust for security tooling'];
  const segments = Array.from({ length: 14 }, (_, i) => {
    const login = active[(i * 5 + 1) % active.length];
    const s = start + (i * 11 + 1) * H + (i % 2) * 30 * MIN;
    return { id: `seg-${i}`, login: login.toLowerCase(), display_name: login, start: iso(s), end: iso(s + 2 * H), title: titles[i % titles.length], category: 'Science & Technology', canceled: false };
  });
  // Like the real schedule.json: today's segments that already started (one
  // whose streamer never went live, one in progress) come first.
  const past = [[active[2], 2 * H, 'Past: started, not live'], [active[3], H, 'Past: in progress']];
  segments.unshift(...past.map(([login, ago, title], i) => ({ id: `past-${i}`, login: login.toLowerCase(), display_name: login, start: iso(now - ago), end: iso(now - ago + 3 * H), title, category: 'Science & Technology', canceled: false })));
  const generated_at = iso(now);
  return {
    status: { generated_at, live_count: streamers.filter((s) => s.status === 'online').length, streamers },
    schedule: { generated_at, segments },
  };
}

export function ics(schedule) {
  const d = (s) => s.replace(/[-:]/g, '');
  const ev = schedule.segments.map((s) => [
    'BEGIN:VEVENT', `UID:${s.id}@infosecstreams.com`, `DTSTAMP:${d(schedule.generated_at)}`, `DTSTART:${d(s.start)}`, `DTEND:${d(s.end)}`,
    `SUMMARY:${s.display_name}: ${s.title}`, `URL:https://www.twitch.tv/${s.login}`, 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//InfoSec Streams//mock//EN', ...ev, 'END:VCALENDAR', ''].join('\r\n');
}

// Synthetic "stream screenshots" for mock builds, standing in for Twitch's
// live preview images: a terminal, an IDE, a SIEM dashboard or a proxy, each
// with a webcam corner. Deterministic per login.
export function thumbSvg(login) {
  let h = 0; for (const c of login) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (n) => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
  const kind = h % 4;
  const bg = ['#0d1117', '#1e1e2e', '#0b1220', '#1b1b1f'][kind];
  let body = '';
  if (kind === 0) { // terminal
    for (let i = 0; i < 14; i++) body += `<rect x="${40}" y="${70 + i * 30}" width="${120 + r(560)}" height="12" rx="3" fill="${i % 4 === 0 ? '#3ee08f' : '#8b949e'}" opacity="${i % 4 === 0 ? 0.9 : 0.55}"/>`;
  } else if (kind === 1) { // IDE
    body += `<rect x="0" y="40" width="160" height="680" fill="#181825"/>`;
    for (let i = 0; i < 18; i++) { const c = ['#cba6f7', '#89b4fa', '#a6e3a1', '#f9e2af', '#cdd6f4'][r(5)]; body += `<rect x="${200 + r(4) * 24}" y="${70 + i * 30}" width="${80 + r(420)}" height="11" rx="3" fill="${c}" opacity=".75"/>`; }
  } else if (kind === 2) { // SIEM dashboard
    for (let i = 0; i < 3; i++) body += `<rect x="${40 + i * 300}" y="70" width="280" height="140" rx="10" fill="#111a2e"/><text x="${60 + i * 300}" y="160" font-family="sans-serif" font-size="48" font-weight="700" fill="${['#4cc38a', '#f5c451', '#ef6b6b'][i]}">${[1200 + r(9000), r(400), r(60)][i]}</text>`;
    let d = 'M40 520'; for (let x = 40; x <= 900; x += 30) d += ` L${x} ${420 + r(160)}`;
    body += `<rect x="40" y="240" width="880" height="420" rx="10" fill="#111a2e"/><path d="${d}" fill="none" stroke="#4c8dff" stroke-width="4"/>`;
  } else { // intercepting proxy
    body += `<rect x="20" y="60" width="600" height="640" rx="6" fill="#26262b"/><rect x="640" y="60" width="620" height="640" rx="6" fill="#26262b"/>`;
    for (let i = 0; i < 16; i++) body += `<rect x="40" y="${90 + i * 36}" width="${200 + r(360)}" height="12" rx="3" fill="${i === 0 ? '#ff8a3d' : '#a1a1aa'}" opacity=".7"/><rect x="660" y="${90 + i * 36}" width="${150 + r(420)}" height="12" rx="3" fill="#a1a1aa" opacity=".5"/>`;
  }
  const cam = ['#3b2f2f', '#2f3b35', '#2f323b'][r(3)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720"><rect width="1280" height="720" fill="${bg}"/><rect width="1280" height="40" fill="#000" opacity=".35"/><circle cx="24" cy="20" r="6" fill="#ff5f57"/><circle cx="44" cy="20" r="6" fill="#febc2e"/><circle cx="64" cy="20" r="6" fill="#28c840"/>${body}<rect x="960" y="470" width="300" height="230" rx="14" fill="${cam}"/><circle cx="1110" cy="560" r="48" fill="#c8a989"/><path d="M1030 700c10-70 150-70 160 0z" fill="#3a4a5c"/></svg>`;
}
