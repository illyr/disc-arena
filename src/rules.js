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
export const ARENA_RADIUS = 20; // the wall the discs bounce on
export const DISC_SPEED = 24;
export const DISC_LIFE = 3; // seconds before a disc flies home
export const MAX_DISCS = 3;
export const PAD_RADIUS = 0.9;
export const PAD_FLIGHT = 1.1;
export const BODY_RADIUS = 0.5;
export const DISC_RADIUS = 0.32;
// Cover: chest high, so that a flat disc bounces off it while one thrown from a jump flies over.
export const WALL_HEIGHT = 2;
export const WALL_THICKNESS = 0.4;

const RING = [[13, 0], [-13, 0], [0, 13], [0, -13]];
export const PLATFORMS = [{ x: 0, z: 0, r: 5 }, ...RING.map(([x, z]) => ({ x, z, r: 4 }))];
// The center has a pad to each outer platform, each outer platform a pad back to the center.
export const PADS = RING.flatMap(([x, z], i) => [
  { x: x * 0.27, z: z * 0.27, to: i + 1 },
  { x: x * 0.8, z: z * 0.8, to: 0 },
]);

// Each wall: its middle, the unit direction it runs along, half its length. On the center platform they
// stand on the diagonals, on the outer ones beside the axis: off the flights of the pads.
const DIAGONAL = Math.SQRT1_2;
export const WALLS = [
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({
    x: sx * 2.6 * DIAGONAL, z: sz * 2.6 * DIAGONAL, ax: -sz * DIAGONAL, az: sx * DIAGONAL, half: 1,
  })),
  ...RING.flatMap(([x, z]) => {
    const ux = Math.sign(x), uz = Math.sign(z); // toward the outside
    return [-1, 1].map((side) => ({ x: x - ux * 0.8 - uz * side * 2, z: z - uz * 0.8 + ux * side * 2, ax: uz, az: ux, half: 0.8 }));
  }),
];

// Where p stands from wall w: along it (u) and across it (v).
const wallLocal = (p, w) => {
  const dx = p.x - w.x, dz = p.z - w.z;
  return { u: dx * w.ax + dz * w.az, v: dz * w.ax - dx * w.az };
};

// Keeps a body out of the walls it stands below the top of.
function blockBody(b) {
  if (b.pos.y >= WALL_HEIGHT) return;
  const reach = WALL_THICKNESS / 2 + BODY_RADIUS;
  for (const w of WALLS) {
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

export const platformUnder = (p) => PLATFORMS.find((pl) => Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r);
export const chest = (b) => ({ x: b.pos.x, y: b.pos.y + CHEST, z: b.pos.z });

export function newBody(platform) {
  return { pos: { x: platform.x, y: 0, z: platform.z }, vel: { x: 0, y: 0, z: 0 }, push: { x: 0, z: 0 }, onGround: true };
}

// wish: the wanted direction on the ground, of length 0 to 1.
export function stepBody(b, wish, jump, dt) {
  if (b.onGround) {
    b.vel.x = wish.x * RUN_SPEED;
    b.vel.z = wish.z * RUN_SPEED;
    const k = Math.exp(-PUSH_DECAY * dt);
    b.push.x *= k;
    b.push.z *= k;
    if (jump) b.vel.y = JUMP_SPEED;
  }
  b.vel.y -= GRAVITY * dt;
  b.pos.x += (b.vel.x + b.push.x) * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += (b.vel.z + b.push.z) * dt;
  blockBody(b);
  // Under the top by less than a meter: landed. Deeper, it went past the edge and keeps falling.
  b.onGround = b.vel.y <= 0 && b.pos.y <= 0 && b.pos.y > -1 && !!platformUnder(b.pos);
  if (b.onGround) {
    b.pos.y = 0;
    b.vel.y = 0;
  }
  const pad = b.onGround && PADS.find((p) => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < PAD_RADIUS);
  if (pad) launch(b, PLATFORMS[pad.to]);
}

// The flight from a pad lands on the center of the target platform after PAD_FLIGHT seconds.
export function launch(b, to) {
  b.vel.x = (to.x - b.pos.x) / PAD_FLIGHT;
  b.vel.z = (to.z - b.pos.z) / PAD_FLIGHT;
  b.vel.y = (GRAVITY * PAD_FLIGHT) / 2;
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
export function newDisc(owner, from, dir, decap) {
  return {
    owner,
    decap,
    cost: decap ? MAX_DISCS : 1,
    bounces: decap ? 1 : 3,
    age: 0,
    returning: false,
    pos: { x: from.x + dir.x * 0.8, y: from.y + CHEST, z: from.z + dir.z * 0.8 },
    prev: null,
    vel: { x: dir.x * DISC_SPEED, y: 0, z: dir.z * DISC_SPEED },
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
  if (!d.returning && r > ARENA_RADIUS) {
    const nx = d.pos.x / r, nz = d.pos.z / r;
    const dot = d.vel.x * nx + d.vel.z * nz;
    d.vel.x -= 2 * dot * nx;
    d.vel.z -= 2 * dot * nz;
    d.pos.x = nx * ARENA_RADIUS;
    d.pos.z = nz * ARENA_RADIUS;
    if (--d.bounces < 0) d.returning = true;
  }
  if (!d.returning && d.pos.y < WALL_HEIGHT) bounceOffWalls(d);
}

// A disc that reaches a wall, or crossed it during the frame, bounces back to the side it came from.
function bounceOffWalls(d) {
  const reach = WALL_THICKNESS / 2 + DISC_RADIUS;
  for (const w of WALLS) {
    const a = wallLocal(d.prev, w), b = wallLocal(d.pos, w);
    const crossed = Math.sign(a.v) !== Math.sign(b.v);
    if (Math.abs(b.u) > w.half + DISC_RADIUS || (!crossed && Math.abs(b.v) >= reach)) continue;
    const side = Math.sign(a.v) || 1;
    const nx = -w.az * side, nz = w.ax * side; // the wall's normal, toward the side the disc came from
    const dot = d.vel.x * nx + d.vel.z * nz;
    if (dot >= 0) continue; // already leaving
    d.vel.x -= 2 * dot * nx;
    d.vel.z -= 2 * dot * nz;
    d.pos.x = w.x + w.ax * b.u + nx * reach;
    d.pos.z = w.z + w.az * b.u + nz * reach;
    if (--d.bounces < 0) d.returning = true;
    return;
  }
}

// Whether the segment a-b, a disc's move in one frame, passes within radius of c.
export function segmentHits(a, b, c, radius) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 ? Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2)) : 0;
  return Math.hypot(a.x + abx * t - c.x, a.y + aby * t - c.y, a.z + abz * t - c.z) < radius;
}

// Where a disc's move in one frame hits a player: null, "body", or "neck" (the long neck and the head).
export function hitZone(a, b, body) {
  const y = (a.y + b.y) / 2 - body.pos.y;
  if (y < 0 || y > HEAD_TOP) return null;
  const flat = (p) => ({ x: p.x, y: 0, z: p.z });
  if (!segmentHits(flat(a), flat(b), flat(body.pos), HIT_RADIUS)) return null;
  return y >= NECK_BOTTOM ? "neck" : "body";
}
