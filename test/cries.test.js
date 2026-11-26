import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CRIES, crySlug } from "../src/pseudos.js";

test("every cry has its recording", () => {
  for (const cry of CRIES) assert.ok(existsSync(`sounds/${crySlug(cry)}.mp3`), cry);
});
