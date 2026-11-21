// INKFORGE deployment experience — public entry point.
//
//   // lazy-load so the preparation assets never stay resident during normal gameplay:
//   const { DeploymentExperience } = await import('./br/deploy/index.js');
//   const exp = new DeploymentExperience({ renderer, island: existingSplatIsland, onHandover: startMatch });
//   await exp.init();
//   // each frame:  exp.update(dt);  exp.render();
//   // when done:   exp.dispose();
//
// See docs/BR_DEPLOYMENT.md for the integration hooks (spawn points, boarding slots, jump transform, glider).

import * as THREE from 'three';
import { QUALITY, detectQuality, PHASES, DECK } from './constants.js';
import { FX, updateFxView } from './effects.js';
import { createSkyDome, CloudField, ATMOS } from './sky.js';
import { createOcean } from './ocean.js';
import { InkforgeCarrier } from './carrier.js';
import { TransportAircraft } from './aircraft.js';
import { UmbrellaGlider } from './glider.js';
import { BRPreparation } from './sequence.js';
import { DeploymentCamera } from './camera.js';
import { BoardingSystem } from './boarding.js';
import { DeploymentSystem } from './deployment.js';
import { DeploymentUI } from './ui.js';

export { UmbrellaGlider, GLIDER_PRESETS } from './glider.js';
export { PHASES } from './constants.js';

const tick = () => new Promise((r) => setTimeout(r, 16));
const CINE = new Set(['establishing', 'approach', 'landing', 'takeoff', 'aerialFollow', 'islandApproach', 'cockpit', 'deployBay', 'gliderFollow']);

export class DeploymentExperience {
  constructor(opts = {}) {
    this.opts = opts;
    this.quality = opts.quality || detectQuality();
    this.cfg = QUALITY[this.quality];
    this.renderer = opts.renderer || null;
    this.island = opts.island || null;
    this.onHandover = opts.onHandover || null;
    this.ready = false;
    this._t = 0;
    this._lastShot = '';
    this._opsAcc = 1;
    this._listeners = {};
  }

