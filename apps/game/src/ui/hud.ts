import type { Services } from '../services';
import { el } from './dom';

export interface Hud {
  setCounts(c: { wood: number; stone: number; eggs: number; gems: number; hens?: number | null }): void;
  setObjective(icon: string, lineId: string | null): void;
}

export function mountHud(services: Services): Hud {
  const overlayEl = document.getElementById('overlay')!;
  const hud = el('div', 'hud');
  const wood = el('div', 'chip', '🪵 0');
  const stone = el('div', 'chip', '🪨 0');
  const eggs = el('div', 'chip', '🥚 0');
  const gems = el('div', 'chip', '💎 0');
  const hens = el('div', 'chip', '🐔 0/3');
  hens.style.display = 'none';
  hud.append(wood, stone, eggs, gems, hens);
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

  return {
    setCounts(c) {
      wood.textContent = `🪵 ${c.wood}`;
      stone.textContent = `🪨 ${c.stone}`;
      eggs.textContent = `🥚 ${c.eggs}`;
      gems.textContent = `💎 ${c.gems}`;
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
  };
}
