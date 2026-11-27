// Free-fly / walk preview of Splat Island (open /map.html). Uses the game's own QualityManager so the island follows the
// same graphics tiers (OPTIMISED … MAX, AUTO) as the multiplayer game. Not used by the game itself.

import * as THREE from 'three';
import { QualityManager, TIER_LABEL } from '../../graphics/quality.js';
import { createSplatIsland, renderMinimap, worldToMap } from './index.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfdcf0);
scene.fog = new THREE.Fog(0xc4dcec, 900, 3700);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.15, 9500);
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a7a5a, 1.0));
const sunDir = new THREE.Vector3(0.5, 0.62, -0.6).normalize();
const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170; sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 1400;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);
const isTouch = matchMedia('(pointer: coarse)').matches;
const quality = new QualityManager({ renderer, scene, camera, sun, isTouch, onFx: () => {} });

let island = null;
let walk = false;
let yaw = 0;
let pitch = -0.2;
let speed = 140;
let feet = 0;
let vy = 0;
const keys = new Set();
const dir = new THREE.Vector3();
const stats = document.getElementById('stats');
const hud = document.getElementById('hud');

function boot() {
  const t0 = performance.now();
  island = createSplatIsland({ quality: quality.tier, sunDirection: sunDir });
  scene.add(island.group);
  island.configureCamera(camera);
  const s = island.stats;
  const towns = Object.entries(s.towns).filter(([k]) => !k.startsWith('hamlet') && k !== 'single').map(([k, v]) => `${k} ${v}`).join(' · ');
  stats.innerHTML = `${s.landAreaKm2.toFixed(2)} km² · ${s.houses} houses with interiors<br>${towns}<br>${s.hamlets} hamlets · ${s.hiddenHouses} hidden in the bush<br>${s.trees.toLocaleString()} trees · ${s.lootPoints} loot points<br>built in ${Math.round(performance.now() - t0)} ms`;
  const box = document.getElementById('pois');
  island.pois.forEach((p, i) => {
    const b = document.createElement('button');
    b.textContent = `${i < 9 ? i + 1 + '. ' : ''}${p.name}`;
    b.onclick = () => teleport(p);
    box.appendChild(b);
  });
  const big = renderMinimap(island.terrain, { localRoads: island.localRoads, landmarks: island.landmarks, houses: island.houses }, 1024);
  const base = document.getElementById('mmbase');
  base.width = big.width; base.height = big.height;
  base.getContext('2d').drawImage(big, 0, 0);
  const dot = document.getElementById('mmdot');
  dot.width = 1024; dot.height = 1024;
  camera.position.set(0, 900, 2300);
  yaw = 0; pitch = -0.4;
  document.getElementById('loading').style.display = 'none';
}

function teleport(p) {
  const y = island.heightAt(p.x, p.z);
  if (walk) { camera.position.set(p.x + 6, y + 1.7, p.z + 24); feet = y; } else camera.position.set(p.x, y + 90, p.z + 190);
  yaw = 0; pitch = walk ? 0 : -0.38;
}

