import * as THREE from 'three';
import './style.css';

const BLUE = 1;
const ORANGE = 2;
const TEAM = {
  1: { ink: '#20d8e9', deep: '#087e9a', light: '#a4f7ff', dark: '#063b50' },
  2: { ink: '#ff7652', deep: '#b83c31', light: '#ffd0a9', dark: '#54212c' }
};
const ARENA = 40;
const HALF = ARENA / 2;
const GRID = 48;
const MATCH_SECONDS = 180;
const clamp = THREE.MathUtils.clamp;
const root = document.querySelector('#game-stage');
const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start-screen'), pause: $('pause-screen'), result: $('result-screen'),
  timer: $('timer'), blue: $('blue-score'), orange: $('orange-score'),
  blueFill: $('blue-fill'), orangeFill: $('orange-fill'),
  ink: $('ink-fill'), inkLabel: $('ink-label'),
  health: $('health-fill'), healthLabel: $('health-label'),
  flow: $('flow-fill'), flowLabel: $('flow-label'),
  toast: $('toast'), hit: $('hit-flash'), mini: $('mini-map'),
  blueRoster: $('blue-roster'), orangeRoster: $('orange-roster'),
  eliminations: $('elimination-count'), hint: $('control-hint')
};
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (isTouch) {
  document.body.classList.add('touch-device');
  ui.hint.textContent = 'LEFT STICK MOVE  ·  DRAG TO AIM  ·  TAP SPRAY';
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x13202b);
scene.fog = new THREE.Fog(0x13202b, 32, 76);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 120);
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb8e6f1, 0x202d39, 2.05));
const sun = new THREE.DirectionalLight(0xffe7cb, 2.15);
sun.position.set(-13, 24, 12);
scene.add(sun);
const fillLight = new THREE.PointLight(0x21c9e8, 35, 34, 2);
fillLight.position.set(-12, 8, -5);
scene.add(fillLight);
const warmLight = new THREE.PointLight(0xff7553, 27, 28, 2);
warmLight.position.set(13, 7, 10);
scene.add(warmLight);

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 10),
  smallSphere: new THREE.SphereGeometry(1, 8, 7),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  ring: new THREE.TorusGeometry(0.25, 0.07, 6, 12),
  torso: new THREE.CapsuleGeometry(0.34, 0.62, 3, 8),
  head: new THREE.SphereGeometry(0.30, 12, 10),
  limb: new THREE.CapsuleGeometry(0.115, 0.40, 2, 7),
  shoe: new THREE.BoxGeometry(0.34, 0.18, 0.49)
};
const mats = {};
function mat(key, color, roughness = 0.78, metalness = 0.08, emissive = 0x000000) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.35 : 0
  });
  return mats[key];
}
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}
function block(x, y, z, sx, sy, sz, color, options = {}) {
  const item = mesh(shared.box, mat('world-' + color, color, options.roughness ?? 0.74, options.metalness ?? 0.12, options.emissive ?? 0), scene, x, y, z);
  item.scale.set(sx, sy, sz);
  if (options.rotation) item.rotation.set(options.rotation.x || 0, options.rotation.y || 0, options.rotation.z || 0);
  return item;
}
function cylinder(x, y, z, radius, height, color, rotationZ = 0) {
  const item = mesh(shared.cylinder, mat('cyl-' + color, color, 0.63, 0.36), scene, x, y, z);
  item.scale.set(radius, height, radius);
  item.rotation.z = rotationZ;
  return item;
}

// One textured field replaces the old 900-material checkerboard. Paint is drawn
// into this canvas as irregular paths, so territory remains visible as it grows.
const paintCanvas = document.createElement('canvas');
paintCanvas.width = 1024;
paintCanvas.height = 1024;
const paintCtx = paintCanvas.getContext('2d', { alpha: false });
paintCtx.fillStyle = '#263542';
paintCtx.fillRect(0, 0, 1024, 1024);
for (let i = 0; i < 2100; i++) {
  const x = Math.random() * 1024;
  const y = Math.random() * 1024;
  const r = Math.random() * 2.2 + 0.35;
  paintCtx.fillStyle = Math.random() > 0.5 ? 'rgba(190,214,218,.045)' : 'rgba(0,0,0,.08)';
  paintCtx.beginPath();
  paintCtx.arc(x, y, r, 0, Math.PI * 2);
  paintCtx.fill();
}
paintCtx.strokeStyle = 'rgba(211,230,229,.10)';
paintCtx.lineWidth = 3;
for (let i = 1; i < 8; i++) {
  const p = i * 128;
  paintCtx.beginPath(); paintCtx.moveTo(p, 0); paintCtx.lineTo(p, 1024); paintCtx.stroke();
  paintCtx.beginPath(); paintCtx.moveTo(0, p); paintCtx.lineTo(1024, p); paintCtx.stroke();
}
paintCtx.strokeStyle = 'rgba(151,183,188,.24)';
paintCtx.lineWidth = 5;
paintCtx.strokeRect(22, 22, 980, 980);
const paintTexture = new THREE.CanvasTexture(paintCanvas);
paintTexture.colorSpace = THREE.SRGBColorSpace;
paintTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
paintTexture.generateMipmaps = true;
paintTexture.minFilter = THREE.LinearMipmapLinearFilter;
const floor = mesh(
  new THREE.PlaneGeometry(ARENA, ARENA),
  new THREE.MeshStandardMaterial({ map: paintTexture, roughness: 0.84, metalness: 0.08 }),
  scene, 0, -0.045, 0
);
floor.rotation.x = -Math.PI / 2;
const underfloor = mesh(shared.box, mat('underfloor', 0x17242f, 0.94, 0.04), scene, 0, -0.42, 0);
underfloor.scale.set(ARENA + 1.2, 0.7, ARENA + 1.2);

