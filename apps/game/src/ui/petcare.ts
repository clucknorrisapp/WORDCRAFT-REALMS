// Named pets & the care loop (#9) — the tamest, most Minecraft-like reward.
// A friend the child tamed by reading its species name can be ADOPTED: given a
// name (read a name word) and FED (read a food word) to grow a bond of hearts.
// Every step is a reading moment — naming and feeding run the child's reading
// record forward through the same readWordCard flow every sign uses — and the
// once-a-day feed is a gentle, decodable reason to come back and read tomorrow.
import { validateText } from '@readquest/content';
import type { Services } from '../services';
import type { PetCare } from '../types';
import type { Creature } from './creatures';
import { el, openLayer, confetti } from './dom';
import { readWordCard } from './widgets';
import { todayKey } from './daily';
import { sfxReward } from '../game/sfx';

// Short, decodable words that read like names. Filtered to the child's tier, so
// a brand-new reader still sees the handful they can sound out (pat, bud, …).
const NAME_POOL = ['bud', 'pat', 'jet', 'dot', 'kit', 'peg'];
// Decodable foods. One is drawn per feed; all are gated to the child's tier.
const FOOD_POOL = ['ham', 'egg', 'nut', 'fig', 'bun', 'jam', 'seed', 'bean', 'meat'];
const MAX_BOND = 5;

/** Words from a pool the child can read right now (iron rule holds everywhere). */
function readable(pool: string[], services: Services): string[] {
  return pool.filter((w) => validateText(w, services.save.taught).ok);
}

/** The pet's care record, or undefined if this friend hasn't been adopted yet. */
export function petCareOf(services: Services, id: string): PetCare | undefined {
  return services.save.petCare?.[id];
}

/** How many pets the child has grown to a full 5-heart bond — "best friends". */
export function bestFriendCount(services: Services): number {
  const care = services.save.petCare ?? {};
  return Object.values(care).filter((p) => p.bond >= MAX_BOND).length;
}

/** Open the care card for one tamed creature: name it, then feed it daily to
 *  grow the bond. Re-renders itself after each reading moment. `onClose` fires
 *  when the card is dismissed, so the Friends Book behind it can repaint. */
export function openPetCard(services: Services, creature: Creature, onClose?: () => void): void {
  const layer = openLayer();
  const dismiss = (): void => {
    layer.close();
    onClose?.();
  };

  const render = (): void => {
    layer.root.replaceChildren();
    const care = petCareOf(services, creature.id);
    const panel = el('div', 'panel pet-card');

    panel.appendChild(el('div', 'pet-face', creature.emoji));

    if (!care) {
      // ── Adopt: read a name to give this friend its name ──────────────────
      panel.appendChild(el('div', 'pet-name', creature.name.toUpperCase()));
      panel.appendChild(el('div', 'subtitle', 'Name your friend!'));
      const names = readable(NAME_POOL, services);
      const row = el('div', 'pet-names');
      for (const nm of names) {
        const card = el('button', 'name-card', nm);
        card.dataset.name = nm;
        card.addEventListener('click', () => void adopt(nm));
        row.appendChild(card);
      }
      panel.appendChild(row);
    } else {
      // ── Named: show the bond hearts and today's feed ─────────────────────
      panel.appendChild(el('div', 'pet-nick', `🏷️ ${care.nick.toUpperCase()}`));
      const hearts = el('div', 'pet-hearts');
      for (let i = 0; i < MAX_BOND; i++) hearts.appendChild(el('span', 'heart', i < care.bond ? '❤️' : '🤍'));
      panel.appendChild(hearts);

      if (care.bond >= MAX_BOND) {
        panel.appendChild(el('div', 'pet-best', '⭐ Best Friend! ⭐'));
      }

      const fedToday = care.fedOn === todayKey();
      if (fedToday) {
        panel.appendChild(el('div', 'subtitle pet-fed', `${care.nick.toUpperCase()} is full! Come back tomorrow 🌙`));
      } else if (readable(FOOD_POOL, services).length) {
        const feed = el('button', 'btn feed-btn', `🍖 Feed ${care.nick.toUpperCase()}`);
        feed.addEventListener('click', () => void feedPet());
        panel.appendChild(feed);
      }
    }

    const close = el('button', 'btn ghost', 'Close');
    close.addEventListener('click', dismiss);
    panel.appendChild(close);
    layer.root.appendChild(panel);
  };

  // Reading the chosen name adopts the pet (bond starts empty — feeding grows it).
  const adopt = async (nm: string): Promise<void> => {
    await readWordCard(services, nm, { icon: '🏷️' });
    services.save.petCare = { ...(services.save.petCare ?? {}), [creature.id]: { nick: nm, bond: 0, fedOn: '' } };
    services.persist();
    services.analytics.log('pet_named', { creature: creature.id, nick: nm });
    confetti(30);
    sfxReward();
    render();
  };

  // Reading a food word feeds the pet: one bond heart, once per day.
  const feedPet = async (): Promise<void> => {
    const foods = readable(FOOD_POOL, services);
    if (!foods.length) return;
    // Vary the food by how many times we've fed so it isn't always the same word.
    const care = petCareOf(services, creature.id)!;
    const food = foods[care.bond % foods.length]!;
    await readWordCard(services, food, { icon: '🍖' });
    const bond = Math.min(MAX_BOND, care.bond + 1);
    services.save.petCare = { ...services.save.petCare, [creature.id]: { ...care, bond, fedOn: todayKey() } };
    services.persist();
    services.analytics.log('pet_fed', { creature: creature.id, bond });
    confetti(bond >= MAX_BOND ? 44 : 24);
    sfxReward();
    render();
  };

  render();
}
