// Read-to-Tame creatures (Phase 3.3) — the roster IS the phonics ladder. Shy
// critters roam the world; walk up and READ a creature's decodable name to tame
// it, and it comes to live on your farm. A creature only appears once its name
// is decodable at the child's tier, so every animal the child can meet is one
// they can read — and mastering a new tier makes new species roam the land.
import { validateText } from '@readquest/content';
import type { Services } from '../services';

export interface Creature {
  id: string;
  name: string; // decodable corpus word — reading it tames the creature
  emoji: string;
}

// Ordered along the reading ladder: short vowels → digraph → blends → vowel
// teams → bossy R. `validateText` gates each one at exactly its tier.
export const CREATURES: Creature[] = [
  { id: 'cat', name: 'cat', emoji: '🐱' },
  { id: 'dog', name: 'dog', emoji: '🐶' },
  { id: 'pig', name: 'pig', emoji: '🐷' },
  { id: 'fox', name: 'fox', emoji: '🦊' },
  { id: 'bug', name: 'bug', emoji: '🐛' },
  { id: 'bat', name: 'bat', emoji: '🦇' },
  { id: 'fish', name: 'fish', emoji: '🐟' },
  { id: 'moth', name: 'moth', emoji: '🦋' }, // digraph th
  { id: 'frog', name: 'frog', emoji: '🐸' },
  { id: 'crab', name: 'crab', emoji: '🦀' },
  { id: 'mule', name: 'mule', emoji: '🐴' }, // magic e
  { id: 'goat', name: 'goat', emoji: '🐐' },
  { id: 'toad', name: 'toad', emoji: '🐢' },
  { id: 'seal', name: 'seal', emoji: '🦭' }, // vowel team ea
  { id: 'bird', name: 'bird', emoji: '🐦' },
  { id: 'shark', name: 'shark', emoji: '🦈' },
  { id: 'owl', name: 'owl', emoji: '🦉' }, // diphthong ow
  { id: 'cow', name: 'cow', emoji: '🐄' }, // diphthong ow
];

export function creatureById(id: string): Creature | undefined {
  return CREATURES.find((c) => c.id === id);
}

/** Creatures whose name the child can read now (decodable at the taught set). */
export function readableCreatures(services: Services): Creature[] {
  return CREATURES.filter((c) => validateText(c.name, services.save.taught).ok);
}

/** Wild creatures still roaming: readable but not yet tamed. */
export function wildCreatures(services: Services): Creature[] {
  const tamed = new Set(services.save.tamed ?? []);
  return readableCreatures(services).filter((c) => !tamed.has(c.id));
}
