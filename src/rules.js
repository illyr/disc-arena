// The game's rules, free of Three.js so that node can test them: positions and
// velocities are plain {x, y, z} objects, y up, feet at y = 0 on a platform.

export const GRAVITY = 20;
export const RUN_SPEED = 7;
export const JUMP_SPEED = 10;
export const PUSH_SPEED = 12;
export const PUSH_LIFT = 3;
export const PUSH_DECAY = 1.25; // per second, on the ground only: a pushed player slides, across a wide platform
export const FALL_DEATH_Y = -25;
export const CHEST = 1.55; // the discs fly flat, at chest height
export const HIT_RADIUS = 0.7;
export const NECK_BOTTOM = 2.2; // above the body: from it up to the top of the head, a disc cuts the head off
export const HEAD_TOP = 3.75;
export const NECK_GROWTH = 0.5; // m of neck a victim adds, body.neck in all (main.js): a taller target
export const NECK_RADIUS = 0.4; // the neck and the head are thin: a disc must pass closer to cut them than to hit the body
export const LEGS_TOP = 1.3; // the long legs: below it, a plain disc cuts one off; without them, a player sinks by as much
export const HOP_SPEED = 4; // on one leg, a player moves by little hops
export const LEGS = 2; // two cuts and it crawls: four took too long to see
export const LEG_SPEED = [0.35, 0.6, 1]; // the running speed with 0 to 2 legs
export const ARENA_RADIUS = 108; // the wall the discs bounce on
export const DISC_SPEED = 32;
export const DISC_LIFE = 4; // seconds before a disc flies home
export const MAX_DISCS = 3;
export const PAD_RADIUS = 0.9;
export const PAD_FLIGHT = 1.1; // seconds, up to PAD_REACH away; longer for longer flights
export const PAD_REACH = 43.5;
export const LEVEL = 3; // between two floors: higher than a jump, so only the pads go up
export const BODY_RADIUS = 0.5;
export const DISC_RADIUS = 0.32;
// Cover: a disc bounces off it, unless thrown from the floor above.
export const WALL_HEIGHT = 4.5; // a house front, higher than a jump and than a player: a real cover
export const WALL_THICKNESS = 0.4;
// The booster on the towers: whoever takes it has GIANT_DISCS discs instead of MAX_DISCS, for BOOST_TIME seconds.
export const GIANT_DISCS = 12;
export const BOOST_TIME = 60;
// The maluses: whoever takes one is FAT times bigger every way for FAT_TIME seconds, an easy target.
export const FAT = 4;
export const FAT_TIME = 10;
export const ICE_GRIP = 1.5; // per second: on slippery feet, how fast the speed follows the keys
export const HOMING_TURN = 2.5; // radians a second a homing disc turns toward its target

// Three floors, none above another: the center and four platforms on the axes on the ground, four on the
// diagonals one floor up, four towers on the axes two floors up, near the wall. From one to the next,
// up or down: the pads. On the ground, four ferries go from one platform of the ring
// to the next and back, at the speed of a walk.
const AXES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ring = (distance, y, r, turn) => AXES.map(([x, z]) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  return { x: (x * c - z * s) * distance, z: (x * s + z * c) * distance, y, r };
});
const GROUND_RING = 50.4;
const FERRY_RADIUS = 6;
export const FERRY_PERIOD = 30; // s there and back, slowing down at each end
export const PLATFORMS = [
  { x: 0, z: 0, y: 0, r: 14.4 }, // 20 strides across
  ...ring(GROUND_RING, 0, 9.6, 0), // 1-4
  ...ring(61.2, LEVEL, 8.4, Math.PI / 4), // 5-8, the diagonal next to each of the above, turning
  ...ring(90, 2 * LEVEL, 6, 0), // 9-12, the towers
];
// 13-16, the ferries: from platform i of the ring to the next, their rims over both at the ends.
for (let i = 1; i <= 4; i++) {
  const a = PLATFORMS[i], b = PLATFORMS[(i % 4) + 1], d = Math.hypot(b.x - a.x, b.z - a.z);
  const end = (from, to) => ({ x: from.x + ((to.x - from.x) / d) * (a.r + FERRY_RADIUS - 1.5), z: from.z + ((to.z - from.z) / d) * (a.r + FERRY_RADIUS - 1.5) });
  const ferry = { from: end(a, b), to: end(b, a) };
  PLATFORMS.push({ ...ferry.from, y: 0, r: FERRY_RADIUS, ferry });
}
// Moves the ferries to where they are at time t, each a quarter of a trip after the one before;
// dx, dz: their move since the last call, which carries whoever stands on them.
export function moveFerries(t) {
  PLATFORMS.filter((pl) => pl.ferry).forEach((pl, i) => {
    const k = (1 - Math.cos(2 * Math.PI * (t / FERRY_PERIOD + i / 4))) / 2, { from, to } = pl.ferry;
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    Object.assign(pl, { dx: x - pl.x, dz: z - pl.z, x, z });
  });
}
// A pad sits on its platform's rim, on the side of the platform it throws to.
const pad = (from, to) => {
  const a = PLATFORMS[from], b = PLATFORMS[to], d = Math.hypot(b.x - a.x, b.z - a.z), k = (a.r - 1.2) / d;
  return { x: a.x + (b.x - a.x) * k, y: a.y, z: a.z + (b.z - a.z) * k, to };
};
// Every platform throws to each of its neighbours, and back: the map read at a glance.
const next = (i) => (i % 4) + 1; // the next of the ring, 1 to 4 round
export const PADS = [1, 2, 3, 4].flatMap((i) => [
  pad(0, i), pad(i, 0), // the center and the ground ring
  pad(0, i + 4), // up from the center too: a way out of the rising lava from every ground platform
  pad(i, i + 4), pad(i + 4, i), pad(next(i), i + 4), pad(i + 4, next(i)), // a diagonal and the ground on both its sides
  pad(i + 4, i + 8), pad(i + 8, i + 4), pad(i + 4, next(i) + 8), pad(next(i) + 8, i + 4), // a diagonal and the towers on both its sides
  pad(i, i + 8), pad(i + 8, i), // a tower and the ground on its axis
]);

