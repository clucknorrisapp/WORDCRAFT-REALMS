// The Reading Moments — reusable widgets with a uniform lifecycle
// (present → attempt(s) → resolve → emit Evidence). Quests compose these.
// Pillar rules enforced here, in the interaction layer:
//   - never the word "wrong": warm retry + hint ladder
//   - the mic can never block: two misses and the door opens anyway
//   - celebration fires on every success (the dragon's animation is load-bearing)

import { buildChallenge, line as getLine, validateText, word as getWord } from '@readquest/content';
import { seededShuffle, type Spell } from '@readquest/shared';
import type { Services } from '../services';
import { castEffect, confetti, el, isUiOpen, openLayer, screenFlash, speakerButton, wait } from './dom';
import { resetReadStreak, sfxDragon, sfxFanfare, sfxMiss, sfxReadWin, sfxUnlock } from '../game/sfx';

export { isUiOpen };

const PORTRAITS: Record<string, string> = {
  narrator: 'assets/sprites/dragon.png',
  mayor_hen: 'assets/sprites/mayor_hen.png',
  wizard: 'assets/sprites/wizard.png',
  sign: 'assets/sprites/sign.png',
};

// The world scene registers the dragon's celebrate animation here.
let dragonCelebrate: (big: boolean) => void = () => {};
export function setDragonCelebrate(fn: (big: boolean) => void): void {
  dragonCelebrate = fn;
}

// Bridge: the world scene registers how to redraw the child's build; Build
// Mode calls renderBuildInWorld() when it closes so the creation appears in
// the actual world ("look what I built"), not just in the modal.
let buildRenderer: () => void = () => {};
export function setBuildRenderer(fn: () => void): void {
  buildRenderer = fn;
}
export function renderBuildInWorld(): void {
  buildRenderer();
}

// Bridge: the world scene registers how to reveal the current goal; the compass
// button (and anything else asking "where now?") calls requestNext().
let nextHandler: () => void = () => {};
export function setNextHandler(fn: () => void): void {
  nextHandler = fn;
}
export function requestNext(): void {
  nextHandler();
}

// Bridge: the world scene registers how to toggle Build-Where-You-Stand mode;
// the 🧱 HUD button calls requestPlaceMode().
let placeModeToggle: () => void = () => {};
export function setPlaceModeToggle(fn: () => void): void {
  placeModeToggle = fn;
}
export function requestPlaceMode(): void {
  placeModeToggle();
}

// Bridge: the world scene registers how to re-scatter wild creatures; a tier
// unlock calls requestCreatureRefresh() so newly-readable species roam the land.
let creatureRefresh: () => void = () => {};
export function setCreatureRefresh(fn: () => void): void {
  creatureRefresh = fn;
}
export function requestCreatureRefresh(): void {
  creatureRefresh();
}

// Bridge: the world scene registers how to whoosh the player to a spot (the
// existing fade-teleport); the map's fast-travel pins call requestFastTravel().
let fastTravel: (x: number, y: number) => void = () => {};
export function setFastTravel(fn: (x: number, y: number) => void): void {
  fastTravel = fn;
}
export function requestFastTravel(x: number, y: number): void {
  fastTravel(x, y);
}

// Bridge: the world scene registers a read-only peek at the player's world
// position so the map can draw the "you are here" dot without owning the scene.
let playerPeek: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
export function setPlayerPeek(fn: () => { x: number; y: number }): void {
  playerPeek = fn;
}
export function peekPlayer(): { x: number; y: number } {
  return playerPeek();
}

// Bridge: the world scene registers how to summon a read word's thing into the
// world (Word Loot); the Word Bag calls requestSummon() after the child reads.
let summon: (word: string) => void = () => {};
export function setSummon(fn: (word: string) => void): void {
  summon = fn;
}
export function requestSummon(word: string): void {
  summon(word);
}

