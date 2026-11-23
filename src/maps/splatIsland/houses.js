// Procedural houses with full interiors (walls with real door/window openings, floors, stairs, rooms, furniture, loot)
// and three levels of detail:
//   lod 0  full interior (walkable)         lod 1  exterior shell + window/door quads        lod 2  box + roof
//   'collide'  no geometry, only colliders + loot points (used by the game's collision system)
// Local frame: house centre at the origin, +Z is the front (door side), +X right. Units are metres.

import { MeshBuilder } from './meshBuilder.js';
import { mulberry32 } from './noise.js';

export const FLOOR_H = 3.1;
const E = 0.28; // exterior wall thickness
const I = 0.14; // interior wall thickness
const SKIN = 0.1;
const xf = MeshBuilder.xf;

export const STYLES = {
  city: { walls: [0xf4a6a0, 0xf7d58b, 0x9fd8d0, 0xc6b3e6, 0xf2ede0, 0x9cc9f2, 0xf5b9d0], roofs: [0x5a6f8c, 0x44495a, 0x9a4f6e, 0x3f7a62], trim: 0xf6f3ec },
  suburb: { walls: [0xf2ede0, 0xcfe3f0, 0xf4d9b0, 0xd8e8cf, 0xf3c9c0, 0xe6e0f0], roofs: [0xc4503f, 0x5a6f8c, 0x6b4b3a, 0x3f7a62], trim: 0xffffff },
  desert: { walls: [0xe3c48f, 0xd8b27a, 0xeccf9d, 0xcfa56b, 0xe8d3a8], roofs: [0xb98f5a, 0xa57c4a, 0xc9a06a], trim: 0xf3e2c0 },
  snow: { walls: [0xd96c6c, 0x6c9bd9, 0xe3b34a, 0x7bbf8a, 0xc59ad9, 0xe8dfc9], roofs: [0xf4f8ff, 0xe6eef6, 0xdbe6f0], trim: 0xffffff },
  forest: { walls: [0x8a5d3b, 0x7a5232, 0x9a6b44, 0x6f4a30], roofs: [0x3f7a62, 0x5b4636, 0x44495a, 0x2f5b45], trim: 0xd8c4a0 },
  harbor: { walls: [0x8da2b5, 0xb08968, 0x9db4a0, 0xdfe3ea, 0xc9b38f, 0x7fa0b8], roofs: [0x44495a, 0xc4503f, 0x5a6f8c, 0x4a5b63], trim: 0xf2f6fa },
  farm: { walls: [0xf2ede0, 0xc4503f, 0xe8dfc9, 0xb8c9a0], roofs: [0x6b4b3a, 0x3f7a62, 0x8a5a3c], trim: 0xffffff }
};
const INT = { walls: [0xf2ead8, 0xe9dcc6, 0xd9e6e0, 0xeadadf, 0xdfe0f0], floors: [0x9a6a43, 0x8a5d3b, 0xb59a78, 0x7a5a3c], ceiling: 0xf6f3ec, wood: 0x7a5232, dark: 0x2b3340 };

const KINDS = {
  cottage: { w: [7.6, 9], d: [6.6, 8], floors: [1, 1], tpl: 'house' },
  house: { w: [9.6, 12], d: [8, 10], floors: [2, 2], tpl: 'house' },
  villa: { w: [12, 15], d: [9.6, 11], floors: [2, 2], tpl: 'house' },
  farmhouse: { w: [10, 12], d: [8, 9], floors: [2, 2], tpl: 'house' },
  lodge: { w: [10, 13], d: [8, 10], floors: [2, 2], tpl: 'house' },
  adobe: { w: [8, 10], d: [7, 9], floors: [1, 2], tpl: 'house' },
  cabin: { w: [6.6, 8.6], d: [5.6, 7], floors: [1, 1], tpl: 'cabin' },
  shop: { w: [11, 14], d: [8.6, 10.6], floors: [1, 2], tpl: 'shop' },
  apartment: { w: [16, 20], d: [11, 13], floors: [3, 4], tpl: 'apartment' },
  tower: { w: [18, 22], d: [14, 16], floors: [5, 7], tpl: 'apartment' },
  warehouse: { w: [18, 24], d: [12, 16], floors: [1, 1], tpl: 'warehouse' }
};
export const HOUSE_KINDS = Object.keys(KINDS);

// ------------------------------------------------------------------ spec
export function makeSpec(rand, kind, style, x, z, y, rot, o = {}) {
  const K = KINDS[kind];
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const rr = (a, b) => a + (b - a) * rand();
  const st = STYLES[style] || STYLES.suburb;
  const floors = o.floors ?? Math.round(rr(K.floors[0], K.floors[1]));
  const flat = style === 'desert' || kind === 'apartment' || kind === 'tower' || kind === 'shop' || kind === 'warehouse';
  return {
    id: o.id || 'h' + Math.floor(rand() * 1e9).toString(36),
    kind, style, x, z, y, rot,
    w: o.w ?? Math.round(rr(K.w[0], K.w[1]) * 2) / 2,
    d: o.d ?? Math.round(rr(K.d[0], K.d[1]) * 2) / 2,
    floors,
    roof: o.roof ?? (flat ? 'flat' : rand() < 0.22 && kind !== 'cabin' ? 'hip' : 'gable'),
    wall: o.wall ?? pick(st.walls),
    roofColor: o.roofColor ?? pick(st.roofs),
    trim: st.trim,
    seed: Math.floor(rand() * 2 ** 31),
    tier: o.tier ?? 1,
    town: o.town || null,
    hidden: !!o.hidden
  };
}
export const houseRadius = (s) => Math.hypot(s.w, s.d) / 2;
export const houseHeight = (s) => s.floors * FLOOR_H + (s.roof === 'gable' ? Math.min(s.w, s.d) * 0.34 + 0.7 : s.roof === 'hip' ? Math.min(s.w, s.d) * 0.3 + 0.6 : 1.4) + (s.kind === 'warehouse' ? 2.4 : 0);

