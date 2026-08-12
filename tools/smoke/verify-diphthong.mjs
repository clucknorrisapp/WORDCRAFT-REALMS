// Smoke test for the Diphthong tier (ou/ow/oi/oy) — the new final rung of the
// phonics ladder and the Reader Level 10 capstone. A child who has mastered
// every tier is a "Sound Explorer 🌀": the HUD badge reads Lv 10, the reader
// card crowns them at the top rank, and the diphthong word-gate (Cloud Tops)
// asks for "cow" — decodable precisely because the tier is now taught — and
// dissolves into a new biome when said. This proves the ladder's top step both
// counts toward Reader Level and gates real new land.
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
    v: 1, childId: 'smoke_diph', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [],
    // Mastered EVERY tier through diphthong — a full-ladder "Sound Explorer".
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team', 'r_controlled', 'diphthong'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    // No mic → the magic-word gate uses the say-it-then-tap ritual.
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const gateCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.gatesOpenCount());

// ── Reader Level 10 capstone: the HUD badge crowns a "Sound Explorer 🌀" ───────
const badge = await page.locator('.reader-lv').first();
const badgeText = (await badge.textContent())?.trim() ?? '';
console.log(`reader badge: "${badgeText}"`);
if (!badgeText.includes('Lv 10')) errors.push(`full-ladder reader badge should read Lv 10, got "${badgeText}"`);
if (!badgeText.includes('🌀')) errors.push(`the Sound Explorer badge should carry the 🌀 icon, got "${badgeText}"`);

// Tapping the badge opens the reader card — top rank, no "keep reading" nudge.
await badge.click();
await page.waitForSelector('.reader-card', { timeout: 6000 });
const cardName = await page.locator('.reader-card .newsound-name').textContent();
const cardTitle = await page.locator('.reader-card .title').textContent();
const cardSub = await page.locator('.reader-card .subtitle').textContent();
console.log(`reader card: name="${cardName}" title="${cardTitle}" sub="${cardSub}"`);
if (!/Reader Level 10/.test(cardName ?? '')) errors.push(`reader card should read "Reader Level 10", got "${cardName}"`);
if ((cardTitle ?? '').trim() !== 'Sound Explorer') errors.push(`level-10 title should be "Sound Explorer", got "${cardTitle}"`);
if (!/top rank/i.test(cardSub ?? '')) errors.push(`level-10 (max) card should say the child reached the top rank, got "${cardSub}"`);
await page.screenshot({ path: `${OUT}/A6-reader-explorer.png` });
// Close the card before touching the world.
await page.locator('.reader-card .btn').click();
await page.waitForTimeout(300);

// ── The Cloud Tops gate (diphthong) asks for "cow" and unrolls a new biome ─────
if ((await gateCount()) !== 0) errors.push('no gates should be open at the start');
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onGateTapped('clouds'));
await page.waitForSelector('.word-big', { timeout: 8000 });
const word = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`clouds gate magic word: "${word}"`);
if (word !== 'cow') errors.push(`the Cloud Tops gate should ask for "cow", got "${word}"`);
// Ritual: say it, then tap the word to dissolve the wall.
await page.locator('.panel .word-big').click();
await page.waitForFunction(() => window.__readquest.game.scene.keys.world.gatesOpenCount() >= 1, null, { timeout: 8000 });
const save = await page.evaluate(() => window.__readquest.services.save);
console.log(`after opening: gatesOpened=${JSON.stringify(save.gatesOpened)}, open biomes=${await gateCount()}`);
if (!save.gatesOpened.includes('clouds')) errors.push('saying "cow" should open the Cloud Tops (diphthong) gate');
await page.screenshot({ path: `${OUT}/A7-cloud-tops.png` });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nDIPHTHONG TIER VERIFIED: mastering ou/ow/oi/oy crowns a Reader Level 10 "Sound Explorer 🌀", and the Cloud Tops word-gate opens on "cow" — the ladder now has a real top step that both counts toward rank and gates new land');
