import { readerLevel, type ReaderLevel } from '@readquest/content';
import type { Services } from '../services';
import { el, openLayer } from './dom';

export interface Hud {
  setCounts(c: { wood: number; stone: number; eggs: number; gems: number; hens?: number | null }): void;
  setObjective(icon: string, lineId: string | null): void;
  /** Refresh the Reader Level badge from the child's taught set. */
  refreshReaderLevel(): void;
}

export function mountHud(services: Services): Hud {
  const overlayEl = document.getElementById('overlay')!;
  const hud = el('div', 'hud');
  // Reader Level badge — the reading rank, always visible so progress is felt.
  const reader = el('button', 'chip reader-lv', '📖 Lv 1');
  reader.title = 'Your reading level';
  reader.addEventListener('click', () => showReaderCard(services));
  const wood = el('div', 'chip', '🪵 0');
  const stone = el('div', 'chip', '🪨 0');
  const eggs = el('div', 'chip', '🥚 0');
  const gems = el('div', 'chip', '💎 0');
  const hens = el('div', 'chip', '🐔 0/3');
  hens.style.display = 'none';
  hud.append(reader, wood, stone, eggs, gems, hens);
  overlayEl.appendChild(hud);

  const objective = el('div', 'objective');
  const objIcon = el('span', '', '🪧');
  const objSpeaker = el('span', '', '🔊');
  objective.append(objIcon, objSpeaker);
  overlayEl.appendChild(objective);
  let objectiveLine: string | null = null;
  objective.addEventListener('click', () => {
    if (objectiveLine) {
      services.analytics.log('audio_requested', { lineId: objectiveLine, source: 'objective' });
      void services.speakLine(objectiveLine, undefined).done;
    }
  });

  const refreshReaderLevel = () => {
    const rl = readerLevel(services.save.taught);
    reader.textContent = `${rl.icon} Lv ${rl.level}`;
  };
  refreshReaderLevel();

  // A counter that just went UP pops — the reward flies into the number.
  const prev: Record<string, number> = { wood: -1, stone: -1, eggs: -1, gems: -1 };
  const set = (chip: HTMLElement, key: string, val: number, label: string) => {
    chip.textContent = label;
    if (prev[key] !== -1 && val > (prev[key] ?? 0)) {
      chip.classList.remove('bump');
      void chip.offsetWidth; // restart the animation
      chip.classList.add('bump');
    }
    prev[key] = val;
  };

  return {
    setCounts(c) {
      set(wood, 'wood', c.wood, `🪵 ${c.wood}`);
      set(stone, 'stone', c.stone, `🪨 ${c.stone}`);
      set(eggs, 'eggs', c.eggs, `🥚 ${c.eggs}`);
      set(gems, 'gems', c.gems, `💎 ${c.gems}`);
      if (c.hens === null || c.hens === undefined) hens.style.display = 'none';
      else {
        hens.style.display = '';
        hens.textContent = `🐔 ${c.hens}/3`;
      }
    },
    setObjective(icon, lineId) {
      objIcon.textContent = icon;
      objectiveLine = lineId;
      objSpeaker.style.display = lineId ? '' : 'none';
    },
    refreshReaderLevel,
  };
}

/** A little card showing the reading rank and the ladder of levels to climb. */
function showReaderCard(services: Services): void {
  const rl: ReaderLevel = readerLevel(services.save.taught);
  const layer = openLayer();
  const panel = el('div', 'panel reader-card');
  panel.appendChild(el('div', 'newsound-badge', rl.icon));
  panel.appendChild(el('div', 'newsound-name', `Reader Level ${rl.level}`));
  panel.appendChild(el('div', 'title', rl.title));
  panel.appendChild(
    el('div', 'subtitle', rl.nextTitle ? `Keep reading to become a ${rl.nextTitle}!` : 'You reached the top rank! 🎉'),
  );
  const bar = el('div', 'reader-ladder');
  for (let i = 1; i <= rl.max; i++) {
    const pip = el('span', 'reader-pip' + (i <= rl.level ? ' on' : ''));
    bar.appendChild(pip);
  }
  panel.appendChild(bar);
  const ok = el('button', 'btn', 'Yay! ✓');
  ok.addEventListener('click', () => layer.close());
  panel.appendChild(ok);
  layer.root.appendChild(panel);
  services.analytics.log('reader_card_opened', { level: rl.level });
}