// The tunnels: four covered lanes across the center platform, out from the middle between the flights of the pads,
// open at both ends: a wall on each side, a roof the discs bounce off. Each: its middle, its direction, half its length.
export const TUNNEL_WIDTH = 2.6;
export const TUNNELS = [0, 1, 2, 3].map((k) => {
  const a = (3 * Math.PI) / 8 + (k * Math.PI) / 2;
  return { x: 9 * Math.cos(a), y: 0, z: 9 * Math.sin(a), ax: Math.cos(a), az: Math.sin(a), half: 3 };
});
// The tunnel p is under the roof of, if any.
export const tunnelAt = (p) => TUNNELS.find((t) => {
  const dx = p.x - t.x, dz = p.z - t.z;
  return p.y < t.y + WALL_HEIGHT && Math.abs(dx * t.ax + dz * t.az) < t.half && Math.abs(dz * t.ax - dx * t.az) < TUNNEL_WIDTH / 2;
});

// Each wall: its middle, its floor, the unit direction it runs along, half its length. On the center
// platform they stand between an axis and a diagonal, on the ground ring beside the axis: off the flights of the pads,
// and off the way from the middle to them.
export const WALLS = [
  ...[0, 1, 2, 3].map((k) => {
    const a = Math.PI / 8 + (k * Math.PI) / 2;
    return { x: 10.5 * Math.cos(a), y: 0, z: 10.5 * Math.sin(a), ax: -Math.sin(a), az: Math.cos(a), half: 3 };
  }),
  ...AXES.flatMap(([ux, uz]) => [-1, 1].map((side) => ({
    x: ux * (GROUND_RING - 1.9) - uz * side * 4.8, y: 0, z: uz * (GROUND_RING - 1.9) + ux * side * 4.8, ax: uz, az: ux, half: 2.5,
  }))),
  ...TUNNELS.flatMap((t) => [-1, 1].map((side) => ({
    x: t.x - t.az * side * TUNNEL_WIDTH / 2, y: 0, z: t.z + t.ax * side * TUNNEL_WIDTH / 2, ax: t.ax, az: t.az, half: t.half,
  }))),
];

// The mushrooms, a decoration now: nothing bounces off them, the players walk through them as through the trees.
// Four around the center of the middle platform, where the pads land, and one on the outer side of each platform of the ring.
export const BUMPERS = [
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: sx * 2.8, z: sz * 2.8 })),
  ...AXES.map(([ux, uz]) => ({ x: ux * (GROUND_RING + 5), z: uz * (GROUND_RING + 5) })),
].map((m) => ({ ...m, y: 0, r: 1.1, h: 2.2 }));

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
for (const w of [...WALLS, ...BUMPERS]) w.on = platformUnder(w);

export const chest = (b) => ({ x: b.pos.x, y: b.pos.y + CHEST, z: b.pos.z });

export function newBody(platform) {
  return { pos: { x: platform.x, y: platform.y, z: platform.z }, vel: { x: 0, y: 0, z: 0 }, push: { x: 0, z: 0 }, onGround: true };
}