// Bridge: the world scene registers how to recolour the dragon; the Trading Post
// calls requestDragonColor() the instant a colour is bought/worn.
let dragonColorApply: (word: string) => void = () => {};
export function setDragonColorApply(fn: (word: string) => void): void {
  dragonColorApply = fn;
}
export function requestDragonColor(word: string): void {
  dragonColorApply(word);
}

// Bridge: the world scene registers how to relight the Beacon; a Reader
// Level-up or a finished book calls requestBeaconRefresh() so the monument
// grows a ring the instant reading grows — no reload needed.
let beaconRefresh: () => void = () => {};
export function setBeaconRefresh(fn: () => void): void {
  beaconRefresh = fn;
}
export function requestBeaconRefresh(): void {
  beaconRefresh();
}

const CELEBRATE_LINES = ['ln_celebrate_1', 'ln_celebrate_2', 'ln_celebrate_3'];
let celebrateIdx = 0;

export async function celebrate(services: Services, big = false, lineId?: string): Promise<void> {
  confetti(big ? 44 : 22);
  if (big) {
    sfxFanfare();
    screenFlash(); // the milestone "punch"
  } else {
    sfxDragon();
  }
  dragonCelebrate(big);
  const id = lineId ?? CELEBRATE_LINES[celebrateIdx++ % CELEBRATE_LINES.length]!;
  await services.speakLine(id).done;
}

/** Hint sounds for the pronunciation ladder (roadmap §7). */
const GRAPHEME_HINTS: Record<string, string> = {
  sh: 'shhh',
  ch: 'ch, ch',
  th: 'thhh',
  st: 'sss, t',
  ck: 'k',
  a: 'ah',
  e: 'eh',
  i: 'ih',
  o: 'o',
  u: 'uh',
};

function graphemeSpans(text: string): { wrap: HTMLElement; spans: HTMLElement[] } {
  const w = getWordSafe(text);
  const wrap = el('div', 'word-big');
  const spans: HTMLElement[] = [];
  const parts = w ? w.graphemes : text.split('');
  for (const g of parts) {
    const s = el('span', 'g', g.toUpperCase());
    wrap.appendChild(s);
    spans.push(s);
  }
  return { wrap, spans };
}

function getWordSafe(text: string) {
  try {
    return getWord(text);
  } catch {
    return null;
  }
}

/** Slow blend: glow graphemes in sequence while speaking slowly. */
async function slowBlend(services: Services, text: string, spans: HTMLElement[]): Promise<void> {
  const per = 420;
  spans.forEach((s, i) => {
    setTimeout(() => {
      spans.forEach((x) => x.classList.remove('glow'));
      s.classList.add('glow');
    }, i * per);
  });
  setTimeout(() => spans.forEach((x) => x.classList.remove('glow')), spans.length * per + 400);
  await services.speakWord(text, 0.55).done;
}

