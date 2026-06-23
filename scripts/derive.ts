/** Shared helpers for turning upstream markdown into our data model. */

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\[.*?\]\(.*?\)/g, '') // strip md links/badges
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'category'
  );
}

export function cleanName(s: string): string {
  return s.replace(/\s*\[!\[.*$/s, '').replace(/\s+/g, ' ').trim();
}

const GROUP_RULES: [RegExp, string][] = [
  [/social|facebook|instagram|twitter|tiktok|reddit|youtube|linkedin|telegram|mastodon|socmint/i, 'socmint'],
  [/phone|sigint|wireless|signal|sms|cell/i, 'sigint'],
  [/image|exif|geo|satellite|map|sat-img|masint|osm/i, 'geoint'],
  [/breach|leak|stealer|password|credential|dork/i, 'breach'],
  [/domain|dns|ip|whois|web intel|url|company|recon/i, 'web'],
  [/dark|onion|tor/i, 'darkweb'],
  [/people|username|email|public record|family/i, 'people'],
  [/threat|malware|cyber|soc|hunting|cve/i, 'threat'],
  [/wiki|gitbook|article|book|academy|legal|tips/i, 'reference'],
];

export function inferGroup(name: string): string {
  for (const [re, g] of GROUP_RULES) if (re.test(name)) return g;
  return 'general';
}

export interface ParsedCat {
  category: string;
  items: { name: string; url: string }[];
}

/** Parse a markdown doc into categories (# headers) + items (- [name](url)). */
export function parseMarkdown(md: string): ParsedCat[] {
  const cats: ParsedCat[] = [];
  let cur: ParsedCat | null = null;
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    // only H1 defines a category (matches the upstream cheat-sheet's structure);
    // H2/H3 are sub-sections, not tool groups
    const h = line.match(/^#\s+(.*)$/);
    if (h) {
      cur = { category: cleanName(h[1]), items: [] };
      cats.push(cur);
      continue;
    }
    const link = line.match(/^[-*]\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (link && cur) {
      cur.items.push({ name: cleanName(link[1]) || link[2], url: link[2].trim() });
    }
  }
  return cats.filter((c) => c.items.length > 0);
}
