// Smoke test for the cave + treasure chest sequence (the CHEST step):
// open cave mouth is tappable → teleport inside → chest → spoken "chest"
// → gem + dragon level-up + free play. Guards the soft-lock where the
// hidden door sprite left the cave unenterable.
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
  class U {
    constructor(t) {
      this.text = t;
      this._l = {};
    }
    addEventListener(t, cb) {
      (this._l[t] ||= []).push(cb);
    }
  }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {},
      getVoices() {
        return [];
      },
      speak(u) {
        setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 120);
      },
    },
  });
  const FakeRecognition = class {
    start() {
      setTimeout(() => {
        const alternatives = [{ transcript: 'chest' }];
        alternatives.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [alternatives] });
      }, 600);
    }
    stop() {}
    abort() {}
  };
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeRecognition });
  const save = {
    v: 1,
    childId: 'smoke_chest',
    avatar: 0,
    dragonName: 'rex',
    dragonLevel: 1,
    dragonXp: 0,
    questStep: 8,
    wood: 6,
    stone: 4,
    eggs: 0,
    gems: 0,
    signsRead: ['den', 'shop'],
    hensFound: ['shed', 'rock', 'log'],
    wallsBuilt: [0],
    coopStage: 3,
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [],
    events: [],
    firstSessionAt: Date.now(),
    settings: { micEnabled: true, micStrictness: 'gentle', narrationRate: 1, textScale: 1 },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

await page.goto('http://localhost:4173/');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1500);

// Stand outside the open cave mouth, then tap it.
await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  s.cameras.main.setLerp(1, 1);
  s.player.setPosition(2270, 430);
  s.moveTarget = null;
  s.pending = null;
});
await page.waitForTimeout(500);
const mouth = await page.evaluate(() => {
  const cam = window.__readquest.game.scene.keys.world.cameras.main;
  return { x: 2380 - cam.scrollX, y: 305 - cam.scrollY };
});
await page.mouse.click(mouth.x, mouth.y);
// Poll for the teleport rather than sleeping a fixed 2200ms: the tap walks the
// player into range, then the mouth fires enterCave → a fade teleport into the
// cave room (y≈1450). Under full-suite CPU load that whole chain occasionally
// runs past a fixed wait, so wait for the outcome (bounded) instead.
await page
  .waitForFunction(() => window.__readquest.game.scene.keys.world.player.y > 1200, null, { timeout: 9000 })
  .catch(() => {});
const inCave = await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  return Math.round(s.player.y);
});
console.log('player y after mouth tap:', inCave);
if (inCave < 1200) errors.push(`cave entrance did not teleport (player y=${inCave})`);
await page.screenshot({ path: `${OUT}/20-in-cave.png` });

// Tap the chest, click through the wizard's prompt, speak the word.
const chestPos = await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  s.cameras.main.setLerp(1, 1);
  s.player.body.setVelocity(0, 0);
  const cam = s.cameras.main;
  return { x: 760 - cam.scrollX, y: 1430 - cam.scrollY };
});
await page.mouse.click(chestPos.x, chestPos.y);
await page.waitForSelector('.dialogue button:has-text("Keep going")', { timeout: 20000 });
await page.locator('.dialogue button:has-text("Keep going")').click();
await page.waitForSelector('.mic-btn', { timeout: 12000 });
await page.locator('.mic-btn').click();
await page.waitForSelector('.dialogue button:has-text("Keep going")', { timeout: 20000 }); // chest open line
await page.screenshot({ path: `${OUT}/21-chest-open.png` });
await page.locator('.dialogue button:has-text("Keep going")').click();
await page.waitForSelector('.dialogue button:has-text("Keep going")', { timeout: 20000 }); // free play line
await page.locator('.dialogue button:has-text("Keep going")').click();
await page.waitForTimeout(1000);

const state = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('readquest_save_v1'));
  const magic = s.evidence.filter((e) => e.challengeType === 'magic_word');
  return { step: s.questStep, gems: s.gems, dragonLevel: s.dragonLevel, magic: magic.length };
});
console.log('final:', JSON.stringify(state));
if (state.step !== 9 || state.gems !== 1 || state.dragonLevel !== 2 || state.magic < 1) {
  errors.push(`bad final state: ${JSON.stringify(state)}`);
}

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nCHEST SEQUENCE VERIFIED: cave enterable → spoken CHEST → gem + level-up + free play');
