// Stats fetched once per build, so each streamer's page ships with their
// numbers in the HTML (indexable, and readable without JavaScript). A build
// never fails over this: no stats just means the page fills in in the browser
// and stays out of search.
import { API_BASE } from './api';
import type { Stats } from './streamer-render';

const cache = new Map<string, Promise<Stats | null>>();
export function statsAtBuild(login: string): Promise<Stats | null> {
  if (!/^https?:/.test(API_BASE)) return Promise.resolve(null);
  if (!cache.has(login)) {
    cache.set(login, fetch(`${API_BASE}stats/${encodeURIComponent(login)}.json`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .catch(() => null));
  }
  return cache.get(login)!;
}
