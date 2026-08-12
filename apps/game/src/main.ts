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
import { mountRecapButton } from './ui/recap';
import { mountShopButton } from './ui/shop';
import { mountFriendsButton } from './ui/friends';
import { configureSfx } from './game/sfx';
import { applyTextScale, applyAccessibility, setToolbeltVisible } from './ui/dom';
import { QuestStep } from './types';

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
  // When the page is hidden (tab switch, iPad home button) or being torn down,
  // write the save SYNCHRONOUSLY — a debounced write can be dropped when the
  // page is frozen/discarded, silently losing the child's last few reads.
  window.addEventListener('visibilitychange', () => {
    services.analytics.log('session_ping', { visible: document.visibilityState });
    if (document.visibilityState === 'hidden') services.flush();
    else services.persist();
  });
  window.addEventListener('pagehide', () => services.flush());

  await runCharacterSelect(services);

  const hud = mountHud(services);
  mountParentButton(services);
  // Always-visible core toolbelt — the few things a child reaches for constantly.
  mountLibraryButton(services, hud); // 📚 read a book
  mountBuildButton(services); // 🔨 build your world
  mountCompassButton(services); // 🧭 "Where do I go?"
  mountMapButton(services); // 🗺️ fog-of-war kingdom map + fast travel
  mountDailyGiftButton(services, hud); // 🎁 word-of-the-day, pulses when ready
  // Everything else lives in the ➕ "More" menu so the toolbelt stays short.
  mountWorldBuildButton(services); // 🧱 Build Where You Stand (place blocks in the world)
  mountSpellbookButton(services); // ✨ spellbook
  mountBagButton(services); // 🎒 Word Bag — read a word to summon its thing
  mountTechTreeButton(services); // 🧪 Tech Tree — smelting chains you climb by reading
  mountDeedsButton(services); // 🏅 the deed wall (achievements)
  mountRecapButton(services); // ⭐ "Look what I did!" — a recap to show a grown-up
  mountShopButton(services, hud); // 🛒 Trading Post — spend gems on dragon colours
  mountFriendsButton(services); // 🐾 the Friends Book (tamed creatures)
  mountProgression(services, hud); // "New Sounds!" + Reader Level-up on tier unlock
  // Set the intro/free-play chrome state now so the toolbelt doesn't flash in
  // during the scripted intro before the director's first refresh() runs.
  setToolbeltVisible(save.questStep === QuestStep.FREE_PLAY);

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
