// Smoke test for Say-to-Mine: in free play, gathering is now a reading rep —
// tapping a tree/rock brings up an adaptive decodable word; reading it (the word
// card never fails) is what swings the axe and grants the resource. This is the
// plan's core move: reading IS the gathering.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 30); } },
  });
  const save = {
    v: 1, childId: 'smoke_mine', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {},
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
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));

const woodBefore = (await readSave()).wood;

// Tap a tree in free play → the gather reading card should appear.
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onTreeTapped(() => {}));
await page.waitForSelector('.word-big', { timeout: 8000 });
const icon = await page.evaluate(() => {
  const sub = document.querySelector('.panel .subtitle');
  return sub ? sub.textContent : '';
});
console.log(`gather card shown, icon="${icon}"`);
if (!/🪓/.test(icon)) errors.push(`gather card should show the axe icon, got "${icon}"`);
await page.screenshot({ path: `${OUT}/84-say-to-mine.png` });

// Read it (tap ✓) — this is the swing of the axe.
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((w) => JSON.parse(localStorage.getItem('readquest_save_v1')).wood === w + 1, woodBefore, { timeout: 8000 });

const after = await readSave();
console.log(`wood ${woodBefore} → ${after.wood} after reading to gather`);
if (after.wood !== woodBefore + 1) errors.push(`gathering should grant +1 wood, got ${woodBefore}→${after.wood}`);
const reads = after.evidence.filter((e) => e.challengeType === 'sign_read');
console.log(`reading-to-gather logged ${reads.length} reading interaction(s)`);
if (reads.length < 1) errors.push('gathering by reading logged no reading interaction');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nSAY-TO-MINE VERIFIED: tapping a tree in free play → read an adaptive word → the axe swings and wood is granted (a real reading rep)');