// ── Narrated dialogue with word-by-word highlighting ────────────────────────
export async function showDialogue(
  services: Services,
  lineId: string,
  opts: { nameSub?: string; audioLineId?: string } = {},
): Promise<void> {
  const l = getLine(lineId);
  let text = l.text;
  if (opts.nameSub) text = text.replaceAll('{name}', opts.nameSub);

  const layer = openLayer();
  layer.root.style.background = 'rgba(20, 20, 50, 0.18)';
  const box = el('div', 'dialogue');
  const portrait = el('img', 'portrait') as HTMLImageElement;
  portrait.src = PORTRAITS[l.speaker] ?? PORTRAITS['narrator']!;
  const speech = el('div', 'speech');
  const wordsEl = el('div', 'words');
  const spans: HTMLElement[] = [];
  text.split(/\s+/).forEach((wrd, i) => {
    if (i > 0) wordsEl.appendChild(document.createTextNode(' '));
    const s = el('span', '', wrd);
    wordsEl.appendChild(s);
    spans.push(s);
  });
  speech.appendChild(wordsEl);
  const row = el('div', 'drow');
  speech.appendChild(row);
  box.appendChild(portrait);
  box.appendChild(speech);
  layer.root.appendChild(box);
  layer.root.style.alignItems = 'flex-end';

  const speak = () =>
    new Promise<void>((resolve) => {
      // audioLineId lets a template line use a per-variant pre-generated clip
      // (e.g. ln_dragon_joins_rex) while the displayed text keeps the name.
      const { handle } = services.speakLine(opts.audioLineId ?? lineId, text);
      handle.onWordBoundary((i) => {
        spans.forEach((s) => s.classList.remove('hot'));
        spans[i]?.classList.add('hot');
      });
      handle.onEnd(() => {
        spans.forEach((s) => s.classList.remove('hot'));
        resolve();
      });
    });

  const replay = speakerButton(() => {
    services.analytics.log('audio_requested', { lineId });
    void speak();
  });
  const next = el('button', 'btn', 'Keep going');
  next.style.visibility = 'hidden';
  row.appendChild(replay);
  row.appendChild(next);

  const policy = services.engine.scaffolding();
  if (policy.dialogueAudio === 'auto') await Promise.race([speak(), wait(9000)]);
  else await wait(300); // reader-led: audio only via the 🔊 button
  next.style.visibility = 'visible';

  await new Promise<void>((resolve) => next.addEventListener('click', () => resolve(), { once: true }));
  layer.close();
}

// ── Sign / word-card reading ────────────────────────────────────────────────
export async function readWordCard(
  services: Services,
  wordText: string,
  opts: { autoSpeak?: boolean; countType?: 'sign_read'; icon?: string } = {},
): Promise<void> {
  const started = Date.now();
  const w = getWord(wordText);
  // Iron-rule tripwire (dev builds only, dead-code-eliminated in prod): every
  // reading card must show a word the child can already decode. A hardcoded
  // undecodable literal — like the dragon's ungated 'green' once was — should
  // scream in the console, never leak silently past the game's cardinal rule.
  if (import.meta.env?.DEV && !validateText(wordText, services.save.taught).ok) {
    console.warn(`[iron-rule] readWordCard("${wordText}") is not decodable at the child's current tier`);
  }
  const layer = openLayer();
  const panel = el('div', 'panel');
  const { wrap } = graphemeSpans(wordText);
  panel.appendChild(el('div', 'subtitle', opts.icon ?? '🪧'));
  panel.appendChild(wrap);
  let audioRequested = false;
  const row = el('div', 'cards');
  const replay = speakerButton(() => {
    audioRequested = true;
    void services.speakWord(w.text).done;
  });
  const ok = el('button', 'btn', '✓');
  ok.style.fontSize = '26px';
  row.appendChild(replay);
  row.appendChild(ok);
  panel.appendChild(row);
  layer.root.appendChild(panel);

  // Listen from the moment the button exists — a fast tap during narration
  // must count, never land on a button that isn't wired up yet.
  const okClicked = new Promise<void>((resolve) => ok.addEventListener('click', () => resolve(), { once: true }));
  if (opts.autoSpeak !== false) {
    await wait(650); // let them look at the word first
    await services.speakWord(w.text).done;
  }
  await okClicked;
  sfxReadWin(); // reading the word to earn it is a reading win — climb the chime
  layer.close();

  services.recordEvidence({
    challengeType: 'sign_read',
    skillIds: w.skills,
    wordId: w.id,
    channel: 'recognition',
    correct: true,
    attemptIndex: 1,
    hintsUsed: 0,
    audioRequested,
    micUsed: false,
    responseMs: Date.now() - started,
  });
}

// ── Word match / path choice ────────────────────────────────────────────────
export interface ChoiceOpts {
  challengeType: 'word_match' | 'path_choice';
  targetWord: string;
  /** Explicit distractors; defaults to the target's curated confusables. */
  distractors?: string[];
  /** Spoken instruction (audio only, not displayed). */
  spokenPrompt?: string;
  /** A decodable clue the child reads before choosing (displayed). */
  clueLineId?: string;
  emoji?: string;
}

