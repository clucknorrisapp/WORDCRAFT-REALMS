// Smoke test for Crafting: a craft block becomes craftable once BOTH its
// ingredient blocks are unlocked, and reading its recipe PHRASE (e.g. "red
// rock") forges it. This is the step from reading single words (unlocking a
// plain block) up to reading connected text — logged as `sentence_read`, the
// same strong reading signal a Library page gives. The freshly crafted block
// is then placeable like any other.
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
    value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 40); } },
  });
  const save = {
    v: 1, childId: 'smoke_craft', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
    questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 0,
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

const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('readquest_save_v1')));

// Open Build Mode.
await page.locator('.hud-left button:has-text("🔨")').click();
await page.waitForSelector('.build-grid', { timeout: 8000 });

// The craft divider is shown, and with only starter blocks (rock, mud, bush,
// log) two recipes are already craftable: brick (rock+mud) and tree (bush+log).
// The other two (magma, glass) need sun/sand and stay locked as a hint.
await page.waitForSelector('.build-craft-div', { timeout: 8000 });
const craftableBefore = await page.locator('.build-tool.craftable').count();
console.log(`craftable-from-starters tools: ${craftableBefore} (expect 2: brick, tree)`);
if (craftableBefore < 2) errors.push(`expected >= 2 craftable blocks from starters, got ${craftableBefore}`);
await page.screenshot({ path: `${OUT}/74-craft-palette.png` });

// Craft the first craftable block by reading its recipe phrase.
await page.locator('.build-tool.craftable').first().click();
await page.waitForSelector('.craft-read', { timeout: 8000 }); // the phrase reading moment
const phraseWords = await page.locator('.craft-word').count();
const phrase = (await page.locator('.craft-read').innerText()).replace(/\s+/g, ' ').trim();
console.log(`recipe reading moment shows ${phraseWords} word-cards: "${phrase}"`);
if (phraseWords < 2) errors.push(`recipe should be a phrase of >= 2 words, got ${phraseWords} cards`);
await page.screenshot({ path: `${OUT}/75-craft-read.png` });

// Tap a word to hear it (audio path must not throw), then confirm.
await page.locator('.craft-word').first().click();
await page.locator('button:has-text("Craft it")').click();
await page.waitForSelector('.craft-read', { state: 'detached', timeout: 8000 });

// A block was crafted (added to blocksUnlocked) and the read logged sentence_read.
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).blocksUnlocked.length === 1, undefined, { timeout: 8000 });
const afterCraft = await readSave();
const craftedId = afterCraft.blocksUnlocked[0];
console.log(`crafted block: ${JSON.stringify(afterCraft.blocksUnlocked)}`);
if (afterCraft.blocksUnlocked.length !== 1) errors.push(`expected 1 crafted block, got ${JSON.stringify(afterCraft.blocksUnlocked)}`);
if (!['brick', 'tree'].includes(craftedId)) errors.push(`unexpected crafted block id "${craftedId}"`);

const sentenceRows = afterCraft.evidence.filter((e) => e.challengeType === 'sentence_read');
console.log(`sentence_read rows after crafting: ${sentenceRows.length}`);
if (sentenceRows.length !== 1) errors.push(`crafting should log exactly 1 sentence_read, got ${sentenceRows.length}`);
if (sentenceRows[0] && (!sentenceRows[0].skillIds || sentenceRows[0].skillIds.length === 0)) {
  errors.push('sentence_read evidence carried no phonics skills');
}

// The crafted block became a normal (non-craftable) tool → one fewer craftable.
const craftableAfter = await page.locator('.build-tool.craftable').count();
console.log(`craftable tools after crafting one: ${craftableAfter} (was ${craftableBefore})`);
if (craftableAfter !== craftableBefore - 1) errors.push(`craftable count should drop by 1, got ${craftableBefore} → ${craftableAfter}`);

// The freshly crafted block is auto-selected — place it in the world.
await page.locator('.build-cell').nth(20).click();
await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('readquest_save_v1')).build).length >= 1, undefined, { timeout: 8000 });
const build = (await readSave()).build;
const placedCrafted = Object.values(build).includes(craftedId);
console.log(`after placing crafted block: ${JSON.stringify(build)}`);
if (!placedCrafted) errors.push(`crafted block "${craftedId}" could not be placed on the grid`);

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nCRAFTING VERIFIED: two blocks + reading a recipe phrase → a new block (logged as sentence_read), then placeable');
