// First-run coach: a brand-new player in the scripted intro gets a pulsing "tap
// to walk" cue by the avatar (the one thing a pre-reader can't be told in
// words). It clears the instant they first move and never returns.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  // A brand-new player: avatar + dragon preset (skips character select) but still
  // at the very first quest step, coach not yet seen.
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_coach', avatar: 0, dragonName: 'rex', dragonLevel: 0, dragonXp: 0,
      questStep: 0, wood: 0, stone: 0, eggs: 0, gems: 0,
      signsRead: [], hensFound: [], wallsBuilt: [], coopStage: 0, treasureClaimed: false,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: [], lastGiftDay: null, job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: false,
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
      evidence: [], events: [], firstSessionAt: Date.now(),
      settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
    };
    localStorage.setItem('readquest_save_v1', JSON.stringify(save));
  }
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
const coach = () => page.evaluate(() => window.__readquest.game.scene.keys.world.coachActive());

// The coach appears shortly after load (a 700ms in-world delay).
await page.waitForFunction(() => window.__readquest.game.scene.keys.world.coachActive(), null, { timeout: 8000 });
console.log(`new player: coach on screen = ${await coach()}`);

// First move learned → the coach retires and is banked as done.
await page.evaluate(() => {
  const w = window.__readquest.game.scene.keys.world;
  w.moveTarget = { x: w.player.x + 200, y: w.player.y };
});
await page.waitForFunction(() => !window.__readquest.game.scene.keys.world.coachActive(), null, { timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.coachDone === true, null, { timeout: 8000 });
console.log(`after first move: coach = ${await coach()}, coachDone = ${(await page.evaluate(() => window.__readquest.services.save.coachDone))}`);

// It never returns: reload and it stays gone.
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).coachDone === true, null, { timeout: 8000 });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1500);
const afterReload = await coach();
console.log(`after reload: coach = ${afterReload} (should stay gone)`);
if (afterReload) errors.push('the coach must not return once the child has learned to move');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nFIRST-RUN COACH VERIFIED: a brand-new player is shown "tap to walk" by the avatar; it clears the instant they first move and never returns');
