// Batch-generate the game's voice clips with the ElevenLabs API (direct).
//
// Authoring machine:
//   ELEVENLABS_API_KEY=... node tools/audio/generate-elevenlabs.mjs [--dry] [--refresh-all]
//   → writes mp3s + manifest into apps/game/public/assets/audio (commit them)
//
// Railway build step (key stays a Railway variable, never in repo/chat):
//   node tools/audio/generate-elevenlabs.mjs --into-dist
//   → best-effort: no key = silent skip, any error = logged but exit 0 so a
//     voice hiccup can never block a deploy; writes into the built site so
//     the deployed game serves premium clips. Once the mp3s are committed to
//     the repo this becomes a no-op (nothing missing).
//
// Voices resolve from the account's voice list by name preference; override
// with env NARRATOR_VOICE / WIZARD_VOICE / MAYOR_VOICE (name or voice id).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { readManifest, wantedClips } from './clips.mjs';

const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
const DRY = process.argv.includes('--dry');
const REFRESH_ALL = process.argv.includes('--refresh-all');
const INTO_DIST = process.argv.includes('--into-dist');
const AUDIO_DIR = INTO_DIST ? 'apps/game/dist/assets/audio' : 'apps/game/public/assets/audio';
const MANIFEST_PATH = `${AUDIO_DIR}/manifest.json`;
// Sandboxed/corporate environments route HTTPS through a proxy that curl
// already understands; everywhere else plain fetch is simpler.
const USE_CURL = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);

if (!KEY) {
  if (INTO_DIST) {
    console.log('[voice] no ELEVENLABS_API_KEY set — skipping premium clip generation');
    process.exit(0);
  }
  console.error('Set ELEVENLABS_API_KEY (elevenlabs.io → profile → API Keys).');
  process.exit(1);
}

// Casting comes from the committed casting sheet; env vars prepend overrides.
const CASTING = JSON.parse(fs.readFileSync('tools/audio/voices.json', 'utf8'));
const ENV_OVERRIDES = {
  narrator: process.env.NARRATOR_VOICE,
  wizard: process.env.WIZARD_VOICE,
  mayor_hen: process.env.MAYOR_VOICE,
};
const VOICE_PREFS = {};
for (const [speaker, prefs] of Object.entries(CASTING)) {
  if (speaker.startsWith('_')) continue;
  VOICE_PREFS[speaker] = (ENV_OVERRIDES[speaker] ?? '').split(',').filter(Boolean).concat(prefs);
}

async function apiJson(url) {
  if (USE_CURL) {
    const out = execFileSync('curl', ['-sS', '-H', `xi-api-key: ${KEY}`, url], { maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out.toString());
  }
  const res = await fetch(url, { headers: { 'xi-api-key': KEY } });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function tts(voiceId, text, outFile) {
  const url = `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const payload = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  };
  if (USE_CURL) {
    execFileSync('curl', [
      '-sS', '--fail-with-body',
      '-X', 'POST',
      '-H', `xi-api-key: ${KEY}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify(payload),
      '-o', outFile,
      url,
    ]);
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
    fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  }
  const size = fs.statSync(outFile).size;
  if (size < 1000) {
    throw new Error(`suspiciously small output (${size}B): ${fs.readFileSync(outFile, 'utf8').slice(0, 200)}`);
  }
}

// Universal premade voices — addressable by id with any key, even TTS-only
// scoped keys that are not allowed to list the account's voices.
const FALLBACK_VOICES = {
  narrator: { name: 'Rachel (premade)', voice_id: '21m00Tcm4TlvDq8ikWAM' },
  wizard: { name: 'George (premade)', voice_id: 'JBFqnCBsd6RMkjVDRZzb' },
  mayor_hen: { name: 'Charlotte (premade)', voice_id: 'XB0fDUnXU5powFXDhCwa' },
};

const looksLikeVoiceId = (s) => /^[A-Za-z0-9]{16,}$/.test(s);

async function main() {
  console.log(`[voice] key present (…${KEY.slice(-4)})`);
  let voiceList = [];
  try {
    voiceList = (await apiJson(`${API}/voices`)).voices ?? [];
    console.log(`[voice] account voice list: ${voiceList.length} voices`);
  } catch (e) {
    console.log(`[voice] cannot list voices (${String(e.message).slice(0, 120)}) — scoped key? using premade voice ids`);
  }

  const resolveVoice = (speaker, prefs) => {
    for (const want of prefs) {
      const hit = voiceList.find((v) => v.voice_id === want || v.name.toLowerCase() === want.toLowerCase());
      if (hit) return hit;
      // A raw voice id override works even when the list is unavailable.
      if (looksLikeVoiceId(want)) return { name: `${want} (by id)`, voice_id: want };
    }
    return FALLBACK_VOICES[speaker] ?? FALLBACK_VOICES.narrator; // new speakers never break the batch
  };

  const chosen = {};
  for (const [speaker, prefs] of Object.entries(VOICE_PREFS)) {
    const v = resolveVoice(speaker, prefs);
    chosen[speaker] = v;
    console.log(`[voice] ${speaker} → ${v.name} (${v.voice_id})`);
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const manifest = fs.existsSync(MANIFEST_PATH) ? readManifest(MANIFEST_PATH) : { clips: {} };
  manifest.clips ??= {};
  const todo = wantedClips().filter((c) => REFRESH_ALL || !manifest.clips[c.id]);
  const totalChars = todo.reduce((n, c) => n + c.text.length, 0);
  console.log(`[voice] ${todo.length} clips to generate (~${totalChars} characters)${DRY ? ' [dry run]' : ''}`);

  let done = 0;
  for (const clip of todo) {
    const voice = chosen[clip.speaker] ?? chosen['narrator'];
    const file = `${AUDIO_DIR}/${clip.id}.mp3`;
    process.stdout.write(`[voice] ${clip.id} [${voice.name}] "${clip.text}" ... `);
    if (DRY) {
      console.log('dry');
      continue;
    }
    try {
      await tts(voice.voice_id, clip.text, file);
    } catch {
      console.log('retrying in 4s');
      await new Promise((r) => setTimeout(r, 4000));
      await tts(voice.voice_id, clip.text, file);
    }
    manifest.clips[clip.id] = `assets/audio/${clip.id}.mp3`;
    done += 1;
    console.log('ok');
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    await new Promise((r) => setTimeout(r, INTO_DIST ? 250 : 350)); // gentle on rate limits
  }
  console.log(`[voice] ${done} clips generated; manifest has ${Object.keys(manifest.clips).length} total.`);
}

try {
  await main();
} catch (e) {
  if (INTO_DIST) {
    // A voice problem must never block a deploy — the game falls back to
    // browser synthesis for any missing clip.
    console.error(`[voice] generation skipped: ${e.message}`);
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
}
