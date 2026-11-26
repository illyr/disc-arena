import * as THREE from "three";
import {
  ARENA_RADIUS, BOOST_TIME, BUMPERS, CHEST, DISC_LIFE, DISC_RADIUS, DISC_SPEED, FAT, FAT_TIME, GIANT_DISCS, FALL_DEATH_Y, GRAVITY, JUMP_SPEED, LEVEL, MAX_DISCS, PADS, PAD_RADIUS, PLATFORMS,
  WALLS, WALL_HEIGHT, WALL_THICKNESS, TUNNELS, TUNNEL_WIDTH, tunnelAt,
  LEGS, LEGS_TOP, NECK_GROWTH, RUN_SPEED, chest, discsMeet, hitZone, thickness, knock, moveFerries, newBody, newDisc, platformUnder, resize, steer, stepBody, stepDisc,
} from "./rules.js";
import { hostRoom, joinRoom, newRoomCode } from "./net.js";
import { ASIDES, crySlug, DECAP_LINES, END_LINES, FALL_LINES, NAMES, PSEUDOS, PUSH_LINES, RETORTS, START_LINES, STREAK_SHOUTS, untoned, voiceSlug } from "./pseudos.js";

// Every slot looks like no other: its colour, the pattern on its body, and its oddities
// (eyes: their size; tail: "bushy" or "thin"). Only for show: the hit zones stay those of rules.js.
const LOOKS = [
  { color: 0xe53935, ink: "#fff", pattern: "dots", eyes: 3, antennas: true },
  { color: 0x1e88e5, ink: "#fff", pattern: "stripes", ears: true, tail: "bushy" },
  { color: 0xfdd835, ink: "#000", pattern: "checks", nose: true, eyes: 0.4 },
  { color: 0x43a047, ink: "#ff0", pattern: "zigzag", butt: true, tail: "thin" },
  { color: 0x8e24aa, ink: "#ff0", pattern: "stars", mouth: true, tail: "thin" },
  { color: 0xfb8c00, ink: "#000", pattern: "bands", ears: true, nose: true },
  { color: 0xec407a, ink: "#fff", pattern: "diamonds", butt: true, antennas: true },
  { color: 0x00acc1, ink: "#fff", pattern: "rings", eyes: 0.4, mouth: true, tail: "bushy" },
];
const COLORS = LOOKS.map((l) => l.color);
const POINTS = { decap: 5, fall: 1 }; // a fall nobody pushed scores nothing
const MAX_STREAK_BONUS = 3; // the n-th kill in a row without dying scores n - 1 more, up to this
const REGICIDE_BONUS = 2; // for bringing down the crowned leader
const MAX_TRICK_BONUS = 3; // a kill after n rebounds scores n more, up to this
const WIN_SCORE = 20;
const COUNTDOWN = 4; // s of « 3, 2, 1, Fraggez ! » before the first frag that counts
const INTRO = 4; // s: her longest START_LINES line, measured, before the count; all stand still until « Fraggez ! »
const MATCH_POINT = WIN_SCORE - 2; // from it, the announcer, the crowd and the radar make much of the player
const RAPID_MAX = 8; // discs in the air at once, in a burst
const RESPAWN_DELAY = 2.5; // short: a death must not stop the game
const MAX_NECKS = 4; // victims in a row that each lengthen the neck by NECK_GROWTH
const BLAME_WINDOW = 6; // seconds a push still counts as the kill of whoever threw it
const GEYSER_TIME = 4.5;
const SLOW_MOTION = 0.25;
const MAX_DROPS = 6000;
const MAX_STAINS = 10000; // a few dozen deaths: the blood stays
const EYE = 3.3;
// Over the feet: the longer the neck, the higher; a mastodon's FAT times as high; legless, on its belly.
const eyeHeight = (e) => (EYE - (e.legs ? 0 : LEGS_TOP) + (e.necks ?? 0) * NECK_GROWTH) * (has(e, "fat") ? FAT : 1);
const EYE_EASE = 3; // per s: my view rises to a grown neck or a mastodon's head, and back, smoothly
const SCALE = 1.3; // the avatars are modelled 1.3 times too small; the hit zones in rules.js match the scaled size
// The bots, made beatable: slow to throw, inaccurate, half-hearted at leading a moving target.
const BOT_AIM_ERROR = 0.5;
const BOT_LEAD = 0.5;
const BOT_JUMP_SHOTS = 0.15;
const BOT_DECAPS = 0.06;
const NAME_MAX = 60;
const STILL = { x: 0, z: 0 };
const $ = (id) => document.getElementById(id);
const css = (color) => `#${color.toString(16).padStart(6, "0")}`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060f);
scene.fog = new THREE.Fog(0x07060f, 170, 420);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 600);
camera.rotation.order = "YXZ";
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0x8899ff, 0x803010, 1.2)); // lit from below by the lava
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 20, 8);
scene.add(sun);

const FLOOR_COLORS = [0x00e5ff, 0xffc400, 0xff6d00]; // the rim of each floor's platforms, here and on the radar
// The arena: platforms over the void, their pads, the wall the discs bounce on.
const glow = (color, intensity = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
const platformParts = PLATFORMS.map(() => []); // what vanishes with each platform: itself, its pads, its walls, its village
// Draws on a canvas that repeats: each shape also on the far side of the edges it crosses.
function canvasTexture(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  draw(g, (shape) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) shape(dx, dy);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
// A blob of n corners around x, y, of about radius r: low poly, like the rest.
function blob(g, x, y, r, n = 7) {
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI, d = r * (0.6 + Math.random() * 0.5);
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.fill();
}
// The top of the platforms: a village square, paving stones askew, patches of earth and grass.
const paving = canvasTexture(512, (g, wrap) => {
  g.fillStyle = "#cfc5b4";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, w = 20 + Math.random() * 16, h = 12 + Math.random() * 8, turn = (Math.random() - 0.5) * 0.4;
    g.fillStyle = `hsl(${30 + Math.random() * 15}, ${10 + Math.random() * 15}%, ${62 + Math.random() * 20}%)`;
    wrap((dx, dy) => {
      g.save();
      g.translate(x + dx, y + dy);
      g.rotate(turn);
      g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    });
  }
  for (const [color, n, r] of [["#7a5230", 4, 80], ["#6b8f3a", 5, 60], ["#4f7a2c", 8, 26], ["#5a4632", 30, 5]]) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      wrap((dx, dy) => blob(g, x + dx, y + dy, r));
    }
  }
});
const cliff = new THREE.MeshStandardMaterial({ color: 0x6b4a32, flatShading: true });
// The village on each platform: lamp posts around the rim, bushes, rocks, benches and pines scattered, never on a pad
// nor against a wall. Only for show: nothing stops a player or a disc, nor the aim.
let seed = 7; // the same village on every machine
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const flat = (color, more) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...more });
const PURPLE = flat(0x6a3fa0), LEAF = flat(0x4f8a3a), PINE = flat(0x2f6b3a), STONE = flat(0x9a948a), WOOD = flat(0x7a5230);
const LAMP = flat(0xfff0c0, { emissive: 0xffd88a, emissiveIntensity: 2 });
const PROPS = {
  lamp: [[new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), PURPLE, 1.6], [new THREE.SphereGeometry(0.28, 6, 5).scale(1, 1.4, 1), LAMP, 3.45]],
  bush: [[new THREE.IcosahedronGeometry(0.7, 0), LEAF, 0.45]],
  rock: [[new THREE.DodecahedronGeometry(0.5, 0), STONE, 0.25]],
  bench: [[new THREE.BoxGeometry(1.6, 0.1, 0.5), PURPLE, 0.5], [new THREE.BoxGeometry(1.6, 0.4, 0.08), PURPLE, 0.75, 0.22],
    [new THREE.BoxGeometry(0.08, 0.5, 0.45), PURPLE, 0.25, 0, -0.7], [new THREE.BoxGeometry(0.08, 0.5, 0.45), PURPLE, 0.25, 0, 0.7]],
  pine: [[new THREE.CylinderGeometry(0.12, 0.16, 1, 5), WOOD, 0.5], [new THREE.ConeGeometry(1, 2.2, 6), PINE, 2], [new THREE.ConeGeometry(0.7, 1.6, 6), PINE, 3]],
};
const SCATTERED = ["bush", "bush", "rock", "rock", "rock", "bench", "pine"];
// A prop at x, z of the platform pl, turned by turn, sized by size: each piece is [geometry, material, height, z, x].
function prop(kind, x, z, turn, size, into) {
  const thing = new THREE.Group();
  for (const [geometry, material, y, dz = 0, dx = 0] of PROPS[kind]) {
    const piece = new THREE.Mesh(geometry, material);
    piece.position.set(dx, y, dz);
    piece.raycast = () => {};
    thing.add(piece);
  }
  thing.position.set(x, 0, z);
  thing.rotation.y = turn;
  thing.scale.setScalar(size);
  into.add(thing);
}
function decorate(pl) {
  const village = new THREE.Group();
  village.position.set(pl.x, pl.y, pl.z);
  const free = (x, z) => PADS.every((p) => Math.hypot(p.x - pl.x - x, p.z - pl.z - z) > 2.5)
    && WALLS.every((w) => Math.hypot(w.x - pl.x - x, w.z - pl.z - z) > w.half + 1.5)
    && BUMPERS.every((m) => Math.hypot(m.x - pl.x - x, m.z - pl.z - z) > m.r + 1.5);
  const lamps = Math.round((2 * Math.PI * pl.r) / 12);
  for (let k = 0; k < lamps; k++) {
    const a = (k / lamps) * 2 * Math.PI, x = Math.cos(a) * (pl.r - 1), z = Math.sin(a) * (pl.r - 1);
    if (free(x, z)) prop("lamp", x, z, 0, 1, village);
  }
  for (let k = 0; k < pl.r * 1.5; k++) {
    const a = rand() * 2 * Math.PI, d = 3 + rand() * (pl.r - 4), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const kind = SCATTERED[Math.floor(rand() * SCATTERED.length)];
    if (free(x, z)) prop(kind, x, z, rand() * 2 * Math.PI, 0.7 + rand() * 0.6, village);
  }
  return village;
}
for (const pl of PLATFORMS) {
  const thick = thickness(pl);
  const top = paving.clone();
  top.repeat.setScalar(pl.r / 6); // a tile every 12 m, whatever the platform
  const pavement = new THREE.MeshStandardMaterial({ map: top });
  const block = new THREE.Mesh(new THREE.CylinderGeometry(pl.r, pl.r * 0.6, thick, 48), [cliff, pavement, cliff]);
  block.position.set(pl.x, pl.y - thick / 2, pl.z);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(pl.r, 0.06, 8, 64), glow(FLOOR_COLORS[Math.round(pl.y / LEVEL)]));
  edge.rotation.x = Math.PI / 2;
  edge.position.set(pl.x, pl.y + 0.01, pl.z);
  const village = decorate(pl);
  scene.add(block, edge, village);
  platformParts[PLATFORMS.indexOf(pl)].push(block, edge, village);
}
// A ferry's parts, where they stand from its center: they go where it goes (showArena).
for (const pl of PLATFORMS.filter((p) => p.ferry)) for (const m of platformParts[PLATFORMS.indexOf(pl)]) m.userData.off = { x: m.position.x - pl.x, z: m.position.z - pl.z };
// The mushrooms: a pale stem, a red cap with white dots, a little glowing to be seen from afar.
const capTexture = canvasTexture(256, (g, wrap) => {
  g.fillStyle = "#e53935";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff";
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 256, y = Math.random() * 200;
    wrap((dx, dy) => blob(g, x + dx, y + dy, 14 + Math.random() * 10, 9));
  }
});
const stemGeo = new THREE.CylinderGeometry(0.45, 0.6, 1.7, 10), capGeo = new THREE.SphereGeometry(1.35, 20, 10, 0, 2 * Math.PI, 0, Math.PI / 2);
const stemMat = flat(0xf3e9d2), capMat = new THREE.MeshStandardMaterial({ map: capTexture, emissive: 0x801010, emissiveIntensity: 0.4 });
for (const m of BUMPERS) {
  const mushroom = new THREE.Group();
  const stem = new THREE.Mesh(stemGeo, stemMat), cap = new THREE.Mesh(capGeo, capMat);
  stem.position.y = 0.85;
  cap.position.y = 1.5;
  cap.scale.y = 0.6;
  mushroom.add(stem, cap);
  mushroom.position.set(m.x, m.y, m.z);
  scene.add(mushroom);
  platformParts[PLATFORMS.indexOf(m.on)].push(mushroom);
}
const pads = PADS.map((p) => {
  // In the colour of the floor it throws to: on a tower, two pads close by still read apart.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.08, 32), glow(FLOOR_COLORS[Math.round(PLATFORMS[p.to].y / LEVEL)]));
  pad.position.set(p.x, p.y + 0.04, p.z);
  scene.add(pad);
  platformParts[PLATFORMS.indexOf(platformUnder(p))].push(pad);
  return pad;
});
// The covers: house fronts, only their fronts, each its colour, with a glowing top to see it from afar.
const FRONT_COLORS = ["#e8954a", "#5fb3a8", "#e8c46a", "#c47ab0", "#8fb3e0"];
function frontTexture(color, width) {
  const texture = canvasTexture(512, (g) => {
    const m = 512 / width, k = 512 / WALL_HEIGHT; // pixels a metre, across and up: the canvas stretches onto the wall
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#ffffff55"; // the plaster, chipped
    for (let i = 0; i < 10; i++) blob(g, Math.random() * 512, Math.random() * 512, 8 + Math.random() * 14, 5);
    g.fillStyle = "#9aa0a8"; // the stone base
    g.fillRect(0, 512 - 0.4 * k, 512, 0.4 * k);
    g.fillStyle = "#8a4b2a"; // the edge of the tiled roof
    g.fillRect(0, 0, 512, 0.5 * k);
    g.fillStyle = "#6b3a20";
    for (let x = 0; x < 512; x += 0.4 * m) g.fillRect(x, 0.3 * k, 0.3 * m, 0.2 * k);
    // An arched opening: a wooden frame, then the glass or the door inside.
    const arch = (x, bottom, w, h, inside) => {
      for (const [fill, pad] of [["#6b3a20", 0], [inside, 0.12]]) {
        g.fillStyle = fill;
        g.beginPath();
        g.ellipse(x * m, (bottom - h + w / 2) * k, (w / 2 - pad) * m, (w / 2 - pad) * k, 0, Math.PI, 0);
        g.lineTo((x + w / 2 - pad) * m, (bottom - pad / 2) * k);
        g.lineTo((x - w / 2 + pad) * m, (bottom - pad / 2) * k);
        g.fill();
      }
    };
    arch(width / 2, WALL_HEIGHT - 0.4, 1.1, 2.2, "#2f7f7a"); // the door
    for (const side of [-1, 1]) arch(width / 2 + side * width * 0.3, 2.4, 0.9, 1.5, "#1e4d5a");
  });
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
for (const w of WALLS) {
  const cover = new THREE.Group();
  const color = FRONT_COLORS[WALLS.indexOf(w) % FRONT_COLORS.length];
  const front = new THREE.MeshStandardMaterial({ map: frontTexture(color, w.half * 2) }), plaster = new THREE.MeshStandardMaterial({ color });
  const block = new THREE.Mesh(new THREE.BoxGeometry(w.half * 2, WALL_HEIGHT, WALL_THICKNESS), [plaster, plaster, plaster, plaster, front, front]);
  block.position.y = WALL_HEIGHT / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w.half * 2, 0.06, WALL_THICKNESS + 0.04), glow(0xff4081));
  top.position.y = WALL_HEIGHT;
  cover.add(block, top);
  cover.position.set(w.x, w.y, w.z);
  cover.rotation.y = Math.atan2(-w.az, w.ax);
  scene.add(cover);
  platformParts[PLATFORMS.indexOf(w.on)].push(cover);
}
// The tunnels' roofs, on the walls of each side: see-through while I am under one, the camera behind me above it.
const roofs = TUNNELS.map((t) => {
  const roof = new THREE.Mesh(new THREE.BoxGeometry(t.half * 2, 0.3, TUNNEL_WIDTH + WALL_THICKNESS), new THREE.MeshStandardMaterial({ color: 0x8a4b2a, transparent: true }));
  roof.position.set(t.x, t.y + WALL_HEIGHT + 0.15, t.z);
  roof.rotation.y = Math.atan2(-t.az, t.ax);
  scene.add(roof);
  return roof;
});
const wall = new THREE.Mesh(
  new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 12, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
);
wall.position.y = CHEST + 2;
// A line at the height of the discs of each floor.
for (let floor = 0; floor < 3; floor++) {
  const wallLine = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS, 0.05, 6, 128), glow(0x7c4dff));
  wallLine.rotation.x = Math.PI / 2;
  wallLine.position.y = CHEST + floor * LEVEL;
  scene.add(wallLine);
}
// The void: a sea of lava far below, flowing slowly (showArena); whoever falls in is gone.
const lava = canvasTexture(256, (g, wrap) => {
  g.fillStyle = "#9c1a00";
  g.fillRect(0, 0, 256, 256);
  for (const [color, n, r] of [["#e84a00", 14, 34], ["#ff8a00", 18, 14], ["#ffd23a", 24, 4]]) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      wrap((dx, dy) => blob(g, x + dx, y + dy, r));
    }
  }
});
lava.repeat.setScalar(80);
const abyss = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: lava }));
abyss.rotation.x = -Math.PI / 2;
abyss.position.y = FALL_DEATH_Y;
// Every LAVA_EVERY s, the lava rises over the ground floor for LAVA_HIGH s, after LAVA_WARN s of warning: all up!
// The host's lavaY, sent to its guests: below it, death.
const LAVA_EVERY = 120;
const LAVA_WARN = 15;
const LAVA_RISE = 15; // s to rise, and to go down: fast from the depths, slow over the edges
const LAVA_HIGH = 15;
const LAVA_TOP = 0.4; // over the feet on the ground floor
let lavaY = FALL_DEATH_Y;
let lavaAt = LAVA_EVERY; // the next warning: from it until the lava is down, nobody spawns on the ground floor
let lavaTold = false;
let shaky = null; // the platform blinking, then gone; up here for spawn(), at load
let lavaIn = null; // s before the lava covers the ground floor, from the warning on; null otherwise
const ease = (k) => 1 - (1 - k) ** 3;
const LAVA_COVERS = LAVA_WARN + LAVA_RISE * (1 - Math.cbrt(LAVA_TOP / (LAVA_TOP - FALL_DEATH_Y))); // when ease(up) lifts it over 0
// Now and then a shower: every floor slippery, like the Patinoire. The host's raining, sent to its guests.
const RAIN_EVERY = 90;
const RAIN_TIME = 20;
let raining = false;
let rainAt = 60;
const RAIN_DROPS = 1500;
const RAIN_BOX = 30; // m around me where it rains: the drops follow the camera
const rainPos = new Float32Array(RAIN_DROPS * 6);
for (let i = 0; i < RAIN_DROPS; i++) {
  const x = (Math.random() - 0.5) * 2 * RAIN_BOX, y = Math.random() * 2 * RAIN_BOX, z = (Math.random() - 0.5) * 2 * RAIN_BOX;
  rainPos.set([x, y, z, x, y + 0.8, z], i * 6);
}
const rain = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(rainPos, 3)),
  new THREE.LineBasicMaterial({ color: 0x9ec9ff, transparent: true, opacity: 0.45 }));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
