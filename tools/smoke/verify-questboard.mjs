// Smoke test for the Quest Board / Help Wanted (Phase 2.1). In free play the
// mayor offers a short DECODABLE order; reading it (accept) logs sentence_read;
// gathering the asked-for resource fills a HUD tally; returning to the giver
// turns it in for a reward and clears the job. Renews forever, no author.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 15); } },
  });
  const save = {
    v: 1, childId: 'smoke_jobs', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 0, stone: 0, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11',
    job: null, jobsDone: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    // Calm mode: no camera cinematics, so the test drives deterministically.
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const dir = (fn) => page.evaluate(fn);

// ── Offer: tap the mayor → a decodable Help-Wanted order ──────────────────────
await dir(() => window.__readquest.game.scene.keys.world.director.onMayorTapped());
await page.waitForSelector('.job-offer', { timeout: 8000 });
const orderText = await page.evaluate(() => [...document.querySelectorAll('.job-order .job-word')].map((w) => w.textContent).join(' '));
const pipCount = await page.evaluate(() => document.querySelectorAll('.job-goal .job-pip').length);
console.log(`job offered: "${orderText}" — bring ${pipCount}`);
if (!orderText.trim()) errors.push('job offer should show a decodable order');
if (pipCount < 1) errors.push('job offer should show a goal pip row');
await page.screenshot({ path: `${OUT}/90-job-offer.png` });

// Accept — reading the order is the sentence_read signal.
await page.locator('.panel.job-offer button:has-text("Let")').click();
await page.waitForSelector('.job-offer', { state: 'detached', timeout: 8000 });
await page.waitForSelector('.job-chip', { timeout: 6000 });
const afterAccept = await readSave();
const job = afterAccept.job;
console.log(`accepted job: ${JSON.stringify(job)}`);
if (!job) errors.push('accepting a job should store save.job');
const sentenceReads = afterAccept.evidence.filter((e) => e.challengeType === 'sentence_read');
if (sentenceReads.length < 1) errors.push('accepting a job should log a sentence_read');

// ── Do the job: drive the matching resource to the target ─────────────────────
async function gatherOnce(kind) {
  if (kind === 'eggs') {
    await dir(() => window.__readquest.game.scene.keys.world.director.onEggCollected());
    return;
  }
  const method = kind === 'wood' ? 'onTreeTapped' : 'onRockTapped';
  await page.evaluate((m) => window.__readquest.game.scene.keys.world.director[m](() => {}), method);
  await page.waitForSelector('.word-big', { timeout: 8000 });
  await page.locator('.panel button:has-text("✓")').click();
  await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
  await page.waitForTimeout(150);
}

for (let i = 0; i < job.target; i++) await gatherOnce(job.kind);
await page.waitForTimeout(300);
const ready = await readSave();
console.log(`after gathering: job.progress=${ready.job?.progress}/${ready.job?.target}`);
if (!ready.job || ready.job.progress < ready.job.target) errors.push(`job should reach its target, got ${ready.job?.progress}/${ready.job?.target}`);
const chipReady = await page.evaluate(() => document.querySelector('.job-chip')?.classList.contains('ready'));
if (!chipReady) errors.push('the job chip should switch to a "turn in" ready state at target');
await page.screenshot({ path: `${OUT}/91-job-ready.png` });

// ── Turn in: tap the mayor again → reward + job cleared + jobsDone++ ───────────
const gemsBefore = ready.gems;
await dir(() => window.__readquest.game.scene.keys.world.director.onMayorTapped());
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).job === null, null, { timeout: 8000 });
await page.waitForTimeout(300);
const done = await readSave();
console.log(`turned in: job=${done.job}, jobsDone=${done.jobsDone}, gems ${gemsBefore}→${done.gems}`);
if (done.job !== null) errors.push('turning in should clear save.job');
if (done.jobsDone !== 1) errors.push(`jobsDone should be 1, got ${done.jobsDone}`);
if (done.gems <= gemsBefore) errors.push(`turning in should pay gems, got ${gemsBefore}→${done.gems}`);
const chipGone = await page
  .waitForFunction(() => { const c = document.querySelector('.job-chip'); return !c || c.style.display === 'none'; }, null, { timeout: 6000 })
  .then(() => true)
  .catch(() => false);
if (!chipGone) errors.push('the job chip should hide after turn-in');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nQUEST BOARD VERIFIED: the mayor offers a decodable order → read to accept (sentence_read) → gather fills the tally → turn in for a reward; the job clears and jobsDone advances');
