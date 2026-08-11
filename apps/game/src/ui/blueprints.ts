// Blueprint Quests (Phase 2.3) — the answer to "why build?". A blueprint table
// hands out little plans drawn as faint ghost blocks on the grass. The child
// accepts a plan by READING its decodable name, then fills each ghost cell with
// the matching block (reading the block's word to earn it) until the plan snaps
// together into a real, working structure that pays out and hatches a creature.
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
export const BLUEPRINTS: BlueprintDef[] = [
  { id: 'den', name: 'den', icon: '🛖', block: 'log', origin: [15, 18], shape: [[0, 0], [1, 0], [0, 1], [1, 1]], gems: 1, pet: 'pup', praise: 'You made a den!' },
  { id: 'pen', name: 'pen', icon: '🚧', block: 'rock', origin: [18, 18], shape: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]], gems: 2, pet: 'kid', praise: 'You made a pen!' },
  { id: 'hut', name: 'hut', icon: '🏠', block: 'mud', origin: [23, 18], shape: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], gems: 2, pet: 'cub', praise: 'You made a hut!' },
];

export function blueprintById(id: string): BlueprintDef | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}

/** The next plan the child hasn't built yet (null once every plan is done). */
export function nextBlueprint(services: Services): BlueprintDef | null {
  const done = new Set(services.save.blueprintsDone ?? []);
  return BLUEPRINTS.find((b) => !done.has(b.id)) ?? null;
}
