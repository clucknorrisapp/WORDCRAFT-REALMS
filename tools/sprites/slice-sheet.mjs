// Slice a 4x4 AI-generated sprite sheet into individual transparent PNGs.
// White background is removed by flood fill from the cell borders only, so
// white sprite interiors (the hens!) survive. Usage:
//   node tools/sprites/slice-sheet.mjs <sheet.png> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const NAMES = [
  'avatar_0', 'avatar_1', 'avatar_2', 'avatar_3',
  'dragon', 'mayor_hen', 'wizard', 'hen',
  'coop', 'house', 'stall', 'tree',
  'rock', 'sign', 'door', 'chest',
];

const WHITE = 232; // flood threshold
const [, , inPath, outDir] = process.argv;
if (!inPath || !outDir) {
  console.error('usage: slice-sheet.mjs <sheet.png> <outDir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const src = PNG.sync.read(fs.readFileSync(inPath));
const cell = Math.floor(src.width / 4);

for (let i = 0; i < 16; i++) {
  const cx = (i % 4) * cell;
  const cy = Math.floor(i / 4) * cell;
  const out = new PNG({ width: cell, height: cell });
  PNG.bitblt(src, out, cx, cy, cell, cell, 0, 0);

  const idx = (x, y) => (y * cell + x) * 4;
  const nearWhite = (x, y) => {
    const p = idx(x, y);
    return out.data[p] >= WHITE && out.data[p + 1] >= WHITE && out.data[p + 2] >= WHITE;
  };

  // Flood fill from every border pixel.
  const visited = new Uint8Array(cell * cell);
  const stack = [];
  for (let x = 0; x < cell; x++) stack.push([x, 0], [x, cell - 1]);
  for (let y = 0; y < cell; y++) stack.push([0, y], [cell - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= cell || y >= cell) continue;
    const v = y * cell + x;
    if (visited[v]) continue;
    visited[v] = 1;
    if (!nearWhite(x, y)) continue;
    out.data[idx(x, y) + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Soften the 1px halo: near-white pixels touching transparency fade out.
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const p = idx(x, y);
      if (out.data[p + 3] === 0) continue;
      const touchesClear =
        (x > 0 && out.data[idx(x - 1, y) + 3] === 0) ||
        (x < cell - 1 && out.data[idx(x + 1, y) + 3] === 0) ||
        (y > 0 && out.data[idx(x, y - 1) + 3] === 0) ||
        (y < cell - 1 && out.data[idx(x, y + 1) + 3] === 0);
      if (touchesClear && out.data[p] >= 210 && out.data[p + 1] >= 210 && out.data[p + 2] >= 210) {
        out.data[p + 3] = 90;
      }
    }
  }

  // Neighboring cells can bleed a few pixels across the grid boundary
  // (an avatar's feet ending up above the sprite below). Keep only the
  // largest connected component; drop stray fragments.
  {
    const label = new Int32Array(cell * cell).fill(-1);
    const sizes = [];
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const v = y * cell + x;
        if (label[v] !== -1 || out.data[idx(x, y) + 3] === 0) continue;
        const id = sizes.length;
        let size = 0;
        const q = [[x, y]];
        label[v] = id;
        while (q.length) {
          const [qx, qy] = q.pop();
          size += 1;
          for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
            if (nx < 0 || ny < 0 || nx >= cell || ny >= cell) continue;
            const nv = ny * cell + nx;
            if (label[nv] !== -1 || out.data[idx(nx, ny) + 3] === 0) continue;
            label[nv] = id;
            q.push([nx, ny]);
          }
        }
        sizes.push(size);
      }
    }
    if (sizes.length > 1) {
      const keep = sizes.indexOf(Math.max(...sizes));
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const v = y * cell + x;
          if (label[v] !== -1 && label[v] !== keep) out.data[idx(x, y) + 3] = 0;
        }
      }
    }
  }

  // Trim to content bounding box with a 2px pad.
  let minX = cell, minY = cell, maxX = -1, maxY = -1;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (out.data[idx(x, y) + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    console.warn(`cell ${i} (${NAMES[i]}) came out empty — skipped`);
    continue;
  }
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(cell - 1, maxX + 2);
  maxY = Math.min(cell - 1, maxY + 2);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const trimmed = new PNG({ width: w, height: h });
  PNG.bitblt(out, trimmed, minX, minY, w, h, 0, 0);

  const file = path.join(outDir, `${NAMES[i]}.png`);
  fs.writeFileSync(file, PNG.sync.write(trimmed));
  console.log(`${NAMES[i]}.png  ${w}x${h}`);
}
console.log('done');
