import * as THREE from 'three';
import './style.css';

const BLUE = 0x35d7ff;
const BLUE_DARK = 0x087fae;
const ORANGE = 0xff8a3d;
const ORANGE_DARK = 0xc94b25;
const ARENA_SIZE = 30;
const GRID = 30;
const TILE_SIZE = ARENA_SIZE / GRID;
const MATCH_SECONDS = 180;

const root = document.querySelector('#game-stage');
const ui = {
  start: document.querySelector('#start-screen'),
  pause: document.querySelector('#pause-screen'),
  result: document.querySelector('#result-screen'),
  hud: document.querySelector('#hud'),
  bottom: document.querySelector('#bottom-hud'),
  crosshair: document.querySelector('#crosshair'),
  timer: document.querySelector('#timer'),
  blue: document.querySelector('#blue-score'),
  orange: document.querySelector('#orange-score'),
  ink: document.querySelector('#ink-fill'),
  inkLabel: document.querySelector('#ink-label'),
  toast: document.querySelector('#toast'),
  hint: document.querySelector('#control-hint')
};

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (isTouch) {
  document.body.classList.add('touch-device');
  ui.hint.textContent = 'LEFT STICK MOVE · DRAG TO AIM · PAINT BUTTON SPRAY';
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
scene.fog = new THREE.Fog(0x0a1020, 24, 58);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 8);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xa9d9ff, 0x18202e, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-8, 18, 10);
scene.add(sun);

const floorBase = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE + 4, ARENA_SIZE + 4),
  new THREE.MeshStandardMaterial({ color: 0x202b3b, roughness: 0.94, metalness: 0.02 })
);
floorBase.rotation.x = -Math.PI / 2;
floorBase.position.y = -0.07;
scene.add(floorBase);

const tileGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.97, TILE_SIZE * 0.97);
const tiles = [];
const tileByKey = new Map();
const owners = new Int8Array(GRID * GRID);

for (let z = 0; z < GRID; z++) {
  for (let x = 0; x < GRID; x++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a3546,
      roughness: 0.82,
      metalness: 0.02,
      emissive: 0x000000,
      emissiveIntensity: 0.16
    });
    const tile = new THREE.Mesh(tileGeometry, material);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(-ARENA_SIZE / 2 + (x + 0.5) * TILE_SIZE, 0.005, -ARENA_SIZE / 2 + (z + 0.5) * TILE_SIZE);
    scene.add(tile);
    const index = z * GRID + x;
    tiles.push(tile);
    tileByKey.set(index, tile);
  }
}

function addBox(x, y, z, sx, sy, sz, color, emissive = 0x000000) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.05, emissive, emissiveIntensity: 0.25 })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function addArenaEdge() {
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_SIZE + 1, 0.8, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x182334, roughness: 0.8 })
  );
  for (const z of [-ARENA_SIZE / 2 - 0.2, ARENA_SIZE / 2 + 0.2]) {
    const wall = edge.clone();
    wall.position.set(0, 0.32, z);
    scene.add(wall);
  }
  const side = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.8, ARENA_SIZE + 1),
    edge.material
  );
  for (const x of [-ARENA_SIZE / 2 - 0.2, ARENA_SIZE / 2 + 0.2]) {
    const wall = side.clone();
    wall.position.set(x, 0.32, 0);
    scene.add(wall);
  }
}
addArenaEdge();

// Cover blocks create lanes without making the small prototype arena difficult to read.
const cover = [
  [-6, 0.8, -4, 2.8, 1.6, 2.2, 0x34455a],
  [5.5, 0.65, -5.5, 2.2, 1.3, 2.2, 0x34455a],
  [-7, 0.55, 5.2, 2.4, 1.1, 2.0, 0x34455a],
  [6.5, 0.9, 5.4, 2.0, 1.8, 2.4, 0x34455a],
  [0, 0.55, -9, 3.2, 1.1, 1.2, 0x40516a],
  [0, 0.55, 9, 3.2, 1.1, 1.2, 0x40516a],
  [-11, 0.45, 0, 1.4, 0.9, 3.2, 0x2b3c52],
  [11, 0.45, 0, 1.4, 0.9, 3.2, 0x2b3c52]
];
for (const [x, y, z, sx, sy, sz, color] of cover) addBox(x, y, z, sx, sy, sz, color);