// BREAKWATER: a coastal freight yard built from stacked containers, a central
// raised deck, loading ramps, service pipes, hazard stripes and light towers.
block(0, -0.82, 0, 44, 0.28, 44, 0x111d28);
for (const z of [-20.55, 20.55]) {
  block(0, 0.35, z, 41.5, 1.2, 0.55, 0x172733);
  block(0, 0.98, z, 41.5, 0.08, 0.12, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (const x of [-20.55, 20.55]) {
  block(x, 0.35, 0, 0.55, 1.2, 41.5, 0x172733);
  block(x, 0.98, 0, 0.12, 0.08, 41.5, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (let i = -3; i <= 3; i++) {
  block(i * 5.5, 0.09, -19.7, 2.2, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
  block(i * 5.5, 0.09, 19.7, 2.2, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
}

function addContainer(x, z, sx, sz, color, height = 2.4, raised = 0) {
  const y = raised + height / 2;
  block(x, y, z, sx, height, sz, color, { roughness: 0.58, metalness: 0.34 });
  for (let i = -Math.floor(sx / 1.25); i <= Math.floor(sx / 1.25); i++) {
    block(x + i * 0.62, y, z - sz / 2 - 0.018, 0.045, height * 0.86, 0.035, 0x526b76);
  }
  block(x, raised + 0.14, z - sz / 2 - 0.04, sx * 0.88, 0.12, 0.08, color === 0x27566a ? 0x20d8e9 : 0xff835d, { emissive: color === 0x27566a ? 0x087c96 : 0x9d3429 });
}
addContainer(-15.2, -11.4, 7.2, 4.1, 0x27566a, 2.6);
addContainer(14.8, -12.2, 7.1, 4.3, 0x704536, 2.6);
addContainer(-15.4, 11.2, 7.1, 4.3, 0x704536, 2.6);
addContainer(15.1, 11.8, 7.4, 4.1, 0x27566a, 2.6);
addContainer(-8.4, -1.5, 3.1, 5.2, 0x34495b, 1.65);
addContainer(8.3, 1.2, 3.2, 5.2, 0x43515b, 1.65);

// Raised centre deck and two walkable ramps.
block(0, 0.91, 0, 10.5, 0.42, 6.0, 0x465761, { roughness: 0.65, metalness: 0.28 });
block(0, 1.14, 0, 9.8, 0.055, 5.5, 0x71868a, { roughness: 0.7, metalness: 0.2 });
for (let x = -4; x <= 4; x += 2) block(x, 1.19, 0, 0.055, 0.04, 5.35, 0x233d4a);
const rampAngle = Math.atan2(1.05, 4.0);
const rampA = block(0, 0.52, 4.85, 5.8, 0.34, 4.25, 0x52636b, { rotation: { x: rampAngle } });
const rampB = block(0, 0.52, -4.85, 5.8, 0.34, 4.25, 0x52636b, { rotation: { x: -rampAngle } });
for (let z = -6.5; z <= 6.5; z += 1) {
  block(-2.7, 0.12, z, 0.11, 0.06, 0.28, 0xffc06b);
  block(2.7, 0.12, z, 0.11, 0.06, 0.28, 0xffc06b);
}
for (const x of [-5.25, 5.25]) {
  block(x, 1.48, 0, 0.18, 0.7, 5.8, 0x263a43);
  block(x, 1.85, 0, 0.20, 0.08, 5.8, 0x20b6c7, { emissive: 0x0a5365 });
}

// Low cover, bollards and pipe runs create readable lanes around the platform.
const coverPieces = [
  [-5.6, 0.65, -10.1, 4.2, 1.3, 2.0, 0x3e505c],
  [5.6, 0.62, 10.0, 4.0, 1.24, 2.0, 0x3e505c],
  [-10.2, 0.55, 5.8, 2.2, 1.1, 4.4, 0x314653],
  [10.1, 0.55, -6.2, 2.2, 1.1, 4.1, 0x314653],
  [0, 0.55, -13.5, 5.5, 1.1, 1.1, 0x3e515b],
  [0, 0.55, 13.5, 5.5, 1.1, 1.1, 0x3e515b]
];
for (const c of coverPieces) block(...c);
for (let i = 0; i < 7; i++) {
  const x = -17 + i * 5.65;
  cylinder(x, 0.58, -17.3, 0.22, 1.16, i % 2 ? 0x20b9ca : 0xff855e);
  cylinder(x, 0.58, 17.3, 0.22, 1.16, i % 2 ? 0xff855e : 0x20b9ca);
}
for (const z of [-15.5, 15.5]) {
  block(-19.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b);
  block(19.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b);
  block(-19.1, 4.25, z, 1.2, 0.14, 1.2, 0x20d8e9, { emissive: 0x087e9a });
  block(19.1, 4.25, z, 1.2, 0.14, 1.2, 0xff7652, { emissive: 0x8d3226 });
}
for (let i = 0; i < 5; i++) {
  const z = -12 + i * 6;
  cylinder(-18.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2);
  cylinder(18.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2);
}

// A back-wall sign and overhead gantry give the level a recognisable skyline.
block(0, 5.8, -19.25, 11.8, 2.0, 0.42, 0x172d38);
block(0, 5.85, -18.98, 10.8, 0.12, 0.08, 0xff855e, { emissive: 0x873525 });
for (const x of [-6.5, 6.5]) {
  block(x, 4.9, -18.6, 0.22, 5.2, 0.22, 0x2b424d);
  block(x, 7.45, -18.6, 0.9, 0.16, 0.9, 0x20d8e9, { emissive: 0x087e9a });
}
block(0, 8.5, 0, 22, 0.22, 0.22, 0x344d58);
for (const x of [-10, 10]) block(x, 6.5, 0, 0.24, 4.0, 0.24, 0x344d58);
for (let x = -9; x <= 9; x += 3) {
  block(x, 8.27, 0, 0.07, 0.24, 0.07, 0x20b9ca);
}

function groundHeight(x, z) {
  if (Math.abs(x) <= 5.05 && z >= -2.9 && z <= 2.9) return 1.05;
  if (Math.abs(x) <= 2.85 && z > 2.9 && z < 6.9) return clamp((6.9 - z) / 4, 0, 1) * 1.05;
  if (Math.abs(x) <= 2.85 && z < -2.9 && z > -6.9) return clamp((z + 6.9) / 4, 0, 1) * 1.05;
  return 0;
}

// Small painted details on the arena floor.
paintCtx.fillStyle = 'rgba(221,236,225,.20)';
paintCtx.fillRect(492, 80, 40, 864);
paintCtx.fillRect(80, 492, 864, 40);
paintTexture.needsUpdate = true;

const owners = new Int8Array(GRID * GRID);
const gridStep = ARENA / GRID;
function cellAt(x, z) {
  const gx = Math.floor((x + HALF) / gridStep);
  const gz = Math.floor((z + HALF) / gridStep);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return -1;
  return gz * GRID + gx;
}
function drawSplat(position, team, radius, seed = Math.random()) {
  const color = TEAM[team].ink;
  const px = ((position.x + HALF) / ARENA) * paintCanvas.width;
  const py = ((HALF - position.z) / ARENA) * paintCanvas.height;
  const r = radius * (paintCanvas.width / ARENA);
  const sides = 13;
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    const wobble = 0.72 + 0.28 * Math.abs(Math.sin(seed * 17 + i * 2.41));
    const stretch = 0.83 + 0.30 * Math.sin(seed * 4 + i * 1.7);
    points.push([px + Math.cos(angle) * r * wobble * stretch, py + Math.sin(angle) * r * wobble]);
  }
  paintCtx.save();
  paintCtx.globalCompositeOperation = 'source-over';
  paintCtx.shadowColor = color;
  paintCtx.shadowBlur = Math.max(3, r * 0.08);
  const gradient = paintCtx.createRadialGradient(px - r * 0.24, py - r * 0.25, r * 0.04, px, py, r * 1.12);
  gradient.addColorStop(0, TEAM[team].light);
  gradient.addColorStop(0.23, color);
  gradient.addColorStop(1, TEAM[team].deep);
  paintCtx.fillStyle = gradient;
  paintCtx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) paintCtx.moveTo(p[0], p[1]);
    else paintCtx.lineTo(p[0], p[1]);
  });
  paintCtx.closePath();
  paintCtx.fill();
  paintCtx.shadowBlur = 0;
  paintCtx.globalAlpha = 0.8;
  paintCtx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = seed * 8 + i * 2.18;
    const d = r * (0.62 + (i % 3) * 0.18);
    const dot = r * (0.10 + (i % 2) * 0.055);
    paintCtx.beginPath();
    paintCtx.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, dot * 1.2, dot * 0.76, a, 0, Math.PI * 2);
    paintCtx.fill();
  }
  paintCtx.restore();
  paintTexture.needsUpdate = true;
}
let scoreCache = { blue: -1, orange: -1 };
function updateScore() {
  let blue = 0;
  let orange = 0;
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === BLUE) blue++;
    else if (owners[i] === ORANGE) orange++;
  }
  const total = owners.length;
  const b = Math.round(blue / total * 100);
  const o = Math.round(orange / total * 100);
  if (b !== scoreCache.blue || o !== scoreCache.orange) {
    ui.blue.textContent = b + '%';
    ui.orange.textContent = o + '%';
    ui.blueFill.style.width = b + '%';
    ui.orangeFill.style.width = o + '%';
    scoreCache = { blue: b, orange: o };
  }
  return { blue: b, orange: o };
}
function paintAt(position, team, radius = 1.75, quiet = false) {
  if (Math.abs(position.x) > HALF || Math.abs(position.z) > HALF) return;
  drawSplat(position, team, radius, Math.random());
  const cx = Math.floor((position.x + HALF) / gridStep);
  const cz = Math.floor((position.z + HALF) / gridStep);
  const reach = Math.ceil(radius / gridStep) + 1;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
      const wx = -HALF + (gx + 0.5) * gridStep;
      const wz = -HALF + (gz + 0.5) * gridStep;
      const distance = Math.hypot(wx - position.x, wz - position.z);
      const edge = 0.74 + 0.24 * Math.sin((gx * 19 + gz * 7) * 0.71);
      if (distance <= radius * edge) owners[gz * GRID + gx] = team;
    }
  }
  updateScore();
  if (!quiet) spawnSplash(position, team);
}
function seedArea(team, x, z) {
  for (let i = 0; i < 7; i++) {
    paintAt(new THREE.Vector3(x + (Math.random() - 0.5) * 5, 0, z + (Math.random() - 0.5) * 4), team, 2.2, true);
  }
}
seedArea(BLUE, 0, 15.5);
seedArea(ORANGE, 0, -15.5);

