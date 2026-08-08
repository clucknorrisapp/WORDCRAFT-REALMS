import { describe, expect, it } from 'vitest';
import {
  allLines,
  allWords,
  buildChallenge,
  curriculum,
  validateLine,
  validateText,
  word,
} from '../src/index';

const taught = curriculum.initialTaught;

describe('word corpus integrity', () => {
  it('has a substantial slice corpus', () => {
    expect(allWords().length).toBeGreaterThanOrEqual(150);
  });

  it('graphemes recompose exactly to the word text', () => {
    for (const w of allWords()) {
      expect(w.graphemes.join('')).toBe(w.text);
    }
  });

  it('every confusable reference resolves to a real word', () => {
    for (const w of allWords()) {
      for (const c of w.confusables) {
        expect(() => word(c)).not.toThrow();
      }
    }
  });

  it('heart words match the curriculum heart list', () => {
    const heartInCorpus = allWords().filter((w) => w.heart).map((w) => w.text).sort();
    expect(heartInCorpus).toEqual([...curriculum.heartWords].sort());
  });
});

describe('the iron rule (decodability validator)', () => {
  it('every decodable line passes at the slice taught set', () => {
    for (const l of allLines()) {
      const report = validateLine(l, taught);
      expect(report.violations, `line ${l.id}: ${JSON.stringify(report.violations)}`).toEqual([]);
    }
  });

  it('all slice interaction words are decodable at start', () => {
    for (const t of ['ship', 'hen', 'chick', 'shed', 'shop', 'egg', 'nut', 'jam', 'rex', 'ash', 'chip', 'dash']) {
      expect(validateText(t, taught).ok, t).toBe(true);
    }
  });

  it('CHEST is a deliberate stretch word: blocked at start, allowed once blend_st is taught', () => {
    expect(validateText('chest', taught).ok).toBe(false);
    expect(validateText('chest', [...taught, 'blend_st']).ok).toBe(true);
  });

  it('flags untaught and unknown words', () => {
    const report = validateText('the rain is here', taught); // rain: vowel team, unregistered
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.token)).toContain('rain');
  });
});

describe('challenge builder', () => {
  it('is a deterministic seeded permutation', () => {
    const a = buildChallenge('hen', 42);
    const b = buildChallenge('hen', 42);
    expect(a.order).toEqual(b.order);
    expect([...a.order].sort()).toEqual([0, 1, 2]);
    expect(a.target.text).toBe('hen');
    expect(a.distractors.map((d) => d.text)).toEqual(['hat', 'hop']);
  });

  it('different seeds change presentation order somewhere in the first dozen', () => {
    const orders = new Set(
      Array.from({ length: 12 }, (_, s) => buildChallenge('hen', s).order.join(',')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
