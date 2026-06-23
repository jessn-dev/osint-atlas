import { loadCategories } from './lib.ts';

/** CI gate: schema-validate all category files, report stats, fail on error. */
try {
  const cats = loadCategories();
  const items = cats.reduce((n, c) => n + c.data.items.length, 0);
  const slugs = cats.length;
  const dupNames = findDupUrls(cats);
  if (dupNames.length) {
    console.warn(`[!] ${dupNames.length} duplicate URLs across categories (non-fatal)`);
  }
  console.log(`[+] valid: ${slugs} categories, ${items} items`);
} catch (err) {
  console.error('[-] validation failed');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

function findDupUrls(cats: ReturnType<typeof loadCategories>): string[] {
  const seen = new Map<string, number>();
  for (const c of cats)
    for (const i of c.data.items) {
      const key = i.url.trim().toLowerCase().replace(/\/$/, '');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([u]) => u);
}
