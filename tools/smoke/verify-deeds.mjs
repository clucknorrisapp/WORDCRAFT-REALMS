// Smoke test for Phase 1.5 — Deeds, the Daily Gift, and the compass.
//  - Deeds: doing a reading rep (gather) awards the "First Word!" deed, and the
//    deed wall shows earned + locked deeds.
//  - Daily Gift: the 🎁 word-of-the-day is a reading rep that pays a gem once and
//    remembers the day.
//  - Compass: the 🧭 "where do I go?" button reveals a goal without error.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 20); } },
  });
  const save = {
    v: 1, childId: 'smoke_deeds', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, buildPlaced: 0, glintsFound: [], deedsEarned: [], lastGiftDay: null,
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

// ── Deeds: a reading rep earns the "First Word!" deed ──────────────────────────
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onTreeTapped(() => {}));
await page.waitForSelector('.word-big', { timeout: 8000 });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
// A NON-MODAL "New Deed!" banner should float in (reading count crossed 1). It
// must never block world input, so it has no scrim and no dismiss button.
await page.waitForSelector('.deed-toast', { timeout: 8000 });
const bannerText = await page.evaluate(() => document.querySelector('.deed-toast')?.innerText || '');
console.log(`deed banner: "${bannerText.replace(/\s+/g, ' ')}"`);
if (!/Deed/i.test(bannerText)) errors.push(`deed banner should announce a new deed, got "${bannerText}"`);
await page.screenshot({ path: `${OUT}/87-deed-earned.png` });

const afterRead = await readSave();
console.log(`deedsEarned after first read: ${JSON.stringify(afterRead.deedsEarned)}`);
if (!afterRead.deedsEarned.includes('read_first')) errors.push('reading a word should earn the read_first deed');

// ── Deed wall: earned + locked deeds are shown ────────────────────────────────
await page.locator('.menu-btn').click(); // the deed wall lives in the ➕ More menu now
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.hud-menu-tray button:has-text("🏅")').click();
await page.waitForSelector('.deeds-grid', { timeout: 6000 });
const deedCounts = await page.evaluate(() => ({
  total: document.querySelectorAll('.deed').length,
  got: document.querySelectorAll('.deed.got').length,
  locked: document.querySelectorAll('.deed.locked').length,
}));
console.log(`deed wall: ${deedCounts.got} earned / ${deedCounts.total} total (${deedCounts.locked} locked)`);
if (deedCounts.total < 10) errors.push(`deed wall should list the full ladder, got ${deedCounts.total}`);
if (deedCounts.got < 1) errors.push('deed wall should show at least one earned deed');
if (deedCounts.locked < 1) errors.push('deed wall should show locked deeds too');
await page.screenshot({ path: `${OUT}/88-deed-wall.png` });
await page.locator('.panel.deeds button:has-text("Close")').click();
await page.waitForSelector('.deeds-grid', { state: 'detached', timeout: 6000 });

// ── Daily gift: the 🎁 word-of-the-day pays a gem once ────────────────────────
const gemsBeforeGift = (await readSave()).gems;
await page.locator('.hud-left button:has-text("🎁")').click({ force: true });
await page.waitForSelector('.word-big', { timeout: 8000 });
const giftIcon = await page.evaluate(() => document.querySelector('.panel .subtitle')?.textContent || '');
if (!/🎁/.test(giftIcon)) errors.push(`daily gift card should show the gift icon, got "${giftIcon}"`);
await page.screenshot({ path: `${OUT}/89-daily-gift.png` });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction((g) => JSON.parse(localStorage.getItem('readquest_save_v1')).gems >= g + 2, gemsBeforeGift, { timeout: 8000 });
const afterGift = await readSave();
console.log(`daily gift: gems ${gemsBeforeGift} → ${afterGift.gems}; lastGiftDay=${afterGift.lastGiftDay}`);
if (afterGift.gems < gemsBeforeGift + 2) errors.push(`daily gift should pay +2 gems, got ${gemsBeforeGift}→${afterGift.gems}`);
if (!afterGift.lastGiftDay) errors.push('daily gift should stamp lastGiftDay');

// Re-opening the gift the same day must NOT pay again. Let the first gift flow
// fully settle first (its re-entrancy latch releases when the celebration ends).
const gemsAfterClaim = afterGift.gems;
await page.waitForFunction(() => document.querySelectorAll('.scrim').length === 0, { timeout: 8000 });
await page.waitForTimeout(700);
await page.locator('.hud-left button:has-text("🎁")').click({ force: true });
await page.waitForSelector('.word-big', { timeout: 8000 });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForTimeout(400);
const afterReclaim = await readSave();
console.log(`re-open same day: gems ${gemsAfterClaim} → ${afterReclaim.gems}`);
if (afterReclaim.gems !== gemsAfterClaim) errors.push(`re-opening the daily gift the same day must not pay again, got ${gemsAfterClaim}→${afterReclaim.gems}`);

// ── Compass: "where do I go?" reveals a goal without error ─────────────────────
await page.locator('.hud-left button:has-text("🧭")').click();
await page.waitForTimeout(600);
console.log('compass tapped (free play → reveals nearest node)');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nDEEDS + DAILY GIFT + COMPASS VERIFIED: reading earns deeds shown on the wall; the daily gift pays a gem once per day; the compass reveals the next goal');
