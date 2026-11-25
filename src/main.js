import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';
import './menu/menu.css';
import './hud/hud.css';
import { loadTracker } from './boot/loadTracker.js';
import { createOperatorGroup, attachRigid } from './operators/index.js';
import { WEAPONS, BOT_WEAPONS } from './gameplay/weapons.js';
import { createItems, ITEM_ORDER } from './gameplay/items.js';
import { createPixelBurst } from './gameplay/burst.js';
import { QualityManager } from './graphics/quality.js';
import { MatchIntro } from './intro/matchIntro.js';
import { NavGrid } from './ai/nav.js';
import { createBotBrain } from './ai/botBrain.js';

const BLUE = 1;
const ORANGE = 2;
const TEAM = {
  1: { ink: '#20d8e9', deep: '#087e9a', light: '#a4f7ff', dark: '#063b50' },
  2: { ink: '#ff7652', deep: '#b83c31', light: '#ffd0a9', dark: '#54212c' }
};
const ARENA = 76;
const HALF = ARENA / 2;
const GRID = 96;
const EXPAND = HALF - 26; // growth of the yard beyond the original 52 m layout
const SPAWN_Z = HALF - 6.5;
const MATCH_SECONDS = 180;
const clamp = THREE.MathUtils.clamp;
const root = document.querySelector('#game-stage');
const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start-screen'), weaponLabel: $('weapon-label'), intro: $('match-intro'), pause: $('pause-screen'), result: $('result-screen'),
  introPhase: $('match-intro-phase'), introCount: $('match-intro-count'), introStatus: $('match-intro-status'),
  introBlueRoster: $('intro-blue-roster'), introOrangeRoster: $('intro-orange-roster'),
  timer: $('timer'), blue: $('blue-score'), orange: $('orange-score'),
  blueFill: $('blue-fill'), orangeFill: $('orange-fill'),
  ink: $('ink-fill'), inkLabel: $('ink-label'),
  health: $('health-fill'), healthLabel: $('health-label'),
  flow: $('flow-fill'), flowLabel: $('flow-label'),
  toast: $('toast'), hit: $('hit-flash'), crosshair: $('crosshair'), mini: $('mini-map'),
  blueRoster: $('blue-roster'), orangeRoster: $('orange-roster'),
  eliminations: $('elimination-count'), hint: $('control-hint')
};
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

document.addEventListener('selectstart', (event) => {
  if (event.target.closest('#game-root')) event.preventDefault();
});
document.addEventListener('dragstart', (event) => {
  if (event.target.closest('#game-root')) event.preventDefault();
});
if (isTouch) {
  document.body.classList.add('touch-device');
  ui.hint.textContent = 'LEFT STICK MOVE  ·  TAP RUN TO LOCK  ·  SLIDE  ·  TAP SPRAY';
}

const scene = new THREE.Scene();
const skyHorizon = 0x83b4bc;
scene.background = new THREE.Color(skyHorizon);
scene.fog = new THREE.Fog(skyHorizon, 78, 205);

// A lightweight painted sky dome gives Breakwater a layered coastal atmosphere
// without an HDR download, extra render pass, or per-frame shader workload.
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 1024;
skyCanvas.height = 512;
const skyCtx = skyCanvas.getContext('2d');
const skyGradient = skyCtx.createLinearGradient(0, 0, 0, 512);
skyGradient.addColorStop(0, '#24536f');
skyGradient.addColorStop(0.26, '#4a879f');
skyGradient.addColorStop(0.56, '#8bbbc1');
skyGradient.addColorStop(0.72, '#c8c6ac');
skyGradient.addColorStop(1, '#738f91');
skyCtx.fillStyle = skyGradient;
skyCtx.fillRect(0, 0, 1024, 512);

// Low coastal cloud bands: soft layered strokes rather than hard-edged sprites.
for (let i = 0; i < 18; i++) {
  const x = 35 + ((i * 173) % 960);
  const y = 118 + ((i * 47) % 122);
  const width = 70 + ((i * 29) % 115);
  const height = 10 + ((i * 11) % 17);
  skyCtx.save();
  skyCtx.translate(x, y);
  skyCtx.rotate(((i % 5) - 2) * 0.035);
  const cloud = skyCtx.createRadialGradient(0, 0, 2, 0, 0, width);
  cloud.addColorStop(0, 'rgba(244,244,224,0.28)');
  cloud.addColorStop(0.42, 'rgba(229,239,226,0.15)');
  cloud.addColorStop(1, 'rgba(229,239,226,0)');
  skyCtx.fillStyle = cloud;
  skyCtx.scale(1, height / Math.max(1, width));
  skyCtx.beginPath();
  skyCtx.arc(0, 0, width, 0, Math.PI * 2);
  skyCtx.fill();
  skyCtx.restore();
}

// Warm sunlight diffuses across the upper-left sky and softens into the haze.
const sunHaze = skyCtx.createRadialGradient(205, 142, 2, 205, 142, 190);
sunHaze.addColorStop(0, 'rgba(255,224,174,0.42)');
sunHaze.addColorStop(0.22, 'rgba(255,218,174,0.16)');
sunHaze.addColorStop(1, 'rgba(255,218,174,0)');
skyCtx.fillStyle = sunHaze;
skyCtx.fillRect(0, 0, 1024, 512);
const skyTexture = new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace = THREE.SRGBColorSpace;
skyTexture.anisotropy = 4;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(235, 48, 24),
  new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false
  })
);
skyDome.layers.set(0);
skyDome.renderOrder = -1000;
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 280);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.15 : 1.4));
renderer.setSize(innerWidth, innerHeight);
skyTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.12;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x4c5961, 1.55));
const sun = new THREE.DirectionalLight(0xffedcf, 2.65);
sun.position.set(-13, 25, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 768 : 1536, isTouch ? 768 : 1536);
sun.shadow.camera.left = -33;
sun.shadow.camera.right = 33;
sun.shadow.camera.top = 33;
sun.shadow.camera.bottom = -33;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 88;
sun.shadow.bias = -0.00012;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);
const sunOffset = new THREE.Vector3(-13, 25, 11);
let fxScale = 1;
const quality = new QualityManager({ renderer, scene, camera, sun, isTouch, onFx: (value) => { fxScale = value; } });
const fillLight = new THREE.PointLight(0x42e7ef, 29, 42, 2);
fillLight.position.set(-12, 8, -5);
scene.add(fillLight);
const warmLight = new THREE.PointLight(0xff895f, 24, 38, 2);
warmLight.position.set(13, 7, 10);
scene.add(warmLight);
const rimLight = new THREE.PointLight(0xa8ffdc, 18, 30, 2);
rimLight.position.set(0, 7, 17);
scene.add(rimLight);

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  smallSphere: new THREE.SphereGeometry(1, 10, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
  ring: new THREE.TorusGeometry(0.25, 0.07, 8, 20),
  torso: new THREE.CapsuleGeometry(0.34, 0.62, 4, 12),
  head: new THREE.SphereGeometry(0.30, 16, 12),
  limb: new THREE.CapsuleGeometry(0.115, 0.40, 3, 9),
  shoe: new THREE.BoxGeometry(0.34, 0.18, 0.49),
  characterUpper: new THREE.CapsuleGeometry(0.115, 0.29, 4, 10),
  characterLower: new THREE.CapsuleGeometry(0.095, 0.25, 4, 10),
  characterLeg: new THREE.CapsuleGeometry(0.135, 0.31, 4, 10),
  finger: new THREE.CapsuleGeometry(0.018, 0.075, 2, 6),
  ear: new THREE.ConeGeometry(0.105, 0.30, 7),
  longEar: new THREE.CapsuleGeometry(0.067, 0.30, 3, 7)
};
const gripFingerDummy = new THREE.Object3D();
const mats = {};
const toonRamp = new THREE.DataTexture(new Uint8Array([
  38, 48, 62, 255, 92, 111, 122, 255,
  176, 194, 188, 255, 255, 250, 229, 255
]), 4, 1, THREE.RGBAFormat);
toonRamp.magFilter = THREE.NearestFilter;
toonRamp.minFilter = THREE.NearestFilter;
toonRamp.generateMipmaps = false;
toonRamp.needsUpdate = true;
function toonMat(key, color, emissive = 0x000000) {
  const id = 'toon-' + key;
  if (!mats[id]) mats[id] = new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp, emissive,
    emissiveIntensity: emissive ? 0.22 : 0
  });
  return mats[id];
}
function mat(key, color, roughness = 0.78, metalness = 0.08, emissive = 0x000000) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.35 : 0
  });
  return mats[key];
}
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.layers.enable(1);
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}
const solidBounds = [];
function block(x, y, z, sx, sy, sz, color, options = {}) {
  const item = mesh(shared.box, mat('world-' + color, color, options.roughness ?? 0.74, options.metalness ?? 0.12, options.emissive ?? 0), scene, x, y, z);
  item.scale.set(sx, sy, sz);
  item.castShadow = !!options.solid;
  item.receiveShadow = !!options.solid;
  if (options.rotation) item.rotation.set(options.rotation.x || 0, options.rotation.y || 0, options.rotation.z || 0);
  if (options.solid) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      options.rotation?.x || 0, options.rotation?.y || 0, options.rotation?.z || 0
    ));
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const ix of [-1, 1]) for (const iy of [-1, 1]) for (const iz of [-1, 1]) {
      const corner = new THREE.Vector3(ix * sx * 0.5, iy * sy * 0.5, iz * sz * 0.5).applyQuaternion(rotation);
      bounds.minX = Math.min(bounds.minX, x + corner.x);
      bounds.maxX = Math.max(bounds.maxX, x + corner.x);
      bounds.minY = Math.min(bounds.minY, y + corner.y);
      bounds.maxY = Math.max(bounds.maxY, y + corner.y);
      bounds.minZ = Math.min(bounds.minZ, z + corner.z);
      bounds.maxZ = Math.max(bounds.maxZ, z + corner.z);
    }
    solidBounds.push(bounds);
  }
  return item;
}
function cylinder(x, y, z, radius, height, color, rotationZ = 0, solid = false) {
  const item = mesh(shared.cylinder, mat('cyl-' + color, color, 0.63, 0.36), scene, x, y, z);
  item.scale.set(radius, height, radius);
  item.rotation.z = rotationZ;
  item.castShadow = solid;
  item.receiveShadow = solid;
  if (solid) {
    if (Math.abs(Math.sin(rotationZ)) > 0.5) {
      const halfX = Math.abs(Math.sin(rotationZ)) * height / 2 + Math.abs(Math.cos(rotationZ)) * radius;
      const halfZ = Math.abs(Math.cos(rotationZ)) * height / 2 + Math.abs(Math.sin(rotationZ)) * radius;
      solidBounds.push({
        minX: x - halfX, maxX: x + halfX,
        minY: y - radius, maxY: y + radius,
        minZ: z - halfZ, maxZ: z + halfZ
      });
    } else {
      solidBounds.push({ shape: 'circle', x, z, radius, minY: y - height / 2, maxY: y + height / 2 });
    }
  }
  return item;
}

// One textured field replaces the old 900-material checkerboard. Paint is drawn
// into this canvas as irregular paths, so territory remains visible as it grows.
const paintCanvas = document.createElement('canvas');
paintCanvas.width = 1024;
paintCanvas.height = 1024;
const paintCtx = paintCanvas.getContext('2d', { alpha: false });
const raisedPaintCanvas = document.createElement('canvas');
raisedPaintCanvas.width = 1024;
raisedPaintCanvas.height = 1024;
const raisedPaintCtx = raisedPaintCanvas.getContext('2d', { alpha: true });
raisedPaintCtx.clearRect(0, 0, 1024, 1024);


const paintRoughnessCanvas = document.createElement('canvas');
paintRoughnessCanvas.width = 1024;
paintRoughnessCanvas.height = 1024;
const paintRoughnessCtx = paintRoughnessCanvas.getContext('2d', { alpha: false });
paintRoughnessCtx.fillStyle = '#f4f4f4';
paintRoughnessCtx.fillRect(0, 0, 1024, 1024);

const paintHeightCanvas = document.createElement('canvas');
paintHeightCanvas.width = 1024;
paintHeightCanvas.height = 1024;
const paintHeightCtx = paintHeightCanvas.getContext('2d', { alpha: false });
paintHeightCtx.fillStyle = '#080808';
paintHeightCtx.fillRect(0, 0, 1024, 1024);

const paintClearcoatCanvas = document.createElement('canvas');
paintClearcoatCanvas.width = 1024;
paintClearcoatCanvas.height = 1024;
const paintClearcoatCtx = paintClearcoatCanvas.getContext('2d', { alpha: false });
paintClearcoatCtx.fillStyle = '#000000';
paintClearcoatCtx.fillRect(0, 0, 1024, 1024);

