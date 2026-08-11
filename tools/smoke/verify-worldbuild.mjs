// Smoke test for Build Where You Stand (Phase 2.2). The 🧱 button flips the world
// into place-mode; tapping the grass lays real pixel blocks into a persisted
// save.worldBuild map; Done exits and the blocks remain. Placing is free (never
// gated) — the palette is what grows by reading.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 15); } },
  });
  const save = {
    v: 1, childId: 'smoke_wb', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 5, stone: 5, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  // Seed only on the first load — a reload must keep the persisted world-build.
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const wbCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.worldBuildCount());

// ── Enter place mode ──────────────────────────────────────────────────────────
await page.locator('.hud-left button:has-text("🧱")').click();
await page.waitForSelector('.worldbuild-bar', { timeout: 6000 });
const toolCount = await page.evaluate(() => document.querySelectorAll('.worldbuild-bar .wb-tool').length);
console.log(`place mode: ${toolCount} palette tools (eraser + unlocked starters)`);
if (toolCount < 2) errors.push(`palette should show the eraser + at least one starter block, got ${toolCount}`);
await page.screenshot({ path: `${OUT}/92-place-mode.png` });

// ── Lay blocks: click the grass at a few distinct tiles (above the bar) ────────
const spots = [[420, 300], [480, 300], [540, 300], [420, 360]];
for (const [x, y] of spots) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
const placed = await wbCount();
const afterPlace = await readSave();
const savedKeys = Object.keys(afterPlace.worldBuild).length;
console.log(`laid blocks: rendered=${placed}, saved=${savedKeys}, buildPlaced=${afterPlace.buildPlaced}`);
if (placed < 1) errors.push('tapping the grass in place mode should lay at least one block');
if (savedKeys !== placed) errors.push(`rendered (${placed}) and saved (${savedKeys}) block counts should match`);
if (afterPlace.buildPlaced < placed) errors.push(`world placements should count toward buildPlaced, got ${afterPlace.buildPlaced}`);
await page.screenshot({ path: `${OUT}/93-blocks-laid.png` });

// ── Done → bar closes, blocks persist ─────────────────────────────────────────
await page.locator('.worldbuild-done').click();
await page.waitForSelector('.worldbuild-bar', { state: 'detached', timeout: 6000 });
const done = await readSave();
console.log(`after Done: worldBuild has ${Object.keys(done.worldBuild).length} blocks (persisted)`);
if (Object.keys(done.worldBuild).length !== savedKeys) errors.push('blocks should persist after Done');

// ── Reload → the world-build is restored from save ────────────────────────────
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);
const restored = await wbCount();
console.log(`after reload: ${restored} world-build blocks restored`);
if (restored !== savedKeys) errors.push(`world-build should restore on reload, got ${restored} of ${savedKeys}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nBUILD-WHERE-YOU-STAND VERIFIED: 🧱 → tap the grass to lay real blocks → Done persists them → they restore on reload');
