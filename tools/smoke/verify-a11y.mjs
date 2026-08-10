// Smoke test for the accessibility settings: the three modes (easy-read
// font, high contrast, calm motion) apply as <html> classes on boot from the
// saved settings, and toggling one in the grown-up screen updates the class
// and persists. Also checks calm mode actually suppresses confetti.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const errors = [];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 40); } },
  });
  const save = {
    v: 1, childId: 'smoke_a11y', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: {
      micEnabled: true, micStrictness: 'gentle', narrationRate: 1, textScale: 1,
      dyslexiaFont: true, highContrast: true, reducedMotion: true,
    },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(800);

// 1. All three classes applied from the saved settings.
const cls = await page.evaluate(() => [...document.documentElement.classList]);
for (const c of ['a11y-dyslexia', 'a11y-contrast', 'a11y-reduce-motion']) {
  if (!cls.includes(c)) errors.push(`boot did not apply ${c} (html classes: ${cls.join(' ')})`);
}
console.log('boot classes:', cls.filter((c) => c.startsWith('a11y')).join(', '));

// 2. Calm mode suppresses confetti: finishing a book calls confetti(40);
//    read one and assert not a single bit spawns.
await page.locator('.hud-left button:has-text("📚")').click();
await page.waitForSelector('.shelf', { timeout: 8000 });
await page.locator('.book-spine').first().click();
await page.waitForSelector('.book-cover', { timeout: 8000 });
await page.locator('.panel.book button:has-text("Read it")').click();
let maxBits = 0;
for (let guard = 0; guard < 20; guard++) {
  await page.waitForSelector('.book-page', { timeout: 8000 });
  const end = page.locator('.panel.book button:has-text("The End")');
  if (await end.count()) {
    await end.click();
    break;
  }
  await page.locator('.panel.book button:has-text("Next")').click();
  await page.waitForTimeout(120);
}
// Sample the confetti layer repeatedly across the celebration window.
for (let i = 0; i < 8; i++) {
  maxBits = Math.max(maxBits, await page.evaluate(() => document.querySelectorAll('.confetti-bit').length));
  await page.waitForTimeout(120);
}
if (maxBits > 0) errors.push(`calm mode still spawned confetti (${maxBits} bits)`);
console.log('confetti bits during book-finish celebration:', maxBits);
// Close the shelf if it's still up.
const close = page.locator('.panel.library button:has-text("Close")');
if (await close.count()) await close.click();
await page.waitForTimeout(200);

// 3. Grown-up toggle: press-and-hold 👪 opens the screen; turn Calm motion off.
await page.locator('.hud-right .round').dispatchEvent('pointerdown');
await page.waitForTimeout(1300); // hold timer is 1100ms
await page.waitForSelector('.panel.parent', { timeout: 6000 });
const hasA11ySection = await page.locator('.panel.parent h2:has-text("Accessibility")').count();
if (!hasA11ySection) errors.push('parent screen missing Accessibility section');
await page.locator('.panel.parent button:has-text("Calm motion")').click();
// persistSave debounces (~250ms) — poll for the persisted value instead of
// racing a fixed wait (same debounce-aware pattern as verify-build).
await page
  .waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).settings.reducedMotion === false, undefined, { timeout: 6000 })
  .catch(() => {});
const after = await page.evaluate(() => ({
  cls: [...document.documentElement.classList].filter((c) => c.startsWith('a11y')),
  saved: JSON.parse(localStorage.getItem('readquest_save_v1')).settings.reducedMotion,
}));
console.log('after toggling Calm motion off:', JSON.stringify(after));
if (after.cls.includes('a11y-reduce-motion')) errors.push('a11y-reduce-motion class not removed after toggle');
if (after.saved !== false) errors.push(`reducedMotion not persisted false (got ${after.saved})`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nACCESSIBILITY VERIFIED: modes apply on boot, calm mode suppresses confetti, grown-up toggle persists');
