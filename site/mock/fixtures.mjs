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
  { category: 'Science & Technology', title: 'Building a home SOC lab with Wazuh — part 3', language: 'en', viewers: 312, up: 2 * H + 14 * MIN },
  { category: 'Software and Game Development', title: 'Reversing a CTF crackme in Ghidra, then writing the keygen in Rust', language: 'en', viewers: 87, up: 48 * MIN },
  { category: 'Science & Technology', title: 'Pentest de una API REST en vivo: OWASP API Top 10', language: 'es', viewers: 41, up: 3 * H + 2 * MIN },
  { category: 'Just Chatting', title: 'Blue team Q&A: questions sur la détection et la réponse', language: 'fr', viewers: 19, up: 21 * MIN },
];

export function generate(now = Date.now()) {
  const active = logins('streamers.csv');
  const inactive = logins('inactive_streamers.csv');
  const pick = (i) => active[(i * 7 + 3) % active.length];
  const live = LIVE.map((l, i) => ({ ...l, login: pick(i) }));
  const prelive = [pick(4), pick(5)];
  const langs = ['en', 'en', 'en', 'de', 'es', 'fr', 'pt', 'en', 'it', 'tr'];
  const streamers = [...active, ...inactive].map((login, i) => {
    const s = { id: String(100000 + i), login: login.toLowerCase(), display_name: login, status: 'offline', language: langs[i % langs.length] };
    if (i < active.length) s.hours_30d = Math.round((80 - i * 1.7) * 10) / 10;
    const l = live.find((x) => x.login === login);
    if (l) Object.assign(s, { status: 'online', category: l.category, title: l.title, language: l.language, tags: ['English', 'infosec'], started_at: iso(now - l.up), viewers: l.viewers });
    if (login === prelive[0]) Object.assign(s, { status: 'prelive', category: 'Science & Technology', title: 'Malware Monday: unpacking a fresh stealer', prelive_since: iso(now - 6 * MIN), next_stream_at: iso(now + 12 * MIN) });
    if (login === prelive[1]) Object.assign(s, { status: 'prelive', category: 'Science & Technology', title: 'HTB Season — Insane box, no spoilers', prelive_since: iso(now - 2 * MIN) });
    return s;
  });
  const start = Math.ceil(now / (30 * MIN)) * 30 * MIN;
  const titles = ['CTF night', 'Intro to Active Directory attacks', 'Bug bounty recon live', 'Detection engineering office hours', 'Malware analysis 101', 'HackTheBox: retired machines', 'Homelab hardening', 'Rust for security tooling'];
  const segments = Array.from({ length: 14 }, (_, i) => {
    const login = active[(i * 5 + 1) % active.length];
    const s = start + (i * 11 + 1) * H + (i % 2) * 30 * MIN;
    return { id: `seg-${i}`, login: login.toLowerCase(), display_name: login, start: iso(s), end: iso(s + 2 * H), title: titles[i % titles.length], category: 'Science & Technology', canceled: false };
  });
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
