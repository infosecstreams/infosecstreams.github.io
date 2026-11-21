// /stats in the browser: fresh stats.json and raids.json (the bot refreshes
// them every 10 minutes), in the visitor's timezone; raid map hover.
import { renderCommunity, type Community, type Raids } from '../lib/stats-render';

const root = document.getElementById('stats');
if (root) void startStats(root);

async function startStats(root: HTMLElement) {
  const API = root.dataset.api!;
  const ui: Record<string, string> = JSON.parse(root.dataset.ui!);
  const listed = new Set<string>(JSON.parse(root.dataset.roster!));
  const base = root.dataset.base!;
  const body = document.getElementById('st-body')!;
  const get = <T,>(p: string) => fetch(API + p).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
  const [st, raids] = await Promise.all([get<Community>('stats.json'), get<Raids>('raids.json')]);
  if (st || root.dataset.built !== '1') {
    body.innerHTML = renderCommunity(st, raids, {
      lang: document.documentElement.lang, ui, tzOffset: -new Date().getTimezoneOffset() / 60,
      page: (l) => (listed.has(l) ? `${base}/${encodeURIComponent(l)}` : null),
    });
  }
  // Raid map: pointing at someone lights their raids and dims the rest.
  body.addEventListener('pointerover', (e) => {
    const g = (e.target as Element).closest?.('.rmap .n');
    const svg = body.querySelector('.rmap svg');
    if (!svg) return;
    const id = g?.getAttribute('data-id');
    svg.classList.toggle('focus', !!id);
    svg.querySelectorAll('.e').forEach((p) => p.classList.toggle('hot', !!id && (p.getAttribute('data-a') === id || p.getAttribute('data-b') === id)));
    svg.querySelectorAll('.n').forEach((n) => n.classList.toggle('hot', n.getAttribute('data-id') === id));
  });
}

export {};
