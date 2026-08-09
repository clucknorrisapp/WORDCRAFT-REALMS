// @readquest/shared — the module seams. Every package speaks these types and
// nothing else crosses the boundaries (see docs/TECHNICAL-ARCHITECTURE.md §6).

// ── Identity ────────────────────────────────────────────────────────────────
export type SkillId = string; // 'short_a' | 'digraph_sh' | 'heart' | 'base' | ...
export type WordId = string; // word text is the id in the slice corpus
export type LineId = string; // 'ln_mayor_1'
export type ChildId = string;

export type ChallengeType =
  | 'sign_read'
  | 'path_choice'
  | 'word_match'
  | 'magic_word'
  | 'narrated_dialogue' // exposure — not counted as a reading interaction
  | 'blending_forge'
  | 'sentence_read'
  | 'spell_cast'
  | 'phoneme';

/** Interaction types that count toward the playtest gate's "reading interactions". */
export const COUNTABLE_TYPES: readonly ChallengeType[] = [
  'sign_read',
  'path_choice',
  'word_match',
  'magic_word',
  'sentence_read', // reading a Library book page — the strongest reading signal
];

// ── Evidence: the atomic learning record ────────────────────────────────────
export interface SpeechOutcome {
  expected: string;
  recognized: string | null;
  confidence: number;
}

export interface Evidence {
  eventId: string;
  childId: ChildId;
  at: number;
  challengeType: ChallengeType;
  skillIds: SkillId[]; // exercised skills; [0] = target
  wordId?: WordId;
  lineId?: LineId;
  channel: 'recognition' | 'production';
  correct: boolean;
  attemptIndex: number; // 1 = first try
  hintsUsed: number; // hint-ladder depth reached
  audioRequested: boolean;
  micUsed: boolean;
  responseMs?: number;
  seed?: number; // presentation shuffle seed, for reproducibility
  speech?: SpeechOutcome;
}

// ── Learning engine ─────────────────────────────────────────────────────────
export type MasteryBand = 'new' | 'learning' | 'developing' | 'proficient' | 'mastered';

export interface MasteryState {
  skillId: SkillId;
  score: number; // 0–100
  confidence: number; // 0–1
  band: MasteryBand;
  attempts: number;
  correct: number;
  lastSeenAt?: number;
  nextReviewAt?: number;
  taught: boolean;
}

export interface TargetRequest {
  childId: ChildId;
  hostableTypes: ChallengeType[];
}

export interface TargetPlan {
  targetSkill: SkillId;
  bucket: 'comfort' | 'stretch' | 'new';
  taughtSkills: SkillId[]; // iron-rule input for content queries
  weaveReviews: SkillId[];
}

export interface ScaffoldingPolicy {
  dialogueAudio: 'auto' | 'delayed_button' | 'on_request';
  delayMs: number;
}

export interface EngineSnapshot {
  version: 1;
  taught: SkillId[];
  skills: Record<SkillId, Omit<MasteryState, 'skillId' | 'band' | 'taught'>>;
}

// ── Content ─────────────────────────────────────────────────────────────────
export interface Word {
  id: WordId;
  text: string;
  graphemes: string[]; // ['sh','i','p'] — phoneme-bearing units for the hint ladder
  skills: SkillId[]; // derived from graphemes (+ 'heart' for heart words)
  heart: boolean;
  confusables: WordId[]; // curated distractors; may be empty for non-challenge words
}

export type LineMode = 'decodable' | 'narrated';

export interface Line {
  id: LineId;
  text: string;
  speaker: string; // 'narrator' | 'mayor_hen' | 'wizard'
  mode: LineMode; // decodable → iron rule enforced; narrated → scaffolded exposure
  gate?: SkillId; // last skill that must be taught before this text may appear
}

export interface ChallengeContent {
  target: Word;
  distractors: Word[];
  order: number[]; // seeded shuffle of [target, ...distractors]
  seed: number;
}

// ── Decodable readers ───────────────────────────────────────────────────────
export type BookReward = 'egg' | 'gem' | 'wood' | 'stone';

/** A little decodable book a child reads in the Library. Every page is
 *  iron-rule text: only words the reader can already decode (validated in
 *  content's test suite exactly like decodable lines). */
export interface Book {
  id: string;
  title: string; // 2-4 decodable words
  cover: string; // emoji shown on the shelf + cover page
  reward: BookReward; // paid once, the first time the book is finished
  pages: string[]; // one decodable string per page (4-7 pages)
}

export interface DecodabilityViolation {
  token: string;
  missingSkills: SkillId[];
}

export interface DecodabilityReport {
  ok: boolean;
  violations: DecodabilityViolation[];
}

// ── Voice (TTS output) ──────────────────────────────────────────────────────
export interface SpeakRequest {
  lineId?: LineId; // authored line (pre-generated clip when available)
  text: string; // always present: fallback synthesis + highlighting source
  voice: string;
  rate?: number; // 1 = normal; hint ladder slow-blend uses < 1
}

export interface SpeakHandle {
  onWordBoundary(cb: (wordIndex: number) => void): void;
  onEnd(cb: () => void): void;
  stop(): void;
}

export interface VoiceService {
  speak(req: SpeakRequest): SpeakHandle;
  /** Pre-generated clip ids available (line/word audio). */
  hasClip(id: string): boolean;
}

// ── Speech (mic input) ──────────────────────────────────────────────────────
// Deliberately no API that exposes or persists raw audio: "we never store your
// child's voice" is an interface-shape guarantee, not a policy.
export interface ListenRequest {
  expected: string;
  acceptAlso?: string[];
  timeoutMs: number;
}

export type ListenStatus =
  | 'match'
  | 'no_match'
  | 'no_speech'
  | 'timeout'
  | 'permission_denied'
  | 'unsupported'
  | 'error';

export interface ListenResult {
  status: ListenStatus;
  recognized: string | null;
  confidence: number; // matcher confidence, not raw ASR confidence
  method: 'webspeech' | 'cloud' | 'ondevice' | 'none';
}

export interface AvailabilityReport {
  supported: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
}

export interface SpeechService {
  available(): Promise<AvailabilityReport>;
  listen(req: ListenRequest): Promise<ListenResult>;
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface GameEvent {
  type: string;
  at: number;
  payload?: Record<string, unknown>;
}

// ── Utilities ───────────────────────────────────────────────────────────────
/** Deterministic PRNG (mulberry32) — all anti-guessing shuffles are seeded. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(n: number, seed: number): number[] {
  const rand = seededRandom(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = order[i]!;
    order[i] = order[j]!;
    order[j] = a;
  }
  return order;
}

export function newEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ev_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  }
}
