// /sw.js with a version that changes on every deploy.
import type { APIRoute } from 'astro';
import { transformSync } from 'esbuild';
import src from '../scripts/sw.js?raw';

const version = (process.env.GITHUB_SHA ?? Date.now().toString(36)).slice(0, 12);

export const GET: APIRoute = () =>
  new Response(transformSync(src.replace('__VERSION__', version), { minify: true, target: 'es2020' }).code, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
