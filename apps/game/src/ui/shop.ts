// The Trading Post (backlog #8) — the gem sink. Gems are paid out at a dozen
// reading sites but nothing ever spent them, so the reward economy had no
// payoff and no reason to keep earning. Here gems buy OWNABLE cosmetics — dragon
// colours — and every purchase is a reading moment: read the colour word to buy
// it. Owned colours re-apply for free, so the child collects them and dresses
// their dragon however they like. Only colours the child can already read are
// ever offered (iron rule).
import { validateText } from '@readquest/content';
import type { Services } from '../services';
import type { Hud } from './hud';
import { hudMenuTray, el, openLayer, confetti } from './dom';
import { readWordCard, requestDragonColor } from './widgets';

interface ColorItem {
  word: string;
  hex: string;
  cost: number;
}
const COLORS: ColorItem[] = [
  { word: 'red', hex: '#ff6b6b', cost: 2 },
  { word: 'tan', hex: '#d8b48f', cost: 2 },
  { word: 'green', hex: '#8fdc8f', cost: 3 },
];

export function mountShopButton(services: Services, hud: Hud): void {
  const btn = el('button', 'btn ghost round shop-btn', '🛒');
  btn.title = 'Trading Post';
  hudMenuTray().appendChild(btn);
  btn.addEventListener('click', () => openShop(services, hud));
}

function syncGems(services: Services, hud: Hud): void {
  const s = services.save;
  hud.setCounts({ wood: s.wood, stone: s.stone, eggs: s.eggs, gems: s.gems, hens: null });
}

export function openShop(services: Services, hud: Hud): void {
  services.analytics.log('shop_opened', { gems: services.save.gems });
  const layer = openLayer();
  const panel = el('div', 'panel shop-panel');
  panel.appendChild(el('div', 'shop-title', '🛒 Trading Post'));
  const sub = el('div', 'shop-sub', '');
  panel.appendChild(sub);
  const grid = el('div', 'shop-grid');
  panel.appendChild(grid);

  const render = (): void => {
    sub.textContent = `You have 💎 ${services.save.gems}. Read a colour to dress your dragon!`;
    grid.textContent = '';
    for (const it of COLORS) {
      if (!validateText(it.word, services.save.taught).ok) continue; // never offer an unreadable word
      const owned = services.save.dragonColorsOwned.includes(it.word);
      const worn = services.save.dragonColor === it.word;
      const afford = services.save.gems >= it.cost;
      const state = worn ? 'worn' : owned ? 'owned' : afford ? 'buy' : 'locked';
      const card = el('button', `shop-item ${state}`);
      card.dataset.item = it.word;
      const swatch = el('div', 'shop-swatch');
      swatch.style.background = it.hex;
      card.appendChild(swatch);
      card.appendChild(el('div', 'shop-word', it.word.toUpperCase()));
      card.appendChild(el('div', 'shop-cost', worn ? 'worn' : owned ? 'wear' : `💎 ${it.cost}`));
      card.addEventListener('click', async () => {
        if (worn) return;
        if (owned) {
          services.save.dragonColor = it.word; // already bought — just wear it, free
          requestDragonColor(it.word);
          services.persist();
          render();
          return;
        }
        if (!afford) {
          void services.speakText('Read more to earn gems, then come back!').done;
          return;
        }
        await readWordCard(services, it.word, { icon: '🎨' });
        // Pay, own, and wear — state first so a reload can't double-charge.
        services.save.gems -= it.cost;
        if (!services.save.dragonColorsOwned.includes(it.word)) services.save.dragonColorsOwned.push(it.word);
        services.save.dragonColor = it.word;
        requestDragonColor(it.word);
        services.analytics.log('shop_bought', { item: it.word, cost: it.cost });
        services.persist();
        syncGems(services, hud);
        confetti(24);
        void services.speakText(`Your dragon is ${it.word} now!`).done;
        render();
      });
      grid.appendChild(card);
    }
  };
  render();

  const close = el('button', 'btn ghost shop-close', '✕');
  close.addEventListener('click', () => layer.close());
  panel.appendChild(close);
  layer.root.appendChild(panel);
}
