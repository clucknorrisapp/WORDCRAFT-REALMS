# READQUEST — GAME ROADMAP v2
### The complete game design roadmap, revised and structured for build-out
### This is the game. Ordered from core identity → systems → world rollout → release phases.

> **Repo note:** Committed verbatim as provided by the product owner (2026-08-08). This is the canonical design document. The [Technical Architecture](TECHNICAL-ARCHITECTURE.md) and the [Phase 1 Build Plan](PHASE-1-BUILD-PLAN.md) derive from it and reference its sections by number.

---

## 1. PRODUCT IDENTITY

**"The reading game that hears your child read."**

A real adventure/building game where becoming a better reader makes you more powerful in the world. The child is a **Wordkeeper** in a magical kingdom that has lost its words. Every skill they master restores part of the world — and their voice is literally magic.

The microphone is not a feature. It is the identity. No competitor has it.

---

## 2. THE FIVE PILLARS
Every design decision gets tested against these:

1. **Reading IS the mechanic.** Never stop the game to show a worksheet. Signs, spells, clues, recipes, and quests are the reading.
2. **Voice is magic.** Speaking a word aloud casts spells, opens doors, tames creatures. Production beats recognition.
3. **My world, my dragon.** Building and companion attachment are the emotional hooks that bring kids back daily.
4. **Never punish, never block.** Failure gets "Almost! Listen: shhh…" and another try. The mic never traps a child — 2 misses and the door opens anyway.
5. **The game secretly knows.** An invisible mastery engine tracks every skill and shapes the world to teach exactly what's next. The child never sees a grade level.

---

## 3. THE STORY
The Kingdom of Lexia has lost its words. Signs are blank, spellbooks are silent, maps are empty, creatures have forgotten their names. The child arrives as a **Wordkeeper** — one of the rare few whose voice can restore words to the world. Each biome is a region of the kingdom waiting to be re-awakened, guarded by a creature who has forgotten how to read. The child's growing power over words literally re-lights the map.

---

## 4. THE CORE LOOP
Explore → Discover text → Read/Speak → Solve → Gather → Build → Companion grows → New area unlocks → Explore more.

Every ~3–4 minutes of free play naturally produces one reading interaction. Never one every 30 seconds. Free building/exploring time is sacred — it prevents educational fatigue and makes the reading moments feel like power, not homework.

---

## 5. THE FIRST 8 MINUTES (the make-or-break experience)
- **0–2:** Choose character. Choose and name a baby dragon (from decodable names: Rex, Ash, Chip, Dash…). Narrator welcomes you to the village — every word spoken aloud, highlighted as it's read.
- **2–4:** Walk the village. Read two signs. Gather wood. Place your first wall on your house plot.
- **4–6:** Mayor Hen: "My chickens escaped!" Follow the first path sign.
- **6–8:** The Wizard's cave. A glowing word appears: **SHIP**. "Say the magic word." The child speaks — the door thunders open — the dragon goes berserk with joy.
- **8–15:** Chicken hunt through readable clues → chicken coop blueprint → build the coop → chickens lay collectible eggs.

Minute 6–8 is the moment a kid runs to show a parent, and the moment a parent decides to pay.

---

## 6. READING LEVELS (internal — the child never sees these)
- **Level 0 — Pre-reader:** letters, letter sounds, rhyming, phonemic awareness
- **Level 1 — Early decoding:** CVC words, short vowels, blending (cat, dog, sit, map)
- **Level 2 — Developing:** digraphs, blends, silent E, long vowels, heart words, simple sentences (ship, frog, bike, rain)
- **Level 3 — Early fluent:** multisyllable words, longer sentences, vocabulary, short stories
- **Level 4 — Independent:** paragraphs, quest text, comprehension, inference, sequencing

Progression follows an established science-of-reading scope & sequence (UFLI-style grapheme ordering) — never an invented one. **The iron rule: a child is never shown a word containing sounds they haven't been taught** (plus explicitly taught heart words). Every piece of text in the game passes this filter.

---

## 7. READING INTERACTION TYPES (the full menu, rolled out over phases)

**Recognition (tap):**
- Sign reading & path choices ("Red Gem Cave" vs "Blue Gem Cave")
- Word match — voice says a word, pick it among lookalikes (HEN / HAT / HOP)
- Word families & rhyming hunts ("find all the -at words")
- Vocabulary — NPC uses a word, pick the object

**Production (voice — weighted 2× in mastery, ungameable):**
- **Magic words** — speak the glowing word to open doors, light torches, calm monsters
- **Spells** — collected power words (FIRE, LIGHT, GROW, OPEN, JUMP) cast by reading them aloud
- Blending forge — /c/ /a/ /t/ float, merge, child says "cat"
- Sentence read-aloud — read the line, game follows along word by word
- Phoneme challenges ("What sound does S make?") — late phase, technically hardest

