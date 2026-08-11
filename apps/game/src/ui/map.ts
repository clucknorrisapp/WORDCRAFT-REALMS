// Fog-of-war map + fast travel (Phase 4.4). A 🗺️ button opens a pixel-parchment
// of the whole kingdom. Unwalked land is dark fog; regions you've entered show
// dim, with their name in faded letters. READING a region's name claims it — it
// flares gold, plants a flag, and becomes a fast-travel pin (tap to whoosh
// there). Over weeks a black map turns into a glowing, fully-claimed kingdom, so
// the map is a running scoreboard of the words the child has conquered.
import type { Services } from '../services';
import { bottomLeftCluster, el, openLayer } from './dom';
import { readWordCard, requestFastTravel, peekPlayer } from './widgets';
import { REGIONS, regionClaimable, MAP_W, MAP_H, type Region } from '../game/regions';
import { sfxUnlock } from '../game/sfx';

export function mountMapButton(services: Services): void {
  const btn = el('button', 'btn ghost round map-btn', '🗺️');
  btn.title = 'Kingdom map';
  bottomLeftCluster().appendChild(btn); // next to the compass in the HUD cluster
  btn.addEventListener('click', () => openMap(services));
}

export function openMap(services: Services): void {
  services.analytics.log('map_opened', {
    seen: services.save.mapSeen.length,
    claimed: services.save.mapClaimed.length,
  });
  const layer = openLayer();
  const panel = el('div', 'panel map-panel');
  panel.appendChild(el('div', 'map-title', '🗺️ Your Kingdom'));

  // Fit the whole world into a board that respects small screens.
  const bw = Math.min(window.innerWidth * 0.82, 600);
  const scale = bw / MAP_W;
  const bh = MAP_H * scale;
  const board = el('div', 'map-board');
  board.style.width = `${bw}px`;
  board.style.height = `${bh}px`;

  const claimedCount = () => services.save.mapClaimed.length;
  const tally = el('div', 'map-tally', tallyText());
  function tallyText(): string {
    return `🚩 ${claimedCount()} / ${REGIONS.length} lands claimed`;
  }

  const paint = (cell: HTMLElement, r: Region): void => {
    const seen = services.save.mapSeen.includes(r.id);
    const claimed = services.save.mapClaimed.includes(r.id);
    cell.className = 'map-region';
    cell.textContent = '';
    if (!seen) {
      cell.classList.add('fog');
      return; // unwalked: pure dark fog, no name given away
    }
    if (claimed) {
      cell.classList.add('claimed');
      cell.appendChild(el('div', 'map-flag', '🚩'));
      cell.appendChild(el('div', 'map-name', r.name.toUpperCase()));
      cell.title = `Fly to ${r.name}`;
      return;
    }
    // Seen but unclaimed: dim, name shown faint. Claimable → glow + invite a read.
    cell.classList.add('seen');
    const claimable = regionClaimable(services, r);
    cell.appendChild(el('div', 'map-name', r.name.toUpperCase()));
    if (claimable) {
      cell.classList.add('can-claim');
      cell.appendChild(el('div', 'map-hint', '📖 read'));
    } else {
      cell.classList.add('locked');
      cell.appendChild(el('div', 'map-hint', '🔒'));
    }
  };

  const cells = new Map<string, HTMLElement>();
  for (const r of REGIONS) {
    const cell = el('button', 'map-region');
    cell.dataset.region = r.id;
    cell.style.left = `${r.x * scale}px`;
    cell.style.top = `${r.y * scale}px`;
    cell.style.width = `${r.w * scale}px`;
    cell.style.height = `${r.h * scale}px`;
    paint(cell, r);
    cell.addEventListener('click', () => onRegionTap(r, cell));
    cells.set(r.id, cell);
    board.appendChild(cell);
  }

  // "You are here" — a pulsing dot at the player's scaled world position.
  const you = el('div', 'map-you', '🧍');
  const pos = peekPlayer();
  you.style.left = `${pos.x * scale}px`;
  you.style.top = `${pos.y * scale}px`;
  board.appendChild(you);

  async function onRegionTap(r: Region, cell: HTMLElement): Promise<void> {
    const seen = services.save.mapSeen.includes(r.id);
    if (!seen) return; // can't interact with fog
    if (services.save.mapClaimed.includes(r.id)) {
      // Claimed → fast travel. Close the map and whoosh there.
      services.analytics.log('fast_travel', { region: r.id });
      layer.close();
      requestFastTravel(r.anchor.x, r.anchor.y);
      return;
    }
    if (!regionClaimable(services, r)) return; // locked: keep reading to unlock
    // Claim it by reading its name aloud.
    await readWordCard(services, r.name, { icon: '🗺️' });
    if (!services.save.mapClaimed.includes(r.id)) {
      services.save.mapClaimed.push(r.id);
      services.persist();
    }
    services.analytics.log('region_claimed', { region: r.id });
    sfxUnlock();
    cell.classList.add('flare');
    paint(cell, r);
    tally.textContent = tallyText();
  }

  const close = el('button', 'btn map-close', '✕');
  close.addEventListener('click', () => layer.close());

  panel.appendChild(board);
  panel.appendChild(tally);
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
