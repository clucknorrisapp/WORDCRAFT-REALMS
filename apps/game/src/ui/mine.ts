// The Mine + the Pick Ladder (Phase 3.2) — the gear-upgrade rush. Ore seams sit
// in the east; each is locked behind a PICK you forge at the toolbench by reading
// its material word. Reading harder material words forges better picks, which
// crack deeper, richer seams — so the mine visibly DEEPENS as reading grows. A
// seam only appears once its material word is decodable at the child's tier, so
// the ladder can never outrun what the child can read.
import { validateText } from '@readquest/content';
import type { Services } from '../services';

export interface Seam {
  id: string;
  level: number; // needs a pick of at least this level (== its own tier)
  mat: string; // the material word, read to forge its pick / gates the seam's appearance
  tint: number; // ore colour
  gems: number; // payout when cracked
  x: number;
  y: number;
}

// Along the mid-east, clear of the village, build plot and cave. Ordered
// shallow → deep; deeper seams want a higher-tier material word.
export const MINE_SEAMS: Seam[] = [
  { id: 's1', level: 1, mat: 'tin', tint: 0xc7c7cf, gems: 1, x: 2180, y: 430 },
  { id: 's2', level: 2, mat: 'sand', tint: 0xe2c874, gems: 2, x: 2320, y: 545 },
  { id: 's3', level: 3, mat: 'clay', tint: 0xcc8a5c, gems: 3, x: 2185, y: 640 },
];

export const TOOLBENCH = { x: 2035, y: 470 };

export function seamById(id: string): Seam | undefined {
  return MINE_SEAMS.find((s) => s.id === id);
}

/** True once the child can read a seam's material word (its appearance gate). */
export function seamVisible(services: Services, s: Seam): boolean {
  return validateText(s.mat, services.save.taught).ok;
}

/** The next pick to forge: the shallowest seam the child can read the material of
 *  but hasn't forged the pick for yet. Null when there's nothing new to forge. */
export function nextPick(services: Services): Seam | null {
  const lvl = services.save.pickLevel ?? 0;
  return MINE_SEAMS.find((s) => s.level > lvl && seamVisible(services, s)) ?? null;
}