function makeCharacter(primary, secondary, isBot = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.55, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5, metalness: 0.08 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 0.88, 4, 8), bodyMat);
  body.position.y = 0.94;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), bodyMat);
  head.position.y = 1.78;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.16), trimMat);
  visor.position.set(0, 1.79, -0.29);
  group.add(visor);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.28), trimMat);
  pack.position.set(0, 1.08, 0.43);
  group.add(pack);
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), trimMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.38, 1.35, -0.45);
  gun.add(barrel);
  const nozzle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 10), bodyMat);
  nozzle.position.set(0.38, 1.35, -0.86);
  gun.add(nozzle);
  group.add(gun);
  if (isBot) {
    const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), trimMat);
    antenna.position.set(0.22, 2.17, 0);
    group.add(antenna);
  }
  scene.add(group);
  return group;
}

const player = {
  group: makeCharacter(BLUE, BLUE_DARK),
  position: new THREE.Vector3(0, 0, 10),
  verticalVelocity: 0,
  grounded: true,
  speed: 7.2,
  ink: 100,
  fireCooldown: 0,
  slideTimer: 0,
  slideCooldown: 0,
  health: 100
};
player.group.position.copy(player.position);

const bot = {
  group: makeCharacter(ORANGE, ORANGE_DARK, true),
  position: new THREE.Vector3(0, 0, -10),
  fireCooldown: 1.5,
  moveTimer: 0,
  target: new THREE.Vector3(0, 0, -5),
  health: 100
};
bot.group.position.copy(bot.position);

const projectiles = [];
const particles = [];
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const clock = new THREE.Clock();

let yaw = 0;
let pitch = 0.22;
let gameStarted = false;
let paused = false;
let ended = false;
let soundOn = false;
let elapsed = 0;
let timeLeft = MATCH_SECONDS;
let toastTimer = 0;
let fireHeld = false;
let jumpQueued = false;
let flowQueued = false;
let joystick = { x: 0, y: 0 };
let activePointers = new Map();
let audioContext = null;

const keys = new Set();
const clamp = THREE.MathUtils.clamp;

function tileCoords(x, z) {
  const gx = Math.floor((x + ARENA_SIZE / 2) / TILE_SIZE);
  const gz = Math.floor((z + ARENA_SIZE / 2) / TILE_SIZE);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return null;
  return { gx, gz, index: gz * GRID + gx };
}

function paintAt(position, team, radius = 1.55) {
  const color = team === 1 ? BLUE : ORANGE;
  const center = tileCoords(position.x, position.z);
  if (!center) return;
  const reach = Math.ceil(radius / TILE_SIZE);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const gx = center.gx + dx;
      const gz = center.gz + dz;
      if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
      const wx = -ARENA_SIZE / 2 + (gx + 0.5) * TILE_SIZE;
      const wz = -ARENA_SIZE / 2 + (gz + 0.5) * TILE_SIZE;
      const distance = Math.hypot(wx - position.x, wz - position.z);
      if (distance > radius * (0.72 + Math.random() * 0.3)) continue;
      const index = gz * GRID + gx;
      owners[index] = team;
      const tile = tileByKey.get(index);
      tile.material.color.setHex(team === 1 ? 0x147ea8 : 0xb94d24);
      tile.material.emissive.setHex(color);
      tile.material.emissiveIntensity = 0.22;
    }
  }
  updateScore();
  spawnSplash(position, color);
}

function updateScore() {
  let blue = 0;
  let orange = 0;
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === 1) blue++;
    else if (owners[i] === 2) orange++;
  }
  const total = owners.length;
  const b = Math.round((blue / total) * 100);
  const o = Math.round((orange / total) * 100);
  ui.blue.textContent = b + '%';
  ui.orange.textContent = o + '%';
  return { blue: b, orange: o };
}

