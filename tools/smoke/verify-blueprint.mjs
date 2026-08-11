// Smoke test for Blueprint Quests (Phase 2.3). At the plans table in free play,
// reading a plan's name accepts it and drops a ghost outline; tapping each ghost
// cell snaps a real block into the world; filling the last cell completes the
// plan — it pays out, hatches a creature to live in it, and clears.
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
    v: 1, childId: 'smoke_bp', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 3, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
// Read the LIVE in-memory save (localStorage lags behind by the 250ms persist
// debounce, which races this fast, scripted flow).
const readSave = () => page.evaluate(() => window.__readquest.services.save);
const dir = (fn, arg) => page.evaluate(fn, arg);

// ── Accept a plan by reading its name ─────────────────────────────────────────
await dir(() => window.__readquest.game.scene.keys.world.director.onBlueprintTableTapped());
await page.waitForSelector('.word-big', { timeout: 8000 });
const planName = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`plan offered: "${planName}"`);
if (planName !== 'den') errors.push(`first plan should be "den", got "${planName}"`);
await page.screenshot({ path: `${OUT}/98-blueprint-accept.png` });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });

const accepted = await readSave();
console.log(`accepted: blueprint=${JSON.stringify(accepted.blueprint)}`);
if (!accepted.blueprint || accepted.blueprint.id !== 'den') errors.push('accepting should set save.blueprint to the den plan');
const cellCount = accepted.blueprint ? accepted.blueprint.filled.length : 0;
if (cellCount !== 4) errors.push(`the den plan should have 4 cells, got ${cellCount}`);

// ── Fill every ghost cell (den is built from 'log', a starter — no unlock read) ─
for (let i = 0; i < cellCount; i++) {
  await dir((idx) => window.__readquest.game.scene.keys.world.director.onBlueprintCellTapped(idx), i);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(500);

// ── Completion: reward + a creature + the plan clears ─────────────────────────
const done = await readSave();
const babies = await page.evaluate(() => window.__readquest.game.scene.keys.world.petCount());
const worldBlocks = Object.keys(done.worldBuild).length;
console.log(`built: blueprint=${done.blueprint}, done=${JSON.stringify(done.blueprintsDone)}, gems ${accepted.gems}→${done.gems}, pets=${JSON.stringify(done.pets)}, worldBlocks=${worldBlocks}, babies=${babies}`);
if (done.blueprint !== null) errors.push('completing a plan should clear save.blueprint');
if (!done.blueprintsDone.includes('den')) errors.push('completing the den should record it in blueprintsDone');
if (done.gems <= accepted.gems) errors.push(`completing a plan should pay gems, got ${accepted.gems}→${done.gems}`);
if (done.pets.length < 1) errors.push('completing a plan should hatch a creature to live in it');
if (worldBlocks < 4) errors.push(`the den's 4 blocks should be real in the world, got ${worldBlocks}`);
if (babies < 1) errors.push('the plan should spawn a baby in the world');
await page.screenshot({ path: `${OUT}/99-blueprint-done.png` });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nBLUEPRINT QUESTS VERIFIED: read a plan name to accept → fill the ghost cells with real blocks → the plan completes, pays out, and hatches a creature to live in it');
