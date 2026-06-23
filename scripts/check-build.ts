import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Offline post-build guard. Fails the build (non-zero exit) if the produced
 * `dist/` would ship a blank page — i.e. the exact failure modes we hit on
 * GitHub Pages:
 *   - every asset referenced by index.html must exist on disk
 *   - the data feed must exist and look sane
 *   - .nojekyll must be present (or Pages' Jekyll strips the assets dir)
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = process.env.PAGES_BASE && process.env.PAGES_BASE !== '/' ? process.env.PAGES_BASE.replace(/\/$/, '') : '';
const MIN_CATEGORIES = 100;

const errors: string[] = [];
const ok = (m: string) => console.log(`  ✓ ${m}`);

// map a referenced URL path ("/osint-atlas/assets/x.js") to a file in dist
function toDistPath(ref: string): string | null {
  if (/^https?:\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) return null;
  let p = ref.split('?')[0].split('#')[0];
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  return join(DIST, p.replace(/^\//, ''));
}

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('[-] dist/index.html missing — astro build did not run?');
  process.exit(1);
}
const html = readFileSync(indexPath, 'utf-8');

// 1. every src/href referenced by the page exists
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
let checked = 0;
for (const ref of refs) {
  const f = toDistPath(ref);
  if (!f) continue;
  checked++;
  if (!existsSync(f)) errors.push(`referenced asset missing on disk: ${ref} -> ${f}`);
}
if (!errors.length) ok(`${checked} referenced assets present`);

// 2. the feed URL baked into the page resolves to a real file
const feed = html.match(/const feedUrl = "([^"]+)"/);
if (!feed) errors.push('feedUrl not found in index.html');
else {
  const f = toDistPath(feed[1]);
  if (!f || !existsSync(f)) errors.push(`feed file missing: ${feed[1]}`);
  else {
    try {
      const data = JSON.parse(readFileSync(f, 'utf-8')) as { categories?: unknown[] };
      const n = data.categories?.length ?? 0;
      if (n < MIN_CATEGORIES) errors.push(`feed has only ${n} categories (< ${MIN_CATEGORIES})`);
      else ok(`feed OK (${n} categories)`);
    } catch {
      errors.push('feed is not valid JSON');
    }
  }
}

// 3. .nojekyll present (prevents Pages from stripping the assets dir)
if (!existsSync(join(DIST, '.nojekyll'))) errors.push('dist/.nojekyll missing — add public/.nojekyll');
else ok('.nojekyll present');

if (errors.length) {
  console.error('[-] build check failed:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('[+] build check passed');
