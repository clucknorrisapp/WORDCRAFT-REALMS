// The Friends Book (Phase 3.3) — an album of every creature. Tamed friends show
// in colour with their name; still-wild-but-readable ones show as a "?" with the
// word to read to tame them; species whose name isn't decodable yet stay locked
// until the child's reading unlocks them. The book fills as the child reads.
import type { Services } from '../services';
import { hudMenuTray, el, openLayer } from './dom';
import { CREATURES, readableCreatures } from './creatures';

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
  for (const c of CREATURES) {
    const got = tamed.has(c.id);
    const wild = !got && readable.has(c.id);
    const cell = el('div', 'friend' + (got ? ' got' : wild ? ' wild' : ' locked'));
    cell.appendChild(el('div', 'friend-emoji', got ? c.emoji : wild ? '❓' : '🔒'));
    cell.appendChild(el('div', 'friend-name', got || wild ? c.name.toUpperCase() : '???'));
    cell.appendChild(el('div', 'friend-hint', got ? 'Friend! ✓' : wild ? 'Read to tame' : 'New sounds…'));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);

  const close = el('button', 'btn', 'Close');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
