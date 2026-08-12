// Regression: progress must not be lost when the page is hidden. persist() is
// debounced 250ms, so on an iPad home-button press (visibilitychange→hidden) the
// pending write could be dropped when the page freezes. main.ts now flushes the
// save SYNCHRONOUSLY on hide; this proves the last change lands in localStorage
// immediately, with no debounce wait.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  const save = {
    v: 1, childId: 'smoke_flush', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: [], lastGiftDay: null, job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

// Change the save and schedule a DEBOUNCED write — localStorage stays stale.
await page.evaluate(() => {
  const s = window.__readquest.services;
  s.save.gems = 4242;
  s.persist();
});
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).gems);
console.log(`immediately after debounced persist(): localStorage gems=${before} (should still be the old 1)`);
if (before === 4242) console.log('  (note: a prior flush already landed it — still fine)');

// Simulate the iPad home button: the page goes hidden → main.ts must flush now.
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  // The real visibilitychange event bubbles from document to the window listener,
  // so the synthetic one must bubble too.
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
});
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).gems);
console.log(`right after visibilitychange→hidden: localStorage gems=${after}`);
if (after !== 4242) errors.push(`hide must flush the save synchronously — expected gems 4242 in storage, got ${after}`);

// pagehide is the belt-and-braces path (bfcache/teardown).
await page.evaluate(() => {
  const s = window.__readquest.services;
  s.save.gems = 777;
  s.persist();
  window.dispatchEvent(new Event('pagehide'));
});
const afterPageHide = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).gems);
console.log(`after pagehide: localStorage gems=${afterPageHide}`);
if (afterPageHide !== 777) errors.push(`pagehide must also flush synchronously, got ${afterPageHide}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nFLUSH-ON-HIDE VERIFIED: hiding the page (or tearing it down) writes the save synchronously — a child never loses progress to the debounce when they leave the app');