// ------------------------------------------------------------------ builder context
class HB {
  constructor(spec, mbs, collide) {
    this.s = spec;
    this.mb = mbs; // { solid, glass, glow } or null
    this.col = collide; // array or null
    this.loot = [];
    this.rand = mulberry32(spec.seed);
    this.H = spec.kind === 'warehouse' ? FLOOR_H + 2.4 : FLOOR_H;
    this.floorH = (f) => f * this.H;
  }
  P(lx, lz) { const p = xf(this.s.x, this.s.z, this.s.rot, lx, 0, lz); return [p[0], p[2]]; }
  box(layer, lx, y0, lz, sx, sy, sz, hex, rot = 0, hit = false) {
    const [wx, wz] = this.P(lx, lz);
    const yy = this.s.y + y0;
    if (this.mb && layer) this.mb[layer].box(wx, yy, wz, sx, sy, sz, this.s.rot + rot, hex);
    if (hit && this.col) this.col.push({ kind: 'box', poi: this.s.id, x: wx, z: wz, hx: sx / 2, hz: sz / 2, rot: this.s.rot + rot, y0: yy, y1: yy + sy });
  }
  gable(lx, y0, lz, w, d, h, rot, hex, over = 0.5) { if (this.mb) { const [wx, wz] = this.P(lx, lz); this.mb.solid.gable(wx, this.s.y + y0, wz, w, d, h, this.s.rot + rot, hex, over); } }
  pyramid(lx, y0, lz, w, d, h, rot, hex, over = 0.4) { if (this.mb) { const [wx, wz] = this.P(lx, lz); this.mb.solid.pyramid(wx, this.s.y + y0, wz, w, d, h, this.s.rot + rot, hex, over); } }
  cyl(layer, lx, y0, lz, r, h, hex, seg = 8, rTop = r) { if (this.mb) { const [wx, wz] = this.P(lx, lz); this.mb[layer].cyl(wx, this.s.y + y0, wz, r, h, hex, seg, rTop); } }
  flat(layer, lx, y, lz, w, d, hex, rot = 0) { // thin horizontal quad (rug, decal)
    if (!this.mb) return;
    this.box(layer, lx, y, lz, w, 0.025, d, hex, rot);
  }
  lootAt(lx, y, lz, type = 'floor') { const [wx, wz] = this.P(lx, lz); this.loot.push({ poi: this.s.id, tier: this.s.tier, type, x: wx, y: this.s.y + y, z: wz }); }

  // furniture helper: rotated offsets around (x, z)
  item(x, z, rot, fn) {
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const b = (dx, y0, dz, sx, sy, sz, hex, layer = 'solid') => this.box(layer, x + dx * c + dz * sn, y0, z - dx * sn + dz * c, sx, sy, sz, hex, rot);
    fn(b);
  }
}

// ------------------------------------------------------------------ walls with openings
function wallRun(hb, f, axis, fixed, c0, c1, thick, ops, ext, outSign, cOut, cIn, trim) {
  const y0 = hb.floorH(f) + (f === 0 ? 0.1 : 0);
  const Hh = hb.H - 0.22 - (f === 0 ? 0.1 : 0);
  const L = c1 - c0;
  const sorted = ops.slice().sort((a, b) => a.s0 - b.s0);
  const segs = [];
  let cur = 0;
  for (const op of sorted) {
    if (op.s0 > cur + 0.01) segs.push([cur, op.s0, 0, Hh]);
    const sill = op.kind === 'window' ? op.sill ?? 0.95 : 0;
    const head = op.kind === 'window' ? op.head ?? 2.1 : op.kind === 'door' ? 2.15 : 2.35;
    if (op.kind === 'window') segs.push([op.s0, op.s1, 0, sill]);
    segs.push([op.s0, op.s1, head, Hh]);
    cur = op.s1;
  }
  if (cur < L - 0.01) segs.push([cur, L, 0, Hh]);
  const put = (s0, s1, ya, yb, off, th, color, hit) => {
    const len = s1 - s0;
    const mid = c0 + (s0 + s1) / 2;
    if (axis === 'x') hb.box('solid', mid, y0 + ya, fixed + off, len, yb - ya, th, color, 0, hit);
    else hb.box('solid', fixed + off, y0 + ya, mid, th, yb - ya, len, color, 0, hit);
  };
  for (const [s0, s1, ya, yb] of segs) {
    if (hb.col) put(s0, s1, ya, yb, 0, thick, cIn, true);
    if (!hb.mb) continue;
    if (ext) {
      put(s0, s1, ya, yb, outSign * (thick / 2 - SKIN / 2), SKIN, cOut, false);
      put(s0, s1, ya, yb, -outSign * SKIN / 2, thick - SKIN, cIn, false);
    } else put(s0, s1, ya, yb, 0, thick, cIn, false);
  }
  if (!hb.mb) return;
  // doors and windows details
  for (const op of sorted) {
    const w = op.s1 - op.s0;
    const mid = c0 + (op.s0 + op.s1) / 2;
    const at = (s, off, y, sx, sy, sz, color, layer = 'solid') => {
      if (axis === 'x') hb.box(layer, s, y0 + y, fixed + off, sx, sy, sz, color);
      else hb.box(layer, fixed + off, y0 + y, s, sz, sy, sx, color);
    };
    if (op.kind === 'window') {
      const sill = op.sill ?? 0.95;
      const head = op.head ?? 2.1;
      at(mid, 0, sill, w, head - sill, 0.05, 0xbfe4f2, 'glass');
      at(mid, 0, sill - 0.04, w + 0.12, 0.07, thick + 0.1, trim);
      at(mid, 0, head - 0.03, w + 0.12, 0.07, thick + 0.06, trim);
      at(op.s0 + c0 + 0.02, 0, sill, 0.06, head - sill, 0.07, trim);
      at(op.s1 + c0 - 0.02, 0, sill, 0.06, head - sill, 0.07, trim);
      at(mid, 0, sill, 0.05, head - sill, 0.07, trim);
    } else if (op.kind === 'door') {
      const dark = INT.wood;
      at(op.s0 + c0 + 0.04, 0, 0, 0.08, 2.15, thick + 0.06, trim);
      at(op.s1 + c0 - 0.04, 0, 0, 0.08, 2.15, thick + 0.06, trim);
      at(mid, 0, 2.1, w, 0.08, thick + 0.06, trim);
      // leaf ajar (swinging into the building)
      const inward = ext ? -outSign : 1;
      const ang = 1.15;
      const hingeS = op.s0 + c0 + 0.06;
      const dir = axis === 'x' ? [Math.cos(ang), inward * Math.sin(ang)] : [inward * Math.sin(ang), Math.cos(ang)];
      const lenLeaf = w - 0.16;
      const cx = axis === 'x' ? hingeS + dir[0] * lenLeaf / 2 : fixed + dir[0] * lenLeaf / 2;
      const cz = axis === 'x' ? fixed + dir[1] * lenLeaf / 2 : hingeS + dir[1] * lenLeaf / 2;
      hb.box('solid', cx, y0, cz, lenLeaf, 2.05, 0.05, dark, Math.atan2(-dir[1], dir[0]));
    }
  }
}