function showRain(dt) {
  rain.visible = raining;
  if (!raining) return;
  rain.position.set(camera.position.x, camera.position.y - RAIN_BOX, camera.position.z);
  for (let i = 0; i < RAIN_DROPS; i++) {
    let y = rainPos[i * 6 + 1] - 30 * dt;
    if (y < 0) y += 2 * RAIN_BOX;
    rainPos[i * 6 + 1] = y;
    rainPos[i * 6 + 4] = y + 0.8;
  }
  rain.geometry.attributes.position.needsUpdate = true;
}
// The stars, spread evenly over the sky, out of the fog.
const stars = [];
for (let i = 0; i < 2500; i++) {
  const a = Math.random() * 2 * Math.PI, up = Math.asin(Math.random());
  stars.push(Math.cos(a) * Math.cos(up) * 450, Math.sin(up) * 450, Math.sin(a) * Math.cos(up) * 450);
}
const sky = new THREE.Points(
  new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(stars, 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }),
);
scene.add(wall, abyss, sky);

// The stands around the arena, and their crowd: seated still, it jumps up at each death.
const STAND_ROWS = 8;
const STAND_RADIUS = ARENA_RADIUS + 3;
const STAND_DEPTH = 1.6;
const STAND_RISE = 1.6;
const standMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, side: THREE.DoubleSide });
const fans = [];
for (let row = 0; row < STAND_ROWS; row++) {
  const r = STAND_RADIUS + row * STAND_DEPTH, y = -1 + row * STAND_RISE;
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(r, r, STAND_RISE, 96, 1, true), standMaterial);
  riser.position.y = y - STAND_RISE / 2;
  const tread = new THREE.Mesh(new THREE.RingGeometry(r, r + STAND_DEPTH, 96), standMaterial);
  tread.rotation.x = -Math.PI / 2;
  tread.position.y = y;
  scene.add(riser, tread);
  const seats = Math.floor((2 * Math.PI * r) / 0.9);
  for (let i = 0; i < seats; i++) {
    if (Math.random() < 0.25) continue; // empty seats
    const a = ((i + Math.random() * 0.3) / seats) * 2 * Math.PI;
    fans.push({ x: Math.cos(a) * (r + 0.8), y, z: Math.sin(a) * (r + 0.8), phase: Math.random() * 10 });
  }
}
const fanBodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.5, 2, 6), new THREE.MeshStandardMaterial(), fans.length);
const fanHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 6, 4), new THREE.MeshStandardMaterial({ color: 0xf1c27d }), fans.length);
const shirt = new THREE.Color();
fans.forEach((f, i) => fanBodies.setColorAt(i, shirt.setHSL(Math.random(), 0.8, 0.55)));
scene.add(fanBodies, fanHeads);
let cheerUntil = 0;
const fanSpot = new THREE.Matrix4();
let fansSeated = false; // seated, the thousands of fans cost nothing more until the next cheer
function updateFans() {
  const cheering = now < cheerUntil;
  if (fansSeated && !cheering) return;
  fansSeated = !cheering;
  fans.forEach((f, i) => {
    const hop = cheering ? Math.abs(Math.sin(now * 9 + f.phase)) * 0.6 : 0;
    fanBodies.setMatrixAt(i, fanSpot.makeTranslation(f.x, f.y + 0.55 + hop, f.z));
    fanHeads.setMatrixAt(i, fanSpot.makeTranslation(f.x, f.y + 1.3 + hop, f.z));
  });
  fanBodies.instanceMatrix.needsUpdate = fanHeads.instanceMatrix.needsUpdate = true;
}

// The players: a body, a long neck that makes a target, and a head that comes off.
const NECK_BASE = 1.45;
const NECK_TOP = 2.4;
const HEAD_Y = 2.6;
const skin = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
const lips = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
const gold = new THREE.MeshStandardMaterial({
  color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide,
});
const ball = (r) => new THREE.SphereGeometry(r, 16, 12);
const LEG = new THREE.CylinderGeometry(0.09, 0.07, 1, 10);
const LEG_Y = 0.5;
const BODY_Z = 0.15; // the body runs back from under the neck
// The four legs, x and z, in the order the discs cut them: three left, then a diagonal pair, then the front left alone.
const LEG_SPOTS = [[-0.17, BODY_Z], [0.17, BODY_Z]]; // two, under the middle of the body, like an ostrich

// The body's fabric: the slot's colour, with its pattern drawn over in ink.
function patternTexture({ color, ink, pattern }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = css(color);
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = g.strokeStyle = ink;
  g.lineWidth = 12;
  const grid = (draw) => {
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) draw(x, y);
  };
  // A star of n branches; with n = 2 and both radii equal, a diamond.
  const star = (x, y, n, outer, inner) => {
    g.beginPath();
    for (let k = 0; k < 2 * n; k++) {
      const r = k % 2 ? inner : outer, a = (k * Math.PI) / n;
      g.lineTo(x + r * Math.sin(a), y - r * Math.cos(a));
    }
    g.fill();
  };
  const draw = {
    dots: () => grid((x, y) => {
      g.beginPath();
      g.arc(x + 32, y + 32, 16, 0, 2 * Math.PI);
      g.fill();
    }),
    stripes: () => grid((x, y) => g.fillRect(x, y, 64, 24)),
    bands: () => grid((x, y) => g.fillRect(x, y, 22, 64)),
    checks: () => grid((x, y) => (x + y) % 128 && g.fillRect(x, y, 64, 64)),
    zigzag: () => grid((x, y) => {
      g.beginPath();
      g.moveTo(x, y + 16);
      g.lineTo(x + 32, y + 48);
      g.lineTo(x + 64, y + 16);
      g.stroke();
    }),
    stars: () => grid((x, y) => star(x + 32, y + 32, 5, 26, 11)),
    diamonds: () => grid((x, y) => star(x + 32, y + 32, 2, 24, 24)),
    rings: () => grid((x, y) => {
      for (const r of [24, 10]) {
        g.beginPath();
        g.arc(x + 32, y + 32, r, 0, 2 * Math.PI);
        g.stroke();
      }
    }),
  };
  draw[pattern]();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

// The face looks to -z. What is on the head flies off with it.
function makeAvatar(look) {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  group.scale.setScalar(SCALE);
  const fabric = new THREE.MeshStandardMaterial({ map: patternTexture(look) });
  const plain = new THREE.MeshStandardMaterial({ color: look.color });
  const part = (geo, mat, parent, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  part(new THREE.CapsuleGeometry(0.32, 0.45, 4, 12), fabric, group, 0, 1.3, BODY_Z).rotation.x = Math.PI / 2; // a giraffe's
  const neck = part(new THREE.CylinderGeometry(0.07, 0.09, NECK_TOP - NECK_BASE, 10), skin, group, 0, (NECK_BASE + NECK_TOP) / 2, 0);
  const head = part(ball(0.25), skin, group, 0, HEAD_Y, 0);
  // Bare legs, cut off by the low discs, in the order of LEG_SPOTS.
  const limbs = LEG_SPOTS.map(([x, z]) => part(LEG, skin, group, x, LEG_Y, z));
  // Worn by the leader only, oversized to be seen across the arena; it flies off with the head.
  const crown = new THREE.Group();
  crown.position.y = 0.32;
  crown.scale.setScalar(1.5);
  crown.visible = false;
  head.add(crown);
  part(new THREE.CylinderGeometry(0.24, 0.22, 0.14, 16, 1, true), gold, crown, 0, 0, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    part(new THREE.ConeGeometry(0.06, 0.16, 6), gold, crown, Math.sin(a) * 0.22, 0.15, Math.cos(a) * 0.22);
  }
  const eye = 0.05 * (look.eyes ?? 1);
  for (const side of [-1, 1]) {
    const x = side * Math.max(0.09, eye);
    part(ball(eye), white, head, x, 0.06, -0.2);
    part(ball(eye / 2), dark, head, x, 0.06, -0.2 - eye * 0.8);
    if (look.antennas) {
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), dark, head, side * 0.2, 0.54, 0).rotation.z = -side * 0.4;
      part(ball(0.09), plain, head, side * 0.33, 0.86, 0);
    }
    if (look.ears) part(ball(0.25), plain, head, side * 0.34, 0.08, 0).scale.set(0.25, 1.7, 1.4);
    if (look.butt) part(ball(0.3), fabric, group, side * 0.17, 1.3, BODY_Z + 0.5);
  }
  if (look.nose) part(new THREE.ConeGeometry(0.11, 0.9, 12), skin, head, 0, -0.02, -0.65).rotation.x = -Math.PI / 2;
  if (look.mouth) {
    part(ball(0.14), lips, head, 0, -0.1, -0.18).scale.set(2, 0.9, 0.7);
    part(new THREE.BoxGeometry(0.3, 0.05, 0.03), white, head, 0, -0.05, -0.27);
  }
  if (look.tail === "bushy") {
    const tail = part(ball(0.3), fabric, group, 0, 1.45, BODY_Z + 0.85);
    tail.scale.set(1, 1, 2.6);
    tail.rotation.x = -0.6;
  }
  if (look.tail === "thin") {
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), plain, group, 0, 1.47, BODY_Z + 0.95).rotation.x = 1.05;
    part(ball(0.12), plain, group, 0, 1.85, BODY_Z + 1.6);
  }
  // The shield: a bubble around the player while it lasts.
  const bubble = part(ball(1.5), new THREE.MeshBasicMaterial({ color: 0x82b1ff, transparent: true, opacity: 0.25, depthWrite: false }), group, 0, 1.6, 0);
  bubble.visible = false;
  scene.add(group);
  return { group, head, neck, crown, bubble, limbs };
}

const params = new URLSearchParams(location.search);
const joining = params.get("room"); // a code: join that room; none: host one
// No bots unless asked (?bots=3): the free slots wait for players. A guest knows the slots from the host.
const BOTS = joining ? 0 : Math.min(Number(params.get("bots")) || 0, NAMES.length - 1);
// What the summary counts in a match, besides the frags and the heads: victims, legs cut, deaths, falls alone, best streak.
const NO_STATS = { kills: 0, cuts: 0, deaths: 0, falls: 0, best: 0, spent: 0 };
const entities = NAMES.map((name, i) => ({
  name, alias: name, color: COLORS[i], bot: i > 0 && i <= BOTS, empty: !!joining || i > BOTS,
  score: 0, streak: 0, heads: 0, wins: 0, ...NO_STATS, legs: LEGS, life: -1, knocks: 0, knockDir: { x: 0, z: 0 }, until: {}, ...makeAvatar(LOOKS[i]),
}));
entities.forEach((e) => (e.group.visible = !e.empty));

// A picture of each player for the lobby, taken once: the looks never change.
function takePortraits() {
  const studio = new THREE.Scene();
  studio.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
  const light = new THREE.DirectionalLight(0xffffff, 1.5);
  light.position.set(3, 6, -6);
  studio.add(light);
  const lens = new THREE.PerspectiveCamera(32, 96 / 120, 0.1, 50);
  lens.position.set(2.6, 3, -6.4);
  lens.lookAt(0, 2.3, 0);
  const film = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  film.setPixelRatio(2);
  film.setSize(96, 120);
  for (const e of entities) {
    const model = e.group.clone();
    model.visible = true;
    studio.add(model);
    film.render(studio, lens);
    e.portrait = film.domElement.toDataURL();
    studio.remove(model);
  }
  film.dispose();
  film.forceContextLoss();
}
takePortraits();
let me = entities[0]; // a guest learns its slot from the host's first state
const pickPseudo = () => {
  const free = PSEUDOS.filter((p) => !entities.some((o) => !o.empty && o.name === p.name));
  return free[Math.floor(Math.random() * free.length)];
};
const cleanName = (name) => (typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "");
if (!joining) Object.assign(me, pickPseudo());
let inMatch = false; // false: the lobby, where the players warm up and score nothing until the host launches
let winner = null; // the host's winner of the match, until the lobby
const MAMMOTH_ODDS = 0.25; // of a Mastodon match: everyone fat to the end
let mammoth = false;
let firstBlood = false; // who spilled it in this match
let champion = null; // the winner shown, until the lobby
let report = null; // the host's summary of the match over, sent to the guests
let fightAt = 0; // the host's end of the countdown: no kill counts before
let heldUntil = 0; // mine: the end of her intro and of the count, no one moves nor throws before
const held = () => now < heldUntil;
let lastTop = null; // the leader last shown, to tell me when I take the lead or lose it
const discs = [];
const drops = [];
const flyingParts = []; // heads and legs cut off, until their owner is back
let now = 0;
let slowUntil = 0; // performance.now() until which a decapitation plays in slow motion
let replay = null; // the killcam playing: { killer, from: when the death was, lead }
let eyeShown = null; // my view's height over my feet, on its way to eyeHeight(me); null: there at once, as on a spawn

// The host puts a player back on a free platform; its guests follow from the states it sends.
function spawn(e) {
  const taken = (pl) => entities.some((o) => o !== e && o.alive && platformUnder(o.body.pos) === pl);
  const low = PLATFORMS.filter((pl) => pl.y < 2 * LEVEL && (pl.y || now < lavaAt) && pl !== shaky && !pl.ferry); // not on a tower, where the booster waits, nor in the lava, nor falling, nor moving off
  const free = low.filter((pl) => !taken(pl));
  const pl = (free.length ? free : low)[Math.floor(Math.random() * (free.length || low.length))];
  Object.assign(e, {
    body: newBody(pl), alive: true, life: e.life + 1, legs: LEGS, necks: 0, discs: MAX_DISCS, yaw: Math.atan2(pl.x, pl.z), pitch: 0,
    lastHitBy: null, lastHitAt: 0, until: mammoth ? { fat: now + 3600 } : {}, lastTricks: 0, ai: { throwAt: now + 1 + Math.random(), shotAt: 0, turnAt: 0, strafe: 0 },
  });
  resetAvatar(e);
}

// Puts a player back together after a death: the head on the neck, standing, the geyser off.
function resetAvatar(e) {
  e.geyserUntil = 0;
  e.toppleAt = Infinity;
  e.group.rotation.set(0, e.yaw, 0);
  e.group.add(e.head);
  e.head.position.set(0, HEAD_Y, 0);
  e.head.rotation.set(0, 0, 0);
  e.head.scale.setScalar(1); // scene.attach gave it the scale of the group
  e.limbs.forEach((m, k) => {
    e.group.add(m);
    m.position.set(LEG_SPOTS[k][0], LEG_Y, LEG_SPOTS[k][1]);
    m.rotation.set(0, 0, 0);
    m.scale.setScalar(1);
    m.visible = k < e.legs;
  });
  e.lastStep = null;
  e.group.visible = e !== me;
  if (e === me) replay = null;
  if (e === me) eyeShown = null;
  for (let i = flyingParts.length; i--;) if (flyingParts[i].owner === e) flyingParts.splice(i, 1);
  if (e === me) banner(winBanner());
  renderScores();
}
if (!joining) entities.filter((e) => !e.empty).forEach(spawn);

// A slot a player left: nobody there, nothing of it left in the arena.
function vacate(e) {
  Object.assign(e, { empty: true, bot: false, conn: null, alive: false });
  discs.filter((d) => d.owner === e).forEach(removeDisc);
  resetAvatar(e);
  e.group.visible = false;
}

