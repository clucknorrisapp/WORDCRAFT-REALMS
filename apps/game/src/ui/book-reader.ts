// The book reader — a page-turn decodable reader. Every word is tappable to
// hear it (recognition support), a 🔊 button reads the whole page with
// word-by-word highlighting, and finishing a book celebrates + pays a reward
// once. Reading a page logs `sentence_read` evidence: the strongest reading
// signal the game collects (a whole decodable sentence, child-led).
import { word as getWord } from '@readquest/content';
import type { Book } from '@readquest/shared';
import type { Services } from '../services';
import { confetti, el, openLayer, speakerButton, wait } from './dom';
import { celebrate } from './widgets';

const REWARD_ICON: Record<Book['reward'], string> = {
  egg: '🥚',
  gem: '💎',
  wood: '🪵',
  stone: '🪨',
};

/** Split a page into word tokens + the punctuation/space between them, so we
 *  can render tappable word spans while keeping commas and periods in place. */
function tokenize(text: string): Array<{ word: string; raw: string }> {
  const out: Array<{ word: string; raw: string }> = [];
  const re = /([A-Za-z]+)|([^A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) out.push({ word: m[1].toLowerCase(), raw: m[1] });
    else out.push({ word: '', raw: m[2]! });
  }
  return out;
}

/** Distinct non-base skills exercised across the whole book (for evidence). */
function bookSkills(b: Book): string[] {
  const skills = new Set<string>();
  for (const page of b.pages) {
    for (const t of tokenize(page)) {
      if (!t.word) continue;
      try {
        for (const s of getWord(t.word).skills) if (s !== 'base') skills.add(s);
      } catch {
        /* word not in corpus — shouldn't happen for a validated book */
      }
    }
  }
  return [...skills];
}

/**
 * Open `book` in the reader. Resolves to true if the child reached the end
 * (finished it), false if they closed early. Rewards + evidence are handled
 * by the caller via the returned flag + book metadata.
 */
export async function openBook(services: Services, book: Book): Promise<boolean> {
  services.analytics.log('book_opened', { bookId: book.id });
  const layer = openLayer();
  const panel = el('div', 'panel book');
  layer.root.appendChild(panel);

  // ── Cover ──────────────────────────────────────────────────────────────
  const finished = await new Promise<boolean>((resolve) => {
    renderCover(services, panel, book, () => resolve(runPages(services, panel, book)), () => {
      resolve(Promise.resolve(false));
    });
  });

  layer.close();
  return finished;
}

function renderCover(
  services: Services,
  panel: HTMLElement,
  book: Book,
  onOpen: () => void,
  onClose: () => void,
): void {
  panel.innerHTML = '';
  const cover = el('div', 'book-cover');
  cover.appendChild(el('div', 'book-emoji', book.cover));
  const title = el('div', 'book-title', book.title);
  cover.appendChild(title);
  const hear = speakerButton(() => void services.speakText(book.title).done);
  cover.appendChild(hear);
  panel.appendChild(cover);

  const row = el('div', 'cards');
  const close = el('button', 'btn ghost', '✕');
  close.addEventListener('click', onClose);
  const open = el('button', 'btn', 'Read it! 📖');
  open.addEventListener('click', onOpen);
  row.append(close, open);
  panel.appendChild(row);

  void services.speakText(book.title).done;
}

async function runPages(services: Services, panel: HTMLElement, book: Book): Promise<boolean> {
  const started = Date.now();
  let audioRequested = false;
  let idx = 0;

  const render = () =>
    new Promise<'next' | 'back' | 'done'>((resolve) => {
      panel.innerHTML = '';

      // Progress dots.
      const dots = el('div', 'book-dots');
      book.pages.forEach((_, i) => {
        const d = el('span', 'book-dot' + (i === idx ? ' on' : ''));
        dots.appendChild(d);
      });
      panel.appendChild(dots);

      // The page text — each word a tappable span.
      const pageEl = el('div', 'book-page');
      const spans: Array<{ el: HTMLElement; wordIndex: number }> = [];
      let wordCounter = 0;
      for (const tok of tokenize(book.pages[idx]!)) {
        if (!tok.word) {
          pageEl.appendChild(document.createTextNode(tok.raw));
          continue;
        }
        const wIdx = wordCounter++;
        const s = el('span', 'book-word', tok.raw);
        s.addEventListener('click', () => {
          audioRequested = true;
          s.classList.add('hot');
          void services.speakWord(tok.word).done.then(() => s.classList.remove('hot'));
        });
        pageEl.appendChild(s);
        spans.push({ el: s, wordIndex: wIdx });
      }
      panel.appendChild(pageEl);

      // Controls: read-to-me + back/next.
      const row = el('div', 'cards book-controls');
      const readAloud = el('button', 'btn ghost', '🔊 Read to me');
      readAloud.addEventListener('click', () => {
        audioRequested = true;
        const { handle } = services.speakText(book.pages[idx]!);
        handle.onWordBoundary((i) => {
          spans.forEach((s) => s.el.classList.remove('hot'));
          spans[i]?.el.classList.add('hot');
        });
        handle.onEnd(() => spans.forEach((s) => s.el.classList.remove('hot')));
      });
      row.appendChild(readAloud);

      if (idx > 0) {
        const back = el('button', 'btn ghost', '←');
        back.addEventListener('click', () => resolve('back'));
        row.appendChild(back);
      }
      const isLast = idx === book.pages.length - 1;
      const next = el('button', 'btn', isLast ? 'The End! 🎉' : 'Next →');
      next.addEventListener('click', () => resolve(isLast ? 'done' : 'next'));
      row.appendChild(next);
      panel.appendChild(row);
    });

  // Page loop.
  for (;;) {
    const action = await render();
    if (action === 'next') idx += 1;
    else if (action === 'back') idx = Math.max(0, idx - 1);
    else break; // done
  }

  // Reading a whole decodable book is a real reading interaction — log it once.
  services.recordEvidence({
    challengeType: 'sentence_read',
    skillIds: bookSkills(book),
    channel: 'recognition',
    correct: true,
    attemptIndex: 1,
    hintsUsed: 0,
    audioRequested,
    micUsed: false,
    responseMs: Date.now() - started,
  });
  services.analytics.log('book_finished', { bookId: book.id, pages: book.pages.length });

  // Celebrate the finish.
  confetti(40);
  await celebrate(services, true, 'ln_celebrate_1');
  return true;
}

export { REWARD_ICON };
