# Wordcraft Realms — ReadQuest (working title)

**The reading game that hears your child read.**

A real adventure/building game where becoming a better reader makes you more powerful in the world. The child is a **Wordkeeper** in the Kingdom of Lexia, a land that has lost its words — and their voice is literally magic. Underneath, an invisible mastery engine tracks exactly what they can read and quietly builds the world that teaches them what's next.

## Status: playable slice v0 🎮

The first playable build of the SLICE ("The Magic Door") exists and runs in a browser:

- Character select → **dragon naming from decodable word cards** (REX / ASH / CHIP / DASH, each with audio)
- Meadow Village + forest edge + the Wizard's cave, tap-to-move + WASD, gathering, plot building
- The Missing Chickens questline end-to-end: signs → Mayor Hen → clue path-choice → **the mic magic-word door (SHIP)** → hen hunt via decodable clues → coop ("hen den") build → eggs → treasure chest (CHEST, the deliberate stretch word) → dragon level-up → free play
- 4 Reading Moments: narrated dialogue with word-by-word highlighting, sign reading, word match, magic-word door with the pronunciation hint ladder
- Warm failure everywhere ("Almost! Listen…"), **two-miss-and-the-door-opens-anyway**, and a no-mic ritual fallback — the mic can never block
- Evidence + mastery live (production weighted 2×), parent/facilitator screen with gate metrics and JSON export
- ~250-word decodable corpus enforced by a build-time validator (the iron rule)

**Beyond the slice — the reading loop that keeps growing:**

- **Adaptive tutor (invisible):** a 70/20/10 comfort/stretch/new selector + spaced repetition quietly decides which word the dragon asks for next — mastery state is a pure projection of the evidence log.
- 📚 **Library** — a shelf of **16 decodable readers** (every page gated through the real validator). Page-turn reader, tap-any-word audio, "Read to me" with word highlighting; finishing a book pays a reward once. Reading a page logs `sentence_read` — the strongest reading signal the game collects. **Books are tier-gated**: the 6 higher-tier readers (5 blend, 1 magic-e) stay off the shelf until their sounds are unlocked, so the Library grows as the child's reading advances (a locked-count hint shows how many more await).
- ✨ **Spellbook** — **10 decodable "power words"** the child casts by *reading* them (voice-first, but a miss never blocks). Each cast fires a themed effect + the dragon's celebration. Spells unlock through reading: a starter + one per book, so the Library and Spellbook are one loop (read a book → learn a spell).
- ♿ **Accessibility** — easy-read (dyslexia-friendly spacing) font, high-contrast palette, and calm-motion mode (auto-on when the OS requests reduced motion), all in the grown-up screen.
- 🔨 **Build Mode (it becomes Minecraft as you go)** — a grid you paint with **procedural pixel-art blocks** (no art assets; the same crisp tile is a CSS background and a Phaser texture). New blocks aren't bought — they're **unlocked by reading** the block's word, so the toolbox literally grows out of reading. Builds persist and appear in the actual world; building levels up a **Builder rank**. 🛠 **Crafting** combines two owned blocks by reading a short decodable **recipe phrase** ("hot rock", "red rock") — the step from reading single words up to connected text, logged as `sentence_read`.
- 📈 **Curriculum progression (it gets more advanced as you go)** — the invisible engine watches free-play mastery and, once the current frontier of sounds is solid, **unlocks the next phonics tier**: ST → L-blends → R-blends → S-blends → end-blends → **Magic&nbsp;E** (long vowels — cake, bike, home, cube). A **"New Sounds Unlocked!"** moment names the new sound and an example word the child can now read — and new decodable words, blocks, recipes and books surface in the world. Reading better literally levels up what you can read and build next. Every new word is verified against the CMU Pronouncing Dictionary (`pnpm audit:pronunciation`) — long vowels included — so nothing is ever mispronounced.

## Quickstart

```bash
pnpm install
pnpm dev        # game at http://localhost:5173
pnpm test       # engine + matcher + content/iron-rule suites
pnpm typecheck
pnpm build      # production build in apps/game/dist
```

