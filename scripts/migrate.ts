import { readFileSync } from 'node:fs';
import { CategorySchema, type Category } from '../data/schema.ts';
import { writeCategory } from './lib.ts';
import { slugify, cleanName, inferGroup } from './derive.ts';

/**
 * One-time migration: old osint_data.json -> data/categories/*.yml.
 * Run once, review the generated YAML, then the JSON source can be discarded.
 *   SRC=/path/to/osint_data.json npm run data:migrate
 */
const SRC = process.env.SRC ?? '/Users/mrbubbles/Documents/OSINT-Cheat-sheet-main/Web-Based/osint_data.json';

interface OldItem {
  name: string;
  url: string;
}
interface OldCat {
  category: string;
  items: OldItem[];
}

const old: OldCat[] = JSON.parse(readFileSync(SRC, 'utf-8'));
const usedSlugs = new Set<string>();
let written = 0;

for (const oc of old) {
  const name = cleanName(oc.category);
  if (!name) continue;
  let slug = slugify(name);
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${slugify(name)}-${n++}`;
  usedSlugs.add(slug);

  const cat: Category = CategorySchema.parse({
    category: name,
    slug,
    group: inferGroup(name),
    items: (oc.items ?? [])
      .filter((i) => i?.url && /^https?:\/\//i.test(i.url))
      .map((i) => ({ name: cleanName(i.name) || i.url, url: i.url.trim() })),
  });

  writeCategory(`${slug}.yml`, cat);
  written++;
}

console.log(`[+] migrated ${written} categories -> data/categories/`);
