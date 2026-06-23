# OSINT Atlas

OSINT Atlas is a graph-first, link-health-aware map of ~5,000 open-source-intelligence tools and resources. Browse by force-directed graph 
(groups → categories → tools) with global search, status/group filters, and URL-correlation pivots. Built from per-category YAML as the 
single source of truth, compiled by Astro to a static site on GitHub Pages. Dead/hijacked links are flagged weekly and fall back to the 
Wayback Machine; new tools sync from the upstream cheat sheet automatically. Derived from Jieyab89's OSINT Cheat Sheet.
Rebuilt from scratch using [Jieyab89/OSINT-Cheat-sheet](https://github.com/Jieyab89/OSINT-Cheat-sheet) as a data reference.

- **Source of truth:** one YAML file per category in `data/categories/` (Zod-validated).
- **Site:** [Astro](https://astro.build) static build + a D3 force graph, deployed to GitHub Pages.
- **Browse:** progressive-disclosure graph (groups → categories → tools), global fuzzy search,
  status/group filters, URL-correlation pivots, and a drill-down side panel.
- **Quality:** schema validation, weekly dead/hijacked-link checks with Wayback fallback,
  weekly upstream sync, unit tests, lint, and a post-deploy smoke test — all in CI.

---

## Why this was rebuilt

I leaned on the original cheat sheet constantly, but every time I wanted to fix a dead link or add a
tool I was wrestling a 6,000-line file. So I rebuilt it around the data instead of the document — the
same resources I trusted, in a shape I can actually **maintain, verify, and keep safe to use**.

| Problem in the original | What it caused | Fix here |
| --- | --- | --- |
| A single 6,300-line `README.md` was the source of truth | Painful diffs, merge conflicts, no way to attach metadata | One small YAML file per category, schema-enforced |
| `osint_data.json` was *scraped back out of* the README | The data model could never be richer than markdown links | YAML authored directly with tags, status, descriptions, notes |
| Scraper had a double-`requests.get` bug, fixed `sleep(6)`, no error handling | Slow, fragile, silently dropped data | Concurrent validator with timeout + retry + writeback; add-only upstream sync |
| No link-health checking, despite dev-notes begging for it | Dead and hijacked domains (defaced gambling redirects) stayed listed | `check-links.ts` flags `dead`/`risky` weekly; dead links get a Wayback fallback |
| Hand-rolled drift animation; click = `window.open` only | No real layout, no clustering, no metadata, unreadable blob at ~5k nodes | Real `d3-force`, progressive disclosure, search/filters, correlation, detail panel |
| Flat categories, no grouping or tags | Hard to navigate ~5k entries | 15 graph groups + inferred tags (`open-source`, `onion`, `official`, …) |
| No tests, no lint, no CI | Regressions shipped silently | Unit tests, eslint/prettier, validate + deploy + smoke workflows |

---

## What changed and why

Grouped by area. Each row is a deliberate change with its motivation.

### Data & content
| Change / implementation | Why |
| --- | --- |
| **YAML-per-category** (`data/categories/*.yml`) + Zod schema (`data/schema.ts`) | Small reviewable diffs; metadata (tags/status/description/archive) impossible in flat markdown |
| **15-group taxonomy** via `scripts/regroup.ts` (`transport`, `finance`, `media`, `ai`, `search`, …) | The original flat list dumped ~108 categories into one bucket; groups drive graph clustering and the legend |
| **Dedupe** (`scripts/dedupe.ts`) | Removed 106 within-category duplicate URLs (real bugs); cross-category shared URLs are kept intentionally — they power correlation |
| **Heuristic tags** (`scripts/enrich.ts`) | Cheap, deterministic tags (`open-source`, `onion`, `official`…) from URL/name signals — no API needed |
| **LLM descriptions/tags** (`scripts/llm-enrich.ts` Anthropic, `scripts/llm-enrich-gemini.ts` Gemini) | Real one-line descriptions; both idempotent + resumable. Gemini path is free-tier so contributors need no paid key |
| **Dead-link Wayback fallback** (`scripts/archive-dead.ts`) | 17% of links are dead — instead of deleting, link to `web.archive.org` so the resource stays useful |

### Browse experience
| Change / implementation | Why |
| --- | --- |
| **Progressive disclosure** (groups → categories → tools, batched, orbital layout) | Rendering all 182 categories + 5k tools at once was an unreadable, unclickable blob |
| **URL-correlation toggle** | Cross-category shared URLs become pivot links — the "intelligence" view the original hinted at |
| **Global fuzzy search** (Fuse.js) + **status/group filters** | Find a tool among thousands without expanding the graph by hand |
| **Drill-down side panel** with filter boxes, status dots, archive links | The original could only open a URL; the panel makes any node fully inspectable and navigable |
| **Deep links** (`?q`/`?group`/`?cat`/`?status`/`?corr`) + **mobile layout** + **ARIA** | Shareable views, usable on phones, accessible to screen readers |

### Tooling, CI & deploy
| Change / implementation | Why |
| --- | --- |
| **Unit tests** (`node:test`) + **eslint/prettier** | Lock pure logic (`slugify`/`inferGroup`/`parseMarkdown`) and style; gate every PR |
| **Smarter link-check** (`FRESH_DAYS` skip, per-host politeness) | Don't re-probe 5k links weekly or hammer one host; faster and well-behaved |
| **SEO regen** (`scripts/seo.ts`: robots/sitemap/llms.txt) + OG meta + favicon | Discoverability, regenerated from data so it never drifts |
| **Build guard** (`scripts/check-build.ts`) + **post-deploy smoke** (`scripts/smoke.ts`) | A green deploy used to ship a blank page; these fail loudly on missing assets / empty feed / bad live URLs |
| **`.nojekyll`** + correct `configure-pages` ordering | GitHub Pages' Jekyll stripped Astro's hashed asset dir; base path must be set before build |

---

## Data model

```yaml
category: Social Media Search
slug: social-media-search        # unique, kebab-case
group: socmint                   # one of the 15 graph clusters
description: ...
items:
  - name: Tool X
    url: https://example.com
    tags: [free, account-required]
    status: active               # active | dead | risky | unchecked
    last_checked: 2026-06-22
    archive_url: https://web.archive.org/web/2/https://example.com   # set for dead links
    note: optional
```

Schema and types: `data/schema.ts` (single source of truth, imported by every script).

---

## Commands

```bash
npm install
npm run dev                    # local site
npm run build                  # data:build + seo + astro build + build guard
npm test                       # unit tests
npm run lint                   # eslint + prettier check   (npm run format to fix)

# data pipeline
npm run data:validate          # schema-check all categories (CI gate)
npm run data:build             # compile YAML -> public/osint.json
npm run data:dedupe            # drop within-category duplicate URLs
npm run data:regroup           # re-apply the group taxonomy
npm run data:enrich            # heuristic tags + templated descriptions (idempotent)
npm run data:archive           # add Wayback fallback to dead links (idempotent)

# ingestion & health
npm run data:sync              # add-only pull of new tools from upstream (DRY=1 to preview)
npm run links:check            # probe URLs, write status back (LIMIT/FRESH_DAYS/CONCURRENCY)

# LLM enrichment (choose one; both idempotent + resumable)
GEMINI_API_KEY=...    npm run data:llm-enrich-gemini   # free tier, slow, daily cap
ANTHROPIC_API_KEY=... npm run data:llm-enrich          # paid Batch API, one-shot

# ops
npm run seo                    # regenerate robots.txt / sitemap.xml / llms.txt
SMOKE_URL=... npm run smoke    # check a deployed URL’s page + assets + feed
```

---

## Architecture

```
                         add-only sync ─┐
upstream cheat-sheet ───────────────────┤
                                        ▼
        data/categories/*.yml ── validate ──► build-data ──► public/osint.json
              ▲      ▲      ▲                                        │
   check-links│  archive│  enrich/regroup│ (status / archive_url / tags writeback)
              └──────┴──────┴──── (all write back into the YAML) ───┘
                                                                     ▼
                                              src/ (Astro page + D3 graph island)
                                                                     │
                                          build guard ──► GitHub Pages ──► smoke test
```

YAML is the source of truth. Every script reads/writes YAML; `public/osint.json` is a generated,
git-ignored feed the front-end fetches.

---

## Maintenance plan

The repo separates **content** from **quality control** so most upkeep is automatable.

### 1. Adding / editing resources (humans)
- Edit a `data/categories/*.yml`, or add a new file with a unique `slug` + `group`.
- Minimum is `name` + `url`; leave `status: unchecked` — the link checker fills it in.
- A tool fitting several categories should appear in each — shared URLs are intentional and
  become correlation links in the graph.
- Open a PR. `validate.yml` runs lint + typecheck + tests + schema validation + build.

### 2. Upstream sync (automated, weekly — `sync.yml`, Mon 05:00 UTC)
- Runs `data:sync` and opens `bot/upstream-sync` with new tools found upstream.
- **Add-only**: never edits/removes existing entries, so manual tags/descriptions/status survive.
  New tools land as `status: unchecked`. Review for relevance/safety, then merge.

### 3. Link health (automated, weekly — `links.yml`, Mon 06:00 UTC)
- Runs `links:check` then `data:archive`, opening `bot/link-health` with updated
  `status` / `last_checked` and Wayback fallbacks for newly-dead links.
- Triage the PR: prune/replace `dead`, remove `risky` (known-bad domain or gambling/defacement
  keywords) immediately. Seed new hijacked domains into `KNOWN_BAD` in `scripts/check-links.ts`.

### 4. Enrichment (manual, as needed)
- After bulk imports, run `data:enrich` (heuristic) and/or an LLM pass for real descriptions.
- Gemini path is free-tier and resumable — run it across days; it skips already-described items.

### 5. Releasing (automated — `deploy.yml`)
- Merge to `main` → build (with guard) → deploy to Pages → **smoke test** the live site.
- `public/osint.json` and SEO files are generated, never hand-edited (git-ignored).

### 6. Periodic housekeeping
- Re-run `data:dedupe` / `data:regroup` / `data:enrich` after big imports (all idempotent).
- Revisit the group taxonomy and tag rules in `scripts/derive.ts` / `scripts/enrich.ts` as data grows.

**Health signals:** the site header shows live `categories · tools · dead · risky` counts. Rising
`dead`/`risky` means it's time for a cleanup pass.

---

## Deploy

GitHub Pages via `.github/workflows/deploy.yml`. **Settings → Pages → Source must be "GitHub
Actions."** `PAGES_BASE` is set from the Pages config (`configure-pages` runs *before* the build so
the base path is baked into asset URLs). Two non-obvious requirements, both learned the hard way and
now guarded by the smoke test:

- **`public/.nojekyll`** — without it, Pages runs Jekyll and strips Astro's hashed `assets/` dir,
  serving a blank page despite a "successful" deploy.
- **No `static_site_generator` input** on `configure-pages@v5` — it throws an opaque
  `TypeError` on v5; `.nojekyll` already handles Jekyll.

---

## Credit

Resource list derived from Jieyab89's OSINT Cheat Sheet (community-maintained). Code is a clean-room
reimplementation; see [Why this was rebuilt](#why-this-was-rebuilt).
