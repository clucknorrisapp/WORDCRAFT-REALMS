// Smoke test for the Library: open the 📚 shelf → open a book → read every
// page → finish → the reward is paid ONCE (re-reads are free), and finishing
// logs a `sentence_read` reading interaction. Guards the whole reading-reward
// loop that makes "reading IS the mechanic" literally true.
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
    constructor(t) { this.text = t; this._l = {}; }
    addEventListener(t, cb) { (this._l[t] ||= []).push(cb); }
  }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel() {}, resume() {}, getVoices() { return []; },
      speak(u) { setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 60); },
    },
  });
  const save = {
    v: 1, childId: 'smoke_lib', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
    signsRead: ['den', 'shop'], hensFound: ['shed', 'rock', 'log'], wallsBuilt: [0], coopStage: 3, treasureClaimed: true,
    booksRead: [],
    taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th'],
    evidence: [], events: [], firstSessionAt: Date.now(),
    settings: { micEnabled: true, micStrictness: 'gentle', narrationRate: 1, textScale: 1 },
  };
  localStorage.setItem('readquest_save_v1', JSON.stringify(save));
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);

// Read a book cover-to-cover, clicking through every page.
async function readFirstBook(tag) {
  await page.locator('.hud-left button:has-text("📚")').click();
  await page.waitForSelector('.shelf', { timeout: 8000 });
  const firstTitle = await page.locator('.book-spine-title').first().innerText();
  await page.screenshot({ path: `${OUT}/40-shelf-${tag}.png` });
  await page.locator('.book-spine').first().click();
  await page.waitForSelector('.book-cover', { timeout: 8000 });
  await page.locator('.panel.book button:has-text("Read it")').click();

  // Turn pages until "The End".
  for (let guard = 0; guard < 20; guard++) {
    await page.waitForSelector('.book-page', { timeout: 8000 });
    const end = page.locator('.panel.book button:has-text("The End")');
    if (await end.count()) {
      if (tag === 'first') await page.screenshot({ path: `${OUT}/41-last-page.png` });
      await end.click();
      break;
    }
    await page.locator('.panel.book button:has-text("Next")').click();
    await page.waitForTimeout(150);
  }
  // Finish celebration + reward settle, then close the shelf if still open.
  await page.waitForTimeout(1400);
  const close = page.locator('.panel.library button:has-text("Close")');
  if (await close.count()) await close.click();
  await page.waitForTimeout(300);
  return firstTitle;
}

const title = await readFirstBook('first');
const after1 = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
const reads1 = after1.evidence.filter((e) => e.challengeType === 'sentence_read');
console.log(`after first read "${title}": booksRead=${JSON.stringify(after1.booksRead)}, eggs=${after1.eggs}, gems=${after1.gems}, sentence_read rows=${reads1.length}`);

if (after1.booksRead.length !== 1) errors.push(`expected 1 book read, got ${JSON.stringify(after1.booksRead)}`);
// pig-in-mud pays an egg; hen pays a gem — first spine is pig-in-mud.
if (after1.eggs !== 1) errors.push(`expected reward egg paid (eggs=1), got eggs=${after1.eggs}`);
if (reads1.length !== 1) errors.push(`expected exactly 1 sentence_read row, got ${reads1.length}`);

// Re-read the same book: reward must NOT be paid twice.
await readFirstBook('again');
const after2 = await page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));
console.log(`after re-read: booksRead=${JSON.stringify(after2.booksRead)}, eggs=${after2.eggs}`);
if (after2.eggs !== 1) errors.push(`re-read double-paid the reward (eggs=${after2.eggs}, expected 1)`);
if (after2.booksRead.length !== 1) errors.push(`re-read duplicated booksRead: ${JSON.stringify(after2.booksRead)}`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nLIBRARY VERIFIED: read a book → reward paid once → reading logged as sentence_read; re-reads are free');
