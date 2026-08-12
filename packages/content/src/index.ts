import type {
  Book,
  BuildBlock,
  ChallengeContent,
  DecodabilityReport,
  DecodabilityViolation,
  Line,
  SkillId,
  Spell,
  Word,
} from '@readquest/shared';
import { seededShuffle } from '@readquest/shared';
import blocksJson from '../data/blocks.json';
import booksJson from '../data/books.json';
import curriculumJson from '../data/curriculum.json';
import linesJson from '../data/lines.json';
import pronunciationsJson from '../data/pronunciations.json';
import spellsJson from '../data/spells.json';
import wordsJson from '../data/words.json';

// Grapheme → skill mapping. Single consonants (and early-taught ck/ff/gg/x)
// belong to 'base'. Heart words bypass derivation entirely: their skill is
// 'heart' and their graphemes exist only for the hint-ladder display.
const GRAPHEME_SKILLS: Record<string, SkillId> = {
  a: 'short_a',
  e: 'short_e',
  i: 'short_i',
  o: 'short_o',
  u: 'short_u',
  sh: 'digraph_sh',
  ch: 'digraph_ch',
  th: 'digraph_th',
  st: 'blend_st',
  // Consonant blends — each cluster is one grapheme requiring a blend skill
  // (blending adjacent consonants is a taught step, not free once you know the
  // letters). Grouped into the families of a standard scope & sequence.
  bl: 'blend_l', cl: 'blend_l', fl: 'blend_l', gl: 'blend_l', pl: 'blend_l', sl: 'blend_l',
  br: 'blend_r', cr: 'blend_r', dr: 'blend_r', fr: 'blend_r', gr: 'blend_r', pr: 'blend_r', tr: 'blend_r',
  sk: 'blend_s', sp: 'blend_s', sn: 'blend_s', sm: 'blend_s', sw: 'blend_s', sc: 'blend_s', tw: 'blend_s',
  // Final blends: nasal/liquid + stop clusters that close a word.
  nd: 'blend_end', nt: 'blend_end', mp: 'blend_end', nk: 'blend_end',
  ft: 'blend_end', lt: 'blend_end', lk: 'blend_end', lf: 'blend_end', ld: 'blend_end', lp: 'blend_end', ct: 'blend_end',
  // ng: the "welded" nasal end-sound (ring, king, sing, song) — grouped with the
  // end blends so it unlocks alongside nk, its natural partner.
  ng: 'blend_end',
  // Vowel teams — two vowels, one long sound ("rain", "play", "see", "boat").
  // A team is a single grapheme, so these fit the linear rule directly (unlike
  // magic-e). Only the unambiguous long-vowel teams; heart words (said/see/you)
  // bypass this via `heart` and keep their irregular pronunciations.
  ai: 'vowel_team', ay: 'vowel_team', ee: 'vowel_team', oa: 'vowel_team',
  // ea = long /ee/ (eat, sea, team); igh = long /i/ (night, light). Both are
  // reliable single-sound teams. (The short-e "ea" in bread/head is a different
  // job for later; only the long teams live here so the tier stays one sound.)
  ea: 'vowel_team', igh: 'vowel_team',
  // R-controlled ("Bossy R") — the r changes the vowel ("car", "fork", "bird").
  // Each is one grapheme. ('for' stays a heart word and bypasses this.)
  ar: 'r_controlled', or: 'r_controlled', er: 'r_controlled', ir: 'r_controlled', ur: 'r_controlled',
  // Diphthongs — the mouth glides through two vowel sounds. ou/ow = /ow/ (out,
  // cow); oi/oy = /oy/ (coin, boy). Only the reliable single-sound spellings
  // live here (the /oh/ "ow" of snow is a later job).
  ou: 'diphthong', ow: 'diphthong', oi: 'diphthong', oy: 'diphthong',
};

const BASE_GRAPHEMES = new Set([
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's',
  't', 'v', 'w', 'x', 'y', 'z', 'ck', 'ff', 'gg', 'll', 'ss', 'zz',
]);

interface RawWord {
  text: string;
  g: string[];
  c?: string[];
  heart?: boolean;
  s?: SkillId[]; // explicit skill override for patterns the linear grapheme rule
  // can't express — notably magic-e (split digraph): "cake" is c-a-k-e on the
  // page (graphemes still recompose for the hint ladder) but the a…e together
  // teach one long-vowel skill, not short-a + short-e. 'base' is added
  // automatically. Heart words use `heart` instead.
}

