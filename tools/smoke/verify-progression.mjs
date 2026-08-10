// Smoke test for CURRICULUM PROGRESSION — the engine that makes the game "get
// more advanced as we go". In free play, mastering the current frontier of
// sounds unlocks the next phonics tier: a "New Sounds Unlocked!" moment fires,
// save.taught grows, and new decodable blocks appear in the Build toolbox. Here
// we drive ST-blend mastery, watch L-blends unlock, and confirm the FLAG block
// (blend_l) surfaces in the palette that hid it a moment ago.
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
  // Free play, ST blend already taught (as it is right after the chest) but
  // barely practiced — so the next tier (L blends) is still locked.
  const save = {
    v: 1, childId: 'smoke_prog', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {},
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const readerBadge = () => page.locator('.chip.reader-lv').innerText();

// Reader Level BEFORE: base + ST taught → Level 2.
const lvlBefore = await readerBadge();
console.log(`reader badge before: "${lvlBefore}" (expect Lv 2)`);
if (!/Lv\s*2/.test(lvlBefore)) errors.push(`reader badge should show Lv 2 initially, got "${lvlBefore}"`);

// Toolbox BEFORE: the ST-tier block (NEST) is available, the L-tier block
// (FLAG) is hidden because blend_l is not yet taught (iron rule in the palette).
await page.locator('.hud-left button:has-text("🔨")').click();
await page.waitForSelector('.build-grid', { timeout: 8000 });
const nestBefore = await page.locator('.build-palette .lock-word', { hasText: 'NEST' }).count();
const flagBefore = await page.locator('.build-palette .lock-word', { hasText: 'FLAG' }).count();
console.log(`toolbox before: NEST=${nestBefore} (want 1, ST taught), FLAG=${flagBefore} (want 0, blend_l locked)`);
if (nestBefore < 1) errors.push('NEST block (blend_st) should be visible once ST is taught');
if (flagBefore !== 0) errors.push('FLAG block (blend_l) must be hidden before blend_l is taught');
await page.screenshot({ path: `${OUT}/76-toolbox-before.png` });
await page.locator('.panel.build button:has-text("Done")').click();
await page.waitForTimeout(300);

// Drive ST-blend mastery through real reading interactions (production, correct).
// The engine unlocks the next tier once the frontier is solid (>=4 attempts,
// developing+). recordEvidence runs the progression check inline.
await page.evaluate(() => {
  const s = window.__readquest.services;
  for (let i = 0; i < 6; i++) {
    s.recordEvidence({
      challengeType: 'magic_word', skillIds: ['blend_st'], channel: 'production',
      correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: true,
    });
  }
});

// The "New Sounds Unlocked!" moment fires for L blends, showing FLAG.
await page.waitForSelector('.panel.newsound', { timeout: 8000 });
const newsoundText = (await page.locator('.panel.newsound').innerText()).replace(/\s+/g, ' ');
console.log(`New Sounds moment: "${newsoundText}"`);
if (!/L Blends/i.test(newsoundText)) errors.push(`New Sounds moment should name "L Blends": "${newsoundText}"`);
if (!/FLAG/i.test(newsoundText)) errors.push(`New Sounds moment should show example FLAG: "${newsoundText}"`);
if (!/Reader Level 3/i.test(newsoundText)) errors.push(`New Sounds should show the Reader Level-up (Lv 3): "${newsoundText}"`);
await page.screenshot({ path: `${OUT}/77-new-sounds.png` });

const afterSave = await readSave();
console.log(`taught now includes blend_l: ${afterSave.taught.includes('blend_l')} (taught=${afterSave.taught.length})`);
if (!afterSave.taught.includes('blend_l')) errors.push('blend_l should be taught after mastering blend_st');
// The advance is logged to the (in-memory) analytics stream.
const advanced = await page.evaluate(() => window.__readquest.services.analytics.count('curriculum_advanced'));
console.log(`curriculum_advanced analytics events: ${advanced}`);
if (advanced < 1) errors.push('curriculum_advanced analytics event was not logged');

// Dismiss the celebration.
await page.locator('.panel.newsound button:has-text("Let")').click();
await page.waitForSelector('.panel.newsound', { state: 'detached', timeout: 8000 });

// Reader Level AFTER: the badge advanced to Level 3 (reading leveled up).
const lvlAfter = await readerBadge();
console.log(`reader badge after: "${lvlAfter}" (expect Lv 3)`);
if (!/Lv\s*3/.test(lvlAfter)) errors.push(`reader badge should advance to Lv 3, got "${lvlAfter}"`);

// Toolbox AFTER: FLAG (blend_l) now appears in the palette — reading advanced,
// and the world grew. This is the whole loop.
await page.locator('.hud-left button:has-text("🔨")').click();
await page.waitForSelector('.build-grid', { timeout: 8000 });
const flagAfter = await page.locator('.build-palette .lock-word', { hasText: 'FLAG' }).count();
console.log(`toolbox after: FLAG=${flagAfter} (want >=1 — new block unlocked by reading)`);
if (flagAfter < 1) errors.push('FLAG block (blend_l) should appear in the toolbox after blend_l unlocks');
await page.screenshot({ path: `${OUT}/78-toolbox-after.png` });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nPROGRESSION VERIFIED: mastering a sound unlocks the next tier → "New Sounds!" → new blocks appear in the toolbox');
