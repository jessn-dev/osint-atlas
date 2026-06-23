# Contributing

Thanks for helping keep OSINT Atlas accurate and safe.

## Add or edit a resource

1. Edit the matching file in `data/categories/*.yml` (or add a new file with a
   unique `slug` and a `group`).
2. Minimum fields are `name` + `url`. Leave `status: unchecked` — the link
   checker fills it in.
3. A tool that fits several categories should appear in each; shared URLs are
   intentional.
4. Run `npm run data:validate` (and `npm run data:enrich` to auto-tag).
5. Open a PR. CI runs schema validation, lint, tests, and a build.

```yaml
items:
  - name: Example Tool
    url: https://example.com
    tags: [free]
    status: unchecked
```

## Safety

- Don't add resources you believe are malicious. Suspected hijacked/malware
  domains belong in `KNOWN_BAD` in `scripts/check-links.ts`, not the lists.
- The weekly link-health job flags `dead` and `risky` entries; help triage those PRs.

## Dev commands

```bash
npm install
npm run dev            # local site
npm test               # unit tests
npm run lint           # eslint + prettier check
npm run format         # auto-format
npm run build          # data + seo + astro build + build guard
```

## Data pipeline

`data/categories/*.yml` → `data:build` → `public/osint.json` → site.
`check-links` / `archive-dead` / `regroup` / `enrich` / `sync-upstream` maintain the YAML.
