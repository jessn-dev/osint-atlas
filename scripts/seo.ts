import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCategories, ROOT } from './lib.ts';

/**
 * Regenerate SEO/discovery files into public/ from the data.
 *   SITE_URL=https://user.github.io/repo/ npm run seo
 */
const SITE = (process.env.SITE_URL ?? 'https://jessn-dev.github.io/osint-atlas/').replace(/\/?$/, '/');
const PUBLIC = join(ROOT, 'public');
const today = new Date().toISOString().slice(0, 10);

const cats = loadCategories().map((l) => l.data);
const items = cats.reduce((n, c) => n + c.items.length, 0);
const groups = [...new Set(cats.map((c) => c.group))].sort();

writeFileSync(join(PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

writeFileSync(
  join(PUBLIC, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE}</loc><lastmod>${today}</lastmod></url>\n` +
    `</urlset>\n`,
);

const llms =
  `# OSINT Atlas\n\n` +
  `> Graph-first, link-health-aware map of OSINT resources. ${cats.length} categories, ` +
  `${items} tools across ${groups.length} groups. Single source of truth: per-category YAML.\n\n` +
  `Site: ${SITE}\nData feed: ${SITE}osint.json\n\n` +
  `## Groups\n${groups.map((g) => `- ${g}`).join('\n')}\n\n` +
  `## Categories\n${cats.map((c) => `- ${c.category} (${c.group}, ${c.items.length} tools)`).join('\n')}\n`;
writeFileSync(join(PUBLIC, 'llms.txt'), llms);

console.log(`[+] seo: robots.txt, sitemap.xml, llms.txt (${cats.length} categories)`);
