import * as THREE from "three";
import {
  ARENA_RADIUS, BOOST_TIME, CHEST, DISC_RADIUS, DISC_SPEED, FAT, FAT_TIME, GIANT, FALL_DEATH_Y, GRAVITY, LEVEL, MAX_DISCS, PADS, PAD_RADIUS, PLATFORMS,
  WALLS, WALL_HEIGHT, WALL_THICKNESS,
  LEGS_TOP, chest, hitZone, thickness, knock, newBody, newDisc, platformUnder, steer, stepBody, stepDisc,
} from "./rules.js";
import { hostRoom, joinRoom, newRoomCode } from "./net.js";
import { crySlug, DECAP_LINES, FALL_LINES, PSEUDOS, PUSH_LINES, STREAK_SHOUTS } from "./pseudos.js";

const NAMES = ["Joueur 1", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];
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
const COUNTDOWN = 4; // s from « Au combat ! » to the first frag that counts
const MATCH_POINT = WIN_SCORE - 2; // from it, the announcer, the crowd and the radar make much of the player
const RAPID_MAX = 8; // discs in the air at once, in a burst
const MATCH_PAUSE = 6; // seconds the winner stays on screen before the lobby
const RESPAWN_DELAY = 2.5;
const DECAP_RESPAWN_DELAY = 5; // long enough to watch the geyser
const BLAME_WINDOW = 6; // seconds a push still counts as the kill of whoever threw it
const GEYSER_TIME = 4.5;
const SLOW_MOTION = 0.25;
const MAX_DROPS = 6000;
const MAX_STAINS = 2500;
const EYE = 3.2;
const SCALE = 1.3; // the avatars are modelled 1.3 times too small; the hit zones in rules.js match the scaled size
// The bots, made beatable: slow to throw, inaccurate, half-hearted at leading a moving target.
const BOT_AIM_ERROR = 0.5;
const BOT_LEAD = 0.5;
const BOT_JUMP_SHOTS = 0.15;
const BOT_DECAPS = 0.12;
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
scene.fog = new THREE.Fog(0x07060f, 50, 120);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = "YXZ";
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0x8899ff, 0x330011, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 20, 8);
scene.add(sun);

const FLOOR_COLORS = [0x00e5ff, 0xffc400, 0xff6d00]; // the rim of each floor's platforms, here and on the radar
// The arena: platforms over the void, their pads, the wall the discs bounce on.
const glow = (color, intensity = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
const platformParts = PLATFORMS.map(() => []); // what vanishes with each platform: itself, its pads, its walls
for (const pl of PLATFORMS) {
  const thick = thickness(pl);
  const block = new THREE.Mesh(new THREE.CylinderGeometry(pl.r, pl.r * 0.6, thick, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f4b }));
  block.position.set(pl.x, pl.y - thick / 2, pl.z);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(pl.r, 0.06, 8, 64), glow(FLOOR_COLORS[Math.round(pl.y / LEVEL)]));
  edge.rotation.x = Math.PI / 2;
  edge.position.set(pl.x, pl.y + 0.01, pl.z);
  scene.add(block, edge);
  platformParts[PLATFORMS.indexOf(pl)].push(block, edge);
}
const pads = PADS.map((p) => {
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.08, 32), glow(0x76ff03));
  pad.position.set(p.x, p.y + 0.04, p.z);
  scene.add(pad);
  platformParts[PLATFORMS.indexOf(platformUnder(p))].push(pad);
  return pad;
});
// The cover, chest high, with a glowing top to see it from afar.
for (const w of WALLS) {
  const cover = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(w.half * 2, WALL_HEIGHT, WALL_THICKNESS), new THREE.MeshStandardMaterial({ color: 0x8a93a8 }));
  block.position.y = WALL_HEIGHT / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w.half * 2, 0.06, WALL_THICKNESS + 0.04), glow(0xff4081));
  top.position.y = WALL_HEIGHT;
  cover.add(block, top);
  cover.position.set(w.x, w.y, w.z);
  cover.rotation.y = Math.atan2(-w.az, w.ax);
  scene.add(cover);
  platformParts[PLATFORMS.indexOf(w.on)].push(cover);
}
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
const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x3a0010 }));
abyss.rotation.x = -Math.PI / 2;
abyss.position.y = -40;
scene.add(wall, abyss);

// The stands around the arena, and their crowd: it sways, and jumps up at each death.
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
const fanBodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 8), new THREE.MeshStandardMaterial(), fans.length);
const fanHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf1c27d }), fans.length);
const shirt = new THREE.Color();
fans.forEach((f, i) => fanBodies.setColorAt(i, shirt.setHSL(Math.random(), 0.8, 0.55)));
scene.add(fanBodies, fanHeads);
let cheerUntil = 0;
const fanSpot = new THREE.Matrix4();
function updateFans() {
  const cheering = now < cheerUntil;
  fans.forEach((f, i) => {
    const hop = cheering ? Math.abs(Math.sin(now * 9 + f.phase)) * 0.6 : Math.sin(now * 2 + f.phase) * 0.05;
    fanBodies.setMatrixAt(i, fanSpot.makeTranslation(f.x, f.y + 0.55 + hop, f.z));
    fanHeads.setMatrixAt(i, fanSpot.makeTranslation(f.x, f.y + 1.3 + hop, f.z));
  });
  fanBodies.instanceMatrix.needsUpdate = fanHeads.instanceMatrix.needsUpdate = true;
}

