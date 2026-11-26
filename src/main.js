import * as THREE from "three";
import {
  ARENA_RADIUS, CHEST, DISC_SPEED, FALL_DEATH_Y, GRAVITY, MAX_DISCS, PADS, PAD_RADIUS, PLATFORMS,
  chest, hitZone, knock, newBody, newDisc, platformUnder, stepBody, stepDisc,
} from "./rules.js";
import { hostRoom, joinRoom, newRoomCode } from "./net.js";
import { DECAP_LINES, FALL_LINES, PSEUDOS, PUSH_LINES, STREAK_SHOUTS } from "./pseudos.js";

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
const WIN_SCORE = 20;
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
scene.fog = new THREE.Fog(0x07060f, 35, 90);
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

// The arena: platforms over the void, their pads, the wall the discs bounce on.
const glow = (color, intensity = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
for (const pl of PLATFORMS) {
  const block = new THREE.Mesh(new THREE.CylinderGeometry(pl.r, pl.r * 0.6, 1.5, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f4b }));
  block.position.set(pl.x, -0.75, pl.z);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(pl.r, 0.06, 8, 64), glow(0x00e5ff));
  edge.rotation.x = Math.PI / 2;
  edge.position.set(pl.x, 0.01, pl.z);
  scene.add(block, edge);
}
const pads = PADS.map((p) => {
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.08, 32), glow(0x76ff03));
  pad.position.set(p.x, 0.04, p.z);
  scene.add(pad);
  return pad;
});
const wall = new THREE.Mesh(
  new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 6, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
);
wall.position.y = CHEST;
const wallLine = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS, 0.05, 6, 128), glow(0x7c4dff));
wallLine.rotation.x = Math.PI / 2;
wallLine.position.y = CHEST;
const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x3a0010 }));
abyss.rotation.x = -Math.PI / 2;
abyss.position.y = -40;
scene.add(wall, wallLine, abyss);

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
  part(new THREE.CapsuleGeometry(0.35, 0.8, 4, 12), fabric, group, 0, 0.95, 0);
  part(new THREE.CylinderGeometry(0.07, 0.09, NECK_TOP - NECK_BASE, 10), skin, group, 0, (NECK_BASE + NECK_TOP) / 2, 0);
  const head = part(ball(0.25), skin, group, 0, HEAD_Y, 0);
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
    if (look.butt) part(ball(0.4), fabric, group, side * 0.21, 0.6, 0.3);
  }
  if (look.nose) part(new THREE.ConeGeometry(0.11, 0.9, 12), skin, head, 0, -0.02, -0.65).rotation.x = -Math.PI / 2;
  if (look.mouth) {
    part(ball(0.14), lips, head, 0, -0.1, -0.18).scale.set(2, 0.9, 0.7);
    part(new THREE.BoxGeometry(0.3, 0.05, 0.03), white, head, 0, -0.05, -0.27);
  }
  if (look.tail === "bushy") {
    const tail = part(ball(0.3), fabric, group, 0, 0.9, 0.85);
    tail.scale.set(1, 1, 2.6);
    tail.rotation.x = -0.6;
  }
  if (look.tail === "thin") {
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), plain, group, 0, 0.92, 0.95).rotation.x = 1.05;
    part(ball(0.12), plain, group, 0, 1.3, 1.6);
  }
  scene.add(group);
  return { group, head, crown };
}

