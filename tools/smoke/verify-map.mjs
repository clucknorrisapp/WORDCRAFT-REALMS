// Smoke test for the Fog-of-war map + fast travel (Phase 4.4). The kingdom is
// carved into named regions. Walking into one clears its fog; reading its name
// on the map claims it (gold + a flag) and turns it into a fast-travel pin. Both
// the fog-clearing and the claims persist across sessions.
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
  // Guard the seed so a reload keeps the explored + claimed map.
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_map', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
      signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [],
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
const world = (fn, a) => page.evaluate(fn, a);

// ── Reveal by walking: standing in a region clears its fog ────────────────────
// The player spawns in the home village ("den"). One frame later it's revealed.
await page.waitForFunction(() => window.__readquest.services.save.mapSeen.includes('den'), null, { timeout: 8000 });
console.log(`spawn cleared the fog on: ${JSON.stringify((await save()).mapSeen)}`);

// Walk east into the mine region ("cave") — moving there reveals it too.
await world(() => {
  const w = window.__readquest.game.scene.keys.world;
  w.moveTarget = null;
  w.player.setPosition(2160, 430);
});
await page.waitForFunction(() => window.__readquest.services.save.mapSeen.includes('cave'), null, { timeout: 8000 });
console.log(`walking east revealed: ${JSON.stringify((await save()).mapSeen)}`);

// ── Open the map: seen regions show, unwalked land is still fog ────────────────
await page.locator('.map-btn').click();
await page.waitForSelector('.map-board', { timeout: 8000 });
const denClass = await page.getAttribute('.map-region[data-region="den"]', 'class');
const fogCount = await page.locator('.map-region.fog').count();
console.log(`den cell: "${denClass}", fog regions still hidden: ${fogCount}`);
if (!/seen|claimed|can-claim/.test(denClass || '')) errors.push(`den should be revealed on the map, class was "${denClass}"`);
if (fogCount < 1) errors.push('regions never walked into should still be dark fog');
if (!(await page.$('.map-you'))) errors.push('the map should show a "you are here" marker');
await page.screenshot({ path: `${OUT}/A8-map-fog.png` });

// ── Claim "den" by reading its name → it turns gold + becomes a pin ───────────
await page.locator('.map-region[data-region="den"]').click();
await page.waitForSelector('.word-big', { timeout: 8000 });
const claimWord = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
if (claimWord !== 'den') errors.push(`claiming the home region should read "den", got "${claimWord}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.mapClaimed.includes('den'), null, { timeout: 8000 });
const denClaimed = await page.getAttribute('.map-region[data-region="den"]', 'class');
console.log(`after reading: den is now "${denClaimed}", mapClaimed=${JSON.stringify((await save()).mapClaimed)}`);
if (!/claimed/.test(denClaimed || '')) errors.push('a claimed region should render gold (claimed)');
await page.screenshot({ path: `${OUT}/A8-map-claimed.png` });

// ── Fast travel: tapping the claimed pin whooshes the player home ─────────────
const farX = await world(() => window.__readquest.game.scene.keys.world.player.x);
if (farX < 1500) errors.push(`player should still be out east before fast travel (x=${farX})`);
await page.locator('.map-region[data-region="den"]').click();
await page.waitForFunction(() => window.__readquest.game.scene.keys.world.player.x < 900, null, { timeout: 8000 });
const homeX = await world(() => window.__readquest.game.scene.keys.world.player.x);
console.log(`fast travel: player x ${Math.round(farX)} → ${Math.round(homeX)} (back home)`);

// ── It all persists: reload restores the explored + claimed map ───────────────
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const after = await save();
console.log(`after reload: mapSeen=${JSON.stringify(after.mapSeen)} mapClaimed=${JSON.stringify(after.mapClaimed)}`);
if (!after.mapSeen.includes('den') || !after.mapSeen.includes('cave')) errors.push('explored regions should persist across a reload');
if (!after.mapClaimed.includes('den')) errors.push('claimed regions should persist across a reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nFOG-OF-WAR MAP VERIFIED: walking clears a region’s fog; reading its name claims it gold and plants a fast-travel pin that whooshes you there; exploration + claims persist across sessions');
