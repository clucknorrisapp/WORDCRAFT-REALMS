// Fog-of-war map + fast travel (Phase 4.4). The kingdom is carved into named
// regions that tile the whole overworld. Walking into one clears its fog; then,
// on the map, READING its name aloud claims it — the region flares gold, plants
// a flag, and becomes a fast-travel pin. So the map is a running scoreboard of
// words conquered: a black parchment that turns gold as reading grows, and the
// bigger world never means boring walks back.
import { validateText } from '@readquest/content';
import type { Services } from '../services';

// Keep in sync with world.ts world size.
export const MAP_W = 2600;
export const MAP_H = 1600;

export interface Region {
  id: string;
  name: string; // the decodable place-word the child reads to claim it
  x: number; // rect top-left in world coords
  y: number;
  w: number;
  h: number;
  anchor: { x: number; y: number }; // where fast-travel drops the player
}

// A 3×2 grid over the world, each cell a real place with a decodable name. The
// names span tiers (den → path/pond → cave/road → farm) so the map fills in as
// reading climbs — early on only home is claimable; the frontier unlocks the
// rest. Each name is decodable exactly at its tier (validateText gates claiming).
export const REGIONS: Region[] = [
  // Top row
  { id: 'den', name: 'den', x: 0, y: 0, w: 866, h: 800, anchor: { x: 600, y: 640 } }, // home village (short e)
  { id: 'path', name: 'path', x: 866, y: 0, w: 867, h: 800, anchor: { x: 1240, y: 620 } }, // northern woods (th)
  { id: 'cave', name: 'cave', x: 1733, y: 0, w: 867, h: 800, anchor: { x: 2160, y: 430 } }, // eastern mine/cave (magic e)
  // Bottom row
  { id: 'farm', name: 'farm', x: 0, y: 800, w: 866, h: 800, anchor: { x: 445, y: 980 } }, // plot + coop (bossy r)
  { id: 'pond', name: 'pond', x: 866, y: 800, w: 867, h: 800, anchor: { x: 1200, y: 1150 } }, // south meadow (nd blend)
  { id: 'road', name: 'road', x: 1733, y: 800, w: 867, h: 800, anchor: { x: 2050, y: 1150 } }, // south-east build road (oa team)
];

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** The region a world point falls in (regions tile the map, so this is total). */
export function regionAt(x: number, y: number): Region | undefined {
  return REGIONS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** A revealed region can be CLAIMED once the child can read its name — the same
 *  validateText gate every other reading unlock uses, so the map can never ask
 *  for a word the child hasn't been taught. */
export function regionClaimable(services: Services, r: Region): boolean {
  return validateText(r.name, services.save.taught).ok;
}