const paintRoughnessTexture = new THREE.CanvasTexture(paintRoughnessCanvas);
const paintHeightTexture = new THREE.CanvasTexture(paintHeightCanvas);
const paintClearcoatTexture = new THREE.CanvasTexture(paintClearcoatCanvas);
for (const texture of [paintRoughnessTexture, paintHeightTexture, paintClearcoatTexture]) {
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
}
function drawArenaBaseArtwork(ctx) {
  const W = 1024;
  const H = 1024;

  // Sun-washed poured concrete, with subtle aggregate and patchy weathering.
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#8b9990';
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, 'rgba(235,239,219,.40)');
  wash.addColorStop(.36, 'rgba(177,195,181,.12)');
  wash.addColorStop(.72, 'rgba(71,91,88,.10)');
  wash.addColorStop(1, 'rgba(27,45,49,.24)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // Large, low-contrast concrete patches stop the ground reading as one flat colour.
  for (let i = 0; i < 145; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 18 + Math.random() * 66;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    const light = Math.random() > .48;
    g.addColorStop(0, light ? 'rgba(230,238,221,.10)' : 'rgba(27,47,50,.09)');
    g.addColorStop(1, 'rgba(70,92,87,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 2450; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = .25 + Math.random() * 1.35;
    ctx.fillStyle = Math.random() > .48 ? 'rgba(239,244,228,.14)' : 'rgba(18,34,39,.13)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expansion joints and inset slab borders.
  ctx.lineWidth = 3;
  for (let p = 128; p < W; p += 128) {
    ctx.strokeStyle = 'rgba(24,43,48,.12)';
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    ctx.strokeStyle = 'rgba(241,245,226,.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p + 3, 0); ctx.lineTo(p + 3, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p + 3); ctx.lineTo(W, p + 3); ctx.stroke();
    ctx.lineWidth = 3;
  }
  ctx.strokeStyle = 'rgba(34,54,57,.24)';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, 984, 984);
  ctx.strokeStyle = 'rgba(237,242,224,.30)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 964, 964);

  // Slab corner anchors and patched repair seams.
  for (let x = 32; x <= 992; x += 128) {
    for (let y = 32; y <= 992; y += 128) {
      ctx.fillStyle = 'rgba(29,49,51,.23)';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(242,245,226,.25)';
      ctx.beginPath(); ctx.arc(x - 1, y - 1, .8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 115; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const length = 4 + Math.random() * 26;
    ctx.strokeStyle = Math.random() > .5 ? 'rgba(248,246,224,.13)' : 'rgba(26,43,46,.13)';
    ctx.lineWidth = .6 + Math.random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (Math.random() - .5) * 3);
    ctx.stroke();
  }

  // Painted service lanes and loading-yard bay outlines.
  ctx.save();
  ctx.globalAlpha = .50;
  ctx.strokeStyle = '#e9eee0';
  ctx.lineWidth = 8;
  ctx.setLineDash([34, 24]);
  ctx.beginPath(); ctx.moveTo(512, 72); ctx.lineTo(512, 952); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(72, 512); ctx.lineTo(952, 512); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = .38;
  ctx.lineWidth = 5;
  for (const y of [112, 912]) {
    for (let x = 116; x < 908; x += 112) {
      ctx.strokeRect(x, y - 24, 76, 48);
    }
  }
  ctx.restore();

  // Safety hatching along the working edges of the yard.
  function hazardStrip(x, y, w, h, step = 24) {
    ctx.save();
    ctx.fillStyle = 'rgba(28,45,48,.50)';
    ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,190,105,.92)';
    ctx.lineWidth = 9;
    for (let k = -h; k < w + h; k += step) {
      ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke();
    }
    ctx.restore();
  }
  hazardStrip(54, 54, 180, 18);
  hazardStrip(790, 54, 180, 18);
  hazardStrip(54, 952, 180, 18);
  hazardStrip(790, 952, 180, 18);
  hazardStrip(54, 220, 18, 132, 22);
  hazardStrip(952, 672, 18, 132, 22);

  // Grated drains and access panels add the industrial surface language seen in real arenas.
  function drawGrate(cx, cy, w, h, spacing = 12) {
    ctx.save();
    ctx.fillStyle = 'rgba(31,50,54,.45)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.beginPath(); ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(204,220,205,.32)';
    ctx.lineWidth = 2;
    for (let x = cx - w / 2; x <= cx + w / 2; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, cy - h / 2); ctx.lineTo(x, cy + h / 2); ctx.stroke();
    }
    for (let y = cy - h / 2; y <= cy + h / 2; y += spacing) {
      ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(230,239,220,.50)';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = 'rgba(27,44,48,.45)';
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + sx * (w / 2 - 6), cy + sy * (h / 2 - 6), 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  drawGrate(150, 372, 104, 190, 13);
  drawGrate(874, 650, 104, 190, 13);
  drawGrate(300, 830, 180, 54, 13);
  drawGrate(724, 194, 180, 54, 13);
  drawGrate(512, 720, 84, 126, 12);

  function drain(cx, cy, radius) {
    ctx.save();
    ctx.fillStyle = 'rgba(28,46,51,.40)';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(226,237,220,.43)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
      ctx.lineTo(cx + Math.cos(a) * (radius - 6), cy + Math.sin(a) * (radius - 6));
      ctx.stroke();
    }
    ctx.restore();
  }
  drain(110, 740, 23);
  drain(914, 280, 23);
  drain(856, 862, 16);
  drain(168, 168, 16);

  // Large directional graphics make the floor readable from a distance.
  function floorArrow(cx, cy, angle, scale, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -42); ctx.lineTo(27, -8); ctx.lineTo(10, -8);
    ctx.lineTo(10, 40); ctx.lineTo(-10, 40); ctx.lineTo(-10, -8);
    ctx.lineTo(-27, -8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(24,43,47,.34)';
    ctx.fillRect(-3, -1, 6, 30);
    ctx.restore();
  }
  floorArrow(168, 432, 0, 1.05, 'rgba(239,244,223,.54)');
  floorArrow(856, 592, Math.PI, 1.05, 'rgba(239,244,223,.54)');
  floorArrow(300, 300, -.48, .62, 'rgba(32,112,125,.38)');
  floorArrow(724, 724, 2.66, .62, 'rgba(174,72,54,.34)');

  // Team-neutral centre circle and oversized Breakwater field identity.
  ctx.save();
  ctx.globalAlpha = .42;
  ctx.strokeStyle = '#f1f0df';
  ctx.lineWidth = 7;
  ctx.setLineDash([22, 16]);
  ctx.beginPath(); ctx.arc(512, 512, 186, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(512, 512, 164, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = .25;
  ctx.fillStyle = '#253d42';
  ctx.beginPath(); ctx.arc(512, 512, 142, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = .72;
  ctx.fillStyle = '#f1f2df';
  ctx.textAlign = 'center';
  ctx.font = '900 56px sans-serif';
  ctx.fillText('BREAKWATER', 512, 472);
  ctx.font = '800 18px sans-serif';
  ctx.fillText('TINT3D  /  FIELD SERIES 001', 512, 506);
  ctx.font = '900 34px sans-serif';
  ctx.fillText('414', 512, 550);
  ctx.globalAlpha = .72;
  ctx.fillStyle = '#ffc078';
  ctx.fillRect(356, 570, 312, 7);
  ctx.restore();

  // Smaller port stencils, deliberately faded into the concrete.
  ctx.save();
  ctx.fillStyle = 'rgba(33,57,61,.48)';
  ctx.textAlign = 'left';
  ctx.font = '900 20px sans-serif';
  ctx.fillText('NORTH QUAY  /  BAY 04', 92, 286);
  ctx.fillText('SOUTH QUAY  /  BAY 09', 650, 776);
  ctx.font = '800 12px sans-serif';
  ctx.fillText('PORT AUTHORITY  •  KEEP CLEAR', 92, 307);
  ctx.fillText('SERVICE ACCESS  //  TINT3D', 650, 797);
  ctx.textAlign = 'center';
  ctx.font = '900 16px sans-serif';
  ctx.fillText('KEEP MOVING  /  KEEP PAINTING', 512, 126);
  ctx.save();
  ctx.translate(126, 512);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('BREAKWATER FREIGHT TERMINAL', 0, 0);
  ctx.restore();
  ctx.restore();

  // Light tyre scuffs and scraped paint near the vehicle/service lanes.
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const y = 170 + i * 39;
    ctx.strokeStyle = 'rgba(39,58,60,.10)';
    ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath(); ctx.moveTo(238 + (i % 2) * 10, y); ctx.lineTo(326 + (i % 3) * 8, y + 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(690 - (i % 2) * 10, y + 11); ctx.lineTo(780 - (i % 3) * 8, y); ctx.stroke();
  }
  ctx.restore();
}
drawArenaBaseArtwork(paintCtx);
  drawExpansionArtwork(paintCtx);
const paintTexture = new THREE.CanvasTexture(paintCanvas);
paintTexture.colorSpace = THREE.SRGBColorSpace;
paintTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
paintTexture.generateMipmaps = true;
paintTexture.minFilter = THREE.LinearMipmapLinearFilter;
const raisedPaintTexture = new THREE.CanvasTexture(raisedPaintCanvas);
raisedPaintTexture.colorSpace = THREE.SRGBColorSpace;
raisedPaintTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
raisedPaintTexture.generateMipmaps = true;
raisedPaintTexture.minFilter = THREE.LinearMipmapLinearFilter;

const floor = mesh(
  new THREE.PlaneGeometry(ARENA, ARENA),
  new THREE.MeshPhysicalMaterial({
    map: paintTexture,
    roughness: 0.96,
    roughnessMap: paintRoughnessTexture,
    bumpMap: paintHeightTexture,
    bumpScale: 0.038,
    metalness: 0.015,
    clearcoat: 0.88,
    clearcoatMap: paintClearcoatTexture,
    clearcoatRoughnessMap: paintRoughnessTexture,
    clearcoatRoughness: 0.075
  }),
  scene, 0, -0.045, 0
);
floor.layers.enable(1);
floor.receiveShadow = true;
floor.rotation.x = -Math.PI / 2;
const underfloor = mesh(shared.box, mat('underfloor', 0x17242f, 0.94, 0.04), scene, 0, -0.42, 0);
underfloor.scale.set(ARENA + 1.2, 0.7, ARENA + 1.2);

// BREAKWATER: a coastal freight yard built from stacked containers, a central
// raised deck, loading ramps, service pipes, hazard stripes and light towers.
block(0, -0.82, 0, ARENA + 4, 0.28, ARENA + 4, 0x111d28);
for (const z of [-HALF - 0.55, HALF + 0.55]) {
  block(0, 0.35, z, ARENA + 1, 1.2, 0.55, 0x172733, { solid: true });
  block(0, 0.98, z, ARENA + 1, 0.08, 0.12, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (const x of [-HALF - 0.55, HALF + 0.55]) {
  block(x, 0.35, 0, 0.55, 1.2, ARENA + 1, 0x172733, { solid: true });
  block(x, 0.98, 0, 0.12, 0.08, ARENA + 1, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (let i = -3; i <= 3; i++) {
  block(i * 6.7, 0.09, -HALF + 1.2, 2.5, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
  block(i * 6.7, 0.09, HALF - 1.2, 2.5, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
}

function makeContainerTexture(baseColor, serial) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hex = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 512, 256);
  const shade = ctx.createLinearGradient(0, 0, 512, 256);
  shade.addColorStop(0, 'rgba(255,255,255,.19)');
  shade.addColorStop(.48, 'rgba(255,255,255,.025)');
  shade.addColorStop(1, 'rgba(0,0,0,.36)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 512, 256);
  for (let x = 8; x < 512; x += 24) {
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x + 3, 0, 2, 256);
    for (const y of [12, 244]) {
      ctx.fillStyle = 'rgba(230,245,235,.38)';
      ctx.beginPath(); ctx.arc(x + 8, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(8,20,29,.72)';
  ctx.fillRect(23, 26, 110, 54);
  ctx.fillStyle = '#e7f2e8';
  ctx.font = '900 25px sans-serif';
  ctx.fillText('BW / ' + String(serial).padStart(2, '0'), 32, 49);
  ctx.font = '700 9px sans-serif';
  ctx.fillStyle = 'rgba(235,246,235,.78)';
  ctx.fillText('BREAKWATER FREIGHT', 32, 65);
  ctx.fillStyle = 'rgba(231,241,234,.8)';
  ctx.font = '900 12px sans-serif';
  ctx.fillText('PORT AUTHORITY  /  FIELD 01', 157, 45);
  ctx.font = '800 8px sans-serif';
  ctx.fillStyle = 'rgba(9,24,32,.72)';
  ctx.fillText('CAUTION  //  KEEP CLEAR', 157, 61);
  // Scratches, sun-fade and serial plate wear.
  for (let i = 0; i < 28; i++) {
    const sx = 12 + Math.random() * 488;
    const sy = 6 + Math.random() * 244;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,224,184,.18)' : 'rgba(7,20,26,.18)';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 5 + Math.random() * 19, sy + (Math.random() - .5) * 5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(8,20,29,.24)';
  ctx.fillRect(150, 25, 340, 10);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(18, 218, 476, 4);
  ctx.fillStyle = '#ffb66d';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(366 + i * 17, 232);
    ctx.lineTo(378 + i * 17, 232);
    ctx.lineTo(388 + i * 17, 249);
    ctx.lineTo(376 + i * 17, 249);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
let containerSerial = 1;
const paintableWalls = [];
function addContainer(x, z, sx, sz, color, height = 2.4, raised = 0) {
  const y = raised + height / 2;
  const shell = block(x, y, z, sx, height, sz, color, {
    roughness: 0.61, metalness: 0.33, solid: true
  });
  shell.material = new THREE.MeshStandardMaterial({
    map: makeContainerTexture(color, containerSerial++),
    roughness: 0.61,
    metalness: 0.30
  });
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512;
  wallCanvas.height = 256;
  const wallTexture = new THREE.CanvasTexture(wallCanvas);
  wallTexture.colorSpace = THREE.SRGBColorSpace;
  wallTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wallMaterial = new THREE.MeshBasicMaterial({
    map: wallTexture, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false
  });
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(sx, height), wallMaterial);
    face.position.set(x, y, z + side * (sz / 2 + 0.035));
    if (side < 0) face.rotation.y = Math.PI;
    face.layers.enable(1);
    scene.add(face);
    paintableWalls.push({
      minX: x - sx / 2, maxX: x + sx / 2,
      minY: raised, maxY: raised + height,
      faceZ: face.position.z, canvas: wallCanvas,
      ctx: wallCanvas.getContext('2d'), texture: wallTexture
    });
  }
  for (let i = -Math.floor(sx / 1.25); i <= Math.floor(sx / 1.25); i++) {
    block(x + i * 0.62, y, z - sz / 2 - 0.018, 0.045, height * 0.86, 0.035, 0x526b76);
  }
  block(x, raised + 0.14, z - sz / 2 - 0.04, sx * 0.88, 0.12, 0.08, color === 0x27566a ? 0x20d8e9 : 0xff835d, { emissive: color === 0x27566a ? 0x087c96 : 0x9d3429 });
  for (const side of [-1, 1]) {
    block(x + side * (sx / 2 - 0.10), raised + height - 0.12, z, 0.07, 0.13, sz * 0.82, 0x91a3a0);
  }
}
addContainer(-15.2, -11.4, 7.2, 4.1, 0x27566a, 2.6);
addContainer(14.8, -12.2, 7.1, 4.3, 0x704536, 2.6);
addContainer(-15.4, 11.2, 7.1, 4.3, 0x704536, 2.6);
addContainer(15.1, 11.8, 7.4, 4.1, 0x27566a, 2.6);
addContainer(-8.4, -1.5, 3.1, 5.2, 0x34495b, 1.65);
addContainer(8.3, 1.2, 3.2, 5.2, 0x43515b, 1.65);
// Flank containers give the newly widened side lanes tactical cover.
addContainer(-22.5, -5.0, 4.4, 5.8, 0x31586a, 2.2);
addContainer(22.5, 5.0, 4.4, 5.8, 0x76503e, 2.2);

// Raised centre deck and two walkable ramps.
block(0, 0.91, 0, 10.5, 0.42, 6.0, 0x465761, { roughness: 0.65, metalness: 0.28, solid: true });
const deckTop = block(0, 1.14, 0, 9.8, 0.055, 5.5, 0x71868a, { roughness: 0.7, metalness: 0.2 });
const deckTexture = makeDeckSurfaceTexture();
deckTop.material = new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.82, metalness: 0.22 });
for (let x = -4; x <= 4; x += 2) block(x, 1.19, 0, 0.055, 0.04, 5.35, 0x233d4a);
const rampAngle = Math.atan2(1.05, 4.0);
const rampA = block(0, 0.52, 4.85, 5.8, 0.34, 4.25, 0x52636b, { rotation: { x: rampAngle } });
const rampB = block(0, 0.52, -4.85, 5.8, 0.34, 4.25, 0x52636b, { rotation: { x: -rampAngle } });
rampA.material = new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.88, metalness: 0.12 });
rampB.material = rampA.material;

// Replace the tilted cuboids with proper solid wedge geometry. The movement
// height profile already follows these exact 4.25 m approaches.
function makeApproachWedge(width, rise, run, thickness) {
  const x = width / 2;
  const z = run / 2;
  const p = [
    -x, rise, -z,   x, rise, -z,
    -x, 0, z,       x, 0, z,
    -x, rise - thickness, -z, x, rise - thickness, -z,
    -x, -thickness, z, x, -thickness, z
  ];
  const indices = [
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 4, 6, 0, 6, 2,
    1, 3, 7, 1, 7, 5,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3
  ];
  const uvs = [
    0, 0, 1, 0, 0, 1, 1, 1,
    0, 0, 1, 0, 0, 1, 1, 1
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
rampA.geometry.dispose();
rampB.geometry.dispose();
rampA.geometry = makeApproachWedge(5.8, 1.1675, 4.25, 0.30);
rampB.geometry = makeApproachWedge(5.8, 1.1675, 4.25, 0.30);
rampA.position.set(0, 0, 4.85);
rampB.position.set(0, 0, -4.85);
rampA.rotation.set(0, 0, 0);
rampB.rotation.set(0, Math.PI, 0);
rampA.scale.set(1, 1, 1);
rampB.scale.set(1, 1, 1);

// These transparent overlays use the same world UV coordinates as the arena
// floor paint canvas. They sit a few millimetres above the deck/ramp collision
// surfaces, so hits remain visible instead of being drawn underneath them.
function addWalkablePaintOverlay(name, corners) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  for (const corner of corners) {
    const [x, y, z] = corner;
    positions.push(x, y + 0.018, z);
    uvs.push((x + HALF) / ARENA, (HALF - z) / ARENA);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    map: raisedPaintTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    alphaTest: 0.012,
    roughness: 0.16,
    metalness: 0.025,
    clearcoat: 0.96,
    clearcoatRoughness: 0.035,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const overlay = new THREE.Mesh(geometry, material);
  overlay.name = name;
  overlay.layers.set(0);
  overlay.renderOrder = 3;
  overlay.frustumCulled = false;
  scene.add(overlay);
  return overlay;
}

const deckPaintOverlay = addWalkablePaintOverlay('Deck wet ink layer', [
  [-4.9, 1.1675, 2.75], [4.9, 1.1675, 2.75],
  [-4.9, 1.1675, -2.75], [4.9, 1.1675, -2.75]
]);
const rampNorthPaintOverlay = addWalkablePaintOverlay('North ramp wet ink layer', [
  [-2.85, 0.0, 6.975], [2.85, 0.0, 6.975],
  [-2.85, 1.1675, 2.725], [2.85, 1.1675, 2.725]
]);
const rampSouthPaintOverlay = addWalkablePaintOverlay('South ramp wet ink layer', [
  [-2.85, 1.1675, -2.725], [2.85, 1.1675, -2.725],
  [-2.85, 0.0, -6.975], [2.85, 0.0, -6.975]
]);

for (let z = -6.5; z <= 6.5; z += 1) {
  block(-2.7, 0.12, z, 0.11, 0.06, 0.28, 0xffc06b);
  block(2.7, 0.12, z, 0.11, 0.06, 0.28, 0xffc06b);
}
for (const x of [-5.25, 5.25]) {
  block(x, 1.48, 0, 0.18, 0.7, 5.8, 0x263a43, { solid: true });
  block(x, 1.85, 0, 0.20, 0.08, 5.8, 0x20b6c7, { emissive: 0x0a5365 });
}

// Low cover, bollards and pipe runs create readable lanes around the platform.
const coverPieces = [
  [-5.6, 0.65, -10.1, 4.2, 1.3, 2.0, 0x3e505c],
  [5.6, 0.62, 10.0, 4.0, 1.24, 2.0, 0x3e505c],
  [-10.2, 0.55, 5.8, 2.2, 1.1, 4.4, 0x314653],
  [10.1, 0.55, -6.2, 2.2, 1.1, 4.1, 0x314653],
];
for (const c of coverPieces) block(...c.slice(0, 7), { solid: true });
for (let i = 0; i < 7; i++) {
  const x = -17 + i * 5.65;
  cylinder(x, 0.58, -17.3, 0.22, 1.16, i % 2 ? 0x20b9ca : 0xff855e, 0, true);
  cylinder(x, 0.58, 17.3, 0.22, 1.16, i % 2 ? 0xff855e : 0x20b9ca, 0, true);
}
for (const z of [-15.5, 15.5]) {
  block(-25.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b, { solid: true });
  block(25.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b, { solid: true });
  block(-25.1, 4.25, z, 1.2, 0.14, 1.2, 0x20d8e9, { emissive: 0x087e9a });
  block(25.1, 4.25, z, 1.2, 0.14, 1.2, 0xff7652, { emissive: 0x8d3226 });
}
for (let i = 0; i < 5; i++) {
  const z = -12 + i * 6;
  cylinder(-24.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2, true);
  cylinder(24.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2, true);
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
function addHarbourCrane(x, z, accent = 0xff8b60, flip = 1) {
  const steel = 0x3b5961;
  const columnH = 10.5;
  for (const dx of [-2.8, 2.8]) {
    block(x + dx, columnH / 2, z, 0.36, columnH, 0.36, steel);
    block(x + dx, 0.22, z, 1.25, 0.42, 1.25, 0x263b43);
    block(x + dx, columnH - 0.1, z, 0.82, 0.25, 0.82, accent, { emissive: accent });
  }
  block(x, columnH, z, 6.5, 0.42, 0.52, steel);
  block(x + flip * 5.1, columnH + 0.05, z, 4.8, 0.28, 0.28, steel);
  block(x + flip * 5.1, columnH - 0.35, z, 0.15, 0.85, 0.15, accent);
  const diagonalA = block(x - 1.35, 6.2, z, 0.16, 7.3, 0.16, 0x69818a);
  diagonalA.rotation.z = -0.39;
  const diagonalB = block(x + 1.35, 6.2, z, 0.16, 7.3, 0.16, 0x69818a);
  diagonalB.rotation.z = 0.39;
  for (let i = 0; i < 5; i++) block(x - 1.9 + i * 0.95, 10.35, z, 0.07, 0.16, 0.07, accent);
}
// The old prototype cranes are replaced by Kenney's authored crane meshes below.

// Hanging hoists, pulley blocks and suspended freight turn the cranes into
// readable machines rather than bare geometric frames.
function addCraneHoist(x, z, accent, cargoColor, swing = 1) {
  const cableCurve = new THREE.LineCurve3(
    new THREE.Vector3(x, 10.15, z),
    new THREE.Vector3(x + swing * 0.38, 5.2, z)
  );
  mesh(
    new THREE.TubeGeometry(cableCurve, 12, 0.035, 5, false),
    mat('crane-cable', 0x1a3038, 0.62, 0.62),
    scene
  );
  cylinder(x, 10.10, z, 0.34, 0.32, 0x425d62);
  cylinder(x, 10.29, z, 0.22, 0.12, accent);
  block(x + swing * 0.38, 5.08, z, 0.66, 0.44, 0.60, 0x293f46);
  block(x + swing * 0.38, 4.82, z, 0.44, 0.13, 0.42, accent, { emissive: accent });
  const cargo = block(x + swing * 0.38, 3.72, z, 2.25, 1.95, 2.05, cargoColor, {
    roughness: 0.76, metalness: 0.20
  });
  cargo.material = new THREE.MeshStandardMaterial({
    map: makeContainerTexture(cargoColor, 40 + Math.round((x + 20) * 2)),
    roughness: 0.76, metalness: 0.18
  });
  block(x + swing * 0.38, 4.73, z, 2.30, 0.12, 2.10, accent);
  for (const side of [-1, 1]) {
    block(x + swing * 0.38 + side * 1.05, 3.72, z, 0.08, 1.90, 0.08, 0x9ba7a0);
  }
}
addCraneHoist(-15.8, -27.0 - EXPAND, 0x20d8e9, 0x285a66, 1);
addCraneHoist(15.8, -27.0 - EXPAND, 0xff7652, 0x77513d, -1);
// Industrial skyline is now assembled from real, textured Kenney building meshes.
for (const x of [-24, 24]) {
  cylinder(x, 5.1, -23, 0.23, 10.2, 0x37555e);
  block(x, 10.35, -23, 1.05, 0.22, 1.05, 0xffc278, { emissive: 0x9b582a });
}


// BREAKWATER VISUAL REBUILD --------------------------------------------------
// The arena now has a recognizable waterfront-market silhouette: layered
// vendor roofs, cargo stacks, gantry detail, dock hardware and overhead bunting.
// Repeated small props use instancing to keep the low-end GPU draw-call budget down.

function makeDeckSurfaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#53666a';
  ctx.fillRect(0, 0, 512, 512);
  const shade = ctx.createLinearGradient(0, 0, 512, 512);
  shade.addColorStop(0, 'rgba(220,235,221,.20)');
  shade.addColorStop(.5, 'rgba(90,116,119,.02)');
  shade.addColorStop(1, 'rgba(9,28,37,.38)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 512, 512);
  // Raised diamond tread, shallow enough not to shimmer at distance.
  ctx.strokeStyle = 'rgba(220,236,220,.17)';
  ctx.lineWidth = 2;
  for (let y = -256; y < 768; y += 22) {
    ctx.beginPath();
    for (let x = -256; x < 768; x += 22) {
      ctx.moveTo(x, y + 11);
      ctx.lineTo(x + 11, y);
      ctx.lineTo(x + 22, y + 11);
      ctx.lineTo(x + 11, y + 22);
      ctx.closePath();
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(16,34,41,.25)';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 496, 496);
  ctx.strokeStyle = 'rgba(240,194,112,.88)';
  ctx.lineWidth = 12;
  ctx.setLineDash([26, 16]);
  ctx.strokeRect(17, 17, 478, 478);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(7,24,31,.67)';
  ctx.fillRect(28, 34, 160, 34);
  ctx.fillStyle = '#e8f0dc';
  ctx.font = '900 20px sans-serif';
  ctx.fillText('BW  /  DOCK 01', 39, 58);
  ctx.fillStyle = 'rgba(231,242,222,.50)';
  ctx.font = '800 11px sans-serif';
  ctx.fillText('NON-SLIP SERVICE DECK', 300, 476);
  for (let i = 0; i < 52; i++) {
    const x = 24 + Math.random() * 464;
    const y = 24 + Math.random() * 464;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.12)' : 'rgba(5,20,27,.17)';
    ctx.fillRect(x, y, 2 + Math.random() * 5, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeAwningTexture(base, stripe, label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = '#' + stripe.toString(16).padStart(6, '0');
    ctx.fillRect(x, 0, 27, 256);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x + 27, 0, 4, 256);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,.20)');
  shade.addColorStop(.55, 'rgba(255,255,255,.02)');
  shade.addColorStop(1, 'rgba(0,0,0,.24)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(8,25,31,.78)';
  ctx.fillRect(18, 185, 476, 52);
  ctx.fillStyle = '#f4efdc';
  ctx.font = '900 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 219);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 3;
  for (let x = 10; x < 512; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, 24); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makePortSignTexture(title, subtitle, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#102d37';
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = '#' + accent.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 22, 256);
  ctx.fillRect(22, 220, 746, 10);
  ctx.fillStyle = 'rgba(228,242,223,.10)';
  ctx.fillRect(42, 28, 684, 2);
  ctx.fillStyle = '#f1f1dd';
  ctx.font = '900 76px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, 52, 126);
  ctx.fillStyle = '#9fb9b5';
  ctx.font = '800 24px sans-serif';
  ctx.fillText(subtitle, 56, 177);
  ctx.fillStyle = '#' + accent.toString(16).padStart(6, '0');
  ctx.font = '900 23px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('BW / 414', 720, 64);
  ctx.fillStyle = 'rgba(236,244,222,.52)';
  ctx.font = '700 14px sans-serif';
  ctx.fillText('BREAKWATER COASTAL EXCHANGE', 720, 193);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addMarketStall(x, z, baseY, roofColor, stripeColor, title, serial) {
  // Stalls sit on the large edge containers, adding a second playable-world
  // layer in silhouette without obstructing the central firing lanes.
  const roof = block(x, baseY + 2.48, z, 7.5, 0.18, 4.65, roofColor, {
    roughness: 0.96, metalness: 0.0
  });
  roof.material = new THREE.MeshStandardMaterial({
    map: makeAwningTexture(roofColor, stripeColor, title),
    roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide
  });
  // Four slim legs and two braces, deliberately brighter than the container below.
  for (const dx of [-3.35, 3.35]) {
    for (const dz of [-1.92, 1.92]) {
      block(x + dx, baseY + 1.30, z + dz, 0.13, 2.55, 0.13, 0x344c52);
      block(x + dx, baseY + 0.22, z + dz, 0.34, 0.12, 0.34, stripeColor);
    }
    const brace = block(x + dx, baseY + 1.93, z + 0.65, 0.085, 1.05, 0.085, 0xa4b1a2);
    brace.rotation.z = dx > 0 ? -0.56 : 0.56;
  }
  block(x, baseY + 1.43, z - 1.78, 6.7, 1.55, 0.16, 0x243a42);
  block(x, baseY + 0.60, z + 0.72, 5.65, 1.10, 1.18, 0x586b68);
  block(x, baseY + 1.18, z + 0.72, 5.95, 0.12, 1.30, 0xc5c5a9);
  // Bright fabric valance under the front edge.
  block(x, baseY + 2.17, z + 2.23, 7.34, 0.48, 0.11, stripeColor);
  for (let i = -3; i <= 3; i++) {
    block(x + i * 0.52, baseY + 1.87, z + 2.25, 0.045, 0.12, 0.12, 0xf1e7cd);
  }
  // Backlit vendor board is a single textured mesh, not a wall of text boxes.
  const sign = mesh(
    new THREE.PlaneGeometry(4.9, 0.72),
    new THREE.MeshBasicMaterial({
      map: makePortSignTexture(title, 'QUAY MARKET  /  STALL ' + String(serial).padStart(2, '0'), stripeColor),
      toneMapped: false
    }),
    scene, x, baseY + 1.47, z + 2.34
  );
  sign.layers.enable(1);
  // Two stacked goods crates and a small counter display.
  block(x - 2.12, baseY + 1.40, z + 0.38, 0.76, 0.62, 0.72, 0x9a714b);
  block(x + 2.02, baseY + 1.39, z + 0.38, 0.72, 0.60, 0x78938a);
  block(x - 2.12, baseY + 1.73, z + 0.38, 0.78, 0.055, 0.74, 0x293e43);
  block(x + 2.02, baseY + 1.72, z + 0.38, 0.74, 0.055, 0.74, 0x293e43);
}

addMarketStall(-15.2, 11.2, 2.64, 0xe0b96e, 0x236b77, 'TIDE GOODS', 1);
addMarketStall(15.1, 11.8, 2.64, 0x526c68, 0xff855e, 'DOCK FRESH', 2);
addMarketStall(-15.2, -11.4, 2.64, 0x637a83, 0xffbf72, 'PORT SUPPLY', 3);
addMarketStall(14.8, -12.2, 2.64, 0x9c694d, 0x20d8e9, 'QUAY CANTEEN', 4);

// A large, readable terminal sign replaces the previously blank dark slab.
const terminalFace = mesh(
  new THREE.PlaneGeometry(10.2, 1.58),
  new THREE.MeshBasicMaterial({
    map: makePortSignTexture('BREAKWATER', 'TINT3D FIELD SERIES  /  COASTAL TERMINAL 001', 0xff855e),
    toneMapped: false
  }),
  scene, 0, 5.88, -18.72
);
terminalFace.layers.enable(1);

// Cargo handling details: repeated boxes share one material/geometry and one draw call.
function makeCrateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a47c50';
  ctx.fillRect(0, 0, 256, 256);
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, 'rgba(255,236,184,.22)');
  grad.addColorStop(1, 'rgba(33,24,16,.31)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(48,35,23,.48)';
  ctx.lineWidth = 5;
  for (let y = 20; y < 256; y += 36) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + 3); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(27,42,43,.78)';
  ctx.fillRect(30, 72, 196, 91);
  ctx.fillStyle = '#f1e9cf';
  ctx.font = '900 31px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BW / 414', 128, 110);
  ctx.font = '800 13px sans-serif';
  ctx.fillText('FRAGILE  •  KEEP DRY', 128, 137);
  ctx.fillStyle = '#e8a85c';
  ctx.fillRect(30, 177, 196, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const crateMaterial = new THREE.MeshStandardMaterial({
  map: makeCrateTexture(), roughness: 0.92, metalness: 0.0
});
const cratePlacements = [
  [-12.0, 0.52, -5.6, 1.20, 1.04, 1.05, -0.08],
  [-12.7, 0.53, -4.7, 1.05, 1.06, 1.00, 0.10],
  [-12.0, 1.55, -5.6, 0.95, 0.98, 0.92, -0.04],
  [12.1, 0.52, 5.7, 1.20, 1.04, 1.05, 0.08],
  [12.8, 0.53, 4.7, 1.05, 1.06, 1.00, -0.10],
  [12.1, 1.55, 5.7, 0.95, 0.98, 0.92, 0.04],
  [-9.4, 0.47, 10.0, 0.86, 0.90, 0.82, 0.10],
  [9.5, 0.47, -10.0, 0.86, 0.90, 0.82, -0.10],
  [-17.5, 0.45, 2.4, 0.82, 0.90, 0.82, 0.08],
  [17.5, 0.45, -2.4, 0.82, 0.90, 0.82, -0.08]
];
const crateInstances = new THREE.InstancedMesh(shared.box, crateMaterial, cratePlacements.length);
const crateDummy = new THREE.Object3D();
cratePlacements.forEach((p, i) => {
  crateDummy.position.set(p[0], p[1], p[2]);
  crateDummy.rotation.set(0, p[6], 0);
  crateDummy.scale.set(p[3], p[4], p[5]);
  crateDummy.updateMatrix();
  crateInstances.setMatrixAt(i, crateDummy.matrix);
  solidBounds.push({
    x: p[0], z: p[2], halfX: p[3] * 0.5, halfZ: p[5] * 0.5,
    minX: p[0] - p[3] * 0.5, maxX: p[0] + p[3] * 0.5, minZ: p[2] - p[5] * 0.5, maxZ: p[2] + p[5] * 0.5,
    minY: p[1] - p[4] * 0.5, maxY: p[1] + p[4] * 0.5
  });
});
crateInstances.instanceMatrix.needsUpdate = true;
crateInstances.layers.enable(1);
scene.add(crateInstances);

// Dock barrels, cable drums and bollard caps add round forms among the boxy cargo.
const drumMaterial = new THREE.MeshStandardMaterial({ color: 0x3d7780, roughness: 0.64, metalness: 0.40 });
const drumPositions = [
  [-13.7, 0.67, -7.1, 0.42, 1.30, 0.42],
  [13.7, 0.67, 7.1, 0.42, 1.30, 0.42],
  [-16.6, 0.57, 5.2, 0.36, 1.08, 0.36],
  [16.6, 0.57, -5.2, 0.36, 1.08, 0.36],
  [0, 0.48, -15.2, 0.54, 0.94, 0.54],
  [0, 0.48, 15.2, 0.54, 0.94, 0.54]
];
const drumInstances = new THREE.InstancedMesh(shared.cylinder, drumMaterial, drumPositions.length);
drumPositions.forEach((p, i) => {
  crateDummy.position.set(p[0], p[1], p[2]);
  crateDummy.rotation.set(0, 0, 0);
  crateDummy.scale.set(p[3], p[4], p[5]);
  crateDummy.updateMatrix();
  drumInstances.setMatrixAt(i, crateDummy.matrix);
  solidBounds.push({
    shape: 'circle', x: p[0], z: p[2], radius: p[3],
    minY: p[1] - p[4] * 0.5, maxY: p[1] + p[4] * 0.5
  });
});
drumInstances.instanceMatrix.needsUpdate = true;
drumInstances.layers.enable(1);
scene.add(drumInstances);

// Elevated deck railings with diagonal braces: readable silhouette, restrained geometry.
for (const x of [-5.25, 5.25]) {
  for (let z = -2.45; z <= 2.46; z += 0.82) {
    block(x, 1.57, z, 0.08, 0.82, 0.08, 0x273f47);
  }
  block(x, 1.94, 0, 0.12, 0.12, 5.10, 0x9aa9a0);
  block(x, 1.32, 0, 0.10, 0.10, 5.10, 0x526f75);
}

// A scalloped line of market pennants and warm bulbs breaks the empty sky band.
const flagPositions = [];
const flagColors = [0x20d8e9, 0xff855e, 0xf3c16c, 0xe7e4c9, 0x6d9f94];
const flagVerts = [];
const flagColorsFlat = [];
const flagCount = 13;
for (let i = 0; i < flagCount; i++) {
  const x0 = -18 + i * 3.0;
  const x1 = x0 + 2.7;
  const y0 = 6.8 - Math.sin(i / (flagCount - 1) * Math.PI) * 0.72;
  const col = new THREE.Color(flagColors[i % flagColors.length]);
  flagVerts.push(x0, y0, 7.4, x1, y0 - 0.03, 7.4, (x0 + x1) * 0.5, y0 - 0.78, 7.4);
  for (let v = 0; v < 3; v++) flagColorsFlat.push(col.r, col.g, col.b);
}
const flagGeometry = new THREE.BufferGeometry();
flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flagVerts, 3));
flagGeometry.setAttribute('color', new THREE.Float32BufferAttribute(flagColorsFlat, 3));
flagGeometry.computeVertexNormals();
const flagMesh = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.DoubleSide, toneMapped: false
}));
flagMesh.layers.enable(1);
scene.add(flagMesh);
const wireCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-19, 6.92, 7.35),
  new THREE.Vector3(-10, 6.15, 7.35),
  new THREE.Vector3(0, 5.98, 7.35),
  new THREE.Vector3(10, 6.15, 7.35),
  new THREE.Vector3(19, 6.92, 7.35)
]);
mesh(new THREE.TubeGeometry(wireCurve, 36, 0.025, 5, false), mat('market-wire', 0x354c52, 0.8, 0.22), scene);
const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false });
const bulbInstances = new THREE.InstancedMesh(shared.smallSphere, bulbMaterial, 11);
for (let i = 0; i < 11; i++) {
  const x = -16 + i * 3.2;
  const y = 6.15 + Math.abs(x) / 19 * 0.72;
  crateDummy.position.set(x, y - 0.12, 7.35);
  crateDummy.scale.setScalar(0.085);
  crateDummy.updateMatrix();
  bulbInstances.setMatrixAt(i, crateDummy.matrix);
}
bulbInstances.instanceMatrix.needsUpdate = true;
bulbInstances.layers.enable(1);
scene.add(bulbInstances);

// Extra scaffold and braces make the central gantry read as a real structure.
for (const x of [-10, 10]) {
  for (const y of [5.2, 6.5, 7.8]) {
    block(x, y, -0.12, 0.30, 0.08, 0.32, 0x849a96);
  }
  const brace1 = block(x * 0.75, 7.25, 0, 0.12, 2.2, 0.12, 0x708b8c);
  brace1.rotation.z = x < 0 ? -0.35 : 0.35;
  const brace2 = block(x * 0.75, 5.55, 0, 0.12, 2.2, 0.12, 0x708b8c);
  brace2.rotation.z = x < 0 ? 0.35 : -0.35;
}

// A small strip of harbour water and soft cloud silhouettes give the yard a location.
const waterCanvas = document.createElement('canvas');
waterCanvas.width = 512;
waterCanvas.height = 256;
const waterCtx = waterCanvas.getContext('2d');
const waterGrad = waterCtx.createLinearGradient(0, 0, 512, 256);
waterGrad.addColorStop(0, '#367c83');
waterGrad.addColorStop(0.55, '#245c68');
waterGrad.addColorStop(1, '#183e50');
waterCtx.fillStyle = waterGrad;
waterCtx.fillRect(0, 0, 512, 256);
for (let i = 0; i < 185; i++) {
  const y = Math.random() * 256;
  const x = Math.random() * 512;
  waterCtx.strokeStyle = i % 3 ? 'rgba(194,235,215,.22)' : 'rgba(255,203,133,.20)';
  waterCtx.lineWidth = 1 + Math.random() * 2.5;
  waterCtx.beginPath();
  waterCtx.moveTo(x, y);
  waterCtx.lineTo(x + 10 + Math.random() * 50, y + (Math.random() - 0.5) * 2);
  waterCtx.stroke();
}
const waterTexture = new THREE.CanvasTexture(waterCanvas);
waterTexture.colorSpace = THREE.SRGBColorSpace;
waterTexture.wrapS = THREE.RepeatWrapping;
waterTexture.wrapT = THREE.RepeatWrapping;
waterTexture.repeat.set(16, 16);
const harbourWater = mesh(
  new THREE.PlaneGeometry(460, 460),
  new THREE.MeshStandardMaterial({ map: waterTexture, roughness: 0.34, metalness: 0.30 }),
  scene, 0, -0.86, 0
);
harbourWater.rotation.x = -Math.PI / 2;
harbourWater.layers.enable(1);
for (let i = 0; i < 9; i++) {
  const x = -36 + i * 9;
  cylinder(x, 0.18, -HALF + 3.2, 0.34, 0.36, i % 2 ? 0x526b68 : 0x344e57);
  block(x, 0.98, -HALF + 3.2, 0.12, 1.70, 0.12, 0x334d54);
  block(x, 1.82, -HALF + 3.2, 0.56, 0.10, 0.56, 0xffbd72);
}

// ---------------------------------------------------------------------------


// AUTHORED CC0 ENVIRONMENT MESHES -------------------------------------------
// Kenney Factory Kit + City Kit (Industrial). GLB files and their colormaps
// are stored locally under /assets; no third-party runtime request is needed.
const kenneyLoader = new GLTFLoader();
const kenneyAssetRoot = import.meta.env.BASE_URL + 'assets/kenney/';
const kenneySourceCache = new Map();
const kenneyTextureCache = new Map();

function getKenneySource(...args) {
  const promise = getKenneySourceRaw(...args);
  loadTracker.track(Promise.resolve(promise), 'kenney');
  return promise;
}
function getKenneySourceRaw(pack, file) {
  const key = pack + '/' + file;
  if (kenneySourceCache.has(key)) return kenneySourceCache.get(key);
  const promise = new Promise((resolve) => {
    kenneyLoader.load(
      kenneyAssetRoot + key,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.layers.enable(1);
          node.frustumCulled = true;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) {
            if (!material) continue;
            if (material.map) {
              if (!kenneyTextureCache.has(pack)) {
                kenneyTextureCache.set(pack, material.map);
              } else if (material.map !== kenneyTextureCache.get(pack)) {
                material.map.dispose();
                material.map = kenneyTextureCache.get(pack);
              }
            }
            if ('roughness' in material) material.roughness = Math.max(0.72, material.roughness || 0);
            if ('metalness' in material) material.metalness = Math.min(0.28, material.metalness || 0);
            material.needsUpdate = true;
          }
        });
        resolve(model);
      },
      undefined,
      (error) => {
        console.warn('Tint3d could not load environment mesh:', key, error);
        resolve(null);
      }
    );
  });
  kenneySourceCache.set(key, promise);
  return promise;
}