// The players: a body, a long neck that makes a target, and a head that comes off.
const NECK_BASE = 1.6;
const NECK_TOP = 2.35;
const HEAD_Y = 2.55;
const skin = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
const lips = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
const gold = new THREE.MeshStandardMaterial({
  color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide,
});
const ball = (r) => new THREE.SphereGeometry(r, 16, 12);
const LEG = new THREE.CylinderGeometry(0.1, 0.08, 0.8, 10);
const LEG_X = 0.15;
const LEG_Y = 0.4;

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
  part(new THREE.CapsuleGeometry(0.33, 0.34, 4, 12), fabric, group, 0, 1.2, 0); // on legs as long as the neck
  part(new THREE.CylinderGeometry(0.07, 0.09, NECK_TOP - NECK_BASE, 10), skin, group, 0, (NECK_BASE + NECK_TOP) / 2, 0);
  const head = part(ball(0.25), skin, group, 0, HEAD_Y, 0);
  // Bare legs, cut off by the low discs: the second one goes first.
  const limbs = [-1, 1].map((side) => part(LEG, skin, group, side * LEG_X, LEG_Y, 0));
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
    if (look.butt) part(ball(0.4), fabric, group, side * 0.21, 0.85, 0.3);
  }
  if (look.nose) part(new THREE.ConeGeometry(0.11, 0.9, 12), skin, head, 0, -0.02, -0.65).rotation.x = -Math.PI / 2;
  if (look.mouth) {
    part(ball(0.14), lips, head, 0, -0.1, -0.18).scale.set(2, 0.9, 0.7);
    part(new THREE.BoxGeometry(0.3, 0.05, 0.03), white, head, 0, -0.05, -0.27);
  }
  if (look.tail === "bushy") {
    const tail = part(ball(0.3), fabric, group, 0, 1.15, 0.85);
    tail.scale.set(1, 1, 2.6);
    tail.rotation.x = -0.6;
  }
  if (look.tail === "thin") {
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), plain, group, 0, 1.17, 0.95).rotation.x = 1.05;
    part(ball(0.12), plain, group, 0, 1.55, 1.6);
  }
  // The shield: a bubble around the player while it lasts.
  const bubble = part(ball(1.5), new THREE.MeshBasicMaterial({ color: 0x82b1ff, transparent: true, opacity: 0.25, depthWrite: false }), group, 0, 1.3, 0);
  bubble.visible = false;
  scene.add(group);
  return { group, head, crown, bubble, limbs };
}

const params = new URLSearchParams(location.search);
const joining = params.get("room"); // a code: join that room; none: host one
// No bots unless asked (?bots=3): the free slots wait for players. A guest knows the slots from the host.
const BOTS = joining ? 0 : Math.min(Number(params.get("bots")) || 0, NAMES.length - 1);
const entities = NAMES.map((name, i) => ({
  name, alias: name, color: COLORS[i], bot: i > 0 && i <= BOTS, empty: !!joining || i > BOTS,
  score: 0, streak: 0, heads: 0, legs: 2, life: -1, knocks: 0, knockDir: { x: 0, z: 0 }, until: {}, ...makeAvatar(LOOKS[i]),
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
let firstBlood = false; // spilled in this match
let nextMatchAt = 0;
let champion = null; // the winner shown, until the lobby
let fightAt = 0; // the host's end of the countdown: no kill counts before
let lastTop = null; // the leader last shown, to tell me when I take the lead or lose it
const discs = [];
const drops = [];
const flyingParts = []; // heads and legs cut off, until their owner is back
let now = 0;
let slowUntil = 0; // performance.now() until which a decapitation plays in slow motion
let replay = null; // the killcam playing: { killer, from: when the death was, lead }

// The host puts a player back on a free platform; its guests follow from the states it sends.
function spawn(e) {
  const taken = (pl) => entities.some((o) => o !== e && o.alive && platformUnder(o.body.pos) === pl);
  const low = PLATFORMS.filter((pl) => pl.y < 2 * LEVEL); // not on a tower, where the booster waits
  const free = low.filter((pl) => !taken(pl));
  const pl = (free.length ? free : low)[Math.floor(Math.random() * (free.length || low.length))];
  Object.assign(e, {
    body: newBody(pl), alive: true, life: e.life + 1, legs: 2, discs: MAX_DISCS, yaw: Math.atan2(pl.x, pl.z), pitch: 0,
    lastHitBy: null, lastHitAt: 0, until: {}, lastTricks: 0, ai: { throwAt: now + 1 + Math.random(), shotAt: 0, turnAt: 0, strafe: 0 },
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
    m.position.set((2 * k - 1) * LEG_X, LEG_Y, 0);
    m.rotation.set(0, 0, 0);
    m.scale.setScalar(1);
    m.visible = k < e.legs;
  });
  e.lastStep = null;
  e.group.visible = e !== me;
  if (e === me) replay = null;
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
  const f = forward(e.yaw), look = e.pitch ?? 0;
  const dir = new THREE.Vector3(f.x * Math.cos(look), Math.sin(look), f.z * Math.cos(look));
  if (!e.bot) {
    const b = e.body.pos, eye = new THREE.Vector3(b.x, b.y + EYE - (e.legs ? 0 : LEGS_TOP), b.z);
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
    const c = chest(e.body); // the disc starts a little ahead of it, see newDisc
    dir.set(to.x - c.x - f.x * 0.8, to.y - c.y, to.z - c.z - f.z * 0.8).normalize();
  }
  const pitch = Math.max(-MAX_AIM_PITCH, Math.min(MAX_AIM_PITCH, Math.asin(dir.y))), flat = Math.hypot(dir.x, dir.z) || 1;
  return { x: (dir.x / flat) * Math.cos(pitch), y: Math.sin(pitch), z: (dir.z / flat) * Math.cos(pitch) };
}

function throwDisc(e, decap) {
  const d = newDisc(e, e.body.pos, aim(e), decap, has(e, "giant") ? GIANT : 1);
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
    if (d.homing && !d.returning) {
      const prey = entities.filter((o) => o !== d.owner && o.alive && !d.hit.includes(o) && Math.abs(o.body.pos.y + CHEST - d.pos.y) < 1)
        .sort((a, b) => apart(a.body.pos, d.pos) - apart(b.body.pos, d.pos))[0];
      if (prey) steer(d, prey.body.pos, dt);
    }
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
        d.returning = !(d.decap || d.size > 1); // the decapitator and the giant discs cut through, on to the next
        const strike = d.hit.length > 1;
        if (has(victim, "shield")) {
          delete victim.until.shield;
          d.returning = true;
        } else if (d.decap || zone === "neck") {
          kill(victim, d.owner, "decap", d.vel, { rebounds: d.rebounds, strike });
        } else if (zone === "legs" && victim.legs) {
          // The Black Knight: no push, no frag, a leg less; who finishes it off scores.
          Object.assign(victim, { lastHitBy: d.owner, lastHitAt: now, lastTricks: d.rebounds });
          loseLeg(victim, victim.legs - 1);
          tell(victim.legs ? "{K} a coupé une jambe à {V}" : "{K} a coupé l'autre jambe à {V}", { "{K}": d.owner, "{V}": victim },
            victim.legs ? "C'est juste une égratignure !" : "Match nul !", true);
        } else {
          knock(victim.body, d.vel);
          victim.knocks++; // a guest pushes its own player when it sees this count go up
          victim.knockDir = { x: d.vel.x, z: d.vel.z };
          victim.lastHitBy = d.owner;
          victim.lastHitAt = now;
          victim.lastTricks = d.rebounds;
          bleed(chest(victim.body), 15, UP, 2, 4);
          if (strike) tell("{K} a fait une brochette", { "{K}": d.owner }, "Brochette !", true);
        }
      }
    }
    d.mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
    d.mesh.rotation.y += 25 * dt;
  }
}

