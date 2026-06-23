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
  return s
    .replace(/\s*\[!\[.*$/s, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ordered: first match wins. Narrow/strong signals before generic ones.
const GROUP_RULES: [RegExp, string][] = [
  [/\bdark|onion|\btor\b/i, 'darkweb'],
  [
    /social|facebook|instagram|twitter|tiktok|reddit|youtube|linkedin|telegram|telegra|mastodon|socmint|4chan|bluesky|discord|keybase|myspace|office365|onlyfans|parler|patreon|pinterest|slack|snapchat|steam|\bvk\b|threads|\birc\b|chat app|onedrive|forum|medium|hastag|hashtag|keyword/i,
    'socmint',
  ],
  [
    /aircraft|flight|aviation|drone|vehicle|railway|\btrain\b|maritime|\bship\b|vessel|license plate/i,
    'transport',
  ],
  [
    /crypto|cryptocurrency|financial|finint|fraud|data broker|\bmoney\b|\bbank\b|payment|blockchain/i,
    'finance',
  ],
  [
    /audio|video|deepfake|\bart\b|artist|barcode|emoji|plagiari|similarity|branding|verify|fact check|podcast|\bmusic\b|content removal|image|photo|exif|adult|porn/i,
    'media',
  ],
  [/\bai\b|\bgpt\b|\bllm\b|artificial intel/i, 'ai'],
  [/phone|sigint|wireless|signal|\bsms\b|\bcell\b|imei|\bsdr\b|\bradio\b|spectrum/i, 'sigint'],
  [
    /\bgeo|satellite|\bmap\b|sat-img|masint|\bosm\b|shadow|astronomy|property|wildlife|location|mapping|military|mil osint|\bwar\b/i,
    'geoint',
  ],
  [/breach|leak|stealer|password|credential|dork/i, 'breach'],
  [
    /threat|malware|cyber|\bsoc\b|hunting|\bcve\b|exploit|zero ?day|red ?team|secure code|\bctf\b|forensic|reverse eng/i,
    'threat',
  ],
  [/people|username|email|public record|family|nickname|humint|sockpuppet/i, 'people'],
  [
    /search engine|meta search|code search|custom cse|\bcse\b|academic|google advanced|blogs search|news osint|slides search|document and slides|jurnal|journal|github|gitlab|dataset|data visualization|competitive programming/i,
    'search',
  ],
  [
    /wiki|gitbook|article|\bbook\b|academy|legal|\btips\b|guide|\bjobs\b|language|\bgame\b|playground|\bmisc\b|recommend|cheat sheet|opsec|privacy|calender|calendar|archive|historical|wayback|linux distribution|distro|maltego/i,
    'reference',
  ],
  [
    /domain|\bdns\b|\bip\b|whois|web intel|\burls?\b|company|recon|network|cloud|\bserver\b|shodan|\biot\b|\bapi\b|scraping|software|online tool|\bdevice\b|censorship|monitoring|alerting|torrent|\bp2p\b|directory|shortlink|website changes/i,
    'web',
  ],
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
