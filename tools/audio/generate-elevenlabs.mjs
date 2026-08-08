// Batch-generate the game's voice clips with the ElevenLabs API (direct).
//
//   ELEVENLABS_API_KEY=... node tools/audio/generate-elevenlabs.mjs [--dry] [--refresh-all]
//
// - Generates every wanted clip missing from the manifest (--refresh-all
//   regenerates everything for voice consistency, including the two clips
//   that were originally made through Higgsfield's engine).
// - Voices are picked from the account's voice list by name preference;
//   override with env NARRATOR_VOICE / WIZARD_VOICE / MAYOR_VOICE (name or id).
// - Uses curl for HTTP so corporate/agent proxies (HTTPS_PROXY + CA bundle)
//   just work; writes mp3s + updates the manifest.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { readManifest, wantedClips } from './clips.mjs';

const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
const DRY = process.argv.includes('--dry');
const REFRESH_ALL = process.argv.includes('--refresh-all');
const AUDIO_DIR = 'apps/game/public/assets/audio';
const MANIFEST_PATH = `${AUDIO_DIR}/manifest.json`;

if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY (elevenlabs.io → profile → API Keys).');
  process.exit(1);
}

const VOICE_PREFS = {
  narrator: (process.env.NARRATOR_VOICE ?? '').split(',').filter(Boolean).concat(['Dorothy', 'Matilda', 'Rachel', 'Sarah', 'Alice', 'Lily']),
  wizard: (process.env.WIZARD_VOICE ?? '').split(',').filter(Boolean).concat(['George', 'Brian', 'Daniel', 'Callum', 'Bill']),
  mayor_hen: (process.env.MAYOR_VOICE ?? '').split(',').filter(Boolean).concat(['Charlotte', 'Jessica', 'Laura', 'Alice', 'Dorothy']),
};

function curlJson(url) {
  const out = execFileSync('curl', ['-sS', '-H', `xi-api-key: ${KEY}`, url], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

function tts(voiceId, text, outFile) {
  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  });
  execFileSync('curl', [
    '-sS', '--fail-with-body',
    '-X', 'POST',
    '-H', `xi-api-key: ${KEY}`,
    '-H', 'Content-Type: application/json',
    '-d', body,
    '-o', outFile,
    `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
  ]);
  const size = fs.statSync(outFile).size;
  if (size < 1000) throw new Error(`suspiciously small output (${size}B): ${fs.readFileSync(outFile, 'utf8').slice(0, 200)}`);
}

// ── Resolve voices ──────────────────────────────────────────────────────────
const voiceList = curlJson(`${API}/voices`).voices ?? [];
function resolveVoice(prefs) {
  for (const want of prefs) {
    const hit = voiceList.find(
      (v) => v.voice_id === want || v.name.toLowerCase() === want.toLowerCase(),
    );
    if (hit) return hit;
  }
  return null;
}

const chosen = {};
for (const [speaker, prefs] of Object.entries(VOICE_PREFS)) {
  const v = resolveVoice(prefs);
  if (!v) {
    console.error(`No voice found for "${speaker}". Available: ${voiceList.map((x) => x.name).join(', ')}`);
    process.exit(1);
  }
  chosen[speaker] = v;
  console.log(`${speaker} → ${v.name} (${v.voice_id})`);
}

// ── Generate ────────────────────────────────────────────────────────────────
const manifest = readManifest();
manifest.clips ??= {};
const todo = wantedClips().filter((c) => REFRESH_ALL || !manifest.clips[c.id]);
const totalChars = todo.reduce((n, c) => n + c.text.length, 0);
console.log(`\n${todo.length} clips to generate (~${totalChars} characters)${DRY ? ' [dry run]' : ''}\n`);

let done = 0;
for (const clip of todo) {
  const voice = chosen[clip.speaker] ?? chosen['narrator'];
  const file = `${AUDIO_DIR}/${clip.id}.mp3`;
  process.stdout.write(`${clip.id} [${voice.name}] "${clip.text}" ... `);
  if (DRY) {
    console.log('dry');
    continue;
  }
  try {
    tts(voice.voice_id, clip.text, file);
  } catch (e) {
    console.log('retrying in 4s');
    await new Promise((r) => setTimeout(r, 4000));
    tts(voice.voice_id, clip.text, file);
  }
  manifest.clips[clip.id] = `assets/audio/${clip.id}.mp3`;
  done += 1;
  console.log('ok');
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  await new Promise((r) => setTimeout(r, 350)); // gentle on rate limits
}

console.log(`\n${done} clips generated; manifest updated (${Object.keys(manifest.clips).length} total clips).`);
