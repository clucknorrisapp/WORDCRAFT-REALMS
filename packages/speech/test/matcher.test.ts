import { describe, expect, it } from 'vitest';
import { matchUtterance, phoneticKey } from '../src/matcher';

describe('phonetic key', () => {
  it('folds digraphs to single symbols and collapses doubles', () => {
    expect(phoneticKey('ship')).toBe('ʃip');
    expect(phoneticKey('shipp')).toBe('ʃip');
    expect(phoneticKey('chest')).toBe('χest');
    expect(phoneticKey('Thick!')).toBe('θik');
  });
});

describe('forgiving matcher — accepts what should pass', () => {
  it('exact word', () => {
    expect(matchUtterance('ship', 'ship').confidence).toBe(1);
  });
  it('sentence containing the word ("the ship")', () => {
    expect(matchUtterance('the ship', 'ship').match).toBe(true);
  });
  it('spelling variants with the same sounds (shipp, SHIP.)', () => {
    expect(matchUtterance('Shipp', 'ship').match).toBe(true);
    expect(matchUtterance('SHIP.', 'ship').match).toBe(true);
  });
  it('near miss with correct onset (shin for ship) — forgiving accept', () => {
    const m = matchUtterance('shin', 'ship');
    expect(m.match).toBe(true);
    expect(m.confidence).toBeLessThan(0.9);
  });
  it('accept-set homophone', () => {
    expect(matchUtterance('chess', 'chest', ['chess']).match).toBe(true);
  });
});

describe('forgiving matcher — rejects the pedagogy signals', () => {
  it('sip for ship (missing SH) is a miss, not a match', () => {
    expect(matchUtterance('sip', 'ship').match).toBe(false);
  });
  it('chip for ship (wrong digraph) is a miss', () => {
    expect(matchUtterance('chip', 'ship').match).toBe(false);
  });
  it('unrelated words are misses', () => {
    expect(matchUtterance('dog', 'ship').match).toBe(false);
    expect(matchUtterance('', 'ship').match).toBe(false);
  });
});
