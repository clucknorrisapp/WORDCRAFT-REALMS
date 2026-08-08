// Compose app icons from the dragon sprite on a brand-green rounded field.
// node tools/sprites/make-icons.mjs
import fs from 'node:fs';
import { PNG } from 'pngjs';

const dragon = PNG.sync.read(fs.readFileSync('apps/game/public/assets/sprites/dragon.png'));
const BG = [126, 200, 80]; // #7ec850 meadow green
const RING = [90, 160, 55];

function icon(size, pad) {
  const out = new PNG({ width: size, height: size });
  const r = size * 0.22; // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect mask
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (cx < r && cy < r) inside = (r - cx) ** 2 + (r - cy) ** 2 <= r * r;
      if (!inside) {
        out.data[i + 3] = 0;
        continue;
      }
      // subtle vertical gradient
      const t = y / size;
      out.data[i] = Math.round(BG[0] * (1 - t * 0.12) + RING[0] * t * 0.12);
      out.data[i + 1] = Math.round(BG[1] * (1 - t * 0.12) + RING[1] * t * 0.12);
      out.data[i + 2] = Math.round(BG[2] * (1 - t * 0.12) + RING[2] * t * 0.12);
      out.data[i + 3] = 255;
    }
  }
  // scale dragon to fit the padded area, center, composite (nearest-neighbor)
  const target = size - pad * 2;
  const scale = Math.min(target / dragon.width, target / dragon.height);
  const dw = Math.round(dragon.width * scale);
  const dh = Math.round(dragon.height * scale);
  const ox = Math.round((size - dw) / 2);
  const oy = Math.round((size - dh) / 2);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const si = (sy * dragon.width + sx) * 4;
      const a = dragon.data[si + 3] / 255;
      if (a < 0.02) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue;
      const di = (dy * size + dx) * 4;
      if (out.data[di + 3] === 0) continue; // keep the rounded corners clean
      for (let c = 0; c < 3; c++) {
        out.data[di + c] = Math.round(dragon.data[si + c] * a + out.data[di + c] * (1 - a));
      }
    }
  }
  return PNG.sync.write(out);
}

const jobs = [
  ['apps/game/public/icon-192.png', 192, 20],
  ['apps/game/public/icon-512.png', 512, 54],
  ['apps/game/public/apple-touch-icon.png', 180, 16], // iOS adds its own corners; small pad
  ['apps/game/public/maskable-512.png', 512, 92], // extra safe-zone padding for maskable
];
for (const [path, size, pad] of jobs) {
  fs.writeFileSync(path, icon(size, pad));
  console.log(`${path}  ${size}x${size}`);
}
console.log('icons done');
