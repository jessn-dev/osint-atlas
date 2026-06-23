import { loadCategories, writeCategory } from './lib.ts';

/**
 * Remove duplicate URLs *within* a single category (real data bugs).
 * Cross-category shared URLs are intentional (a tool can belong to several
 * categories; the graph uses them as correlation links) and are left alone.
 */
const norm = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');

let removed = 0;
let touched = 0;
for (const { file, data } of loadCategories()) {
  const seen = new Set<string>();
  const before = data.items.length;
  data.items = data.items.filter((i) => {
    const k = norm(i.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (data.items.length !== before) {
    removed += before - data.items.length;
    touched++;
    writeCategory(file, data);
  }
}
console.log(`[+] removed ${removed} within-category duplicate items across ${touched} files`);
