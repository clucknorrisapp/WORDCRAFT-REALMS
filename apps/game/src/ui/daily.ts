// The Daily Gift — a word-of-the-day the child unwraps once per day for a little
// treasure. It's a reason to come back tomorrow (retention) that is still, at its
// core, one clean reading rep. The word is drawn from the child's own taught
// vocabulary (so it's always decodable — the iron rule holds) and chosen
// deterministically from the date, so the same day always shows the same word.
import { queryWords } from '@readquest/content';
import type { Services } from '../services';
import type { Hud } from './hud';
import { bottomLeftCluster, el, floatNote } from './dom';
import { celebrate, readWordCard } from './widgets';
import { checkDeeds } from './deeds';
import { sfxReward } from '../game/sfx';
import { QuestStep } from '../types';

/** Local calendar day as YYYY-MM-DD (the child's own timezone). */
export function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** A fresh gift is waiting when it's free play and today's gift is unclaimed. */
export function dailyGiftReady(services: Services): boolean {
  return services.save.questStep === QuestStep.FREE_PLAY && services.save.lastGiftDay !== todayKey();
}

/** Whole days from a→b (both YYYY-MM-DD), timezone-agnostic (UTC midnights). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The word-of-the-day: deterministic from the date + child, decodable today. */
export function dailyWord(services: Services): string {
  const pool = queryWords({ withinSkills: services.save.taught, count: 300 }).filter((w) => !w.heart);
  if (pool.length === 0) return 'sun';
  const idx = hashStr(todayKey() + services.save.childId) % pool.length;
  return pool[idx]!.text;
}

function syncHud(services: Services, hud: Hud): void {
  const s = services.save;
  hud.setCounts({ wood: s.wood, stone: s.stone, eggs: s.eggs, gems: s.gems, hens: null });
}

export async function openDailyGift(services: Services, hud: Hud): Promise<void> {
  const day = todayKey();
  const claimed = services.save.lastGiftDay === day;
  const word = dailyWord(services);
  services.analytics.log('daily_gift_opened', { day, word, claimed });

  // Read the word-of-the-day (the gift is a reading moment, always).
  await readWordCard(services, word, { icon: '🎁' });

  if (claimed) return; // already unwrapped today — a free re-read, no second reward

  // Read-every-day streak: consecutive daily-gift claims. Update BEFORE we
  // overwrite lastGiftDay (which still holds the previous claim's day). Reading
  // yesterday too → the streak grows; a gap resets it to today's fresh 1.
  const prev = services.save.lastGiftDay;
  const streak = prev && dayDiff(prev, day) === 1 ? (services.save.streak ?? 0) + 1 : 1;
  services.save.streak = streak;
  // Every third day of the streak drops a little bonus — a reason to come back.
  const bonus = streak % 3 === 0 ? 3 : 0;

  // First unwrap today → pay the treasure once.
  services.save.lastGiftDay = day;
  services.save.gems += 2 + bonus;
  services.save.dragonXp += 1;
  services.persist();
  syncHud(services, hud);
  sfxReward();
  floatNote('+2 💎', window.innerWidth / 2, window.innerHeight * 0.4);
  if (streak >= 2) floatNote(`🔥 ${streak}-day streak!`, window.innerWidth / 2, window.innerHeight * 0.55);
  if (bonus) floatNote(`+${bonus} 💎 streak bonus!`, window.innerWidth / 2, window.innerHeight * 0.68);
  services.analytics.log('daily_streak', { streak, bonus });
  void checkDeeds(services); // a growing streak may have earned an On Fire deed
  await celebrate(services, true);
}

/** Mount the floating 🎁 button. It pulses when a fresh gift is waiting and
 *  hides outside free play (the scripted intro owns the child's attention). */
export function mountDailyGiftButton(services: Services, hud: Hud): void {
  const btn = el('button', 'btn ghost round gift', '🎁');
  btn.title = 'Daily gift';
  bottomLeftCluster().appendChild(btn);

  const refresh = () => {
    const freePlay = services.save.questStep === QuestStep.FREE_PLAY;
    btn.style.display = freePlay ? '' : 'none';
    btn.classList.toggle('gift-ready', dailyGiftReady(services));
  };
  refresh();

  // Re-entrancy latch: an excited double-tap must not open (and pay) twice.
  let opening = false;
  btn.addEventListener('click', () => {
    if (opening) return;
    opening = true;
    void openDailyGift(services, hud).finally(() => {
      opening = false;
      refresh();
    });
  });

  // A new day (or reaching free play) can arrive mid-session — keep the pulse
  // honest without any coupling to the quest state machine.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  setInterval(refresh, 60000);
}
