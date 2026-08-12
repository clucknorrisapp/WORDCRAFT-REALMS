import { QuestStep, type SaveData } from './types';
import { curriculum } from '@readquest/content';
import { COUNTABLE_TYPES } from '@readquest/shared';

const KEY = 'readquest_save_v1';

// The evidence log grows one row per reading rep — the only unbounded array in
// the save. A child playing daily for a year would otherwise blow past the
// browser's ~5MB storage quota and silently lose everything. Cap it to a rolling
// window big enough that the learning engine's replay (spaced-repetition state,
// which only needs recent per-word history) is unaffected, while the lifetime
// `readCount` keeps "words read" and reading deeds exact. On a real quota error
// we trim harder still and retry — a smaller save always beats a lost one.
const MAX_EVIDENCE = 1200;
const EMERGENCY_EVIDENCE = 300;

/** Count the countable (reading-interaction) rows in an evidence log. */
function countableReads(evidence: SaveData['evidence']): number {
  return evidence.filter((e) => COUNTABLE_TYPES.includes(e.challengeType)).length;
}

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
    treasureClaimed: false,
    booksRead: [],
    blocksUnlocked: [],
    build: {},
    worldBuild: {},
    buildPlaced: 0,
    glintsFound: [],
    deedsEarned: [],
    lastGiftDay: null,
    job: null,
    jobsDone: 0,
    pets: [],
    canvasLevel: 0,
    blueprint: null,
    blueprintsDone: [],
    firefliesCaught: 0,
    tamed: [],
    gatesOpened: [],
    pickLevel: 0,
    dragonColor: null,
    mapSeen: [],
    mapClaimed: [],
    summoned: [],
    beaconLit: 0,
    giantShields: 0,
    giantDefeated: false,
    furnaceCharge: 0,
    coachDone: false,
    dragonColorsOwned: [],
    petCare: {},
    readCount: 0,
    taught: [...curriculum.initialTaught],
    evidence: [],
    events: [],
    firstSessionAt: Date.now(),
    settings: {
      micEnabled: true,
      micStrictness: 'gentle',
      narrationRate: 1,
      textScale: 1,
      sfxEnabled: true,
      dyslexiaFont: false,
      highContrast: false,
      // Honor the OS "reduce motion" preference out of the box.
      reducedMotion:
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.v !== 1) return freshSave();
    const fresh = freshSave();
    // Deep-merge settings so saves from older builds pick up new keys.
    const merged = { ...fresh, ...parsed, settings: { ...fresh.settings, ...parsed.settings } };
    // Backfill the lifetime read counter from the full history the first time
    // (saves from before the counter existed), THEN cap the array — so a long-
    // running save is bounded immediately without ever undercounting a milestone.
    if (parsed.readCount === undefined) merged.readCount = countableReads(merged.evidence);
    if (merged.evidence.length > MAX_EVIDENCE) merged.evidence = merged.evidence.slice(-MAX_EVIDENCE);
    return merged;
  } catch {
    return freshSave();
  }
}

/** Write the save now, keeping the evidence log bounded. Proactively trims to
 *  the rolling window before writing; on a real quota error, trims much harder
 *  and retries once so the child's progress is saved rather than lost. */
function writeNow(save: SaveData): void {
  if (save.evidence.length > MAX_EVIDENCE) save.evidence = save.evidence.slice(-MAX_EVIDENCE);
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full/blocked. Shed the bulk of the (already replayed) history and
    // retry — a smaller save beats losing the child's progress entirely.
    try {
      if (save.evidence.length > EMERGENCY_EVIDENCE) save.evidence = save.evidence.slice(-EMERGENCY_EVIDENCE);
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      /* still failing — gameplay continues, state stays in memory */
    }
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;
export function persistSave(save: SaveData): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    writeNow(save);
  }, 250);
}

/** Write the save RIGHT NOW, bypassing the debounce. Call this the instant the
 *  page might be frozen or discarded (tab hidden, iPad home button, pagehide) —
 *  a debounced write can lose the last few moments of a child's progress. */
export function flushSave(save: SaveData): void {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  writeNow(save);
}

export function wipeSave(): void {
  localStorage.removeItem(KEY);
}