**Scaffolded:**
- Narrated dialogue with word-by-word highlighting (audio fades as skill grows: auto-read → delayed audio button → on-request only)
- Pronunciation ladder for stuck words: highlight SH → play "shhh" → split SH-I-P → slow blend → full word. Hints used = data.

---

## 8. THE SPELL SYSTEM (flagship feature)
Words are literally magic. The child discovers power words on stone tablets, in books, from bosses. Each learned spell goes in their **Spellbook**.
- Read it (tap) = weak cast. **Speak it (mic) = full-power cast** with spectacular effect.
- Spells solve world puzzles: LIGHT in dark caves, GROW on withered vines, OPEN on sealed chests, FIRE on ice walls.
- New graphemes mastered → new spells become learnable. Reading power = game power, literally.
- Rollout: 2 spells in MVP → spellbook of 10+ by the second biome → combo spells ("BLUE FIRE") for sentence-level readers.

## 9. COMPANION SYSTEM
Every child gets a baby dragon in minute one. Name it, feed it, dress it.
- **It celebrates every reading success** — this animation is load-bearing; it's the emotional reward loop.
- Levels on reading XP: Follow → Find treasure → Fly → Fire ability.
- **Evolution** at major mastery milestones — delivered as a short cinematic clip (Higgsfield-generated). Evolving your dragon because you mastered digraphs is the whole thesis in one moment.
- Later: additional companions (fox, owl, slime, robot, chicken) found in the world; a sanctuary to house them.

## 10. BUILDING SYSTEM
The child's plot is their canvas and their reason to return.
- Gather wood/stone/crystal/coins in the world → place walls, floors, doors, furniture, decorations.
- **Reading unlocks blueprints:** finish the chicken quest → coop blueprint; finish a book → treehouse blueprint; master a skill tier → castle pieces.
- Growth path: house plot → farm → village → castle → animal sanctuary → personal library.
- Early recipes are pictures; later recipes are sentences ("Place two wood beside one stone") — crafting complexity scales with reading level.

## 11. WORLD & BIOME ROLLOUT (each biome = a skill region of Lexia)
| Order | Biome | Teaches | Signature content |
|---|---|---|---|
| 1 | **Meadow Village + Whispering Woods** | Letter sounds, short vowels, CVC, sh/ch/th, first heart words | Missing Chickens quest, first magic door, house plot |
| 2 | **Crystal Caves** | Blends (st, bl, cr…), more digraphs | Mine-the-Word minigame, LIGHT spell, crystal decorations |
| 3 | **Pirate Coast** | Heart words, simple sentences | Treasure-clue reading, Word Fishing, boat building |
| 4 | **Dragon Mountains** | Long vowels, silent E | Dragon Flight minigame, companion evolution arc, boss |
| 5 | **Spellbound Swamp** | Vowel teams, word families | Potion Lab (read ingredient instructions), witch NPC |
| 6 | **Sky Islands** | Multisyllable words | Build-from-instructions, glider crafting |
| 7 | **Lost Library** | Fluency, comprehension | The in-game book hub, story quests, Bookworm Dragon event |
| 8 | **Ancient Ruins** | Inference, sequencing, clues | Mystery quests ("use clues to find where the NPC went") |
| 9 | **Dreamlands** | Advanced/creative reading | Personalized dynamic stories starring the child + companion |

Each biome ships with: a main questline, 3–5 side quests, a boss, 1–2 minigames, unique resources/blueprints, a creature, secrets, and environmental text that grows with the player (early: CAVE → later: CRYSTAL CAVE → advanced: BEWARE OF THE CRYSTAL DRAGON).

## 12. QUESTS & BOSSES
Quest types (introduced gradually): reading directions → word matching → decoding new words → rhyming/word families → vocabulary → sequenced instructions → comprehension → inference → multi-part story mysteries.

**Bosses are disguised skill reviews.** The Phonics Dragon: Phase 1 short vowels → Phase 2 digraphs → Phase 3 read a sentence → Phase 4 **speak the magic word aloud** → biome unlocked. Combat stays cartoon-friendly: word-shields (enemy shield shows SH — hit it with SHIP/FISH/SHOP), no violence.

Later: weekend **world events** ("The Bookworm Dragon stole the library!") — community reading challenges restore it together.

## 13. MINIGAMES (rolled out one per biome)
Mine the Word → Monster Mouth (feed it something starting with B) → Word Fishing → Spell Forge → Dragon Flight → Treasure Dig → Potion Lab → Build-From-Instructions. Each one is a different reading skill wearing a costume.

