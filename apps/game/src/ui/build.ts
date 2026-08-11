// Build Mode — the first real step toward "it becomes Minecraft as we go".
// The child paints blocks onto a grid to build their own little world. New
// blocks aren't bought — they're UNLOCKED BY READING the block's word, so the
// toolbox literally grows out of reading. Builds persist across sessions.
import { allBlocks, validateText, word as getWord } from '@readquest/content';
import type { BuildBlock } from '@readquest/shared';
import type { Services } from '../services';
import { bottomLeftCluster, confetti, el, floatNote, openLayer, reducedMotion, speakerButton, wait } from './dom';
import { readWordCard, renderBuildInWorld } from './widgets';
import { checkDeeds } from './deeds';
import { blockTextureURL } from '../game/block-textures';
import { sfxPlace, sfxShatter, sfxUnlock } from '../game/sfx';

const tex = (id: string) => `url("${blockTextureURL(id)}")`;
const blockById = (id: string): BuildBlock | undefined => allBlocks().find((b) => b.id === id);

export const GRID_W = 12;
export const GRID_H = 8;
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
      cell.style.backgroundImage = '';
      cell.classList.remove('filled');
      sfxShatter();
      juiceCell(cell, 'shattered', '#9aa0a6');
    } else {
      if (services.save.build[key] === selected) return; // already this block
      services.save.build[key] = selected;
      cell.style.backgroundImage = tex(selected);
      cell.classList.add('filled');
      sfxPlace();
      juiceCell(cell, 'placed', '#caa06a'); // squash-in + a puff of dust
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
        cell.style.backgroundImage = tex(existing);
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

  const addTool = (b: BuildBlock) => {
    const tool = el('button', 'build-tool tex') as HTMLButtonElement;
    tool.style.backgroundImage = tex(b.id);
    tool.title = b.word;
    tool.addEventListener('click', () => selectTool(b.id));
    palette.appendChild(tool);
    paletteButtons.set(b.id, tool);
  };

  const addLockedWord = (b: BuildBlock) => {
    // Locked plain block: 🔒 + the word; tap to read one word and earn it.
    const locked = el('button', 'build-tool locked') as HTMLButtonElement;
    locked.appendChild(el('span', 'lock-ico', '🔒'));
    locked.appendChild(el('span', 'lock-word', b.word.toUpperCase()));
    locked.title = `Read "${b.word}" to unlock`;
    locked.addEventListener('click', () => void unlock(b));
    palette.appendChild(locked);
    paletteButtons.set(b.id, locked);
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

    // Plain blocks: unlocked → paintable tool; locked → read one word to earn.
    // A locked block only appears once its word is decodable at the child's
    // current taught set — so the toolbox visibly GROWS as reading advances
    // (a blend-word block surfaces the moment its blend is unlocked), and the
    // iron rule holds: we never show a 🔒 word the child can't yet sound out.
    for (const b of allBlocks()) {
      if (b.recipe) continue; // craft blocks handled in their own section below
      if (isUnlocked(services, b)) addTool(b);
      else if (validateText(b.word, services.save.taught).ok) addLockedWord(b);
    }

    // ── Craft blocks ── forged by reading a recipe PHRASE, but only once BOTH
    // ingredient blocks are unlocked. This is where reading steps up from single
    // words to short phrases — building literally grows the reading demand.
    const craftList = allBlocks().filter((b) => b.recipe);
    if (craftList.length) {
      const div = el('div', 'build-craft-div', '🛠');
      div.title = 'Crafting — combine two blocks by reading a recipe';
      palette.appendChild(div);

      for (const b of craftList) {
        // Hide a not-yet-crafted recipe until its phrase is decodable — a
        // higher-tier recipe only appears once its sounds are unlocked.
        if (!isUnlocked(services, b) && !validateText(b.recipe!, services.save.taught).ok) continue;
        if (isUnlocked(services, b)) {
          addTool(b); // already crafted — it's just a block now
        } else if (ingredientsReady(services, b)) {
          // Craftable now: 🛠 + the recipe phrase; tap to read-and-craft.
          const craftBtn = el('button', 'build-tool craftable') as HTMLButtonElement;
          craftBtn.appendChild(el('span', 'lock-ico', '🛠'));
          craftBtn.appendChild(el('span', 'craft-phrase', b.recipe!.toUpperCase()));
          craftBtn.title = `Craft by reading: ${b.recipe}`;
          craftBtn.addEventListener('click', () => void craft(b));
          palette.appendChild(craftBtn);
          paletteButtons.set(b.id, craftBtn);
        } else {
          // Not yet: show the two ingredient icons still to unlock as a hint.
          const locked = el('button', 'build-tool locked') as HTMLButtonElement;
          locked.appendChild(el('span', 'lock-ico', '🔒'));
          const need = (b.from ?? []).map((id) => blockById(id)?.icon ?? '?').join(' ');
          locked.appendChild(el('span', 'lock-word', need));
          locked.title = `Unlock ${(b.from ?? []).map((id) => blockById(id)?.word ?? id).join(' + ')} first`;
          palette.appendChild(locked);
          paletteButtons.set(b.id, locked);
        }
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
      sfxUnlock();
      services.analytics.log('block_unlocked', { block: b.id, word: b.word });
    }
    selected = b.id; // hand them the new block, ready to place
    renderPalette();
  };

  const craft = async (b: BuildBlock) => {
    panel.style.visibility = 'hidden';
    // Reading moment: read the whole recipe phrase to forge the new block.
    await readPhraseToCraft(services, b);
    panel.style.visibility = 'visible';
    if (!services.save.blocksUnlocked.includes(b.id)) {
      services.save.blocksUnlocked.push(b.id);
      services.persist();
      services.analytics.log('block_crafted', { block: b.id, recipe: b.recipe });
      sfxUnlock();
      confetti(28);
      floatNote(`${b.icon} ${b.word.toUpperCase()}!`, window.innerWidth / 2, window.innerHeight * 0.38);
      void services.speakText('You made it!').done;
    }
    selected = b.id; // hand them the freshly crafted block, ready to place
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
    void checkDeeds(services); // placing blocks may have earned a Builder deed
  });
  actions.appendChild(close);
  panel.appendChild(actions);
  layer.root.appendChild(panel);
}