// What a player can catch: how long it lasts, how it shows, the line that tells it.
const POWERS = {
  giant: { time: BOOST_TIME, icon: "★", label: "Disques XXL", took: "{K} a des disques XXL" },
  fat: { time: FAT_TIME, icon: "✖", label: "Mutateur : Gros Bide", took: "{K} a pris du bide" },
  homing: { time: 15, icon: "🎯", color: 0x18ffff, label: "Disques têtus", took: "{K} a des disques têtus" },
  rapid: { time: 10, icon: "⚡", color: 0xff9100, label: "Mode berserk", took: "{K} passe en mode berserk" },
  shield: { time: 30, icon: "🛡️", color: 0x82b1ff, label: "Ceinture-bouclier", took: "{K} a bouclé sa ceinture" },
  ice: { time: 10, icon: "🧊", color: 0xe0f7fa, label: "Mutateur : Patinoire", took: "{K} fait du patin" },
};
const ITEM_KINDS = ["homing", "rapid", "shield", "ice"]; // dropped here and there; the booster and the maluses have their places
const has = (e, power) => now < (e.until[power] ?? 0);
function give(e, power) {
  e.until[power] = now + POWERS[power].time;
  tell(POWERS[power].took, { "{K}": e });
}

// The booster: on one tower at a time, it makes the discs of whoever lands there giant; it comes back
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

// The maluses: on the ground ring, half way from where the pad from the center lands to the pad that goes
// up, beside the cover: whoever rushes up grows FAT times bigger. Each comes back MALUS_RESPAWN s after.
const MALUS_RESPAWN = 20;
const malusGeo = new THREE.IcosahedronGeometry(0.6);
const maluses = PADS.filter((p) => p.y === 0 && PLATFORMS[p.to].y === LEVEL).map((p) => {
  const pl = platformUnder(p);
  const mesh = new THREE.Mesh(malusGeo, glow(0xd500f9, 1.5));
  scene.add(mesh);
  return { x: (p.x + pl.x) / 2, y: 0, z: (p.z + pl.z) / 2, pl, backAt: 0, mesh };
});

// The other bonus and malus: ITEMS_MAX at a time, a new one every ITEM_EVERY s, somewhere on the two lower floors.
const ITEMS_MAX = 2;
const ITEM_EVERY = 10;
const items = []; // the host's: {power, x, y, z, pl}
let itemAt = 5;
let shownItems = []; // [power, x, y, z]: the host's items, or what it says of them
const itemGeo = new THREE.OctahedronGeometry(0.5);
const itemMeshes = [];

// Now and then a platform of the two lower floors blinks for VANISH_WARN s, then is gone for VANISH_TIME s.
const VANISH_EVERY = 15;
const VANISH_WARN = 3;
const VANISH_TIME = 6;
let shaky = null; // the platform blinking, then gone
let shakyAt = 0;
let vanishAt = VANISH_EVERY;

const standing = (spot, reach) => entities.find((e) => !e.empty && e.alive && Math.abs(e.body.pos.y - spot.y) < 0.5 &&
  Math.hypot(e.body.pos.x - spot.x, e.body.pos.z - spot.z) < reach);

// The host runs the arena: the platform that vanishes, the booster, the maluses, the items.
function updateArena() {
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
    const fat = now >= m.backAt && !m.pl.gone && standing(m, 1);
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
  booster.visible = !!boostAt;
  if (boostAt) booster.position.set(boostAt.x, boostAt.y, boostAt.z);
  booster.rotation.y += 3 * dt; // the beam is round: only the disc shows it turning
  for (const m of maluses) {
    m.mesh.visible = now >= m.backAt && !m.pl.gone;
    m.mesh.position.set(m.x, 1 + 0.3 * Math.sin(now * 4), m.z);
    m.mesh.rotation.y += 2 * dt;
  }
  while (itemMeshes.length < shownItems.length) {
    const mesh = new THREE.Mesh(itemGeo, glow(0xffffff, 1.5));
    scene.add(mesh);
    itemMeshes.push(mesh);
  }
  itemMeshes.forEach((mesh, i) => {
    const it = shownItems[i];
    mesh.visible = !!it;
    if (!it) return;
    mesh.material.color.setHex(POWERS[it[0]].color);
    mesh.material.emissive.setHex(POWERS[it[0]].color);
    mesh.position.set(it[1], it[2] + 1 + 0.3 * Math.sin(now * 4 + i), it[3]);
    mesh.rotation.y += 2 * dt;
  });
  // The shaky platform blinks, then is gone with its pads and walls.
  const blink = shaky && !shaky.gone && Math.sin(now * 20) > 0;
  platformParts.forEach((parts, i) => parts.forEach((m) => (m.visible = !PLATFORMS[i].gone && !(blink && PLATFORMS[i] === shaky))));
  for (const e of entities) e.bubble.visible = !e.empty && e.alive && has(e, "shield");
}

