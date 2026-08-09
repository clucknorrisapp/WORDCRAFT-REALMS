// The premium-clip want-list, shared by needed.mjs (inventory) and
// generate-elevenlabs.mjs (batch generation).
import fs from 'node:fs';

/** Words spoken as word-cards in the slice — clip ids use `w_<word>`. */
export const PRIORITY_WORDS = [
  'rex', 'ash', 'chip', 'dash',
  'den', 'hut', 'shop', 'path', 'shed', 'rock', 'log',
  'hen', 'hat', 'hop', 'chick', 'chin',
  'ship', 'chest',
  'egg', 'nut', 'jam', 'ten', 'pen', 'ham', 'fig', 'bun',
];

/** Dragon names — the {name} template line gets one clip per name so even the
 *  personalized "X likes you!" line is real ElevenLabs audio, not synthesis. */
const DRAGON_NAMES = ['rex', 'ash', 'chip', 'dash'];

/** Every clip the game wants: [{ id, speaker, text }] */
export function wantedClips() {
  const lines = JSON.parse(fs.readFileSync('packages/content/data/lines.json', 'utf8'));
  const clips = [];
  for (const l of lines) {
    if (l.text.includes('{name}')) {
      // Expand the template into per-name variant clips (id: <lineId>_<name>).
      for (const name of DRAGON_NAMES) {
        const cap = name[0].toUpperCase() + name.slice(1);
        clips.push({ id: `${l.id}_${name}`, speaker: l.speaker, text: l.text.replaceAll('{name}', cap) });
      }
      continue;
    }
    clips.push({ id: l.id, speaker: l.speaker === 'sign' ? 'narrator' : l.speaker, text: l.text });
  }
  for (const w of PRIORITY_WORDS) {
    clips.push({ id: `w_${w}`, speaker: 'narrator', text: `${w[0].toUpperCase()}${w.slice(1)}.` });
  }
  return clips;
}

export function readManifest(path = 'apps/game/public/assets/audio/manifest.json') {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
