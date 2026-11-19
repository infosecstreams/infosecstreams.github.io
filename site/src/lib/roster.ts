// The roster is read at build time from the CSVs at the repository root.
// Order: the 30-day ranking the secinfo job writes into index.md/inactive.md;
// anyone missing from those (e.g. just added) goes last, alphabetically.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Streamer {
  login: string;
  youtube?: string;
}

// Builds run from site/; the roster lives one level up (ROSTER_DIR overrides).
const repo = (f: string) => resolve(process.cwd(), process.env.ROSTER_DIR ?? '..', f);

function readCsv(file: string): Streamer[] {
  const seen = new Set<string>();
  const out: Streamer[] = [];
  for (const line of readFileSync(repo(file), 'utf8').split(/\r?\n/)) {
    const [login, youtube] = line.split(',').map((s) => s.trim());
    if (!login || !/^\w+$/.test(login) || seen.has(login.toLowerCase())) continue;
    seen.add(login.toLowerCase());
    const yt = youtube && /^https:\/\//.test(youtube) && !youtube.includes('twitch.tv') ? youtube : undefined;
    out.push({ login, youtube: yt });
  }
  return out;
}

function rankFrom(file: string): Map<string, number> {
  const rank = new Map<string, number>();
  if (!existsSync(repo(file))) return rank;
  for (const m of readFileSync(repo(file), 'utf8').matchAll(/^[^\n|]*\|?\s*`(\w+)`\s*\|/gm)) {
    const k = m[1].toLowerCase();
    if (!rank.has(k)) rank.set(k, rank.size);
  }
  return rank;
}

function sorted(list: Streamer[], rank: Map<string, number>): Streamer[] {
  const r = (s: Streamer) => rank.get(s.login.toLowerCase()) ?? Infinity;
  return [...list].sort((a, b) => r(a) - r(b) || a.login.localeCompare(b.login, 'en', { sensitivity: 'base' }));
}

export const active = sorted(readCsv('streamers.csv'), rankFrom('index.md'));
export const inactive = sorted(readCsv('inactive_streamers.csv'), rankFrom('inactive.md'));