function windowsFor(len, keep, wWin = 1.3, spacing = 3.3) {
  const n = Math.max(1, Math.floor(len / spacing));
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * len) / n;
    const s0 = c - wWin / 2;
    const s1 = c + wWin / 2;
    if (s0 < 0.5 || s1 > len - 0.5) continue;
    if (keep.some((k) => s1 > k[0] - 0.35 && s0 < k[1] + 0.35)) continue;
    out.push({ s0, s1, kind: 'window' });
  }
  return out;
}

// ------------------------------------------------------------------ slabs, stairs
function slab(hb, f, w, d, hole, color) {
  const y = hb.floorH(f) - 0.22;
  const x0 = -w / 2 + 0.02;
  const x1 = w / 2 - 0.02;
  const z0 = -d / 2 + 0.02;
  const z1 = d / 2 - 0.02;
  const R = (a0, b0, a1, b1) => { if (a1 - a0 > 0.01 && b1 - b0 > 0.01) hb.box('solid', (a0 + a1) / 2, y, (b0 + b1) / 2, a1 - a0, 0.22, b1 - b0, color, 0, true); };
  if (!hole) { R(x0, z0, x1, z1); return; }
  R(x0, z0, x1, hole.z0);
  R(x0, hole.z1, x1, z1);
  R(x0, hole.z0, hole.x0, hole.z1);
  R(hole.x1, hole.z0, x1, hole.z1);
}

// straight stair flight from floor f to f+1. dir = [dx,dz] axis-aligned; returns hole rect for the slab above
function stairs(hb, f, sx, sz, dir, wid, color) {
  const n = 14;
  const rise = hb.H / n;
  const run = 0.27;
  const y0 = hb.floorH(f) + (f === 0 ? 0.1 : 0);
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * rise - (f === 0 ? 0.1 : 0);
    const cx = sx + dir[0] * (i + 0.5) * run;
    const cz = sz + dir[1] * (i + 0.5) * run;
    const sxs = dir[0] ? run : wid;
    const szs = dir[1] ? run : wid;
    hb.box('solid', cx, y0, cz, sxs, Math.max(0.1, h), szs, color, 0, true);
  }
  const len = n * run;
  const ex = sx + dir[0] * len;
  const ez = sz + dir[1] * len;
  const x0 = Math.min(sx, ex) - (dir[0] ? 0 : wid / 2);
  const x1 = Math.max(sx, ex) + (dir[0] ? 0 : wid / 2);
  const z0 = Math.min(sz, ez) - (dir[1] ? 0 : wid / 2);
  const z1 = Math.max(sz, ez) + (dir[1] ? 0 : wid / 2);
  // handrail along the open side (upper floor railing around the hole)
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}

