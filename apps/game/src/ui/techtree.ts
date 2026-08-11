// Smelting chains + the Tech-Tree board (Phase 4.1). The board makes the
// invisible reading engine visible as a reading elevator you climb: nodes are
// grouped into "ages" (Gather → Read → Craft → Smelt), owned ones shown in
// colour, readable-now ones glowing with their word/recipe, and future ones as
// locked ghosts. Every link is its own decodable phrase read at the node
// (sentence_read) — so climbing the tree equals reading more connected text,
// always as "cook this, then build that," never a drill. Nodes unlock strictly
// by validateText, so the ladder can never outrun what the child can read.
import { allBlocks, validateText } from '@readquest/content';
import type { BuildBlock } from '@readquest/shared';
import type { Services } from '../services';
import { bottomLeftCluster, el, openLayer } from './dom';
import { isBlockUnlocked, unlockPlainBlock, craftBlock } from './build';

const byId = (id: string): BuildBlock | undefined => allBlocks().find((b) => b.id === id);

/** A node's "age": gather (starter) → read (plain word) → craft (from base
 *  blocks) → smelt (a chain — an ingredient is itself crafted). */
function ageOf(b: BuildBlock): number {
  if (b.starter) return 1;
  if (!b.recipe) return 2;
  const chained = (b.from ?? []).some((id) => byId(id)?.recipe);
  return chained ? 4 : 3;
}

const AGES = [
  { n: 1, title: '⛏️ Gather' },
  { n: 2, title: '📖 Read' },
  { n: 3, title: '🛠 Craft' },
  { n: 4, title: '🔥 Smelt' },
];

type NodeState = 'owned' | 'ready' | 'locked';
function nodeState(services: Services, b: BuildBlock): NodeState {
  if (isBlockUnlocked(services, b)) return 'owned';
  if (!b.recipe) return validateText(b.word, services.save.taught).ok ? 'ready' : 'locked';
  const ingredientsReady = (b.from ?? []).every((id) => {
    const fb = byId(id);
    return fb && isBlockUnlocked(services, fb);
  });
  return ingredientsReady && validateText(b.recipe, services.save.taught).ok ? 'ready' : 'locked';
}

export function mountTechTreeButton(services: Services): void {
  const btn = el('button', 'btn ghost round tech-btn', '🧪');
  btn.title = 'Tech Tree';
  bottomLeftCluster().appendChild(btn);
  btn.addEventListener('click', () => openTechTree(services));
}

export function openTechTree(services: Services): void {
  const owned = allBlocks().filter((b) => isBlockUnlocked(services, b)).length;
  services.analytics.log('techtree_opened', { owned, total: allBlocks().length });

  const layer = openLayer();
  const panel = el('div', 'panel tech-panel');
  panel.appendChild(el('div', 'tech-title', '🧪 Tech Tree'));
  panel.appendChild(el('div', 'tech-sub', 'Read to climb — each new sound opens a new age of things to make.'));
  const scroll = el('div', 'tech-scroll');
  panel.appendChild(scroll);

  const render = (): void => {
    scroll.textContent = '';
    for (const age of AGES) {
      const inAge = allBlocks().filter((b) => ageOf(b) === age.n);
      if (!inAge.length) continue;
      scroll.appendChild(el('div', 'tech-age', age.title));
      const row = el('div', 'tech-row');
      for (const b of inAge) row.appendChild(makeNode(b));
      scroll.appendChild(row);
    }
  };

  const makeNode = (b: BuildBlock): HTMLElement => {
    const state = nodeState(services, b);
    const node = el('button', `tech-node ${state}`);
    node.dataset.block = b.id;
    node.appendChild(el('div', 'tech-ico', b.icon));
    // The label is what the child reads to earn it: a word, or a recipe phrase.
    const label = b.recipe && state !== 'owned' ? b.recipe.toUpperCase() : b.word.toUpperCase();
    node.appendChild(el('div', 'tech-label', label));
    if (state === 'owned') node.appendChild(el('div', 'tech-badge', '✓'));
    else if (state === 'ready') node.appendChild(el('div', 'tech-badge ready', b.recipe ? '🛠' : '📖'));
    else {
      // Locked ghost: show what it's waiting on (ingredient icons, or a lock).
      const need = b.recipe ? (b.from ?? []).map((id) => byId(id)?.icon ?? '?').join('') : '🔒';
      node.appendChild(el('div', 'tech-badge', need));
    }
    if (state === 'ready') {
      node.addEventListener('click', async () => {
        panel.style.visibility = 'hidden'; // step aside for the reading card
        const made = b.recipe ? await craftBlock(services, b) : await unlockPlainBlock(services, b);
        panel.style.visibility = 'visible';
        if (made) {
          node.classList.add('flash');
          services.analytics.log('techtree_made', { block: b.id, via: b.recipe ? 'craft' : 'read' });
        }
        render(); // repaint: this node is owned now, and it may unlock the next age
      });
    }
    return node;
  };

  render();

  const close = el('button', 'btn tech-close', '✕');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
