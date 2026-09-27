import { defineConfig } from 'astro/config';

// Static promotional site. Cloudflare Pages serves `dist/` as-is.
// Project domain: https://tenling.brighteng.org
export default defineConfig({
  site: 'https://tenling.brighteng.org',
  compressHTML: true,
});
