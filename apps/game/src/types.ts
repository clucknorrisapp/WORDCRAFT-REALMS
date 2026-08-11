import type { Evidence, GameEvent, SkillId } from '@readquest/shared';

export const QuestStep = {
  INTRO_SIGNS: 0,
  GATHER_BUILD: 1,
  MEET_MAYOR: 2,
  PATH_CHOICE: 3,
  CAVE_DOOR: 4,
  HUNT: 5,
  RETURN_MAYOR: 6,
  BUILD_COOP: 7,
  CHEST: 8,
  FREE_PLAY: 9,
} as const;
export type QuestStepId = (typeof QuestStep)[keyof typeof QuestStep];

export interface SettingsData {
  micEnabled: boolean;
  /** gentle = two misses open the door anyway (roadmap pillar 4, kid default).
   *  strict = the door holds until the word is verifiably spoken. */
  micStrictness: 'gentle' | 'strict';
  narrationRate: number; // 0.7–1.3
  textScale: number; // 0.9–1.4
  /** Game sound effects (procedural Web Audio thocks/pops/chimes). Narration is
   *  separate and always on. */
  sfxEnabled: boolean;
  // ── Accessibility ──
  /** Dyslexia-friendly typography: generous letter/word/line spacing. */
  dyslexiaFont: boolean;
  /** High-contrast palette: near-black text on white, bolder borders. */
  highContrast: boolean;
  /** Calm mode: suppress confetti, bounces, camera drift, and CSS animation. */
  reducedMotion: boolean;
}

/** A Help-Wanted job from an NPC: read a short decodable order, go do it, come
 *  back for a reward. Generated from decodable templates so it renews forever. */
export interface Job {
  giver: 'mayor' | 'wizard';
  kind: 'wood' | 'stone' | 'eggs';
  text: string; // the decodable order the child reads, e.g. "chop a log"
  icon: string; // resource icon 🪵 🪨 🥚
  target: number; // how many to bring
  progress: number; // how many so far
}

export interface SaveData {
  v: 1;
  childId: string;
  avatar: number | null;
  dragonName: string | null; // 'rex' | 'ash' | 'chip' | 'dash'
  dragonLevel: number;
  dragonXp: number;
  questStep: QuestStepId;
  wood: number;
  stone: number;
  eggs: number;
  gems: number;
  signsRead: string[];
  hensFound: string[]; // 'shed' | 'rock' | 'log'
  wallsBuilt: number[];
  coopStage: number; // 0–3
  treasureClaimed: boolean;
  booksRead: string[]; // Library book ids finished at least once (reward paid)
  blocksUnlocked: string[]; // Build Mode block ids unlocked by reading their word
  build: Record<string, string>; // Build Mode grid: "col,row" → blockId
  worldBuild: Record<string, string>; // Build-Where-You-Stand: "tileX,tileY" → blockId (world tiles)
  buildPlaced: number; // cumulative blocks ever placed — drives Builder rank
  glintsFound: string[]; // overworld glint-cache ids already collected (one-time rewards)
  deedsEarned: string[]; // achievement ("deed") ids earned — each celebrated once
  lastGiftDay: string | null; // YYYY-MM-DD of the last claimed daily word-of-the-day gift
  job: Job | null; // the active Help-Wanted job, if any (Quest Board)
  jobsDone: number; // cumulative jobs completed — a progression tally
  pets: string[]; // species ids of babies hatched from eggs (they live on the plot)
  canvasLevel: number; // Build-canvas size tier — grows with books read / sounds unlocked
  taught: SkillId[];
  evidence: Evidence[];
  events: GameEvent[];
  firstSessionAt: number;
  settings: SettingsData;
}

export const DRAGON_NAMES = ['rex', 'ash', 'chip', 'dash'] as const;
export const DRAGON_TINTS: Record<string, number> = {
  rex: 0xffb3a7, // warm red-ish over mint
  ash: 0xbfc6cc, // soft gray
  chip: 0xffd48a, // golden
  dash: 0xa7c8ff, // blue
};