function firstUnlockedId(services: Services): string {
  const first = allBlocks().find((b) => isUnlocked(services, b));
  return first ? first.id : ERASER;
}

// A block landing (or shattering) should feel chunky: a squash keyframe on the
// cell + a little puff of dust motes. Calm mode keeps the squash, drops the dust.
function juiceCell(cell: HTMLElement, cls: 'placed' | 'shattered', color: string): void {
  cell.classList.remove(cls);
  void cell.offsetWidth; // restart the CSS animation
  cell.classList.add(cls);
  if (reducedMotion()) return;
  const r = cell.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 5; i++) {
    const mote = el('div', 'dust-mote');
    mote.style.left = `${cx}px`;
    mote.style.top = `${cy}px`;
    mote.style.background = color;
    document.body.appendChild(mote);
    const dx = (Math.random() - 0.5) * 46;
    const dy = -8 - Math.random() * 34;
    mote
      .animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 220, easing: 'cubic-bezier(0.2,0.7,0.3,1)' },
      ).onfinish = () => mote.remove();
  }
}

/** A craft block is craftable once BOTH of its ingredient blocks are unlocked. */
function ingredientsReady(services: Services, b: BuildBlock): boolean {
  return (b.from ?? []).every((id) => {
    const ing = blockById(id);
    return ing ? isUnlocked(services, ing) : false;
  });
}

/** Phonics skills exercised by a decodable phrase (union over its words). */
function skillsOfPhrase(phrase: string): string[] {
  const skills = new Set<string>();
  for (const tok of phrase.toLowerCase().match(/[a-z]+/g) ?? []) {
    try {
      for (const s of getWord(tok).skills) if (s !== 'base') skills.add(s);
    } catch {
      /* token not in corpus — recipe phrases are validated, so this is defensive */
    }
  }
  return [...skills];
}

// Reading moment for crafting: read a short decodable PHRASE (e.g. "hot rock")
// to forge a new block. Logged as `sentence_read` — the same strong reading
// signal a Library page gives, because a phrase is real connected text, not a
// lone word. Tap any word to hear it; the 🔊 button reads the whole recipe.
async function readPhraseToCraft(services: Services, b: BuildBlock): Promise<void> {
  const phrase = b.recipe!;
  const started = Date.now();
  let audioRequested = false;
  const readWhole = () => services.speakLine(`craft_${b.id}`, phrase).done;

  const layer = openLayer();
  const panel = el('div', 'panel');
  panel.appendChild(el('div', 'subtitle', '🛠 Read it to craft it!'));

  const wrap = el('div', 'craft-read');
  for (const wtext of phrase.split(/\s+/)) {
    const card = el('button', 'craft-word', wtext.toUpperCase()) as HTMLButtonElement;
    card.addEventListener('click', () => {
      audioRequested = true;
      void services.speakWord(wtext).done;
    });
    wrap.appendChild(card);
  }
  panel.appendChild(wrap);
  panel.appendChild(el('div', 'craft-result', `= ${b.icon}`));

  const row = el('div', 'cards');
  const replay = speakerButton(() => {
    audioRequested = true;
    void readWhole();
  });
  const ok = el('button', 'btn', '✨ Craft it!');
  row.appendChild(replay);
  row.appendChild(ok);
  panel.appendChild(row);
  layer.root.appendChild(panel);

  // Wire the confirm listener before the auto-read so an eager tap still counts.
  const okClicked = new Promise<void>((r) => ok.addEventListener('click', () => r(), { once: true }));
  await wait(650); // let them look at the phrase first
  await readWhole();
  await okClicked;
  layer.close();

  services.recordEvidence({
    challengeType: 'sentence_read',
    skillIds: skillsOfPhrase(phrase),
    channel: 'recognition',
    correct: true,
    attemptIndex: 1,
    hintsUsed: 0,
    audioRequested,
    micUsed: false,
    responseMs: Date.now() - started,
  });
}