const projectileGeometry = new THREE.SphereGeometry(0.13, 8, 7);
const projectileMaterials = {
  1: new THREE.MeshBasicMaterial({ color: TEAM[1].ink }),
  2: new THREE.MeshBasicMaterial({ color: TEAM[2].ink })
};
const projectiles = [];
const particles = [];
function spawnSplash(position, team) {
  const color = team === BLUE ? 0x20d8e9 : 0xff7652;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.25, 14), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, groundHeight(position.x, position.z) + 0.07, position.z);
  scene.add(ring);
  particles.push({ mesh: ring, life: 0.42, maxLife: 0.42, ring: true });
  for (let i = 0; i < 3; i++) {
    const dot = mesh(shared.smallSphere, projectileMaterials[team], scene, position.x, groundHeight(position.x, position.z) + 0.1, position.z);
    const angle = Math.random() * Math.PI * 2;
    const scale = 0.07 + Math.random() * 0.06;
    dot.scale.setScalar(scale);
    particles.push({
      mesh: dot, life: 0.34 + Math.random() * 0.18, maxLife: 0.52,
      velocity: new THREE.Vector3(Math.cos(angle) * (1 + Math.random() * 2), 1 + Math.random() * 1.5, Math.sin(angle) * (1 + Math.random() * 2))
    });
  }
}
function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= delta;
    const progress = 1 - Math.max(0, p.life) / p.maxLife;
    if (p.ring) {
      p.mesh.scale.setScalar(1 + progress * 2.8);
      p.mesh.material.opacity = 0.72 * (1 - progress);
    } else {
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= 6.5 * delta;
      p.mesh.scale.multiplyScalar(1 - delta * 1.4);
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (!p.ring) p.mesh.material = projectileMaterials[1];
      else p.mesh.material.dispose();
      if (!p.ring) p.mesh.scale.set(1, 1, 1);
      particles.splice(i, 1);
    }
  }
}

