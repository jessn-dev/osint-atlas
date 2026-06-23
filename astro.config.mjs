// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages: set `site` to your Pages URL and `base` to the repo name
// when deploying to https://<user>.github.io/<repo>/. For a user/root site
// or custom domain, leave `base` as '/'.
export default defineConfig({
  site: 'https://jessn-dev.github.io',
  base: process.env.PAGES_BASE ?? '/',
  trailingSlash: 'ignore',
  build: { assets: 'assets' },
});
