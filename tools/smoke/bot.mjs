// Autonomous playtest bot: plays the ENTIRE quest (character select → free
// play) against a running preview server, with personas and a seeded RNG.
// Its core value is the stuck detector: if quest step, evidence count, and
// UI state all stop changing for STUCK_MS, that is a soft-lock — dump state
// and fail. Personas:
//   careful     — waits politely, answers correctly
//   speedy      — taps fast, double-taps buttons
//   wrong-first — picks a wrong card first (hint ladder), flubs the mic once
//   silent-mic  — says nothing twice at mic doors (ritual path)
//   chaos       — speedy + random world taps + reloads after step changes
//
//   node tools/smoke/bot.mjs --persona chaos --seed 7 [--max-min 8] [--base http://localhost:4173]
//
// Requires: pnpm build && pnpm preview (port 4173). Exit 0 = clean run.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const PERSONA = arg('persona', 'careful');
const SEED = Number(arg('seed', '1'));
const BASE = arg('base', 'http://localhost:4173');
const MAX_MS = Number(arg('max-min', '8')) * 60_000;
const OUT = `playtest-data/bot/${PERSONA}-${SEED}-${process.pid}`;
const STUCK_MS = 30_000;

let rngState = SEED >>> 0 || 1;
const rng = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const P = {
  careful: { delay: () => 500 + rng() * 600, wrongFirst: false, mic: ['correct'], doubleTap: 0, chaosTap: 0, reload: 0 },
  speedy: { delay: () => 60 + rng() * 150, wrongFirst: false, mic: ['correct'], doubleTap: 0.5, chaosTap: 0, reload: 0 },
  'wrong-first': { delay: () => 300 + rng() * 400, wrongFirst: true, mic: ['wrong', 'correct'], doubleTap: 0, chaosTap: 0, reload: 0 },
  'silent-mic': { delay: () => 300 + rng() * 400, wrongFirst: false, mic: ['silence', 'silence'], doubleTap: 0, chaosTap: 0, reload: 0 },
  chaos: { delay: () => 80 + rng() * 250, wrongFirst: true, mic: ['wrong', 'correct'], doubleTap: 0.3, chaosTap: 0.25, reload: 0.5 },
}[PERSONA];
if (!P) {
  console.error(`unknown persona ${PERSONA}`);
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const pageErrors = [];
const log = (...a) => console.log(`[bot ${PERSONA}/${SEED}]`, ...a);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', (e) => pageErrors.push(e.message));

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
        const n = (u.text || '').split(/\s+/).length;
        setTimeout(() => (u._l.end || []).forEach((cb) => cb({})), 30 * n + 60);
      },
    },
  });
  // Mic stub controlled per-attempt via window.__botSay ('' = stay silent).
  const Fake = class {
    start() {
      const say = window.__botSay;
      if (!say) return; // silence: the app's own timeout handles it
      setTimeout(() => {
        const alternatives = [{ transcript: say }];
        alternatives.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [alternatives] });
      }, 500);
    }
    stop() {}
    abort() {}
  };
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Fake });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Fake });
});

const snap = () =>
  page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('readquest_save_v1') ?? 'null');
    const world = window.__readquest?.game?.scene?.keys?.world;
    const dialogNext = [...document.querySelectorAll('.dialogue button')].some(
      (b) => b.textContent === 'Keep going' && getComputedStyle(b).visibility !== 'hidden',
    );
    const cards = [...document.querySelectorAll('.word-card')].map((c) => c.textContent);
    return {
      selecting: !!document.querySelector('.avatar-grid') || cards.length === 4 && !!document.querySelector('img[src*="dragon"]'),
      nameGrid: !!document.querySelector('button.word-card') && !save?.dragonName,
      dialogNext,
      mic: !!document.querySelector('.mic-btn'),
      wordOk: [...document.querySelectorAll('.panel .btn')].some((b) => b.textContent === '✓'),
      cards,
      wordBig: document.querySelector('.word-big')?.textContent ?? null,
      // Ritual mode: the say-it-out-loud word is pulsing and clickable (no mic).
      ritualWord: (() => {
        const w = document.querySelector('.word-big.pulse');
        return w ? w.textContent : null;
      })(),
      step: save?.questStep ?? -1,
      evidence: save?.evidence?.length ?? 0,
      wood: save?.wood ?? 0,
      stone: save?.stone ?? 0,
      eggs: save?.eggs ?? 0,
      coopStage: save?.coopStage ?? 0,
      dragonName: save?.dragonName ?? null,
      avatar: save?.avatar ?? null,
      player: world ? { x: Math.round(world.player.x), y: Math.round(world.player.y) } : null,
      hasWorld: !!world,
    };
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (text) => {
  const loc = page.locator(`button:has-text("${text}")`).first();
  await loc.click({ timeout: 4000 }).catch(() => {});
  if (rng() < P.doubleTap) await loc.click({ timeout: 300 }).catch(() => {});
};