// Discs.
const discGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.05, 24);
const bladeGeo = new THREE.TorusGeometry(0.4, 0.07, 6, 24).rotateX(Math.PI / 2);
const forward = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
// Where a player aims, up and down too: the disc flies there. Thrown from the chest, well under the eye,
// it flies to what the eye sees under the crosshair: a player, a platform, a cover, the arena wall. A bot throws straight.
const MAX_AIM_PITCH = 0.6;
const raycaster = new THREE.Raycaster();
raycaster.far = 2 * ARENA_RADIUS;
function aim(e) {
  const f = forward(e.yaw), look = e === me ? viewPitch() : e.pitch ?? 0;
  const dir = new THREE.Vector3(f.x * Math.cos(look), Math.sin(look), f.z * Math.cos(look));
  if (!e.bot) {
    const b = e.body.pos, eye = new THREE.Vector3(b.x, b.y + eyeHeight(e), b.z);
    raycaster.set(eye, dir);
    const others = entities.filter((o) => o !== e && o.alive && !o.empty);
    const hit = raycaster.intersectObjects([...platformParts.filter((_, i) => !PLATFORMS[i].gone).flat(), wall, ...others.map((o) => o.group)])
      .find((h) => h.object.visible);
    // On a player, the point of the ray above its feet: the disc, flying down or up, enters the hit zone at that height.
    let target = hit?.object;
    while (target && !others.some((o) => o.group === target)) target = target.parent;
    target = others.find((o) => o.group === target);
    const far = target ? Math.hypot(target.body.pos.x - eye.x, target.body.pos.z - eye.z) / Math.hypot(dir.x, dir.z) : hit?.distance;
    const to = eye.addScaledVector(dir, far ?? raycaster.far);
    if (target) to.y = Math.max(to.y, target.body.pos.y + DISC_RADIUS + 0.05); // at the feet, it would hit the floor first
    // A mastodon looks down so steeply that a near miss sent the disc into the floor: off a player, it throws flat.
    if (has(e, "fat") && !target) to.y = chest(e.body).y;
    const c = chest(e.body); // the disc starts a little ahead of it, see newDisc
    dir.set(to.x - c.x - f.x * 0.8, to.y - c.y, to.z - c.z - f.z * 0.8).normalize();
  }
  const pitch = Math.max(-MAX_AIM_PITCH, Math.min(MAX_AIM_PITCH, Math.asin(dir.y))), flat = Math.hypot(dir.x, dir.z) || 1;
  return { x: (dir.x / flat) * Math.cos(pitch), y: Math.sin(pitch), z: (dir.z / flat) * Math.cos(pitch) };
}

function throwDisc(e, decap) {
  const d = newDisc(e, e.body.pos, aim(e), decap);
  if (has(e, "rapid")) d.cost = 0;
  const flying = discs.filter((o) => o.owner === e).length;
  if (!e.alive || e.discs < d.cost || (!d.cost && flying >= RAPID_MAX)) return;
  e.discs -= d.cost;
  Object.assign(d, { homing: has(e, "homing"), hit: [] }); // hit: who it went through
  d.mesh = new THREE.Mesh(decap ? bladeGeo : discGeo, glow(decap ? 0xff1744 : e.color, 0.8));
  d.mesh.scale.setScalar(d.size);
  scene.add(d.mesh);
  d.id = ++thrown;
  discs.push(d);
  whoosh(e.body.pos, decap);
}
let thrown = 0; // the discs thrown so far: a guest hears a disc when it sees a new number

function removeDisc(d) {
  scene.remove(d.mesh);
  discs.splice(discs.indexOf(d), 1);
}

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function updateDiscs(dt) {
  for (const d of [...discs]) {
    const home = chest(d.owner.body);
    d.prey = d.homing && !d.returning ? entities.filter((o) => o !== d.owner && o.alive && !d.hit.includes(o) && Math.abs(o.body.pos.y + CHEST - d.pos.y) < 1)
      .sort((a, b) => apart(a.body.pos, d.pos) - apart(b.body.pos, d.pos))[0] : null;
    if (d.prey) steer(d, d.prey.body.pos, dt);
    stepDisc(d, home, dt);
    if (d.returning) {
      if (Math.hypot(d.pos.x - home.x, d.pos.y - home.y, d.pos.z - home.z) < 1) {
        d.owner.discs += d.cost;
        removeDisc(d);
        continue;
      }
    } else {
      let zone = null;
      const victim = entities.find((v) => v !== d.owner && v.alive && !d.hit.includes(v) && (zone = hitZone(d.prev, d.pos, v.body, d.size, has(v, "fat") ? FAT : 1)));
      if (victim) {
        d.hit.push(victim);
        d.returning = !d.decap; // the decapitator cuts through, on to the next
        const strike = d.hit.length > 1;
        if (has(d.owner, "potato") && !has(victim, "potato")) { // the hot potato goes to whoever the disc hits
          Object.assign(victim, { potatoFrom: d.owner });
          victim.until.potato = d.owner.until.potato;
          delete d.owner.until.potato;
          tell("{K} refile la patate chaude à {V}", { "{K}": d.owner, "{V}": victim });
        }
        if (has(victim, "shield")) {
          delete victim.until.shield;
          d.returning = true;
        } else if (zone === "neck" || (d.decap && zone === "body")) {
          kill(victim, d.owner, "decap", d.vel, { rebounds: d.rebounds, strike });
        } else if (zone === "legs" && victim.legs) {
          // The Black Knight: no push, no frag, a leg less; who finishes it off scores.
          Object.assign(victim, { lastHitBy: d.owner, lastHitAt: now, lastTricks: d.rebounds });
          if (counting()) d.owner.cuts++;
          loseLeg(victim, victim.legs - 1);
          // Both legs are cried; with more, the ones in between would only get a line.
          const cry = !victim.legs ? "Match nul !" : victim.legs === LEGS - 1 ? "C'est juste une égratignure !" : "";
          const line = !victim.legs ? "[amused] Et {K} coupe la dernière jambe à {V}… ça marche beaucoup moins bien, maintenant."
            : "{K} a coupé une jambe à {V}"; // recorded: « il en reste trois » no longer holds
          tell(line, { "{K}": d.owner, "{V}": victim }, cry, !!cry);
        } else {
          knock(victim.body, d.vel);
          victim.knocks++; // a guest pushes its own player when it sees this count go up
          victim.knockDir = { x: d.vel.x, z: d.vel.z };
          victim.lastHitBy = d.owner;
          victim.lastHitAt = now;
          victim.lastTricks = d.rebounds;
          bleed(chest(victim.body), 15, UP, 2, 4);
          if (strike) tell("[excited] Brochette signée {K} ! Qui a faim ?", { "{K}": d.owner }, "Brochette !", true);
        }
      }
    }
    d.mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
    d.mesh.rotation.y += 25 * dt;
  }
  // Two discs of two players that meet both fly home: a parry, to whoever threw last.
  const flying = discs.filter((d) => !d.returning && d.prev);
  for (const a of flying) for (const b of flying) {
    if (a.id >= b.id || a.owner === b.owner || a.returning || b.returning || !discsMeet(a, b)) continue;
    a.returning = b.returning = true;
    tell("[excited] {K} pare le disque de {V} ! Joli réflexe.", { "{K}": b.owner, "{V}": a.owner }, "Parade !", true);
  }
}

// What a player can catch: how long it lasts, how it shows, the line that tells it.
const POWERS = {
  giant: { time: BOOST_TIME, icon: "★", label: "Big Fat Disc", took: "[whispers] {K} a trouvé l'arme ultime… courez.", shout: "Big Fat Disc !", help: "12 disques géants pendant 60 s : ils balaient tout", over: "Tes disques redeviennent normaux" },
  fat: { time: FAT_TIME, icon: "🐘", label: "Mutateur : Mastodonte", took: "{K} devient un mastodonte", help: "4 fois plus gros pendant 10 s : tout le monde te touche", over: "Tu retrouves ta taille" },
  homing: { time: 15, icon: "🎯", color: 0x18ffff, label: "Disques têtus", took: "{K} a des disques têtus", help: "15 s : tes disques filent vers les autres", over: "Tes disques volent de nouveau droit" },
  rapid: { time: 10, icon: "⚡", color: 0xff9100, label: "Mode berserk", took: "{K} passe en mode berserk", help: "10 s : tire en rafale, sans attendre tes disques", over: "Fini la rafale" },
  shield: { time: 30, icon: "🛡️", color: 0x82b1ff, label: "Ceinture-bouclier", took: "{K} a bouclé sa ceinture", help: "30 s : le prochain disque rebondit sur toi", over: "Plus de bouclier" },
  ice: { time: 10, icon: "🧊", color: 0xe0f7fa, label: "Mutateur : Patinoire", took: "{K} fait du patin", help: "10 s : tu glisses, freine en avance", over: "Tu ne glisses plus" },
  potato: { time: 15, icon: "💣", label: "Patate chaude : touche quelqu'un !", took: "{K} a ramassé la patate chaude", help: "Elle explose dans 15 s : refile-la d'un disque" },
  upside: { time: 8, icon: "🙃", label: "Commandes inversées", help: "8 s : avancer fait reculer, gauche va à droite", over: "Tes commandes reviennent à l'endroit" }, // bought only
};
const ITEM_KINDS = ["homing", "rapid", "shield", "ice", "potato"]; // dropped here and there; the booster and the maluses have their places
// The shop, keys 1 to 5: the frags, as gold discs, spent on the others. One purchase in the whole arena every SHOP_WAIT s.
const SHOP_WAIT = 20;
let shopAt = 0; // when the shop opens again
// on: all the others alive (players: not the bots, who read no keyboard), else the best of them; buy, on the host; show, everywhere.
const SHOP = [
  { icon: "🦵", name: "Croche-patte", price: 5, on: "all", buy: (o) => o.legs && loseLeg(o, o.legs - 1) },
  { icon: "🦒", name: "Grand cou", price: 2, on: "all", buy: (o) => (o.necks = MAX_NECKS) },
  { icon: "💣", name: "Patate", price: 3, buy: (o, e) => Object.assign(o, { potatoFrom: e }).until.potato = now + POWERS.potato.time },
  { icon: "🍅", name: "Tomates", price: 3, show: (o) => [0, 2500].forEach((t) => setTimeout(() => pelt(o), t)) }, // two volleys: 5 s blind
  { icon: "🙃", name: "Commandes inversées", price: 5, on: "all", players: true, buy: (o) => (o.until.upside = now + POWERS.upside.time) },
];
const shopTargets = (e, item) => {
  const others = entities.filter((o) => !o.empty && o.alive && o !== e && !(item.players && o.bot));
  return item.on ? others : others.sort((a, b) => b.score - a.score).slice(0, 1);
};
// Why e cannot buy item now, or "": the calm start, the wait, the price.
function refusal(e, item) {
  if (!inMatch || champion || now < heldUntil + CALM) return `La boutique ouvre ${CALM} s après « Fraggez ! »`;
  if (now < shopAt) return `Boutique fermée encore ${Math.ceil(shopAt - now)} s`;
  if (e.score < item.price) return `Il te faut ${item.price} 📀, tu en as ${e.score}`;
  return shopTargets(e, item).length ? "" : "Personne à viser";
}
function buy(e, i) { // the host's
  const item = SHOP[i];
  if (!item || !e.alive || refusal(e, item)) return;
  const to = shopTargets(e, item);
  Object.assign(e, { score: e.score - item.price, spent: e.spent + item.price });
  shopAt = now + SHOP_WAIT;
  to.forEach((o) => item.buy?.(o, e));
  tell(item.on ? `{K} achète ${item.icon} ${item.name}` : `{K} achète ${item.icon} ${item.name} pour {V}`, { "{K}": e, "{V}": to[0] }, "", false, i);
  renderScores();
}
const has = (e, power) => now < (e.until[power] ?? 0);
const maxDiscs = (e) => (has(e, "giant") ? GIANT_DISCS : MAX_DISCS);
// s before the first of e's discs in flight is back: its life left, then its way home from where it will turn.
// shortcut: a straight flight, the bounces ignored, so a bounce can bring it sooner; exact would need simulating stepDisc.
function discBack(e) {
  const home = chest(e.body);
  return Math.min(Infinity, ...discs.filter((d) => d.owner === e).map((d) => {
    const t = d.returning ? 0 : Math.max(0, DISC_LIFE - d.age);
    return t + Math.hypot(home.x - d.pos.x - d.vel.x * t, home.y - d.pos.y - d.vel.y * t, home.z - d.pos.z - d.vel.z * t) / d.speed;
  }));
}
function give(e, power) {
  if (power === "giant") e.discs = Math.min(e.discs + GIANT_DISCS - MAX_DISCS, GIANT_DISCS);
  if (power === "potato") e.potatoFrom = null; // picked up: it blows up nobody's frag
  e.until[power] = Math.max(e.until[power] ?? 0, now + POWERS[power].time); // a Mastodon match's fat lasts
  const { took, shout = "" } = POWERS[power];
  tell(took, { "{K}": e }, shout, !!shout);
}
// A power on the floor shows as its icon, big and floating: the emoji drawn on a canvas.
const iconMaterials = {};
const iconMaterial = (power) => (iconMaterials[power] ??= new THREE.SpriteMaterial({
  map: canvasTexture(128, (g) => {
    Object.assign(g, { font: "96px serif", textAlign: "center", textBaseline: "middle", shadowColor: "#fff", shadowBlur: 16 });
    g.fillText(POWERS[power].icon, 64, 70);
  }),
}));
const ICON_SIZE = 1.8;

// The booster: on one tower at a time, it gives whoever lands there GIANT_DISCS discs; it comes back
// BOOST_RESPAWN seconds later on another tower. A death loses it (spawn).
const BOOST_RESPAWN = 30;
const TOWERS = PLATFORMS.filter((pl) => pl.y === 2 * LEVEL);
let boostAt = TOWERS[0]; // null while it is away; a guest gets it from the host
let boostBackAt = 0;
const booster = new THREE.Group();
const boostDisc = new THREE.Mesh(discGeo, glow(0xffd700, 2));
boostDisc.scale.setScalar(3);
boostDisc.rotation.x = Math.PI / 2; // on its edge, to be seen from afar
boostDisc.position.y = 1.5;
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.5, 30, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.25, depthWrite: false }),
);
beam.position.y = 15;
booster.add(boostDisc, beam);
scene.add(booster);

// The maluses: two around the middle of each ground-ring platform, MALUS_OFF from it, so a straight walk from where
// the pads land (the middle, kept free) to any way out must dodge one: whoever doesn't grows FAT times bigger.
// Each comes back MALUS_RESPAWN s after.
const MALUS_RESPAWN = 20;
const MALUS_OFF = 3.5;
const MALUS_REACH = 1.6; // wider than the gap a straight walk leaves: 1.4 at most
const maluses = PLATFORMS.slice(1, 5).flatMap((pl) => [0.65, 1.13].map((k) => {
  const a = Math.atan2(pl.z, pl.x) + k * Math.PI; // from the axis out: one between the pad up and the ferry, one between the pad to the center and the other ferry
  const mesh = new THREE.Sprite(iconMaterial("fat"));
  mesh.scale.setScalar(ICON_SIZE);
  scene.add(mesh);
  return { x: pl.x + MALUS_OFF * Math.cos(a), y: 0, z: pl.z + MALUS_OFF * Math.sin(a), pl, backAt: 0, mesh };
}));

// The other bonus and malus: ITEMS_MAX at a time, a new one every ITEM_EVERY s, somewhere on the two lower floors.
const ITEMS_MAX = 2;
const ITEM_EVERY = 10;
const items = []; // the host's: {power, x, y, z, pl}
let itemAt = 5;
let shownItems = []; // [power, x, y, z]: the host's items, or what it says of them
const itemMeshes = [];

// The map shrinks for fewer players, so that they meet: full size from ARENA_FULL players, down to 0.6 (resize).
const ARENA_FULL = 6;
let arenaSize = 1; // the host's, or what it says of it
function setSize(k) {
  if (k === arenaSize) return;
  arenaSize = k;
  const moves = resize(k);
  platformParts.forEach((parts, i) => {
    if (!PLATFORMS[i].ferry) for (const m of parts) m.position.set(m.position.x + moves[i].dx, m.position.y, m.position.z + moves[i].dz);
  });
  for (const o of [...maluses, ...items]) {
    const m = moves[PLATFORMS.indexOf(o.pl)];
    o.x += m.dx;
    o.z += m.dz;
  }
  stainMesh.count = stainCount = 0; // the blood stayed where the platforms were
  pools.clear();
  stainSquares.length = 0;
}

// Now and then a platform of the two lower floors blinks for VANISH_WARN s, then is gone for VANISH_TIME s.
const VANISH_EVERY = 15;
const VANISH_WARN = 3;
const VANISH_TIME = 6;
let shakyAt = 0;
let vanishAt = VANISH_EVERY;

const standing = (spot, reach) => entities.find((e) => !e.empty && e.alive && Math.abs(e.body.pos.y - spot.y) < 0.5 &&
  Math.hypot(e.body.pos.x - spot.x, e.body.pos.z - spot.z) < reach);

