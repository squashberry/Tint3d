// TX-01 "Inkjet" — heavy transport aircraft with a walk-in cargo bay.
// Local frame: origin on the ground under the fuselage centre, +X nose, +Y up, +Z starboard.
// The cargo bay is hollow and visible through the rear ramp, side windows and cockpit glass.

import * as THREE from 'three';
import { MeshBuilder } from '../../maps/splatIsland/meshBuilder.js';
import { AIRCRAFT, PALETTE } from './constants.js';
import { LightPoints, ParticleSystem, createExhaust, setExhaust, textPlane, lerp, clamp01 } from './effects.js';

const NANG = 28;
const SUPER_N = 3.2;
const FUS_X0 = -41;
const FUS_X1 = 41;
const WIN_X = [-22, -16, -10, -4, 2, 8];
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

function section(x) {
  if (x >= 18) {
    const t = Math.min(1, (x - 18) / 23);
    const s = Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.55);
    return { yc: 5.7 + 0.5 * t, hw: 5.0 * s, hh: 3.1 * s };
  }
  if (x >= -24) return { yc: 5.7, hw: 5.0, hh: 3.1 };
  const u = Math.min(1, (-24 - x) / 17);
  const e = u * u * (3 - 2 * u);
  return { yc: 5.7 + 3.0 * e, hw: 5.0 - 0.9 * u, hh: 3.1 - 1.2 * u };
}
function ringPoint(x, j, inset = 0) {
  const s = section(x);
  const a = (j / NANG) * Math.PI * 2;
  const hw = Math.max(0.02, s.hw - inset);
  const hh = Math.max(0.02, s.hh - inset);
  return [x, s.yc + hh * sgnPow(Math.sin(a), 2 / SUPER_N), hw * sgnPow(Math.cos(a), 2 / SUPER_N)];
}

export class TransportAircraft {
  constructor({ qualityCfg = {}, envMap = null } = {}) {
    this.cfg = qualityCfg;
    this.group = new THREE.Group();
    this.group.name = 'TransportAircraft';
    this.disposables = [];
    this.anchors = {};
    this.state = { gear: 1, flaps: 0, ramp: 0, rearDoor: 0, throttle: 0, interior: 0, wheelAngle: 0 };
    this.fans = [];
    this.exhausts = [];
    this.shimmer = [];
    this.wheels = [];
    this.lights = [];
    this.mbs = { skin: new MeshBuilder(), inner: new MeshBuilder(), glass: new MeshBuilder(), glowInt: new MeshBuilder(), glowA: new MeshBuilder() };
    const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    this.mat = {
      skin: std({ roughness: 0.38, metalness: 0.55, envMap, envMapIntensity: 1.1 }),
      inner: std({ roughness: 0.85, metalness: 0.1 }),
      glass: std({ roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.32, envMap, side: THREE.DoubleSide, depthWrite: false }),
      glowInt: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glowA: new THREE.MeshBasicMaterial({ vertexColors: true }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.95 }),
      hub: new THREE.MeshStandardMaterial({ color: 0xb8c0ca, roughness: 0.4, metalness: 0.8 }),
      red: new THREE.MeshBasicMaterial({ color: 0xff3a3a }),
      green: new THREE.MeshBasicMaterial({ color: 0x4dff88 })
    };
    Object.values(this.mat).forEach((m) => this.disposables.push(m));
    this._fuselage();
    this._interior();
    this._wings();
    this._tail();
    this._engines();
    this._gear();
    this._ramp();
    this._cockpit();
    this._flush();
    this._lightsSetup();
    this._anchors();
    this.setGear(1);
    this.setRamp(0);
    this.setRearDoor(0);
    this.setInteriorLights(0);
    this.setThrottle(0);
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
  _flush() {
    for (const [k, b] of Object.entries(this.mbs)) {
      if (!b.vertexCount) continue;
      const m = new THREE.Mesh(this._geo(b), this.mat[k]);
      m.name = 'aircraft_' + k;
      if (k === 'skin') m.castShadow = true;
      if (k === 'glass') m.renderOrder = 3;
      this.group.add(m);
    }
  }

