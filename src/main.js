import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  start: $('start-screen'), intro: $('match-intro'), pause: $('pause-screen'), result: $('result-screen'),
  introPhase: $('match-intro-phase'), introCount: $('match-intro-count'), introStatus: $('match-intro-status'),
  introBlueRoster: $('intro-blue-roster'), introOrangeRoster: $('intro-orange-roster'),
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

document.addEventListener('selectstart', (event) => {
  if (event.target.closest('#game-root')) event.preventDefault();
});
document.addEventListener('dragstart', (event) => {
  if (event.target.closest('#game-root')) event.preventDefault();
});
if (isTouch) {
  document.body.classList.add('touch-device');
  ui.hint.textContent = 'LEFT STICK MOVE  ·  HOLD RUN  ·  SLIDE  ·  TAP SPRAY';
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x83c6ca);
scene.fog = new THREE.Fog(0x83c6ca, 40, 94);
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
renderer.toneMappingExposure = 1.27;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe6fcff, 0x58616a, 1.72));
const sun = new THREE.DirectionalLight(0xfff2d9, 2.85);
sun.position.set(-13, 25, 11);
scene.add(sun);
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
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
const paintTexture = new THREE.CanvasTexture(paintCanvas);
paintTexture.colorSpace = THREE.SRGBColorSpace;
paintTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
paintTexture.generateMipmaps = true;
paintTexture.minFilter = THREE.LinearMipmapLinearFilter;
const raisedPaintTexture = new THREE.CanvasTexture(raisedPaintCanvas);
raisedPaintTexture.colorSpace = THREE.SRGBColorSpace;
raisedPaintTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
floor.rotation.x = -Math.PI / 2;
const underfloor = mesh(shared.box, mat('underfloor', 0x17242f, 0.94, 0.04), scene, 0, -0.42, 0);
underfloor.scale.set(ARENA + 1.2, 0.7, ARENA + 1.2);