// An event that is no death, told by the host to everyone: the line, the card if it is an exploit,
// the crowd if loud. The guests get the last few in each state.
const news = [];
let newsId = 0;
function tell(text, players = {}, shout = "", loud = false) {
  const n = { id: ++newsId, text, who: Object.fromEntries(Object.entries(players).map(([k, e]) => [k, entities.indexOf(e)])), shout, loud };
  news.push(n);
  if (news.length > 8) news.shift();
  showNews(n);
}
function showNews(n) {
  const players = Object.fromEntries(Object.entries(n.who).map(([k, i]) => [k, entities[i]]));
  feed(n.text, players, n.shout);
  if (n.shout) splash(players["{K}"], n.shout);
  if (n.loud) {
    roar();
    cheerUntil = now + 4;
  }
}

// Deaths, and the gore that comes with a decapitation: the host decides them, everyone shows them.
// rebounds: the disc's before the hit, a trickshot; strike: the disc's second victim or more.
function kill(e, killer, how, dir, { rebounds = 0, strike = false } = {}) {
  e.alive = false;
  e.respawnAt = now + (how === "decap" ? DECAP_RESPAWN_DELAY : RESPAWN_DELAY);
  discs.filter((d) => d.owner === e).forEach(removeDisc);
  const counts = inMatch && !winner && now >= fightAt;
  const scores = killer && counts;
  const regicide = e === leader();
  const others = entities.filter((o) => !o.empty && o !== killer);
  const outsider = scores && others.length >= 2 && others.every((o) => killer.score < o.score); // the last of all
  const shouts = [];
  e.streak = 0;
  if (killer) {
    killer.streak++;
    const bonus = Math.min(killer.streak - 1, MAX_STREAK_BONUS);
    const trick = Math.min(rebounds, MAX_TRICK_BONUS);
    if (scores) killer.score += POINTS[how] + bonus + trick + (regicide ? REGICIDE_BONUS : 0);
    if (scores && !firstBlood) shouts.push("Premier sang !");
    firstBlood ||= scores;
    if (how === "decap") shouts.push(scores && ++killer.heads === 3 ? "Chasseur de têtes !" : "En pleine tête !");
    if (strike) shouts.push("Brochette !");
    if (trick) shouts.push(`Par la bande !${scores ? ` +${trick}` : ""}`);
    if (bonus) shouts.push(STREAK_SHOUTS[Math.min(killer.streak, STREAK_SHOUTS.length - 1)] + (scores ? ` +${bonus}` : ""));
    if (regicide) shouts.push(`Détrôné !${scores ? ` +${REGICIDE_BONUS}` : ""}`);
    if (outsider) shouts.push("Remontada !");
  } else {
    if (counts) e.score -= 1; // a fall nobody caused: a suicide
    shouts.push(`Humiliation !${counts ? " -1" : ""}`);
  }
  const boo = !!killer && killer === leader(); // the crowd boos the leader's kills
  Object.assign(e, { how, killer, boo, dir: { x: dir?.x ?? 0, z: dir?.z ?? 0 }, shout: shouts.join(" ") });
  showDeath(e, killer, how, e.dir, e.shout, boo);
  if (scores && killer.score >= WIN_SCORE) {
    winner = killer;
    nextMatchAt = now + MATCH_PAUSE;
    showWinner(winner);
  } else if (scores && killer.score >= MATCH_POINT && !killer.matchPoint) {
    killer.matchPoint = true;
    setTimeout(() => tell("{K} sent la victoire", { "{K}": killer }, "Un frag pour la gloire !", true), 2000); // after the card of the kill
  }
}

function launchMatch() {
  [...discs].forEach(removeDisc);
  for (const e of entities) if (!e.empty) spawn(Object.assign(e, { score: 0, streak: 0, heads: 0, matchPoint: false }));
  firstBlood = false;
  fightAt = now + COUNTDOWN;
  setMatch(true);
}

function toLobby() {
  winner = null;
  showWinner(null);
  setMatch(false);
}

function setMatch(on) {
  inMatch = on;
  lastTop = null;
  if (on) {
    for (const e of entities) e.matchLife = e.life; // a winner still on this life never died: flawless
    feed("La partie commence !");
    announce("Mesdames et messieurs, veuillez garder la tête sur les épaules. La partie commence.");
    // shortcut: a guest joining in the first seconds of a match also sees the count, harmless
    if (entities.every((e) => !e.score)) {
      ["3", "2", "1", "Fraggez !"].forEach((n, i) => setTimeout(() => {
        banner(n);
        if (i === 3) announce("", n);
      }, (i + 1) * 1000 * COUNTDOWN / 4));
      setTimeout(() => $("banner").textContent === "Fraggez !" && banner(""), (COUNTDOWN + 1) * 1000);
    }
  }
  renderScores();
}

const flawless = (e) => e === me && e.life === e.matchLife;
function winBanner() { // hoisted: the first spawns call it
  return !champion ? "" : champion !== me ? "Défaite… ça arrive." : flawless(me) ? "Victoire sans une égratignure !" : "Victoire !";
}
function showWinner(e) {
  champion = e;
  banner(winBanner());
  if (e) {
    feed(`${e.alias} remporte le match !`);
    announce(`Fin de la partie. Victoire de ${e.alias}.`, flawless(e) ? "Sans une égratignure !" : "");
  }
}

