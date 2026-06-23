import { loadCategories, writeCategory } from './lib.ts';

/**
 * Give dead links a second life: point them at the Wayback Machine so the
 * resource stays useful instead of being a 404. Uses the `/web/2/<url>`
 * redirect form, which resolves to the nearest available snapshot — no API
 * calls needed. Idempotent: clears archive_url if an item is no longer dead.
 */
let added = 0;
let cleared = 0;
for (const { file, data } of loadCategories()) {
  let changed = false;
  for (const item of data.items) {
    if (item.status === 'dead' && !item.archive_url) {
      item.archive_url = `https://web.archive.org/web/2/${item.url}`;
      added++;
      changed = true;
    } else if (item.status !== 'dead' && item.archive_url) {
      delete item.archive_url;
      cleared++;
      changed = true;
    }
  }
  if (changed) writeCategory(file, data);
}
console.log(`[+] archive fallback: +${added} added, ${cleared} cleared`);
