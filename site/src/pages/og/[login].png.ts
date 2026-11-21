// /og/<login>.png: each active streamer's link-preview image (src/lib/og-image.ts).
// Only for streamers the bot has stats for; their pages fall back to /og.png.
import type { APIRoute } from 'astro';
import { active } from '../../lib/roster';
import { statsAtBuild } from '../../lib/build-stats';
import { ogImage } from '../../lib/og-image';

const logins = () => [...new Set(active.map((s) => s.login.toLowerCase()))];

export async function getStaticPaths() {
  const st = await Promise.all(logins().map((l) => statsAtBuild(l)));
  return logins().filter((_, i) => st[i]).map((login) => ({ params: { login } }));
}

export const GET: APIRoute = async ({ params }) => {
  const login = params.login!;
  const all = await Promise.all(logins().map((l) => statsAtBuild(l)));
  const max = Math.max(1, ...all.map((s) => s?.hours?.['30d'] ?? 0));
  const st = (await statsAtBuild(login))!;
  const name = st.display_name || active.find((s) => s.login.toLowerCase() === login)!.login;
  const png = ogImage(name, login, st, (st.hours?.['30d'] ?? 0) / max);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
