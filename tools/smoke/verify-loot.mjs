// Smoke test for Word Loot (Phase 4.5). Every noun the child has truly read
// (a correct evidence row) drops into the Word Bag. Open the bag and tap-read a
// word to summon its thing into the world — read HEN and a hen struts out. Only
// read words are unlocked; unread ones sit locked. Summons persist across
// sessions. It's creative-mode-with-words: bigger vocabulary → bigger loot box.
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
    // Two words the child has "read before" → owned in the bag (hen, log).
    const ev = (wordId, skill) => ({
      eventId: `ev_${wordId}`, childId: 'smoke_loot', at: Date.now(), challengeType: 'sign_read',
      skillIds: [skill], wordId, channel: 'recognition', correct: true, attemptIndex: 1, hintsUsed: 0,
      audioRequested: false, micUsed: false,
    });
    const save = {
      v: 1, childId: 'smoke_loot', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
      signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [],
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team', 'r_controlled'],
      evidence: [ev('hen', 'short_e'), ev('log', 'short_o')], events: [], firstSessionAt: Date.now(),
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
const summonCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.summonCount());

// ── The bag knows what you've read: hen + log owned, the rest locked ──────────
await page.locator('.bag-btn').click();
await page.waitForSelector('.bag-grid', { timeout: 8000 });
const owned = await page.locator('.loot.owned').count();
const locked = await page.locator('.loot.locked').count();
console.log(`Word Bag: ${owned} owned, ${locked} locked`);
if (owned !== 2) errors.push(`only the two read words (hen, log) should be owned, got ${owned}`);
if (locked < 10) errors.push(`unread words should sit locked, got ${locked}`);
const henOwned = await page.locator('.loot.owned:has-text("HEN")').count();
if (henOwned !== 1) errors.push('HEN should be an owned (readable) token');
await page.screenshot({ path: `${OUT}/A9-word-bag.png` });

// ── Read HEN → a hen is summoned into the world ───────────────────────────────
const before = await summonCount();
await page.locator('.loot.owned:has-text("HEN")').click();
await page.waitForSelector('.word-big', { timeout: 8000 });
const readWord = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
if (readWord !== 'hen') errors.push(`summoning should read the word "hen", got "${readWord}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((b) => window.__readquest.game.scene.keys.world.summonCount() > b, before, { timeout: 8000 });
const s = await save();
console.log(`summoned: count ${before} → ${await summonCount()}, save.summoned=${JSON.stringify(s.summoned)}`);
if (!s.summoned.some((it) => it.w === 'hen')) errors.push('reading HEN should record a summoned hen in the save');
await page.screenshot({ path: `${OUT}/A9-summoned-hen.png` });

// ── It persists: reload and the hen is still in the world ─────────────────────
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).summoned.some((it) => it.w === 'hen'), null, { timeout: 8000 });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const reCount = await summonCount();
console.log(`after reload: ${reCount} summoned thing(s) restored`);
if (reCount < 1) errors.push('summoned things should be restored from the save on reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nWORD LOOT VERIFIED: the Word Bag holds exactly the nouns the child has read; tap-reading one summons its thing into the world, and summons persist across sessions — vocabulary become a box of creative loot');
