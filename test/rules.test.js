import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_RADIUS, CHEST, DISC_SPEED, FALL_DEATH_Y, HEAD_TOP, NECK_BOTTOM, PADS, PLATFORMS,
  hitZone, knock, newBody, newDisc, platformUnder, segmentHits, stepBody, stepDisc,
} from "../src/rules.js";

const DT = 1 / 60;
const STILL = { x: 0, z: 0 };

test("a disc bounces on the arena wall and keeps its speed", () => {
  const d = newDisc(null, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, false);
  for (let i = 0; i < 60; i++) stepDisc(d, { x: 0, y: 0, z: 0 }, DT);
  assert.ok(d.vel.x < 0, "it flies back after the wall");
  assert.equal(d.bounces, 2);
  assert.ok(Math.hypot(d.pos.x, d.pos.z) <= ARENA_RADIUS);
  assert.ok(Math.abs(Math.hypot(d.vel.x, d.vel.z) - DISC_SPEED) < 1e-9);
});

test("a pad throws the player onto its target platform", () => {
  const pad = PADS[0];
  const b = newBody(pad);
  for (let i = 0; i < 120; i++) stepBody(b, STILL, false, DT);
  assert.ok(b.onGround);
  assert.equal(platformUnder(b.pos), PLATFORMS[pad.to]);
});

test("a hit from the center of an outer platform pushes the player into the void", () => {
  const b = newBody(PLATFORMS[1]);
  knock(b, { x: 1, z: 0 });
  for (let i = 0; i < 300; i++) stepBody(b, STILL, false, DT);
  assert.ok(b.pos.y < FALL_DEATH_Y);
});

test("a player running against the push stays on the center platform", () => {
  const b = newBody(PLATFORMS[0]);
  knock(b, { x: 1, z: 0 });
  for (let i = 0; i < 300; i++) stepBody(b, { x: b.push.x > 0.5 ? -1 : 0, z: 0 }, false, DT);
  assert.ok(b.onGround);
});

test("a disc at chest height hits the body, one thrown from a jump the neck, one higher nothing", () => {
  const target = newBody(PLATFORMS[0]);
  const at = (y) => hitZone({ x: -1, y, z: 0 }, { x: 1, y, z: 0 }, target);
  assert.equal(at(CHEST), "body");
  assert.equal(at(NECK_BOTTOM + 0.3), "neck");
  assert.equal(at(HEAD_TOP + 0.1), null);
});

test("a jump clears a disc flying at chest height", () => {
  const b = newBody(PLATFORMS[0]);
  let top = 0;
  stepBody(b, STILL, true, DT);
  for (let i = 0; i < 60; i++) {
    stepBody(b, STILL, false, DT);
    top = Math.max(top, b.pos.y);
  }
  assert.ok(top > CHEST);
});

test("a disc's move hits a chest it passes through, not one beside it", () => {
  const a = { x: 0, y: 1.2, z: 0 }, b = { x: 1, y: 1.2, z: 0 };
  assert.ok(segmentHits(a, b, { x: 0.5, y: 1.2, z: 0.3 }, 0.6));
  assert.ok(!segmentHits(a, b, { x: 0.5, y: 1.2, z: 1 }, 0.6));
});