const tapWorld = async (wx, wy) => {
  const pos = await page.evaluate(([x, y]) => {
    const s = window.__readquest.game.scene.keys.world;
    s.cameras.main.setLerp(1, 1);
    const cam = s.cameras.main;
    return { x: x - cam.scrollX, y: y - cam.scrollY };
  }, [wx, wy]);
  const cx = Math.max(8, Math.min(1016, pos.x));
  const cy = Math.max(8, Math.min(760, pos.y));
  await page.mouse.click(cx, cy);
};

// Interactive world targets. The bot taps sprite screen-positions directly;
// the game turns a distant tap into a walk and auto-fires on arrival.
const POI = {
  tree: [180, 230],
  wallSlot: [325, 795],
  coop: [445, 930],
  mayor: [750, 640],
};
const worldTarget = async (s) => {
  const fromGame = await page.evaluate(() => {
    const w = window.__readquest.game.scene.keys.world;
    return w.director?.objectiveTarget() ?? null;
  });
  // Steps needing a specific sprite tap the guidance arrow only points near:
  if (s.step === 1) return s.wood >= 1 ? { x: POI.wallSlot[0], y: POI.wallSlot[1] } : { x: POI.tree[0], y: POI.tree[1] };
  if (s.step === 7) return s.wood >= 2 ? { x: POI.coop[0], y: POI.coop[1] } : { x: POI.tree[0], y: POI.tree[1] };
  return fromGame;
};

let micAttempt = 0;
let wedgePos = null;
let wedgeCount = 0;
const correctWordFrom = (wordBig) => (wordBig ?? '').replace(/\s/g, '').toLowerCase();

const start = Date.now();
let lastProgress = Date.now();
let lastSig = '';
let actions = 0;
let reloadsDone = 0;
let prevStep = -1;

await page.goto(BASE);
log('run started');

