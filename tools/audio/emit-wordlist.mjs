// Emit the exact set of words the game speaks as word-cards, as JSON on
// stdout — the input to the pronunciation audit. Single source of truth:
// derived from the same wantedClips() the clip generator uses.
import { wantedClips } from './clips.mjs';

const words = wantedClips()
  .filter((c) => c.id.startsWith('w_'))
  .map((c) => ({ word: c.id.slice(2), text: c.text }));

process.stdout.write(JSON.stringify(words));