function deriveSkills(raw: RawWord): SkillId[] {
  if (raw.heart) return ['heart'];
  if (raw.s) {
    // Explicit override (e.g. magic-e). Trust the authored skills; still add
    // 'base' for the ordinary consonants the word also contains.
    const skills = [...raw.s];
    if (!skills.includes('base')) skills.push('base');
    return skills;
  }
  // Iron-rule guard: a standalone 'c' before e/i/y says /s/ (nice, race, city,
  // cent), never the hard /k/ the base tier teaches — so such a word MUST
  // declare a soft_c skill (via `s`) or be a heart word, else it would silently
  // validate as base and mis-teach the wrong sound (exactly what the iron rule
  // exists to prevent, and the validator couldn't otherwise catch). We do NOT
  // guard soft g: hard g before e/i/y is common in English (get, girl, give,
  // gift), so a soft g can't be inferred from spelling alone.
  for (let i = 0; i < raw.g.length - 1; i++) {
    if (raw.g[i] === 'c' && /^[eiy]/.test(raw.g[i + 1]!)) {
      throw new Error(`Soft-c word "${raw.text}": a 'c' before e/i/y says /s/ — declare a soft_c skill via "s", don't leave it as base`);
    }
  }

  const skills: SkillId[] = [];
  for (const g of raw.g) {
    const skill = BASE_GRAPHEMES.has(g) ? 'base' : GRAPHEME_SKILLS[g];
    if (!skill) throw new Error(`Unknown grapheme "${g}" in word "${raw.text}"`);
    if (!skills.includes(skill)) skills.push(skill);
  }
  if (!skills.includes('base')) skills.push('base');
  return skills;
}

function toWord(raw: RawWord): Word {
  return {
    id: raw.text,
    text: raw.text,
    graphemes: raw.g,
    skills: deriveSkills(raw),
    heart: raw.heart === true,
    confusables: raw.c ?? [],
  };
}

export interface Curriculum {
  order: SkillId[];
  initialTaught: SkillId[];
  stretch: SkillId[];
  heartWords: string[];
}

export const curriculum: Curriculum = curriculumJson as Curriculum;

// ── Reader Level ────────────────────────────────────────────────────────────
// The phonics progression is invisible during play, but a child loves to SEE
// themselves level up. Reader Level turns each unlocked tier into a rank with a
// name — the reading counterpart to the Builder rank. One level per milestone
// tier taught, so every "New Sounds!" unlock is also a level-up.
export interface ReaderLevel {
  level: number;
  title: string;
  icon: string;
  max: number;
  nextTitle: string | null;
}

const READER_MILESTONES: SkillId[] = [
  'base', 'blend_st', 'blend_l', 'blend_r', 'blend_s', 'blend_end', 'magic_e', 'vowel_team', 'r_controlled', 'diphthong',
];
const READER_TITLES = [
  'Sound Starter', 'Blend Beginner', 'Blend Builder', 'Blend Blaster',
  'Blend Star', 'Blend Master', 'Magic Reader', 'Word Wizard', 'Reading Legend', 'Sound Explorer',
];
const READER_ICONS = ['🌱', '🔗', '🧩', '🚀', '⭐', '🏆', '✨', '🌈', '🌟', '🌀'];

/** The child's Reader Level from their taught set — one level per milestone tier
 *  reached (base = level 1, up to Word Wizard once vowel teams are unlocked). */
export function readerLevel(taught: Iterable<SkillId>): ReaderLevel {
  const set = new Set(taught);
  let n = 0;
  for (const m of READER_MILESTONES) if (set.has(m)) n += 1;
  n = Math.max(1, n);
  const i = n - 1;
  return {
    level: n,
    title: READER_TITLES[i]!,
    icon: READER_ICONS[i]!,
    max: READER_MILESTONES.length,
    nextTitle: READER_TITLES[i + 1] ?? null,
  };
}

const words: Word[] = (wordsJson as RawWord[]).map(toWord);
const byText = new Map<string, Word>(words.map((w) => [w.text, w]));
const lines: Line[] = linesJson as Line[];
const linesById = new Map<string, Line>(lines.map((l) => [l.id, l]));
const books: Book[] = booksJson as Book[];
const booksById = new Map<string, Book>(books.map((b) => [b.id, b]));
const spells: Spell[] = spellsJson as Spell[];
const blocks: BuildBlock[] = blocksJson as BuildBlock[];
const blocksById = new Map<string, BuildBlock>(blocks.map((b) => [b.id, b]));

export function allWords(): Word[] {
  return words;
}

export function word(idOrText: string): Word {
  const w = byText.get(idOrText.toLowerCase());
  if (!w) throw new Error(`Unknown word "${idOrText}"`);
  return w;
}

export function hasWord(text: string): boolean {
  return byText.has(text.toLowerCase());
}

export function allLines(): Line[] {
  return lines;
}

export function line(id: string): Line {
  const l = linesById.get(id);
  if (!l) throw new Error(`Unknown line "${id}"`);
  return l;
}

export function allBooks(): Book[] {
  return books;
}

export function book(id: string): Book {
  const b = booksById.get(id);
  if (!b) throw new Error(`Unknown book "${id}"`);
  return b;
}

