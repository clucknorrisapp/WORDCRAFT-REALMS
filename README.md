# Wordcraft Realms — ReadQuest (working title)

**The reading game that hears your child read.**

A real adventure/building game where becoming a better reader makes you more powerful in the world. The child is a **Wordkeeper** in the Kingdom of Lexia, a land that has lost its words — and their voice is literally magic. Underneath, an invisible mastery engine tracks exactly what they can read and quietly builds the world that teaches them what's next.

## Status

**Pre-code, docs-first.** The design and plan are locked; the next step is milestone **M0** of the build plan (repo scaffold + the two week-1 spikes).

## Documents

| Document | What it is |
|---|---|
| [docs/GAME-ROADMAP.md](docs/GAME-ROADMAP.md) | **The game.** Canonical design roadmap v2: identity, pillars, systems, 9-biome rollout, release phases (SLICE → MVP → RETENTION → LAUNCH → BEYOND). |
| [docs/TECHNICAL-ARCHITECTURE.md](docs/TECHNICAL-ARCHITECTURE.md) | How it's built: module boundaries (game client / learning engine / content engine / voice / speech / API), typed contracts, stack decision (TypeScript + Phaser 3, browser-first), data model, content pipeline, privacy architecture, phase map. |
| [docs/PHASE-1-BUILD-PLAN.md](docs/PHASE-1-BUILD-PLAN.md) | The 3-week vertical slice — **"The Magic Door"**: scope (IN/OUT), the 15-minute playable script as spec, ~155-word content plan, milestones M0–M4 with acceptance criteria, risk register, kid-playtest protocol, and the GO/NO-GO gate. |

## The one rule that outranks the rest

The game world, the reading/mastery engine, the TTS system, and the microphone/speech-recognition system stay **separate modules behind typed contracts** — from the first commit. Pedagogy never lives in game code; rendering never lives in engine code; `speak()` and `listen()` are the only doors to voice and mic. That separation is what lets the voice roadmap (narration → word recognition → sentence read-aloud → phoneme analysis) ship incrementally without ever rebuilding the game.

## Planned repository layout

```
apps/game            Phaser 3 client + DOM reading UI (+ parent screen)
apps/api             Backend — MVP phase onward
packages/shared      Types & contracts (the module seams)
packages/learning-engine   Mastery, adaptive selection, spaced repetition (pure TS)
packages/content     Curriculum, words, lines, quests + decodability validator
packages/voice       TTS abstraction + adapters (Cluck Norris stack, pre-generated audio)
packages/speech      Mic/ASR abstraction + forgiving matcher + adapters
packages/analytics   Event taxonomy + local queue
tools/content-cli    validate · audio-gen · align · pack (runs in CI)
```

## North star

> The child should never think "I'm doing reading practice." The child should think: **"I'm a Wordkeeper. My voice opens doors. My dragon evolved because of me. Look what I built."**