function makeCharacter(team, variation = 0) {
  const group = new THREE.Group();
  const palette = TEAM[team];
  const bodyMat = mat('char-body-' + team, team === BLUE ? 0x159bb4 : 0xd85c46, 0.58, 0.08);
  const trimMat = mat('char-trim-' + team, team === BLUE ? 0x092f45 : 0x54212c, 0.55, 0.15);
  const clothMat = mat('char-cloth-' + team, team === BLUE ? 0x25384a : 0x44333b, 0.83, 0.03);
  const skinColors = [0xb66e4c, 0xd39269, 0x8b523f, 0xd6a078, 0x9d6349];
  const skin = mat('skin-' + variation, skinColors[variation % skinColors.length], 0.72, 0.02);
  const hairColors = [0x17252b, 0x3e2522, 0x69462d, 0x202a3b, 0x4d293e];
  const hair = mat('hair-' + variation, hairColors[variation % hairColors.length], 0.76, 0.02);
  const white = mat('eye-white', 0xf5f2df, 0.42, 0.02);
  const dark = mat('eye-dark', 0x12202a, 0.4, 0.02);
  const sneaker = mat('sneaker-' + team, team === BLUE ? 0xc5f7f2 : 0xffd6be, 0.58, 0.05);
  mesh(shared.torso, bodyMat, group, 0, 1.03, 0.02);
  const jacket = mesh(shared.box, clothMat, group, 0, 1.10, -0.04);
  jacket.scale.set(0.62, 0.48, 0.49);
  const chest = mesh(shared.box, bodyMat, group, 0, 1.12, -0.30);
  chest.scale.set(0.31, 0.24, 0.035);
  mesh(shared.head, skin, group, 0, 1.73, -0.04);
  const hairCap = mesh(shared.sphere, hair, group, 0, 1.94, 0.005);
  hairCap.scale.set(1.02, 0.52, 1.03);
  const fringe = mesh(shared.sphere, hair, group, 0, 1.84, -0.25);
  fringe.scale.set(0.77, 0.28, 0.45);
  for (const side of [-1, 1]) {
    mesh(shared.smallSphere, white, group, side * 0.105, 1.72, -0.315).scale.set(0.09, 0.105, 0.045);
    mesh(shared.smallSphere, dark, group, side * 0.105, 1.72, -0.354).scale.set(0.045, 0.065, 0.025);
    const arm = mesh(shared.limb, clothMat, group, side * 0.43, 1.17, -0.04);
    arm.rotation.z = side * -0.28;
    mesh(shared.smallSphere, skin, group, side * 0.47, 0.88, -0.16).scale.set(0.13, 0.13, 0.13);
    const leg = mesh(shared.limb, clothMat, group, side * 0.17, 0.48, 0.025);
    leg.rotation.x = 0.08;
    mesh(shared.shoe, sneaker, group, side * 0.18, 0.13, -0.10);
  }
  const pack = mesh(shared.box, trimMat, group, 0, 1.08, 0.39);
  pack.scale.set(0.48, 0.53, 0.25);
  const packStripe = mesh(shared.box, bodyMat, group, 0, 1.09, 0.53);
  packStripe.scale.set(0.29, 0.12, 0.025);
  const headband = mesh(shared.box, bodyMat, group, 0, 1.88, -0.27);
  headband.scale.set(0.57, 0.09, 0.09);
  // Original compact pressure sprayer: twin reservoir, offset grip and wide nozzle.
  const weapon = new THREE.Group();
  const barrel = mesh(shared.cylinder, trimMat, weapon, 0, 0, -0.39);
  barrel.rotation.x = Math.PI / 2;
  barrel.scale.set(0.13, 0.77, 0.13);
  const nozzle = mesh(shared.cylinder, bodyMat, weapon, 0, 0, -0.82);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.scale.set(0.22, 0.10, 0.22);
  const tank = mesh(shared.sphere, bodyMat, weapon, 0.20, 0.13, 0.12);
  tank.scale.set(0.17, 0.18, 0.24);
  const grip = mesh(shared.box, trimMat, weapon, 0.02, -0.20, -0.05);
  grip.scale.set(0.13, 0.30, 0.17);
  weapon.position.set(0.47, 1.20, -0.24);
  group.add(weapon);
  group.userData.weapon = weapon;
  group.userData.legs = group.children.filter((child) => child.geometry === shared.limb);
  group.userData.arms = group.children.filter((child) => child.geometry === shared.limb).slice(0, 2);
  group.userData.palette = palette;
  return group;
}

