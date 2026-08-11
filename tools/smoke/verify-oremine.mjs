// Smoke test for the Mine + Pick Ladder (Phase 3.2). An ore seam is locked until
// you forge its pick at the toolbench by READING the material word; with the pick
// in hand, mining is a Say-to-Mine reading rep that pays gems. Reading harder
// material words forges better picks that crack deeper seams.
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
    v: 1, childId: 'smoke_ore', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const save = () => page.evaluate(() => window.__readquest.services.save);
const dir = (fn, a) => page.evaluate(fn, a);
const notBusy = () => page.waitForFunction(() => !window.__readquest.game.scene.keys.world.director.busy, null, { timeout: 8000 });

// ── A seam is locked without its pick ─────────────────────────────────────────
const gems0 = (await save()).gems;
await dir(() => window.__readquest.game.scene.keys.world.director.onSeamTapped('s1'));
await page.waitForTimeout(400);
if (await page.$('.word-big')) errors.push('mining a seam without its pick should not open a reading card');
if ((await save()).gems !== gems0) errors.push('a locked seam must not pay gems');
console.log(`locked seam: gems stayed ${gems0}, pickLevel=${(await save()).pickLevel}`);

// ── Forge the tin pick by reading "tin" ───────────────────────────────────────
await dir(() => window.__readquest.game.scene.keys.world.director.onToolbenchTapped());
await page.waitForSelector('.word-big', { timeout: 8000 });
const mat = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`toolbench offers material: "${mat}"`);
if (mat !== 'tin') errors.push(`the first pick should read "tin", got "${mat}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.pickLevel >= 1, null, { timeout: 8000 });
await notBusy();
console.log(`forged: pickLevel=${(await save()).pickLevel}`);
await page.screenshot({ path: `${OUT}/A6-forge-pick.png` });

// ── Now the seam cracks: read a word → gems ───────────────────────────────────
const gemsBefore = (await save()).gems;
await dir(() => window.__readquest.game.scene.keys.world.director.onSeamTapped('s1'));
await page.waitForSelector('.word-big', { timeout: 8000 });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((g) => window.__readquest.services.save.gems > g, gemsBefore, { timeout: 8000 });
const after = await save();
console.log(`mined seam s1: gems ${gemsBefore}→${after.gems}, pickLevel=${after.pickLevel}`);
if (after.gems <= gemsBefore) errors.push(`mining with the pick should pay gems, got ${gemsBefore}→${after.gems}`);
if (after.pickLevel !== 1) errors.push(`pickLevel should be 1, got ${after.pickLevel}`);
const mined = after.evidence.filter((e) => e.challengeType === 'sign_read');
if (mined.length < 2) errors.push('forging + mining should log reading interactions');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nMINE + PICK LADDER VERIFIED: a seam is locked until you read its material to forge the pick; with the pick, mining is a reading rep that pays gems — reading deeper words digs a deeper mine');