// ------------------------------------------------------------------ furniture library
const F = {
  bed(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 1.7, 0.35, 2.1, 0x6b4b3a); b(0, 0.35, 0.05, 1.6, 0.22, 1.95, 0xdfe6ee); b(-0.4, 0.57, -0.75, 0.6, 0.12, 0.35, 0xffffff); b(0.4, 0.57, -0.75, 0.6, 0.12, 0.35, 0xffffff); b(0, 0, -1.1, 1.8, 1.0, 0.1, 0x5a3d28); b(0, 0.55, 0.45, 1.6, 0.06, 1.1, [0x20d8e9, 0xff7652, 0x9cc9f2, 0xf5b9d0][hb.rand() * 4 | 0]); }); },
  sofa(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 2.1, 0.45, 0.9, 0x3d5a80); b(0, 0.45, -0.38, 2.1, 0.5, 0.18, 0x34506f); b(-1.0, 0.3, 0, 0.18, 0.45, 0.9, 0x34506f); b(1.0, 0.3, 0, 0.18, 0.45, 0.9, 0x34506f); b(-0.5, 0.45, 0.05, 0.9, 0.12, 0.7, 0x4d6c96); b(0.5, 0.45, 0.05, 0.9, 0.12, 0.7, 0x4d6c96); }); },
  table(hb, x, z, rot, w = 1.4, d = 0.9, chairs = true) { hb.item(x, z, rot, (b) => { b(0, 0.72, 0, w, 0.06, d, 0xb08968); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(dx * (w / 2 - 0.08), 0, dz * (d / 2 - 0.08), 0.07, 0.72, 0.07, 0x7a5232); if (chairs) for (const s of [-1, 1]) { b(-0.35, 0, s * (d / 2 + 0.3), 0.42, 0.45, 0.42, 0x8a5d3b); b(-0.35, 0.45, s * (d / 2 + 0.3 + s * 0.17), 0.42, 0.45, 0.06, 0x8a5d3b); b(0.35, 0, s * (d / 2 + 0.3), 0.42, 0.45, 0.42, 0x8a5d3b); b(0.35, 0.45, s * (d / 2 + 0.3 + s * 0.17), 0.42, 0.45, 0.06, 0x8a5d3b); } }); },
  coffee(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0.38, 0, 1.1, 0.05, 0.6, 0xb08968); b(-0.45, 0, -0.2, 0.05, 0.38, 0.05, 0x5a3d28); b(0.45, 0, 0.2, 0.05, 0.38, 0.05, 0x5a3d28); b(0, 0.43, 0, 0.3, 0.08, 0.2, 0xff7652); }); },
  tv(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 1.5, 0.5, 0.45, 0x3a2e28); b(0, 0.55, 0, 1.2, 0.7, 0.06, 0x0e1116); b(0, 0.6, 0.04, 1.1, 0.6, 0.02, 0x1d3a57, 'glow'); }); },
  wardrobe(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 1.3, 2.1, 0.6, 0x8a5d3b); b(-0.33, 0.1, 0.31, 0.02, 1.9, 0.02, 0x3a2e28); b(0.33, 0.1, 0.31, 0.02, 1.9, 0.02, 0x3a2e28); }); },
  nightstand(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.45, 0.5, 0.4, 0x7a5232); b(0, 0.5, 0, 0.14, 0.22, 0.14, 0xffe9b0, 'glow'); }); },
  counter(hb, x, z, rot, len = 2.4) { hb.item(x, z, rot, (b) => { b(0, 0, 0, len, 0.9, 0.62, 0xe9eef4); b(0, 0.9, 0, len + 0.04, 0.05, 0.66, 0x6b7380); b(-len / 4, 0.93, 0.0, 0.5, 0.04, 0.4, 0x9aa5b1); b(-len / 4, 0.96, -0.18, 0.04, 0.2, 0.04, 0xc6ced8); b(len / 4, 0.95, 0, 0.26, 0.02, 0.26, 0x1b2129); b(len / 4 + 0.0, 0.97, 0, 0.08, 0.02, 0.08, 0xff3a3a, 'glow'); b(0, 1.5, -0.3, len, 0.5, 0.3, 0xe9eef4); }); },
  fridge(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.75, 1.85, 0.7, 0xdfe6ee); b(0, 1.0, 0.36, 0.7, 0.02, 0.02, 0x9aa5b1); b(0.3, 0.9, 0.37, 0.03, 0.5, 0.03, 0x6b7380); }); },
  toilet(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0.1, 0.4, 0.4, 0.5, 0xf6f3ec); b(0, 0.4, -0.18, 0.4, 0.45, 0.18, 0xf6f3ec); }); },
  sink(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.6, 0.8, 0.45, 0xf6f3ec); b(0, 0.8, 0, 0.6, 0.06, 0.45, 0xe0e6ec); b(0, 1.2, -0.22, 0.5, 0.7, 0.03, 0xbfe4f2, 'glass'); }); },
  tub(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.8, 0.55, 1.7, 0xf6f3ec); b(0, 0.5, 0, 0.62, 0.05, 1.5, 0x6fb8d8); }); },
  shelf(hb, x, z, rot, len = 1.4) { hb.item(x, z, rot, (b) => { b(0, 0, 0, len, 2.0, 0.35, 0x7a5232); for (let k = 0; k < 4; k++) { b(0, 0.15 + k * 0.5, 0.0, len - 0.1, 0.04, 0.37, 0x5a3d28); for (let j = 0; j < 4; j++) b(-len / 2 + 0.2 + j * (len / 4), 0.2 + k * 0.5, 0.03, 0.18, 0.3, 0.2, [0xe4572e, 0x29a0b1, 0xf2b134, 0x3fa34d, 0x6c5ce7][(j + k) % 5]); } }); },
  desk(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0.72, 0, 1.4, 0.05, 0.7, 0xb08968); b(-0.6, 0, 0, 0.06, 0.72, 0.6, 0x7a5232); b(0.6, 0, 0, 0.06, 0.72, 0.6, 0x7a5232); b(0, 0.77, -0.1, 0.5, 0.3, 0.04, 0x0e1116); b(0, 0.8, -0.08, 0.46, 0.25, 0.02, 0x2d6fa8, 'glow'); b(0, 0, 0.7, 0.45, 0.5, 0.45, 0x24323f); b(0, 0.5, 0.88, 0.45, 0.5, 0.06, 0x24323f); }); },
  crate(hb, x, z, rot, s = 0.9) { hb.item(x, z, rot, (b) => { b(0, 0, 0, s, s, s, 0x9a6b44); b(0, s * 0.45, 0, s + 0.02, 0.06, s + 0.02, 0x6b4b3a); }); },
  barrel(hb, x, z) { hb.cyl('solid', x, 0.1, z, 0.34, 0.9, 0x2a5f8a, 10); hb.cyl('solid', x, 0.45, z, 0.355, 0.08, 0x1b2129, 10); },
  plant(hb, x, z) { hb.cyl('solid', x, 0.1, z, 0.2, 0.4, 0xb25b3e, 8, 0.26); if (hb.mb) { const [wx, wz] = hb.P(x, z); hb.mb.solid.blob(wx, hb.s.y + 0.9, wz, 0.38, 0.45, 0.38, 0x4ea642, hb.rand, 0.2, 0); } },
  lamp(hb, x, z) { hb.cyl('solid', x, 0.1, z, 0.12, 0.05, 0x2b3340, 8); hb.cyl('solid', x, 0.14, z, 0.02, 1.4, 0x2b3340, 5); hb.box('glow', x, 1.5, z, 0.3, 0.26, 0.3, 0xffe9b0); },
  rug(hb, x, z, w, d, hex) { hb.box('solid', x, 0.1, z, w, 0.02, d, hex); },
  shopShelf(hb, x, z, rot, len = 2.2) { hb.item(x, z, rot, (b) => { b(0, 0, 0, len, 1.9, 0.5, 0x4a525e); for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) b(-len / 2 + 0.2 + j * (len / 6), 0.25 + k * 0.45, 0.05, 0.28, 0.3, 0.3, [0xe4572e, 0x29a0b1, 0xf2b134, 0x3fa34d, 0xd6336c, 0x1c7ed6][(j * 3 + k) % 6]); }); },
  register(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 2.6, 1.0, 0.7, 0x4a525e); b(0, 1.0, 0, 2.7, 0.05, 0.75, 0xc6ced8); b(0.7, 1.05, 0, 0.4, 0.3, 0.3, 0x24323f); b(0.7, 1.2, 0.12, 0.3, 0.12, 0.02, 0x4dff88, 'glow'); }); },
  bench(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0.42, 0, 1.6, 0.06, 0.4, 0x8a5d3b); b(-0.7, 0, 0, 0.06, 0.42, 0.36, 0x5a3d28); b(0.7, 0, 0, 0.06, 0.42, 0.36, 0x5a3d28); }); },
  locker(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.5, 1.9, 0.5, 0x4a6a8a); b(0.0, 1.4, 0.26, 0.38, 0.02, 0.02, 0x1b2129); }); },
  stove(hb, x, z, rot) { hb.item(x, z, rot, (b) => { b(0, 0, 0, 0.7, 0.9, 0.62, 0xc6ced8); b(0, 0.9, 0, 0.7, 0.04, 0.62, 0x1b2129); b(-0.17, 0.94, -0.12, 0.2, 0.01, 0.2, 0xff7652, 'glow'); b(0.17, 0.94, 0.12, 0.2, 0.01, 0.2, 0xff7652, 'glow'); }); },
  woodstove(hb, x, z) { hb.cyl('solid', x, 0.1, z, 0.35, 0.9, 0x2a2f36, 10); hb.box('glow', x, 0.35, z + 0.34, 0.24, 0.18, 0.03, 0xff8c42); hb.cyl('solid', x, 1.0, z, 0.08, 2.0, 0x1b2129, 6); }
};

