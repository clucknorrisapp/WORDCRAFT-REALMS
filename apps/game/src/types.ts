import type { Evidence, GameEvent, SkillId } from '@readquest/shared';

export const QuestStep = {
  INTRO_SIGNS: 0,
  GATHER_BUILD: 1,
  MEET_MAYOR: 2,
  PATH_CHOICE: 3,
  CAVE_DOOR: 4,
  HUNT: 5,
  RETURN_MAYOR: 6,
  BUILD_COOP: 7,
  CHEST: 8,
  FREE_PLAY: 9,
} as const;
export type QuestStepId = (typeof QuestStep)[keyof typeof QuestStep];

export interface SettingsData {
  micEnabled: boolean;
  narrationRate: number; // 0.7–1.3
  textScale: number; // 0.9–1.4
}

export interface SaveData {
  v: 1;
  childId: string;
  avatar: number | null;
  dragonName: string | null; // 'rex' | 'ash' | 'chip' | 'dash'
  dragonLevel: number;
  dragonXp: number;
  questStep: QuestStepId;
  wood: number;
  stone: number;
  eggs: number;
  gems: number;
  signsRead: string[];
  hensFound: string[]; // 'shed' | 'rock' | 'log'
  wallsBuilt: number[];
  coopStage: number; // 0–3
  taught: SkillId[];
  evidence: Evidence[];
  events: GameEvent[];
  firstSessionAt: number;
  settings: SettingsData;
}

export const DRAGON_NAMES = ['rex', 'ash', 'chip', 'dash'] as const;
export const DRAGON_TINTS: Record<string, number> = {
  rex: 0xffb3a7, // warm red-ish over mint
  ash: 0xbfc6cc, // soft gray
  chip: 0xffd48a, // golden
  dash: 0xa7c8ff, // blue
};
