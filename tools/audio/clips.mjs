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

/** Distinct decodable words appearing in any Library book, so tapping a word
 *  in the reader plays a real narrator clip (not synthesis). */
function bookWords() {
  const books = JSON.parse(fs.readFileSync('packages/content/data/books.json', 'utf8'));
  const words = new Set();
  for (const b of books) {
    for (const text of [b.title, ...b.pages]) {
      for (const tok of text.toLowerCase().match(/[a-z]+/g) ?? []) words.add(tok);
    }
  }
  return [...words];
}

/** Every spell's power word — cast audio should be premium narrator, not TTS. */
function spellWords() {
  const spells = JSON.parse(fs.readFileSync('packages/content/data/spells.json', 'utf8'));
  return spells.map((s) => s.word);
}

/** Per-word pronunciation overrides (e.g. "i" → "eye") for correct clips. */
const PRONUNCIATIONS = JSON.parse(fs.readFileSync('packages/content/data/pronunciations.json', 'utf8'));

/** Every build block's unlock word — reading it to unlock should be premium. */
function blockWords() {
  const blocks = JSON.parse(fs.readFileSync('packages/content/data/blocks.json', 'utf8'));
  return blocks.map((b) => b.word);
}

/** Every magic-e (long-vowel) word, so the whole tier has premium clips and is
 *  covered by the pronunciation audit — not just the ones used in books/blocks. */
function magicEWords() {
  const words = JSON.parse(fs.readFileSync('packages/content/data/words.json', 'utf8'));
  return words.filter((w) => (w.s ?? []).includes('magic_e')).map((w) => w.text);
}

/** Every vowel-team word (ai/ay/ee/oa), so the whole tier is premium + audited. */
function vowelTeamWords() {
  const words = JSON.parse(fs.readFileSync('packages/content/data/words.json', 'utf8'));
  const teams = ['ai', 'ay', 'ee', 'oa'];
  return words.filter((w) => !w.heart && (w.g ?? []).some((g) => teams.includes(g))).map((w) => w.text);
}

/** Every r-controlled word (ar/or/er/ir/ur), premium + audited. */
function rControlledWords() {
  const words = JSON.parse(fs.readFileSync('packages/content/data/words.json', 'utf8'));
  const teams = ['ar', 'or', 'er', 'ir', 'ur'];
  return words.filter((w) => !w.heart && (w.g ?? []).some((g) => teams.includes(g))).map((w) => w.text);
}

/** One narrator clip per craft recipe phrase (id: craft_<blockId>), so reading
 *  a recipe to forge a block is premium audio. The individual recipe words are
 *  already covered by the block/word clips above (for tap-a-word playback). */
function craftRecipeClips() {
  const blocks = JSON.parse(fs.readFileSync('packages/content/data/blocks.json', 'utf8'));
  return blocks
    .filter((b) => b.recipe)
    .map((b) => ({ id: `craft_${b.id}`, speaker: 'narrator', text: b.recipe }));
}

/** One narrator clip per book page, so "Read to me" is premium storytelling
 *  audio. Word highlighting still works: the voice layer estimates per-word
 *  timings from the clip's duration. */
function bookPageClips() {
  const books = JSON.parse(fs.readFileSync('packages/content/data/books.json', 'utf8'));
  const clips = [];
  for (const b of books) {
    clips.push({ id: `book_${b.id}_title`, speaker: 'narrator', text: b.title });
    b.pages.forEach((text, i) => {
      clips.push({ id: `book_${b.id}_p${i}`, speaker: 'narrator', text });
    });
  }
  return clips;
}

/** Every clip the game wants: [{ id, speaker, text }] — deduped by id. */
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
  // Word-card audio: priority words + book words + spell words + block words +
  // the full magic-e tier.
  const allWords = [...new Set([...PRIORITY_WORDS, ...bookWords(), ...spellWords(), ...blockWords(), ...magicEWords(), ...vowelTeamWords(), ...rControlledWords()])];
  for (const w of allWords) {
    // Common words are spoken LOWERCASE: a capitalized isolated token makes
    // ElevenLabs treat it as a name/foreign word (capitalized "Hut." was read
    // as the German word → "hoot"). Only the dragon names stay capitalized.
    // A per-word override (pronunciations.json) wins — e.g. "i" → "eye".
    const say = PRONUNCIATIONS[w] ?? (DRAGON_NAMES.includes(w) ? `${w[0].toUpperCase()}${w.slice(1)}` : w);
    clips.push({ id: `w_${w}`, speaker: 'narrator', text: `${say}.` });
  }
  clips.push(...bookPageClips());
  clips.push(...craftRecipeClips());
  // Dedupe by id (a book word may also be a priority word).
  const byId = new Map();
  for (const c of clips) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()];
}

export function readManifest(path = 'apps/game/public/assets/audio/manifest.json') {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