// ---------------------------------------------------------------- controls
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') document.getElementById('mmwrap').classList.toggle('big');
  if (e.code === 'KeyH') for (const id of ['title', 'pois', 'help', 'hud']) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' ? '' : 'none'; }
  if (e.code === 'KeyG') quality.cyclePreference?.();
  if (e.code === 'KeyC' && island) island.freezeCulling(island.cullStats.frozen ? null : camera);
  if (e.code === 'KeyV' && island) {
    walk = !walk;
    if (walk) { feet = island.heightAt(camera.position.x, camera.position.z); camera.position.y = feet + 1.7; pitch = 0; }
  }
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m && island?.pois[+m[1] - 1]) teleport(island.pois[+m[1] - 1]);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
document.getElementById('mmwrap').addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));
canvas.addEventListener('click', () => { if (!isTouch) canvas.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});
window.addEventListener('wheel', (e) => { speed = Math.max(10, Math.min(1500, speed * (e.deltaY < 0 ? 1.15 : 0.87))); }, { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  quality.resize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- walking: simple capsule vs the island's colliders
function pushOut(pos, r, col) {
  if (col.kind === 'circle') {
    const dx = pos.x - col.x, dz = pos.z - col.z, d = Math.hypot(dx, dz), rr = r + col.r;
    if (d < rr && d > 1e-4) { pos.x += (dx / d) * (rr - d); pos.z += (dz / d) * (rr - d); }
    return;
  }
  const dx = pos.x - col.x, dz = pos.z - col.z;
  const c = Math.cos(col.rot), s = Math.sin(col.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const px = Math.abs(lx) - col.hx, pz = Math.abs(lz) - col.hz;
  if (px > r || pz > r) return;
  if (px > 0 && pz > 0 && Math.hypot(px, pz) > r) return;
  const pushX = r - px, pushZ = r - pz;
  const nx = pushX < pushZ ? Math.sign(lx || 1) * pushX : 0;
  const nz = pushX < pushZ ? 0 : Math.sign(lz || 1) * pushZ;
  pos.x += nx * c + nz * s;
  pos.z += -nx * s + nz * c;
}
function walkStep(dt) {
  const sp = (keys.has('ShiftLeft') ? 9 : 4.5) * dt;
  dir.set((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), 0, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)).applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  camera.position.addScaledVector(dir, sp);
  const cols = island.queryColliders(camera.position.x, camera.position.z, 2.5);
  for (let it = 0; it < 2; it++) {
    for (const col of cols) {
      if (col.kind === 'box' && !(col.y1 > feet + 0.55 && col.y0 < feet + 1.6)) continue;
      pushOut(camera.position, 0.35, col);
    }
  }
  let ground = island.heightAt(camera.position.x, camera.position.z);
  for (const col of cols) {
    if (col.kind !== 'box' || col.y1 > feet + 0.6) continue;
    const dx = camera.position.x - col.x, dz = camera.position.z - col.z;
    const c = Math.cos(col.rot), s = Math.sin(col.rot);
    if (Math.abs(dx * c - dz * s) < col.hx && Math.abs(dx * s + dz * c) < col.hz) ground = Math.max(ground, col.y1);
  }
  if (ground >= feet - 0.01) { feet += (ground - feet) * Math.min(1, dt * 16); vy = 0; }
  else { vy -= 20 * dt; feet = Math.max(ground, feet + vy * dt); }
  camera.position.y = feet + 1.7;
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const dotCtx = document.getElementById('mmdot').getContext('2d');
let frameN = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  frameN++;
  quality.update(camera.position);
  if (island) {
    island.setTier(quality.tier);
    island.applyView(camera, scene);
    if (walk) walkStep(dt);
    else {
      const v = speed * (keys.has('ShiftLeft') ? 4 : 1) * dt;
      dir.set((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), 0, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      camera.position.addScaledVector(dir, v);
      if (keys.has('KeyE') || keys.has('Space')) camera.position.y += v;
      if (keys.has('KeyQ')) camera.position.y -= v;
      camera.position.y = Math.max(camera.position.y, Math.max(island.heightAt(camera.position.x, camera.position.z), 0) + 1.7);
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    island.update(clock.elapsedTime, camera);
    // shadow window follows the player
    const k = 340 / (renderer.shadowMap.enabled ? Math.max(512, sun.shadow.mapSize.x) : 1024);
    const fx = Math.round(camera.position.x / k) * k, fy = Math.round(camera.position.y / k) * k, fz = Math.round(camera.position.z / k) * k;
    sun.position.set(fx + sunDir.x * 500, fy + sunDir.y * 500, fz + sunDir.z * 500);
    sun.target.position.set(fx, fy, fz);
    if (frameN % 10 === 0) {
      const c = island.cullStats;
      const info = renderer.info.render;
      hud.textContent = `GFX ${TIER_LABEL[quality.preference] || quality.preference} → ${TIER_LABEL[quality.tier] || quality.tier}   ${walk ? 'WALK' : 'FLY'}${c.frozen ? '   CULLING FROZEN' : ''}\n` +
        `draw calls ${info.calls}   triangles ${(info.triangles / 1000).toFixed(0)}k\n` +
        `house cells L0/L1/L2 ${c.lod0}/${c.lod1}/${c.lod2} of ${c.houseCells}   hidden by terrain ${c.occludedHouseCells}\n` +
        `prop meshes ${c.propMeshes} (${c.propInstances} instances)   landmarks ${c.landmarkCells}   terrain LOD ${c.terrainLod}\n` +
        `loot pickups ${c.lootShown}   collider cells ${c.colliderCells}   range scale ${c.scale}   job ${(c.jobMs || 0).toFixed(1)} ms${c.inside ? '\ninside house ' + c.inside : ''}`;
    }
    dotCtx.clearRect(0, 0, 1024, 1024);
    const [mx, mz] = worldToMap(camera.position.x, camera.position.z, 1024);
    dotCtx.save();
    dotCtx.translate(mx, mz);
    dotCtx.rotate(-yaw);
    dotCtx.fillStyle = '#ff3b6b';
    dotCtx.strokeStyle = '#fff';
    dotCtx.lineWidth = 4;
    dotCtx.beginPath();
    dotCtx.moveTo(0, -16); dotCtx.lineTo(11, 12); dotCtx.lineTo(0, 6); dotCtx.lineTo(-11, 12); dotCtx.closePath();
    dotCtx.fill(); dotCtx.stroke();
    dotCtx.restore();
  }
  quality.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(boot, 60);
