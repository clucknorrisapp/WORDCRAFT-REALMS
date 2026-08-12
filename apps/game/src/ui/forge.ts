// 🔨 Word Forge — encoding, the mirror of decoding. Every other activity asks
// the child to READ a word (sounds → meaning); the Forge asks them to BUILD one
// (sounds → spelling). Hearing a word, they place its sound-tiles in order to
// spell it. Encoding and decoding reinforce the same orthographic map from both
// directions — spelling a word cements reading it. No-fail: a wrong tile just
// bounces back, the next-needed tile gently pulses to help, and the word is
// always completable. Words are drawn from the child's own taught, decodable
// vocabulary and built only from taught graphemes, so the iron rule holds.
import { queryWords, word as getWord } from '@readquest/content';
import type { Word } from '@readquest/shared';
import type { Services } from '../services';
import type { Hud } from './hud';
import { hudMenuTray, el, openLayer, confetti, speakerButton, wait } from './dom';
import { sfxPlace, sfxReadWin, sfxFanfare, sfxMiss } from '../game/sfx';
import { checkDeeds } from './deeds';

const ROUND = 4; // words forged per session
// Plausible single-letter distractor tiles (all base-tier graphemes, so adding
// them to the tray never shows an untaught grapheme).
const DISTRACTORS = ['m', 's', 't', 'p', 'n', 'b', 'd', 'g', 'f', 'h', 'l', 'r', 'k', 'j'];

export function mountForgeButton(services: Services, hud: Hud): void {
  const btn = el('button', 'btn ghost round', '🔨');
  btn.title = 'Word Forge';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => void openForge(services, hud));
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function openForge(services: Services, hud: Hud): Promise<void> {
  // Short, spellable words the child can already read (2–4 graphemes keeps the
  // encoding load right for a young speller).
  const pool = queryWords({ withinSkills: services.save.taught, count: 300 })
    .filter((w) => { const g = getWord(w.text).graphemes.length; return g >= 2 && g <= 4; });
  const words = shuffle(pool.slice()).slice(0, ROUND);
  if (!words.length) return;
  services.analytics.log('forge_opened', { pool: pool.length });

  const layer = openLayer();
  let built = 0;
  for (const w of words) {
    await forgeWord(services, layer, w);
    built += 1;
    services.recordEvidence({
      challengeType: 'blending_forge', skillIds: w.skills, wordId: w.id, channel: 'production',
      correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: false, responseMs: 0,
    });
  }
  await celebrate(services, hud, layer, built);
  layer.close();
}

/** Spell one word: hear it, then tap its sound-tiles in order into the slots. */
function forgeWord(services: Services, layer: ReturnType<typeof openLayer>, w: Word): Promise<void> {
  return new Promise((resolve) => {
    const graphemes = getWord(w.text).graphemes;
    layer.root.replaceChildren();
    const panel = el('div', 'panel forge');
    panel.appendChild(el('div', 'subtitle', '🔨 Build the word!'));
    // Say-it button — the only cue to the target (audio-first, no text spoiler).
    panel.appendChild(speakerButton(() => void services.speakWord(w.text).done));

    // Blank slots, one per grapheme.
    const slots: HTMLElement[] = [];
    const slotRow = el('div', 'forge-slots');
    for (let i = 0; i < graphemes.length; i++) {
      const slot = el('div', 'forge-slot');
      slots.push(slot);
      slotRow.appendChild(slot);
    }
    panel.appendChild(slotRow);

    // Tile tray: the word's graphemes + two distractors, shuffled.
    const distractors = shuffle(DISTRACTORS.filter((d) => !graphemes.includes(d))).slice(0, 2);
    const tiles = shuffle([...graphemes, ...distractors]);
    const tray = el('div', 'forge-tray');
    let next = 0; // index of the next grapheme to place
    const tileEls: HTMLElement[] = [];

    const hintTimer = { id: 0 as ReturnType<typeof setTimeout> | 0 };
    const armHint = () => {
      if (hintTimer.id) clearTimeout(hintTimer.id);
      // After a pause, pulse a correct tile for the next slot (gentle scaffold).
      hintTimer.id = setTimeout(() => {
        const want = graphemes[next];
        tileEls.forEach((t) => { if (t.dataset.g === want && !t.classList.contains('used')) t.classList.add('hint'); });
      }, 3200);
    };

    for (const g of tiles) {
      const tile = el('button', 'forge-tile', g.toUpperCase());
      tile.dataset.g = g;
      tile.addEventListener('click', () => {
        if (tile.classList.contains('used')) return;
        if (g === graphemes[next]) {
          // Correct: snap it into the next slot.
          tile.classList.add('used');
          tile.classList.remove('hint');
          const slot = slots[next]!;
          slot.textContent = g.toUpperCase();
          slot.classList.add('filled');
          next += 1;
          sfxPlace();
          tileEls.forEach((t) => t.classList.remove('hint'));
          if (next >= graphemes.length) {
            // Word complete — read it back proudly, then move on.
            sfxReadWin();
            void services.speakWord(w.text).done;
            slots.forEach((s) => s.classList.add('win'));
            if (hintTimer.id) clearTimeout(hintTimer.id);
            setTimeout(() => resolve(), 620);
          } else {
            armHint();
          }
        } else {
          // Wrong tile: a gentle bounce, no penalty.
          tile.classList.add('wrong');
          sfxMiss();
          setTimeout(() => tile.classList.remove('wrong'), 360);
        }
      });
      tileEls.push(tile);
      tray.appendChild(tile);
    }
    panel.appendChild(tray);
    layer.root.appendChild(panel);
    void services.speakWord(w.text).done; // say the target on open
    armHint();
  });
}

async function celebrate(services: Services, hud: Hud, layer: ReturnType<typeof openLayer>, built: number): Promise<void> {
  layer.root.replaceChildren();
  const gain = 1 + Math.floor(built / 2);
  const s = services.save;
  s.gems += gain;
  services.persist();
  hud.setCounts({ wood: s.wood, stone: s.stone, eggs: s.eggs, gems: s.gems, hens: null });

  const panel = el('div', 'panel forge-done');
  panel.appendChild(el('div', 'title', '🔨 Word Forge!'));
  panel.appendChild(el('div', 'newsound-badge', '🔤'));
  panel.appendChild(el('div', 'newsound-name', `${built} words built!`));
  panel.appendChild(el('div', 'newsound-levelup', `+${gain} 💎`));
  const ok = el('button', 'btn', 'Yay! ✓');
  panel.appendChild(ok);
  layer.root.appendChild(panel);

  confetti(built >= 4 ? 44 : 26);
  sfxFanfare();
  await wait(50);
  services.analytics.log('forge_done', { built, gain });
  await new Promise<void>((r) => ok.addEventListener('click', () => r(), { once: true }));
  void checkDeeds(services); // building words may have earned a Word Smith deed
}
