// Inventory the premium voice clips the game wants vs what the manifest has.
// Generate them with tools/audio/generate-elevenlabs.mjs (direct ElevenLabs API).
// Run: node tools/audio/needed.mjs
import { readManifest, wantedClips } from './clips.mjs';

const have = new Set(Object.keys(readManifest().clips ?? {}));
const missing = wantedClips().filter((c) => !have.has(c.id));
const chars = missing.reduce((n, c) => n + c.text.length, 0);

for (const m of missing) console.log(`${m.id}\t[${m.speaker}]\t${m.text}`);
console.log(`\n${missing.length} clips needed ≈ ${chars} ElevenLabs characters`);
