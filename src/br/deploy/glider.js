// UmbrellaGlider — Tint3d's deployment glider. A reusable, self-contained visual asset:
// mechanical ribs and spokes, a sliding runner, a paint-splat canopy that opens/closes with a spring,
// wind-reactive flutter, optional ink trail, and named attachment points for the future character.
//
//   const glider = new UmbrellaGlider({ colors: { primary: 0x20d8e9 } });
//   scene.add(glider.group, glider.trail.points);
//   glider.open();                       // or glider.close(), glider.setOpen(0..1)
//   glider.setWind(new THREE.Vector3(6, 0, 2));
//   glider.update(dt, elapsed);
//   // character integration: parent the character's hand to glider.attach.hand and the chest
//   // to glider.attach.harness (see setAttachmentConfig).

import * as THREE from 'three';
import { MeshBuilder } from '../../maps/splatIsland/meshBuilder.js';
import { ParticleSystem, lerp, clamp01 } from './effects.js';

const RIBS = 8;
const NR = 6; // rings per gore
const NT = 4; // columns per gore
const HUB_Y = 1.9;
const RIB_LEN = 3.7;
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const GLIDER_PRESETS = {
  tint3d: { primary: 0x20d8e9, secondary: 0xf2f6fa, trim: 0xff7652, splat: 0xff3fa4, glow: 0x20d8e9 },
  coral: { primary: 0xff7652, secondary: 0xf2f6fa, trim: 0x20d8e9, splat: 0xffb42e, glow: 0xff7652 },
  magenta: { primary: 0xff3fa4, secondary: 0x2a1a3a, trim: 0xffb42e, splat: 0x20d8e9, glow: 0xff3fa4 },
  lime: { primary: 0x9cff4f, secondary: 0x16301c, trim: 0x20d8e9, splat: 0xffb42e, glow: 0x9cff4f }
};

