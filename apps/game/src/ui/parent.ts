// One-screen parent/facilitator view (slice scope): real information, the
// privacy headline, gate instrumentation, and a data export for playtests.
import { COUNTABLE_TYPES } from '@readquest/shared';
import { voiceDiagnostics } from '@readquest/voice';
import type { Services } from '../services';
import { applyAccessibility, applyTextScale, el, openLayer } from './dom';
import { wipeSave } from '../save';

const SKILL_LABELS: Record<string, string> = {
  short_a: 'Short A (cat, map)',
  short_e: 'Short E (hen, red)',
  short_i: 'Short I (pig, sit)',
  short_o: 'Short O (dog, hop)',
  short_u: 'Short U (run, nut)',
  digraph_sh: 'SH sound (ship, shed)',
  digraph_ch: 'CH sound (chick, chip)',
  digraph_th: 'TH sound (this, path)',
  blend_st: 'ST blend (chest)',
  heart: 'Heart words (the, said)',
};

export function mountParentButton(services: Services): void {
  const hud = el('div', 'hud-right');
  const btn = el('button', 'btn ghost round', '👪');
  btn.title = 'Grown-ups: press and hold';
  hud.appendChild(btn);
  document.getElementById('overlay')!.appendChild(hud);

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const start = () => {
    holdTimer = setTimeout(() => openParentScreen(services), 1100);
  };
  const cancel = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
}