// The host runs the arena: the platform that vanishes, the booster, the maluses, the items.
function updateArena() {
  const lavaTime = now - lavaAt, lavaEnd = LAVA_WARN + 2 * LAVA_RISE + LAVA_HIGH;
  if (lavaTime >= 0 && !lavaTold) tell("La lave monte ! Tout le monde aux étages !", {}, "La lave monte !", true);
  lavaTold = lavaTime >= 0;
  const up = lavaTime < 0 ? 0 : Math.max(0, Math.min(1, (lavaTime - LAVA_WARN) / LAVA_RISE, (lavaEnd - lavaTime) / LAVA_RISE));
  lavaY = FALL_DEATH_Y + (LAVA_TOP - FALL_DEATH_Y) * ease(up);
  lavaIn = lavaTime >= 0 && lavaTime < LAVA_COVERS ? LAVA_COVERS - lavaTime : null;
  if (lavaTime > lavaEnd) lavaAt = now + LAVA_EVERY;
  if (now > rainAt) {
    raining = !raining;
    rainAt = now + (raining ? RAIN_TIME : RAIN_EVERY);
    if (raining) tell("Averse ! Ça glisse de partout.", {}, "Averse !", true);
  }
  if (!shaky && now > vanishAt) {
    shaky = PLATFORMS[1 + Math.floor(Math.random() * 8)];
    shakyAt = now;
  }
  if (shaky) shaky.gone = now > shakyAt + VANISH_WARN;
  if (shaky && now > shakyAt + VANISH_WARN + VANISH_TIME) {
    shaky.gone = false;
    shaky = null;
    vanishAt = now + VANISH_EVERY;
  }
  if (!boostAt && now > boostBackAt) boostAt = TOWERS[Math.floor(Math.random() * TOWERS.length)];
  const taker = boostAt && standing(boostAt, 1.5);
  if (taker) {
    give(taker, "giant");
    boostAt = null;
    boostBackAt = now + BOOST_RESPAWN;
  }
  for (const m of maluses) {
    const fat = now >= m.backAt && !m.pl.gone && standing(m, MALUS_REACH);
    if (!fat) continue;
    give(fat, "fat");
    m.backAt = now + MALUS_RESPAWN;
  }
  if (items.length < ITEMS_MAX && now > itemAt) {
    itemAt = now + ITEM_EVERY;
    const pl = PLATFORMS[Math.floor(Math.random() * 9)], a = Math.random() * 2 * Math.PI; // the center, the ground ring, the diagonals
    const power = ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
    items.push({ power, x: pl.x + (Math.cos(a) * pl.r) / 2, y: pl.y, z: pl.z + (Math.sin(a) * pl.r) / 2, pl });
  }
  for (const it of [...items]) {
    const catcher = !it.pl.gone && standing(it, 1);
    if (catcher) give(catcher, it.power);
    if (catcher || it.pl.gone) items.splice(items.indexOf(it), 1);
  }
  shownItems = items.map((it) => [it.power, it.x, it.y, it.z]);
}

function showArena(dt) {
  roofs.forEach((roof, i) => (roof.material.opacity = me.body && tunnelAt(me.body.pos) === TUNNELS[i] ? 0.25 : 1));
  for (const pl of PLATFORMS.filter((p) => p.ferry)) for (const m of platformParts[PLATFORMS.indexOf(pl)]) m.position.set(pl.x + m.userData.off.x, m.position.y, pl.z + m.userData.off.z);
  abyss.position.y = lavaY;
  lava.offset.x += 0.02 * dt;
  lava.offset.y += 0.01 * dt;
  booster.visible = !!boostAt;
  if (boostAt) booster.position.set(boostAt.x, boostAt.y, boostAt.z);
  booster.rotation.y += 3 * dt; // the beam is round: only the disc shows it turning
  for (const m of maluses) {
    m.mesh.visible = now >= m.backAt && !m.pl.gone;
    m.mesh.position.set(m.x, 1.3 + 0.3 * Math.sin(now * 4), m.z);
  }
  while (itemMeshes.length < shownItems.length) {
    const mesh = new THREE.Sprite();
    mesh.scale.setScalar(ICON_SIZE);
    scene.add(mesh);
    itemMeshes.push(mesh);
  }
  itemMeshes.forEach((mesh, i) => {
    const it = shownItems[i];
    mesh.visible = !!it;
    if (!it) return;
    mesh.material = iconMaterial(it[0]);
    mesh.position.set(it[1], it[2] + 1.3 + 0.3 * Math.sin(now * 4 + i), it[3]);
  });
  // The shaky platform blinks, then is gone with its pads and walls.
  const blink = shaky && !shaky.gone && Math.sin(now * 20) > 0;
  platformParts.forEach((parts, i) => parts.forEach((m) => (m.visible = !PLATFORMS[i].gone && !(blink && PLATFORMS[i] === shaky))));
  // The lava coming: the countdown in the middle of the screen, and the ground's pads going up blink, the emergency exits.
  $("lava").hidden = lavaIn === null;
  if (lavaIn !== null) $("lava-in").textContent = `dans ${Math.ceil(lavaIn)} s`;
  const flash = lavaIn !== null && Math.sin(now * 12) > 0;
  pads.forEach((m, i) => {
    const exit = flash && !PADS[i].y && PLATFORMS[PADS[i].to].y;
    m.scale.set(exit ? 2.2 : 1, 1, exit ? 2.2 : 1);
    m.material.emissiveIntensity = exit ? 5 : 1.2 + 0.6 * Math.sin(now * 6);
    if (PLATFORMS[PADS[i].to].gone) m.visible = false; // off while its platform is gone: it would throw into the lava
  });
  for (const e of entities) {
    e.bubble.visible = !e.empty && e.alive && has(e, "shield");
    const over = (y) => e.group.position.y + (e.head.position.y + y) * e.group.scale.y; // above the head, whatever the neck
    if (!e.bomb) scene.add((e.bomb = new THREE.Sprite(iconMaterial("potato"))));
    e.bomb.visible = !e.empty && e.alive && has(e, "potato");
    if (!e.bomb.visible) continue;
    const beat = e.until.potato - now < 5 ? 14 : 5; // faster and faster
    e.bomb.scale.setScalar(1.2 + 0.3 * Math.abs(Math.sin(now * beat)));
    e.bomb.position.set(e.group.position.x, over(1.5), e.group.position.z);
  }
}

// Who is where: each other player's alias on my screen, fixed size, through everything, an arrow down onto its head.
// Off the screen or behind me: pinned to the edge, the arrow toward it.
const TAG_EDGE = 60; // px kept from the edges
const tagAt = new THREE.Vector3();
function showTags() {
  $("tags").hidden = false;
  const w = innerWidth, h = innerHeight, top = leader();
  for (const e of entities) {
    if (!e.tagEl) {
      e.tagEl = document.createElement("div");
      e.tagEl.className = "tag";
      e.tagEl.append(document.createElement("b"), Object.assign(document.createElement("i"), { textContent: "➜" }));
      $("tags").append(e.tagEl);
    }
    const on = !e.empty && e.alive && e !== me && me.alive && !(e.body && tunnelAt(e.body.pos)); // in a tunnel: hidden, as on the radar
    e.tagEl.hidden = !on;
    if (!on) continue;
    e.tagEl.firstChild.textContent = `${e === top ? "👑 " : ""}${e.alias}`;
    e.tagEl.style.color = css(e.color);
    tagAt.set(e.group.position.x, e.group.position.y + (e.head.position.y + 0.5) * e.group.scale.y, e.group.position.z).project(camera);
    const behind = tagAt.z > 1, flip = behind ? -1 : 1; // behind me, the projection comes out mirrored
    let x = (flip * tagAt.x * w) / 2, y = (-flip * tagAt.y * h) / 2; // from the middle of the screen
    const room = Math.min((w / 2 - TAG_EDGE) / Math.abs(x || 1e-6), (h / 2 - TAG_EDGE) / Math.abs(y || 1e-6));
    const off = behind || room < 1;
    if (off) {
      x *= room;
      y *= room;
    }
    e.tagEl.classList.toggle("off", off);
    e.tagEl.style.transform = `translate(${w / 2 + x}px, ${h / 2 + y}px) translate(-50%, ${off ? -50 : -100}%)`;
    e.tagEl.lastChild.style.transform = `rotate(${off ? Math.atan2(y, x) : Math.PI / 2}rad)`;
  }
}

// An event that is no death, told by the host to everyone: the line, the card if it is an exploit,
// the crowd if loud. The guests get the last few in each state.
const news = [];
let newsId = 0;
function tell(text, players = {}, shout = "", loud = false, buy = -1) {
  const n = { id: ++newsId, text, who: Object.fromEntries(Object.entries(players).map(([k, e]) => [k, entities.indexOf(e)])), shout, loud, buy };
  news.push(n);
  if (news.length > 8) news.shift();
  showNews(n);
}
function showNews(n) {
  const players = Object.fromEntries(Object.entries(n.who).map(([k, i]) => [k, entities[i]]));
  feed(n.text, players, n.shout);
  if (n.shout) splash(players["{K}"], n.shout);
  if (n.buy >= 0) { // a purchase: the card, not read aloud
    splash(players["{K}"], `${SHOP[n.buy].icon} ${SHOP[n.buy].name} !`);
    SHOP[n.buy].show?.(players["{V}"]);
  }
  if (n.loud) {
    roar();
    cheerUntil = now + 4;
  }
}

// Deaths, and the gore that comes with a decapitation: the host decides them, everyone shows them.
// rebounds: the disc's before the hit, a trickshot; strike: the disc's second victim or more.
function kill(e, killer, how, dir, { rebounds = 0, strike = false, boom = false } = {}) {
  e.alive = false;
  e.respawnAt = now + RESPAWN_DELAY;
  discs.filter((d) => d.owner === e).forEach(removeDisc);
  const counts = counting();
  const scores = killer && counts;
  const regicide = e === leader();
  const others = entities.filter((o) => !o.empty && o !== killer);
  const outsider = scores && others.length >= 2 && others.every((o) => killer.score < o.score); // the last of all
  const shouts = boom ? ["Boum !"] : [];
  e.streak = 0;
  if (counts) e.deaths++;
  if (killer) {
    killer.streak++;
    const bonus = Math.min(killer.streak - 1, MAX_STREAK_BONUS);
    const trick = Math.min(rebounds, MAX_TRICK_BONUS);
    if (scores) {
      killer.score += POINTS[how] + bonus + trick + (regicide ? REGICIDE_BONUS : 0);
      killer.kills++;
      killer.best = Math.max(killer.best, killer.streak);
    }
    if (scores && !firstBlood) shouts.push("Premier sang !");
    firstBlood ||= scores && killer;
    if (how === "decap") shouts.push(scores && ++killer.heads === 3 ? "Chasseur de têtes !" : "En pleine tête !");
    if (strike) shouts.push("Brochette !");
    if (trick) shouts.push(`Par la bande !${scores ? ` +${trick} 📀` : ""}`);
    if (bonus) shouts.push(STREAK_SHOUTS[Math.min(killer.streak, STREAK_SHOUTS.length - 1)] + (scores ? ` +${bonus} 📀` : ""));
    if (regicide) shouts.push(`Détrôné !${scores ? ` +${REGICIDE_BONUS} 📀` : ""}`);
    if (outsider) shouts.push("Remontada !");
    if (killer.necks < MAX_NECKS && ++killer.necks === MAX_NECKS) shouts.push("Cou de girafe !");
    if (killer.bot && Math.random() < 0.4) setTimeout(() => taunt(killer), 800);
  } else if (how === "fall") { // a fall nobody caused: a suicide, the only humiliation; the lava, a platform, a potato are no one's fault
    if (counts) Object.assign(e, { score: e.score - 1, falls: e.falls + 1 });
    shouts.push(`Humiliation !${counts ? " -1 📀" : ""}`);
  }
  const boo = !!killer && killer === leader(); // the crowd boos the leader's kills
  Object.assign(e, { how, killer, boo, dir: { x: dir?.x ?? 0, z: dir?.z ?? 0 }, shout: shouts.join(" ") });
  showDeath(e, killer, how, e.dir, e.shout, boo);
  if (scores && killer.score >= WIN_SCORE) {
    winner = killer;
    killer.wins++;
    renderScores(); // its 🏆: the death's own render came before
    report = summarize();
    showWinner(winner, report);
  } else if (scores && killer.score >= MATCH_POINT && !killer.matchPoint) {
    killer.matchPoint = true;
    setTimeout(() => tell("[excited] {K} sent la victoire ! Et un peu le brûlé aussi.", { "{K}": killer }, "Un frag pour la gloire !", true), 2000); // after the card of the kill
  }
}

const counting = () => inMatch && !winner && now >= fightAt; // the frags and the stats count

const CALM = 30; // s after « Fraggez ! » before a platform vanishes or it rains; the lava waits its LAVA_EVERY s
function launchMatch() {
  [...discs].forEach(removeDisc);
  fightAt = now + INTRO + COUNTDOWN;
  // The arena calms down first, for the spawns too: no lava, no platform gone, no rain.
  if (shaky) shaky.gone = false;
  shaky = null;
  vanishAt = fightAt + CALM;
  lavaAt = fightAt + LAVA_EVERY;
  raining = false;
  rainAt = fightAt + CALM;
  mammoth = Math.random() < MAMMOTH_ODDS;
  setSize(Math.min(1, Math.max(0.6, Math.sqrt(entities.filter((e) => !e.empty).length / ARENA_FULL))));
  for (const e of entities) if (!e.empty) spawn(Object.assign(e, { score: 0, streak: 0, heads: 0, ...NO_STATS, matchPoint: false }));
  firstBlood = false;
  setMatch(true);
  if (mammoth) tell("Manche Mastodonte : tout le monde est énorme jusqu'à la fin !");
}

function toLobby() {
  winner = null;
  mammoth = false;
  for (const e of entities) delete e.until.fat;
  showWinner(null);
  setMatch(false);
}

function setMatch(on) {
  inMatch = on;
  lastTop = null;
  if (on) {
    best = null;
    $("summary").hidden = true; // a guest still reading the last one
    for (const e of entities) e.matchLife = e.life; // a winner still on this life never died: flawless
    feed("La partie commence !");
    const intro = START_LINES[Math.floor(Math.random() * START_LINES.length)];
    announce(intro);
    // shortcut: a guest joining in the first seconds of a match also sees the count, harmless
    if (entities.every((e) => !e.score)) {
      heldUntil = now + INTRO + COUNTDOWN;
      banner(untoned(intro), "sub"); // her words, for those without the sound
      ["3", "2", "1", "Fraggez !"].forEach((n, i) => setTimeout(() => {
        banner(n, "count");
        if (i === 3) announce("", n);
      }, (INTRO + (i + 1) * COUNTDOWN / 4) * 1000));
      setTimeout(() => $("banner").textContent === "Fraggez !" && banner(""), (INTRO + COUNTDOWN + 1) * 1000);
    }
  }
  renderScores();
}

const flawless = (e) => e === me && e.life === e.matchLife;
function winBanner() { // hoisted: the first spawns call it
  return !champion ? "" : champion !== me ? "Défaite… ça arrive." : flawless(me) ? "Victoire sans une égratignure !" : "Victoire !";
}
// The match over: the ranking with its stats, and the highlights, as the host wrote them.
function summarize() {
  const players = entities.filter((o) => !o.empty).sort((a, b) => b.score - a.score);
  // A highlight, sent to the guests: [label, slot of the player, detail].
  const fact = (label, o, detail = "") => [label, entities.indexOf(o), detail];
  // The best at stat, if anyone did it at least min times.
  const most = (stat, label, [one, many], min = 1) => {
    const top = players.reduce((a, b) => (b[stat] > a[stat] ? b : a));
    return top[stat] >= min && fact(label, top, `${top[stat]} ${top[stat] > 1 ? many : one}`);
  };
  return {
    rows: players.map((e) => [entities.indexOf(e), e.score, e.kills, e.heads, e.cuts, e.deaths, e.best, e.wins]),
    facts: [
      firstBlood && fact("Premier sang", firstBlood),
      !winner.deaths && fact("Sans une égratignure", winner, "jamais mort"),
      most("heads", "Coupeur de têtes", ["décapitation", "décapitations"]),
      most("best", "Plus longue série", ["victime d'affilée", "victimes d'affilée"], 2),
      most("cuts", "Bûcheron", ["jambe coupée", "jambes coupées"]),
      most("deaths", "Souffre-douleur", ["mort", "morts"]),
      most("falls", "Kamikaze", ["chute tout seul", "chutes tout seul"]),
      most("spent", "Flambeur", ["disque d'or dépensé", "disques d'or dépensés"]),
    ].filter(Boolean),
  };
}

function showWinner(e, summary) {
  champion = e;
  banner("");
  if (!e) return void ($("summary").hidden = true); // back in the room: the guests' summary goes with the host's
  $("summary").hidden = false;
  play(false); // the cursor, to click it
  document.exitPointerLock?.();
  feed(`${e.alias} remporte le match !`);
  const [second, ...rest] = entities.filter((o) => !o.empty && o !== e).sort((a, b) => b.score - a.score);
  const last = rest.at(-1), lead = e.score - (second?.score ?? 0);
  const end = !second ? "[excited] Et c'est terminé ! Victoire de {K} !" : END_LINES[lead <= 2 ? "close" : lead < 10 ? "clear" : "crushing"];
  announce(last ? `${end} ${END_LINES.last}` : end, flawless(e) ? "Sans une égratignure !" : "", { "{K}": e, "{V}": second, "{L}": last });
  $("summary-title").textContent = winBanner();
  $("summary-portrait").src = e.portrait;
  $("summary-winner").textContent = `${e.alias} remporte le match`;
  const cells = (tag, texts) => texts.map((text) => Object.assign(document.createElement(tag), { textContent: text }));
  const head = document.createElement("tr");
  head.append(...cells("th", ["", "Frags", "Victimes", "Têtes", "Jambes", "Morts", "Série", "🏆"]));
  $("summary-table").replaceChildren(head, ...(summary?.rows ?? []).map(([slot, ...stats], rank) => {
    const o = entities[slot], line = document.createElement("tr");
    line.append(...cells("td", [`${rank + 1}. ${o.alias}${o === me ? " (toi)" : ""}`, ...stats]));
    line.style.color = css(o.color);
    return line;
  }));
  $("summary-facts").replaceChildren(...(summary?.facts ?? []).map(([label, slot, detail]) => {
    const o = entities[slot], card = document.createElement("div");
    card.className = "card";
    const portrait = new Image();
    portrait.src = o.portrait;
    portrait.alt = "";
    const [title, alias, info] = cells("div", [label, o.alias, detail]);
    title.className = "fact";
    alias.className = "alias";
    alias.style.color = css(o.color);
    card.append(title, portrait, alias, info);
    return card;
  }));
}

