// The game's rules, free of Three.js so that node can test them: positions and
// velocities are plain {x, y, z} objects, y up, feet at y = 0 on a platform.

export const GRAVITY = 20;
export const RUN_SPEED = 7;
export const JUMP_SPEED = 10;
export const PUSH_SPEED = 8;
export const PUSH_LIFT = 3;
export const PUSH_DECAY = 3; // per second, on the ground only: a pushed player slides
export const FALL_DEATH_Y = -25;
export const CHEST = 1.55; // the discs fly flat, at chest height
export const HIT_RADIUS = 0.7;
export const NECK_BOTTOM = 2.15; // above it, up to the top of the head, a disc cuts the head off
export const HEAD_TOP = 3.65;
export const LEGS_TOP = 0.9; // the long legs: below it, a plain disc cuts one off; without them, a player sinks by as much
export const HOP_SPEED = 4; // on one leg, a player moves by little hops
export const LEG_SPEED = [0.35, 0.6, 1]; // the running speed with 0, 1 or 2 legs
export const ARENA_RADIUS = 30; // the wall the discs bounce on
export const DISC_SPEED = 24;
export const DISC_LIFE = 3; // seconds before a disc flies home
export const MAX_DISCS = 3;
export const PAD_RADIUS = 0.9;
export const PAD_FLIGHT = 1.1; // seconds, up to PAD_REACH away; longer for longer flights
export const PAD_REACH = 12;
export const LEVEL = 3; // between two floors: higher than a jump, so only the pads go up
export const BODY_RADIUS = 0.5;
export const DISC_RADIUS = 0.32;
// Cover: chest high, so that a flat disc bounces off it while one thrown from a jump flies over.
export const WALL_HEIGHT = 2;
export const WALL_THICKNESS = 0.4;
// The booster on the towers: the discs of whoever takes it are GIANT times as wide, for BOOST_TIME seconds.
export const GIANT = 10;
export const BOOST_TIME = 60;
// The maluses: whoever takes one is FAT times bigger every way for FAT_TIME seconds, an easy target.
export const FAT = 4;
export const FAT_TIME = 10;
export const ICE_GRIP = 1.5; // per second: on slippery feet, how fast the speed follows the keys
export const HOMING_TURN = 2.5; // radians a second a homing disc turns toward its target

// Three floors, none above another: the center and four platforms on the axes on the ground, four on the
// diagonals one floor up, four towers on the axes two floors up, near the wall. Going down: a jump off the
// edge, or the towers' pads. Going up: the pads only.
const AXES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ring = (distance, y, r, turn) => AXES.map(([x, z]) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  return { x: (x * c - z * s) * distance, z: (x * s + z * c) * distance, y, r };
});
export const PLATFORMS = [
  { x: 0, z: 0, y: 0, r: 6 },
  ...ring(14, 0, 4, 0), // 1-4
  ...ring(17, LEVEL, 3.5, Math.PI / 4), // 5-8, the diagonal next to each of the above, turning
  ...ring(25, 2 * LEVEL, 2.5, 0), // 9-12, the towers
];
// A pad sits on its platform's rim, on the side of the platform it throws to.
const pad = (from, to) => {
  const a = PLATFORMS[from], b = PLATFORMS[to], d = Math.hypot(b.x - a.x, b.z - a.z), k = (a.r - 1.2) / d;
  return { x: a.x + (b.x - a.x) * k, y: a.y, z: a.z + (b.z - a.z) * k, to };
};
export const PADS = [1, 2, 3, 4].flatMap((i) => [
  pad(0, i), pad(i, 0), // the center and the ground ring, both ways
  pad(i, i + 4), // up to the diagonal
  pad(i + 4, i + 8), // up to the tower
  pad(i + 8, 0), // from the tower back down to the center
]);

// Each wall: its middle, its floor, the unit direction it runs along, half its length. On the center
// platform they stand on the diagonals, on the ground ring beside the axis: off the flights of the pads.
const DIAGONAL = Math.SQRT1_2;
export const WALLS = [
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({
    x: sx * 3.2 * DIAGONAL, y: 0, z: sz * 3.2 * DIAGONAL, ax: -sz * DIAGONAL, az: sx * DIAGONAL, half: 1.2,
  })),
  ...AXES.flatMap(([ux, uz]) => [-1, 1].map((side) => ({
    x: ux * 13.2 - uz * side * 2, y: 0, z: uz * 13.2 + ux * side * 2, ax: uz, az: ux, half: 0.8,
  }))),
];

// Where p stands from wall w: along it (u) and across it (v).
const wallLocal = (p, w) => {
  const dx = p.x - w.x, dz = p.z - w.z;
  return { u: dx * w.ax + dz * w.az, v: dz * w.ax - dx * w.az };
};