function createActor(team, variation, x, z, playerControlled = false) {
  const group = makeCharacter(team, variation);
  const actor = {
    team, variation, group, position: new THREE.Vector3(x, groundHeight(x, z), z),
    player: playerControlled, health: 100, maxHealth: 100,
    fireCooldown: 0.6 + Math.random() * 1.4, paintCooldown: 0.3 + Math.random() * 0.4,
    moveCooldown: 0, target: new THREE.Vector3(x, 0, z),
    respawn: 0, invulnerable: 0, eliminations: 0, walkPhase: Math.random() * 6,
    ink: 100, flow: 0, flowCooldown: 0, verticalVelocity: 0, grounded: true
  };
  group.position.copy(actor.position);
  scene.add(group);
  return actor;
}
const player = createActor(BLUE, 0, 0, 15.2, true);
const blueBots = [
  createActor(BLUE, 1, -8.8, 12.5),
  createActor(BLUE, 2, -4.5, 17),
  createActor(BLUE, 3, 4.8, 17),
  createActor(BLUE, 4, 9.0, 12.5)
];
const orangeBots = [
  createActor(ORANGE, 0, -9.0, -12.5),
  createActor(ORANGE, 1, -4.5, -17),
  createActor(ORANGE, 2, 4.8, -17),
  createActor(ORANGE, 3, 9.0, -12.5),
  createActor(ORANGE, 4, 0, -13.5)
];
const blueTeam = [player, ...blueBots];
const orangeTeam = orangeBots;
const actors = [...blueTeam, ...orangeTeam];
function buildRoster(element, team) {
  element.innerHTML = team.map((actor, index) =>
    '<span class="crew-dot ' + (actor.player ? 'is-player' : '') + '" title="' + (actor.player ? 'YOU' : 'CREW ' + (index + 1)) + '"></span>'
  ).join('');
}
buildRoster(ui.blueRoster, blueTeam);
buildRoster(ui.orangeRoster, orangeTeam);

const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const clock = new THREE.Clock();
let yaw = 0;
let pitch = 0.20;
let gameStarted = false;
let paused = false;
let ended = false;
let soundOn = false;
let timeLeft = MATCH_SECONDS;
let toastTimer = 0;
let fireHeld = false;
let jumpQueued = false;
let flowQueued = false;
let joystick = { x: 0, y: 0 };
let activePointers = new Map();
let audioContext = null;
let miniTimer = 0;
let paintTrailTimer = 0;
let totalEliminations = 0;
let hitTimer = 0;
const keys = new Set();

function updateInk() {
  ui.ink.style.width = player.ink + '%';
  ui.inkLabel.textContent = Math.round(player.ink);
  ui.health.style.width = player.health + '%';
  ui.healthLabel.textContent = Math.round(player.health);
  const flowValue = player.flowCooldown <= 0 ? 100 : (1 - player.flowCooldown / 2.2) * 100;
  ui.flow.style.width = clamp(flowValue, 0, 100) + '%';
  ui.flowLabel.textContent = player.flowCooldown <= 0 ? 'READY' : 'CHARGING';
}
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  toastTimer = 1.5;
}
function playPop(power = 1) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380 + power * 95, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(135, audioContext.currentTime + 0.11);
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.13);
  } catch { /* Optional sound; gameplay does not depend on audio. */ }
}
function getAimPoint() {
  raycaster.setFromCamera(centerScreen, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, aimPoint);
  if (hit) {
    const flatDistance = Math.hypot(aimPoint.x - player.position.x, aimPoint.z - player.position.z);
    if (flatDistance > 3.2) return aimPoint.clone();
  }
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  return player.position.clone().addScaledVector(forward, 18);
}
function muzzlePosition(actor) {
  const forward = new THREE.Vector3(Math.sin(actor.group.rotation.y), 0, -Math.cos(actor.group.rotation.y));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return actor.position.clone().addScaledVector(forward, 0.53).addScaledVector(right, 0.30).add(new THREE.Vector3(0, 1.27, 0));
}
function spawnProjectile(origin, target, team, owner) {
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterials[team]);
  mesh.position.copy(origin);
  scene.add(mesh);
  const delta = target.clone().sub(origin);
  const distance = Math.max(1, Math.hypot(delta.x, delta.z));
  const travel = clamp(distance / 27, 0.17, 1.15);
  const gravity = -3.4;
  const velocity = new THREE.Vector3(delta.x / travel, delta.y / travel - 0.5 * gravity * travel, delta.z / travel);
  projectiles.push({ mesh, velocity, gravity, life: 1.3, team, owner, radius: 0.34 });
}
function fireActor(actor, target) {
  if (actor.fireCooldown > 0 || actor.ink < 4 || !actor.group.visible) return;
  actor.fireCooldown = actor.player ? 0.115 : 0.95 + Math.random() * 0.6;
  actor.ink = Math.max(0, actor.ink - (actor.player ? 4.2 : 3.2));
  const destination = target.clone();
  destination.y = groundHeight(destination.x, destination.z) + 0.12;
  if (!actor.player) {
    destination.x += (Math.random() - 0.5) * 2.4;
    destination.z += (Math.random() - 0.5) * 2.4;
  }
  spawnProjectile(muzzlePosition(actor), destination, actor.team, actor);
  if (actor.player) {
    updateInk();
    playPop(1);
  }
}
function nearestEnemy(actor) {
  const candidates = actor.team === BLUE ? orangeTeam : blueTeam;
  let best = null;
  let distance = Infinity;
  for (const other of candidates) {
    if (!other.group.visible || other.respawn > 0) continue;
    const d = actor.position.distanceToSquared(other.position);
    if (d < distance) { distance = d; best = other; }
  }
  return best;
}
function removeProjectile(index) {
  const projectile = projectiles[index];
  scene.remove(projectile.mesh);
  projectiles.splice(index, 1);
}
function respawnActor(actor) {
  const sign = actor.team === BLUE ? 1 : -1;
  const side = actor.variation % 2 === 0 ? -1 : 1;
  actor.position.set(side * (3.5 + actor.variation * 1.15), 0, sign * (14.0 + Math.random() * 2.2));
  actor.position.y = groundHeight(actor.position.x, actor.position.z);
  actor.health = 100;
  actor.ink = 100;
  actor.respawn = 0;
  actor.invulnerable = 1.4;
  actor.group.visible = true;
  actor.group.position.copy(actor.position);
  actor.group.rotation.set(0, actor.team === BLUE ? 0 : Math.PI, 0);
}
function damageActor(actor, amount, source) {
  if (actor.invulnerable > 0 || !actor.group.visible) return;
  actor.health = Math.max(0, actor.health - amount);
  if (actor.player) {
    updateInk();
    ui.hit.classList.add('visible');
    hitTimer = 0.18;
  }
  if (actor.health <= 0) {
    actor.respawn = actor.player ? 2.3 : 3.4;
    actor.group.visible = false;
    if (source && source.player) {
      source.eliminations++;
      totalEliminations++;
      ui.eliminations.textContent = String(totalEliminations).padStart(2, '0');
      showToast('CREW SPLAT  +1');
      playPop(1.4);
    }
  }
}
function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= delta;
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.velocity.y += p.gravity * delta;
    const pos = p.mesh.position;
    let hitActor = false;
    for (const actor of actors) {
      if (actor.team === p.team || actor === p.owner || !actor.group.visible || actor.invulnerable > 0) continue;
      const dx = pos.x - actor.position.x;
      const dz = pos.z - actor.position.z;
      const dy = pos.y - (actor.position.y + 1.05);
      if (dx * dx + dz * dz < p.radius * p.radius && Math.abs(dy) < 0.8) {
        damageActor(actor, actor.player ? 22 : 36, p.owner);
        paintAt(new THREE.Vector3(pos.x, 0, pos.z), p.team, 1.3);
        hitActor = true;
        break;
      }
    }
    const floorY = groundHeight(pos.x, pos.z);
    if (hitActor || pos.y <= floorY + 0.12 || Math.abs(pos.x) > HALF || Math.abs(pos.z) > HALF || p.life <= 0) {
      if (!hitActor && Math.abs(pos.x) < HALF && Math.abs(pos.z) < HALF) {
        paintAt(new THREE.Vector3(pos.x, 0, pos.z), p.team, p.team === BLUE ? 1.55 : 1.45);
      }
      removeProjectile(i);
    }
  }
}

