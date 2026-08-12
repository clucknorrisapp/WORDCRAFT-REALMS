// Save durability (backlog #6b) — a child who plays every day must never lose
// progress to an ever-growing save. The evidence log is the one unbounded array
// (one row per reading rep), so it's capped to a rolling window for replay,
// while a separate lifetime counter (readCount) keeps "words read" and the
// reading deeds accurate forever. This verifies: an oversized save is trimmed
// on load, the lifetime count is preserved (not the capped array length), new
// reps still advance the lifetime count, and it all persists across a reload.
import { chromium } from 'playwright-core';

const MAX_EVIDENCE = 1200; // keep in sync with save.ts
const SEEDED = 1600; // more countable reps than the cap, to force a trim

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript((seeded) => {
  class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  // A veteran save: thousands of reading reps logged over months of daily play,
  // and NO readCount field yet (an old save from before the counter existed).
  const evidence = [];
  for (let i = 0; i < seeded; i++) {
    evidence.push({ eventId: `e${i}`, childId: 'smoke_cap', at: 1700000000000 + i, challengeType: 'sign_read', skillIds: ['base'], wordId: 'cat', channel: 'recognition', correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: false, responseMs: 900 });
  }
  const save = {
    v: 1, childId: 'smoke_cap', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: [], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {},
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart'],
    evidence,
    events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  // Seed only on first load — the reload must keep what the game persisted
  // (this init script re-runs on every navigation, so guard against re-seeding).
  if (!localStorage.getItem('readquest_save_v1')) localStorage.setItem('readquest_save_v1', JSON.stringify(save));
}, SEEDED);

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const stat = () => page.evaluate(() => ({
  evLen: window.__readquest.services.save.evidence.length,
  readCount: window.__readquest.services.save.readCount,
  interactions: window.__readquest.services.readingInteractions(),
}));

// ── On load: the array is trimmed, but the lifetime count is preserved ────────
const loaded = await stat();
console.log(`loaded: evidence=${loaded.evLen} (cap ${MAX_EVIDENCE}), readCount=${loaded.readCount}, interactions=${loaded.interactions}`);
if (loaded.evLen > MAX_EVIDENCE) errors.push(`the evidence array must be capped at ${MAX_EVIDENCE}, got ${loaded.evLen}`);
if (loaded.readCount !== SEEDED) errors.push(`readCount should backfill to the full lifetime ${SEEDED}, got ${loaded.readCount}`);
if (loaded.interactions !== SEEDED) errors.push(`readingInteractions() must report the lifetime ${SEEDED} (not the capped array), got ${loaded.interactions}`);
// The reading deeds key off readingInteractions — the "read 100" deed must hold.
if (loaded.interactions < 100) errors.push('a veteran reader must still satisfy the read-100 deed after the cap');

// ── A new reading rep advances the lifetime count; the array stays bounded ────
await page.evaluate(() => window.__readquest.services.recordEvidence({ challengeType: 'sign_read', skillIds: ['base'], wordId: 'cat', channel: 'recognition', correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: false, responseMs: 800 }));
await page.waitForTimeout(400); // let the debounced persist run — that's where the array is trimmed
const after = await stat();
console.log(`after +1 rep: evidence=${after.evLen}, readCount=${after.readCount}, interactions=${after.interactions}`);
if (after.readCount !== SEEDED + 1) errors.push(`a new countable rep should bump readCount to ${SEEDED + 1}, got ${after.readCount}`);
if (after.evLen > MAX_EVIDENCE) errors.push(`the evidence array must stay capped after new reps, got ${after.evLen}`);

// ── Persist + reload: the trimmed save + lifetime count survive ───────────────
await page.evaluate(() => window.__readquest.services.flush());
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const reloaded = await stat();
console.log(`after reload: evidence=${reloaded.evLen}, readCount=${reloaded.readCount}, interactions=${reloaded.interactions}`);
if (reloaded.readCount !== SEEDED + 1) errors.push(`readCount must persist across reload, got ${reloaded.readCount}`);
if (reloaded.evLen > MAX_EVIDENCE) errors.push(`evidence must stay capped across reload, got ${reloaded.evLen}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log(`\nSAVE DURABILITY VERIFIED: the evidence log is bounded to a rolling ${MAX_EVIDENCE}, while a lifetime readCount keeps "words read" and reading deeds accurate forever — a daily player's save can't grow without limit or lose their milestones`);
