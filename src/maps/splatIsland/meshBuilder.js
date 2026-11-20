// Tiny flat-shaded mesh builder with vertex colours (no THREE dependency).
// All primitives are authored with their base at y0 and rotate around Y.

import { hexToLinear } from './noise.js';

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  // One flat-shaded triangle (counter-clockwise when viewed from outside).
  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.pos.length / 3;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  static rgb(hex, shade = 1) {
    const c = hexToLinear(hex);
    return [c[0] * shade, c[1] * shade, c[2] * shade];
  }

  // Local (lx, lz) -> world, rotating about Y around (cx, cz). Local +Z maps to (sin rot, cos rot).
  static xf(cx, cz, rot, lx, y, lz) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
  }

  box(cx, y0, cz, sx, sy, sz, rot, hex, shade = 1) {
    const col = MeshBuilder.rgb(hex, shade);
    const hx = sx / 2, hz = sz / 2;
    const P = (lx, y, lz) => MeshBuilder.xf(cx, cz, rot, lx, y, lz);
    const y1 = y0 + sy;
    const a = P(-hx, y0, -hz), b = P(hx, y0, -hz), c = P(hx, y0, hz), d = P(-hx, y0, hz);
    const e = P(-hx, y1, -hz), f = P(hx, y1, -hz), g = P(hx, y1, hz), h = P(-hx, y1, hz);
    this.quad(e, h, g, f, col); // top
    this.quad(a, b, c, d, col.map((v) => v * 0.55)); // bottom
    this.quad(b, a, e, f, col.map((v) => v * 0.88)); // -z
    this.quad(d, c, g, h, col.map((v) => v * 0.8)); // +z
    this.quad(a, d, h, e, col.map((v) => v * 0.74)); // -x
    this.quad(c, b, f, g, col.map((v) => v * 0.92)); // +x
  }

  // Vertical cylinder / truncated cone with a closed top.
  cyl(cx, y0, cz, r, h, hex, seg = 12, rTop = r, shade = 1) {
    const col = MeshBuilder.rgb(hex, shade);
    const top = [cx, y0 + h, cz];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const b1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const t0 = [cx + Math.cos(a0) * rTop, y0 + h, cz + Math.sin(a0) * rTop];
      const t1 = [cx + Math.cos(a1) * rTop, y0 + h, cz + Math.sin(a1) * rTop];
      const sh = 0.72 + 0.28 * Math.max(0, Math.cos((a0 + a1) / 2 - 0.9));
      const c2 = col.map((v) => v * sh);
      this.quad(b1, b0, t0, t1, c2);
      if (rTop > 0.001) this.tri(top, t1, t0, col);
    }
  }

  cone(cx, y0, cz, r, h, hex, seg = 10, shade = 1) {
    this.cyl(cx, y0, cz, r, h, hex, seg, 0, shade);
  }

  // Horizontal cylinder lying along local X.
  hcyl(cx, y0, cz, r, len, rot, hex, seg = 8, shade = 1) {
    const col = MeshBuilder.rgb(hex, shade);
    const P = (lx, ly, lz) => MeshBuilder.xf(cx, cz, rot, lx, y0 + r + ly, lz);
    const hl = len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [P(-hl, Math.sin(a0) * r, Math.cos(a0) * r), P(hl, Math.sin(a0) * r, Math.cos(a0) * r)];
      const p1 = [P(-hl, Math.sin(a1) * r, Math.cos(a1) * r), P(hl, Math.sin(a1) * r, Math.cos(a1) * r)];
      const sh = 0.72 + 0.28 * Math.max(0, Math.sin((a0 + a1) / 2 + 1.2));
      this.quad(p0[0], p0[1], p1[1], p1[0], col.map((v) => v * sh));
    }
    const c0 = P(-hl, 0, 0);
    const c1 = P(hl, 0, 0);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri(c1, P(hl, Math.sin(a1) * r, Math.cos(a1) * r), P(hl, Math.sin(a0) * r, Math.cos(a0) * r), col);
      this.tri(c0, P(-hl, Math.sin(a0) * r, Math.cos(a0) * r), P(-hl, Math.sin(a1) * r, Math.cos(a1) * r), col);
    }
  }

  // Gable roof: ridge runs along local Z. w across X, d along Z, h = ridge height above y0.
  gable(cx, y0, cz, w, d, h, rot, hex, overhang = 0.5) {
    const col = MeshBuilder.rgb(hex);
    const hx = w / 2 + overhang;
    const hz = d / 2 + overhang;
    const P = (lx, y, lz) => MeshBuilder.xf(cx, cz, rot, lx, y, lz);
    const a = P(-hx, y0, -hz), b = P(hx, y0, -hz), c = P(hx, y0, hz), d2 = P(-hx, y0, hz);
    const r0 = P(0, y0 + h, -hz), r1 = P(0, y0 + h, hz);
    this.quad(a, d2, r1, r0, col.map((v) => v * 0.82));
    this.quad(c, b, r0, r1, col);
    this.tri(b, a, r0, col.map((v) => v * 0.7));
    this.tri(d2, c, r1, col.map((v) => v * 0.7));
  }

  // Four-sided pyramid / hip roof.
  pyramid(cx, y0, cz, w, d, h, rot, hex, overhang = 0.3) {
    const col = MeshBuilder.rgb(hex);
    const hx = w / 2 + overhang;
    const hz = d / 2 + overhang;
    const P = (lx, y, lz) => MeshBuilder.xf(cx, cz, rot, lx, y, lz);
    const a = P(-hx, y0, -hz), b = P(hx, y0, -hz), c = P(hx, y0, hz), d2 = P(-hx, y0, hz);
    const t = P(0, y0 + h, 0);
    this.tri(b, a, t, col.map((v) => v * 0.78));
    this.tri(c, b, t, col);
    this.tri(d2, c, t, col.map((v) => v * 0.7));
    this.tri(a, d2, t, col.map((v) => v * 0.88));
  }

  // Lumpy low-poly blob (icosahedron) for foliage and rocks.
  blob(cx, cy, cz, rx, ry, rz, hex, rand, jitter = 0.18, detail = 1) {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => {
      const l = Math.hypot(...v);
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const cache = new Map();
      const mid = (i, j) => {
        const key = i < j ? i + '_' + j : j + '_' + i;
        if (cache.has(key)) return cache.get(key);
        const a = verts[i], b = verts[j];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const l = Math.hypot(...m);
        verts.push([m[0] / l, m[1] / l, m[2] / l]);
        cache.set(key, verts.length - 1);
        return verts.length - 1;
      };
      const nf = [];
      for (const [a, b, c] of faces) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = nf;
    }
    const pts = verts.map((v) => {
      const j = 1 + (rand() - 0.5) * 2 * jitter;
      return [cx + v[0] * rx * j, cy + v[1] * ry * j, cz + v[2] * rz * j];
    });
    const col = MeshBuilder.rgb(hex);
    for (let [a, b, c] of faces) {
      const A = pts[a], B = pts[b], C = pts[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny0 = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (A[0] + B[0] + C[0]) / 3 - cx, my = (A[1] + B[1] + C[1]) / 3 - cy, mz = (A[2] + B[2] + C[2]) / 3 - cz;
      if (nx * mx + ny0 * my + nz * mz < 0) { const tmp = b; b = c; c = tmp; }
      const sh = 0.78 + 0.3 * clamp01((my / Math.max(ry, 0.001)) * 0.5 + 0.5);
      this.tri(pts[a], pts[b], pts[c], col.map((v) => v * sh));
    }
  }

  // Quad whose winding is forced to face away from `center`.
  qo(a, b, c, d, center, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - center[0];
    const my = (a[1] + b[1] + c[1] + d[1]) / 4 - center[1];
    const mz = (a[2] + b[2] + c[2] + d[2]) / 4 - center[2];
    if (nx * mx + ny * my + nz * mz >= 0) this.quad(a, b, c, d, color);
    else this.quad(a, d, c, b, color);
  }

  // Square-section beam between two arbitrary 3D points.
  beam(x0, y0, z0, x1, y1, z1, t, hex, shade = 1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    const f = [dx / len, dy / len, dz / len];
    const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const sl = Math.hypot(...s) || 1;
    s = s.map((v) => v / sl);
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const h = t / 2;
    const corner = (end, a, b) => {
      const o = end ? [x1, y1, z1] : [x0, y0, z0];
      return [o[0] + s[0] * a * h + u[0] * b * h, o[1] + s[1] * a * h + u[1] * b * h, o[2] + s[2] * a * h + u[2] * b * h];
    };
    const c0 = [corner(0, -1, -1), corner(0, 1, -1), corner(0, 1, 1), corner(0, -1, 1)];
    const c1 = [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)];
    const center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const col = MeshBuilder.rgb(hex, shade);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.qo(c0[i], c0[j], c1[j], c1[i], center, col.map((v) => v * (0.75 + 0.08 * i)));
    }
    this.qo(c0[0], c0[1], c0[2], c0[3], center, col);
    this.qo(c1[0], c1[1], c1[2], c1[3], center, col);
  }

  toArrays() {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      indices: this.pos.length / 3 > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx)
    };
  }
}
