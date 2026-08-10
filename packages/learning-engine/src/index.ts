// @readquest/learning-engine — pure TypeScript, no DOM, no Phaser, no I/O.
// Owns mastery math and (later) adaptive selection. The host persists
// snapshots; the append-only evidence log remains the source of truth and
// this state is always rebuildable by replaying it (architecture §5.2).

import type {
  Evidence,
  EngineSnapshot,
  MasteryBand,
  MasteryState,
  ScaffoldingPolicy,
  SkillId,
  TargetPlan,
  TargetRequest,
} from '@readquest/shared';
import { seededRandom } from '@readquest/shared';

interface SkillRecord {
  score: number;
  confidence: number;
  attempts: number;
  correct: number;
  lastSeenAt?: number;
  nextReviewAt?: number;
  reviewIntervalMs?: number;
}

const BASE_LEARNING_RATE = 0.15;
const MAX_LEARNING_RATE = 0.4;
const PRODUCTION_WEIGHT = 2.0;
const HINT_PENALTY = 0.25;

// Spaced repetition (roadmap §15): a mastered skill resurfaces at widening
// intervals; a failed review resets it and drops it back into practice.
const FIRST_REVIEW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const MAX_REVIEW_MS = 32 * 24 * 60 * 60 * 1000; // 32 days
const MASTERED_SCORE = 81;
const REVIEW_CONFIDENCE = 0.5;

/** Mastery bands from weakest to strongest — used to compare band thresholds. */
const BAND_ORDER: MasteryBand[] = ['new', 'learning', 'developing', 'proficient', 'mastered'];

export function band(score: number): MasteryBand {
  if (score <= 20) return 'new';
  if (score <= 40) return 'learning';
  if (score <= 60) return 'developing';
  if (score < 81) return 'proficient'; // mastered is 81–100 (not a score just over 80)
  return 'mastered';
}

export class LearningEngine {
  private skills = new Map<SkillId, SkillRecord>();
  private taught = new Set<SkillId>();
  private curriculumOrder: SkillId[] = [];

  constructor(initialTaught: Iterable<SkillId> = []) {
    for (const s of initialTaught) this.markTaught(s);
  }

  /** The ordered skill sequence, so nextTarget() knows what "new" comes next. */
  setCurriculum(order: SkillId[]): void {
    this.curriculumOrder = [...order];
  }

  /** "Taught" is a curriculum event, not a score (architecture §5.2). */
  markTaught(skillId: SkillId): void {
    this.taught.add(skillId);
    if (!this.skills.has(skillId)) {
      this.skills.set(skillId, { score: 0, confidence: 0, attempts: 0, correct: 0 });
    }
  }

  taughtSkills(): SkillId[] {
    return [...this.taught];
  }

  record(e: Evidence): void {
    const weight = e.channel === 'production' ? PRODUCTION_WEIGHT : 1.0;
    const hintCredit = Math.max(0, 1 - HINT_PENALTY * e.hintsUsed);
    const observed = e.correct ? 100 * hintCredit : 0;
    const lr = Math.min(MAX_LEARNING_RATE, BASE_LEARNING_RATE * weight);

    for (const skillId of e.skillIds) {
      const rec = this.skills.get(skillId) ?? {
        score: 0,
        confidence: 0,
        attempts: 0,
        correct: 0,
      };
      rec.score = clamp(rec.score + lr * (observed - rec.score), 0, 100);
      rec.attempts += 1;
      if (e.correct) rec.correct += 1;
      rec.confidence = Math.min(1, rec.confidence + 0.08 * weight);
      rec.lastSeenAt = e.at;
      this.updateReviewSchedule(rec, e);
      this.skills.set(skillId, rec);
    }
  }

  /** Spaced-repetition scheduling, updated on every attempt for a skill. */
  private updateReviewSchedule(rec: SkillRecord, e: Evidence): void {
    const wasScheduled = rec.nextReviewAt !== undefined;
    if (wasScheduled && e.at >= (rec.nextReviewAt ?? 0)) {
      // This attempt IS the due review.
      if (e.correct) {
        rec.reviewIntervalMs = Math.min(MAX_REVIEW_MS, (rec.reviewIntervalMs ?? FIRST_REVIEW_MS) * 2);
        rec.nextReviewAt = e.at + rec.reviewIntervalMs;
      } else {
        // Forgotten — reset and re-enter active practice (decay as scheduling).
        rec.score = clamp(rec.score - 15, 0, 100);
        rec.reviewIntervalMs = undefined;
        rec.nextReviewAt = undefined;
      }
      return;
    }
    // Newly mastered with enough evidence → schedule the first review.
    if (!wasScheduled && rec.score >= MASTERED_SCORE && rec.confidence >= REVIEW_CONFIDENCE) {
      rec.reviewIntervalMs = FIRST_REVIEW_MS;
      rec.nextReviewAt = e.at + FIRST_REVIEW_MS;
    }
  }

  /** Taught skills whose spaced-repetition review is due at `now`. */
  dueReviews(now: number): SkillId[] {
    const out: SkillId[] = [];
    for (const [id, rec] of this.skills) {
      if (this.taught.has(id) && rec.nextReviewAt !== undefined && rec.nextReviewAt <= now) {
        out.push(id);
      }
    }
    return out;
  }

