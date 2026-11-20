// Standalone launcher for the INKFORGE deployment experience (open /deploy.html).
// URL options: ?q=low|medium|high  ?t=<seconds to start at>  ?speed=<time scale>  ?hud=0  ?noisland=1

import * as THREE from 'three';
import { DeploymentExperience, PHASES } from './index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const msg = document.getElementById('lmsg');

const exp = new DeploymentExperience({
  canvas,
  quality: params.get('q') || undefined,
  seek: params.get('t') ? parseFloat(params.get('t')) : 0,
  timeScale: params.get('speed') ? parseFloat(params.get('speed')) : 1,
  ui: params.get('hud') !== '0',
  createIsland: params.get('noisland') !== '1'
});
window.__ifx = exp;

exp.init((m) => { msg.textContent = m; }).then(() => {
  document.getElementById('loading').style.display = 'none';
  exp.start();
}).catch((e) => { msg.textContent = 'ERROR: ' + e.message; console.error(e && e.stack ? e.stack : e); });

// ---------------------------------------------------------------- debug controls
let free = false;
const keys = new Set();
let yaw = 0;
let pitch = 0;
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!exp.ready) return;
  const s = exp.sequence;
  if (e.code === 'Space') { s.paused = !s.paused; e.preventDefault(); }
  if (e.code === 'BracketRight') s.timeScale = Math.min(16, s.timeScale * 2);
  if (e.code === 'BracketLeft') s.timeScale = Math.max(0.25, s.timeScale / 2);
  if (e.code === 'KeyR') s.seek(0);
  if (e.code === 'KeyH') exp.ui?.setVisible(exp.ui.el.style.display === 'none');
  if (e.code === 'KeyN' || e.code === 'KeyP') {
    const i = PHASES.findIndex((p) => p.id === s.phaseIdAt(s.time));
    const n = Math.max(0, Math.min(PHASES.length - 1, i + (e.code === 'KeyN' ? 1 : -1)));
    s.skipTo(PHASES[n].id);
  }
  if (e.code === 'KeyF') {
    free = !free;
    if (free) {
      const c = exp.camera;
      yaw = Math.atan2(-(c.getWorldDirection(new THREE.Vector3()).x), -(c.getWorldDirection(new THREE.Vector3()).z));
      pitch = 0;
      const v = new THREE.Vector3();
      exp.cameraRig.setOverride((dt, t, p) => {
        const sp = (keys.has('ShiftLeft') ? 140 : 28) * dt;
        const d = new THREE.Vector3((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), 0, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        c.position.addScaledVector(d, sp);
        if (keys.has('KeyE')) c.position.y += sp;
        if (keys.has('KeyQ')) c.position.y -= sp;
        p.pos.copy(c.position);
        v.set(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        p.target.copy(c.position).add(v);
        p.fov = 62; p.shake = 0;
      });
    } else exp.cameraRig.setOverride(null);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => { if (free) canvas.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => {
  if (!free || document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});