export class UmbrellaGlider {
  constructor({ colors = GLIDER_PRESETS.tint3d, radiusScale = 1, scale = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'UmbrellaGlider';
    this.group.scale.setScalar(scale);
    this.colors = { ...GLIDER_PRESETS.tint3d, ...colors };
    this.k = { open: 0, vel: 0, target: 0, wind: new THREE.Vector3(), tilt: new THREE.Vector2(), sway: 0 };
    this.radiusScale = radiusScale;
    this.trailOn = false;
    this._acc = 0;
    this.disposables = [];
    this.attach = {};
    this._buildStatic();
    this._buildCanopy();
    this._buildAnchors();
    this.trail = new ParticleSystem({ max: 160, gravity: 1.4, drag: 0.6, name: 'gliderInk' });
    this.setOpen(0);
  }

  // ---------------------------------------------------------------- static mechanical parts
  _buildStatic() {
    const mb = new MeshBuilder();
    const metal = 0x9aa4b2;
    mb.cyl(0, -0.22, 0, 0.055, 0.5, 0x23272e, 12); // grip
    for (let k = 0; k < 4; k++) mb.cyl(0, -0.18 + k * 0.11, 0, 0.062, 0.03, 0x3a424d, 12);
    mb.cyl(0, 0.26, 0, 0.075, 0.1, metal, 12);
    mb.cyl(0, 0.35, 0, 0.032, HUB_Y - 0.55, metal, 8); // shaft
    mb.cyl(0, HUB_Y - 0.22, 0, 0.1, 0.22, 0x5b6572, 10); // hub body
    mb.cyl(0, HUB_Y, 0, 0.13, 0.14, 0x3a424d, 10);
    mb.cone(0, HUB_Y + 0.14, 0, 0.1, 0.22, metal, 8); // ferrule
    for (let k = 0; k < RIBS; k++) {
      const a = (k / RIBS) * Math.PI * 2;
      mb.box(Math.cos(a) * 0.13, HUB_Y - 0.1, Math.sin(a) * 0.13, 0.08, 0.1, 0.08, -a, 0x3a424d);
    }
    mb.box(0, -0.02, 0.07, 0.05, 0.1, 0.05, 0, 0xff7652); // release button
    this.staticMesh = new THREE.Mesh(this._geo(mb), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.75 }));
    this.staticMesh.castShadow = true;
    this.group.add(this.staticMesh);
    this.disposables.push(this.staticMesh.material);
    // glowing grip ring
    const gb = new MeshBuilder();
    gb.cyl(0, -0.24, 0, 0.066, 0.03, 0xffffff, 12);
    this.gripGlow = new THREE.Mesh(this._geo(gb), new THREE.MeshBasicMaterial({ color: this.colors.glow }));
    this.group.add(this.gripGlow);
    this.disposables.push(this.gripGlow.material);
    // sliding runner collar
    const rb = new MeshBuilder();
    rb.cyl(0, 0, 0, 0.09, 0.14, 0xc6ced8, 10);
    this.runner = new THREE.Mesh(this._geo(rb), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8 }));
    this.group.add(this.runner);
    this.disposables.push(this.runner.material);
    // harness ring + suspension lines
    const hb = new MeshBuilder();
    hb.cyl(0, -1.08, 0, 0.09, 0.05, 0xc6ced8, 10);
    hb.cyl(0, -1.03, 0, 0.04, 0.1, 0x3a424d, 6);
    const hm = new THREE.Mesh(this._geo(hb), this.runner.material);
    this.group.add(hm);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBS * 2 * 3), 3));
    this.lineGeo = lineGeo;
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.85 }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.disposables.push(lineGeo, this.lines.material);
  }

  _geo(b) {
    const a = b.toArrays();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
    g.setIndex(new THREE.BufferAttribute(a.indices, 1));
    g.computeBoundingSphere();
    this.disposables.push(g);
    return g;
  }

  // ---------------------------------------------------------------- dynamic canopy, ribs, stretchers
  _buildCanopy() {
    this.canopyRoot = new THREE.Group();
    this.canopyRoot.position.set(0, HUB_Y, 0);
    this.group.add(this.canopyRoot);
    const perGore = (NR + 1) * (NT + 1);
    const nV = RIBS * perGore;
    this.cPos = new Float32Array(nV * 3);
    this.cCol = new Float32Array(nV * 3);
    const idx = [];
    for (let k = 0; k < RIBS; k++) {
      for (let r = 0; r < NR; r++) {
        for (let t = 0; t < NT; t++) {
          const a = k * perGore + r * (NT + 1) + t;
          const b = a + 1;
          const c = a + NT + 1;
          const d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.cPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.cCol, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), 6);
    this.canopyGeo = g;
    this.canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
    this.canopy = new THREE.Mesh(g, this.canopyMat);
    this.canopy.castShadow = true;
    this.canopy.frustumCulled = false;
    this.canopyRoot.add(this.canopy);
    this.disposables.push(g, this.canopyMat);
    this._paintCanopy();

    // frame: rib ribbons + stretchers
    const segs = 7;
    const nF = RIBS * (segs + 1) * 2 + RIBS * 2;
    this.fPos = new Float32Array(nF * 3);
    const fIdx = [];
    let base = 0;
    for (let k = 0; k < RIBS; k++) {
      for (let i = 0; i < segs; i++) {
        const a = base + i * 2;
        fIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      base += (segs + 1) * 2;
    }
    for (let k = 0; k < RIBS; k++) { fIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); base += 2 + 2; }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.fPos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setIndex(fIdx.filter((v) => v < nF));
    fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), 6);
    this.frameGeo = fg;
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x8e98a6, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
    this.frame = new THREE.Mesh(fg, this.frameMat);
    this.frame.frustumCulled = false;
    this.canopyRoot.add(this.frame);
    this.disposables.push(fg, this.frameMat);
    // rib tips (glowing nodes)
    this.tipGeo = new THREE.SphereGeometry(0.075, 8, 6);
    this.tipMat = new THREE.MeshBasicMaterial({ color: this.colors.glow });
    this.tips = new THREE.InstancedMesh(this.tipGeo, this.tipMat, RIBS);
    this.tips.frustumCulled = false;
    this.canopyRoot.add(this.tips);
    this.disposables.push(this.tipGeo, this.tipMat);
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  _paintCanopy() {
    const c = this.colors;
    const col = new THREE.Color();
    const perGore = (NR + 1) * (NT + 1);
    const P = new THREE.Color(c.primary);
    const S = new THREE.Color(c.secondary);
    const T = new THREE.Color(c.trim);
    const X = new THREE.Color(c.splat);
    const G = new THREE.Color(c.glow);
    for (let k = 0; k < RIBS; k++) {
      for (let r = 0; r <= NR; r++) {
        for (let t = 0; t <= NT; t++) {
          const s = r / NR;
          const u = t / NT;
          col.copy(k % 2 ? S : P);
          const h = Math.sin(k * 12.9898 + s * 37.7 + u * 11.3) * 43758.5453;
          const f = h - Math.floor(h);
          if (f > 0.86 && s > 0.2 && s < 0.9) col.copy(X);
          if (s > 0.9) col.copy(T);
          if (s < 0.1) col.copy(G).multiplyScalar(0.8);
          const o = (k * perGore + r * (NT + 1) + t) * 3;
          this.cCol[o] = col.r; this.cCol[o + 1] = col.g; this.cCol[o + 2] = col.b;
        }
      }
    }
    this.canopyGeo.attributes.color.needsUpdate = true;
    this.gripGlow.material.color.set(c.glow);
    this.tipMat.color.set(c.glow);
  }

  _buildAnchors() {
    const mk = (name, x, y, z) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      this.group.add(o);
      return o;
    };
    this.attach.root = mk('AttachPoint_Root', 0, 0, 0);
    this.attach.hand = mk('AttachPoint_Hand', 0, 0.02, 0);
    this.attach.harness = mk('AttachPoint_Harness', 0, -1.05, 0);
    this.attach.hub = mk('AttachPoint_Hub', 0, HUB_Y, 0);
    this._cfg = { hand: [0, 0.02, 0], harness: [0, -1.05, 0] };
  }

  // Reposition the hand/harness attachment points to fit a character (metres, glider space).
  setAttachmentConfig({ hand, harness } = {}) {
    if (hand) { this.attach.hand.position.set(...hand); this._cfg.hand = hand; }
    if (harness) { this.attach.harness.position.set(...harness); this._cfg.harness = harness; this._updateLines(); }
  }

  setColors(colors) {
    if (typeof colors === 'string') colors = GLIDER_PRESETS[colors];
    this.colors = { ...this.colors, ...colors };
    this._paintCanopy();
  }

  // ---------------------------------------------------------------- state
  open(speed = 1) { this.k.target = 1; this.k.speed = speed; }
  close(speed = 1) { this.k.target = 0; this.k.speed = speed; }
  setOpen(v) { this.k.open = v; this.k.vel = 0; this.k.target = v > 0.5 ? 1 : 0; this._rebuild(0); }
  setWind(vec) { this.k.wind.copy(vec); }
  setTrail(on) { this.trailOn = on; }
  get openAmount() { return this.k.open; }

  _rib(k, s, o, out) {
    const oc = Math.min(1.12, Math.max(0, o));
    const g0 = lerp(1.52, 0.18, oc);
    const kap = Math.max(0.04, lerp(0.03, 0.55, oc));
    const L = RIB_LEN * this.radiusScale;
    const ang = (k / RIBS) * Math.PI * 2;
    const x = (L * (Math.sin(g0 + kap * s) - Math.sin(g0))) / kap;
    const y = (L * (Math.cos(g0 + kap * s) - Math.cos(g0))) / kap;
    out[0] = x * Math.cos(ang);
    out[1] = y;
    out[2] = x * Math.sin(ang);
    return out;
  }

  _rebuild(t) {
    const o = this.k.open;
    const oc = Math.min(1.12, Math.max(0, o));
    const wmag = Math.min(14, this.k.wind.length());
    const flutter = (0.015 + wmag * 0.006) * smoothstep(0.2, 0.8, o);
    const billow = 0.2 * oc;
    const A = [0, 0, 0];
    const B = [0, 0, 0];
    const perGore = (NR + 1) * (NT + 1);
    for (let k = 0; k < RIBS; k++) {
      const k2 = (k + 1) % RIBS;
      const am = ((k + 0.5) / RIBS) * Math.PI * 2;
      for (let r = 0; r <= NR; r++) {
        const s = r / NR;
        this._rib(k, s, o, A);
        this._rib(k2, s, o, B);
        for (let tt = 0; tt <= NT; tt++) {
          const u = tt / NT;
          const sn = Math.sin(Math.PI * u);
          let x = lerp(A[0], B[0], u);
          let y = lerp(A[1], B[1], u);
          let z = lerp(A[2], B[2], u);
          const bl = billow * sn * Math.min(1, s * 1.3) + flutter * sn * s * Math.sin(t * 7 + k * 1.7 + s * 5 + u * 3);
          x += Math.cos(am) * 0.4 * bl;
          z += Math.sin(am) * 0.4 * bl;
          y += bl;
          const edge = smoothstep(0.82, 1, s);
          y += 0.24 * oc * sn * edge;
          const pull = 1 - 0.05 * sn * s * oc;
          x *= pull;
          z *= pull;
          const o3 = (k * perGore + r * (NT + 1) + tt) * 3;
          this.cPos[o3] = x; this.cPos[o3 + 1] = y; this.cPos[o3 + 2] = z;
        }
      }
    }
    this.canopyGeo.attributes.position.needsUpdate = true;
    this.canopyGeo.computeVertexNormals();
    // ribs, stretchers and tips
    const segs = 7;
    let f = 0;
    const T = [0, 0, 0];
    const runnerY = lerp(HUB_Y - 1.5, HUB_Y - 0.62, Math.min(1, o)) - HUB_Y;
    for (let k = 0; k < RIBS; k++) {
      const ang = (k / RIBS) * Math.PI * 2;
      const wx = -Math.sin(ang) * 0.03;
      const wz = Math.cos(ang) * 0.03;
      for (let i = 0; i <= segs; i++) {
        this._rib(k, i / segs, o, A);
        this.fPos.set([A[0] - wx, A[1] - 0.02, A[2] - wz, A[0] + wx, A[1] - 0.02, A[2] + wz], f);
        f += 6;
      }
    }
    for (let k = 0; k < RIBS; k++) {
      const ang = (k / RIBS) * Math.PI * 2;
      const wx = -Math.sin(ang) * 0.02;
      const wz = Math.cos(ang) * 0.02;
      this._rib(k, 0.5, o, A);
      const rx = Math.cos(ang) * 0.07;
      const rz = Math.sin(ang) * 0.07;
      this.fPos.set([rx - wx, runnerY, rz - wz, rx + wx, runnerY, rz + wz, A[0] - wx, A[1] - 0.03, A[2] - wz, A[0] + wx, A[1] - 0.03, A[2] + wz], f);
      f += 12;
      this._rib(k, 1, o, T);
      this._m.makeTranslation(T[0], T[1], T[2]);
      this.tips.setMatrixAt(k, this._m);
    }
    this.frameGeo.attributes.position.needsUpdate = true;
    this.tips.instanceMatrix.needsUpdate = true;
    this.runner.position.set(0, HUB_Y + runnerY - 0.05, 0);
    this._updateLines();
  }

  _updateLines() {
    const p = this.lineGeo.attributes.position;
    const h = this.attach.harness.position;
    const tmp = new THREE.Vector3();
    this.canopyRoot.updateMatrix();
    const T = [0, 0, 0];
    for (let k = 0; k < RIBS; k++) {
      this._rib(k, 1, this.k.open, T);
      tmp.set(T[0], T[1], T[2]).applyMatrix4(this.canopyRoot.matrix);
      p.setXYZ(k * 2, tmp.x, tmp.y, tmp.z);
      p.setXYZ(k * 2 + 1, h.x, h.y, h.z);
    }
    p.needsUpdate = true;
  }

  update(dt, t) {
    const k = this.k;
    // spring: opening overshoots, closing is critically damped
    const sp = k.speed || 1;
    const stiff = (k.target > k.open ? 70 : 40) * sp * sp;
    const damp = (k.target > k.open ? 7.5 : 11) * sp;
    k.vel += (stiff * (k.target - k.open) - damp * k.vel) * dt;
    k.open += k.vel * dt;
    // wind: tilt the canopy and sway the whole glider
    const wx = k.wind.x;
    const wz = k.wind.z;
    const tx = Math.max(-0.5, Math.min(0.5, wz * 0.035));
    const tz = Math.max(-0.5, Math.min(0.5, -wx * 0.035));
    k.tilt.x += (tx - k.tilt.x) * Math.min(1, dt * 3);
    k.tilt.y += (tz - k.tilt.y) * Math.min(1, dt * 3);
    const wob = (0.015 + Math.min(1, k.wind.length() * 0.03) * 0.03) * Math.sin(t * 2.3);
    this.canopyRoot.rotation.set(k.tilt.x + wob, 0, k.tilt.y + wob * 0.7);
    this._rebuild(t);
    if (this.trailOn && k.open > 0.6) {
      this._acc += dt * 38;
      const c = [this.colors.primary, this.colors.splat, this.colors.trim][Math.floor(t * 3) % 3];
      const T = [0, 0, 0];
      const v = new THREE.Vector3();
      while (this._acc >= 1) {
        this._acc -= 1;
        this._rib(Math.floor(Math.random() * RIBS), 1, k.open, T);
        v.set(T[0], T[1], T[2]);
        this.canopyRoot.localToWorld(v);
        this.trail.emit(v.x, v.y, v.z, (Math.random() - 0.5) * 0.6, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 1.6, 0.35, 1.1, c, 0.8);
      }
    }
    this.trail.update(dt);
  }

  dispose() { this.disposables.forEach((d) => d.dispose?.()); this.trail.geometry.dispose(); }
}