## 14. BOOKS & STORIES
An in-game library of original, decodable, illustrated, narratable books. Finishing books earns world rewards (blueprints, baby creatures, secret areas) — never "50 reading points." Endgame: dynamic stories generated inside strict decodability limits, starring the child's own character and companion by name ("Henry entered the cave with Spark the Dragon").

## 15. THE INVISIBLE ENGINE (what's happening underneath)
- Every skill (short_a, digraph_sh, blend_st, sight_said…) tracked 0–100 with recognition AND production evidence, response times, hints, audio use.
- **Adaptive selection:** ~70% comfortable / 20% stretch / 10% new. Struggle with SH? The next quests quietly fill with SH words.
- **Spaced repetition:** mastered skills resurface at widening intervals; forgotten ones re-enter practice.
- **Anti-guessing:** randomized positions, distractors, and word order everywhere — plus the mic, which cannot be guessed.
- **Placement is an adventure**, not a test: the opening island escape quietly finds the child's ceiling and starts the world there. (Interim: parent picks a starting level.)
- **Speech error detection** (late phase): child says "sip" for SHIP → engine logs probable sh-weakness → world responds. Voice performance directly drives instruction.

## 16. VOICE & MICROPHONE (phased honestly — kids' speech is hard)
- **v1:** Full TTS narration (existing Cluck Norris School audio stack) with word highlighting; magic-word recognition with forgiving matching. Mic never blocks — 2 misses, door opens, attempt logged.
- **v2:** Better child-voice recognition server-side; sentence read-aloud with skip/substitution detection.
- **v3:** Phoneme-level error analysis; semi-open spoken answers to NPCs ("What should we build?" — "A bridge!").
- Privacy by design: audio processed in the moment, only results stored — **"We never store your child's voice"** goes on the parent dashboard as a headline, not fine print.

## 17. PARENT EXPERIENCE
Dashboard shows real information: skill strengths ("SH sound — developing"), words read independently vs. hinted, books finished, one weekly suggestion ("Practice TH words 5 minutes this week"). Controls: play time, audio assist level, mic permission, difficulty, purchases, privacy. No ads, no loot boxes, no gambling mechanics — trust is the brand.

## 18. ECONOMY & REWARDS
Coins (play) / Stars (learning milestones) / Gems (rare exploration). All rewards improve the child's world — pets, blueprints, spells, outfits, mounts, secret areas — never badges. Cosmetics earnable through play; no pressure to buy.

## 19. ACCESSIBILITY & LEARNING SUPPORT
Dyslexia-friendly font option, adjustable text size, narration speed, high contrast, reduced animation, extra-repetition mode, untimed mode. Framed as preferences, never deficiencies.

---

## 20. RELEASE ROADMAP (what ships when)

### 🎯 SLICE — "The Magic Door" (2–3 weeks)
Prove one thing: a child voluntarily keeps playing while genuinely reading.
- Meadow Village + forest edge + one cave. Missing Chickens questline.
- 4 interaction types: signs, word-match, **mic magic word**, narrated dialogue.
- ~150 words (short vowels + sh/ch/th + 20 heart words). Baby dragon (follow/celebrate/level). Basic build plot. One-screen parent view.
- **Gate:** 3+ kids play 20+ min voluntarily, 15+ reading interactions each, ask to play again, zero stuck-mic moments.

### 📦 MVP — "Whispering Woods Complete" (+3–4 weeks)
- Full first biome: cave sub-area, second questline, shop, crafting, 300–500 word corpus.
- First 2 spells + spellbook. Library with 3 decodable books + rewards. Adaptive 70/20/10 selection live. Warm failure design everywhere.

### 🐉 RETENTION — "The Dragon Grows" (+6–8 weeks)
- Crystal Caves (biome 2) + first boss. Companion evolution with cinematic clips. Blueprint economy. Voice v2 + sentence read-aloud. Spaced repetition. Parent dashboard v2. Hidden placement adventure. Real-family playtest (10–20 kids) drives every kill/keep decision.

### 🚀 LAUNCH — "Restore the Kingdom"
- Biomes 3–4, world events, subscription (free first biome), iPad app. Wedge line everywhere: *the reading game that hears your child read.*

### 🌅 BEYOND
- Biomes 5–9, teacher mode & classrooms, safe multiplayer (preset communication only), personalized dynamic stories, additional companions & sanctuary, phoneme-level speech coaching. Only after reading wins: spelling, math, and beyond on the same platform — never before.

---

## 21. THE NORTH STAR
The child should never think "I'm doing reading practice." The child should think: **"I'm a Wordkeeper. My voice opens doors. My dragon evolved because of me. Look what I built."** Underneath, the engine knows exactly what they can read — and quietly builds the world that teaches them what's next.
