import { QuestStep, type SaveData } from './types';
import { curriculum } from '@readquest/content';

const KEY = 'readquest_save_v1';

export function freshSave(): SaveData {
  return {
    v: 1,
    childId: `local_${Math.floor(Math.random() * 1e9)}`,
    avatar: null,
    dragonName: null,
    dragonLevel: 0,
    dragonXp: 0,
    questStep: QuestStep.INTRO_SIGNS,
    wood: 0,
    stone: 0,
    eggs: 0,
    gems: 0,
    signsRead: [],
    hensFound: [],
    wallsBuilt: [],
    coopStage: 0,
    taught: [...curriculum.initialTaught],
    evidence: [],
    events: [],
    firstSessionAt: Date.now(),
    settings: { micEnabled: true, narrationRate: 1, textScale: 1 },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.v !== 1) return freshSave();
    return { ...freshSave(), ...parsed };
  } catch {
    return freshSave();
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;
export function persistSave(save: SaveData): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      /* storage full/blocked — gameplay continues, evidence stays in memory */
    }
  }, 250);
}

export function wipeSave(): void {
  localStorage.removeItem(KEY);
}
