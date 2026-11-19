// Writes mock API responses into dist/mock-api/ for a `build:mock` build
// (screenshots, Lighthouse) — never part of the production build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { generate, ics } from '../mock/fixtures.mjs';

const { status, schedule } = generate();
mkdirSync('dist/mock-api', { recursive: true });
writeFileSync('dist/mock-api/status.json', JSON.stringify(status));
writeFileSync('dist/mock-api/schedule.json', JSON.stringify(schedule));
writeFileSync('dist/mock-api/schedule.ics', ics(schedule));
console.log(`mock API: ${status.live_count} live, ${schedule.segments.length} segments`);
