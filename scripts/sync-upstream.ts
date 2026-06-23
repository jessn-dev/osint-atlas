import { loadCategories, writeCategory } from './lib.ts';
import { CategorySchema, type Category } from '../data/schema.ts';
import { slugify, inferGroup, parseMarkdown, type ParsedCat } from './derive.ts';

/**
 * One-way sync from the upstream cheat-sheet into our YAML.
 * ADD-ONLY: never edits or deletes existing entries, so manual tags / link
 * status / descriptions are preserved. New tools land as `status: unchecked`
 * and get picked up by enrich + the next link check.
 *
 * Env:
 *   DRY=1            preview without writing
 *   SOURCES=url,url  override upstream markdown sources
 */
const DEFAULT_SOURCES = [
  'https://raw.githubusercontent.com/Jieyab89/OSINT-Cheat-sheet/main/README.md',
  'https://raw.githubusercontent.com/Jieyab89/OSINT-Cheat-sheet/main/awesome-article.md',
];
const SOURCES = (process.env.SOURCES ?? DEFAULT_SOURCES.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DRY = process.env.DRY === '1';
const UA = 'Mozilla/5.0 (compatible; OsintAtlasSync/1.0)';
const norm = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');

async function fetchUpstream(): Promise<ParsedCat[]> {
  const merged = new Map<string, ParsedCat>();
  for (const url of SOURCES) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.warn(`[!] skip ${url} (HTTP ${res.status})`);
      continue;
    }
    for (const c of parseMarkdown(await res.text())) {
      const key = slugify(c.category);
      const ex = merged.get(key);
      if (ex) ex.items.push(...c.items);
      else merged.set(key, c);
    }
  }
  return [...merged.values()];
}

// index our current data by category slug
const loaded = loadCategories();
const bySlug = new Map(loaded.map((l) => [l.data.slug, l]));

const upstream = await fetchUpstream();
let newItems = 0;
let newCats = 0;
const touched = new Map<string, { file: string; data: Category }>();

for (const uc of upstream) {
  const slug = slugify(uc.category);
  const existing = bySlug.get(slug);

  if (existing) {
    const seen = new Set(existing.data.items.map((i) => norm(i.url)));
    for (const it of uc.items) {
      if (seen.has(norm(it.url))) continue;
      existing.data.items.push({ name: it.name, url: it.url, tags: [], status: 'unchecked' });
      seen.add(norm(it.url));
      newItems++;
      touched.set(slug, existing);
    }
  } else {
    const seen = new Set<string>();
    const items = uc.items
      .filter((i) => {
        const k = norm(i.url);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((i) => ({ name: i.name, url: i.url, tags: [], status: 'unchecked' as const }));
    if (!items.length) continue;
    const data = CategorySchema.parse({ category: uc.category, slug, group: inferGroup(uc.category), items });
    const entry = { file: `${slug}.yml`, data };
    bySlug.set(slug, entry);
    touched.set(slug, entry);
    newCats++;
    newItems += items.length;
  }
}

if (DRY) {
  console.log(
    `[dry] would add ${newItems} items across ${touched.size} categories (${newCats} new categories)`,
  );
  for (const { data } of touched.values()) console.log(`  ~ ${data.slug}`);
} else {
  for (const { file, data } of touched.values()) writeCategory(file, data);
  console.log(`[+] synced: +${newItems} items, +${newCats} new categories (${touched.size} files touched)`);
}
