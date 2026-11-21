// Stats fetched once per build, so each streamer's page ships with their
// numbers in the HTML (indexable, and readable without JavaScript). A build
// never fails over this: no stats just means the page fills in in the browser
// and stays out of search. Fetches go 12 at a time and retry a network blip
// (a 404 is an answer: no stats for that streamer).
import { API_BASE } from './api';
import type { Stats } from './streamer-render';

const cache = new Map<string, Promise<Stats | null>>();
let active = 0;
const queue: (() => void)[] = [];
const slot = () => new Promise<void>((r) => { if (active < 12) { active++; r(); } else queue.push(() => { active++; r(); }); });
const free = () => { active--; queue.shift()?.(); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(login: string): Promise<Stats | null> {
  await slot();
  try {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(`${API_BASE}stats/${encodeURIComponent(login)}.json`, { signal: AbortSignal.timeout(10_000) });
        if (r.ok) return (await r.json()) as Stats;
        if (r.status === 404) return null;
      } catch { /* network: retry */ }
      await sleep(500 * 2 ** i);
    }
    console.warn(`[build-stats] no stats for ${login} after retries`);
    return null;
  } finally { free(); }
}

export function statsAtBuild(login: string): Promise<Stats | null> {
  if (!/^https?:/.test(API_BASE)) return Promise.resolve(null);
  if (!cache.has(login)) cache.set(login, get(login));
  return cache.get(login)!;
}
