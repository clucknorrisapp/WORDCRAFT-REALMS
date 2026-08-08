// End-to-end smoke test: character select → dragon naming → world → sign read.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.SHOT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

// Headless Chromium has no TTS voices — stub speechSynthesis so audio "plays"
// fast and fires word boundaries + end, exactly like a real browser would.
await page.addInitScript(() => {
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this._l = {};
      this.rate = 1;
      this.pitch = 1;
      this.voice = null;
    }
    addEventListener(t, cb) {
      (this._l[t] ||= []).push(cb);
    }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  // speechSynthesis is a readonly accessor on Window — must defineProperty.
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {},
      getVoices() {
        return [];
      },
      speak(u) {
        const parts = (u.text || '').split(/\s+/).filter(Boolean);
        let off = 0;
        parts.forEach((w, i) => {
          const charIndex = off;
          off += w.length + 1;
          setTimeout(() => (u._l.boundary || []).forEach((cb) => cb({ charIndex, name: 'word' })), 50 * i);
        });
        setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 50 * parts.length + 100);
      },
    },
  });
});

const step = async (name, fn) => {
  await fn();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}`);
};

await step('01-select', async () => {
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('text=Pick your hero!', { timeout: 15000 });
});

await step('02-welcome', async () => {
  await page.locator('.avatar-grid img').nth(1).click();
  await page.locator('button:has-text("Go!")').click();
  await page.waitForSelector('.dialogue .words', { timeout: 10000 });
  await page.waitForTimeout(600); // let highlight run for the screenshot
});

await step('03-name-dragon', async () => {
  await page.locator('.dialogue button:has-text("▶")').click(); // welcome
  await page.locator('.dialogue button:has-text("▶")').click(); // "pick your dragon" prompt
  await page.waitForSelector('text=Name your dragon!', { timeout: 10000 });
  await page.locator('.word-card:has-text("CHIP")').click();
  await page.waitForTimeout(300);
});

await step('04-village', async () => {
  await page.locator('button:has-text("Keep this name!")').click();
  await page.waitForSelector('.dialogue button:has-text("▶")', { timeout: 10000 });
  await page.locator('.dialogue button:has-text("▶")').click();
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(2500); // camera settle + toast
});

const saveState = await page.evaluate(() => {
  const raw = localStorage.getItem('readquest_save_v1');
  const s = raw ? JSON.parse(raw) : null;
  return s && { avatar: s.avatar, dragonName: s.dragonName, evidence: s.evidence.length, step: s.questStep };
});
console.log('save state:', JSON.stringify(saveState));
if (!saveState || saveState.dragonName !== 'chip' || saveState.evidence < 1) {
  errors.push(`bad save state: ${JSON.stringify(saveState)}`);
}

await step('05-sign-read', async () => {
  // Click the DEN sign (world 270,770) via the camera transform.
  const pos = await page.evaluate(() => {
    const s = window.__readquest.game.scene.keys.world;
    const cam = s.cameras.main;
    return { x: 270 - cam.scrollX, y: 770 - cam.scrollY };
  });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForSelector('.word-big', { timeout: 12000 }); // player walks over first
  await page.waitForTimeout(400);
});

await step('06-after-sign', async () => {
  await page.locator('button:has-text("✓")').click();
  await page.waitForTimeout(1800); // celebration + confetti
});

const finalState = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('readquest_save_v1'));
  return { evidence: s.evidence.length, signsRead: s.signsRead };
});
console.log('final state:', JSON.stringify(finalState));
if (finalState.evidence < 2 || !finalState.signsRead.includes('den')) {
  errors.push(`sign read not recorded: ${JSON.stringify(finalState)}`);
}

await browser.close();

const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('\nERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
