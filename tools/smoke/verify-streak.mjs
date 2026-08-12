// Daily read-streak — the read-every-day habit made visible. Claiming the daily
// gift (a reading moment) on consecutive days grows a streak; every third day
// drops a bonus; missing a day resets it to a fresh 1. This is a gentle reason
// to come back and read again tomorrow, with the reward always behind a read.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const BASE = process.env.BASE_URL || 'http://localhost:4173';
const errors = [];

// Claim the daily gift with a seeded prior state; returns {streak, gemsDelta}.
async function claim({ lastGiftDay, streak }) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((seed) => {
    class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 8); } } });
    const save = {
      v: 1, childId: 'smoke_streak', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
      signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: seed.lastGiftDay, streak: seed.streak, job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {}, readCount: 0,
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
      evidence: [], events: [], firstSessionAt: Date.now(),
      settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
    };
    localStorage.setItem('readquest_save_v1', JSON.stringify(save));
  }, { lastGiftDay, streak });
  await page.goto(BASE);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('.round.gift').click();
  await page.waitForSelector('.word-big', { timeout: 8000 });
  await page.locator('.panel button:has-text("✓")').click();
  await page.waitForFunction(() => window.__readquest.services.save.lastGiftDay === (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), null, { timeout: 8000 });
  const out = await page.evaluate(() => ({ streak: window.__readquest.services.save.streak, gems: window.__readquest.services.save.gems }));
  await page.close();
  return { streak: out.streak, gemsDelta: out.gems };
}

// Yesterday / three-days-ago as local YYYY-MM-DD (matching todayKey()).
const key = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const yesterday = key(Date.now() - 86400000);
const threeAgo = key(Date.now() - 3 * 86400000);

// ── Grow: read yesterday (streak 1) → today makes it 2, base 2💎, no bonus ─────
const grow = await claim({ lastGiftDay: yesterday, streak: 1 });
console.log(`grow: streak→${grow.streak}, gems+${grow.gemsDelta}`);
if (grow.streak !== 2) errors.push(`a consecutive-day claim should grow the streak 1→2, got ${grow.streak}`);
if (grow.gemsDelta !== 2) errors.push(`a non-milestone claim pays the base 2 gems, got ${grow.gemsDelta}`);

// ── Milestone: streak 2 → today makes 3 (every 3rd day) → base 2 + bonus 3 ─────
const milestone = await claim({ lastGiftDay: yesterday, streak: 2 });
console.log(`milestone: streak→${milestone.streak}, gems+${milestone.gemsDelta}`);
if (milestone.streak !== 3) errors.push(`streak should reach 3, got ${milestone.streak}`);
if (milestone.gemsDelta !== 5) errors.push(`a 3rd-day milestone pays 2 + 3 bonus = 5 gems, got ${milestone.gemsDelta}`);

// ── Reset: a missed day (last claim 3 days ago) → streak restarts at 1 ─────────
const reset = await claim({ lastGiftDay: threeAgo, streak: 9 });
console.log(`reset: streak→${reset.streak}, gems+${reset.gemsDelta}`);
if (reset.streak !== 1) errors.push(`a gap should reset the streak to 1, got ${reset.streak}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nDAILY STREAK VERIFIED: reading the daily gift on consecutive days grows a streak, every third day pays a bonus, and a missed day resets it — a come-back-tomorrow habit whose reward is always a read');
