import Phaser from 'phaser';
import { loadSave } from './save';
import { createServices } from './services';
import { runCharacterSelect } from './game/select';
import { WorldScene } from './game/world';
import { mountHud } from './ui/hud';
import { mountParentButton } from './ui/parent';
import { applyTextScale } from './ui/dom';

async function boot(): Promise<void> {
  const save = loadSave();
  applyTextScale(save.settings.textScale);
  const services = await createServices(save);
  services.analytics.log('session_start', { questStep: save.questStep });
  window.addEventListener('visibilitychange', () => {
    services.analytics.log('session_ping', { visible: document.visibilityState });
    services.persist();
  });

  await runCharacterSelect(services);

  const hud = mountHud(services);
  mountParentButton(services);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#7ec850',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [new WorldScene(services, hud)],
  });
  // Test/facilitator hook (also handy in devtools during playtests).
  (window as unknown as Record<string, unknown>)['__readquest'] = { game, services };
}

void boot();
