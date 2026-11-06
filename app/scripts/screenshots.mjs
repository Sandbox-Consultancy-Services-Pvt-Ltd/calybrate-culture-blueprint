/**
 * Regenerates the README screenshots in docs/images.
 *
 *   1. In one terminal:  npm run dev          (any port; pass it below)
 *   2. In another:       npm run screenshots  (or: node scripts/screenshots.mjs http://localhost:5173)
 *
 * Uses your installed Chrome (no browser download). The test login is switched on in the page, so no password is typed.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'images');
mkdirSync(out, { recursive: true });

/** name, URL hash, Practice Layout category (or null), extra wait in ms, signed in? */
const shots = [
  ['login', '', null, 300, false],
  ['practice-calybrate', '#lifecycle', 'calybrate', 1200, true],
  ['practice-healthcare', '#lifecycle', 'healthcare', 500, true],
  ['practice-engineering', '#lifecycle', 'engineering', 500, true],
  ['practice-banking', '#lifecycle', 'banking', 500, true],
  ['framework', '#cct', 'calybrate', 1200, true],
  ['safeguard-map', '#map', 'calybrate', 1500, true],
  ['outcomes', '#outcomes', 'calybrate', 800, true],
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, hash, category, wait, signedIn] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.addInitScript(
    ([cat, auth]) => {
      try {
        sessionStorage.setItem('cb-test-login', auth ? '1' : '0');
        if (cat) {
          localStorage.setItem('cb-lc-category', cat);
          localStorage.setItem('cb-theme', cat);
        }
      } catch {
        /* ignore */
      }
    },
    [category, signedIn],
  );
  await page.goto(`${base}/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('saved', `docs/images/${name}.png`);
  await ctx.close();
}
await browser.close();
