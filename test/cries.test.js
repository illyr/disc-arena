import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ASIDES, CRIES, crySlug, DECAP_LINES, END_LINES, FALL_LINES, NAMES, PSEUDOS, PUSH_LINES, START_LINES, voiceSlug } from "../src/pseudos.js";

test("every cry has its recording", () => {
  for (const cry of CRIES) assert.ok(existsSync(`sounds/${crySlug(cry)}.mp3`), cry);
});

test("the crowd has its recordings", () => {
  for (const name of ["cheer", "boo"]) assert.ok(existsSync(`sounds/crowd-${name}.mp3`), name);
});

test("the commentator has every piece of her lines, and every name", () => {
  const bits = [...DECAP_LINES, ...PUSH_LINES, ...FALL_LINES, ...START_LINES, ...Object.values(END_LINES), ...Object.values(ASIDES).flat(),
    ...Object.values(END_LINES).map((end) => `${end} ${END_LINES.last}`)].flatMap((line) => line.split(/\{[A-Z]\}/));
  for (const bit of bits) assert.ok(!voiceSlug(bit) || existsSync(`sounds/voice/${voiceSlug(bit)}.mp3`), bit);
  for (const alias of [...NAMES, ...PSEUDOS.map((p) => p.alias)]) assert.ok(existsSync(`sounds/voice/${voiceSlug("", alias)}.mp3`), alias);
});