  // ------------------------------------------------------------------ fuselage shell (outer skin + inner skin + windows)
  _fuselage() {
    const skin = this.mbs.skin;
    const inner = this.mbs.inner;
    const glass = this.mbs.glass;
    const xs = [];
    for (let x = FUS_X0; x <= FUS_X1; x += 1) xs.push(x);
    const isWindow = (x0, j) => {
      for (const wx of WIN_X) if (x0 >= wx && x0 < wx + 2.0 && (j === 0 || j === NANG - 1 || j === 13 || j === 14)) return true;
      if (x0 >= 25 && x0 < 33 && (j === 6 || j === 7)) return true;
      if (x0 >= 27 && x0 < 32 && (j === 2 || j === 3 || j === 11 || j === 12)) return true;
      return false;
    };
    const bottomSkip = (x0, j) => {
      if (x0 >= -26) return false;
      const open = clamp01((-26 - x0) / 5);
      return Math.abs(j - 21) <= 1 + Math.round(open * 3);
    };
    const faceIn = (b, a, bb, c, d, ctr, col) => {
      const m = [(a[0] + bb[0] + c[0] + d[0]) / 4, (a[1] + bb[1] + c[1] + d[1]) / 4, (a[2] + bb[2] + c[2] + d[2]) / 4];
      b.qo(a, bb, c, d, [2 * m[0] - ctr[0], 2 * m[1] - ctr[1], 2 * m[2] - ctr[2]], col);
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const ctr = [(x0 + x1) / 2, section(x0).yc, 0];
      for (let j = 0; j < NANG; j++) {
        const j2 = (j + 1) % NANG;
        if (bottomSkip(x0, j)) continue;
        const a = ringPoint(x0, j);
        const b = ringPoint(x1, j);
        const c = ringPoint(x1, j2);
        const d = ringPoint(x0, j2);
        const sinA = Math.sin(((j + 0.5) / NANG) * Math.PI * 2);
        let col = 0xe4eaf1;
        if (sinA < -0.3) col = 0xa7b1bd;
        else if (Math.abs(sinA) < 0.17 && x0 > -36 && x0 < 14) col = PALETTE.cyan;
        else if (x0 < -34) col = 0xe9eef4;
        const shade = (i % 6 === 0 ? 0.86 : 1) * (j % 7 === 0 ? 0.94 : 1);
        if (!isWindow(x0, j)) {
          skin.qo(a, b, c, d, ctr, MeshBuilder.rgb(col, shade));
          faceIn(inner, ringPoint(x0, j, 0.35), ringPoint(x1, j, 0.35), ringPoint(x1, j2, 0.35), ringPoint(x0, j2, 0.35), ctr, MeshBuilder.rgb(i % 3 === 0 ? 0x2a323c : 0x3b4551, sinA < -0.3 ? 0.7 : 1));
        } else {
          glass.qo(a, b, c, d, ctr, MeshBuilder.rgb(0x9ad9ee));
        }
      }
    }
    const ctr = [FUS_X0, 8, 0];
    for (let j = 0; j < NANG; j++) {
      if (bottomSkip(FUS_X0, j)) continue;
      const j2 = (j + 1) % NANG;
      skin.qo(ringPoint(FUS_X0, j), ringPoint(FUS_X0, j2), ringPoint(FUS_X0, j2, 0.35), ringPoint(FUS_X0, j, 0.35), ctr, MeshBuilder.rgb(0x7c8794));
    }
    for (const s of [-1, 1]) {
      skin.box(-1, 2.1, s * 5.35, 24, 3.2, 1.7, 0, 0xc2cad3);
      this.mbs.glowA.box(-1, 3.2, s * 6.22, 20, 0.12, 0.08, 0, PALETTE.cyan);
    }
    for (const s of [1, -1]) {
      const n = textPlane('TX-01', 6, 1.6, { color: '#ffb42e', px: 150 });
      n.position.set(20, 5.7, s * 3.8);
      n.rotation.y = s > 0 ? 0 : Math.PI;
      this.group.add(n);
    }
  }

