// INKFORGE — the aircraft carrier: hull, flight deck, runway, staging apron, hangar, command island,
// lights, screens and ambient animation. Built procedurally (merged vertex-coloured meshes).

import * as THREE from 'three';
import { MeshBuilder } from '../../maps/splatIsland/meshBuilder.js';
import { mulberry32 } from '../../maps/splatIsland/noise.js';
import { DECK, PALETTE, CARRIER_ORIGIN } from './constants.js';
import { LightPoints, ParticleSystem, createExhaust, setExhaust, textPlane, canvasTexture, lerp } from './effects.js';
import { ScreenPanel } from './screens.js';

const D = DECK.y;
const xf = MeshBuilder.xf;

// Deck half-width along the ship (rounded bow, slightly narrower stern).
export function deckHalfWidth(x) {
  const L = DECK.halfLength;
  if (x > 340) {
    const t = Math.min(1, (x - 340) / (L - 340));
    return DECK.halfWidth * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.6);
  }
  if (x < -440) {
    const t = Math.min(1, (-x - 440) / (L - 440));
    return DECK.halfWidth * (1 - 0.18 * t * t);
  }
  return DECK.halfWidth;
}

function makeDeckTexture() {
  const { texture } = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4b5461';
    ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const v = 60 + rnd() * 60;
      ctx.fillStyle = `rgba(${v},${v + 6},${v + 14},0.35)`;
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(15,20,26,0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,26,34,0.8)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [ox, oy] of [[10, 10], [118, 10], [10, 118], [118, 118]]) { ctx.beginPath(); ctx.arc(i * 128 + ox, j * 128 + oy, 2.2, 0, 7); ctx.fill(); }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export class InkforgeCarrier {
  constructor({ quality = 'medium', qualityCfg } = {}) {
    this.quality = quality;
    this.cfg = qualityCfg;
    this.group = new THREE.Group();
    this.group.name = 'InkforgeCarrier';
    this.group.position.set(CARRIER_ORIGIN.x, CARRIER_ORIGIN.y, CARRIER_ORIGIN.z);
    this.anchors = {};
    this.screens = {};
    this.animated = [];
    this.disposables = [];
    this.spawnPoints = [];
    this.lightItems = [];
    this.rand = mulberry32(2026);
    this._mats();
    this._build();
  }

  // ------------------------------------------------------------------ materials & builders
  _mats() {
    const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    this.mat = {
      metal: std({ roughness: 0.48, metalness: 0.45 }),
      matte: std({ roughness: 0.88, metalness: 0.05 }),
      glass: std({ roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.5 }),
      decal: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      glowA: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glowB: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glowC: new THREE.MeshBasicMaterial({ vertexColors: true }),
      deck: new THREE.MeshStandardMaterial({ map: makeDeckTexture(), color: 0xe6ecf2, roughness: 0.86, metalness: 0.08 })
    };
    this.mb = { metal: new MeshBuilder(), matte: new MeshBuilder(), glass: new MeshBuilder(), decal: new MeshBuilder(), glowA: new MeshBuilder(), glowB: new MeshBuilder(), glowC: new MeshBuilder() };
    Object.values(this.mat).forEach((m) => this.disposables.push(m));
  }

  _flush() {
    for (const [k, b] of Object.entries(this.mb)) {
      if (!b.vertexCount) continue;
      const a = b.toArrays();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
      g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
      g.setIndex(new THREE.BufferAttribute(a.indices, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat[k]);
      m.name = 'carrier_' + k;
      if (k === 'metal' || k === 'matte') { m.castShadow = true; m.receiveShadow = true; }
      if (k === 'decal') m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(g);
    }
  }

  // flat helpers ------------------------------------------------
  dq(cx, cz, w, d, rot, hex, y = D + 0.03, layer = 'decal') {
    const mb = this.mb[layer];
    const col = MeshBuilder.rgb(hex);
    const P = (lx, lz) => xf(cx, cz, rot, lx, y, lz);
    mb.quad(P(-w / 2, -d / 2), P(-w / 2, d / 2), P(w / 2, d / 2), P(w / 2, -d / 2), col);
  }
  line(x0, z0, x1, z1, w, hex, y = D + 0.04, layer = 'decal') {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * (w / 2);
    const nz = (dx / l) * (w / 2);
    const col = MeshBuilder.rgb(hex);
    const p = [[x0 - nx, z0 - nz], [x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz]];
    const A = (q) => [q[0], y, q[1]];
    const ny = (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]);
    if (ny >= 0) this.mb[layer].quad(A(p[0]), A(p[1]), A(p[2]), A(p[3]), col);
    else this.mb[layer].quad(A(p[3]), A(p[2]), A(p[1]), A(p[0]), col);
  }
  flatTri(a, b, c, hex, y = D + 0.05) {
    const col = MeshBuilder.rgb(hex);
    const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    const A = (q) => [q[0], y, q[1]];
    if (ny >= 0) this.mb.decal.tri(A(a), A(b), A(c), col);
    else this.mb.decal.tri(A(a), A(c), A(b), col);
  }
  arrow(cx, cz, len, wid, hex) {
    this.dq(cx - len * 0.2, cz, len * 0.6, wid * 0.28, 0, hex, D + 0.05);
    this.flatTri([cx + len * 0.1, cz - wid / 2], [cx + len * 0.1, cz + wid / 2], [cx + len * 0.5, cz], hex);
  }
  splat(cx, cz, r, hex) {
    const n = 14;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = i % 3 === 0 ? 1.6 + this.rand() * 0.8 : 0.7 + this.rand() * 0.5;
      pts.push([cx + Math.cos(a) * r * k, cz + Math.sin(a) * r * k]);
    }
    for (let i = 0; i < n; i++) this.flatTri([cx, cz], pts[i], pts[(i + 1) % n], hex, D + 0.045);
    for (let i = 0; i < 4; i++) this.dq(cx + (this.rand() - 0.5) * r * 5, cz + (this.rand() - 0.5) * r * 5, r * 0.35, r * 0.35, this.rand() * 3, hex, D + 0.045);
  }
  light(x, y, z, color, size = 0.8, kind = 0, phase = 0) { this.lightItems.push({ p: [x, y, z], color, size, kind, phase }); }
  box(layer, cx, y0, cz, sx, sy, sz, hex, rot = 0) { this.mb[layer].box(cx, y0, cz, sx, sy, sz, rot, hex); }

  // ------------------------------------------------------------------ build
  _build() {
    this._hull();
    this._deck();
    this._runway();
    this._staging();
    this._hangar();
    this._island();
    this._railings();
    this._parking();
    this._equipment();
    this._stern();
    this._poles();
    this._screens();
    this._ambient();
    this._flush();
    this._lights();
    this._anchors();
  }

  _hull() {
    const mb = this.mb.metal;
    const xs = [];
    for (let x = -480; x < 340; x += 20) xs.push(x);
    for (let x = 340; x <= 480; x += 10) xs.push(x);
    const prof = (x) => {
      const w = deckHalfWidth(x);
      const z = (v) => Math.max(0, v);
      return [[w, D], [w, D - 2], [z(w - 6), D - 8], [z(w - 14), 6], [z(w - 22), -1], [z(w - 46), -13], [0, -16]];
    };
    const cols = [0xe8edf2, 0x2a3038, 0x5d6672, 0x1e2329, 0x7a2a30, 0x7a2a30];
    for (let i = 0; i < xs.length - 1; i++) {
      const p0 = prof(xs[i]);
      const p1 = prof(xs[i + 1]);
      const c = [(xs[i] + xs[i + 1]) / 2, 8, 0];
      for (let k = 0; k < 6; k++) {
        for (const s of [1, -1]) {
          mb.qo([xs[i], p0[k][1], s * p0[k][0]], [xs[i + 1], p1[k][1], s * p1[k][0]], [xs[i + 1], p1[k + 1][1], s * p1[k + 1][0]], [xs[i], p0[k + 1][1], s * p0[k + 1][0]], c, MeshBuilder.rgb(cols[k], 0.92 + 0.08 * ((i + k) & 1)));
        }
      }
    }
    // stern transom
    const pr = prof(-480);
    const loop = [...pr.map((p) => [p[0], p[1]]), ...pr.slice().reverse().map((p) => [-p[0], p[1]])];
    for (let k = 0; k < loop.length - 1; k++) {
      mb.qo([-480, loop[k][1], loop[k][0]], [-480, loop[k + 1][1], loop[k + 1][0]], [-480, 6, 0], [-480, 6, 0], [-470, 8, 0], MeshBuilder.rgb(0x474f5a));
    }
    // hull side lettering
    for (const s of [1, -1]) {
      const t = textPlane('IF-01  INKFORGE', 90, 11, { color: '#f2f6fa', px: 150 });
      t.position.set(-180, 15.5, s * (DECK.halfWidth - 8.6));
      t.rotation.y = s > 0 ? 0 : Math.PI;
      this.group.add(t);
    }
  }

  _deck() {
    const xs = [];
    for (let x = -480; x < 340; x += 40) xs.push(x);
    for (let x = 340; x <= 480; x += 10) xs.push(x);
    const pos = [];
    const uv = [];
    const idx = [];
    xs.forEach((x, i) => {
      const w = deckHalfWidth(x);
      pos.push(x, D, -w, x, D, w);
      uv.push(x / 16, -w / 16, x / 16, w / 16);
      if (i < xs.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // computeVertexNormals may flip depending on winding — force +Y normals.
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(g, this.mat.deck);
    m.receiveShadow = true;
    m.name = 'flightDeck';
    this.group.add(m);
    this.disposables.push(g);
    this.deckMesh = m;
    // winding check: ensure the deck faces up (swap if needed)
    const a = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const b = new THREE.Vector3(pos[3], pos[4], pos[5]);
    const c = new THREE.Vector3(pos[6], pos[7], pos[8]);
    const ny = b.clone().sub(a).cross(c.clone().sub(a)).y;
    if (ny < 0) { m.material = this.mat.deck.clone(); m.material.side = THREE.DoubleSide; this.disposables.push(m.material); }
    // paint splats (Tint3d identity)
    const cols = [PALETTE.cyan, PALETTE.coral, PALETTE.magenta, PALETTE.amber];
    for (let i = 0; i < 26; i++) {
      const x = -440 + this.rand() * 880;
      const z = this.rand() < 0.5 ? 74 + this.rand() * 20 - 38 : -96 + this.rand() * 18;
      if (z > -30 && z < 12) continue;
      this.splat(x, z, 1.1 + this.rand() * 1.8, cols[i & 3]);
    }
  }

  _runway() {
    const R = DECK.runwayZ;
    const hw = DECK.runwayHalfWidth;
    this.dq(-7.5, R, 915, hw * 2, 0, 0x30353f, D + 0.03);
    for (const s of [-1, 1]) this.line(-460, R + s * (hw - 1.4), 440, R + s * (hw - 1.4), 0.8, 0xf2f6fa);
    for (let x = -455; x < 440; x += 24) this.line(x, R, x + 12, R, 0.9, 0xffd23a);
    // touchdown zone bars + aiming point
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) this.dq(-300 - k * 38, R + s * 7, 24, 2.2, 0, 0xf2f6fa, D + 0.05);
    for (const s of [-1, 1]) this.dq(-390, R + s * 9, 42, 3.4, 0, 0xf2f6fa, D + 0.05);
    // threshold piano keys + end chevrons
    for (let k = -9; k <= 9; k++) if (k !== 0) this.dq(-453, R + k * 2.1, 14, 1.1, 0, 0xf2f6fa, D + 0.05);
    for (let k = 0; k < 3; k++) this.arrow(-432 - 0 + k * 0, R, 22, 14, k === 1 ? PALETTE.coral : PALETTE.cyan);
    // arrestor wires
    for (const x of [-350, -334, -318, -302]) {
      this.line(x, R - hw + 1, x, R + hw - 1, 0.35, 0x12151a, D + 0.06);
      for (const s of [-1, 1]) this.box('metal', x, D, R + s * (hw - 0.6), 0.7, 0.5, 0.7, 0x80808a);
    }
    // direction arrows
    for (let x = -200; x < 400; x += 64) this.arrow(x, R, 18, 10, ((x + 200) / 64) & 1 ? PALETTE.coral : PALETTE.cyan);
    // catapult tracks + shuttle
    for (const s of [-1, 1]) {
      this.line(DECK.berthX - 20, R + s * 2.6, 445, R + s * 2.6, 0.5, 0x0d0f13, D + 0.06);
    }
    this.box('metal', DECK.berthX - 22, D, R, 2.4, 0.4, 5.4, 0xffb42e);
    for (let x = DECK.berthX; x < 440; x += 20) { this.light(x, D + 0.3, R - 3.6, 0x66ff99, 0.5, 1, x); this.light(x, D + 0.3, R + 3.6, 0x66ff99, 0.5, 1, x); }
    // jet blast deflector (animated)
    const pivot = new THREE.Group();
    pivot.position.set(16, D + 0.05, R);
    const dm = new MeshBuilder();
    dm.box(-7, 0, 0, 14, 0.5, 40, 0, 0x7f8794);
    for (let k = 0; k < 6; k++) dm.box(-12 + k * 2.2, 0.5, 0, 0.4, 0.9, 40, 0, 0xffd23a);
    dm.box(-7, -0.3, 0, 14.4, 0.3, 40.6, 0, 0x23272e);
    const dg = this._geo(dm);
    const dmesh = new THREE.Mesh(dg, this.mat.metal);
    dmesh.castShadow = true;
    pivot.add(dmesh);
    this.group.add(pivot);
    this.deflector = pivot;
    // runway edge / centreline lights
    for (let x = -460; x <= 440; x += 12) {
      this.light(x, D + 0.3, R - hw + 0.4, 0xffffff, 0.6);
      this.light(x, D + 0.3, R + hw - 0.4, 0xffffff, 0.6);
      this.light(x, D + 0.3, R, x < -250 ? 0xfff2c4 : 0xdfeaff, 0.55, 1, x + 460);
    }
    for (let z = R - hw; z <= R + hw; z += 3) { this.light(-458, D + 0.3, z, 0x4dff88, 0.7); this.light(444, D + 0.3, z, 0xff4a4a, 0.7); }
    // optical landing system (meatball) on the port side
    for (let k = 0; k < 5; k++) this.light(-300, D + 1.2 + k * 1.1, -84, 0xffb42e, 0.9, 3, k);
    for (let k = -3; k <= 3; k++) this.light(-300 + k * 1.6, D + 3.4, -84, 0x66ff99, 0.7, 3, 0);
    this.box('metal', -300, D, -84, 5, 1, 1.4, 0x2a3038);
    this.box('metal', -300, D + 1, -84, 0.5, 6.6, 0.5, 0x2a3038);
  }

  _staging() {
    const a = DECK.apron;
    const cx = (a.x0 + a.x1) / 2;
    const cz = (a.z0 + a.z1) / 2;
    this.dq(cx, cz, a.x1 - a.x0, a.z1 - a.z0, 0, 0x5a6573, D + 0.03);
    const rim = 1.0;
    for (const [x0, z0, x1, z1] of [[a.x0, a.z0, a.x1, a.z0], [a.x0, a.z1, a.x1, a.z1], [a.x0, a.z0, a.x0, a.z1], [a.x1, a.z0, a.x1, a.z1]]) this.line(x0, z0, x1, z1, rim, PALETTE.cyan, D + 0.06);
    for (const [x, z, sx, sz] of [[a.x0, a.z0, 1, 1], [a.x1, a.z0, -1, 1], [a.x0, a.z1, 1, -1], [a.x1, a.z1, -1, -1]]) {
      this.line(x, z, x + sx * 9, z, 2, PALETTE.amber, D + 0.07);
      this.line(x, z, x, z + sz * 9, 2, PALETTE.amber, D + 0.07);
    }
    for (let x = a.x0; x <= a.x1; x += 5) this.light(x, D + 0.3, a.z0, PALETTE.cyan, 0.6);
    // spawn pads (25 columns x 4 rows = 100 slots)
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 25; i++) {
        const x = -124 + i * 6;
        const z = 20 + j * 11.5;
        this.dq(x, z, 2.6, 2.6, 0, PALETTE.cyan, D + 0.05);
        this.dq(x, z, 2.1, 2.1, 0, 0x2a323d, D + 0.055);
        this.spawnPoints.push([x, D, z]);
      }
    }
    // boarding lane from the apron to the ramp
    const rx = DECK.berthX - 49.5;
    const rz = DECK.runwayZ;
    this.line(rx - 3, a.z0, rx, rz + 6, 7, 0x3b4452, D + 0.045);
    this.line(rx - 3 - 3.4, a.z0, rx - 3.4, rz + 6, 0.5, PALETTE.amber, D + 0.06);
    this.line(rx - 3 + 3.4, a.z0, rx + 3.4, rz + 6, 0.5, PALETTE.amber, D + 0.06);
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const px = lerp(rx - 3, rx, t);
      const pz = lerp(a.z0 - 2, rz + 10, t);
      this.arrow(px, pz, 8, 5, PALETTE.amber);
      this.light(px - 3.5, D + 0.3, pz, PALETTE.amber, 0.6, 1, k * 14);
      this.light(px + 3.5, D + 0.3, pz, PALETTE.amber, 0.6, 1, k * 14);
    }
    // deck lettering
    const lab = textPlane('STAGING AREA', 70, 9, { color: '#20d8e9', px: 170 });
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(cx - 8, D + 0.08, cz + 17);
    this.group.add(lab);
    const lab2 = textPlane('BOARD HERE  ▶', 40, 5, { color: '#ffb42e', px: 150 });
    lab2.rotation.x = -Math.PI / 2;
    lab2.rotation.z = -0.1;
    lab2.position.set(rx - 8, D + 0.08, a.z0 - 8);
    this.group.add(lab2);
    const rw = textPlane('INKFORGE', 150, 22, { color: 'rgba(242,246,250,0.9)', px: 190 });
    rw.rotation.x = -Math.PI / 2;
    rw.position.set(-170, D + 0.07, -52);
    this.group.add(rw);
  }

  _hangar() {
    const H = DECK.hangar;
    const hx = (H.x0 + H.x1) / 2;
    const hw = H.x1 - H.x0;
    const hz = (H.z0 + H.z1) / 2;
    this.box('metal', hx, D, hz, hw, H.h, H.z1 - H.z0, 0x6d7885);
    this.box('metal', hx, D + H.h, hz, hw + 1, 0.8, H.z1 - H.z0 + 1, 0x4a525e);
    for (let k = 0; k < 5; k++) {
      const xc = -272 + k * 80;
      this.box('matte', xc, D, H.z0 - 0.35, 64, 14, 0.7, 0x232a33);
      for (let s = 0; s < 32; s++) this.box('decal', xc - 32 + s * 2 + 0.5, D + 14, H.z0 - 0.75, 1, 1.4, 0.2, s & 1 ? 0x17191d : 0xffc72e);
      for (const s of [-1, 1]) this.box('glowB', xc + s * 31.6, D, H.z0 - 0.8, 0.5, 14, 0.2, PALETTE.cyan);
      this.box('glowB', xc, D + 14.2, H.z0 - 0.8, 63, 0.35, 0.2, PALETTE.cyan);
      for (let s = -3; s <= 3; s++) this.box('metal', xc + s * 8, D, H.z0 - 0.75, 0.5, 14, 0.2, 0x3a424d);
      this.light(xc, D + 15.8, H.z0 - 1.2, 0x7dff9a, 1.4, 3, k);
      this.light(xc - 32, D + 15.8, H.z0 - 1.2, 0xff9a2e, 1.2, 4, k);
      this.light(xc + 32, D + 15.8, H.z0 - 1.2, 0xff9a2e, 1.2, 4, k + 0.5);
      const t = textPlane(`HANGAR ${k + 1}`, 14, 2.2, { color: '#ffffff', px: 150 });
      t.position.set(xc, D + 16.6, H.z0 - 0.9);
      t.rotation.y = Math.PI;
      this.group.add(t);
    }
    // roof equipment
    const r = this.rand;
    for (let k = 0; k < 14; k++) this.box('metal', H.x0 + 20 + k * 28, D + H.h + 0.8, hz + (r() - 0.5) * 14, 6 + r() * 4, 2.2, 5 + r() * 3, 0x5b6470);
    for (let k = 0; k < 6; k++) { const x = H.x0 + 30 + k * 66; this.box('metal', x, D + H.h + 0.8, hz + 8, 0.5, 14 + r() * 6, 0.5, 0x8a929d); this.light(x, D + H.h + 15, hz + 8, 0xff3a3a, 1.2, 2, k * 0.17); }
    // ops wall support (screen added in _screens)
    for (const x of [-148, -72]) this.box('metal', x, D + H.h + 0.8, H.z0 + 1.5, 2, 4, 2, 0x4a525e);
    this.box('metal', -110, D + 21, H.z0 + 0.4, 80, 21, 1.2, 0x1b2129);
    this.box('glowB', -110, D + 20.6, H.z0 - 0.4, 80, 0.4, 0.3, PALETTE.cyan);
    this.box('glowB', -110, D + 41.2, H.z0 - 0.4, 80, 0.4, 0.3, PALETTE.cyan);
    this.hangarFrontZ = H.z0;
  }

  _island() {
    const I = DECK.island;
    const cx = (I.x0 + I.x1) / 2;
    const w = I.x1 - I.x0;
    this.box('metal', cx, D, 83, w, 22, 34, 0x66717f);
    this.box('metal', cx - 6, D + 22, 86, w - 28, 18, 26, 0x5a6471);
    this.box('metal', cx - 6, D + 40, 87, w - 22, 9, 24, 0x6d7885);
    for (let k = 0; k < 8; k++) this.box('glass', cx - 6 - 27 + k * 7.6, D + 41, 74.8, 6.4, 5.5, 0.6, 0x9ad9ee);
    this.box('glowA', cx - 6, D + 46.6, 74.6, w - 22, 0.45, 0.3, PALETTE.cyan);
    for (let k = 0; k < 6; k++) this.box('glass', cx - 6 - 18 + k * 7.2, D + 28, 72.9, 5, 3, 0.5, 0x7fb7d6);
    this.box('metal', cx - 6, D + 49, 88, 22, 6, 12, 0x4a525e);
    this.box('metal', cx - 6, D + 55, 88, 3, 24, 3, 0x8a929d);
    this.light(cx - 6, D + 79.5, 88, 0xff3a3a, 1.6, 2, 0.3);
    // comms mast and dishes
    this.box('metal', cx + 26, D + 49, 90, 1.4, 30, 1.4, 0x9aa3ae);
    this.mb.metal.blob(cx + 26, D + 66, 90, 4, 1.4, 4, 0xe8edf2, this.rand, 0.02, 1);
    this.light(cx + 26, D + 80, 90, 0xffffff, 1.2, 2, 0.6);
    // CIWS pods
    for (const [x, z] of [[I.x0 + 6, 70], [I.x1 - 6, 70], [I.x0 + 6, 96], [I.x1 - 6, 96]]) {
      this.mb.metal.cyl(x, D + 22, z, 3.2, 1.4, 0x3a424d, 10);
      this.mb.metal.blob(x, D + 24.8, z, 2.6, 2, 2.6, 0xaab2bd, this.rand, 0.03, 1);
      this.mb.metal.hcyl(x + 1.6, D + 24.3, z, 0.3, 4.4, 0.2, 0x2a3038, 6);
    }
    // paint tanks: Tint3d ink reservoirs with glowing colour
    const tankCols = [PALETTE.cyan, PALETTE.magenta, PALETTE.amber];
    tankCols.forEach((c, i) => {
      const x = I.x0 + 12 + i * 14;
      this.mb.glass.cyl(x, D, 62, 5, 26, 0xbfe6f2, 14);
      this.mb.glowB.cyl(x, D + 0.5, 62, 3.8, 18 + (i % 2) * 4, c, 12);
      this.box('metal', x, D + 26, 62, 11, 1.2, 11, 0x4a525e);
      this.box('metal', x, D, 62, 11, 1.2, 11, 0x4a525e);
    });
    // radar (animated)
    const radar = new THREE.Group();
    const rb = new MeshBuilder();
    rb.box(0, 0, 0, 14, 4, 1.2, 0, 0xd8dee6);
    rb.box(0, -1.2, 0, 1, 1.4, 1, 0, 0x4a525e);
    rb.box(0, 0, -2.5, 5, 1, 4, 0, 0x4a525e);
    const rm = new THREE.Mesh(this._geo(rb), this.mat.metal);
    radar.add(rm);
    radar.position.set(cx - 6, D + 80, 88);
    this.group.add(radar);
    this.animated.push((dt) => { radar.rotation.y += dt * 1.1; });
    // signage
    const sign = textPlane('INKFORGE', 70, 9, { color: '#ffb42e', px: 190 });
    sign.position.set(cx, D + 33.5, 65.6);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    const num = textPlane('01', 16, 12, { color: '#f2f6fa', px: 220 });
    num.position.set(I.x1 + 0.2, D + 12, 82);
    num.rotation.y = Math.PI / 2;
    this.group.add(num);
    this.islandCenter = [cx, 83];
  }

  _railings() {
    const mb = this.mb.metal;
    const xs = [];
    for (let x = -470; x <= 470; x += 10) xs.push(x);
    for (const s of [-1, 1]) {
      let prev = null;
      for (const x of xs) {
        const z = s * (deckHalfWidth(x) - 1.0);
        mb.box(x, D, z, 0.14, 1.15, 0.14, 0, 0xd7dde4);
        if (prev) {
          mb.beam(prev[0], D + 0.6, prev[1], x, D + 0.6, z, 0.07, 0xd7dde4);
          mb.beam(prev[0], D + 1.12, prev[1], x, D + 1.12, z, 0.09, 0xffd23a);
        }
        prev = [x, z];
      }
      prev = null;
      for (let x = -480; x <= 480; x += 6) {
        const z = s * (deckHalfWidth(x) - 0.6);
        if (prev) this.mb.glowA.beam(prev[0], D + 0.12, prev[1], x, D + 0.12, z, 0.45, s < 0 ? PALETTE.cyan : PALETTE.coral);
        prev = [x, z];
        if ((x + 480) % 12 === 0) this.light(x, D + 0.5, z, s < 0 ? PALETTE.cyan : PALETTE.coral, 0.7, 1, x + 480);
      }
    }
    // stairs and access hatches
    for (const [x, s] of [[-330, -1], [-60, 1], [250, -1], [390, 1]]) {
      const z0 = s * (deckHalfWidth(x) - 1);
      for (let k = 0; k < 8; k++) this.box('metal', x, D - 0.8 - k * 0.7, z0 + s * (0.6 + k * 0.6), 2.4, 0.2, 0.7, 0x8a929d);
    }
    for (let k = 0; k < 10; k++) this.box('metal', -300 + k * 65, D, -92, 4, 0.2, 4, 0x2a3038);
  }

  _geo(builder) {
    const a = builder.toArrays();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
    g.setIndex(new THREE.BufferAttribute(a.indices, 1));
    g.computeBoundingSphere();
    this.disposables.push(g);
    return g;
  }

  _parking() {
    const p = DECK.parking;
    this.line(p.x0, p.z0, p.x1, p.z0, 0.5, PALETTE.amber, D + 0.05);
    this.line(p.x0, p.z1, p.x1, p.z1, 0.5, PALETTE.amber, D + 0.05);
    for (let k = 0; k <= 5; k++) this.line(p.x0 + k * 60, p.z0, p.x0 + k * 60, p.z1, 0.5, PALETTE.amber, D + 0.05);
    for (let k = 0; k < 4; k++) {
      const x = p.x0 + 30 + k * 60 + (k === 2 ? 60 : 0);
      this._skiffSimple(x, 34, -Math.PI / 2 + 0.0);
    }
    const t = textPlane('PARKING — SKIFFS', 40, 4, { color: '#ffb42e', px: 150 });
    t.rotation.x = -Math.PI / 2;
    t.position.set(270, D + 0.08, 15);
    this.group.add(t);
  }

  // small parked VTOL skiff: fuselage, delta wings, twin tails, canopy
  _skiffSimple(x, z, rot) {
    const mb = this.mb.metal;
    const P = (lx, y, lz) => xf(x, z, rot, lx, y, lz);
    mb.box(x, D + 0.9, z, 14, 1.8, 2.6, rot, 0x9aa5b1);
    const nose = P(7.4, D + 1.8, 0);
    mb.cone(nose[0], D + 0.9, nose[2], 1.3, 0.2, 0x9aa5b1, 6);
    const col = MeshBuilder.rgb(0x7c8794);
    mb.tri(P(3, D + 1.4, 1.3), P(-3, D + 1.4, 8), P(-5, D + 1.4, 1.3), col);
    mb.tri(P(3, D + 1.4, -1.3), P(-5, D + 1.4, -1.3), P(-3, D + 1.4, -8), col);
    for (const s of [-1, 1]) {
      const q = P(-5.4, 0, s * 1.6);
      mb.box(q[0], D + 1.8, q[2], 2.6, 2.6, 0.25, rot, PALETTE.coral);
    }
    const c = P(2.4, 0, 0);
    this.mb.glass.box(c[0], D + 1.8, c[2], 3.6, 1.1, 1.6, rot, 0x9ad9ee);
    for (const s of [-1, 1]) {
      const e = P(-7.2, 0, s * 0.8);
      this.mb.glowA.box(e[0], D + 1.0, e[2], 0.5, 0.9, 0.7, rot, PALETTE.cyan);
    }
    for (const s of [-1, 1]) for (const lx of [3, -3]) { const w = P(lx, 0, s * 1.2); mb.cyl(w[0], D, w[2], 0.35, 0.9, 0x23272e, 6); }
  }

  _equipment() {
    const mb = this.mb.metal;
    const cols = [0xe4572e, 0x29a0b1, 0xf2b134, 0x6c5ce7, 0x3fa34d, 0xd6336c, 0x1c7ed6];
    for (let i = 0; i < 14; i++) {
      const x = -330 + (i % 7) * 13.2;
      const z = -93 + Math.floor(i / 7) * 3;
      const stack = 1 + Math.floor(this.rand() * 3);
      for (let s = 0; s < stack; s++) mb.box(x, D + s * 2.6, z, 12, 2.5, 2.5, 0, cols[(i + s) % 7]);
    }
    // ground support near the berth: power carts, fuel bowser
    mb.box(DECK.berthX + 12, D, -22, 3, 1.6, 1.8, 0.3, 0xffb42e);
    mb.box(DECK.berthX + 18, D, -26, 5, 2.2, 2.4, 0.1, 0xe4572e);
    mb.hcyl(DECK.berthX + 28, D + 0.4, -20, 1.2, 6, 0.2, 0xdfe3ea, 10);
    // tow tractors (animated patrol)
    for (let k = 0; k < 2; k++) {
      const b = new MeshBuilder();
      b.box(0, 0.5, 0, 4.2, 1.2, 2.2, 0, k ? 0x29a0b1 : 0xffb42e);
      b.box(-0.6, 1.7, 0, 2, 1.2, 2, 0, 0x2a3038);
      b.cyl(1.4, 0, 1.2, 0.5, 0.5, 0x15181d, 8);
      b.cyl(1.4, 0, -1.2, 0.5, 0.5, 0x15181d, 8);
      b.cyl(-1.4, 0, 1.2, 0.5, 0.5, 0x15181d, 8);
      b.cyl(-1.4, 0, -1.2, 0.5, 0.5, 0x15181d, 8);
      b.box(-4.2, 0.4, 0, 3.4, 1.2, 2.2, 0, 0x8a929d);
      const m = new THREE.Mesh(this._geo(b), this.mat.metal);
      m.castShadow = true;
      m.position.set(-250 + k * 120, D, 62);
      this.group.add(m);
      const speed = 3.2 + k;
      let dir = 1;
      this.animated.push((dt) => {
        m.position.x += dir * speed * dt;
        if (m.position.x > 80) dir = -1;
        if (m.position.x < -300) dir = 1;
        m.rotation.y = dir > 0 ? 0 : Math.PI;
      });
    }
    // windsock
    const pole = new MeshBuilder();
    pole.cyl(0, 0, 0, 0.12, 7, 0xd7dde4, 6);
    const poleMesh = new THREE.Mesh(this._geo(pole), this.mat.metal);
    poleMesh.position.set(150, D, 40);
    this.group.add(poleMesh);
    const sockB = new MeshBuilder();
    for (let k = 0; k < 4; k++) sockB.cyl(k * 0.9, -0.6 + k * 0.0, 0, 0.7 - k * 0.12, 0.9, k & 1 ? 0xffffff : 0xff7a2e, 8, 0.6 - k * 0.12);
    const sock = new THREE.Mesh(this._geo(sockB), this.mat.matte);
    sock.position.set(150, D + 6.8, 40);
    sock.rotation.z = Math.PI / 2;
    this.group.add(sock);
    this.animated.push((dt, t) => { sock.rotation.y = Math.sin(t * 0.7) * 0.25 + 0.3; sock.rotation.x = Math.sin(t * 3.1) * 0.05; });
    // deck crane (slow swing)
    const crane = new THREE.Group();
    const cb = new MeshBuilder();
    cb.box(0, 0, 0, 5, 4, 5, 0, 0x4a525e);
    cb.box(0, 4, 0, 2, 12, 2, 0, 0xffb42e);
    cb.beam(0, 14, 0, 22, 18, 0, 1.2, 0xffb42e);
    cb.beam(22, 18, 0, 22, 8, 0, 0.12, 0x2a3038);
    const cm = new THREE.Mesh(this._geo(cb), this.mat.metal);
    cm.castShadow = true;
    crane.add(cm);
    crane.position.set(-380, D, 94);
    this.group.add(crane);
    this.animated.push((dt, t) => { crane.rotation.y = Math.sin(t * 0.12) * 0.9 - 0.8; });
  }

  _stern() {
    this.thrusters = [];
    for (const z of [-68, -28, 28, 68]) {
      this.mb.metal.hcyl(-492, 1, z, 9, 26, 0, 0x4a525e, 16);
      this.mb.metal.hcyl(-480, 1.8, z, 9.6, 3, 0, 0x2a3038, 16);
      this.mb.glowA.cyl(-505.2, 1, z, 0.1, 0.1, PALETTE.cyan, 3);
      const rg = new MeshBuilder();
      rg.hcyl(-505.2, 1, z, 7.4, 0.6, 0, PALETTE.cyan, 18);
      const ex = createExhaust({ radius: 7, length: 90, core: 0xbff4ff, edge: 0x4a6bff, alpha: 0.55 });
      ex.position.set(-506, 10, z);
      this.group.add(ex);
      this.thrusters.push(ex);
      this.light(-506.5, 10, z, PALETTE.cyan, 12, 3, z * 0.1);
    }
    for (let k = 0; k < 6; k++) this.box('metal', -476, D - 12 + k * 2.2, -70 + k * 28, 2, 1.2, 8, 0x2a3038);
  }

  _poles() {
    for (let x = -120; x <= 30; x += 38) {
      this.box('metal', x, D, 60.5, 0.6, 22, 0.6, 0x8a929d);
      this.box('metal', x, D + 21.5, 59.8, 6, 1.4, 1.2, 0x3a424d);
      for (let s = -2; s <= 2; s++) this.light(x + s * 1.1, D + 21.4, 59, 0xfff0d0, 2.6);
    }
    for (const x of [-200, 100, 300]) {
      this.box('metal', x, D, -97, 0.6, 18, 0.6, 0x8a929d);
      this.box('metal', x, D + 17.5, -97.6, 5, 1.2, 1.2, 0x3a424d);
      for (let s = -2; s <= 2; s++) this.light(x + s, D + 17.4, -98.4, 0xfff0d0, 2.4);
    }
  }

  _screens() {
    const mk = (kind, w, h, px, name) => {
      const s = new ScreenPanel(kind, w, h, { px, name });
      this.group.add(s.mesh);
      (this.screens[kind] = this.screens[kind] || []).push(s);
      return s;
    };
    const wall = mk('wall', 76, 19, 2048, 'opsWall');
    wall.mesh.position.set(-110, D + 31, DECK.hangar.z0 - 0.15);
    wall.mesh.rotation.y = Math.PI;
    const ship = mk('ship', 30, 14, 1024, 'shipStatus');
    ship.mesh.position.set(this.islandCenter[0] - 4, D + 14, 65.5);
    ship.mesh.rotation.y = Math.PI;
    const status = mk('status', 20, 12, 768, 'transportStatus');
    status.mesh.position.set(this.islandCenter[0] + 28, D + 14, 65.5);
    status.mesh.rotation.y = Math.PI;
    const arr = mk('arrival', 16, 6.4, 768, 'arrivalBoard');
    arr.mesh.position.set(-60, D + 4.6, -27.6);
    this.box('metal', -60, D, -27.2, 0.5, 4.2, 0.5, 0x4a525e);
    this.box('metal', -60, D + 3.9, -27.4, 16.6, 1.6, 0.4, 0x1b2129);
    for (let k = 0; k < 6; k++) {
      const x = -120 + k * 30;
      const s = mk('kiosk', 6, 4.2, 512, 'kiosk' + k);
      s.mesh.position.set(x, D + 3.9, DECK.apron.z0 - 1.2);
      s.mesh.rotation.y = 0;
      this.box('metal', x, D, DECK.apron.z0 - 1.5, 0.35, 3, 0.35, 0x4a525e);
      this.box('metal', x, D + 1.7, DECK.apron.z0 - 1.5, 6.5, 4.6, 0.4, 0x1b2129);
    }
  }

  _ambient() {
    this.steam = new ParticleSystem({ max: 160, gravity: -1.2, drag: 0.8, name: 'deckSteam' });
    this.group.add(this.steam.points);
    this._steamAcc = 0;
    this.steamPower = 0.15;
  }

  _lights() {
    const q = this.cfg?.lightScale ?? 1;
    const items = q < 1 ? this.lightItems.filter((_, i) => i % 3 !== 1) : this.lightItems;
    this.lights = new LightPoints(items, { name: 'carrierLights' });
    this.group.add(this.lights.points);
  }

  _anchors() {
    const add = (name, x, y, z, ry = 0) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.group.add(o);
      this.anchors[name] = o;
      return o;
    };
    add('Anchor_Berth', DECK.berthX, D, DECK.runwayZ);
    add('Anchor_RampEnd', DECK.berthX - 49.5, D, DECK.runwayZ);
    add('Anchor_StagingCenter', (DECK.apron.x0 + DECK.apron.x1) / 2, D, (DECK.apron.z0 + DECK.apron.z1) / 2);
    add('Anchor_CatapultStart', DECK.berthX - 22, D, DECK.runwayZ);
    const spawn = new THREE.Group();
    spawn.name = 'Anchor_SpawnGrid';
    this.spawnPoints.forEach((p, i) => {
      const o = new THREE.Object3D();
      o.name = 'Spawn_' + String(i).padStart(3, '0');
      o.position.set(p[0], p[1], p[2]);
      o.userData.index = i;
      spawn.add(o);
    });
    this.group.add(spawn);
    this.anchors.spawnGrid = spawn;
  }

  // ------------------------------------------------------------------ runtime
  setOpsState(state) { this.opsState = state; }
  setBlastDeflector(v) { this.deflector.rotation.z = -v * 0.95; }
  setThrusters(p) { this.thrusters.forEach((t) => setExhaust(t, p)); }
  catapultSteam(power) { this.steamPower = power; }

  update(dt, t) {
    for (const fn of this.animated) fn(dt, t);
    this.mat.glowB.color.setScalar(0.82 + 0.18 * Math.sin(t * 1.4));
    this.mat.glowC.color.setScalar(Math.sin(t * 6) > 0 ? 1 : 0.25);
    this.setThrusters(0.5 + 0.1 * Math.sin(t * 0.8));
    // steam jets along the catapult
    this._steamAcc += dt * (20 * this.steamPower + 3);
    while (this._steamAcc > 1) {
      this._steamAcc -= 1;
      const x = DECK.berthX + 10 + this.rand() * 340;
      const side = this.rand() < 0.5 ? -1 : 1;
      if (this.steamPower > 0.4 || this.rand() < 0.12) this.steam.emit(x, D + 0.4, DECK.runwayZ + side * 3.2, (this.rand() - 0.5) * 1.5, 3 + this.rand() * 3, (this.rand() - 0.5) * 1.5, 2.2, 1.2, 5.5, 0xf2f6fa, 0.45);
    }
    this.steam.update(dt);
    const s = this.opsState;
    if (s) for (const list of Object.values(this.screens)) for (const sc of list) sc.update(dt, s, t);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose?.());
    this.group.traverse((o) => { o.material?.map?.dispose?.(); });
  }
}
