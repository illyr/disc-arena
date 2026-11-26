// Records the commentator into sounds/voice/ with ElevenLabs (and ffmpeg), the key in ELEVENLABS_API_KEY
// or ~/.config/elevenlabs/api-key:
//   node scripts/make-voice.mjs design ["description"]  3 voices to listen to, from a description
//   node scripts/make-voice.mjs keep <generated_voice_id>  saves one, prints the id to put in VOICE below
//   node scripts/make-voice.mjs [characters]             records the pieces not recorded yet, at most that many characters
//                                                        (delete sounds/voice/ to redo all; the remarks come last)
// Each line is cut around its names, {K}, {V}…: the pieces between them, and every alias, one file each.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ASIDES, DECAP_LINES, END_LINES, FALL_LINES, NAMES, PSEUDOS, PUSH_LINES, START_LINES, voiceSlug } from "../src/pseudos.js";

const VOICE = "pFZP5JQG7iQjIQuC4Bku"; // Lily, "Velvety Actress", a voice of ElevenLabs
const DESCRIPTION = "A French woman in her thirties with a Parisian accent, a low, breathy, sultry voice, "
  + "speaking slowly and intimately, close to the microphone, like a late-night radio host.";
const SAMPLE = "Mesdames et messieurs, veuillez garder la tête sur les épaules. La partie commence. "
  + "Toto a décapité Riri. Loulou a tranché Fifi comme un saucisson. Coco a mis Nini à la cave.";
const SETTINGS = { stability: 0, similarity_boost: 0.8 }; // v3 "Creative": the most expressive
const TRIM = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse";

const key = process.env.ELEVENLABS_API_KEY ?? readFileSync(join(homedir(), ".config/elevenlabs/api-key"), "utf8").trim();
async function call(path, body) {
  const res = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
}

const [command, arg] = process.argv.slice(2);
if (command === "design") {
  const { previews } = await (await call("text-to-voice/design", { voice_description: arg ?? DESCRIPTION, text: SAMPLE })).json();
  const dir = mkdtempSync(join(tmpdir(), "voices-"));
  for (const p of previews) {
    writeFileSync(join(dir, `${p.generated_voice_id}.mp3`), Buffer.from(p.audio_base_64, "base64"));
    console.log(`afplay ${join(dir, p.generated_voice_id)}.mp3`);
  }
} else if (command === "keep") {
  const { voice_id } = await (await call("text-to-voice", { voice_name: "Disc Arena", voice_description: DESCRIPTION, generated_voice_id: arg })).json();
  console.log(`VOICE = "${voice_id}"`);
} else {
  if (!VOICE) throw new Error("no voice: design one, keep it, then put its id in VOICE");
  // Every line the game says: the lists of src/pseudos.js, and the lines of src/main.js with a name.
  const main = readFileSync("src/main.js", "utf8");
  const lines = new Set([...DECAP_LINES, ...PUSH_LINES, ...FALL_LINES, ...START_LINES, ...Object.values(END_LINES),
    ...[...main.matchAll(/"([^"\n]*\{[A-Z]\}[^"\n]*)"/g)].map((m) => m[1]), ...Object.values(ASIDES).flat()]);
  // file → text: each piece in the tone of its line, the one between brackets at its start (v3 takes no text around a piece)
  const pieces = new Map();
  for (const line of lines) {
    const tone = line.match(/^\[[^\]]*\]/)?.[0] ?? "";
    for (const bit of line.split(/\{[A-Z]\}/)) {
      const text = bit.trim().replace(/^[!?.,…:]+ */, ""); // the end of the sentence before a name
      if (voiceSlug(bit)) pieces.set(voiceSlug(bit), text.startsWith("[") ? text : `${tone} ${text}`);
    }
  }
  for (const alias of new Set([...NAMES, ...PSEUDOS.map((p) => p.alias)])) pieces.set(voiceSlug("", alias), `[excited] ${alias}`);
  mkdirSync("sounds/voice", { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "voice-"));
  let made = 0, budget = Number(command ?? Infinity);
  for (const [slug, text] of pieces) {
    const file = `sounds/voice/${slug}.mp3`;
    if (existsSync(file)) continue;
    if ((budget -= text.length) < 0) break;
    const res = await call(`text-to-speech/${VOICE}?output_format=mp3_44100_128`,
      { text, model_id: "eleven_v3", voice_settings: SETTINGS });
    writeFileSync(join(tmp, "raw.mp3"), Buffer.from(await res.arrayBuffer()));
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(tmp, "raw.mp3"), "-af", TRIM, "-ac", "1", "-b:a", "64k", file]);
    made++;
  }
  console.log(`${made} pieces recorded, ${pieces.size} in sounds/voice/`);
}
