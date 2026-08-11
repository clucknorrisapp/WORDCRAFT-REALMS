// Smoke test for glint caches (Phase 1.4 — "a reason to walk east"). In free
// play the empty east is strewn with sparkles; tapping one is a one-time reading
// rep that pays a gem. This asserts: reading a glint grants +1 gem and remembers
// the cache, and tapping the SAME cache again pays nothing (idempotent — a
// reload mid-celebration must never double-grant).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.SHOT_DIR || 'playtest-data/shots';
fs.mkdirSync(OUT, { recursive: true });
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 30); } },
  });
  const save = {
    v: 1, childId: 'smoke_glint', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, buildPlaced: 0, glintsFound: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));

const gemsBefore = (await readSave()).gems;

// Tap a glint cache in free play → the reading card should appear with the ✨ icon.
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onGlintTapped('g1', () => {}));
await page.waitForSelector('.word-big', { timeout: 8000 });
const icon = await page.evaluate(() => {
  const sub = document.querySelector('.panel .subtitle');
  return sub ? sub.textContent : '';
});
console.log(`glint card shown, icon="${icon}"`);
if (!/✨/.test(icon)) errors.push(`glint card should show the sparkle icon, got "${icon}"`);
await page.screenshot({ path: `${OUT}/86-glint-cache.png` });

// Read it (tap ✓) — this is what claims the cache.
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((g) => JSON.parse(localStorage.getItem('readquest_save_v1')).gems === g + 1, gemsBefore, { timeout: 8000 });

const afterFirst = await readSave();
console.log(`gems ${gemsBefore} → ${afterFirst.gems}; glintsFound=${JSON.stringify(afterFirst.glintsFound)}`);
if (afterFirst.gems !== gemsBefore + 1) errors.push(`reading a glint should grant +1 gem, got ${gemsBefore}→${afterFirst.gems}`);
if (!afterFirst.glintsFound.includes('g1')) errors.push('glint id g1 should be remembered in glintsFound');

// Tap the SAME cache again — it is already claimed, so it must pay nothing and
// must NOT reopen a reading card (idempotent one-time reward).
let reopened = false;
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onGlintTapped('g1', () => {}));
try {
  await page.waitForSelector('.word-big', { timeout: 1500 });
  reopened = true;
} catch { /* expected: no card */ }
const afterSecond = await readSave();
console.log(`re-tap g1: gems=${afterSecond.gems}, card reopened=${reopened}`);
if (reopened) errors.push('re-tapping a claimed glint should not reopen a reading card');
if (afterSecond.gems !== afterFirst.gems) errors.push(`re-tapping a claimed glint must not grant a second gem, got ${afterFirst.gems}→${afterSecond.gems}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nGLINT VERIFIED: tapping an eastern sparkle in free play → read an adaptive word → +1 gem, remembered once; re-tapping pays nothing');