// Keeps a body out of the walls it stands below the top of.
function blockBody(b) {
  const reach = WALL_THICKNESS / 2 + BODY_RADIUS;
  for (const w of WALLS) {
    if (w.on.gone || b.pos.y >= w.y + WALL_HEIGHT || b.pos.y < w.y - 1) continue;
    const { u, v } = wallLocal(b.pos, w);
    const along = Math.max(-w.half, Math.min(w.half, u));
    const cx = w.x + w.ax * along, cz = w.z + w.az * along;
    const dx = b.pos.x - cx, dz = b.pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist >= reach) continue;
    // Right on the line: out by the side it is on.
    const nx = dist ? dx / dist : -w.az * Math.sign(v || 1), nz = dist ? dz / dist : w.ax * Math.sign(v || 1);
    b.pos.x = cx + nx * reach;
    b.pos.z = cz + nz * reach;
  }
}

// A platform can vanish for a while (gone, set by the game): it no longer holds anyone, nor its walls.
export const thickness = (pl) => (pl.y ? 0.6 : 1.5); // the upper floors thin: a flat disc flies under them
export const platformUnder = (p) => PLATFORMS.find((pl) => !pl.gone && Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r);
for (const w of WALLS) w.on = platformUnder(w);
export const chest = (b) => ({ x: b.pos.x, y: b.pos.y + CHEST, z: b.pos.z });

export function newBody(platform) {
  return { pos: { x: platform.x, y: platform.y, z: platform.z }, vel: { x: 0, y: 0, z: 0 }, push: { x: 0, z: 0 }, onGround: true };
}

// wish: the wanted direction on the ground, of length 0 to 1. On slippery feet, the speed follows it slowly.
// b.legs: 2 runs and jumps; 1 hops, slower; 0 crawls, slower still, and jumps no more.
export function stepBody(b, wish, jump, dt) {
  const legs = b.legs ?? 2;
  if (b.onGround) {
    const grip = b.slippery ? 1 - Math.exp(-ICE_GRIP * dt) : 1;
    const speed = RUN_SPEED * LEG_SPEED[legs];
    b.vel.x += (wish.x * speed - b.vel.x) * grip;
    b.vel.z += (wish.z * speed - b.vel.z) * grip;
    const k = Math.exp(-PUSH_DECAY * dt);
    b.push.x *= k;
    b.push.z *= k;
    if (jump && legs) b.vel.y = legs > 1 ? JUMP_SPEED : JUMP_SPEED * 0.7;
    else if (legs === 1 && (wish.x || wish.z)) b.vel.y = HOP_SPEED;
  }
  b.vel.y -= GRAVITY * dt;
  const was = b.pos.y;
  b.pos.x += (b.vel.x + b.push.x) * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += (b.vel.z + b.push.z) * dt;
  blockBody(b);
  // Landed if it went through the top during the frame. From below, it went past the edge and keeps falling.
  const pl = platformUnder(b.pos);
  b.onGround = !!pl && b.vel.y <= 0 && b.pos.y <= pl.y && was >= pl.y;
  if (b.onGround) {
    b.pos.y = pl.y;
    b.vel.y = 0;
  }
  const pad = b.onGround && PADS.find((p) => p.y === pl.y && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < PAD_RADIUS);
  if (pad) launch(b, PLATFORMS[pad.to]);
}

// The flight from a pad lands on the center of the target platform, whatever its floor.
export function launch(b, to) {
  const time = PAD_FLIGHT * Math.max(1, Math.hypot(to.x - b.pos.x, to.z - b.pos.z) / PAD_REACH);
  b.vel.x = (to.x - b.pos.x) / time;
  b.vel.z = (to.z - b.pos.z) / time;
  b.vel.y = (to.y - b.pos.y) / time + (GRAVITY * time) / 2;
  b.push.x = b.push.z = 0;
  b.onGround = false;
}

export function knock(b, dir) {
  const len = Math.hypot(dir.x, dir.z) || 1;
  b.push.x = (dir.x / len) * PUSH_SPEED;
  b.push.z = (dir.z / len) * PUSH_SPEED;
  b.vel.y = PUSH_LIFT;
  b.onGround = false;
}

// The decapitator takes the three discs and bounces once; a plain disc takes one and bounces three times.
// dir: where it was aimed, a unit vector, up or down too. size: how many times wider than a plain disc.
export function newDisc(owner, from, dir, decap, size = 1) {
  return {
    owner,
    decap,
    size,
    cost: decap ? MAX_DISCS : 1,
    bounces: decap ? 1 : 3,
    rebounds: 0, // so far: a hit after some is a trickshot
    age: 0,
    returning: false,
    pos: { x: from.x + dir.x * 0.8, y: from.y + CHEST, z: from.z + dir.z * 0.8 },
    prev: null,
    vel: { x: dir.x * DISC_SPEED, y: (dir.y ?? 0) * DISC_SPEED, z: dir.z * DISC_SPEED },
  };
}

