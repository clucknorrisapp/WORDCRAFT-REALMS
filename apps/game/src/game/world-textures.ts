// Procedural pixel-art for the WORLD PROPS (buildings, signs, scenery) — the
// same asset-free, crisp pixel-art approach as block-textures.ts, so the whole
// overworld reads as one blocky Minecraft-style world instead of cartoon PNGs
// on a blocky floor. Characters (dragon, hens, the child) stay hand-drawn — the
// cute "mobs" of the world. Each painter draws on a small logical grid that is
// scaled up (NEAREST-filtered) to whatever size the world renders the prop at.

type Ctx = CanvasRenderingContext2D;
type Rect = (x: number, y: number, w: number, h: number, col: string) => void;
type Painter = (r: Rect, W: number, H: number) => void;

const PX = 5; // device pixels per logical pixel

// [logicalW, logicalH, painter] — dims picked to match each prop's world aspect.
const PROPS: Record<string, [number, number, Painter]> = {
  // ── Cottage (HUT / houses) ──
  house: [40, 33, (r) => {
    for (let y = 2; y < 15; y++) {
      const half = Math.round((y - 1) * 1.45); // gabled tiled roof, narrowing up
      r(20 - half, y, half * 2, 1, y % 2 ? '#c85f30' : '#b5532a');
    }
    r(18, 1, 4, 2, '#8f3f1e'); // ridge cap
    r(4, 14, 32, 2, '#8f3f1e'); // eave shadow
    r(6, 15, 28, 16, '#f2e4c6'); // wall
    r(6, 15, 28, 1, '#fff6e2');
    r(6, 30, 28, 2, '#cbb28a');
    r(6, 15, 1, 16, '#e0cda6'); r(33, 15, 1, 16, '#d9c49a');
    r(17, 21, 6, 10, '#7a4a24'); r(17, 21, 6, 1, '#5b3418'); // door
    r(21, 26, 1, 1, '#f4d34a'); // knob
    const win = (wx: number) => {
      r(wx - 1, 17, 7, 1, '#8f5c2e');
      r(wx, 18, 5, 5, '#8fd0f0'); r(wx, 18, 5, 1, '#c7ecff');
      r(wx + 2, 18, 1, 5, '#4a3016'); r(wx, 20, 5, 1, '#4a3016');
    };
    win(9); win(26);
    r(28, 3, 3, 6, '#8a5a3a'); r(28, 3, 3, 1, '#6e4520'); // chimney
  }],

  // ── Market stall (SHOP) ──
  stall: [36, 38, (r) => {
    r(4, 12, 2, 24, '#6e4a24'); r(30, 12, 2, 24, '#6e4a24'); // posts
    r(2, 5, 32, 7, '#f4f4f4'); // awning
    for (let i = 0; i < 8; i++) r(2 + i * 4, 5, 2, 7, '#c0392b'); // stripes
    r(2, 12, 32, 1, '#b0b0b0');
    for (let i = 0; i < 8; i++) r(4 + i * 4, 12, 2, 1, '#c0392b'); // scalloped rim
    r(3, 27, 30, 6, '#8a6a3a'); r(3, 27, 30, 1, '#a5793f'); r(3, 32, 30, 1, '#5b3d1e'); // counter
    r(3, 33, 2, 5, '#6e4a24'); r(31, 33, 2, 5, '#6e4a24'); // legs
    r(7, 22, 6, 5, '#b5793f'); r(7, 22, 6, 1, '#ca9257'); // basket
    r(15, 21, 6, 6, '#c0392b'); r(16, 22, 1, 1, '#e0503f'); // apples
    r(23, 22, 6, 5, '#3f9a3a'); r(23, 22, 6, 1, '#54c24a'); // greens
  }],

  // ── Tree ──
  tree: [28, 38, (r, W) => {
    r(12, 24, 4, 13, '#6e4a24'); r(12, 24, 1, 13, '#5b3d1e'); r(15, 24, 1, 13, '#5b3d1e'); // trunk
    for (let y = 1; y < 25; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - 14, dy = y - 12;
        if (dx * dx * 0.85 + dy * dy < 118) r(x, y, 1, 1, (x * 2 + y) % 3 ? '#2f7d2f' : '#3f9a3a');
      }
    for (let i = 0; i < 12; i++) r(6 + (i * 5) % 16, 3 + (i * 7) % 15, 1, 1, '#54c24a'); // dapple
  }],

  // ── Signpost (label text renders on top; keep the board light) ──
  sign: [16, 24, (r) => {
    r(7, 8, 2, 16, '#6e4a24'); r(7, 8, 1, 16, '#5b3d1e'); // post
    r(1, 2, 14, 9, '#c9a367'); r(1, 2, 14, 1, '#dcbc85'); r(1, 10, 14, 1, '#6e4a24'); // board
    r(1, 2, 1, 9, '#8a6535'); r(14, 2, 1, 9, '#8a6535');
    r(3, 5, 10, 1, '#b8945c'); r(3, 8, 10, 1, '#b8945c'); // grain
  }],

  // ── Boulder ──
  rock: [28, 20, (r, W) => {
    for (let y = 3; y < 20; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - 14, dy = y - 13;
        if (dx * dx * 0.55 + dy * dy * 1.1 < 62) r(x, y, 1, 1, (x * 3 + y) % 4 ? '#8c8c8c' : '#7a7a7a');
      }
    for (let x = 7; x < 21; x++) if ((x * 5) % 3) r(x, 4 + (x % 2), 1, 1, '#a7a7a7'); // top sheen
    r(10, 10, 6, 1, '#5c5c5c'); r(15, 13, 5, 1, '#5c5c5c'); // cracks
    r(5, 18, 18, 2, '#6a6a6a'); // ground contact
  }],

  // ── Treasure chest ──
  chest: [26, 22, (r) => {
    r(3, 4, 20, 5, '#8a5a2c'); r(3, 4, 20, 1, '#a5793f'); // lid
    r(2, 8, 22, 2, '#6e4520'); // lid rim
    r(3, 10, 20, 10, '#7a4a24'); r(3, 19, 20, 1, '#5b3418'); // body
    r(3, 4, 2, 16, '#f2c531'); r(21, 4, 2, 16, '#f2c531'); r(12, 4, 2, 16, '#f2c531'); // gold bands
    r(3, 4, 2, 1, '#fff0a0'); r(21, 4, 2, 1, '#fff0a0');
    r(11, 11, 4, 4, '#e0b83e'); r(12, 12, 2, 2, '#8a5a2c'); // lock
  }],

  // ── Wizard's magic cave door (stone arch + glowing rune door) ──
  door: [30, 32, (r, W) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < W; x++) {
        if (x < 4 || x >= W - 4 || y < 3) r(x, y, 1, 1, (x + y) % 3 ? '#8c8c8c' : '#767676');
      }
    r(4, 5, 22, 27, '#241d2e'); // dark archway
    for (let x = 4; x < 26; x++) if (Math.abs(x - 15) > 7) r(x, 5, 1, 4, '#767676'); // round the top
    r(8, 8, 14, 22, '#5b3a6e'); r(8, 8, 14, 1, '#7a5290'); // door slab
    r(15, 8, 1, 22, '#4a2f5a'); // seam
    r(11, 14, 2, 2, '#d7b3ff'); r(17, 14, 2, 2, '#d7b3ff'); // rune glow
    r(11, 20, 8, 1, '#d7b3ff'); r(14, 17, 2, 4, '#d7b3ff');
    r(12, 19, 1, 2, '#f2c531'); r(18, 19, 1, 2, '#f2c531'); // handles
  }],

  // ── Chicken coop (DEN) ──
  coop: [34, 32, (r) => {
    r(4, 14, 26, 16, '#b5793f'); r(4, 14, 26, 1, '#caa06a'); r(4, 29, 26, 1, '#7a5230'); // body
    for (let y = 2; y < 15; y++) { const half = Math.round((y - 1) * 1.25); r(17 - half, y, half * 2, 1, y % 2 ? '#c0392b' : '#a82f22'); } // A-roof
    r(15, 1, 4, 2, '#8f2318'); // ridge
    for (let y = 18; y < 29; y++)
      for (let x = 12; x < 22; x++) { const dx = x - 17, dy = y - 24; if (dx * dx + dy * dy * 0.8 < 22) r(x, y, 1, 1, '#3a2413'); } // round door
    r(4, 20, 26, 1, '#9c6835'); r(4, 25, 26, 1, '#9c6835'); // planks
    r(4, 30, 3, 2, '#6e4a24'); r(27, 30, 3, 2, '#6e4a24'); // feet
  }],
};

const cache = new Map<string, HTMLCanvasElement>();

/** Which world props have a pixel-art painter (others stay PNG for now). */
export function hasPropTexture(key: string): boolean {
  return key in PROPS;
}

export function propTextureCanvas(key: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const [W, H, paint] = PROPS[key]!;
  const cv = document.createElement('canvas');
  cv.width = W * PX;
  cv.height = H * PX;
  const ctx = cv.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const r: Rect = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x * PX, y * PX, w * PX, h * PX);
  };
  paint(r, W, H);
  cache.set(key, cv);
  return cv;
}

export const PIXEL_PROP_KEYS = Object.keys(PROPS);
