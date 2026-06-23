/**
 * Online smoke test against a deployed URL. Fails (non-zero) if the page, any
 * asset it references, or the data feed returns non-200 / wrong content-type.
 * Catches the "deploy succeeded but page is blank" class of failure.
 *
 *   SMOKE_URL=https://user.github.io/repo/ npm run smoke
 *   npm run smoke -- https://user.github.io/repo/
 */
const target = process.env.SMOKE_URL ?? process.argv[2];
if (!target) { console.error('[-] no URL: set SMOKE_URL or pass as arg'); process.exit(1); }
const base = new URL(target);

interface Check { label: string; url: string; expectType?: string }

async function head(url: string): Promise<{ status: number; type: string }> {
  const res = await fetch(url, { redirect: 'follow' });
  // drain body so the connection is reusable
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, type: res.headers.get('content-type') ?? '' };
}

const pageRes = await fetch(base.href, { redirect: 'follow' });
if (!pageRes.ok) { console.error(`[-] page ${base.href} -> ${pageRes.status}`); process.exit(1); }
const html = await pageRes.text();

const checks: Check[] = [];
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const ref = m[1];
  if (/^https?:\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
  checks.push({ label: ref.endsWith('.js') ? 'js' : 'asset', url: new URL(ref, base).href, expectType: ref.endsWith('.js') ? 'javascript' : undefined });
}
const feed = html.match(/const feedUrl = "([^"]+)"/);
if (feed) checks.push({ label: 'feed', url: new URL(feed[1], base).href, expectType: 'json' });

let failed = 0;
for (const c of checks) {
  const { status, type } = await head(c.url);
  const typeBad = c.expectType ? !type.includes(c.expectType) : false;
  const bad = status !== 200 || typeBad;
  console.log(`  ${bad ? '✗' : '✓'} [${c.label}] ${status} ${type.split(';')[0]}  ${c.url}`);
  if (bad) failed++;
}

if (!checks.length) { console.error('[-] page referenced no assets — likely empty'); process.exit(1); }
if (failed) { console.error(`[-] smoke failed: ${failed}/${checks.length} resources bad`); process.exit(1); }
console.log(`[+] smoke passed: page + ${checks.length} resources OK`);
