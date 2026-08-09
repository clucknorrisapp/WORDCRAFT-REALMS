// Smoke test for Build Mode: starter blocks are placeable on the grid and
// persist; a LOCKED block is unlocked by reading its word (a reading moment),
// then becomes placeable. This is the read→build loop that starts the game's
// turn toward a Minecraft-style builder.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 40); } },
  });
  const save = {
    v: 1, childId: 'smoke_build', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {},
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

// Open Build Mode.
await page.locator('.hud-left button:has-text("🔨")').click();
await page.waitForSelector('.build-grid', { timeout: 8000 });
const starterTools = await page.locator('.build-tool:not(.locked)').count(); // eraser + 4 starters
const lockedTools = await page.locator('.build-tool.locked').count();
console.log(`palette: ${starterTools} unlocked tools (incl. eraser), ${lockedTools} locked`);
if (starterTools < 3) errors.push(`expected several starter tools, got ${starterTools}`);
if (lockedTools < 1) errors.push(`expected locked blocks to unlock, got ${lockedTools}`);
await page.screenshot({ path: `${OUT}/70-build.png` });

// Helpers that poll saved state, so the persistSave debounce can't race us.
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const waitBuildCount = (n) =>
  page.waitForFunction((want) => Object.keys(JSON.parse(localStorage.getItem('readquest_save_v1')).build).length === want, n, { timeout: 8000 });

// Place a starter block: a block is pre-selected, so just tap a few cells.
await page.locator('.build-cell').nth(0).click();
await page.locator('.build-cell').nth(11).click();
await page.locator('.build-cell').nth(22).click();
await waitBuildCount(3);
let build = (await readSave()).build;
console.log(`placed ${Object.keys(build).length} starter blocks: ${JSON.stringify(build)}`);

// Unlock a locked block by reading its word.
await page.locator('.build-tool.locked').first().click();
await page.waitForSelector('.word-big', { timeout: 8000 }); // readWordCard shown
await page.locator('button:has-text("✓")').click();
// readWordCard's autoSpeak runs before it resolves — wait for the card to close.
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).blocksUnlocked.length === 1, undefined, { timeout: 8000 });
const unlocked = (await readSave()).blocksUnlocked;
console.log(`unlocked blocks after reading: ${JSON.stringify(unlocked)}`);
if (unlocked.length !== 1) errors.push(`expected 1 unlocked block after reading, got ${JSON.stringify(unlocked)}`);

// The newly unlocked block is auto-selected — place it.
await page.waitForSelector('.build-grid', { timeout: 8000 });
await page.locator('.build-cell').nth(33).click();
await waitBuildCount(4);
build = (await readSave()).build;
const placedNew = Object.values(build).includes(unlocked[0]);
console.log(`after placing unlocked block: ${JSON.stringify(build)}`);
if (!placedNew) errors.push(`newly unlocked block "${unlocked[0]}" was not placed`);

// Reading to unlock logs a reading interaction.
const readRows = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).evidence.filter((e) => e.challengeType === 'sign_read').length);
if (readRows < 1) errors.push('reading to unlock a block logged no reading interaction');

// Drag-to-paint: one continuous stroke across a row lays several blocks.
const before = Object.keys(build).length;
const b50 = await page.locator('.build-cell').nth(50).boundingBox();
await page.mouse.move(b50.x + b50.width / 2, b50.y + b50.height / 2);
await page.mouse.down();
for (let i = 51; i <= 54; i++) {
  const bb = await page.locator('.build-cell').nth(i).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 3 });
}
await page.mouse.up();
await page
  .waitForFunction((n) => Object.keys(JSON.parse(localStorage.getItem('readquest_save_v1')).build).length >= n, before + 4, { timeout: 8000 })
  .catch(() => {});
const gained = Object.keys((await readSave()).build).length - before;
console.log(`drag stroke painted ${gained} new cells (want >= 4)`);
if (gained < 4) errors.push(`drag-to-paint laid too few cells: ${gained} (expected >= 4 across the stroke)`);

// Building levels up a Builder rank: cumulative placements are tracked and the
// header shows a rank/progress. We've placed ~8 blocks → past the first rank-up.
const placed = (await readSave()).buildPlaced;
const rankText = await page.locator('.builder-title').innerText();
console.log(`buildPlaced=${placed}, rank header="${rankText}"`);
if (placed < 8) errors.push(`buildPlaced should count every placement, got ${placed}`);
if (!/Builder|Maker/.test(rankText)) errors.push(`builder rank header not shown: "${rankText}"`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nBUILD MODE VERIFIED: place blocks on the grid; read a word to unlock a new block, then build with it');
