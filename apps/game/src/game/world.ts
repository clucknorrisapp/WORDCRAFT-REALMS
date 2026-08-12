// The world: Meadow Village + Whispering Woods edge + the Wizard's cave.
// Canvas renders the world; every reading surface is DOM (architecture §5.1).
// All interactions are forwarded to the QuestDirector — no pedagogy here.
import Phaser from 'phaser';
import type { Services } from '../services';
import type { Hud } from '../ui/hud';
import { allBlocks, readerLevel } from '@readquest/content';
import { floatNote, isUiOpen, reducedMotion } from '../ui/dom';
import { setBuildRenderer, setDragonCelebrate, setNextHandler, setPlaceModeToggle, setCreatureRefresh, setFastTravel, setPlayerPeek, setSummon, setBeaconRefresh } from '../ui/widgets';
import { regionAt } from './regions';
import { summonableByWord, type Summonable } from '../ui/loot';
import { creatureById, wildCreatures, type Creature } from '../ui/creatures';
import { openBuild, gridDims } from '../ui/build';
import { checkDeeds } from '../ui/deeds';
import { openWorldPalette, firstWorldBlock, WORLD_ERASER, type WorldPalette } from '../ui/worldbuild';
import { blueprintById } from '../ui/blueprints';
import { GATES, gateById, gateOpenable, type GateDef } from '../ui/gates';
import { MINE_SEAMS, TOOLBENCH, seamById, seamVisible, nextPick, type Seam } from '../ui/mine';
import { sfxChirp, sfxCrack, sfxPlace, sfxShatter } from './sfx';
import { blockTextureCanvas } from './block-textures';
import { hasPropTexture, propTextureCanvas, PIXEL_PROP_KEYS } from './world-textures';

// Where the child's Build-Mode creation is shown in the world (open grass in
// the south-east, clear of the village, forest, and cave).
const BUILD_ORIGIN = { x: 1800, y: 1130 };
const BUILD_TILE = 54;
import { QuestDirector, INTERACTIVE_BLOCKS, type WorldControl } from './quest';
import { DRAGON_TINTS, QuestStep } from '../types';

const W = 2600;
const H = 1600;
const WORLD_TILE = 54; // Build-Where-You-Stand tile size (matches the plot grid)
const BUILD_MAX_Y = 1140; // keep world-builds in the overworld, out of the cave band
const FONT = '"Nunito", "Segoe UI Rounded", sans-serif';

interface Tappable {
  x: number;
  y: number;
  radius: number;
  cb: () => void;
}

const SPRITES = [
  'avatar_0', 'avatar_1', 'avatar_2', 'avatar_3',
  'dragon', 'mayor_hen', 'wizard', 'hen',
  'coop', 'house', 'stall', 'tree',
  'rock', 'sign', 'door', 'chest',
];

const WALL_SLOTS: Array<[number, number]> = [
  [325, 795], [445, 795], [565, 795],
  [285, 875], [285, 955], [605, 875],
];

const HUNT_SPOT_POS: Record<string, [number, number]> = {
  shed: [1560, 400],
  rock: [2150, 520],
  log: [1880, 730],
};

export class WorldScene extends Phaser.Scene {
  private services: Services;
  private hud: Hud;
  private director!: QuestDirector;

  private player!: Phaser.Physics.Arcade.Sprite;
  private dragon!: Phaser.GameObjects.Sprite;
  private dragonRig?: Phaser.GameObjects.Container; // horns + wings added as the dragon grows
  private coachHand?: Phaser.GameObjects.Container; // first-run "tap to walk" cue
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private moveTarget: { x: number; y: number } | null = null;
  private pending: Tappable | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private door!: Phaser.Physics.Arcade.Sprite;
  private doorGlow!: Phaser.GameObjects.Arc;
  private guideArrow!: Phaser.GameObjects.Text;
  private caveEntrance: Phaser.GameObjects.Arc | null = null;
  private cinematic = false;
  private cinematicTimer: Phaser.Time.TimerEvent | null = null;
  private lastInputAt = 0;
  private autoWalkCooldownUntil = 0;
  private autoWalking = false;
  private slowMs = 0;
  private chest!: Phaser.GameObjects.Sprite;
  private chestGlow!: Phaser.GameObjects.Arc;
  private coop!: Phaser.GameObjects.Sprite;
  private markers = new Map<string, Phaser.GameObjects.Text>();
  // Where leaving the cave drops you: out on the path, well clear of the cave
  // entrance's tap zone (2380,305 r=190) so you don't instantly re-enter.
  private caveReturn = { x: 2200, y: 660 };
  private caveCooldownUntil = 0; // blocks re-entering the cave right after leaving
  private eggsOnGround = 0;
  private buildTiles: Phaser.GameObjects.Image[] = [];

  // Build Where You Stand (Phase 2.2): place-mode state + the persisted blocks.
  private placing = false;
  private placeBlockId = WORLD_ERASER;
  private placeGrid: Phaser.GameObjects.Graphics | null = null;
  private placeCursor: Phaser.GameObjects.Rectangle | null = null;
  private worldPalette: WorldPalette | null = null;
  private worldBuildTiles = new Map<string, Phaser.GameObjects.Image>();

  // The world breathes (Phase 3.5): a slow day→night colour grade + night bugs.
  private dayTint!: Phaser.GameObjects.Rectangle;
  private fireflies: Phaser.GameObjects.Arc[] = [];
  private wasNight = false;
  private phaseOverride: number | null = null; // test hook

  // Read-to-Tame creatures (Phase 3.3).
  private wildMobs = new Map<string, Phaser.GameObjects.Container>();
  private tamedMobs: Phaser.GameObjects.Container[] = [];

  constructor(services: Services, hud: Hud) {
    super('world');
    this.services = services;
    this.hud = hud;
  }

  preload(): void {
    for (const key of SPRITES) {
      if (hasPropTexture(key)) continue; // replaced by a pixel-art painter in create()
      this.load.image(key, `assets/sprites/${key}.png`);
    }
  }