function showDeath(e, killer, how, dir, shout, boo) {
  const lines = how === "decap" ? DECAP_LINES : killer ? PUSH_LINES : FALL_LINES;
  // Picked from the death count, so that every player reads the same line.
  feed(lines[(e.life + entities.indexOf(e)) % lines.length], { "{K}": killer, "{V}": e }, shout);
  if (shout) splash(killer ?? e, shout); // the exploit's author, or the one humiliated
  if (e === me) {
    me.group.visible = true;
    banner(how === "decap" ? `Raccourci par ${killer.alias}` : killer ? `Sorti par ${killer.alias}` : "Suicide. Bien joué.");
    if (killer && killer !== me) {
      replay = { killer, from: now, lead: how === "fall" ? 3 : 1.5 }; // a fall comes long after the push
      $("replay").textContent = `Killcam — avec les compliments de ${killer.alias}`;
    }
  }
  if (how === "decap") {
    decapitate(e, dir);
    splat(e.group.position);
    cheerUntil = now + 4;
  }
  if (boo) roar(true);
  else if (how === "decap" || shout.includes("Remontada")) roar();
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
    e.group.localToWorld(neckTop.set(0, NECK_TOP, 0));
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
    if (!joining && h.kicker && !h.scored && m.position.y < FALL_DEATH_Y) {
      h.scored = true;
      tell(h.leg ? "{K} a marqué avec la jambe de {V}" : "{K} a marqué avec la tête de {V}", { "{K}": h.kicker, "{V}": h.owner }, "Et c'est le buuut !", true);
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
  stainMesh.setMatrixAt(stainCount++ % MAX_STAINS, dummy.matrix);
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
  throwDisc(e, e.discs === MAX_DISCS && Math.random() < BOT_DECAPS);
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
  if (now > ai.turnAt) {
    ai.turnAt = now + 0.5 + Math.random() * 1.2;
    ai.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)];
  }
  const f = forward(e.yaw);
  let wish = { x: -f.z * ai.strafe, z: f.x * ai.strafe };
  const pl = platformUnder(b.pos);
  const exit = pl === shaky && PADS.filter((p) => platformUnder(p) === pl).sort((p, q) => apart(p, b.pos) - apart(q, b.pos))[0];
  if (exit) {
    const len = apart(exit, b.pos) || 1; // off the platform about to vanish, by its nearest pad
    wish = { x: (exit.x - b.pos.x) / len, z: (exit.z - b.pos.z) / len };
  } else if (pl && Math.hypot(b.pos.x - pl.x, b.pos.z - pl.z) > pl.r - 1.3) {
    const len = Math.hypot(pl.x - b.pos.x, pl.z - b.pos.z);
    wish = { x: (pl.x - b.pos.x) / len, z: (pl.z - b.pos.z) / len };
  }
  const c = chest(b);
  const danger = discs.some((d) => d.owner !== e && !d.returning
    && Math.hypot(d.pos.x - c.x, d.pos.z - c.z) < 4
    && d.vel.x * (c.x - d.pos.x) + d.vel.z * (c.z - d.pos.z) > 0);
  return { wish, jump: jump || (danger && Math.random() < 0.02) };
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
startScreen.addEventListener("click", () => {
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
addEventListener("mousedown", (ev) => {
  if (!playing) return;
  if (!joining) throwDisc(me, ev.button === 2);
  else if (ev.button === 2) myDecaps++;
  else myThrows++;
});
addEventListener("contextmenu", (ev) => ev.preventDefault());
$("launch").addEventListener("click", launchMatch); // the click goes on to the start screen, which starts playing
$("lobby").addEventListener("click", (ev) => ev.stopPropagation()); // renaming must not start playing
// A guest's name goes to the host with its moves; the host's states bring it back to everyone.
let myName = null;
$("pseudo").addEventListener("input", (ev) => {
  const name = cleanName(ev.target.value);
  if (!name) return;
  me.name = me.alias = name;
  if (joining) myName = name;
  renderScores();
});

function playerInput() {
  // KeyboardEvent.code names the key by its place: KeyW is Z on an AZERTY keyboard.
  const ahead = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  const side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const f = forward(me.yaw);
  const x = f.x * ahead - f.z * side, z = f.z * ahead + f.x * side;
  const len = Math.hypot(x, z) || 1;
  return { wish: { x: x / len, z: z / len }, jump: keys.has("Space") };
}

// The wheel steps the view out behind me, up to about half the arena in sight; all the way in, through my eyes again.
const MAX_ZOOM = 20;
const ZOOM_TILT = 0.5; // rad the view looks down, all the way back
let zoom = 0;
addEventListener("wheel", (ev) => {
  if (locked) zoom = Math.min(MAX_ZOOM, Math.max(0, zoom + ev.deltaY * 0.01));
}, { passive: true });

function updateCamera() {
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
  const pitch = me.pitch - ZOOM_TILT * (zoom / MAX_ZOOM);
  const back = (d) => new THREE.Vector3(Math.sin(me.yaw) * Math.cos(pitch) * d, EYE - (me.legs ? 0 : LEGS_TOP) - Math.sin(pitch) * d, Math.cos(me.yaw) * Math.cos(pitch) * d)
    .add(me.body.pos);
  let d = zoom;
  while (d > 0 && Math.hypot(back(d).x, back(d).z) > ARENA_RADIUS - 1) d -= 0.5;
  camera.position.copy(back(Math.max(d, 0)));
  camera.rotation.set(pitch, me.yaw, 0);
}

// The HUD.
function banner(text) {
  $("banner").textContent = text;
}
// The referee reads the events aloud on each player's machine, deadly serious: a deep, slow French voice.
// The exploits, an announcer shouts them, booming, like the one of Unreal Tournament.
let refereeVoice = null;
let muted = false;
let crowd = null; // the crowd's AudioContext, made at its first roar
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
}
setMuted(muted);
$("mute").addEventListener("click", () => setMuted(!muted));
$("mute").addEventListener("mousedown", (ev) => ev.stopPropagation()); // not a throw
addEventListener("keydown", (ev) => {
  if (ev.code === "KeyM" && ev.target.tagName !== "INPUT") setMuted(!muted);
});
function pickVoice() {
  const french = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("fr"));
  refereeVoice = french.find((v) => /thomas|daniel|henri|paul|nicolas|male/i.test(v.name)) ?? french[0] ?? null;
}
if (window.speechSynthesis) {
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
  pickVoice();
}
let speaking = null; // the referee's line being read: kept, or Chrome may drop it before its end event
// shout: the exploits as shown ("Doublé ! +1 Détrôné ! +2"); their points are not said, the cries come after the line.
function announce(text, shout = "") {
  const cries = shout.match(/[^!+\d ][^!]*!/g) ?? [];
  if (muted) return;
  if (!text || !window.speechSynthesis) return cry(cries);
  if (speechSynthesis.pending) return; // one event waiting at most: the match goes on
  speaking = new SpeechSynthesisUtterance(text);
  Object.assign(speaking, { lang: "fr-FR", voice: refereeVoice, pitch: 0.5, rate: 1.15 });
  speaking.onend = speaking.onerror = () => cry(cries);
  speechSynthesis.speak(speaking);
}
// The announcer's cries, one after the other: recorded in sounds/, since the browser's voice takes no echo.
function cry([first, ...rest]) {
  if (!first || muted) return;
  const sound = new Audio(`sounds/${crySlug(first)}.mp3`);
  sound.onended = sound.onerror = () => cry(rest);
  sound.play().catch(() => cry(rest));
}

