// @readquest/voice — all speech OUTPUT flows through speak(). Two adapters:
//  1. Pre-generated clips (ElevenLabs via Higgsfield, batch-generated at
//     authoring time) — the shipping path. Word timings are estimated from
//     clip duration proportional to word length (good enough until the
//     alignment pipeline lands; see architecture §8).
//  2. Browser speechSynthesis — the zero-cost fallback so the game is fully
//     voiced even before clips are generated for a line.
// The game never knows which adapter spoke.

import type { SpeakHandle, SpeakRequest, VoiceService } from '@readquest/shared';

export interface VoiceManifest {
  /** audio id (usually the line id or `w_<word>`) → url */
  clips: Record<string, string>;
}

interface HandleState {
  boundaryCbs: Array<(i: number) => void>;
  endCbs: Array<() => void>;
  cancels: Array<() => void>;
  ended: boolean;
}

function makeHandle(): { handle: SpeakHandle; state: HandleState } {
  const state: HandleState = { boundaryCbs: [], endCbs: [], cancels: [], ended: false };
  const handle: SpeakHandle = {
    onWordBoundary(cb) {
      state.boundaryCbs.push(cb);
    },
    onEnd(cb) {
      if (state.ended) cb();
      else state.endCbs.push(cb);
    },
    stop() {
      finish(state, false);
    },
  };
  return { handle, state };
}

function emitBoundary(state: HandleState, i: number): void {
  for (const cb of state.boundaryCbs) cb(i);
}

function finish(state: HandleState, notify = true): void {
  if (state.ended) return;
  state.ended = true;
  for (const c of state.cancels) c();
  if (notify) for (const cb of state.endCbs) cb();
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
}

// ── Synthesis voice selection ───────────────────────────────────────────────
// Browsers load their voice list asynchronously; asking once (often empty)
// silently lands on the default robot voice. Cache the list, refresh on
// voiceschanged, and prefer the natural voices real devices ship with.
let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) cachedVoices = list;
}

function initVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    if (window.speechSynthesis.onvoiceschanged === null) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  } catch {
    /* voiceless environment */
  }
}

const PREFERRED_VOICES = [
  'Samantha', // iOS/macOS — warm, natural
  'Google US English',
  'Microsoft Aria',
  'Microsoft Jenny',
  'Karen',
  'Moira',
  'Tessa',
  'Daniel',
  'Alex',
];

function pickSynthVoice(): SpeechSynthesisVoice | undefined {
  const en = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (en.length === 0) return undefined;
  for (const name of PREFERRED_VOICES) {
    const hit = en.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return en.find((v) => v.localService) ?? en[0];
}

/** Distribute a duration across words proportional to length (+ a floor). */
export function estimateWordTimings(text: string, totalMs: number): number[] {
  const ws = words(text);
  if (ws.length === 0) return [];
  const weights = ws.map((w) => 2 + w.replace(/[^a-zA-Z]/g, '').length);
  const sum = weights.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const w of weights) {
    starts.push((acc / sum) * totalMs);
    acc += w;
  }
  return starts;
}

class ClipPlayback {
  constructor(
    private url: string,
    private text: string,
    private rate: number,
    private state: HandleState,
  ) {}

  start(): void {
    const audio = new Audio(this.url);
    audio.playbackRate = this.rate;
    const timers: ReturnType<typeof setTimeout>[] = [];
    this.state.cancels.push(() => {
      audio.pause();
      timers.forEach(clearTimeout);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (this.state.ended) return;
      const totalMs = (audio.duration * 1000) / this.rate;
      estimateWordTimings(this.text, totalMs).forEach((startMs, i) => {
        timers.push(setTimeout(() => emitBoundary(this.state, i), startMs));
      });
      // Safety: never let a stuck 'ended' event hang a reading moment.
      timers.push(setTimeout(() => finish(this.state), totalMs + 1500));
    });
    audio.addEventListener('ended', () => finish(this.state));
    audio.addEventListener('error', () => finish(this.state));
    void audio.play().catch(() => finish(this.state));
  }
}

class SynthPlayback {
  constructor(
    private text: string,
    private voice: string,
    private rate: number,
    private state: HandleState,
  ) {}

  /** Voiceless fallback: emit estimated boundaries, then end. Never hangs. */
  private estimated(perWordMs: number): void {
    const ws = words(this.text);
    const timers = ws.map((_, i) => setTimeout(() => emitBoundary(this.state, i), i * perWordMs));
    timers.push(setTimeout(() => finish(this.state), ws.length * perWordMs + 60));
    this.state.cancels.push(() => timers.forEach(clearTimeout));
  }

  start(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.estimated(10); // non-browser host (tests)
      return;
    }

    const utter = new SpeechSynthesisUtterance(this.text);
    utter.rate = Math.max(0.5, Math.min(2, this.rate * 0.9)); // slightly slow for kids
    utter.pitch = this.voice === 'wizard' ? 0.75 : this.voice === 'mayor_hen' ? 1.35 : 1.02;
    const chosen = pickSynthVoice();
    if (chosen) utter.voice = chosen;

    // Word offsets for boundary → word index mapping.
    const offsets: number[] = [];
    let idx = 0;
    for (const w of this.text.split(/(\s+)/)) {
      if (/[a-zA-Z]/.test(w)) offsets.push(idx);
      idx += w.length;
    }

    let sawBoundary = false;
    utter.addEventListener('boundary', (e) => {
      sawBoundary = true;
      let wi = 0;
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        if (off !== undefined && e.charIndex >= off) wi = i;
      }
      emitBoundary(this.state, wi);
    });
    utter.addEventListener('end', () => finish(this.state));
    utter.addEventListener('error', () => finish(this.state));

    // Safari fires no boundary events — estimate instead.
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        if (sawBoundary || this.state.ended) return;
        const ws = words(this.text);
        const perWord = 320 / utter.rate;
        ws.forEach((_, i) => {
          timers.push(setTimeout(() => !sawBoundary && emitBoundary(this.state, i), i * perWord));
        });
      }, 350),
    );

    // Safety: some browsers (or voiceless environments) never fire 'end'.
    timers.push(setTimeout(() => finish(this.state), words(this.text).length * 650 + 4500));

    this.state.cancels.push(() => {
      timers.forEach(clearTimeout);
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* engine gone — nothing to cancel */
      }
    });
    try {
      window.speechSynthesis.cancel(); // never queue behind a previous line
      window.speechSynthesis.speak(utter);
    } catch {
      // A broken/blocked synthesis engine must never hang a reading moment.
      timers.forEach(clearTimeout);
      this.estimated(300);
    }
  }
}

export function createVoiceService(manifest: VoiceManifest): VoiceService {
  initVoices();
  return {
    hasClip(id: string): boolean {
      return id in manifest.clips;
    },
    speak(req: SpeakRequest): SpeakHandle {
      // Contract: speak() never throws, and every handle always reaches onEnd.
      const { handle, state } = makeHandle();
      const clipUrl = req.lineId ? manifest.clips[req.lineId] : undefined;
      const rate = req.rate ?? 1;
      try {
        if (clipUrl) new ClipPlayback(clipUrl, req.text, rate, state).start();
        else new SynthPlayback(req.text, req.voice, rate, state).start();
      } catch {
        const ws = words(req.text);
        ws.forEach((_, i) => setTimeout(() => emitBoundary(state, i), 250 * i));
        setTimeout(() => finish(state), 250 * ws.length + 200);
      }
      return handle;
    },
  };
}