/** A book is decodable only if every page passes the iron rule. Reported
 *  per-page so the failing text is easy to find (used by the content test). */
export function validateBook(b: Book, taught: Iterable<SkillId>): {
  ok: boolean;
  pages: DecodabilityReport[];
} {
  const taughtSet = new Set(taught);
  const pages = [b.title, ...b.pages].map((t) => validateText(t, taughtSet));
  return { ok: pages.every((p) => p.ok), pages };
}

export function allSpells(): Spell[] {
  return spells;
}

export function spell(word: string): Spell {
  const s = spells.find((x) => x.word === word.toLowerCase());
  if (!s) throw new Error(`Unknown spell "${word}"`);
  return s;
}

// Per-word pronunciation overrides — the spoken form a TTS engine should
// voice for words it gets wrong in isolation (e.g. "i" → "eye"). Used both by
// the clip generator (so premium clips are recorded right) and by the game's
// synthesis fallback, so a word sounds the same however it's produced.
const pronunciations = pronunciationsJson as Record<string, string>;

/** The spoken form for a word — its override, or the word itself. */
export function sayAs(word: string): string {
  return pronunciations[word.toLowerCase()] ?? word;
}

export function allBlocks(): BuildBlock[] {
  return blocks;
}

export function block(id: string): BuildBlock {
  const b = blocksById.get(id);
  if (!b) throw new Error(`Unknown block "${id}"`);
  return b;
}

const TOKEN_RE = /[a-z]+/g;

/**
 * The iron rule (roadmap §6): text a child must read unassisted may only
 * contain words whose every skill has been taught. Unknown words are
 * violations too — no unregistered text can ship.
 */
export function validateText(text: string, taught: Iterable<SkillId>): DecodabilityReport {
  const taughtSet = new Set(taught);
  const violations: DecodabilityViolation[] = [];
  for (const token of text.toLowerCase().matchAll(TOKEN_RE)) {
    const w = byText.get(token[0]);
    if (!w) {
      violations.push({ token: token[0], missingSkills: ['unknown_word'] });
      continue;
    }
    const missing = w.skills.filter((s) => !taughtSet.has(s));
    if (missing.length > 0) violations.push({ token: token[0], missingSkills: missing });
  }
  return { ok: violations.length === 0, violations };
}

/** Decodable lines are enforced; narrated lines are scaffolded exposure. */
export function validateLine(l: Line, taught: Iterable<SkillId>): DecodabilityReport {
  if (l.mode === 'narrated') return { ok: true, violations: [] };
  return validateText(l.text, taught);
}

/**
 * Build a word-match/sign challenge from a target word's curated confusables.
 * Presentation order comes from a seeded shuffle (anti-guessing: the seed is
 * logged in Evidence, so any session is reproducible).
 */
export function buildChallenge(targetText: string, seed: number, distractorCount = 2): ChallengeContent {
  const target = word(targetText);
  const distractors: Word[] = target.confusables.slice(0, distractorCount).map((c) => word(c));
  // Graceful degradation instead of throwing when curated confusables run
  // short: top up from corpus words whose every skill the target also has, so
  // any distractor is decodable wherever the target itself is shown.
  if (distractors.length < distractorCount) {
    const chosen = new Set([target.id, ...distractors.map((d) => d.id)]);
    const targetSkills = new Set(target.skills);
    // Prefer same length (a closer distractor), then any decodable word. Never
    // pad with a word requiring a skill the target lacks — that would violate
    // the iron rule at the target's own gate. Fewer distractors beats that.
    const decodable = words.filter(
      (w) => !chosen.has(w.id) && !w.heart && w.skills.every((s) => targetSkills.has(s)),
    );
    for (const pool of [
      decodable.filter((w) => w.text.length === target.text.length),
      decodable,
    ]) {
      for (const w of pool) {
        if (distractors.length >= distractorCount) break;
        if (chosen.has(w.id)) continue;
        distractors.push(w);
        chosen.add(w.id);
      }
    }
  }
  const order = seededShuffle(distractors.length + 1, seed);
  return { target, distractors, order, seed };
}

/** Query words within the taught set (optionally requiring a target skill). */
export function queryWords(opts: {
  withinSkills: Iterable<SkillId>;
  requireSkill?: SkillId;
  excludeIds?: string[];
  count: number;
}): Word[] {
  const taught = new Set(opts.withinSkills);
  const exclude = new Set(opts.excludeIds ?? []);
  const out: Word[] = [];
  for (const w of words) {
    if (exclude.has(w.id)) continue;
    if (!w.skills.every((s) => taught.has(s))) continue;
    if (opts.requireSkill && !w.skills.includes(opts.requireSkill)) continue;
    out.push(w);
    if (out.length >= opts.count) break;
  }
  return out;
}
