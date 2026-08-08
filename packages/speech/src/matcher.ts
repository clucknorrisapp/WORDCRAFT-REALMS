// The forgiving matcher — the closed-set insight that makes v1 viable
// (architecture §5.5): we never transcribe openly, we ask "did this utterance
// ≈ the expected word?". Bias policy: false-accepts are pedagogically fine,
// false-rejects are the product killer. ONSET confusions (sip↔ship, chip↔ship)
// stay REJECTED — they are the signal the speech-error classifier (v3) is built
// on. Same-onset near-misses (shin↔ship) are ACCEPTED at reduced confidence
// (0.6): the forgiving bias favors letting a close attempt through.

export interface MatchResult {
  match: boolean;
  confidence: number; // 1 exact · 0.9 key-equal · 0.6 near (same onset) · 0 none
}

const DIGRAPHS: Array<[RegExp, string]> = [
  [/sh/g, 'ʃ'],
  [/ch/g, 'χ'],
  [/th/g, 'θ'],
  [/wh/g, 'w'],
  [/ph/g, 'f'],
  [/ck/g, 'k'],
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Phonetic-ish key: digraphs become single symbols, doubles collapse. */
export function phoneticKey(word: string): string {
  let key = normalize(word).replace(/\s/g, '');
  for (const [re, sym] of DIGRAPHS) key = key.replace(re, sym);
  key = key.replace(/(.)\1+/g, '$1');
  return key;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(
        dp[j]! + 1,
        dp[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n]!;
}

/**
 * Match a recognized utterance (possibly several words: "the ship") against
 * one expected word plus an optional accept-set.
 */
export function matchUtterance(
  recognized: string,
  expected: string,
  acceptAlso: string[] = [],
): MatchResult {
  const tokens = normalize(recognized).split(' ').filter(Boolean);
  if (tokens.length === 0) return { match: false, confidence: 0 };

  const targets = [expected, ...acceptAlso].map((t) => ({
    raw: normalize(t),
    key: phoneticKey(t),
  }));

  let best: MatchResult = { match: false, confidence: 0 };
  for (const token of tokens) {
    const tokenKey = phoneticKey(token);
    for (const target of targets) {
      if (token === target.raw) return { match: true, confidence: 1 };
      if (tokenKey === target.key) best = better(best, { match: true, confidence: 0.9 });
      else if (
        tokenKey.length >= 3 &&
        tokenKey[0] === target.key[0] && // onset must match — sip≠ship, chip≠ship
        levenshtein(tokenKey, target.key) === 1
      ) {
        best = better(best, { match: true, confidence: 0.6 });
      }
    }
  }
  return best;
}

function better(a: MatchResult, b: MatchResult): MatchResult {
  return b.confidence > a.confidence ? b : a;
}
