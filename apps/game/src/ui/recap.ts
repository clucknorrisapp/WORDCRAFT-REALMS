// "Show a grown-up" (Phase 5 / backlog #5). An adult's pride is the strongest
// real-world reason a 4-9yo keeps reading, so give the child a thing to show off:
// a ⭐ recap card of everything they've done — words read, books finished, blocks
// placed, friends made, reading rank — with a big "Tell a grown-up!" button that
// reads a warm, proud summary aloud. Nothing here is a reading challenge; it's a
// celebration the child hands to a parent.
import { readerLevel } from '@readquest/content';
import type { Services } from '../services';
import { hudMenuTray, el, openLayer, confetti } from './dom';

interface Stat {
  icon: string;
  label: string;
  value: number;
}

function stats(services: Services): { rl: ReturnType<typeof readerLevel>; words: number; tiles: Stat[] } {
  const s = services.save;
  const distinctWords = new Set(s.evidence.filter((e) => e.correct && e.wordId).map((e) => e.wordId)).size;
  const rl = readerLevel(s.taught);
  const tiles: Stat[] = [
    { icon: '📖', label: 'words read', value: services.readingInteractions() },
    { icon: '🔤', label: 'different words', value: distinctWords },
    { icon: '📚', label: 'books finished', value: s.booksRead.length },
    { icon: '🧱', label: 'blocks placed', value: s.buildPlaced },
    { icon: '🐾', label: 'friends', value: s.tamed.length + s.pets.length },
    { icon: '🏅', label: 'deeds earned', value: s.deedsEarned.length },
  ];
  // A read-every-day streak, once it's going, is the proudest habit to show.
  if (s.streak >= 2) tiles.push({ icon: '🔥', label: 'day streak', value: s.streak });
  return { rl, words: services.readingInteractions(), tiles };
}

/** A warm, proud, natural-language summary for the grown-up. This is narration
 *  (spoken, not read by the child), so it isn't bound by the iron rule. */
function summaryText(services: Services): string {
  const { rl, words, tiles } = stats(services);
  const books = tiles.find((t) => t.label === 'books finished')!.value;
  const parts = [`Wow! You are a ${rl.title}, Reader Level ${rl.level}!`];
  if (words > 0) parts.push(`You have read ${words} ${words === 1 ? 'word' : 'words'}.`);
  if (books > 0) parts.push(`You finished ${books} ${books === 1 ? 'book' : 'books'}.`);
  parts.push('I am so proud of you! Show a grown-up!');
  return parts.join(' ');
}

export function mountRecapButton(services: Services): void {
  const btn = el('button', 'btn ghost round recap-btn', '⭐');
  btn.title = 'Look what I did!';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => openRecap(services));
}

export function openRecap(services: Services): void {
  const { rl, tiles } = stats(services);
  services.analytics.log('recap_opened', { level: rl.level, words: services.readingInteractions() });

  const layer = openLayer();
  const panel = el('div', 'panel recap-panel');
  panel.appendChild(el('div', 'recap-title', '⭐ Look what I did!'));
  panel.appendChild(el('div', 'recap-rank', `${rl.icon} ${rl.title} · Reader Level ${rl.level}`));

  const grid = el('div', 'recap-grid');
  for (const t of tiles) {
    const tile = el('div', 'recap-tile');
    tile.appendChild(el('div', 'recap-ico', t.icon));
    tile.appendChild(el('div', 'recap-num', String(t.value)));
    tile.appendChild(el('div', 'recap-lab', t.label));
    grid.appendChild(tile);
  }
  panel.appendChild(grid);

  const tell = el('button', 'btn recap-tell', '🔊 Tell a grown-up!');
  tell.addEventListener('click', () => {
    confetti(30);
    void services.speakText(summaryText(services)).done;
    services.analytics.log('recap_told');
  });
  panel.appendChild(tell);

  const close = el('button', 'btn ghost recap-close', '✕');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
