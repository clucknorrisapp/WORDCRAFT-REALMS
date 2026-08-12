// Renewing build loop (backlog #11) — blueprints must SCALE with the reader.
// The three base plans are always buildable, but each higher-tier plan stays
// hidden until its sound is mastered, then fades in as that tier's reward. This
// verifies both halves of the gate: with every base plan built but no blends
// taught, the table offers nothing new (the loop hasn't run dry — it's waiting
// on reading); the instant the blend tier is mastered, a fresh "nest" plan
// appears to accept by reading. Reading, not grinding, is what renews the loop.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const BASE = process.env.BASE_URL || 'http://localhost:4173';
const errors = [];

const BASE_TAUGHT = ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'];
const BLENDS = ['blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end'];

function seed(taught) {
  return {
    v: 1, childId: 'smoke_bpscale', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 3, eggs: 0, gems: 1,
    signsRead: ['den'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null,
    // Every base plan already built — so the NEXT plan is a higher-tier one.
    blueprintsDone: ['den', 'pen', 'hut'],
    tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [], petCare: {},
    taught,
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
}

/** Tap the plans table and return the offered plan name, or null if none. */
async function offeredPlan(taught) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  });
  await page.addInitScript((s) => localStorage.setItem('readquest_save_v1', JSON.stringify(s)), seed(taught));
  await page.goto(BASE);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onBlueprintTableTapped());
  // A plan offer opens a word-card; "nothing new" opens none. Give both a beat.
  const card = await page.waitForSelector('.word-big', { timeout: 3500 }).catch(() => null);
  const name = card ? await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase()) : null;
  const blueprintSet = await page.evaluate(() => window.__readquest.services.save.blueprint?.id ?? null);
  await page.close();
  return { name, blueprintSet };
}

// ── Gate HIDES: base plans done, blends NOT taught → nothing new to build ──────
const hidden = await offeredPlan(BASE_TAUGHT);
console.log(`no blends taught → offered plan: ${hidden.name ?? '(none)'} , blueprint set: ${hidden.blueprintSet ?? '(none)'}`);
if (hidden.name !== null) errors.push(`a plan whose tier isn't mastered must stay hidden, but "${hidden.name}" was offered`);
if (hidden.blueprintSet !== null) errors.push('no blueprint should be accepted when nothing is readable');

// ── Gate REVEALS: master the blend tier → the "nest" plan fades in ─────────────
const revealed = await offeredPlan([...BASE_TAUGHT, ...BLENDS]);
console.log(`blends taught → offered plan: ${revealed.name ?? '(none)'}`);
if (revealed.name !== 'nest') errors.push(`mastering blends should unlock the "nest" plan, got "${revealed.name ?? '(none)'}"`);

// ── Full higher-tier build: accept "nest", fill it (reading the 'nest' block to
//    unlock it — a path the starter-block base plans never exercise), complete ──
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  });
  await page.addInitScript((s) => localStorage.setItem('readquest_save_v1', JSON.stringify(s)), seed([...BASE_TAUGHT, ...BLENDS]));
  await page.goto(BASE);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(800);
  const readSave = () => page.evaluate(() => window.__readquest.services.save);
  const tapCell = (i) => page.evaluate((idx) => window.__readquest.game.scene.keys.world.director.onBlueprintCellTapped(idx), i);

  // Accept the nest plan by reading its name.
  await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onBlueprintTableTapped());
  await page.waitForSelector('.word-big', { timeout: 8000 });
  await page.locator('.panel button:has-text("✓")').click();
  await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
  const accepted = await readSave();
  const cells = accepted.blueprint?.filled.length ?? 0;
  if (accepted.blueprint?.id !== 'nest' || cells !== 4) errors.push(`accepting nest should set a 4-cell plan, got ${JSON.stringify(accepted.blueprint)}`);
  const gems0 = accepted.gems;

  // Fill each cell. The first tap must read the 'nest' block word to unlock it.
  for (let i = 0; i < cells; i++) {
    await tapCell(i);
    const card = await page.waitForSelector('.word-big', { timeout: 2500 }).catch(() => null);
    if (card) {
      if (i === 0) {
        const w = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
        if (w !== 'nest') errors.push(`the nest block should be earned by reading "nest", got "${w}"`);
      }
      await page.locator('.panel button:has-text("✓")').click();
      await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
    }
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  const done = await readSave();
  const babies = await page.evaluate(() => window.__readquest.game.scene.keys.world.petCount());
  console.log(`nest built: done=${JSON.stringify(done.blueprintsDone)}, gems ${gems0}→${done.gems}, pets=${JSON.stringify(done.pets)}, blockUnlocked=${done.blocksUnlocked.includes('nest')}, babies=${babies}`);
  if (!done.blueprintsDone.includes('nest')) errors.push('completing the nest should record it in blueprintsDone');
  if (done.gems <= gems0) errors.push(`the nest plan should pay gems, got ${gems0}→${done.gems}`);
  if (!done.blocksUnlocked.includes('nest')) errors.push('building the nest should unlock the nest block by reading it');
  if (!done.pets.includes('chick')) errors.push('the nest should hatch a chick');
  if (babies < 1) errors.push('the nest should spawn a baby in the world');
  await page.close();
}

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nBLUEPRINT SCALING VERIFIED: higher-tier plans stay hidden until their sound is mastered, then a fresh plan appears to build — the build loop renews with the child\'s reading instead of capping at three');
