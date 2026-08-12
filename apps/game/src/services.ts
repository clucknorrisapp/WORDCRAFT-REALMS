// Composition root — the only place where all modules meet (architecture §5.1:
// the game client composes everything but implements no pedagogy).
import { createAnalytics, type Analytics } from '@readquest/analytics';
import { curriculum, line, sayAs, validateText } from '@readquest/content';
import { LearningEngine } from '@readquest/learning-engine';
import {
  COUNTABLE_TYPES,
  newEventId,
  type ChallengeType,
  type Evidence,
  type SkillId,
  type SpeakHandle,
  type SpeechService,
  type VoiceService,
} from '@readquest/shared';
import { createSpeechService } from '@readquest/speech';
import { createVoiceService, type VoiceManifest } from '@readquest/voice';
import { persistSave, flushSave } from './save';
import { QuestStep } from './types';
import type { SaveData } from './types';

export interface Services {
  save: SaveData;
  engine: LearningEngine;
  voice: VoiceService;
  speech: SpeechService;
  analytics: Analytics;
  persist(): void;
  /** Write the save synchronously right now (bypass the debounce) — for tab-hide
   *  / pagehide so a child never loses their last few moments of progress. */
  flush(): void;
  /** Speak an authored line (premium clip when present, synthesis otherwise). */
  speakLine(lineId: string, textOverride?: string): { handle: SpeakHandle; done: Promise<void> };
  speakText(text: string, voice?: string, rate?: number): { handle: SpeakHandle; done: Promise<void> };
  /** Speak a single word — uses the `w_<word>` premium clip when present. */
  speakWord(text: string, rate?: number): { handle: SpeakHandle; done: Promise<void> };
  recordEvidence(partial: EvidencePartial): Evidence;
  readingInteractions(): number;
  /** Register the handler fired when free-play mastery unlocks a new phonics
   *  tier (curriculum progression). The host shows the "New Sounds!" moment. */
  setAdvanceHandler(cb: (skill: SkillId) => void): void;
}

export interface EvidencePartial {
  challengeType: ChallengeType;
  skillIds: string[];
  wordId?: string;
  lineId?: string;
  channel: 'recognition' | 'production';
  correct: boolean;
  attemptIndex: number;
  hintsUsed: number;
  audioRequested: boolean;
  micUsed: boolean;
  responseMs?: number;
  seed?: number;
  speech?: Evidence['speech'];
}

export async function createServices(save: SaveData): Promise<Services> {
  let manifest: VoiceManifest = { clips: {} };
  try {
    const res = await fetch('assets/audio/manifest.json');
    if (res.ok) {
      const data = (await res.json()) as Partial<VoiceManifest>;
      manifest = { clips: data.clips ?? {} };
    }
  } catch {
    /* offline dev without manifest — synthesis covers everything */
  }

  const voice = createVoiceService(manifest);
  const speech = createSpeechService();
  const analytics = createAnalytics(save.events, () => persistSave(save));
  // Mastery state is a projection of the evidence log — replay it (architecture §7).
  const engine = LearningEngine.replay(save.taught, save.evidence);
  engine.setCurriculum(curriculum.order); // enables adaptive 70/20/10 selection

  // Curriculum progression: once free play begins, mastering the current
  // frontier of sounds unlocks the next tier (blends → …), which in turn opens
  // new decodable words, blocks and books. The world literally grows out of
  // reading better. Checked after every reading interaction; teaches at most
  // one new tier at a time, and only in free play (the scripted quest owns the
  // early curriculum, including the ST blend at the chest).
  let advanceCb: ((skill: SkillId) => void) | null = null;
  const maybeAdvanceCurriculum = () => {
    if (save.questStep !== QuestStep.FREE_PLAY) return;
    const skill = engine.nextSkillToUnlock();
    if (!skill || save.taught.includes(skill)) return;
    save.taught.push(skill);
    engine.markTaught(skill);
    analytics.log('curriculum_advanced', { skill, taughtCount: save.taught.length });
    advanceCb?.(skill);
  };

  const services: Services = {
    save,
    engine,
    voice,
    speech,
    analytics,
    persist: () => persistSave(save),
    flush: () => flushSave(save),
    speakLine(lineId, textOverride) {
      // lineId may be a synthetic clip-only id (e.g. a per-name variant like
      // ln_dragon_joins_rex) that isn't a registered line — tolerate that.
      let l: ReturnType<typeof line> | null = null;
      try {
        l = line(lineId);
      } catch {
        l = null;
      }
      const text = textOverride ?? l?.text ?? '';
      if (import.meta.env.DEV && l?.mode === 'decodable') {
        const report = validateText(text, engine.taughtSkills());
        if (!report.ok) console.warn(`[iron rule] line ${lineId}:`, report.violations);
      }
      const handle = voice.speak({
        lineId,
        text,
        voice: l?.speaker ?? 'narrator',
        rate: save.settings.narrationRate,
      });
      return { handle, done: handleDone(handle) };
    },
    speakText(text, voiceName = 'narrator', rate) {
      const handle = voice.speak({
        text,
        voice: voiceName,
        rate: rate ?? save.settings.narrationRate,
      });
      return { handle, done: handleDone(handle) };
    },
    speakWord(text, rate) {
      const handle = voice.speak({
        lineId: `w_${text.toLowerCase()}`,
        // The clip is keyed by the real word, but the synthesis fallback speaks
        // the pronunciation override (e.g. "i" → "eye") so it matches the clip.
        text: sayAs(text),
        voice: 'narrator',
        rate: rate ?? save.settings.narrationRate,
      });
      return { handle, done: handleDone(handle) };
    },
    recordEvidence(partial) {
      const e: Evidence = {
        eventId: newEventId(),
        childId: save.childId,
        at: Date.now(),
        ...partial,
      };
      engine.record(e);
      save.evidence.push(e);
      maybeAdvanceCurriculum(); // reading mastery may unlock the next phonics tier
      persistSave(save);
      return e;
    },
    readingInteractions() {
      return save.evidence.filter((e) => COUNTABLE_TYPES.includes(e.challengeType)).length;
    },
    setAdvanceHandler(cb) {
      advanceCb = cb;
    },
  };
  return services;
}

function handleDone(handle: SpeakHandle): Promise<void> {
  return new Promise((resolve) => handle.onEnd(resolve));
}
