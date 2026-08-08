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
} from '@readquest/shared';

interface SkillRecord {
  score: number;
  confidence: number;
  attempts: number;
  correct: number;
  lastSeenAt?: number;
  nextReviewAt?: number;
}

const BASE_LEARNING_RATE = 0.15;
const MAX_LEARNING_RATE = 0.4;
const PRODUCTION_WEIGHT = 2.0;
const HINT_PENALTY = 0.25;

export function band(score: number): MasteryBand {
  if (score <= 20) return 'new';
  if (score <= 40) return 'learning';
  if (score <= 60) return 'developing';
  if (score <= 80) return 'proficient';
  return 'mastered';
}

export class LearningEngine {
  private skills = new Map<SkillId, SkillRecord>();
  private taught = new Set<SkillId>();

  constructor(initialTaught: Iterable<SkillId> = []) {
    for (const s of initialTaught) this.markTaught(s);
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
      this.skills.set(skillId, rec);
    }
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