let lastDeathAt = 0;
function showDeath(e, killer, how, dir, shout, boo) {
  lastDeathAt = now;
  // The jokes are for the exploits: a plain push gets a plain line.
  const boom = shout.startsWith("Boum");
  const lines = boom ? ["[sarcastic] {V} a gardé la patate chaude trop longtemps."]
    : how === "decap" ? DECAP_LINES : how === "lava" ? ["{V} finit en fondue", "{V} n'a pas trouvé la sortie de secours"]
    : how === "vanish" ? ["{V} tombe avec sa place"] : !shout ? ["{K} a envoyé {V} dans la lave"] : killer ? PUSH_LINES : FALL_LINES;
  // Picked from the death count, so that every player reads the same line.
  feed(lines[(e.life + entities.indexOf(e)) % lines.length], { "{K}": killer, "{V}": e }, shout);
  if (shout) splash(killer ?? e, shout); // the exploit's author, or the one humiliated
  else if (killer === me && e !== me) say(`☠️ Tu as éjecté ${e.alias}`, "Dans la lave !"); // a plain push: my card only
  if (e === me) {
    me.group.visible = true;
    banner(boom ? "Boum !" : how === "decap" ? `Raccourci par ${killer.alias}` : killer ? `Sorti par ${killer.alias}`
      : how === "lava" ? "Fondu. Les tremplins qui clignotent montent !" : how === "vanish" ? "Ta place s'est envolée" : "Suicide. Bien joué.");
    if (killer && killer !== me) {
      replay = { killer, from: now, lead: how === "fall" ? 3 : 1.5 }; // a fall comes long after the push
      $("replay").textContent = `Killcam — avec les compliments de ${killer.alias}`;
    }
  }
  if (how === "decap" || boom) {
    decapitate(e, dir);
    splat(e.group.position);
    cheerUntil = now + 4;
  }
  if (inMatch) { // the action of the match: the kill with the most exploits, the last of the best
    const rating = (how === "decap" ? 3 : 1) + (shout.match(/!/g)?.length ?? 0);
    if (rating >= (best?.rating ?? 0)) best = { at: now, rating, victim: e };
  }
  if (boo) {
    roar(true);
    pelt(killer);
  } else if (how === "decap" || shout.includes("Remontada")) roar();
  // Solo only: the host's slow motion would slow the world under the guests' feet.
  const solo = !joining && !entities.some((o) => o.conn);
  if (how === "decap" && solo && (e === me || killer === me)) slowUntil = performance.now() + 1500;
  renderScores();
}

// Deliberately too much: the head pops high, a burst, then a geyser pulsing from the neck for seconds.
function decapitate(e, dir) {
  e.group.updateMatrixWorld();
  scene.attach(e.head);
  const len = Math.hypot(dir.x, dir.z) || 1;
  flyingParts.push({
    owner: e,
    mesh: e.head,
    rest: 0.25,
    vel: new THREE.Vector3((dir.x / len) * 5, 13, (dir.z / len) * 5),
    spin: new THREE.Vector3(Math.random() * 15, Math.random() * 15, Math.random() * 15),
  });
  bleed(e.head.position, 400, UP, 9, 8);
  e.geyserUntil = now + GEYSER_TIME;
  e.toppleAt = now + 2;
}

const neckBase = new THREE.Vector3();
const neckTop = new THREE.Vector3();
const spray = new THREE.Vector3();
function updateCorpse(e, dt) {
  if (now < e.geyserUntil) {
    e.group.updateMatrixWorld();
    e.group.localToWorld(neckBase.set(0, NECK_BASE, 0));
    e.group.localToWorld(neckTop.set(0, 2 * e.neck.position.y - NECK_BASE, 0));
    spray.subVectors(neckTop, neckBase).normalize();
    // A heartbeat: the geyser pulses, and weakens as the body empties.
    const left = (e.geyserUntil - now) / GEYSER_TIME;
    const beat = 0.35 + 0.65 * Math.abs(Math.sin(now * 7));
    bleed(neckTop, Math.ceil(25 * beat * left), spray, 16 * beat * (0.4 + 0.6 * left), 2.5);
  }
  // Headless, it staggers on its feet, then falls back with the geyser still going.
  if (now < e.toppleAt) e.group.rotation.z = Math.sin(now * 13) * 0.12;
  else e.group.rotation.x = Math.max(-Math.PI / 2, e.group.rotation.x - 3 * dt);
}

const KICK_SPEED = 11;
function updateParts(dt) {
  for (const h of flyingParts) {
    const m = h.mesh;
    h.vel.y -= GRAVITY * dt;
    m.position.addScaledVector(h.vel, dt);
    m.rotation.x += h.spin.x * dt;
    m.rotation.y += h.spin.y * dt;
    m.rotation.z += h.spin.z * dt;
    const ground = platformUnder(m.position)?.y;
    if (h.vel.y < 0 && m.position.y < ground + h.rest && m.position.y > ground - 0.5) {
      m.position.y = ground + h.rest;
      h.vel.set(h.vel.x * 0.6, -h.vel.y * 0.4, h.vel.z * 0.6);
      h.spin.multiplyScalar(0.6);
      bleed(m.position, 20, UP, 3, 4);
    }
    if (h.vel.lengthSq() > 4) bleed(m.position, 3, UP, 1, 2);
    // Whoever walks into a head on the ground kicks it; into the void, a penalty.
    const kicker = ground !== undefined && m.position.y < ground + 0.6 && now > (h.kickAt ?? 0) &&
      entities.find((e) => !e.empty && e.alive && e.body && Math.abs(e.body.pos.y - ground) < 0.5 && apart(e.body.pos, m.position) < 0.9);
    if (kicker) {
      const len = apart(m.position, kicker.body.pos) || 1;
      h.vel.set(((m.position.x - kicker.body.pos.x) / len) * KICK_SPEED, 7, ((m.position.z - kicker.body.pos.z) / len) * KICK_SPEED);
      Object.assign(h, { kicker, kickAt: now + 0.3 });
      bleed(m.position, 10, UP, 3, 4);
    }
    if (!joining && h.kicker && !h.scored && m.position.y < lavaY) {
      h.scored = true;
      tell(h.leg ? "[excited] Magnifique ! {K} marque du pied… celui de {V} !" : "[excited] Quelle frappe ! {K} marque de la tête… celle de {V} !", { "{K}": h.kicker, "{V}": h.owner }, "Et c'est le buuut !", true);
    }
  }
}

// The blood: thousands of drops, so one instanced mesh for the drops and one for the stains.
const UP = new THREE.Vector3(0, 1, 0);
const bloodMat = new THREE.MeshStandardMaterial({ color: 0x9a0007, roughness: 0.25 });
const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), bloodMat, MAX_DROPS);
const stainMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.12, 10).rotateX(-Math.PI / 2), bloodMat, MAX_STAINS);
dropMesh.count = stainMesh.count = 0;
// The instances spread over the whole arena, past the bounds of the one geometry three.js would cull on.
dropMesh.frustumCulled = stainMesh.frustumCulled = false;
scene.add(dropMesh, stainMesh);
const dummy = new THREE.Object3D();
let stainCount = 0;
// The blood pools: stains on each 1 m square of floor; from BLOOD_SLIPS of them, it slips like the Patinoire.
const BLOOD_SLIPS = 4;
const pools = new Map(), stainSquares = [];
const square = (p, y) => `${Math.round(p.x)},${Math.round(y)},${Math.round(p.z)}`;
const onBlood = (b) => b.onGround && (pools.get(square(b.pos, b.pos.y)) ?? 0) >= BLOOD_SLIPS;

// A leg off, on the host and on its guests: it flies off spinning, the stump spurts.
function loseLeg(e, legs) {
  e.legs = legs;
  e.group.updateMatrixWorld();
  // A guest may get both cuts in one state.
  for (const m of e.limbs.slice(legs).filter((m) => m.parent === e.group)) {
    scene.attach(m);
    const a = Math.random() * 2 * Math.PI;
    flyingParts.push({
      owner: e, mesh: m, rest: 0.13, leg: true,
      vel: new THREE.Vector3(Math.sin(a) * 4, 9, Math.cos(a) * 4),
      spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
    });
    bleed(m.position, 150, UP, 5, 5);
    splat(m.position);
  }
}

// count drops from at, along dir at about speed, scattered by spread on each axis.
function bleed(at, count, dir, speed, spread) {
  for (let i = 0; i < count && drops.length < MAX_DROPS; i++) {
    const s = speed * (0.7 + Math.random() * 0.6);
    const jitter = () => (Math.random() - 0.5) * spread;
    drops.push({
      p: new THREE.Vector3(at.x, at.y, at.z),
      v: new THREE.Vector3(dir.x * s + jitter(), dir.y * s + jitter(), dir.z * s + jitter()),
      size: 0.5 + Math.random() * 1.5,
      life: 4,
    });
  }
}

// A drop that lands on a platform leaves a stain there; the oldest stains give way to the new.
function stain(p, ground, size) {
  dummy.position.set(p.x, ground + 0.012 + Math.random() * 0.004, p.z);
  dummy.scale.setScalar(size * (1 + Math.random()));
  dummy.updateMatrix();
  const slot = stainCount++ % MAX_STAINS, old = stainSquares[slot], key = square(p, ground);
  if (old) pools.set(old, pools.get(old) - 1);
  stainSquares[slot] = key;
  pools.set(key, (pools.get(key) ?? 0) + 1);
  stainMesh.setMatrixAt(slot, dummy.matrix);
  stainMesh.count = Math.min(stainCount, MAX_STAINS);
  stainMesh.instanceMatrix.needsUpdate = true;
}

function updateBlood(dt) {
  let n = 0;
  for (const d of drops) {
    d.v.y -= GRAVITY * dt;
    d.p.addScaledVector(d.v, dt);
    d.life -= dt;
    const ground = platformUnder(d.p)?.y;
    const landed = d.v.y < 0 && d.p.y <= ground + 0.01 && d.p.y > ground - 0.3;
    if (landed) stain(d.p, ground, d.size);
    if (landed || d.life <= 0) continue;
    drops[n++] = d;
    dummy.position.copy(d.p);
    dummy.scale.setScalar(d.size);
    dummy.updateMatrix();
    dropMesh.setMatrixAt(n - 1, dummy.matrix);
  }
  drops.length = n;
  dropMesh.count = n;
  dropMesh.instanceMatrix.needsUpdate = true;
}

// The bots: face the nearest foe and lead it, strafe, keep off the edge, jump over the discs.
function shoot(e) {
  const aim = e.yaw;
  e.yaw += (Math.random() - 0.5) * BOT_AIM_ERROR;
  throwDisc(e, e.discs >= MAX_DISCS && Math.random() < BOT_DECAPS);
  e.yaw = aim;
}

function think(e) {
  const b = e.body, ai = e.ai;
  const foes = entities.filter((o) => o !== e && o.alive && Math.abs(o.body.pos.y - b.pos.y) < 1); // on its floor
  const dist = (o) => Math.hypot(o.body.pos.x - b.pos.x, o.body.pos.z - b.pos.z);
  const target = foes.sort((a, c) => dist(a) - dist(c))[0];
  let jump = false;
  if (target) {
    const t = dist(target) / DISC_SPEED, tb = target.body;
    const lx = tb.pos.x + (tb.vel.x + tb.push.x) * t * BOT_LEAD - b.pos.x;
    const lz = tb.pos.z + (tb.vel.z + tb.push.z) * t * BOT_LEAD - b.pos.z;
    e.yaw = Math.atan2(-lx, -lz);
    if (now > ai.throwAt && b.onGround) {
      ai.throwAt = now + 1.8 + Math.random() * 1.5;
      // Now and then a jump shot: thrown early in the jump, the disc flies at neck height.
      if (Math.random() < BOT_JUMP_SHOTS) {
        ai.shotAt = now + 0.08;
        jump = true;
      } else {
        shoot(e);
      }
    }
    if (ai.shotAt && now > ai.shotAt) {
      ai.shotAt = 0;
      shoot(e);
    }
  }
  // 6 📀 behind the leader, now and then, the potato or the tomatoes for it: the shop works against the bots too.
  if (e.score + 6 <= (leader()?.score ?? 0) && Math.random() < 0.003) buy(e, Math.random() < 0.5 ? 2 : 3);
  if (now > ai.turnAt) {
    ai.turnAt = now + 0.5 + Math.random() * 1.2;
    ai.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)];
  }
  const f = forward(e.yaw);
  let wish = { x: -f.z * ai.strafe, z: f.x * ai.strafe };
  const pl = platformUnder(b.pos);
  // Off a platform about to vanish, or the ground floor with the lava coming: by the nearest pad, one going up first.
  const flee = pl && (pl === shaky || (!pl.y && now >= lavaAt));
  const exit = flee && PADS.filter((p) => platformUnder(p) === pl && !PLATFORMS[p.to].gone)
    .sort((p, q) => PLATFORMS[q.to].y - PLATFORMS[p.to].y || apart(p, b.pos) - apart(q, b.pos))[0];
  // Where a run or a jump at that speed ends after t s, if on a platform at all.
  const lands = (v, t) => platformUnder({ x: b.pos.x + (v.x + b.push.x) * t, z: b.pos.z + (v.z + b.push.z) * t });
  if (exit) {
    const len = apart(exit, b.pos) || 1;
    wish = { x: (exit.x - b.pos.x) / len, z: (exit.z - b.pos.z) / len };
  } else if (pl && (Math.hypot(b.pos.x - pl.x, b.pos.z - pl.z) > pl.r - (b.slippery || pl.ferry ? 3.5 : 1.3) || !lands(b.vel, 0.3))) { // sliding, or on a ferry moving off: further from the edge
    const len = Math.hypot(pl.x - b.pos.x, pl.z - b.pos.z);
    wish = { x: (pl.x - b.pos.x) / len, z: (pl.z - b.pos.z) / len };
  } else if (!target && pl === PLATFORMS[0]) { // nobody on its floor: a stroll through a tunnel, from its nearer end
    if (!ai.walk?.length) {
      const t = TUNNELS[Math.floor(Math.random() * TUNNELS.length)];
      const end = (k) => ({ x: t.x + k * t.ax * (t.half + 1), z: t.z + k * t.az * (t.half + 1) });
      ai.walk = [end(1), end(-1)].sort((p, q) => apart(p, b.pos) - apart(q, b.pos));
    }
    const len = apart(ai.walk[0], b.pos);
    if (len < 1) ai.walk.shift();
    else wish = { x: (ai.walk[0].x - b.pos.x) / len, z: (ai.walk[0].z - b.pos.z) / len };
  }
  const c = chest(b);
  const danger = discs.some((d) => d.owner !== e && !d.returning
    && Math.hypot(d.pos.x - c.x, d.pos.z - c.z) < 4
    && d.vel.x * (c.x - d.pos.x) + d.vel.z * (c.z - d.pos.z) > 0);
  // Never a jump into the void, nor off a ferry, which would have moved on by the landing.
  const air = (2 * JUMP_SPEED) / GRAVITY, run = { x: wish.x * RUN_SPEED, z: wish.z * RUN_SPEED };
  const safe = !pl?.ferry && lands(run, air) && lands(b.vel, air);
  return { wish, jump: safe && (jump || (danger && Math.random() < 0.02)) };
}

// The player.
const keys = new Set();
addEventListener("keydown", (ev) => ev.target.tagName !== "INPUT" && keys.add(ev.code)); // not while typing a name
addEventListener("keyup", (ev) => keys.delete(ev.code));
// The pointer lock only keeps the cursor in the window: a browser may refuse it, and the mouse
// must still aim and throw without it.
let playing = false;
let locked = false;
const startScreen = $("start");
function play(on) {
  playing = on;
  startScreen.style.display = on ? "none" : "flex";
  document.body.style.cursor = on ? "none" : "";
}
function lock() {
  if (!renderer.domElement.requestPointerLock) return feed("Ce navigateur ne sait pas capturer la souris.");
  Promise.resolve(renderer.domElement.requestPointerLock())
    .catch((err) => feed(`Souris non capturée : ${err?.message ?? err}`));
}
// The first warm-up, a card at a time: what a new player would otherwise find out alone.
const TIPS = [
  ["🖱️ Clic gauche : un disque", "Il pousse : envoie les autres dans la lave"],
  ["🖱️ Clic droit : le décapiteur", "Tes 3 disques d'un coup : vise le cou, ou les jambes"],
  ["⭕ Les tremplins", "À la couleur de l'étage où ils t'envoient"],
  ["📀 La boutique, touches 1 à 5", "Chaque frag rapporte un disque d'or, à dépenser contre les autres"],
];
let tutored = false;
startScreen.addEventListener("click", () => {
  if (!tutored) TIPS.forEach((tip, i) => setTimeout(() => !inMatch && say(...tip), 3000 + i * 6000));
  tutored = true;
  wantMusic = true;
  startMusic();
  play(true);
  lock();
});
// Each click in the game asks again: Chrome refuses a lock asked too soon after Escape.
renderer.domElement.addEventListener("mousedown", () => {
  if (playing && !locked) lock();
});
document.addEventListener("pointerlockerror", () => feed("Le navigateur a refusé de capturer la souris."));
document.addEventListener("pointerlockchange", () => {
  if (locked && !document.pointerLockElement) play(false);
  locked = !!document.pointerLockElement;
});
addEventListener("keydown", (ev) => {
  if (ev.code === "Escape") play(false);
});
addEventListener("mousemove", (ev) => {
  if (!playing || !me.alive) return;
  me.yaw -= ev.movementX * 0.0022;
  me.pitch = Math.max(-1.4, Math.min(1.4, me.pitch - ev.movementY * 0.0022));
});
// A guest counts its throws; the host throws as many discs as the count goes up.
let myThrows = 0;
let myDecaps = 0;
let myTaunts = 0;
addEventListener("mousedown", (ev) => {
  if (!playing || champion) return;
  if (!me.alive || held()) return;
  if (!joining) throwDisc(me, ev.button === 2);
  else if (ev.button === 2) myDecaps++;
  else myThrows++;
});
addEventListener("contextmenu", (ev) => ev.preventDefault());
addEventListener("keydown", (ev) => {
  if (ev.code !== "KeyT" || ev.target.tagName === "INPUT" || !me.alive || ev.repeat) return;
  if (joining) myTaunts++;
  else taunt(me);
});
let myBuys = 0;
let myItem = 0;
addEventListener("keydown", (ev) => {
  const i = SHOP.findIndex((_, k) => ev.code === `Digit${k + 1}`);
  if (i < 0 || ev.target.tagName === "INPUT" || !me.alive || ev.repeat) return;
  const no = refusal(me, SHOP[i]);
  if (no) say(`${SHOP[i].icon} ${SHOP[i].name}`, no);
  else if (joining) [myBuys, myItem] = [myBuys + 1, i];
  else buy(me, i);
});
$("launch").addEventListener("click", launchMatch); // the click goes on to the start screen, which starts playing
$("lobby").addEventListener("click", (ev) => ev.stopPropagation()); // renaming must not start playing
$("summary").addEventListener("click", () => {
  $("summary").hidden = true;
  if (winner) toLobby(); // the host's click brings everyone back to the warm-up
});
// A guest's name goes to the host with its moves; the host's states bring it back to everyone.
let myName = null;
$("pseudo").addEventListener("input", (ev) => {
  const name = cleanName(ev.target.value);
  if (!name) return;
  me.name = me.alias = name;
  if (joining) myName = name;
  renderScores();
});

