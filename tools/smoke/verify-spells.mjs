// Smoke test for the Spellbook: spells unlock through reading (a starter + one
// per book finished), and casting a spell is a reading moment that logs
// spell_cast production evidence and fires the themed effect. Mic is disabled
// here so casting uses the always-available say-it-out-loud ritual.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 40); } },
  });
  const save = {
    v: 1, childId: 'smoke_spell', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: ['pig-in-mud', 'hen-and-eggs'], // → starter + 2 = 3 spells unlocked
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    // Mic OFF → casting uses the say-it ritual (deterministic).
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

// Open the spellbook.
await page.locator('.hud-left button:has-text("✨")').click();
await page.waitForSelector('.spell-grid', { timeout: 8000 });
const unlocked = await page.locator('.spell-card:not(.locked)').count();
const locked = await page.locator('.spell-card.locked').count();
console.log(`spellbook: ${unlocked} unlocked, ${locked} locked (expected 3 unlocked = starter + 2 books)`);
// The unlock logic is what matters: a starter spell + one per book read.
if (unlocked !== 3) errors.push(`expected 3 unlocked spells (starter + 2 books), got ${unlocked}`);
if (locked < 1) errors.push(`expected some locked spells still to earn, got ${locked}`);
await page.screenshot({ path: `${OUT}/60-spellbook.png` });

// Cast the first spell via the say-it ritual: open cast panel, tap the word.
await page.locator('.spell-card:not(.locked)').first().click();
await page.waitForSelector('.spellcast', { timeout: 8000 });
await page.screenshot({ path: `${OUT}/61-spell-cast.png` });
await page.locator('.spellcast .word-big').click();
await page.waitForTimeout(1200); // effect + celebration + panel close

const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).evidence);
const casts = ev.filter((e) => e.challengeType === 'spell_cast');
console.log(`spell_cast rows after casting: ${casts.length} ${JSON.stringify(casts.map((c) => ({ w: c.wordId, ok: c.correct, ch: c.channel })))}`);
if (casts.length !== 1) errors.push(`expected exactly 1 spell_cast row, got ${casts.length}`);
if (casts[0] && (casts[0].channel !== 'production' || casts[0].correct !== true)) {
  errors.push(`spell_cast row should be a correct production cast, got ${JSON.stringify(casts[0])}`);
}

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nSPELLS VERIFIED: reading unlocks spells; casting a spell logs a production reading interaction');
