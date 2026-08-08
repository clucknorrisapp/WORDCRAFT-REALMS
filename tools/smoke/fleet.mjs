// Playtest fleet: runs every persona across N seeds in parallel batches
// against the preview server, and summarizes pass/fail with stuck reports.
//   pnpm build && pnpm preview &   # then:
//   node tools/smoke/fleet.mjs [--seeds 4] [--personas careful,speedy,...] [--concurrency 5]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const pexec = promisify(execFile);
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const SEEDS = Number(arg('seeds', '4'));
const PERSONAS = arg('personas', 'careful,speedy,wrong-first,silent-mic,chaos').split(',');
const CONC = Number(arg('concurrency', '5'));

const jobs = [];
for (const persona of PERSONAS) for (let s = 1; s <= SEEDS; s++) jobs.push({ persona, seed: s });

const results = [];
async function runOne({ persona, seed }) {
  const started = Date.now();
  try {
    const { stdout } = await pexec('node', ['tools/smoke/bot.mjs', '--persona', persona, '--seed', String(seed), '--max-min', '9'], { timeout: 600_000 });
    results.push({ persona, seed, ok: true, secs: Math.round((Date.now() - started) / 1000), tail: stdout.trim().split('\n').pop() });
  } catch (e) {
    results.push({ persona, seed, ok: false, secs: Math.round((Date.now() - started) / 1000), tail: String(e.stdout ?? e.message).trim().split('\n').pop() });
  }
}

console.log(`Fleet: ${jobs.length} runs (${PERSONAS.length} personas × ${SEEDS} seeds), ${CONC} at a time\n`);
for (let i = 0; i < jobs.length; i += CONC) {
  await Promise.all(jobs.slice(i, i + CONC).map(runOne));
  process.stdout.write(`  ${Math.min(i + CONC, jobs.length)}/${jobs.length} done\n`);
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n${'═'.repeat(56)}\nFLEET RESULT: ${pass}/${results.length} passed\n`);
for (const r of results.sort((a, b) => a.persona.localeCompare(b.persona) || a.seed - b.seed)) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.persona}/${r.seed} (${r.secs}s) ${r.ok ? '' : '— ' + r.tail}`);
}
fs.mkdirSync('playtest-data', { recursive: true });
fs.writeFileSync('playtest-data/fleet-result.json', JSON.stringify({ pass, total: results.length, results }, null, 2));
process.exit(pass === results.length ? 0 : 1);
