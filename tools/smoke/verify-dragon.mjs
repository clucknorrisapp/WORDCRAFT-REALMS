// Smoke test for Raise & dress your dragon (Phase 4.3). Feeding the dragon is a
// reading rep that grows dragonXp; crossing a threshold visibly grows the dragon
// a stage (bigger + horns, then wings) and hands the child a colour word to read
// to "dress" it. The colour sticks across sessions. All art is procedural.
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
  // Guard the seed so a reload keeps the grown-and-dressed save instead of
  // re-seeding the pristine one (addInitScript re-runs on every navigation).
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_dragon', avatar: 0, dragonName: 'chip', dragonLevel: 2, dragonXp: 5,
      questStep: 9, wood: 3, stone: 1, eggs: 2, gems: 1,
      signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null,
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
const save = () => page.evaluate(() => window.__readquest.services.save);
const dragonInfo = () => page.evaluate(() => window.__readquest.game.scene.keys.world.dragonInfo());
const notBusy = () => page.waitForFunction(() => !window.__readquest.game.scene.keys.world.director.busy, null, { timeout: 8000 });

// ── Before: a hatchling — no horns, no wings, no colour dressing ───────────────
const before = await dragonInfo();
console.log(`before: ${JSON.stringify(before)}`);
if (before.stage !== 0) errors.push(`dragon should start at stage 0, got ${before.stage}`);
if (before.hasRig) errors.push('a stage-0 dragon must not have horns/wings yet');

// ── Feed the dragon one word — dragonXp 5 → 6 crosses the first stage ─────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onDragonTapped());
await page.waitForSelector('.word-card', { timeout: 8000 });
const target = await page.evaluate(() => {
  const evs = window.__readquest.services.analytics.all();
  return [...evs].reverse().find((e) => e.type === 'adaptive_target')?.payload?.word;
});
console.log(`feeding the dragon the word "${target}"`);
// Click the exact target card (exact match — never a substring sibling).
const clicked = await page.evaluate((t) => {
  for (const c of document.querySelectorAll('.word-card')) {
    if ((c.textContent || '').trim().toLowerCase() === t) { c.click(); return true; }
  }
  return false;
}, target);
if (!clicked) errors.push(`could not find the feed card for "${target}"`);

// ── The dragon grows a stage → a colour word appears to "dress" it ────────────
await page.waitForSelector('.word-big', { timeout: 8000 });
const colour = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`stage-up colour card reads: "${colour}"`);
if (colour !== 'red') errors.push(`the first stage-up should dress the dragon in "red", got "${colour}"`);
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.dragonColor === 'red', null, { timeout: 8000 });
await notBusy();

// ── After: bigger, horned, and wearing red ────────────────────────────────────
const after = await dragonInfo();
const s = await save();
console.log(`after: ${JSON.stringify(after)}  dragonXp=${s.dragonXp} dragonColor=${s.dragonColor}`);
if (s.dragonXp !== 6) errors.push(`feeding should raise dragonXp to 6, got ${s.dragonXp}`);
if (after.stage !== 1) errors.push(`dragon should be stage 1 after the feed, got ${after.stage}`);
if (!after.hasRig) errors.push('a grown dragon should have its horn rig drawn');
if (after.scale <= before.scale) errors.push(`the dragon should be visibly bigger (scale ${before.scale} → ${after.scale})`);
if (after.tint !== 0xff6b6b) errors.push(`the dragon should be tinted red (0xff6b6b), got 0x${after.tint.toString(16)}`);
const grew = await page.evaluate(() => window.__readquest.services.analytics.all().filter((e) => e.type === 'dragon_grew'));
if (!grew.length) errors.push('growing a stage should log a dragon_grew event');
await page.screenshot({ path: `${OUT}/A7-dragon-grown.png` });

// ── It stays dressed: reload restores size + horns + colour from the save ─────
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).dragonColor === 'red', null, { timeout: 8000 });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const reloaded = await dragonInfo();
console.log(`after reload: ${JSON.stringify(reloaded)}`);
if (reloaded.stage !== 1) errors.push(`stage should persist across a reload, got ${reloaded.stage}`);
if (!reloaded.hasRig) errors.push('horns should be restored on reload');
if (reloaded.tint !== 0xff6b6b) errors.push(`the red dressing should persist across a reload, got 0x${reloaded.tint.toString(16)}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nRAISE & DRESS DRAGON VERIFIED: feeding (reading) grows the dragon a visible stage — bigger + horns — then a colour word dresses it, and the growth + colour persist across sessions');