// The crowd at a decapitation, made up on the spot: hundreds of claps, and a chorus of voices
// yelling « ouais » that rises then dies down, over the rumble of the stands. jeer: no claps, a low « hou » that sinks.
const ROAR_TIME = 3.5;
function roar(jeer = false) {
  if (muted || !window.AudioContext) return;
  crowd ??= new AudioContext();
  crowd.resume();
  const t = crowd.currentTime, rate = crowd.sampleRate;
  const out = crowd.createGain();
  out.gain.value = 0.3;
  out.connect(crowd.destination);
  // The claps: short bursts of noise, thick at first, then fewer and fewer.
  const claps = crowd.createBuffer(1, rate * ROAR_TIME, rate);
  const data = claps.getChannelData(0);
  for (let c = 0; c < (jeer ? 0 : 500); c++) {
    const at = Math.floor(Math.random() ** 2 * (ROAR_TIME - 0.1) * rate), loud = 0.2 + Math.random() * 0.5;
    for (let i = 0; i < 0.02 * rate; i++) data[at + i] += (Math.random() * 2 - 1) * loud * Math.exp(-i / (0.003 * rate));
  }
  const clapping = crowd.createBufferSource();
  clapping.buffer = claps;
  const bright = crowd.createBiquadFilter();
  bright.type = "highpass";
  bright.frequency.value = 900;
  clapping.connect(bright).connect(out);
  clapping.start(t);
  // The rumble: noise through the band of voices, swelling then fading.
  const hiss = crowd.createBuffer(1, rate * ROAR_TIME, rate);
  hiss.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  const rumble = crowd.createBufferSource();
  rumble.buffer = hiss;
  const band = crowd.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(jeer ? 200 : 400, t);
  band.frequency.linearRampToValueAtTime(jeer ? 500 : 1100, t + 0.4);
  band.frequency.linearRampToValueAtTime(jeer ? 250 : 600, t + ROAR_TIME);
  const swell = crowd.createGain();
  swell.gain.setValueAtTime(0.001, t);
  swell.gain.exponentialRampToValueAtTime(0.8, t + 0.3);
  swell.gain.exponentialRampToValueAtTime(0.001, t + ROAR_TIME);
  rumble.connect(band).connect(swell).connect(out);
  rumble.start(t);
  // The yells: voices at random pitches, each going up into its « ouais » and down again.
  const vowel = crowd.createBiquadFilter();
  vowel.type = "bandpass";
  vowel.frequency.value = jeer ? 450 : 800;
  vowel.Q.value = 1.2;
  vowel.connect(out);
  for (let v = 0; v < 24; v++) {
    const voice = crowd.createOscillator(), loud = crowd.createGain();
    const start = t + Math.random() * 0.4, end = start + 1 + Math.random() * 1.5;
    const pitch = jeer ? 110 + Math.random() * 140 : 180 + Math.random() * 320;
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(pitch, start);
    voice.frequency.linearRampToValueAtTime(pitch * (jeer ? 1.1 : 1.5), start + 0.25);
    voice.frequency.linearRampToValueAtTime(pitch * (jeer ? 0.6 : 0.9), end);
    loud.gain.setValueAtTime(0.001, start);
    loud.gain.exponentialRampToValueAtTime(0.03, start + 0.1);
    loud.gain.exponentialRampToValueAtTime(0.001, end);
    voice.connect(loud).connect(vowel);
    voice.start(start);
    voice.stop(end);
  }
}