const params = new URLSearchParams(location.search);
const joining = params.get("room"); // a code: join that room; none: host one
// No bots unless asked (?bots=3): the free slots wait for players. A guest knows the slots from the host.
const BOTS = joining ? 0 : Math.min(Number(params.get("bots")) || 0, NAMES.length - 1);
const entities = NAMES.map((name, i) => ({
  name, alias: name, color: COLORS[i], bot: i > 0 && i <= BOTS, empty: !!joining || i > BOTS,
  score: 0, streak: 0, life: -1, knocks: 0, knockDir: { x: 0, z: 0 }, ...makeAvatar(LOOKS[i]),
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
let winnerText = "";
const discs = [];
const drops = [];
const flyingHeads = [];
let now = 0;
let slowUntil = 0; // performance.now() until which a decapitation plays in slow motion

// The host puts a player back on a free platform; its guests follow from the states it sends.
function spawn(e) {
  const taken = (pl) => entities.some((o) => o !== e && o.alive && platformUnder(o.body.pos) === pl);
  const free = PLATFORMS.filter((pl) => !taken(pl));
  const pl = (free.length ? free : PLATFORMS)[Math.floor(Math.random() * (free.length || PLATFORMS.length))];
  Object.assign(e, {
    body: newBody(pl), alive: true, life: e.life + 1, discs: MAX_DISCS, yaw: Math.atan2(pl.x, pl.z), pitch: 0,
    lastHitBy: null, lastHitAt: 0, ai: { throwAt: now + 1 + Math.random(), shotAt: 0, turnAt: 0, strafe: 0 },
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
  e.group.visible = e !== me;
  const i = flyingHeads.findIndex((h) => h.owner === e);
  if (i >= 0) flyingHeads.splice(i, 1);
  if (e === me) banner(winnerText);
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

function throwDisc(e, decap) {
  const d = newDisc(e, e.body.pos, forward(e.yaw), decap);
  if (!e.alive || e.discs < d.cost) return;
  e.discs -= d.cost;
  d.mesh = new THREE.Mesh(decap ? bladeGeo : discGeo, glow(decap ? 0xff1744 : e.color, 0.8));
  scene.add(d.mesh);
  discs.push(d);
}

function removeDisc(d) {
  scene.remove(d.mesh);
  discs.splice(discs.indexOf(d), 1);
}

function updateDiscs(dt) {
  for (const d of [...discs]) {
    const home = chest(d.owner.body);
    stepDisc(d, home, dt);
    if (d.returning) {
      if (Math.hypot(d.pos.x - home.x, d.pos.y - home.y, d.pos.z - home.z) < 1) {
        d.owner.discs += d.cost;
        removeDisc(d);
        continue;
      }
    } else {
      let zone = null;
      const victim = entities.find((v) => v !== d.owner && v.alive && (zone = hitZone(d.prev, d.pos, v.body)));
      if (victim) {
        d.returning = true;
        if (d.decap || zone === "neck") {
          kill(victim, d.owner, "decap", d.vel);
        } else {
          knock(victim.body, d.vel);
          victim.knocks++; // a guest pushes its own player when it sees this count go up
          victim.knockDir = { x: d.vel.x, z: d.vel.z };
          victim.lastHitBy = d.owner;
          victim.lastHitAt = now;
          bleed(chest(victim.body), 15, UP, 2, 4);
        }
      }
    }
    d.mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
    d.mesh.rotation.y += 25 * dt;
  }
}

// Deaths, and the gore that comes with a decapitation: the host decides them, everyone shows them.
function kill(e, killer, how, dir) {
  e.alive = false;
  e.respawnAt = now + (how === "decap" ? DECAP_RESPAWN_DELAY : RESPAWN_DELAY);
  discs.filter((d) => d.owner === e).forEach(removeDisc);
  const scores = killer && inMatch && !winner;
  const regicide = e === leader();
  const shouts = [];
  e.streak = 0;
  if (killer) {
    killer.streak++;
    const bonus = Math.min(killer.streak - 1, MAX_STREAK_BONUS);
    if (scores) killer.score += POINTS[how] + bonus + (regicide ? REGICIDE_BONUS : 0);
    if (scores && !firstBlood) shouts.push("Premier sang !");
    firstBlood ||= scores;
    if (bonus) shouts.push(STREAK_SHOUTS[Math.min(killer.streak, STREAK_SHOUTS.length - 1)] + (scores ? ` +${bonus}` : ""));
    if (regicide) shouts.push(`Régicide !${scores ? ` +${REGICIDE_BONUS}` : ""}`);
  } else {
    shouts.push("Humiliation !");
  }
  Object.assign(e, { how, killer, dir: { x: dir?.x ?? 0, z: dir?.z ?? 0 }, shout: shouts.join(" ") });
  showDeath(e, killer, how, e.dir, e.shout);
  if (scores && killer.score >= WIN_SCORE) {
    winner = killer;
    nextMatchAt = now + MATCH_PAUSE;
    showWinner(winner);
  }
}

function launchMatch() {
  [...discs].forEach(removeDisc);
  for (const e of entities) if (!e.empty) spawn(Object.assign(e, { score: 0, streak: 0 }));
  firstBlood = false;
  setMatch(true);
}

function toLobby() {
  winner = null;
  showWinner(null);
  setMatch(false);
}

function setMatch(on) {
  inMatch = on;
  if (on) {
    feed("La partie commence !");
    announce("Mesdames et messieurs, la partie commence.");
  }
  renderScores();
}

const winText = (e) => e ? `${e.alias} a gagné la partie !` : "";
function showWinner(e) {
  winnerText = winText(e);
  banner(winnerText);
  if (e) {
    feed(winnerText);
    announce(`Fin de la partie. Victoire de ${e.alias}.`);
  }
}

function showDeath(e, killer, how, dir, shout) {
  const lines = how === "decap" ? DECAP_LINES : killer ? PUSH_LINES : FALL_LINES;
  // Picked from the death count, so that every player reads the same line.
  feed(lines[(e.life + entities.indexOf(e)) % lines.length], { "{K}": killer, "{V}": e }, shout);
  if (e === me) {
    me.group.visible = true;
    banner(how === "decap" ? `Décapité par ${killer.alias}` : killer ? `Éjecté par ${killer.alias}` : "Tu es tombé");
  }
  if (how === "decap") decapitate(e, dir);
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
  flyingHeads.push({
    owner: e,
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

function updateHeads(dt) {
  for (const h of flyingHeads) {
    const m = h.owner.head;
    h.vel.y -= GRAVITY * dt;
    m.position.addScaledVector(h.vel, dt);
    m.rotation.x += h.spin.x * dt;
    m.rotation.y += h.spin.y * dt;
    m.rotation.z += h.spin.z * dt;
    if (h.vel.y < 0 && m.position.y < 0.25 && m.position.y > -0.5 && platformUnder(m.position)) {
      m.position.y = 0.25;
      h.vel.set(h.vel.x * 0.6, -h.vel.y * 0.4, h.vel.z * 0.6);
      h.spin.multiplyScalar(0.6);
      bleed(m.position, 20, UP, 3, 4);
    }
    if (h.vel.lengthSq() > 4) bleed(m.position, 3, UP, 1, 2);
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
function stain(p, size) {
  dummy.position.set(p.x, 0.012 + Math.random() * 0.004, p.z);
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
    const landed = d.v.y < 0 && d.p.y <= 0.01 && d.p.y > -0.3 && platformUnder(d.p);
    if (landed) stain(d.p, d.size);
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
  const foes = entities.filter((o) => o !== e && o.alive);
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
  if (pl && Math.hypot(b.pos.x - pl.x, b.pos.z - pl.z) > pl.r - 1.3) {
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

function updateCamera() {
  const flying = flyingHeads.find((h) => h.owner === me);
  if (flying) {
    // Decapitated: the view steps out behind the body to watch the geyser (from the head, the blood hides all).
    me.group.updateMatrixWorld();
    const at = me.group.localToWorld(neckTop.set(0, NECK_TOP, 0));
    camera.position.set(at.x + Math.sin(me.yaw) * 5, at.y + 2.5, at.z + Math.cos(me.yaw) * 5);
    camera.lookAt(at.x, at.y + 1.5, at.z);
    return;
  }
  camera.position.set(me.body.pos.x, me.body.pos.y + EYE, me.body.pos.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
}

// The HUD.
function banner(text) {
  $("banner").textContent = text;
}
// The referee reads the events aloud on each player's machine, deadly serious: a deep, slow French voice.
let refereeVoice = null;
let muted = false;
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
function announce(text) {
  if (muted || !window.speechSynthesis || speechSynthesis.pending) return; // one line waiting at most: the match goes on
  const words = new SpeechSynthesisUtterance(text);
  Object.assign(words, { lang: "fr-FR", voice: refereeVoice, pitch: 0.5, rate: 1.15 });
  speechSynthesis.speak(words);
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
  const said = shout ? `${line.textContent}. ${shout}` : line.textContent;
  if (shout) {
    const loud = document.createElement("span");
    loud.className = "shout";
    loud.textContent = ` ${shout}`;
    line.append(loud);
  }
  if (Object.keys(players).length) {
    line.className = "event";
    announce(said);
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
  $("scores").innerHTML = "";
  const title = document.createElement("div");
  title.textContent = inMatch ? `Premier à ${WIN_SCORE} points`
    : joining ? "Salle d'attente : l'hôte va lancer la partie" : "Salle d'attente : Échap, puis « Lancer la partie »";
  $("scores").append(title);
  for (const e of entities.filter((o) => !o.empty).sort((a, b) => b.score - a.score)) {
    const line = document.createElement("div");
    line.textContent = `${e === top ? "👑 " : ""}${e === me ? "▶ " : ""}${e.alias}  ${e.score}`;
    line.style.color = css(e.color);
    $("scores").append(line);
  }
  renderLobby(top);
}

// The table of the players on the start screen, and the field to rename oneself.
function renderLobby(top) {
  $("lobby-title").textContent = inMatch ? "Partie en cours" : "Salle d'attente";
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
    info.textContent = [o === entities[0] ? "hôte" : o.bot ? "bot" : "", `${o.score} pts`].filter(Boolean).join(" · ");
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
      alive: e.alive, life: e.life, discs: e.discs, score: e.score,
      knocks: e.knocks, kx: e.knockDir.x, kz: e.knockDir.z,
      how: e.how, shout: e.shout, killer: entities.indexOf(e.killer), dx: e.dir?.x ?? 0, dz: e.dir?.z ?? 0,
    }),
    discs: discs.map((d) => [d.pos.x, d.pos.y, d.pos.z, d.decap ? 1 : 0, entities.indexOf(d.owner)]),
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
    Object.assign(e, { empty: false, name: n.name, alias: n.alias, bot: n.bot, score: n.score, discs: n.discs });
    if (n.life !== e.life) {
      Object.assign(e, { life: n.life, alive: true, body: newBody(n), yaw: n.yaw, knocks: n.knocks });
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
    if (!n.alive && e.alive) {
      e.alive = false;
      showDeath(e, entities[n.killer] ?? null, n.how, { x: n.dx, z: n.dz }, n.shout);
    }
  });
  if (s.match !== inMatch) setMatch(s.match);
  const won = entities[s.winner];
  if (winText(won) !== winnerText) showWinner(won);
  const key = s.ents.map((n) => n && n.name + n.alias + n.score).join();
  if (key !== scoresKey) {
    scoresKey = key;
    renderScores();
  }
  showDiscs(s.discs);
}

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
    const color = d[3] ? 0xff1744 : entities[d[4]].color;
    mesh.position.set(d[0], d[1], d[2]);
    mesh.geometry = d[3] ? bladeGeo : discGeo;
    mesh.material.color.setHex(color);
    mesh.material.emissive.setHex(color);
  });
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
        kill(e, e.lastHitBy && now - e.lastHitAt < BLAME_WINDOW ? e.lastHitBy : null, "fall");
      }
    } else {
      stepBody(e.body, STILL, false, dt);
      updateCorpse(e, dt);
      if (now > e.respawnAt) spawn(e);
    }
    e.group.position.set(e.body.pos.x, e.body.pos.y, e.body.pos.z);
    e.group.rotation.y = e.yaw;
  }
  updateDiscs(dt);
  for (const e of entities) if (e.conn && performance.now() - e.seenAt > GUEST_TIMEOUT) guestLeaves(e.conn);
  sendIn -= dt;
  if (sendIn > 0) return;
  sendIn = SEND_EVERY;
  const state = hostState();
  for (const e of entities) if (e.conn?.open) e.conn.send({ ...state, you: entities.indexOf(e) });
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
    e.group.position.set(e.body.pos.x, e.body.pos.y, e.body.pos.z);
    e.group.rotation.y = e.yaw;
  }
  netDiscs.forEach((mesh) => (mesh.rotation.y += 25 * dt));
  if (!host?.open || !me.body) return;
  const p = me.body.pos;
  host.send({ life: me.life, x: p.x, y: p.y, z: p.z, yaw: me.yaw, throws: myThrows, decaps: myDecaps, name: myName });
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

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const frame = Math.min(clock.getDelta(), 0.05);
  const dt = performance.now() < slowUntil ? frame * SLOW_MOTION : frame;
  now += dt;
  if (joining) guestFrame(dt);
  else hostFrame(dt);
  updateHeads(dt);
  updateBlood(dt);
  pads.forEach((p) => (p.material.emissiveIntensity = 1.2 + 0.6 * Math.sin(now * 6)));
  $("discs").textContent = "●".repeat(me.discs ?? 0) + "○".repeat(MAX_DISCS - (me.discs ?? MAX_DISCS));
  if (me.body) updateCamera();
  renderer.render(scene, camera);
});