export async function choiceBoard(services: Services, opts: ChoiceOpts): Promise<void> {
  const started = Date.now();
  const target = getWord(opts.targetWord);
  const seed = Math.floor(Math.random() * 1e6);

  let options: string[];
  if (opts.distractors) {
    const all = [opts.targetWord, ...opts.distractors];
    options = seededShuffle(all.length, seed).map((i) => all[i]!);
  } else {
    const ch = buildChallenge(opts.targetWord, seed);
    const all = [ch.target.text, ...ch.distractors.map((d) => d.text)];
    options = ch.order.map((i) => all[i]!);
  }

  const layer = openLayer();
  const panel = el('div', 'panel');
  if (opts.emoji) panel.appendChild(el('div', 'title', opts.emoji));

  let audioRequested = false;
  if (opts.clueLineId) {
    const clue = getLine(opts.clueLineId);
    const clueEl = el('div', 'title');
    clueEl.style.fontSize = '30px';
    clueEl.style.letterSpacing = '1px';
    clueEl.textContent = clue.text; // lowercase, to match how words look in books
    panel.appendChild(clueEl);
    const hear = speakerButton(() => {
      audioRequested = true;
      void services.speakLine(opts.clueLineId!).done;
    });
    panel.appendChild(hear);
  }

  // An audio-first learner who misses the spoken instruction must be able to
  // hear it again — a "say it again" button, never a dead end. (Re-hearing the
  // instruction is not a decoding hint, so it doesn't flag audioRequested.)
  if (opts.spokenPrompt && !opts.clueLineId) {
    const again = speakerButton(() => void services.speakText(opts.spokenPrompt!).done);
    again.classList.add('prompt-replay');
    again.title = 'Say it again';
    panel.appendChild(again);
  }

  const cards = el('div', 'cards');
  panel.appendChild(cards);
  layer.root.appendChild(panel);

  const sayPrompt = async () => {
    if (opts.spokenPrompt) await services.speakText(opts.spokenPrompt).done;
  };
  void sayPrompt();

  let attempt = 0;
  let hintsUsed = 0;

  await new Promise<void>((resolve) => {
    const buttons: HTMLButtonElement[] = [];
    let resolved = false; // latch: the winning tap freezes the board
    for (const text of options) {
      const card = el('button', 'word-card', text); // lowercase — matches books, aids early/dyslexic decoding
      buttons.push(card);
      card.addEventListener('click', () => {
        // A correct answer ends the challenge; ignore every later tap so an
        // excited double-tap can't log a spurious "wrong" and corrupt mastery.
        if (resolved) return;
        attempt += 1;
        if (text === target.text) {
          resolved = true;
          buttons.forEach((b) => (b.disabled = true));
          card.classList.add('right');
          if (attempt === 1) sfxReadWin(); // the climbing reading chime — first-try only
          else resetReadStreak();
          services.recordEvidence({
            challengeType: opts.challengeType,
            skillIds: target.skills,
            wordId: target.id,
            lineId: opts.clueLineId,
            channel: 'recognition',
            correct: attempt === 1,
            attemptIndex: attempt,
            hintsUsed,
            audioRequested,
            micUsed: false,
            responseMs: Date.now() - started,
            seed,
          });
          setTimeout(resolve, 450);
        } else {
          // Warm failure: "Almost!" + hint ladder, never "wrong" (pillar 4).
          sfxMiss();
          resetReadStreak();
          card.classList.add('wiggle');
          card.disabled = true;
          card.style.opacity = '0.5';
          hintsUsed += 1;
          void (async () => {
            await services.speakLine('ln_almost').done;
            if (hintsUsed === 1) {
              await services.speakWord(target.text, 0.7).done;
            } else {
              const correctBtn = buttons.find((b) => b.textContent === target.text.toUpperCase());
              correctBtn?.classList.add('pulse');
              await slowBlendInline(services, target.text);
            }
          })();
        }
      });
      cards.appendChild(card);
    }
  });
  layer.close();
}

