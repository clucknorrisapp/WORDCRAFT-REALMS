// Build Where You Stand (Phase 2.2) — the DOM half. A 🧱 button flips the world
// into place-mode; this module renders the block palette as a NON-MODAL bottom
// bar (so the canvas underneath still receives taps to lay blocks) and the world
// scene owns the grid, cursor, and placement. Placing is free finger-dragging —
// building is sacred and never gated — but the palette only GROWS by reading:
// a 🔒 block is earned by sounding out its word, exactly like the modal toolbox.
import { allBlocks, validateText } from '@readquest/content';
import type { BuildBlock } from '@readquest/shared';
import type { Services } from '../services';
import { hudMenuTray, el, overlay } from './dom';
import { readWordCard, requestPlaceMode } from './widgets';
import { blockTextureURL } from '../game/block-textures';
import { sfxUnlock } from '../game/sfx';

export const WORLD_ERASER = '__erase__';

/** Mount the 🧱 button that flips the world into Build-Where-You-Stand mode. */
export function mountWorldBuildButton(services: Services): void {
  const btn = el('button', 'btn ghost round', '🧱');
  btn.title = 'Build where you stand';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => {
    services.analytics.log('worldbuild_toggle');
    requestPlaceMode();
  });
}
const tex = (id: string) => `url("${blockTextureURL(id)}")`;

function isUnlocked(services: Services, b: BuildBlock): boolean {
  return b.starter === true || services.save.blocksUnlocked.includes(b.id);
}

/** First placeable block id (a starter is always unlocked), for the default tool. */
export function firstWorldBlock(services: Services): string {
  const b = allBlocks().find((x) => !x.recipe && isUnlocked(services, x));
  return b ? b.id : WORLD_ERASER;
}

export interface WorldPalette {
  close(): void;
}

/** Open the place-mode palette bar. `onSelect` fires with a block id or the
 *  eraser sentinel; `onDone` when the child taps Done. */
export function openWorldPalette(
  services: Services,
  cbs: { onSelect: (id: string) => void; onDone: () => void },
): WorldPalette {
  const bar = el('div', 'worldbuild-bar');
  const tools = el('div', 'worldbuild-tools');
  bar.appendChild(tools);
  const buttons = new Map<string, HTMLButtonElement>();
  let selected = firstWorldBlock(services);

  const select = (id: string) => {
    selected = id;
    for (const [pid, b] of buttons) b.classList.toggle('sel', pid === id);
    cbs.onSelect(id);
  };

  const render = () => {
    tools.innerHTML = '';
    buttons.clear();

    const eraser = el('button', 'wb-tool', '🧽') as HTMLButtonElement;
    eraser.title = 'Eraser';
    eraser.addEventListener('click', () => select(WORLD_ERASER));
    tools.appendChild(eraser);
    buttons.set(WORLD_ERASER, eraser);

    for (const b of allBlocks()) {
      if (b.recipe) continue; // craft blocks stay in the modal blueprint canvas
      if (isUnlocked(services, b)) {
        const tool = el('button', 'wb-tool tex') as HTMLButtonElement;
        tool.style.backgroundImage = tex(b.id);
        tool.title = b.word;
        tool.addEventListener('click', () => select(b.id));
        tools.appendChild(tool);
        buttons.set(b.id, tool);
      } else if (validateText(b.word, services.save.taught).ok) {
        // Locked, but the child can sound out its word now → read to earn it.
        const locked = el('button', 'wb-tool locked') as HTMLButtonElement;
        locked.appendChild(el('span', 'lock-ico', '🔒'));
        locked.appendChild(el('span', 'lock-word', b.word.toUpperCase()));
        locked.title = `Read "${b.word}" to unlock`;
        locked.addEventListener('click', () => void unlock(b));
        tools.appendChild(locked);
        buttons.set(b.id, locked);
      }
    }
    select(selected);
  };

  const unlock = async (b: BuildBlock) => {
    bar.style.visibility = 'hidden';
    await readWordCard(services, b.word); // read the word to earn the block
    bar.style.visibility = 'visible';
    if (!services.save.blocksUnlocked.includes(b.id)) {
      services.save.blocksUnlocked.push(b.id);
      services.persist();
      sfxUnlock();
      services.analytics.log('block_unlocked', { block: b.id, word: b.word, via: 'worldbuild' });
    }
    selected = b.id; // hand them the new block, ready to place
    render();
  };

  render();

  const done = el('button', 'btn worldbuild-done', '✓ Done');
  done.addEventListener('click', () => cbs.onDone());
  bar.appendChild(done);
  overlay().appendChild(bar);

  return {
    close() {
      bar.remove();
    },
  };
}
