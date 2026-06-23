# OSINT Atlas

Graph-first, link-health-aware map of OSINT resources. Rebuilt from scratch using
[Jieyab89/OSINT-Cheat-sheet](https://github.com/Jieyab89/OSINT-Cheat-sheet) as a data reference.

- **Source of truth:** one YAML file per category in `data/categories/` (Zod-validated).
- **Site:** [Astro](https://astro.build) static build, D3 force graph, deployed to GitHub Pages.
- **Quality:** automated schema validation + weekly dead/hijacked-link checks in CI.

## Why this was rebuilt

The original cheat sheet is a great resource list but hit structural limits:

| Problem in the original | What it caused | Fix here |
| --- | --- | --- |
| A single 6,300-line `README.md` was the source of truth | Painful diffs, merge conflicts, no way to attach metadata | One small YAML file per category, schema-enforced |
| `osint_data.json` was *scraped back out of* the README | The data model could never be richer than markdown links | YAML is authored directly with tags, status, notes |
| Scraper had a double-`requests.get` bug, fixed `sleep(6)`, no error handling | Slow, fragile, silently dropped data | Concurrent validator with timeout + retry + writeback |
| No link-health checking, despite dev-notes asking for it | Dead and hijacked domains (e.g. defaced gambling redirects) stayed listed | `check-links.ts` flags `dead`/`risky`, runs weekly in CI |
| Graph used a hand-rolled drift loop, click = `window.open` only | No real layout, no clustering, no metadata view | Real `d3-force`, group clustering, search, filters, detail panel |
| Flat categories, no grouping or tags | Hard to navigate ~5k entries | `group` clusters + inferred tags (`open-source`, `onion`, `official`, …) |

Goal: same community knowledge, but **maintainable, verifiable, and safer to use**.

## Data model

```yaml
category: Social Media Search
slug: social-media-search
group: socmint              # graph cluster
description: ...
items:
  - name: Tool X
    url: https://example.com
    tags: [free, account-required]
    status: active           # active | dead | risky | unchecked
    last_checked: 2026-06-22
    note: optional
```

Schema: `data/schema.ts`.

## Commands

```bash
npm install
npm run data:migrate    # one-time: import old JSON -> YAML (set SRC=...)
npm run data:dedupe     # drop within-category duplicate URLs
npm run data:enrich     # infer tags + category descriptions (idempotent)
npm run data:sync       # add-only pull of new tools from upstream (DRY=1 to preview)
npm run data:validate   # schema-check all categories
npm run links:check     # probe URLs, write status back (LIMIT=50 to sample)
npm run data:build      # compile YAML -> public/osint.json
npm run dev             # local site
npm run build           # data:build + astro build
```

## Architecture

```
data/categories/*.yml  ──validate──►  scripts/build-data.ts  ──►  public/osint.json
        ▲                                                              │
        └──── scripts/check-links.ts (status writeback)               ▼
                                                          src/ (Astro + D3 graph)
```

## Maintenance plan

The repo is designed so that **content and quality control are separate, automatable jobs.**

### 1. Adding / editing resources (humans)
- Edit the relevant `data/categories/*.yml`, or add a new file (must have unique `slug`).
- New entries can be left as `status: unchecked`; the link checker fills it in.
- A tool that fits multiple categories should appear in each — shared URLs are
  intentional and become correlation links in the graph.
- Open a PR. `validate.yml` blocks merge on schema errors or a broken build.

### 2. Upstream sync (automated, weekly)
- `sync.yml` runs `data:sync` every Monday (05:00 UTC) and opens a PR
  (`bot/upstream-sync`) with any new tools found in the upstream cheat-sheet.
- **Add-only**: it never edits or removes existing entries, so manual tags,
  descriptions, and link status are preserved. New tools land as `status: unchecked`.
- Matching is by category `slug`; unknown H1 sections become new category files
  with an inferred `group`.
- Review the PR for relevance/safety, then merge. Override sources with the
  `SOURCES` env var; preview locally with `DRY=1 npm run data:sync`.

### 3. Link health (automated, weekly)
- `links.yml` runs `links:check` every Monday and opens a PR (`bot/link-health`)
  with updated `status` / `last_checked`.
- Review the PR: `dead` entries to prune or replace, `risky` entries (known-bad
  domain or gambling/defacement keywords) to remove immediately.
- Known-bad domains are seeded in `scripts/check-links.ts` (`KNOWN_BAD`); add to it
  as the community reports hijacked resources.

### 4. Releasing
- Merge to `main` → `deploy.yml` rebuilds the feed and ships to GitHub Pages.
- `public/osint.json` is generated, never hand-edited (git-ignored).

### 5. Periodic housekeeping
- Re-run `data:dedupe` and `data:enrich` after bulk imports (both idempotent).
- Revisit the `group` taxonomy and tag heuristics in `scripts/enrich.ts` as the
  dataset grows.

### Health signals at a glance
The site header shows live counts: total categories, tools, `dead`, and `risky`.
Rising `dead`/`risky` numbers mean the list needs a cleanup pass.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml`. For a project page
(`user.github.io/osint-atlas/`), `PAGES_BASE` is set automatically from the Pages config.

## Credit

Resource list derived from Jieyab89's OSINT Cheat Sheet (community-maintained).