async function slowBlendInline(services: Services, text: string): Promise<void> {
  await services.speakWord(text, 0.55).done;
}

// ── The magic word door — the product thesis ────────────────────────────────
export interface MagicDoorResult {
  opened: true;
  spoken: boolean; // did a verified mic match open it?
}

export async function magicWordDoor(services: Services, wordText: string): Promise<MagicDoorResult> {
  const started = Date.now();
  const w = getWord(wordText);
  const layer = openLayer();
  const panel = el('div', 'panel');
  panel.appendChild(el('div', 'title', '✨ Say the magic word ✨'));
  const { wrap, spans } = graphemeSpans(wordText);
  wrap.classList.add('word-big');
  panel.appendChild(wrap);
  const status = el('div', 'subtitle', ' ');
  panel.appendChild(status);
  layer.root.appendChild(panel);

  const availability = await services.speech.available();
  const micAllowed = services.save.settings.micEnabled && availability.supported;

  const finish = (spoken: boolean, correct: boolean, extra: Partial<Parameters<Services['recordEvidence']>[0]> = {}) => {
    services.recordEvidence({
      challengeType: 'magic_word',
      skillIds: w.skills,
      wordId: w.id,
      channel: 'production',
      correct,
      attemptIndex: Math.max(1, misses + 1),
      hintsUsed,
      audioRequested: false,
      micUsed: spoken,
      responseMs: Date.now() - started,
      ...extra,
    });
  };

  let misses = 0;
  let hintsUsed = 0;
  let silentTries = 0;

  const ritual = async (): Promise<MagicDoorResult> => {
    // No mic (unsupported, denied, or parent-disabled): say-it-out-loud ritual.
    // Production-flavored, logged as unverified (micUsed: false).
    status.textContent = 'Say it out loud! Then tap the word.';
    wrap.style.cursor = 'pointer';
    wrap.classList.add('pulse');
    // Attach the tap listener BEFORE the narration — a child tapping the word
    // while the narrator is still talking must count, not land on a dead node.
    const tapped = new Promise<void>((r) => wrap.addEventListener('click', () => r(), { once: true }));
    void services.speakLine('ln_ritual_say').done;
    await tapped;
    finish(false, true);
    layer.close();
    return { opened: true, spoken: false };
  };

  if (!micAllowed) {
    services.analytics.log('mic_unavailable', {
      supported: availability.supported,
      permission: availability.permission,
      enabled: services.save.settings.micEnabled,
    });
    return ritual();
  }

  const mic = el('button', 'mic-btn', '🎤');
  panel.appendChild(mic);

  return new Promise<MagicDoorResult>((resolve) => {
    const openDoor = async (spoken: boolean, viaAssist: boolean) => {
      mic.disabled = true;
      mic.classList.remove('listening');
      if (viaAssist) {
        services.analytics.log('mic_assist_open', { word: w.text, misses });
        status.textContent = 'What a good try! The door opens for you!';
        await services.speakText('What a good try! The door opens for you!').done;
      }
      layer.close();
      resolve({ opened: true, spoken });
    };

    mic.addEventListener('click', () => {
      void (async () => {
        if (mic.disabled) return;
        mic.disabled = true;
        mic.classList.add('listening');
        status.textContent = '🎤 I am listening...';
        services.analytics.log('mic_attempted', { word: w.text });

        const result = await services.speech.listen({ expected: w.text, timeoutMs: 6500 });
        mic.classList.remove('listening');
        // NOTE: mic stays disabled through the coaching narration below; it is
        // re-enabled only at the points that invite another attempt, so a tap
        // during "try again" can't start an overlapping listen session.

        if (result.status === 'match') {
          finish(true, true, {
            speech: { expected: w.text, recognized: result.recognized, confidence: result.confidence },
          });
          await openDoor(true, false);
          return;
        }

        if (result.status === 'permission_denied' || result.status === 'unsupported' || result.status === 'error') {
          services.analytics.log('mic_fallback_ritual', { reason: result.status });
          mic.remove();
          resolve(await ritual());
          return;
        }

        const strict = services.save.settings.micStrictness === 'strict';

        if (result.status === 'no_speech' || result.status === 'timeout') {
          silentTries += 1;
          status.textContent = 'I did not hear you. Big voice! Try again!';
          await services.speakText('I did not hear you. Big voice! Try again!').done;
          // Gentle mode bails to the ritual after repeated silence; strict
          // mode keeps the mic up — the door waits for a voice.
          if (!strict && silentTries >= 2) {
            mic.remove();
            resolve(await ritual());
          } else {
            mic.disabled = false; // invite another try, now that coaching is done
          }
          return;
        }

        // no_match — a real miss: warm hint ladder. Gentle mode never makes a
        // third demand; strict mode deepens the ladder and keeps listening.
        misses += 1;
        finish(true, false, {
          speech: { expected: w.text, recognized: result.recognized, confidence: result.confidence },
        });
        if (misses === 1 || strict) {
          hintsUsed += 1;
          const first = spans[0];
          first?.classList.add('glow');
          const hint = GRAPHEME_HINTS[w.graphemes[0] ?? ''] ?? w.graphemes[0] ?? '';
          status.textContent = `Almost! Listen: ${hint}…`;
          await services.speakLine('ln_almost').done;
          await services.speakText(hint, 'narrator', 0.7).done;
          await slowBlend(services, w.text, spans);
          if (strict && misses >= 2) {
            status.textContent = 'Say it with me!';
            await services.speakText(`Say it with me! ${w.text}!`, 'narrator', 0.8).done;
          }
          status.textContent = 'Your turn! Tap the microphone.';
          mic.disabled = false; // re-enable only after the hint ladder finishes
        } else {
          await services.speakLine('ln_almost').done;
          await openDoor(true, true); // two misses → the door opens anyway
        }
      })();
    });
  });
}

