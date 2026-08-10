import { describe, expect, it } from 'vitest';
import {
  allBlocks,
  allBooks,
  allLines,
  allSpells,
  allWords,
  buildChallenge,
  curriculum,
  validateBook,
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

  it('degrades gracefully for words with no curated confusables (no throw)', () => {
    // These bare words (dragon names, signs) have no `c` array; buildChallenge
    // must never throw, and every distractor it invents must be decodable
    // wherever the target is (skills ⊆ target) and never the target itself.
    for (const t of ['log', 'hut', 'path', 'rex', 'ash', 'dash']) {
      const ch = buildChallenge(t, 3);
      expect(ch.distractors.map((d) => d.id), t).not.toContain(t);
      const targetSkills = new Set(ch.target.skills);
      for (const d of ch.distractors) {
        expect(d.skills.every((s) => targetSkills.has(s)), `${t} vs ${d.id}`).toBe(true);
      }
      // order is a valid permutation of [target, ...distractors]
      expect([...ch.order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: ch.distractors.length + 1 }, (_, i) => i),
      );
    }
    // Words with plenty of decodable siblings still fill to the full count.
    expect(buildChallenge('log', 3).distractors.length).toBe(2);
    expect(buildChallenge('hut', 3).distractors.length).toBe(2);
  });
});

describe('decodable books (the Library)', () => {
  it('every book is fully decodable at the first curriculum band (iron rule)', () => {
    // This is the gate: a child opens any Library book with only the initial
    // skills taught, so every title and page must contain only decodable words.
    for (const b of allBooks()) {
      const report = validateBook(b, taught);
      const bad = report.pages.flatMap((p) => p.violations.map((v) => v.token));
      expect(report.ok, `book "${b.id}" has undecodable words: ${bad.join(', ')}`).toBe(true);
    }
  });

  it('books have sane shape (id, title, 4-7 pages, valid reward)', () => {
    const ids = new Set<string>();
    for (const b of allBooks()) {
      expect(b.id, 'book id').toBeTruthy();
      expect(ids.has(b.id), `duplicate book id ${b.id}`).toBe(false);
      ids.add(b.id);
      expect(b.title.trim().length, `${b.id} title`).toBeGreaterThan(0);
      expect(b.pages.length, `${b.id} page count`).toBeGreaterThanOrEqual(4);
      expect(b.pages.length, `${b.id} page count`).toBeLessThanOrEqual(7);
      expect(['egg', 'gem', 'wood', 'stone'], `${b.id} reward`).toContain(b.reward);
      expect(b.pages.every((p) => p.trim().length > 0), `${b.id} empty page`).toBe(true);
    }
  });
});

describe('spells (power words)', () => {
  it('every spell word is a single decodable corpus word (the iron rule holds for magic)', () => {
    for (const s of allSpells()) {
      const report = validateText(s.word, taught);
      expect(report.ok, `spell "${s.word}" is not decodable: ${JSON.stringify(report.violations)}`).toBe(true);
      // A spell is one word — never a phrase a child couldn't blend in a breath.
      expect(s.word.trim().split(/\s+/).length, `spell "${s.word}" must be one word`).toBe(1);
      expect(word(s.word).heart, `spell "${s.word}" should be a decodable word, not a heart word`).toBe(false);
      expect(s.icon.length, `spell "${s.word}" needs an icon`).toBeGreaterThan(0);
      expect(s.particle.length, `spell "${s.word}" needs a particle`).toBeGreaterThan(0);
    }
  });

  it('spell words are unique', () => {
    const ws = allSpells().map((s) => s.word);
    expect(new Set(ws).size).toBe(ws.length);
  });
});

describe('build blocks', () => {
  it('every block unlock word is a single decodable corpus word', () => {
    for (const b of allBlocks()) {
      const report = validateText(b.word, taught);
      expect(report.ok, `block "${b.id}" word not decodable: ${JSON.stringify(report.violations)}`).toBe(true);
      expect(b.word.trim().split(/\s+/).length, `block "${b.id}" must unlock with one word`).toBe(1);
      expect(b.icon.length, `block "${b.id}" needs an icon`).toBeGreaterThan(0);
    }
  });

  it('block ids are unique and at least one is a starter', () => {
    const ids = allBlocks().map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allBlocks().some((b) => b.starter)).toBe(true);
  });

  it('craft recipes are decodable phrases whose ingredients exist', () => {
    const ids = new Set(allBlocks().map((b) => b.id));
    const craft = allBlocks().filter((b) => b.recipe);
    expect(craft.length, 'expected some craft blocks').toBeGreaterThan(0);
    for (const b of craft) {
      const report = validateText(b.recipe!, taught);
      expect(report.ok, `recipe "${b.recipe}" not decodable: ${JSON.stringify(report.violations)}`).toBe(true);
      expect(b.recipe!.trim().split(/\s+/).length, `recipe "${b.recipe}" should be a short phrase`).toBeGreaterThanOrEqual(2);
      expect(b.from?.length, `craft block "${b.id}" needs two ingredients`).toBe(2);
      for (const ing of b.from ?? []) {
        expect(ids.has(ing), `craft block "${b.id}" ingredient "${ing}" is not a block`).toBe(true);
      }
    }
  });
});
