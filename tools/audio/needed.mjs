// Inventory the premium voice clips the game wants vs what the manifest has,
// with a cost estimate for the ElevenLabs batch (via Higgsfield text2speech_v2,
// 0.15 credits/clip). Run: node tools/audio/needed.mjs
import fs from 'node:fs';

const lines = JSON.parse(fs.readFileSync('packages/content/data/lines.json', 'utf8'));
const manifest = JSON.parse(
  fs.readFileSync('apps/game/public/assets/audio/manifest.json', 'utf8'),
);
const have = new Set(Object.keys(manifest.clips ?? {}));

// Words spoken as word-cards in the slice (dragon names, signs, matches,
// magic words, foods). Clip ids use the `w_<word>` convention.
const PRIORITY_WORDS = [
  'rex', 'ash', 'chip', 'dash',
  'den', 'hut', 'shop', 'path', 'shed', 'rock', 'log',
  'hen', 'hat', 'hop', 'chick', 'chin',
  'ship', 'chest',
  'egg', 'nut', 'jam', 'ten', 'pen',
];

const VOICE_BY_SPEAKER = {
  narrator: 'Willow f878bf3f-115b-5842-8934-c789c7947733',
  sign: 'Willow f878bf3f-115b-5842-8934-c789c7947733',
  mayor_hen: 'Annie f2801b0f-e345-598e-86f5-8364d886d96b',
  wizard: 'Fraser 6705e465-7b52-5915-a1d8-b1222885e01d',
};

const missing = [];
for (const l of lines) {
  if (l.text.includes('{name}')) continue; // template line — needs per-name variants
  if (!have.has(l.id)) missing.push({ id: l.id, voice: VOICE_BY_SPEAKER[l.speaker], text: l.text });
}
for (const w of PRIORITY_WORDS) {
  const id = `w_${w}`;
  if (!have.has(id)) missing.push({ id, voice: VOICE_BY_SPEAKER.narrator, text: `${w}!` });
}

for (const m of missing) console.log(`${m.id}\t[${m.voice}]\t${m.text}`);
console.log(`\n${missing.length} clips needed ≈ ${(missing.length * 0.15).toFixed(2)} Higgsfield credits`);
