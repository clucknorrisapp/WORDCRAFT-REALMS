// The Library — a shelf of decodable books the child can read any time.
// Finishing a book the first time pays its reward into the world economy, so
// reading is directly, visibly rewarded (roadmap: reading IS the mechanic).
import { allBooks } from '@readquest/content';
import type { Book } from '@readquest/shared';
import type { Services } from '../services';
import type { Hud } from './hud';
import { el, floatNote, openLayer } from './dom';
import { openBook, REWARD_ICON } from './book-reader';
import { QuestStep } from '../types';

const REWARD_FIELD: Record<Book['reward'], 'wood' | 'stone' | 'eggs' | 'gems'> = {
  wood: 'wood',
  stone: 'stone',
  egg: 'eggs',
  gem: 'gems',
};

/** Mount the floating 📚 button that opens the Library. Kid-facing: a single
 *  tap (unlike the grown-up gate, which is press-and-hold). */
export function mountLibraryButton(services: Services, hud: Hud): void {
  const wrap = el('div', 'hud-left');
  const btn = el('button', 'btn ghost round', '📚');
  btn.title = 'Read a book';
  wrap.appendChild(btn);
  // A soft "new!" dot until they have opened the Library at least once.
  const dot = el('span', 'lib-dot');
  if (services.save.booksRead.length === 0) btn.appendChild(dot);
  document.getElementById('overlay')!.appendChild(wrap);

  btn.addEventListener('click', () => {
    dot.remove();
    void openLibrary(services, hud);
  });
}

function syncHud(services: Services, hud: Hud): void {
  const s = services.save;
  const hens = s.questStep === QuestStep.HUNT ? s.hensFound.length : null;
  hud.setCounts({ wood: s.wood, stone: s.stone, eggs: s.eggs, gems: s.gems, hens });
}

export async function openLibrary(services: Services, hud: Hud): Promise<void> {
  services.analytics.log('library_opened', { read: services.save.booksRead.length });
  const layer = openLayer();
  const panel = el('div', 'panel library');
  panel.appendChild(el('h2', '', '📚 My Books'));

  const shelf = el('div', 'shelf');
  panel.appendChild(shelf);

  const renderShelf = () => {
    shelf.innerHTML = '';
    for (const b of allBooks()) {
      const read = services.save.booksRead.includes(b.id);
      const card = el('button', 'book-spine' + (read ? ' read' : ''));
      card.appendChild(el('div', 'book-emoji', b.cover));
      card.appendChild(el('div', 'book-spine-title', b.title));
      const badge = el('div', 'book-badge', read ? '✓' : `${REWARD_ICON[b.reward]}`);
      badge.title = read ? 'Read!' : `Reward: ${b.reward}`;
      card.appendChild(badge);
      card.addEventListener('click', () => void readBook(services, hud, b, renderShelf, panel));
      shelf.appendChild(card);
    }
  };
  renderShelf();

  const close = el('button', 'btn', 'Close');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}

async function readBook(
  services: Services,
  hud: Hud,
  book: Book,
  rerender: () => void,
  libraryPanel: HTMLElement,
): Promise<void> {
  // Hide the shelf while the reader is up (openBook opens its own layer).
  libraryPanel.style.visibility = 'hidden';
  const finished = await openBook(services, book);
  libraryPanel.style.visibility = 'visible';

  if (finished && !services.save.booksRead.includes(book.id)) {
    // First finish → pay the reward once.
    services.save.booksRead.push(book.id);
    const field = REWARD_FIELD[book.reward];
    services.save[field] += 1;
    services.persist();
    syncHud(services, hud);
    floatNote(`+1 ${REWARD_ICON[book.reward]}`, window.innerWidth / 2, window.innerHeight * 0.4);
  }
  // Re-reads are free and unrewarded — no branch needed.
  rerender();
}
