// Pronunciation Check — a grown-up review page that speaks every word the game
// can say, through the exact same voice pipeline the child hears (premium clip
// when present, synthesis fallback otherwise). Open it at <url>#pronounce (or
// from the grown-up screen) and tap through to hear them all; tap ⚑ to jot down
// any that sound wrong. No guessing, no "trust me" — just listen.
import { allWords, allLines } from '@readquest/content';
import type { Services } from '../services';
import { el, wait } from './dom';

export function mountPronounceReview(services: Services): void {
  const root = document.getElementById('overlay') ?? document.body;
  root.innerHTML = '';
  document.body.classList.add('pronounce-mode');

  const page = el('div', 'pronounce-page');
  page.appendChild(el('h1', '', '🔊 Pronunciation Check'));
  page.appendChild(
    el('p', 'pron-sub', 'Tap a word to hear exactly what your child hears. Tap ⚑ to flag any that sound wrong, then Copy the list.'),
  );

  const flagged = new Set<string>();
  const bar = el('div', 'pron-bar');
  const playAll = el('button', 'btn', '▶ Play all words');
  const copy = el('button', 'btn ghost', '⚑ Copy flagged (0)');
  const back = el('button', 'btn ghost', '← Back to game');
  bar.append(playAll, copy, back);
  page.appendChild(bar);

  const speakWord = (text: string, card: HTMLElement) => {
    card.classList.add('playing');
    return services.speakWord(text).done.then(() => card.classList.remove('playing'));
  };

  const grid = el('div', 'pron-grid');
  const cardByWord = new Map<string, HTMLElement>();
  const words = [...allWords()].sort((a, b) => a.text.localeCompare(b.text));
  for (const w of words) {
    const card = el('div', 'pron-card');
    const play = el('button', 'pron-play');
    play.append(el('div', 'pron-word', w.text.toUpperCase()), el('div', 'pron-graph', w.graphemes.join(' · ')));
    play.addEventListener('click', () => void speakWord(w.text, card));
    const flag = el('button', 'pron-flag', '⚑');
    flag.title = 'Flag: sounds wrong';
    flag.addEventListener('click', () => {
      if (flagged.has(w.text)) flagged.delete(w.text);
      else flagged.add(w.text);
      card.classList.toggle('flagged', flagged.has(w.text));
      copy.textContent = `⚑ Copy flagged (${flagged.size})`;
    });
    card.append(play, flag);
    grid.appendChild(card);
    cardByWord.set(w.text, card);
  }
  page.appendChild(grid);

  // Authored sentences (dialogue, clues, book-style lines) too — same voice.
  page.appendChild(el('h2', 'pron-h2', 'Sentences the game speaks'));
  const lines = el('div', 'pron-lines');
  for (const l of allLines()) {
    const row = el('button', 'pron-line');
    row.append(el('span', 'pron-line-spk', `${l.speaker}:`), el('span', '', ` ${l.text}`));
    row.addEventListener('click', () => {
      row.classList.add('playing');
      void services.speakLine(l.id).done.then(() => row.classList.remove('playing'));
    });
    lines.appendChild(row);
  }
  page.appendChild(lines);

  playAll.addEventListener('click', () => void playThrough(words, cardByWord, speakWord, playAll));
  copy.addEventListener('click', () => {
    const text = [...flagged].join(', ');
    void navigator.clipboard?.writeText(text).catch(() => {});
    copy.textContent = flagged.size ? `Copied: ${text}` : 'Nothing flagged';
  });
  back.addEventListener('click', () => {
    location.hash = '';
    location.reload();
  });

  root.appendChild(page);
}

async function playThrough(
  words: ReturnType<typeof allWords>,
  cardByWord: Map<string, HTMLElement>,
  speak: (t: string, c: HTMLElement) => Promise<void>,
  btn: HTMLButtonElement,
): Promise<void> {
  if (btn.dataset['on'] === '1') {
    btn.dataset['on'] = '';
    btn.textContent = '▶ Play all words';
    return;
  }
  btn.dataset['on'] = '1';
  btn.textContent = '⏸ Stop';
  for (const w of words) {
    if (btn.dataset['on'] !== '1') break;
    const card = cardByWord.get(w.text)!;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await speak(w.text, card);
    await wait(250);
  }
  btn.dataset['on'] = '';
  btn.textContent = '▶ Play all words';
}
