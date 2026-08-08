// The world: Meadow Village + Whispering Woods edge + the Wizard's cave.
// Canvas renders the world; every reading surface is DOM (architecture §5.1).
// All interactions are forwarded to the QuestDirector — no pedagogy here.
import Phaser from 'phaser';
import type { Services } from '../services';
import type { Hud } from '../ui/hud';
import { floatNote, isUiOpen } from '../ui/dom';
import { setDragonCelebrate } from '../ui/widgets';
import { QuestDirector, type WorldControl } from './quest';
import { DRAGON_TINTS, QuestStep } from '../types';

const W = 2600;
const H = 1600;
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
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private moveTarget: { x: number; y: number } | null = null;
  private pending: Tappable | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private door!: Phaser.Physics.Arcade.Sprite;
  private doorGlow!: Phaser.GameObjects.Arc;
  private chest!: Phaser.GameObjects.Sprite;
  private chestGlow!: Phaser.GameObjects.Arc;
  private coop!: Phaser.GameObjects.Sprite;
  private markers = new Map<string, Phaser.GameObjects.Text>();
  private caveReturn = { x: 2320, y: 430 };
  private eggsOnGround = 0;

  constructor(services: Services, hud: Hud) {
    super('world');
    this.services = services;
    this.hud = hud;
  }

  preload(): void {
    for (const key of SPRITES) this.load.image(key, `assets/sprites/${key}.png`);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, W, H);
    this.makeProceduralTextures();
    this.paintGround();
    this.obstacles = this.physics.add.staticGroup();

    this.buildVillage();
    this.buildForest();
    this.buildCave();
    this.spawnPlayerAndDragon();
    this.restoreFromSave();

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (isUiOpen()) return;
      this.moveTarget = { x: p.worldX, y: p.worldY };
      this.pending = null;
    });

    this.director = new QuestDirector(this.services, this.worldControl(), this.hud);
    setDragonCelebrate((big) => this.dragonCelebrateAnim(big));
    this.time.delayedCall(400, () => void this.director.start());

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
    this.add.rectangle(W / 2, H / 2, W, H, 0x7ec850).setDepth(-100);
    this.add.rectangle(1950, 560, 1300, 1000, 0x6db143).setDepth(-99); // forest floor
    // paths
    this.add.rectangle(1280, 660, 2280, 86, 0xdbb37f).setDepth(-90);
    this.add.rectangle(680, 520, 90, 420, 0xdbb37f).setDepth(-90);
    this.add.rectangle(445, 905, 400, 290, 0xcfa568, 0.55).setDepth(-90); // plot dirt
    // grass tufts
    const rnd = new Phaser.Math.RandomDataGenerator(['readquest']);
    for (let i = 0; i < 90; i++) {
      const x = rnd.between(60, W - 60);
      const y = rnd.between(60, 1080);
      this.add.image(x, y, 'tuft').setDepth(-80).setAlpha(0.8);
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
      if (isUiOpen()) return;
      const t: Tappable = { x: obj.x, y: obj.y, radius, cb };
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y);
      if (d <= radius) {
        this.moveTarget = null;
        cb();
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
    if (this.services.save.dragonLevel >= 2) this.dragon.setScale((64 / this.dragon.height) * 1.18);
  }

  private dragonCelebrateAnim(big: boolean): void {
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

  // ── World control for the quest director ──────────────────────────────────
  private worldControl(): WorldControl {
    return {
      openCaveDoor: () => {
        this.tweens.add({ targets: this.door, alpha: 0, y: this.door.y - 20, duration: 700, ease: 'quad.in' });
        this.doorGlow.setFillStyle(0xffe08a, 0.5);
        this.cameras.main.shake(350, 0.006);
        this.time.delayedCall(750, () => {
          this.door.disableBody(true, true);
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
        this.cameras.main.shake(120, 0.003);
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
          this.tweens.add({ targets: hen, y: y - 4, duration: 800 + s * 300, yoyo: true, repeat: -1, ease: 'sine.inOut' });
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
      dragonLevelUp: (level: number) => {
        this.dragon.setScale((64 / this.dragon.height) * (1 + level * 0.09));
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
    };
  }

  private refreshMarkers(): void {
    const step = this.services.save.questStep;
    const found = this.services.save.hensFound;
    const show = (key: string, visible: boolean) => this.markers.get(key)?.setVisible(visible);
    show('mayor', step === QuestStep.MEET_MAYOR || step === QuestStep.RETURN_MAYOR);
    show('pathsign', step === QuestStep.PATH_CHOICE);
    show('wizard', step === QuestStep.CAVE_DOOR);
    show('spot_shed', step === QuestStep.HUNT && !found.includes('shed'));
    show('spot_rock', step === QuestStep.HUNT && !found.includes('rock'));
    show('spot_log', step === QuestStep.HUNT && !found.includes('log'));
    show('coop', step === QuestStep.BUILD_COOP);
    show('chest', step === QuestStep.CHEST);
  }

  private restoreFromSave(): void {
    const s = this.services.save;
    for (const slot of s.wallsBuilt) this.worldControl().buildWall(slot);
    if (s.coopStage > 0) this.worldControl().setCoopStage(s.coopStage);
    if (s.coopStage >= 3) this.worldControl().showHensAtCoop();
    if (s.questStep > QuestStep.CAVE_DOOR) {
      this.door.disableBody(true, true);
      this.doorGlow.setFillStyle(0xffe08a, 0.4);
    }
    if (s.questStep > QuestStep.CHEST) {
      this.chestGlow.setVisible(false);
      this.chest.setAlpha(0.85);
    }
  }

  // ── Cave transitions + eggs ───────────────────────────────────────────────
  private enterCave(): void {
    this.caveReturn = { x: 2320, y: 430 };
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

    if (isUiOpen()) {
      body.setVelocity(0, 0);
    } else if (vx !== 0 || vy !== 0) {
      this.moveTarget = null;
      this.pending = null;
      const len = Math.hypot(vx, vy) || 1;
      body.setVelocity((vx / len) * speed, (vy / len) * speed);
    } else if (this.moveTarget) {
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

    if (body.velocity.x !== 0) this.player.setFlipX(body.velocity.x < 0);
    this.player.setDepth(this.player.y);

    // dragon follows with a soft spring
    const behind = this.player.flipX ? 54 : -54;
    const tx = this.player.x + behind;
    const ty = this.player.y + 10;
    this.dragon.x += (tx - this.dragon.x) * 0.07;
    this.dragon.y += (ty - this.dragon.y) * 0.07;
    this.dragon.setFlipX(this.dragon.x > tx + 2 ? true : this.dragon.x < tx - 2 ? false : this.dragon.flipX);
    this.dragon.setDepth(this.dragon.y);
  }
}
