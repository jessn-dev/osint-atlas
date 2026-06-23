import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCategories, ROOT } from './lib.ts';
import type { OsintFeed } from '../data/schema.ts';

/** Compile data/categories/*.yml -> public/osint.json (the front-end feed). */
const loaded = loadCategories();
const categories = loaded.map((l) => l.data);

const groups = [...new Set(categories.map((c) => c.group))].sort();
const allItems = categories.flatMap((c) => c.items);

const feed: OsintFeed = {
  generated_at: new Date().toISOString(),
  groups,
  stats: {
    categories: categories.length,
    items: allItems.length,
    dead: allItems.filter((i) => i.status === 'dead').length,
    risky: allItems.filter((i) => i.status === 'risky').length,
  },
  categories,
};

const outDir = join(ROOT, 'public');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'osint.json');
writeFileSync(outFile, JSON.stringify(feed), 'utf-8');

console.log(
  `[+] built ${outFile}: ${feed.stats.categories} cats, ${feed.stats.items} items, ` +
    `${groups.length} groups (${feed.stats.dead} dead, ${feed.stats.risky} risky)`,
);
