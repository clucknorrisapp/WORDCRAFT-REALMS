// Procedural pixel-art block textures — a tiny 16×16 painter that gives every
// build block a crisp Minecraft-style tile without any external art. The same
// canvas is used as a CSS background (Build Mode) and a Phaser texture (world),
// so blocks look identical everywhere. Deterministic → no flicker, no assets.

const G = 16; // logical pixels per tile
const PX = 6; // device px per logical pixel
const SIZE = G * PX; // 96×96 canvas

type Ctx = CanvasRenderingContext2D;

/** Deterministic value noise in [0,1). */
function hash(x: number, y: number, s: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x * PX, y * PX, w * PX, h * PX);
}
const px = (c: Ctx, x: number, y: number, col: string) => rect(c, x, y, 1, 1, col);
const fill = (c: Ctx, col: string) => rect(c, 0, 0, G, G, col);
function noise(c: Ctx, pal: string[], s: number): void {
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) px(c, x, y, pal[Math.min(pal.length - 1, Math.floor(hash(x, y, s) * pal.length))]!);
}

const SKY = '#bfe3f5';
const WATER = ['#3b6fd4', '#4a7ee0', '#3466c6', '#5a8bea'];

const PAINTERS: Record<string, (c: Ctx) => void> = {
  // Ground tile (not a build block) — the plot's Minecraft grass field.
  grass: (c) => {
    noise(c, ['#5fae3a', '#6cbf42', '#529a32', '#74c94a', '#57a636'], 11);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(hash(i, 1, 11) * G);
      const y = Math.floor(hash(i, 2, 11) * G);
      px(c, x, y, '#3f8a26');
      px(c, x, Math.max(0, y - 1), '#8ad85e');
    }
  },
  mud: (c) => noise(c, ['#6b4a29', '#7a5230', '#875c37', '#5e3d20', '#6f4d2b'], 1),
  log: (c) => {
    rect(c, 0, 0, G, G, '#8a6a3a');
    rect(c, 0, 0, 2, G, '#5b3d1e');
    rect(c, 14, 0, 2, G, '#5b3d1e');
    for (const x of [4, 7, 10, 12]) rect(c, x, 0, 1, G, '#6e5230');
    for (let y = 0; y < G; y++) if (hash(y, 3, 2) > 0.7) px(c, 6, y, '#9c7a46');
  },
  rock: (c) => {
    noise(c, ['#7f7f7f', '#8c8c8c', '#727272', '#999999'], 3);
    for (const [x, y] of [[0, 4], [5, 8], [11, 3], [3, 12], [9, 11]] as Array<[number, number]>) rect(c, x, y, G, 1, '#5c5c5c');
    rect(c, 4, 0, 1, G, '#5c5c5c');
    rect(c, 10, 0, 1, G, '#5c5c5c');
  },
  bush: (c) => {
    noise(c, ['#2f7d2f', '#3a8f3a', '#46a046', '#277025', '#54ad4f'], 4);
    for (let i = 0; i < 14; i++) px(c, Math.floor(hash(i, 1, 4) * G), Math.floor(hash(i, 2, 4) * G), '#1f5c1f');
  },
  hut: (c) => {
    fill(c, '#b3854d');
    for (const y of [4, 9, 14]) rect(c, 0, y, G, 1, '#8f6a3a');
    for (const [x, y] of [[7, 0], [3, 5], [11, 5], [6, 10], [13, 10]] as Array<[number, number]>) rect(c, x, y, 1, 4, '#8f6a3a');
    for (let i = 0; i < 10; i++) px(c, Math.floor(hash(i, 5, 6) * G), Math.floor(hash(i, 6, 6) * G), '#a5793f');
  },
  path: (c) => {
    noise(c, ['#7a5230', '#875c37', '#6b4a29'], 7);
    rect(c, 0, 0, G, 2, '#4c9a3a');
    for (let x = 0; x < G; x++) if (hash(x, 0, 7) > 0.5) px(c, x, 2, '#4c9a3a');
    for (const [x, y] of [[4, 7], [9, 5], [7, 11], [12, 9]] as Array<[number, number]>) px(c, x, y, '#9c8b6a');
  },
  pen: (c) => {
    fill(c, SKY);
    rect(c, 0, 12, G, 4, '#7bbf4a'); // grass
    rect(c, 3, 3, 2, 11, '#6e4a24');
    rect(c, 11, 3, 2, 11, '#6e4a24');
    rect(c, 0, 5, G, 2, '#875c37');
    rect(c, 0, 9, G, 2, '#875c37');
  },
  pot: (c) => {
    fill(c, SKY);
    rect(c, 5, 9, 6, 5, '#c8663a'); // pot
    rect(c, 5, 8, 6, 1, '#a44f2b');
    rect(c, 6, 9, 4, 1, '#5b3d1e'); // soil
    rect(c, 7, 4, 2, 5, '#3a8f3a'); // stem
    rect(c, 5, 5, 2, 2, '#46a046');
    rect(c, 9, 5, 2, 2, '#46a046');
  },
  web: (c) => {
    fill(c, '#39404d');
    const W = '#e8ecf2';
    for (let i = 0; i < G; i++) {
      px(c, i, i, W);
      px(c, G - 1 - i, i, W);
      px(c, 8, i, W);
      px(c, i, 8, W);
    }
    for (const r of [3, 6]) {
      rect(c, 8 - r, 8 - r, 2 * r, 1, W);
      rect(c, 8 - r, 8 + r, 2 * r, 1, W);
      rect(c, 8 - r, 8 - r, 1, 2 * r, W);
      rect(c, 8 + r, 8 - r, 1, 2 * r + 1, W);
    }
  },
  egg: (c) => {
    fill(c, SKY);
    rect(c, 3, 10, 10, 4, '#6e4a24'); // nest
    for (const ex of [4, 7, 10]) {
      rect(c, ex, 7, 3, 4, '#f3ead6');
      px(c, ex, 8, '#c9bda3');
      px(c, ex + 2, 9, '#c9bda3');
    }
  },
  sun: (c) => {
    noise(c, ['#e0b83e', '#f4d968', '#c99a2e', '#ecc84f'], 9);
    for (let i = 0; i < 8; i++) px(c, Math.floor(hash(i, 1, 9) * G), Math.floor(hash(i, 2, 9) * G), '#fff3b0');
  },
  fish: (c) => {
    noise(c, WATER, 10);
    rect(c, 5, 7, 6, 3, '#e8873a'); // body
    rect(c, 4, 8, 1, 1, '#e8873a');
    rect(c, 11, 6, 2, 5, '#e8873a'); // tail
    rect(c, 6, 8, 3, 1, '#f6b26b');
    px(c, 6, 7, '#1a1a1a'); // eye
  },
  bed: (c) => {
    fill(c, SKY);
    rect(c, 2, 8, 12, 5, '#6e4a24'); // frame
    rect(c, 3, 9, 10, 3, '#c0392b'); // mattress
    rect(c, 3, 9, 3, 3, '#f3ead6'); // pillow
    rect(c, 2, 12, 12, 1, '#4a3016');
  },
  ship: (c) => {
    noise(c, WATER, 12);
    rect(c, 3, 10, 10, 3, '#6e4a24'); // hull
    rect(c, 12, 9, 2, 2, '#6e4a24');
    rect(c, 8, 3, 1, 7, '#875c37'); // mast
    rect(c, 4, 4, 4, 5, '#f3ead6'); // sail
    rect(c, 9, 4, 3, 4, '#c0392b');
  },
  bus: (c) => {
    fill(c, SKY);
    rect(c, 2, 5, 12, 7, '#f2c531'); // body
    rect(c, 3, 6, 3, 3, '#bfe3f5'); // windows
    rect(c, 7, 6, 3, 3, '#bfe3f5');
    rect(c, 11, 6, 2, 3, '#bfe3f5');
    rect(c, 2, 10, 12, 1, '#c99a1e');
    rect(c, 4, 12, 2, 2, '#222');
    rect(c, 10, 12, 2, 2, '#222');
  },
  jet: (c) => {
    fill(c, SKY);
    rect(c, 3, 7, 11, 2, '#c2c9d2'); // fuselage
    rect(c, 13, 6, 2, 4, '#c2c9d2'); // nose
    rect(c, 6, 4, 3, 8, '#a7b0bd'); // wings
    rect(c, 3, 5, 2, 2, '#8b93a1'); // tail
    px(c, 12, 7, '#3b6fd4'); // window
  },
  hat: (c) => {
    fill(c, SKY);
    rect(c, 4, 5, 8, 5, '#c0392b'); // cap dome
    rect(c, 3, 9, 12, 2, '#a02b20'); // brim
    rect(c, 5, 4, 6, 1, '#d0493b');
  },
  sand: (c) => {
    noise(c, ['#e3d29a', '#dcc98a', '#e8daa8', '#d3bd7a', '#eaddab'], 13);
    rect(c, 0, 5, G, 1, '#cbb374');
    rect(c, 0, 11, G, 1, '#cbb374');
  },
  tin: (c) => {
    noise(c, ['#c9ccd1', '#bcc1c9', '#d6d9dd', '#b2b7c0'], 14);
    rect(c, 0, 0, G, 1, '#e6e9ee'); // top highlight
    rect(c, 0, 0, 1, G, '#e6e9ee');
    rect(c, 0, 15, G, 1, '#9298a2'); // bottom shade
    rect(c, 15, 0, 1, G, '#9298a2');
  },
  net: (c) => {
    fill(c, SKY);
    for (const x of [2, 5, 8, 11, 14]) rect(c, x, 1, 1, 14, '#8b93a1');
    for (const y of [2, 6, 10, 14]) rect(c, 1, y, 14, 1, '#8b93a1');
    for (const x of [2, 5, 8, 11, 14]) for (const y of [2, 6, 10, 14]) px(c, x, y, '#c2c9d2');
  },
  magma: (c) => {
    noise(c, ['#7a1f10', '#5c1608', '#8a2a14', '#6b1c0d'], 21);
    // glowing cracks
    for (const [x, y] of [[2, 3], [3, 4], [8, 2], [9, 3], [5, 9], [12, 11], [6, 13]] as Array<[number, number]>) {
      px(c, x, y, '#ff8a3c');
      px(c, x + 1, y, '#ffd166');
    }
    for (let i = 0; i < 6; i++) px(c, Math.floor(hash(i, 5, 21) * G), Math.floor(hash(i, 6, 21) * G), '#ffb347');
  },
  brick: (c) => {
    fill(c, '#a83232');
    for (const y of [3, 7, 11, 15]) rect(c, 0, y, G, 1, '#7d2020'); // mortar rows
    // offset vertical mortar
    for (const [x, y] of [[4, 0], [11, 0], [7, 4], [14, 4], [4, 8], [11, 8], [7, 12], [14, 12]] as Array<[number, number]>)
      rect(c, x, y, 1, 4, '#7d2020');
    for (let i = 0; i < 8; i++) px(c, Math.floor(hash(i, 1, 22) * G), Math.floor(hash(i, 2, 22) * G), '#c04b4b');
  },
  tree: (c) => {
    fill(c, '#5fae3a'); // grass base
    rect(c, 7, 9, 2, 6, '#6e4a24'); // trunk
    // round leafy canopy
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < G; x++) {
        const dx = x - 7.5, dy = y - 4.5;
        if (dx * dx + dy * dy < 26) px(c, x, y, hash(x, y, 23) > 0.5 ? '#2f7d2f' : '#3f9a3a');
      }
    for (let i = 0; i < 6; i++) px(c, 3 + Math.floor(hash(i, 1, 23) * 9), Math.floor(hash(i, 2, 23) * 8), '#54c24a');
  },
  glass: (c) => {
    fill(c, '#bfe3f5');
    rect(c, 0, 0, G, 1, '#8fc7e8');
    rect(c, 0, 0, 1, G, '#8fc7e8');
    rect(c, 0, 15, G, 1, '#8fc7e8');
    rect(c, 15, 0, 1, G, '#8fc7e8');
    // diagonal shine
    for (let i = 0; i < G; i++) {
      if (i + 3 < G) px(c, i, i + 3, '#eaf6fd');
      if (i + 5 < G) px(c, i, i + 5, '#d6eefb');
    }
  },
  map: (c) => {
    fill(c, '#e8d8a8');
    rect(c, 0, 0, G, 1, '#c9b57e');
    rect(c, 0, 15, G, 1, '#c9b57e');
    rect(c, 0, 0, 1, G, '#c9b57e');
    rect(c, 15, 0, 1, G, '#c9b57e');
    for (const [x, y] of [[3, 4], [5, 6], [7, 7], [9, 9], [11, 10]] as Array<[number, number]>) px(c, x, y, '#8a6a3a');
    px(c, 11, 10, '#c0392b');
    px(c, 12, 11, '#c0392b'); // X
    px(c, 12, 10, '#c0392b');
    px(c, 11, 11, '#c0392b');
  },
};

const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

/** A crisp pixel-art canvas for `blockId` (cached). Falls back to a flat tile. */
export function blockTextureCanvas(blockId: string): HTMLCanvasElement {
  const hit = cache.get(blockId);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = SIZE;
  cv.height = SIZE;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  (PAINTERS[blockId] ?? ((c: Ctx) => noise(c, ['#8a8a8a', '#9a9a9a', '#7a7a7a'], 0)))(ctx);
  cache.set(blockId, cv);
  return cv;
}

/** Data URL of the block texture (cached) — for CSS `background-image`. */
export function blockTextureURL(blockId: string): string {
  const hit = urlCache.get(blockId);
  if (hit) return hit;
  const url = blockTextureCanvas(blockId).toDataURL();
  urlCache.set(blockId, url);
  return url;
}