function addKenneyModel(pack, file, x, floorY, z, scale, rotationY = 0, solid = false) {
  return getKenneySource(pack, file).then((source) => {
    if (!source) return null;
    const model = source.clone(true);
    model.scale.setScalar(scale);
    model.rotation.set(0, rotationY, 0);
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);

    const localBounds = new THREE.Box3().setFromObject(model);
    const size = localBounds.getSize(new THREE.Vector3());
    const centre = localBounds.getCenter(new THREE.Vector3());
    model.position.set(x - centre.x, floorY - localBounds.min.y, z - centre.z);
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (node.isMesh) {
        node.layers.enable(1);
        node.castShadow = solid || pack === 'factory';
        node.receiveShadow = true;
      }
    });
    scene.add(model);

    if (solid) {
      const halfX = size.x * 0.42;
      const halfZ = size.z * 0.42;
      solidBounds.push({
        x, z, halfX, halfZ, minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ,
        minY: floorY, maxY: floorY + size.y
      });
    }
    return model;
  });
}

// The centre deck becomes a proper factory catwalk, with real grating and
// safety rails replacing some of the thin decorative bars.
addKenneyModel('factory', 'catwalk-straight.glb', -2.15, 1.05, 0, 4.15, 0);
addKenneyModel('factory', 'catwalk-straight.glb', 2.15, 1.05, 0, 4.15, Math.PI);
addKenneyModel('factory', 'catwalk-stairs.glb', 0, 0.02, -5.3, 1.18, Math.PI);

// Machinery gives the side lanes real silhouettes and more interesting cover.
addKenneyModel('factory', 'machine-fortified.glb', -11.6, 0, -5.6, 2.25, 0, true);
addKenneyModel('factory', 'machine-fortified.glb', 11.6, 0, 5.6, 2.25, Math.PI, true);
addKenneyModel('factory', 'conveyor-bars-stripe.glb', -10.9, 0, 10.4, 4.2, Math.PI / 2);
addKenneyModel('factory', 'pipe-large-long.glb', 10.8, 0, -10.0, 3.2, Math.PI / 2);

// Authored gantry cranes and hanging lift assemblies on the far quay.
addKenneyModel('factory', 'crane.glb', -15.4, 0, -27.0 - EXPAND, 3.8, 0);
addKenneyModel('factory', 'crane.glb', 15.4, 0, -27.0 - EXPAND, 3.8, Math.PI);
addKenneyModel('factory', 'crane-lift.glb', -15.4, 6.8, -27.0 - EXPAND, 3.1, 0);
addKenneyModel('factory', 'crane-lift.glb', 15.4, 6.8, -27.0 - EXPAND, 3.1, Math.PI);

// A stepped industrial skyline replaces the six placeholder blocks behind the
// water. These meshes retain their authored colour maps and low-poly bevels.
addKenneyModel('city-industrial', 'building-a.glb', -28.5, 0, -51.5 - EXPAND, 6.0, 0.12);
addKenneyModel('city-industrial', 'building-d.glb', -16.8, 0, -53.0 - EXPAND, 7.0, -0.08);
addKenneyModel('city-industrial', 'building-h.glb', -5.0, 0, -50.5 - EXPAND, 8.0, 0.18);
addKenneyModel('city-industrial', 'building-k.glb', 7.7, 0, -53.0 - EXPAND, 7.2, Math.PI);
addKenneyModel('city-industrial', 'detail-tank.glb', 20.2, 0, -50.4 - EXPAND, 8.4, 0.1);
addKenneyModel('city-industrial', 'chimney-large.glb', 29.2, 0, -47.7 - EXPAND, 5.4, 0);

// ---------------------------------------------------------------------------

// =============================================================================
// BREAKWATER EXPANSION: the yard grows from 52 m to 76 m. The original layout
// stays in the middle; the outer ring adds spawn plazas, flank lanes, ramps and
// elevated overlook towers. Everything is mirrored through the centre point so
// both teams get identical routes.
// =============================================================================
const walkZones = [];
function addFlatZone(minX, maxX, minZ, maxZ, h) {
  walkZones.push({ kind: 'flat', minX, maxX, minZ, maxZ, h });
}
function addRampZone(minX, maxX, minZ, maxZ, axis, hStart, hEnd) {
  walkZones.push({ kind: 'ramp', minX, maxX, minZ, maxZ, axis, hStart, hEnd });
}
function zoneHeight(x, z) {
  let best = 0;
  for (const zone of walkZones) {
    if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
    let h = zone.h;
    if (zone.kind === 'ramp') {
      const t = zone.axis === 'x'
        ? (x - zone.minX) / (zone.maxX - zone.minX)
        : (z - zone.minZ) / (zone.maxZ - zone.minZ);
      h = zone.hStart + (zone.hEnd - zone.hStart) * t;
    }
    if (h > best) best = h;
  }
  return best;
}

// Boxes are merged per colour so the whole ring costs a handful of draw calls.
const batchGroups = new Map();
function batchBox(x, y, z, sx, sy, sz, color, options = {}) {
  const key = color + (options.glow ? 'g' : 's');
  if (!options.invisible) {
    if (!batchGroups.has(key)) batchGroups.set(key, { color, glow: !!options.glow, boxes: [] });
    batchGroups.get(key).boxes.push({ x, y, z, sx, sy, sz, ry: options.ry || 0 });
  }
  if (options.solid) {
    const c = Math.abs(Math.cos(options.ry || 0));
    const sn = Math.abs(Math.sin(options.ry || 0));
    const halfX = (sx * c + sz * sn) / 2;
    const halfZ = (sx * sn + sz * c) / 2;
    solidBounds.push({
      x, z, halfX, halfZ, minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ,
      minY: y - sy / 2, maxY: y + sy / 2
    });
  }
}
function flushBatches() {
  const dummy = new THREE.Object3D();
  for (const group of batchGroups.values()) {
    const parts = group.boxes.map((b) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.ry, 0);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      return shared.box.clone().applyMatrix4(dummy.matrix);
    });
    const merged = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    const material = group.glow
      ? new THREE.MeshStandardMaterial({ color: group.color, emissive: group.color, emissiveIntensity: 0.9, roughness: 0.5 })
      : new THREE.MeshStandardMaterial({ color: group.color, roughness: 0.74, metalness: 0.22 });
    const batch = new THREE.Mesh(merged, material);
    batch.castShadow = !group.glow;
    batch.receiveShadow = true;
    batch.layers.enable(1);
    scene.add(batch);
  }
  batchGroups.clear();
}

const towerDeckTexture = deckTexture.clone();
towerDeckTexture.wrapS = THREE.RepeatWrapping;
towerDeckTexture.wrapT = THREE.RepeatWrapping;
towerDeckTexture.repeat.set(2, 2);
towerDeckTexture.needsUpdate = true;
const towerDeckMaterial = new THREE.MeshStandardMaterial({ map: towerDeckTexture, roughness: 0.84, metalness: 0.16 });
const rampSurfaceMaterial = new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.88, metalness: 0.12 });

function overlayFor(name, minX, maxX, minZ, maxZ) {
  const y = (x, z) => zoneHeight(x, z);
  return addWalkablePaintOverlay(name, [
    [minX, y(minX, maxZ), maxZ], [maxX, y(maxX, maxZ), maxZ],
    [minX, y(minX, minZ), minZ], [maxX, y(maxX, minZ), minZ]
  ]);
}

// Ramp ascending toward `dir` (N = -z, S = +z, E = +x, W = -x), walled on both sides.
function addRamp(cx, cz, width, run, rise, dir, name) {
  const wedge = new THREE.Mesh(makeApproachWedge(width, rise, run, 0.3), rampSurfaceMaterial);
  wedge.position.set(cx, 0, cz);
  wedge.rotation.y = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[dir];
  wedge.castShadow = true;
  wedge.receiveShadow = true;
  wedge.layers.enable(1);
  scene.add(wedge);
  const alongX = dir === 'E' || dir === 'W';
  const minX = alongX ? cx - run / 2 : cx - width / 2;
  const maxX = alongX ? cx + run / 2 : cx + width / 2;
  const minZ = alongX ? cz - width / 2 : cz - run / 2;
  const maxZ = alongX ? cz + width / 2 : cz + run / 2;
  const hStart = (dir === 'N' || dir === 'W') ? rise : 0;
  const hEnd = (dir === 'N' || dir === 'W') ? 0 : rise;
  addRampZone(minX, maxX, minZ, maxZ, alongX ? 'x' : 'z', hStart, hEnd);
  const wallH = rise + 0.62;
  for (const side of [-1, 1]) {
    if (alongX) batchBox(cx, wallH / 2, cz + side * (width / 2 + 0.16), run, wallH, 0.32, 0x34464f, { solid: true });
    else batchBox(cx + side * (width / 2 + 0.16), wallH / 2, cz, 0.32, wallH, run, 0x34464f, { solid: true });
  }
  overlayFor(name, minX, maxX, minZ, maxZ);
}

function addTower(cx, cz, w, d, h, accent, name) {
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minZ = cz - d / 2;
  const maxZ = cz + d / 2;
  batchBox(cx, h / 2, cz, w, h, d, 0x3a4c57, { solid: true });
  batchBox(cx, h * 0.2, cz, w + 0.14, 0.26, d + 0.14, 0x24343d);
  batchBox(cx, h - 0.30, cz, w + 0.22, 0.07, d + 0.22, accent, { glow: true });
  for (const sx of [-1, 1]) batchBox(cx + sx * (w / 2 - 0.09), h + 0.06, cz, 0.18, 0.12, d, 0x5b7078);
  for (const sz of [-1, 1]) batchBox(cx, h + 0.06, cz + sz * (d / 2 - 0.09), w, 0.12, 0.18, 0x5b7078);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), towerDeckMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, h + 0.004, cz);
  top.receiveShadow = true;
  top.layers.enable(1);
  scene.add(top);
  addFlatZone(minX, maxX, minZ, maxZ, h);
  overlayFor(name, minX + 0.2, maxX - 0.2, minZ + 0.2, maxZ - 0.2);
}

