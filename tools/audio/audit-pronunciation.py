#!/usr/bin/env python3
"""Deterministic pronunciation audit — no audio, no credits, no ASR noise.

For every spoken word the game teaches, look up its canonical English
pronunciation in the CMU Pronouncing Dictionary and confirm the VOWEL matches
the short-vowel sound the phonics is teaching (from the word's grapheme). This
catches exactly the class of bug behind "hut → hoot": a word whose real
English pronunciation is a different vowel than the one we teach, or a word
that is a homograph / not a real word (which a TTS engine would guess at).

Heart (sight) words are irregular by design, so we only confirm they exist in
the dictionary and print their pronunciation for a human to eyeball once.

    python3 tools/audio/audit-pronunciation.py

Deps: pip install cmudict
"""
import json
import re
import subprocess
import sys

import cmudict

ROOT = "packages/content/data"
CMU = cmudict.dict()

VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}

# The short-vowel phoneme each vowel grapheme should produce, with the accepted
# CMU variants (o is AA or AO; u is AH or UH; short-e sometimes ER before r).
EXPECTED_VOWEL = {
    "a": {"AE"},
    "e": {"EH"},
    "i": {"IH"},
    "o": {"AA", "AO"},
    "u": {"AH", "UH"},
}
VOWEL_GRAPHEMES = set(EXPECTED_VOWEL)

# Dragon names / made-up tokens that are legitimately not dictionary words.
KNOWN_NAMES = {"rex", "ash", "chip", "dash", "chomp", "zap", "yak", "yum"}


def vowels_of(phones):
    return [re.sub(r"\d", "", p) for p in phones if re.sub(r"\d", "", p) in VOWELS]


def audit():
    words = {w["text"]: w for w in json.load(open(f"{ROOT}/words.json"))}
    curr = json.load(open(f"{ROOT}/curriculum.json"))
    heart = set(curr.get("heartWords", []))
    overrides = json.load(open(f"{ROOT}/pronunciations.json"))

    # The exact set the game speaks as word cards — derived live from the clip
    # generator so the audit can never drift from what actually ships.
    if len(sys.argv) > 1:
        clips = json.load(open(sys.argv[1]))
    else:
        out = subprocess.check_output(["node", "tools/audio/emit-wordlist.mjs"])
        clips = json.loads(out)
    clip_words = sorted({c["word"] for c in clips})

    verified, flags, heart_report = [], [], []
    for w in clip_words:
        override = overrides.get(w)
        lookup = (override or w).lower()
        prons = CMU.get(lookup)

        if w in heart:
            note = f"{w!r}: " + ("/".join(" ".join(p) for p in prons) if prons else "NOT IN DICT")
            heart_report.append(note)
            if not prons:
                flags.append((w, f"heart word not in dictionary (spoken as {lookup!r})"))
            continue

        if not prons:
            if w in KNOWN_NAMES:
                verified.append(w)  # intentional non-dictionary token
            else:
                flags.append((w, f"{lookup!r} not in CMU dictionary — TTS would guess"))
            continue

        if override:
            verified.append(w)  # human-chosen override, dictionary-confirmed
            continue

        # Phonics vowel match: at least ONE dictionary pronunciation's vowels
        # must be the short vowel(s) the word's grapheme(s) teach. (An isolated
        # word card is spoken in its strong/citation form, so a word only needs
        # one matching pronunciation — reduced "schwa" forms of function words
        # like "an"/"and", and dialect variants like AA/AO for short-o, are not
        # mispronunciations.) Only a word where NO pronunciation matches the
        # taught vowel is a real problem.
        graphemes = words.get(w, {}).get("g", [])
        expected = [EXPECTED_VOWEL[g] for g in graphemes if g in VOWEL_GRAPHEMES]
        if not expected:
            verified.append(w)  # no short-vowel grapheme to check (rare)
            continue

        def matches(p):
            got = vowels_of(p)
            return len(got) == len(expected) and all(got[i] in expected[i] for i in range(len(expected)))

        if any(matches(p) for p in prons):
            verified.append(w)
        else:
            flags.append((
                w,
                f"vowel mismatch: teaches {['|'.join(sorted(e)) for e in expected]} but "
                f"dictionary has {[' '.join(p) for p in prons]}",
            ))

    print(f"Audited {len(clip_words)} spoken words against the CMU dictionary.\n")
    print(f"VERIFIED correct: {len(verified)}")
    print(f"FLAGGED: {len(flags)}\n")
    if flags:
        print("FLAGGED (real pronunciation risk — fix with an override):")
        for w, why in flags:
            print(f"  {w:8s} {why}")
    else:
        print("Every non-heart word's dictionary pronunciation matches the short vowel it teaches.")
    print("\nHeart/sight words (irregular by design — pronunciations shown for a one-time eyeball):")
    for n in heart_report:
        print(f"  {n}")
    return 1 if flags else 0


if __name__ == "__main__":
    sys.exit(audit())
