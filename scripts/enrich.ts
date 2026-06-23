import { loadCategories, writeCategory } from './lib.ts';
import type { Item } from '../data/schema.ts';

/**
 * Heuristic enrichment from observable signals only (domain + name patterns).
 * No fabricated facts: we never invent descriptions of what a tool does.
 * - tags inferred from URL host / path / name
 * - category gets a neutral templated description if missing
 * Idempotent: re-running merges tags without dupes.
 */
function tagsFor(item: Item): string[] {
  const t = new Set(item.tags);
  let host = '';
  let path = '';
  try { const u = new URL(item.url); host = u.hostname.toLowerCase(); path = u.pathname.toLowerCase(); } catch { /* keep */ }
  const name = item.name.toLowerCase();
  const hay = `${name} ${item.url.toLowerCase()}`;

  if (/(^|\.)github\.com$/.test(host) || /(^|\.)gitlab\.com$/.test(host)) t.add('open-source');
  if (/\.gov(\.|$)|\.mil(\.|$)/.test(host)) t.add('official');
  if (/\.edu(\.|$)|\.ac\.[a-z]+$/.test(host)) t.add('academic');
  if (/(^|\.)t\.me$|telegram/.test(host) || /telegram/.test(name)) t.add('telegram');
  if (/\.onion(\.|$|\/)/.test(item.url)) t.add('onion');
  if (host.endsWith('.pdf') || path.endsWith('.pdf')) t.add('document');
  if (/\bapi\b/.test(hay)) t.add('api');
  if (/\bmaltego\b/.test(hay)) t.add('maltego');
  if (/\bextension\b|\baddon\b|chrome\.google|addons\.mozilla/.test(hay)) t.add('browser-extension');
  if (/\bfree\b/.test(name)) t.add('free');
  if (/\bpaid\b|\bpremium\b|\bpro\b|\benterprise\b|\bsubscription\b/.test(name)) t.add('paid');
  if (/sign ?up|register|account|login/.test(name)) t.add('account-required');
  return [...t].sort();
}

let itemsTagged = 0;
let catsDescribed = 0;
for (const { file, data } of loadCategories()) {
  let changed = false;
  for (const item of data.items) {
    const next = tagsFor(item);
    if (next.length !== item.tags.length || next.some((x, i) => x !== item.tags[i])) {
      item.tags = next;
      if (next.length) itemsTagged++;
      changed = true;
    }
  }
  if (!data.description) {
    data.description = `${data.category} — ${data.group} resources (${data.items.length} entries).`;
    catsDescribed++;
    changed = true;
  }
  if (changed) writeCategory(file, data);
}
console.log(`[+] enriched: ${itemsTagged} items tagged, ${catsDescribed} category descriptions added`);
