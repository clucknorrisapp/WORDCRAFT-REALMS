// Named pets & the care loop (backlog #9) — a tamed friend can be ADOPTED:
// named by reading a name word, then fed once a day by reading a food word to
// grow a 5-heart bond. Both are reading moments (readWordCard), so naming and
// feeding advance the child's reading record; the daily cooldown is a gentle
// reason to come back and read tomorrow. Names + bond persist across sessions.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_pet', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
      signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0,
      // A cat already tamed — but not yet adopted (no name, no bond).
      tamed: ['cat'], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {},
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
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
const petCare = () => page.evaluate(() => window.__readquest.services.save.petCare);

// Open the 🐾 Friends Book from the More menu.
await page.locator('.menu-btn').click();
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.hud-menu-tray button:has-text("🐾")').click();
await page.waitForSelector('.friends-grid', { timeout: 6000 });

// The tamed cat is a tappable friend that still needs a name.
const catCell = page.locator('.friend.got').first();
if ((await catCell.locator('.friend-hint').textContent())?.trim() !== 'Tap to name!') {
  errors.push('an un-adopted tamed friend should invite "Tap to name!"');
}
await catCell.click();
await page.waitForSelector('.pet-card', { timeout: 6000 });

// ── Adopt: read a name word to name the cat ───────────────────────────────────
const nameCards = await page.locator('.name-card').count();
console.log(`name choices offered: ${nameCards} (decodable name words at this tier)`);
if (nameCards < 3) errors.push(`expected several readable name choices, got ${nameCards}`);
const chosenName = (await page.locator('.name-card').first().getAttribute('data-name')) ?? '';
await page.locator('.name-card').first().click();
await page.waitForSelector('.word-big', { timeout: 8000 }); // the read-the-name moment
await page.locator('.panel button:has-text("✓")').click();
await page.waitForFunction(() => !!window.__readquest.services.save.petCare?.cat?.nick, null, { timeout: 8000 });
let care = (await petCare()).cat;
console.log(`adopted: nick="${care.nick}" bond=${care.bond} fedOn="${care.fedOn}"`);
if (care.nick !== chosenName) errors.push(`reading "${chosenName}" should name the cat that, got "${care.nick}"`);
if (care.bond !== 0) errors.push(`a freshly named pet starts at 0 bond, got ${care.bond}`);

// ── Feed: read a food word to grow the bond by one heart ──────────────────────
await page.waitForSelector('.pet-card .feed-btn', { timeout: 6000 });
await page.locator('.pet-card .feed-btn').click();
await page.waitForSelector('.word-big', { timeout: 8000 }); // the read-the-food moment
await page.locator('.panel button:has-text("✓")').click();
await page.waitForFunction(() => window.__readquest.services.save.petCare?.cat?.bond === 1, null, { timeout: 8000 });
care = (await petCare()).cat;
console.log(`fed once: bond=${care.bond} fedOn="${care.fedOn}"`);
if (care.bond !== 1) errors.push(`one feed should give one bond heart, got ${care.bond}`);
if (!care.fedOn) errors.push('feeding should stamp the day (daily cooldown)');

// ── Daily cooldown: already fed today → no feed button, a "come back" note ─────
const feedGone = await page.locator('.pet-card .feed-btn').count();
const fedNote = await page.locator('.pet-card .pet-fed').count();
console.log(`after today's feed: feed buttons=${feedGone}, cooldown note=${fedNote}`);
if (feedGone !== 0) errors.push('a pet fed today should not offer another feed until tomorrow');
if (fedNote !== 1) errors.push('a fed pet should show the "come back tomorrow" note');
// The bond must not climb on a second same-day attempt (state unchanged).
if ((await petCare()).cat.bond !== 1) errors.push('the daily cooldown must cap the bond at one heart per day');

// ── Persist: the name + bond survive a reload ─────────────────────────────────
await page.evaluate(() => window.__readquest.services.flush());
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const restored = (await petCare()).cat;
console.log(`after reload: nick="${restored?.nick}" bond=${restored?.bond}`);
if (restored?.nick !== chosenName || restored?.bond !== 1) errors.push('a named, fed pet should persist across sessions');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nNAMED PETS VERIFIED: a tamed friend is adopted by reading a name, fed one heart a day by reading a food word, capped by a daily cooldown, and its name + bond persist — a care loop powered entirely by reading');
