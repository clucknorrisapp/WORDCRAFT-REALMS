// Build Mode — the first real step toward "it becomes Minecraft as we go".
// The child paints blocks onto a grid to build their own little world. New
// blocks aren't bought — they're UNLOCKED BY READING the block's word, so the
// toolbox literally grows out of reading. Builds persist across sessions.
import { allBlocks } from '@readquest/content';
import type { BuildBlock } from '@readquest/shared';
import type { Services } from '../services';
import { bottomLeftCluster, confetti, el, floatNote, openLayer } from './dom';
import { readWordCard, renderBuildInWorld } from './widgets';

const GRID_W = 10;
const GRID_H = 8;
const ERASER = '__erase__';

// Builder ranks — building levels you up, so the world visibly grows more
// advanced as the child plays (reading unlocks the blocks; building ranks up).
const RANKS: Array<{ at: number; title: string; icon: string }> = [
  { at: 0, title: 'New Builder', icon: '🌱' },
  { at: 10, title: 'Builder', icon: '🔨' },
  { at: 25, title: 'Big Builder', icon: '🏗️' },
  { at: 50, title: 'Master Builder', icon: '🏆' },
  { at: 100, title: 'World Maker', icon: '🌍' },
];

export function builderRank(placed: number): { level: number; title: string; icon: string; prevAt: number; nextAt: number | null } {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (placed >= RANKS[k]!.at) i = k;
  const cur = RANKS[i]!;
  const next = RANKS[i + 1] ?? null;
  return { level: i + 1, title: cur.title, icon: cur.icon, prevAt: cur.at, nextAt: next ? next.at : null };
}

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

  // ── Builder rank header (progress that grows as you build) ──
  const rankRow = el('div', 'builder-rank');
  const rankLabel = el('div', 'builder-title');
  const bar = el('div', 'builder-bar');
  const barFill = el('div', 'builder-bar-fill');
  bar.appendChild(barFill);
  rankRow.append(rankLabel, bar);
  panel.appendChild(rankRow);

  const renderRank = () => {
    const r = builderRank(services.save.buildPlaced);
    rankLabel.textContent =
      r.nextAt === null
        ? `${r.icon} ${r.title} · ${services.save.buildPlaced} blocks`
        : `${r.icon} ${r.title} · ${services.save.buildPlaced}/${r.nextAt} blocks`;
    const pct = r.nextAt === null ? 100 : Math.round(((services.save.buildPlaced - r.prevAt) / (r.nextAt - r.prevAt)) * 100);
    barFill.style.width = `${Math.max(4, Math.min(100, pct))}%`;
  };

  const registerPlacement = () => {
    const before = builderRank(services.save.buildPlaced).level;
    services.save.buildPlaced += 1;
    const after = builderRank(services.save.buildPlaced);
    renderRank();
    if (after.level > before) {
      confetti(30);
      floatNote(`${after.icon} ${after.title}!`, window.innerWidth / 2, window.innerHeight * 0.35);
      void services.speakText(`${after.title}!`).done;
      services.analytics.log('builder_rank_up', { level: after.level, title: after.title });
    }
  };

  // ── The grid ──
  const grid = el('div', 'build-grid');
  grid.style.setProperty('--cols', String(GRID_W));
  let selected: string = firstUnlockedId(services); // block id, or ERASER

  const paintCell = (cell: HTMLElement) => {
    const key = cell.dataset['key'];
    if (!key) return;
    if (selected === ERASER) {
      if (!(key in services.save.build)) return;
      delete services.save.build[key];
      cell.textContent = '';
      cell.classList.remove('filled');
    } else {
      if (services.save.build[key] === selected) return; // already this block
      services.save.build[key] = selected;
      cell.textContent = iconOf(selected);
      cell.classList.add('filled');
      registerPlacement(); // cumulative — drives Builder rank
    }
    services.persist();
  };

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const cell = el('button', 'build-cell') as HTMLButtonElement;
      cell.dataset['key'] = cellKey(c, r);
      const existing = services.save.build[cellKey(c, r)];
      if (existing) {
        cell.textContent = iconOf(existing);
        cell.classList.add('filled');
      }
      grid.appendChild(cell);
    }
  }
  panel.appendChild(grid);

  // Drag-to-paint: hold and drag across cells to lay blocks like a crayon.
  // Uses elementFromPoint so it works for touch (pointerenter doesn't fire
  // mid-touch-drag). touch-action:none on the grid keeps drags from scrolling.
  let painting = false;
  const cellAt = (x: number, y: number): HTMLElement | null => {
    const t = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = t?.closest?.('.build-cell') as HTMLElement | null;
    return cell && grid.contains(cell) ? cell : null;
  };
  const onDown = (e: PointerEvent) => {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    painting = true;
    paintCell(cell);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!painting) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell) paintCell(cell);
  };
  const onUp = () => {
    painting = false;
  };
  grid.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  const teardown = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };

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
  renderRank();
  panel.appendChild(palette);

  const hint = el('div', 'subtitle', 'Drag to build! Read a 🔒 word to unlock more blocks.');
  panel.appendChild(hint);

  const actions = el('div', 'cards');
  const clear = el('button', 'btn ghost', '🧹 Clear');
  clear.addEventListener('click', () => {
    if (Object.keys(services.save.build).length === 0) return;
    if (!confirm('Clear the whole build?')) return;
    services.save.build = {};
    services.persist();
    for (const cell of grid.querySelectorAll('.build-cell')) {
      cell.textContent = '';
      cell.classList.remove('filled');
    }
    services.analytics.log('build_cleared', {});
  });
  actions.appendChild(clear);

  const close = el('button', 'btn', 'Done');
  close.addEventListener('click', () => {
    teardown();
    layer.close();
    renderBuildInWorld(); // show the creation in the actual world
  });
  actions.appendChild(close);
  panel.appendChild(actions);
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
