// Iron-rule regression: the dragon's stage-2 dressing colour must be decodable
// at the child's CURRENT tier. Phase 4.3 hardcoded 'green' (needs blend_r +
// vowel_team) triggered purely by feed count — a child who fed the dragon before
// those tiers would be shown an undecodable word, breaking the game's cardinal
// rule. The fix picks the themed colour only when it's decodable, else falls back
// to always-decodable red/tan. This test feeds a dragon at a LOW tier to stage 2
// and asserts the colour it's dressed in is one it can actually read.
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
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } },
  });
  // One feed from stage 2 (xp 18), but taught ONLY through digraphs — no blends,
  // no vowel_team — so 'green' (gr + ee) is NOT decodable for this child.
  const save = {
    v: 1, childId: 'smoke_iron', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 17,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const save = () => page.evaluate(() => window.__readquest.services.save);

// Feed the dragon once (17 → 18) to trigger the stage-2 dressing.
await page.evaluate(() => window.__readquest.game.scene.keys.world.director.onDragonTapped());
await page.waitForSelector('.word-card', { timeout: 8000 });
const target = await page.evaluate(() => {
  const evs = window.__readquest.services.analytics.all();
  return [...evs].reverse().find((e) => e.type === 'adaptive_target')?.payload?.word;
});
await page.evaluate((t) => {
  for (const c of document.querySelectorAll('.word-card')) {
    if ((c.textContent || '').trim().toLowerCase() === t) { c.click(); return; }
  }
}, target);

// The dressing colour card appears — it must NOT be the undecodable 'green'.
await page.waitForSelector('.word-big', { timeout: 8000 });
const colour = await page.evaluate(() => [...document.querySelectorAll('.word-big .g')].map((s) => s.textContent).join('').toLowerCase());
console.log(`low-tier dragon dressed in: "${colour}" (taught only through digraphs)`);
if (colour === 'green') errors.push('IRON RULE VIOLATION: stage-2 dressing showed undecodable "green" to a pre-blend reader');
if (!['red', 'tan'].includes(colour)) errors.push(`expected an always-decodable fallback colour (red/tan), got "${colour}"`);

await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.dragonColor !== null, null, { timeout: 8000 });
const s = await save();
console.log(`saved dragonColor: "${s.dragonColor}", dragonXp=${s.dragonXp}`);
if (s.dragonColor === 'green') errors.push('persisted dragonColor should never be the undecodable "green" for this reader');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nIRON RULE (dragon colour) VERIFIED: a dragon grown before the blend/vowel-team tiers is dressed in a colour the child can actually read — never the ungated "green"');