export function openParentScreen(services: Services): void {
  const layer = openLayer();
  const panel = el('div', 'panel parent');

  panel.appendChild(el('h2', '', 'Grown-up corner'));
  panel.appendChild(el('div', 'privacy', '🔒 We never store your child’s voice. Audio is checked in the moment; only results are saved.'));

  // Audio diagnostic (for troubleshooting device sound). Tapping it plays a
  // test line so a grown-up can confirm sound works and read the counts.
  const vd = voiceDiagnostics();
  const audioRow = el('div', 'stat-row');
  audioRow.style.cursor = 'pointer';
  audioRow.appendChild(el('span', '', '🔊 Sound test (tap)'));
  const audioVal = el('strong', '', `ctx:${vd.ctx} w:${vd.webaudio} h:${vd.htmlaudio} s:${vd.synth}`);
  audioRow.appendChild(audioVal);
  audioRow.addEventListener('click', () => {
    void services.speakText('Hello! Can you hear me?', 'narrator').done.then(() => {
      const d = voiceDiagnostics();
      audioVal.textContent = `ctx:${d.ctx} w:${d.webaudio} h:${d.htmlaudio} s:${d.synth}`;
    });
  });
  panel.appendChild(audioRow);
  if (vd.lastError) {
    const errRow = el('div', 'stat-row');
    errRow.appendChild(el('span', '', 'Audio note'));
    errRow.appendChild(el('strong', '', vd.lastError));
    panel.appendChild(errRow);
  }

  const ev = services.save.evidence;
  const countable = ev.filter((e) => COUNTABLE_TYPES.includes(e.challengeType));
  const independent = countable.filter((e) => e.correct && e.hintsUsed === 0 && e.attemptIndex === 1);
  const withHelp = countable.filter((e) => e.hintsUsed > 0 || e.attemptIndex > 1);
  const micAttempts = ev.filter((e) => e.micUsed);
  const micMatched = micAttempts.filter((e) => e.correct);
  const minutes = Math.max(1, Math.round(performance.now() / 60000));

  const stats: Array<[string, string]> = [
    ['This session', `${minutes} min`],
    ['Reading interactions', String(countable.length)],
    ['Read on their own', String(independent.length)],
    ['Read with help', String(withHelp.length)],
    ['Magic words spoken (mic)', `${micMatched.length} of ${micAttempts.length} tries`],
    ['Eggs collected', String(services.save.eggs)],
  ];
  for (const [k, v] of stats) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', '', k));
    row.appendChild(el('strong', '', v));
    panel.appendChild(row);
  }

  panel.appendChild(el('h2', '', 'Skills'));
  for (const m of services.engine.allMastery()) {
    if (!m.taught || m.skillId === 'base') continue;
    const label = SKILL_LABELS[m.skillId] ?? m.skillId;
    const row = el('div', 'stat-row');
    row.appendChild(el('span', '', label));
    const chip = el('span', `band ${m.band}`, m.attempts === 0 ? 'not seen yet' : m.band);
    row.appendChild(chip);
    panel.appendChild(row);
  }

  panel.appendChild(el('h2', '', 'Settings'));
  const settingsRow = el('div', 'cards');

  const micToggle = el('button', 'btn ghost', services.save.settings.micEnabled ? '🎤 Mic: ON' : '🎤 Mic: OFF');
  micToggle.addEventListener('click', () => {
    services.save.settings.micEnabled = !services.save.settings.micEnabled;
    micToggle.textContent = services.save.settings.micEnabled ? '🎤 Mic: ON' : '🎤 Mic: OFF';
    services.persist();
  });
  settingsRow.appendChild(micToggle);

  const strictLabel = () =>
    services.save.settings.micStrictness === 'strict' ? '✨ Door: must say it' : '✨ Door: gentle';
  const strictToggle = el('button', 'btn ghost', strictLabel());
  strictToggle.addEventListener('click', () => {
    services.save.settings.micStrictness =
      services.save.settings.micStrictness === 'strict' ? 'gentle' : 'strict';
    strictToggle.textContent = strictLabel();
    services.persist();
  });
  settingsRow.appendChild(strictToggle);

  const rateBtn = el('button', 'btn ghost', `🗣 Speed: ${services.save.settings.narrationRate}x`);
  rateBtn.addEventListener('click', () => {
    const rates = [0.8, 1, 1.2];
    const next = rates[(rates.indexOf(services.save.settings.narrationRate) + 1) % rates.length]!;
    services.save.settings.narrationRate = next;
    rateBtn.textContent = `🗣 Speed: ${next}x`;
    services.persist();
  });
  settingsRow.appendChild(rateBtn);

  const sizeBtn = el('button', 'btn ghost', '🔠 Text size');
  sizeBtn.addEventListener('click', () => {
    const sizes = [1, 1.15, 1.3];
    const next = sizes[(sizes.indexOf(services.save.settings.textScale) + 1) % sizes.length]!;
    services.save.settings.textScale = next;
    applyTextScale(next);
    services.persist();
  });
  settingsRow.appendChild(sizeBtn);
  panel.appendChild(settingsRow);

  // ── Accessibility toggles ──
  panel.appendChild(el('h2', '', 'Accessibility'));
  const a11yRow = el('div', 'cards');
  const onOff = (b: boolean) => (b ? 'ON' : 'OFF');
  const a11yToggle = (
    label: (on: boolean) => string,
    get: () => boolean,
    set: (v: boolean) => void,
  ) => {
    const btn = el('button', 'btn ghost', label(get()));
    btn.addEventListener('click', () => {
      set(!get());
      btn.textContent = label(get());
      applyAccessibility(services.save.settings);
      services.persist();
    });
    a11yRow.appendChild(btn);
  };
  a11yToggle(
    (on) => `📖 Easy-read font: ${onOff(on)}`,
    () => services.save.settings.dyslexiaFont,
    (v) => (services.save.settings.dyslexiaFont = v),
  );
  a11yToggle(
    (on) => `◐ High contrast: ${onOff(on)}`,
    () => services.save.settings.highContrast,
    (v) => (services.save.settings.highContrast = v),
  );
  a11yToggle(
    (on) => `🍃 Calm motion: ${onOff(on)}`,
    () => services.save.settings.reducedMotion,
    (v) => (services.save.settings.reducedMotion = v),
  );
  panel.appendChild(a11yRow);

  const actions = el('div', 'cards');
  const exportBtn = el('button', 'btn alt', '⬇ Export playtest data');
  exportBtn.addEventListener('click', () => {
    const payload = services.analytics.exportJson({
      childId: services.save.childId,
      evidence: services.save.evidence,
      mastery: services.engine.allMastery(),
      questStep: services.save.questStep,
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `readquest-playtest-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  actions.appendChild(exportBtn);

  const resetBtn = el('button', 'btn ghost', '♻ Reset game');
  resetBtn.addEventListener('click', () => {
    if (confirm('Erase this child profile and start over?')) {
      wipeSave();
      location.reload();
    }
  });
  actions.appendChild(resetBtn);

  const closeBtn = el('button', 'btn', 'Close');
  closeBtn.addEventListener('click', () => layer.close());
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  layer.root.appendChild(panel);
}