// BREAKWATER: a coastal freight yard built from stacked containers, a central
// raised deck, loading ramps, service pipes, hazard stripes and light towers.
block(0, -0.82, 0, 44, 0.28, 44, 0x111d28);
for (const z of [-20.55, 20.55]) {
  block(0, 0.35, z, 41.5, 1.2, 0.55, 0x172733, { solid: true });
  block(0, 0.98, z, 41.5, 0.08, 0.12, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (const x of [-20.55, 20.55]) {
  block(x, 0.35, 0, 0.55, 1.2, 41.5, 0x172733, { solid: true });
  block(x, 0.98, 0, 0.12, 0.08, 41.5, 0x20a8bb, { emissive: 0x0c6c82 });
}
for (let i = -3; i <= 3; i++) {
  block(i * 5.5, 0.09, -19.7, 2.2, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
  block(i * 5.5, 0.09, 19.7, 2.2, 0.05, 0.035, i % 2 ? 0xffb25e : 0xd9e1d7);
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
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
  wallTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
  block(-19.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b, { solid: true });
  block(19.1, 2.1, z, 0.65, 4.2, 0.65, 0x263e4b, { solid: true });
  block(-19.1, 4.25, z, 1.2, 0.14, 1.2, 0x20d8e9, { emissive: 0x087e9a });
  block(19.1, 4.25, z, 1.2, 0.14, 1.2, 0xff7652, { emissive: 0x8d3226 });
}
for (let i = 0; i < 5; i++) {
  const z = -12 + i * 6;
  cylinder(-18.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2, true);
  cylinder(18.1, 2.9, z, 0.16, 5.8, 0x54727c, Math.PI / 2, true);
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
addCraneHoist(-15.8, -27.0, 0x20d8e9, 0x285a66, 1);
addCraneHoist(15.8, -27.0, 0xff7652, 0x77513d, -1);
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
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
    x: p[0], z: p[2], halfX: p[3], halfZ: p[5],
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
waterTexture.repeat.set(3, 2);
const harbourWater = mesh(
  new THREE.PlaneGeometry(72, 28),
  new THREE.MeshStandardMaterial({ map: waterTexture, roughness: 0.34, metalness: 0.30 }),
  scene, 0, -0.86, -39
);
harbourWater.rotation.x = -Math.PI / 2;
harbourWater.layers.enable(1);
for (let i = 0; i < 7; i++) {
  const x = -27 + i * 9;
  cylinder(x, 0.18, -22.8, 0.34, 0.36, i % 2 ? 0x526b68 : 0x344e57);
  block(x, 0.98, -22.8, 0.12, 1.70, 0.12, 0x334d54);
  block(x, 1.82, -22.8, 0.56, 0.10, 0.56, 0xffbd72);
}

// ---------------------------------------------------------------------------


// AUTHORED CC0 ENVIRONMENT MESHES -------------------------------------------
// Kenney Factory Kit + City Kit (Industrial). GLB files and their colormaps
// are stored locally under /assets; no third-party runtime request is needed.
const kenneyLoader = new GLTFLoader();
const kenneyAssetRoot = import.meta.env.BASE_URL + 'assets/kenney/';
const kenneySourceCache = new Map();
const kenneyTextureCache = new Map();

function getKenneySource(pack, file) {
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
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    scene.add(model);

    if (solid) {
      solidBounds.push({
        x, z, halfX: size.x * 0.42, halfZ: size.z * 0.42,
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
addKenneyModel('factory', 'crane.glb', -15.4, 0, -27.0, 3.8, 0);
addKenneyModel('factory', 'crane.glb', 15.4, 0, -27.0, 3.8, Math.PI);
addKenneyModel('factory', 'crane-lift.glb', -15.4, 6.8, -27.0, 3.1, 0);
addKenneyModel('factory', 'crane-lift.glb', 15.4, 6.8, -27.0, 3.1, Math.PI);

// A stepped industrial skyline replaces the six placeholder blocks behind the
// water. These meshes retain their authored colour maps and low-poly bevels.
addKenneyModel('city-industrial', 'building-a.glb', -28.5, 0, -51.5, 6.0, 0.12);
addKenneyModel('city-industrial', 'building-d.glb', -16.8, 0, -53.0, 7.0, -0.08);
addKenneyModel('city-industrial', 'building-h.glb', -5.0, 0, -50.5, 8.0, 0.18);
addKenneyModel('city-industrial', 'building-k.glb', 7.7, 0, -53.0, 7.2, Math.PI);
addKenneyModel('city-industrial', 'detail-tank.glb', 20.2, 0, -50.4, 8.4, 0.1);
addKenneyModel('city-industrial', 'chimney-large.glb', 29.2, 0, -47.7, 5.4, 0);

// ---------------------------------------------------------------------------

function groundHeight(x, z) {
  if (Math.abs(x) <= 4.9 && Math.abs(z) <= 2.75) return 1.1675;
  if (Math.abs(x) <= 2.9 && z > 2.725 && z < 6.975) {
    return clamp((6.975 - z) / 4.25, 0, 1) * 1.1675;
  }
  if (Math.abs(x) <= 2.9 && z < -2.725 && z > -6.975) {
    return clamp((z + 6.975) / 4.25, 0, 1) * 1.1675;
  }
  return 0;
}

function paintSurfaceHeight(x, z) {
  if (Math.abs(x) <= 4.9 && Math.abs(z) <= 2.75) return 1.1675;
  if (Math.abs(x) <= 2.9 && z >= 2.725 && z <= 6.975) {
    return clamp((6.975 - z) / 4.25, 0, 1) * 1.1675;
  }
  if (Math.abs(x) <= 2.9 && z >= -6.975 && z <= -2.725) {
    return clamp((z + 6.975) / 4.25, 0, 1) * 1.1675;
  }
  return -0.045;
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
  const limit = actor.player ? 18.7 : 18.2;
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
    actor.position.y = surfaceY;
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
function paintAt(position, team, radius = 1.75, quiet = false) {
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
  for (let i = 0; i < 7; i++) {
    paintAt(new THREE.Vector3(x + (Math.random() - 0.5) * 5, 0, z + (Math.random() - 0.5) * 4), team, 2.2, true);
  }
}
seedArea(BLUE, 0, 15.5);
seedArea(ORANGE, 0, -15.5);
paintAt(new THREE.Vector3(0, 0, 17.2), BLUE, 2.1, true);

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
  1: new THREE.MeshPhysicalMaterial({ color: TEAM[1].ink, roughness: 0.13, clearcoat: 1.0, clearcoatRoughness: 0.055, emissive: 0x073c50, emissiveIntensity: 0.12 }),
  2: new THREE.MeshPhysicalMaterial({ color: TEAM[2].ink, roughness: 0.13, clearcoat: 1.0, clearcoatRoughness: 0.055, emissive: 0x542014, emissiveIntensity: 0.10 })
};
const splashMaterials = {
  1: new THREE.MeshPhysicalMaterial({ color: TEAM[1].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.04, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  2: new THREE.MeshPhysicalMaterial({ color: TEAM[2].ink, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.04, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
};

const splashPuddleGeometry = new THREE.CircleGeometry(0.44, 18);

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
  const s = 0.78 + Math.random() * 0.30;
  puddle.scale.set(s, s * (0.70 + Math.random() * 0.25), 1);
  puddle.layers.disable(1);
  scene.add(puddle);
  particles.push({ mesh: puddle, life: 0.42, maxLife: 0.42, puddle: true, material: puddleMaterial });

  const ringMaterial = splashMaterials[team].clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.30, 20), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, ground + 0.018, position.z);
  ring.scale.set(0.9, 0.78, 1);
  ring.layers.disable(1);
  scene.add(ring);
  particles.push({ mesh: ring, life: 0.40, maxLife: 0.40, ring: true, material: ringMaterial });

  for (let i = 0; i < 7; i++) {
    const dot = mesh(shared.sphere, projectileMaterials[team], scene, position.x, ground + 0.10, position.z);
    dot.layers.disable(1);
    const angle = Math.random() * Math.PI * 2;
    const scale = 0.055 + Math.random() * 0.075;
    dot.scale.set(scale * (0.95 + Math.random() * 0.6), scale * 1.18, scale * (0.95 + Math.random() * 0.6));
    dot.rotation.z = angle;
    particles.push({
      mesh: dot, life: 0.34 + Math.random() * 0.25, maxLife: 0.60, groundY: ground,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (1.55 + Math.random() * 2.6),
        1.45 + Math.random() * 2.3,
        Math.sin(angle) * (1.55 + Math.random() * 2.6)
      )
    });
  }
}
function spawnMotionSpray(actor, count = 2, strength = 0.7) {
  if (particles.length > 118) return;
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
  const count = Math.min(13, Math.round(7 + strength * 4));
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
  for (let i = 0; i < 5; i++) {
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


function makeCharacter(team, variation = 0) {
  const group = new THREE.Group();
  const palette = TEAM[team];
  const teamBase = toonMat('crew-base-' + team, team === BLUE ? 0x168fa8 : 0xc95142);
  const teamDark = toonMat('crew-dark-' + team, team === BLUE ? 0x12394a : 0x552b32);
  const teamLight = toonMat('crew-light-' + team, team === BLUE ? 0x39e7f0 : 0xff8767);
  const cloth = toonMat('crew-cloth-' + team, team === BLUE ? 0x263e50 : 0x4a3440);
  const sole = toonMat('crew-sole-' + team, 0x17252f);
  const skinColors = [0xb87555, 0xd79a73, 0x86513f, 0xe0ad87, 0x9c624b];
  const hairColors = [0x17242e, 0x41251f, 0x8a542d, 0x252b43, 0x572d47];
  const skin = toonMat('crew-skin-' + variation, skinColors[variation % skinColors.length]);
  const hair = toonMat('crew-hair-' + variation, hairColors[variation % hairColors.length]);
  const eyeWhite = toonMat('crew-eye-white', 0xfff7e9);
  const eyeDark = toonMat('crew-eye-dark', 0x18232d);
  const highlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const accent = toonMat('crew-personal-accent-' + variation, [0xffd36e, 0xa6f4df, 0xffa7c4, 0xc4b7ff, 0xffd3a1][variation % 5]);

  const part = (geometry, material, parent, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const item = mesh(geometry, material, parent, x, y, z);
    item.scale.set(sx, sy, sz);
    item.castShadow = false;
    item.receiveShadow = false;
    return item;
  };
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const smallSphere = new THREE.SphereGeometry(1, 12, 9);
  const capsuleUpper = new THREE.CapsuleGeometry(0.115, 0.29, 4, 10);
  const capsuleLower = new THREE.CapsuleGeometry(0.095, 0.25, 4, 10);
  const capsuleLeg = new THREE.CapsuleGeometry(0.135, 0.31, 4, 10);
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.80, 0);
  group.add(torsoPivot);

  // Rounded sports jacket and fitted waist; no box-shaped torso or block joints.
  part(new THREE.CapsuleGeometry(0.325, 0.43, 5, 16), teamBase, torsoPivot, 0, 0.43, 0.005, 1.06, 1.0, 0.82);
  part(sphere, cloth, torsoPivot, 0, 0.43, 0.018, 0.365, 0.47, 0.285);
  part(sphere, teamDark, torsoPivot, 0, 0.10, 0.005, 0.30, 0.19, 0.245);
  part(sphere, teamLight, torsoPivot, 0, 0.24, -0.263, 0.095, 0.18, 0.035);
  part(sphere, accent, torsoPivot, 0.205, 0.43, -0.253, 0.065, 0.055, 0.025);
  part(sphere, teamLight, torsoPivot, -0.205, 0.43, -0.253, 0.065, 0.055, 0.025);
  part(new THREE.TorusGeometry(0.115, 0.018, 6, 18), teamLight, torsoPivot, 0, 0.63, 0, 1, 1, 0.82);
  part(sphere, skin, torsoPivot, 0, 0.80, 0, 0.135, 0.17, 0.13);

  // A compact pressure pack with a visible fluid window and hose.
  part(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), teamDark, torsoPivot, 0, 0.40, 0.285, 1.05, 1, 0.72);
  part(sphere, teamLight, torsoPivot, 0, 0.43, 0.345, 0.105, 0.17, 0.055);
  part(new THREE.TorusGeometry(0.11, 0.018, 6, 16), accent, torsoPivot, 0, 0.43, 0.39, 1, 1, 0.45);
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.12, 0.50, 0.28),
    new THREE.Vector3(0.30, 0.45, 0.19),
    new THREE.Vector3(0.29, 0.15, 0.04),
    new THREE.Vector3(0.18, 0.10, -0.08)
  ]);
  part(new THREE.TubeGeometry(hoseCurve, 12, 0.025, 6, false), teamLight, torsoPivot, 0, 0, 0);

  // Head pivot: deliberately larger and softer, with readable facial features.
  const head = new THREE.Group();
  head.position.set(0, 0.94, -0.012);
  torsoPivot.add(head);
  part(sphere, skin, head, 0, 0, 0, 0.325, 0.345, 0.292);
  part(sphere, hair, head, 0, 0.205, 0.035, 0.34, 0.235, 0.31);
  part(sphere, hair, head, 0, 0.085, -0.245, 0.29, 0.13, 0.09);
  for (const side of [-1, 1]) {
    part(sphere, skin, head, side * 0.306, -0.045, -0.012, 0.065, 0.09, 0.07);
    part(sphere, eyeWhite, head, side * 0.112, -0.015, -0.267, 0.087, 0.105, 0.045);
    part(sphere, eyeDark, head, side * 0.105, -0.017, -0.307, 0.045, 0.071, 0.025);
    part(sphere, highlight, head, side * 0.09, 0.018, -0.329, 0.018, 0.023, 0.012);
    const brow = part(capsuleUpper, hair, head, side * 0.11, 0.105, -0.264, 0.38, 0.18, 0.24);
    brow.rotation.z = side * -0.12;
    part(sphere, accent, head, side * 0.20, -0.13, -0.246, 0.045, 0.022, 0.014);
  }
  part(sphere, skin, head, 0, -0.075, -0.296, 0.045, 0.04, 0.035);
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.07, -0.16, -0.276),
    new THREE.Vector3(0, -0.185, -0.295),
    new THREE.Vector3(0.07, -0.16, -0.276)
  ]);
  part(new THREE.TubeGeometry(smile, 8, 0.012, 5, false), eyeDark, head);

  // Distinct swept ink-lock hairstyles; rounded tubes replace square hair blocks.
  const hairSets = [
    [[-0.23,0.18,0.02],[-0.34,0.23,0.12],[-0.42,0.05,0.28]],
    [[-0.12,0.28,0.02],[-0.04,0.42,0.12],[0.08,0.38,0.30]],
    [[0.03,0.25,0.05],[0.18,0.38,0.17],[0.32,0.20,0.30]],
    [[0.21,0.17,0.03],[0.36,0.14,0.10],[0.43,-0.03,0.25]]
  ];
  for (let i = 0; i < hairSets.length; i++) {
    const pts = hairSets[i].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const strand = new THREE.CatmullRomCurve3([
      new THREE.Vector3(pts[0].x * 0.35, 0.18 + pts[0].y * 0.65, 0.015),
      pts[0], pts[1], pts[2]
    ]);
    part(new THREE.TubeGeometry(strand, 14, i === variation % 4 ? 0.085 : 0.064, 7, false), hair, head);
  }
  if (variation % 2 === 0) {
    part(new THREE.TorusGeometry(0.30, 0.027, 6, 24), accent, head, 0, 0.19, 0.02, 1, 0.42, 0.92);
  } else {
    part(sphere, teamLight, head, 0, 0.32, 0.04, 0.12, 0.045, 0.11);
  }

  // Pivoted arms with elbows and rounded gloves, all independently animated.
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.345, 0.64, -0.005);
    torsoPivot.add(shoulder);
    part(sphere, teamBase, shoulder, 0, -0.02, 0, 0.155, 0.16, 0.16);
    part(capsuleUpper, cloth, shoulder, 0, -0.20, 0, 1, 1, 1);
    part(new THREE.TorusGeometry(0.105, 0.018, 5, 14), teamLight, shoulder, 0, -0.35, 0, 1, 1, 0.9);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.365, 0);
    shoulder.add(elbow);
    part(capsuleLower, skin, elbow, 0, -0.15, -0.015, 1, 1, 1);
    part(sphere, skin, elbow, 0, -0.30, -0.045, 0.105, 0.10, 0.105);
    part(sphere, teamLight, elbow, 0, -0.30, -0.12, 0.11, 0.085, 0.055);
    return { shoulder, elbow };
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  rightArm.shoulder.rotation.x = 0.38;
  leftArm.shoulder.rotation.x = 0.60;

  // The weapon is parented to the right hand, so it follows the wrist and elbow.
  const weapon = new THREE.Group();
  weapon.position.set(0.025, -0.28, -0.17);
  rightArm.elbow.add(weapon);
  const backMount = new THREE.Group();
  backMount.position.set(0.21, 0.31, 0.29);
  torsoPivot.add(backMount);
  const barrel = part(new THREE.CylinderGeometry(0.105, 0.145, 0.70, 12), teamDark, weapon, 0, 0, -0.40);
  barrel.rotation.x = Math.PI / 2;
  const barrelSleeve = part(new THREE.CylinderGeometry(0.14, 0.14, 0.18, 12), teamBase, weapon, 0, 0, -0.55);
  barrelSleeve.rotation.x = Math.PI / 2;
  const nozzle = part(new THREE.CylinderGeometry(0.19, 0.14, 0.12, 14), teamLight, weapon, 0, 0, -0.79);
  nozzle.rotation.x = Math.PI / 2;
  const muzzleRing = part(new THREE.TorusGeometry(0.135, 0.027, 6, 16), accent, weapon, 0, 0, -0.86);
  muzzleRing.rotation.x = Math.PI / 2;
  part(sphere, teamBase, weapon, 0.16, 0.10, 0.04, 0.18, 0.16, 0.21);
  part(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 10), teamDark, weapon, 0.16, -0.05, 0.03, 1, 1, 1);
  const flash = part(sphere, new THREE.MeshBasicMaterial({
    color: palette.ink, transparent: true, opacity: 0.95, depthWrite: false
  }), weapon, 0, 0, -0.94, 0.13, 0.13, 0.13);
  flash.visible = false;

  // Athletic shorts, articulated knees, calves and oversized soft sneakers.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.165, 0.77, 0.015);
    group.add(hip);
    part(sphere, teamDark, hip, 0, -0.04, 0, 0.16, 0.20, 0.17);
    part(capsuleLeg, cloth, hip, 0, -0.20, 0, 1, 1, 0.9);
    const knee = new THREE.Group();
    knee.position.set(0, -0.37, 0);
    hip.add(knee);
    part(sphere, teamBase, knee, 0, 0, 0, 0.12, 0.11, 0.12);
    part(capsuleLower, cloth, knee, 0, -0.16, 0, 1.1, 1.12, 1.05);
    part(sphere, sole, knee, 0, -0.32, -0.07, 0.18, 0.105, 0.28);
    part(sphere, teamLight, knee, 0, -0.29, -0.105, 0.17, 0.085, 0.26);
    part(new THREE.TorusGeometry(0.12, 0.018, 5, 14), accent, knee, 0, -0.31, -0.10, 1.1, 0.55, 1.0);
    legs.push({ hip, knee });
  }

  group.updateMatrixWorld(true);
  group.attach(weapon);
  group.userData.character = {
    torsoPivot, head, leftArm, rightArm, legs, weapon, backMount, flash,
    defaultLeftArm: 0.60, defaultRightArm: 0.38,
    weaponHolstered: false, weaponBlend: 1, weaponTransition: null
  };
  group.userData.weapon = weapon;
  group.userData.flash = flash;
  group.userData.flashTimer = 0;
  group.userData.shotTimer = 0;
  group.userData.arms = [leftArm.shoulder, rightArm.shoulder];
  group.userData.legs = legs.map((leg) => leg.hip);
  group.traverse((node) => { if (node.isMesh) node.layers.enable(1); });
  return group;
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
    duration: holstered ? 0.30 : 0.36
  };
}
function weaponAnchorPose(actor, holstered) {
  const c = actor.group.userData.character;
  const parent = holstered ? c.backMount : c.rightArm.elbow;
  const localPosition = holstered
    ? new THREE.Vector3(0.02, 0.015, 0.015)
    : new THREE.Vector3(0.025, -0.28, -0.17);
  const localEuler = holstered
    ? new THREE.Euler(0, Math.PI, 0.34)
    : new THREE.Euler(actor.player ? clamp((0.20 - pitch) * 0.65, -0.12, 0.82) : -0.05, 0, 0);
  const localQuaternion = new THREE.Quaternion().setFromEuler(localEuler);
  parent.updateWorldMatrix(true, false);
  actor.group.updateWorldMatrix(true, false);
  const worldPosition = localPosition.applyMatrix4(parent.matrixWorld);
  const worldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(localQuaternion);
  const rootQuaternion = actor.group.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    position: actor.group.worldToLocal(worldPosition),
    quaternion: rootQuaternion.multiply(worldQuaternion)
  };
}

