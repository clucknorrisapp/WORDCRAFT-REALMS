// Build Mode — the first real step toward "it becomes Minecraft as we go".
// The child paints blocks onto a grid to build their own little world. New
// blocks aren't bought — they're UNLOCKED BY READING the block's word, so the
// toolbox literally grows out of reading. Builds persist across sessions.
import { allBlocks } from '@readquest/content';
import type { BuildBlock } from '@readquest/shared';
import type { Services } from '../services';
import { bottomLeftCluster, el, openLayer } from './dom';
import { readWordCard } from './widgets';

const GRID_W = 10;
const GRID_H = 8;
const ERASER = '__erase__';

function cellKey(c: number, r: number): string {
  return `${c},${r}`;
}

function isUnlocked(services: Services, b: BuildBlock): boolean {
  return b.starter === true || services.save.blocksUnlocked.includes(b.id);
}

export function mountBuildButton(services: Services): void {
  const btn = el('button', 'btn ghost round', '🔨');
  btn.title = 'Build your world';
  bottomLeftCluster().appendChild(btn);
  btn.addEventListener('click', () => void openBuild(services));
}

export async function openBuild(services: Services): Promise<void> {
  services.analytics.log('build_opened', {
    placed: Object.keys(services.save.build).length,
    unlocked: services.save.blocksUnlocked.length,
  });
  const layer = openLayer();
  const panel = el('div', 'panel build');
  panel.appendChild(el('h2', '', '🔨 Build Your World'));

  // ── The grid ──
  const grid = el('div', 'build-grid');
  grid.style.setProperty('--cols', String(GRID_W));
  const cells: HTMLButtonElement[] = [];
  let selected: string = firstUnlockedId(services); // block id, or ERASER

  const paint = (c: number, r: number, cell: HTMLButtonElement) => {
    const key = cellKey(c, r);
    if (selected === ERASER) {
      delete services.save.build[key];
      cell.textContent = '';
      cell.classList.remove('filled');
    } else {
      services.save.build[key] = selected;
      cell.textContent = iconOf(selected);
      cell.classList.add('filled');
    }
    services.persist();
  };

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const cell = el('button', 'build-cell') as HTMLButtonElement;
      const existing = services.save.build[cellKey(c, r)];
      if (existing) {
        cell.textContent = iconOf(existing);
        cell.classList.add('filled');
      }
      cell.addEventListener('click', () => paint(c, r, cell));
      cells.push(cell);
      grid.appendChild(cell);
    }
  }
  panel.appendChild(grid);

  // ── The palette ──
  const palette = el('div', 'build-palette');
  const paletteButtons = new Map<string, HTMLButtonElement>();

  const selectTool = (id: string) => {
    selected = id;
    for (const [pid, b] of paletteButtons) b.classList.toggle('sel', pid === id);
  };

  const renderPalette = () => {
    palette.innerHTML = '';
    paletteButtons.clear();

    // Eraser first.
    const eraser = el('button', 'build-tool', '🧽') as HTMLButtonElement;
    eraser.title = 'Eraser';
    eraser.addEventListener('click', () => selectTool(ERASER));
    palette.appendChild(eraser);
    paletteButtons.set(ERASER, eraser);

    for (const b of allBlocks()) {
      if (isUnlocked(services, b)) {
        const tool = el('button', 'build-tool', b.icon) as HTMLButtonElement;
        tool.title = b.word;
        tool.addEventListener('click', () => selectTool(b.id));
        palette.appendChild(tool);
        paletteButtons.set(b.id, tool);
      } else {
        // Locked: show 🔒 + the word; tap to read-to-unlock.
        const locked = el('button', 'build-tool locked') as HTMLButtonElement;
        locked.appendChild(el('span', 'lock-ico', '🔒'));
        locked.appendChild(el('span', 'lock-word', b.word.toUpperCase()));
        locked.addEventListener('click', () => void unlock(b));
        palette.appendChild(locked);
        paletteButtons.set(b.id, locked);
      }
    }
    selectTool(selected);
  };

  const unlock = async (b: BuildBlock) => {
    panel.style.visibility = 'hidden';
    // Reading moment: read the block's word to earn it.
    await readWordCard(services, b.word);
    panel.style.visibility = 'visible';
    if (!services.save.blocksUnlocked.includes(b.id)) {
      services.save.blocksUnlocked.push(b.id);
      services.persist();
      services.analytics.log('block_unlocked', { block: b.id, word: b.word });
    }
    selected = b.id; // hand them the new block, ready to place
    renderPalette();
  };

  renderPalette();
  panel.appendChild(palette);

  const hint = el('div', 'subtitle', 'Tap a block, then tap the grid. Read a 🔒 word to unlock more!');
  panel.appendChild(hint);

  const close = el('button', 'btn', 'Done');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}

function iconOf(blockId: string): string {
  const b = allBlocks().find((x) => x.id === blockId);
  return b ? b.icon : '';
}

function firstUnlockedId(services: Services): string {
  const first = allBlocks().find((b) => isUnlocked(services, b));
  return first ? first.id : ERASER;
}