// ── Spell casting — reading as magic power ──────────────────────────────────
/**
 * Cast a spell by reading its power word. Voice-first (say it into the mic)
 * but never blocking: no mic, or a miss, still casts — spells should feel
 * empowering, not like a test. Fires the themed effect + dragon celebration
 * and logs `spell_cast` production evidence. Resolves true once cast.
 */
export async function castSpell(services: Services, sp: Spell): Promise<boolean> {
  const started = Date.now();
  const w = getWord(sp.word);
  const layer = openLayer();
  const panel = el('div', 'panel spellcast');
  panel.style.setProperty('--hue', sp.hue);
  panel.appendChild(el('div', 'spell-emoji', sp.icon));
  panel.appendChild(el('div', 'subtitle', 'Read it to cast it!'));
  const { wrap, spans } = graphemeSpans(sp.word);
  wrap.classList.add('word-big');
  panel.appendChild(wrap);
  const status = el('div', 'subtitle', ' ');
  panel.appendChild(status);
  const row = el('div', 'cards');
  const replay = speakerButton(() => void services.speakWord(w.text).done);
  row.appendChild(replay);
  panel.appendChild(row);
  layer.root.appendChild(panel);

  let misses = 0;
  const record = (spoken: boolean, correct: boolean, extra: Partial<Parameters<Services['recordEvidence']>[0]> = {}) =>
    services.recordEvidence({
      challengeType: 'spell_cast',
      skillIds: w.skills,
      wordId: w.id,
      channel: 'production',
      correct,
      attemptIndex: misses + 1,
      hintsUsed: 0,
      audioRequested: false,
      micUsed: spoken,
      responseMs: Date.now() - started,
      ...extra,
    });

  const fire = async (spoken: boolean): Promise<boolean> => {
    spans.forEach((s) => s.classList.add('glow'));
    layer.close();
    castEffect(sp.particle, sp.hue);
    await celebrate(services, true);
    return spoken;
  };

  // Say-it-out-loud ritual: read the word, tap it, cast. Always available.
  const ritual = async (): Promise<boolean> => {
    status.textContent = 'Say it out loud, then tap the word!';
    wrap.style.cursor = 'pointer';
    wrap.classList.add('pulse');
    const tapped = new Promise<void>((r) => wrap.addEventListener('click', () => r(), { once: true }));
    void services.speakWord(w.text).done;
    await tapped;
    record(false, true);
    return fire(false);
  };

  const availability = await services.speech.available();
  const micAllowed = services.save.settings.micEnabled && availability.supported;
  if (!micAllowed) return ritual();

  const mic = el('button', 'mic-btn', '🎤');
  status.textContent = 'Tap the mic and say the word!';
  panel.appendChild(mic);

  return new Promise<boolean>((resolve) => {
    mic.addEventListener('click', () => {
      void (async () => {
        if (mic.disabled) return;
        mic.disabled = true;
        mic.classList.add('listening');
        status.textContent = '🎤 I am listening…';
        services.analytics.log('spell_mic_attempt', { word: w.text });
        const result = await services.speech.listen({ expected: w.text, timeoutMs: 6500 });
        mic.classList.remove('listening');

        if (result.status === 'match') {
          record(true, true, {
            speech: { expected: w.text, recognized: result.recognized, confidence: result.confidence },
          });
          resolve(await fire(true));
          return;
        }
        if (result.status === 'permission_denied' || result.status === 'unsupported' || result.status === 'error') {
          mic.remove();
          resolve(await ritual());
          return;
        }
        // no_speech / timeout / no_match — one warm nudge, then cast anyway:
        // a spell must never leave a child stuck.
        misses += 1;
        if (misses === 1) {
          status.textContent = 'Good try! Listen…';
          await services.speakLine('ln_almost').done;
          await slowBlend(services, w.text, spans);
          status.textContent = 'Your turn — tap the mic!';
          mic.disabled = false;
        } else {
          record(false, true);
          resolve(await fire(false));
        }
      })();
    });
  });
}

