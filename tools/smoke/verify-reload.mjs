// Regression test for the mid-quest-reload soft-locks (audit finding):
// a step that persisted its sub-goal counter before the step advanced must
// self-heal on load via reconcile(). Seeds each stuck state directly, loads,
// and asserts the quest advanced to the next step.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const TAUGHT = ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'];

function stuckSave(overrides) {
  return {
    v: 1, childId: 'reload', avatar: 0, dragonName: 'rex', dragonLevel: 1, dragonXp: 0,
    questStep: 0, wood: 3, stone: 1, eggs: 0, gems: 0,
    signsRead: [], hensFound: [], wallsBuilt: [], coopStage: 0, treasureClaimed: false,
    taught: TAUGHT, evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: true, micStrictness: 'gentle', narrationRate: 1, textScale: 1 },
    ...overrides,
  };
}

// [label, persisted stuck state, expected step after reconcile]
const CASES = [
  ['INTRO_SIGNS: 2 signs read, step not advanced', { questStep: 0, signsRead: ['den', 'shop'] }, 1],
  ['GATHER_BUILD: first wall built, step not advanced', { questStep: 1, wallsBuilt: [0] }, 2],
  ['HUNT: 3rd hen found, step not advanced', { questStep: 5, signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0] }, 6],
  ['BUILD_COOP: coop finished, step not advanced', { questStep: 7, signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3 }, 8],
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const failures = [];

for (const [label, overrides, expected] of CASES) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.addInitScript(() => {
    class U { constructor(t) { this.text = t; this._l = {}; } addEventListener(k, cb) { (this._l[k] ||= []).push(cb); } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 60); } } });
  });
  await page.addInitScript((save) => localStorage.setItem('readquest_save_v1', JSON.stringify(save)), stuckSave(overrides));
  await page.goto(BASE);
  await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
  // Let director.start() → reconcile() → persist settle. Poll the persisted
  // step up to the expected value rather than sleeping a fixed 1500ms, which
  // flaked under full-suite CPU load (boot+reconcile occasionally ran long, so
  // the read caught the pre-reconcile step). Reconcile only advances forward,
  // so this waits exactly as long as needed; a genuinely stuck step times out
  // and is still read + reported as a failure below.
  await page
    .waitForFunction((want) => JSON.parse(localStorage.getItem('readquest_save_v1')).questStep >= want, expected, { timeout: 8000 })
    .catch(() => {});
  const step = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')).questStep);
  const ok = step === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label} → step ${step} (want ${expected})`);
  if (!ok) failures.push(label);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} soft-lock(s) not reconciled`);
  process.exit(1);
}
console.log('\nRELOAD SOFT-LOCKS VERIFIED: every interrupted step self-heals on load');