// The noises of the arena, made up on the spot like the crowd, fainter the further from me.
const HEARING = 45; // m from me past which nothing is heard
let hiss = null; // a second of white noise, the stuff of whooshes and splats
function sound(at) {
  const loud = 1 - Math.hypot(at.x - me.body.pos.x, at.y - me.body.pos.y, at.z - me.body.pos.z) / HEARING;
  if (muted || !window.AudioContext || loud <= 0) return null;
  crowd ??= new AudioContext();
  crowd.resume();
  if (!hiss) {
    hiss = crowd.createBuffer(1, crowd.sampleRate, crowd.sampleRate);
    hiss.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  }
  const out = crowd.createGain();
  out.gain.value = loud;
  out.connect(crowd.destination);
  return { ctx: crowd, t: crowd.currentTime, out };
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
// A footstep: a soft scuff and a thud, the left foot a little higher than the right.
function step(at, left) {
  const s = sound(at);
  if (!s) return;
  noise(s, "lowpass", left ? 900 : 700, 150, 0.09, 0.15, 0.004);
  tone(s, "sine", left ? 110 : 90, 50, 0.08, 0.2);
}
// A hop on one leg: the foot lands, and a spring goes boiiing.
function boing(at) {
  const s = sound(at);
  if (!s) return;
  const { ctx, t, out } = s;
  tone(s, "sine", 140, 50, 0.1, 0.3);
  const spring = ctx.createOscillator(), wobble = ctx.createOscillator(), depth = ctx.createGain(), gain = ctx.createGain();
  spring.frequency.setValueAtTime(100 + Math.random() * 40, t);
  spring.frequency.exponentialRampToValueAtTime(420, t + 0.35);
  wobble.frequency.value = 22;
  depth.gain.value = 45;
  wobble.connect(depth).connect(spring.frequency);
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  spring.connect(gain).connect(out);
  for (const o of [spring, wobble]) {
    o.start(t);
    o.stop(t + 0.4);
  }
}
// On two legs, a step every STRIDE m walked on a floor; on one, a boing each time it lands.
const STRIDE = 1.4;
function steps(e) {
  const p = e.body.pos, pl = platformUnder(p);
  const floor = !!pl && Math.abs(p.y - pl.y) < 0.05;
  if (e.legs === 1 && floor && !e.onFloor) boing(p);
  if (e.legs === 2 && floor && e.lastStep) {
    e.walked = (e.walked ?? 0) + Math.hypot(p.x - e.lastStep.x, p.z - e.lastStep.z);
    if (e.walked > STRIDE) {
      e.walked = 0;
      step(p, (e.leftFoot = !e.leftFoot));
    }
  }
  e.onFloor = floor;
  e.lastStep = { x: p.x, z: p.z };
}

// An exploit across the screen for 2 s: the player's card, their alias, the shout.
function splash(who, shout) {
  const card = document.createElement("div");
  card.className = "splash";
  card.style.setProperty("--color", css(who.color));
  const portrait = new Image();
  portrait.src = who.portrait;
  portrait.alt = "";
  const alias = document.createElement("b");
  alias.textContent = who.alias;
  const cry = document.createElement("div");
  cry.textContent = shout;
  card.append(portrait, alias, cry);
  document.querySelector(".splash")?.remove();
  document.body.append(card);
  setTimeout(() => card.remove(), 2000);
}

// The radar: the arena seen from above, turning with the player so that ahead is up. The floors by
// the colour of their rim, the players in their colours, smaller on a floor below, ringed on one above.
const radar = $("radar").getContext("2d");
const RADAR = 300; // half the canvas, which is twice its size on the page for sharp screens
const RADAR_SCALE = (RADAR - 10) / ARENA_RADIUS; // pixels a unit
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
  radar.textAlign = "center";
  radar.textBaseline = "middle";
  if (boostAt) {
    radar.fillStyle = "#ffd700";
    radar.font = "bold 40px system-ui";
    radar.fillText("★", ...spot(boostAt));
  }
  radar.fillStyle = "#d500f9";
  radar.font = "bold 30px system-ui";
  for (const m of maluses) if (now >= m.backAt && !m.pl.gone) radar.fillText("✖", ...spot(m));
  radar.font = "34px system-ui";
  for (const [power, ...at] of shownItems) radar.fillText(POWERS[power].icon, ...spot({ x: at[0], z: at[2] }));
  const top = leader();
  for (const e of entities) {
    if (e.empty || !e.alive || !e.body || e === me) continue;
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
      line.append(bit);
      continue;
    }
    const name = document.createElement("b");
    name.textContent = who.alias;
    name.style.color = css(who.color);
    line.append(name);
  }
  const said = line.textContent;
  if (shout) {
    const loud = document.createElement("span");
    loud.className = "shout";
    loud.textContent = ` ${shout}`;
    line.append(loud);
  }
  if (Object.keys(players).length) {
    line.className = "event";
    cheerUntil = now + 2.5;
    announce(said, shout);
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
  title.textContent = inMatch ? `Limite de frags : ${WIN_SCORE}`
    : joining ? "Échauffement : l'hôte va lancer le match" : "Échauffement : Échap, puis « Au combat ! »";
  $("scores").append(title);
  for (const e of entities.filter((o) => !o.empty).sort((a, b) => b.score - a.score)) {
    const line = document.createElement("div");
    line.textContent = `${e === top ? "👑 " : ""}${inMatch && e.score >= MATCH_POINT ? "🔥 " : ""}${e === me ? "▶ " : ""}${e.alias}  ${e.score}`;
    line.style.color = css(e.color);
    $("scores").append(line);
  }
  renderLobby(top);
}

// The table of the players on the start screen, and the field to rename oneself.
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
    info.textContent = [o === entities[0] ? "hôte" : o.bot ? "bot" : "", `${o.score} frags`].filter(Boolean).join(" · ");
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
      alive: e.alive, life: e.life, legs: e.legs, discs: e.discs, score: e.score, boo: e.boo,
      until: Object.fromEntries(Object.entries(e.until).filter(([, t]) => t > now).map(([p, t]) => [p, t - now])),
      knocks: e.knocks, kx: e.knockDir.x, kz: e.knockDir.z,
      how: e.how, shout: e.shout, killer: entities.indexOf(e.killer), dx: e.dir?.x ?? 0, dz: e.dir?.z ?? 0,
    }),
    discs: discs.map((d) => [d.pos.x, d.pos.y, d.pos.z, d.decap ? 1 : 0, entities.indexOf(d.owner), d.size, d.id]),
    boost: PLATFORMS.indexOf(boostAt),
    maluses: maluses.map((m) => now >= m.backAt),
    items: shownItems,
    shaky: PLATFORMS.indexOf(shaky),
    gone: !!shaky?.gone,
    news,
    winner: entities.indexOf(winner),
    match: inMatch,
  };
}

