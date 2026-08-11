// Word Loot (Phase 4.5) — your vocabulary as a bag of summonable things. Every
// noun the child successfully reads ANYWHERE (a sign, a book page, a mined node,
// a fed word) drops into the Word Bag. Open the bag and tap-read a word to summon
// its thing into the world: read HEN and a hen struts out, read LAMP and a lamp
// plops down. It's creative-mode-with-words — the bigger your reading vocabulary,
// the bigger your box of loot — and only words you've truly read are in the bag.
import type { Services } from '../services';
import { bottomLeftCluster, el, openLayer } from './dom';
import { readWordCard, requestSummon } from './widgets';

export interface Summonable {
  w: string; // decodable noun (its id === its text in the corpus)
  emoji: string;
  mob: boolean; // true = a creature that wanders; false = a prop that sits
}

// A curated bag of decodable nouns spanning the tiers, each a real thing with a
// clear emoji. Every word here is in the corpus, so it's decodable by
// construction — the bag can only ever hold words the child can actually read.
export const SUMMONABLES: Summonable[] = [
  { w: 'hen', emoji: '🐔', mob: true },
  { w: 'pup', emoji: '🐶', mob: true },
  { w: 'cat', emoji: '🐈', mob: true },
  { w: 'bug', emoji: '🐛', mob: true },
  { w: 'fox', emoji: '🦊', mob: true },
  { w: 'pig', emoji: '🐷', mob: true },
  { w: 'frog', emoji: '🐸', mob: true },
  { w: 'fish', emoji: '🐟', mob: true },
  { w: 'log', emoji: '🪵', mob: false },
  { w: 'nest', emoji: '🪺', mob: false },
  { w: 'lamp', emoji: '💡', mob: false },
  { w: 'cup', emoji: '🥤', mob: false },
  { w: 'bed', emoji: '🛏️', mob: false },
  { w: 'tent', emoji: '⛺', mob: false },
  { w: 'star', emoji: '⭐', mob: false },
  { w: 'cake', emoji: '🎂', mob: false },
  { w: 'boat', emoji: '⛵', mob: false },
  { w: 'tree', emoji: '🌳', mob: false },
];

const byWord = new Map(SUMMONABLES.map((s) => [s.w, s]));
export function summonableByWord(w: string): Summonable | undefined {
  return byWord.get(w);
}

/** The words the child has truly read — every corpus word with a correct
 *  evidence row. This is the key to the bag: reading a word ANYWHERE unlocks it. */
export function readWords(services: Services): Set<string> {
  const s = new Set<string>();
  for (const e of services.save.evidence) if (e.correct && e.wordId) s.add(e.wordId);
  return s;
}

export function mountBagButton(services: Services): void {
  const btn = el('button', 'btn ghost round bag-btn', '🎒');
  btn.title = 'Word Bag';
  bottomLeftCluster().appendChild(btn);
  btn.addEventListener('click', () => openBag(services));
}

export function openBag(services: Services): void {
  const owned = readWords(services);
  const have = SUMMONABLES.filter((s) => owned.has(s.w)).length;
  services.analytics.log('bag_opened', { owned: have, total: SUMMONABLES.length });

  const layer = openLayer();
  const panel = el('div', 'panel bag-panel');
  panel.appendChild(el('div', 'bag-title', '🎒 Word Bag'));
  panel.appendChild(el('div', 'bag-sub', `${have} / ${SUMMONABLES.length} words read — tap one to make it real!`));

  const grid = el('div', 'bag-grid');
  for (const s of SUMMONABLES) {
    const has = owned.has(s.w);
    const tok = el('button', `loot ${has ? 'owned' : 'locked'}`);
    tok.appendChild(el('div', 'loot-emoji', s.emoji));
    tok.appendChild(el('div', 'loot-word', s.w.toUpperCase()));
    if (!has) tok.appendChild(el('div', 'loot-hint', '📖'));
    if (has) {
      tok.addEventListener('click', async () => {
        // Close the bag so the child watches the thing appear in the world,
        // then read the word to summon it (reading IS the summon).
        layer.close();
        await readWordCard(services, s.w, { icon: s.emoji });
        requestSummon(s.w);
      });
    }
    grid.appendChild(tok);
  }
  panel.appendChild(grid);

  const close = el('button', 'btn bag-close', '✕');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
