import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_RADIUS, CHEST, FAT, GIANT, DISC_SPEED, FALL_DEATH_Y, HEAD_TOP, JUMP_SPEED, LEVEL, NECK_BOTTOM, PADS, PLATFORMS, RUN_SPEED, WALLS, WALL_HEIGHT,
  hitZone, knock, newBody, newDisc, platformUnder, segmentHits, steer, stepBody, stepDisc,
} from "../src/rules.js";

const DT = 1 / 60;
const STILL = { x: 0, z: 0 };

test("a disc bounces on the arena wall and keeps its speed", () => {
  const d = newDisc(null, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, false);
  for (let i = 0; i < 90; i++) stepDisc(d, { x: 0, y: 0, z: 0 }, DT);
  assert.ok(d.vel.x < 0, "it flies back after the wall");
  assert.equal(d.bounces, 2);
  assert.ok(Math.hypot(d.pos.x, d.pos.z) <= ARENA_RADIUS);
  assert.ok(Math.abs(Math.hypot(d.vel.x, d.vel.z) - DISC_SPEED) < 1e-9);
});

test("every pad throws the player onto its target platform, over no wall", () => {
  for (const pad of PADS) {
    const b = newBody(pad);
    for (let i = 0; i < 240; i++) stepBody(b, STILL, false, DT);
    assert.ok(b.onGround);
    assert.equal(platformUnder(b.pos), PLATFORMS[pad.to]);
    assert.ok(Math.hypot(b.pos.x - PLATFORMS[pad.to].x, b.pos.z - PLATFORMS[pad.to].z) < 0.3, "lands near the center, not stopped by a wall");
  }
});

test("every wall stands on a platform, off its center", () => {
  for (const w of WALLS) {
    for (const end of [-1, 1]) assert.ok(platformUnder({ x: w.x + w.ax * w.half * end, z: w.z + w.az * w.half * end }));
    for (const pl of PLATFORMS) assert.ok(Math.hypot(w.x - pl.x, w.z - pl.z) > 1.5);
  }
});

// A point a distance in front of wall w (across it), and the direction toward the wall.
const facing = (w, distance) => ({
  at: { x: w.x + w.az * distance, z: w.z - w.ax * distance },
  toward: { x: -w.az, z: w.ax },
});

test("a player cannot run through a wall, but can jump over it", () => {
  const w = WALLS[0];
  const { at, toward } = facing(w, 1.5);
  const b = { ...newBody(platformUnder(at)), pos: { x: at.x, y: 0, z: at.z } };
  for (let i = 0; i < 60; i++) stepBody(b, toward, false, DT);
  const ahead = (p) => (p.x - w.x) * -toward.x + (p.z - w.z) * -toward.z;
  assert.ok(ahead(b.pos) > 0.6, "still in front");
  const c = { ...newBody(platformUnder(at)), pos: { x: at.x, y: 0, z: at.z } };
  stepBody(c, toward, true, DT);
  for (let i = 0; i < 60; i++) stepBody(c, toward, false, DT);
  assert.ok(ahead(c.pos) < -0.6, "landed behind");
});

test("a flat disc bounces off a wall, one thrown from a jump flies over", () => {
  const w = WALLS[0];
  const { at, toward } = facing(w, 3);
  const flat = newDisc(null, { x: at.x, y: 0, z: at.z }, toward, false);
  for (let i = 0; i < 20; i++) stepDisc(flat, { x: 0, y: 0, z: 0 }, DT);
  assert.ok(flat.vel.x * toward.x + flat.vel.z * toward.z < 0, "flies back");
  assert.equal(flat.bounces, 2);
  const high = newDisc(null, { x: at.x, y: WALL_HEIGHT, z: at.z }, toward, false);
  for (let i = 0; i < 20; i++) stepDisc(high, { x: 0, y: 0, z: 0 }, DT);
  assert.ok(high.vel.x * toward.x + high.vel.z * toward.z > 0, "flies on");
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

test("no platform stands above another, and the pads reach them all from the center", () => {
  for (const a of PLATFORMS) for (const b of PLATFORMS) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.r + 1, "a gap between any two");
  }
  for (const pl of PLATFORMS) assert.ok(Math.hypot(pl.x, pl.z) + pl.r < ARENA_RADIUS);
  const reached = new Set([0]);
  for (let round = 0; round < PLATFORMS.length; round++) {
    for (const p of PADS) if (reached.has(PLATFORMS.indexOf(platformUnder(p)))) reached.add(p.to);
  }
  assert.equal(reached.size, PLATFORMS.length);
});

