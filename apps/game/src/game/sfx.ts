// The Sound Engine — a tiny procedural Web Audio SFX kit. Half of Minecraft's
// feel is its sound, and the game had none. Every effect is a few oscillators +
// noise bursts on the SAME AudioContext the voice layer already unlocks inside a
// user gesture, so it works on iPad Safari from the first tap. These are game
// SFX layered UNDER the ElevenLabs narration, never a replacement for it.
//
// Design intent (from the plan): the world thunks/pops/dings on touch, but the
// bright ASCENDING chime is reserved for READING wins and climbs a step per word
// in a streak — so the child's ear learns "reading is the happy sound".
import { sharedAudioContext } from '@readquest/voice';

let master: GainNode | null = null;
let enabled = true;
let volume = 0.6;

function ctx(): AudioContext | null {
  const c = sharedAudioContext();
  if (!c) return null;
  if (!master || master.context !== c) {
    master = c.createGain();
    master.gain.value = volume;
    master.connect(c.destination);
  }
  return c;
}

/** Wire the kit to the child's settings (call on boot + when toggled). */
export function configureSfx(opts: { enabled?: boolean; volume?: number }): void {
  if (opts.enabled != null) enabled = opts.enabled;
  if (opts.volume != null) {
    volume = opts.volume;
    if (master) master.gain.value = volume;
  }
}

function live(): AudioContext | null {
  if (!enabled) return null;
  const c = ctx();
  return c && c.state === 'running' ? c : null;
}

// ── primitives ──────────────────────────────────────────────────────────────
interface ToneOpts {
  f0: number; f1?: number; dur: number; type?: OscillatorType;
  gain?: number; delay?: number; attack?: number;
}
function tone(o: ToneOpts): void {
  const c = live();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    const g = c.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  } catch {
    /* audio can throw on some platforms — never let SFX break gameplay */
  }
}

let noiseBuf: AudioBuffer | null = null;
function whiteNoise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.4);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 22050;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic → no flicker
    d[i] = (seed / 0x3fffffff) - 1;
  }
  noiseBuf = buf;
  return buf;
}
interface NoiseOpts { dur: number; gain?: number; type?: BiquadFilterType; freq?: number; q?: number; delay?: number; }
function noise(o: NoiseOpts): void {
  const c = live();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    const filt = c.createBiquadFilter();
    filt.type = o.type ?? 'bandpass';
    filt.frequency.value = o.freq ?? 1400;
    filt.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    const peak = o.gain ?? 0.25;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.03);
  } catch {
    /* ignore */
  }
}

// ── the kit ─────────────────────────────────────────────────────────────────
/** Woody hit on a gather node (each tap while mining). */
export function sfxHit(): void {
  tone({ f0: 190, f1: 120, dur: 0.09, type: 'triangle', gain: 0.28 });
  noise({ dur: 0.05, freq: 500, gain: 0.14, type: 'lowpass' });
}
/** A node bursts open — crack + little whoosh. */
export function sfxCrack(): void {
  noise({ dur: 0.14, freq: 1800, gain: 0.3, q: 0.6 });
  tone({ f0: 620, f1: 180, dur: 0.16, type: 'sawtooth', gain: 0.14 });
}
/** Loot pops off and flies to the bag. */
export function sfxPop(): void {
  tone({ f0: 520, f1: 940, dur: 0.09, type: 'sine', gain: 0.3, attack: 0.004 });
}
/** A block thunks down onto the grid. */
export function sfxPlace(): void {
  tone({ f0: 150, f1: 96, dur: 0.1, type: 'square', gain: 0.22 });
  noise({ dur: 0.045, freq: 320, gain: 0.1, type: 'lowpass' });
}
/** A block is erased — crack then a little shatter. */
export function sfxShatter(): void {
  noise({ dur: 0.16, freq: 2600, gain: 0.24, q: 0.5 });
}
/** Reward / coin — a happy two-note ding. */
export function sfxReward(): void {
  tone({ f0: 880, dur: 0.1, type: 'sine', gain: 0.3 });
  tone({ f0: 1320, dur: 0.16, type: 'sine', gain: 0.28, delay: 0.09 });
}
/** The dragon's warm little "boing" of joy. */
export function sfxDragon(): void {
  tone({ f0: 300, f1: 560, dur: 0.12, type: 'sine', gain: 0.26 });
  tone({ f0: 560, f1: 420, dur: 0.12, type: 'sine', gain: 0.2, delay: 0.1 });
}
/** A gentle falling "aww" on a miss — soft and kind, NEVER a buzzer. */
export function sfxMiss(): void {
  tone({ f0: 420, f1: 300, dur: 0.28, type: 'sine', gain: 0.16, attack: 0.02 });
}
/** Something new opens up (block/spell/tier unlocked) — a shimmer. */
export function sfxUnlock(): void {
  tone({ f0: 520, f1: 1040, dur: 0.32, type: 'triangle', gain: 0.22 });
  noise({ dur: 0.3, freq: 5000, gain: 0.06, type: 'highpass', delay: 0.02 });
}

// The reading chime: a bright bell that CLIMBS a pentatonic scale, one step per
// correct decode in a streak. A miss (or a pause) resets it — so the child
// literally hears themselves getting better as they read.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
let streak = 0;
/** Play the next rung of the reading chime. Call on every correct decode. */
export function sfxReadWin(): void {
  const f = PENTA[Math.min(streak, PENTA.length - 1)]!;
  tone({ f0: f, dur: 0.5, type: 'sine', gain: 0.26 });
  tone({ f0: f * 2, dur: 0.35, type: 'triangle', gain: 0.08 }); // bell overtone
  streak += 1;
}
/** Reset the reading streak (a miss, or a fresh activity). */
export function resetReadStreak(): void {
  streak = 0;
}
/** Big milestone (book finished, tier mastered, Reader Level-up) — a fanfare. */
export function sfxFanfare(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone({ f0: f, dur: 0.5, type: 'triangle', gain: 0.24, delay: i * 0.11 }));
  tone({ f0: 1567.98, dur: 0.6, type: 'sine', gain: 0.18, delay: 0.44 });
  noise({ dur: 0.5, freq: 6000, gain: 0.05, type: 'highpass', delay: 0.44 });
}
