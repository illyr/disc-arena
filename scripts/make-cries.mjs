// Records the announcer's cries into sounds/: node scripts/make-cries.mjs (macOS: say, and ffmpeg); a cry as argument records only it.
// The voice Thomas, slow, a little lower, bass boosted, compressed, and an echo that starts after the word.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CRIES, crySlug } from "../src/pseudos.js";

// How say must read the cries it reads wrong.
const SPOKEN = { "Fraggez !": "Fraguez !", "Et c'est le buuut !": "Et c'est le but !" };
const ENGLISH = ["Big Fat Disc !"]; // said by an English voice, Daniel
const EFFECTS = "asetrate=22050*0.9,aresample=44100,asubboost=dry=1:wet=0.6:boost=3,highpass=f=60,"
  + "acompressor=threshold=0.1:ratio=5:attack=5:release=150,apad=pad_dur=0.8,aecho=0.8:0.6:260|520:0.35|0.18,volume=2,alimiter=limit=0.95";

const tmp = mkdtempSync(join(tmpdir(), "cries-"));
mkdirSync("sounds", { recursive: true });
const only = process.argv[2];
const cries = CRIES.filter((c) => !only || c === only);
for (const cry of cries) {
  const raw = join(tmp, "raw.aiff");
  execFileSync("say", ["-v", ENGLISH.includes(cry) ? "Daniel" : "Thomas", "-r", "105", "--data-format=BEI16@22050", SPOKEN[cry] ?? cry, "-o", raw]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-af", EFFECTS, "-b:a", "64k", `sounds/${crySlug(cry)}.mp3`]);
}
rmSync(tmp, { recursive: true });
console.log(`${cries.length} cries in sounds/`);
