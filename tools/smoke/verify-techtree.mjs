// Smoke test for Smelting chains + the Tech-Tree board + the Furnace machine
// (Phase 4.1). The board groups craftable nodes into reading "ages"; a node is
// owned / readable-now / a locked ghost strictly by validateText + whether its
// ingredients are made. Crafting reads the recipe phrase (a chain: "pan" needs
// the crafted "magma"). The Furnace smelts bars over time that the child
// collects by reading a power word ("run").
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
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_tech', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 2,
      signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
      // tin + magma already made → the chained "pan" (tin pan) is craftable now.
      booksRead: [], blocksUnlocked: ['tin', 'magma'], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 3,
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team', 'r_controlled'],
      evidence: [], events: [], firstSessionAt: Date.now(),
      settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
    };
    localStorage.setItem('readquest_save_v1', JSON.stringify(save));
  }
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const save = () => page.evaluate(() => window.__readquest.services.save);
const notBusy = () => page.waitForFunction(() => !window.__readquest.game.scene.keys.world.director.busy, null, { timeout: 8000 });

// ── The board renders ages, with starters owned and the chain node visible ────
await page.locator('.tech-btn').click();
await page.waitForSelector('.tech-scroll', { timeout: 8000 });
const ages = await page.locator('.tech-age').count();
const owned = await page.locator('.tech-node.owned').count();
console.log(`tech board: ${ages} ages, ${owned} owned nodes`);
if (ages < 3) errors.push(`the tech tree should group nodes into ages, got ${ages}`);
if (owned < 4) errors.push(`starter + made blocks should show as owned, got ${owned}`);
// "pan" is a chained smelt node (needs the crafted "magma") and is ready now.
const panClass = await page.getAttribute('.tech-node[data-block="pan"]', 'class');
console.log(`chain node "pan": ${panClass}`);
if (!/ready/.test(panClass || '')) errors.push(`the chained "pan" node should be craftable once magma is made, was "${panClass}"`);
await page.screenshot({ path: `${OUT}/B2-techtree.png` });

// ── Smelt the chain: read "tin pan" to craft it (a 2-step tree) ───────────────
await page.locator('.tech-node[data-block="pan"]').click();
await page.waitForSelector('.craft-read', { timeout: 8000 });
const phrase = (await page.locator('.craft-read').innerText()).replace(/\s+/g, ' ').trim().toLowerCase();
console.log(`recipe phrase to read: "${phrase}"`);
if (phrase !== 'tin pan') errors.push(`the pan recipe should read "tin pan", got "${phrase}"`);
await page.locator('.craft-word').first().click(); // hear a word (optional)
await page.locator('.panel button:has-text("Craft it!")').click();
await page.waitForSelector('.craft-read', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.blocksUnlocked.includes('pan'), null, { timeout: 8000 });
const madePanClass = await page.getAttribute('.tech-node[data-block="pan"]', 'class');
console.log(`after smelting: pan is now "${madePanClass}", blocksUnlocked=${JSON.stringify((await save()).blocksUnlocked)}`);
if (!/owned/.test(madePanClass || '')) errors.push('a crafted node should flip to owned in the board');
// Close the board.
await page.locator('.tech-close').click();
await page.waitForSelector('.tech-scroll', { state: 'detached', timeout: 8000 });

// ── The Furnace machine: it smelted 3 bars; read "run" to collect them ────────
await notBusy();
const before = await save();
console.log(`furnace charge before: ${before.furnaceCharge}, gems: ${before.gems}`);
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onFurnaceTapped());
await page.waitForSelector('.word-big', { timeout: 8000 });
const powerWord = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
if (powerWord !== 'run') errors.push(`the furnace power switch should read "run", got "${powerWord}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((g) => window.__readquest.services.save.gems > g, before.gems, { timeout: 8000 });
await notBusy();
const after = await save();
console.log(`after reading "run": gems ${before.gems}→${after.gems}, furnaceCharge=${after.furnaceCharge}`);
if (after.gems !== before.gems + before.furnaceCharge) errors.push(`collecting should pay one gem per smelted bar (expected +${before.furnaceCharge})`);
if (after.furnaceCharge !== 0) errors.push(`the furnace should empty after collecting, got ${after.furnaceCharge}`);
await page.screenshot({ path: `${OUT}/B2-furnace.png` });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nTECH TREE + SMELTING + FURNACE VERIFIED: the board is a reading elevator grouped into ages; reading a recipe smelts a chained node (pan needs the crafted magma); and the Furnace machine smelts bars over time that reading a power word ("run") collects as gems');
