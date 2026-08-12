// Smoke test for Read-to-Tame creatures + the Friends Book (Phase 3.3). Shy
// critters whose names are decodable at the child's tier roam the world; reading
// a creature's name tames it and it stays on as a friend. The Friends Book shows
// tamed friends, still-wild readable ones, and locked (not-yet-decodable) slots.
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
    v: 1, childId: 'smoke_mob', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);
const readSave = () => page.evaluate(() => window.__readquest.services.save);
const wildCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.wildMobCount());
const tamedCount = () => page.evaluate(() => window.__readquest.game.scene.keys.world.tamedMobCount());

// ── Wild creatures roam (one per readable, untamed species) ───────────────────
const wild0 = await wildCount();
console.log(`wild creatures roaming: ${wild0} (cat/dog/pig/fox/fish are readable here)`);
if (wild0 < 4) errors.push(`readable creatures should roam the world, got ${wild0}`);
await page.screenshot({ path: `${OUT}/A1-creatures.png` });

// ── Tame a fox by reading its name ────────────────────────────────────────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onCreatureTapped('fox'));
await page.waitForSelector('.word-big', { timeout: 8000 });
const name = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
const icon = await page.evaluate(() => document.querySelector('.panel .subtitle')?.textContent || '');
console.log(`tame card: name="${name}" icon="${icon}"`);
if (name !== 'fox') errors.push(`taming a fox should read "fox", got "${name}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForTimeout(300);

const after = await readSave();
const wild1 = await wildCount();
const tamed1 = await tamedCount();
console.log(`after taming: tamed=${JSON.stringify(after.tamed)}, wild ${wild0}→${wild1}, tamedMobs=${tamed1}`);
if (!after.tamed.includes('fox')) errors.push('taming should record the fox in save.tamed');
if (wild1 !== wild0 - 1) errors.push(`the tamed creature should leave the wild pool, got ${wild0}→${wild1}`);
if (tamed1 < 1) errors.push('a tamed creature should live on in the world');

// ── Friends Book: tamed + wild + locked slots ─────────────────────────────────
await page.locator('.menu-btn').click(); // the Friends Book lives in the ➕ More menu now
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.hud-menu-tray button:has-text("🐾")').click();
await page.waitForSelector('.friends-grid', { timeout: 6000 });
const fb = await page.evaluate(() => ({
  total: document.querySelectorAll('.friend').length,
  got: document.querySelectorAll('.friend.got').length,
  wild: document.querySelectorAll('.friend.wild').length,
  locked: document.querySelectorAll('.friend.locked').length,
}));
console.log(`friends book: ${fb.got} friends / ${fb.total} total (${fb.wild} wild, ${fb.locked} locked)`);
if (fb.total < 10) errors.push(`friends book should list the full roster, got ${fb.total}`);
if (fb.got < 1) errors.push('friends book should show the tamed fox');
if (fb.locked < 1) errors.push('friends book should show locked (not-yet-readable) creatures');
await page.screenshot({ path: `${OUT}/A2-friends-book.png` });
await page.locator('.panel.friends button:has-text("Close")').click();
await page.waitForSelector('.friends-grid', { state: 'detached', timeout: 6000 });

// ── Reload → the tamed friend persists ────────────────────────────────────────
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);
const restored = await tamedCount();
console.log(`after reload: ${restored} tamed friend(s) respawned`);
if (restored < 1) errors.push('tamed friends should respawn on reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nREAD-TO-TAME VERIFIED: readable creatures roam the world; reading a creature’s name tames it into a lifelong friend; the Friends Book fills as reading unlocks more species');
