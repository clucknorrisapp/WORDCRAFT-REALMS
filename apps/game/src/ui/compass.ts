// The "Where do I go?" compass — a single always-there button that answers the
// one question a 4-year-old asks most ("what now?"). Tapping it reveals the
// current goal: during the quest it pans to / points at the next objective; in
// free play it beckons toward the nearest thing to do (a node or sparkle cache).
// The world scene registers the actual reveal via setNextHandler().
import type { Services } from '../services';
import { bottomLeftCluster, el } from './dom';
import { requestNext } from './widgets';

export function mountCompassButton(services: Services): void {
  const btn = el('button', 'btn ghost round compass', '🧭');
  btn.title = 'Where do I go?';
  bottomLeftCluster().appendChild(btn);
  btn.addEventListener('click', () => {
    services.analytics.log('compass_used', { step: services.save.questStep });
    requestNext();
  });
}
