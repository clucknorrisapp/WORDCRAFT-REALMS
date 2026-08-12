// The Trading Post (backlog #8) — the gem sink. Gems were paid out everywhere
// and spent nowhere; here they buy OWNABLE dragon colours, each bought by READING
// the colour word. Owned colours re-wear for free; the child can't buy what they
// can't afford or can't read. Purchases persist across sessions.
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
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, resume() {}, getVoices() { return []; }, speak(u) { setTimeout(() => (u._l.end || []).forEach((c) => c({})), 12); } } });
  if (!localStorage.getItem('readquest_save_v1')) {
    const save = {
      v: 1, childId: 'smoke_shop', avatar: 0, dragonName: 'rex', dragonLevel: 2, dragonXp: 0,
      questStep: 9, wood: 3, stone: 1, eggs: 0, gems: 5,
      signsRead: ['den'], hensFound: [], wallsBuilt: [], coopStage: 3, treasureClaimed: true,
      booksRead: [], blocksUnlocked: [], build: {}, worldBuild: {}, buildPlaced: 0, glintsFound: [], deedsEarned: ['read_first'], lastGiftDay: '2026-08-11', job: null, jobsDone: 0, pets: [], canvasLevel: 0, blueprint: null, blueprintsDone: [], firefliesCaught: 0, tamed: [], gatesOpened: [], pickLevel: 0, dragonColor: null, mapSeen: [], mapClaimed: [], summoned: [], beaconLit: 0, giantShields: 0, giantDefeated: false, furnaceCharge: 0, coachDone: true, dragonColorsOwned: [],
      taught: ['base', 'short_a', 'short_i', 'short_o', 'short_e', 'short_u', 'heart', 'digraph_sh', 'digraph_ch', 'digraph_th', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team'],
      evidence: [], events: [], firstSessionAt: Date.now(),
      settings: { micEnabled: false, micStrictness: 'gentle', narrationRate: 1, textScale: 1, sfxEnabled: true, dyslexiaFont: false, highContrast: false, reducedMotion: true },
    };
    localStorage.setItem('readquest_save_v1', JSON.stringify(save));
  }
});

const BASE = process.env.BASE_URL || 'http://localhost:4173';
await page.goto(BASE);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const save = () => page.evaluate(() => window.__readquest.services.save);
const dragonTint = () => page.evaluate(() => window.__readquest.game.scene.keys.world.dragonInfo().tint);

// Open the 🛒 Trading Post from the More menu.
await page.locator('.menu-btn').click();
await page.waitForSelector('.hud-menu-tray:not([hidden])', { timeout: 6000 });
await page.locator('.shop-btn').click();
await page.waitForSelector('.shop-grid', { timeout: 6000 });
const items = await page.locator('.shop-item').count();
console.log(`shop offers ${items} colours (red/tan/green all readable at this tier)`);
if (items !== 3) errors.push(`expected 3 readable colours on offer, got ${items}`);

// Buy GREEN (💎3): read the word to buy it.
const gems0 = (await save()).gems;
await page.locator('.shop-item[data-item="green"]').click();
await page.waitForSelector('.word-big', { timeout: 8000 });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.dragonColor === 'green', null, { timeout: 8000 });
const afterGreen = await save();
console.log(`bought green: gems ${gems0}→${afterGreen.gems}, owned=${JSON.stringify(afterGreen.dragonColorsOwned)}, dragonColor=${afterGreen.dragonColor}`);
if (afterGreen.gems !== gems0 - 3) errors.push(`green should cost 3 gems (${gems0}→${afterGreen.gems})`);
if (!afterGreen.dragonColorsOwned.includes('green')) errors.push('green should be owned after purchase');
const tintGreen = await dragonTint();
if (tintGreen !== 0x8fdc8f) errors.push(`the dragon should turn green (0x8fdc8f), got 0x${tintGreen.toString(16)}`);
const greenState = await page.getAttribute('.shop-item[data-item="green"]', 'class');
if (!/worn/.test(greenState || '')) errors.push(`green should read as "worn" after buying, was "${greenState}"`);

// Buy RED (💎2) → gems 0, dragon now red, green becomes owned-but-not-worn.
await page.locator('.shop-item[data-item="red"]').click();
await page.waitForSelector('.word-big', { timeout: 8000 });
await page.locator('.panel button:has-text("✓")').click();
await page.waitForSelector('.word-big', { state: 'detached', timeout: 8000 });
await page.waitForFunction(() => window.__readquest.services.save.gems === 0, null, { timeout: 8000 });
console.log(`bought red: gems now ${(await save()).gems}, dragonColor=${(await save()).dragonColor}`);

// Can't afford tan (💎2) with 0 gems — clicking must NOT charge or open a card.
await page.locator('.shop-item[data-item="tan"]').click();
await page.waitForTimeout(300);
if (await page.$('.word-big')) errors.push('an unaffordable colour must not open a buy card');
if ((await save()).gems !== 0) errors.push('an unaffordable colour must not change gems');

// Re-wear GREEN (already owned) for free.
await page.locator('.shop-item[data-item="green"]').click();
await page.waitForFunction(() => window.__readquest.services.save.dragonColor === 'green', null, { timeout: 8000 });
if ((await save()).gems !== 0) errors.push('wearing an already-owned colour must be free');
console.log(`re-wore green free: gems still ${(await save()).gems}, dragonColor=${(await save()).dragonColor}`);

// Persist across a reload.
await page.waitForFunction(() => JSON.parse(localStorage.getItem('readquest_save_v1')).dragonColorsOwned.includes('red'), null, { timeout: 8000 });
await page.reload();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1000);
const re = await save();
console.log(`after reload: owned=${JSON.stringify(re.dragonColorsOwned)}, dragonColor=${re.dragonColor}`);
if (!re.dragonColorsOwned.includes('green') || !re.dragonColorsOwned.includes('red')) errors.push('bought colours should persist across a reload');

await browser.close();
const fatal = errors.filter((e) => !e.includes('Failed to load resource'));
if (fatal.length) {
  console.error('ERRORS:');
  fatal.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nTRADING POST VERIFIED: gems finally buy something — reading a colour word buys + wears it and spends gems; owned colours re-wear free; you can\'t buy what you can\'t afford; purchases persist');
