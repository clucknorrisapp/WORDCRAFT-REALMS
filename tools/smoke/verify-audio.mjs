// Audio-integrity test — the check the bot fleet structurally could not do,
// because it forces autoplay ON. Here autoplay is BLOCKED (iOS Safari's
// condition): every reading moment must still produce audible output, either
// a clip that plays or a speech-synthesis fallback. A silent moment fails.
//
//   pnpm build && pnpm preview &   # then:
//   node tools/smoke/verify-audio.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  // The whole point: emulate a browser that blocks audio outside a gesture.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=document-user-activation-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const events = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
await page.exposeFunction('__aud', (m) => events.push(m));

await page.addInitScript(() => {
  // Web Audio is the primary clip path now — count buffer-source starts as
  // audible clip playback.
  const BSN = window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype;
  if (BSN && BSN.start) {
    const origStart = BSN.start;
    BSN.start = function (...args) {
      // A 1-sample silent buffer is the unlock tick — ignore it.
      if (!this.buffer || this.buffer.length > 100) window.__aud('webaudio_ok');
      return origStart.apply(this, args);
    };
  }
  // Wrap HTMLAudio to record play attempts and outcomes (fallback path).
  const O = window.Audio;
  window.Audio = function (src) {
    const a = new O(src);
    const play = a.play.bind(a);
    a.play = () => {
      const r = play();
      const name = (src || '').split('/').pop();
      if (r && r.then) r.then(() => window.__aud('clip_ok:' + name)).catch(() => window.__aud('clip_blocked:' + name));
      return r;
    };
    return a;
  };
  // Stub speechSynthesis so we can COUNT fallbacks and it never truly speaks.
  class U {
    constructor(t) {
      this.text = t;
      this._l = {};
    }
    addEventListener(k, cb) {
      (this._l[k] ||= []).push(cb);
    }
  }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {},
      resume() {},
      getVoices() {
        return [];
      },
      speak(u) {
        if (u.text) window.__aud('synth:' + u.text.slice(0, 20));
        setTimeout(() => (u._l.end || []).forEach((c) => c({})), 80);
      },
    },
  });
});

const heardSince = (mark) => events.slice(mark).filter((e) => e === 'webaudio_ok' || e.startsWith('clip_ok:') || e.startsWith('synth:'));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Pick your hero!', { timeout: 20000 });

const checks = [];
const gate = async (label, fn) => {
  const mark = events.length;
  await fn();
  await page.waitForTimeout(1500);
  const heard = heardSince(mark);
  checks.push({ label, heard: heard.length, sample: heard[0] ?? '(silent)' });
};

// 1. Welcome narration — plays right after the Go gesture.
await gate('welcome narration', async () => {
  await page.locator('.avatar-grid img').nth(0).click();
  await page.locator('button:has-text("Go!")').click();
});
// 2. Dragon-name prompt + a name card pronunciation.
await gate('dragon prompt + name', async () => {
  await page.locator('.dialogue button:has-text("▶")').click().catch(() => {});
  await page.locator('.dialogue button:has-text("▶")').click().catch(() => {});
  await page.waitForSelector('text=Name your dragon!', { timeout: 8000 }).catch(() => {});
  await page.locator('.word-card:has-text("CHIP")').click().catch(() => {});
});
// 3. Into the world, then a sign read (audio well after the initial gesture).
await gate('enter world', async () => {
  await page.locator('button:has-text("Keep this name!")').click().catch(() => {});
  await page.locator('.dialogue button:has-text("▶")').click().catch(() => {});
  await page.waitForSelector('canvas', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);
});
await gate('sign read (post-gesture)', async () => {
  // Cancel any in-flight reveal cinematic first (a moving camera would skew
  // the sign's screen coords), then freeze player + camera before clicking.
  await page.mouse.click(512, 700);
  await page.evaluate(() => {
    const s = window.__readquest.game.scene.keys.world;
    s.cameras.main.setLerp(1, 1);
    s.player.setPosition(360, 760);
    s.player.body.setVelocity(0, 0);
    s.moveTarget = null;
    s.pending = null;
  });
  await page.waitForTimeout(500);
  const pos = await page.evaluate(() => {
    const cam = window.__readquest.game.scene.keys.world.cameras.main;
    return { x: 270 - cam.scrollX, y: 770 - cam.scrollY };
  });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForSelector('.word-big', { timeout: 10000 }).catch(() => {});
});

await browser.close();

console.log('Audio integrity (autoplay BLOCKED):');
let silent = 0;
for (const c of checks) {
  const ok = c.heard > 0;
  if (!ok) silent += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${c.label}: ${c.heard} audible (${c.sample})`);
}
const webaudio = events.filter((e) => e === 'webaudio_ok').length;
const clipOk = events.filter((e) => e.startsWith('clip_ok:')).length;
const blocked = events.filter((e) => e.startsWith('clip_blocked:')).length;
const synth = events.filter((e) => e.startsWith('synth:')).length;
console.log(`\n  webaudio clips: ${webaudio} · htmlaudio clips: ${clipOk} · blocked→fallback: ${blocked} · synth: ${synth}`);

if (errors.length) {
  console.error('\nPAGE ERRORS:');
  errors.forEach((e) => console.error('  - ' + e));
}
if (silent > 0 || errors.length) {
  console.error(`\nFAILED: ${silent} silent reading moment(s), ${errors.length} page error(s)`);
  process.exit(1);
}
console.log('\nAUDIO VERIFIED: every reading moment is audible even with autoplay blocked');