  // ------------------------------------------------------------------ cargo bay interior
  _interior() {
    const b = this.mbs.inner;
    const g = this.mbs.glowInt;
    b.box(-7, 2.7, 0, 46, 0.4, 9.3, 0, 0x2f353e);
    b.box(16.2, 3.1, 0, 0.5, 5.2, 9.2, 0, 0x2a323c);
    for (const s of [-1, 1]) this._floorQuad(g, -7, s * 2.35, 44, 0.16, 0xffc72e);
    for (let k = 0; k < 9; k++) this._arrow(g, -26 + k * 4.2, 0, 0xffc72e);
    const dl = textPlane('DEPLOY  ◀', 6, 1.2, { color: '#ffb42e', px: 150 });
    dl.rotation.x = -Math.PI / 2;
    dl.rotation.z = Math.PI / 2;
    dl.position.set(-26.5, 3.13, 0);
    this.group.add(dl);
    for (const z of [-1.5, 1.5]) g.box(-6, 8.35, z, 44, 0.12, 0.35, 0, 0xdfeaff);
    for (const s of [-1, 1]) g.box(-29, 8.0, s * 3.6, 0.5, 0.35, 0.5, 0, 0xff3a3a);
    this.seatSlots = [];
    for (const s of [-1, 1]) {
      b.box(-6, 3.1, s * 4.45, 44, 0.45, 0.4, 0, 0x2b3440);
      for (let k = 0; k < 30; k++) {
        const x = -26 + k * 1.3;
        b.box(x, 3.5, s * 3.95, 0.9, 0.18, 0.85, 0, 0x2d4a6b);
        b.box(x, 3.65, s * 4.38, 0.9, 0.95, 0.14, 0, 0x24323f);
        b.box(x - 0.28, 4.05, s * 4.26, 0.07, 0.8, 0.07, 0, 0xffb42e);
        b.box(x + 0.28, 4.05, s * 4.26, 0.07, 0.8, 0.07, 0, 0xffb42e);
        this.seatSlots.push({ side: s, index: k, pos: [x, 3.55, s * 3.9], yaw: s > 0 ? Math.PI : 0 });
      }
    }
    this.standSlots = [];
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 20; k++) {
        const x = -24 + k * 1.9;
        const z = r ? 1.0 : -1.0;
        this._floorQuad(g, x, z, 0.8, 0.8, 0x20d8e9);
        this.standSlots.push({ index: r * 20 + k, pos: [x, 3.1, z] });
      }
    }
    for (const s of [-1, 1]) {
      b.box(15.4, 3.1, s * 3.2, 1.0, 4.4, 2.4, 0, 0x39424e);
      const cols = [PALETTE.cyan, PALETTE.coral, PALETTE.magenta, PALETTE.amber];
      for (let k = 0; k < 8; k++) {
        b.cyl(14.8, 3.9 + (k >> 2) * 1.8, s * (2.4 + (k % 4) * 0.55), 0.12, 1.6, cols[k % 4], 6, 0.05);
      }
      g.box(14.85, 7.2, s * 3.2, 0.06, 0.1, 2.2, 0, PALETTE.cyan);
    }
    for (const [x, z, h] of [[11.4, -1.2, 1.4], [11.4, 1.2, 1.1], [9.0, 0, 0.8]]) {
      b.box(x, 3.1, z, 1.8, 0.2, 1.8, 0, 0x6b5a3a);
      b.box(x, 3.3, z, 1.4, h, 1.4, 0, 0x4a6a8a);
    }
    for (let k = 0; k < 12; k++) b.box(-10 + k * 3, 6.0, 4.6, 0.12, 0.12, 0.12, 0, 0xffb42e);
  }
  _floorQuad(builder, cx, cz, w, d, hex) {
    const y = 3.125;
    builder.quad([cx - w / 2, y, cz - d / 2], [cx - w / 2, y, cz + d / 2], [cx + w / 2, y, cz + d / 2], [cx + w / 2, y, cz - d / 2], MeshBuilder.rgb(hex));
  }
  _arrow(builder, x, z, hex) {
    const y = 3.125;
    const col = MeshBuilder.rgb(hex);
    builder.tri([x - 0.7, y, z - 0.6], [x - 0.7, y, z + 0.6], [x + 0.2, y, z], col);
    builder.tri([x - 0.7, y, z + 0.6], [x - 0.7, y, z - 0.6], [x + 0.2, y, z], col);
  }

  _cockpit() {
    const b = this.mbs.inner;
    b.box(26, 4.9, 0, 12, 0.3, 4.2, 0, 0x2a323c);
    for (const s of [-1, 1]) {
      b.box(27.5, 5.2, s * 1.2, 1.1, 0.6, 1.0, 0, 0x2d4a6b);
      b.box(27.0, 5.7, s * 1.2, 0.2, 1.1, 0.9, 0, 0x24323f);
    }
    b.box(31.2, 5.2, 0, 1.4, 1.0, 3.6, 0, 0x1b2129);
    for (const [z, hex] of [[-1.2, PALETTE.cyan], [0, PALETTE.amber], [1.2, PALETTE.cyan]]) this.mbs.glowA.box(30.5, 5.9, z, 0.08, 0.45, 0.9, 0, hex);
    this.mbs.glowA.box(30.2, 7.5, 0, 0.1, 0.1, 3.4, 0, PALETTE.cyan);
  }

  // ------------------------------------------------------------------ wings and flaps
  _wings() {
    const skin = this.mbs.skin;
    const N = 9;
    const half = AIRCRAFT.span / 2;
    const xLE = (s) => 6 - 18 * s;
    const chord = (s) => lerp(13, 4.2, s);
    const thick = (s) => lerp(1.5, 0.45, s);
    const yAt = (s) => 8.6 - 1.4 * s;
    const sec = (s, side) => {
      const x = xLE(s);
      const c = chord(s);
      const t = thick(s);
      const y = yAt(s);
      return {
        z: side * (3 + s * (half - 3)),
        top: [[x, y + t * 0.35], [x - c * 0.3, y + t * 0.5], [x - c, y + t * 0.1]],
        bot: [[x, y - t * 0.35], [x - c * 0.3, y - t * 0.5], [x - c, y - t * 0.1]]
      };
    };
    const V = (p, z) => [p[0], p[1], z];
    for (const side of [-1, 1]) {
      for (let k = 0; k < N - 1; k++) {
        const A = sec(k / (N - 1), side);
        const B = sec((k + 1) / (N - 1), side);
        const ctr = [(A.top[1][0] + B.top[1][0]) / 2, (A.top[1][1] + B.bot[1][1]) / 2, (A.z + B.z) / 2];
        const col = k < 2 ? 0xdfe6ee : k % 2 ? 0xd2dae3 : 0xe4eaf1;
        for (let i = 0; i < 2; i++) {
          skin.qo(V(A.top[i], A.z), V(A.top[i + 1], A.z), V(B.top[i + 1], B.z), V(B.top[i], B.z), ctr, MeshBuilder.rgb(col));
          skin.qo(V(A.bot[i], A.z), V(A.bot[i + 1], A.z), V(B.bot[i + 1], B.z), V(B.bot[i], B.z), ctr, MeshBuilder.rgb(0xa9b3bf));
        }
        skin.qo(V(A.top[0], A.z), V(B.top[0], B.z), V(B.bot[0], B.z), V(A.bot[0], A.z), ctr, MeshBuilder.rgb(0xc6ced8));
        skin.qo(V(A.top[2], A.z), V(B.top[2], B.z), V(B.bot[2], B.z), V(A.bot[2], A.z), ctr, MeshBuilder.rgb(0x9aa5b1));
      }
      const T = sec(1, side);
      skin.qo(V(T.top[0], T.z), V(T.top[2], T.z), V(T.bot[2], T.z), V(T.bot[0], T.z), [0, 7, side * 20], MeshBuilder.rgb(0xc6ced8));
      skin.box(xLE(1) - 2.0, yAt(1), side * (half - 0.2), 2.8, 3.2, 0.25, 0, side > 0 ? PALETTE.coral : PALETTE.cyan);
      this.mbs.glowA.box(xLE(1) - 3.6, yAt(1) + 0.9, side * (half - 0.2), 0.3, 1.2, 0.3, 0, side > 0 ? 0x4dff88 : 0xff3a3a);
    }
    this.flaps = [];
    for (const side of [-1, 1]) {
      for (const [s0, s1] of [[0.12, 0.42], [0.46, 0.8]]) {
        const A = sec(s0, side);
        const B = sec(s1, side);
        let p = [xLE(s0) - chord(s0) * 0.72, A.z];
        let q = [xLE(s1) - chord(s1) * 0.72, B.z];
        if (q[1] < p[1]) { const t = p; p = q; q = t; }
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const grp = new THREE.Group();
        grp.position.set((p[0] + q[0]) / 2, (yAt(s0) + yAt(s1)) / 2 - 0.1, (p[1] + q[1]) / 2);
        grp.rotation.y = Math.atan2(q[0] - p[0], q[1] - p[1]);
        const pivot = new THREE.Group();
        grp.add(pivot);
        const fb = new MeshBuilder();
        fb.box(-1.7, -0.18, 0, 3.4, 0.36, len, 0, 0xd2dae3);
        fb.box(-1.7, 0.18, 0, 3.4, 0.05, len - 0.4, 0, side > 0 ? PALETTE.coral : PALETTE.cyan);
        const fm = new THREE.Mesh(this._geo(fb), this.mat.skin);
        fm.castShadow = true;
        pivot.add(fm);
        this.group.add(grp);
        this.flaps.push(pivot);
      }
    }
  }

  // ------------------------------------------------------------------ T-tail
  _tail() {
    const skin = this.mbs.skin;
    const root = 9.7;
    const P = [[-26, root], [-41, root], [-42.5, 24], [-34, 24.5]];
    const ctr = [-36, 16, 0];
    const l2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    for (const side of [-1, 1]) {
      const z = side * 0.3;
      for (const [t0, t1, col] of [[0, 0.45, 0xe4eaf1], [0.45, 0.62, PALETTE.cyan], [0.62, 1, PALETTE.coral]]) {
        const f0 = l2(P[0], P[3], t0), f1 = l2(P[1], P[2], t0), f2 = l2(P[1], P[2], t1), f3 = l2(P[0], P[3], t1);
        skin.qo([f0[0], f0[1], z], [f1[0], f1[1], z], [f2[0], f2[1], z], [f3[0], f3[1], z], ctr, MeshBuilder.rgb(col));
      }
    }
    skin.qo([-26, root, -0.3], [-34, 24.5, -0.3], [-34, 24.5, 0.3], [-26, root, 0.3], ctr, MeshBuilder.rgb(0xc6ced8));
    skin.qo([-41, root, -0.3], [-42.5, 24, -0.3], [-42.5, 24, 0.3], [-41, root, 0.3], ctr, MeshBuilder.rgb(0x9aa5b1));
    for (const side of [-1, 1]) {
      skin.qo([-34.5, 24.55, 0], [-39.5, 24.55, side * 11.5], [-45, 24.4, side * 11.5], [-41.5, 24.5, 0], [-40, 30, side * 5], MeshBuilder.rgb(0xdfe6ee));
      skin.qo([-34.5, 24.2, 0], [-41.5, 24.2, 0], [-45, 24.05, side * 11.5], [-39.5, 24.2, side * 11.5], [-40, 20, side * 5], MeshBuilder.rgb(0xa9b3bf));
      skin.box(-43, 24.1, side * 11.4, 1.8, 0.5, 0.4, 0, side > 0 ? PALETTE.coral : PALETTE.cyan);
    }
    for (const side of [-1, 1]) {
      const t = textPlane('INKFORGE  AIR', 9, 2.4, { color: '#20d8e9', px: 170 });
      t.position.set(-35.5, 15.4, side * 0.36);
      t.rotation.y = side > 0 ? 0 : Math.PI;
      this.group.add(t);
    }
  }

  // ------------------------------------------------------------------ engines
  _engines() {
    const skin = this.mbs.skin;
    const xLE = (s) => 6 - 18 * s;
    for (const side of [-1, 1]) {
      for (const zAbs of [13, 26]) {
        const s = (zAbs - 3) / (AIRCRAFT.span / 2 - 3);
        const x = xLE(s) + 1.2;
        const y = 8.6 - 1.4 * s - 3.4;
        const z = side * zAbs;
        skin.hcyl(x, y - 1.9, z, 1.9, 9, 0, 0xdfe6ee, 18);
        skin.hcyl(x - 5.4, y - 1.55, z, 1.55, 1.8, 0, 0x6b7380, 14);
        skin.box(x + 0.5, y + 1.7, z, 5.5, 2.2, 0.5, 0, 0xc6ced8);
        this.mbs.glowA.hcyl(x + 4.55, y - 2.05, z, 2.05, 0.22, 0, PALETTE.cyan, 18);
        const fb = new MeshBuilder();
        fb.cyl(0, -0.2, 0, 0.45, 0.4, 0xc6ced8, 8);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          fb.beam(0, 0, 0, 0, Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0.16, k & 1 ? 0x3a424d : 0x6b7380);
        }
        const fan = new THREE.Group();
        fan.add(new THREE.Mesh(this._geo(fb), this.mat.skin));
        fan.position.set(x + 4.2, y, z);
        this.group.add(fan);
        this.fans.push({ fan, dir: side });
        const ex = createExhaust({ radius: 1.35, length: 18, core: 0xd6efff, edge: 0x5a7bff, alpha: 1 });
        ex.position.set(x - 6.4, y, z);
        this.group.add(ex);
        this.exhausts.push(ex);
        const sh = createExhaust({ radius: 3.2, length: 34, core: 0xffffff, edge: 0xcfe6ff, alpha: 0.12, segs: 8, ring: 12 });
        sh.position.set(x - 6.4, y, z);
        this.group.add(sh);
        this.shimmer.push(sh);
        this.lights.push({ p: [x + 4.4, y, z], color: PALETTE.cyan, size: 2.4, kind: 3, phase: zAbs });
      }
    }
  }

  // ------------------------------------------------------------------ landing gear (wheel centre sits 0.78 m above the ground)
  _gear() {
    const wheelGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.5, 18).rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.56, 10).rotateX(Math.PI / 2);
    this.disposables.push(wheelGeo, hubGeo);
    const mkLeg = (x, y, z, length, beam, wheelPos) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const sb = new MeshBuilder();
      sb.box(0, -length, 0, 0.5, length, 0.5, 0, 0xb8c0ca);
      const strut = new THREE.Mesh(this._geo(sb), this.mat.skin);
      strut.castShadow = true;
      pivot.add(strut);
      const lower = new THREE.Group();
      lower.position.set(0, -length, 0);
      pivot.add(lower);
      const ab = new MeshBuilder();
      ab.box(0, -0.15, 0, beam, 0.3, 0.3, 0, 0x6b7380);
      lower.add(new THREE.Mesh(this._geo(ab), this.mat.skin));
      for (const [wx, wz] of wheelPos) {
        const w = new THREE.Mesh(wheelGeo, this.mat.rubber);
        w.add(new THREE.Mesh(hubGeo, this.mat.hub));
        w.position.set(wx, 0, wz);
        w.castShadow = true;
        lower.add(w);
        this.wheels.push(w);
      }
      pivot.userData = { lower, strut, strutLen: length };
      this.group.add(pivot);
      return pivot;
    };
    this.noseGear = mkLeg(27, 3.4, 0, 2.62, 1.6, [[0, -0.55], [0, 0.55]]);
    this.mainGears = [];
    for (const s of [-1, 1]) for (const x of [-5, 4]) this.mainGears.push({ side: s, pivot: mkLeg(x, 3.3, s * 5.4, 2.52, 4.6, [[-1.6, 0], [0, 0], [1.6, 0]]) });
  }

  // ------------------------------------------------------------------ rear ramp + upper rear door
  _ramp() {
    const L = AIRCRAFT.rampLength;
    const W = AIRCRAFT.rampWidth;
    const hinge = new THREE.Group();
    hinge.position.set(AIRCRAFT.rampHingeX, AIRCRAFT.floorY, 0);
    const rb = new MeshBuilder();
    rb.box(-L / 2, -0.3, 0, L, 0.3, W, 0, 0x3b4551);
    for (let k = 0; k < 10; k++) rb.box(-1 - k * 1.0, 0, 0, 0.18, 0.1, W - 0.6, 0, 0x4a5563);
    for (const s of [-1, 1]) rb.box(-L / 2, 0, s * (W / 2 - 0.15), L, 0.12, 0.3, 0, 0xffc72e);
    rb.box(-L + 0.1, -0.3, 0, 0.3, 0.32, W, 0, 0xffc72e);
    const rm = new THREE.Mesh(this._geo(rb), this.mat.inner);
    rm.name = 'rampPanel';
    hinge.add(rm);
    const edge = new THREE.Object3D();
    edge.name = 'Anchor_RampEnd';
    edge.position.set(-L, 0, 0);
    hinge.add(edge);
    this.group.add(hinge);
    this.ramp = hinge;
    this.rampEnd = edge;
    const door = new THREE.Group();
    door.position.set(-41.2, 10.2, 0);
    const db = new MeshBuilder();
    db.box(-0.15, -6.2, 0, 0.3, 6.2, 6.4, 0, 0xe9eef4);
    db.box(-0.2, -6.0, 0, 0.1, 0.4, 6.0, 0, PALETTE.coral);
    const dm = new THREE.Mesh(this._geo(db), this.mat.skin);
    dm.castShadow = true;
    door.add(dm);
    this.group.add(door);
    this.rearDoor = door;
  }

  // ------------------------------------------------------------------ lights
  _lightsSetup() {
    const L = this.lights;
    L.push({ p: [-12.5, 7.0, -43.6], color: 0xff3a3a, size: 1.4, kind: 0 }, { p: [-12.5, 7.0, 43.6], color: 0x4dff88, size: 1.4, kind: 0 });
    L.push({ p: [-42, 24.6, 0], color: 0xffffff, size: 1.4, kind: 0 });
    L.push({ p: [-13, 7.2, -43.6], color: 0xffffff, size: 2.2, kind: 2, phase: 0.1 }, { p: [-13, 7.2, 43.6], color: 0xffffff, size: 2.2, kind: 2, phase: 0.6 }, { p: [-43.5, 24.5, 0], color: 0xffffff, size: 2.2, kind: 2, phase: 0.35 });
    L.push({ p: [0, 2.0, 0], color: 0xff3a3a, size: 2, kind: 4, phase: 0 });
    for (const x of [5, -3, -12]) for (const s of [-1, 1]) L.push({ p: [x, 6.3, s * 5.05], color: PALETTE.cyan, size: 0.7, kind: 1, phase: x * 3 });
    this.navLights = new LightPoints(L, { name: 'aircraftLights' });
    this.group.add(this.navLights.points);
    this.landingLights = new LightPoints([
      { p: [30, 3.0, -1.1], color: 0xfff6dc, size: 3.4 }, { p: [30, 3.0, 1.1], color: 0xfff6dc, size: 3.4 },
      { p: [-4, 7.6, -9], color: 0xfff6dc, size: 3.0 }, { p: [-4, 7.6, 9], color: 0xfff6dc, size: 3.0 }
    ], { name: 'landingLights' });
    this.group.add(this.landingLights.points);
    const lamp = new THREE.Group();
    lamp.position.set(-29.4, 8.1, 0);
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.mat.red);
    lr.position.z = -0.35;
    const lg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.mat.green);
    lg.position.z = 0.35;
    lamp.add(lr, lg);
    this.group.add(lamp);
    this.jumpLamp = { red: lr, green: lg };
    this.setJumpLight('off');
    if (this.cfg.interiorLights) {
      this.bayLight = new THREE.PointLight(0xdfeaff, 0, 34, 1.4);
      this.bayLight.position.set(-8, 7.4, 0);
      this.bayLight2 = new THREE.PointLight(0xdfeaff, 0, 30, 1.4);
      this.bayLight2.position.set(8, 7.4, 0);
      this.group.add(this.bayLight, this.bayLight2);
    }
    this.smoke = new ParticleSystem({ max: 120, drag: 0.9, name: 'tireSmoke' });
  }

  // ------------------------------------------------------------------ named anchors for the future character integration
  _anchors() {
    const add = (name, pos) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(...pos);
      this.group.add(o);
      this.anchors[name] = o;
      return o;
    };
    const slots = new THREE.Group();
    slots.name = 'Anchor_BoardingSlots';
    this.group.add(slots);
    this.anchors.boardingSlots = slots;
    this.boardingSlots = [];
    for (const s of this.seatSlots) {
      const o = new THREE.Object3D();
      o.name = `Seat_${s.side < 0 ? 'L' : 'R'}_${String(s.index).padStart(2, '0')}`;
      o.position.set(...s.pos);
      o.rotation.y = s.yaw;
      o.userData = { type: 'seat', side: s.side, index: s.index };
      slots.add(o);
      this.boardingSlots.push(o);
    }
    for (const s of this.standSlots) {
      const o = new THREE.Object3D();
      o.name = `Stand_${String(s.index).padStart(2, '0')}`;
      o.position.set(...s.pos);
      o.rotation.y = -Math.PI / 2;
      o.userData = { type: 'stand', index: s.index };
      slots.add(o);
      this.boardingSlots.push(o);
    }
    add('Anchor_RampTop', [AIRCRAFT.rampHingeX, AIRCRAFT.floorY, 0]);
    this.anchors.rampEnd = this.rampEnd;
    add('Anchor_JumpPoint', [-30, AIRCRAFT.floorY + 0.1, 0]);
    add('Anchor_CockpitCam', [31.5, 6.4, 0.2]);
    add('Anchor_BayCam', [13, 5.6, 0]);
    add('Anchor_BayCamLook', [-34, 4.4, 0]);
    add('Anchor_WindowCam_R', [-2, 5.4, 3.9]);
    add('Anchor_WindowCam_L', [-2, 5.4, -3.9]);
    add('Anchor_RearCam', [-60, 5.5, 8]);
    add('Anchor_Tail', [-44, 18, 0]);
  }

  // ------------------------------------------------------------------ state setters
  setGear(g) {
    this.state.gear = g;
    const k = (1 - g) * Math.PI * 0.48;
    this.noseGear.rotation.z = -k;
    for (const m of this.mainGears) m.pivot.rotation.x = m.side * k;
    this.landingLights.setMaster(g > 0.5 && this._landingOn !== 0 ? 1 : 0);
    this.noseGear.visible = g > 0.02;
    for (const m of this.mainGears) m.pivot.visible = g > 0.02;
  }
  setGearCompression(main, nose) {
    const apply = (p, c) => {
      const u = p.userData;
      const k = clamp01(c);
      u.lower.position.y = -u.strutLen + k * 0.45;
      u.strut.scale.y = 1 - k * 0.12;
    };
    for (const m of this.mainGears) apply(m.pivot, main);
    apply(this.noseGear, nose);
  }
  setFlaps(f) {
    this.state.flaps = f;
    for (const p of this.flaps) p.rotation.z = f * 0.62;
  }
  setRamp(r) {
    this.state.ramp = r;
    this.ramp.rotation.z = lerp(-0.6, Math.asin(AIRCRAFT.floorY / AIRCRAFT.rampLength), r);
  }
  setRearDoor(r) {
    this.state.rearDoor = r;
    this.rearDoor.rotation.z = -r * 1.66;
  }
  setThrottle(p) {
    this.state.throttle = p;
    for (const e of this.exhausts) setExhaust(e, p > 0.05 ? clamp01((p - 0.05) / 0.95) : 0);
    for (const e of this.shimmer) setExhaust(e, clamp01((p - 0.25) / 0.75) * 0.7);
  }
  setInteriorLights(l) {
    this.state.interior = l;
    this.mat.glowInt.color.setScalar(lerp(0.1, 1, l));
    this.mat.inner.color.setScalar(lerp(0.42, 1, l));
    if (this.bayLight) { this.bayLight.intensity = 90 * l; this.bayLight2.intensity = 70 * l; }
  }
  setJumpLight(mode) {
    this.jumpLamp.red.visible = mode === 'red';
    this.jumpLamp.green.visible = mode === 'green';
  }
  setLandingLights(on) {
    this._landingOn = on ? 1 : 0;
    this.landingLights.setMaster(on && this.state.gear > 0.5 ? 1 : 0);
  }
  addWheelDistance(d) { this.state.wheelAngle += d / 0.78; }

  emitTireSmoke(count = 24) {
    const wp = new THREE.Vector3();
    for (const m of this.mainGears) {
      for (let k = 0; k < count / 4; k++) {
        wp.set(m.pivot.position.x + (Math.random() - 0.5) * 3, 0.2, m.pivot.position.z);
        this.group.localToWorld(wp);
        this.smoke.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 3 - 6, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 2.4 + Math.random(), 1.2, 7 + Math.random() * 3, 0xe8ecf2, 0.5);
      }
    }
  }

  update(dt) {
    const spin = (4 + this.state.throttle * 70) * dt;
    for (const f of this.fans) f.fan.rotation.x += spin * f.dir;
    for (const w of this.wheels) w.rotation.z = this.state.wheelAngle;
    this.smoke.update(dt);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose?.());
    this.group.traverse((o) => { o.material?.map?.dispose?.(); });
  }
}