function resetCharacterPose(actor) {
  const c = actor.group.userData.character;
  if (!c) return;
  setWeaponHolstered(actor, false, true);
  c.torsoPivot.position.set(0, 0.80, 0);
  c.torsoPivot.rotation.set(0, 0, 0);
  c.torsoPivot.scale.set(1, 1, 1);
  c.head.rotation.set(0, 0, 0);
  c.leftArm.shoulder.rotation.set(c.defaultLeftArm, 0, 0);
  c.leftArm.elbow.rotation.set(0, 0, 0);
  c.rightArm.shoulder.rotation.set(c.defaultRightArm, 0, 0);
  c.rightArm.elbow.rotation.set(0, 0, 0);
  for (const leg of c.legs) {
    leg.hip.rotation.set(0, 0, 0);
    leg.knee.rotation.set(0, 0, 0);
  }
  actor.ragdollState = null;
  actor.hitTimer = 0;
  actor.landImpact = 0;
}
function createActor(team, variation, x, z, playerControlled = false) {
  const group = makeCharacter(team, variation);
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
    jumpBuffer: 0, coyoteTimer: 0.12, jumpHoldTimer: 0, effectTimer: 0
  };
  if (playerControlled) group.traverse((child) => { if (child.isMesh) child.layers.disable(1); });
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
const player = createActor(BLUE, 0, 0, 17.2, true);
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
let soundOn = false;
let timeLeft = MATCH_SECONDS;
let toastTimer = 0;
let fireHeld = false;
let cameraShake = 0;
let jumpQueued = false;
let jumpHeld = false;
let sprintHeld = false;
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
  // Aim in full 3D: the reticle ray can hit elevated props or characters,
  // and if it points into open sky the shot continues along that upward ray.
  raycaster.layers.set(1);
  raycaster.setFromCamera(centerScreen, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) return hits[0].point.clone();
  return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 32);
}
function muzzlePosition(actor) {
  const shotPitch = actor.player ? clamp((0.20 - pitch) * 0.65, -0.12, 0.82) : 0.035;
  const yawAngle = actor.group.rotation.y;
  const forward = new THREE.Vector3(
    Math.sin(yawAngle) * Math.cos(shotPitch),
    Math.sin(shotPitch),
    -Math.cos(yawAngle) * Math.cos(shotPitch)
  );
  const right = new THREE.Vector3(Math.cos(yawAngle), 0, Math.sin(yawAngle));
  return actor.position.clone()
    .addScaledVector(forward, 0.72)
    .addScaledVector(right, 0.30)
    .add(new THREE.Vector3(0, 1.30, 0));
}
function spawnProjectile(origin, target, team, owner) {
  const shot = new THREE.Group();
  const core = new THREE.Mesh(projectileGeometry, projectileMaterials[team]);
  core.scale.set(0.82, 0.82, 1.85);
  shot.add(core);
  const glow = new THREE.Mesh(
    projectileGeometry,
    new THREE.MeshBasicMaterial({ color: team === BLUE ? 0x77f5ff : 0xffbb91, transparent: true, opacity: 0.24, depthWrite: false })
  );
  glow.scale.set(1.45, 1.45, 2.35);
  shot.add(glow);
  shot.position.copy(origin);
  scene.add(shot);
  const delta = target.clone().sub(origin);
  const distance = Math.max(1, delta.length());
  const travel = clamp(distance / 38, 0.10, 0.90);
  const gravity = -1.65;
  const velocity = new THREE.Vector3(
    delta.x / travel,
    delta.y / travel - 0.5 * gravity * travel,
    delta.z / travel
  );
  shot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocity.clone().normalize());
  projectiles.push({ mesh: shot, velocity, gravity, life: 1.2, team, owner, radius: 0.38 });
}
function fireActor(actor, target) {
  if (actor.fireCooldown > 0 || actor.ink < 4 || !actor.group.visible) return;
  setWeaponHolstered(actor, false);
  if (actor.player) {
    actor.sprinting = false;
    actor.group.rotation.y = yaw;
    actor.group.userData.weapon.rotation.x = clamp((0.20 - pitch) * 0.65, -0.12, 0.82);
  }
  actor.fireCooldown = actor.player ? 0.105 : 0.82 + Math.random() * 0.48;
  actor.ink = Math.max(0, actor.ink - (actor.player ? 3.7 : 3.2));
  actor.recoil = actor.player ? 0.16 : 0.075;
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
  spawnProjectile(muzzle, destination, actor.team, actor);
  if (actor.player) {
    cameraShake = Math.max(cameraShake, 0.035);
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
  actor.position.set(side * (3.5 + actor.variation * 1.15), 0, sign * (14.0 + Math.random() * 2.2));
  actor.position.y = groundHeight(actor.position.x, actor.position.z);
  actor.velocity.set(0, 0, 0);
  actor.verticalVelocity = 0;
  actor.grounded = true;
  actor.health = 100;
  actor.ink = 100;
  actor.respawn = 0;
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
function damageActor(actor, amount, source) {
  if (actor.invulnerable > 0 || !actor.group.visible || actor.ragdollState) return;
  actor.health = Math.max(0, actor.health - amount);
  actor.hitTimer = 0.22;
  if (actor.player) {
    updateInk();
    ui.hit.classList.add('visible');
    hitTimer = 0.18;
  }
  if (actor.health <= 0) {
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
    const previous = p.mesh.position.clone();
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.velocity.y += p.gravity * delta;
    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.velocity.clone().normalize());
    const pos = p.mesh.position;
    const travel = pos.clone().sub(previous);
    const travelLengthSq = Math.max(0.000001, travel.lengthSq());
    let hitActor = false;
    for (const actor of actors) {
      if (actor.team === p.team || actor === p.owner || !actor.group.visible || actor.invulnerable > 0) continue;
      const center = new THREE.Vector3(actor.position.x, actor.position.y + 1.02, actor.position.z);
      const along = clamp(center.clone().sub(previous).dot(travel) / travelLengthSq, 0, 1);
      const closest = previous.clone().addScaledVector(travel, along);
      const dx = closest.x - center.x;
      const dy = closest.y - center.y;
      const dz = closest.z - center.z;
      const combinedRadius = 0.54 + p.radius * 0.42;
      if (dx * dx + dz * dz < combinedRadius * combinedRadius && Math.abs(dy) < 0.94) {
        pos.copy(closest);
        damageActor(actor, actor.player ? 22 : 36, p.owner);
        spawnHitBurst(new THREE.Vector3(pos.x, actor.position.y + 1.05, pos.z), p.team, actor.player ? 1.25 : 1);
        if (actor.player) cameraShake = Math.max(cameraShake, 0.20);
        paintAt(new THREE.Vector3(pos.x, 0, pos.z), p.team, 1.3);
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
      if (!hitActor && Math.abs(pos.x) < HALF && Math.abs(pos.z) < HALF) {
        const wallFace = hitWorld ? paintableWalls.find((wall) =>
          pos.x >= wall.minX && pos.x <= wall.maxX &&
          pos.y >= wall.minY && pos.y <= wall.maxY &&
          Math.abs(pos.z - wall.faceZ) < 0.55
        ) : null;
        paintAt(new THREE.Vector3(pos.x, wallFace ? pos.y : 0, pos.z), p.team, hitWorld ? 1.85 : (p.team === BLUE ? 1.55 : 1.45));
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
  const radius = player.sliding ? 1.28 : (player.sprinting ? 1.14 : 1.08);
  if (!lastPlayerPaintPosition) {
    lastPlayerPaintPosition = current.clone();
    paintAt(current, BLUE, radius, true);
    return;
  }
  const distance = lastPlayerPaintPosition.distanceTo(current);
  if (distance > 0.02) {
    const spacing = player.sliding ? 0.22 : 0.34;
    const stamps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 1; i <= stamps; i++) {
      const t = i / stamps;
      const point = new THREE.Vector3().lerpVectors(lastPlayerPaintPosition, current, t);
      paintAt(point, BLUE, radius, true);
    }
  }
  lastPlayerPaintPosition.copy(current);
}
function updatePlayer(delta) {
  if (player.respawn > 0) {
    player.respawn = Math.max(0, player.respawn - delta);
    if (player.respawn === 0) respawnActor(player);
    updateInk();
    return;
  }

  const input = movementInput();
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  cameraForward.y = 0;
  if (cameraForward.lengthSq() < 0.01) cameraForward.set(Math.sin(yaw), 0, -Math.cos(yaw));
  cameraForward.normalize();
  const cameraRight = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
  const move = new THREE.Vector3()
    .addScaledVector(cameraRight, input.x)
    .addScaledVector(cameraForward, input.y);
  if (move.lengthSq() > 1) move.normalize();

  const sprintRequested = sprintHeld || keys.has('ShiftLeft') || keys.has('ShiftRight');
  player.slideCooldown = Math.max(0, player.slideCooldown - delta);

  if (flowQueued) {
    flowQueued = false;
    if (player.flowCooldown <= 0 && move.lengthSq() > 0.01 && hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE)) {
      player.flow = 0.82;
      player.flowCooldown = 2.2;
      showToast('FLOWLINE  /  INK SURGE');
    } else if (player.flowCooldown <= 0) {
      showToast('FLOWLINE NEEDS YOUR INK');
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
      player.slideTimer = 1.02;
      player.slideCooldown = 1.08;
      player.slideDirection.copy(direction);
      const slideLaunch = sprintRequested ? 15.8 : 14.4;
      player.slideSpeed = clamp(Math.max(slideLaunch, currentSpeed * 1.14), 13.8, 16.4);
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
    player.jumpBuffer = 0.14;
    jumpQueued = false;
  } else {
    player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
  }
  if (player.grounded) player.coyoteTimer = 0.12;
  else player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);

  if (player.jumpBuffer > 0 && (player.grounded || player.coyoteTimer > 0)) {
    player.sliding = false;
    player.grounded = false;
    player.verticalVelocity = 8.25 + (sprintRequested ? 0.35 : 0);
    player.jumpBuffer = 0;
    player.coyoteTimer = 0;
    player.jumpHoldTimer = 0;
    player.landImpact = 0;
    playPop(0.55);
  }

  const moving = move.lengthSq() > 0.025;
  const flowBoost = player.flow > 0;
  player.sprinting = !player.sliding && sprintRequested && moving && player.grounded && !fireHeld && !flowBoost;
  const targetSpeed = flowBoost ? 16.2 : (player.sprinting ? 12.6 : 8.0);

  if (player.sliding) {
    player.slideTimer -= delta;
    if (moving) {
      const steering = 1 - Math.exp(-1.8 * delta);
      player.slideDirection.lerp(move, steering).normalize();
    }
    player.slideSpeed = Math.max(4.8, player.slideSpeed * Math.exp(-0.76 * delta));
    player.velocity.x = player.slideDirection.x * player.slideSpeed;
    player.velocity.z = player.slideDirection.z * player.slideSpeed;
    if (player.slideTimer <= 0 || !player.grounded) {
      player.sliding = false;
      player.sprinting = sprintRequested && moving && !fireHeld;
    }
  } else {
    const desiredVelocity = new THREE.Vector3(move.x * targetSpeed, 0, move.z * targetSpeed);
    const response = player.grounded ? (moving ? 19.5 : 13.5) : 5.8;
    player.velocity.lerp(desiredVelocity, 1 - Math.exp(-response * delta));
  }

  moveOnGround(player, player.velocity.x * delta, player.velocity.z * delta, player.sliding ? 0.40 : 0.48);

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
  const yawDelta = Math.atan2(Math.sin(yaw - player.group.rotation.y), Math.cos(yaw - player.group.rotation.y));
  player.group.rotation.y += yawDelta * (1 - Math.exp(-24 * delta));

  if (player.sprinting || player.sliding) setWeaponHolstered(player, true);
  else if (!fireHeld) setWeaponHolstered(player, false);

  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  const onFriendlyInk = hasFriendlyInkUnderfoot(player.position.x, player.position.z, BLUE);
  player.ink = Math.min(100, player.ink + delta * (onFriendlyInk ? 14 : 8));
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  player.walkPhase += delta * (player.sliding ? 15 : (player.sprinting ? 14 : (moving ? 10 : 2)));
  animateActor(player, player.sliding ? 1.25 : (player.sprinting ? 1 : move.length()), delta);
  player.effectTimer -= delta;
  if (moving && player.grounded && player.effectTimer <= 0) {
    spawnMotionSpray(player, player.sliding ? 8 : (player.sprinting ? 4 : 1), player.sliding ? 2.0 : 0.9);
    player.effectTimer = player.sliding ? 0.045 : (player.sprinting ? 0.085 : 0.22);
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
  const weaponDraw = c.weaponTransition ? Math.sin(c.weaponBlend * Math.PI) : 0;
  const t = actor.walkPhase || 0;
  const speed = clamp(moving, 0, 1);
  const running = speed > 0.05;
  const sprinting = !!actor.sprinting || actor.flow > 0;
  const stride = running ? Math.sin(t) * (sprinting ? 0.94 : 0.70) * speed : 0;
  const idleBreath = running ? 0 : Math.sin(t * 1.45) * 0.014;
  const bounce = running ? Math.abs(Math.sin(t * 2)) * (sprinting ? 0.105 : 0.065) : Math.sin(t * 0.9) * 0.010 + idleBreath;
  const shot = actor.group.userData.shotTimer || 0;
  actor.group.userData.shotTimer = Math.max(0, shot - delta);
  const shooting = clamp(shot / 0.30, 0, 1);
  const hit = Math.max(0, actor.hitTimer || 0);
  actor.hitTimer = Math.max(0, hit - delta);
  const hitFactor = hit > 0 ? hit / 0.22 : 0;
  const air = actor.player && !actor.grounded ? 1 : 0;
  const idleGesture = running ? 0 : Math.sin(t * 0.72);

  const sliding = !!actor.sliding;
  c.torsoPivot.position.y = (sliding ? 0.61 : 0.80) + bounce + (actor.landImpact > 0 ? -actor.landImpact * 0.08 : 0);
  c.torsoPivot.rotation.x = sliding ? -0.72 : (running ? (sprinting ? -0.30 : -0.10) : Math.sin(t * 0.55) * 0.025);
  const facingRightSpeed =
    actor.velocity.x * Math.cos(actor.group.rotation.y) +
    actor.velocity.z * Math.sin(actor.group.rotation.y);
  const movementLean = clamp(-facingRightSpeed * (sliding ? 0.024 : 0.016), -0.28, 0.28);
  c.torsoPivot.rotation.z = movementLean + hitFactor * 0.16;
  c.torsoPivot.scale.y = 1 - Math.max(0, actor.landImpact || 0) * 0.12;
  c.torsoPivot.scale.x = 1 + Math.max(0, actor.landImpact || 0) * 0.06;
  c.head.rotation.x = Math.sin(t * 1.7) * 0.025 + air * 0.10 + shooting * 0.055;
  c.head.rotation.y = running ? -stride * 0.06 : idleGesture * 0.10;
  c.head.rotation.z = Math.sin(t * 0.55) * 0.025 - hitFactor * 0.18;

  c.leftArm.shoulder.rotation.x = c.defaultLeftArm - stride * 0.34 - air * 0.90 + shooting * 0.10 + (sliding ? -0.55 : 0);
  c.rightArm.shoulder.rotation.x = c.defaultRightArm + stride * 0.30 - air * 0.55 - shooting * 0.22 + (sliding ? -0.28 : 0) - weaponDraw * 0.78;
  c.leftArm.shoulder.rotation.z = -0.035 + Math.sin(t * 0.9) * 0.035 + hitFactor * 0.42;
  c.rightArm.shoulder.rotation.z = 0.025 - hitFactor * 0.58 + weaponDraw * 0.28;
  c.leftArm.elbow.rotation.x = -0.18 - Math.max(0, stride) * 0.22 - air * 0.55;
  c.rightArm.elbow.rotation.x = -0.08 - shooting * 0.32 - Math.max(0, -stride) * 0.18 - weaponDraw * 0.88;
  c.leftArm.elbow.rotation.z = -0.06;
  c.rightArm.elbow.rotation.z = 0.045 - weaponDraw * 0.18;
  const backPose = weaponAnchorPose(actor, true);
  const handPose = weaponAnchorPose(actor, false);
  c.weapon.position.copy(backPose.position).lerp(handPose.position, c.weaponBlend);
  c.weapon.quaternion.copy(backPose.quaternion).slerp(handPose.quaternion, c.weaponBlend);
  c.weapon.position.z += (actor.recoil || 0) * 0.55 * c.weaponBlend;

  for (let i = 0; i < 2; i++) {
    const leg = c.legs[i];
    const phase = t + (i === 0 ? 0 : Math.PI);
    leg.hip.rotation.x = running ? Math.sin(phase) * (sprinting ? 0.95 : 0.72) : Math.sin(t * 0.8 + i) * 0.018;
    leg.hip.rotation.z = i === 0 ? 0.015 : -0.015;
    leg.knee.rotation.x = running ? Math.max(0, Math.sin(phase + 0.5)) * (sprinting ? 0.92 : 0.68) : 0.025;
    if (air) {
      leg.hip.rotation.x = (i === 0 ? 0.52 : -0.70);
      leg.knee.rotation.x = i === 0 ? 0.82 : 0.60;
    }
    if (sliding) {
      leg.hip.rotation.x = -0.52 + (i === 0 ? 0.12 : -0.12);
      leg.knee.rotation.x = 1.18;
    }
    leg.hip.rotation.z += hitFactor * (i === 0 ? 0.34 : -0.28);
  }
  actor.recoil = Math.max(0, (actor.recoil || 0) - delta * 2.8);
  c.flash.visible = actor.group.userData.flashTimer > 0;
  actor.group.userData.flashTimer = Math.max(0, actor.group.userData.flashTimer - delta);
  if (c.flash.visible) c.flash.scale.setScalar(0.72 + Math.random() * 0.5);
  actor.landImpact = Math.max(0, (actor.landImpact || 0) - delta * 2.6);
  actor.group.position.y = actor.position.y;
  updateActorShadow(actor);
}

function updateRagdolls(delta) {
  for (const actor of actors) {
    const state = actor.ragdollState;
    if (!state) continue;
    state.time += delta;
    const c = actor.group.userData.character;
    if (!c) continue;
    const damp = Math.exp(-2.7 * delta);
    state.pitchVelocity += 1.9 * delta;
    state.rollVelocity += -state.roll * 2.4 * delta;
    state.pitch = clamp(state.pitch + state.pitchVelocity * delta, -1.38, 0.35);
    state.roll += state.rollVelocity * delta;
    state.pitchVelocity *= damp;
    state.rollVelocity *= Math.exp(-2.1 * delta);
    c.torsoPivot.rotation.x = state.pitch;
    c.torsoPivot.rotation.z = state.roll;
    c.torsoPivot.position.y = 0.80 - Math.min(0.32, state.time * 0.42);
    c.head.rotation.x = 0.28 + Math.sin(state.time * 10) * 0.15 * Math.exp(-2 * state.time);
    c.leftArm.shoulder.rotation.x += state.leftArmVelocity * delta;
    c.rightArm.shoulder.rotation.x += state.rightArmVelocity * delta;
    c.leftArm.shoulder.rotation.z = -0.9 * state.roll;
    c.rightArm.shoulder.rotation.z = 0.9 * state.roll;
    c.leftArm.elbow.rotation.x += state.leftElbowVelocity * delta;
    c.rightArm.elbow.rotation.x += state.rightElbowVelocity * delta;
    for (let i = 0; i < 2; i++) {
      const leg = c.legs[i];
      const sign = i === 0 ? -1 : 1;
      leg.hip.rotation.x += state.legVelocity[i] * delta;
      leg.hip.rotation.z = sign * state.roll * 0.28;
      leg.knee.rotation.x = 0.35 + Math.sin(state.time * 7 + i) * 0.22 * Math.exp(-2 * state.time);
      state.legVelocity[i] *= damp;
    }
    state.leftArmVelocity *= damp;
    state.rightArmVelocity *= damp;
    state.leftElbowVelocity *= damp;
    state.rightElbowVelocity *= damp;
    actor.group.position.y = actor.position.y;
    updateActorShadow(actor);
    if (state.time >= 0.86) {
      actor.ragdollState = null;
      actor.group.visible = false;
      if (actor.shadow) actor.shadow.visible = false;
    }
  }
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
      moveOnGround(actor, direction.x * 4.25 * delta, direction.z * 4.25 * delta, 0.43);
      actor.group.position.copy(actor.position);
      const desiredYaw = Math.atan2(-direction.x, -direction.z);
      const turn = Math.atan2(Math.sin(desiredYaw - actor.group.rotation.y), Math.cos(desiredYaw - actor.group.rotation.y));
      actor.group.rotation.y += turn * (1 - Math.exp(-14 * delta));
      actor.walkPhase += delta * 9;
      animateActor(actor, 1, delta);
      actor.effectTimer -= delta;
      if (actor.effectTimer <= 0) {
        spawnMotionSpray(actor, 1, 0.42);
        actor.effectTimer = 0.24;
      }
    } else {
      animateActor(actor, 0, delta);
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
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).normalize();
  const sliding = !!player.sliding;
  const target = player.position.clone().add(new THREE.Vector3(0, sliding ? 0.98 : 1.38, 0));
  const distance = sliding ? 5.35 : 6.15;
  const height = sliding ? 1.72 : 2.18;
  const shoulder = 0.48;
  const desired = target.clone()
    .addScaledVector(forward, -distance)
    .addScaledVector(right, shoulder)
    .add(new THREE.Vector3(0, height, 0));
  if (cameraShake > 0.001) {
    const shake = cameraShake;
    const time = clock.elapsedTime;
    desired.x += Math.sin(time * 37.0) * shake * 0.42;
    desired.y += Math.sin(time * 51.0 + 0.8) * shake * 0.24;
    desired.z += Math.cos(time * 43.0 + 1.4) * shake * 0.32;
    cameraShake = Math.max(0, cameraShake - delta * 3.4);
  }
  camera.position.lerp(desired, 1 - Math.exp(-(sliding ? 17.5 : 19.5) * delta));
  const lookTarget = target.clone()
    .addScaledVector(forward, 3.35)
    .addScaledVector(right, shoulder)
    .add(new THREE.Vector3(0, 0.10 - pitch * 4.8, 0));
  camera.lookAt(lookTarget);
  const wantedFov = sliding ? 76 : (player.sprinting || player.flow > 0 ? 70 : 65);
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
  seedArea(BLUE, 0, 15.5);
  seedArea(ORANGE, 0, -15.5);
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
    actor.invulnerable = 0;
    actor.group.visible = true;
    const sign = actor.team === BLUE ? 1 : -1;
    const spread = actor.player ? 0 : (actor.variation - 2) * 2.2;
    actor.position.set(spread, 0, sign * (actor.player ? 17.2 : 13.4 + (actor.variation % 2) * 2.2));
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
    resetCharacterPose(actor);
  }
  player.health = 100;
  sprintHeld = false;
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
  if (introActive || gameStarted) return;
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

  // Stage the actual 3D crew in two facing lines for the briefing camera.
  // Their real spawn locations are restored when the countdown reaches zero.
  introSavedActors = actors.map((actor) => ({
    actor,
    position: actor.position.clone(),
    rotationY: actor.group.rotation.y
  }));
  const lineupX = [-8, -4, 0, 4, 8];
  blueTeam.forEach((actor, index) => {
    actor.position.set(lineupX[index], 0, 8.4);
    actor.velocity.set(0, 0, 0);
    actor.group.position.copy(actor.position);
    actor.group.rotation.set(0, Math.PI, 0);
    actor.group.visible = true;
    resetCharacterPose(actor);
  });
  orangeTeam.forEach((actor, index) => {
    actor.position.set(lineupX[index], 0, -8.4);
    actor.velocity.set(0, 0, 0);
    actor.group.position.copy(actor.position);
    actor.group.rotation.set(0, Math.PI, 0);
    actor.group.visible = true;
    resetCharacterPose(actor);
  });

  ui.introPhase.textContent = 'SQUAD ASSEMBLY';
  ui.introCount.textContent = 'READY';
  ui.introStatus.textContent = 'YOUR CREW IS ENTERING THE FIELD';
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
  if (event.code === 'Escape' && gameStarted && !isTouch) pauseGame();
});
document.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space') jumpHeld = false;
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 0 && gameStarted && !paused && !isTouch) {
    fireHeld = true;
    fireActor(player, getAimPoint());
  }
  if (isTouch && event.clientX > innerWidth * 0.38 && !event.target.closest('button')) {
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
  if (!isTouch) fireHeld = false;
  if (isTouch && sprintHeld && !sprintButton.matches(':active')) {
    sprintHeld = false;
    sprintButton.classList.remove('is-held');
  }
});
window.addEventListener('pointercancel', () => {
  if (!isTouch) fireHeld = false;
  sprintHeld = false;
  sprintButton.classList.remove('is-held');
  jumpHeld = false;
});

