# ReadQuest — Phase 1 Build Plan: "The Magic Door"

**Scope:** the SLICE from [Game Roadmap v2 §20](GAME-ROADMAP.md#20-release-roadmap-what-ships-when), built on the [Technical Architecture](TECHNICAL-ARCHITECTURE.md). Timebox: **3 weeks (15 working days) to a kid-playtestable build**, sized for one full-time developer pairing with Claude Code, plus part-time content/art sourcing. Anything not in §3 is out — the OUT list is binding.

---

## 1. The one question this slice answers

> **Will a child voluntarily keep playing while genuinely reading?**

**The gate (verbatim from the roadmap):** 3+ kids play **20+ minutes voluntarily**, **15+ reading interactions each**, **ask to play again**, **zero stuck-mic moments**.

Definitions so the gate is measurable, not vibes:

- **Reading interaction (countable):** an evidence-generating moment where the child makes a reading-dependent choice or a spoken attempt — sign/path choices, word-matches, magic-word attempts, clue-driven finds. Narrated dialogue is *exposure* and is tracked separately ("words heard-read"), not counted toward the 15.
- **Voluntarily:** the facilitator never says "keep going"; a session ends when the child asks to stop or 30 minutes elapse.
- **Stuck-mic moment:** any point where a child is unable to progress within ~20 seconds of a mic prompt, or shows mic distress (refuses to speak, repeated failed attempts with frustration). The two-miss rule plus the no-mic ritual should make this structurally impossible — the playtest verifies it.
- **Asks to play again:** unprompted "can I keep playing / play again?" at session end, or yes to "would you want to play this again tomorrow?" asked once, last.

Instrumentation shipped in the slice **because the gate demands it:** session timer, interaction counter, per-Evidence log, mic outcome events, quit-point event, and a one-tap JSON export on the parent/facilitator screen.

---

## 2. What we are building (IN)

One continuous ~15-minute authored experience plus free play, per roadmap §5:

| Area | Contents |
|---|---|
| **World** | Meadow Village (square, Mayor's stand, shop-front prop, house plot), Forest Edge (trees, pond, 3 chicken hide spots), Wizard's Cave (door chamber + treasure room). One Phaser tilemap each. |
| **Player** | 4 premade avatars (pick one), tap-to-move + virtual stick + WASD/arrows, interact prompt. Touch-first: iPad Safari is the reference device. |
| **Companion** | Baby dragon: pick one of 4 decodable names (**REX / ASH / CHIP / DASH**) via word cards with audio; follows; **celebration animation on every success** (load-bearing, roadmap §9); levels 1→2 at quest end (Follow → Find Treasure sparkle, used in the treasure-room beat). |
| **Reading Moments (4)** | ① `SignRead`/`PathChoice` — tap sign → zoom card + audio + choice. ② `WordMatch` — voice says a word, pick among 3 lookalikes from curated confusables. ③ `MagicWordDoor` — mic magic word with hint ladder, two-miss-open, no-mic ritual fallback. ④ `NarratedDialogue` — word-by-word highlighting, auto-read (slice default). Shared hint ladder component. |
| **Questline** | Opening (character + dragon naming + narrated welcome) → two village signs + gather wood + place first wall → Mayor Hen "My chickens escaped!" → path sign to woods → Wizard's cave, **SHIP** door (the make-or-break moment) → 3-chicken hunt via clues/word-matches → coop blueprint → gather + build coop → eggs spawn → treasure room, mic word **CHEST** → dragon levels up. |
| **Building** | Gather wood/stone from world nodes; place wall/floor/door on the plot; blueprint-guided coop build (3 placements); collectible eggs. No freeform crafting UI. |
| **Free play after script** | Egg collecting, 4 optional signs, feed-the-dragon word-match loop (EGG / NUT / JAM cards), extra wood + placements, one hidden gem. This is what turns 15 scripted minutes into a 20+ minute voluntary session. |
| **Content** | ~155-word corpus (§5), ~60 voiced lines, all text through the decodability validator, all audio pre-generated. |
| **Engine plumbing** | Evidence recording + mastery math live (authored sequencing; no adaptive selection yet). Local IndexedDB save with resume. |
| **Parent/facilitator screen** | One gated screen: minutes, interaction count, words independent vs hinted, skill bands, mic outcomes, export button. Doubles as the playtest dashboard. |
| **Settings** | Narration speed + text scale only (both nearly free with the DOM text layer, both useful in playtests). |

**Also in: the two week-1 spikes** (they retire the top risks, see §7): TTS stack audit + child-voice ASR spike.

## 3. What we are NOT building (OUT — binding)

Accounts/backend/sync · adaptive 70/20/10 selection · spaced repetition · placement (parent picks nothing in slice; one authored start) · spellbook/spells beyond the two magic-word doors · shop/economy/currencies · books/library · boss · second biome · sentence read-aloud (voice v2) · phoneme challenges (v3) · companion evolution/cinematics · additional companions · character customization beyond 4 premade avatars · multiplayer · teacher mode · purchases · dyslexia font toggle & remaining accessibility settings (schema exists; UI later) · app-store packaging (browser only) · dynamic/AI content.

Any addition to IN must displace something, out loud, in the plan.

---

## 4. The playable script is the spec

Acceptance = a first-time 6-year-old flows through this table. Countable interactions tally ≥ 12 in the script; free play supplies the rest of the 15+.

| Min | Beat | Systems exercised | Countable reading interactions |
|---|---|---|---|
| 0–2 | Pick avatar → pick + name dragon from word cards (REX/ASH/CHIP/DASH, tap-to-hear) → narrated welcome (2 lines, highlighted) | UI, VoiceService, dialogue | 1 (name choice) |
| 2–4 | Walk village; read signs **HOME** and **SHOP** (zoom card + confirm); gather 5 wood; place first wall on plot | movement, SignRead, gather, build | 2 |
| 4–6 | Mayor Hen dialogue (3 lines) → quest start: find **RED HEN / BIG HEN / SMALL HEN** → path sign choice: "The hens ran to the woods." → **WOODS** vs **POND** | NarratedDialogue, quest FSM, PathChoice | 2 (clue + path) |
| 6–8 | Wizard's cave. Glowing word **SHIP**. "Say the magic word." Mic flow → door thunders open → dragon goes berserk | **MagicWordDoor**, celebration | 1 (production) |
| 8–12 | Chicken hunt: word-match **HEN**/HAT/HOP → red hen; clue "The big hen is in the shed." → shed vs bush; word-match **CHICK**/CHIP/CHIN → small hen | WordMatch ×2, clue read | 3 |
| 12–14 | Return to Mayor → coop **blueprint** → gather 6 wood 2 stone → build coop (3 placements) → hens home, eggs spawn | quest complete, build | 1 (blueprint sentence read: "A HOME FOR HENS") |
| 14–15 | Cave treasure room: chest sealed with **CHEST** → mic → treasure + gem → dragon LEVEL UP (Find Treasure) | MagicWordDoor #2, companion level | 1 (production) |
| 15+ | Free play: eggs, 4 signs, feed-the-dragon (EGG/NUT/JAM), build, hidden gem | everything above, replayable | 4+ |

Design invariants enforced throughout: never the word "wrong" (warm retry per roadmap pillar 4); celebration animation on every success; every displayed word tap-to-hearable; ~3–4 min free-play spacing between forced interactions after the script.

---

## 5. Content plan (~155 words, ~60 lines)

**Corpus by skill** (teaching arc of biome 1: short vowels mastered-ish on arrival, **sh/ch/th is the new material** — which is why the doors are SHIP and CHEST):

| Bucket | Count | Examples |
|---|---|---|
| short_a CVC | 30 | cat, hat, map, bag, jam, dad, ran |
| short_i CVC | 25 | sit, pig, win, lid, big, dig |
| short_o CVC | 20 | dog, hop, pot, box, log |
| short_e CVC | 15 | hen, bed, red, pet, net, shed* |
| short_u CVC | 15 | run, sun, cup, bug, nut |
| digraph_sh | 12 | ship, shop, fish, dish, shed, shut |
| digraph_ch | 10 | chip, chick, chest, chat, chin |
| digraph_th | 8 | this, that, then, them, path |
| heart words | 20 | the, a, I, is, to, my, said, was, you, we, me, see, go, no, so, for, he, she, in, on |

Production steps (all via `content-cli`, per architecture §8): author `words.json` with graphemes/skills/confusables → author `lines.json` (narration ~10, Mayor 6, Wizard 5, villager 4, clue/sign 14, celebration/system 8, UI prompts ~12) each with a curriculum gate → **validator passes in CI** → batch audio via the TTS stack (per-word, per-line, phoneme sounds for the hint ladder: shhh/ch/th + 5 short-vowel sounds, slow-blend clips for SHIP and CHEST) → timings → pack. Voices in slice: Narrator, Mayor Hen, Wizard (3 is enough).

**Art plan (scope-honest):** license one cohesive top-down 2D village/farm asset pack for tiles, props, buildings, and the 4 avatars; custom art only where identity lives — baby dragon (idle/walk/celebrate/level-up, 4 color variants), Mayor Hen, Wizard, 3 hens, glowing door + word-glow VFX, UI kit (word cards, dialogue box, mic button with 🎤 listening state). Two music loops (village, cave) + ~10 SFX from libraries. Freeze art by end of week 2; polish budget goes to the three moments that matter: **door opening, dragon celebration, coop completion.**

---

## 6. Build order — milestones with acceptance criteria

Every milestone ends deployed to the playable URL (CI from day 1). "Cut line" = what drops first if the milestone slips (never the mic moment, never the celebration).

### M0 — Scaffold + spikes (days 1–3)
- Monorepo per architecture §4; Vite + Phaser hello-world; DOM overlay proof (one dialogue box with per-word highlight over canvas, on iPad Safari); CI deploying every push to a URL; `shared` contracts committed; `content` package with 20 words + validator wired into CI.
- **Spike 1 (TTS audit):** generate 5 lines through the Cluck Norris stack against the adapter contract (batch? voices? rate for slow-blends? timing marks?). Decision recorded: timings source = marks / alignment / tap-tool.
- **Spike 2 (child ASR):** `WebSpeechAdapter` + forgiving matcher tested against recorded child utterances of ship/chest (recruit 2–3 kid samples from friendly families) on iPad Safari + Chrome. Decision recorded: v1 adapter config + thresholds, or activate the cloud fallback plan.
- ✅ *Accept:* URL shows highlighted talking dialogue on an iPad; CI red on a planted decodability violation; both spike decisions written in `docs/decisions/`.

### M1 — The first 4 minutes (days 4–6)
- Village + ForestEdge maps; avatar select; movement (touch + keys); interact system; `NarratedDialogue` + `SignRead`/`PathChoice` widgets on real content; dragon naming flow; wood gathering; plot + first wall placement; IndexedDB save/resume; Evidence recording behind every widget.
- ✅ *Accept:* minutes 0–4 of §4 playable start-to-finish on iPad, resumable mid-way. *Cut line:* pond area, 4th avatar.

### M2 — The whole script, tap-only (days 7–9)
- Cave map; `WordMatch`; quest FSM driving the full chicken questline; hint ladder; celebration animation v1; coop blueprint build; eggs; treasure room with doors in **tap-to-say ritual mode** (mic stubbed); free-play content in.
- ✅ *Accept:* full §4 script playable without a microphone; interaction counter shows ≥12; no child-visible string outside `lines.json` (CI-checked). *Cut line:* feed-the-dragon loop, hidden gem.

### M3 — The mic moment + measurement (days 10–12)
- `speech` package live per spike decision: permission flow with explainer, 🎤 listening indicator, forgiving matcher, **two-miss-open**, no-mic ritual fallback; SHIP + CHEST doors on real voice; slow-blend hint audio in the ladder; parent/facilitator screen with gate metrics + JSON export; session/quit analytics.
- ✅ *Accept:* an adult mumbling, whispering, refusing to speak, and denying permission all reach the open door within 20 seconds, correctly logged; parent screen numbers reconcile with the evidence log. *Cut line:* none — this milestone is the product thesis.

### M4 — Content-complete + polish + device pass (days 13–15)
- Full 155-word corpus + all lines voiced and timed; celebration/door/coop juice pass; audio mix; music; loading/perf pass (target: interactive < 5s on iPad over hotel-grade wifi, 60fps village); full playthrough QA on iPad Safari, iPhone, Android Chrome, desktop; playtest kit printed (§8); build frozen and tagged `slice-playtest-1`.
- ✅ *Accept:* two full no-touch adult playthroughs (mic and no-mic) with zero blockers; gate instrumentation exports cleanly.

**Days 16+ — playtest week:** 3–5 sessions (§8), data + decisions (§9).

**Workstream map** (parallelizable if a second contributor exists): A world/player (M1) · B reading widgets + voice (M0–M2) · C quest/companion (M1–M2) · D building (M1–M2) · E content authoring (continuous from M0 — start day 1, it's the long pole) · F speech (M0 spike, M3) · G telemetry/parent (M3) · H art/audio sourcing (continuous, freeze end of week 2).

---

## 7. Risk register (slice-specific)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | Web Speech API fails on real child voices (esp. iPad Safari) | Med–High | Closed-set forgiving matcher designed for weak ASR; M0 spike with real kid audio decides adapter; cloud one-shot fallback behind same interface; worst case ships tap-to-say ritual — gate is still measurable, mic still never blocks. |
| 2 | TTS stack lacks batch/timing capability | Med | Architecture assumes no timings (alignment fallback, then tap-tool — ~60 lines ≈ one afternoon); any quality TTS can substitute behind the adapter for the slice. |
| 3 | Content authoring is the long pole (tagging, confusables, gates, audio QA) | High | Starts day 1; corpus deliberately small; `content-cli` scaffolds entries; validator catches errors mechanically; audio QA = one full listen-through in M4. |
| 4 | Art incoherence / time sink | Med | One purchased pack + short custom list (§5); freeze end of week 2; juice budget concentrated on 3 moments. |
| 5 | Scope creep ("just add the spellbook…") | High | §3 OUT list is binding; additions must displace, in writing. |
| 6 | Playtest kids outside target band (fluent 9yo or pre-reader 4yo) | Med | Recruit ~ages 5–7 around Level 1–2 (§8); the script still *plays* for outliers (audio + never-block), data just counts less toward the gate. |
| 7 | iPad Safari quirks (audio unlock, mic + WebAudio interplay, PWA memory) | Med | iPad is the reference device from M0, not a porting target at M4; audio unlocked on first tap (standard pattern). |

---

## 8. Playtest protocol (the gate is the deliverable)

**Recruit:** 3–5 children, ~ages 5–7, roughly Level 1–2 (knows most letter sounds, reads some CVC), mixed reading confidence, not the developer's demo-trained kids where avoidable. Parent present; verbal consent covers observation + anonymous interaction logging; **no audio/video recording of the child** (our own privacy bar applies to us first).

**Setup:** iPad in Safari (primary; one laptop-Chrome session for contrast), quiet room, mic permission granted by the parent on the explainer screen, facilitator + silent note-taker.

**Facilitator script:** "This is a new game called ReadQuest. Want to try it?" Then silence. Help only after 60 seconds of hard stuck (log it). Never prompt reading, never praise reading specifically ("nice!" ok, "great reading!" not — we're measuring the game's pull, not ours). End at child's request or 30 min. Last question, once: *"Would you want to play this again tomorrow?"*

**Observation sheet per child** (from brief §72): timestamped notes on where they stop / what they ignore / what they repeat for fun / guessing vs reading (eyes on text?) / mic reaction (eager, shy, frustrated) / hint-ladder moments / celebration reaction / free-play choices / quit point + reason. Post-session: export JSON from the facilitator screen; file both per child ID.

**Gate scorecard:**

| Metric | Source | Pass |
|---|---|---|
| Voluntary minutes ≥ 20 | session timer + notes | per child |
| Reading interactions ≥ 15 | evidence counter | per child |
| Asks to play again | end question / unprompted | per child |
| Stuck-mic moments = 0 | mic events + notes | across all children |
| Gate | all four, ≥3 children | **GO / NO-GO** |

## 9. After the playtest: kill / fix / keep

Within 48 hours, one decision page per feature (both docs' discipline: real children drive kill/keep):

- **Gate passed →** proceed to MVP "Whispering Woods Complete" (roadmap §20): backend + accounts, adaptive 70/20/10 on, spellbook (2 spells), library (3 books), 300–500 words, shop/crafting — architecture already has the seams waiting.
- **Gate failed →** diagnose against the pillars, in order: Was it fun *between* reading moments (pillar: the game must be a game)? Did the mic moment land (the thesis)? Did reading feel like power or like homework (pacing §4)? Fix the slice and re-test with new kids. **Do not advance to MVP on a failed gate.**
- Either way: file per-feature verdicts (keep / fix / kill) with one observed reason each — e.g. "word-match: kids gamed positions → verify seeded shuffle actually rotates" — and fold matcher threshold + hint-ladder data into the speech tuning backlog.

## 10. Definition of done (slice)

- [ ] Full §4 script + free play playable on iPad Safari, iPhone, Android Chrome, desktop browser
- [ ] All child-visible text in `lines.json`/`words.json`, validator green in CI (iron rule enforced)
- [ ] All text voiced (pre-generated), word-highlighting synced, every word tap-to-hearable
- [ ] Mic path: permission explainer, listening indicator, forgiving match, two-miss-open, no-mic ritual; zero paths where the mic can block progress
- [ ] Evidence log + mastery state computing; parent screen reconciles with log; JSON export works
- [ ] Save/resume across refresh and revisit; no child-blocking bugs in two full adult QA passes
- [ ] Never the word "wrong" anywhere; celebration fires on every success
- [ ] No PII collected; no audio stored anywhere (verified by code review of `speech` package)
- [ ] Build tagged `slice-playtest-1`; playtest kit ready; 3+ sessions scheduled
