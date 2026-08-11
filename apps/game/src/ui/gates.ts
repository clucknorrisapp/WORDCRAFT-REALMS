// Word-Gates → new biomes (Phase 3.1). At the map's eastern edge stand pixel
// archways sealed with a shimmering word-wall; through the cracks you glimpse a
// sliver of another land. A gate stays locked until the child MASTERS its tier —
// then its word lights up, and saying it dissolves the wall and unrolls a brand-
// new biome pocket with its own gather nodes. The edge of the map literally IS
// the child's reading frontier: every word past a gate is that one tier.
import type { SkillId } from '@readquest/shared';
import type { Services } from '../services';

export interface GateDef {
  id: string;
  skill: SkillId; // the tier that lights the gate
  word: string; // the magic word to read (decodable exactly when the tier unlocks)
  biome: string; // the land beyond
  tint: number; // biome ground colour
  x: number; // gate world position
  y: number;
}

// One gate per higher tier, along the far-east edge. Each word is that tier's
// showcase word (see progression.ts SKILL_INTRO), so it's decodable precisely
// when the gate lights.
export const GATES: GateDef[] = [
  { id: 'frost', skill: 'magic_e', word: 'cake', biome: 'Frost Peaks', tint: 0xbfe3ff, x: 2540, y: 250 },
  { id: 'shore', skill: 'vowel_team', word: 'rain', biome: 'Sandy Shore', tint: 0xf1e2a8, x: 2560, y: 640 },
  { id: 'crystal', skill: 'r_controlled', word: 'star', biome: 'Crystal Caves', tint: 0xd6c4ff, x: 2540, y: 1010 },
];

export function gateById(id: string): GateDef | undefined {
  return GATES.find((g) => g.id === id);
}

/** A gate is openable once the child has mastered (been taught) its tier. */
export function gateOpenable(services: Services, g: GateDef): boolean {
  return services.save.taught.includes(g.skill);
}