  on(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); if (this.sequence) this.sequence.on(evt, fn); return this; }
  _emit(evt, data) { (this._listeners[evt] || []).forEach((f) => f(data)); }

  async init(onProgress = () => {}) {
    const o = this.opts;
    const cfg = this.cfg;
    if (!this.renderer) {
      const canvas = o.canvas || document.createElement('canvas');
      if (!o.canvas) document.body.appendChild(canvas);
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
      this.renderer.toneMapping = THREE.AgXToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.ownsRenderer = true;
    } else {
      this._saved = { shadow: this.renderer.shadowMap.enabled, type: this.renderer.shadowMap.type };
    }
    const r = this.renderer;
    r.shadowMap.enabled = cfg.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    onProgress('Atmosphere');
    await tick();
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(ATMOS.fog, 1800, 11000);
    const size = r.getSize(new THREE.Vector2());
    this.camera = new THREE.PerspectiveCamera(60, size.x / size.y, 0.25, 16000);
    this.sky = createSkyDome();
    scene.add(this.sky);
    this.clouds = new CloudField(cfg.clouds, { center: [-900, 0, 300], radius: 6500, minY: 380, maxY: 950 });
    scene.add(this.clouds.mesh);
    this.ocean = createOcean({ segments: cfg.ocean, fine: cfg.fineWaves });
    scene.add(this.ocean.group);
    if (cfg.envMap) {
      const envScene = new THREE.Scene();
      const dome = createSkyDome(50);
      envScene.add(dome);
      const pm = new THREE.PMREMGenerator(r);
      const rt = pm.fromScene(envScene, 0.02, 0.1, 100);
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.85;
      pm.dispose();
      dome.geometry.dispose();
      dome.material.dispose();
    }
    scene.add(new THREE.HemisphereLight(0xbfdcff, 0x7a6a58, cfg.envMap ? 0.45 : 1.1));
    this.sun = new THREE.DirectionalLight(0xffe0b8, 3.2);
    this.sun.castShadow = cfg.shadows > 0;
    if (cfg.shadows) {
      this.sun.shadow.mapSize.set(cfg.shadows, cfg.shadows);
      const c = this.sun.shadow.camera;
      c.left = -170; c.right = 170; c.top = 170; c.bottom = -170; c.near = 20; c.far = 1500;
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.5;
    }
    scene.add(this.sun, this.sun.target);

    onProgress('INKFORGE carrier');
    await tick();
    this.carrier = new InkforgeCarrier({ quality: this.quality, qualityCfg: cfg });
    scene.add(this.carrier.group);

    onProgress('Transport aircraft');
    await tick();
    this.aircraft = new TransportAircraft({ qualityCfg: cfg });
    this.aircraft.group.traverse((m) => { if (m.isMesh && m.material !== this.aircraft.mat.glass && m.material !== this.aircraft.mat.glowInt && m.material !== this.aircraft.mat.glowA) m.receiveShadow = true; });
    scene.add(this.aircraft.group, this.aircraft.smoke.points);
    this._buildShowcase();

    if (!this.island && o.createIsland !== false) {
      onProgress('Battle royale island');
      await tick();
      const mod = await import('../../maps/splatIsland/index.js');
      this.island = mod.createSplatIsland();
    }
    if (this.island?.group) {
      scene.add(this.island.group);
      const sea = this.island.group.getObjectByName('sea');
      if (sea) sea.visible = false; // the INKFORGE ocean replaces the island's flat sea plane
      this.propsGroup = this.island.group.getObjectByName('props');
    }

    this.sequence = new BRPreparation({ timeScale: o.timeScale || 1 });
    for (const [evt, fns] of Object.entries(this._listeners)) fns.forEach((f) => this.sequence.on(evt, f));
    this.boarding = new BoardingSystem({ carrier: this.carrier, aircraft: this.aircraft, sequence: this.sequence });
    this.deployment = new DeploymentSystem({ scene, aircraft: this.aircraft, sequence: this.sequence, island: this.island, demo: o.demoGliders !== false });
    this.cameraRig = new DeploymentCamera(this.camera, { T: this.sequence.T, aircraft: this.aircraft, getGlider: () => this.deployment.firstGlider });
    if (o.ui !== false) {
      this.ui = new DeploymentUI({ container: o.container || document.body, phases: PHASES });
      this._wireUI();
    }
    this.sequence.on('complete', () => { this._emit('handover', {}); this.onHandover?.(); });
    if (o.seek) this.sequence.seek(o.seek);
    this.ready = true;
    this._emit('ready', {});
    return this;
  }

  _buildShowcase() {
    // glider display pedestal on the flight deck (reusable asset demo; no character attached)
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 24), new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.5, metalness: 0.6 }));
    ped.position.y = 0.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0x20d8e9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.82;
    g.add(ped, ring);
    this.showcase = new UmbrellaGlider({ scale: 1.5 });
    this.showcase.group.position.y = 3.6;
    this.showcase.setTrail(false);
    g.add(this.showcase.group);
    g.position.set(-146, DECK.y, 36);
    this.carrier.group.add(g);
  }

  _wireUI() {
    const ui = this.ui;
    const seq = this.sequence;
    const fmt = (t) => 'T+' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    seq.on('phase', (p) => ui.log(`[${fmt(p.time)}] ${p.title}`));
    seq.on('touchdown', () => ui.log('TX-01 WHEELS DOWN — ARRESTOR SYSTEM ARMED'));
    seq.on('boardingOpen', () => ui.banner('BOARDING OPEN', '#9cff4f'));
    seq.on('finalCall', () => ui.banner('FINAL BOARDING CALL', '#ff7652'));
    seq.on('boardingClosed', () => { ui.banner('RAMP SECURED', '#ffb42e'); ui.log('RAMP LOCKED — ENGINES TO TAKEOFF POWER'); });
    seq.on('takeoff', () => ui.banner('LAUNCH', '#ff7652'));
    seq.on('deployAvailable', () => { ui.banner('DEPLOYMENT AVAILABLE', '#9cff4f'); ui.log('GREEN LAMP — UMBRELLA GLIDER ARMED'); });
    seq.on('approach', () => {});
    seq.on('phase', (p) => { if (p.id === 'approach') ui.banner('TRANSPORT APPROACHING', '#20d8e9'); if (p.id === 'landed') ui.banner('TRANSPORT LANDED', '#ffb42e'); });
  }

  // ------------------------------------------------------------------ per-frame
  update(dtReal) {
    if (!this.ready) return;
    const dt = Math.min(0.1, dtReal);
    this._t += dt;
    FX.uTime.value = this._t;
    const seq = this.sequence;
    seq.update(dt);
    seq.apply(this.carrier, this.aircraft, dt);
    this.aircraft.group.updateMatrixWorld(true);
    this._opsAcc += dt;
    if (this._opsAcc > 0.1) { this._opsAcc = 0; this.snapshot = seq.snapshot(); this.carrier.setOpsState(this.snapshot); }
    this.carrier.update(dt, this._t);
    this.aircraft.update(dt, this._t);
    this.showcase.update(dt, this._t);
    const cyc = this._t % 11;
    if (cyc < 0.05) this.showcase.open(0.8); else if (cyc > 6.5 && cyc < 6.55) this.showcase.close(0.9);
    this.deployment.update(dt, this._t);
    this.island?.update?.(this._t);
    this.cameraRig.update(dt, seq.time);
    if (this.cfg.hideProps && this.propsGroup) this.propsGroup.visible = seq.time > seq.T.liftoff + 1;
    this.sky.position.copy(this.camera.position);
    updateFxView(this.camera, this.renderer.domElement.height || 720);
    // shadow window follows the action
    const f = this.cameraRig.focus;
    const camDist = f.distanceTo(this.camera.position);
    const centre = camDist > 300 ? this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(120).add(this.camera.position) : f;
    const texel = 340 / (this.cfg.shadows || 1024);
    const sx = Math.round(centre.x / texel) * texel;
    const sy = Math.round(centre.y / texel) * texel;
    const sz = Math.round(centre.z / texel) * texel;
    this.sun.position.set(sx + ATMOS.sun.x * 700, sy + ATMOS.sun.y * 700, sz + ATMOS.sun.z * 700);
    this.sun.target.position.set(sx, sy, sz);
    if (this.ui && this.snapshot) {
      this.ui.update(this.snapshot);
      const shot = this.cameraRig.shotName;
      if (shot !== this._lastShot) { this._lastShot = shot; this.ui.setCinematic(CINE.has(shot)); }
    }
  }

  render() { if (this.ready) this.renderer.render(this.scene, this.camera); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.ownsRenderer) this.renderer.setSize(w, h);
  }

  start() {
    if (this._raf) return;
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      this.update(dt);
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._onResize = () => this.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onResize);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.ui?.dispose();
    this.deployment?.dispose();
    this.carrier?.dispose();
    this.aircraft?.dispose();
    this.showcase?.dispose();
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.(); });
    this.scene?.environment?.dispose?.();
    if (this.island && !this.opts.island) this.island.dispose?.();
    if (this._saved) { this.renderer.shadowMap.enabled = this._saved.shadow; this.renderer.shadowMap.type = this._saved.type; }
    if (this.ownsRenderer) this.renderer.dispose();
    this.ready = false;
  }
}