// KeyboardEvent.code names the key by its place: KeyW is Z on an AZERTY keyboard.
const axis = (plus, minus) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);
const SPRINT = 1.5; // Shift held: so many times faster
function playerInput() {
  const flip = has(me, "upside") ? -1 : 1;
  const ahead = axis("KeyW", "KeyS") * flip, side = axis("KeyD", "KeyA") * flip;
  const f = forward(me.yaw);
  const x = f.x * ahead - f.z * side, z = f.z * ahead + f.x * side;
  const len = (Math.hypot(x, z) || 1) / (keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT : 1);
  return { wish: { x: x / len, z: z / len }, jump: keys.has("Space") };
}

// The wheel steps the view out behind me, up to about half the arena in sight; all the way in, through my eyes again.
const MAX_ZOOM = 72;
const ZOOM_TILT = 0.5; // rad the view looks down, all the way back
let zoom = 0;
addEventListener("wheel", (ev) => {
  if (locked) zoom = Math.min(MAX_ZOOM, Math.max(0, zoom + ev.deltaY * 0.01));
}, { passive: true });
// Where I look: further back, the view also looks down; the discs fly under the crosshair, so along it too.
const viewPitch = () => me.pitch - ZOOM_TILT * (zoom / MAX_ZOOM);

function updateCamera(dt) {
  const flying = flyingParts.find((h) => h.owner === me && !h.leg);
  if (flying) {
    // Decapitated: the view steps out behind the body to watch the geyser (from the head, the blood hides all).
    me.group.updateMatrixWorld();
    const at = me.group.localToWorld(neckTop.set(0, NECK_TOP, 0));
    camera.position.set(at.x + Math.sin(me.yaw) * 5, at.y + 2.5, at.z + Math.cos(me.yaw) * 5);
    camera.lookAt(at.x, at.y + 1.5, at.z);
    return;
  }
  if (me.alive) me.group.visible = zoom > 0;
  // Further back, the view also looks down, over the platforms, with me still in its middle; it stays inside the stands.
  // shortcut: the camera still goes through a platform or a cover right behind me; push it in front if it bothers players.
  const pitch = viewPitch();
  eyeShown = eyeShown === null ? eyeHeight(me) : eyeShown + (eyeHeight(me) - eyeShown) * (1 - Math.exp(-EYE_EASE * dt));
  const back = (d) => new THREE.Vector3(Math.sin(me.yaw) * Math.cos(pitch) * d, eyeShown - Math.sin(pitch) * d, Math.cos(me.yaw) * Math.cos(pitch) * d)
    .add(me.body.pos);
  let d = zoom;
  while (d > 0 && Math.hypot(back(d).x, back(d).z) > ARENA_RADIUS - 1) d -= 0.5;
  camera.position.copy(back(Math.max(d, 0)));
  camera.rotation.set(pitch, me.yaw, 0);
}

// The HUD.
// kind: "count", the « 3, 2, 1 », big, read from the corner of the eye; "sub", her words as subtitles.
function banner(text, kind = "") {
  $("banner").textContent = text;
  $("banner").className = kind;
}
// The commentator reads the events aloud on each player's machine, in a slow, sultry female voice: the gore, whispered.
// The exploits, an announcer shouts them, booming, like the one of Unreal Tournament.
let commentatorVoice = null;
let muted = false;
let crowd = null; // the AudioContext of the arena's noises and the music, made at the first one
let music = null; // the music playing: { out, low, next: when its next sixteenth plays, n: its number }
let wantMusic = false; // the player clicked in: the music may start
const roarSound = (file) => Object.assign(new Audio(file), { volume: 0.4 }); // under the announcer
const ROARS = { cheer: roarSound("sounds/crowd-cheer.mp3"), boo: roarSound("sounds/crowd-boo.mp3") };
try {
  muted = localStorage.getItem("muted") === "1";
} catch {} // no storage: the sound starts on
function setMuted(on) {
  muted = on;
  try {
    localStorage.setItem("muted", on ? "1" : "0");
  } catch {}
  $("mute").textContent = on ? "🔇" : "🔊";
  if (on) window.speechSynthesis?.cancel();
  if (on) crowd?.suspend();
  if (on) Object.values(ROARS).forEach((sound) => sound.pause());
  if (!on && wantMusic) {
    crowd?.resume();
    startMusic();
  }
}
setMuted(muted);
$("mute").addEventListener("click", () => setMuted(!muted));
$("mute").addEventListener("mousedown", (ev) => ev.stopPropagation()); // not a throw
addEventListener("keydown", (ev) => {
  if (ev.code === "KeyM" && ev.target.tagName !== "INPUT") setMuted(!muted);
});
// The softest French women's voices of macOS, Chrome and Windows first; the plain macOS ones sound robotic.
const SULTRY = ["Audrey", "Marie", "Google", "Denise", "Julie", "Hortense", "Amélie"];
function pickVoice() {
  const french = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("fr"));
  commentatorVoice = SULTRY.map((name) => french.find((v) => v.name.includes(name))).find(Boolean) ?? french[0] ?? null;
}
if (window.speechSynthesis) {
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
  pickVoice();
}
let speaking = null; // the browser's line being read: kept, or Chrome may drop it before its end event
let quietAt = 0; // until when the commentator talks
let waiting = null; // the line said next, one at most: the match goes on
// text: the line, its players {K}, {V}…; shout: the exploits as shown ("Doublé ! +1 Détrôné ! +2"), their points
// not said, the cries after the line.
function announce(text, shout = "", players = {}) {
  const cries = shout.match(/[^!+\d 📀][^!]*!/gu) ?? [];
  if (text && !cries.length) cries.push(RETORTS[Math.floor(Math.random() * RETORTS.length)]); // the announcer answers her, a warrior's word
  if (muted) return;
  if (!text) return cry(cries);
  if (Date.now() < quietAt) {
    waiting = [text, shout, players];
    return;
  }
  quietAt = Date.now() + 20000; // or a line that never ends would silence her for good
  const done = () => cry(cries, () => {
    const next = waiting;
    quietAt = 0;
    asideAt = Date.now() + ASIDE_AFTER * (1 + Math.random() / 2);
    waiting = null;
    if (next) announce(...next);
  });
  // Her voice, recorded in sounds/voice/ by scripts/make-voice.mjs, piece by piece and name by name;
  // a piece missing, a name the player typed: the browser reads it all.
  const pieces = text.split(/(\{[A-Z]\})/).map((bit) => voiceSlug(bit, players[bit]?.alias)).filter(Boolean)
    .map((slug) => Object.assign(new Audio(`sounds/voice/${slug}.mp3`), { preload: "auto" }));
  Promise.all(pieces.map((sound) => new Promise((ok, ko) => Object.assign(sound, { oncanplaythrough: ok, onerror: ko }))))
    .then(() => inTurn(pieces, done), () => speak(untoned(text).replace(/\{[A-Z]\}/g, (k) => players[k].alias), done));
}
// Now and then, when she has said nothing for a while: a word on what goes on, or on anything at all.
const ASIDE_AFTER = 30000; // to 45 s of silence
let asideAt = Date.now() + ASIDE_AFTER;
let lastAside = "";
function chatter() {
  if (muted || champion || quietAt || Date.now() < asideAt) return;
  asideAt = Date.now() + ASIDE_AFTER;
  const context = [shaky && !shaky.gone && ASIDES.vanish, now > lastDeathAt + 30 && ASIDES.calm,
    stainCount > 2000 && ASIDES.blood, flyingParts.some((h) => !h.leg) && ASIDES.head].filter(Boolean).flat();
  const lines = (context.length && Math.random() < 0.7 ? context : ASIDES.any).filter((line) => line !== lastAside);
  lastAside = lines[Math.floor(Math.random() * lines.length)] ?? "";
  announce(lastAside);
}
function speak(text, done) {
  if (!window.speechSynthesis) return done();
  speaking = new SpeechSynthesisUtterance(text);
  Object.assign(speaking, { lang: "fr-FR", voice: commentatorVoice, pitch: 0.8, rate: 0.85 });
  speaking.onend = speaking.onerror = done;
  speechSynthesis.speak(speaking);
}
// Sounds one after the other.
function inTurn([first, ...rest], done = () => {}) {
  if (!first || muted) return done();
  first.onended = first.onerror = () => inTurn(rest, done);
  first.play().catch(() => inTurn(rest, done));
}
// The announcer's cries: recorded in sounds/, since the browser's voice takes no echo.
function cry(cries, done) {
  inTurn(cries.map((c) => new Audio(`sounds/${crySlug(c)}.mp3`)), done);
}

// The crowd at a decapitation, a real one recorded in sounds/ (CC0, from Freesound): it cheers, or boos for a jeer.
function roar(jeer = false) {
  if (muted) return;
  const sound = jeer ? ROARS.boo : ROARS.cheer;
  sound.currentTime = 0;
  sound.play().catch(() => {}); // no sound before the first click: nothing lost
}

// The noises of the arena, made up on the spot, fainter the further from me.
const HEARING = 45; // m from me past which nothing is heard
let hiss = null; // a second of white noise, the stuff of whooshes and splats
function sound(at) {
  const loud = 1 - Math.hypot(at.x - me.body.pos.x, at.y - me.body.pos.y, at.z - me.body.pos.z) / HEARING;
  if (muted || !window.AudioContext || loud <= 0) return null;
  const ctx = audio();
  const out = ctx.createGain();
  out.gain.value = loud;
  out.connect(ctx.destination);
  return { ctx, t: ctx.currentTime, out };
}
function audio() {
  crowd ??= new AudioContext();
  crowd.resume();
  if (!hiss) {
    hiss = crowd.createBuffer(1, crowd.sampleRate, crowd.sampleRate);
    hiss.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  }
  return crowd;
}

// The music: a dark synthwave song made up on the spot, low under the rest: a kick, a snare, hats, a bass,
// an arpeggio, and a tune on top in some parts. It starts at the first click; M cuts it with the rest.
const BEAT = 60 / 112; // s
const PROGRESSIONS = [
  [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // A minor, F, C, G: MIDI notes, 2 bars each
  [[50, 53, 57], [53, 57, 60], [57, 60, 64], [52, 56, 59]], // D minor, F, A minor, E
];
// 8 bars a part, 17 s; the four, 68 s, before the song starts over. drums: 2 all, 1 half-time, 0 the hats only.
const PARTS = [
  { chords: 0, drums: 2, arp: [0, 1, 2] },
  { chords: 1, drums: 1, arp: [0, 2, 1, 2], lead: true },
  { chords: 0, drums: 0, arp: [2, 1, 0], lead: true }, // the break, the arpeggio going down
  { chords: 1, drums: 2, arp: [0, 1, 2, 1], lead: true },
];
const LEAD = [0, -1, 2, 1, 2, -1, 1, 0]; // the tune: a chord tone each beat over its 2 bars, -1 a rest
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
function startMusic() {
  if (music || muted || !wantMusic || !window.AudioContext) return;
  const ctx = audio(), out = ctx.createGain(), low = ctx.createBiquadFilter();
  out.gain.value = 0.25;
  out.connect(ctx.destination);
  low.type = "lowpass";
  low.frequency.value = 900;
  low.connect(out);
  music = { out, low, next: ctx.currentTime + 0.1, n: 0 };
  setInterval(() => { // the sixteenths of the next 0.3 s; after a pause (a hidden tab), from now
    if (muted) return;
    music.next = Math.max(music.next, crowd.currentTime + 0.02);
    while (music.next < crowd.currentTime + 0.3) {
      sixteenth(music.n++, music.next);
      music.next += BEAT / 4;
    }
  }, 100);
}
function sixteenth(n, t) {
  const part = PARTS[Math.floor(n / 128) % PARTS.length], chord = PROGRESSIONS[part.chords][Math.floor(n / 32) % 4], step = n % 16;
  const s = { ctx: crowd, t, out: music.out }, bass = { ...s, out: music.low };
  const fill = n % 128 >= 124; // the last beat of a part: a snare roll into the next
  if (part.drums === 2 ? step % 4 === 0 : part.drums === 1 && (step === 0 || step === 10)) tone(s, "sine", 150, 40, 0.3, 0.9); // kick
  if (fill || (part.drums === 2 ? step === 4 || step === 12 : part.drums === 1 && step === 8)) noise(s, "bandpass", 1800, 900, 0.18, 0.5, 0.005, 0.8); // snare
  if (step % 4 === 2) noise(s, "highpass", 8000, 7000, 0.05, 0.15); // hat
  if (step % (part.drums ? 2 : 8) === 0) tone(bass, "sawtooth", hz(chord[0] - 24), hz(chord[0] - 24.2), part.drums ? BEAT / 2 : BEAT * 2, 0.5); // bass, on the eighths, held in the break
  const note = hz(chord[part.arp[step % part.arp.length]] + 12 * (1 + (step >> 3)));
  tone(s, "square", note, note * 0.99, BEAT / 4, 0.05); // arpeggio, an octave up on the second half
  const tune = LEAD[Math.floor(n / 4) % 8];
  if (part.lead && step % 4 === 0 && tune >= 0) tone(s, "triangle", hz(chord[tune] + 24), hz(chord[tune] + 24), BEAT * 0.9, 0.12); // the tune
}
// Noise through a filter, its gain rising in attack s then dying out by end s.
function noise({ ctx, t, out }, type, from, to, end, peak, attack = 0.01, q = 1, at = 0) {
  const src = ctx.createBufferSource();
  src.buffer = hiss;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t + at);
  filter.frequency.exponentialRampToValueAtTime(to, t + at + end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t + at);
  gain.gain.exponentialRampToValueAtTime(peak, t + at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + at + end);
  src.connect(filter).connect(gain).connect(out);
  src.start(t + at);
  src.stop(t + at + end);
}
// A tone sliding from one pitch to another, dying out by end s.
function tone({ ctx, t, out }, type, from, to, end, peak, at = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t + at);
  osc.frequency.exponentialRampToValueAtTime(to, t + at + end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t + at);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + at + end);
  osc.connect(gain).connect(out);
  osc.start(t + at);
  osc.stop(t + at + end);
}
// A disc thrown: a whoosh that rises, and the ring of the disc; the decapitator, lower, longer, with the shing of a blade.
function whoosh(at, decap) {
  const s = sound(at);
  if (!s) return;
  noise(s, "bandpass", decap ? 300 : 700, decap ? 1800 : 3000, decap ? 0.55 : 0.35, 0.5, 0.06, 2);
  if (decap) {
    tone(s, "sine", 3000, 2900, 0.6, 0.06);
    tone(s, "sine", 3170, 3050, 0.6, 0.05);
  } else tone(s, "triangle", 1800, 1500, 0.12, 0.08);
}
// A head cut off: a wet thump, the squelch, then gurgles.
function splat(at) {
  const s = sound(at);
  if (!s) return;
  tone(s, "sine", 160, 40, 0.25, 0.9);
  noise(s, "lowpass", 1400, 200, 0.35, 0.9, 0.005);
  for (let i = 0; i < 8; i++) noise(s, "bandpass", 300 + Math.random() * 900, 150 + Math.random() * 300, 0.06, 0.6, 0.005, 6, 0.08 + Math.random() * 0.5);
}
// A pitch sliding with a fast wobble, rate times a second by depth Hz: a spring, a squeaky toy.
function wobbly({ ctx, t, out }, type, from, to, end, peak, rate, depth) {
  const osc = ctx.createOscillator(), wobble = ctx.createOscillator(), amount = ctx.createGain(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + end);
  wobble.frequency.value = rate;
  amount.gain.value = depth;
  wobble.connect(amount).connect(osc.frequency);
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + end);
  osc.connect(gain).connect(out);
  for (const o of [osc, wobble]) {
    o.start(t);
    o.stop(t + end);
  }
}
// A footstep, a cartoon's: the squeak of a clown's shoe, higher on the left foot; now and then, a plop.
function step(at, left) {
  const s = sound(at);
  if (!s) return;
  if (Math.random() < 0.15) tone(s, "sine", 1200, 250, 0.07, 0.2);
  else {
    const pitch = (left ? 600 : 480) * (0.9 + Math.random() * 0.2);
    wobbly(s, "triangle", pitch, pitch * 1.5, 0.12, 0.1, 35, 60);
  }
}
// A hop on one leg: the foot lands, and a spring goes boiiing.
function boing(at) {
  const s = sound(at);
  if (!s) return;
  tone(s, "sine", 140, 50, 0.1, 0.3);
  wobbly(s, "sine", 100 + Math.random() * 40, 420, 0.4, 0.22, 22, 45);
}
// On two legs or more, a step every STRIDE m walked on a floor; on one, a boing each time it lands.
const STRIDE = 1.4;
function steps(e) {
  const p = e.body.pos, pl = platformUnder(p);
  const floor = !!pl && Math.abs(p.y - pl.y) < 0.05;
  if (e.legs === 1 && floor && !e.onFloor) boing(p);
  if (e.legs > 1 && floor && e.lastStep) {
    e.walked = (e.walked ?? 0) + Math.hypot(p.x - e.lastStep.x, p.z - e.lastStep.z);
    if (e.walked > STRIDE) {
      e.walked = 0;
      step(p, (e.leftFoot = !e.leftFoot));
    }
  }
  e.onFloor = floor;
  e.lastStep = { x: p.x, z: p.z };
}

