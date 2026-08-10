import { describe, expect, it } from 'vitest';
import type { Evidence } from '@readquest/shared';
import { LearningEngine, band } from '../src/index';

let counter = 0;
function ev(partial: Partial<Evidence>): Evidence {
  counter += 1;
  return {
    eventId: `e${counter}`,
    childId: 'c1',
    at: counter * 1000,
    challengeType: 'word_match',
    skillIds: ['digraph_sh'],
    channel: 'recognition',
    correct: true,
    attemptIndex: 1,
    hintsUsed: 0,
    audioRequested: false,
    micUsed: false,
    ...partial,
  };
}

describe('mastery model', () => {
  it('bands match the design (0-20 new ... 81-100 mastered)', () => {
    expect(band(0)).toBe('new');
    expect(band(21)).toBe('learning');
    expect(band(41)).toBe('developing');
    expect(band(61)).toBe('proficient');
    expect(band(80.5)).toBe('proficient'); // a score just over 80 is NOT mastered
    expect(band(81)).toBe('mastered');
  });

  it('production evidence moves mastery faster than recognition (2x weight)', () => {
    const rec = new LearningEngine(['digraph_sh']);
    const prod = new LearningEngine(['digraph_sh']);
    for (let i = 0; i < 5; i++) {
      rec.record(ev({ channel: 'recognition' }));
      prod.record(ev({ channel: 'production', micUsed: true, challengeType: 'magic_word' }));
    }
    expect(prod.mastery('digraph_sh').score).toBeGreaterThan(rec.mastery('digraph_sh').score);
  });

  it('hints reduce credit; failures reduce score', () => {
    const clean = new LearningEngine(['digraph_sh']);
    const hinted = new LearningEngine(['digraph_sh']);
    for (let i = 0; i < 4; i++) {
      clean.record(ev({}));
      hinted.record(ev({ hintsUsed: 3 }));
    }
    expect(hinted.mastery('digraph_sh').score).toBeLessThan(clean.mastery('digraph_sh').score);

    const before = clean.mastery('digraph_sh').score;
    clean.record(ev({ correct: false }));
    expect(clean.mastery('digraph_sh').score).toBeLessThan(before);
  });

  it('scores stay within 0-100 under sustained streaks', () => {
    const e = new LearningEngine(['short_a']);
    for (let i = 0; i < 200; i++) e.record(ev({ skillIds: ['short_a'], channel: 'production' }));
    expect(e.mastery('short_a').score).toBeLessThanOrEqual(100);
    for (let i = 0; i < 200; i++) e.record(ev({ skillIds: ['short_a'], correct: false }));
    expect(e.mastery('short_a').score).toBeGreaterThanOrEqual(0);
  });

  it('snapshot round-trips and replay reproduces identical state', () => {
    const e = new LearningEngine(['digraph_sh', 'short_e']);
    const log: Evidence[] = [];
    for (let i = 0; i < 10; i++) {
      const item = ev({
        skillIds: i % 2 ? ['digraph_sh'] : ['short_e', 'heart'],
        correct: i % 3 !== 0,
        channel: i % 2 ? 'production' : 'recognition',
      });
      log.push(item);
      e.record(item);
    }
    const restored = LearningEngine.fromSnapshot(e.snapshot());
    expect(restored.snapshot()).toEqual(e.snapshot());

    const replayed = LearningEngine.replay(['digraph_sh', 'short_e'], log);
    expect(replayed.mastery('digraph_sh').score).toBeCloseTo(e.mastery('digraph_sh').score, 10);
  });

  it('audio scaffolding fades as mastery grows', () => {
    const e = new LearningEngine(['short_a']);
    expect(e.scaffolding().dialogueAudio).toBe('auto');
    for (let i = 0; i < 60; i++) e.record(ev({ skillIds: ['short_a'], channel: 'production' }));
    expect(e.scaffolding().dialogueAudio).toBe('on_request');
  });
});