// wish: the wanted direction on the ground, of length 0 to 1. On slippery feet, the speed follows it slowly.
// b.legs: 2 run and jump; 1 hops, slower; 0 crawls, slower still, and jumps no more.
export function stepBody(b, wish, jump, dt) {
  const legs = b.legs ?? LEGS;
  const ferry = b.onGround && platformUnder(b.pos);
  if (ferry?.dx) {
    b.pos.x += ferry.dx;
    b.pos.z += ferry.dz;
  }
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
    // A pad's flight ends where it lands: slippery feet would carry its speed on, across the platform into the lava.
    if (b.flight) b.vel.x = b.vel.z = 0;
    b.flight = false;
  }
  const pad = b.onGround && PADS.find((p) => p.y === pl.y && !PLATFORMS[p.to].gone && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < PAD_RADIUS);
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
  b.flight = true;
}

export function knock(b, dir) {
  const len = Math.hypot(dir.x, dir.z) || 1;
  b.push.x = (dir.x / len) * PUSH_SPEED;
  b.push.z = (dir.z / len) * PUSH_SPEED;
  b.vel.y = Math.max(b.vel.y, PUSH_LIFT); // a pad's flight keeps climbing: the push alone throws it off course
  b.onGround = false;
}

// The decapitator takes the three discs and bounces once; a plain disc takes one and bounces three times.
// dir: where it was aimed, a unit vector, up or down too. size: how many times wider than a plain disc.
export function newDisc(owner, from, dir, decap, size = 1) {
  const d = {
    owner,
    decap,
    size,
    speed: DISC_SPEED,
    cost: decap ? MAX_DISCS : 1,
    bounces: decap ? 1 : 3,
    rebounds: 0, // so far: a hit after some is a trickshot
    age: 0,
    returning: false,
    pos: { x: from.x + dir.x * 0.8, y: from.y + CHEST, z: from.z + dir.z * 0.8 },
    prev: null,
  };
  d.vel = { x: dir.x * d.speed, y: (dir.y ?? 0) * d.speed, z: dir.z * d.speed };
  return d;
}

// home: where a returning disc flies to, its owner's chest.
export function stepDisc(d, home, dt) {
  d.age += dt;
  if (d.age > DISC_LIFE) d.returning = true;
  if (d.returning) {
    const dx = home.x - d.pos.x, dy = home.y - d.pos.y, dz = home.z - d.pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    d.vel = { x: (dx / len) * d.speed, y: (dy / len) * d.speed, z: (dz / len) * d.speed };
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
  if (!d.returning) bounceOffRoofs(d);
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
// A tunnel's roof: a disc going through it, down from above or up from inside, bounces back.
function bounceOffRoofs(d) {
  if (d.prev.y < WALL_HEIGHT === d.pos.y < WALL_HEIGHT || !tunnelAt({ x: d.pos.x, y: 0, z: d.pos.z })) return;
  d.vel.y = -d.vel.y;
  d.pos.y = d.prev.y;
  d.rebounds++;
  if (--d.bounces < 0) d.returning = true;
}

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

// Whether two discs met during the frame: their moves, seen from one of them, pass within PARRY_RADIUS.
export const PARRY_RADIUS = 1;
export function discsMeet(a, b) {
  const rel = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
  return segmentHits(rel(a.prev, b.prev), rel(a.pos, b.pos), { x: 0, y: 0, z: 0 }, PARRY_RADIUS);
}

// Where a disc's move in one frame hits a player: null, "legs", "body", or "neck" (the long neck and the head).
// size: the disc's, a giant one hits further from its line. scale: the body's, a fat one is hit higher and wider.
export function hitZone(a, b, body, size = 1, scale = 1) {
  // The height where the disc's line crosses the player's axis: what it cuts, flying down or up as flat.
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = len2 ? ((body.pos.x - a.x) * dx + (body.pos.z - a.z) * dz) / len2 : 0.5;
  const y = (a.y + (b.y - a.y) * t - body.pos.y) / scale + (body.legs === 0 ? LEGS_TOP : 0);
  if (y < 0 || y > HEAD_TOP + (body.neck ?? 0)) return null;
  const flat = (p) => ({ x: p.x, y: 0, z: p.z });
  const neck = y >= NECK_BOTTOM;
  if (!segmentHits(flat(a), flat(b), flat(body.pos), (neck ? NECK_RADIUS : HIT_RADIUS) * scale + DISC_RADIUS * (size - 1))) return null;
  // The legs not scaled: a fat player's huge legs would take every flat disc, and never be pushed.
  return neck ? "neck" : y * scale < LEGS_TOP ? "legs" : "body";
}