  /**
   * Adaptive selection (roadmap §10, §15): ~70% comfort / 20% stretch / 10%
   * new, plus due spaced-repetition reviews woven into the stretch bucket.
   * Deterministic given a seed, so any session is reproducible.
   */
  nextTarget(req: TargetRequest, seed = 1, now = 0): TargetPlan {
    const rand = seededRandom(seed);
    const skillOf = (id: SkillId) => this.mastery(id).band;
    const taught = [...this.taught].filter((s) => s !== 'base');
    const due = this.dueReviews(now);

    const comfort = taught.filter((s) => ['proficient', 'mastered'].includes(skillOf(s)) && !due.includes(s));
    const stretch = taught.filter((s) => ['learning', 'developing'].includes(skillOf(s)));
    const fresh = taught.filter((s) => skillOf(s) === 'new'); // taught but barely practiced
    const nextNew = this.curriculumOrder.find((s) => !this.taught.has(s));

    const roll = rand();
    let bucket: TargetPlan['bucket'];
    let pool: SkillId[];
    if (roll < 0.1 && (nextNew || fresh.length)) {
      bucket = 'new';
      pool = nextNew ? [nextNew] : fresh;
    } else if (roll < 0.3 && (due.length || stretch.length || fresh.length)) {
      bucket = 'stretch';
      pool = due.length ? due : stretch.length ? stretch : fresh;
    } else {
      bucket = 'comfort';
      pool = comfort.length ? comfort : stretch.length ? stretch : fresh.length ? fresh : taught;
    }
    if (pool.length === 0) pool = taught.length ? taught : this.curriculumOrder.slice(0, 1);

    const targetSkill = pool[Math.floor(rand() * pool.length)] ?? 'short_a';
    return { targetSkill, bucket, taughtSkills: this.taughtSkills(), weaveReviews: due };
  }

  /**
   * Curriculum progression (roadmap §5.2: "taught" is a curriculum event, not a
   * score). Returns the next untaught skill in curriculum order the child is
   * READY to learn — but only once the current frontier (the hardest skill they
   * are already working on) is solid enough that adding a new sound won't
   * swamp them. Returns null when nothing new is ready, or the curriculum is
   * exhausted. Pure query: the host decides when to act (teach + celebrate).
   *
   * We gate on the FRONTIER (the taught skill sitting latest in the sequence),
   * not the whole taught set — the early short vowels master almost instantly
   * and would otherwise wave every later tier through at once.
   */
  nextSkillToUnlock(opts: { minBand?: MasteryBand; minAttempts?: number } = {}): SkillId | null {
    const nextNew = this.curriculumOrder.find((s) => !this.taught.has(s));
    if (!nextNew) return null; // curriculum exhausted
    const rank = new Map(this.curriculumOrder.map((s, i) => [s, i] as const));
    const contentTaught = [...this.taught].filter((s) => s !== 'base' && s !== 'heart');
    if (contentTaught.length === 0) return nextNew; // nothing gating → allow
    const frontier = contentTaught.reduce((a, b) => ((rank.get(b) ?? -1) > (rank.get(a) ?? -1) ? b : a));
    const m = this.mastery(frontier);
    const minAttempts = opts.minAttempts ?? 4;
    const minBand = opts.minBand ?? 'developing';
    if (m.attempts < minAttempts) return null;
    if (BAND_ORDER.indexOf(m.band) < BAND_ORDER.indexOf(minBand)) return null;
    return nextNew;
  }

  mastery(skillId: SkillId): MasteryState {
    const rec = this.skills.get(skillId) ?? {
      score: 0,
      confidence: 0,
      attempts: 0,
      correct: 0,
    };
    return {
      skillId,
      score: rec.score,
      confidence: rec.confidence,
      band: band(rec.score),
      attempts: rec.attempts,
      correct: rec.correct,
      lastSeenAt: rec.lastSeenAt,
      nextReviewAt: rec.nextReviewAt,
      taught: this.taught.has(skillId),
    };
  }

  allMastery(): MasteryState[] {
    const ids = new Set([...this.taught, ...this.skills.keys()]);
    return [...ids].map((id) => this.mastery(id));
  }

  /**
   * Slice behavior: the quest sequence is authored, so scaffolding is the only
   * live policy decision. Audio assist fades as overall mastery grows
   * (roadmap §7: auto-read → delayed button → on-request).
   */
  scaffolding(): ScaffoldingPolicy {
    const taught = [...this.taught].filter((s) => s !== 'base');
    if (taught.length === 0) return { dialogueAudio: 'auto', delayMs: 0 };
    const avg =
      taught.reduce((sum, s) => sum + this.mastery(s).score, 0) / taught.length;
    if (avg >= 75) return { dialogueAudio: 'on_request', delayMs: 0 };
    if (avg >= 45) return { dialogueAudio: 'delayed_button', delayMs: 4000 };
    return { dialogueAudio: 'auto', delayMs: 0 };
  }

  snapshot(): EngineSnapshot {
    const skills: EngineSnapshot['skills'] = {};
    for (const [id, rec] of this.skills) {
      skills[id] = {
        score: rec.score,
        confidence: rec.confidence,
        attempts: rec.attempts,
        correct: rec.correct,
        lastSeenAt: rec.lastSeenAt,
        nextReviewAt: rec.nextReviewAt,
      };
    }
    return { version: 1, taught: [...this.taught], skills };
  }

  static fromSnapshot(snap: EngineSnapshot): LearningEngine {
    const engine = new LearningEngine(snap.taught);
    for (const [id, rec] of Object.entries(snap.skills)) {
      engine.skills.set(id, { ...rec });
    }
    return engine;
  }

  /** Rebuild from the evidence log — the proof that state is a projection. */
  static replay(initialTaught: Iterable<SkillId>, log: Evidence[]): LearningEngine {
    const engine = new LearningEngine(initialTaught);
    for (const e of log) engine.record(e);
    return engine;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
