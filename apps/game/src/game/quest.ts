// The Missing Chickens questline — a data-light state machine that composes
// Reading Moments. The world scene forwards every interaction here; this file
// decides what happens. No pedagogy: word choices come from content, mastery
// from the engine, and all reading UI from the widgets.
import { allBlocks, queryWords, validateText, word as getWord } from '@readquest/content';
import { sfxCrack, sfxHit, sfxPop, sfxReward, sfxUnlock } from './sfx';
import type { Services } from '../services';
import type { Hud } from '../ui/hud';
import {
  celebrate,
  choiceBoard,
  magicWordDoor,
  readWordCard,
  showBlueprint,
  showDialogue,
  toast,
} from '../ui/widgets';
import { floatNote } from '../ui/dom';
import { checkDeeds } from '../ui/deeds';
import { buildJob, jobReward, showJobOffer } from '../ui/questboard';
import { blueprintById, nextBlueprint, type BlueprintDef } from '../ui/blueprints';
import { QuestStep } from '../types';

const WORLD_TILE = 54; // keep in sync with world.ts WORLD_TILE (blueprint guidance math)

export interface WorldControl {
  revealObjective(pos: { x: number; y: number }): void;
  dragonHappy(): void;
  openCaveDoor(): void;
  buildWall(slot: number): void;
  setCoopStage(stage: number): void;
  henFoundAt(spot: string): void;
  showHensAtCoop(): void;
  openChest(): void;
  dragonLevelUp(level: number): void;
  refreshMarkers(): void;
  playerPos(): { x: number; y: number };
  hatchBaby(species: string): void;
  renderBlueprint(): void;
  fillBlueprintCell(index: number): void;
  finishBlueprint(id: string, pet: string): void;
}

// Decodable baby species an egg can hatch into. The pool is filtered to what the
// child can read at their tier (pup/cub/kid are base+short-vowel, so always
// available; chick needs the CH digraph). Reading the species name is the crack.
const HATCH_SPECIES = ['pup', 'cub', 'kid', 'chick'];

const OBJECTIVES: Record<number, { icon: string; lineId: string | null }> = {
  [QuestStep.INTRO_SIGNS]: { icon: '🪧', lineId: 'ln_sign_hint' },
  [QuestStep.GATHER_BUILD]: { icon: '🪵', lineId: 'ln_gather_hint' },
  [QuestStep.MEET_MAYOR]: { icon: '🐔❗', lineId: 'ln_mayor_1' },
  [QuestStep.PATH_CHOICE]: { icon: '🪧➡️', lineId: 'ln_clue_path' },
  [QuestStep.CAVE_DOOR]: { icon: '🧙✨', lineId: 'ln_wizard_prompt' },
  [QuestStep.HUNT]: { icon: '🐔🔎', lineId: 'ln_mayor_2' },
  [QuestStep.RETURN_MAYOR]: { icon: '🐔✅', lineId: 'ln_mayor_2' },
  [QuestStep.BUILD_COOP]: { icon: '🏠🔨', lineId: 'ln_build_coop' },
  [QuestStep.CHEST]: { icon: '🗝️✨', lineId: 'ln_chest_tease' },
  [QuestStep.FREE_PLAY]: { icon: '🎈', lineId: 'ln_free_play' },
};

const HUNT_SPOTS: Record<string, { clue: string; target: string }> = {
  shed: { clue: 'ln_clue_1', target: 'shed' },
  rock: { clue: 'ln_clue_2', target: 'rock' },
  log: { clue: 'ln_clue_3', target: 'log' },
};
const SPOT_WORDS = ['shed', 'rock', 'log'];

// Decodable foods spanning several skills, so adaptive feeding can target the
// skill the child needs (egg/jam short-vowels, fig short_i, ham short_a, bun/nut short_u).
const FEED_FOODS = ['egg', 'nut', 'jam', 'ham', 'fig', 'bun'];

