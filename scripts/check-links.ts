import { loadCategories, writeCategory } from './lib.ts';
import type { ItemStatus } from '../data/schema.ts';

/**
 * Link-health validator. Replaces the original repo's buggy README scraper.
 * - concurrent fetch with timeout + single retry (no double-fetch bug)
 * - flags dead (network / 4xx / 5xx), risky (known-bad domain or defacement keywords)
 * - writes status + last_checked back into the YAML source
 *
 * Env: CONCURRENCY (default 20), TIMEOUT_MS (default 12000), LIMIT (cap items, for testing)
 */
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 12000);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const UA = 'Mozilla/5.0 (compatible; OsintAtlasLinkCheck/1.0)';

// Seeded from the original repo's dev notes (hijacked / malicious).
const KNOWN_BAD = new Set(['codefinder.org', 'faceagle.com']);
const RISKY_KEYWORDS = /(online gambling|casino|slot gacor|judi|viagra|defaced by|hacked by)/i;

const today = new Date().toISOString().slice(0, 10);

interface Target { url: string; setStatus: (s: ItemStatus) => void }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function probe(url: string): Promise<ItemStatus> {
  const host = hostOf(url);
  if (KNOWN_BAD.has(host)) return 'risky';

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
      // some servers reject HEAD; fall back to a light GET
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
      }
      clearTimeout(t);
      if (res.status >= 400) return 'dead';
      const finalHost = hostOf(res.url);
      if (KNOWN_BAD.has(finalHost)) return 'risky';
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('text/html')) {
        const body = (await res.text()).slice(0, 20000);
        if (RISKY_KEYWORDS.test(body)) return 'risky';
      }
      return 'active';
    } catch {
      clearTimeout(t);
      if (attempt === 1) return 'dead';
    }
  }
  return 'dead';
}

async function pool(targets: Target[]): Promise<void> {
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < targets.length) {
      const cur = targets[idx++];
      const status = await probe(cur.url);
      cur.setStatus(status);
      if (++done % 100 === 0) console.log(`  ...${done}/${targets.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

const loaded = loadCategories();
const targets: Target[] = [];
for (const { data } of loaded) {
  for (const item of data.items) {
    if (targets.length >= LIMIT) break;
    targets.push({
      url: item.url,
      setStatus: (s) => { item.status = s; item.last_checked = today; },
    });
  }
}

console.log(`[*] checking ${targets.length} links @ concurrency ${CONCURRENCY}`);
await pool(targets);

for (const { file, data } of loaded) writeCategory(file, data);

const all = loaded.flatMap((l) => l.data.items);
console.log(
  `[+] done: ${all.filter((i) => i.status === 'active').length} active, ` +
    `${all.filter((i) => i.status === 'dead').length} dead, ` +
    `${all.filter((i) => i.status === 'risky').length} risky`,
);