test("a running jump does not reach the floor above", () => {
  for (const pl of PLATFORMS.filter((p) => p.y === 0)) {
    const above = PLATFORMS.filter((p) => p.y === LEVEL)
      .sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    const d = Math.hypot(above.x - pl.x, above.z - pl.z), toward = { x: (above.x - pl.x) / d, z: (above.z - pl.z) / d };
    // The best a jump can do: from the very rim, running straight at it.
    const b = {
      pos: { x: pl.x + toward.x * (pl.r - 0.1), y: 0, z: pl.z + toward.z * (pl.r - 0.1) },
      vel: { x: toward.x * RUN_SPEED, y: JUMP_SPEED, z: toward.z * RUN_SPEED }, push: { x: 0, z: 0 }, onGround: false,
    };
    for (let i = 0; i < 120; i++) stepBody(b, toward, false, DT);
    assert.ok(b.pos.y < 0 && !b.onGround, "falls into the void");
  }
});

test("a giant disc hits a player a plain disc flies past", () => {
  const body = newBody({ x: 0, y: 0, z: 0 });
  const a = { x: -1, y: CHEST, z: 2.5 }, b = { x: 1, y: CHEST, z: 2.5 };
  assert.equal(hitZone(a, b, body), null);
  assert.equal(hitZone(a, b, body, GIANT), "body");
});

test("a fat player is hit far from a disc's line, and from the floor above", () => {
  const body = newBody({ x: 0, y: 0, z: 0 });
  const a = { x: -1, y: CHEST, z: 2 }, b = { x: 1, y: CHEST, z: 2 };
  assert.equal(hitZone(a, b, body), null);
  assert.equal(hitZone(a, b, body, 1, FAT), "body");
  const above = { x: -1, y: LEVEL + CHEST, z: 0 }, past = { x: 1, y: LEVEL + CHEST, z: 0 };
  assert.equal(hitZone(above, past, body), null);
  assert.equal(hitZone(above, past, body, 1, FAT), "body");
});

test("a disc counts its rebounds, on the arena wall as on a cover", () => {
  const d = newDisc(null, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, false);
  for (let i = 0; i < 90; i++) stepDisc(d, { x: 0, y: 0, z: 0 }, DT);
  assert.equal(d.rebounds, 1);
});

test("a homing disc turns onto a target off its line", () => {
  const d = newDisc(null, { x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, false);
  const target = { x: 10, z: 6 };
  let closest = Infinity;
  for (let i = 0; i < 60; i++) {
    steer(d, target, DT);
    stepDisc(d, { x: 0, y: 0, z: 0 }, DT);
    closest = Math.min(closest, Math.hypot(d.pos.x - target.x, d.pos.z - target.z));
  }
  assert.ok(closest < 0.7, `passes ${closest.toFixed(2)} from it`);
  assert.ok(Math.abs(Math.hypot(d.vel.x, d.vel.z) - DISC_SPEED) < 1e-9);
});

test("on slippery feet a player keeps sliding after letting go of the keys", () => {
  const dry = newBody(PLATFORMS[0]), wet = newBody(PLATFORMS[0]);
  wet.slippery = true;
  for (const b of [dry, wet]) {
    b.vel.x = RUN_SPEED;
    stepBody(b, STILL, false, DT);
  }
  assert.equal(dry.vel.x, 0);
  assert.ok(wet.vel.x > RUN_SPEED * 0.9);
});

test("a vanished platform drops whoever stands on it, and its walls are gone", () => {
  const pl = PLATFORMS[1];
  const b = newBody(pl);
  pl.gone = true;
  try {
    for (let i = 0; i < 30; i++) stepBody(b, STILL, false, DT);
    assert.ok(b.pos.y < pl.y - 1, "falls");
    const d = newDisc(null, { x: pl.x - 2, y: 0, z: 2 }, { x: 1, z: 0 }, false);
    for (let i = 0; i < 10; i++) stepDisc(d, { x: 0, y: 0, z: 0 }, DT);
    assert.equal(d.rebounds, 0, "flies through where the cover stood");
  } finally {
    pl.gone = false;
  }
});

test("a disc aimed down bounces off the platform, one aimed up hits a player on the floor above", () => {
  const down = newDisc(null, { x: 0, y: LEVEL, z: -6 }, { x: 0, y: -0.5, z: Math.sqrt(0.75) }, false);
  for (let i = 0; i < 30; i++) stepDisc(down, { x: 0, y: 0, z: 0 }, DT);
  assert.equal(down.rebounds, 1);
  assert.ok(down.vel.y > 0 && down.pos.y >= 0, "off the center, back up");
  const above = newBody(PLATFORMS[5]), pitch = 0.22;
  const from = { x: 15.5, y: 0, z: -1 }; // on the ground platform below, clear of its covers
  const dx = above.pos.x - from.x, dz = above.pos.z - from.z, len = Math.hypot(dx, dz);
  const up = newDisc(null, from, { x: (dx / len) * Math.cos(pitch), y: Math.sin(pitch), z: (dz / len) * Math.cos(pitch) }, false);
  let zone = null;
  for (let i = 0; i < 60 && !zone; i++) {
    stepDisc(up, { x: 0, y: 0, z: 0 }, DT);
    zone = hitZone(up.prev, up.pos, above);
  }
  assert.ok(zone, "reaches the player one floor up");
});
