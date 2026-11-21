// A streamer's link-preview image (1200 x 630), drawn at build time from the
// bot's stats: their name on a rack sled's front panel, the 30-day figures and
// when they're usually live. SVG rendered to PNG with resvg and the bundled
// JetBrains Mono (scripts/og/fonts, OFL), so every build draws the same image.
import { Resvg } from '@resvg/resvg-js';
import { resolve } from 'node:path';
import type { Stats } from './streamer-render';

const FONTS = ['JetBrainsMono-Regular.ttf', 'JetBrainsMono-Medium.ttf'].map((f) => resolve(process.cwd(), 'scripts/og/fonts', f));
const x = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n?: number) => (n == null ? '' : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function ogImage(name: string, login: string, st: Stats, share: number): Buffer {
  const W = 1200, H = 630;
  // name plate sized to the name; the meter follows it
  const size = Math.min(80, Math.floor(430 / (name.length * 0.6)));
  const plateW = Math.round(name.length * 0.6 * size + 48), mx = 130 + plateW + 40;
  const lit = Math.max(st.hours?.['30d'] ? 1 : 0, Math.round(share * 10));
  const seg = Array.from({ length: 10 }, (_, i) => `<rect x="${mx + i * 34}" y="249" width="28" height="12" rx="1" fill="${i < lit ? '#00d892' : '#22272d'}"/>`).join('');
  const figs = ([['30 DAYS', st.hours?.['30d'] != null ? `${num(st.hours['30d'])} h` : ''], ['STREAMS, 30 DAYS', num(st.streams_30d)],
    ['TYPICAL STREAM', st.median_stream_hours_30d ?? st.avg_stream_hours_30d ? `${num(st.median_stream_hours_30d ?? st.avg_stream_hours_30d)} h` : ''],
    ['FOLLOWERS', st.followers != null ? st.followers.toLocaleString('en-US') : '']] as [string, string][]).filter(([, v]) => v);
  const fig = figs.map(([k, v], i) => `<g transform="translate(${80 + i * 262} 352)"><text y="0" font-size="16" fill="#8a8b8e" letter-spacing="1.5">${x(k)}</text><text y="46" font-size="40" fill="#e4e4e4">${x(v)}</text></g>`).join('');
  // usually live: 7 x 24 (UTC, Monday first)
  const heat = st.heatmap_90d;
  let hm = '';
  if (heat?.length === 7 && heat.some((r) => r.some((v) => v > 0))) {
    const max = Math.max(...heat.flat(), 0.01);
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    hm = `<g transform="translate(80 458)"><text y="-14" font-size="16" fill="#8a8b8e" letter-spacing="1.5">USUALLY LIVE (UTC)</text>`
      + heat.map((row, d) => `<text x="0" y="${d * 16 + 12}" font-size="12" fill="#8a8b8e">${days[d]}</text>`
        + row.map((v, h) => { const l = v / max; const c = l > 0.66 ? '#00d892' : l > 0.33 ? '#00845a' : l > 0.02 ? '#0f3d30' : '#1a1d21'; return `<rect x="${46 + h * 16}" y="${d * 16}" width="14" height="14" rx="1" fill="${c}"/>`; }).join('')).join('')
      + `</g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrains Mono">
  <rect width="${W}" height="${H}" fill="#0b0e12"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="#121519" stroke="#2a2d31"/>
  <g transform="translate(80 104)" fill="none" stroke="#e4e4e4" stroke-width="3.4"><path d="M13 5H6v22h7M31 5h7v22h-7"/></g>
  <circle cx="102" cy="120" r="5.6" fill="#00d892"/>
  <text x="140" y="129" font-size="26" font-weight="500" fill="#e4e4e4">InfoSec Streams</text>
  <!-- the sled: a 1U front panel with the streamer's name plate and 30-day meter -->
  <rect x="64" y="196" width="${W - 128}" height="118" rx="3" fill="#111418" stroke="#3a3d42"/>
  <rect x="64" y="196" width="${W - 128}" height="50" fill="#ffffff" fill-opacity="0.03"/>
  <circle cx="104" cy="230" r="7" fill="#3a3d42"/><circle cx="104" cy="280" r="4" fill="#0f3d30"/>
  <rect x="130" y="214" width="${plateW}" height="82" fill="#090b0e" stroke="#2a2d31"/>
  <text x="152" y="${255 + size * 0.33}" font-size="${size}" font-weight="500" fill="#e4e4e4">${x(name)}</text>
  ${seg}
  ${Array.from({ length: 24 }, (_, i) => `<circle cx="${1010 + (i % 8) * 13 + (Math.floor(i / 8) % 2) * 6}" cy="${232 + Math.floor(i / 8) * 18}" r="3" fill="#050607"/>`).join('')}
  ${fig}
  ${hm}
  <text x="${W - 80}" y="${H - 64}" font-size="20" fill="#8a8b8e" text-anchor="end">infosecstreams.com/streamer/${x(login)}</text>
</svg>`;
  return new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' }, fitTo: { mode: 'width', value: W } }).render().asPng();
}
