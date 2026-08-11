// Smoke test for Eggs Hatching (Phase 2.4). At the coop in free play, tapping
// with an egg in hand starts a hatch: read the baby's decodable species name
// (the crack), spend one egg, and a procedural baby pops out and lives on. Pets
// persist and are respawned on reload.
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
    v: 1, childId: 'smoke_hatch', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 2, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const petCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.petCount());

// ── Hatch: tap the coop with an egg in hand ───────────────────────────────────
const before = await readSave();
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onCoopTapped());
await page.waitForSelector('.word-big', { timeout: 8000 });
const species = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
const icon = await page.evaluate(() => document.querySelector('.panel .subtitle')?.textContent || '');
console.log(`hatch card: species="${species}" icon="${icon}"`);
if (!/🥚/.test(icon)) errors.push(`hatch card should show the egg icon, got "${icon}"`);
if (!['pup', 'cub', 'kid', 'chick'].includes(species)) errors.push(`hatch species should be a decodable baby, got "${species}"`);
await page.screenshot({ path: `${OUT}/94-hatch-read.png` });

// Read the species name — the crack.
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((e) => JSON.parse(localStorage.getItem('readquest_save_v1')).eggs === e - 1, before.eggs, { timeout: 8000 });
// The egg cracks after a short beat, then the baby pops. Poll for it rather than
// guess a wall-clock delay (the Phaser timer runs on the game clock).
const babyAppeared = await page
  .waitForFunction(() => window.__readquest.game.scene.keys.world.petCount() >= 1, null, { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
const after = await readSave();
const babies = await petCount();
console.log(`hatched: eggs ${before.eggs}→${after.eggs}, pets=${JSON.stringify(after.pets)}, babies in world=${babies}`);
if (after.eggs !== before.eggs - 1) errors.push(`hatching should spend one egg, got ${before.eggs}→${after.eggs}`);
if (after.pets.length !== 1) errors.push(`hatching should add a pet, got ${JSON.stringify(after.pets)}`);
if (!babyAppeared) errors.push('a baby should appear in the world after hatching');
await page.screenshot({ path: `${OUT}/95-baby-hatched.png` });

// ── Reload → the pet is respawned from save ───────────────────────────────────
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);
const restored = await petCount();
console.log(`after reload: ${restored} baby respawned`);
if (restored < 1) errors.push('hatched pets should respawn on reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nEGG HATCHING VERIFIED: tap the coop with an egg → read the baby’s species name → the egg cracks and a baby pops out, spends the egg, and lives on (persists across reloads)');
