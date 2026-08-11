// Regression test for the "it keeps bringing me back here" cave loop: leaving
// the cave used to drop the player at (2320,430) — only ~139px from the cave
// entrance (2380,305, tap-radius 190), i.e. INSIDE its trigger zone — so the
// next tap to walk away re-entered the cave. The exit must now land well clear
// of the entrance so you can actually leave.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 30); } },
  });
  const save = {
    v: 1, childId: 'smoke_cave', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 1,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [], blocksUnlocked: [], build: {},
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, dyslexiaFont: false, highContrast: false, reducedMotion: false },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);

// Enter the cave: stand by the open mouth and tap it.
await page.evaluate(() => {
  const s = window.__readquest.game.scene.keys.world;
  s.cameras.main.setLerp(1, 1);
  s.player.setPosition(2270, 430);
  s.moveTarget = null; s.pending = null;
});
await page.waitForTimeout(400);
const mouth = await page.evaluate(() => {
  const cam = window.__readquest.game.scene.keys.world.cameras.main;
  return { x: 2380 - cam.scrollX, y: 305 - cam.scrollY };
});
await page.mouse.click(mouth.x, mouth.y);
await page.waitForTimeout(2200);
const inCaveY = await page.evaluate(() => Math.round(window.__readquest.game.scene.keys.world.player.y));
console.log(`player y in cave: ${inCaveY} (want > 1200)`);
if (inCaveY < 1200) errors.push(`did not enter cave (player y=${inCaveY})`);

// Tap the ⬆ exit (world 330,1470). A single programmatic mouse click can land
// on a frame where Phaser's hit-test misses the small target (a harness timing
// race — a real finger-tap always lands), so retry until the teleport fires.
const exitScreen = () =>
  page.evaluate(() => {
    const s = window.__readquest.game.scene.keys.world;
    s.cameras.main.setLerp(1, 1);
    const cam = s.cameras.main;
    return { x: 330 - cam.scrollX, y: 1470 - cam.scrollY };
  });
const stillInCave = () => page.evaluate(() => window.__readquest.game.scene.keys.world.player.y > 1160);
for (let i = 0; i < 5 && (await stillInCave()); i++) {
  const pos = await exitScreen();
  await page.waitForTimeout(120); // let the frame settle so the tap registers
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(900); // fade teleport
}

const after = await page.evaluate(() => {
  const p = window.__readquest.game.scene.keys.world.player;
  const dx = p.x - 2380, dy = p.y - 305;
  return { x: Math.round(p.x), y: Math.round(p.y), distToEntrance: Math.round(Math.hypot(dx, dy)) };
});
console.log(`player after exit: (${after.x},${after.y}), ${after.distToEntrance}px from the cave entrance`);
if (after.y > 1160) errors.push(`exit did not leave the cave (player y=${after.y})`);
// The whole bug: landing inside the entrance's 190px tap-radius. Must be clear.
if (after.distToEntrance <= 200) errors.push(`exit drops the player back on the entrance (${after.distToEntrance}px ≤ 200 — would re-loop)`);
await page.screenshot({ path: `${OUT}/83-cave-exit.png` });

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nCAVE EXIT VERIFIED: leaving the cave drops you out on the path, clear of the entrance — no re-entry loop');