function ceilingLamp(hb, f, x, z) { hb.box('glow', x, hb.floorH(f) + hb.H - 0.3, z, 0.55, 0.05, 0.55, 0xfff1cf); }

// rooms: { f, type, x0, z0, x1, z1 }
function furnish(hb, r, opts = {}) {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = hb.floorH(r.f);
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const base = (yy) => yy; // furniture uses ground-relative heights; shift via hb.s.y override below
  const savedY = hb.s.y;
  hb.s = { ...hb.s, y: savedY + y + (r.f === 0 ? 0.1 : 0) - 0.1 };
  const avoid = opts.avoid; // stair rectangle in house-local coordinates
  const free = (x, z, hx, hz) => !avoid || x + hx < avoid.x0 || x - hx > avoid.x1 || z + hz < avoid.z0 || z - hz > avoid.z1;
  const put = (fn, x, z, ...rest) => { fn(hb, x, z, ...rest); };
  ceilingLamp({ ...hb, s: hb.s, mb: hb.mb, floorH: () => 0, H: hb.H, box: hb.box.bind(hb) }, 0, cx, cz);
  switch (r.type) {
    case 'living': {
      hb.box('solid', cx, 0.1, cz, Math.max(1.8, w - 2.4), 0.02, Math.max(1.6, d - 2.4), [0xc4503f, 0x3f7a62, 0x5a6f8c, 0x9a4f6e][hb.rand() * 4 | 0]);
      const sx = Math.min(r.x1 - 1.3, Math.max(r.x0 + 1.3, cx + 0.5));
      if (free(sx, r.z0 + 0.6, 1.1, 0.6)) put(F.sofa, sx, r.z0 + 0.6, 0);
      put(F.coffee, cx + 0.3, cz + 0.2, 0);
      if (free(cx, r.z1 - 0.5, 0.8, 0.4)) put(F.tv, cx, r.z1 - 0.5, Math.PI);
      put(F.plant, r.x1 - 0.4, r.z1 - 0.4);
      put(F.lamp, r.x1 - 0.4, r.z0 + 0.4);
      hb.lootAt(cx, 0.25, cz + 0.8, 'floor');
      break;
    }
    case 'kitchen': {
      put(F.counter, cx - 0.3, r.z0 + 0.4, 0, Math.min(2.6, w - 0.9));
      put(F.fridge, r.x1 - 0.5, r.z0 + 0.45, 0);
      put(F.stove, r.x0 + 0.5, r.z0 + 0.4, 0);
      if (d > 3.2) put(F.table, cx, cz + 0.5, 0, 1.3, 0.9, true);
      hb.lootAt(cx, 0.25, cz + 0.4, 'chest');
      break;
    }
    case 'bedroom': {
      put(F.bed, r.x1 - 1.2, r.z0 + 1.15, 0);
      put(F.nightstand, r.x1 - 2.4, r.z0 + 0.35, 0);
      put(F.wardrobe, r.x0 + 0.8, r.z1 - 0.4, Math.PI);
      hb.box('solid', cx, 0.1, cz, 2.2, 0.02, 1.6, [0xdfe6ee, 0xf5b9d0, 0x9cc9f2][hb.rand() * 3 | 0]);
      hb.lootAt(cx, 0.25, cz + 0.2, 'chest');
      break;
    }
    case 'bath': {
      put(F.toilet, r.x0 + 0.5, r.z0 + 0.35, 0);
      put(F.sink, r.x1 - 0.5, r.z0 + 0.3, 0);
      if (d > 2.2 && w > 1.9) put(F.tub, cx, r.z1 - 1.0, 0);
      break;
    }
    case 'study': {
      put(F.desk, cx, r.z0 + 0.5, 0);
      put(F.shelf, r.x0 + 0.3, cz, Math.PI / 2, Math.min(2, d - 0.6));
      hb.lootAt(cx, 0.25, cz + 0.6, 'floor');
      break;
    }
    case 'apt': {
      put(F.bed, r.x0 + 1.3, r.z1 - 1.3, Math.PI);
      put(F.sofa, cx + 1.5, r.z0 + 0.6, 0);
      put(F.coffee, cx + 1.5, r.z0 + 1.7, 0);
      put(F.counter, r.x1 - 1.4, r.z0 + 0.35, 0, 2.2);
      put(F.table, cx - 1, cz, 0, 1.1, 0.8, true);
      hb.box('solid', cx, 0.1, cz, 3.2, 0.02, 2.4, 0x5a6f8c);
      hb.lootAt(cx, 0.25, cz + 1.0, 'chest');
      break;
    }
    case 'office': {
      for (let i = 0; i < Math.max(2, Math.floor(w / 3.4)); i++) put(F.desk, r.x0 + 1.6 + i * 3.2, r.z0 + 0.6, 0);
      put(F.shelf, r.x1 - 0.3, cz, -Math.PI / 2, 2);
      hb.lootAt(cx, 0.25, cz, 'chest');
      break;
    }
    case 'shop': {
      for (let i = 0; i < Math.max(2, Math.floor((w - 1.5) / 2.6)); i++) { put(F.shopShelf, r.x0 + 1.5 + i * 2.6, cz - 0.5, 0); put(F.shopShelf, r.x0 + 1.5 + i * 2.6, cz + 0.9, Math.PI); }
      put(F.register, r.x1 - 1.7, r.z1 - 1.0, Math.PI);
      hb.lootAt(cx, 0.25, cz + 0.2, 'floor');
      hb.lootAt(r.x1 - 1.0, 0.25, r.z1 - 1.6, 'chest');
      break;
    }
    case 'storage': {
      for (let i = 0; i < 6; i++) put(F.crate, r.x0 + 0.7 + (i % 3) * 1.1, r.z0 + 0.7 + Math.floor(i / 3) * 1.1, hb.rand() * 0.4, 0.8 + (i % 2) * 0.2);
      put(F.barrel, r.x1 - 0.5, r.z0 + 0.5);
      put(F.shelf, cx, r.z1 - 0.3, Math.PI, Math.min(2, w - 0.8));
      hb.lootAt(cx, 0.25, cz, 'chest');
      break;
    }
    case 'cabin': {
      put(F.bed, r.x1 - 1.1, r.z0 + 1.15, 0);
      put(F.woodstove, r.x0 + 0.6, r.z0 + 0.6);
      put(F.table, cx - 0.6, cz + 0.6, 0, 1.2, 0.8, true);
      put(F.shelf, r.x0 + 0.3, cz + 0.2, Math.PI / 2, 1.3);
      hb.box('solid', cx, 0.1, cz + 0.4, 2.2, 0.02, 1.6, 0x9a4f6e);
      hb.lootAt(cx, 0.25, cz + 1.4, 'floor');
      hb.lootAt(r.x1 - 0.6, 0.25, r.z1 - 0.6, 'chest');
      break;
    }
    case 'hall': {
      put(F.plant, r.x0 + 0.4, r.z1 - 0.4);
      put(F.bench, cx, r.z1 - 0.3, Math.PI);
      break;
    }
    case 'warehouse': {
      for (let i = 0; i < 10; i++) put(F.crate, r.x0 + 1.4 + (i % 5) * 2.2, r.z0 + 1.2 + Math.floor(i / 5) * 3, hb.rand() * 0.5, 1 + (i % 3) * 0.2);
      for (let i = 0; i < 4; i++) put(F.shelf, r.x0 + 1.8 + i * 3, r.z1 - 0.4, Math.PI, 2.4);
      for (let i = 0; i < 3; i++) put(F.barrel, r.x1 - 0.6, r.z0 + 0.6 + i * 0.8);
      hb.lootAt(cx, 0.25, cz, 'chest');
      hb.lootAt(r.x0 + 3, 0.25, r.z0 + 2, 'chest');
      break;
    }
    default: break;
  }
  hb.s = { ...hb.s, y: savedY };
}

