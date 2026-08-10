// Curriculum progression — the visible payoff of the invisible engine. When
// free-play reading mastery unlocks the next phonics tier (services fires the
// advance handler), we throw a "New Sounds Unlocked!" moment: name the new
// sound, show an example word the child can now read, and say it aloud. This is
// how the game "gets more advanced as we go" — reading better literally levels
// up what you can read, build and unlock next.
import { readerLevel, word as getWord } from '@readquest/content';
import type { SkillId } from '@readquest/shared';
import type { Services } from '../services';
import type { Hud } from './hud';
import { confetti, el, isUiOpen, openLayer, speakerButton, wait } from './dom';

interface SkillIntro {
  title: string; // friendly name of the sound family
  blurb: string; // the graphemes it covers
  example: string; // a decodable word the child can now read (must be in corpus)
  icon: string;
}

// Kept in sync with GRAPHEME_SKILLS in @readquest/content. Each example word is
// decodable exactly at the tier it celebrates (guarded by a content test).
const SKILL_INTRO: Record<string, SkillIntro> = {
  blend_st: { title: 'ST Blend', blurb: 'st', example: 'nest', icon: '🪺' },
  blend_l: { title: 'L Blends', blurb: 'bl · cl · fl · gl · pl · sl', example: 'flag', icon: '🚩' },
  blend_r: { title: 'R Blends', blurb: 'br · cr · dr · fr · gr · pr · tr', example: 'frog', icon: '🐸' },
  blend_s: { title: 'S Blends', blurb: 'sk · sp · sn · sm · sw · sc', example: 'skip', icon: '💨' },
  blend_end: { title: 'End Blends', blurb: '-nd · -nt · -mp · -nk', example: 'lamp', icon: '💡' },
  magic_e: { title: 'Magic E ✨', blurb: 'the e makes the vowel say its name', example: 'cake', icon: '✨' },
  vowel_team: { title: 'Vowel Teams 👫', blurb: 'two vowels, one sound · ai · ay · ee · oa', example: 'rain', icon: '🌈' },
  r_controlled: { title: 'Bossy R 🤠', blurb: 'the r bosses the vowel · ar · or · er · ir · ur', example: 'star', icon: '⭐' },
};

/** Wire the "New Sounds!" celebration + Reader Level bump to the progression
 *  hook. Each tier unlock refreshes the HUD badge and throws the celebration. */
export function mountProgression(services: Services, hud: Hud): void {
  services.setAdvanceHandler((skill) => {
    hud.refreshReaderLevel();
    void showNewSounds(services, skill);
  });
}

export async function showNewSounds(services: Services, skill: SkillId): Promise<void> {
  const intro = SKILL_INTRO[skill];
  if (!intro) return; // no celebration authored for this skill — teach silently
  // Never interrupt another reading moment; wait for the overlay to be free.
  for (let i = 0; isUiOpen() && i < 60; i++) await wait(250);

  const layer = openLayer();
  const panel = el('div', 'panel newsound');
  panel.appendChild(el('div', 'title', '✨ New Sounds Unlocked! ✨'));
  panel.appendChild(el('div', 'newsound-badge', intro.icon));
  panel.appendChild(el('div', 'newsound-name', intro.title));
  panel.appendChild(el('div', 'subtitle', intro.blurb));
  panel.appendChild(el('div', 'subtitle', 'Now you can read:'));

  // The example word as glowing graphemes, like every other word-card.
  const wrap = el('div', 'word-big');
  const spans: HTMLElement[] = [];
  for (const g of getWord(intro.example).graphemes) {
    const s = el('span', 'g', g.toUpperCase());
    wrap.appendChild(s);
    spans.push(s);
  }
  panel.appendChild(wrap);

  // Reading levels up with the new sound — the tier is already taught here.
  const rl = readerLevel(services.save.taught);
  panel.appendChild(el('div', 'newsound-levelup', `⬆️ Reader Level ${rl.level} · ${rl.title}!`));

  const row = el('div', 'cards');
  row.appendChild(speakerButton(() => void services.speakWord(intro.example).done));
  const ok = el('button', 'btn', "Let's go! ✓");
  row.appendChild(ok);
  panel.appendChild(row);
  layer.root.appendChild(panel);

  confetti(44);
  const okClicked = new Promise<void>((r) => ok.addEventListener('click', () => r(), { once: true }));
  void services.speakText('New sounds unlocked!').done;
  await wait(700);
  // Glow the blend, then read the example word.
  spans[0]?.classList.add('glow');
  await services.speakWord(intro.example).done;
  spans.forEach((s) => s.classList.remove('glow'));
  await okClicked;
  layer.close();
  services.analytics.log('new_sounds_shown', { skill, example: intro.example });
}
