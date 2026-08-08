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
      // A stopped playback IS done — resolve waiters so `await …done` (built on
      // onEnd) never hangs, which would freeze the awaiting reading moment.
      finish(state, true);
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
    private voice: string,
  ) {}

  private fellBack = false;

  start(): void {
    const audio = new Audio(this.url);
    audio.playbackRate = this.rate;
    const timers: ReturnType<typeof setTimeout>[] = [];
    this.state.cancels.push(() => {
      audio.pause();
      timers.forEach(clearTimeout);
    });
    // Unconditional safety net: if metadata never fires (and thus no 'ended'),
    // a slow word estimate still ends the moment. Refined once duration loads.
    timers.push(setTimeout(() => finish(this.state), words(this.text).length * 700 + 6000));
    audio.addEventListener('loadedmetadata', () => {
      if (this.state.ended) return;
      const totalMs = (audio.duration * 1000) / this.rate;
      estimateWordTimings(this.text, totalMs).forEach((startMs, i) => {
        timers.push(setTimeout(() => emitBoundary(this.state, i), startMs));
      });
      timers.push(setTimeout(() => finish(this.state), totalMs + 1500));
    });
    audio.addEventListener('ended', () => finish(this.state));
    audio.addEventListener('error', () => this.fallback(timers));
    // If the browser blocks playback (mobile autoplay policy before the audio
    // is unlocked), don't go silent — fall back to speech synthesis so the
    // child always hears the line.
    void audio.play().catch(() => this.fallback(timers));
  }

  private fallback(timers: ReturnType<typeof setTimeout>[]): void {
    if (this.state.ended || this.fellBack) return; // error + play().catch can both fire
    this.fellBack = true;
    timers.forEach(clearTimeout);
    new SynthPlayback(this.text, this.voice, this.rate, this.state).start();
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

// ── Mobile audio unlock ─────────────────────────────────────────────────────
// iOS Safari (and some mobile Chrome) block HTMLAudio/speechSynthesis until a
// clip is played inside a real user gesture. We prime BOTH engines on the
// first pointer/touch: a silent clip for HTMLAudio, a muted utterance for
// synthesis. After this, clips that play later (after awaits) are allowed.
let audioUnlocked = false;
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQAAAAA=';

export function unlockAudio(): void {
  if (audioUnlocked || typeof window === 'undefined') return;
  audioUnlocked = true;
  try {
    const a = new Audio(SILENT_WAV);
    a.volume = 0;
    void a.play().then(() => a.pause()).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}

function installUnlockOnFirstGesture(): void {
  if (typeof window === 'undefined') return;
  const handler = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('touchstart', handler, true);
    window.removeEventListener('click', handler, true);
  };
  window.addEventListener('pointerdown', handler, true);
  window.addEventListener('touchstart', handler, true);
  window.addEventListener('click', handler, true);
}

export function createVoiceService(manifest: VoiceManifest): VoiceService {
  initVoices();
  installUnlockOnFirstGesture();
  // The game speaks one line at a time (each awaited), so a new speak()
  // supersedes the previous — stopping it prevents layered/echoing audio when
  // a child mashes the 🔊 replay button. Stopping resolves the old .done too.
  let current: SpeakHandle | null = null;
  return {
    hasClip(id: string): boolean {
      return id in manifest.clips;
    },
    speak(req: SpeakRequest): SpeakHandle {
      // Contract: speak() never throws, and every handle always reaches onEnd.
      current?.stop();
      const { handle, state } = makeHandle();
      current = handle;
      const clipUrl = req.lineId ? manifest.clips[req.lineId] : undefined;
      const rate = req.rate ?? 1;
      try {
        if (clipUrl) new ClipPlayback(clipUrl, req.text, rate, state, req.voice).start();
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
