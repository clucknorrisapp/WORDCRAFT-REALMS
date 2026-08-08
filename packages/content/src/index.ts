import type {
  ChallengeContent,
  DecodabilityReport,
  DecodabilityViolation,
  Line,
  SkillId,
  Word,
} from '@readquest/shared';
import { seededShuffle } from '@readquest/shared';
import curriculumJson from '../data/curriculum.json';
import linesJson from '../data/lines.json';
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
}

function deriveSkills(raw: RawWord): SkillId[] {
  if (raw.heart) return ['heart'];
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

const words: Word[] = (wordsJson as RawWord[]).map(toWord);
const byText = new Map<string, Word>(words.map((w) => [w.text, w]));
const lines: Line[] = linesJson as Line[];
const linesById = new Map<string, Line>(lines.map((l) => [l.id, l]));

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
  if (target.confusables.length < distractorCount) {
    throw new Error(`Word "${targetText}" has fewer than ${distractorCount} confusables`);
  }
  const distractors = target.confusables.slice(0, distractorCount).map((c) => word(c));
  const order = seededShuffle(distractorCount + 1, seed);
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
