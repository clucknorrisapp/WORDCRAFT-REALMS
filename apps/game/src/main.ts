import Phaser from 'phaser';
import { loadSave } from './save';
import { createServices } from './services';
import { runCharacterSelect } from './game/select';
import { WorldScene } from './game/world';
import { mountHud } from './ui/hud';
import { mountParentButton } from './ui/parent';
import { mountLibraryButton } from './ui/library';
import { mountSpellbookButton } from './ui/spellbook';
import { mountBuildButton } from './ui/build';
import { mountWorldBuildButton } from './ui/worldbuild';
import { mountProgression } from './ui/progression';
import { mountDeedsButton } from './ui/deeds';
import { mountDailyGiftButton } from './ui/daily';
import { mountCompassButton } from './ui/compass';
import { mountMapButton } from './ui/map';
import { mountBagButton } from './ui/loot';
import { mountTechTreeButton } from './ui/techtree';
import { mountFriendsButton } from './ui/friends';
import { configureSfx } from './game/sfx';
import { applyTextScale, applyAccessibility } from './ui/dom';

async function boot(): Promise<void> {
  const save = loadSave();
  applyTextScale(save.settings.textScale);
  applyAccessibility(save.settings);
  configureSfx({ enabled: save.settings.sfxEnabled });
  const services = await createServices(save);

  // Grown-up pronunciation review: <url>#pronounce speaks every word through
  // the real voice pipeline so a human can double-check how things sound.
  if (location.hash.toLowerCase().includes('pronounce')) {
    const { mountPronounceReview } = await import('./ui/pronounce');
    mountPronounceReview(services);
    return;
  }

  services.analytics.log('session_start', { questStep: save.questStep });
  window.addEventListener('visibilitychange', () => {
    services.analytics.log('session_ping', { visible: document.visibilityState });
    services.persist();
  });

  await runCharacterSelect(services);

  const hud = mountHud(services);
  mountParentButton(services);
  mountLibraryButton(services, hud);
  mountSpellbookButton(services);
  mountBuildButton(services);
  mountWorldBuildButton(services); // 🧱 Build Where You Stand (place blocks in the world)
  mountCompassButton(services); // "Where do I go?" — reveal the current goal
  mountMapButton(services); // 🗺️ fog-of-war kingdom map + fast travel
  mountBagButton(services); // 🎒 Word Bag — read a word to summon its thing
  mountTechTreeButton(services); // 🧪 Tech Tree — smelting chains you climb by reading
  mountDeedsButton(services); // 🏅 the deed wall (achievements)
  mountFriendsButton(services); // 🐾 the Friends Book (tamed creatures)
  mountDailyGiftButton(services, hud); // 🎁 word-of-the-day, pulses when ready
  mountProgression(services, hud); // "New Sounds!" + Reader Level-up on tier unlock

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