function movementInput() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joystick.x;
  const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - joystick.y;
  const vector = new THREE.Vector2(x, y);
  if (vector.length() > 1) vector.normalize();
  return vector;
}
function ownerAt(x, z) {
  const index = cellAt(x, z);
  return index < 0 ? 0 : owners[index];
}
function updatePlayer(delta) {
  const input = movementInput();
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const move = new THREE.Vector3().addScaledVector(right, input.x).addScaledVector(forward, input.y);
  if (move.lengthSq() > 0.001) move.normalize();

  if (flowQueued) {
    flowQueued = false;
    if (player.flowCooldown <= 0 && move.lengthSq() > 0.01 && ownerAt(player.position.x, player.position.z) === BLUE) {
      player.flow = 0.72;
      player.flowCooldown = 2.2;
      showToast('FLOWLINE  /  SURGE');
    } else if (player.flowCooldown <= 0) {
      showToast('FLOWLINE NEEDS YOUR INK');
    }
  }
  player.flow = Math.max(0, player.flow - delta);
  player.flowCooldown = Math.max(0, player.flowCooldown - delta);
  const speed = player.flow > 0 ? 13.7 : 7.4;
  const oldX = player.position.x;
  const oldZ = player.position.z;
  player.position.x = clamp(player.position.x + move.x * speed * delta, -18.7, 18.7);
  player.position.z = clamp(player.position.z + move.z * speed * delta, -18.7, 18.7);
  if (groundHeight(player.position.x, player.position.z) > 0 && Math.abs(player.position.x) > 2.8 && Math.abs(player.position.x) < 5.2) {
    player.position.x = oldX;
    player.position.z = oldZ;
  }
  const baseY = groundHeight(player.position.x, player.position.z);
  if (jumpQueued && player.grounded) {
    player.verticalVelocity = 7.3;
    player.grounded = false;
  }
  jumpQueued = false;
  if (!player.grounded) {
    player.verticalVelocity -= 19 * delta;
    player.position.y += player.verticalVelocity * delta;
    if (player.position.y <= baseY) {
      player.position.y = baseY;
      player.verticalVelocity = 0;
      player.grounded = true;
    }
  } else {
    player.position.y = baseY;
  }
  player.group.position.copy(player.position);
  if (move.lengthSq() > 0.001) player.group.rotation.y = Math.atan2(-move.x, -move.z);
  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.ink = Math.min(100, player.ink + delta * (ownerAt(player.position.x, player.position.z) === BLUE ? 14 : 8));
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  player.walkPhase += delta * (move.lengthSq() > 0 ? 10 : 2);
  animateActor(player, move.length());
  paintTrailTimer -= delta;
  if (move.lengthSq() > 0.03 && paintTrailTimer <= 0) {
    paintTrailTimer = 0.26;
    paintAt(new THREE.Vector3(player.position.x, 0, player.position.z), BLUE, 0.68, true);
  }
  updateInk();
}
function animateActor(actor, moving) {
  const limbs = actor.group.userData.legs || [];
  if (limbs.length >= 4) {
    const swing = moving > 0.05 ? Math.sin(actor.walkPhase) * 0.44 : 0;
    limbs[0].rotation.x = swing;
    limbs[1].rotation.x = -swing;
    limbs[2].rotation.x = -swing * 0.68;
    limbs[3].rotation.x = swing * 0.68;
  }
  actor.group.position.y += moving > 0.05 ? Math.abs(Math.sin(actor.walkPhase * 2)) * 0.035 : 0;
}
function updateBots(delta) {
  for (const actor of [...blueBots, ...orangeBots]) {
    if (actor.respawn > 0) {
      actor.respawn -= delta;
      if (actor.respawn <= 0) respawnActor(actor);
      continue;
    }
    if (!actor.group.visible) continue;
    actor.fireCooldown -= delta;
    actor.paintCooldown -= delta;
    actor.moveCooldown -= delta;
    actor.invulnerable = Math.max(0, actor.invulnerable - delta);
    const enemy = nearestEnemy(actor);
    if (actor.moveCooldown <= 0 || actor.position.distanceTo(actor.target) < 1.2) {
      const laneZ = actor.team === BLUE ? -5.5 - Math.random() * 8 : 5.5 + Math.random() * 8;
      actor.target.set((Math.random() - 0.5) * 28, 0, laneZ);
      actor.moveCooldown = 2.0 + Math.random() * 2.4;
    }
    const direction = actor.target.clone().sub(actor.position);
    direction.y = 0;
    if (direction.lengthSq() > 0.2) {
      direction.normalize();
      const oldX = actor.position.x;
      const oldZ = actor.position.z;
      actor.position.x = clamp(actor.position.x + direction.x * 3.15 * delta, -18.2, 18.2);
      actor.position.z = clamp(actor.position.z + direction.z * 3.15 * delta, -18.2, 18.2);
      if (Math.abs(actor.position.x) > 2.8 && Math.abs(actor.position.x) < 5.2 && groundHeight(actor.position.x, actor.position.z) > 0) {
        actor.position.x = oldX;
        actor.position.z = oldZ;
      }
      actor.position.y = groundHeight(actor.position.x, actor.position.z);
      actor.group.position.copy(actor.position);
      actor.group.rotation.y = Math.atan2(-direction.x, -direction.z);
      actor.walkPhase += delta * 8;
      animateActor(actor, 1);
    }
    if (actor.paintCooldown <= 0) {
      actor.paintCooldown = 0.72 + Math.random() * 0.45;
      paintAt(new THREE.Vector3(actor.position.x, 0, actor.position.z), actor.team, 0.86, true);
    }
    if (enemy && actor.fireCooldown <= 0 && actor.position.distanceTo(enemy.position) < 25) {
      actor.group.rotation.y = Math.atan2(-(enemy.position.x - actor.position.x), -(enemy.position.z - actor.position.z));
      fireActor(actor, enemy.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
    }
    actor.ink = Math.min(100, actor.ink + delta * 9);
  }
}
function updateCamera(delta) {
  const target = player.position.clone().add(new THREE.Vector3(0, 1.46, 0));
  const distance = 7.3;
  const offset = new THREE.Vector3(
    Math.sin(yaw) * distance * Math.cos(pitch),
    2.25 + Math.sin(pitch) * 5.0,
    Math.cos(yaw) * distance * Math.cos(pitch)
  );
  const desired = target.clone().add(offset);
  camera.position.lerp(desired, 1 - Math.exp(-10.5 * delta));
  camera.lookAt(target.clone().add(new THREE.Vector3(Math.sin(yaw) * 1.6, 0.08, -Math.cos(yaw) * 1.6)));
}
function updateMinimap(delta) {
  miniTimer -= delta;
  if (miniTimer > 0) return;
  miniTimer = 0.24;
  const canvas = ui.mini;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#182a36';
  ctx.fillRect(0, 0, size, size);
  const cell = size / GRID;
  for (let i = 0; i < owners.length; i++) {
    if (!owners[i]) continue;
    const x = (i % GRID) * cell;
    const y = Math.floor(i / GRID) * cell;
    ctx.fillStyle = owners[i] === BLUE ? '#20d8e9' : '#ff7652';
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, y, cell + 0.4, cell + 0.4);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(235,248,243,.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  for (const actor of actors) {
    if (!actor.group.visible) continue;
    const x = (actor.position.x + HALF) / ARENA * size;
    const y = (HALF - actor.position.z) / ARENA * size;
    ctx.fillStyle = actor.player ? '#ffffff' : (actor.team === BLUE ? '#a8f7ff' : '#ffd2b6');
    ctx.beginPath();
    ctx.arc(x, y, actor.player ? 5.5 : 3.4, 0, Math.PI * 2);
    ctx.fill();
    if (actor.player) {
      ctx.strokeStyle = '#142a35';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function finishMatch() {
  ended = true;
  gameStarted = false;
  const score = updateScore();
  $('final-blue').textContent = score.blue + '%';
  $('final-orange').textContent = score.orange + '%';
  $('final-elims').textContent = String(totalEliminations).padStart(2, '0');
  const won = score.blue >= score.orange;
  $('result-title').innerHTML = won ? 'FIELD<br><em>OWNED.</em>' : 'RUN IT<br><em>BACK.</em>';
  $('result-copy').textContent = won ? 'Your crew controlled more of Breakwater.' : 'The rival crew covered more of the yard this time.';
  ui.result.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function resetPaint() {
  owners.fill(0);
  paintCtx.fillStyle = '#263542';
  paintCtx.fillRect(0, 0, 1024, 1024);
  paintCtx.strokeStyle = 'rgba(211,230,229,.10)';
  paintCtx.lineWidth = 3;
  for (let i = 1; i < 8; i++) {
    const p = i * 128;
    paintCtx.beginPath(); paintCtx.moveTo(p, 0); paintCtx.lineTo(p, 1024); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(0, p); paintCtx.lineTo(1024, p); paintCtx.stroke();
  }
  paintCtx.strokeStyle = 'rgba(151,183,188,.24)';
  paintCtx.lineWidth = 5;
  paintCtx.strokeRect(22, 22, 980, 980);
  paintTexture.needsUpdate = true;
  seedArea(BLUE, 0, 15.5);
  seedArea(ORANGE, 0, -15.5);
  scoreCache = { blue: -1, orange: -1 };
  updateScore();
}
function resetMatch() {
  for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
  for (const p of particles) {
    scene.remove(p.mesh);
    if (p.ring) p.mesh.material.dispose();
  }
  particles.length = 0;
  resetPaint();
  totalEliminations = 0;
  ui.eliminations.textContent = '00';
  for (const actor of actors) {
    actor.health = 100;
    actor.ink = 100;
    actor.respawn = 0;
    actor.invulnerable = 0;
    actor.group.visible = true;
    const sign = actor.team === BLUE ? 1 : -1;
    const spread = actor.player ? 0 : (actor.variation - 2) * 2.2;
    actor.position.set(spread, 0, sign * (actor.player ? 15.2 : 13.4 + (actor.variation % 2) * 2.2));
    actor.position.y = groundHeight(actor.position.x, actor.position.z);
    actor.group.position.copy(actor.position);
    actor.group.rotation.set(0, actor.team === BLUE ? 0 : Math.PI, 0);
    actor.fireCooldown = 0.8 + Math.random();
    actor.paintCooldown = 0.3;
    actor.moveCooldown = 0;
    actor.flow = 0;
    actor.flowCooldown = 0;
  }
  player.health = 100;
  player.verticalVelocity = 0;
  player.grounded = true;
  player.ink = 100;
  timeLeft = MATCH_SECONDS;
  ended = false;
  paused = false;
  yaw = 0;
  pitch = 0.20;
  ui.timer.textContent = formatTime(timeLeft);
  ui.result.classList.add('hidden');
  ui.pause.classList.add('hidden');
  updateInk();
  startGame();
}
function startGame() {
  gameStarted = true;
  paused = false;
  ended = false;
  ui.start.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  if (!isTouch && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  showToast('BREAKWATER  /  TURF CONTROL');
}
function pauseGame() {
  if (!gameStarted || ended) return;
  paused = true;
  gameStarted = false;
  ui.pause.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

$('start-button').addEventListener('click', startGame);
$('resume-button').addEventListener('click', () => {
  if (ended) return;
  paused = false;
  gameStarted = true;
  ui.pause.classList.add('hidden');
  if (!isTouch && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
});
$('restart-button').addEventListener('click', resetMatch);
$('play-again-button').addEventListener('click', resetMatch);
$('sound-toggle').addEventListener('click', (event) => {
  soundOn = !soundOn;
  event.currentTarget.classList.toggle('active', soundOn);
  event.currentTarget.textContent = soundOn ? '♫' : '♪';
  playPop(0.8);
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameStarted && !isTouch) pauseGame();
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement && gameStarted) {
    yaw -= event.movementX * 0.0027;
    pitch = clamp(pitch + event.movementY * 0.0018, -0.16, 0.66);
  }
});
document.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && !event.repeat) jumpQueued = true;
  if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) flowQueued = true;
  if (event.code === 'Escape' && gameStarted && !isTouch) pauseGame();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 0 && gameStarted && !paused && !isTouch) fireActor(player, getAimPoint());
  if (isTouch && event.clientX > innerWidth * 0.38 && !event.target.closest('button')) {
    activePointers.set(event.pointerId, { type: 'look', x: event.clientX, y: event.clientY });
  }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  const state = activePointers.get(event.pointerId);
  if (!isTouch || !state || state.type !== 'look') return;
  const dx = event.clientX - state.x;
  const dy = event.clientY - state.y;
  yaw -= dx * 0.006;
  pitch = clamp(pitch + dy * 0.004, -0.16, 0.66);
  state.x = event.clientX;
  state.y = event.clientY;
});
function releasePointer(event) {
  const state = activePointers.get(event.pointerId);
  if (state && state.type === 'stick') {
    joystick = { x: 0, y: 0 };
    $('joystick-knob').style.transform = 'translate(0, 0)';
  }
  activePointers.delete(event.pointerId);
}
renderer.domElement.addEventListener('pointerup', releasePointer);
renderer.domElement.addEventListener('pointercancel', releasePointer);

const joystickEl = $('joystick');
const knobEl = $('joystick-knob');
const fireButton = $('fire-button');
const jumpButton = $('jump-button');
function updateJoystick(event) {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.30;
  const length = Math.min(max, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const px = Math.cos(angle) * length;
  const py = Math.sin(angle) * length;
  knobEl.style.transform = 'translate(' + px + 'px, ' + py + 'px)';
  joystick.x = px / max;
  joystick.y = py / max;
}
joystickEl.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  joystickEl.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { type: 'stick' });
  updateJoystick(event);
});
joystickEl.addEventListener('pointermove', (event) => {
  const state = activePointers.get(event.pointerId);
  if (state && state.type === 'stick') updateJoystick(event);
});
joystickEl.addEventListener('pointerup', releasePointer);
joystickEl.addEventListener('pointercancel', releasePointer);
fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  fireHeld = true;
  fireActor(player, getAimPoint());
});
fireButton.addEventListener('pointerup', () => { fireHeld = false; });
fireButton.addEventListener('pointercancel', () => { fireHeld = false; });
jumpButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  jumpQueued = true;
});
$('flow-button').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  flowQueued = true;
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  if (gameStarted && !paused && !ended) {
    timeLeft -= delta;
    ui.timer.textContent = formatTime(timeLeft);
    updatePlayer(delta);
    updateBots(delta);
    if (fireHeld) fireActor(player, getAimPoint());
    updateProjectiles(delta);
    if (timeLeft <= 0) finishMatch();
  } else {
    updateProjectiles(delta);
  }
  updateParticles(delta);
  updateMinimap(delta);
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) ui.toast.classList.remove('show');
  }
  if (hitTimer > 0) {
    hitTimer -= delta;
    if (hitTimer <= 0) ui.hit.classList.remove('visible');
  }
  updateCamera(delta);
  renderer.render(scene, camera);
}
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
updateScore();
updateInk();
ui.timer.textContent = formatTime(timeLeft);
showToast('BREAKWATER  /  TRAINING YARD');
animate();
