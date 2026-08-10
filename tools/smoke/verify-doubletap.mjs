// Regression for the audit's most damaging finding: a correct choice-board tap
// left the board live for 450ms, so an excited double-tap logged a spurious
// "wrong" evidence row that permanently corrupted mastery. After the fix, the
// winning tap freezes the board and a second tap records nothing.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const TAUGHT = ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.addInitScript((taught) => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 40); } } });
  const save = {
    v: 1, childId: 'dbl', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 3, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    taught, evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: true, micStrictness: 'gentle', narrationRate: 1, textScale: 1 },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
}, TAUGHT);

await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);

// Free play: tap the dragon to open a feed board. The dragon wants
// FEED_FOODS[feedIdx]; feedIdx starts 0 → the correct card is EGG.
const FOODS = ['egg', 'nut', 'jam', 'ham', 'fig', 'bun'];
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onDragonTapped());
await page.waitForSelector('.word-card', { timeout: 8000 });
// Feeding is adaptive now — the correct word is whatever the engine targeted
// (drawn from the child's growing vocabulary); read it from the analytics event.
const target = await page.evaluate(() => {
  const evs = window.__readquest.services.analytics.all();
  const last = [...evs].reverse().find((e) => e.type === 'adaptive_target');
  return last?.payload?.word;
});

// The excited double-tap: tap the CORRECT card twice, fast, inside the 450ms
// resolve window. The fix must count this as one first-try correct — not a
// spurious wrong on the second tap.
const card = page.locator(`.word-card:has-text("${String(target).toUpperCase()}")`).first();
await card.click({ force: true }).catch(() => {});
await card.click({ force: true }).catch(() => {});
await page.waitForTimeout(900);

const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).evidence);
// The fed word is adaptive (drawn from the child's vocabulary) — filter by the
// actual target, not a fixed food list.
const foodRows = ev.filter((e) => e.challengeType === 'word_match' && e.wordId === target);
console.log(`target=${target}, feed rows: ${JSON.stringify(foodRows.map((e) => ({ w: e.wordId, ok: e.correct, n: e.attemptIndex })))}`);

await browser.close();
if (errors.length) {
  console.error('PAGE ERRORS:', errors.slice(0, 3));
  process.exit(1);
}
const wrongRows = foodRows.filter((e) => !e.correct);
if (foodRows.length !== 1 || wrongRows.length > 0 || foodRows[0].attemptIndex !== 1) {
  console.error(`FAILED: expected exactly one first-try correct row, got ${JSON.stringify(foodRows)}`);
  process.exit(1);
}
console.log('\nDOUBLE-TAP VERIFIED: a fast double-tap on the right card logs one correct row, never a spurious wrong');
