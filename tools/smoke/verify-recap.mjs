// "Show a grown-up" recap (backlog #5): a ⭐ card summarising everything the
// child has done — reading rank, words read, books, blocks, friends — with a big
// "Tell a grown-up!" button that reads a warm, proud summary aloud. An adult's
// pride is the strongest reason a young child keeps reading.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const spoken = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { window.__spoken.push(u.text); setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  const ev = (w) => ({ eventId: `e_${w}`, childId: 'smoke_recap', at: Date.now(), challengeType: 'sign_read', skillIds: ['short_e'], wordId: w, channel: 'recognition', correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: false });
  const save = {
    v: 1, childId: 'smoke_recap', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 5,
    signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
    booksRead: ['pig-in-mud', 'come-and-see'], blocksUnlocked: ['tin'], build: {}, worldBuild: {}, buildPlaced: 7, glintsFound: [], deedsEarned: ['read_first', 'book_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: ['pup'], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: ['fox'], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l'],
    evidence: [ev('hen'), ev('log'), ev('red'), ev('hen')], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

// Open the ⭐ recap from the More menu.
await page.locator('.menu-btn').click();
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.recap-btn').click();
await page.waitForSelector('.recap-grid', { timeout: 6000 });

const rank = await page.evaluate(() => document.querySelector('.recap-rank')?.textContent || '');
const nums = await page.evaluate(() => [...document.querySelectorAll('.recap-num')].map((n) => Number(n.textContent)));
console.log(`recap rank: "${rank}"`);
console.log(`recap tiles: ${JSON.stringify(nums)}`);
if (!/Reader Level 3/.test(rank)) errors.push(`recap should show the reader level (3 here), got "${rank}"`);
// tiles: words read, distinct words, books, blocks, friends, deeds
if (nums[2] !== 2) errors.push(`books finished should be 2, got ${nums[2]}`);
if (nums[3] !== 7) errors.push(`blocks placed should be 7, got ${nums[3]}`);
if (nums[4] !== 2) errors.push(`friends (1 pet + 1 tamed) should be 2, got ${nums[4]}`);
if (nums[1] !== 3) errors.push(`distinct words (hen/log/red) should be 3, got ${nums[1]}`);

// "Tell a grown-up!" speaks a warm proud summary.
await page.locator('.recap-tell').click();
await page.waitForTimeout(200);
const said = await page.evaluate(() => window.__spoken[window.__spoken.length - 1] || '');
console.log(`told a grown-up: "${said}"`);
if (!/proud/i.test(said) || !/Reader Level 3/.test(said)) errors.push(`the grown-up summary should be warm + name the rank, got "${said}"`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nSHOW-A-GROWN-UP RECAP VERIFIED: the ⭐ card tallies reading rank, words, books, blocks and friends, and "Tell a grown-up!" reads a warm, proud summary aloud');