// ------------------------------------------------------------------ templates
function layoutHouse(hb) {
  const { w, d, floors } = hb.s;
  const st = STYLES[hb.s.style] || STYLES.suburb;
  const villa = hb.s.kind === 'villa';
  const xs = Math.round((-w / 2 + w * 0.56) * 2) / 2;
  const zs = Math.round((-d / 2 + d * 0.5) * 2) / 2;
  const c0z = -d / 2 + E;
  const c1z = d / 2 - E;
  const cIn = () => INT.walls[hb.rand() * INT.walls.length | 0];
  const walls = [];
  const rooms = [];
  let stairRect = null;
  const stairs0 = floors > 1;
  const sxs = -w / 2 + E + 0.15 + 0.55;
  const szs = c0z + 0.1;
  const doorKeep = [w / 2 - 0.0];
  for (let f = 0; f < floors; f++) {
    const cI = cIn();
    const k = zs - c0z;
    if (f === 0) {
      walls.push({ f, axis: 'z', fixed: xs, c0: c0z, c1: c1z, ops: [{ s0: 0.7, s1: Math.max(1.9, k - 0.7), kind: villa ? 'open' : 'open' }, { s0: k + (c1z - zs) / 2 - 0.55, s1: k + (c1z - zs) / 2 + 0.55, kind: 'door' }], c: cI });
      walls.push({ f, axis: 'x', fixed: zs, c0: xs, c1: w / 2 - E, ops: [], c: cI });
      rooms.push({ f, type: 'living', x0: -w / 2 + E, z0: c0z, x1: xs, z1: c1z });
      rooms.push({ f, type: 'kitchen', x0: xs, z0: c0z, x1: w / 2 - E, z1: zs });
      rooms.push({ f, type: villa ? 'study' : 'bath', x0: xs, z0: zs, x1: w / 2 - E, z1: c1z });
    } else {
      walls.push({ f, axis: 'z', fixed: xs, c0: c0z, c1: c1z, ops: [{ s0: 1.0, s1: 2.1, kind: 'door' }, { s0: k + (c1z - zs) / 2 - 0.55, s1: k + (c1z - zs) / 2 + 0.55, kind: 'door' }], c: cI });
      walls.push({ f, axis: 'x', fixed: zs, c0: xs, c1: w / 2 - E, ops: [], c: cI });
      rooms.push({ f, type: 'bedroom', x0: -w / 2 + E, z0: c0z, x1: xs, z1: c1z });
      rooms.push({ f, type: 'bedroom', x0: xs, z0: c0z, x1: w / 2 - E, z1: zs });
      rooms.push({ f, type: 'bath', x0: xs, z0: zs, x1: w / 2 - E, z1: c1z });
    }
  }
  if (stairs0) stairRect = { x: sxs, z: szs, dir: [0, 1], wid: 1.1 };
  return { walls, rooms, stairRect, doorX: (-w / 2 + E + xs) / 2, keepFront: [], st };
}

function layoutCabin(hb) {
  const { w, d } = hb.s;
  return { walls: [], rooms: [{ f: 0, type: 'cabin', x0: -w / 2 + E, z0: -d / 2 + E, x1: w / 2 - E, z1: d / 2 - E }], stairRect: null, doorX: 0, keepFront: [] };
}

function layoutShop(hb) {
  const { w, d, floors } = hb.s;
  const zs = -d / 2 + E + 3.0;
  const c0 = -w / 2 + E;
  const c1 = w / 2 - E;
  const walls = [{ f: 0, axis: 'x', fixed: zs, c0, c1, ops: [{ s0: w * 0.7 - 0.55, s1: w * 0.7 + 0.55, kind: 'door' }], c: 0xdfe0f0 }];
  const rooms = [{ f: 0, type: 'shop', x0: c0, z0: zs, x1: c1, z1: d / 2 - E }, { f: 0, type: 'storage', x0: c0, z0: -d / 2 + E, x1: c1, z1: zs }];
  let stairRect = null;
  if (floors > 1) {
    stairRect = { x: c0 + 0.7, z: -d / 2 + E + 0.15, dir: [1, 0], wid: 1.1 };
    rooms.push({ f: 1, type: 'office', x0: c0, z0: -d / 2 + E, x1: c1, z1: d / 2 - E });
  }
  return { walls, rooms, stairRect, doorX: 0, keepFront: [], bigWindows: true };
}

