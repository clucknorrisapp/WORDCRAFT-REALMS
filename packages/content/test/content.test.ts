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
  it('every book is fully decodable at its gate tier (iron rule)', () => {
    // A book without a gate opens at the initial band; a gated book opens once
    // its tier is taught. Either way every title and page must be decodable at
    // the point the Library is allowed to show it.
    for (const b of allBooks()) {
      const taughtAt = b.gate ? curriculum.order.slice(0, curriculum.order.indexOf(b.gate) + 1) : taught;
      const report = validateBook(b, taughtAt);
      const bad = report.pages.flatMap((p) => p.violations.map((v) => v.token));
      expect(report.ok, `book "${b.id}" (gate ${b.gate ?? 'initial'}) undecodable: ${bad.join(', ')}`).toBe(true);
    }
  });

  it('gated books need their tier: decodable at the gate, blocked at the initial band', () => {
    for (const b of allBooks().filter((x) => x.gate)) {
      expect(curriculum.order.includes(b.gate!), `book "${b.id}" gate "${b.gate}" not in curriculum`).toBe(true);
      // The whole point of gating: the book is NOT fully decodable at the start,
      // so the Library rightly keeps it off the shelf until the tier unlocks.
      expect(validateBook(b, taught).ok, `gated book "${b.id}" should be blocked at initial`).toBe(false);
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
  it('every block unlock word is a single decodable corpus word at some taught tier', () => {
    for (const b of allBlocks()) {
      // Decodable once the whole curriculum is taught — a real word whose sounds
      // all live somewhere in the sequence. A higher-tier block is simply hidden
      // until its tier unlocks (the Build palette enforces that at runtime).
      const report = validateText(b.word, curriculum.order);
      expect(report.ok, `block "${b.id}" word not decodable: ${JSON.stringify(report.violations)}`).toBe(true);
      expect(b.word.trim().split(/\s+/).length, `block "${b.id}" must unlock with one word`).toBe(1);
      expect(b.icon.length, `block "${b.id}" needs an icon`).toBeGreaterThan(0);
    }
  });

  it('starter blocks are decodable from the very first lesson', () => {
    for (const b of allBlocks().filter((x) => x.starter)) {
      expect(validateText(b.word, taught).ok, `starter block "${b.id}" must decode at start`).toBe(true);
    }
  });

  it('block ids are unique and at least one is a starter', () => {
    const ids = allBlocks().map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allBlocks().some((b) => b.starter)).toBe(true);
  });

  it('craft recipes stay decodable once their gating sounds are taught', () => {
    // A craft recipe need only be readable at the tier that surfaces it — the
    // Build palette hides a recipe until validateText(recipe, taught) passes.
    for (const b of allBlocks().filter((x) => x.recipe)) {
      // Every recipe word is a real corpus word (so a tier exists that unlocks it).
      for (const tok of b.recipe!.toLowerCase().split(/\s+/)) {
        expect(() => word(tok), `recipe word "${tok}"`).not.toThrow();
      }
    }
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

describe('curriculum progression (blend tiers)', () => {
  const blendTiers: Array<{ skill: string; words: string[]; example: string }> = [
    { skill: 'blend_st', words: ['nest', 'best', 'fast', 'list'], example: 'nest' },
    { skill: 'blend_l', words: ['flag', 'clip', 'glad', 'plot', 'slip'], example: 'flag' },
    { skill: 'blend_r', words: ['frog', 'crab', 'drum', 'grin', 'trap'], example: 'frog' },
    { skill: 'blend_s', words: ['skip', 'spin', 'desk', 'mask', 'twin'], example: 'skip' },
    { skill: 'blend_end', words: ['lamp', 'tent', 'pond', 'jump', 'milk'], example: 'lamp' },
  ];

  it('each blend tier sits in curriculum order, after the initial set, monotonically', () => {
    const idx = (s: string) => curriculum.order.indexOf(s);
    for (const t of blendTiers) expect(idx(t.skill), `${t.skill} missing from order`).toBeGreaterThan(-1);
    // Every blend tier comes after the whole initial (scripted) curriculum.
    const lastInitial = Math.max(...curriculum.initialTaught.map(idx));
    for (const t of blendTiers) expect(idx(t.skill), `${t.skill} before initial set`).toBeGreaterThan(lastInitial);
    // Unlock order: st < l < r < s < end (each tier follows the previous one).
    expect(idx('blend_st')).toBeLessThan(idx('blend_l'));
    expect(idx('blend_l')).toBeLessThan(idx('blend_r'));
    expect(idx('blend_r')).toBeLessThan(idx('blend_s'));
    expect(idx('blend_s')).toBeLessThan(idx('blend_end'));
  });

  it('blend words are blocked at the initial set but decode once their tier is taught', () => {
    // This is the whole point of progression: the harder words are simply not
    // shown yet (iron rule), then become readable the moment the tier unlocks.
    for (const t of blendTiers) {
      for (const w of t.words) {
        expect(validateText(w, taught).ok, `${w} must be blocked before ${t.skill}`).toBe(false);
        expect(validateText(w, [...taught, t.skill]).ok, `${w} must decode once ${t.skill} is taught`).toBe(true);
      }
    }
  });

  it('every "New Sounds" example word exercises the tier it celebrates', () => {
    // Mirrors SKILL_INTRO in apps/game/src/ui/progression.ts — the example word
    // shown when a tier unlocks must actually require that tier's skill.
    for (const t of blendTiers) {
      expect(word(t.example).skills.includes(t.skill), `${t.example} should exercise ${t.skill}`).toBe(true);
      expect(validateText(t.example, [...taught, t.skill]).ok, `${t.example} decodable at its tier`).toBe(true);
    }
  });
});