function spawnSplash(position, color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.22, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.045, position.z);
  scene.add(ring);
  particles.push({ mesh: ring, life: 0.42, maxLife: 0.42, ring: true });
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    dot.position.set(position.x, 0.12, position.z);
    scene.add(dot);
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      mesh: dot,
      life: 0.34 + Math.random() * 0.18,
      maxLife: 0.5,
      velocity: new THREE.Vector3(Math.cos(angle) * (1 + Math.random() * 2), 1 + Math.random() * 2, Math.sin(angle) * (1 + Math.random() * 2))
    });
  }
}

function playPop() {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(160, audioContext.currentTime + 0.09);
    gain.gain.setValueAtTime(0.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.11);
  } catch { /* Audio is optional in the prototype. */ }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  toastTimer = 1.5;
}

function getAimPoint() {
  raycaster.setFromCamera(centerScreen, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, aimPoint);
  if (hit) return aimPoint.clone();
  return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 18);
}

function spawnProjectile(origin, target, team) {
  const color = team === 1 ? BLUE : ORANGE;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.65,
    roughness: 0.3
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), material);
  mesh.position.copy(origin);
  scene.add(mesh);
  const direction = target.clone().sub(origin).normalize();
  projectiles.push({
    mesh,
    velocity: direction.multiplyScalar(team === 1 ? 32 : 22),
    life: 1.25,
    team
  });
}

function firePlayer() {
  if (!gameStarted || paused || ended || player.fireCooldown > 0 || player.ink < 5) return;
  player.fireCooldown = 0.13;
  player.ink = Math.max(0, player.ink - 5);
  const origin = player.position.clone().add(new THREE.Vector3(0.35, 1.42, 0));
  const target = getAimPoint();
  spawnProjectile(origin, target, 1);
  updateInk();
  playPop();
}

function fireBot() {
  const target = new THREE.Vector3(
    player.position.x + (Math.random() - 0.5) * 8,
    0,
    player.position.z + (Math.random() - 0.5) * 8
  );
  const origin = bot.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  spawnProjectile(origin, target, 2);
}

function updateInk() {
  ui.ink.style.width = player.ink + '%';
  ui.inkLabel.textContent = Math.round(player.ink);
}

