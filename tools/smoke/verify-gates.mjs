// Smoke test for Word-Gates → new biomes (Phase 3.1). A gate at the map's edge
// stays locked until its tier is mastered; then saying its word dissolves the
// wall and unrolls a new biome. A gate whose tier isn't mastered can't be opened.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } },
  });
  const save = {
    v: 1, childId: 'smoke_gate', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [],
    // Mastered through Magic E (so the Frost gate is lit) but NOT vowel teams / bossy R.
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    // No mic → the magic-word door uses the say-it-then-tap ritual.
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  // Seed only on first load — a reload must keep the opened biome.
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const save = () => page.evaluate(() => window.__readquest.services.save);
const gateCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.gatesOpenCount());

if ((await gateCount()) !== 0) errors.push('no gates should be open at the start');

// ── A locked gate (bossy-R not mastered) can't be opened ──────────────────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onGateTapped('crystal'));
await page.waitForTimeout(400);
let magicUp = await page.$('.word-big');
if (magicUp) errors.push('a gate whose tier is not mastered should not open the magic-word door');
const lockedTry = await save();
if (lockedTry.gatesOpened.includes('crystal')) errors.push('a locked gate must not open');
console.log(`locked gate stayed shut: gatesOpened=${JSON.stringify(lockedTry.gatesOpened)}`);

// ── The Frost gate (Magic E mastered) opens by saying its word ────────────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onGateTapped('frost'));
await page.waitForSelector('.word-big', { timeout: 8000 });
const word = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`frost gate magic word: "${word}"`);
if (word !== 'cake') errors.push(`the Frost gate should ask for "cake", got "${word}"`);
await page.screenshot({ path: `${OUT}/A4-gate-word.png` });
// Ritual: say it out loud, then tap the word to dissolve the wall.
await page.locator('.panel .word-big').click();
await page.waitForFunction(() => window.__readquest.game.scene.keys.world.gatesOpenCount() >= 1, null, { timeout: 8000 });
const after = await save();
console.log(`after opening: gatesOpened=${JSON.stringify(after.gatesOpened)}, open biomes=${await gateCount()}`);
if (!after.gatesOpened.includes('frost')) errors.push('saying the word should open the Frost gate');
await page.screenshot({ path: `${OUT}/A5-biome-open.png` });

// ── Reload → the opened biome persists ────────────────────────────────────────
await page.evaluate(() => { const s = window.__readquest.services.save; localStorage.setItem('readquest_save_v1', JSON.stringify(s)); });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const restored = await gateCount();
console.log(`after reload: ${restored} biome(s) open`);
if (restored < 1) errors.push('an opened biome should persist across reloads');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nWORD-GATES VERIFIED: a gate lights only once its tier is mastered; saying its word dissolves the wall and unrolls a new biome that persists — the map edge is the reading frontier');
