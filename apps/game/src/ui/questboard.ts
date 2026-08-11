// The Quest Board / Help Wanted (Phase 2.1). The mayor hen and the wizard always
// have a job in free play: a short DECODABLE order the child reads for MEANING
// ("get eggs", "chop a log"), then goes and does. Accepting a job logs the strong
// sentence_read signal; finishing it pays a reward and a fresh job fades in. Jobs
// are assembled from decodable templates validated at the child's exact tier, so
// the board renews forever with no author.
import { validateText, word as getWord } from '@readquest/content';
import type { Services } from '../services';
import type { Job } from '../types';
import { el, openLayer, speakerButton, wait } from './dom';
import { sfxReward } from '../game/sfx';

interface JobTemplate {
  kind: Job['kind'];
  icon: string;
  // Candidate orders, natural + decodable; the first that validates at the
  // child's tier is used. All are base/short-vowel words, so one always passes.
  texts: string[];
  targets: number[];
  // A spoken (audio-only, non-decodable) coach line; {n} → the count.
  say: string;
}

const TEMPLATES: JobTemplate[] = [
  { kind: 'wood', icon: '🪵', texts: ['chop a log', 'get a log'], targets: [2, 3], say: 'Chop {n} logs!' },
  { kind: 'stone', icon: '🪨', texts: ['dig a rock', 'get a rock'], targets: [2, 3], say: 'Get {n} rocks!' },
  { kind: 'eggs', icon: '🥚', texts: ['get eggs', 'get an egg'], targets: [2, 3], say: 'Get {n} eggs!' },
];

/** Build a fresh job from a giver, decodable at the child's current tier. */
export function buildJob(services: Services, giver: Job['giver'], seed: number): Job {
  const taught = services.save.taught;
  const t = TEMPLATES[seed % TEMPLATES.length]!;
  const text = t.texts.find((s) => validateText(s, taught).ok) ?? t.texts[t.texts.length - 1]!;
  const target = t.targets[seed % t.targets.length]!;
  return { giver, kind: t.kind, text, icon: t.icon, target, progress: 0 };
}

function spokenFor(job: Job): string {
  const t = TEMPLATES.find((x) => x.kind === job.kind)!;
  return t.say.replace('{n}', String(job.target));
}

const PORTRAIT: Record<Job['giver'], string> = {
  mayor: 'assets/sprites/mayor_hen.png',
  wizard: 'assets/sprites/wizard.png',
};

/**
 * Show a job offer. Reading the order (tap "Let's go!") accepts it and logs a
 * sentence_read — accepting a job is a read-for-meaning moment. Returns the
 * accepted Job, or null if the child taps "Not now".
 */
export async function showJobOffer(services: Services, job: Job): Promise<Job | null> {
  const started = Date.now();
  services.analytics.log('job_offered', { kind: job.kind, giver: job.giver, target: job.target });
  const layer = openLayer();
  const panel = el('div', 'panel job-offer');
  panel.appendChild(el('div', 'title', '📋 Help Wanted!'));
  const portrait = el('img', 'job-portrait') as HTMLImageElement;
  portrait.src = PORTRAIT[job.giver];
  panel.appendChild(portrait);

  // The decodable order, as glowing word tiles.
  const order = el('div', 'job-order');
  for (const token of job.text.split(' ')) order.appendChild(el('span', 'job-word', token.toUpperCase()));
  panel.appendChild(order);

  // The goal, as a row of resource pips — the quantity channel (kept separate
  // from the word so the sentence stays natural and the count stays clear).
  const goal = el('div', 'job-goal');
  goal.appendChild(el('span', 'job-goal-label', 'Bring:'));
  for (let i = 0; i < job.target; i++) goal.appendChild(el('span', 'job-pip', job.icon));
  panel.appendChild(goal);

  const row = el('div', 'cards');
  row.appendChild(speakerButton(() => void services.speakText(job.text).done));
  const accept = el('button', 'btn', "Let's go! ✓");
  const decline = el('button', 'btn ghost', 'Not now');
  row.appendChild(accept);
  row.appendChild(decline);
  panel.appendChild(row);
  layer.root.appendChild(panel);

  // Speak the order, then the coaching count.
  await wait(400);
  void (async () => {
    await services.speakText(job.text).done;
    await services.speakText(spokenFor(job)).done;
  })();

  const accepted = await new Promise<boolean>((resolve) => {
    accept.addEventListener('click', () => resolve(true), { once: true });
    decline.addEventListener('click', () => resolve(false), { once: true });
  });
  layer.close();

  if (!accepted) {
    services.analytics.log('job_declined', { kind: job.kind });
    return null;
  }

  // Reading the order to accept it is the sentence_read signal.
  const skills = new Set<string>();
  for (const token of job.text.split(' ')) {
    try {
      for (const s of getWord(token).skills) skills.add(s);
    } catch {
      /* numerals/unknown — no skill */
    }
  }
  services.recordEvidence({
    challengeType: 'sentence_read',
    skillIds: [...skills],
    channel: 'recognition',
    correct: true,
    attemptIndex: 1,
    hintsUsed: 0,
    audioRequested: false,
    micUsed: false,
    responseMs: Date.now() - started,
  });
  services.analytics.log('job_accepted', { kind: job.kind, text: job.text, target: job.target });
  return job;
}

/** HUD chip label for the active job, e.g. "📋 chop a log 🪵 1/2" or a turn-in cue. */
export function jobChipLabel(job: Job): string {
  if (job.progress >= job.target) return `📋 ✓ ${job.text} — turn in!`;
  return `📋 ${job.text} ${job.icon} ${job.progress}/${job.target}`;
}

/** What finishing a job pays. Scales gently so the board stays worth doing. */
export function jobReward(services: Services): { gems: number } {
  const gems = 1 + Math.min(2, Math.floor(services.save.jobsDone / 3));
  return { gems };
}