// T: a taunt, a hop and a sway with the head spinning (pose), and a nya-nya-nya. One at a time.
const TAUNT_TIME = 2;
function taunt(e) {
  if (!e.alive || now < (e.tauntUntil ?? 0)) return;
  e.tauntUntil = now + TAUNT_TIME;
  nyaNya(e.body.pos);
}
function nyaNya(at) {
  const s = sound(at);
  if (!s) return;
  [784, 659, 880, 784, 659].forEach((f, i) => tone(s, "square", f, f * 0.97, 0.16, 0.07, i * 0.18));
}

// The crowd booing the leader pelts it with tomatoes from the stands: they burst on it, red; on me, on my screen too.
const TOMATOES = 12;
const TOMATO_FLIGHT = 1.4; // s, about
const tomatoGeo = new THREE.SphereGeometry(0.22, 8, 6);
const tomatoMat = flat(0xe53935);
const tomatoes = [];
function pelt(e) {
  const to = chest(e.body);
  for (let i = 0; i < TOMATOES; i++) {
    const f = fans[Math.floor(Math.random() * fans.length)], t = TOMATO_FLIGHT * (0.8 + Math.random() * 0.4);
    const mesh = new THREE.Mesh(tomatoGeo, tomatoMat);
    mesh.position.set(f.x, f.y + 1.5, f.z);
    scene.add(mesh);
    const miss = () => (Math.random() - 0.5) * 2;
    tomatoes.push({ mesh, left: t, vel: new THREE.Vector3((to.x + miss() - f.x) / t, (to.y - f.y - 1.5) / t + (GRAVITY * t) / 2, (to.z + miss() - f.z) / t) });
  }
  if (e !== me) return;
  setTimeout(() => {
    $("tomato").hidden = false;
    setTimeout(() => ($("tomato").hidden = true), 2500);
  }, TOMATO_FLIGHT * 1000);
}
function updateTomatoes(dt) {
  for (const t of [...tomatoes]) {
    t.vel.y -= GRAVITY * dt;
    t.mesh.position.addScaledVector(t.vel, dt);
    if ((t.left -= dt) > 0) continue;
    bleed(t.mesh.position, 12, UP, 3, 4); // the juice
    const s = sound(t.mesh.position);
    if (s) noise(s, "lowpass", 900, 150, 0.15, 0.4, 0.005);
    scene.remove(t.mesh);
    tomatoes.splice(tomatoes.indexOf(t), 1);
  }
}

// An exploit across the screen for 2 s: the player's card, their alias, the shout.
function splash(who, shout) {
  const card = document.createElement("div");
  card.className = "splash";
  card.style.setProperty("--color", who ? css(who.color) : "#ff6d00"); // nobody's: the arena's, lava orange
  if (who) {
    const portrait = new Image();
    portrait.src = who.portrait;
    portrait.alt = "";
    const alias = document.createElement("b");
    alias.textContent = who.alias;
    card.append(portrait, alias);
  }
  const cry = document.createElement("div");
  cry.textContent = shout;
  card.append(cry);
  document.querySelector(".splash:not(.mine)")?.remove();
  document.body.append(card);
  setTimeout(() => card.remove(), 2000);
}

// What happens to me, on a card of its own, lower, with what it does: the game understood without the sound.
const LEG_HELP = ["Plus de jambes : tu rampes, sans sauter", "À cloche-pied : tu avances par petits bonds, moins vite"];
function say(title, help) {
  // Stacked, three at most: the first free slot, else the oldest card's.
  const shown = [...document.querySelectorAll(".splash.mine")], used = shown.map((c) => +c.dataset.slot);
  let slot = [0, 1, 2].find((s) => !used.includes(s));
  if (slot === undefined) {
    slot = used[0];
    shown[0].remove();
  }
  const card = Object.assign(document.createElement("div"), { className: "splash mine" });
  card.dataset.slot = slot;
  card.style.bottom = `calc(18% + ${slot * 110}px)`;
  card.style.setProperty("--color", css(me.color));
  card.append(Object.assign(document.createElement("div"), { textContent: title }), Object.assign(document.createElement("span"), { textContent: help }));
  document.body.append(card);
  setTimeout(() => card.remove(), 3000);
}
let mine = null; // what I had at the last frame
let hunter = null; // a guest's: whose homing disc is after me, as the host says
function watchMe() {
  const state = { alive: me.alive, legs: me.legs, powers: Object.keys(POWERS).filter((p) => has(me, p)),
    left: Object.fromEntries(Object.entries(me.until).map(([p, t]) => [p, t - now])), hunter: joining ? hunter : discs.find((d) => d.prey === me)?.owner ?? null };
  if (mine?.alive && me.alive) {
    for (const p of state.powers.filter((p) => !mine.powers.includes(p))) say(`${POWERS[p].icon} ${POWERS[p].label}`, state.left[p] > 60 ? "Manche Mastodonte : jusqu'à la fin du match" : POWERS[p].help);
    if (me.legs < mine.legs) say("🦵 Une jambe en moins", LEG_HELP[me.legs]);
    // A power gone: its time up, or before it, the shield taken by a disc, the potato passed on; else a spawn wiped it.
    for (const p of mine.powers.filter((p) => !state.powers.includes(p))) {
      if (mine.left[p] < 0.5) say(`${POWERS[p].icon} Fini !`, POWERS[p].over);
      else if (p === "shield") say("🛡️ Bouclier usé", "Il t'a sauvé d'un disque");
      else if (p === "potato") say("💣 Patate refilée", "Ouf ! À l'autre de s'en débarrasser");
    }
    if (state.hunter && !mine.hunter) say("🎯 Pris en cible", `Un disque têtu de ${state.hunter.alias} te suit : mets un mur entre vous !`);
  }
  mine = state;
}

// The radar: the arena seen from above, turning with the player so that ahead is up. The floors by
// the colour of their rim, the players in their colours, smaller on a floor below, ringed on one above.
const radar = $("radar").getContext("2d");
const RADAR = 300; // half the canvas, which is twice its size on the page for sharp screens
const RADAR_RANGE = 75; // m from the player to the rim: two thirds of the arena, the rest out of sight
const RADAR_SCALE = (RADAR - 10) / RADAR_RANGE; // pixels a unit
function drawRadar() {
  const f = forward(me.yaw), at = me.body?.pos ?? { x: 0, y: 0, z: 0 };
  // Where a point shows: across the player's right, and along their forward, up.
  const spot = (p) => [RADAR + ((p.x - at.x) * -f.z + (p.z - at.z) * f.x) * RADAR_SCALE, RADAR - ((p.x - at.x) * f.x + (p.z - at.z) * f.z) * RADAR_SCALE];
  radar.clearRect(0, 0, 2 * RADAR, 2 * RADAR);
  radar.save();
  radar.beginPath();
  radar.arc(RADAR, RADAR, RADAR, 0, 2 * Math.PI);
  radar.clip();
  for (const pl of PLATFORMS) {
    if (pl.gone) continue;
    radar.fillStyle = "#3a3f4b";
    radar.strokeStyle = pl === shaky && Math.sin(now * 20) > 0 ? "#ff1744" : css(FLOOR_COLORS[Math.round(pl.y / LEVEL)]);
    radar.lineWidth = 5;
    radar.beginPath();
    radar.arc(...spot(pl), pl.r * RADAR_SCALE, 0, 2 * Math.PI);
    radar.fill();
    radar.stroke();
  }
  radar.strokeStyle = "#15171d"; // the tunnels, dark: who is in one is off the radar
  radar.lineWidth = TUNNEL_WIDTH * RADAR_SCALE;
  for (const t of TUNNELS) {
    radar.beginPath();
    radar.moveTo(...spot({ x: t.x - t.ax * t.half, z: t.z - t.az * t.half }));
    radar.lineTo(...spot({ x: t.x + t.ax * t.half, z: t.z + t.az * t.half }));
    radar.stroke();
  }
  radar.textAlign = "center";
  radar.textBaseline = "middle";
  if (boostAt) {
    radar.fillStyle = "#ffd700";
    radar.font = "bold 40px system-ui";
    radar.fillText("★", ...spot(boostAt));
  }
  radar.fillStyle = "#d500f9";
  radar.font = "bold 30px system-ui";
  for (const m of maluses) if (now >= m.backAt && !m.pl.gone) radar.fillText(POWERS.fat.icon, ...spot(m));
  radar.font = "34px system-ui";
  for (const [power, ...at] of shownItems) radar.fillText(POWERS[power].icon, ...spot({ x: at[0], z: at[2] }));
  const top = leader();
  for (const e of entities) {
    if (e.empty || !e.alive || !e.body || e === me || tunnelAt(e.body.pos)) continue;
    const floor = Math.round((e.body.pos.y - at.y) / LEVEL); // above, below, or level with the player
    const [x, y] = spot(e.body.pos);
    radar.fillStyle = css(e.color);
    radar.beginPath();
    radar.arc(x, y, floor < 0 ? 10 : 16, 0, 2 * Math.PI);
    radar.fill();
    radar.lineWidth = 5;
    radar.strokeStyle = e === top ? "#ffd700" : floor > 0 ? "#fff" : "#000";
    radar.stroke();
    if (inMatch && e.score >= MATCH_POINT) { // match point: a red ring that beats
      radar.strokeStyle = "#ff1744";
      radar.beginPath();
      radar.arc(x, y, 24 + 5 * Math.sin(now * 8), 0, 2 * Math.PI);
      radar.stroke();
    }
    // The alias above the dot, outlined to read over the platforms.
    radar.font = "bold 26px system-ui";
    radar.textBaseline = "bottom";
    radar.lineWidth = 6;
    radar.strokeStyle = "#000";
    radar.strokeText(e.alias, x, y - 18);
    radar.fillText(e.alias, x, y - 18);
  }
  radar.restore();
  // The player, in the middle, pointing up.
  radar.fillStyle = css(me.color);
  radar.strokeStyle = "#fff";
  radar.lineWidth = 4;
  radar.beginPath();
  radar.moveTo(RADAR, RADAR - 26);
  radar.lineTo(RADAR + 17, RADAR + 20);
  radar.lineTo(RADAR, RADAR + 11);
  radar.lineTo(RADAR - 17, RADAR + 20);
  radar.closePath();
  radar.fill();
  radar.stroke();
}

// A line in the top-left corner; an event names its players, {K} and {V}, in their colours.
function feed(text, players = {}, shout = "") {
  const line = document.createElement("div");
  for (const bit of text.split(/(\{[KV]\})/)) {
    const who = players[bit];
    if (!who) {
      line.append(untoned(bit));
      continue;
    }
    const name = document.createElement("b");
    name.textContent = who.alias;
    name.style.color = css(who.color);
    line.append(name);
  }
  if (shout) {
    const loud = document.createElement("span");
    loud.className = "shout";
    loud.textContent = ` ${shout}`;
    line.append(loud);
  }
  if (Object.keys(players).length) line.className = "event";
  if (shout) { // read aloud, the crowd up: only what is worth it; without players, the cry only
    cheerUntil = now + 2.5;
    announce(Object.keys(players).length ? text : "", shout, players);
  }
  $("feed").append(line);
  while ($("feed").children.length > 4) $("feed").firstChild.remove();
  setTimeout(() => line.remove(), 6000);
}
// The player ahead of all the others, if any: the one to bring down first.
function leader() {
  const [first, second] = entities.filter((o) => !o.empty).sort((a, b) => b.score - a.score);
  return first && first.score > (second?.score ?? 0) ? first : null;
}

function renderScores() {
  const top = leader();
  for (const e of entities) e.crown.visible = e === top;
  if (inMatch && top && top !== lastTop && (top === me || lastTop === me)) {
    const cry = top === me ? "Tu as pris la tête !" : "Tu as perdu la tête !";
    setTimeout(() => { // after the card of the kill
      splash(me, cry);
      announce("", cry);
    }, 2000);
  }
  if (top) lastTop = top;
  $("scores").innerHTML = "";
  const title = document.createElement("div");
  title.textContent = inMatch ? `Premier à ${WIN_SCORE} 📀`
    : joining ? "Échauffement : l'hôte va lancer le match" : "Échauffement : Échap, puis « Au combat ! »";
  $("scores").append(title);
  // A card a player, the leader on top: its portrait, its alias over a gauge filling up to WIN_SCORE, its score small.
  for (const e of entities.filter((o) => !o.empty).sort((a, b) => b.score - a.score)) {
    const card = document.createElement("div");
    card.className = e === me ? "score me" : "score";
    const portrait = document.createElement("b"); // the head only, zoomed in from the full-length portrait
    portrait.style.backgroundImage = `url(${e.portrait})`;
    const name = document.createElement("span");
    name.textContent = `${e === top ? "👑 " : ""}${inMatch && e.score >= MATCH_POINT ? "🔥 " : ""}${e.alias}`;
    name.style.color = css(e.color);
    const gauge = document.createElement("i"), full = (100 * Math.max(0, Math.min(e.score, WIN_SCORE))) / WIN_SCORE;
    gauge.style.background = `linear-gradient(to right, ${css(e.color)} ${full}%, #ffffff26 ${full}%)`;
    name.append(gauge);
    const score = document.createElement("small");
    score.textContent = `${e.score} 📀${e.wins ? ` 🏆${e.wins}` : ""}`; // 🏆: the matches won in this room
    card.append(portrait, name, score);
    $("scores").append(card);
  }
  renderLobby(top);
}

