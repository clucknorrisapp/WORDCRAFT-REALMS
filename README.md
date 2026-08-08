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
- ~180-word decodable corpus enforced by a build-time validator (the iron rule)

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
node tools/smoke/verify.mjs        # select → naming → world → sign read
node tools/smoke/verify-door.mjs   # the magic door: stubbed "ship" → evidence
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
packages/learning-engine   Mastery math, evidence replay, scaffolding policy (pure TS)
packages/content           Curriculum, 180-word corpus, script lines, decodability validator
packages/voice             speak(): pre-generated clips (ElevenLabs) + browser-synthesis fallback
packages/speech            listen(): WebSpeech adapter + forgiving phonetic matcher (no audio ever stored)
packages/analytics         Local event log + playtest export
tools/sprites              Sprite-sheet slicer (flood-fill background removal, fragment cleanup)
tools/smoke                Playwright smoke tests
docs/                      Roadmap · Technical architecture · Phase 1 build plan
```

## Asset pipeline (Higgsfield + ElevenLabs)

- **Art:** the entire cast (4 avatars, dragon, Mayor Hen, wizard, hen, and 8 props) was generated as a single 4×4 sprite sheet with Higgsfield `nano_banana`, then sliced locally: `node tools/sprites/slice-sheet.mjs <sheet.png> apps/game/public/assets/sprites`
- **Voice (standing pipeline):** all 53 clips are ElevenLabs, committed in `apps/game/public/assets/audio/` and registered in `manifest.json`. The Railway build step runs `tools/audio/generate-elevenlabs.mjs --into-dist`: with the `ELEVENLABS_API_KEY` service variable set it voices any clip that's missing (delta-only — normal deploys generate nothing), and anything absent falls back to browser speech synthesis so a voice hiccup can never block a deploy. **Adding content:** write lines in `packages/content/data/lines.json` (and/or words in `tools/audio/clips.mjs`), cast any new speaker in `tools/audio/voices.json`, push — the next deploy voices it. Casting prefers your account's voices by name, falls back to ElevenLabs premade voices (Rachel/George/Charlotte) for TTS-scoped keys, and accepts raw voice IDs.

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