  create(): void {
    this.physics.world.setBounds(0, 0, W, H);
    this.makeProceduralTextures();
    this.registerBlockTextures();
    this.registerPropTextures();
    this.paintGround();
    this.obstacles = this.physics.add.staticGroup();

    this.buildVillage();
    this.buildForest();
    this.buildCave();
    this.buildGates(); // Word-Gates at the eastern edge (+ any biomes already opened)
    this.buildMine(); // toolbench + ore seams (the pick ladder)
    this.buildBeacon(); // the reading-journey monument on the hill (Phase 4.2)
    this.buildGiant(); // the Waking Giant boss out south-east (Phase 4.2)
    this.buildFurnace(); // the smelter machine: makes ore over time, read to collect (Phase 4.1)
    this.setupBuildPlot();
    this.setupBlueprintTable();
    this.spawnPlayerAndDragon();
    this.restoreFromSave();
    this.spawnCritters();
    this.time.delayedCall(700, () => this.maybeStartCoach()); // first-run "tap to walk" cue
    this.spawnPets(); // babies hatched from eggs in earlier sessions
    this.restoreSummoned(); // Word-Loot things read into the world in earlier sessions
    this.spawnTamedCreatures(); // creatures tamed in earlier sessions live here
    this.refreshWildCreatures(); // shy critters roam, ready to be read-tamed

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.noteInput();
      if (isUiOpen()) return;
      if (this.placing) {
        this.updatePlaceCursor(p);
        this.placeAtPointer(p);
        return;
      }
      this.moveTarget = { x: p.worldX, y: p.worldY };
      this.pending = null;
      this.autoWalking = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.placing) return;
      this.updatePlaceCursor(p);
      if (p.isDown) this.placeAtPointer(p); // drag to paint a path/wall
    });
    this.input.keyboard!.on('keydown', () => this.noteInput());

    // Objective wayfinding: a screen-space arrow that points at the current
    // goal whenever it is off-screen (the "where do I go" fix).
    this.guideArrow = this.add
      .text(0, 0, '➤', { fontSize: '46px', color: '#ffd166', stroke: '#7a4a00', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9990)
      .setVisible(false);
    this.lastInputAt = this.time.now;

    // Day/night colour grade: a screen-space wash over the world (never over the
    // DOM HUD). Non-interactive, so it never blocks a tap. Free play only.
    this.dayTint = this.add
      .rectangle(0, 0, 6000, 4000, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(9970);

    this.director = new QuestDirector(this.services, this.worldControl(), this.hud);
    setDragonCelebrate((big) => this.dragonCelebrateAnim(big));
    setBuildRenderer(() => this.renderBuild());
    setNextHandler(() => this.showNext()); // the "Where do I go?" compass
    setPlaceModeToggle(() => this.togglePlaceMode()); // Build Where You Stand
    setCreatureRefresh(() => this.refreshWildCreatures()); // new sounds → new creatures
    setFastTravel((x, y) => this.teleport(x, y)); // map pins whoosh the player
    setPlayerPeek(() => ({ x: this.player.x, y: this.player.y })); // map's "you are here"
    setSummon((word) => this.summonThing(word)); // Word Loot: read a word → its thing appears
    setBeaconRefresh(() => this.updateBeacon(true)); // level-up / finished book lights a ring
    this.renderWorldBuild(); // restore blocks laid in the world last session
    this.renderBlueprint(); // restore an in-progress plan's ghosts
    // Free play only: strew the wide east with Say-to-Mine nodes + glint caches,
    // then nudge toward the nearest one so a session never opens on a blank map.
    this.seedFreePlayNodes();
    this.time.delayedCall(400, () => void this.director.start());
    this.time.delayedCall(1400, () => this.freePlayOpener());

    this.time.addEvent({
      delay: 30000,
      loop: true,
      callback: () => this.maybeSpawnEgg(),
    });
  }

  // ── Building the map ──────────────────────────────────────────────────────
  private makeProceduralTextures(): void {
    const g = this.add.graphics();
    // grass tuft
    g.fillStyle(0x67b33e, 1);
    g.fillTriangle(0, 12, 4, 0, 8, 12);
    g.fillTriangle(6, 12, 10, 2, 14, 12);
    g.generateTexture('tuft', 14, 12);
    g.clear();
    // ── Pixel-art ground details (a wildflower meadow that matches the blocky
    //    ground). Built blocky (fillRect) so they read as pixel-art, not vector. ──
    const flower = (key: string, petal: number, center: number) => {
      g.fillStyle(0x3f8a26, 1); g.fillRect(5, 6, 2, 8); // stem
      g.fillStyle(0x67b33e, 1); g.fillRect(2, 9, 3, 2); g.fillRect(7, 10, 3, 2); // leaves
      g.fillStyle(petal, 1); g.fillRect(3, 1, 6, 6); // petal block
      g.fillStyle(center, 1); g.fillRect(5, 3, 2, 2); // center
      g.generateTexture(key, 12, 15); g.clear();
    };
    flower('flower_y', 0xf4d34a, 0xe8873a);
    flower('flower_p', 0xe86fa0, 0xf4d34a);
    flower('flower_w', 0xf3f0e8, 0xf4d34a);
    // pebbles
    g.fillStyle(0x8a8a8a, 1); g.fillRect(0, 3, 5, 4); g.fillRect(6, 2, 4, 4); g.fillRect(10, 4, 4, 3);
    g.fillStyle(0xa8a8a8, 1); g.fillRect(1, 3, 2, 1); g.fillRect(7, 2, 2, 1);
    g.generateTexture('pebble', 14, 8); g.clear();
    // mushroom
    g.fillStyle(0xf3ead6, 1); g.fillRect(4, 6, 3, 6); // stem
    g.fillStyle(0xc0392b, 1); g.fillRect(1, 3, 9, 4); g.fillRect(2, 2, 7, 1); // cap
    g.fillStyle(0xffffff, 1); g.fillRect(3, 4, 1, 1); g.fillRect(6, 4, 1, 1); // spots
    g.generateTexture('mushroom', 11, 12); g.clear();
    // sapling
    g.fillStyle(0x6e4a24, 1); g.fillRect(5, 9, 2, 7); // trunk
    g.fillStyle(0x2f7d2f, 1); g.fillRect(2, 2, 8, 8); // canopy
    g.fillStyle(0x54c24a, 1); g.fillRect(3, 3, 3, 3); // highlight
    g.generateTexture('sapling', 12, 16); g.clear();
    // wooden wall piece
    g.fillStyle(0xa9743f, 1);
    g.fillRoundedRect(0, 0, 58, 46, 6);
    g.fillStyle(0x8f5c2e, 1);
    g.fillRect(0, 14, 58, 4);
    g.fillRect(0, 30, 58, 4);
    g.lineStyle(3, 0x6e4520, 1);
    g.strokeRoundedRect(1, 1, 56, 44, 6);
    g.generateTexture('wall_wood', 58, 46);
    g.clear();
    // egg
    g.fillStyle(0xfff6e0, 1);
    g.fillEllipse(14, 19, 24, 32);
    g.lineStyle(2, 0xd9c9a3, 1);
    g.strokeEllipse(14, 19, 24, 32);
    g.generateTexture('egg', 28, 38);
    g.clear();
    // log
    g.fillStyle(0x8f5c2e, 1);
    g.fillRoundedRect(0, 8, 118, 44, 20);
    g.fillStyle(0xc89a63, 1);
    g.fillEllipse(112, 30, 22, 40);
    g.fillStyle(0xa87843, 1);
    g.fillEllipse(112, 30, 12, 24);
    g.lineStyle(3, 0x6e4520, 1);
    g.strokeRoundedRect(1, 9, 116, 42, 20);
    g.generateTexture('log', 132, 60);
    g.clear();
    g.destroy();
  }

  private paintGround(): void {
    const S = 48 / 96; // render the 96px textures as 48px world tiles
    // Whole-world Minecraft grass floor.
    this.add.tileSprite(W / 2, H / 2, W, H, 'blk_grass').setDepth(-100).setTileScale(S, S);
    // Forest: a darker green wash so it still reads as a denser biome.
    this.add.rectangle(1950, 560, 1300, 1000, 0x3f8a26, 0.28).setDepth(-99);
    // Dirt paths, tiled.
    this.add.tileSprite(1280, 660, 2280, 86, 'blk_mud').setDepth(-90).setTileScale(S, S);
    this.add.tileSprite(680, 520, 90, 420, 'blk_mud').setDepth(-90).setTileScale(S, S);
    this.add.tileSprite(445, 905, 400, 290, 'blk_mud').setDepth(-90).setTileScale(S, S).setAlpha(0.85); // village plot dirt
    // Scatter a wildflower-meadow mix of pixel-art ground details. Grass tufts
    // stay the majority; flowers/pebbles/mushrooms/saplings add Minecraft-y
    // richness. Deterministic seed → identical every load (no flicker).
    const rnd = new Phaser.Math.RandomDataGenerator(['readquest']);
    const detail = ['tuft', 'tuft', 'tuft', 'tuft', 'flower_y', 'flower_p', 'flower_w', 'pebble', 'mushroom', 'sapling'];
    // Keep the dirt crossroads legible: skip scatter on the path bands.
    const onPath = (x: number, y: number) =>
      (y > 612 && y < 708) || (x > 632 && x < 728 && y < 720);
    for (let i = 0; i < 150; i++) {
      const x = rnd.between(60, W - 60);
      const y = rnd.between(60, 1080);
      if (onPath(x, y)) continue;
      const key = detail[rnd.between(0, detail.length - 1)]!;
      this.add.image(x, y, key).setDepth(-80).setAlpha(key === 'tuft' ? 0.8 : 0.95);
    }
    // wall between overworld and cave room
    const divider = this.add.rectangle(W / 2, 1160, W, 40, 0x000000, 0);
    this.physics.add.existing(divider, true);
    this.time.delayedCall(0, () => {
      this.physics.add.collider(this.player, divider);
    });
  }

  private prop(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { tint?: number; solid?: boolean; bodyScale?: number } = {},
  ): Phaser.GameObjects.Sprite {
    let sprite: Phaser.GameObjects.Sprite;
    if (opts.solid !== false) {
      const s = this.obstacles.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
      s.setDisplaySize(w, h);
      const bw = w * (opts.bodyScale ?? 0.7);
      const bh = h * 0.36;
      s.body!.setSize(bw / s.scaleX, bh / s.scaleY);
      s.body!.setOffset(
        (s.width - bw / s.scaleX) / 2,
        s.height - bh / s.scaleY - 4,
      );
      sprite = s;
    } else {
      sprite = this.add.sprite(x, y, key);
      sprite.setDisplaySize(w, h);
    }
    if (opts.tint) sprite.setTint(opts.tint);
    sprite.setDepth(y);
    return sprite;
  }

  private tappable(
    obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
    cb: () => void,
    radius = 170,
  ): void {
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.noteInput();
      if (isUiOpen()) return;
      const t: Tappable = { x: obj.x, y: obj.y, radius, cb };
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y);
      if (d <= radius) {
        this.moveTarget = null;
        this.pending = null; // stopPropagation suppresses the scene handler that
        cb(); //               would clear this — do it here or a stale far-tap lingers
      } else {
        this.moveTarget = { x: obj.x, y: obj.y };
        this.pending = t;
      }
    });
  }

  private sign(word: string, x: number, y: number, onTap: () => void): Phaser.GameObjects.Sprite {
    const s = this.prop('sign', x, y, 74, 104, { solid: false });
    const label = this.add
      .text(x, y - 22, word.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: '900',
        color: '#5b4632',
      })
      .setOrigin(0.5)
      .setDepth(y + 1);
    label.setAngle(-2);
    this.tappable(s, onTap);
    return s;
  }

  private marker(key: string, x: number, y: number): void {
    const t = this.add
      .text(x, y, '❗', { fontSize: '34px' })
      .setOrigin(0.5)
      .setDepth(9000)
      .setVisible(false);
    this.tweens.add({ targets: t, y: y - 14, duration: 550, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.markers.set(key, t);
  }

  private buildVillage(): void {
    this.prop('house', 450, 340, 195, 155);
    this.prop('stall', 930, 330, 180, 190);
    const mayor = this.prop('mayor_hen', 750, 640, 62, 112, { solid: false });
    this.tweens.add({ targets: mayor, y: 634, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.tappable(mayor, () => this.director.onMayorTapped());
    this.marker('mayor', 750, 560);

    this.sign('den', 270, 770, () => this.director.onSignTapped('den'));
    this.sign('hut', 565, 435, () => this.director.onSignTapped('hut'));
    this.sign('shop', 1040, 435, () => this.director.onSignTapped('shop'));

    // village trees
    for (const [x, y] of [[180, 230], [1140, 200]] as Array<[number, number]>) {
      this.gatherableTree(x, y);
    }

    // plot slots + coop ghost
    WALL_SLOTS.forEach(([x, y], i) => {
      const slot = this.add.rectangle(x, y, 56, 44, 0xffffff, 0.22).setDepth(y - 1);
      slot.setStrokeStyle(2, 0xffffff, 0.5);
      slot.setInteractive({ useHandCursor: true });
      slot.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (isUiOpen()) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= 190) {
          this.director.onPlotSlotTapped(i);
        } else {
          this.moveTarget = { x, y };
          this.pending = { x, y, radius: 190, cb: () => this.director.onPlotSlotTapped(i) };
        }
      });
    });
    this.coop = this.prop('coop', 445, 930, 150, 144, { solid: false });
    this.coop.setAlpha(0.28);
    this.tappable(this.coop, () => this.director.onCoopTapped(), 200);
    this.marker('coop', 445, 840);

    this.sign('path', 1240, 650, () => this.director.onPathSignTapped());
    this.marker('pathsign', 1240, 570);
  }

  // The child's own build plot: a dirt pad in the open south-east where their
  // Build-Mode creation is shown in the world. Tapping it opens Build Mode.
  private setupBuildPlot(): void {
    const { w: gw, h: gh } = gridDims(this.services);
    const cx = BUILD_ORIGIN.x + (BUILD_TILE * (gw - 1)) / 2;
    const cy = BUILD_ORIGIN.y + (BUILD_TILE * (gh - 1)) / 2;
    const w = BUILD_TILE * gw + 40;
    const h = BUILD_TILE * gh + 40;
    // A tiled Minecraft grass field for the ground the child builds on.
    const ground = this.add.tileSprite(cx, cy, w, h, 'blk_grass').setDepth(-90);
    ground.setTileScale(BUILD_TILE / 96, BUILD_TILE / 96);
    const pad = this.add.rectangle(cx, cy, w, h, 0x000000, 0).setDepth(-89);
    pad.setStrokeStyle(6, 0x6e4a24, 0.85);
    const label = this.add
      .text(cx, cy - h / 2 - 34, '🔨 Your Build!', {
        fontSize: '34px', fontFamily: FONT, color: '#5a3d1a', stroke: '#fff7e6', strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(cy);
    // Tap the plot (or its label) to open Build Mode — walk into range first.
    for (const target of [pad, label]) {
      target.setInteractive({ useHandCursor: true });
      target.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (isUiOpen()) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy) <= 320) {
          void openBuild(this.services);
        } else {
          this.moveTarget = { x: cx, y: cy + h / 2 };
          this.pending = { x: cx, y: cy, radius: 340, cb: () => void openBuild(this.services) };
        }
      });
    }
    this.renderBuild();
  }

  /** Turn each block's procedural pixel-art canvas into a crisp Phaser texture. */
  private registerBlockTextures(): void {
    for (const id of [...allBlocks().map((b) => b.id), 'grass']) {
      const key = `blk_${id}`;
      if (this.textures.exists(key)) continue;
      this.textures.addCanvas(key, blockTextureCanvas(id));
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  /** Pixel-art world props (house, stall, tree, sign, coop) under the same
   *  texture keys the PNG sprites used — so the world looks blocky end to end. */
  private registerPropTextures(): void {
    for (const key of PIXEL_PROP_KEYS) {
      if (this.textures.exists(key)) continue;
      this.textures.addCanvas(key, propTextureCanvas(key));
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  /** Redraw the child's placed blocks as pixel-art tiles in the world plot. */
  renderBuild(): void {
    for (const t of this.buildTiles) t.destroy();
    this.buildTiles = [];
    const build = this.services.save.build;
    for (const key of Object.keys(build)) {
      const [cs, rs] = key.split(',');
      const c = Number(cs);
      const r = Number(rs);
      if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
      const texKey = `blk_${build[key]}`;
      if (!this.textures.exists(texKey)) continue;
      const x = BUILD_ORIGIN.x + c * BUILD_TILE;
      const y = BUILD_ORIGIN.y + r * BUILD_TILE;
      const tile = this.add.image(x, y, texKey).setDisplaySize(BUILD_TILE, BUILD_TILE).setOrigin(0.5).setDepth(y);
      this.buildTiles.push(tile);
    }
  }

  /** Test/facilitator hook: how many build tiles are currently shown. */
  buildTileCount(): number {
    return this.buildTiles.length;
  }

  // ── Build Where You Stand (Phase 2.2) ─────────────────────────────────────
  /** Redraw every block the child has laid in the world (persisted across
   *  sessions). Each block sits just below entity depth so the player and
   *  dragon trot in front of / "inside" the build. */
  renderWorldBuild(): void {
    for (const img of this.worldBuildTiles.values()) img.destroy();
    this.worldBuildTiles.clear();
    const build = this.services.save.worldBuild ?? {};
    for (const key of Object.keys(build)) {
      const [txs, tys] = key.split(',');
      const tx = Number(txs);
      const ty = Number(tys);
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
      this.paintWorldTile(tx, ty, build[key]!);
    }
  }

  private paintWorldTile(tx: number, ty: number, id: string): void {
    const key = `${tx},${ty}`;
    this.worldBuildTiles.get(key)?.destroy();
    const texKey = `blk_${id}`;
    if (!this.textures.exists(texKey)) return;
    const x = tx * WORLD_TILE + WORLD_TILE / 2;
    const y = ty * WORLD_TILE + WORLD_TILE / 2;
    const img = this.add.image(x, y, texKey).setDisplaySize(WORLD_TILE, WORLD_TILE).setDepth(y - 6);
    // Blocks that DO things (Phase 3.4): a bed/sun tile is tappable to read its
    // command. Guarded so a tap while building still places instead.
    if (id in INTERACTIVE_BLOCKS) {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        if (this.placing || isUiOpen()) return;
        event.stopPropagation();
        this.director.onInteractiveBlock(id);
      });
    }
    this.worldBuildTiles.set(key, img);
  }

  /** Test/facilitator hook: how many world-build blocks are laid. */
  worldBuildCount(): number {
    return this.worldBuildTiles.size;
  }

  // ── Blueprint Quests (Phase 2.3) ──────────────────────────────────────────
  private bpGhosts = new Map<number, Phaser.GameObjects.GameObject[]>();

  private setupBlueprintTable(): void {
    const x = 940;
    const y = 900;
    const table = this.prop('sign', x, y, 70, 96, { solid: false });
    table.setDepth(y);
    this.add.text(x, y - 20, 'PLANS', { fontFamily: FONT, fontSize: '16px', fontStyle: '900', color: '#5b4632' }).setOrigin(0.5).setDepth(y + 1);
    this.add.text(x, y - 56, '📋', { fontSize: '26px' }).setOrigin(0.5).setDepth(y + 1);
    this.tappable(table, () => this.director.onBlueprintTableTapped(), 190);
    this.marker('blueprint', x, y - 86);
  }

  /** Draw the active plan: unfilled cells as faint ghost blocks you can tap,
   *  filled cells already solid. */
  private renderBlueprint(): void {
    for (const objs of this.bpGhosts.values()) objs.forEach((o) => o.destroy());
    this.bpGhosts.clear();
    const bp = this.services.save.blueprint;
    if (!bp) return;
    const def = blueprintById(bp.id);
    if (!def) return;
    const texKey = `blk_${def.block}`;
    def.shape.forEach(([dx, dy], i) => {
      const tx = def.origin[0] + dx;
      const ty = def.origin[1] + dy;
      const cx = tx * WORLD_TILE + WORLD_TILE / 2;
      const cy = ty * WORLD_TILE + WORLD_TILE / 2;
      if (bp.filled[i]) {
        this.paintWorldTile(tx, ty, def.block);
        return;
      }
      const objs: Phaser.GameObjects.GameObject[] = [];
      if (this.textures.exists(texKey)) {
        objs.push(this.add.image(cx, cy, texKey).setDisplaySize(WORLD_TILE, WORLD_TILE).setAlpha(0.28).setDepth(cy - 7));
      }
      objs.push(this.add.rectangle(cx, cy, WORLD_TILE - 4, WORLD_TILE - 4).setStrokeStyle(2, 0xffffff, 0.6).setDepth(cy - 6));
      const hit = this.add.rectangle(cx, cy, WORLD_TILE, WORLD_TILE, 0xffffff, 0.001).setDepth(cy - 5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (isUiOpen()) return;
        this.director.onBlueprintCellTapped(i);
      });
      objs.push(hit);
      this.bpGhosts.set(i, objs);
    });
  }

  private fillBlueprintCell(index: number): void {
    const bp = this.services.save.blueprint;
    if (!bp) return;
    const def = blueprintById(bp.id);
    if (!def) return;
    const off = def.shape[index];
    if (!off) return;
    const tx = def.origin[0] + off[0];
    const ty = def.origin[1] + off[1];
    this.bpGhosts.get(index)?.forEach((o) => o.destroy());
    this.bpGhosts.delete(index);
    this.paintWorldTile(tx, ty, def.block);
    this.pulseAt(tx * WORLD_TILE + WORLD_TILE / 2, ty * WORLD_TILE + WORLD_TILE / 2);
    sfxPlace();
  }

  /** The plan snaps together: a poof of sparkles + a baby to live in it. */
  private finishBlueprint(id: string, pet: string): void {
    const def = blueprintById(id);
    if (!def) return;
    let sx = 0;
    let sy = 0;
    for (const [dx, dy] of def.shape) {
      sx += def.origin[0] + dx;
      sy += def.origin[1] + dy;
    }
    const n = def.shape.length || 1;
    const cx = (sx / n) * WORLD_TILE + WORLD_TILE / 2;
    const cy = (sy / n) * WORLD_TILE + WORLD_TILE / 2;
    for (let i = 0; i < 10; i++) {
      const s = this.add.text(cx, cy, '✨', { fontSize: '22px' }).setOrigin(0.5).setDepth(9500);
      this.tweens.add({
        targets: s,
        x: cx + Phaser.Math.Between(-90, 90),
        y: cy - Phaser.Math.Between(30, 120),
        alpha: 0,
        duration: 900,
        onComplete: () => s.destroy(),
      });
    }
    if (!reducedMotion()) this.cameras.main.shake(200, 0.004);
    this.spawnBaby(pet, cx + Phaser.Math.Between(-30, 30), cy + 44);
    sfxChirp();
  }

  // ── Word-Gates → new biomes (Phase 3.1) ───────────────────────────────────
  private gateWalls = new Map<string, Phaser.GameObjects.GameObject[]>();

  private buildGates(): void {
    const stone = 0x8a7f74;
    for (const g of GATES) {
      const opened = (this.services.save.gatesOpened ?? []).includes(g.id);
      if (opened) {
        this.paintBiome(g);
      } else {
        // A sliver of the land beyond, glimpsed through the wall.
        this.add.ellipse(g.x + 70, g.y, 120, 200, g.tint, 0.5).setDepth(g.y - 40);
      }
      // The archway (permanent pixel-stone frame).
      this.add.rectangle(g.x - 46, g.y, 24, 150, stone).setDepth(g.y + 1);
      this.add.rectangle(g.x + 46, g.y, 24, 150, stone).setDepth(g.y + 1);
      this.add.rectangle(g.x, g.y - 80, 130, 24, stone).setDepth(g.y + 1);

      const objs: Phaser.GameObjects.GameObject[] = [];
      if (!opened) {
        const wall = this.add.rectangle(g.x, g.y, 74, 150, g.tint, 0.92).setDepth(g.y);
        wall.setStrokeStyle(2, 0xffffff, 0.4);
        const word = this.add
          .text(g.x, g.y, g.word.toUpperCase(), { fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: '#3a2f1a' })
          .setOrigin(0.5)
          .setDepth(g.y + 2);
        this.tweens.add({ targets: wall, alpha: { from: 0.92, to: 0.6 }, duration: 950, yoyo: true, repeat: -1 });
        objs.push(wall, word);
      }
      this.gateWalls.set(g.id, objs);

      const hit = this.add.rectangle(g.x, g.y, 140, 180, 0xffffff, 0.001).setDepth(g.y + 3);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        if (this.placing || isUiOpen()) return;
        event.stopPropagation();
        this.director.onGateTapped(g.id);
      });
      this.marker(`gate_${g.id}`, g.x, g.y - 104);
    }
  }

  /** Paint the land beyond an opened gate: a tinted ground patch, a name sign,
   *  and a couple of Say-to-Mine gather nodes (decodable at the gate's tier). */
  private paintBiome(g: GateDef): void {
    this.add.ellipse(g.x - 30, g.y, 320, 280, g.tint, 0.55).setDepth(-60);
    this.gatherableTree(g.x - 130, g.y - 40);
    this.gatherableRock(g.x - 96, g.y + 66);
    this.add
      .text(g.x - 30, g.y - 122, g.biome, { fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: '#2f2718', backgroundColor: 'rgba(255,255,255,0.7)' })
      .setOrigin(0.5)
      .setPadding(4, 2, 4, 2)
      .setDepth(g.y);
  }

  private openGate(id: string): void {
    const g = gateById(id);
    if (!g) return;
    const objs = this.gateWalls.get(id) ?? [];
    for (const o of objs) this.tweens.add({ targets: o, alpha: 0, duration: 700, onComplete: () => o.destroy() });
    this.gateWalls.set(id, []);
    if (!reducedMotion()) this.cameras.main.shake(420, 0.006);
    this.time.delayedCall(reducedMotion() ? 120 : 500, () => {
      this.paintBiome(g);
      this.revealObjective({ x: g.x - 60, y: g.y }); // pan out over the new land
    });
  }

  /** Test/facilitator hook: how many biomes are open. */
  gatesOpenCount(): number {
    return (this.services.save.gatesOpened ?? []).length;
  }

  // ── The Mine + Pick Ladder (Phase 3.2) ────────────────────────────────────
  private mineSeams = new Map<string, Phaser.GameObjects.Sprite>();

  private buildMine(): void {
    // Mine-mouth backdrop + the forge toolbench.
    this.add.ellipse(TOOLBENCH.x + 110, TOOLBENCH.y - 110, 220, 150, 0x2c2540, 0.45).setDepth(-70);
    const bench = this.prop('stall', TOOLBENCH.x, TOOLBENCH.y, 118, 108, { tint: 0x9a7b52, solid: false });
    this.add
      .text(TOOLBENCH.x, TOOLBENCH.y - 64, '⛏️ FORGE', { fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: '#3a2f1a', backgroundColor: 'rgba(255,255,255,0.6)' })
      .setOrigin(0.5)
      .setPadding(4, 2, 4, 2)
      .setDepth(TOOLBENCH.y);
    this.tappable(bench, () => this.director.onToolbenchTapped(), 200);
    this.marker('toolbench', TOOLBENCH.x, TOOLBENCH.y - 92);

    for (const s of MINE_SEAMS) this.renderSeam(s);
  }

  private renderSeam(s: Seam): void {
    if (!seamVisible(this.services, s)) return; // only surfaces once its material is readable
    const rock = this.prop('rock', s.x, s.y, 94, 68);
    const gem = this.add.circle(s.x, s.y - 6, 12, s.tint, 1).setStrokeStyle(2, 0xffffff, 0.55).setDepth(s.y + 1);
    this.tweens.add({ targets: gem, alpha: { from: 1, to: 0.5 }, duration: 900, yoyo: true, repeat: -1 });
    this.mineSeams.set(s.id, rock);
    let cd = 0;
    this.tappable(rock, () => {
      if (this.time.now < cd) return;
      cd = this.time.now + 900;
      this.director.onSeamTapped(s.id);
    });
    this.marker(`seam_${s.id}`, s.x, s.y - 62);
  }

  private crackSeam(id: string): void {
    const rock = this.mineSeams.get(id);
    if (rock) this.bounce(rock);
    const s = seamById(id);
    if (s) {
      for (let i = 0; i < 5; i++) {
        const p = this.add.text(s.x, s.y, '✨', { fontSize: '16px' }).setOrigin(0.5).setDepth(9500);
        this.tweens.add({ targets: p, x: s.x + Phaser.Math.Between(-42, 42), y: s.y - Phaser.Math.Between(20, 64), alpha: 0, duration: 640, onComplete: () => p.destroy() });
      }
    }
    sfxCrack();
  }

  private togglePlaceMode(): void {
    if (this.placing) this.exitPlaceMode();
    else this.enterPlaceMode();
  }

  private enterPlaceMode(): void {
    if (this.placing) return;
    this.placing = true;
    this.moveTarget = null;
    this.pending = null;
    this.autoWalking = false;
    this.cancelCinematic();
    // Faint tile grid over the buildable overworld.
    const g = this.add.graphics().setDepth(8000);
    g.lineStyle(1, 0xffffff, 0.16);
    for (let x = 0; x <= W; x += WORLD_TILE) g.lineBetween(x, 0, x, BUILD_MAX_Y);
    for (let y = 0; y <= BUILD_MAX_Y; y += WORLD_TILE) g.lineBetween(0, y, W, y);
    this.placeGrid = g;
    this.placeCursor = this.add
      .rectangle(0, 0, WORLD_TILE, WORLD_TILE, 0xffffff, 0.18)
      .setStrokeStyle(3, 0xffe08a, 0.9)
      .setDepth(9000)
      .setVisible(false);
    this.placeBlockId = firstWorldBlock(this.services);
    this.worldPalette = openWorldPalette(this.services, {
      onSelect: (id) => (this.placeBlockId = id),
      onDone: () => this.exitPlaceMode(),
    });
    floatNote('🧱 Build! Tap the grass.', window.innerWidth / 2, 96);
    this.services.analytics.log('worldbuild_opened', { placed: Object.keys(this.services.save.worldBuild ?? {}).length });
  }

  private exitPlaceMode(): void {
    if (!this.placing) return;
    this.placing = false;
    this.placeGrid?.destroy();
    this.placeGrid = null;
    this.placeCursor?.destroy();
    this.placeCursor = null;
    this.worldPalette?.close();
    this.worldPalette = null;
    this.services.persist();
    void checkDeeds(this.services); // laying blocks may have earned a Builder deed
  }

  private updatePlaceCursor(p: Phaser.Input.Pointer): void {
    if (!this.placeCursor) return;
    const tx = Math.floor(p.worldX / WORLD_TILE);
    const ty = Math.floor(p.worldY / WORLD_TILE);
    const overBar = p.y > this.cameras.main.height - 104; // don't hover over the palette bar
    this.placeCursor
      .setPosition(tx * WORLD_TILE + WORLD_TILE / 2, ty * WORLD_TILE + WORLD_TILE / 2)
      .setVisible(!overBar && this.inBuildableTile(tx, ty));
  }

  private inBuildableTile(tx: number, ty: number): boolean {
    return tx >= 0 && (tx + 1) * WORLD_TILE <= W && ty >= 1 && (ty + 1) * WORLD_TILE <= BUILD_MAX_Y;
  }

  /** Lay (or erase) a block at the pointer — free finger-dragging, never gated. */
  private placeAtPointer(p: Phaser.Input.Pointer): void {
    if (p.y > this.cameras.main.height - 104) return; // tap landed on the palette bar
    const tx = Math.floor(p.worldX / WORLD_TILE);
    const ty = Math.floor(p.worldY / WORLD_TILE);
    if (!this.inBuildableTile(tx, ty)) return;
    const key = `${tx},${ty}`;
    const build = this.services.save.worldBuild;
    if (this.placeBlockId === WORLD_ERASER) {
      if (!(key in build)) return;
      delete build[key];
      this.worldBuildTiles.get(key)?.destroy();
      this.worldBuildTiles.delete(key);
      sfxShatter();
    } else {
      if (build[key] === this.placeBlockId) return; // already this block — no churn
      build[key] = this.placeBlockId;
      this.paintWorldTile(tx, ty, this.placeBlockId);
      this.services.save.buildPlaced += 1; // world placements count toward Builder rank
      sfxPlace();
    }
    this.services.persist();
  }

  private buildForest(): void {
    const trees: Array<[number, number]> = [
      [1400, 300], [1520, 720], [1660, 240], [1800, 880],
      [1960, 380], [2120, 940], [1470, 980],
    ];
    for (const [x, y] of trees) this.gatherableTree(x, y);

    for (const [x, y] of [[1620, 560], [2060, 680]] as Array<[number, number]>) {
      const rock = this.prop('rock', x, y, 92, 66);
      this.tappable(rock, () =>
        this.director.onRockTapped(() => {
          this.bounce(rock);
          floatNote('+1 🪨', window.innerWidth / 2, window.innerHeight / 2 - 60);
        }),
      );
    }

    // hunt spots
    const shed = this.prop('house', 1560, 400, 150, 120, { tint: 0xd8b48f });
    this.tappable(shed, () => this.director.onHuntSpotTapped('shed'), 190);
    this.sign('shed', 1655, 470, () => this.director.onHuntSpotTapped('shed'));
    this.marker('spot_shed', 1560, 320);

    const bigRock = this.prop('rock', 2150, 520, 150, 108);
    this.tappable(bigRock, () => this.director.onHuntSpotTapped('rock'), 190);
    this.sign('rock', 2245, 585, () => this.director.onHuntSpotTapped('rock'));
    this.marker('spot_rock', 2150, 445);

    const log = this.prop('log', 1880, 730, 132, 60);
    this.tappable(log, () => this.director.onHuntSpotTapped('log'), 190);
    this.sign('log', 1965, 795, () => this.director.onHuntSpotTapped('log'));
    this.marker('spot_log', 1880, 660);

    // cave mouth + wizard + door
    this.add.ellipse(2380, 300, 260, 210, 0x241f33).setDepth(180);
    const wizard = this.prop('wizard', 2255, 335, 66, 122, { solid: false });
    wizard.setDepth(400);
    this.tweens.add({ targets: wizard, y: 330, duration: 1100, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.tappable(wizard, () => this.director.onWizardTapped());
    this.marker('wizard', 2255, 250);

    this.doorGlow = this.add.circle(2380, 300, 66, 0x74c0ff, 0.35).setDepth(390);
    this.tweens.add({ targets: this.doorGlow, alpha: 0.12, duration: 900, yoyo: true, repeat: -1 });
    const door = this.obstacles.create(2380, 300, 'door') as Phaser.Physics.Arcade.Sprite;
    door.setDisplaySize(126, 136);
    door.body!.setSize(door.width * 0.8, door.height * 0.5);
    door.setDepth(391);
    this.door = door;
    this.tappable(door, () => {
      if (this.services.save.questStep > QuestStep.CAVE_DOOR) this.enterCave();
      else this.director.onWizardTapped();
    });
    this.marker('cave_enter', 2380, 205);
  }

  /** Once the door is gone, the open mouth itself must be tappable — a hidden
   *  sprite receives no input, which soft-locked the chest step. */
  private enableCaveEntrance(): void {
    if (this.caveEntrance) return;
    const zone = this.add.circle(2380, 305, 80, 0xffffff, 0.001).setDepth(392);
    this.caveEntrance = zone;
    this.tappable(zone as unknown as Phaser.GameObjects.Sprite, () => this.enterCave(), 190);
    const hint = this.add
      .text(2380, 296, '⬇', { fontSize: '42px', color: '#ffe08a' })
      .setOrigin(0.5)
      .setDepth(393);
    this.tweens.add({ targets: hint, y: 312, duration: 620, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  private buildCave(): void {
    this.add.rectangle(600, 1390, 900, 420, 0x241f33).setDepth(-95);
    this.add.rectangle(600, 1400, 760, 300, 0x39304f).setDepth(-94);
    for (let i = 0; i < 12; i++) {
      const x = 240 + i * 62;
      this.add.circle(x, 1250 + (i % 2) * 8, 26, 0x2c2540).setDepth(-93);
      this.add.circle(x, 1552 - (i % 2) * 8, 26, 0x2c2540).setDepth(-93);
    }

    this.chestGlow = this.add.circle(760, 1430, 54, 0xffd166, 0.35).setDepth(1400);
    this.tweens.add({ targets: this.chestGlow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
    this.chest = this.prop('chest', 760, 1430, 100, 86, { solid: false });
    this.chest.setDepth(1430);
    this.tappable(this.chest, () => this.director.onChestTapped());
    this.marker('chest', 760, 1360);

    const exit = this.add.circle(330, 1470, 34, 0xa5f3fc, 0.5).setDepth(1400);
    this.tweens.add({ targets: exit, alpha: 0.2, duration: 900, yoyo: true, repeat: -1 });
    const exitLabel = this.add
      .text(330, 1470, '⬆', { fontSize: '30px' })
      .setOrigin(0.5)
      .setDepth(1401);
    exitLabel.setInteractive({ useHandCursor: true });
    exit.setInteractive({ useHandCursor: true });
    const leave = (event?: Phaser.Types.Input.EventData) => {
      event?.stopPropagation?.();
      if (isUiOpen()) return;
      this.caveCooldownUntil = this.time.now + 1500; // no accidental instant re-entry
      this.teleport(this.caveReturn.x, this.caveReturn.y);
    };
    exit.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => leave(e));
    exitLabel.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => leave(e));
  }

  private gatherableTree(x: number, y: number): void {
    const tree = this.prop('tree', x, y, 132, 178);
    let cooldownUntil = 0;
    this.tappable(tree, () => {
      const now = this.time.now;
      if (now < cooldownUntil) return;
      cooldownUntil = now + 900;
      this.director.onTreeTapped(() => {
        this.bounce(tree);
        floatNote('+1 🪵', window.innerWidth / 2, window.innerHeight / 2 - 60);
      });
    });
  }

  private bounce(obj: Phaser.GameObjects.Sprite): void {
    this.tweens.add({ targets: obj, scaleX: obj.scaleX * 1.08, scaleY: obj.scaleY * 0.92, duration: 90, yoyo: true });
  }

  private gatherableRock(x: number, y: number): void {
    const rock = this.prop('rock', x, y, 88, 62);
    let cd = 0;
    this.tappable(rock, () => {
      if (this.time.now < cd) return;
      cd = this.time.now + 900;
      this.director.onRockTapped(() => {
        this.bounce(rock);
        floatNote('+1 🪨', window.innerWidth / 2, window.innerHeight / 2 - 60);
      });
    });
  }

  // Fill the wide-open east so free play always has a node over the next rise —
  // the fix for "there's nowhere to go". Every node is a Say-to-Mine reading rep,
  // and glinting caches are one-time reward reads. Free play only.
  private freeNodes: Array<{ x: number; y: number }> = [];
  private seedFreePlayNodes(): void {
    if (this.services.save.questStep !== QuestStep.FREE_PLAY) return;
    const trees: Array<[number, number]> = [
      [820, 260], [1080, 540], [900, 940], [1260, 300], [1340, 780],
      [2340, 760], [2200, 1000], [1720, 470], [2020, 180], [700, 420],
    ];
    for (const [x, y] of trees) this.gatherableTree(x, y);
    const rocks: Array<[number, number]> = [[720, 600], [1160, 780], [1980, 470], [2380, 900], [1500, 300]];
    for (const [x, y] of rocks) this.gatherableRock(x, y);
    for (const [x, y] of [...trees, ...rocks]) this.freeNodes.push({ x, y });

    const glints: Array<[string, number, number]> = [
      ['g1', 1300, 500], ['g2', 1900, 860], ['g3', 2400, 620],
      ['g4', 1050, 300], ['g5', 760, 880], ['g6', 1650, 980],
    ];
    for (const [id, x, y] of glints) this.glintCache(id, x, y);
  }

  private glintCache(id: string, x: number, y: number): void {
    if (this.services.save.glintsFound.includes(id)) return;
    const glow = this.add.circle(x, y, 20, 0xffe08a, 0.5).setDepth(y);
    const star = this.add.text(x, y, '✨', { fontSize: '30px' }).setOrigin(0.5).setDepth(y + 1);
    this.tweens.add({ targets: [glow, star], scale: { from: 0.85, to: 1.2 }, duration: 700, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.freeNodes.push({ x, y });
    const hit = this.add.circle(x, y, 46, 0xffffff, 0.001).setDepth(y + 2);
    this.tappable(
      hit as unknown as Phaser.GameObjects.Sprite,
      () =>
        this.director.onGlintTapped(id, () => {
          glow.destroy();
          star.destroy();
          hit.destroy();
          for (let i = 0; i < 3; i++) this.time.delayedCall(i * 90, () => this.pulseAt(x, y));
        }),
      150,
    );
  }

  /** Compass: answer "where do I go?" on demand. During the quest, reveal the
   *  scripted objective; in free play, beckon toward the nearest node/cache. */
  private showNext(): void {
    const target = this.director?.objectiveTarget() ?? null;
    if (target) {
      this.revealObjective(target);
      return;
    }
    this.freePlayOpener();
  }

  /** Free-play opener: beckon the child toward the nearest thing to do, so a
   *  session never starts on a blank slate ("nowhere to go"). */
  private freePlayOpener(): void {
    if (this.services.save.questStep !== QuestStep.FREE_PLAY || this.freeNodes.length === 0) return;
    let best = this.freeNodes[0]!;
    let bd = Infinity;
    for (const n of this.freeNodes) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d > 130 && d < bd) {
        bd = d;
        best = n;
      }
    }
    this.revealObjective(best);
  }

  // ── The Beacon: the reading journey as one object (Phase 4.2) ──────────────
  // A tall crystal on the northern hill. It lights one more ring per Reader
  // Level and per finished book — powered ONLY by reading — so "I got better at
  // reading" and "my tower grew" become the same visible event.
  private static readonly BEACON = { x: 1330, y: 300 };
  private static readonly BEACON_RINGS = 12;
  private beaconSegs: Phaser.GameObjects.Polygon[] = [];
  private beaconTip!: Phaser.GameObjects.Polygon;

  private buildBeacon(): void {
    const { x, y } = WorldScene.BEACON;
    // Hill + plinth.
    this.add.ellipse(x, y + 34, 260, 90, 0x6fae5a, 0.9).setDepth(y - 200);
    this.add.rectangle(x, y + 18, 78, 34, 0x8a8f98).setDepth(y - 199);
    // Stacked crystal segments, bottom → top. Each is a diamond; lit ones glow.
    const segH = 22;
    for (let i = 0; i < WorldScene.BEACON_RINGS; i++) {
      const sy = y - i * segH;
      const w = 30 - i * 0.8;
      const seg = this.add
        .polygon(x, sy, [0, -segH / 2, w / 2, 0, 0, segH / 2, -w / 2, 0], 0x2b3550)
        .setDepth(y - 198 + i);
      seg.setStrokeStyle(1.5, 0x14203a, 0.8);
      this.beaconSegs.push(seg);
    }
    // The crowning tip, shines when the whole beacon is lit.
    this.beaconTip = this.add
      .polygon(x, y - WorldScene.BEACON_RINGS * segH, [0, -20, 10, 6, -10, 6], 0x2b3550)
      .setDepth(y - 198 + WorldScene.BEACON_RINGS);
    // Tap the beacon for a proud read-out of the journey so far.
    const hit = this.add.rectangle(x, y - 120, 90, 320, 0xffffff, 0.001).setDepth(y + 2);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, event: Phaser.Types.Input.EventData) => {
      if (this.placing || isUiOpen()) return;
      event.stopPropagation();
      const rings = this.beaconRings();
      void this.services.speakText(
        rings <= 1 ? 'Your reading beacon! Read and finish books to light it up!' : `Your beacon has ${rings} rings of reading light!`,
      ).done;
      floatNote(`✨ ${rings} rings`, window.innerWidth / 2, window.innerHeight / 2 - 60);
    });
    this.updateBeacon(false); // restore lit state from the save (no celebration)
  }

  private beaconRings(): number {
    const lvl = readerLevel(this.services.save.taught).level;
    const books = this.services.save.booksRead?.length ?? 0;
    return Phaser.Math.Clamp(lvl + books, 0, WorldScene.BEACON_RINGS);
  }

  /** Repaint the beacon to its current ring count. When celebrateNew is set and
   *  the count has grown past what we last showed, shoot a light beam and bank
   *  the new high-water mark so each ring is celebrated exactly once. */
  private updateBeacon(celebrateNew: boolean): void {
    const lit = this.beaconRings();
    this.beaconSegs.forEach((seg, i) => {
      const on = i < lit;
      seg.setFillStyle(on ? 0x7ee0ff : 0x2b3550, 1);
      if (on) seg.setStrokeStyle(1.5, 0xffffff, 0.7);
    });
    const capped = lit >= WorldScene.BEACON_RINGS;
    this.beaconTip.setFillStyle(capped ? 0xfff2a8 : 0x2b3550, 1);
    if (celebrateNew && lit > (this.services.save.beaconLit ?? 0)) {
      this.beaconBeam();
      this.services.analytics.log('beacon_ring', { rings: lit });
    }
    this.services.save.beaconLit = Math.max(this.services.save.beaconLit ?? 0, lit);
    this.services.persist();
  }

  private beaconBeam(): void {
    if (reducedMotion()) return;
    const { x, y } = WorldScene.BEACON;
    const beam = this.add.rectangle(x, y - 150, 16, 600, 0xbdf0ff, 0.7).setDepth(9600).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, scaleX: 3, alpha: 0, duration: 900, ease: 'sine.out', onComplete: () => beam.destroy() });
  }

  /** Test/facilitator hook for the Beacon. */
  beaconInfo(): { rings: number; lit: number } {
    return { rings: this.beaconRings(), lit: this.services.save.beaconLit ?? 0 };
  }

  // ── The Waking Giant boss (Phase 4.2) ─────────────────────────────────────
  // A huge, snoring, mossy stone giant slumps out south-east, blocking a path to
  // fresh land. He appears at Reader Level 3. Tap him and he raises a word-shield
  // — read it and it shatters; three shields and he yawns, stands, thanks you,
  // and stomps aside to reveal new land. Fully non-violent.
  private static readonly GIANT = { x: 2430, y: 1320 };
  private static readonly GIANT_LEVEL = 3;
  private giant?: Phaser.GameObjects.Container;
  private giantZzz?: Phaser.GameObjects.Text;
  private giantPips: Phaser.GameObjects.Arc[] = [];

  private buildGiant(): void {
    if (readerLevel(this.services.save.taught).level < WorldScene.GIANT_LEVEL) return;
    const { x, y } = WorldScene.GIANT;
    if (this.services.save.giantDefeated) {
      this.paintGiantLand(); // already beaten: the new land is simply here
      return;
    }
    const moss = 0x6b7f52;
    const stone = 0x8f8a7e;
    const c = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, 150, 140, stone).setStrokeStyle(4, 0x5c5849);
    body.setData('base', stone);
    const head = this.add.rectangle(0, -104, 96, 84, stone).setStrokeStyle(4, 0x5c5849);
    const mossCap = this.add.ellipse(0, -140, 104, 40, moss, 0.95);
    // Sleepy closed eyes + mouth.
    const eyeL = this.add.rectangle(-22, -108, 22, 6, 0x2f2a22);
    const eyeR = this.add.rectangle(22, -108, 22, 6, 0x2f2a22);
    const mouth = this.add.ellipse(0, -84, 26, 14, 0x2f2a22, 0.85);
    const armL = this.add.rectangle(-96, 6, 42, 96, stone).setStrokeStyle(4, 0x5c5849);
    const armR = this.add.rectangle(96, 6, 42, 96, stone).setStrokeStyle(4, 0x5c5849);
    c.add([armL, armR, body, mossCap, head, eyeL, eyeR, mouth]);
    c.setDepth(y);
    this.giant = c;
    if (!reducedMotion()) {
      this.tweens.add({ targets: c, y: y - 6, duration: 1800, yoyo: true, repeat: -1, ease: 'sine.inOut' }); // breathing
    }
    this.giantZzz = this.add.text(x + 70, y - 150, '💤', { fontSize: '30px' }).setOrigin(0.5).setDepth(y + 1);
    this.tweens.add({ targets: this.giantZzz, y: y - 190, alpha: { from: 0.9, to: 0.2 }, duration: 2200, repeat: -1 });
    // Three shield pips showing progress.
    for (let i = 0; i < 3; i++) {
      const done = i < (this.services.save.giantShields ?? 0);
      const pip = this.add.circle(x - 30 + i * 30, y - 200, 9, done ? 0xffd166 : 0x5c5849).setStrokeStyle(2, 0x3a2f1a).setDepth(y + 2);
      this.giantPips.push(pip);
    }
    const hit = this.add.rectangle(x, y - 40, 200, 260, 0xffffff, 0.001).setDepth(y + 3);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, event: Phaser.Types.Input.EventData) => {
      if (this.placing || isUiOpen()) return;
      event.stopPropagation();
      this.director.onGiantTapped();
    });
  }

  /** A shield shatters: shard burst + a pip lights. On the third, the caller
   *  follows with giantStandAside(). */
  private shatterGiantShield(count: number): void {
    const { x, y } = WorldScene.GIANT;
    sfxShatter();
    if (!reducedMotion()) {
      this.cameras.main.shake(240, 0.004);
      for (let i = 0; i < 8; i++) {
        const shard = this.add.rectangle(x, y - 60, 12, 12, 0x9fd0ff).setDepth(9600);
        this.tweens.add({ targets: shard, x: x + Phaser.Math.Between(-90, 90), y: y - 60 - Phaser.Math.Between(10, 90), angle: Phaser.Math.Between(-180, 180), alpha: 0, duration: 620, onComplete: () => shard.destroy() });
      }
    }
    const pip = this.giantPips[count - 1];
    if (pip) pip.setFillStyle(0xffd166, 1);
  }

  /** The giant wakes, stands, and stomps aside — revealing the land beyond. */
  private giantStandAside(): void {
    const { x, y } = WorldScene.GIANT;
    this.giantZzz?.destroy();
    if (this.giant) {
      const g = this.giant;
      this.tweens.add({ targets: g, y: y - 40, duration: 500, yoyo: true, ease: 'sine.inOut' }); // a big yawn-stretch
      this.time.delayedCall(reducedMotion() ? 120 : 700, () => {
        this.tweens.add({ targets: g, x: x + 460, alpha: 0, duration: reducedMotion() ? 200 : 1300, ease: 'sine.in', onComplete: () => g.destroy() });
      });
    }
    if (!reducedMotion()) this.cameras.main.shake(500, 0.008);
    this.time.delayedCall(reducedMotion() ? 200 : 900, () => {
      this.paintGiantLand();
      this.revealObjective({ x: x + 120, y });
    });
  }

  /** The fresh land the giant was blocking: a bright glade with a gather node. */
  private paintGiantLand(): void {
    const { x, y } = WorldScene.GIANT;
    this.add.ellipse(x + 180, y, 360, 300, 0xbfe8a0, 0.6).setDepth(-60);
    this.add
      .text(x + 180, y - 130, 'Sunny Glade', { fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: '#2f2718', backgroundColor: 'rgba(255,255,255,0.7)' })
      .setOrigin(0.5)
      .setPadding(4, 2, 4, 2)
      .setDepth(y);
    this.gatherableTree(x + 120, y + 40);
    this.gatherableRock(x + 250, y + 70);
  }

  /** Test/facilitator hook for the giant. */
  giantInfo(): { defeated: boolean; shields: number; alive: boolean } {
    return { defeated: this.services.save.giantDefeated, shields: this.services.save.giantShields ?? 0, alive: !!this.giant && this.giant.active };
  }

  // ── The Furnace machine (Phase 4.1) ───────────────────────────────────────
  // The tech-tree capstone: a machine that smelts ore over TIME (a bar every
  // little while, up to a cap) that the child collects by reading a one-word
  // power switch ("run"). The machine only ever pays out because the child read
  // to start it — idle production, but reading is still the key that turns it.
  private static readonly FURNACE = { x: 1950, y: 600 };
  private static readonly FURNACE_CAP = 5;
  private static readonly FURNACE_TICK = 18000; // ms between smelted bars
  private furnaceLabel?: Phaser.GameObjects.Text;
  private furnaceGlow?: Phaser.GameObjects.Ellipse;

  private buildFurnace(): void {
    const { x, y } = WorldScene.FURNACE;
    this.add.ellipse(x, y + 30, 150, 60, 0x2c2540, 0.4).setDepth(-70);
    this.add.rectangle(x, y, 90, 96, 0x6f6a60).setStrokeStyle(4, 0x47433b).setDepth(y);
    this.add.rectangle(x, y - 58, 40, 30, 0x504b43).setDepth(y); // chimney
    this.furnaceGlow = this.add.ellipse(x, y + 14, 46, 34, 0xff8a3c, 0.85).setDepth(y + 1); // mouth fire
    this.add.rectangle(x, y + 14, 50, 40, 0x000000, 0.001).setDepth(y + 1);
    this.furnaceLabel = this.add
      .text(x, y - 92, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '900', color: '#ffd166', stroke: '#5a3a00', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(y + 2);
    const hit = this.add.rectangle(x, y - 10, 120, 150, 0xffffff, 0.001).setDepth(y + 3);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, event: Phaser.Types.Input.EventData) => {
      if (this.placing || isUiOpen()) return;
      event.stopPropagation();
      this.director.onFurnaceTapped();
    });
    // Smelt a bar every tick, up to the cap — only during free play.
    this.time.addEvent({ delay: WorldScene.FURNACE_TICK, loop: true, callback: () => this.furnaceTick() });
    this.refreshFurnace();
  }

  private furnaceTick(): void {
    if (this.services.save.questStep !== QuestStep.FREE_PLAY) return;
    const c = this.services.save.furnaceCharge ?? 0;
    if (c >= WorldScene.FURNACE_CAP) return;
    this.services.save.furnaceCharge = c + 1;
    this.services.persist();
    this.refreshFurnace();
  }

  private refreshFurnace(): void {
    const c = this.services.save.furnaceCharge ?? 0;
    this.furnaceLabel?.setText(c > 0 ? `🔥 ${c}` : '');
    this.furnaceGlow?.setFillStyle(0xff8a3c, 0.55 + Math.min(0.4, c * 0.09));
  }

  /** Test/facilitator hook for the furnace machine. */
  furnaceInfo(): { charge: number } {
    return { charge: this.services.save.furnaceCharge ?? 0 };
  }

  // ── Player + dragon ───────────────────────────────────────────────────────
  private spawnPlayerAndDragon(): void {
    const avatarKey = `avatar_${this.services.save.avatar ?? 0}`;
    this.player = this.physics.add.sprite(620, 700, avatarKey);
    const scale = 92 / this.player.height;
    this.player.setScale(scale);
    this.player.body!.setSize(this.player.width * 0.5, this.player.height * 0.3);
    this.player.body!.setOffset(this.player.width * 0.25, this.player.height * 0.65);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.obstacles);

    this.dragon = this.add.sprite(560, 730, 'dragon');
    this.dragon.setScale(64 / this.dragon.height);
    const tint = DRAGON_TINTS[this.services.save.dragonName ?? 'chip'];
    if (tint) this.dragon.setTint(tint);
    this.tweens.add({ targets: this.dragon, displayOriginY: this.dragon.displayOriginY + 3, duration: 700, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.tappable(this.dragon, () => this.director.onDragonTapped(), 200);
    // Restore raised-dragon visuals: size + horns/wings from feeding, plus any
    // colour the child "dressed" it in on an earlier day.
    this.updateDragonStage();
    if (this.services.save.dragonColor) this.applyDragonColor(this.services.save.dragonColor);
  }

  // ── Raise & dress your dragon (Phase 4.3) ─────────────────────────────────
  // Feeding (a reading rep) grows dragonXp; at thresholds the dragon visibly
  // grows a stage — bigger, then horned, then winged — and the child reads a
  // colour word to recolour it. All procedural: shapes drawn over the sprite.
  private static readonly DRAGON_COLOR_HEX: Record<string, number> = {
    red: 0xff6b6b,
    tan: 0xd8b48f,
    green: 0x8fdc8f,
  };

  private dragonStage(): number {
    const xp = this.services.save.dragonXp;
    return xp >= 18 ? 2 : xp >= 6 ? 1 : 0;
  }

  /** Size the dragon for its current level + growth stage and (re)build the
   *  horn/wing rig. Safe to call any time — it's the single source of truth for
   *  how big the dragon is, so level-ups and stage-ups can't fight each other. */
  private updateDragonStage(): void {
    const base = 64 / this.dragon.height;
    const lvl = this.services.save.dragonLevel;
    const stage = this.dragonStage();
    this.dragon.setScale(base * (1 + lvl * 0.09) * (1 + stage * 0.24));
    this.rebuildDragonRig(stage);
  }

  /** Draw horns (stage ≥ 1) and wings (stage ≥ 2) into a container that rides
   *  the dragon each frame. Drawn in 64px display space; the update loop scales
   *  it to the dragon's real display height so it always fits. */
  private rebuildDragonRig(stage: number): void {
    this.dragonRig?.destroy();
    this.dragonRig = undefined;
    if (stage < 1) return;
    const g = this.add.graphics();
    // Horns: two short amber spikes rising off the head.
    g.fillStyle(0xf4e1b0, 1);
    g.lineStyle(2, 0x8a6a2a, 1);
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(dir * 5, -25);
      g.lineTo(dir * 12, -25);
      g.lineTo(dir * 9, -40);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
    if (stage >= 2) {
      // Wings: membrane triangles sweeping off the back.
      g.fillStyle(0xffd9a0, 0.95);
      g.lineStyle(2, 0x8a6a2a, 1);
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(dir * 6, -8);
        g.lineTo(dir * 36, -24);
        g.lineTo(dir * 32, 8);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
    const rig = this.add.container(this.dragon.x, this.dragon.y, [g]);
    rig.setDepth(this.dragon.y + 1);
    this.dragonRig = rig;
  }

  applyDragonColor(word: string): void {
    const hex = WorldScene.DRAGON_COLOR_HEX[word.toLowerCase()];
    if (hex === undefined) return;
    this.dragon.setTint(hex);
  }

  // Ambient life: a few hens amble around the meadow so the world feels alive
  // (Minecraft passive mobs). Free play only, so they never muddle the hunt.
  private spawnCritters(): void {
    if (this.services.save.questStep !== QuestStep.FREE_PLAY) return;
    for (const [x, y] of [[320, 300], [980, 760], [1180, 900], [500, 1010], [860, 470]] as Array<[number, number]>) {
      const c = this.add.sprite(x, y, 'hen').setDepth(y);
      c.setScale(42 / c.height);
      if (!reducedMotion()) this.tweens.add({ targets: c, y: `-=4`, duration: 640 + Phaser.Math.Between(0, 300), yoyo: true, repeat: -1, ease: 'sine.inOut' });
      this.wander(c);
    }
  }

  // First-run coach: the one thing a pre-reader can't be told in words — tap the
  // ground to walk. A pulsing 👆 by the avatar, cleared the instant they first
  // move, shown once ever (only to a brand-new player in the scripted intro).
  private maybeStartCoach(): void {
    if (this.services.save.coachDone || this.services.save.questStep !== QuestStep.INTRO_SIGNS) return;
    const hand = this.add.container(this.player.x + 44, this.player.y + 66);
    const finger = this.add.text(0, 0, '👆', { fontSize: '40px' }).setOrigin(0.5);
    const label = this.add
      .text(0, 40, 'Tap to walk!', { fontFamily: FONT, fontSize: '20px', fontStyle: '900', color: '#ffffff', stroke: '#3a2f1a', strokeThickness: 5 })
      .setOrigin(0.5);
    hand.add([finger, label]);
    hand.setDepth(9500);
    if (!reducedMotion()) {
      this.tweens.add({ targets: hand, y: hand.y + 12, duration: 620, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    this.coachHand = hand;
  }

  private clearCoach(): void {
    if (!this.coachHand) return;
    const h = this.coachHand;
    this.coachHand = undefined;
    this.tweens.add({ targets: h, alpha: 0, duration: 300, onComplete: () => h.destroy() });
    if (!this.services.save.coachDone) {
      this.services.save.coachDone = true;
      this.services.persist();
    }
  }

  private wander(c: Phaser.GameObjects.Sprite): void {
    if (reducedMotion()) return; // Calm Mode: ambient mobs hold still
    const nx = Phaser.Math.Clamp(c.x + Phaser.Math.Between(-170, 170), 120, W - 120);
    const ny = Phaser.Math.Clamp(c.y + Phaser.Math.Between(-110, 110), 220, 1060);
    c.setFlipX(nx < c.x);
    this.tweens.add({
      targets: c,
      x: nx,
      y: ny,
      duration: 2200 + Phaser.Math.Between(0, 2200),
      ease: 'sine.inOut',
      onUpdate: () => c.setDepth(c.y),
      onComplete: () => this.time.delayedCall(400 + Phaser.Math.Between(0, 2200), () => c.active && this.wander(c)),
    });
  }

  // ── Eggs hatch into creatures (Phase 2.4) ─────────────────────────────────
  private babyEmoji: Record<string, string> = { chick: '🐤', pup: '🐶', cub: '🐻', kid: '🐐' };

  /** Respawn every baby the child has hatched — they live near the coop and
   *  amble around the meadow like the hens (the first living creatures). */
  private spawnPets(): void {
    const pets = this.services.save.pets ?? [];
    pets.forEach((sp, i) => {
      const x = 380 + (i % 6) * 42 + Phaser.Math.Between(-14, 14);
      const y = 980 + Math.floor(i / 6) * 34 + Phaser.Math.Between(-12, 12);
      this.spawnBaby(sp, x, y);
    });
  }

  private babies: Phaser.GameObjects.Text[] = [];
  private spawnBaby(species: string, x: number, y: number): void {
    const emoji = this.babyEmoji[species] ?? '🐤';
    const baby = this.add.text(x, y, emoji, { fontSize: '30px' }).setOrigin(0.5).setDepth(y);
    if (!reducedMotion()) this.tweens.add({ targets: baby, y: y - 4, duration: 560 + Phaser.Math.Between(0, 300), yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.babies.push(baby);
    this.wanderBaby(baby);
  }

  /** Test/facilitator hook: how many hatched babies are alive in the world. */
  petCount(): number {
    return this.babies.length;
  }

  private wanderBaby(c: Phaser.GameObjects.Text): void {
    if (reducedMotion()) return; // Calm Mode: pets hold still
    const nx = Phaser.Math.Clamp(c.x + Phaser.Math.Between(-130, 130), 120, W - 120);
    const ny = Phaser.Math.Clamp(c.y + Phaser.Math.Between(-90, 90), 260, 1080);
    c.setFlipX(nx < c.x);
    this.tweens.add({
      targets: c,
      x: nx,
      y: ny,
      duration: 2600 + Phaser.Math.Between(0, 2400),
      ease: 'sine.inOut',
      onUpdate: () => c.setDepth(c.y),
      onComplete: () => this.time.delayedCall(600 + Phaser.Math.Between(0, 2400), () => c.active && this.wanderBaby(c)),
    });
  }

  // ── Word Loot (Phase 4.5): read a word → its thing appears in the world ─────
  private summonSprites: Phaser.GameObjects.Text[] = [];
  private static SUMMON_MAX = 40; // creative freedom, but keep the plot from drowning

  /** Summon a read word's thing at the player's feet, remember it, and pop it in.
   *  Reading the word (in the bag) IS the summon — this just makes it real. */
  private summonThing(word: string): void {
    const def = summonableByWord(word);
    if (!def) return;
    if (this.summonSprites.length >= WorldScene.SUMMON_MAX) {
      const oldest = this.summonSprites.shift();
      oldest?.destroy();
      this.services.save.summoned.shift();
    }
    const x = Phaser.Math.Clamp(this.player.x + (this.player.flipX ? -70 : 70), 120, W - 120);
    const y = Phaser.Math.Clamp(this.player.y + 26, 260, H - 120);
    this.placeSummon(def, x, y, true);
    this.services.save.summoned.push({ w: word, x, y });
    this.services.persist();
    this.services.analytics.log('word_summoned', { word, kind: def.mob ? 'mob' : 'prop' });
    floatNote(`${def.emoji} ${word.toUpperCase()}!`, window.innerWidth / 2, window.innerHeight / 2 - 70);
  }

  /** Draw one summoned thing. Mobs wander (reusing the baby wander); props sit
   *  and bob. New summons pop in with a squash; restored ones just appear. */
  private placeSummon(def: Summonable, x: number, y: number, fresh: boolean): void {
    const t = this.add.text(x, y, def.emoji, { fontSize: '34px' }).setOrigin(0.5).setDepth(y);
    this.summonSprites.push(t);
    if (fresh && !reducedMotion()) {
      t.setScale(0.2);
      this.tweens.add({ targets: t, scale: 1, duration: 280, ease: 'back.out' });
      sfxPlace();
    }
    if (def.mob) {
      this.wanderBaby(t); // creatures roam like hatched babies
    } else {
      this.tweens.add({ targets: t, y: y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  }

  private restoreSummoned(): void {
    for (const it of this.services.save.summoned ?? []) {
      const def = summonableByWord(it.w);
      if (def) this.placeSummon(def, it.x, it.y, false);
    }
  }

  /** Test/facilitator hook: how many summoned things are alive in the world. */
  summonCount(): number {
    return this.summonSprites.length;
  }

  /** Test/facilitator hook: is the first-run "tap to walk" coach on screen? */
  coachActive(): boolean {
    return !!this.coachHand;
  }

  /** The hatch moment: an egg at the coop shudders, cracks open in a burst of
   *  shell, and a procedural baby pops out with a squeaky chirp. */
  private hatchBaby(species: string): void {
    const nx = 445 + Phaser.Math.Between(-40, 40);
    const ny = 980;
    const egg = this.add.image(nx, ny, 'egg').setDepth(9000).setScale(1.1);
    if (!reducedMotion()) {
      this.tweens.add({ targets: egg, angle: { from: -9, to: 9 }, duration: 70, yoyo: true, repeat: 5 });
    }
    this.time.delayedCall(reducedMotion() ? 120 : 520, () => {
      egg.destroy();
      for (let i = 0; i < 7; i++) {
        const shell = this.add.text(nx, ny, '🥚', { fontSize: '14px' }).setOrigin(0.5).setDepth(9001);
        this.tweens.add({
          targets: shell,
          x: nx + Phaser.Math.Between(-56, 56),
          y: ny - Phaser.Math.Between(20, 78),
          alpha: 0,
          duration: 650,
          onComplete: () => shell.destroy(),
        });
      }
      this.spawnBaby(species, nx, ny);
      sfxChirp();
      this.dragonCelebrateAnim(false);
    });
  }

  // ── The world breathes: day → night (Phase 3.5) ───────────────────────────
  // Keyframes over one cycle (t in 0..1): dawn → clear day → amber dusk → soft
  // starry night (never scary-black) → back to dawn.
  private static DAY_KEYS: Array<{ t: number; c: number; a: number }> = [
    { t: 0.0, c: 0xffb26b, a: 0.16 },
    { t: 0.12, c: 0xffffff, a: 0.0 },
    { t: 0.48, c: 0xffffff, a: 0.0 },
    { t: 0.62, c: 0xff8c42, a: 0.22 },
    { t: 0.75, c: 0x1a2350, a: 0.44 },
    { t: 0.93, c: 0x232a55, a: 0.4 },
    { t: 1.0, c: 0xffb26b, a: 0.16 },
  ];
  private static CYCLE_MS = 240000; // a gentle ~4-minute day

  private dayPhase(): number {
    if (this.phaseOverride != null) return this.phaseOverride;
    return (this.time.now % WorldScene.CYCLE_MS) / WorldScene.CYCLE_MS;
  }

  private updateDayNight(): void {
    // The scripted intro stays bright and clear; the sky only turns in free play.
    if (this.services.save.questStep !== QuestStep.FREE_PLAY) {
      if (this.dayTint.alpha !== 0) this.dayTint.setAlpha(0);
      if (this.fireflies.length) this.clearFireflies();
      return;
    }
    const p = this.dayPhase();
    const keys = WorldScene.DAY_KEYS;
    let k0 = keys[0]!;
    let k1 = keys[keys.length - 1]!;
    for (let i = 0; i < keys.length - 1; i++) {
      if (p >= keys[i]!.t && p <= keys[i + 1]!.t) {
        k0 = keys[i]!;
        k1 = keys[i + 1]!;
        break;
      }
    }
    const span = k1.t - k0.t || 1;
    const f = (p - k0.t) / span;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(k0.c),
      Phaser.Display.Color.IntegerToColor(k1.c),
      100,
      Math.round(f * 100),
    );
    this.dayTint.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).setAlpha(k0.a + (k1.a - k0.a) * f);

    const isNight = p >= 0.7 && p < 0.95;
    if (isNight !== this.wasNight) {
      this.wasNight = isNight;
      if (isNight) this.spawnFireflies();
      else this.clearFireflies();
    }
  }

  private spawnFireflies(): void {
    this.clearFireflies();
    const px = this.player?.x ?? 800;
    const py = this.player?.y ?? 700;
    for (let i = 0; i < 3; i++) {
      const x = Phaser.Math.Clamp(px + Phaser.Math.Between(-320, 320), 120, W - 120);
      const y = Phaser.Math.Clamp(py + Phaser.Math.Between(-220, 220), 220, 1060);
      const f = this.add.circle(x, y, 9, 0xfff2a0, 0.9).setDepth(9975);
      f.setStrokeStyle(7, 0xfff2a0, 0.25);
      if (!reducedMotion()) {
        this.tweens.add({ targets: f, alpha: { from: 0.9, to: 0.35 }, duration: 700 + Phaser.Math.Between(0, 400), yoyo: true, repeat: -1 });
      }
      this.driftFirefly(f);
      f.setInteractive({ useHandCursor: true });
      f.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (isUiOpen()) return;
        this.director.onFireflyTapped(() => {
          f.destroy();
          this.fireflies = this.fireflies.filter((x) => x !== f);
        });
      });
      this.fireflies.push(f);
    }
  }

  private driftFirefly(f: Phaser.GameObjects.Arc): void {
    const nx = Phaser.Math.Clamp(f.x + Phaser.Math.Between(-120, 120), 120, W - 120);
    const ny = Phaser.Math.Clamp(f.y + Phaser.Math.Between(-90, 90), 220, 1060);
    this.tweens.add({
      targets: f,
      x: nx,
      y: ny,
      duration: 2200 + Phaser.Math.Between(0, 1500),
      ease: 'sine.inOut',
      onComplete: () => f.active && this.driftFirefly(f),
    });
  }

  private clearFireflies(): void {
    for (const f of this.fireflies) f.destroy();
    this.fireflies = [];
  }

  // ── Read-to-Tame creatures (Phase 3.3) ───────────────────────────────────
  private makeCreature(c: Creature, x: number, y: number, tame: boolean): Phaser.GameObjects.Container {
    const emoji = this.add.text(0, 0, c.emoji, { fontSize: '30px' }).setOrigin(0.5);
    const cont = this.add.container(x, y, [emoji]);
    if (!tame) {
      // Wild: its name floats above (the word to read), and tapping calls it.
      const label = this.add
        .text(0, -28, c.name.toUpperCase(), { fontFamily: FONT, fontSize: '13px', fontStyle: '900', color: '#3a2f1a', backgroundColor: '#fff7e6' })
        .setOrigin(0.5)
        .setPadding(3, 1, 3, 1);
      cont.add(label);
      cont.setSize(64, 64);
      cont.setInteractive(new Phaser.Geom.Rectangle(-32, -32, 64, 64), Phaser.Geom.Rectangle.Contains);
      cont.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        // Don't tame while building or with UI up — let the tap fall through.
        if (this.placing || isUiOpen()) return;
        event.stopPropagation();
        this.director.onCreatureTapped(c.id);
      });
    }
    cont.setDepth(y);
    if (!reducedMotion()) this.tweens.add({ targets: emoji, y: -4, duration: 560 + Phaser.Math.Between(0, 300), yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.wanderCreature(cont);
    return cont;
  }

  private wanderCreature(cont: Phaser.GameObjects.Container): void {
    if (reducedMotion()) return; // Calm Mode: creatures hold still
    const nx = Phaser.Math.Clamp(cont.x + Phaser.Math.Between(-150, 150), 120, W - 120);
    const ny = Phaser.Math.Clamp(cont.y + Phaser.Math.Between(-100, 100), 240, 1080);
    this.tweens.add({
      targets: cont,
      x: nx,
      y: ny,
      duration: 2600 + Phaser.Math.Between(0, 2200),
      ease: 'sine.inOut',
      onUpdate: () => cont.setDepth(cont.y),
      onComplete: () => cont.active && this.wanderCreature(cont),
    });
  }

  /** Scatter one of each still-wild (readable, untamed) creature across the land. */
  private refreshWildCreatures(): void {
    if (this.services.save.questStep !== QuestStep.FREE_PLAY) return;
    for (const cont of this.wildMobs.values()) cont.destroy();
    this.wildMobs.clear();
    const wild = wildCreatures(this.services);
    const rnd = new Phaser.Math.RandomDataGenerator(['mobs', String((this.services.save.tamed ?? []).length)]);
    for (const c of wild) {
      const x = rnd.between(320, W - 320);
      const y = rnd.between(260, 1040);
      this.wildMobs.set(c.id, this.makeCreature(c, x, y, false));
    }
  }

  private spawnTamedCreatures(): void {
    const tamed = this.services.save.tamed ?? [];
    tamed.forEach((id, i) => {
      const c = creatureById(id);
      if (!c) return;
      const x = 1720 + (i % 5) * 46 + Phaser.Math.Between(-16, 16); // by the build plot — the "farm"
      const y = 1000 + Math.floor(i / 5) * 30 + Phaser.Math.Between(-10, 10);
      this.tamedMobs.push(this.makeCreature(c, x, y, true));
    });
  }

  /** A wild creature is tamed: it poofs sparkles and stays on as a friend. */
  private tameCreature(id: string): void {
    const cont = this.wildMobs.get(id);
    const c = creatureById(id);
    const x = cont?.x ?? 1760;
    const y = cont?.y ?? 1020;
    for (let i = 0; i < 8; i++) {
      const s = this.add.text(x, y, '✨', { fontSize: '18px' }).setOrigin(0.5).setDepth(9500);
      this.tweens.add({ targets: s, x: x + Phaser.Math.Between(-64, 64), y: y - Phaser.Math.Between(20, 84), alpha: 0, duration: 720, onComplete: () => s.destroy() });
    }
    cont?.destroy();
    this.wildMobs.delete(id);
    if (c) this.tamedMobs.push(this.makeCreature(c, x, y, true));
  }

  /** Test/facilitator hooks for creatures. */
  wildMobCount(): number {
    return this.wildMobs.size;
  }
  tamedMobCount(): number {
    return this.tamedMobs.length;
  }

  /** Blocks that DO things (Phase 3.4): reading a bed/sun command flips the sky.
   *  Sets a manual phase that holds until the child reads the other command. */
  private forceDayNight(night: boolean): void {
    this.phaseOverride = night ? 0.8 : 0.42;
    this.updateDayNight();
    if (!reducedMotion()) this.cameras.main.flash(220, night ? 20 : 255, night ? 24 : 245, night ? 60 : 210);
  }

  /** Test/facilitator hooks for the day/night cycle. */
  setDayPhaseForTest(p: number | null): void {
    this.phaseOverride = p;
  }
  dayInfo(): { phase: number; alpha: number; isNight: boolean; fireflies: number } {
    return { phase: this.dayPhase(), alpha: this.dayTint.alpha, isNight: this.wasNight, fireflies: this.fireflies.length };
  }
  /** Test hook for the raised dragon: current growth stage, on-screen size, the
   *  applied colour tint, and whether the horn/wing rig is drawn. */
  dragonInfo(): { stage: number; scale: number; tint: number; hasRig: boolean } {
    return { stage: this.dragonStage(), scale: this.dragon.scaleX, tint: this.dragon.tintTopLeft, hasRig: !!this.dragonRig };
  }

  /** Fog of war: walking into a region clears it on the map, once. Cheap — a
   *  find over six rects, and it only mutates the first time each is entered. */
  private revealRegion(): void {
    const reg = regionAt(this.player.x, this.player.y);
    if (!reg || this.services.save.mapSeen.includes(reg.id)) return;
    this.services.save.mapSeen.push(reg.id);
    this.services.analytics.log('region_seen', { region: reg.id });
    this.services.persist();
  }

  private dragonCelebrateAnim(big: boolean): void {
    // Calm mode: keep the floating hearts (gentle, celebratory) but skip the
    // spin and big jumps that WCAG flags as vestibular triggers.
    if (!reducedMotion()) {
      const jumps = big ? 3 : 1;
      this.tweens.add({
        targets: this.dragon,
        y: this.dragon.y - (big ? 46 : 26),
        duration: 190,
        yoyo: true,
        repeat: jumps,
        ease: 'quad.out',
      });
      this.tweens.add({ targets: this.dragon, angle: big ? 360 : 14, duration: big ? 550 : 160, yoyo: !big, ease: 'sine.inOut', onComplete: () => this.dragon.setAngle(0) });
    }
    for (let i = 0; i < (big ? 7 : 3); i++) {
      const heart = this.add
        .text(this.dragon.x + Phaser.Math.Between(-26, 26), this.dragon.y - 20, '💛', { fontSize: '22px' })
        .setOrigin(0.5)
        .setDepth(9500);
      this.tweens.add({
        targets: heart,
        y: heart.y - Phaser.Math.Between(50, 110),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1200),
        onComplete: () => heart.destroy(),
      });
    }
  }

  // ── Guidance: camera reveal, wayfinding arrow, idle auto-walk ─────────────
  private noteInput(): void {
    this.lastInputAt = this.time.now;
    this.cancelCinematic();
  }

  private cancelCinematic(): void {
    if (!this.cinematic) return;
    this.tweens.killTweensOf(this.cameras.main);
    this.cinematicTimer?.remove(false);
    this.cinematicTimer = null;
    this.endCinematic();
  }

  private endCinematic(): void {
    this.cinematic = false;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }

  private clampScroll(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return {
      x: Phaser.Math.Clamp(x, 0, Math.max(0, W - cam.width)),
      y: Phaser.Math.Clamp(y, 0, Math.max(0, H - cam.height)),
    };
  }

  private revealObjective(pos: { x: number; y: number }): void {
    if (this.cinematic) return;
    const cam = this.cameras.main;
    // If it's already comfortably on screen, just pulse it.
    const view = cam.worldView;
    const onScreen =
      pos.x > view.x + 80 && pos.x < view.right - 80 && pos.y > view.y + 120 && pos.y < view.bottom - 80;
    if (onScreen) {
      this.pulseAt(pos.x, pos.y);
      return;
    }
    // Calm mode: no camera drift. The wayfinding arrow still points the way.
    if (reducedMotion()) return;
    this.cinematic = true;
    cam.stopFollow();
    const there = this.clampScroll(pos.x - cam.width / 2, pos.y - cam.height / 2);
    this.tweens.add({
      targets: cam,
      scrollX: there.x,
      scrollY: there.y,
      duration: 650,
      ease: 'sine.inOut',
      onComplete: () => {
        this.pulseAt(pos.x, pos.y);
        this.cinematicTimer = this.time.delayedCall(950, () => {
          this.cinematicTimer = null;
          const back = this.clampScroll(this.player.x - cam.width / 2, this.player.y - cam.height / 2);
          this.tweens.add({
            targets: cam,
            scrollX: back.x,
            scrollY: back.y,
            duration: 650,
            ease: 'sine.inOut',
            onComplete: () => this.endCinematic(),
          });
        });
      },
    });
  }

  private pulseAt(x: number, y: number): void {
    for (const delay of [0, 350]) {
      this.time.delayedCall(delay, () => {
        const ring = this.add.circle(x, y, 14).setStrokeStyle(5, 0xffd166, 0.95).setDepth(9500);
        this.tweens.add({
          targets: ring,
          radius: 100,
          alpha: 0,
          duration: 650,
          ease: 'quad.out',
          onComplete: () => ring.destroy(),
        });
      });
    }
  }

  private updateGuidance(): void {
    const target = this.director?.objectiveTarget() ?? null;
    const cam = this.cameras.main;

    // Arrow: visible only when there is a goal and it's off-screen.
    if (!target || this.cinematic || isUiOpen()) {
      this.guideArrow.setVisible(false);
    } else {
      const sx = target.x - cam.scrollX;
      const sy = target.y - cam.scrollY;
      const inset = { left: 70, right: 70, top: 130, bottom: 95 };
      const inside =
        sx > inset.left && sx < cam.width - inset.right && sy > inset.top && sy < cam.height - inset.bottom;
      if (inside) {
        this.guideArrow.setVisible(false);
      } else {
        const cx = cam.width / 2;
        const cy = cam.height / 2;
        const angle = Math.atan2(sy - cy, sx - cx);
        const px = Phaser.Math.Clamp(sx, inset.left, cam.width - inset.right);
        const py = Phaser.Math.Clamp(sy, inset.top, cam.height - inset.bottom);
        const pulse = 1 + 0.12 * Math.sin(this.time.now / 170);
        this.guideArrow.setVisible(true).setPosition(px, py).setRotation(angle).setScale(pulse);
      }
    }

    // Idle auto-walk: after ~5s of no input, walk the player toward the goal.
    if (
      target &&
      !this.cinematic &&
      !isUiOpen() &&
      !this.moveTarget &&
      !this.pending &&
      this.time.now - this.lastInputAt > 5000 &&
      this.time.now > this.autoWalkCooldownUntil &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y) > 170
    ) {
      this.moveTarget = { x: target.x, y: target.y };
      this.autoWalking = true;
      this.pulseAt(target.x, target.y);
    }
  }

  // ── World control for the quest director ──────────────────────────────────
  private worldControl(): WorldControl {
    return {
      revealObjective: (pos) => this.revealObjective(pos),
      dragonHappy: () => this.dragonCelebrateAnim(false),
      openCaveDoor: () => {
        this.tweens.add({ targets: this.door, alpha: 0, y: this.door.y - 20, duration: 700, ease: 'quad.in' });
        this.doorGlow.setFillStyle(0xffe08a, 0.5);
        if (!reducedMotion()) this.cameras.main.shake(350, 0.006);
        this.time.delayedCall(750, () => {
          this.door.disableBody(true, true);
          this.enableCaveEntrance();
        });
      },
      buildWall: (slot: number) => {
        const pos = WALL_SLOTS[slot];
        if (!pos) return;
        const wall = this.obstacles.create(pos[0], pos[1], 'wall_wood') as Phaser.Physics.Arcade.Sprite;
        wall.setDepth(pos[1]);
        wall.refreshBody();
        this.tweens.add({ targets: wall, scaleX: { from: 0.3, to: 1 }, scaleY: { from: 1.4, to: 1 }, duration: 260, ease: 'back.out' });
      },
      setCoopStage: (stage: number) => {
        const alphas = [0.28, 0.55, 0.8, 1];
        this.coop.setAlpha(alphas[Math.min(stage, 3)]!);
        this.tweens.add({ targets: this.coop, scaleX: this.coop.scaleX * 1.06, scaleY: this.coop.scaleY * 1.06, duration: 140, yoyo: true });
        if (!reducedMotion()) this.cameras.main.shake(120, 0.003);
      },
      henFoundAt: (spot: string) => {
        const pos = HUNT_SPOT_POS[spot];
        if (!pos) return;
        const hen = this.add.sprite(pos[0], pos[1] - 30, 'hen').setDepth(9000);
        hen.setScale(64 / hen.height);
        if (spot === 'shed') hen.setTint(0xffb3a7);
        if (spot === 'log') hen.setScale((64 / hen.height) * 0.7);
        this.tweens.add({
          targets: hen,
          y: hen.y - 90,
          alpha: { from: 1, to: 0 },
          duration: 1400,
          delay: 500,
          onComplete: () => hen.destroy(),
        });
      },
      showHensAtCoop: () => {
        const spots: Array<[number, number, number]> = [
          [365, 985, 1], [520, 990, 0.75], [455, 1010, 0.9],
        ];
        for (const [x, y, s] of spots) {
          const hen = this.add.sprite(x, y, 'hen').setDepth(y);
          hen.setScale((56 / hen.height) * s);
          if (s === 1) hen.setTint(0xffb3a7);
          if (!reducedMotion()) this.tweens.add({ targets: hen, y: y - 4, duration: 800 + s * 300, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        }
      },
      openChest: () => {
        this.tweens.add({ targets: this.chest, angle: -8, duration: 120, yoyo: true, repeat: 2 });
        this.chestGlow.setFillStyle(0x9ff5b1, 0.6);
        for (let i = 0; i < 6; i++) {
          const spark = this.add.text(this.chest.x, this.chest.y - 20, '✨', { fontSize: '24px' }).setOrigin(0.5).setDepth(9500);
          this.tweens.add({
            targets: spark,
            x: this.chest.x + Phaser.Math.Between(-70, 70),
            y: this.chest.y - Phaser.Math.Between(50, 130),
            alpha: 0,
            duration: 900,
            onComplete: () => spark.destroy(),
          });
        }
      },
      dragonLevelUp: (_level: number) => {
        this.updateDragonStage(); // reads save.dragonLevel (already bumped) + growth stage
        const t = this.add
          .text(this.dragon.x, this.dragon.y - 70, 'LEVEL UP!', {
            fontFamily: FONT,
            fontSize: '26px',
            fontStyle: '900',
            color: '#ffd166',
            stroke: '#7a4a00',
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(9500);
        this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 1600, onComplete: () => t.destroy() });
      },
      refreshMarkers: () => this.refreshMarkers(),
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      hatchBaby: (species: string) => this.hatchBaby(species),
      renderBlueprint: () => this.renderBlueprint(),
      fillBlueprintCell: (index: number) => this.fillBlueprintCell(index),
      finishBlueprint: (id: string, pet: string) => this.finishBlueprint(id, pet),
      tameCreature: (id: string) => this.tameCreature(id),
      forceDayNight: (night: boolean) => this.forceDayNight(night),
      openGate: (id: string) => this.openGate(id),
      crackSeam: (id: string) => this.crackSeam(id),
      growDragon: () => this.updateDragonStage(),
      applyDragonColor: (word: string) => this.applyDragonColor(word),
      shatterGiantShield: (count: number) => this.shatterGiantShield(count),
      giantStandAside: () => this.giantStandAside(),
      refreshFurnace: () => this.refreshFurnace(),
    };
  }

  private refreshMarkers(): void {
    const step = this.services.save.questStep;
    const found = this.services.save.hensFound;
    const show = (key: string, visible: boolean) => this.markers.get(key)?.setVisible(visible);
    // Free-play Help-Wanted: a giver shows ❗ when it has an offer (no active
    // job) or is the one holding a job that's ready to turn in.
    const job = this.services.save.job;
    const fp = step === QuestStep.FREE_PLAY;
    const ready = !!job && job.progress >= job.target;
    const offers = (g: 'mayor' | 'wizard') => fp && (!job || (ready && job.giver === g));
    show('mayor', step === QuestStep.MEET_MAYOR || step === QuestStep.RETURN_MAYOR || offers('mayor'));
    show('pathsign', step === QuestStep.PATH_CHOICE);
    show('wizard', step === QuestStep.CAVE_DOOR || offers('wizard'));
    show('spot_shed', step === QuestStep.HUNT && !found.includes('shed'));
    show('spot_rock', step === QuestStep.HUNT && !found.includes('rock'));
    show('spot_log', step === QuestStep.HUNT && !found.includes('log'));
    // Free play: the coop invites a tap to HATCH whenever the child holds an egg.
    show('coop', step === QuestStep.BUILD_COOP || (fp && this.services.save.eggs > 0));
    // Free play: the plans table beckons when a new blueprint is available.
    const bpDone = new Set(this.services.save.blueprintsDone ?? []);
    const bpLeft = ['den', 'pen', 'hut'].some((id) => !bpDone.has(id));
    show('blueprint', fp && !this.services.save.blueprint && bpLeft);
    // Free play: a Word-Gate glows ❗ once its tier is mastered and it's unopened.
    const opened = new Set(this.services.save.gatesOpened ?? []);
    for (const g of GATES) show(`gate_${g.id}`, fp && gateOpenable(this.services, g) && !opened.has(g.id));
    // Free play: the toolbench beckons when there's a new pick to forge; a seam
    // beckons once you hold the pick that can crack it.
    show('toolbench', fp && nextPick(this.services) !== null);
    const pickLvl = this.services.save.pickLevel ?? 0;
    for (const s of MINE_SEAMS) show(`seam_${s.id}`, fp && seamVisible(this.services, s) && pickLvl >= s.level);
    show('chest', step === QuestStep.CHEST);
    show('cave_enter', step === QuestStep.CHEST);
  }

  private restoreFromSave(): void {
    const s = this.services.save;
    for (const slot of s.wallsBuilt) this.worldControl().buildWall(slot);
    if (s.coopStage > 0) this.worldControl().setCoopStage(s.coopStage);
    if (s.coopStage >= 3) this.worldControl().showHensAtCoop();
    if (s.questStep > QuestStep.CAVE_DOOR) {
      this.door.disableBody(true, true);
      this.doorGlow.setFillStyle(0xffe08a, 0.4);
      this.enableCaveEntrance();
    }
    if (s.questStep > QuestStep.CHEST) {
      this.chestGlow.setVisible(false);
      this.chest.setAlpha(0.85);
    }
  }

  // ── Cave transitions + eggs ───────────────────────────────────────────────
  private enterCave(): void {
    // Don't re-enter within a beat of leaving — otherwise the tap that's meant
    // to walk away from the entrance drops you straight back in.
    if (this.time.now < this.caveCooldownUntil) return;
    this.caveReturn = { x: 2200, y: 660 };
    this.teleport(430, 1450);
  }

  private teleport(x: number, y: number): void {
    this.cameras.main.fadeOut(220, 20, 18, 40);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.player.setPosition(x, y);
      this.dragon.setPosition(x - 50, y + 6);
      this.moveTarget = null;
      this.pending = null;
      this.cameras.main.fadeIn(240, 20, 18, 40);
    });
  }

  private maybeSpawnEgg(): void {
    if (this.services.save.coopStage < 3 || this.eggsOnGround >= 3) return;
    this.eggsOnGround += 1;
    const x = 445 + Phaser.Math.Between(-130, 130);
    const y = 1000 + Phaser.Math.Between(-30, 40);
    const egg = this.add.image(x, y, 'egg').setDepth(y);
    egg.setScale(0);
    this.tweens.add({ targets: egg, scale: 1, duration: 300, ease: 'back.out' });
    egg.setInteractive({ useHandCursor: true });
    egg.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (isUiOpen()) return;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) > 190) {
        this.moveTarget = { x, y };
        this.pending = { x, y, radius: 190, cb: () => this.collectEgg(egg) };
        return;
      }
      this.collectEgg(egg);
    });
  }

  private collectEgg(egg: Phaser.GameObjects.Image): void {
    if (!egg.active) return;
    this.eggsOnGround = Math.max(0, this.eggsOnGround - 1);
    egg.destroy();
    floatNote('+1 🥚', window.innerWidth / 2, window.innerHeight / 2 - 60);
    this.director.onEggCollected();
  }

  // ── Frame loop ────────────────────────────────────────────────────────────
  override update(): void {
    const speed = 260;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd['A']?.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd['D']?.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd['W']?.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd['S']?.isDown) vy += 1;

    if (isUiOpen() || this.cinematic) {
      body.setVelocity(0, 0);
    } else if (vx !== 0 || vy !== 0) {
      this.moveTarget = null;
      this.pending = null;
      const len = Math.hypot(vx, vy) || 1;
      body.setVelocity((vx / len) * speed, (vy / len) * speed);
    } else if (this.moveTarget && !this.placing) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.moveTarget.x, this.moveTarget.y);
      if (d < 12) {
        this.moveTarget = null;
        body.setVelocity(0, 0);
      } else {
        this.physics.moveTo(this.player, this.moveTarget.x, this.moveTarget.y, speed);
      }
    } else {
      body.setVelocity(0, 0);
    }

    if (this.pending) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.pending.x, this.pending.y);
      if (d <= this.pending.radius) {
        const cb = this.pending.cb;
        this.pending = null;
        this.moveTarget = null;
        body.setVelocity(0, 0);
        cb();
      }
    }

    // A walk that pushes against an obstacle for >1.2s gets released so the
    // player (or the next auto-walk) can try a different line.
    if (this.moveTarget && body.speed < 10) {
      this.slowMs += this.game.loop.delta;
      if (this.slowMs > 1200) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.moveTarget.x, this.moveTarget.y);
        if (d > 40) {
          this.moveTarget = null;
          this.pending = null;
          if (this.autoWalking) this.autoWalkCooldownUntil = this.time.now + 8000;
          this.autoWalking = false;
        }
        this.slowMs = 0;
      }
    } else {
      this.slowMs = 0;
    }

    this.updateGuidance();
    this.updateDayNight();
    this.revealRegion();

    if (body.velocity.x !== 0) this.player.setFlipX(body.velocity.x < 0);
    this.player.setDepth(this.player.y);

    // First move learned → retire the "tap to walk" coach, for good.
    if (this.coachHand && (this.moveTarget || body.velocity.x !== 0 || body.velocity.y !== 0)) this.clearCoach();

    // dragon follows with a soft spring
    const behind = this.player.flipX ? 54 : -54;
    const tx = this.player.x + behind;
    const ty = this.player.y + 10;
    this.dragon.x += (tx - this.dragon.x) * 0.07;
    this.dragon.y += (ty - this.dragon.y) * 0.07;
    this.dragon.setFlipX(this.dragon.x > tx + 2 ? true : this.dragon.x < tx - 2 ? false : this.dragon.flipX);
    this.dragon.setDepth(this.dragon.y);

    // Horns/wings ride the dragon: match its position, flip, and display size
    // (rig is drawn in 64px space, so scale by the dragon's real display height).
    if (this.dragonRig) {
      const rs = this.dragon.displayHeight / 64;
      this.dragonRig.setPosition(this.dragon.x, this.dragon.y);
      this.dragonRig.setScale(this.dragon.flipX ? -rs : rs, rs);
      this.dragonRig.setDepth(this.dragon.y + 1);
    }
  }
}