function guestJoins(conn) {
  const e = entities.find((o) => o.empty);
  if (!e) return conn.close(); // full
  Object.assign(e, { empty: false, conn, ...pickPseudo(), score: 0, streak: 0, throws: 0, decaps: 0 });
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
    Object.assign(e, { empty: false, name: n.name, alias: n.alias, bot: n.bot, score: n.score, discs: n.discs,
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
  if (s.match !== inMatch) setMatch(s.match);
  const won = entities[s.winner];
  if ((won ?? null) !== champion) showWinner(won ?? null);
  const key = s.ents.map((n) => n && n.name + n.alias + n.score).join();
  if (key !== scoresKey) {
    scoresKey = key;
    renderScores();
  }
  showDiscs(s.discs);
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
  if (winner && now > nextMatchAt) toLobby();
  for (const e of entities) {
    if (e.empty) continue;
    if (e.alive) {
      if (!e.conn) {
        const { wish, jump } = e.bot ? think(e) : playerInput();
        stepBody(e.body, wish, jump, dt);
      }
      if (e.body.pos.y < FALL_DEATH_Y) {
        const pusher = e.lastHitBy && now - e.lastHitAt < BLAME_WINDOW ? e.lastHitBy : null;
        kill(e, pusher, "fall", null, { rebounds: pusher ? e.lastTricks : 0 });
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
  sendIn -= dt;
  if (sendIn > 0) return;
  sendIn = SEND_EVERY;
  const state = hostState();
  for (const e of entities) if (e.conn?.open) e.conn.send({ ...state, you: entities.indexOf(e) });
}

// The avatar where the body is, and the body told of its powers and its legs.
// Legless, it sits on its stumps; on one leg, it leans over it and wobbles.
function pose(e) {
  const scale = has(e, "fat") ? SCALE * FAT : SCALE;
  e.group.position.set(e.body.pos.x, e.body.pos.y - (e.legs ? 0 : (LEGS_TOP * scale) / SCALE), e.body.pos.z);
  e.group.rotation.y = e.yaw;
  if (e.alive) e.group.rotation.z = e.legs === 1 ? 0.2 + 0.08 * Math.sin(now * 12) : 0;
  e.group.scale.setScalar(scale);
  e.body.slippery = has(e, "ice");
  e.body.legs = e.legs;
}

function guestFrame(dt) {
  const smooth = 1 - Math.exp(-15 * dt); // eases the others between two states of the host
  for (const e of entities) {
    if (e.empty || !e.body) continue;
    if (e === me) {
      const { wish, jump } = e.alive ? playerInput() : { wish: STILL, jump: false };
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
  host.send({ life: me.life, x: p.x, y: p.y, z: p.z, yaw: me.yaw, pitch: me.pitch, throws: myThrows, decaps: myDecaps, name: myName });
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
const tape = [];
const ghostDiscs = [];
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
}

function playBack() {
  const t = now - replay.lead;
  const frame = tape.find((f) => f.at >= t) ?? tape.at(-1);
  const saved = [];
  const pose = (obj) => saved.push([obj, obj.position.clone(), obj.quaternion.clone(), obj.scale.clone(), obj.visible]);
  entities.forEach((e, i) => {
    const f = frame.ents[i];
    pose(e.group);
    e.group.position.copy(f.pos);
    e.group.quaternion.copy(f.quat);
    e.group.scale.setScalar(f.scale);
    e.group.visible = (f.visible || e === me) && e !== replay.killer && !e.empty;
    if (e.head.parent === e.group) return;
    pose(e.head); // off its body now: where it was then, maybe still on the neck
    if (f.head) e.head.position.copy(f.head);
    else {
      e.group.updateMatrixWorld();
      e.group.localToWorld(e.head.position.set(0, HEAD_Y, 0));
      e.head.quaternion.identity();
    }
  });
  for (const m of liveDiscs()) {
    pose(m);
    m.visible = false;
  }
  while (ghostDiscs.length < frame.discs.length) {
    const m = new THREE.Mesh(discGeo, glow(0xffffff, 0.8));
    scene.add(m);
    ghostDiscs.push(m);
  }
  ghostDiscs.forEach((m, i) => {
    const d = frame.discs[i];
    m.visible = !!d;
    if (!d) return;
    m.position.copy(d[0]);
    m.scale.setScalar(d[1]);
    m.material.color.setHex(d[2]);
    m.material.emissive.setHex(d[2]);
    m.geometry = d[3];
  });
  const k = frame.ents[entities.indexOf(replay.killer)];
  camera.position.set(k.pos.x, k.pos.y + (EYE * k.scale) / SCALE, k.pos.z);
  camera.rotation.set(-0.15, k.yaw, 0);
  renderer.render(scene, camera);
  for (const [obj, p, q, sc, v] of saved) {
    obj.position.copy(p);
    obj.quaternion.copy(q);
    obj.scale.copy(sc);
    obj.visible = v;
  }
  for (const m of ghostDiscs) m.visible = false;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const frame = Math.min(clock.getDelta(), 0.05);
  const dt = performance.now() < slowUntil ? frame * SLOW_MOTION : frame;
  now += dt;
  if (joining) guestFrame(dt);
  else hostFrame(dt);
  updateParts(dt);
  updateBlood(dt);
  updateFans();
  showArena(dt);
  drawRadar();
  pads.forEach((p) => (p.material.emissiveIntensity = 1.2 + 0.6 * Math.sin(now * 6)));
  $("discs").textContent = "●".repeat(me.discs ?? 0) + "○".repeat(MAX_DISCS - (me.discs ?? MAX_DISCS));
  $("powers").textContent = !me.alive ? "" : Object.entries(me.until).filter(([, until]) => until > now)
    .map(([p, until]) => `${POWERS[p].icon} ${POWERS[p].label} ${Math.ceil(until - now)} s`).join(" · ");
  record();
  if (replay && now > replay.from + REPLAY_AFTER) replay = null;
  $("replay").hidden = !replay;
  if (replay) return playBack();
  if (me.body) updateCamera();
  renderer.render(scene, camera);
});
