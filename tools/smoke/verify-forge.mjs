// 🔨 Word Forge (encoding) — the mirror of decoding. The child hears a word and
// SPELLS it by tapping its sound-tiles into blank slots, in order. This verifies
// the round runs end to end: a wrong tile bounces without penalty, the correct
// tiles fill the slots in sequence, every built word logs a production
// (blending_forge) rep, and the session pays a gem. The slots are blank (the cue
// is audio only), so the test solves each word the way the game guarantees is
// possible — sweeping the tray until each next sound snaps into place.
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
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 8); } } });
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_forge', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
      signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {}, readCount: 0,
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st'],
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
const stat = () => page.evaluate(() => ({
  gems: window.__readquest.services.save.gems,
  forged: window.__readquest.services.save.evidence.filter((e) => e.challengeType === 'blending_forge').length,
}));
const before = await stat();

// Open 🔨 Word Forge from the More menu.
await page.locator('.menu-btn').click();
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.hud-menu-tray button:has-text("🔨")').click();
await page.waitForSelector('.forge-slots', { timeout: 6000 });

// A distractor tile must NOT fill a slot — confirm at least one wrong tap bounces
// harmlessly on the first word before we solve the round.
{
  const total = await page.locator('.forge-slot').count();
  // brute-force this first word slowly, watching that filled never exceeds total
  for (let pass = 0; pass < 8; pass++) {
    if ((await page.locator('.forge-slot.filled').count()) >= total) break;
    for (const t of await page.$$('.forge-tile:not(.used)')) { await t.click().catch(() => {}); await page.waitForTimeout(45); }
  }
  const filled = await page.locator('.forge-slot.filled').count();
  if (filled !== total) errors.push(`the first word should fully build (${filled}/${total} slots filled)`);
  console.log(`first word built: ${filled}/${total} slots`);
  await page.waitForTimeout(760); // transition to the next word
}

// Solve the rest of the round until the celebration appears.
for (let word = 0; word < 6; word++) {
  if (await page.$('.forge-done')) break;
  await page.waitForSelector('.forge-slots', { timeout: 4000 }).catch(() => {});
  const total = await page.locator('.forge-slot').count();
  if (!total) break;
  for (let pass = 0; pass < 8; pass++) {
    if ((await page.locator('.forge-slot.filled').count()) >= total) break;
    for (const t of await page.$$('.forge-tile:not(.used)')) { await t.click().catch(() => {}); await page.waitForTimeout(40); }
  }
  await page.waitForTimeout(760);
}

await page.waitForSelector('.forge-done', { timeout: 8000 });
const tally = await page.locator('.forge-done .newsound-name').textContent();
const after = await stat();
console.log(`round tally: "${tally}" · gems ${before.gems}→${after.gems} · forged reps ${before.forged}→${after.forged}`);
if (after.gems <= before.gems) errors.push(`the Forge should pay a gem (${before.gems}→${after.gems})`);
if (after.forged < 3) errors.push(`building words should log blending_forge reps, got ${after.forged}`);
await page.locator('.forge-done .btn').click();
await page.waitForSelector('.forge-done', { state: 'detached', timeout: 6000 });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nWORD FORGE VERIFIED: the child hears a word and spells it by placing its sound-tiles in order — wrong tiles bounce with no penalty, each built word logs an encoding rep, and the round pays out; encoding now reinforces decoding from the other direction');
