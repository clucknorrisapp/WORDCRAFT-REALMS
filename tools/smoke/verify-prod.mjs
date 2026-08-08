// Load the DEPLOYED game (production URL) and prove it boots to character
// select and into the world. Usage: BASE_URL=https://... node tools/smoke/verify-prod.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = process.env.SHOT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  // Sandboxed environments route outbound HTTPS through a proxy; the proxy CA
  // is already in the browser trust store.
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this._l = {};
    }
    addEventListener(t, cb) {
      (this._l[t] ||= []).push(cb);
    }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {},
      getVoices() {
        return [];
      },
      speak(u) {
        const parts = (u.text || '').split(/\s+/).filter(Boolean);
        setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 40 * parts.length + 60);
      },
    },
  });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Pick your hero!', { timeout: 20000 });
await page.screenshot({ path: `${OUT}/prod-1-select.png` });
console.log('✓ character select renders on', BASE);

await page.locator('.avatar-grid img').nth(3).click();
await page.locator('button:has-text("Go!")').click();
await page.locator('.dialogue button:has-text("▶")').click();
await page.locator('.dialogue button:has-text("▶")').click();
await page.waitForSelector('text=Name your dragon!', { timeout: 15000 });
await page.locator('.word-card:has-text("DASH")').click();
await page.locator('button:has-text("Keep this name!")').click();
await page.locator('.dialogue button:has-text("▶")').click();
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/prod-2-village.png` });
console.log('✓ world boots on production');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PRODUCTION VERIFIED');