Smoke tests (need Chromium; used in this repo's verification):

```bash
pnpm build && pnpm preview &
pnpm smoke                              # the full browser suite (13 flows), or run one:
node tools/smoke/verify.mjs             # select → naming → world → sign read
node tools/smoke/verify-door.mjs        # the magic door: stubbed "ship" → evidence
node tools/smoke/verify-library.mjs     # read a book → reward paid once → sentence_read
node tools/smoke/verify-spells.mjs      # reading unlocks spells → cast logs production evidence
node tools/smoke/verify-a11y.mjs        # a11y modes apply on boot; calm mode kills confetti
node tools/smoke/verify-build.mjs       # paint blocks; read a word to unlock a new block
node tools/smoke/verify-craft.mjs       # two blocks + read a recipe phrase → a new block
node tools/smoke/verify-progression.mjs # master a sound → next tier unlocks → new blocks appear
```

## Deploy (Railway)

The repo is config-as-code ready: `railway.json` builds with `pnpm install && pnpm build` and starts `node apps/game/serve.mjs` (a zero-dependency static server that binds `0.0.0.0:$PORT` with an SPA fallback).

1. Railway → **New Project → Deploy from GitHub repo** → pick `clucknorrisapp/WORDCRAFT-REALMS` (the working branch is the repo's default branch, so it deploys as-is; no environment variables needed).
2. After the first deploy: service **Settings → Networking → Generate Domain**.
3. Open the domain — Railway domains are HTTPS, which is required for the microphone (`SpeechRecognition`/`getUserMedia` need a secure context), so the magic-word door works on the deployed URL in Chrome and iPad Safari.

## Repository map

```
apps/game                  Phaser 3 world + DOM reading UI + parent screen
packages/shared            Typed contracts — the module seams
packages/learning-engine   Mastery math, evidence replay, adaptive 70/20/10 + spaced repetition, scaffolding policy (pure TS)
packages/content           Curriculum, ~205-word corpus, script lines, decodable books + spells, decodability validator
packages/voice             speak(): pre-generated clips (ElevenLabs) + browser-synthesis fallback
packages/speech            listen(): WebSpeech adapter + forgiving phonetic matcher (no audio ever stored)
packages/analytics         Local event log + playtest export
tools/sprites              Sprite-sheet slicer (flood-fill background removal, fragment cleanup)
tools/smoke                Playwright smoke tests
docs/                      Roadmap · Technical architecture · Phase 1 build plan
```

## Asset pipeline (Higgsfield + ElevenLabs)

- **Art:** the entire cast (4 avatars, dragon, Mayor Hen, wizard, hen, and 8 props) was generated as a single 4×4 sprite sheet with Higgsfield `nano_banana`, then sliced locally: `node tools/sprites/slice-sheet.mjs <sheet.png> apps/game/public/assets/sprites`
- **Voice (standing pipeline):** premium clips are ElevenLabs, committed in `apps/game/public/assets/audio/` and registered in `manifest.json`. The want-list (`tools/audio/clips.mjs`) covers script lines, per-name dragon variants, word cards, **every book page + title, and every spell word** — so books read aloud and spells cast are real narrator audio, not synthesis. The Railway build step runs `tools/audio/generate-elevenlabs.mjs --into-dist`: with the `ELEVENLABS_API_KEY` service variable set it voices any clip that's missing (delta-only — normal deploys generate nothing), and anything absent falls back to browser speech synthesis so a voice hiccup can never block a deploy. **Adding content:** write lines in `packages/content/data/lines.json`, books in `books.json`, or spells in `spells.json`, cast any new speaker in `tools/audio/voices.json`, push — the next deploy voices it. Casting prefers your account's voices by name, falls back to ElevenLabs premade voices (Rachel/George/Charlotte) for TTS-scoped keys, and accepts raw voice IDs.

## The one rule that outranks the rest

The game world, the reading/mastery engine, the TTS system, and the speech-recognition system stay **separate modules behind typed contracts** (`packages/shared`). Pedagogy never lives in game code; rendering never lives in engine code; `speak()` and `listen()` are the only doors to voice and mic — and `listen()` has no API that stores audio, so *"we never store your child's voice"* is enforced by design.

## Documents

| Document | What it is |
|---|---|
| [docs/GAME-ROADMAP.md](docs/GAME-ROADMAP.md) | **The game.** Canonical design roadmap v2. |
| [docs/TECHNICAL-ARCHITECTURE.md](docs/TECHNICAL-ARCHITECTURE.md) | Module boundaries, contracts, stack, data model, pipelines, phase map. |
| [docs/PHASE-1-BUILD-PLAN.md](docs/PHASE-1-BUILD-PLAN.md) | The 3-week slice plan, playtest protocol, GO/NO-GO gate. |

## North star

> The child should never think "I'm doing reading practice." The child should think: **"I'm a Wordkeeper. My voice opens doors. My dragon evolved because of me. Look what I built."**
