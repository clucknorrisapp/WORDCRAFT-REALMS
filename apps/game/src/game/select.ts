// Character + dragon selection — pure DOM (no Phaser scene needed), and the
// first reading moment: dragon names are decodable word cards with audio.
import { word as getWord } from '@readquest/content';
import type { Services } from '../services';
import { el, openLayer, wait } from '../ui/dom';
import { showDialogue } from '../ui/widgets';
import { DRAGON_NAMES } from '../types';

export async function runCharacterSelect(services: Services): Promise<void> {
  // 1. Avatar
  if (services.save.avatar === null) {
    const layer = openLayer();
    const panel = el('div', 'panel');
    panel.appendChild(el('div', 'title', 'Pick your hero!'));
    const grid = el('div', 'avatar-grid');
    panel.appendChild(grid);
    const go = el('button', 'btn', 'Go!');
    go.style.marginTop = '14px';
    go.style.visibility = 'hidden';
    panel.appendChild(go);
    layer.root.appendChild(panel);

    let chosen: number | null = null;
    for (let i = 0; i < 4; i++) {
      const img = el('img') as HTMLImageElement;
      img.src = `assets/sprites/avatar_${i}.png`;
      img.addEventListener('click', () => {
        chosen = i;
        [...grid.children].forEach((c, j) => c.classList.toggle('sel', j === i));
        go.style.visibility = 'visible';
      });
      grid.appendChild(img);
    }
    await new Promise<void>((resolve) => {
      go.addEventListener('click', () => {
        if (chosen !== null) resolve();
      });
    });
    services.save.avatar = chosen;
    services.persist();
    layer.close();

    await showDialogue(services, 'ln_welcome');
  }

  // 2. Dragon naming — decodable name cards, tap to hear, pick to keep.
  if (!services.save.dragonName) {
    await showDialogue(services, 'ln_pick_dragon');
    const layer = openLayer();
    const panel = el('div', 'panel');
    panel.appendChild(el('div', 'title', '🐣 Name your dragon!'));
    const img = el('img') as HTMLImageElement;
    img.src = 'assets/sprites/dragon.png';
    img.style.height = '110px';
    panel.appendChild(img);
    const cards = el('div', 'cards');
    panel.appendChild(cards);
    const keep = el('button', 'btn', 'Keep this name!');
    keep.style.marginTop = '14px';
    keep.style.visibility = 'hidden';
    panel.appendChild(keep);
    layer.root.appendChild(panel);

    const started = Date.now();
    let picked: string | null = null;
    for (const name of DRAGON_NAMES) {
      const card = el('button', 'word-card', name.toUpperCase());
      card.addEventListener('click', () => {
        picked = name;
        [...cards.children].forEach((c) => c.classList.remove('right'));
        card.classList.add('right');
        keep.style.visibility = 'visible';
        void services.speakWord(name).done;
      });
      cards.appendChild(card);
    }
    await new Promise<void>((resolve) => {
      keep.addEventListener('click', () => {
        if (picked) resolve();
      });
    });
    layer.close();

    const w = getWord(picked!);
    services.save.dragonName = picked;
    services.save.dragonLevel = 1;
    services.persist();
    services.recordEvidence({
      challengeType: 'word_match',
      skillIds: w.skills,
      wordId: w.id,
      channel: 'recognition',
      correct: true,
      attemptIndex: 1,
      hintsUsed: 0,
      audioRequested: true,
      micUsed: false,
      responseMs: Date.now() - started,
    });

    await showDialogue(services, 'ln_dragon_joins', { nameSub: cap(picked!) });
    await wait(150);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