// World-layout anchors for guidance. Keep in sync with world.ts placements.
const POI = {
  signs: { den: [270, 770], hut: [565, 435], shop: [1040, 435] } as Record<string, [number, number]>,
  trees: [
    [180, 230], [1140, 200], [1400, 300], [1520, 720], [1660, 240],
    [1800, 880], [1960, 380], [2120, 940], [1470, 980],
  ] as Array<[number, number]>,
  plot: [445, 860] as [number, number],
  mayor: [750, 640] as [number, number],
  pathSign: [1240, 650] as [number, number],
  wizard: [2255, 335] as [number, number],
  door: [2380, 300] as [number, number],
  chest: [760, 1430] as [number, number],
  spots: { shed: [1560, 400], rock: [2150, 520], log: [1880, 730] } as Record<string, [number, number]>,
  rocks: [[1620, 560], [2060, 680]] as Array<[number, number]>,
  nest: [445, 1000] as [number, number], // where free-play eggs appear (by the coop)
};

function xy(p: [number, number]): { x: number; y: number } {
  return { x: p[0], y: p[1] };
}

function nearest(from: { x: number; y: number }, pts: Array<[number, number]>): { x: number; y: number } {
  let best = pts[0]!;
  let bestD = Infinity;
  for (const p of pts) {
    const d = (p[0] - from.x) ** 2 + (p[1] - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return xy(best);
}

export class QuestDirector {
  private feedIdx = 0;
  private busy = false;
  private pendingReveal = false;

  constructor(
    private services: Services,
    private world: WorldControl,
    private hud: Hud,
  ) {}

  get step(): number {
    return this.services.save.questStep;
  }

  private setStep(step: number): void {
    this.services.save.questStep = step as typeof this.services.save.questStep;
    this.services.persist();
    this.services.analytics.log('quest_step', { step });
    this.pendingReveal = true; // show the player where to go next
    this.refresh();
  }

  /** Where should the player head right now? null = free play, no guidance. */
  objectiveTarget(): { x: number; y: number } | null {
    const s = this.services.save;
    const p = this.world.playerPos();
    switch (this.step) {
      case QuestStep.INTRO_SIGNS: {
        const unread = Object.entries(POI.signs)
          .filter(([w]) => !s.signsRead.includes(w))
          .map(([, c]) => c);
        return unread.length ? nearest(p, unread) : xy(POI.signs['den']!);
      }
      case QuestStep.GATHER_BUILD:
        return s.wood < 1 ? nearest(p, POI.trees) : xy(POI.plot);
      case QuestStep.MEET_MAYOR:
      case QuestStep.RETURN_MAYOR:
        return xy(POI.mayor);
      case QuestStep.PATH_CHOICE:
        return xy(POI.pathSign);
      case QuestStep.CAVE_DOOR:
        return xy(POI.wizard);
      case QuestStep.HUNT: {
        const left = Object.entries(POI.spots)
          .filter(([k]) => !s.hensFound.includes(k))
          .map(([, c]) => c);
        return left.length ? nearest(p, left) : xy(POI.mayor);
      }
      case QuestStep.BUILD_COOP:
        return s.wood >= 2 ? xy(POI.plot) : nearest(p, POI.trees);
      case QuestStep.CHEST:
        return p.y > 1200 ? xy(POI.chest) : xy(POI.door);
      default:
        // FREE_PLAY — guide to an active plan first, then a Help-Wanted job.
        return this.blueprintTarget() ?? this.jobTarget();
    }
  }

  /** The next unfilled ghost cell of an active plan (null with no plan). */
  private blueprintTarget(): { x: number; y: number } | null {
    const bp = this.services.save.blueprint;
    if (!bp) return null;
    const def = blueprintById(bp.id);
    if (!def) return null;
    const idx = bp.filled.findIndex((f) => !f);
    const off = def.shape[idx === -1 ? 0 : idx]!;
    const tx = def.origin[0] + off[0];
    const ty = def.origin[1] + off[1];
    return { x: tx * WORLD_TILE + WORLD_TILE / 2, y: ty * WORLD_TILE + WORLD_TILE / 2 };
  }

  /** Where the active free-play job points: the resource while gathering, the
   *  giver once it's ready to turn in. Null with no job — free play stays open. */
  private jobTarget(): { x: number; y: number } | null {
    const job = this.services.save.job;
    if (!job) return null;
    const p = this.world.playerPos();
    if (job.progress >= job.target) return xy(job.giver === 'mayor' ? POI.mayor : POI.wizard);
    if (job.kind === 'wood') return nearest(p, POI.trees);
    if (job.kind === 'stone') return nearest(p, POI.rocks);
    return xy(POI.nest); // eggs gather by the coop
  }

  private maybeReveal(): void {
    if (!this.pendingReveal) return;
    this.pendingReveal = false;
    const target = this.objectiveTarget();
    if (target) this.world.revealObjective(target);
  }

  refresh(): void {
    const obj = OBJECTIVES[this.step] ?? { icon: '🎈', lineId: null };
    this.hud.setObjective(obj.icon, obj.lineId);
    this.hud.setCounts(this.counts());
    this.hud.setJob(this.services.save.job);
    this.world.refreshMarkers();
  }

  counts(): { wood: number; stone: number; eggs: number; gems: number; hens: number | null } {
    const s = this.services.save;
    return {
      wood: s.wood,
      stone: s.stone,
      eggs: s.eggs,
      gems: s.gems,
      hens: this.step === QuestStep.HUNT ? s.hensFound.length : null,
    };
  }

  async start(): Promise<void> {
    this.reconcile();
    this.refresh();
    if (this.step === QuestStep.INTRO_SIGNS && this.services.save.signsRead.length === 0) {
      await toast(this.services, 'ln_sign_hint');
      this.pendingReveal = true; // first-ever objective gets the camera reveal
    }
    this.maybeReveal();
  }

  /**
   * Step transitions fire only as a side-effect of the handler that completes
   * a step's last sub-action, and that handler guards itself out on re-entry.
   * A mid-quest reload can persist the intermediate "{sub-goal done, step NOT
   * advanced}" state (persistSave debounces 250ms, shorter than the celebration
   * that follows). Without this, that state has no forward path — a permanent
   * soft-lock. reconcile() runs on load and advances any step whose persisted
   * sub-goal is already satisfied. Loops because one advance can satisfy the
   * next (e.g. signs → gather).
   */
  private reconcile(): void {
    const s = this.services.save;
    for (let i = 0; i < 8; i++) {
      const before = this.step;
      if (this.step === QuestStep.INTRO_SIGNS && s.signsRead.length >= 2) this.setStep(QuestStep.GATHER_BUILD);
      else if (this.step === QuestStep.GATHER_BUILD && s.wallsBuilt.length >= 1) this.setStep(QuestStep.MEET_MAYOR);
      else if (this.step === QuestStep.HUNT && s.hensFound.length >= 3) this.setStep(QuestStep.RETURN_MAYOR);
      else if (this.step === QuestStep.BUILD_COOP && s.coopStage >= 3) this.setStep(QuestStep.CHEST);
      if (this.step === before) break;
    }
  }

  /** Serialize interactions — one reading moment at a time. */
  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
      this.refresh();
      this.maybeReveal();
      void checkDeeds(this.services); // reading/quest progress may earn a deed
    }
  }

  onSignTapped(word: string): void {
    void this.run(async () => {
      await readWordCard(this.services, word);
      // State first, juice second — progress must never wait on audio.
      const s = this.services.save;
      if (!s.signsRead.includes(word)) {
        s.signsRead.push(word);
        this.services.persist();
      }
      await celebrate(this.services);
      if (this.step === QuestStep.INTRO_SIGNS && s.signsRead.length >= 2) {
        this.setStep(QuestStep.GATHER_BUILD);
        await toast(this.services, 'ln_gather_hint');
      }
    });
  }

  onTreeTapped(giveWood: () => void): void {
    if (this.busy) return;
    sfxHit();
    if (this.step !== QuestStep.FREE_PLAY) return this.instantGather(giveWood, 'wood');
    void this.run(() => this.readToGather(giveWood, 'wood', '🪓'));
  }

  onRockTapped(giveStone: () => void): void {
    if (this.busy) return;
    sfxHit();
    if (this.step !== QuestStep.FREE_PLAY) return this.instantGather(giveStone, 'stone');
    void this.run(() => this.readToGather(giveStone, 'stone', '⛏️'));
  }

  /** Tutorial gather: instant, so the guided intro stays simple. */
  private instantGather(give: () => void, kind: 'wood' | 'stone'): void {
    sfxPop();
    give();
    this.services.save[kind] += 1;
    this.services.analytics.log('gathered', { kind });
    this.services.persist();
    this.hud.setCounts(this.counts());
  }

  // Say-to-Mine (free play): reading IS the swing of the axe. Tap a node, an
  // adaptive decodable word slams up, you read it (forgiving — the word card
  // never fails), and the node CRACKS and loot bursts out. Every gather is now
  // an adaptive reading rep, chosen by the same 70/20/10 engine, logged as
  // evidence, and it never blocks (readWordCard always resolves).
  private async readToGather(give: () => void, kind: 'wood' | 'stone', icon: string): Promise<void> {
    const { target, skill, bucket } = this.pickPracticeWord();
    this.services.analytics.log('adaptive_target', { skill, bucket, word: target, via: 'gather' });
    await readWordCard(this.services, target, { icon });
    sfxCrack();
    give();
    this.world.dragonHappy(); // the dragon hops because you read — reaction to every read
    this.services.save[kind] += 1;
    this.services.analytics.log('gathered', { kind, via: 'read' });
    this.services.persist();
    this.hud.setCounts(this.counts());
    this.bumpJob(kind); // a Help-Wanted job may want this resource
  }

  /** The invisible engine (70/20/10) picks the next skill; draw a decodable word
   *  for it from the child's growing vocabulary. Shared by gather + dragon. */
  private pickPracticeWord(): { target: string; distractors: string[]; skill: string; bucket: string } {
    const seed = Math.floor(Math.random() * 1e6);
    const plan = this.services.engine.nextTarget(
      { childId: this.services.save.childId, hostableTypes: ['word_match'] },
      seed,
      Date.now(),
    );
    const pool = queryWords({
      withinSkills: this.services.save.taught,
      requireSkill: plan.targetSkill,
      count: 40,
    }).filter((w) => !w.heart);
    if (pool.length >= 3) {
      const target = pool[seed % pool.length]!.text;
      const distractors = pool.filter((w) => w.text !== target).slice(0, 2).map((w) => w.text);
      return { target, distractors, skill: plan.targetSkill, bucket: plan.bucket };
    }
    // Fallback (e.g. the target skill is base): the classic snack words.
    const forSkill = FEED_FOODS.filter((f) => getWord(f).skills.includes(plan.targetSkill));
    const target = (forSkill.length ? forSkill : FEED_FOODS)[seed % (forSkill.length || FEED_FOODS.length)]!;
    const distractors = FEED_FOODS.filter((f) => f !== target).slice(0, 2);
    return { target, distractors, skill: plan.targetSkill, bucket: plan.bucket };
  }

  onPlotSlotTapped(slot: number): void {
    void this.run(async () => {
      const s = this.services.save;
      if (s.wallsBuilt.includes(slot)) return;
      if (s.wood < 1) {
        await toast(this.services, 'ln_gather_hint');
        return;
      }
      s.wood -= 1;
      s.wallsBuilt.push(slot);
      this.services.persist();
      this.world.buildWall(slot);
      this.services.analytics.log('item_built', { kind: 'wall', slot });
      if (this.step === QuestStep.GATHER_BUILD && s.wallsBuilt.length === 1) {
        await showDialogue(this.services, 'ln_first_wall');
        await celebrate(this.services);
        this.setStep(QuestStep.MEET_MAYOR);
      }
    });
  }

  onMayorTapped(): void {
    void this.run(async () => {
      if (this.step === QuestStep.MEET_MAYOR) {
        await showDialogue(this.services, 'ln_mayor_1');
        await showDialogue(this.services, 'ln_mayor_2');
        await showDialogue(this.services, 'ln_mayor_3');
        this.setStep(QuestStep.PATH_CHOICE);
      } else if (this.step === QuestStep.HUNT) {
        await showDialogue(this.services, 'ln_mayor_2');
      } else if (this.step === QuestStep.RETURN_MAYOR) {
        await showDialogue(this.services, 'ln_hunt_done');
        await showBlueprint(this.services);
        await celebrate(this.services, true);
        this.setStep(QuestStep.BUILD_COOP);
        await toast(this.services, 'ln_build_coop');
      } else if (this.step === QuestStep.FREE_PLAY) {
        await this.giverInteract('mayor');
      } else {
        await this.services.speakText('Cluck cluck!', 'mayor_hen').done;
      }
    });
  }

  onPathSignTapped(): void {
    void this.run(async () => {
      if (this.step === QuestStep.PATH_CHOICE) {
        await choiceBoard(this.services, {
          challengeType: 'path_choice',
          targetWord: 'shed',
          distractors: ['shop'],
          clueLineId: 'ln_clue_path',
          spokenPrompt: 'Read the clue! Where did the hens run?',
          emoji: '🐔❓',
        });
        await celebrate(this.services);
        this.setStep(QuestStep.CAVE_DOOR);
      } else {
        await readWordCard(this.services, 'path');
      }
    });
  }

  onWizardTapped(): void {
    void this.run(async () => {
      if (this.step === QuestStep.CAVE_DOOR) {
        await showDialogue(this.services, 'ln_wizard_prompt');
        const result = await magicWordDoor(this.services, 'ship');
        this.world.openCaveDoor();
        await showDialogue(this.services, 'ln_door_open');
        await celebrate(this.services, true);
        this.services.analytics.log('magic_door_opened', { spoken: result.spoken });
        this.setStep(QuestStep.HUNT);
      } else if (this.step === QuestStep.FREE_PLAY) {
        await this.giverInteract('wizard');
      } else if (this.step >= QuestStep.CHEST) {
        await showDialogue(this.services, 'ln_chest_tease');
      } else {
        await this.services.speakText('Hello, little Wordkeeper!', 'wizard').done;
      }
    });
  }

  onHuntSpotTapped(spot: string): void {
    void this.run(async () => {
      if (this.step !== QuestStep.HUNT) return;
      const s = this.services.save;
      if (s.hensFound.includes(spot)) return;
      const conf = HUNT_SPOTS[spot];
      if (!conf) return;
      await choiceBoard(this.services, {
        challengeType: 'word_match',
        targetWord: conf.target,
        distractors: SPOT_WORDS.filter((w) => w !== conf.target),
        clueLineId: conf.clue,
        spokenPrompt: 'Read the clue! Where is the hen?',
        emoji: '🐔❓',
      });
      s.hensFound.push(spot);
      this.services.persist();
      this.world.henFoundAt(spot);
      await celebrate(this.services);
      if (s.hensFound.length >= 3) {
        this.setStep(QuestStep.RETURN_MAYOR);
      }
    });
  }

  onCoopTapped(): void {
    void this.run(async () => {
      const s = this.services.save;
      if (this.step === QuestStep.FREE_PLAY) {
        await this.hatchEgg();
        return;
      }
      if (this.step !== QuestStep.BUILD_COOP || s.coopStage >= 3) return;
      if (s.wood < 2) {
        await toast(this.services, 'ln_gather_hint');
        return;
      }
      s.wood -= 2;
      s.coopStage += 1;
      this.services.persist();
      this.world.setCoopStage(s.coopStage);
      this.services.analytics.log('item_built', { kind: 'coop_stage', stage: s.coopStage });
      if (s.coopStage >= 3) {
        this.world.showHensAtCoop();
        await showDialogue(this.services, 'ln_coop_done');
        await celebrate(this.services, true);
        this.setStep(QuestStep.CHEST);
        await toast(this.services, 'ln_chest_tease');
      }
    });
  }

  onChestTapped(): void {
    void this.run(async () => {
      if (this.step !== QuestStep.CHEST) return;
      await showDialogue(this.services, 'ln_chest_prompt');
      // CHEST is the deliberate stretch word: teach the ST blend at this moment.
      if (!this.services.save.taught.includes('blend_st')) {
        this.services.save.taught.push('blend_st');
        this.services.engine.markTaught('blend_st');
        this.services.persist();
      }
      await magicWordDoor(this.services, 'chest');
      this.world.openChest();
      // Idempotent: a reload during the post-open dialogues leaves step===CHEST,
      // so a re-tap must not grant a second gem.
      if (!this.services.save.treasureClaimed) {
        this.services.save.treasureClaimed = true;
        this.services.save.gems += 1;
      }
      this.services.save.dragonLevel = 2;
      this.services.persist();
      await showDialogue(this.services, 'ln_chest_open');
      this.world.dragonLevelUp(2);
      await celebrate(this.services, true);
      this.setStep(QuestStep.FREE_PLAY);
      await showDialogue(this.services, 'ln_free_play');
    });
  }

  onDragonTapped(): void {
    // Feeding is a free-play activity. During the scripted quest a dragon tap
    // (often an accidental hit when it overlaps an NPC) is just a happy,
    // non-blocking reaction — it must never open a modal board mid-quest.
    if (this.step !== QuestStep.FREE_PLAY) {
      this.world.dragonHappy();
      return;
    }
    void this.run(async () => {
      // Adaptive free-play practice: the invisible engine picks the skill the
      // child needs next (70/20/10), and we feed the dragon a food that
      // exercises it. Distractors are other foods (curated, thematic).
      const { target, distractors, skill, bucket } = this.pickPracticeWord();
      this.feedIdx += 1;
      this.services.analytics.log('adaptive_target', { skill, bucket, word: target, via: 'dragon' });
      await toast(this.services, 'ln_feed_dragon');
      await choiceBoard(this.services, {
        challengeType: 'word_match',
        targetWord: target,
        distractors,
        spokenPrompt: `Feed your dragon the word: ${target}!`,
        emoji: '🐉📖',
      });
      const w = getWord(target);
      this.services.analytics.log('pet_fed', { food: w.id });
      this.services.save.dragonXp += 1;
      if (target === 'egg' && this.services.save.eggs > 0) this.services.save.eggs -= 1;
      this.services.persist();
      await celebrate(this.services);
    });
  }

  onEggCollected(): void {
    sfxReward();
    this.services.save.eggs += 1;
    this.services.analytics.log('egg_collected');
    this.services.persist();
    this.hud.setCounts(this.counts());
    this.bumpJob('eggs');
  }

  // ── Eggs hatch into creatures (Phase 2.4) ─────────────────────────────────
  /** Tap the coop in free play to hatch an egg: read the baby's species name
   *  (the crack), spend one egg, and a procedural baby pops out to live here. */
  private async hatchEgg(): Promise<void> {
    const s = this.services.save;
    if (s.eggs < 1) {
      await this.services.speakText('Find an egg first, then tap the coop to hatch it!').done;
      return;
    }
    const species = this.pickHatchSpecies();
    // Reading the species name IS the crack — forgiving (the card never fails).
    await readWordCard(this.services, species, { icon: '🥚' });
    s.eggs -= 1;
    s.pets.push(species);
    this.services.analytics.log('egg_hatched', { species, pets: s.pets.length });
    this.services.persist();
    this.world.hatchBaby(species);
    this.hud.setCounts(this.counts());
    await celebrate(this.services);
  }

  private pickHatchSpecies(): string {
    const pool = HATCH_SPECIES.filter((sp) => validateText(sp, this.services.save.taught).ok);
    const list = pool.length ? pool : ['pup'];
    const seed = Math.floor(Math.random() * list.length);
    return list[seed]!;
  }

  // ── Blueprint Quests (Phase 2.3) ──────────────────────────────────────────
  /** Tap the plans table: pick up the next plan by READING its name, which drops
   *  a ghost outline on the grass to fill in. */
  onBlueprintTableTapped(): void {
    if (this.step !== QuestStep.FREE_PLAY) {
      this.world.dragonHappy();
      return;
    }
    void this.run(async () => {
      const s = this.services.save;
      if (s.blueprint) {
        await this.services.speakText('Fill in your plan! Tap the ghost blocks.').done;
        this.pendingReveal = true;
        return;
      }
      const def = nextBlueprint(this.services);
      if (!def) {
        await this.services.speakText('You built every plan! Amazing!').done;
        return;
      }
      await readWordCard(this.services, def.name, { icon: def.icon }); // read the plan name to accept
      s.blueprint = { id: def.id, filled: def.shape.map(() => false) };
      this.services.analytics.log('blueprint_started', { id: def.id });
      this.services.persist();
      this.world.renderBlueprint();
      this.world.refreshMarkers();
      this.pendingReveal = true;
      await this.services.speakText(`Now build a ${def.name}! Tap the ghost blocks.`).done;
    });
  }

  /** Tap a ghost cell: read the block's word to earn it (once), then it snaps in.
   *  Filling the last cell completes the plan. */
  onBlueprintCellTapped(index: number): void {
    void this.run(async () => {
      const s = this.services.save;
      const bp = s.blueprint;
      if (!bp) return;
      const def = blueprintById(bp.id);
      if (!def || bp.filled[index]) return;
      // Earn the block by reading its word (once) — the plan pulls the exact word.
      const block = allBlocks().find((b) => b.id === def.block);
      if (block && block.starter !== true && !s.blocksUnlocked.includes(block.id)) {
        await readWordCard(this.services, block.word);
        if (!s.blocksUnlocked.includes(block.id)) {
          s.blocksUnlocked.push(block.id);
          this.services.analytics.log('block_unlocked', { block: block.id, word: block.word, via: 'blueprint' });
        }
      }
      bp.filled[index] = true;
      const off = def.shape[index]!;
      const tx = def.origin[0] + off[0];
      const ty = def.origin[1] + off[1];
      s.worldBuild[`${tx},${ty}`] = def.block;
      s.buildPlaced += 1;
      this.services.persist();
      this.world.fillBlueprintCell(index);
      if (bp.filled.every(Boolean)) await this.completeBlueprint(def);
    });
  }

  private async completeBlueprint(def: BlueprintDef): Promise<void> {
    const s = this.services.save;
    s.blueprintsDone.push(def.id);
    s.blueprint = null;
    s.gems += def.gems;
    s.pets.push(def.pet);
    this.services.analytics.log('blueprint_done', { id: def.id, gems: def.gems });
    this.services.persist();
    this.world.finishBlueprint(def.id, def.pet); // poof + a baby to live in it
    this.hud.setCounts(this.counts());
    this.world.refreshMarkers();
    floatNote(`+${def.gems} 💎`, window.innerWidth / 2, window.innerHeight / 2 - 60);
    await celebrate(this.services, true);
    await this.services.speakText(def.praise).done; // proud read-back
  }

  // ── Quest Board / Help Wanted (Phase 2.1) ─────────────────────────────────
  /** Tapping a giver in free play: turn in a ready job, nudge an in-progress
   *  one, or offer a fresh one (reading the order to accept is a sentence_read). */
  private async giverInteract(giver: 'mayor' | 'wizard'): Promise<void> {
    const s = this.services.save;
    const job = s.job;
    const voice = giver === 'mayor' ? 'mayor_hen' : 'wizard';
    if (job && job.giver === giver && job.progress >= job.target) {
      await this.turnInJob();
      return;
    }
    if (job) {
      let line: string;
      if (job.progress >= job.target) {
        line = job.giver === 'mayor' ? 'Take that to the mayor!' : 'Take that to the wizard!';
      } else {
        line = job.giver === giver ? 'Keep going! You can do it!' : 'Finish your other job first!';
      }
      await this.services.speakText(line, voice).done;
      this.pendingReveal = true; // re-point the way
      return;
    }
    const seed = Math.floor(Math.random() * 1e6);
    const accepted = await showJobOffer(this.services, buildJob(this.services, giver, seed));
    if (accepted) {
      s.job = accepted;
      this.services.persist();
      this.pendingReveal = true; // guide toward the resource
    }
  }

  private async turnInJob(): Promise<void> {
    const s = this.services.save;
    const job = s.job;
    if (!job) return;
    const reward = jobReward(this.services);
    s.gems += reward.gems;
    s.jobsDone += 1;
    s.job = null;
    this.services.persist();
    this.services.analytics.log('job_done', { kind: job.kind, jobsDone: s.jobsDone });
    const voice = job.giver === 'mayor' ? 'mayor_hen' : 'wizard';
    await this.services.speakText('Thank you! Here is a treasure for you!', voice).done;
    sfxReward();
    floatNote(`+${reward.gems} 💎`, window.innerWidth / 2, window.innerHeight / 2 - 60);
    this.hud.setCounts(this.counts());
    await celebrate(this.services, true);
  }

  /** A gather/egg event nudges the active job; hitting the target arms turn-in. */
  private bumpJob(kind: 'wood' | 'stone' | 'eggs'): void {
    const job = this.services.save.job;
    if (!job || job.kind !== kind || job.progress >= job.target) return;
    job.progress += 1;
    this.services.persist();
    this.hud.setJob(job);
    if (job.progress >= job.target) {
      sfxUnlock();
      floatNote('📋 ✓ Turn it in!', window.innerWidth / 2, window.innerHeight * 0.32);
      this.pendingReveal = true;
      this.world.refreshMarkers();
      this.maybeReveal();
    }
  }

  /** Free-play glint cache: a sparkle hidden out over the eastern rise. Tapping
   *  it is a one-time reading rep that pays a gem — a concrete reward for walking
   *  east and reading. Idempotent: the id is remembered, so a found cache never
   *  pays twice (a reload mid-celebration can't double-grant). */
  onGlintTapped(id: string, onCollect: () => void): void {
    if (this.step !== QuestStep.FREE_PLAY) return;
    if (this.services.save.glintsFound.includes(id)) {
      onCollect(); // already claimed — just clear the stale sparkle
      return;
    }
    void this.run(async () => {
      const s = this.services.save;
      if (s.glintsFound.includes(id)) return; // re-entrancy guard
      const { target, skill, bucket } = this.pickPracticeWord();
      this.services.analytics.log('adaptive_target', { skill, bucket, word: target, via: 'glint' });
      await readWordCard(this.services, target, { icon: '✨' });
      // Pay the reward exactly once, state first.
      s.glintsFound.push(id);
      s.gems += 1;
      this.services.analytics.log('glint_found', { id, word: target });
      this.services.persist();
      sfxReward();
      onCollect(); // world removes the sparkle + bursts a little pop
      this.world.dragonHappy();
      this.hud.setCounts(this.counts());
      floatNote('+1 💎', window.innerWidth / 2, window.innerHeight / 2 - 60);
      await celebrate(this.services);
    });
  }

  /** Night firefly (Phase 3.5): a word only out after dark. Reading it catches
   *  the firefly for a gem — a soft reason to come back at a new time of day. */
  onFireflyTapped(onCaught: () => void): void {
    if (this.step !== QuestStep.FREE_PLAY) return;
    void this.run(async () => {
      const { target, skill, bucket } = this.pickPracticeWord();
      this.services.analytics.log('adaptive_target', { skill, bucket, word: target, via: 'firefly' });
      await readWordCard(this.services, target, { icon: '🌙' });
      this.services.save.gems += 1;
      this.services.save.firefliesCaught = (this.services.save.firefliesCaught ?? 0) + 1;
      this.services.analytics.log('firefly_caught', { word: target });
      this.services.persist();
      sfxReward();
      onCaught();
      this.hud.setCounts(this.counts());
      floatNote('+1 💎', window.innerWidth / 2, window.innerHeight / 2 - 60);
      await celebrate(this.services);
    });
  }
}
