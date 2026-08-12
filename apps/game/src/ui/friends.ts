// The Friends Book (Phase 3.3) — an album of every creature. Tamed friends show
// in colour with their name; still-wild-but-readable ones show as a "?" with the
// word to read to tame them; species whose name isn't decodable yet stay locked
// until the child's reading unlocks them. The book fills as the child reads.
import type { Services } from '../services';
import { hudMenuTray, el, openLayer } from './dom';
import { CREATURES, readableCreatures } from './creatures';
import { openPetCard, petCareOf } from './petcare';

export function mountFriendsButton(services: Services): void {
  const btn = el('button', 'btn ghost round', '🐾');
  btn.title = 'Friends Book';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => openFriends(services));
}

export function openFriends(services: Services): void {
  const tamed = new Set(services.save.tamed ?? []);
  services.analytics.log('friends_opened', { tamed: tamed.size });
  const layer = openLayer();
  const panel = el('div', 'panel friends');
  panel.appendChild(el('h2', '', '🐾 Friends Book'));
  panel.appendChild(el('div', 'subtitle', `${tamed.size} of ${CREATURES.length} friends found`));

  const readable = new Set(readableCreatures(services).map((c) => c.id));
  const grid = el('div', 'friends-grid');
  // Repaint the grid in place so a pet named/fed on the card above reflects the
  // instant that card closes (nick + bond hearts) — no stale "Tap to name!".
  const paintGrid = (): void => {
    grid.replaceChildren();
    for (const c of CREATURES) {
      const got = tamed.has(c.id);
      const wild = !got && readable.has(c.id);
      // A tamed friend is a button — tap to name it and grow its bond by reading.
      const cell = el(got ? 'button' : 'div', 'friend' + (got ? ' got' : wild ? ' wild' : ' locked'));
      cell.appendChild(el('div', 'friend-emoji', got ? c.emoji : wild ? '❓' : '🔒'));
      const care = got ? petCareOf(services, c.id) : undefined;
      cell.appendChild(el('div', 'friend-name', care ? care.nick.toUpperCase() : got || wild ? c.name.toUpperCase() : '???'));
      if (care) {
        // Show the bond as hearts so the collection goal is visible at a glance.
        const hearts = el('div', 'friend-hearts');
        for (let i = 0; i < 5; i++) hearts.appendChild(el('span', 'heart', i < care.bond ? '❤️' : '🤍'));
        cell.appendChild(hearts);
      } else {
        cell.appendChild(el('div', 'friend-hint', got ? 'Tap to name!' : wild ? 'Read to tame' : 'New sounds…'));
      }
      if (got) cell.addEventListener('click', () => openPetCard(services, c, paintGrid));
      grid.appendChild(cell);
    }
  };
  paintGrid();
  panel.appendChild(grid);

  const close = el('button', 'btn', 'Close');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