function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= delta;
    p.mesh.position.addScaledVector(p.velocity, delta);
    const pos = p.mesh.position;
    if (pos.y <= 0.12 || Math.abs(pos.x) > ARENA_SIZE / 2 || Math.abs(pos.z) > ARENA_SIZE / 2 || p.life <= 0) {
      if (Math.abs(pos.x) < ARENA_SIZE / 2 && Math.abs(pos.z) < ARENA_SIZE / 2) {
        paintAt(new THREE.Vector3(pos.x, 0, pos.z), p.team, p.team === 1 ? 1.5 : 1.25);
      }
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= delta;
    const progress = 1 - Math.max(0, p.life) / p.maxLife;
    if (p.ring) {
      p.mesh.scale.setScalar(1 + progress * 3);
      p.mesh.material.opacity = 0.8 * (1 - progress);
    } else {
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= 6 * delta;
      p.mesh.scale.setScalar(Math.max(0.05, 1 - progress));
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function movementInput() {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + joystick.x;
  const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - joystick.y;
  const v = new THREE.Vector2(x, y);
  if (v.length() > 1) v.normalize();
  return v;
}

function updatePlayer(delta) {
  const input = movementInput();
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const move = new THREE.Vector3()
    .addScaledVector(right, input.x)
    .addScaledVector(forward, input.y);
  if (move.lengthSq() > 0.001) move.normalize();

  if ((keys.has('ShiftLeft') || keys.has('ShiftRight') || flowQueued) && player.slideCooldown <= 0 && move.lengthSq() > 0.01) {
    player.slideTimer = 0.42;
    player.slideCooldown = 2.2;
    flowQueued = false;
    showToast('FLOW SLIDE!');
  }
  player.slideTimer = Math.max(0, player.slideTimer - delta);
  player.slideCooldown = Math.max(0, player.slideCooldown - delta);
  const speed = player.speed * (player.slideTimer > 0 ? 2.15 : 1);
  player.position.x += move.x * speed * delta;
  player.position.z += move.z * speed * delta;

  if (jumpQueued && player.grounded) {
    player.verticalVelocity = 7.2;
    player.grounded = false;
  }
  jumpQueued = false;
  if (!player.grounded) {
    player.verticalVelocity -= 19 * delta;
    player.position.y += player.verticalVelocity * delta;
    if (player.position.y <= 0) {
      player.position.y = 0;
      player.verticalVelocity = 0;
      player.grounded = true;
    }
  }

  const limit = ARENA_SIZE / 2 - 0.8;
  player.position.x = clamp(player.position.x, -limit, limit);
  player.position.z = clamp(player.position.z, -limit, limit);
  player.group.position.copy(player.position);
  if (move.lengthSq() > 0.001) player.group.rotation.y = Math.atan2(-move.x, -move.z);
  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.ink = Math.min(100, player.ink + delta * 9);
  updateInk();
}

function updateBot(delta) {
  bot.moveTimer -= delta;
  bot.fireCooldown -= delta;
  if (bot.moveTimer <= 0) {
    bot.target.set((Math.random() - 0.5) * 19, 0, -5 - Math.random() * 8);
    bot.moveTimer = 2 + Math.random() * 2.5;
  }
  const direction = bot.target.clone().sub(bot.position);
  direction.y = 0;
  if (direction.length() > 0.3) {
    direction.normalize();
    bot.position.addScaledVector(direction, 2.5 * delta);
    bot.group.rotation.y = Math.atan2(-direction.x, -direction.z);
  }
  bot.position.x = clamp(bot.position.x, -13.5, 13.5);
  bot.position.z = clamp(bot.position.z, -13.5, 13.5);
  bot.group.position.copy(bot.position);
  if (bot.fireCooldown <= 0) {
    fireBot();
    bot.fireCooldown = 1.35 + Math.random() * 0.7;
  }
}

function updateCamera(delta) {
  const target = player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  const distance = 6.8;
  const offset = new THREE.Vector3(
    Math.sin(yaw) * distance * Math.cos(pitch),
    2.1 + Math.sin(pitch) * 5.2,
    Math.cos(yaw) * distance * Math.cos(pitch)
  );
  const desired = target.clone().add(offset);
  camera.position.lerp(desired, 1 - Math.exp(-10 * delta));
  camera.lookAt(target);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function finishMatch() {
  ended = true;
  gameStarted = false;
  const score = updateScore();
  document.querySelector('#final-blue').textContent = score.blue + '%';
  document.querySelector('#final-orange').textContent = score.orange + '%';
  const won = score.blue >= score.orange;
  document.querySelector('#result-title').innerHTML = won ? 'FIELD<br><em>CLAIMED.</em>' : 'KEEP<br><em>PAINTING.</em>';
  document.querySelector('#result-copy').textContent = won ? 'Your crew covered more ground. Nice work.' : 'The rival crew edged ahead. Run it back.';
  ui.result.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetMatch() {
  for (let i = 0; i < owners.length; i++) {
    owners[i] = 0;
    const tile = tiles[i];
    tile.material.color.setHex(0x2a3546);
    tile.material.emissive.setHex(0x000000);
  }
  for (const p of projectiles) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  projectiles.length = 0;
  for (const p of particles) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  particles.length = 0;
  player.position.set(0, 0, 10);
  player.group.position.copy(player.position);
  player.group.rotation.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.grounded = true;
  player.ink = 100;
  player.slideTimer = 0;
  player.slideCooldown = 0;
  bot.position.set(0, 0, -10);
  bot.group.position.copy(bot.position);
  bot.fireCooldown = 1.5;
  timeLeft = MATCH_SECONDS;
  elapsed = 0;
  ended = false;
  paused = false;
  updateScore();
  updateInk();
  ui.timer.textContent = formatTime(timeLeft);
  ui.result.classList.add('hidden');
  ui.pause.classList.add('hidden');
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
  showToast('COVER THE FIELD!');
}

function pauseGame() {
  if (!gameStarted || ended) return;
  paused = true;
  gameStarted = false;
  ui.pause.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

document.querySelector('#start-button').addEventListener('click', startGame);
document.querySelector('#resume-button').addEventListener('click', () => {
  if (ended) return;
  paused = false;
  gameStarted = true;
  ui.pause.classList.add('hidden');
  if (!isTouch && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
});
document.querySelector('#restart-button').addEventListener('click', resetMatch);
document.querySelector('#play-again-button').addEventListener('click', resetMatch);
document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  soundOn = !soundOn;
  event.currentTarget.classList.toggle('active', soundOn);
  event.currentTarget.textContent = soundOn ? '♫' : '♪';
  if (soundOn) playPop();
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameStarted && !isTouch) pauseGame();
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement && gameStarted) {
    yaw -= event.movementX * 0.0028;
    pitch = clamp(pitch + event.movementY * 0.0018, -0.12, 0.62);
  }
});

document.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space') jumpQueued = true;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') flowQueued = true;
  if (event.code === 'Escape' && gameStarted && !isTouch) pauseGame();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 0 && gameStarted && !paused) firePlayer();
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

