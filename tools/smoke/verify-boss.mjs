// Smoke test for the Waking Giant boss + the Beacon monument (Phase 4.2).
// The Beacon lights one ring per Reader Level and per finished book — powered
// only by reading — and the count persists. The Giant appears at Reader Level 3;
// reading three word-shields wakes him and he steps aside to reveal new land,
// paying gems. Fully non-violent: every read shatters a shield (warm-fail).
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
      v: 1, childId: 'smoke_boss', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
      signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false,
      // base + 5 blend milestones → Reader Level 6 (>= 3, so the giant appears).
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end'],
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
const dir = (fn) => page.evaluate(fn);
const beacon = () => page.evaluate(() => window.__readquest.game.scene.keys.world.beaconInfo());
const giant = () => page.evaluate(() => window.__readquest.game.scene.keys.world.giantInfo());
const notBusy = () => page.waitForFunction(() => !window.__readquest.game.scene.keys.world.director.busy, null, { timeout: 8000 });

// ── The Beacon: rings = Reader Level + books, banked and persisted ────────────
const b0 = await beacon();
console.log(`beacon on load: ${JSON.stringify(b0)}`);
if (b0.rings < 3) errors.push(`the beacon should light one ring per reader level (>=3 here), got ${b0.rings}`);
if (b0.lit !== b0.rings) errors.push(`the beacon should bank its lit rings on load (lit ${b0.lit} vs rings ${b0.rings})`);

// Finishing a book lights one more ring (and banks it, celebrated once).
const grew = await page.evaluate(() => {
  const w = window.__readquest.game.scene.keys.world;
  const before = w.beaconInfo().rings;
  window.__readquest.services.save.booksRead.push('smoke_book');
  w.updateBeacon(true);
  return { before, after: w.beaconInfo() };
});
console.log(`after a finished book: rings ${grew.before} → ${grew.after.rings}, lit ${grew.after.lit}`);
if (grew.after.rings !== grew.before + 1) errors.push('a finished book should light one more beacon ring');
if (grew.after.lit !== grew.after.rings) errors.push('the newly lit ring should be banked');
await page.screenshot({ path: `${OUT}/B1-beacon.png` });

// ── The Waking Giant: he's here at Reader Level 3+, asleep and undefeated ─────
const g0 = await giant();
console.log(`giant on load: ${JSON.stringify(g0)}`);
if (!g0.alive) errors.push('the giant should appear at Reader Level 3+');
if (g0.defeated) errors.push('a fresh giant should not be defeated');

// Read three word-shields to wake him.
const gemsBefore = (await save()).gems;
for (let i = 1; i <= 3; i++) {
  await notBusy();
  await dir(() => window.__readquest.game.scene.keys.world.director.onGiantTapped());
  await page.waitForSelector('.word-big', { timeout: 8000 });
  await page.locator('.panel button:has-text("✓")').click();
  await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
  if (i < 3) {
    await page.waitForFunction((n) => window.__readquest.services.save.giantShields >= n, i, { timeout: 8000 });
    console.log(`shield ${i} shattered (giantShields=${(await save()).giantShields})`);
  }
}
await page.waitForFunction(() => window.__readquest.services.save.giantDefeated, null, { timeout: 8000 });
await notBusy();
const gA = await save();
console.log(`giant defeated=${gA.giantDefeated}, shields=${gA.giantShields}, gems ${gemsBefore}→${gA.gems}`);
if (!gA.giantDefeated) errors.push('reading three shields should defeat (wake) the giant');
if (gA.gems !== gemsBefore + 3) errors.push(`waking the giant should pay +3 gems, got ${gemsBefore}→${gA.gems}`);
await page.screenshot({ path: `${OUT}/B1-giant-awake.png` });

// ── Persistence: reload → the giant stays beaten (steps aside, new land) ──────
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).giantDefeated, null, { timeout: 8000 });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const gR = await giant();
console.log(`after reload: giant ${JSON.stringify(gR)}`);
if (!gR.defeated) errors.push('the giant should stay defeated across a reload');
if (gR.alive) errors.push('a defeated giant should not re-block the path on reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nWAKING GIANT + BEACON VERIFIED: the Beacon lights a ring per reader level and finished book (banked + persisted); the giant appears at Reader Level 3 and reading three word-shields wakes him, pays gems, and steps him aside for good');