function layoutApartment(hb) {
  const { w, d, floors } = hb.s;
  const c0x = -w / 2 + E;
  const c1x = w / 2 - E;
  const c0z = -d / 2 + E;
  const c1z = d / 2 - E;
  const xc = c0x + 4.8;
  const walls = [];
  const rooms = [];
  const tower = hb.s.kind === 'tower';
  for (let f = 0; f < floors; f++) {
    walls.push({ f, axis: 'z', fixed: xc, c0: c0z, c1: c1z, ops: [{ s0: (c1z - c0z) / 2 - 0.55, s1: (c1z - c0z) / 2 + 0.55, kind: 'door' }], c: 0xdfe0f0 });
    for (const zz of [-0.95, 0.95]) {
      const ops = [];
      const L = c1x - xc;
      const n = L > 12 ? 2 : 1;
      for (let i = 0; i < n; i++) ops.push({ s0: (i + 0.5) * (L / n) - 0.55, s1: (i + 0.5) * (L / n) + 0.55, kind: 'door' });
      walls.push({ f, axis: 'x', fixed: zz, c0: xc, c1: c1x, ops, c: 0xe9dcc6 });
    }
    const L = c1x - xc;
    if (L > 12) walls.push({ f, axis: 'z', fixed: xc + L / 2, c0: c0z, c1: -0.95 - I / 2, ops: [], c: 0xe9dcc6 }, { f, axis: 'z', fixed: xc + L / 2, c0: 0.95 + I / 2, c1: c1z, ops: [], c: 0xe9dcc6 });
    const types = f === 0 && !tower ? ['shop', 'shop'] : tower ? ['office', 'office'] : ['apt', 'apt'];
    const xm = L > 12 ? xc + L / 2 : null;
    const spans = xm ? [[xc, xm], [xm, c1x]] : [[xc, c1x]];
    for (const [a, b] of spans) {
      rooms.push({ f, type: types[0], x0: a, z0: 0.95, x1: b, z1: c1z });
      rooms.push({ f, type: types[1], x0: a, z0: c0z, x1: b, z1: -0.95 });
    }
    rooms.push({ f, type: 'hall', x0: c0x, z0: c0z, x1: xc, z1: c1z });
  }
  return { walls, rooms, stairRect: floors > 1 ? { x: c0x + 0.2, z: c0z + 0.7, dir: [1, 0], wid: 1.1 } : null, doorX: (c0x + xc) / 2, keepFront: [], bigWindows: tower };
}

function layoutWarehouse(hb) {
  const { w, d } = hb.s;
  const c0x = -w / 2 + E;
  const c1x = w / 2 - E;
  const c0z = -d / 2 + E;
  const c1z = d / 2 - E;
  const xo = c0x + 5.5;
  const zo = c0z + 4.5;
  const walls = [
    { f: 0, axis: 'x', fixed: zo, c0: c0x, c1: xo, ops: [], c: 0xdfe0f0 },
    { f: 0, axis: 'z', fixed: xo, c0: c0z, c1: zo, ops: [{ s0: 1.6, s1: 2.7, kind: 'door' }], c: 0xdfe0f0 }
  ];
  return { walls, rooms: [{ f: 0, type: 'office', x0: c0x, z0: c0z, x1: xo, z1: zo }, { f: 0, type: 'warehouse', x0: c0x, z0: c0z, x1: c1x, z1: c1z }], stairRect: null, doorX: w * 0.2, keepFront: [], rollerDoor: true };
}

const LAYOUT = { house: layoutHouse, cabin: layoutCabin, shop: layoutShop, apartment: layoutApartment, warehouse: layoutWarehouse };

// ------------------------------------------------------------------ roof
function buildRoof(hb, top) {
  const s = hb.s;
  const { w, d } = s;
  const h = Math.min(w, d) * (s.roof === 'hip' ? 0.3 : 0.34) + 0.7;
  if (s.roof === 'gable') {
    if (w >= d) hb.gable(0, top, 0, d, w, h, Math.PI / 2, s.roofColor, 0.55);
    else hb.gable(0, top, 0, w, d, h, 0, s.roofColor, 0.55);
    hb.box('solid', w * 0.22, top + h * 0.3, -d * 0.12, 0.8, h + 0.6, 0.8, 0x8a7a6a); // chimney
  } else if (s.roof === 'hip') {
    hb.pyramid(0, top, 0, w, d, h, 0, s.roofColor, 0.5);
    hb.box('solid', w * 0.2, top + h * 0.2, -d * 0.1, 0.8, h + 0.4, 0.8, 0x8a7a6a);
  } else {
    hb.box('solid', 0, top, 0, w + 0.5, 0.35, d + 0.5, s.roofColor);
    for (const [px, pz, sx, sz] of [[0, d / 2 + 0.2, w + 0.5, 0.25], [0, -d / 2 - 0.2, w + 0.5, 0.25], [w / 2 + 0.2, 0, 0.25, d + 0.5], [-w / 2 - 0.2, 0, 0.25, d + 0.5]]) hb.box('solid', px, top + 0.35, pz, sx, 0.55, sz, s.trim);
    const r = hb.rand;
    for (let i = 0; i < 2 + (w > 14 ? 2 : 0); i++) hb.box('solid', (r() - 0.5) * (w - 4), top + 0.35, (r() - 0.5) * (d - 4), 1.6 + r(), 1.0 + r() * 0.6, 1.4 + r(), 0x9aa5b1);
    if (s.kind === 'tower') { hb.box('solid', 0, top + 0.35, 0, 0.3, 6, 0.3, 0xc6ced8); hb.box('glow', 0, top + 6.2, 0, 0.5, 0.5, 0.5, 0xff3a3a); }
  }
}

