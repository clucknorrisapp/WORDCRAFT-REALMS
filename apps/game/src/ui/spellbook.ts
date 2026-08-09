// The Spellbook — the child collects "power words" and casts them by reading.
// Spells unlock through reading: one starter spell, then one more for every
// book finished in the Library. Casting is a voice-first reading moment
// (see castSpell) with a themed magical payoff. This is the product thesis
// made playful: reading literally casts magic.
import { allSpells } from '@readquest/content';
import type { Spell } from '@readquest/shared';
import type { Services } from '../services';
import { bottomLeftCluster, el, openLayer } from './dom';
import { castSpell } from './widgets';

/** How many spells are unlocked: a starter + one per book read (capped). */
export function unlockedCount(services: Services): number {
  return Math.min(allSpells().length, 1 + services.save.booksRead.length);
}

/** The spells the child can currently cast. */
export function unlockedSpells(services: Services): Spell[] {
  return allSpells().slice(0, unlockedCount(services));
}

/** The spell a freshly-finished book unlocks, if any (for the toast in the
 *  Library). booksReadAfter is booksRead.length after the finish. */
export function spellUnlockedByBook(booksReadAfter: number): Spell | null {
  const idx = booksReadAfter; // starter is index 0; book N unlocks index N
  const spells = allSpells();
  return idx > 0 && idx < spells.length ? spells[idx]! : null;
}

function hasCastAny(services: Services): boolean {
  return services.save.evidence.some((e) => e.challengeType === 'spell_cast');
}

export function mountSpellbookButton(services: Services): void {
  const btn = el('button', 'btn ghost round', '✨');
  btn.title = 'Cast a spell';
  const dot = el('span', 'lib-dot');
  // Nudge only once they have a spell and have never cast one.
  if (!hasCastAny(services)) btn.appendChild(dot);
  bottomLeftCluster().appendChild(btn);

  btn.addEventListener('click', () => {
    dot.remove();
    void openSpellbook(services);
  });
}

export async function openSpellbook(services: Services): Promise<void> {
  services.analytics.log('spellbook_opened', { unlocked: unlockedCount(services) });
  const layer = openLayer();
  const panel = el('div', 'panel spellbook');
  panel.appendChild(el('h2', '', '✨ My Spells'));
  const allKnown = unlockedCount(services) >= allSpells().length;
  panel.appendChild(
    el('div', 'subtitle', allKnown ? 'You know every spell! ✨' : 'Read a book to learn a new spell!'),
  );

  const grid = el('div', 'spell-grid');
  panel.appendChild(grid);

  const render = () => {
    grid.innerHTML = '';
    const unlocked = unlockedCount(services);
    allSpells().forEach((sp, i) => {
      if (i < unlocked) {
        const card = el('button', 'spell-card');
        card.style.setProperty('--hue', sp.hue);
        card.appendChild(el('div', 'spell-emoji', sp.icon));
        card.appendChild(el('div', 'spell-word', sp.word.toUpperCase()));
        card.addEventListener('click', () => void cast(services, sp, render, panel));
        grid.appendChild(card);
      } else {
        const locked = el('div', 'spell-card locked');
        locked.appendChild(el('div', 'spell-emoji', '🔒'));
        locked.appendChild(el('div', 'spell-word', '???'));
        grid.appendChild(locked);
      }
    });
  };
  render();

  const close = el('button', 'btn', 'Close');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}

async function cast(services: Services, sp: Spell, rerender: () => void, panel: HTMLElement): Promise<void> {
  panel.style.visibility = 'hidden';
  await castSpell(services, sp);
  panel.style.visibility = 'visible';
  rerender();
}