// The table of the players on the start screen, and the field to rename oneself.
// The shop at a glance: what my gold discs buy now, the rest dimmed.
let shopKey = "";
function showShop() {
  const key = inMatch ? SHOP.map((item) => refusal(me, item)).join() : "";
  if (key === shopKey) return;
  shopKey = key;
  $("shop").replaceChildren(...(inMatch ? SHOP.map((item, i) => Object.assign(document.createElement("div"), {
    textContent: `${i + 1} ${item.icon} ${item.name} · ${item.price} 📀`, className: refusal(me, item) ? "off" : "" })) : []));
}
function renderLobby(top) {
  $("lobby-title").textContent = inMatch ? "Match à mort" : "Échauffement";
  $("players").replaceChildren(...entities.filter((o) => !o.empty).map((o) => {
    const card = document.createElement("div");
    card.className = o === me ? "card me" : "card";
    const portrait = new Image();
    portrait.src = o.portrait;
    portrait.alt = "";
    const alias = document.createElement("b");
    alias.textContent = `${o === top ? "👑 " : ""}${o.alias}${o === me ? " (toi)" : ""}`;
    alias.style.color = css(o.color);
    const name = document.createElement("div");
    name.className = "pseudo";
    name.textContent = o.name;
    const info = document.createElement("div");
    info.textContent = [o === entities[0] ? "hôte" : o.bot ? "bot" : "", `${o.score} frags`, o.wins && `🏆 ${o.wins} victoire${o.wins > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
    card.append(portrait, alias, name, info);
    return card;
  }));
  if (document.activeElement !== $("pseudo")) $("pseudo").value = me.name;
  $("launch").hidden = !!joining || inMatch;
}

// The network. The host runs the game and sends its state 30 times a second. A guest moves its own
// player, sends where it is and how many discs it threw, and shows the rest as the host says.
const SEND_EVERY = 1 / 30;
const GUEST_TIMEOUT = 5000; // ms without news before a guest's slot is freed
let sendIn = 0;
let host = null; // a guest's connection to the host

function hostState() {
  return {
    ents: entities.map((e) => e.empty ? null : {
      name: e.name, alias: e.alias, bot: e.bot, x: e.body.pos.x, y: e.body.pos.y, z: e.body.pos.z, yaw: e.yaw,
      alive: e.alive, life: e.life, legs: e.legs, necks: e.necks, discs: e.discs, back: +Math.min(discBack(e), 99).toFixed(1), score: e.score, wins: e.wins, boo: e.boo, // back finite: Infinity does not travel
      taunt: Math.max(0, (e.tauntUntil ?? 0) - now),
      until: Object.fromEntries(Object.entries(e.until).filter(([, t]) => t > now).map(([p, t]) => [p, t - now])),
      knocks: e.knocks, kx: e.knockDir.x, kz: e.knockDir.z,
      how: e.how, shout: e.shout, killer: entities.indexOf(e.killer), dx: e.dir?.x ?? 0, dz: e.dir?.z ?? 0,
    }),
    discs: discs.map((d) => [d.pos.x, d.pos.y, d.pos.z, d.decap ? 1 : 0, entities.indexOf(d.owner), d.size, d.id, entities.indexOf(d.prey)]),
    boost: PLATFORMS.indexOf(boostAt),
    maluses: maluses.map((m) => now >= m.backAt),
    items: shownItems,
    shaky: PLATFORMS.indexOf(shaky),
    gone: !!shaky?.gone,
    news,
    winner: entities.indexOf(winner),
    summary: winner && report,
    match: inMatch,
    clock: now, // the ferries' time
    size: arenaSize,
    lava: lavaY,
    lavaIn,
    rain: raining,
    shopIn: Math.max(0, shopAt - now),
  };
}

function guestJoins(conn) {
  const e = entities.find((o) => o.empty);
  if (!e) return conn.close(); // full
  Object.assign(e, { empty: false, conn, ...pickPseudo(), score: 0, streak: 0, heads: 0, wins: 0, ...NO_STATS, throws: 0, decaps: 0, taunts: 0, buys: 0 });
  e.seenAt = performance.now();
  spawn(e);
  feed(`${e.name} a rejoint la partie`);
}

function guestLeaves(conn) {
  const e = entities.find((o) => o.conn === conn);
  if (!e) return;
  feed(`${e.name} est parti`);
  vacate(e);
  conn.close();
}

function guestSays(conn, msg) {
  const e = entities.find((o) => o.conn === conn);
  if (!e) return;
  e.seenAt = performance.now();
  e.yaw = msg.yaw;
  e.pitch = msg.pitch;
  const name = cleanName(msg.name);
  if (name && name !== e.name) {
    e.name = e.alias = name;
    renderScores();
  }
  // A guest still on its last life has not seen the respawn yet: where it says it is no longer holds.
  if (e.alive && msg.life === e.life) Object.assign(e.body.pos, { x: msg.x, y: msg.y, z: msg.z });
  for (; e.throws < msg.throws; e.throws++) throwDisc(e, false);
  for (; e.decaps < msg.decaps; e.decaps++) throwDisc(e, true);
  for (; e.taunts < msg.taunts; e.taunts++) taunt(e);
  if (msg.buys > e.buys) {
    e.buys = msg.buys;
    buy(e, msg.item);
  }
}

let scoresKey = "";
function guestHears(s) {
  if (me !== entities[s.you]) {
    me.group.visible = true;
    me = entities[s.you];
    me.group.visible = false;
  }
  s.ents.forEach((n, i) => {
    const e = entities[i];
    if (!n) {
      if (!e.empty) vacate(e);
      return;
    }
    if (n.taunt > 0 && !(e.tauntUntil > now)) nyaNya(e.body?.pos ?? n);
    Object.assign(e, { empty: false, name: n.name, alias: n.alias, bot: n.bot, score: n.score, wins: n.wins, discs: n.discs, back: n.back, necks: n.necks,
      tauntUntil: now + n.taunt,
      until: Object.fromEntries(Object.entries(n.until).map(([p, t]) => [p, now + t])) });
    if (n.life !== e.life) {
      Object.assign(e, { life: n.life, alive: true, body: newBody(n), yaw: n.yaw, pitch: 0, knocks: n.knocks, legs: n.legs });
      resetAvatar(e);
    }
    if (e !== me) {
      e.net = n;
      e.yaw = n.yaw;
    }
    if (n.knocks !== e.knocks) {
      e.knocks = n.knocks;
      bleed(chest(e.body), 15, UP, 2, 4);
      if (e === me) knock(me.body, { x: n.kx, z: n.kz });
    }
    if (n.legs < e.legs) loseLeg(e, n.legs);
    if (!n.alive && e.alive) {
      e.alive = false;
      showDeath(e, entities[n.killer] ?? null, n.how, { x: n.dx, z: n.dz }, n.shout, n.boo);
    }
  });
  setSize(s.size);
  if (s.match !== inMatch) setMatch(s.match);
  ferryClock = s.clock;
  lavaY = s.lava;
  lavaIn = s.lavaIn;
  raining = s.rain;
  shopAt = now + s.shopIn;
  const won = entities[s.winner];
  if ((won ?? null) !== champion) showWinner(won ?? null, s.summary);
  const key = s.ents.map((n) => n && n.name + n.alias + n.score + n.wins).join();
  if (key !== scoresKey) {
    scoresKey = key;
    renderScores();
  }
  showDiscs(s.discs);
  hunter = entities[s.discs.find((d) => d[7] === entities.indexOf(me))?.[4]] ?? null;
  boostAt = PLATFORMS[s.boost] ?? null;
  maluses.forEach((m, i) => (m.backAt = s.maluses[i] ? 0 : Infinity));
  shownItems = s.items;
  if (shaky) shaky.gone = false;
  shaky = PLATFORMS[s.shaky] ?? null;
  if (shaky) shaky.gone = s.gone;
  for (const n of s.news) if (heard !== null && n.id > heard) showNews(n);
  heard = s.news.at(-1)?.id ?? heard ?? 0; // at the first state, what happened before is not news
}
let heard = null; // the last news shown

// A guest's discs are only meshes where the host says they are.
const netDiscs = [];
function showDiscs(list) {
  while (netDiscs.length < list.length) {
    const mesh = new THREE.Mesh(discGeo, glow(0xffffff, 0.8));
    scene.add(mesh);
    netDiscs.push(mesh);
  }
  netDiscs.forEach((mesh, i) => {
    const d = list[i];
    mesh.visible = !!d;
    if (!d) return;
    if (d[6] > thrown) whoosh({ x: d[0], y: d[1], z: d[2] }, d[3]);
    const color = d[3] ? 0xff1744 : entities[d[4]].color;
    mesh.position.set(d[0], d[1], d[2]);
    mesh.scale.setScalar(d[5]);
    mesh.geometry = d[3] ? bladeGeo : discGeo;
    mesh.material.color.setHex(color);
    mesh.material.emissive.setHex(color);
  });
  thrown = Math.max(thrown, ...list.map((d) => d?.[6] ?? 0));
}

function hostFrame(dt) {
  if (winner) return sendState(dt); // the match is over: all stand still until the host closes the summary
  moveFerries(now);
  for (const e of entities) {
    if (e.empty) continue;
    e.discs = Math.min(e.discs, maxDiscs(e)); // a booster over: back to MAX_DISCS
    if (e.alive) {
      if (!e.conn) {
        const { wish, jump } = held() ? { wish: STILL, jump: false } : e.bot ? think(e) : playerInput();
        stepBody(e.body, wish, jump, dt);
      }
      if (e.body.pos.y < lavaY) {
        const pusher = e.lastHitBy && now - e.lastHitAt < BLAME_WINDOW ? e.lastHitBy : null;
        const under = shaky?.gone && Math.hypot(e.body.pos.x - shaky.x, e.body.pos.z - shaky.z) < shaky.r; // fell with its platform
        const how = pusher ? "fall" : lavaY > FALL_DEATH_Y ? "lava" : under ? "vanish" : "fall"; // only the last one is a suicide
        kill(e, pusher, how, null, { rebounds: pusher ? e.lastTricks : 0 });
      } else if (e.until.potato && now >= e.until.potato) { // the hot potato goes off in the hands of whoever holds it
        delete e.until.potato;
        const giver = e.potatoFrom?.empty ? null : e.potatoFrom;
        kill(e, giver, giver ? "decap" : "boom", { x: 0, z: 0 }, { boom: true });
      }
    } else {
      stepBody(e.body, STILL, false, dt);
      updateCorpse(e, dt);
      if (now > e.respawnAt) spawn(e);
    }
    pose(e);
    if (e.alive) steps(e);
  }
  updateDiscs(dt);
  updateArena();
  for (const e of entities) if (e.conn && performance.now() - e.seenAt > GUEST_TIMEOUT) guestLeaves(e.conn);
  sendState(dt);
}

function sendState(dt) {
  sendIn -= dt;
  if (sendIn > 0) return;
  sendIn = SEND_EVERY;
  const state = hostState();
  for (const e of entities) if (e.conn?.open) e.conn.send({ ...state, you: entities.indexOf(e) });
}

// The avatar where the body is, and the body told of its powers and its legs.
// Legless, it lies on its belly; short of legs, it leans, the more the fewer, and wobbles.
const LEANS = [0, 0.25, 0];
function pose(e) {
  const scale = has(e, "fat") ? SCALE * FAT : SCALE;
  e.group.position.set(e.body.pos.x, e.body.pos.y - (e.legs ? 0 : (LEGS_TOP * scale) / SCALE), e.body.pos.z);
  e.group.rotation.y = e.yaw;
  if (e.alive) e.group.rotation.z = LEANS[e.legs] * (1 + 0.4 * Math.sin(now * 12));
  e.group.scale.setScalar(scale);
  const extra = ((e.necks ?? 0) * NECK_GROWTH) / SCALE; // in the model's units
  e.neck.scale.y = 1 + extra / (NECK_TOP - NECK_BASE);
  e.neck.position.y = (NECK_BASE + NECK_TOP + extra) / 2;
  const attached = e.head.parent === e.group;
  if (attached) e.head.position.y = HEAD_Y + extra;
  const taunting = e.alive ? (e.tauntUntil ?? 0) - now : 0; // a hop, a sway, the head spinning
  if (taunting > 0) {
    e.group.position.y += Math.abs(Math.sin(taunting * 9)) * 0.6;
    e.group.rotation.z = Math.sin(taunting * 12) * 0.4;
  }
  if (attached) e.head.rotation.y = Math.max(0, taunting) * 18;
  e.body.slippery = has(e, "ice") || onBlood(e.body) || raining;
  e.body.legs = e.legs;
  e.body.neck = (e.necks ?? 0) * NECK_GROWTH;
}

let ferryClock = 0; // the host's time, for the ferries
function guestFrame(dt) {
  const smooth = 1 - Math.exp(-15 * dt); // eases the others between two states of the host
  moveFerries((ferryClock += dt));
  for (const e of entities) {
    if (e.empty || !e.body) continue;
    if (e === me) {
      const { wish, jump } = e.alive && !champion && !held() ? playerInput() : { wish: STILL, jump: false };
      stepBody(e.body, wish, jump, dt);
    } else if (e.net) {
      e.body.pos.x += (e.net.x - e.body.pos.x) * smooth;
      e.body.pos.y += (e.net.y - e.body.pos.y) * smooth;
      e.body.pos.z += (e.net.z - e.body.pos.z) * smooth;
    }
    if (!e.alive) updateCorpse(e, dt);
    pose(e);
    if (e.alive) steps(e);
  }
  netDiscs.forEach((mesh) => (mesh.rotation.y += 25 * dt));
  if (!host?.open || !me.body) return;
  const p = me.body.pos;
  host.send({ life: me.life, x: p.x, y: p.y, z: p.z, yaw: me.yaw, pitch: viewPitch(), throws: myThrows, decaps: myDecaps, name: myName,
    taunts: myTaunts, buys: myBuys, item: myItem });
}

if (joining) {
  banner(`Connexion à la room ${joining}…`);
  joinRoom(joining, {
    onOpen: (conn) => {
      host = conn;
      banner("");
    },
    onData: guestHears,
    onClose: () => banner("L'hôte a quitté la partie"),
    onError: (err) => banner(`Connexion impossible : ${err.type ?? err}`),
  });
} else {
  const code = newRoomCode();
  hostRoom(code, {
    onOpen: () => {
      const url = `${location.origin}${location.pathname}?room=${code}`;
      const hint = location.hostname === "localhost" ? " (remplace localhost par l'adresse IP de ce Mac)" : "";
      $("room").textContent = `Room ${code} — à partager : ${url}${hint}`;
    },
    onJoin: guestJoins,
    onData: guestSays,
    onLeave: guestLeaves,
    onError: (err) => feed(`Multijoueur indisponible : ${err.type ?? err}`),
  });
}

// The killcam: the last seconds kept frame by frame, to show a dead player their death through their
// killer's eyes, from replay.lead s before it to REPLAY_AFTER s after. Over the live scene, put back after.
const REPLAY_AFTER = 0.5;
// The action of the match: the kill with the most exploits, kept from HIGHLIGHT_BEFORE s before it to HIGHLIGHT_AFTER s
// after, played over and over, slowed, behind the summary, the camera turning around the victim.
const HIGHLIGHT_BEFORE = 2.5;
const HIGHLIGHT_AFTER = 1;
let best = null; // { at, rating, victim, frames }
const tape = [];
const tapeDiscs = [];
const liveDiscs = () => (joining ? netDiscs : discs.map((d) => d.mesh));
function record() {
  tape.push({
    at: now,
    ents: entities.map((e) => ({
      pos: e.group.position.clone(), quat: e.group.quaternion.clone(), scale: e.group.scale.x, visible: e.group.visible, yaw: e.yaw,
      head: e.head.parent === e.group ? null : e.head.position.clone(),
    })),
    discs: liveDiscs().filter((m) => m.visible).map((m) => [m.position.clone(), m.scale.x, m.material.color.getHex(), m.geometry]),
  });
  while (tape[0].at < now - 4) tape.shift();
  if (best && !best.frames && now > best.at + HIGHLIGHT_AFTER) best.frames = tape.filter((f) => f.at >= best.at - HIGHLIGHT_BEFORE);
}

// A frame of the tape over the live scene, hidden: the one not shown, aimCamera: where to see it from.
function playBack(frame, hidden, aimCamera) {
  const saved = [];
  const pose = (obj) => saved.push([obj, obj.position.clone(), obj.quaternion.clone(), obj.scale.clone(), obj.visible]);
  entities.forEach((e, i) => {
    const f = frame.ents[i];
    pose(e.group);
    e.group.position.copy(f.pos);
    e.group.quaternion.copy(f.quat);
    e.group.scale.setScalar(f.scale);
    e.group.visible = (f.visible || e === me) && e !== hidden && !e.empty;
    if (e.head.parent === e.group) return;
    pose(e.head); // off its body now: where it was then, maybe still on the neck
    if (f.head) e.head.position.copy(f.head);
    else {
      e.group.updateMatrixWorld();
      e.group.localToWorld(e.head.position.set(0, HEAD_Y, 0));
      e.head.quaternion.identity();
    }
  });
  for (const m of [...liveDiscs(), ...entities.flatMap((e) => [e.bomb]).filter(Boolean)]) { // live, not on the tape
    pose(m);
    m.visible = false;
  }
  while (tapeDiscs.length < frame.discs.length) {
    const m = new THREE.Mesh(discGeo, glow(0xffffff, 0.8));
    scene.add(m);
    tapeDiscs.push(m);
  }
  tapeDiscs.forEach((m, i) => {
    const d = frame.discs[i];
    m.visible = !!d;
    if (!d) return;
    m.position.copy(d[0]);
    m.scale.setScalar(d[1]);
    m.material.color.setHex(d[2]);
    m.material.emissive.setHex(d[2]);
    m.geometry = d[3];
  });
  aimCamera(frame);
  renderer.render(scene, camera);
  for (const [obj, p, q, sc, v] of saved) {
    obj.position.copy(p);
    obj.quaternion.copy(q);
    obj.scale.copy(sc);
    obj.visible = v;
  }
  for (const m of tapeDiscs) m.visible = false;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const frame = Math.min(clock.getDelta(), 0.05);
  const dt = performance.now() < slowUntil ? frame * SLOW_MOTION : frame;
  now += dt;
  if (joining) guestFrame(dt);
  else hostFrame(dt);
  updateParts(dt);
  updateTomatoes(dt);
  updateBlood(dt);
  updateFans();
  showArena(dt);
  showRain(dt);
  chatter();
  drawRadar();
  showShop();
  $("dots").textContent = "●".repeat(me.discs ?? 0) + "○".repeat(Math.max(0, maxDiscs(me) - (me.discs ?? maxDiscs(me))));
  const back = joining ? me.back : discBack(me);
  $("reload").textContent = me.alive && me.discs < maxDiscs(me) && back < 99 ? `${back.toFixed(1).replace(".", ",")} s` : "";
  $("powers").textContent = !me.alive ? "" : Object.entries(me.until).filter(([, until]) => until > now)
    .map(([p, until]) => `${POWERS[p].icon} ${POWERS[p].label}${until - now > 60 ? "" : ` ${Math.ceil(until - now)} s`}`).join(" · ");
  record();
  if (replay && now > replay.from + REPLAY_AFTER) replay = null;
  $("replay").hidden = !replay;
  $("tags").hidden = true; // live only, not over the replays
  $("highlight").hidden = !(champion && best?.frames);
  if (replay) {
    return playBack(tape.find((f) => f.at >= now - replay.lead) ?? tape.at(-1), replay.killer, (frame) => {
      const k = frame.ents[entities.indexOf(replay.killer)];
      camera.position.set(k.pos.x, k.pos.y + (EYE * k.scale) / SCALE, k.pos.z);
      camera.rotation.set(-0.15, k.yaw, 0);
    });
  }
  if (champion && best?.frames && !$("summary").hidden) {
    // A still: the action of the match a split second after the death, the head or the body on its way.
    return playBack(best.frames.find((f) => f.at >= best.at + 0.3) ?? best.frames.at(-1), null, (frame) => {
      const v = frame.ents[entities.indexOf(best.victim)].pos, a = 0.6;
      camera.position.set(v.x + Math.sin(a) * 9, v.y + 5, v.z + Math.cos(a) * 9);
      camera.lookAt(v.x, v.y + 2, v.z);
    });
  }
  if (me.body) updateCamera(dt);
  watchMe();
  showTags();
  renderer.render(scene, camera);
});
