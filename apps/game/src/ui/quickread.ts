// ⚡ Quick Read — the automaticity round, fluency's unbuilt half. Decoding
// builds ACCURACY (sound it out); this builds SPEED — reading words the child
// already knows by sight, fast, until they're instant. A gentle flash of words
// drawn from the child's own taught vocabulary: recognize one quickly and it
// sparks a combo; take your time and the card simply waits. Never a wrong
// answer, never a fail — just reading getting faster. Every word shown is
// decodable at the child's tier, so the iron rule holds throughout.
import { queryWords, word as getWord } from '@readquest/content';
import type { Word } from '@readquest/shared';
import type { Services } from '../services';
import type { Hud } from './hud';
import { hudMenuTray, el, openLayer, confetti } from './dom';
import { sfxReadWin, sfxReward, sfxFanfare } from '../game/sfx';

const ROUND = 8; // words per round — a short, sub-minute burst
const FAST_MS = 2600; // recognize within this → a "super-fast" spark

export function mountQuickReadButton(services: Services, hud: Hud): void {
  const btn = el('button', 'btn ghost round', '⚡');
  btn.title = 'Quick Read';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => void openQuickRead(services, hud));
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function openQuickRead(services: Services, hud: Hud): Promise<void> {
  // A shuffled handful of words the child can already read (all decodable now).
  const pool = queryWords({ withinSkills: services.save.taught, count: 300 });
  const words = shuffle(pool.slice()).slice(0, ROUND);
  if (!words.length) return;
  services.analytics.log('quickread_opened', { pool: pool.length });

  const layer = openLayer();
  let fast = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const quick = await showWord(services, layer, w, i + 1, words.length);
    if (quick) fast += 1;
    // A recognized word is a genuine reading rep — feeds readCount + deeds.
    services.recordEvidence({
      challengeType: 'sign_read', skillIds: w.skills, wordId: w.id, channel: 'recognition',
      correct: true, attemptIndex: 1, hintsUsed: 0, audioRequested: false, micUsed: false, responseMs: 0,
    });
  }
  await celebrate(services, hud, layer, words.length, fast);
  layer.close();
}

/** Show one word silently (the child recognizes it by sight, then taps). Speaks
 *  to confirm on tap, sparks if it was fast. Resolves true when it was fast. */
function showWord(services: Services, layer: ReturnType<typeof openLayer>, w: Word, n: number, total: number): Promise<boolean> {
  return new Promise((resolve) => {
    layer.root.replaceChildren();
    const panel = el('div', 'panel quickread');
    panel.appendChild(el('div', 'subtitle', `⚡ ${n} / ${total}`));
    const card = el('button', 'quickread-card');
    const wrap = el('div', 'word-big');
    for (const g of getWord(w.text).graphemes) wrap.appendChild(el('span', 'g', g.toUpperCase()));
    card.appendChild(wrap);
    panel.appendChild(card);
    panel.appendChild(el('div', 'subtitle', 'Read it, then tap! ⚡'));
    layer.root.appendChild(panel);

    const started = Date.now();
    card.addEventListener('click', () => {
      const quick = Date.now() - started <= FAST_MS;
      void services.speakWord(w.text).done; // confirm what they read
      card.classList.add('read');
      if (quick) {
        card.classList.add('spark');
        sfxReadWin();
      } else {
        sfxReward();
      }
      setTimeout(() => resolve(quick), 430); // a beat to enjoy the spark
    }, { once: true });
  });
}

async function celebrate(services: Services, hud: Hud, layer: ReturnType<typeof openLayer>, total: number, fast: number): Promise<void> {
  layer.root.replaceChildren();
  const gain = 1 + Math.floor(fast / 3); // a gem, plus a bonus for combos of 3
  const s = services.save;
  s.gems += gain;
  services.persist();
  hud.setCounts({ wood: s.wood, stone: s.stone, eggs: s.eggs, gems: s.gems, hens: null });

  const panel = el('div', 'panel quickread-done');
  panel.appendChild(el('div', 'title', '⚡ Quick Read!'));
  panel.appendChild(el('div', 'newsound-badge', '📖'));
  panel.appendChild(el('div', 'newsound-name', `${total} words read!`));
  if (fast) panel.appendChild(el('div', 'subtitle', `${fast} super-fast! ✨`));
  panel.appendChild(el('div', 'newsound-levelup', `+${gain} 💎`));
  const ok = el('button', 'btn', 'Yay! ✓');
  panel.appendChild(ok);
  layer.root.appendChild(panel);

  confetti(fast >= 4 ? 46 : 26);
  sfxFanfare();
  services.analytics.log('quickread_done', { total, fast, gain });
  await new Promise<void>((r) => ok.addEventListener('click', () => r(), { once: true }));
}