// Low railing with a solid collider so players do not stroll off the open sides.
function addRailing(x0, z0, x1, z1, baseY) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const sx = alongX ? length : 0.14;
  const sz = alongX ? 0.14 : length;
  batchBox(cx, baseY + 1.0, cz, sx, 0.09, sz, 0x9aa9a0);
  batchBox(cx, baseY + 0.55, cz, sx, 0.07, sz, 0x526f75);
  const posts = Math.max(2, Math.round(length / 1.7) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    batchBox(x0 + (x1 - x0) * t, baseY + 0.52, z0 + (z1 - z0) * t, 0.12, 1.04, 0.12, 0x273f47);
  }
  batchBox(cx, baseY + 0.55, cz, alongX ? length : 0.3, 1.1, alongX ? 0.3 : length, 0x000000, { solid: true, invisible: true });
}

function addSpawnPlaza(sign, accent) {
  const z = sign * SPAWN_Z;
  const back = sign * (HALF - 0.6);
  batchBox(0, 1.6, back, 17, 3.2, 0.5, 0x172d38, { solid: true });
  batchBox(0, 3.0, back - sign * 0.3, 15, 0.16, 0.12, accent, { glow: true });
  for (const x of [-8, 8]) {
    batchBox(x, 2.4, back - sign * 0.2, 0.7, 4.8, 0.7, 0x2b424d, { solid: true });
    batchBox(x, 4.9, back - sign * 0.2, 1.1, 0.2, 1.1, accent, { glow: true });
  }
  for (const x of [-13.5, -5.2, 5.2, 13.5]) {
    batchBox(x, 0.7, z - sign * 3.6 - 0.0, 3.6, 1.4, 1.1, 0x3e505c, { solid: true });
    batchBox(x, 1.43, z - sign * 3.6, 3.7, 0.07, 1.2, accent, { glow: true });
  }
}

function buildExpansion() {
  // Spawn plazas (blue +z, orange -z).
  addSpawnPlaza(1, 0x20d8e9);
  addSpawnPlaza(-1, 0xff7652);

  for (const s of [1, -1]) {
    // Overlook towers with ramps: one low flank tower, one high spawn-side tower.
    addTower(s * -31, s * 19, 8, 8, 2.2, s > 0 ? 0x20d8e9 : 0xff7652, 'Flank tower ink layer ' + s);
    addRamp(s * -22.5, s * 19, 3.4, 9, 2.2, s > 0 ? 'W' : 'E', 'Flank ramp ink layer ' + s);
    addRailing(s * -35, s * 15, s * -35, s * 23, 2.2);
    addRailing(s * -35, s * 15, s * -27, s * 15, 2.2);
    addRailing(s * -35, s * 23, s * -27, s * 23, 2.2);

    addTower(s * 31, s * 30, 8, 8, 3.0, s > 0 ? 0x20d8e9 : 0xff7652, 'Spawn tower ink layer ' + s);
    addRamp(s * 31, s * 20.5, 3.4, 11, 3.0, s > 0 ? 'S' : 'N', 'Spawn ramp ink layer ' + s);
    addRailing(s * 35, s * 26, s * 35, s * 34, 3.0);
    addRailing(s * 27, s * 34, s * 35, s * 34, 3.0);
    addRailing(s * 27, s * 26, s * 27, s * 34, 3.0);

    // Flank containers and lane walls.
    addContainer(s * -21.5, s * 31.0, 7.0, 3.8, s > 0 ? 0x27566a : 0x704536, 2.4);
    addContainer(s * 19.0, s * 26.0, 6.4, 3.6, s > 0 ? 0x704536 : 0x27566a, 2.2);
    addContainer(s * 31.5, s * 9.0, 4.4, 3.6, s > 0 ? 0x34495b : 0x43515b, 2.0);
    batchBox(s * 28.6, 0.7, s * 5.0, 0.9, 1.4, 4.0, 0x314653, { solid: true });
    batchBox(s * -28.6, 0.7, s * 12.0, 0.9, 1.4, 4.0, 0x314653, { solid: true });

    // Mid-ring cover: staggered low walls, cylinders and crates.
    const cover = [
      [-12, 22.5, 4.2, 1.2, 1.3], [-3.5, 24.2, 1.4, 1.3, 4.6], [8.5, 22.0, 3.6, 1.2, 1.4],
      [18.0, 31.5, 1.4, 1.2, 3.4], [-17.5, 26.5, 3.0, 1.15, 1.4], [26.0, 12.0, 1.4, 1.2, 3.6],
      [-26.0, 4.0, 1.4, 1.2, 3.4]
    ];
    for (const [x, z, sx, sy, sz] of cover) {
      batchBox(s * x, sy / 2, s * z, sx, sy, sz, 0x3e505c, { solid: true });
      batchBox(s * x, sy + 0.04, s * z, sx + 0.08, 0.08, sz + 0.08, s > 0 ? 0x1a8fa0 : 0xb5543a, { glow: false });
    }

    // Lamp posts along the long edges.
    for (const [x, z] of [[-17, 36.4], [17, 36.4], [36.4, 8], [36.4, 22], [-36.4, 8], [-36.4, 22]]) {
      batchBox(s * x, 2.3, s * z, 0.14, 4.6, 0.14, 0x354c52);
      batchBox(s * x, 4.7, s * z, 0.62, 0.16, 0.62, 0xffd28a, { glow: true });
    }
  }
  flushBatches();

  // Industrial skyline ring beyond the quay on the three remaining sides.
  const buildings = ['building-a.glb', 'building-d.glb', 'building-h.glb', 'building-k.glb', 'detail-tank.glb', 'chimney-large.glb'];
  const ring = HALF + 24;
  let n = 0;
  for (let t = -36; t <= 36; t += 13) {
    const file = buildings[n++ % buildings.length];
    const scale = 6 + (n % 3) * 0.9;
    addKenneyModel('city-industrial', file, t, 0, ring + (n % 2) * 4, scale, Math.PI);
    addKenneyModel('city-industrial', buildings[(n + 2) % buildings.length], ring + (n % 3) * 3, 0, t, scale, -Math.PI / 2);
    addKenneyModel('city-industrial', buildings[(n + 4) % buildings.length], -ring - (n % 2) * 3, 0, t, scale, Math.PI / 2);
  }
}
buildExpansion();

// Floor markings for the new ring: spawn pads, hazard bands and lane arrows.
function drawExpansionArtwork(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const px = (x) => (x + HALF) / ARENA * W;
  const py = (z) => (HALF - z) / ARENA * H;
  const ppm = W / ARENA;
  ctx.save();
  for (const [sign, color, tint] of [[1, '#20d8e9', 'rgba(32,216,233,0.13)'], [-1, '#ff7652', 'rgba(255,118,82,0.13)']]) {
    const z0 = sign * (SPAWN_Z - 4.2);
    const z1 = sign * (HALF - 1.0);
    ctx.fillStyle = tint;
    ctx.fillRect(px(-11), Math.min(py(z0), py(z1)), 22 * ppm, Math.abs(py(z0) - py(z1)));
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(2, ppm * 0.18);
    ctx.strokeRect(px(-11), Math.min(py(z0), py(z1)), 22 * ppm, Math.abs(py(z0) - py(z1)));
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 4; i++) {
      const cz = sign * (SPAWN_Z - 2.6 + i * 1.6);
      ctx.beginPath();
      ctx.moveTo(px(-2.2), py(cz));
      ctx.lineTo(px(0), py(cz - sign * 1.0));
      ctx.lineTo(px(2.2), py(cz));
      ctx.stroke();
    }
  }
  // Hazard band along the flank walls.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#f0b64c';
  for (const x of [-HALF + 1.2, HALF - 2.0]) {
    for (let z = -HALF + 6; z < HALF - 6; z += 2.4) ctx.fillRect(px(x), py(z + 1.2), ppm * 0.8, ppm * 1.2);
  }
  ctx.restore();
}

function groundHeight(x, z) {
  if (Math.abs(x) <= 4.9 && Math.abs(z) <= 2.75) return 1.1675;
  if (Math.abs(x) <= 2.9 && z > 2.725 && z < 6.975) {
    return clamp((6.975 - z) / 4.25, 0, 1) * 1.1675;
  }
  if (Math.abs(x) <= 2.9 && z < -2.725 && z > -6.975) {
    return clamp((z + 6.975) / 4.25, 0, 1) * 1.1675;
  }
  return zoneHeight(x, z);
}

function paintSurfaceHeight(x, z) {
  if (Math.abs(x) <= 4.9 && Math.abs(z) <= 2.75) return 1.1675;
  if (Math.abs(x) <= 2.9 && z >= 2.725 && z <= 6.975) {
    return clamp((6.975 - z) / 4.25, 0, 1) * 1.1675;
  }
  if (Math.abs(x) <= 2.9 && z >= -6.975 && z <= -2.725) {
    return clamp((z + 6.975) / 4.25, 0, 1) * 1.1675;
  }
  const zone = zoneHeight(x, z);
  return zone > 0.001 ? zone : -0.045;
}
function isBlockedAt(x, z, feetY, radius = 0.46) {
  for (const box of solidBounds) {
    if (feetY >= box.maxY - 0.13) continue;
    if (feetY + 2.25 <= box.minY) continue;
    let closestX;
    let closestZ;
    let reach = radius;
    if (box.shape === 'circle') {
      closestX = box.x;
      closestZ = box.z;
      reach += box.radius;
    } else {
      if (x < box.minX - radius || x > box.maxX + radius) continue;
      if (z < box.minZ - radius || z > box.maxZ + radius) continue;
      closestX = clamp(x, box.minX, box.maxX);
      closestZ = clamp(z, box.minZ, box.maxZ);
    }
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}
function actorSurfaceHeight(actor, x, z) {
  let surface = groundHeight(x, z);
  const feet = actor.position.y;
  for (const box of solidBounds) {
    if (box.maxY <= surface + 0.035 || feet < box.maxY - 0.16) continue;
    let onTop = false;
    if (box.shape === 'circle') {
      const dx = x - box.x;
      const dz = z - box.z;
      onTop = dx * dx + dz * dz <= box.radius * box.radius * 0.78;
    } else {
      onTop = x > box.minX + 0.05 && x < box.maxX - 0.05 &&
        z > box.minZ + 0.05 && z < box.maxZ - 0.05;
    }
    if (onTop) surface = Math.max(surface, box.maxY);
  }
  return surface;
}
function moveOnGround(actor, dx, dz, radius = 0.46) {
  const limit = HALF - (actor.player ? 1.0 : 1.4);
  const distance = Math.max(Math.abs(dx), Math.abs(dz));
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.12, radius * 0.42)));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  for (let step = 0; step < steps; step++) {
    const nextX = clamp(actor.position.x + stepX, -limit, limit);
    const xFeet = actorSurfaceHeight(actor, nextX, actor.position.z);
    if (!isBlockedAt(nextX, actor.position.z, Math.max(actor.position.y, xFeet), radius)) {
      actor.position.x = nextX;
    } else if (actor.velocity) {
      actor.velocity.x = 0;
    }
    const nextZ = clamp(actor.position.z + stepZ, -limit, limit);
    const zFeet = actorSurfaceHeight(actor, actor.position.x, nextZ);
    if (!isBlockedAt(actor.position.x, nextZ, Math.max(actor.position.y, zFeet), radius)) {
      actor.position.z = nextZ;
    } else if (actor.velocity) {
      actor.velocity.z = 0;
    }
  }
  const surfaceY = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
  // Keep air momentum, but settle onto the highest reachable solid surface.
  if (!actor.player) {
    if (actor.grounded === false) actor.position.y = Math.max(actor.position.y, surfaceY);
    else if (surfaceY < actor.position.y - 0.12) { actor.grounded = false; actor.verticalVelocity = Math.min(0, actor.verticalVelocity || 0); }
    else actor.position.y = surfaceY;
  } else if (actor.grounded && surfaceY < actor.position.y - 0.12) {
    // Walking off a raised cover edge starts a real fall instead of snapping down.
    actor.grounded = false;
    actor.verticalVelocity = Math.min(0, actor.verticalVelocity || 0);
  } else if (actor.grounded) {
    actor.position.y = surfaceY;
  } else {
    actor.position.y = Math.max(actor.position.y, surfaceY);
  }
}




const owners = new Int8Array(GRID * GRID);
const gridStep = ARENA / GRID;
function cellAt(x, z) {
  const gx = Math.floor((x + HALF) / gridStep);
  const gz = Math.floor((z + HALF) / gridStep);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return -1;
  return gz * GRID + gx;
}
function stampWetSurface(px, py, r, points, seed) {
  const trace = (ctx) => {
    ctx.beginPath();
    points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.closePath();
  };

  paintRoughnessCtx.save();
  trace(paintRoughnessCtx);
  paintRoughnessCtx.clip();
  const gloss = paintRoughnessCtx.createRadialGradient(
    px - r * 0.22, py - r * 0.24, r * 0.04, px, py, r * 1.03
  );
  gloss.addColorStop(0, 'rgba(20,20,20,.98)');
  gloss.addColorStop(.48, 'rgba(42,42,42,.94)');
  gloss.addColorStop(.82, 'rgba(78,78,78,.88)');
  gloss.addColorStop(1, 'rgba(130,130,130,.76)');
  paintRoughnessCtx.globalCompositeOperation = 'multiply';
  paintRoughnessCtx.fillStyle = gloss;
  paintRoughnessCtx.fillRect(px-r*1.2, py-r*1.2, r*2.4, r*2.4);
  paintRoughnessCtx.globalCompositeOperation = 'screen';
  paintRoughnessCtx.globalAlpha = 0.16;
  paintRoughnessCtx.strokeStyle = '#777';
  paintRoughnessCtx.lineWidth = Math.max(1.5, r * 0.018);
  for (let i = 0; i < 3; i++) {
    paintRoughnessCtx.beginPath();
    paintRoughnessCtx.ellipse(px-r*.08, py-r*.08, r*(.34+i*.13), r*(.24+i*.105), seed*.3, Math.PI*1.12, Math.PI*1.88);
    paintRoughnessCtx.stroke();
  }
  paintRoughnessCtx.restore();

  paintHeightCtx.save();
  trace(paintHeightCtx);
  paintHeightCtx.clip();
  const height = paintHeightCtx.createRadialGradient(
    px-r*.20, py-r*.22, r*.02, px, py, r*1.03
  );
  height.addColorStop(0, 'rgba(230,230,230,.92)');
  height.addColorStop(.38, 'rgba(170,170,170,.82)');
  height.addColorStop(.72, 'rgba(92,92,92,.48)');
  height.addColorStop(1, 'rgba(20,20,20,.08)');
  paintHeightCtx.globalCompositeOperation = 'lighter';
  paintHeightCtx.fillStyle = height;
  paintHeightCtx.fillRect(px-r*1.2, py-r*1.2, r*2.4, r*2.4);
  paintHeightCtx.fillStyle = 'rgba(230,230,230,.52)';
  for (let i = 0; i < 4; i++) {
    const a = seed*4 + i*1.57;
    const d = r*(.72+(i%2)*.12);
    paintHeightCtx.beginPath();
    paintHeightCtx.arc(px+Math.cos(a)*d, py+Math.sin(a)*d, r*(.06+(i%2)*.025), 0, Math.PI*2);
    paintHeightCtx.fill();
  }
  paintHeightCtx.restore();
  paintClearcoatCtx.save();
  trace(paintClearcoatCtx);
  paintClearcoatCtx.clip();
  const clearcoat = paintClearcoatCtx.createRadialGradient(
    px - r * 0.22, py - r * 0.24, r * 0.02, px, py, r * 1.02
  );
  clearcoat.addColorStop(0, 'rgba(255,255,255,.98)');
  clearcoat.addColorStop(.54, 'rgba(242,242,242,.88)');
  clearcoat.addColorStop(.86, 'rgba(188,188,188,.50)');
  clearcoat.addColorStop(1, 'rgba(0,0,0,0)');
  paintClearcoatCtx.globalCompositeOperation = 'lighter';
  paintClearcoatCtx.fillStyle = clearcoat;
  paintClearcoatCtx.fillRect(px-r*1.2, py-r*1.2, r*2.4, r*2.4);
  paintClearcoatCtx.restore();
  paintRoughnessTexture.needsUpdate = true;
  paintHeightTexture.needsUpdate = true;
  paintClearcoatTexture.needsUpdate = true;
}