describe('adaptive selection', () => {
  function drive(e: LearningEngine, skill: string, n: number, correct = true) {
    for (let i = 0; i < n; i++) {
      e.record(ev({ skillIds: [skill], channel: 'production', correct }));
    }
  }

  it('nextTarget honors the ~70/20/10 comfort/stretch/new split', () => {
    const e = new LearningEngine(['short_a', 'short_i', 'short_o', 'heart']);
    e.setCurriculum(['short_a', 'short_i', 'short_o', 'heart', 'digraph_sh']); // sh untaught = "new"
    drive(e, 'short_a', 30); // → mastered (comfort)
    drive(e, 'short_i', 30);
    drive(e, 'short_o', 30);
    drive(e, 'heart', 2); // 2 production → score ~51 = developing (stretch)
    expect(e.mastery('heart').band).toBe('developing');
    expect(e.mastery('short_a').band).toBe('mastered');

    const tally = { comfort: 0, stretch: 0, new: 0 };
    for (let seed = 1; seed <= 3000; seed++) {
      tally[e.nextTarget({ childId: 'c', hostableTypes: ['word_match'] }, seed).bucket] += 1;
    }
    const total = 3000;
    expect(tally.comfort / total).toBeGreaterThan(0.6);
    expect(tally.comfort / total).toBeLessThan(0.8);
    expect(tally.stretch / total).toBeGreaterThan(0.12);
    expect(tally.stretch / total).toBeLessThan(0.28);
    expect(tally.new / total).toBeGreaterThan(0.05);
    expect(tally.new / total).toBeLessThan(0.15);
  });

  it('the "new" bucket targets the next untaught curriculum skill', () => {
    const e = new LearningEngine(['short_a']);
    e.setCurriculum(['short_a', 'digraph_sh', 'digraph_ch']);
    let sawNew = false;
    for (let seed = 1; seed <= 200; seed++) {
      const plan = e.nextTarget({ childId: 'c', hostableTypes: ['word_match'] }, seed);
      if (plan.bucket === 'new') {
        expect(plan.targetSkill).toBe('digraph_sh');
        sawNew = true;
      }
    }
    expect(sawNew).toBe(true);
  });

  it('mastering a skill schedules a spaced-repetition review; a failed review resets it', () => {
    const e = new LearningEngine(['digraph_sh']);
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) {
      e.record(ev({ skillIds: ['digraph_sh'], channel: 'production', at: t0 + i }));
    }
    expect(e.mastery('digraph_sh').band).toBe('mastered');
    const review = e.mastery('digraph_sh').nextReviewAt;
    expect(review).toBeGreaterThan(t0);
    expect(e.dueReviews(t0)).not.toContain('digraph_sh'); // not due yet
    expect(e.dueReviews(review! + 1)).toContain('digraph_sh'); // due later

    // A failed review drops the score and clears the schedule (back to practice).
    const before = e.mastery('digraph_sh').score;
    e.record(ev({ skillIds: ['digraph_sh'], correct: false, at: review! + 2 }));
    expect(e.mastery('digraph_sh').score).toBeLessThan(before);
    expect(e.mastery('digraph_sh').nextReviewAt).toBeUndefined();
  });

  it('nextTarget is deterministic for a given seed', () => {
    const e = new LearningEngine(['short_a', 'short_i']);
    e.setCurriculum(['short_a', 'short_i', 'digraph_sh']);
    const a = e.nextTarget({ childId: 'c', hostableTypes: ['word_match'] }, 77);
    const b = e.nextTarget({ childId: 'c', hostableTypes: ['word_match'] }, 77);
    expect(a).toEqual(b);
  });
});

describe('curriculum progression (nextSkillToUnlock)', () => {
  const ORDER = ['base', 'short_a', 'heart', 'digraph_sh', 'blend_st', 'blend_l', 'blend_r'];
  function drive(e: LearningEngine, skill: string, n: number, correct = true) {
    for (let i = 0; i < n; i++) e.record(ev({ skillIds: [skill], channel: 'production', correct }));
  }

  it('does not unlock the next tier until the frontier has been practiced enough', () => {
    const e = new LearningEngine(['base', 'short_a', 'heart', 'digraph_sh', 'blend_st']);
    e.setCurriculum(ORDER);
    expect(e.nextSkillToUnlock()).toBeNull(); // frontier blend_st unpracticed
    drive(e, 'blend_st', 2); // a couple of reps < the minAttempts gate
    expect(e.nextSkillToUnlock()).toBeNull();
  });

  it('unlocks the next untaught skill once the frontier is solid', () => {
    const e = new LearningEngine(['base', 'short_a', 'heart', 'digraph_sh', 'blend_st']);
    e.setCurriculum(ORDER);
    drive(e, 'blend_st', 6);
    expect(e.mastery('blend_st').attempts).toBeGreaterThanOrEqual(4);
    expect(['developing', 'proficient', 'mastered']).toContain(e.mastery('blend_st').band);
    expect(e.nextSkillToUnlock()).toBe('blend_l');
  });

  it('gates on the FRONTIER, not the easy early skills that master instantly', () => {
    const e = new LearningEngine(['base', 'short_a', 'heart', 'digraph_sh']);
    e.setCurriculum(ORDER);
    drive(e, 'short_a', 30); // mastered — but it is not the frontier
    expect(e.mastery('short_a').band).toBe('mastered');
    expect(e.nextSkillToUnlock()).toBeNull(); // digraph_sh (frontier) barely practiced
    drive(e, 'digraph_sh', 6);
    expect(e.nextSkillToUnlock()).toBe('blend_st');
  });

  it('advances one tier at a time (a freshly taught frontier re-gates the next)', () => {
    const e = new LearningEngine(['base', 'short_a', 'heart', 'digraph_sh', 'blend_st']);
    e.setCurriculum(ORDER);
    drive(e, 'blend_st', 6);
    const next = e.nextSkillToUnlock();
    expect(next).toBe('blend_l');
    e.markTaught(next!); // the host teaches it
    expect(e.nextSkillToUnlock()).toBeNull(); // new frontier blend_l unpracticed
    drive(e, 'blend_l', 6);
    expect(e.nextSkillToUnlock()).toBe('blend_r');
  });

  it('returns null when the curriculum is exhausted', () => {
    const e = new LearningEngine(ORDER);
    e.setCurriculum(ORDER);
    expect(e.nextSkillToUnlock()).toBeNull();
  });
});
