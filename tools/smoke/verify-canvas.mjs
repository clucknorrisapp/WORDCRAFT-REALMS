// Smoke test for Land That Grows (Phase 2.5). The build canvas is not a fixed
// 12×8 — its size is read from save.canvasLevel, which grows as the child reads
// (finished books, new sound tiers). Here we assert the grid reflects the level:
// level 0 → 12×8 = 96 cells; level 3 → 18×11 = 198 cells.
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
    v: 1, childId: 'smoke_canvas', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 5, stone: 5, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

async function openBuildCells() {
  await page.locator('.hud-left button:has-text("🔨")').click();
  await page.waitForSelector('.build-grid', { timeout: 8000 });
  const n = await page.evaluate(() => document.querySelectorAll('.build-cell').length);
  return n;
}
async function closeBuild() {
  await page.locator('.panel.build button:has-text("Done")').click();
  await page.waitForSelector('.build-grid', { state: 'detached', timeout: 8000 });
}

// Level 0 → 12 × 8.
const cells0 = await openBuildCells();
console.log(`canvasLevel 0: ${cells0} cells (want 96)`);
if (cells0 !== 96) errors.push(`level 0 grid should be 12×8=96, got ${cells0}`);
await page.screenshot({ path: `${OUT}/96-canvas-lvl0.png` });
await closeBuild();

// Grow the canvas (as reading milestones would) and reopen.
await page.evaluate(() => { window.__readquest.services.save.canvasLevel = 3; });
const cells3 = await openBuildCells();
console.log(`canvasLevel 3: ${cells3} cells (want 198)`);
if (cells3 !== 198) errors.push(`level 3 grid should be 18×11=198, got ${cells3}`);
await page.screenshot({ path: `${OUT}/97-canvas-lvl3.png` });
await closeBuild();

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nLAND-THAT-GROWS VERIFIED: the build canvas size is driven by save.canvasLevel (12×8 → 18×11), so reading milestones literally widen the room to build');
