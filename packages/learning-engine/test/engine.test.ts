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
