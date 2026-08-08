// @readquest/analytics — local, pseudonymous gameplay event log (brief §73).
// Slice: in-memory + persisted into the save blob, exported as JSON from the
// facilitator screen. MVP+: batched upload to the Game API.

import type { GameEvent } from '@readquest/shared';

export interface Analytics {
  log(type: string, payload?: Record<string, unknown>): void;
  all(): GameEvent[];
  count(type: string): number;
  exportJson(extra?: Record<string, unknown>): string;
}

export function createAnalytics(initial: GameEvent[] = [], onChange?: () => void): Analytics {
  const events: GameEvent[] = [...initial];
  return {
    log(type, payload) {
      events.push({ type, at: Date.now(), payload });
      onChange?.();
    },
    all() {
      return events;
    },
    count(type) {
      return events.reduce((n, e) => n + (e.type === type ? 1 : 0), 0);
    },
    exportJson(extra = {}) {
      return JSON.stringify({ exportedAt: new Date().toISOString(), ...extra, events }, null, 2);
    },
  };
}