function drawInkMark(ctx, team, px, py, r, seed) {
  const color = TEAM[team].ink;
  const points = [];
  const sides = 13;
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    const wobble = 0.72 + 0.28 * Math.abs(Math.sin(seed * 17 + i * 2.41));
    const stretch = 0.83 + 0.30 * Math.sin(seed * 4 + i * 1.7);
    points.push([px + Math.cos(angle) * r * wobble * stretch, py + Math.sin(angle) * r * wobble]);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(3, r * 0.08);
  const gradient = ctx.createRadialGradient(px-r*.24, py-r*.25, r*.04, px, py, r*1.12);
  gradient.addColorStop(0, TEAM[team].light);
  gradient.addColorStop(.23, color);
  gradient.addColorStop(1, TEAM[team].deep);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  });
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = .34;
  ctx.strokeStyle = TEAM[team].light;
  ctx.lineWidth = Math.max(2, r * .035);
  ctx.beginPath();
  ctx.ellipse(px-r*.05, py-r*.04, r*.60, r*.48, seed*2.4, Math.PI*1.08, Math.PI*1.86);
  ctx.stroke();

  ctx.globalAlpha = .8;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = seed*8 + i*2.18;
    const d = r*(.62 + (i%3)*.18);
    const dot = r*(.10 + (i%2)*.055);
    ctx.beginPath();
    ctx.ellipse(px+Math.cos(a)*d, py+Math.sin(a)*d, dot*1.2, dot*.76, a, 0, Math.PI*2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const a = seed*5.7 + i*1.53;
    const start = r*(.52 + (i%2)*.16);
    const end = r*(.92 + (i%3)*.18);
    ctx.strokeStyle = color;
    ctx.globalAlpha = .72;
    ctx.lineWidth = Math.max(2, r*(.035 + (i%2)*.012));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px+Math.cos(a)*start, py+Math.sin(a)*start);
    ctx.quadraticCurveTo(
      px+Math.cos(a+.12)*(start+end)*.52,
      py+Math.sin(a+.12)*(start+end)*.52,
      px+Math.cos(a)*end,
      py+Math.sin(a)*end
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawSplat(position, team, radius, seed = Math.random()) {
  const px = ((position.x + HALF) / ARENA) * paintCanvas.width;
  const py = ((HALF - position.z) / ARENA) * paintCanvas.height;
  const r = radius * (paintCanvas.width / ARENA);
  drawInkMark(paintCtx, team, px, py, r, seed);
  drawInkMark(raisedPaintCtx, team, px, py, r, seed);
  stampWetSurface(px, py, r, (() => {
    const points = [];
    for (let i = 0; i < 13; i++) {
      const angle = i / 13 * Math.PI * 2;
      const wobble = 0.72 + 0.28 * Math.abs(Math.sin(seed * 17 + i * 2.41));
      const stretch = 0.83 + 0.30 * Math.sin(seed * 4 + i * 1.7);
      points.push([px + Math.cos(angle) * r * wobble * stretch, py + Math.sin(angle) * r * wobble]);
    }
    return points;
  })(), seed);
  paintTexture.needsUpdate = true;
  raisedPaintTexture.needsUpdate = true;
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
function paintWallAt(wall, position, team, radius) {
  const px = clamp((position.x - wall.minX) / (wall.maxX - wall.minX), 0, 1) * wall.canvas.width;
  const py = clamp((wall.maxY - position.y) / (wall.maxY - wall.minY), 0, 1) * wall.canvas.height;
  const r = Math.max(12, radius * 48);
  const seed = Math.random() * 9;
  const sides = 12;
  wall.ctx.save();
  wall.ctx.shadowColor = TEAM[team].ink;
  wall.ctx.shadowBlur = 13;
  const gradient = wall.ctx.createRadialGradient(px - r * .24, py - r * .25, r * .05, px, py, r * 1.15);
  gradient.addColorStop(0, TEAM[team].light);
  gradient.addColorStop(.25, TEAM[team].ink);
  gradient.addColorStop(1, TEAM[team].deep);
  wall.ctx.fillStyle = gradient;
  wall.ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2;
    const wobble = .72 + .28 * Math.sin(seed + i * 2.3) ** 2;
    const xx = px + Math.cos(a) * r * wobble;
    const yy = py + Math.sin(a) * r * (0.78 + .22 * Math.cos(seed + i));
    if (i === 0) wall.ctx.moveTo(xx, yy); else wall.ctx.lineTo(xx, yy);
  }
  wall.ctx.closePath();
  wall.ctx.fill();
  wall.ctx.shadowBlur = 0;
  wall.ctx.fillStyle = TEAM[team].ink;
  for (let i = 0; i < 4; i++) {
    const a = seed + i * 1.6;
    wall.ctx.beginPath();
    wall.ctx.arc(px + Math.cos(a) * r * (0.65 + i * .08), py + Math.sin(a) * r * .68, r * (.08 + (i % 2) * .04), 0, Math.PI * 2);
    wall.ctx.fill();
  }
  wall.ctx.restore();
  wall.texture.needsUpdate = true;
}
function spawnWallSplash(position, team) {
  const material = projectileMaterials[team];
  for (let i = 0; i < 4; i++) {
    const dot = mesh(shared.smallSphere, material, scene, position.x, position.y, position.z);
    dot.layers.disable(1);
    const angle = Math.random() * Math.PI * 2;
    const size = .07 + Math.random() * .08;
    dot.scale.set(size, size, size);
    particles.push({
      mesh: dot, life: .28 + Math.random() * .2, maxLife: .48,
      velocity: new THREE.Vector3(Math.cos(angle) * (1 + Math.random()), 1 + Math.random() * 1.6, Math.sin(angle) * .22)
    });
  }
}
function paintAt(position, team, radius = 2.05, quiet = false) {
  if (Math.abs(position.x) > HALF || Math.abs(position.z) > HALF) return;
  if (position.y > 0.42) {
    const wall = paintableWalls.find((item) =>
      position.x >= item.minX && position.x <= item.maxX &&
      position.y >= item.minY && position.y <= item.maxY &&
      Math.abs(position.z - item.faceZ) < 0.48
    );
    if (wall) {
      paintWallAt(wall, position, team, radius);
      if (!quiet) spawnWallSplash(position, team);
      return;
    }
  }
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
  if (!quiet) {
    addPersistentWetInk(position, team, Math.max(0.58, radius * 0.78), Math.random());
    spawnSplash(position, team);
  }
}
function seedArea(team, x, z) {
  for (let i = 0; i < 9; i++) {
    paintAt(new THREE.Vector3(x + (Math.random() - 0.5) * 8, 0, z + (Math.random() - 0.5) * 5), team, 2.3, true);
  }
}
seedArea(BLUE, 0, SPAWN_Z - 0.5);
seedArea(ORANGE, 0, -SPAWN_Z + 0.5);
paintAt(new THREE.Vector3(0, 0, SPAWN_Z), BLUE, 2.45, true);

const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = 128;
shadowCanvas.height = 128;
const shadowCtx = shadowCanvas.getContext('2d');
const shadowGradient = shadowCtx.createRadialGradient(64, 64, 7, 64, 64, 62);
shadowGradient.addColorStop(0, 'rgba(0,0,0,.42)');
shadowGradient.addColorStop(.45, 'rgba(0,0,0,.22)');
shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
shadowCtx.fillStyle = shadowGradient;
shadowCtx.fillRect(0, 0, 128, 128);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
const shadowGeometry = new THREE.PlaneGeometry(1, 1);
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture, transparent: true, depthWrite: false,
  color: 0x07131a, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -2
});
function updateActorShadow(actor) {
  if (!actor.shadow) return;
  actor.shadow.visible = actor.group.visible;
  const floorY = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
  actor.shadow.position.set(actor.position.x, floorY + 0.025, actor.position.z);
  const height = Math.max(0, actor.position.y - floorY);
  actor.shadow.scale.set(1.35 + height * 0.35, 0.83 + height * 0.22, 1);
  actor.shadow.material.opacity = clamp(0.72 - height * 0.22, 0.26, 0.72);
}
const projectileGeometry = new THREE.SphereGeometry(0.14, 14, 10);
const projectileMaterials = {
  1: new THREE.MeshPhysicalMaterial({ color: TEAM[1].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.045, emissive: 0x073c50, emissiveIntensity: 0.18 }),
  2: new THREE.MeshPhysicalMaterial({ color: TEAM[2].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.045, emissive: 0x542014, emissiveIntensity: 0.15 })
};
const projectileStreakGeometry = new THREE.CylinderGeometry(0.012, 0.070, 0.72, 8, 1, true);
const projectileStreakMaterials = {
  1: new THREE.MeshBasicMaterial({ color: 0x8cffff, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  2: new THREE.MeshBasicMaterial({ color: 0xffc1a2, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
};
const splashMaterials = {
  1: new THREE.MeshPhysicalMaterial({ color: TEAM[1].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.04, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  2: new THREE.MeshPhysicalMaterial({ color: TEAM[2].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.04, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
};

const splashPuddleGeometry = new THREE.CircleGeometry(0.58, 22);

// Persistent wet-ink overlays are instanced per team: the game keeps the sheen
// on the floor after the impact animation has finished without adding hundreds
// of independent draw calls.
function makeWetPoolGeometry() {
  const sides = 24;
  const positions = [0, 0.016, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  const radii = [0.38, 0.73, 1.0];
  const heights = [0.013, 0.007, 0.0015];
  for (let ring = 0; ring < radii.length; ring++) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const wobble = 0.90 + 0.10 * Math.sin(i * 2.17 + ring * 0.8) + 0.035 * Math.cos(i * 4.1);
      const radius = radii[ring] * wobble;
      positions.push(Math.cos(a) * radius, heights[ring], Math.sin(a) * radius);
      uvs.push(0.5 + Math.cos(a) * radius * 0.5, 0.5 + Math.sin(a) * radius * 0.5);
    }
  }
  const ringStart = (ring) => 1 + ring * sides;
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    indices.push(0, ringStart(0) + i, ringStart(0) + next);
    for (let ring = 0; ring < 2; ring++) {
      const a = ringStart(ring) + i;
      const b = ringStart(ring) + next;
      const c = ringStart(ring + 1) + i;
      const d = ringStart(ring + 1) + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const wetPoolGeometry = makeWetPoolGeometry();
const wetPoolMaterials = {
  1: new THREE.MeshPhysicalMaterial({
    color: TEAM[1].ink, roughness: 0.095, metalness: 0.035,
    clearcoat: 1, clearcoatRoughness: 0.025, sheen: 0.35, sheenRoughness: 0.12,
    side: THREE.DoubleSide
  }),
  2: new THREE.MeshPhysicalMaterial({
    color: TEAM[2].ink, roughness: 0.095, metalness: 0.035,
    clearcoat: 1, clearcoatRoughness: 0.025, sheen: 0.35, sheenRoughness: 0.12,
    side: THREE.DoubleSide
  })
};
const wetPools = {
  1: new THREE.InstancedMesh(wetPoolGeometry, wetPoolMaterials[1], 128),
  2: new THREE.InstancedMesh(wetPoolGeometry, wetPoolMaterials[2], 128)
};
const wetPoolCounts = { 1: 0, 2: 0 };
const wetPoolTransform = new THREE.Object3D();
for (const team of [1, 2]) {
  wetPools[team].count = 0;
  wetPools[team].visible = false;
  wetPools[team].frustumCulled = false;
  wetPools[team].renderOrder = 2;
  wetPools[team].castShadow = false;
  wetPools[team].receiveShadow = false;
  scene.add(wetPools[team]);
}
function addPersistentWetInk(position, team, radius, seed) {
  const index = wetPoolCounts[team];
  if (index >= 128) return;
  const surfaceY = paintSurfaceHeight(position.x, position.z);
  wetPoolTransform.position.set(position.x, surfaceY + 0.003, position.z);
  const sx = radius * (0.82 + 0.22 * Math.sin(seed * 8));
  const sz = radius * (0.68 + 0.23 * Math.cos(seed * 5));
  wetPoolTransform.scale.set(sx, 1, sz);
  wetPoolTransform.rotation.set(0, seed * Math.PI * 2, 0);
  wetPoolTransform.updateMatrix();
  wetPools[team].setMatrixAt(index, wetPoolTransform.matrix);
  wetPoolCounts[team]++;
  wetPools[team].count = wetPoolCounts[team];
  wetPools[team].instanceMatrix.needsUpdate = true;
  wetPools[team].visible = true;
}
const projectiles = [];
const particles = [];
function spawnSplash(position, team, groundOverride = null) {
  const ground = Number.isFinite(groundOverride)
    ? groundOverride + 0.003
    : paintSurfaceHeight(position.x, position.z) + 0.003;
  const puddleMaterial = splashMaterials[team].clone();
  const puddle = new THREE.Mesh(splashPuddleGeometry, puddleMaterial);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(position.x, ground, position.z);
  const s = 1.00 + Math.random() * 0.34;
  puddle.scale.set(s, s * (0.70 + Math.random() * 0.25), 1);
  puddle.layers.disable(1);
  scene.add(puddle);
  particles.push({ mesh: puddle, life: 0.42, maxLife: 0.42, puddle: true, material: puddleMaterial });

  const ringMaterial = splashMaterials[team].clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 24), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, ground + 0.018, position.z);
  ring.scale.set(0.9, 0.78, 1);
  ring.layers.disable(1);
  scene.add(ring);
  particles.push({ mesh: ring, life: 0.40, maxLife: 0.40, ring: true, material: ringMaterial });

  for (let i = 0, dots = Math.max(4, Math.round(12 * fxScale)); i < dots; i++) {
    const dot = mesh(shared.sphere, projectileMaterials[team], scene, position.x, ground + 0.10, position.z);
    dot.layers.disable(1);
    const angle = Math.random() * Math.PI * 2;
    const scale = 0.075 + Math.random() * 0.105;
    dot.scale.set(scale * (0.95 + Math.random() * 0.6), scale * 1.18, scale * (0.95 + Math.random() * 0.6));
    dot.rotation.z = angle;
    particles.push({
      mesh: dot, life: 0.34 + Math.random() * 0.25, maxLife: 0.60, groundY: ground, team,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (1.8 + Math.random() * 3.0),
        1.6 + Math.random() * 2.6,
        Math.sin(angle) * (1.55 + Math.random() * 2.6)
      )
    });
  }
}
function spawnMotionSpray(actor, count = 2, strength = 0.7) {
  if (particles.length > 118 * Math.max(0.6, fxScale)) return;
  count = Math.max(1, Math.round(count * fxScale));
  const surface = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
  const movement = actor.velocity.clone().setY(0);
  if (movement.lengthSq() < 0.04) return;
  movement.normalize();
  const side = new THREE.Vector3(-movement.z, 0, movement.x);
  for (let i = 0; i < count; i++) {
    const lateral = (Math.random() - 0.5) * 0.48;
    const position = new THREE.Vector3(
      actor.position.x - movement.x * (0.18 + Math.random() * 0.22) + side.x * lateral,
      surface + 0.035 + Math.random() * 0.08,
      actor.position.z - movement.z * (0.18 + Math.random() * 0.22) + side.z * lateral
    );
    const drop = mesh(shared.smallSphere, projectileMaterials[actor.team], scene, position.x, position.y, position.z);
    drop.layers.disable(1);
    const size = 0.045 + Math.random() * (strength > 1.2 ? 0.075 : 0.045);
    drop.scale.set(size * (actor.sliding ? 2.4 : 1.55), size * 0.68, size * (actor.sliding ? 1.5 : 1.2));
    particles.push({
      mesh: drop, life: 0.30 + Math.random() * 0.20, maxLife: 0.50, groundY: surface,
      velocity: new THREE.Vector3(
        -movement.x * (0.45 + Math.random() * strength) + side.x * lateral * (actor.sliding ? 4.2 : 2.8),
        0.42 + Math.random() * (actor.sliding ? 1.4 : 0.85) * strength,
        -movement.z * (0.45 + Math.random() * strength) + side.z * lateral * (actor.sliding ? 4.2 : 2.8)
      )
    });
  }
}
function spawnHitBurst(position, team, strength = 1) {
  if (particles.length > 108) return;
  const count = Math.min(16, Math.round(9 + strength * 4.5));
  for (let i = 0; i < count; i++) {
    const drop = mesh(shared.smallSphere, projectileMaterials[team], scene, position.x, position.y, position.z);
    drop.layers.disable(1);
    const size = 0.055 + Math.random() * 0.075;
    drop.scale.set(size, size * (0.8 + Math.random() * 0.8), size);
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.7 + Math.random() * 3.5) * strength;
    particles.push({
      mesh: drop, life: 0.30 + Math.random() * 0.24, maxLife: 0.54,
      groundY: paintSurfaceHeight(position.x, position.z),
      velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.0 + Math.random() * 2.2 * strength, Math.sin(angle) * speed)
    });
  }
}
function spawnMuzzleBurst(origin, direction, team) {
  if (particles.length > 112) return;
  const forward = direction.clone().normalize();
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  for (let i = 0; i < 7; i++) {
    const drop = mesh(shared.smallSphere, projectileMaterials[team], scene, origin.x, origin.y, origin.z);
    drop.layers.disable(1);
    const size = 0.045 + Math.random() * 0.055;
    drop.scale.set(size * 1.8, size, size);
    const lateral = (Math.random() - 0.5) * 2.4;
    particles.push({
      mesh: drop, life: 0.13 + Math.random() * 0.11, maxLife: 0.24,
      velocity: forward.clone().multiplyScalar(2.8 + Math.random() * 3.4).addScaledVector(side, lateral).add(new THREE.Vector3(0, (Math.random() - 0.5) * 1.6, 0))
    });
  }
}
function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= delta;
    const progress = 1 - Math.max(0, p.life) / p.maxLife;
    if (p.ring) {
      p.mesh.scale.set(0.9 + progress * 2.8, 0.78 + progress * 2.45, 1);
      p.mesh.material.opacity = 0.70 * (1 - progress);
    } else if (p.puddle) {
      p.mesh.scale.x *= 1 + delta * 0.55;
      p.mesh.scale.y *= 1 + delta * 0.42;
      p.mesh.material.opacity = 0.86 * (1 - progress);
    } else {
      const contactRadius = Math.max(0.018, Math.max(p.mesh.scale.x, p.mesh.scale.y, p.mesh.scale.z) * 0.34);
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= 6.5 * delta;
      if (Number.isFinite(p.groundY) && p.velocity.y < 0 &&
          p.mesh.position.y <= p.groundY + contactRadius) {
        p.mesh.position.y = p.groundY + contactRadius;
        if (!p.bounced && p.velocity.y < -1.25) {
          p.velocity.y *= -0.18;
          p.velocity.x *= 0.56;
          p.velocity.z *= 0.56;
          p.bounced = true;
        } else {
          p.velocity.set(0, 0, 0);
          p.settled = true;
          p.life = Math.min(p.life, 0.22);
          // Droplets leave tiny satellite splats behind, like real flicked paint.
          if (p.team && !p.painted && fxScale >= 0.75 && Math.random() < 0.4) {
            p.painted = true;
            paintAt(new THREE.Vector3(p.mesh.position.x, 0, p.mesh.position.z), p.team, 0.32 + Math.random() * 0.3, true);
          }
        }
      }
      if (p.settled) {
        p.mesh.scale.multiplyScalar(1 - delta * 2.2);
      } else {
        p.mesh.rotation.x += delta * 3.4;
        p.mesh.rotation.z += delta * 2.2;
        p.mesh.scale.multiplyScalar(1 - delta * 1.25);
      }
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.material) p.material.dispose();
      if (!p.ring && !p.puddle) p.mesh.scale.set(1, 1, 1);
      particles.splice(i, 1);
    }
  }
}


// Skeletal operators (Quaternius CC0 rig + animation library). The group exposes
// the same weapon / flash / userData contract the rest of the game relies on.
function makeCharacter(team, variation = 0, isPlayer = false) {
  return createOperatorGroup({ team, variation, isPlayer, palette: TEAM[team] });
}

function setWeaponHolstered(actor, holstered, instant = false) {
  const c = actor.group.userData.character;
  if (!c) return;
  const target = holstered ? 0 : 1;
  if (!instant && c.weaponHolstered === holstered &&
      (!c.weaponTransition || c.weaponTransition.to === target)) return;
  c.weaponHolstered = holstered;
  if (instant) {
    c.weaponBlend = target;
    c.weaponTransition = null;
    return;
  }
  c.weaponTransition = {
    from: c.weaponBlend ?? 1,
    to: target,
    elapsed: 0,
    duration: holstered ? 0.26 : 0.22
  };
}
function resetCharacterPose(actor) {
  const c = actor.group.userData.character;
  if (!c) return;
  setWeaponHolstered(actor, false, true);
  c.animator?.reset();
  actor.ragdollState = null;
  actor.hitTimer = 0;
  actor.landImpact = 0;
}

function createActor(team, variation, x, z, playerControlled = false) {
  const group = makeCharacter(team, variation, playerControlled);
  const actor = {
    team, variation, group, position: new THREE.Vector3(x, groundHeight(x, z), z),
    player: playerControlled, health: 100, maxHealth: 100,
    fireCooldown: 0.6 + Math.random() * 1.4, paintCooldown: 0.3 + Math.random() * 0.4,
    moveCooldown: 0, target: new THREE.Vector3(x, 0, z),
    respawn: 0, invulnerable: 0, eliminations: 0, walkPhase: Math.random() * 6,
    ink: 100, flow: 0, flowCooldown: 0, verticalVelocity: 0, grounded: true,
    velocity: new THREE.Vector3(), recoil: 0, hitTimer: 0, landImpact: 0, ragdollState: null,
    sprinting: false, sliding: false, slideTimer: 0, slideCooldown: 0,
    slideSpeed: 0, slideDirection: new THREE.Vector3(),
    jumpBuffer: 0, coyoteTimer: 0.12, jumpHoldTimer: 0, effectTimer: 0, aimElevation: 0
  };
  if (playerControlled) group.traverse((child) => {
    if (!child.isMesh) return;
    child.layers.disable(1);
    child.castShadow = true;
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.35, 0.83, 1);
  shadow.position.set(x, groundHeight(x, z) + 0.025, z);
  scene.add(shadow);
  actor.shadow = shadow;
  group.position.copy(actor.position);
  scene.add(group);
  return actor;
}
const player = createActor(BLUE, 0, 0, SPAWN_Z, true);
const blueBots = [
  createActor(BLUE, 1, -8.8, SPAWN_Z - 4),
  createActor(BLUE, 2, -4.5, SPAWN_Z - 1.5),
  createActor(BLUE, 3, 4.8, SPAWN_Z - 1.5),
  createActor(BLUE, 4, 9.0, SPAWN_Z - 4)
];
const orangeBots = [
  createActor(ORANGE, 0, -9.0, -SPAWN_Z + 4),
  createActor(ORANGE, 1, -4.5, -SPAWN_Z + 1.5),
  createActor(ORANGE, 2, 4.8, -SPAWN_Z + 1.5),
  createActor(ORANGE, 3, 9.0, -SPAWN_Z + 4),
  createActor(ORANGE, 4, 0, -SPAWN_Z + 3)
];
const blueTeam = [player, ...blueBots];
const orangeTeam = orangeBots;
const actors = [...blueTeam, ...orangeTeam];

// Local CC0 Kenney blaster. Procedural gun stays visible until the GLB loads.
function equipBlasterModel(actor) {
  getKenneySource('blaster', 'blaster-e.glb').then((sourceModel) => {
    if (!sourceModel) return;
    const c = actor.group.userData.character;
    if (!c?.weaponVisual) return;
    const model = sourceModel.clone(true);
    model.scale.setScalar(0.78);
    model.rotation.set(0, Math.PI, 0);
    model.position.set(0.035, 0.01, 0.58);
    model.traverse((node) => {
      if (!node.isMesh) return;
      if (actor.player) node.layers.set(0);
      else node.layers.enable(1);
      node.castShadow = false;
      node.receiveShadow = false;
    });
    c.weaponVisual.scale.set(1, 1, 1);
    c.weaponVisual.add(model);
    c.weaponVisual.updateMatrixWorld(true);
    c.proceduralWeapon.visible = false;
    c.weapon.updateWorldMatrix(true, false);
    model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model);
    const centre = bounds.getCenter(new THREE.Vector3());
    const muzzleWorld = new THREE.Vector3(centre.x, centre.y, bounds.min.z - 0.018);
    c.weapon.userData.muzzleLocal = c.weapon.worldToLocal(muzzleWorld);
    // Weapon-local bounds: drives the grip sockets and a pose-independent muzzle.
    const inverseWeapon = c.weapon.matrixWorld.clone().invert();
    const fit = new THREE.Box3();
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.computeBoundingBox();
      fit.union(node.geometry.boundingBox.clone().applyMatrix4(inverseWeapon.clone().multiply(node.matrixWorld)));
    });
    c.weapon.userData.muzzleLocal = new THREE.Vector3((fit.min.x + fit.max.x) / 2, (fit.min.y + fit.max.y) / 2, fit.min.z - 0.018);
    c.flash.position.copy(c.weapon.userData.muzzleLocal);
    c.weaponFitBox = fit;
    refreshWeaponFit(actor);
  }).catch((error) => console.warn('Tint3d is using its fallback blaster:', error));
}
actors.forEach((actor) => {
  const grips = actor.group.userData.character?.gripHands || [];
  if (actor.player) for (const grip of grips) grip.fingers.layers.set(0);
  equipBlasterModel(actor);
});
function buildRoster(element, team) {
  element.innerHTML = team.map((actor, index) =>
    '<span class="crew-dot ' + (actor.player ? 'is-player' : '') + '" title="' + (actor.player ? 'YOU' : 'CREW ' + (index + 1)) + '"></span>'
  ).join('');
}
buildRoster(ui.blueRoster, blueTeam);
buildRoster(ui.orangeRoster, orangeTeam);

function buildIntroRoster(element, team, isHome) {
  element.innerHTML = team.map((actor, index) => {
    const label = actor.player ? 'YOU' : (isHome ? 'CREW ' : 'RIVAL ') + String(index + 1).padStart(2, '0');
    const mark = actor.player ? 'YOU' : String(index + 1).padStart(2, '0');
    const role = actor.player ? 'FIELD LEAD' : (index % 2 ? 'SUPPORT' : 'FRONTLINE');
    return '<div class="intro-operator" style="--slot:' + index + '">' +
      '<span class="operator-mark">' + mark + '</span>' +
      '<strong class="operator-name">' + label + '</strong>' +
      '<small class="operator-role">' + role + '</small>' +
      '</div>';
  }).join('');
}
buildIntroRoster(ui.introBlueRoster, blueTeam, true);
buildIntroRoster(ui.introOrangeRoster, orangeTeam, false);


