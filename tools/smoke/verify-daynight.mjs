// Smoke test for The World Breathes (Phase 3.5). A slow colour grade washes the
// world from day to soft night (free play only); at night, fireflies appear and
// reading one (a night-only word-card) catches it for a gem. Day clears them.
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
    v: 1, childId: 'smoke_dn', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0,
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
const readSave = () => page.evaluate(() => window.__readquest.services.save);
const setPhase = (p) => page.evaluate((v) => window.__readquest.game.scene.keys.world.setDayPhaseForTest(v), p);
const dayInfo = () => page.evaluate(() => window.__readquest.game.scene.keys.world.dayInfo());

// ── Noon: clear sky, no fireflies ─────────────────────────────────────────────
await setPhase(0.4);
await page.waitForTimeout(300);
const noon = await dayInfo();
console.log(`noon: alpha=${noon.alpha.toFixed(2)}, night=${noon.isNight}, fireflies=${noon.fireflies}`);
if (noon.alpha > 0.1) errors.push(`noon should be clear (alpha≈0), got ${noon.alpha}`);
if (noon.isNight) errors.push('noon should not be night');

// ── Night: the world darkens (soft) and fireflies appear ──────────────────────
await setPhase(0.8);
const gotNight = await page
  .waitForFunction(() => window.__readquest.game.scene.keys.world.dayInfo().fireflies >= 3, null, { timeout: 6000 })
  .then(() => true)
  .catch(() => false);
const night = await dayInfo();
console.log(`night: alpha=${night.alpha.toFixed(2)}, night=${night.isNight}, fireflies=${night.fireflies}`);
if (!gotNight) errors.push('night should spawn fireflies');
if (night.alpha < 0.3) errors.push(`night should darken the world (alpha>0.3), got ${night.alpha}`);
if (!night.isNight) errors.push('phase 0.8 should read as night');
await page.screenshot({ path: `${OUT}/A0-night.png` });

// ── Catch a firefly: read the night word for a gem ────────────────────────────
const before = await readSave();
await page.evaluate(() => { window.__caught = false; window.__readquest.game.scene.keys.world.director.onFireflyTapped(() => { window.__caught = true; }); });
await page.waitForSelector('.word-big', { timeout: 8000 });
const icon = await page.evaluate(() => document.querySelector('.panel .subtitle')?.textContent || '');
if (!/🌙/.test(icon)) errors.push(`firefly card should show the moon icon, got "${icon}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForTimeout(200);
const after = await readSave();
const caught = await page.evaluate(() => window.__caught);
console.log(`firefly caught: gems ${before.gems}→${after.gems}, firefliesCaught=${after.firefliesCaught}, callback=${caught}`);
if (after.gems !== before.gems + 1) errors.push(`catching a firefly should pay +1 gem, got ${before.gems}→${after.gems}`);
if (after.firefliesCaught !== 1) errors.push(`firefliesCaught should be 1, got ${after.firefliesCaught}`);
if (!caught) errors.push('the firefly catch callback should fire (the firefly is removed)');

// ── Back to day: fireflies clear ──────────────────────────────────────────────
await setPhase(0.4);
const cleared = await page
  .waitForFunction(() => window.__readquest.game.scene.keys.world.dayInfo().fireflies === 0, null, { timeout: 6000 })
  .then(() => true)
  .catch(() => false);
if (!cleared) errors.push('returning to day should clear the fireflies');
console.log(`day again: fireflies cleared=${cleared}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nWORLD-BREATHES VERIFIED: the sky grades day→night (free play), fireflies come out after dark, and reading one catches it for a gem');
