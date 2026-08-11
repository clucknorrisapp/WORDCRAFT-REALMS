// Smoke test for Blocks that DO things (Phase 3.4). A placed BED you read "nap"
// at turns the world to soft night; a placed SUN you read "sun" at sweeps it back
// to day. Reading the command is what flips the switch — "my voice changes the
// world" — and it's forgiving (the card always fires the effect).
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
    v: 1, childId: 'smoke_int', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: ['bed', 'sun'], build: {}, worldBuild: { '20,18': 'bed', '22,18': 'sun' }, buildPlaced: 2, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const dayInfo = () => page.evaluate(() => window.__readquest.game.scene.keys.world.dayInfo());

// Start in clear day.
await page.evaluate(() => window.__readquest.game.scene.keys.world.setDayPhaseForTest(0.4));
await page.waitForTimeout(200);
const day0 = await dayInfo();
console.log(`start: alpha=${day0.alpha.toFixed(2)}, night=${day0.isNight}`);
if (day0.isNight) errors.push('should start in day');

// ── Tap the BED → read "nap" → night ──────────────────────────────────────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onInteractiveBlock('bed'));
await page.waitForSelector('.word-big', { timeout: 8000 });
const cmd1 = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
const icon1 = await page.evaluate(() => document.querySelector('.panel .subtitle')?.textContent || '');
console.log(`bed command: "${cmd1}" icon="${icon1}"`);
if (cmd1 !== 'nap') errors.push(`the bed should ask to read "nap", got "${cmd1}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForTimeout(300);
const night = await dayInfo();
console.log(`after "nap": alpha=${night.alpha.toFixed(2)}, night=${night.isNight}`);
if (!night.isNight) errors.push('reading "nap" at the bed should turn the world to night');
if (night.alpha < 0.3) errors.push(`night should darken the world (alpha>0.3), got ${night.alpha}`);
await page.screenshot({ path: `${OUT}/A3-bed-night.png` });

// ── Tap the SUN → read "sun" → day ────────────────────────────────────────────
// Wait for the bed's celebration to finish (the director serializes one reading
// moment at a time) before the next tap.
await page.waitForFunction(() => !window.__readquest.game.scene.keys.world.director.busy, null, { timeout: 8000 });
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onInteractiveBlock('sun'));
await page.waitForSelector('.word-big', { timeout: 8000 });
const cmd2 = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`sun command: "${cmd2}"`);
if (cmd2 !== 'sun') errors.push(`the sun should ask to read "sun", got "${cmd2}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForTimeout(300);
const back = await dayInfo();
console.log(`after "sun": alpha=${back.alpha.toFixed(2)}, night=${back.isNight}`);
if (back.isNight) errors.push('reading "sun" at the sun block should bring back the day');

// Production reading evidence was logged for the commands.
const acts = await page.evaluate(() => window.__readquest.services.analytics.count('block_activated'));
console.log(`block_activated events: ${acts}`);
if (acts < 2) errors.push(`both block activations should be logged, got ${acts}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nINTERACTIVE-BLOCKS VERIFIED: reading "nap" at a bed turns the world to night; reading "sun" at a sun block brings back the day — the child’s voice flips the world’s switches');