const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const clock = new THREE.Clock();
let yaw = 0;
let pitch = 0.20;
let gameStarted = false;
let introActive = false;
let introElapsed = 0;
let introSavedActors = [];
let paused = false;
let ended = false;
let soundOn = (() => { try { return localStorage.getItem('tint3d.sound') === '1'; } catch { return false; } })();
let timeLeft = MATCH_SECONDS;
let toastTimer = 0;
let fireHeld = false;
let cameraShake = 0;
let cameraRecoil = 0;
let crosshairHitTimer = 0;
let crosshairFireTimer = 0;
let jumpQueued = false;
let jumpHeld = false;
let diveHeld = false;
let diveWarned = false;
let firePointer = null;
let sprintLocked = false;
let sprintWasRequested = false;
let slideQueued = false;
let flowQueued = false;
let lastPlayerPaintPosition = null;
let joystick = { x: 0, y: 0 };
let activePointers = new Map();
let audioContext = null;
let miniTimer = 0;
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
  // Raycast from the current rendered camera transform, including same-frame
  // camera movement and recoil, so the reticle and shot destination agree.
  camera.updateMatrixWorld(true);
  for (const actor of actors) actor.group.updateMatrixWorld(true);
  raycaster.layers.set(1);
  raycaster.setFromCamera(centerScreen, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  // Ignore the local operator and their two animated grip hands; otherwise
  // the third-person aim ray can collide with the player model before targets.
  for (const hit of hits) {
    let owner = hit.object;
    while (owner && owner !== player.group) owner = owner.parent;
    if (owner === player.group) continue;
    return hit.point.clone();
  }
  return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 32);
}
function muzzlePosition(actor) {
  const weapon = actor.group.userData.weapon;
  if (weapon) {
    // Read the muzzle from the animated weapon itself, not a guessed body offset.
    actor.group.updateMatrixWorld(true);
    weapon.updateWorldMatrix(true, false);
    const localMuzzle = weapon.userData.muzzleLocal || new THREE.Vector3(0, 0, -0.94);
    return weapon.localToWorld(localMuzzle.clone());
  }
  return actor.position.clone().add(new THREE.Vector3(0, 1.30, 0));
}
function spawnProjectile(origin, target, team, owner, spec = WEAPONS.pulse) {
  const shot = new THREE.Group();
  const core = new THREE.Mesh(projectileGeometry, projectileMaterials[team]);
  core.scale.set(0.82 * spec.scale, 0.82 * spec.scale, 1.85 * Math.max(0.8, spec.scale));
  shot.add(core);
  const glow = new THREE.Mesh(
    projectileGeometry,
    new THREE.MeshBasicMaterial({ color: team === BLUE ? 0x77f5ff : 0xffbb91, transparent: true, opacity: 0.24, depthWrite: false })
  );
  glow.scale.set(1.45 * spec.scale, 1.45 * spec.scale, 2.35 * Math.max(0.8, spec.scale));
  shot.add(glow);
  const streak = new THREE.Mesh(projectileStreakGeometry, projectileStreakMaterials[team]);
  streak.rotation.x = Math.PI / 2;
  streak.position.z = -0.36;
  shot.add(streak);
  shot.position.copy(origin);
  scene.add(shot);
  const delta = target.clone().sub(origin);
  const distance = Math.max(1, delta.length());
  const travel = clamp(distance / spec.speed, 0.06, 1.2);
  const gravity = -1.65;
  const velocity = new THREE.Vector3(
    delta.x / travel,
    delta.y / travel - 0.5 * gravity * travel,
    delta.z / travel
  );
  shot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocity.clone().normalize());
  projectiles.push({
    mesh: shot, velocity, gravity, life: spec.life, team, owner, radius: 0.38 * Math.max(0.7, spec.scale * 0.8),
    damage: spec.damage, paintRadius: spec.paintRadius, splash: spec.splash
  });
}
function fireActor(actor, target) {
  const spec = WEAPONS[actor.weaponType || 'pulse'];
  if (actor.fireCooldown > 0 || actor.ink < spec.ink || !actor.group.visible) return;
  if (actor.diving || actor.frozen > 0 || actor.drinking > 0) return;
  const character = actor.group.userData.character;
  const wasHolstered = !!character?.weaponHolstered;
  setWeaponHolstered(actor, false, !!(actor.player && wasHolstered));
  if (actor.player) {
    actor.sprinting = false;
    // The character's local front is -Z; negative yaw matches camera yaw.
    actor.group.rotation.y = -yaw;
    // On the first shot out of a sprint/slide, move the weapon to its hand
    // immediately so the projectile originates at the visible barrel.
    if (wasHolstered) {
      const gait = clamp(Math.hypot(actor.velocity.x, actor.velocity.z) / 13.8, 0, 1.18);
      animateActor(actor, gait, 0);
    }
  }
  actor.fireCooldown = actor.player ? spec.cooldown : spec.botCooldown * (0.8 + Math.random() * 0.5);
  actor.ink = Math.max(0, actor.ink - spec.ink * (actor.player ? 1 : 0.86));
  actor.recoil = (actor.player ? 0.22 : 0.095) * (spec.cooldown > 0.3 ? 2.2 : 1);
  actor.group.userData.shotTimer = 0.30;
  actor.group.userData.flashTimer = 0.075;
  actor.group.userData.flash.visible = true;
  const destination = target.clone();
  if (!actor.player) {
    destination.y += 0.08;
    destination.x += (Math.random() - 0.5) * 1.5;
    destination.z += (Math.random() - 0.5) * 1.5;
  }
  const muzzle = muzzlePosition(actor);
  const shotDirection = destination.clone().sub(muzzle).normalize();
  spawnMuzzleBurst(muzzle, shotDirection, actor.team);
  for (let pellet = 0; pellet < spec.pellets; pellet++) {
    const aimPoint = destination.clone();
    if (spec.spread > 0) {
      const reach = muzzle.distanceTo(destination);
      aimPoint.x += (Math.random() - 0.5) * spec.spread * reach * 2;
      aimPoint.y += (Math.random() - 0.5) * spec.spread * reach;
      aimPoint.z += (Math.random() - 0.5) * spec.spread * reach * 2;
    }
    spawnProjectile(muzzle, aimPoint, actor.team, actor, spec);
  }
  if (actor.player) {
    cameraShake = Math.max(cameraShake, 0.048);
    cameraRecoil = Math.min(0.052, cameraRecoil + 0.009);
    ui.crosshair.classList.add('is-firing');
    crosshairFireTimer = 0.075;
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
  const glow = projectile.mesh.children?.[1];
  if (glow?.material && glow.material !== projectileMaterials[projectile.team]) glow.material.dispose();
  projectiles.splice(index, 1);
}
function respawnActor(actor) {
  const sign = actor.team === BLUE ? 1 : -1;
  const side = actor.variation % 2 === 0 ? -1 : 1;
  actor.position.set(side * (3.5 + actor.variation * 1.15), 0, sign * (SPAWN_Z - 1.5 + Math.random() * 2.6));
  actor.position.y = groundHeight(actor.position.x, actor.position.z);
  actor.velocity.set(0, 0, 0);
  actor.verticalVelocity = 0;
  actor.grounded = true;
  actor.health = 100;
  actor.ink = 100;
  actor.respawn = 0;
  actor.ai = null;
  actor.frozen = 0;
  actor.sticky = 0;
  actor.drinking = 0;
  actor.diving = false;
  actor.sliding = false;
  actor.flow = 0;
  if (!actor.player) { setWeapon(actor, BOT_WEAPONS[actor.variation % BOT_WEAPONS.length]); items.loadout(actor); }
  actor.invulnerable = 1.4;
  actor.group.visible = true;
  actor.group.position.copy(actor.position);
  actor.group.rotation.set(0, actor.team === BLUE ? 0 : Math.PI, 0);
  resetCharacterPose(actor);
  updateActorShadow(actor);
  if (actor.player) {
    actor.sliding = false;
    actor.sprinting = false;
    actor.slideTimer = 0;
    actor.slideCooldown = 0;
    actor.jumpBuffer = 0;
    actor.coyoteTimer = 0.12;
    lastPlayerPaintPosition = new THREE.Vector3(actor.position.x, 0, actor.position.z);
  }
}
const pixelBurst = createPixelBurst(scene);
function burstActor(actor, source) {
  const ink = actor.team === BLUE ? [0x20d8e9, 0x7cf0ff, 0x1692a8] : [0xff7652, 0xffb094, 0xc2492c];
  const palette = [...ink, ...ink, 0x1c2a33, 0x2f4452, 0xf2f6f4, 0xd7a07a, 0x8a5a3a, 0x3a2a1f];
  let push = null;
  if (source?.position) {
    push = new THREE.Vector3(actor.position.x - source.position.x, 0, actor.position.z - source.position.z);
    if (push.lengthSq() > 0.01) push.normalize(); else push = null;
  }
  pixelBurst.spawn(actor.position, palette, { count: Math.round(190 * Math.max(0.5, fxScale)), push, floorAt: paintSurfaceHeight });
  spawnHitBurst(new THREE.Vector3(actor.position.x, actor.position.y + 1.0, actor.position.z), actor.team, 2.2);
  playPop(1.6);
  if (camera.position.distanceTo(actor.position) < 20) cameraShake = Math.max(cameraShake, 0.14);
  actor.group.visible = false;
  if (actor.shadow) actor.shadow.visible = false;
  if (actor.diveBlob) actor.diveBlob.visible = false;
  actor.diving = false;
  actor.sliding = false;
}
function damageActor(actor, amount, source) {
  if (actor.invulnerable > 0 || !actor.group.visible || actor.ragdollState) return;
  actor.health = Math.max(0, actor.health - amount);
  actor.hitTimer = 0.22;
  actor.regenDelay = 3.2;
  if (actor.player) {
    updateInk();
    ui.hit.classList.add('visible');
    hitTimer = 0.18;
  }
  if (actor.health <= 0) {
    items.onElimination(actor, source);
    actor.diving = false;
    actor.respawn = actor.player ? 2.3 : 3.4;
    const direction = source ? actor.position.clone().sub(source.position) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
    if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
    direction.normalize();
    actor.ragdollState = {
      time: 0, pitch: -0.28, pitchVelocity: -1.15 - Math.random() * 0.45,
      roll: direction.x * 0.42, rollVelocity: direction.x * 2.1,
      leftArmVelocity: -5.2 - Math.random() * 2.5,
      rightArmVelocity: 4.8 + Math.random() * 2.8,
      leftElbowVelocity: 5.5, rightElbowVelocity: -5.2,
      legVelocity: [-3.4 - Math.random() * 2, 3.0 + Math.random() * 2]
    };
    actor.velocity.addScaledVector(direction, 3.2);
    actor.group.visible = true;
    if (actor.shadow) actor.shadow.visible = true;
    // Everyone pops into pixels (no skeletal death clip any more).
    actor.ragdollState = null;
    burstActor(actor, source);
    if (source && source.player) {
      source.eliminations++;
      totalEliminations++;
      ui.eliminations.textContent = String(totalEliminations).padStart(2, '0');
      showToast('CREW SPLAT  +1');
      playPop(1.4);
    }
  }
}
function splashShot(pos, p, exclude) {
  for (const actor of actors) {
    if (actor === exclude || actor.team === p.team || !actor.group.visible || actor.ragdollState || actor.invulnerable > 0) continue;
    const d = Math.hypot(actor.position.x - pos.x, actor.position.z - pos.z);
    if (d > p.splash || Math.abs(actor.position.y + 1 - pos.y) > 2.4) continue;
    damageActor(actor, p.damage * 0.5 * (1 - d / p.splash * 0.5) * (actor.player ? 0.61 : 1), p.owner);
    spawnHitBurst(new THREE.Vector3(actor.position.x, actor.position.y + 1.0, actor.position.z), p.team, 0.8);
  }
}
function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= delta;
    const previous = p.mesh.position.clone();
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.velocity.y += p.gravity * delta;
    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.velocity.clone().normalize());
    const pos = p.mesh.position;
    const travel = pos.clone().sub(previous);
    const travelLengthSq = Math.max(0.000001, travel.lengthSq());
    let hitActor = false;
    for (const actor of actors) {
      if (actor.team === p.team || actor === p.owner || !actor.group.visible || actor.invulnerable > 0 || actor.ragdollState) continue;
      const center = new THREE.Vector3(actor.position.x, actor.position.y + (actor.diving ? 0.30 : 1.02), actor.position.z);
      const along = clamp(center.clone().sub(previous).dot(travel) / travelLengthSq, 0, 1);
      const closest = previous.clone().addScaledVector(travel, along);
      const dx = closest.x - center.x;
      const dy = closest.y - center.y;
      const dz = closest.z - center.z;
      const combinedRadius = 0.54 + p.radius * 0.42;
      if (dx * dx + dz * dz < combinedRadius * combinedRadius && Math.abs(dy) < (actor.diving ? 0.5 : 0.94)) {
        pos.copy(closest);
        const damage = p.damage * (actor.player ? 0.61 : 1);
        const elimination = actor.health <= damage;
        damageActor(actor, damage, p.owner);
        spawnHitBurst(new THREE.Vector3(pos.x, actor.position.y + 1.05, pos.z), p.team, actor.player ? 1.25 : 1);
        if (actor.player) cameraShake = Math.max(cameraShake, 0.20);
        if (p.owner === player) {
          ui.crosshair.classList.remove('is-hit', 'is-elimination');
          ui.crosshair.classList.add(elimination ? 'is-elimination' : 'is-hit');
          crosshairHitTimer = elimination ? 0.30 : 0.18;
          cameraShake = Math.max(cameraShake, elimination ? 0.13 : 0.065);
          playPop(elimination ? 1.6 : 1.25);
        }
        paintAt(new THREE.Vector3(pos.x, 0, pos.z), p.team, p.paintRadius ? p.paintRadius * 1.1 : 1.72);
        if (p.splash > 0) splashShot(pos, p, actor);
        hitActor = true;
        break;
      }
    }
    let hitWorld = false;
    let hitFloor = false;
    if (!hitActor) {
      const travelDistance = Math.sqrt(travelLengthSq);
      const samples = Math.max(1, Math.ceil(travelDistance / 0.16));
      for (let step = 1; step <= samples; step++) {
        const sample = previous.clone().lerp(pos, step / samples);
        if (Math.abs(sample.x) > HALF || Math.abs(sample.z) > HALF) break;
        const floorY = paintSurfaceHeight(sample.x, sample.z);
        if (sample.y <= floorY + 0.12) {
          pos.copy(sample);
          hitFloor = true;
          break;
        }
        const solid = solidBounds.find((box) => {
          if (sample.y <= box.minY || sample.y >= box.maxY) return false;
          if (box.shape === 'circle') {
            const dx = sample.x - box.x;
            const dz = sample.z - box.z;
            return dx * dx + dz * dz < (box.radius + p.radius * 0.35) ** 2;
          }
          return sample.x > box.minX - p.radius * 0.25 && sample.x < box.maxX + p.radius * 0.25 &&
            sample.z > box.minZ - p.radius * 0.25 && sample.z < box.maxZ + p.radius * 0.25;
        });
        if (solid) {
          pos.copy(sample);
          hitWorld = true;
          break;
        }
      }
    }
    if (hitActor || hitWorld || hitFloor || Math.abs(pos.x) > HALF || Math.abs(pos.z) > HALF || p.life <= 0) {
      if ((hitWorld || hitFloor) && p.splash > 0) splashShot(pos, p, null);
      if (!hitActor && Math.abs(pos.x) < HALF && Math.abs(pos.z) < HALF) {
        const wallFace = hitWorld ? paintableWalls.find((wall) =>
          pos.x >= wall.minX && pos.x <= wall.maxX &&
          pos.y >= wall.minY && pos.y <= wall.maxY &&
          Math.abs(pos.z - wall.faceZ) < 0.55
        ) : null;
        paintAt(new THREE.Vector3(pos.x, wallFace ? pos.y : 0, pos.z), p.team, p.paintRadius ? p.paintRadius * (hitWorld ? 1.1 : 1) : (hitWorld ? 1.85 : (p.team === BLUE ? 1.55 : 1.45)));
      }
      removeProjectile(i);
    }
  }
}

function movementInput() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joystick.x;
  let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - joystick.y;
  // Auto-run: a locked sprint keeps the player moving forward so only the view steers.
  // Pulling the stick back (or pressing S) cancels it for that moment.
  if (sprintLocked && joystick.y < 0.35 && !keys.has('KeyS') && !keys.has('ArrowDown')) y = Math.max(y, 1);
  const vector = new THREE.Vector2(x, y);
  if (vector.length() > 1) vector.normalize();
  return vector;
}
function ownerAt(x, z) {
  const index = cellAt(x, z);
  return index < 0 ? 0 : owners[index];
}
function hasFriendlyInkUnderfoot(x, z, team = BLUE) {
  const sample = gridStep * 0.42;
  const offsets = [
    [0, 0], [sample, 0], [-sample, 0],
    [0, sample], [0, -sample],
    [sample * 0.72, sample * 0.72],
    [-sample * 0.72, sample * 0.72],
    [sample * 0.72, -sample * 0.72],
    [-sample * 0.72, -sample * 0.72]
  ];
  let friendly = 0;
  for (const [dx, dz] of offsets) {
    if (ownerAt(x + dx, z + dz) === team) friendly++;
  }
  return friendly >= 2;
}
function paintPlayerTrail(position) {
  const current = new THREE.Vector3(position.x, 0, position.z);
  const radius = player.sliding ? 1.62 : (player.flow > 0 ? 1.52 : (player.sprinting ? 1.36 : 1.22));
  if (!lastPlayerPaintPosition) {
    lastPlayerPaintPosition = current.clone();
    paintAt(current, BLUE, radius, true);
    return;
  }
  const distance = lastPlayerPaintPosition.distanceTo(current);
  if (distance > 0.02) {
    const spacing = player.sliding || player.flow > 0 ? 0.25 : 0.38;
    const stamps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 1; i <= stamps; i++) {
      const t = i / stamps;
      const point = new THREE.Vector3().lerpVectors(lastPlayerPaintPosition, current, t);
      paintAt(point, BLUE, radius, true);
    }
  }
  lastPlayerPaintPosition.copy(current);
}
// ---------------------------------------------------------------------------
// Ink dive: sink into friendly ink as a glossy ink slick, surf fast, refill, leave a trail.
// ---------------------------------------------------------------------------
const diveMaterials = {};
const diveBodyGeometry = new THREE.SphereGeometry(1, 20, 14);
const diveTailGeometry = new THREE.ConeGeometry(1, 1, 14);
const diveGlintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
function diveMaterial(team) {
  if (!diveMaterials[team]) {
    const color = team === BLUE ? 0x20d8e9 : 0xff7652;
    diveMaterials[team] = new THREE.MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.28, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06
    });
  }
  return diveMaterials[team];
}
function ensureDiveBlob(actor) {
  if (actor.diveBlob) return actor.diveBlob;
  const blob = new THREE.Group();
  const body = new THREE.Mesh(diveBodyGeometry, diveMaterial(actor.team));
  body.scale.set(0.46, 0.24, 0.62);
  body.position.y = 0.22;
  const tail = new THREE.Mesh(diveTailGeometry, diveMaterial(actor.team));
  tail.rotation.x = Math.PI / 2;
  tail.scale.set(0.3, 0.9, 0.12);
  tail.position.set(0, 0.17, 0.78);
  const glints = [-1, 1].map((side) => {
    const glint = new THREE.Mesh(diveBodyGeometry, diveGlintMaterial);
    glint.scale.setScalar(0.045);
    glint.position.set(side * 0.14, 0.34, -0.34);
    return glint;
  });
  blob.add(body, tail, ...glints);
  blob.visible = false;
  blob.traverse((node) => { if (node.isMesh) { node.frustumCulled = false; if (actor.player) node.layers.set(0); else node.layers.enable(1); } });
  scene.add(blob);
  actor.diveBlob = blob;
  return blob;
}
function updateDiveVisual(actor, delta) {
  const t = actor.diveBlend = THREE.MathUtils.damp(actor.diveBlend || 0, actor.diving ? 1 : 0, 13, delta);
  const c = actor.group.userData.character;
  const operator = c?.operator;
  if (operator) {
    operator.modelRoot.visible = t < 0.5;
    c.weapon.visible = t < 0.15;
  }
  if (t <= 0.04 && !actor.diveBlob) return;
  const blob = ensureDiveBlob(actor);
  blob.visible = t > 0.04 && actor.group.visible;
  if (!blob.visible) return;
  blob.position.set(actor.position.x, actor.position.y + 0.02, actor.position.z);
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  if (speed > 0.8) {
    const wanted = Math.atan2(-actor.velocity.x, -actor.velocity.z);
    const turn = Math.atan2(Math.sin(wanted - blob.rotation.y), Math.cos(wanted - blob.rotation.y));
    blob.rotation.y += turn * (1 - Math.exp(-14 * delta));
  }
  const wobble = 1 + Math.sin(performance.now() * 0.016 + actor.team) * 0.06 * Math.min(1, speed / 6);
  blob.scale.set(t * wobble, t / wobble, t * (1 + Math.min(speed, 14) * 0.012));
}
function updateDive(actor, delta, wantDive) {
  const grounded = actor.grounded !== false;
  const friendly = hasFriendlyInkUnderfoot(actor.position.x, actor.position.z, actor.team);
  if (!actor.diving) {
    if (wantDive && friendly && grounded && !actor.ragdollState && !(actor.frozen > 0)) {
      actor.diving = true;
      actor.sliding = false;
      actor.sprinting = false;
      const floor = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
      spawnSplash(new THREE.Vector3(actor.position.x, floor, actor.position.z), actor.team, floor);
      spawnHitBurst(new THREE.Vector3(actor.position.x, floor + 0.2, actor.position.z), actor.team, 0.9);
      if (actor.player) { playPop(0.9); showToast('INK DIVE  /  HOLD TO SURF'); }
    } else if (wantDive && actor.player && !friendly && !diveWarned) {
      diveWarned = true;
      showToast('DIVE NEEDS YOUR INK UNDERFOOT');
    }
  } else if (!wantDive || !friendly || !grounded || actor.ragdollState) {
    actor.diving = false;
    const floor = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
    spawnSplash(new THREE.Vector3(actor.position.x, floor, actor.position.z), actor.team, floor);
    spawnMotionSpray(actor, 6, 1.5);
    if (actor.player) { playPop(0.7); cameraShake = Math.max(cameraShake, 0.06); }
  }
  if (!wantDive) diveWarned = false;
  updateDiveVisual(actor, delta);
  return actor.diving;
}
function diveSurfTick(actor, delta) {
  actor.ink = Math.min(100, actor.ink + 46 * delta);
  actor.diveTrailTimer = (actor.diveTrailTimer || 0) - delta;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  if (speed > 1.5 && actor.diveTrailTimer <= 0) {
    actor.diveTrailTimer = 0.085;
    paintAt(new THREE.Vector3(actor.position.x, 0, actor.position.z), actor.team, 1.55, true);
    spawnMotionSpray(actor, 3, 1.5);
  }
  if (actor.player) updateInk();
}

// Enemy ink slows and slowly hurts; own ink and diving heal. Frozen / sticky timers live here too.
function updateVitals(actor, delta) {
  actor.frozen = Math.max(0, (actor.frozen || 0) - delta);
  actor.sticky = Math.max(0, (actor.sticky || 0) - delta);
  actor.regenDelay = Math.max(0, (actor.regenDelay || 0) - delta);
  const x = actor.position.x;
  const z = actor.position.z;
  const friendly = hasFriendlyInkUnderfoot(x, z, actor.team);
  const owner = ownerAt(x, z);
  const enemyInk = !friendly && owner !== 0 && owner !== actor.team && actor.grounded !== false && !actor.diving;
  actor.inEnemyInk = enemyInk;
  actor.speedFactor = (enemyInk ? 0.55 : 1) * (actor.sticky > 0 ? 0.4 : 1);
  if (enemyInk && actor.health > 16) {
    actor.health = Math.max(16, actor.health - 5 * delta);
    actor.regenDelay = 1.5;
  } else if (actor.regenDelay <= 0 && actor.health < 100) {
    actor.health = Math.min(100, actor.health + (friendly || actor.diving ? 11 : 3.5) * delta);
  }
  if (actor.player) {
    if (enemyInk && !actor.enemyInkWarned) { actor.enemyInkWarned = true; showToast('ENEMY INK  /  SLOWED AND BURNING'); }
    if (!enemyInk) actor.enemyInkWarned = false;
  }
}

