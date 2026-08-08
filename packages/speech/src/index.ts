// @readquest/speech — all speech INPUT flows through listen(). By design
// there is no API that returns, stores, or forwards raw audio: adapters own
// the microphone for the duration of one call and report a result. "We never
// store your child's voice" is enforced by this interface's shape.
//
// The two-miss-and-open rule does NOT live here — it is interaction-layer
// policy in the game client (pillar 4), so no adapter can ever gate progress.

import type {
  AvailabilityReport,
  ListenRequest,
  ListenResult,
  SpeechService,
} from '@readquest/shared';
import { matchUtterance } from './matcher';

export { matchUtterance, normalize, phoneticKey } from './matcher';

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SpeechRecognitionCtor | null;
}

class WebSpeechAdapter implements SpeechService {
  constructor(private ctor: SpeechRecognitionCtor) {}

  async available(): Promise<AvailabilityReport> {
    let permission: AvailabilityReport['permission'] = 'undetermined';
    try {
      const status = await navigator.permissions?.query({
        name: 'microphone' as PermissionName,
      });
      if (status?.state === 'granted') permission = 'granted';
      else if (status?.state === 'denied') permission = 'denied';
    } catch {
      /* permissions API unavailable — stay undetermined */
    }
    return { supported: true, permission };
  }

  listen(req: ListenRequest): Promise<ListenResult> {
    return new Promise((resolve) => {
      let settled = false;
      let sawSpeech = false;
      let lastHeard: string | null = null;

      const rec = new this.ctor();
      rec.lang = 'en-US';
      rec.interimResults = true; // match on interim results — snappier for kids
      rec.continuous = false;
      rec.maxAlternatives = 5;

      const settle = (result: ListenResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        settle({
          status: sawSpeech ? 'no_match' : 'timeout',
          recognized: lastHeard,
          confidence: 0,
          method: 'webspeech',
        });
      }, req.timeoutMs);

      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const alternatives = e.results[i];
          if (!alternatives) continue;
          for (let j = 0; j < alternatives.length; j++) {
            const transcript = alternatives[j]?.transcript ?? '';
            if (transcript.trim().length > 0) {
              sawSpeech = true;
              lastHeard = transcript.trim();
            }
            const m = matchUtterance(transcript, req.expected, req.acceptAlso);
            if (m.match) {
              settle({
                status: 'match',
                recognized: transcript.trim(),
                confidence: m.confidence,
                method: 'webspeech',
              });
              return;
            }
          }
        }
      };

      rec.onerror = (e) => {
        const err = e.error ?? 'error';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          settle({ status: 'permission_denied', recognized: null, confidence: 0, method: 'webspeech' });
        } else if (err === 'no-speech') {
          settle({ status: 'no_speech', recognized: null, confidence: 0, method: 'webspeech' });
        } else if (err === 'aborted') {
          /* settle() already ran or timeout will */
        } else {
          settle({ status: 'error', recognized: null, confidence: 0, method: 'webspeech' });
        }
      };

      rec.onend = () => {
        settle({
          status: sawSpeech ? 'no_match' : 'no_speech',
          recognized: lastHeard,
          confidence: 0,
          method: 'webspeech',
        });
      };

      try {
        rec.start();
      } catch {
        settle({ status: 'error', recognized: null, confidence: 0, method: 'webspeech' });
      }
    });
  }
}

/** No-mic environments: listen() resolves immediately; the game runs its
 *  say-it-out-loud ritual instead. The game is fully playable without a mic. */
class NullAdapter implements SpeechService {
  async available(): Promise<AvailabilityReport> {
    return { supported: false, permission: 'undetermined' };
  }
  async listen(): Promise<ListenResult> {
    return { status: 'unsupported', recognized: null, confidence: 0, method: 'none' };
  }
}

export function createSpeechService(): SpeechService {
  const ctor = recognitionCtor();
  return ctor ? new WebSpeechAdapter(ctor) : new NullAdapter();
}