while (Date.now() - start < MAX_MS) {
  if (pageErrors.length) break;
  const s = await snap().catch(() => null);
  if (!s) {
    await wait(500);
    continue;
  }

  // Progress = any of: step/evidence/UI change, resource gain, or the player
  // moving across the world (quantized). A genuine soft-lock changes none of
  // these; long walks and gathering do.
  const gx = s.player ? Math.round(s.player.x / 120) : 0;
  const gy = s.player ? Math.round(s.player.y / 120) : 0;
  const sig = JSON.stringify([s.step, s.evidence, s.dialogNext, s.mic, s.wordOk, s.cards.length, s.selecting, s.wood, s.stone, s.coopStage, s.eggs, gx, gy]);
  if (sig !== lastSig) {
    lastSig = sig;
    lastProgress = Date.now();
  }
  if (Date.now() - lastProgress > STUCK_MS) {
    await page.screenshot({ path: `${OUT}/stuck.png` }).catch(() => {});
    fs.writeFileSync(`${OUT}/stuck.json`, JSON.stringify({ persona: PERSONA, seed: SEED, state: s, actions }, null, 2));
    console.error(`STUCK: no progress for ${STUCK_MS / 1000}s at step ${s.step} (dump in ${OUT})`);
    await browser.close();
    process.exit(1);
  }

  if (s.step === 9) {
    log(`reached FREE_PLAY after ${actions} actions, ${Math.round((Date.now() - start) / 1000)}s`);
    break;
  }

  actions += 1;
  await wait(P.delay());

  // Character/dragon selection flow.
  if (s.avatar === null && !s.hasWorld) {
    const imgs = page.locator('.avatar-grid img');
    if ((await imgs.count()) > 0) {
      await imgs.nth(Math.floor(rng() * 4)).click().catch(() => {});
      await clickText('Go!');
      continue;
    }
  }
  if (s.dialogNext) {
    await clickText('Keep going');
    continue;
  }
  if (!s.dragonName && s.cards.length === 4 && !s.hasWorld) {
    await page.locator('.word-card').nth(Math.floor(rng() * 4)).click().catch(() => {});
    await clickText('Keep this name!');
    continue;
  }
  if (s.mic) {
    const plan = P.mic[Math.min(micAttempt, P.mic.length - 1)];
    micAttempt += 1;
    const word = correctWordFrom(s.wordBig);
    const say = plan === 'correct' ? word : plan === 'wrong' ? (word === 'ship' ? 'sip' : 'test') : '';
    await page.evaluate((w) => {
      window.__botSay = w;
    }, say);
    await page.locator('.mic-btn').click({ timeout: 3000 }).catch(() => {});
    await wait(plan === 'silence' ? 8000 : 2500);
    continue;
  }
  // Say-it-out-loud ritual: no mic, tap the pulsing word to open the door
  // (force: the ritual word pulses too).
  if (s.ritualWord && !s.mic) {
    await page.locator('.word-big').click({ force: true, timeout: 3000 }).catch(() => {});
    await wait(1500);
    continue;
  }
  if (s.cards.length >= 2 && s.hasWorld) {
    // A choice board. Optionally wrong first (hint ladder), then click each
    // enabled card until the board actually closes — the game guarantees warm
    // retry and never blocks, so one card is always the exit.
    // force:true is essential — the correct card gets a perpetual .pulse
    // animation, which Playwright's stability check would otherwise refuse
    // to click (a real child taps it fine).
    if (P.wrongFirst && rng() < 0.6) {
      await page.locator('.word-card:not([disabled])').first().click({ force: true }).catch(() => {});
      await wait(1600); // let the hint-ladder audio settle
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const enabled = await page.locator('.word-card:not([disabled])').count();
      if (enabled === 0) {
        await wait(1500);
        if ((await page.locator('.word-card').count()) === 0) break;
        continue;
      }
      await page.locator('.word-card:not([disabled])').first().click({ force: true }).catch(() => {});
      await wait(1600);
      if ((await page.locator('.word-card').count()) === 0) break;
    }
    continue;
  }
  if (s.wordOk) {
    await clickText('✓');
    continue;
  }

  // World movement toward the current objective.
  if (s.hasWorld) {
    if (P.chaosTap && rng() < P.chaosTap) {
      await page.mouse.click(100 + rng() * 800, 150 + rng() * 500);
      await wait(300);
    }
    const target = await worldTarget(s);
    if (target) {
      // Obstacle detour: no real pathfinding exists, so a straight walk can
      // wedge against a tree/rock. If the player hasn't moved since the last
      // world action, tap a perpendicular offset to slip around it.
      if (s.player && wedgePos && Math.hypot(s.player.x - wedgePos.x, s.player.y - wedgePos.y) < 25) {
        wedgeCount += 1;
        const side = wedgeCount % 2 ? 1 : -1;
        const dx = target.x - s.player.x;
        const dy = target.y - s.player.y;
        const len = Math.hypot(dx, dy) || 1;
        // perpendicular nudge + a step forward
        const nx = s.player.x + (dx / len) * 120 + (-dy / len) * 200 * side;
        const ny = s.player.y + (dy / len) * 120 + (dx / len) * 200 * side;
        await tapWorld(nx, ny);
        await wait(1600);
      } else {
        wedgeCount = 0;
        const near = s.player && Math.hypot(s.player.x - target.x, s.player.y - target.y) < 700;
        await tapWorld(target.x, target.y);
        await wait(near ? 1500 : 3200);
      }
      wedgePos = s.player;
    } else {
      await wait(800);
    }
  }

  // Chaos: reload after a step advance and continue from the restored save.
  if (s.step !== prevStep) {
    prevStep = s.step;
    micAttempt = 0;
    if (P.reload && rng() < P.reload && reloadsDone < 4 && s.step > 0) {
      reloadsDone += 1;
      log(`reload after reaching step ${s.step}`);
      await page.reload();
      await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
      await wait(1500);
    }
  }
}

const final = await snap().catch(() => null);
const ok = !pageErrors.length && final && final.step === 9;
if (final) {
  fs.writeFileSync(
    `${OUT}/final.json`,
    JSON.stringify({ persona: PERSONA, seed: SEED, ok, actions, reloadsDone, seconds: Math.round((Date.now() - start) / 1000), pageErrors, state: final }, null, 2),
  );
}
if (!ok) {
  await page.screenshot({ path: `${OUT}/end.png` }).catch(() => {});
  console.error(`FAILED: step=${final?.step} errors=${JSON.stringify(pageErrors.slice(0, 3))} (dump in ${OUT})`);
  await browser.close();
  process.exit(1);
}
log(`PASS — full quest complete (${reloadsDone} reloads, ${actions} actions)`);
await browser.close();