const joystickEl = $('joystick');
const knobEl = $('joystick-knob');
const fireButton = $('fire-button');
const jumpButton = $('jump-button');
const sprintButton = $('sprint-button');
const slideButton = $('slide-button');
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
  jumpHeld = true;
  if (jumpButton.setPointerCapture) jumpButton.setPointerCapture(event.pointerId);
});
jumpButton.addEventListener('pointerup', () => { jumpHeld = false; });
jumpButton.addEventListener('pointercancel', () => { jumpHeld = false; });

sprintButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sprintHeld = true;
  sprintButton.classList.add('is-held');
  if (sprintButton.setPointerCapture) sprintButton.setPointerCapture(event.pointerId);
});
const releaseSprint = () => {
  sprintHeld = false;
  sprintButton.classList.remove('is-held');
};
sprintButton.addEventListener('pointerup', releaseSprint);
sprintButton.addEventListener('pointercancel', releaseSprint);
slideButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  slideQueued = true;
});
$('flow-button').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  flowQueued = true;
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  if (introActive) {
    updateMatchIntro(delta);
  }
  if (gameStarted && !paused && !ended) {
    timeLeft -= delta;
    ui.timer.textContent = formatTime(timeLeft);
    updatePlayer(delta);
    updateBots(delta);
    if (fireHeld) fireActor(player, getAimPoint());
    updateProjectiles(delta);
    if (timeLeft <= 0) finishMatch();
  } else if (!paused) {
    updateProjectiles(delta);
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
  if (introActive) updateIntroCamera(delta);
  else updateCamera(delta);
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
