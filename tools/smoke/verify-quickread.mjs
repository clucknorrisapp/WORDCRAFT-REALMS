// ⚡ Quick Read (automaticity round) — fluency's other half. Decoding is gated
// everywhere; this trains SPEED: a short burst of already-readable words the
// child recognizes fast for a combo spark, with no penalty for taking their
// time. This verifies the round runs end to end, every recognized word logs a
// reading rep (feeds the lifetime read count + deeds), and it pays a gem.
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
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_qr', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
      signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {}, readCount: 0,
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team'],
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
const stat = () => page.evaluate(() => ({ gems: window.__readquest.services.save.gems, readCount: window.__readquest.services.save.readCount }));

const before = await stat();

// Open ⚡ Quick Read from the More menu.
await page.locator('.menu-btn').click();
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.hud-menu-tray button:has-text("⚡")').click();
await page.waitForSelector('.quickread-card', { timeout: 6000 });

// Read through the round: tap each word card as it appears (fast → combo).
let read = 0;
for (let i = 0; i < 12; i++) {
  const card = await page.$('.quickread-card');
  if (!card) break; // the celebration replaced the round
  await card.click();
  read += 1;
  await page.waitForTimeout(480); // the spark beat before the next word
}
console.log(`words read in the round: ${read}`);
if (read < 6) errors.push(`the round should present a handful of words, only read ${read}`);

// The celebration tallies the round and pays a gem.
await page.waitForSelector('.quickread-done', { timeout: 6000 });
const tally = await page.locator('.quickread-done .newsound-name').textContent();
console.log(`round tally: "${tally}"`);
const after = await stat();
console.log(`gems ${before.gems}→${after.gems}, readCount ${before.readCount}→${after.readCount}`);
if (after.gems <= before.gems) errors.push(`Quick Read should pay at least one gem (${before.gems}→${after.gems})`);
if (after.readCount < before.readCount + read) errors.push(`each recognized word must log a reading rep: readCount ${before.readCount}→${after.readCount} for ${read} words`);

await page.locator('.quickread-done .btn').click();
await page.waitForSelector('.quickread-done', { state: 'detached', timeout: 6000 });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nQUICK READ VERIFIED: a short automaticity round flashes already-readable words, sparks fast recognitions, logs each as a reading rep toward the lifetime count + deeds, and pays a gem — fluency\'s speed half, with no fail state');