// home: where a returning disc flies to, its owner's chest.
export function stepDisc(d, home, dt) {
  d.age += dt;
  if (d.age > DISC_LIFE) d.returning = true;
  if (d.returning) {
    const dx = home.x - d.pos.x, dy = home.y - d.pos.y, dz = home.z - d.pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    d.vel = { x: (dx / len) * DISC_SPEED, y: (dy / len) * DISC_SPEED, z: (dz / len) * DISC_SPEED };
  }
  d.prev = { ...d.pos };
  d.pos.x += d.vel.x * dt;
  d.pos.y += d.vel.y * dt;
  d.pos.z += d.vel.z * dt;
  const r = Math.hypot(d.pos.x, d.pos.z);
  const edge = ARENA_RADIUS - DISC_RADIUS * (d.size - 1); // a giant disc bounces on its rim, too
  if (!d.returning && r > edge) {
    const nx = d.pos.x / r, nz = d.pos.z / r;
    const dot = d.vel.x * nx + d.vel.z * nz;
    d.vel.x -= 2 * dot * nx;
    d.vel.z -= 2 * dot * nz;
    d.pos.x = nx * edge;
    d.pos.z = nz * edge;
    d.rebounds++;
    if (--d.bounces < 0) d.returning = true;
  }
  if (!d.returning) bounceOffWalls(d);
  if (!d.returning) bounceOffPlatforms(d);
}

// A disc thrown up or down bounces off the top or the bottom of a platform it goes through.
function bounceOffPlatforms(d) {
  for (const pl of PLATFORMS) {
    if (pl.gone || Math.hypot(d.pos.x - pl.x, d.pos.z - pl.z) >= pl.r) continue;
    const bottom = pl.y - thickness(pl);
    const down = d.prev.y >= pl.y && d.pos.y < pl.y, up = d.prev.y <= bottom && d.pos.y > bottom;
    if (!down && !up) continue;
    d.vel.y = -d.vel.y;
    d.pos.y = down ? pl.y : bottom;
    d.rebounds++;
    if (--d.bounces < 0) d.returning = true;
    return;
  }
}

// A disc that reaches a wall, or crossed it during the frame, bounces back to the side it came from.
function bounceOffWalls(d) {
  const radius = DISC_RADIUS * d.size, reach = WALL_THICKNESS / 2 + radius;
  for (const w of WALLS) {
    if (w.on.gone || d.pos.y < w.y || d.pos.y >= w.y + WALL_HEIGHT) continue;
    const a = wallLocal(d.prev, w), b = wallLocal(d.pos, w);
    const crossed = Math.sign(a.v) !== Math.sign(b.v);
    if (Math.abs(b.u) > w.half + radius || (!crossed && Math.abs(b.v) >= reach)) continue;
    const side = Math.sign(a.v) || 1;
    const nx = -w.az * side, nz = w.ax * side; // the wall's normal, toward the side the disc came from
    const dot = d.vel.x * nx + d.vel.z * nz;
    if (dot >= 0) continue; // already leaving
    d.vel.x -= 2 * dot * nx;
    d.vel.z -= 2 * dot * nz;
    d.pos.x = w.x + w.ax * b.u + nx * reach;
    d.pos.z = w.z + w.az * b.u + nz * reach;
    d.rebounds++;
    if (--d.bounces < 0) d.returning = true;
    return;
  }
}

// Turns a flying disc toward to, at most HOMING_TURN radians a second, at the same speed.
export function steer(d, to, dt) {
  const heading = Math.atan2(d.vel.z, d.vel.x), want = Math.atan2(to.z - d.pos.z, to.x - d.pos.x);
  const max = HOMING_TURN * dt;
  const turn = Math.max(-max, Math.min(max, Math.atan2(Math.sin(want - heading), Math.cos(want - heading))));
  const speed = Math.hypot(d.vel.x, d.vel.z);
  d.vel.x = Math.cos(heading + turn) * speed;
  d.vel.z = Math.sin(heading + turn) * speed;
}

// Whether the segment a-b, a disc's move in one frame, passes within radius of c.
export function segmentHits(a, b, c, radius) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 ? Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2)) : 0;
  return Math.hypot(a.x + abx * t - c.x, a.y + aby * t - c.y, a.z + abz * t - c.z) < radius;
}

// Where a disc's move in one frame hits a player: null, "legs", "body", or "neck" (the long neck and the head).
// size: the disc's, a giant one hits further from its line. scale: the body's, a fat one is hit higher and wider.
export function hitZone(a, b, body, size = 1, scale = 1) {
  // The height where the disc's line crosses the player's axis: what it cuts, flying down or up as flat.
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = len2 ? ((body.pos.x - a.x) * dx + (body.pos.z - a.z) * dz) / len2 : 0.5;
  const y = (a.y + (b.y - a.y) * t - body.pos.y) / scale + (body.legs === 0 ? LEGS_TOP : 0);
  if (y < 0 || y > HEAD_TOP) return null;
  const flat = (p) => ({ x: p.x, y: 0, z: p.z });
  if (!segmentHits(flat(a), flat(b), flat(body.pos), HIT_RADIUS * scale + DISC_RADIUS * (size - 1))) return null;
  // The legs not scaled: a fat player's huge legs would take every flat disc, and never be pushed.
  return y >= NECK_BOTTOM ? "neck" : y * scale < LEGS_TOP ? "legs" : "body";
}
