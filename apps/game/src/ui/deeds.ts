// Deeds — the game's "advancements": a wall of one-time achievements that make
// progress feel collectible (Minecraft's advancement tree, kid-sized). Every
// deed is earned by DOING (reading, building, exploring, feeding the dragon),
// so the reward layer always points back at reading. Earning one throws a warm
// celebration; a 🏅 button opens the wall to review earned + locked deeds.
import { curriculum, readerLevel } from '@readquest/content';
import type { Services } from '../services';
import { bottomLeftCluster, confetti, el, isUiOpen, openLayer, wait } from './dom';
import { sfxFanfare, sfxUnlock } from '../game/sfx';
import { QuestStep } from '../types';

export interface Deed {
  id: string;
  icon: string;
  title: string;
  hint: string; // kid-facing "how to earn it" (shown while locked)
  done: (s: Services) => boolean;
}

// Spread across every activity so there's always a next deed within reach.
// Ordered easy → hard so the wall reads as a ladder.
export const DEEDS: Deed[] = [
  { id: 'read_first', icon: '📖', title: 'First Word', hint: 'Read your first word.', done: (s) => s.readingInteractions() >= 1 },
  { id: 'build_first', icon: '🧱', title: 'Builder', hint: 'Place a block.', done: (s) => s.save.buildPlaced >= 1 },
  { id: 'dragon_feed', icon: '🐉', title: 'Dragon Pal', hint: 'Feed your dragon.', done: (s) => s.save.dragonXp >= 1 },
  { id: 'read_ten', icon: '📚', title: 'Word Muncher', hint: 'Read 10 words.', done: (s) => s.readingInteractions() >= 10 },
  { id: 'glint_first', icon: '✨', title: 'Treasure', hint: 'Find a sparkle cache.', done: (s) => s.save.glintsFound.length >= 1 },
  { id: 'book_first', icon: '📕', title: 'Bookworm', hint: 'Finish a book.', done: (s) => s.save.booksRead.length >= 1 },
  { id: 'new_sounds', icon: '🔤', title: 'New Sounds', hint: 'Unlock a new sound.', done: (s) => s.save.taught.length > curriculum.initialTaught.length },
  { id: 'build_ten', icon: '🏗️', title: 'Big Builder', hint: 'Place 10 blocks.', done: (s) => s.save.buildPlaced >= 10 },
  { id: 'read_fifty', icon: '🦉', title: 'Word Owl', hint: 'Read 50 words.', done: (s) => s.readingInteractions() >= 50 },
  { id: 'glint_five', icon: '💎', title: 'Gem Hunter', hint: 'Find 5 sparkle caches.', done: (s) => s.save.glintsFound.length >= 5 },
  { id: 'reader_three', icon: '🏅', title: 'Rising Reader', hint: 'Reach Reader Level 3.', done: (s) => readerLevel(s.save.taught).level >= 3 },
  { id: 'read_hundred', icon: '🌟', title: 'Word Star', hint: 'Read 100 words.', done: (s) => s.readingInteractions() >= 100 },
];

/** Award any newly-satisfied deeds NOW (synchronous: records + persists before
 *  any await, so concurrent callers never double-award). Returns the fresh set
 *  so the caller can celebrate them. */
export function evaluateDeeds(services: Services): Deed[] {
  const earned = services.save.deedsEarned;
  const fresh: Deed[] = [];
  for (const d of DEEDS) {
    if (earned.includes(d.id)) continue;
    if (d.done(services)) {
      earned.push(d.id);
      fresh.push(d);
      services.analytics.log('deed_earned', { id: d.id });
    }
  }
  if (fresh.length) services.persist();
  return fresh;
}

// Celebrations drain one-at-a-time through a queue and show as NON-MODAL
// banners: a deed is a secondary reward, so it must never demand a tap or block
// the world (that would collide with a reading moment or a "New Sounds" card).
// The banner waits for a UI-free beat, floats in at the top, and fades itself.
const pending: Deed[] = [];
let draining = false;

export async function checkDeeds(services: Services): Promise<void> {
  // Deeds are the free-play progression layer. The scripted intro has its own
  // rich celebrations, so deeds are silent there; on reaching free play the
  // first check batches everything earned so far into one warm banner.
  if (services.save.questStep !== QuestStep.FREE_PLAY) return;
  pending.push(...evaluateDeeds(services));
  if (draining || pending.length === 0) return;
  draining = true;
  try {
    while (pending.length) {
      for (let i = 0; isUiOpen() && i < 40; i++) await wait(250); // let any reading card finish first
      if (pending.length >= 3) {
        const batch = pending.splice(0, pending.length);
        await deedBanner(services, '🏅', `You earned ${batch.length} deeds!`, 'Tap 🏅 to see them', true);
      } else {
        const d = pending.shift()!;
        await deedBanner(services, d.icon, `New Deed: ${d.title}!`, d.hint, false);
      }
    }
  } finally {
    draining = false;
  }
}

/** A warm, self-dismissing top banner. Non-modal — never blocks world input. */
async function deedBanner(services: Services, icon: string, title: string, sub: string, big: boolean): Promise<void> {
  const layer = openLayer({ scrim: false, modal: false });
  const box = el('div', 'deed-toast');
  box.appendChild(el('span', 'deed-toast-icon', icon));
  const txt = el('div', 'deed-toast-text');
  txt.appendChild(el('div', 'deed-toast-title', title));
  txt.appendChild(el('div', 'deed-toast-sub', sub));
  box.appendChild(txt);
  layer.root.appendChild(box);
  confetti(big ? 46 : 28);
  if (big) sfxFanfare();
  else sfxUnlock();
  void services.speakText(title).done;
  box.animate(
    [
      { transform: 'translateY(-90px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2,0.8,0.3,1.2)', fill: 'forwards' },
  );
  await wait(2300);
  await box.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-30px)' }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
  layer.close();
}

/** The deed wall: earned deeds in colour, locked ones as 🔒 with their hint. */
export function openDeeds(services: Services): void {
  const earnedCount = DEEDS.filter((d) => services.save.deedsEarned.includes(d.id)).length;
  services.analytics.log('deeds_opened', { earned: earnedCount });
  const layer = openLayer();
  const panel = el('div', 'panel deeds');
  panel.appendChild(el('h2', '', '🏅 My Deeds'));
  panel.appendChild(el('div', 'subtitle', `${earnedCount} of ${DEEDS.length} earned`));
  const grid = el('div', 'deeds-grid');
  for (const d of DEEDS) {
    const got = services.save.deedsEarned.includes(d.id);
    const cell = el('div', 'deed' + (got ? ' got' : ' locked'));
    cell.appendChild(el('div', 'deed-icon', got ? d.icon : '🔒'));
    cell.appendChild(el('div', 'deed-title', d.title));
    cell.appendChild(el('div', 'deed-hint', got ? 'Done! ✓' : d.hint));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
  const close = el('button', 'btn', 'Close');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}

/** Mount the floating 🏅 button that opens the deed wall. */
export function mountDeedsButton(services: Services): void {
  const btn = el('button', 'btn ghost round', '🏅');
  btn.title = 'My deeds';
  bottomLeftCluster().appendChild(btn);
  btn.addEventListener('click', () => openDeeds(services));
}
