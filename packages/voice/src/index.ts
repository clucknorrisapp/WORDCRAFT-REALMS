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

// ── Web Audio clip playback (primary) ───────────────────────────────────────
// HTMLAudio clips obey the iOS ringer/silent switch and unlock unreliably —
// on iPhone this made the ElevenLabs clips silent, falling back to robotic
// synthesis. The Web Audio API ignores the silent switch and unlocks cleanly
// via AudioContext.resume() inside a gesture, so real voices play. Falls back
// to HTMLAudio, then to synthesis.
type AudioCtx = AudioContext;
let sharedCtx: AudioCtx | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer>>();

/** The shared, gesture-unlocked AudioContext — reused by the SFX kit so game
 *  sounds and narration share one context (and one iOS unlock). May be null on
 *  servers or before the first user gesture. */
export function sharedAudioContext(): AudioContext | null {
  return getAudioContext();
}

function getAudioContext(): AudioCtx | null {
  if (typeof window === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

async function loadBuffer(ctx: AudioCtx, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  let p = inflight.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      bufferCache.set(url, buf);
      inflight.delete(url);
      return buf;
    })();
    inflight.set(url, p);
  }
  return p;
}

class WebAudioClip {
  private fellBack = false;
  constructor(
    private url: string,
    private text: string,
    private rate: number,
    private state: HandleState,
    private voice: string,
  ) {}

  start(): void {
    const ctx = getAudioContext();
    if (!ctx) {
      this.fallback();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    void (async () => {
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        // If the context is STILL not running (iOS sometimes won't resume until
        // the next gesture), playing now would be silent — hand off to HTMLAudio
        // instead of pretending we spoke.
        if (ctx.state !== 'running') {
          this.fallback();
          return;
        }
        const buf = await loadBuffer(ctx, this.url);
        if (this.state.ended) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = this.rate;
        src.connect(ctx.destination);
        const totalMs = (buf.duration * 1000) / this.rate;
        estimateWordTimings(this.text, totalMs).forEach((startMs, i) => {
          timers.push(setTimeout(() => emitBoundary(this.state, i), startMs));
        });
        timers.push(setTimeout(() => finish(this.state), totalMs + 1200));
        src.onended = () => finish(this.state);
        this.state.cancels.push(() => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
          timers.forEach(clearTimeout);
        });
        src.start();
        voiceDiag.webaudio += 1;
      } catch (e) {
        voiceDiag.lastError = `webaudio: ${(e as Error).message}`.slice(0, 80);
        timers.forEach(clearTimeout);
        this.fallback();
      }
    })();
  }

  private fallback(): void {
    if (this.state.ended || this.fellBack) return;
    this.fellBack = true;
    new ClipPlayback(this.url, this.text, this.rate, this.state, this.voice).start();
  }
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
    void audio.play().then(() => (voiceDiag.htmlaudio += 1)).catch(() => this.fallback(timers));
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
      voiceDiag.silent += 1;
      this.estimated(10); // non-browser host (tests)
      return;
    }
    voiceDiag.synth += 1;

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
let warmedOnce = false;
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQAAAAA=';

// Live audio diagnostics — surfaced on the parent screen so a device that
// still can't play can be diagnosed remotely.
export const voiceDiag = {
  webaudio: 0,
  htmlaudio: 0,
  synth: 0,
  silent: 0,
  lastError: '' as string,
};
export function voiceDiagnostics(): {
  ctx: string;
  webaudio: number;
  htmlaudio: number;
  synth: number;
  silent: number;
  lastError: string;
} {
  return {
    ctx: sharedCtx ? sharedCtx.state : 'none',
    webaudio: voiceDiag.webaudio,
    htmlaudio: voiceDiag.htmlaudio,
    synth: voiceDiag.synth,
    silent: voiceDiag.silent,
    lastError: voiceDiag.lastError,
  };
}

/**
 * Resume the AudioContext and warm HTMLAudio/synthesis. The resume is retried
 * on EVERY early gesture (not just the first) because iOS may not move the
 * context to 'running' on the first attempt — clips play silently until it does.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'running') {
      void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch (e) {
    voiceDiag.lastError = `unlock: ${(e as Error).message}`;
  }
  if (warmedOnce) return;
  warmedOnce = true;
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
    // Keep listening until the context actually reaches 'running' — one tap
    // may not be enough on iOS.
    if (sharedCtx && sharedCtx.state === 'running') {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('touchend', handler, true);
      window.removeEventListener('click', handler, true);
    }
  };
  window.addEventListener('pointerdown', handler, true);
  window.addEventListener('touchend', handler, true);
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
      // speak() is nearly always called from a user gesture (a 🔊 tap, a card
      // tap, a "Keep going" press). Resume the AudioContext RIGHT HERE, inside
      // that gesture's synchronous turn, so the premium clip actually plays
      // instead of silently failing and falling back to robotic synthesis
      // (the "speaker wasn't working, then it said the word wrong" bug).
      unlockAudio();
      current?.stop();
      const { handle, state } = makeHandle();
      current = handle;
      const clipUrl = req.lineId ? manifest.clips[req.lineId] : undefined;
      const rate = req.rate ?? 1;
      try {
        // Web Audio first (plays through the silent switch, unlocks reliably),
        // then HTMLAudio, then synthesis — each falls back to the next.
        if (clipUrl) new WebAudioClip(clipUrl, req.text, rate, state, req.voice).start();
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
