// Deep smoke test for the product thesis: the mic magic-word door.
// Seeds a save at the CAVE_DOOR step, walks to the wizard, speaks "ship"
// through a stubbed SpeechRecognition, and asserts the production evidence.
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
  // TTS stub (headless has no voices).
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this._l = {};
    }
    addEventListener(t, cb) {
      (this._l[t] ||= []).push(cb);
    }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {},
      getVoices() {
        return [];
      },
      speak(u) {
        const parts = (u.text || '').split(/\s+/).filter(Boolean);
        setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 40 * parts.length + 60);
      },
    },
  });
  // Mic stub: a child says "ship". Modern Chromium exposes the unprefixed
  // SpeechRecognition too — stub BOTH names so the real engine can't win.
  const FakeRecognition = class {
    start() {
      setTimeout(() => {
        const alternatives = [{ transcript: 'ship' }];
        alternatives.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [alternatives] });
      }, 700);
    }
    stop() {}
    abort() {}
  };
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeRecognition });
  // Seed: quest at CAVE_DOOR, profile complete.
  const save = {
    v: 1,
    childId: 'smoke_door',
    avatar: 0,
    dragonName: 'dash',
    dragonLevel: 1,
    dragonXp: 0,
    questStep: 4,
    wood: 5,
    stone: 0,
    eggs: 0,
    gems: 0,
    signsRead: ['den', 'shop'],
    hensFound: [],
    wallsBuilt: [0],
    coopStage: 0,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [],
    events: [],
    firstSessionAt: Date.now(),
    settings: { micEnabled: true, narrationRate: 1, textScale: 1 },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

await page.goto('http://localhost:4173/');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(2000);
console.log('✓ world loaded from seeded save');

// Place the player near the wizard (walking is covered by verify.mjs),
// then tap him on screen.
await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  s.player.setPosition(2150, 470);
  s.cameras.main.setLerp(1, 1); // snap-follow so screen coords are stable
});
await page.waitForTimeout(600);
const pos = await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  const cam = s.cameras.main;
  return { x: 2255 - cam.scrollX, y: 335 - cam.scrollY };
});
await page.mouse.click(pos.x, pos.y);
console.log('✓ tapped wizard at', JSON.stringify(pos));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/debug-tap.png` });
const dbg = await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  return {
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
    dialogues: document.querySelectorAll('.dialogue').length,
    step: s.services.save.questStep,
  };
});
console.log('debug:', JSON.stringify(dbg));

// Wizard dialogue (premium ElevenLabs clip) → continue.
await page.waitForSelector('.dialogue button:has-text("Keep going")', { timeout: 20000 });
await page.screenshot({ path: `${OUT}/10-wizard.png` });
await page.locator('.dialogue button:has-text("Keep going")').click();

// The magic door.
await page.waitForSelector('.mic-btn', { timeout: 12000 });
await page.screenshot({ path: `${OUT}/11-magic-door.png` });
console.log('✓ magic door shown');
await page.locator('.mic-btn').click();
await page.waitForTimeout(4000);
const micDbg = await page.evaluate(() => ({
  status: document.querySelector('.subtitle')?.textContent,
  micThere: !!document.querySelector('.mic-btn'),
  evidence: JSON.parse(localStorage.getItem('readquest_save_v1')).evidence.filter((e) => e.challengeType === 'magic_word'),
}));
console.log('mic debug:', JSON.stringify(micDbg));
await page.waitForSelector('.dialogue button:has-text("Keep going")', { timeout: 20000 }); // "You did it!" line
await page.screenshot({ path: `${OUT}/12-door-heard.png` });
await page.locator('.dialogue button:has-text("Keep going")').click();
await page.waitForTimeout(2500); // celebration + door animation
await page.screenshot({ path: `${OUT}/13-door-open.png` });

const state = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('readquest_save_v1'));
  const magic = s.evidence.filter((e) => e.challengeType === 'magic_word');
  return { step: s.questStep, magic };
});
console.log('door state:', JSON.stringify(state));
const m = state.magic[0];
if (state.step !== 5) errors.push(`quest step is ${state.step}, expected 5 (HUNT)`);
if (!m || !m.correct || !m.micUsed || m.channel !== 'production' || m.speech?.recognized !== 'ship') {
  errors.push(`bad magic_word evidence: ${JSON.stringify(state.magic)}`);
}

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nMAGIC DOOR VERIFIED: spoken word → matcher → door → production evidence');
