// Free-fly preview of Splat Island (open /map.html). Not used by the game itself.

import * as THREE from 'three';
import { createSplatIsland, renderMinimap, worldToMap, config } from './index.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const SKY = 0x9fd8f5;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xbfe6f7, 900, 5200);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 14000);
scene.add(new THREE.HemisphereLight(0xe2f4ff, 0x6c7a5c, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
sun.position.set(900, 1400, 600);
scene.add(sun);

let island;
const loading = document.getElementById('loading');

function boot() {
  const t0 = performance.now();
  island = createSplatIsland();
  scene.add(island.group);
  const s = island.stats;
  document.getElementById('stats').innerHTML =
    `${s.landAreaKm2.toFixed(2)} km² of land<br>${s.landmarks - 44} landmarks · ${s.buildings} structures<br>${s.trees.toLocaleString()} trees · ${s.roadKm.toFixed(1)} km of road<br>built in ${Math.round(performance.now() - t0)} ms`;

  // POI list
  const box = document.getElementById('pois');
  const list = island.pois;
  list.forEach((p, i) => {
    const b = document.createElement('button');
    b.textContent = `${i < 9 ? i + 1 + '. ' : ''}${p.name}`;
    b.onclick = () => teleport(p);
    box.appendChild(b);
  });
  window.__poiList = list;

  // minimap
  const base = document.getElementById('mmbase');
  const big = renderMinimap(island.terrain, { localRoads: island.localRoads, landmarks: island.landmarks }, 1024);
  base.width = big.width; base.height = big.height;
  base.getContext('2d').drawImage(big, 0, 0);
  const dot = document.getElementById('mmdot');
  dot.width = 1024; dot.height = 1024;

  camera.position.set(0, 1150, 2350);
  yaw = 0; pitch = -0.42;
  loading.style.display = 'none';
}

// ---------------------------------------------------------------- controls
let yaw = 0;
let pitch = 0;
let speed = 140;
const keys = new Set();
const dir = new THREE.Vector3();

function teleport(p) {
  const y = island.heightAt(p.x, p.z);
  camera.position.set(p.x, y + 90, p.z + 190);
  yaw = 0; pitch = -0.38;
}
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') document.getElementById('mmwrap').classList.toggle('big');
  if (e.code === 'KeyH') for (const id of ['title', 'pois', 'help']) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' ? '' : 'none'; }
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m && island?.pois[+m[1] - 1]) teleport(island.pois[+m[1] - 1]);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
document.getElementById('mmwrap').addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));
canvas.addEventListener('click', () => { if (!('ontouchstart' in window)) canvas.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});
window.addEventListener('wheel', (e) => { speed = Math.max(10, Math.min(1500, speed * (e.deltaY < 0 ? 1.15 : 0.87))); }, { passive: true });
let touchLook = null;
canvas.addEventListener('touchstart', (e) => { touchLook = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touchLook) return;
  const t = e.touches[0];
  yaw -= (t.clientX - touchLook[0]) * 0.005;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - (t.clientY - touchLook[1]) * 0.005));
  touchLook = [t.clientX, t.clientY];
}, { passive: true });
for (const [id, code] of [['tFwd', 'KeyW'], ['tBack', 'KeyS']]) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); keys.add(code); keys.add('ShiftLeft'); }, { passive: false });
  el.addEventListener('touchend', () => { keys.delete(code); keys.delete('ShiftLeft'); });
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const dotCtx = document.getElementById('mmdot').getContext('2d');
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (island) {
    const v = speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1) * dt;
    dir.set(0, 0, 0);
    if (keys.has('KeyW')) dir.z -= 1;
    if (keys.has('KeyS')) dir.z += 1;
    if (keys.has('KeyA')) dir.x -= 1;
    if (keys.has('KeyD')) dir.x += 1;
    dir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    camera.position.addScaledVector(dir, v);
    if (keys.has('KeyE') || keys.has('Space')) camera.position.y += v;
    if (keys.has('KeyQ') || keys.has('ControlLeft')) camera.position.y -= v;
    const ground = island.heightAt(camera.position.x, camera.position.z);
    camera.position.y = Math.max(camera.position.y, Math.max(ground, 0) + 2);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    island.update(clock.elapsedTime);

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
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(boot, 60);
void config;