// Weapons: each archetype changes the weapon's size, the shot pattern and the paint spread.
function refreshWeaponFit(actor) {
  const c = actor.group.userData.character;
  if (!c) return;
  const spec = WEAPONS[actor.weaponType || 'pulse'];
  const [sx, sy, sz] = spec.look;
  c.weaponVisual.scale.set(sx, sy, sz);
  const base = c.weaponFitBox;
  if (!base) return;
  const fit = new THREE.Box3(
    new THREE.Vector3(base.min.x * sx, base.min.y * sy, base.min.z * sz),
    new THREE.Vector3(base.max.x * sx, base.max.y * sy, base.max.z * sz)
  );
  c.weapon.userData.muzzleLocal = new THREE.Vector3((fit.min.x + fit.max.x) / 2, (fit.min.y + fit.max.y) / 2, fit.min.z - 0.018);
  c.flash.position.copy(c.weapon.userData.muzzleLocal);
  c.animator?.setWeaponFit(fit);
}
function setWeapon(actor, type) {
  actor.weaponType = type;
  refreshWeaponFit(actor);
  if (actor.player && ui.weaponLabel) ui.weaponLabel.textContent = WEAPONS[type].name;
}

// Camera: keep the lens out of walls and pillars.
function cameraHitsWorld(p) {
  for (const box of solidBounds) {
    if (p.y < box.minY - 0.25 || p.y > box.maxY + 0.25) continue;
    if (box.shape === 'circle') {
      if ((p.x - box.x) ** 2 + (p.z - box.z) ** 2 < (box.radius + 0.28) ** 2) return true;
    } else if (p.x > box.minX - 0.28 && p.x < box.maxX + 0.28 && p.z > box.minZ - 0.28 && p.z < box.maxZ + 0.28) {
      return true;
    }
  }
  return p.y < groundHeight(p.x, p.z) + 0.22;
}
const _camProbe = new THREE.Vector3();
function resolveCameraCollision(target, desired) {
  if (!cameraHitsWorld(desired)) return desired;
  for (let t = 0.9; t >= 0.12; t -= 0.1) {
    _camProbe.lerpVectors(target, desired, t);
    if (!cameraHitsWorld(_camProbe)) return _camProbe.clone();
  }
  return target.clone().lerp(desired, 0.12);
}

// Ledge assist: running or jumping into a low ledge pops the player up onto it.
function ledgeAssist(actor, intended, moved, dirX, dirZ, delta) {
  actor.ledgeCooldown = Math.max(0, (actor.ledgeCooldown || 0) - delta);
  if (actor.ledgeCooldown > 0 || intended < 0.04 || moved > intended * 0.45) return;
  const feet = actor.position.y;
  let top = -Infinity;
  const reach = 0.78;
  const px = actor.position.x + dirX * reach;
  const pz = actor.position.z + dirZ * reach;
  for (const box of solidBounds) {
    const rise = box.maxY - feet;
    if (rise < 0.22 || rise > (actor.grounded ? 1.15 : 1.4) || box.minY > feet + 0.5) continue;
    const inside = box.shape === 'circle'
      ? (px - box.x) ** 2 + (pz - box.z) ** 2 < (box.radius + 0.3) ** 2
      : px > box.minX - 0.3 && px < box.maxX + 0.3 && pz > box.minZ - 0.3 && pz < box.maxZ + 0.3;
    if (inside && box.maxY > top) top = box.maxY;
  }
  if (top === -Infinity) return;
  const rise = top - feet;
  actor.verticalVelocity = Math.max(actor.verticalVelocity, Math.sqrt(2 * 20.5 * (rise + 0.3)));
  actor.grounded = false;
  actor.ledgeCooldown = 0.45;
}

function updatePlayer(delta) {
  if (player.respawn > 0) {
    player.respawn = Math.max(0, player.respawn - delta);
    if (player.respawn === 0) respawnActor(player);
    updateInk();
    return;
  }

  updateVitals(player, delta);
  if (player.frozen > 0) {
    player.velocity.set(0, 0, 0);
    player.group.position.copy(player.position);
    updateDiveVisual(player, delta);
    updateInk();
    return;
  }

  const input = movementInput();
  // Movement reads the same yaw basis as the camera orbit, avoiding a frame
  // of input drift while the follow camera catches up after a swipe.
  const cameraForward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const cameraRight = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const move = new THREE.Vector3()
    .addScaledVector(cameraRight, input.x)
    .addScaledVector(cameraForward, input.y);
  // Every movement is a run: any real input moves at full speed, direction comes from the view.
  if (move.lengthSq() > 0.0144) move.normalize(); else move.set(0, 0, 0);

  const edgeSprint = isTouch && Math.hypot(joystick.x, joystick.y) > 0.93;
  const sprintRequested = !(player.drinking > 0) && ((sprintLocked && input.y > -0.3) || keys.has('ShiftLeft') || keys.has('ShiftRight') || edgeSprint);
  const sprintPressedThisFrame = sprintRequested && !sprintWasRequested;
  sprintWasRequested = sprintRequested;
  const moving = move.lengthSq() > 0.025;
  player.slideCooldown = Math.max(0, player.slideCooldown - delta);

  if (flowQueued) {
    flowQueued = false;
    if (player.drinking > 0) {
      // No dashing while drinking.
    } else if (player.flowCooldown > 0) {
      showToast('DASH CHARGING');
    } else {
      const friendlyDash = hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE);
      if (!friendlyDash && player.ink < 14) {
        showToast('DASH NEEDS 14 INK');
      } else {
        const dashDirection = move.lengthSq() > 0.01 ? move.clone().normalize() : new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
        player.flow = friendlyDash ? 0.62 : 0.38;
        player.flowCooldown = friendlyDash ? 1.5 : 2.0;
        if (!friendlyDash) player.ink = Math.max(0, player.ink - 14);
        player.sliding = false;
        player.velocity.x = dashDirection.x * 19.5;
        player.velocity.z = dashDirection.z * 19.5;
        spawnMotionSpray(player, 10, 2.0);
        cameraShake = Math.max(cameraShake, 0.1);
        playPop(1.1);
        showToast(friendlyDash ? 'INK DASH  /  FREE ON YOUR INK' : 'DASH');
      }
    }
  }
  player.flow = Math.max(0, player.flow - delta);
  player.flowCooldown = Math.max(0, player.flowCooldown - delta);

  if (slideQueued) {
    slideQueued = false;
    const movingInput = move.lengthSq() > 0.006;
    const currentSpeed = player.velocity.length();
    if (!player.sliding && player.slideCooldown <= 0 && player.grounded && (movingInput || currentSpeed > 1.0)) {
      // Sliding is a direct movement action; it no longer depends on Shift being
      // held at the exact same time as C / the touch button.
      const direction = currentSpeed > 2.0
        ? player.velocity.clone().setY(0).normalize()
        : move.clone().normalize();
      if (direction.lengthSq() < 0.01) direction.set(Math.sin(yaw), 0, -Math.cos(yaw));
      player.sliding = true;
      player.slideTimer = 1.24 + (hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE) ? 0.5 : 0);
      player.slideCooldown = 1.12;
      player.slideDirection.copy(direction);
      const slideLaunch = sprintRequested ? 17.0 : 15.3;
      player.slideSpeed = clamp(Math.max(slideLaunch, currentSpeed * 1.18), 14.2, 18.2);
      player.velocity.x = direction.x * player.slideSpeed;
      player.velocity.z = direction.z * player.slideSpeed;
      player.sprinting = false;
      const slideFloor = actorSurfaceHeight(player, player.position.x, player.position.z);
      spawnSplash(new THREE.Vector3(player.position.x, slideFloor, player.position.z), BLUE, slideFloor);
      cameraShake = Math.max(cameraShake, 0.12);
      playPop(0.8);
      showToast('SLIDE BOOST  /  LOW PROFILE');
    } else if (!player.sliding && player.slideCooldown <= 0 && !player.grounded) {
      showToast('SLIDE READY ON LANDING');
    } else if (!player.sliding && player.slideCooldown <= 0) {
      showToast('MOVE TO SLIDE');
    }
  }

  if (jumpQueued) {
    player.jumpBuffer = 0.17;
    jumpQueued = false;
  } else {
    player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
  }
  if (player.grounded) player.coyoteTimer = 0.15;
  else player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);

  if (player.jumpBuffer > 0 && (player.grounded || player.coyoteTimer > 0)) {
    const slideJump = player.sliding;
    player.sliding = false;
    player.grounded = false;
    player.verticalVelocity = 8.45 + (sprintRequested && moving ? 0.82 : 0) + (slideJump ? 0.58 : 0);
    if ((sprintRequested || slideJump) && player.velocity.lengthSq() > 0.1) {
      const carry = slideJump ? 1.12 : 1.055;
      player.velocity.multiplyScalar(carry);
      const carriedSpeed = Math.hypot(player.velocity.x, player.velocity.z);
      if (carriedSpeed > 17.2) player.velocity.setLength(17.2);
    }
    player.jumpBuffer = 0;
    player.coyoteTimer = 0;
    player.jumpHoldTimer = 0;
    player.landImpact = 0;
    playPop(0.55);
  }

  const diving = updateDive(player, delta, diveHeld && !(player.drinking > 0));
  const flowBoost = player.flow > 0;
  player.sprinting = !player.sliding && sprintRequested && moving && !fireHeld && !flowBoost && !diving;
  const speedFactor = player.speedFactor ?? 1;
  const targetSpeed = diving
    ? 12.8
    : (flowBoost ? 16.2 : (sprintRequested ? 13.8 : (player.drinking > 0 ? 3.4 : 8.35))) * speedFactor;

  if (player.sliding) {
    player.slideTimer -= delta;
    if (moving) {
      const steering = 1 - Math.exp(-2.15 * delta);
      player.slideDirection.lerp(move, steering).normalize();
    }
    // Preserve momentum on flat ground and let ramps naturally accelerate or
    // slow the slide, rather than applying the same drag on every surface.
    const slideSurface = actorSurfaceHeight(player, player.position.x, player.position.z);
    const aheadSurface = actorSurfaceHeight(
      player,
      player.position.x + player.slideDirection.x * 0.45,
      player.position.z + player.slideDirection.z * 0.45
    );
    const downhillAcceleration = clamp((slideSurface - aheadSurface) / 0.45 * 9.8, -4.0, 4.0);
    player.slideSpeed = clamp(
      (player.slideSpeed + downhillAcceleration * delta) * Math.exp(-(hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE) ? 0.34 : 0.58) * delta),
      5.2, 18.8
    );
    player.velocity.x = player.slideDirection.x * player.slideSpeed;
    player.velocity.z = player.slideDirection.z * player.slideSpeed;
    if (player.slideTimer <= 0 || !player.grounded || sprintPressedThisFrame) {
      player.sliding = false;
      player.sprinting = sprintRequested && moving && !fireHeld;
    }
  } else {
    const desiredVelocity = new THREE.Vector3(move.x * targetSpeed, 0, move.z * targetSpeed);
    if (player.grounded) {
      const reversing = moving && (player.velocity.x * move.x + player.velocity.z * move.z) < -0.4;
      const response = diving ? 20.0 : (moving ? (reversing ? 25.0 : 17.5) : 14.5);
      player.velocity.lerp(desiredVelocity, 1 - Math.exp(-response * delta));
    } else if (moving) {
      // Air steering is deliberate but never erases the take-off momentum.
      player.velocity.lerp(desiredVelocity, 1 - Math.exp(-3.1 * delta));
    } else {
      player.velocity.x *= Math.exp(-0.24 * delta);
      player.velocity.z *= Math.exp(-0.24 * delta);
    }
  }

  const beforeX = player.position.x;
  const beforeZ = player.position.z;
  moveOnGround(player, player.velocity.x * delta, player.velocity.z * delta, player.sliding ? 0.40 : 0.48);
  if (!diving && moving) {
    const intended = Math.hypot(player.velocity.x, player.velocity.z) * delta;
    const moved = Math.hypot(player.position.x - beforeX, player.position.z - beforeZ);
    ledgeAssist(player, intended, moved, move.x, move.z, delta);
  }
  if (player.diving) diveSurfTick(player, delta);

  const baseY = actorSurfaceHeight(player, player.position.x, player.position.z);
  if (!player.grounded) {
    player.jumpHoldTimer += delta;
    const gravity = player.verticalVelocity > 0
      ? (jumpHeld && player.jumpHoldTimer < 0.22 ? 12.8 : 20.5)
      : 27.0;
    player.verticalVelocity -= gravity * delta;
    player.position.y += player.verticalVelocity * delta;
    if (player.position.y <= baseY) {
      if (player.verticalVelocity < -2.8) {
        player.landImpact = clamp(Math.abs(player.verticalVelocity) * 0.075, 0.18, 1);
        spawnSplash(new THREE.Vector3(player.position.x, baseY, player.position.z), BLUE, baseY);
        spawnHitBurst(new THREE.Vector3(player.position.x, baseY + 0.10, player.position.z), BLUE, 0.72);
        cameraShake = Math.max(cameraShake, player.landImpact * 0.22);
      }
      player.position.y = baseY;
      player.verticalVelocity = 0;
      player.grounded = true;
      player.coyoteTimer = 0.12;
      player.jumpHoldTimer = 0;
    }
  } else {
    player.position.y = baseY;
  }

  player.group.position.copy(player.position);
  const cameraFacing = -yaw;
  const yawDelta = Math.atan2(Math.sin(cameraFacing - player.group.rotation.y), Math.cos(cameraFacing - player.group.rotation.y));
  player.group.rotation.y += yawDelta * (1 - Math.exp(-30 * delta));

  if (player.diving || player.drinking > 0 || ((player.sprinting || player.sliding) && !fireHeld)) setWeaponHolstered(player, true);
  else setWeaponHolstered(player, false);

  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  const onFriendlyInk = hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE);
  player.ink = Math.min(100, player.ink + delta * (onFriendlyInk ? 14 : 8));
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  player.walkPhase += delta * (player.sliding ? 18 : (player.sprinting ? 16 : (moving ? 11.5 : 2)));
  const gaitSpeed = clamp(Math.hypot(player.velocity.x, player.velocity.z) / 13.8, 0, 1.18);
  player.aimElevation = 0.20 - pitch;
  animateActor(player, player.sliding ? 1.25 : gaitSpeed, delta);
  player.effectTimer -= delta;
  if (moving && player.grounded && player.effectTimer <= 0) {
    const flowSpray = player.flow > 0;
    spawnMotionSpray(
      player,
      player.sliding ? 9 : (flowSpray ? 7 : (player.sprinting ? 4 : 1)),
      player.sliding || flowSpray ? 1.8 : (player.sprinting ? 1.1 : 0.9)
    );
    player.effectTimer = player.sliding ? 0.045 : (flowSpray ? 0.065 : (player.sprinting ? 0.085 : 0.22));
  }

  if (moving && player.grounded) {
    paintPlayerTrail(player.position);
  } else if (!lastPlayerPaintPosition) {
    lastPlayerPaintPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
  }
  updateInk();
}

function animateActor(actor, moving, delta = 0.016) {
  const c = actor.group.userData.character;
  if (!c || actor.ragdollState) return;
  if (c.weaponTransition) {
    const transition = c.weaponTransition;
    transition.elapsed += delta;
    const progress = clamp(transition.elapsed / transition.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    c.weaponBlend = transition.from + (transition.to - transition.from) * eased;
    if (progress >= 1) {
      c.weaponBlend = transition.to;
      c.weaponTransition = null;
    }
  }

  const shot = actor.group.userData.shotTimer || 0;
  actor.group.userData.shotTimer = Math.max(0, shot - delta);
  const hit = Math.max(0, actor.hitTimer || 0);
  actor.hitTimer = Math.max(0, hit - delta);
  if (hit > 0.2) c.animator?.triggerHit();

  if (c.animator && actor.group.visible) {
    // Distant bots skip the weapon-grip IK and finger pass.
    const detail = actor.player || camera.position.distanceToSquared(actor.group.position) < 1444 ? 1 : 0;
    c.animator.update(delta, actor, c.weapon, {
      weaponBlend: c.weaponBlend,
      shotTimer: shot,
      shooting: clamp(shot / 0.30, 0, 1),
      isPlayer: actor.player,
      drink: actor.drinkBlend || 0
    }, detail);
  }

  actor.recoil = Math.max(0, (actor.recoil || 0) - delta * 2.8);
  c.flash.visible = actor.group.userData.flashTimer > 0;
  actor.group.userData.flashTimer = Math.max(0, actor.group.userData.flashTimer - delta);
  if (c.flash.visible) c.flash.scale.setScalar(0.72 + Math.random() * 0.5);
  actor.landImpact = Math.max(0, (actor.landImpact || 0) - delta * 2.6);
  actor.group.position.y = actor.position.y;
  updateActorShadow(actor);
}

// Eliminations play the skeletal death clip; the actor is hidden when it ends.
function updateRagdolls(delta) {
  for (const actor of actors) {
    const state = actor.ragdollState;
    if (!state) continue;
    const c = actor.group.userData.character;
    if (!c) continue;
    if (!state.started) {
      state.started = true;
      c.animator?.playDeath();
    }
    state.time += delta;
    c.animator?.updateDeath(delta, c.weaponBlend, c.weapon);
    actor.group.position.y = actor.position.y;
    updateActorShadow(actor);
    if (state.time >= 1.7) {
      actor.ragdollState = null;
      actor.group.visible = false;
      if (actor.shadow) actor.shadow.visible = false;
    }
  }
}
function renderInventory(inventory) {
  document.querySelectorAll('.item-slot').forEach((slot) => {
    const count = inventory[slot.dataset.item] || 0;
    slot.querySelector('.item-count').textContent = String(count);
    slot.classList.toggle('empty', count === 0);
  });
}
function setStatus(name, on) {
  const overlay = document.getElementById('status-overlay');
  if (overlay) overlay.classList.toggle(name, !!on);
}
const items = createItems({
  scene, player, actors, HALF, camera, groundHeight, paintSurfaceHeight, paintAt, solidBounds, damageActor,
  spawnHitBurst, spawnSplash, showToast, playPop, getAimPoint, attachRigid, setWeapon, setStatus,
  getYaw: () => yaw,
  addShake: (amount) => { cameraShake = Math.max(cameraShake, amount); },
  onInventory: renderInventory,
  updateHud: updateInk
});
setWeapon(player, 'pulse');
for (const bot of [...blueBots, ...orangeBots]) setWeapon(bot, BOT_WEAPONS[bot.variation % BOT_WEAPONS.length]);

// Surface a bot could stand on: the ground, ramps, or the top of a low solid (crates, cover, platforms).
function standHeight(x, z) {
  let height = groundHeight(x, z);
  for (const box of solidBounds) {
    if (box.maxY <= height + 0.05 || box.maxY > height + 3.3 || box.minY > height + 0.6) continue;
    const inside = box.shape === 'circle'
      ? (x - box.x) ** 2 + (z - box.z) ** 2 < box.radius ** 2
      : x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
    if (inside && box.maxY > height) height = box.maxY;
  }
  return height;
}
const botNav = new NavGrid({
  half: HALF,
  cell: 1.5,
  heightAt: (x, z) => standHeight(x, z),
  isWalkable: (x, z, h) => !isBlockedAt(x, z, h, 0.62)
});
const botBrain = createBotBrain({
  BLUE, ORANGE, HALF, GRID, gridStep, owners, ownerAt, nav: botNav, solidBounds,
  hasFriendlyInk: hasFriendlyInkUnderfoot,
  moveOnGround, paintAt, fireActor, spawnMotionSpray, animateActor, groundHeight,
  items, actorSurfaceHeight, ledgeAssist, spawnSplash,
  updateDive: (actor, delta, want) => updateDive(actor, delta, want),
  diveTick: (actor, delta) => diveSurfTick(actor, delta),
  smokeBlocks: (from, to) => items.smokeBlocks(from, to),
  weaponSpec: (actor) => WEAPONS[actor.weaponType || 'pulse'],
  enemiesOf: (actor) => (actor.team === BLUE ? orangeTeam : blueTeam)
    .filter((other) => other.group.visible && other.respawn <= 0 && !other.ragdollState)
});
// ---- cinematic match intro ----------------------------------------------------------------
const TEAM_INFO = {
  [BLUE]: { name: 'CYAN', color: '#20d8e9' },
  [ORANGE]: { name: 'CORAL', color: '#ff7652' }
};
const CALLSIGNS = ['ZAPPY', 'MOCHI', 'INKY', 'SPLAT', 'DOODLE', 'PIXEL', 'BLOTCH', 'RIPPLE', 'TINTY', 'GLOOP', 'SQUISH', 'DABBER'];
{
  let storedName = '';
  try { storedName = (localStorage.getItem('tint3d.name') || '').trim().toUpperCase().slice(0, 12); } catch { /* optional */ }
  player.displayName = storedName || 'YOU';
  [...blueBots, ...orangeBots].forEach((bot, index) => { bot.displayName = CALLSIGNS[index % CALLSIGNS.length]; });
}
function getGameplayPose() {
  const keep = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, shake: cameraShake };
  cameraShake = 0;
  updateCamera(10);
  const pose = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
  camera.position.copy(keep.p);
  camera.quaternion.copy(keep.q);
  camera.fov = keep.fov;
  camera.updateProjectionMatrix();
  cameraShake = keep.shake;
  return pose;
}
const matchIntro = new MatchIntro({
  renderer, camera, actors, player, BLUE, ORANGE, HALF, teamInfo: TEAM_INFO, authoritativeClock: false,
  animateActor, fxScale: () => fxScale, spawnMotionSpray,
  holster: (actor) => setWeaponHolstered(actor, false, true),
  resolveCamera: resolveCameraCollision,
  getGameplayPose,
  splash: (actor) => {
    const floor = actorSurfaceHeight(actor, actor.position.x, actor.position.z);
    spawnSplash(new THREE.Vector3(actor.position.x, floor, actor.position.z), actor.team, floor);
  },
  shake: (amount) => { cameraShake = Math.max(cameraShake, amount); },
  getAudioContext: () => { audioContext ||= new AudioContext(); if (audioContext.state === 'suspended') audioContext.resume(); return audioContext; },
  isSoundOn: () => soundOn,
  onGo: () => {
    lastPlayerPaintPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
    introActive = false;
    gameStarted = true;
  }
});