// ------------------------------------------------------------------ main entry
// out = { solid, glass, glow } MeshBuilders (geometry lods) — pass null with lod 'collide'
export function buildHouse(spec, lod, out) {
  const collide = lod === 'collide' || lod === 0 ? [] : null;
  const hb = new HB(spec, lod === 'collide' ? null : out, collide);
  const { w, d, floors } = spec;
  const tpl = KINDS[spec.kind].tpl;
  const top = hb.floorH(floors);
  const wallCol = spec.wall;
  const trim = spec.trim;
  if (lod === 2) {
    hb.box('solid', 0, 0, 0, w, top, d, wallCol);
    buildRoof(hb, top);
    return { colliders: null, loot: [] };
  }
  const lay = LAYOUT[tpl](hb);
  const doorW = 1.2;
  const doorC = lay.doorX;
  const frontOps = [{ s0: w / 2 + doorC - doorW / 2, s1: w / 2 + doorC + doorW / 2, kind: 'door' }];
  const keepFront = [[frontOps[0].s0, frontOps[0].s1]];
  const ww = lay.bigWindows ? 2.4 : 1.3;
  if (lod === 1) {
    // shell: solid box walls + painted window/door quads + roof
    hb.box('solid', 0, 0, 0, w, top, d, wallCol);
    hb.box('solid', 0, -0.4, 0, w + 0.3, 0.7, d + 0.3, 0x7d7f86);
    const glassCol = 0x2d556e;
    for (let f = 0; f < floors; f++) {
      const yb = hb.floorH(f) + 1.0;
      for (const [len, sideKeep, fixedLocal, axis, sign] of [[w, f === 0 ? keepFront : [], d / 2 + 0.03, 'x', 1], [w, [], -d / 2 - 0.03, 'x', -1], [d, [], w / 2 + 0.03, 'z', 1], [d, [], -w / 2 - 0.03, 'z', -1]]) {
        for (const op of windowsFor(len, sideKeep, ww, 3.4)) {
          const mid = -len / 2 + (op.s0 + op.s1) / 2;
          if (axis === 'x') hb.box('solid', mid, yb, fixedLocal, op.s1 - op.s0, 1.1, 0.04, glassCol);
          else hb.box('solid', fixedLocal, yb, mid, 0.04, 1.1, op.s1 - op.s0, glassCol);
        }
      }
    }
    hb.box('solid', doorC, 0.1, d / 2 + 0.04, doorW, 2.1, 0.05, INT.wood);
    buildRoof(hb, top);
    return { colliders: null, loot: [] };
  }

  // ---------------- full interior (lod 0) / collision pass
  // exterior walls per floor
  const wallOut = wallCol;
  for (let f = 0; f < floors; f++) {
    const intColor = INT.walls[(spec.seed + f) % INT.walls.length];
    const stairOn = lay.stairRect && f < floors - 1;
    const keepOnFront = f === 0 ? keepFront : [];
    const frontO = (f === 0 ? frontOps : []).concat(windowsFor(w, keepOnFront.concat(layoutKeeps(lay, f, 'front', w, d)), ww, 3.4));
    const backO = windowsFor(w, layoutKeeps(lay, f, 'back', w, d), ww, 3.4);
    const sideO = windowsFor(d - 2 * E, layoutKeeps(lay, f, 'side', w, d), 1.3, 3.6);
    if (lay.rollerDoor && f === 0) frontO.push({ s0: w / 2 + 3.2 - 0, s1: w / 2 + 3.2 + 3.4, kind: 'open' });
    const rollerFilter = (ops) => ops.filter((o) => !(lay.rollerDoor && o.kind === 'window' && f === 0 && o.s1 > w / 2 + 2.6 && o.s0 < w / 2 + 6.8));
    wallRun(hb, f, 'x', d / 2 - E / 2, -w / 2, w / 2, E, rollerFilter(frontO), true, 1, wallOut, intColor, trim);
    wallRun(hb, f, 'x', -d / 2 + E / 2, -w / 2, w / 2, E, backO, true, -1, wallOut, intColor, trim);
    wallRun(hb, f, 'z', -w / 2 + E / 2, -d / 2 + E, d / 2 - E, E, sideO, true, -1, wallOut, intColor, trim);
    wallRun(hb, f, 'z', w / 2 - E / 2, -d / 2 + E, d / 2 - E, E, sideO, true, 1, wallOut, intColor, trim);
    void stairOn;
  }
  for (const wl of lay.walls) wallRun(hb, wl.f, wl.axis, wl.fixed, wl.c0, wl.c1, I, wl.ops, false, 0, wl.c, wl.c ?? intColorFallback(spec), trim);
  // plinth and floors
  hb.box('solid', 0, -0.5, 0, w + 0.3, 0.6, d + 0.3, 0x7d7f86, 0, true);
  const floorCol = INT.floors[spec.seed % INT.floors.length];
  hb.box('solid', 0, -0.4, 0, w - 0.1, 0.5, d - 0.1, floorCol, 0, true);
  let holes = [];
  if (lay.stairRect) {
    for (let f = 0; f < floors - 1; f++) {
      const r = lay.stairRect;
      const hole = stairs(hb, f, r.x, r.z, r.dir, r.wid, 0x9a6b44);
      holes[f + 1] = hole;
    }
  }
  for (let f = 1; f < floors; f++) slab(hb, f, w, d, holes[f] || null, INT.floors[(spec.seed + f) % INT.floors.length]);
  slab(hb, floors, w, d, null, INT.ceiling);
  // upper floor guard rails around stair holes
  for (let f = 1; f < floors; f++) if (holes[f]) {
    const h = holes[f];
    const y = hb.floorH(f);
    hb.box('solid', (h.x0 + h.x1) / 2, y, h.z1 + 0.04, h.x1 - h.x0, 1.0, 0.05, 0x7a5232, 0, true);
  }
  // rooms: furniture + lamps
  if (lod === 0 || lod === 'collide') for (const r of lay.rooms) furnish(hb, r, { avoid: lay.stairRect && r.f === 0 ? stairBox(lay.stairRect) : null });
  else for (const r of lay.rooms) furnishLoot(hb, r);
  // front porch details
  if (spec.kind !== 'warehouse') {
    hb.box('solid', doorC, -0.2, d / 2 + 0.7, 2.4, 0.3, 1.2, 0xb8b8b8);
    if (spec.roof !== 'flat' && floors === 1) for (const sx of [-1.1, 1.1]) hb.box('solid', doorC + sx, 0.1, d / 2 + 1.1, 0.12, 2.6, 0.12, trim);
  }
  buildRoof(hb, top);
  return { colliders: hb.col, loot: hb.loot };
}

function intColorFallback(spec) { return INT.walls[spec.seed % INT.walls.length]; }
function stairBox(r) { const len = 14 * 0.27; const x1 = r.dir[0] ? r.x + len : r.x + r.wid / 2; const z1 = r.dir[1] ? r.z + len : r.z + r.wid / 2; return { x0: r.dir[0] ? r.x : r.x - r.wid / 2, x1, z0: r.dir[1] ? r.z : r.z - r.wid / 2, z1 }; }
function layoutKeeps(lay, f, side, w, d) {
  const keeps = [];
  for (const wl of lay.walls) {
    if (wl.f !== f) continue;
    if (side === 'side') { if (wl.axis === 'x') keeps.push([wl.fixed - (-d / 2 + E) - 0.0, wl.fixed - (-d / 2 + E) + 0.0]); }
    else if (wl.axis === 'z') keeps.push([wl.fixed + w / 2, wl.fixed + w / 2]);
  }
  return keeps;
}
function furnishLoot(hb, r) { /* lod-1 style placeholder: loot points only (no furniture geometry) */ }

// Loot + colliders without geometry (cheap; used when a cell enters physics range).
export function collectHouse(spec) { return buildHouse(spec, 'collide', null); }

export function newBuilders() { return { solid: new MeshBuilder(), glass: new MeshBuilder(), glow: new MeshBuilder() }; }