// ── Small helpers used by the quest layer ───────────────────────────────────
export async function toast(services: Services, lineId: string, nameSub?: string): Promise<void> {
  const l = getLine(lineId);
  let text = l.text;
  if (nameSub) text = text.replaceAll('{name}', nameSub);
  const layer = openLayer({ scrim: false, modal: false });
  const box = el('div', 'dialogue');
  box.style.padding = '12px 16px';
  const speech = el('div', 'speech');
  speech.appendChild(el('div', 'words', text));
  box.appendChild(speech);
  layer.root.appendChild(box);
  layer.root.style.alignItems = 'flex-end';
  await services.speakLine(lineId, nameSub ? text : undefined).done;
  await wait(700);
  layer.close();
}

export async function showBlueprint(services: Services): Promise<void> {
  const layer = openLayer();
  const panel = el('div', 'panel');
  panel.appendChild(el('div', 'title', '📜 A gift!'));
  const img = el('img') as HTMLImageElement;
  img.src = 'assets/sprites/coop.png';
  img.style.width = '140px';
  panel.appendChild(img);
  const clue = getLine('ln_blueprint');
  const clueEl = el('div', 'word-big', clue.text.toUpperCase());
  clueEl.style.fontSize = '34px';
  panel.appendChild(clueEl);
  const row = el('div', 'cards');
  row.appendChild(
    speakerButton(() => {
      void services.speakLine('ln_blueprint').done;
    }),
  );
  const ok = el('button', 'btn', '✓');
  row.appendChild(ok);
  panel.appendChild(row);
  layer.root.appendChild(panel);
  const okClicked = new Promise<void>((r) => ok.addEventListener('click', () => r(), { once: true }));
  await services.speakLine('ln_blueprint').done;
  await okClicked;
  layer.close();
}
