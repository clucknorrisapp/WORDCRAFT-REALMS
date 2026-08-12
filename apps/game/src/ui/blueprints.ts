// Blueprint Quests (Phase 2.3) — the answer to "why build?". A blueprint table
// hands out little plans drawn as faint ghost blocks on the grass. The child
// accepts a plan by READING its decodable name, then fills each ghost cell with
// the matching block (reading the block's word to earn it) until the plan snaps
// together into a real, working structure that pays out and hatches a creature.
import { validateText } from '@readquest/content';
import type { Services } from '../services';

export interface BlueprintDef {
  id: string;
  name: string; // decodable plan name — read to accept (a reading-for-meaning moment)
  icon: string;
  block: string; // blockId that fills every cell (its word is read to earn it)
  origin: [number, number]; // world-tile of the plan's top-left corner
  shape: Array<[number, number]>; // cell offsets (tx, ty) from origin
  gems: number; // reward paid on completion
  pet: string; // species that hatches when the plan finishes (a living payoff)
  praise: string; // proud spoken read-back on completion
}

// Anchored in the open south meadow, between the village and the forest, on clear
// grass. One plan builds at a time; finished structures persist in worldBuild.
//
// The list climbs the reading ladder: the three base plans are always buildable,
// then a NEW plan unlocks at each higher tier (its name — and its fill block —
// decodable exactly when that tier is mastered). So the build loop never runs
// dry for a strong reader: master a sound, earn a new plan to build. Every plan
// past 'hut' sits in a lower meadow row (tiles y22–27), clear of every prop.
export const BLUEPRINTS: BlueprintDef[] = [
  { id: 'den', name: 'den', icon: '🛖', block: 'log', origin: [15, 18], shape: [[0, 0], [1, 0], [0, 1], [1, 1]], gems: 1, pet: 'pup', praise: 'You made a den!' },
  { id: 'pen', name: 'pen', icon: '🚧', block: 'rock', origin: [18, 18], shape: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]], gems: 2, pet: 'kid', praise: 'You made a pen!' },
  { id: 'hut', name: 'hut', icon: '🏠', block: 'mud', origin: [23, 18], shape: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], gems: 2, pet: 'cub', praise: 'You made a hut!' },
  // ── Higher tiers: one fresh plan unlocks per mastered sound ─────────────────
  { id: 'nest', name: 'nest', icon: '🪺', block: 'nest', origin: [14, 22], shape: [[0, 0], [1, 0], [0, 1], [1, 1]], gems: 3, pet: 'chick', praise: 'You made a nest!' }, // blend_end (st)
  { id: 'cave', name: 'cave', icon: '🕳️', block: 'cave', origin: [17, 22], shape: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]], gems: 3, pet: 'cub', praise: 'You made a cave!' }, // magic_e
  { id: 'boat', name: 'boat', icon: '🛶', block: 'boat', origin: [20, 22], shape: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], gems: 4, pet: 'duck', praise: 'You made a boat!' }, // vowel_team (oa)
  { id: 'star', name: 'star', icon: '⭐', block: 'star', origin: [14, 25], shape: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], gems: 4, pet: 'foal', praise: 'You made a star!' }, // r_controlled (ar)
];

export function blueprintById(id: string): BlueprintDef | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}

/** The next plan the child hasn't built yet AND can read the name of — so a
 *  higher-tier plan stays hidden until its sound is mastered, then fades in as
 *  the reward for that tier. Null when there's nothing new to build right now
 *  (either all done, or the next plan's tier isn't unlocked yet). */
export function nextBlueprint(services: Services): BlueprintDef | null {
  const done = new Set(services.save.blueprintsDone ?? []);
  const taught = services.save.taught;
  return BLUEPRINTS.find((b) => !done.has(b.id) && validateText(b.name, taught).ok) ?? null;
}
