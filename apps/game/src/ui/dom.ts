// Tiny DOM helpers for the reading overlay. All child-facing reading UI lives
// in the DOM, not the canvas — crisp text, easy highlighting, font settings
// (architecture §5.1).

let uiOpenCount = 0;
export function isUiOpen(): boolean {
  return uiOpenCount > 0;
}

export function overlay(): HTMLElement {
  return document.getElementById('overlay')!;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export interface Layer {
  root: HTMLElement;
  close(): void;
}

export function openLayer(opts: { scrim?: boolean; modal?: boolean } = {}): Layer {
  const root = el('div', opts.scrim === false ? 'scrim clear' : 'scrim');
  overlay().appendChild(root);
  // Non-modal layers (toasts) never block world input — a kid tapping while
  // the narrator is mid-sentence must not hit a dead screen.
  const modal = opts.modal !== false;
  if (modal) uiOpenCount += 1;
  let closed = false;
  return {
    root,
    close() {
      if (closed) return;
      closed = true;
      if (modal) uiOpenCount -= 1;
      root.remove();
    },
  };
}

export function speakerButton(onTap: () => void): HTMLButtonElement {
  const btn = el('button', 'btn ghost round', '🔊');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return btn;
}

/** Confetti burst — the DOM half of every celebration. Calm mode skips it. */
export function confetti(count = 26): void {
  if (motionReduced) return;
  const colors = ['#ff9f43', '#6c5ce7', '#2ecc71', '#ff6b81', '#feca57', '#54a0ff'];
  const w = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const bit = el('div', 'confetti-bit');
    bit.style.background = colors[i % colors.length]!;
    bit.style.left = `${w / 2 + (Math.random() - 0.5) * 160}px`;
    bit.style.top = `${window.innerHeight * 0.45}px`;
    overlay().appendChild(bit);
    const dx = (Math.random() - 0.5) * 480;
    const dy = -120 - Math.random() * 260;
    const rot = Math.random() * 720 - 360;
    bit.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy + 420}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1250 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
    ).onfinish = () => bit.remove();
  }
}

export function floatNote(text: string, x: number, y: number): void {
  const note = el('div', 'float-note', text);
  note.style.left = `${x}px`;
  note.style.top = `${y}px`;
  overlay().appendChild(note);
  requestAnimationFrame(() => {
    note.style.transform = 'translateY(-64px)';
    note.style.opacity = '0';
  });
  setTimeout(() => note.remove(), 1050);
}

export function applyTextScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(scale));
}

// ── Accessibility ───────────────────────────────────────────────────────────
let motionReduced = false;
/** True when calm mode is on — motion-heavy effects check this and stay still. */
export function reducedMotion(): boolean {
  return motionReduced;
}

/** Apply the accessibility settings as classes on <html> (+ a motion flag).
 *  CSS does the visual work; JS effects (confetti, camera) read reducedMotion(). */
export function applyAccessibility(s: {
  dyslexiaFont: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}): void {
  const root = document.documentElement;
  root.classList.toggle('a11y-dyslexia', s.dyslexiaFont);
  root.classList.toggle('a11y-contrast', s.highContrast);
  root.classList.toggle('a11y-reduce-motion', s.reducedMotion);
  motionReduced = s.reducedMotion;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
