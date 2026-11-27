// Stats fetched once per build, so each streamer's page ships with their
// numbers in the HTML (indexable, and readable without JavaScript). A 404 is an
// answer: no stats for that streamer, so the page fills in in the browser and
// stays out of search. Anything else is retried (fetches go 12 at a time), and
// if the API still can't be reached the build fails: deploying would put
// noindex on pages that are indexed. STATS_OPTIONAL=1 builds without the API.
import { API_BASE } from './api';
import type { Stats } from './streamer-render';

const cache = new Map<string, Promise<Stats | null>>();
let active = 0;
const queue: (() => void)[] = [];
const slot = () => new Promise<void>((r) => { if (active < 12) { active++; r(); } else queue.push(() => { active++; r(); }); });
const free = () => { active--; queue.shift()?.(); };
// Six tries over about 15 s, so an API restart doesn't fail the build.
const TRIES = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(login: string): Promise<Stats | null> {
  await slot();
  try {
    let why = '';
    for (let i = 0; i < TRIES; i++) {
      if (i) await sleep(500 * 2 ** (i - 1));
      try {
        const r = await fetch(`${API_BASE}stats/${encodeURIComponent(login)}.json`, { signal: AbortSignal.timeout(10_000) });
        if (r.ok) return (await r.json()) as Stats;
        if (r.status === 404) return null;
        why = `HTTP ${r.status}`;
      } catch (e) { why = e instanceof Error ? e.message : String(e); }
    }
    if (process.env.STATS_OPTIONAL === '1') {
      console.warn(`[build-stats] no stats for ${login} after ${TRIES} tries (${why})`);
      return null;
    }
    throw new Error(`[build-stats] ${API_BASE}stats/${login}.json failed after ${TRIES} tries: ${why} (STATS_OPTIONAL=1 to build anyway)`);
  } finally { free(); }
}

export function statsAtBuild(login: string): Promise<Stats | null> {
  if (!/^https?:/.test(API_BASE)) return Promise.resolve(null);
  if (!cache.has(login)) cache.set(login, get(login));
  return cache.get(login)!;
}

/** Any other API document at build time (stats.json, raids.json); null on failure. */
const docs = new Map<string, Promise<unknown>>();
export function jsonAtBuild<T>(path: string): Promise<T | null> {
  if (!/^https?:/.test(API_BASE)) return Promise.resolve(null);
  if (!docs.has(path)) {
    docs.set(path, (async () => {
      for (let i = 0; i < 4; i++) {
        try {
          const r = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
          if (r.ok) return await r.json();
        } catch { /* retry */ }
        await sleep(500 * 2 ** i);
      }
      console.warn(`[build-stats] ${path} unavailable`);
      return null;
    })());
  }
  return docs.get(path)! as Promise<T | null>;
}