const joystickEl = document.querySelector('#joystick');
const knobEl = document.querySelector('#joystick-knob');
const fireButton = document.querySelector('#fire-button');
const jumpButton = document.querySelector('#jump-button');

function updateJoystick(event) {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.32;
  const length = Math.min(max, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const px = Math.cos(angle) * length;
  const py = Math.sin(angle) * length;
  knobEl.style.transform = `translate(${px}px, ${py}px)`;
  joystick.x = px / max;
  joystick.y = py / max;
}

joystickEl.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  joystickEl.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, 'stick');
  updateJoystick(event);
});
joystickEl.addEventListener('pointermove', (event) => {
  if (activePointers.get(event.pointerId) === 'stick') updateJoystick(event);
});
function releasePointer(event) {
  if (activePointers.get(event.pointerId) === 'stick') {
    joystick = { x: 0, y: 0 };
    knobEl.style.transform = 'translate(0, 0)';
  }
  activePointers.delete(event.pointerId);
}
joystickEl.addEventListener('pointerup', releasePointer);
joystickEl.addEventListener('pointercancel', releasePointer);

fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  fireHeld = true;
  firePlayer();
});
fireButton.addEventListener('pointerup', () => { fireHeld = false; });
fireButton.addEventListener('pointercancel', () => { fireHeld = false; });
jumpButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  jumpQueued = true;
});

// On touch screens, dragging the open right side of the screen rotates the camera.
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!isTouch || event.clientX < innerWidth * 0.38 || event.target.closest('button')) return;
  activePointers.set(event.pointerId, { type: 'look', x: event.clientX, y: event.clientY });
});
renderer.domElement.addEventListener('pointermove', (event) => {
  const state = activePointers.get(event.pointerId);
  if (!isTouch || !state || state.type !== 'look') return;
  const dx = event.clientX - state.x;
  const dy = event.clientY - state.y;
  yaw -= dx * 0.006;
  pitch = clamp(pitch + dy * 0.004, -0.12, 0.62);
  state.x = event.clientX;
  state.y = event.clientY;
});
renderer.domElement.addEventListener('pointerup', releasePointer);
renderer.domElement.addEventListener('pointercancel', releasePointer);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  elapsed += delta;
  if (gameStarted && !paused && !ended) {
    timeLeft -= delta;
    ui.timer.textContent = formatTime(timeLeft);
    updatePlayer(delta);
    updateBot(delta);
    if (fireHeld) firePlayer();
    updateProjectiles(delta);
    updateParticles(delta);
    if (timeLeft <= 0) finishMatch();
  } else {
    updateParticles(delta);
    updateProjectiles(delta);
  }
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) ui.toast.classList.remove('show');
  }
  updateCamera(delta);
  renderer.render(scene, camera);
}
animate();

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

showToast('WELCOME TO THE YARD');
