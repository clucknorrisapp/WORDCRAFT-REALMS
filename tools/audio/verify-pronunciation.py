#!/usr/bin/env python3
"""Automated pronunciation check for the word-card clips.

For every word the game speaks, synthesize its clip text with a reference
TTS (Google) and transcribe it back with an ASR (Whisper). If the word does
not come back as itself (allowing homophones), it is FLAGGED — that is a word
whose text a TTS engine is likely to mispronounce, and it needs a
pronunciation override in packages/content/data/pronunciations.json.

This is engine-agnostic: it catches the *class* of bug where the clip TEXT is
ambiguous (capitalization, single letters, homographs), which is exactly what
made "Hut." read as "hoot". Run it after any content/pronunciation change.

    python3 tools/audio/verify-pronunciation.py [wordclips.json]

Deps: pip install faster-whisper gTTS
"""
import json
import os
import re
import subprocess
import sys
import tempfile

from gtts import gTTS
from faster_whisper import WhisperModel


def load_words():
    if len(sys.argv) > 1:
        return json.load(open(sys.argv[1]))
    out = subprocess.check_output(["node", "tools/audio/emit-wordlist.mjs"])
    return json.loads(out)

# Homophones we accept as a correct hearing of a word (same sound, different
# spelling). Whisper picks a spelling; any of these means the sound is right.
HOMOPHONES = {
    "i": {"eye", "aye"}, "eye": {"i", "aye"},
    "to": {"too", "two"}, "too": {"to", "two"}, "two": {"to", "too"},
    "for": {"four", "fore"}, "see": {"sea"}, "be": {"bee"}, "we": {"wee"},
    "no": {"know"}, "so": {"sew", "sow"}, "by": {"buy", "bye"}, "hi": {"high"},
    "red": {"read"}, "won": {"one"}, "sun": {"son"}, "hun": {"hun"},
    "in": {"inn"}, "an": {"ann"}, "us": {"us"}, "yum": {"yum"}, "yak": {"yack"},
    "dash": {"dache"}, "chomp": {"chomp", "champ"}, "rex": {"rex", "wrecks", "recks"},
    "ten": {"ten"}, "hen": {"hen"}, "wet": {"wet"}, "vet": {"vet"},
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def acceptable(word: str, clip_word: str) -> set:
    ok = {norm(word), norm(clip_word)}
    ok |= {norm(h) for h in HOMOPHONES.get(norm(word), set())}
    ok |= {norm(h) for h in HOMOPHONES.get(norm(clip_word), set())}
    return {x for x in ok if x}


def transcribe(model, mp3) -> str:
    segs, _ = model.transcribe(mp3, language="en", beam_size=5)
    return " ".join(s.text for s in segs).strip()


def hears_word(model, td, word, text, slow) -> str:
    """Synthesize `text` and return the ASR transcript."""
    mp3 = os.path.join(td, f"{word}{'_s' if slow else ''}.mp3")
    gTTS(text=text, lang="en", tld="us", slow=slow).save(mp3)
    return transcribe(model, mp3)


def main() -> int:
    words = load_words()
    print(f"Verifying {len(words)} word clips (Google TTS -> Whisper ASR)...\n")
    print("Loading Whisper model (small.en)...")
    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    flagged, errors, checked = [], [], 0
    with tempfile.TemporaryDirectory() as td:
        for i, entry in enumerate(words):
            word = entry["word"]
            text = entry["text"]  # e.g. "hut."  or "eye."
            clip_word = norm(text)
            ok = acceptable(word, clip_word)

            def passes(heard: str) -> bool:
                h = norm(heard)
                return h in ok or any(w in re.findall(r"[a-z]+", h) for w in ok)

            try:
                heard = hears_word(model, td, word, text, slow=False)
                good = passes(heard)
                if not good:
                    # ASR can mishear an isolated short word — retry with slow,
                    # clearer speech before believing it's really wrong.
                    heard2 = hears_word(model, td, word, text, slow=True)
                    good = passes(heard2)
                    heard = f"{heard!r}/{heard2!r}"
            except Exception as e:  # noqa: BLE001
                errors.append((word, str(e)[:60]))
                continue
            checked += 1
            if not good:
                flagged.append((word, text, heard))
            if not good or (i % 25 == 0):
                print(f"  {'ok ' if good else '!! '}{word:8s} text={text!r:10s} heard={heard}")

    print("\n" + "=" * 60)
    print(f"Checked: {checked}/{len(words)}   Flagged: {len(flagged)}   TTS/ASR errors: {len(errors)}")
    if errors:
        print("\nERRORS (could not test):")
        for w, e in errors[:10]:
            print(f"  {w}: {e}")
    if flagged:
        print("\nFLAGGED — likely mispronounced, review + add an override:")
        for w, t, heard in flagged:
            print(f"  {w:8s}  clip says {t!r:10s} -> ASR heard {heard!r}")
    else:
        print("\nALL WORDS VERIFIED: every clip transcribes back to its word.")
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