function updateBots(delta) {
  for (const actor of [...blueBots, ...orangeBots]) {
    if (actor.respawn > 0) {
      actor.respawn -= delta;
      if (actor.respawn <= 0) respawnActor(actor);
      continue;
    }
    if (!actor.group.visible) continue;
    actor.fireCooldown -= delta;
    actor.invulnerable = Math.max(0, actor.invulnerable - delta);
    updateVitals(actor, delta);
    botBrain.update(actor, delta);
  }
}
function fireFromCurrentReticle() {
  if (!gameStarted || paused || ended) return;
  // A fresh camera solve prevents the first shot after a swipe from using the
  // previous frame's yaw/pitch. The held-fire loop then continues every frame.
  updateCamera(1 / 60);
  fireActor(player, getAimPoint());
}
function updateCamera(delta) {
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).normalize();
  const sliding = !!player.sliding;
  const diving = !!player.diving;
  const target = player.position.clone().add(new THREE.Vector3(0, diving ? 0.6 : (sliding ? 0.95 : 1.42), 0));
  const distance = diving ? 3.3 : (sliding ? 3.7 : (isTouch ? 3.9 : 4.3));
  const height = diving ? 0.95 : (sliding ? 1.2 : 1.55);
  const shoulder = 0.48;
  const lateralVelocity = player.velocity.x * right.x + player.velocity.z * right.z;
  const forwardVelocity = player.velocity.x * forward.x + player.velocity.z * forward.z;
  const cameraLead = clamp(forwardVelocity * 0.012, -0.28, 0.42);
  const cameraShoulder = shoulder + clamp(lateralVelocity * 0.014, -0.22, 0.22);
  const desired = target.clone()
    .addScaledVector(forward, -distance + cameraLead)
    .addScaledVector(right, cameraShoulder)
    .add(new THREE.Vector3(0, height, 0));
  if (cameraShake > 0.001) {
    const shake = cameraShake;
    const time = clock.elapsedTime;
    desired.x += Math.sin(time * 37.0) * shake * 0.42;
    desired.y += Math.sin(time * 51.0 + 0.8) * shake * 0.24;
    desired.z += Math.cos(time * 43.0 + 1.4) * shake * 0.32;
    cameraShake = Math.max(0, cameraShake - delta * 3.4);
  }
  desired.copy(resolveCameraCollision(target, desired));
  camera.position.lerp(desired, 1 - Math.exp(-(sliding ? 17.5 : 19.5) * delta));
  const lookTarget = target.clone()
    .addScaledVector(forward, 3.35 + clamp(forwardVelocity * 0.045, -0.35, 0.65))
    .addScaledVector(right, cameraShoulder)
    .add(new THREE.Vector3(0, 0.10 - pitch * 4.8 + cameraRecoil * 2.0, 0));
  cameraRecoil = Math.max(0, cameraRecoil - delta * 0.22);
  camera.lookAt(lookTarget);
  const wantedFov = diving ? 66 : (sliding ? 70 : (player.sprinting || player.flow > 0 ? 62 : 56));
  camera.fov = THREE.MathUtils.damp(camera.fov, wantedFov, sliding ? 7.2 : 8.5, delta);
  camera.updateProjectionMatrix();
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
  for (const wall of paintableWalls) {
    wall.ctx.clearRect(0, 0, wall.canvas.width, wall.canvas.height);
    wall.ctx.fillStyle = 'rgba(12,31,39,.30)';
    wall.ctx.fillRect(18, 18, 190, 42);
    wall.ctx.fillStyle = 'rgba(231,241,224,.82)';
    wall.ctx.font = '900 23px sans-serif';
    wall.ctx.fillText('BREAKWATER  /  BW', 29, 46);
    wall.ctx.fillStyle = 'rgba(255,190,111,.78)';
    wall.ctx.fillRect(22, 221, 150, 7);
    wall.ctx.fillStyle = 'rgba(231,241,224,.36)';
    wall.ctx.font = '800 11px sans-serif';
    wall.ctx.fillText('PORT AUTHORITY  •  KEEP CLEAR', 220, 238);
    wall.ctx.strokeStyle = 'rgba(234,243,224,.38)';
    wall.ctx.lineWidth = 3;
    wall.ctx.strokeRect(10, 10, 492, 236);
    wall.texture.needsUpdate = true;
  }
  drawArenaBaseArtwork(paintCtx);
  drawExpansionArtwork(paintCtx);
  paintTexture.needsUpdate = true;
  raisedPaintCtx.clearRect(0, 0, 1024, 1024);
  raisedPaintTexture.needsUpdate = true;
  paintRoughnessCtx.fillStyle = '#f4f4f4';
  paintRoughnessCtx.fillRect(0, 0, 1024, 1024);
  paintHeightCtx.fillStyle = '#080808';
  paintHeightCtx.fillRect(0, 0, 1024, 1024);
  paintClearcoatCtx.fillStyle = '#000000';
  paintClearcoatCtx.fillRect(0, 0, 1024, 1024);
  for (const team of [1, 2]) {
    wetPoolCounts[team] = 0;
    wetPools[team].count = 0;
    wetPools[team].visible = false;
  }
  paintRoughnessTexture.needsUpdate = true;
  paintHeightTexture.needsUpdate = true;
  paintClearcoatTexture.needsUpdate = true;
  seedArea(BLUE, 0, SPAWN_Z - 0.5);
  seedArea(ORANGE, 0, -SPAWN_Z + 0.5);
  seedArea(BLUE, 0, SPAWN_Z - 9);
  seedArea(ORANGE, 0, -SPAWN_Z + 9);
  scoreCache = { blue: -1, orange: -1 };
  updateScore();
}
function resetMatch() {
  for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
  for (const p of particles) {
    scene.remove(p.mesh);
    if (p.material) p.material.dispose();
  }
  particles.length = 0;
  resetPaint();
  totalEliminations = 0;
  ui.eliminations.textContent = '00';
  for (const actor of actors) {
    actor.health = 100;
    actor.ink = 100;
    actor.respawn = 0;
    actor.ai = null;
    actor.invulnerable = 0;
    actor.group.visible = true;
    const sign = actor.team === BLUE ? 1 : -1;
    const spread = actor.player ? 0 : (actor.variation - 2) * 2.2;
    actor.position.set(spread, 0, sign * (actor.player ? SPAWN_Z : SPAWN_Z - 3.5 - (actor.variation % 2) * 2.4));
    actor.position.y = groundHeight(actor.position.x, actor.position.z);
    actor.velocity.set(0, 0, 0);
    actor.group.position.copy(actor.position);
    actor.group.rotation.set(0, actor.team === BLUE ? 0 : Math.PI, 0);
    actor.fireCooldown = 0.8 + Math.random();
    actor.paintCooldown = 0.3;
    actor.moveCooldown = 0;
    actor.flow = 0;
    actor.flowCooldown = 0;
    actor.hitTimer = 0;
    actor.sliding = false;
    actor.sprinting = false;
    actor.slideTimer = 0;
    actor.slideCooldown = 0;
    actor.jumpBuffer = 0;
    actor.coyoteTimer = 0.12;
    actor.diving = false;
    actor.diveBlend = 0;
    if (actor.diveBlob) actor.diveBlob.visible = false;
    actor.frozen = 0;
    actor.sticky = 0;
    actor.drinking = 0;
    actor.regenDelay = 0;
    setWeapon(actor, actor.player ? 'pulse' : BOT_WEAPONS[actor.variation % BOT_WEAPONS.length]);
    resetCharacterPose(actor);
  }
  items.reset();
  diveHeld = false;
  player.health = 100;
  sprintLocked = false;
  sprintWasRequested = false;
  updateSprintButton();
  jumpHeld = false;
  slideQueued = false;
  lastPlayerPaintPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
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
  lockLandscape();
  if (introActive || gameStarted) return;
  sprintLocked = false;
  sprintWasRequested = false;
  updateSprintButton();
  gameStarted = false;
  introActive = true;
  introElapsed = 0;
  paused = false;
  ended = false;
  fireHeld = false;
  ui.start.classList.add('hidden');
  ui.intro.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');

  // The cinematic intro runs on the real characters at their real spawn points.
  introSavedActors = [];
  yaw = 0;
  pitch = 0.2;
  for (const actor of actors) {
    actor.velocity.set(0, 0, 0);
    actor.group.visible = true;
    actor.group.position.copy(actor.position);
  }
  ui.intro.classList.add('hidden');
  matchIntro.begin();
  if (!isTouch && renderer.domElement.requestPointerLock) {
    try {
      const request = renderer.domElement.requestPointerLock();
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } catch { /* Mouse lock is optional; keyboard/mouse can still start the match. */ }
  }
}

function updateMatchIntro(delta) {
  if (!introActive) return;
  introElapsed += delta;

  for (const actor of actors) {
    actor.walkPhase += delta * 1.2;
    animateActor(actor, 0, delta);
  }

  if (introElapsed < 1.25) {
    ui.introPhase.textContent = 'YOUR CREW';
    ui.introStatus.textContent = 'CYAN DIVISION  /  HOLD THE LINE';
    ui.introCount.textContent = '5 OPERATORS';
  } else if (introElapsed < 2.35) {
    ui.introPhase.textContent = 'RIVAL CREW';
    ui.introStatus.textContent = 'CORAL DIVISION  /  CONTEST THE YARD';
    ui.introCount.textContent = '5 OPERATORS';
  } else {
    ui.introPhase.textContent = 'MATCH STARTING';
    ui.introStatus.textContent = 'PREPARE TO DEPLOY';
    const remaining = Math.ceil(5.35 - introElapsed);
    ui.introCount.textContent = remaining > 0 ? String(Math.min(3, remaining)) : 'GO';
  }

  if (introElapsed >= 5.35) {
    for (const saved of introSavedActors) {
      const actor = saved.actor;
      actor.position.copy(saved.position);
      actor.velocity.set(0, 0, 0);
      actor.group.position.copy(actor.position);
      actor.group.rotation.set(0, saved.rotationY, 0);
      actor.group.visible = true;
      resetCharacterPose(actor);
      updateActorShadow(actor);
    }
    introSavedActors = [];
    lastPlayerPaintPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
    introActive = false;
    ui.intro.classList.add('hidden');
    gameStarted = true;
    showToast('3  ·  2  ·  1  ·  FIGHT');
  }
}

function updateIntroCamera(delta) {
  const drift = Math.sin(introElapsed * 0.72) * 2.7;
  const desired = new THREE.Vector3(drift, 8.2 + Math.sin(introElapsed * 0.55) * 0.25, 25.5);
  camera.position.lerp(desired, 1 - Math.exp(-2.2 * delta));
  camera.lookAt(0, 1.05, -0.4);
  camera.fov = THREE.MathUtils.damp(camera.fov, 54, 2.2, delta);
  camera.updateProjectionMatrix();
}
function pauseGame() {
  if (!gameStarted || ended) return;
  paused = true;
  gameStarted = false;
  ui.pause.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

// ---- main menu ---------------------------------------------------------------------------
// Game modes announce themselves with a cancelable `tint3d:play` event so other systems (for
// example the Battle Royale mode) can claim a mode: call event.preventDefault() in your listener.
function requestPlay(mode) {
  const event = new CustomEvent('tint3d:play', { detail: { mode }, cancelable: true });
  window.dispatchEvent(event);
  return !event.defaultPrevented;
}
$('start-button').addEventListener('click', () => { if (requestPlay('regular')) startGame(); });
document.getElementById('mode-royale')?.addEventListener('click', () => {
  if (requestPlay('battle-royale')) showToast('BATTLE ROYALE  /  NOT CONNECTED YET');
});
const menuName = document.getElementById('menu-name');
if (menuName) {
  try { menuName.value = localStorage.getItem('tint3d.name') || ''; } catch { /* optional */ }
  menuName.addEventListener('input', () => {
    const value = menuName.value.trim().toUpperCase().slice(0, 12);
    try { localStorage.setItem('tint3d.name', value); } catch { /* optional */ }
    player.displayName = value || 'YOU';
  });
}
function syncMenuButtons() {
  const gfx = document.getElementById('menu-gfx');
  const snd = document.getElementById('menu-sound');
  if (gfx) gfx.textContent = 'GRAPHICS · ' + quality.label;
  if (snd) snd.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
}
document.getElementById('menu-gfx')?.addEventListener('click', () => { document.getElementById('quality-toggle')?.click(); syncMenuButtons(); });
document.getElementById('menu-sound')?.addEventListener('click', () => { document.getElementById('sound-toggle')?.click(); syncMenuButtons(); });
syncMenuButtons();
window.tint3d = Object.assign(window.tint3d || {}, { startRegularMatch: () => startGame(), requestPlay });
function menuOpen() {
  return !gameStarted && !introActive && !document.body.classList.contains('splash-on') && !ui.start.classList.contains('hidden');
}
// ---- compact HUD extras: compass strip and squad chips -----------------------------------------
const hudCompass = document.getElementById('compass');
const chipYou = document.getElementById('chip-you');
const chipRival = document.getElementById('chip-rival');
const chipSplats = document.getElementById('chip-splats');
let hudClock = 0;
function updateHudExtras(delta) {
  hudClock += delta;
  if (hudClock < 0.066 || !gameStarted) return;
  hudClock = 0;
  if (hudCompass) {
    const heading = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
    let html = '';
    for (let k = 0; k < 24; k++) {
      const deg = k * 15;
      const diff = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(diff) > 62) continue;
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] ?? (deg % 45 === 0 ? String(deg) : '');
      const cardinal = deg % 90 === 0;
      html += `<span class="${cardinal ? 'c' : ''}" style="left:${50 + (diff / 62) * 50}%">${label || '·'}</span>`;
    }
    hudCompass.innerHTML = html;
  }
  let you = 0;
  let rival = 0;
  for (const actor of actors) { if (actor.respawn > 0) continue; if (actor.team === player.team) you++; else rival++; }
  if (chipYou) chipYou.textContent = String(you);
  if (chipRival) chipRival.textContent = String(rival);
  if (chipSplats) chipSplats.textContent = String(player.eliminations || 0);
}
let menuTime = 0;
const menuTarget = new THREE.Vector3();
const menuDesired = new THREE.Vector3();
// While the menu is open the live operator poses in the arena, orbited by a slow cinematic camera.
function updateMenuCamera(delta) {
  menuTime += delta;
  for (const actor of actors) {
    if (actor.group.visible && actor.position.distanceToSquared(player.position) < 900) animateActor(actor, 0, delta);
  }
  const angle = 0.5 + Math.sin(menuTime * 0.33) * 0.38;
  menuTarget.set(player.position.x, player.position.y + 1.15, player.position.z);
  menuDesired.set(player.position.x + Math.sin(angle) * 3.7, player.position.y + 1.3, player.position.z - Math.cos(angle) * 3.7);
  camera.position.lerp(menuDesired, 1 - Math.exp(-4 * delta));
  camera.lookAt(menuTarget);
  if (Math.abs(camera.fov - 36) > 0.05) { camera.fov += (36 - camera.fov) * Math.min(1, delta * 4); camera.updateProjectionMatrix(); }
  if (Math.floor(menuTime * 2) !== Math.floor((menuTime - delta) * 2)) syncMenuButtons();
}
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
  try { localStorage.setItem('tint3d.sound', soundOn ? '1' : '0'); } catch { /* optional */ }
  event.currentTarget.classList.toggle('active', soundOn);
  event.currentTarget.textContent = soundOn ? '♫' : '♪';
  playPop(0.8);
});
let gamePointerLockActive = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    gamePointerLockActive = true;
  } else if (gamePointerLockActive) {
    gamePointerLockActive = false;
    if (gameStarted && !isTouch) pauseGame();
  }
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement && gameStarted) {
    yaw += event.movementX * 0.00235;
    pitch = clamp(pitch + event.movementY * 0.00165, -0.95, 0.68);
  }
});
document.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyC'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && !event.repeat) {
    jumpQueued = true;
    jumpHeld = true;
  }
  if (event.code === 'KeyQ' && !event.repeat) flowQueued = true;
  if (event.code === 'KeyC' && !event.repeat) slideQueued = true;
  if (event.code === 'KeyE' && !event.repeat) diveHeld = true;
  const itemSlot = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[event.code];
  if (itemSlot !== undefined && !event.repeat && gameStarted && !paused && !ended) items.useItem(ITEM_ORDER[itemSlot]);
  if (event.code === 'Escape' && gameStarted && !isTouch) pauseGame();
});
document.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space') jumpHeld = false;
  if (event.code === 'KeyE') diveHeld = false;
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 0 && gameStarted && !paused && !isTouch) {
    fireHeld = true;
    fireFromCurrentReticle();
  }
  if (event.button === 2 && gameStarted && !paused && !isTouch) {
    event.preventDefault();
    diveHeld = true;
  }
  if (isTouch && event.clientX > innerWidth * 0.38 && !event.target.closest('button')) {
    renderer.domElement.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, { type: 'look', x: event.clientX, y: event.clientY });
  }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  const state = activePointers.get(event.pointerId);
  if (!isTouch || !state || state.type !== 'look') return;
  const dx = event.clientX - state.x;
  const dy = event.clientY - state.y;
  yaw += dx * 0.0046;
  pitch = clamp(pitch + dy * 0.0034, -0.95, 0.68);
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
window.addEventListener('pointerup', () => {
  if (!isTouch) { fireHeld = false; diveHeld = keys.has('KeyE'); }
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('pointercancel', () => {
  if (!isTouch) fireHeld = false;
  jumpHeld = false;
});

const joystickEl = $('joystick');
const knobEl = $('joystick-knob');
const fireButton = $('btn-fire');
const jumpButton = $('btn-jump');
const sprintButton = $('btn-run');
const slideButton = $('btn-slide');
const diveButton = $('btn-dive');
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
// Hold FIRE and slide the same finger to look around while shooting.
fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  fireButton.setPointerCapture?.(event.pointerId);
  firePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  fireHeld = true;
  fireFromCurrentReticle();
});
fireButton.addEventListener('pointermove', (event) => {
  if (!firePointer || firePointer.id !== event.pointerId) return;
  yaw += (event.clientX - firePointer.x) * 0.0052;
  pitch = clamp(pitch + (event.clientY - firePointer.y) * 0.0038, -0.95, 0.68);
  firePointer.x = event.clientX;
  firePointer.y = event.clientY;
});
const releaseFire = (event) => {
  if (firePointer && event.pointerId !== undefined && firePointer.id !== event.pointerId) return;
  fireHeld = false;
  firePointer = null;
};
fireButton.addEventListener('pointerup', releaseFire);
fireButton.addEventListener('pointercancel', releaseFire);
diveButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  diveButton.setPointerCapture?.(event.pointerId);
  diveHeld = true;
  diveButton.classList.add('is-held');
});
const releaseDive = () => { diveHeld = false; diveButton.classList.remove('is-held'); };
diveButton.addEventListener('pointerup', releaseDive);
diveButton.addEventListener('pointercancel', releaseDive);
document.querySelectorAll('.item-slot').forEach((slot) => {
  slot.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (gameStarted && !paused && !ended) items.useItem(slot.dataset.item);
  });
});
jumpButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  jumpQueued = true;
  jumpHeld = true;
  if (jumpButton.setPointerCapture) jumpButton.setPointerCapture(event.pointerId);
});
jumpButton.addEventListener('pointerup', () => { jumpHeld = false; });
jumpButton.addEventListener('pointercancel', () => { jumpHeld = false; });

function updateSprintButton() {
  sprintButton.classList.toggle('is-locked', sprintLocked);
  sprintButton.setAttribute('aria-pressed', String(sprintLocked));
  sprintButton.innerHTML = sprintLocked ? 'AUTO<br>RUN ON' : 'AUTO<br>RUN';
}
sprintButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sprintLocked = !sprintLocked;
  updateSprintButton();
});
slideButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  slideQueued = true;
});
$('btn-dash').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  flowQueued = true;
});

function animate() {
  requestAnimationFrame(animate);
  const delta = document.body.classList.contains('portrait') ? 0 : Math.min(clock.getDelta(), 0.04);
  matchIntro.update(delta);
  if (gameStarted && !paused && !ended) {
    timeLeft -= delta;
    ui.timer.textContent = formatTime(timeLeft);
    updatePlayer(delta);
    updateBots(delta);
    items.update(delta);
    pixelBurst.update(delta);
    // Refresh camera after movement and before reading the aim ray.
    updateCamera(delta);
    if (fireHeld) fireActor(player, getAimPoint());
    updateProjectiles(delta);
    if (timeLeft <= 0) finishMatch();
  } else {
    if (menuOpen()) updateMenuCamera(delta);
    else if (!introActive) updateCamera(delta);
    updateHudExtras(delta);
    if (!paused) updateProjectiles(delta);
  }
  updateParticles(delta);
  updateRagdolls(delta);
  updateMinimap(delta);
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) ui.toast.classList.remove('show');
  }
  if (hitTimer > 0) {
    hitTimer -= delta;
    if (hitTimer <= 0) ui.hit.classList.remove('visible');
  }
  if (crosshairHitTimer > 0) {
    crosshairHitTimer -= delta;
    if (crosshairHitTimer <= 0) ui.crosshair.classList.remove('is-hit', 'is-elimination');
  }
  if (crosshairFireTimer > 0) {
    crosshairFireTimer -= delta;
    if (crosshairFireTimer <= 0) ui.crosshair.classList.remove('is-firing');
  }
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  sun.target.position.set(Math.round(player.position.x / texel) * texel, 0, Math.round(player.position.z / texel) * texel);
  sun.position.copy(sun.target.position).add(sunOffset);
  sun.target.updateMatrixWorld();
  quality.update(player.position);
  quality.render();
}
const rotateOverlay = document.getElementById('rotate-overlay');
function checkOrientation() {
  const portrait = isTouch && innerHeight > innerWidth * 1.02;
  document.body.classList.toggle('portrait', portrait);
  return portrait;
}
async function lockLandscape() {
  if (!isTouch) return;
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* Orientation lock is best effort; the rotate prompt covers the rest. */ }
}
addEventListener('orientationchange', checkOrientation);
checkOrientation();
const gfxButton = document.getElementById('quality-toggle');
if (gfxButton) {
  gfxButton.textContent = 'GFX ' + quality.label;
  gfxButton.addEventListener('click', () => {
    const label = quality.cyclePreference();
    gfxButton.textContent = 'GFX ' + label;
    showToast('GRAPHICS  /  ' + label);
  });
}
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  quality.resize(innerWidth, innerHeight);
  checkOrientation();
}
addEventListener('resize', onResize);
updateScore();
updateInk();
ui.timer.textContent = formatTime(timeLeft);
showToast('BREAKWATER  /  TRAINING YARD');
animate();
