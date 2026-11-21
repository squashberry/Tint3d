// Splat Island terrain generator (pure data — no THREE dependency).
// Bakes a heightmap, biome weights, river, lake, POI pads, road network and bridges.

import { makeNoise, clamp, lerp, smoothstep } from './noise.js';
import * as C from './config.js';

const { HALF, N, NV, CELL } = C;

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, pr) {
    const a = this.a;
    a.push([pr, item]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

// Height lookup that matches the render mesh triangulation exactly.
function sampleGrid(arr, x, z) {
  let fx = (x + HALF) / CELL;
  let fz = (z + HALF) / CELL;
  fx = clamp(fx, 0, N - 1e-4);
  fz = clamp(fz, 0, N - 1e-4);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i00 = iz * NV + ix;
  const h00 = arr[i00];
  const h10 = arr[i00 + 1];
  const h01 = arr[i00 + NV];
  const h11 = arr[i00 + NV + 1];
  if (tx + tz <= 1) return h00 + tx * (h10 - h00) + tz * (h01 - h00);
  return h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);
}

function catmull(pts, perSeg = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function resample(points, step) {
  const out = [points[0].slice()];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let ax = out[out.length - 1][0];
    let az = out[out.length - 1][1];
    const bx = points[i][0];
    const bz = points[i][1];
    let seg = Math.hypot(bx - ax, bz - az);
    while (seg + carry >= step) {
      const t = (step - carry) / seg;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az);
      carry = 0;
    }
    carry += seg;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1) out.push(last.slice());
  return out;
}

function chaikin(points, iterations) {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

export function generateTerrain({ seed = 20260, bias = C.ISLAND_BIAS } = {}) {
  const nzA = makeNoise(seed);
  const nzB = makeNoise(seed + 7);
  const nzC = makeNoise(seed + 19);
  const lake = C.LAKE;
  const vol = C.VOLCANO;
  const V = NV * NV;

  // ---------------------------------------------------------------- island mask
  function maskAt(x, z) {
    const u = x / HALF;
    const v = z / HALF;
    const au = Math.abs(u);
    const av = Math.abs(v);
    const d = Math.cbrt(au * au * au + av * av * av);
    const wob = nzA.fbm(u * 1.9 + 11, v * 1.9 - 7, 4) * 0.17 + nzA.fbm(u * 5.5 + 3, v * 5.5, 3) * 0.045;
    let m = bias - d + wob;
    m -= 1.6 * smoothstep(0.86, 0.97, Math.max(au, av));
    for (const s of C.ISLETS) {
      const dd = Math.hypot(x - s.x, z - s.z) / s.r;
      if (dd < 1.6) m = Math.max(m, 0.11 * (1 - dd / 1.35) + 0.03 * nzB.fbm(x / 40, z / 40, 2));
    }
    return m;
  }

  // ---------------------------------------------------------------- biomes
  function biomeWeights(x, z, out) {
    const qx = x + 170 * nzB.fbm(x / 800 + 3, z / 800, 3);
    const qz = z + 170 * nzB.fbm(x / 800, z / 800 + 9, 3);
    let sum = 0;
    for (let b = 0; b < 5; b++) {
      const dx = (qx - C.BIOME_CENTERS[b][0]) / 720;
      const dz = (qz - C.BIOME_CENTERS[b][1]) / 720;
      const e = Math.exp(-(dx * dx + dz * dz) * 14);
      out[b] = e;
      sum += e;
    }
    for (let b = 0; b < 5; b++) out[b] /= sum;
    return out;
  }
  const hMeadow = (x, z) => 9 + 10 * nzA.fbm(x / 420 + 40, z / 420 + 5, 4) + 2.2 * nzC.fbm(x / 70, z / 70, 2);
  const hForest = (x, z) => 17 + 14 * nzA.fbm(x / 300 - 20, z / 300 + 60, 4) + 2 * nzC.fbm(x / 60, z / 60, 2);
  const hSnow = (x, z) => 22 + 56 * nzC.ridged(x / 540 + 10, z / 540 - 30, 4) + 4 * nzA.fbm(x / 110, z / 110, 2);
  const hDesert = (x, z) =>
    8 + 6 * nzB.fbm(x / 380, z / 190 + 8, 3) + 13 * smoothstep(0.24, 0.3, nzC.fbm(x / 520 + 70, z / 520 - 9, 3)) + 1.2 * nzA.fbm(x / 40, z / 25, 2);
  const hVolc = (x, z) => 16 + 9 * nzA.fbm(x / 260, z / 260 + 3, 3);
  const coneH = (r) => 95 * Math.exp(-((r / 300) * (r / 300))) - 42 * smoothstep(95, 55, r);

  const _bw = new Float32Array(5);
  function baseHeight(x, z, w) {
    let h = 0;
    if (w[0] > 0.01) h += w[0] * hMeadow(x, z);
    if (w[1] > 0.01) h += w[1] * hForest(x, z);
    if (w[2] > 0.01) h += w[2] * hSnow(x, z);
    if (w[3] > 0.01) h += w[3] * hDesert(x, z);
    if (w[4] > 0.01) h += w[4] * hVolc(x, z);
    const vr = Math.hypot(x - vol.x, z - vol.z);
    if (vr < 700) h += coneH(vr);
    return h;
  }

  // ---------------------------------------------------------------- raw heightfield
  const H = new Float32Array(V);
  const biomeW = new Uint8Array(V * 5);
  for (let iz = 0; iz < NV; iz++) {
    const z = -HALF + iz * CELL;
    for (let ix = 0; ix < NV; ix++) {
      const x = -HALF + ix * CELL;
      const i = iz * NV + ix;
      const m = maskAt(x, z);
      biomeWeights(x, z, _bw);
      for (let b = 0; b < 5; b++) biomeW[i * 5 + b] = Math.round(_bw[b] * 255);
      const coast = m < 0 ? -16 * (1 - Math.exp(m * 14)) : m * 40;
      let h;
      if (m < 0.02) h = coast;
      else h = lerp(coast, baseHeight(x, z, _bw), smoothstep(0.02, 0.16, m));
      H[i] = h;
    }
  }

  // ---------------------------------------------------------------- lake
  const lakeRadius = (ang) => lake.r * (1 + 0.16 * nzC.fbm(Math.cos(ang) * 1.3 + 5, Math.sin(ang) * 1.3, 2));
  function lakeRn(x, z) {
    const dx = x - lake.x;
    const dz = z - lake.z;
    return Math.hypot(dx, dz) / lakeRadius(Math.atan2(dz, dx));
  }
  {
    const reach = Math.ceil((lake.r * 1.4 * 1.7) / CELL) + 2;
    const cx = Math.round((lake.x + HALF) / CELL);
    const cz = Math.round((lake.z + HALF) / CELL);
    for (let iz = Math.max(0, cz - reach); iz <= Math.min(N, cz + reach); iz++) {
      for (let ix = Math.max(0, cx - reach); ix <= Math.min(N, cx + reach); ix++) {
        const x = -HALF + ix * CELL;
        const z = -HALF + iz * CELL;
        const rn = lakeRn(x, z);
        if (rn >= 1.65) continue;
        const i = iz * NV + ix;
        const bed = lake.level - 5.2 + 6.4 * smoothstep(0.5, 1.0, rn);
        const target = rn < 1 ? bed : rn < 1.05 ? lake.level + 1.2 : lake.level + 1.2 + (rn - 1.05) * 3;
        const w = 1 - smoothstep(1.05, 1.65, rn);
        H[i] = lerp(H[i], target, w);
      }
    }
  }

  // ---------------------------------------------------------------- river
  let riverPts = catmull(C.RIVER_WAYPOINTS, 12);
  {
    const cut = riverPts.findIndex((p, idx) => idx > 8 && maskAt(p[0], p[1]) < 0.012);
    if (cut > 0) riverPts = riverPts.slice(0, cut + 1);
    riverPts = resample(riverPts, 8);
  }
  const river = [];
  {
    let len = 0;
    const cum = [0];
    for (let i = 1; i < riverPts.length; i++) {
      len += Math.hypot(riverPts[i][0] - riverPts[i - 1][0], riverPts[i][1] - riverPts[i - 1][1]);
      cum.push(len);
    }
    for (let i = 0; i < riverPts.length; i++) {
      const s = cum[i] / len;
      river.push({ x: riverPts[i][0], z: riverPts[i][1], s, bed: lerp(5.5, -1.4, Math.pow(s, 0.85)), hw: 9 + 10 * s });
    }
  }
  const riverD = new Float32Array(V).fill(1e9);
  const riverHW = new Float32Array(V).fill(9);
  const riverBed = new Float32Array(V).fill(0);
  {
    const reach = 300;
    for (let k = 0; k < river.length - 1; k++) {
      const a = river[k];
      const b = river[k + 1];
      const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach + HALF) / CELL));
      const ix1 = Math.min(N, Math.ceil((Math.max(a.x, b.x) + reach + HALF) / CELL));
      const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach + HALF) / CELL));
      const iz1 = Math.min(N, Math.ceil((Math.max(a.z, b.z) + reach + HALF) / CELL));
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const l2 = sx * sx + sz * sz || 1;
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = -HALF + iz * CELL;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = -HALF + ix * CELL;
          const t = clamp(((x - a.x) * sx + (z - a.z) * sz) / l2, 0, 1);
          const d = Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t));
          const i = iz * NV + ix;
          if (d < riverD[i]) {
            riverD[i] = d;
            riverHW[i] = lerp(a.hw, b.hw, t);
            riverBed[i] = lerp(a.bed, b.bed, t);
          }
        }
      }
    }
    for (let i = 0; i < V; i++) {
      const d = riverD[i];
      if (d > reach) continue;
      const hw = riverHW[i];
      const bed = riverBed[i];
      const dd = Math.max(0, d - hw);
      const cap = bed + 2.2 + 0.2 * dd + smoothstep(120, 260, d) * 400;
      let h = Math.min(H[i], cap);
      if (d < hw) h = lerp(h, bed, 1 - smoothstep(hw * 0.7, hw, d));
      H[i] = h;
    }
  }
  const riverMargin = (x, z) => {
    // Distance from the water's edge (negative inside the channel).
    const fx = clamp((x + HALF) / CELL, 0, N - 1e-4);
    const fz = clamp((z + HALF) / CELL, 0, N - 1e-4);
    const i = Math.floor(fz) * NV + Math.floor(fx);
    return riverD[i] - riverHW[i];
  };

  // ---------------------------------------------------------------- POI siting
  const hAt = (x, z) => sampleGrid(H, x, z);
  const craterDist = (x, z) => Math.hypot(x - vol.x, z - vol.z);
  const discStats = (x, z, rad) => {
    let sum = 0;
    let min = 1e9;
    let max = -1e9;
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * Math.PI * 2;
      const rr = k === 0 ? 0 : rad;
      const h = hAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      sum += h;
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    return { avg: sum / n, min, max };
  };
  const placed = [];
  function validSite(x, z, def) {
    if (maskAt(x, z) < 0.11) return false;
    if (lakeRn(x, z) < 1.75) return false;
    if (riverMargin(x, z) < def.r * 0.95 + 35) return false;
    if (craterDist(x, z) < 190) return false;
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + def.r + 45) return false;
    }
    return discStats(x, z, def.r * 0.7).min > 3.5;
  }
  for (const def of C.POI_DEFS) {
    let x = def.x;
    let z = def.z;
    if (def.fixed) {
      // keep as authored
    } else if (def.coast) {
      const len = Math.hypot(def.coast[0], def.coast[1]);
      const dx = def.coast[0] / len;
      const dz = def.coast[1] / len;
      let t = 200;
      while (t < 2300 && maskAt(dx * t, dz * t) > 0.012) t += 8;
      x = dx * t;
      z = dz * t;
    } else {
      let best = null;
      for (let rad = 0; rad <= 420 && !best; rad += 25) {
        const steps = rad === 0 ? 1 : 18;
        let bestScore = 1e9;
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2 + rad * 0.37;
          const cx = def.x + Math.cos(a) * rad;
          const cz = def.z + Math.sin(a) * rad;
          if (!validSite(cx, cz, def)) continue;
          const st = discStats(cx, cz, def.r * 0.7);
          let score = (st.max - st.min) + rad * 0.02;
          if (def.prefer === 'high') score -= st.avg * 0.35;
          if (score < bestScore) {
            bestScore = score;
            best = { x: cx, z: cz };
          }
        }
      }
      if (best) {
        x = best.x;
        z = best.z;
      } else {
        console.warn('[SplatIsland] no valid site near', def.id);
      }
    }
    placed.push({ ...def, x, z });
  }

  // ---------------------------------------------------------------- pads, crater, ponds
  const waterBodies = [];
  const pois = [];
  for (const def of placed) {
    const poi = { ...def, y: 0 };
    if (def.kind === 'crater') {
      const floor = hAt(def.x, def.z);
      poi.y = floor;
      poi.craterFloor = floor;
      const reach = 76;
      const ix0 = Math.max(0, Math.floor((def.x - reach + HALF) / CELL));
      const ix1 = Math.min(N, Math.ceil((def.x + reach + HALF) / CELL));
      const iz0 = Math.max(0, Math.floor((def.z - reach + HALF) / CELL));
      const iz1 = Math.min(N, Math.ceil((def.z + reach + HALF) / CELL));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = -HALF + ix * CELL;
          const z = -HALF + iz * CELL;
          const r = Math.hypot(x - def.x, z - def.z);
          if (r > 72) continue;
          const profile = floor - 3.4 * (1 - smoothstep(18, 42, r)) + 2 * smoothstep(42, 60, r);
          const i = iz * NV + ix;
          H[i] = lerp(H[i], profile, 1 - smoothstep(56, 72, r));
        }
      }
      waterBodies.push({ type: 'lava', x: def.x, z: def.z, r: 36, y: floor - 1.4 });
      pois.push(poi);
      continue;
    }
    let target;
    if (def.kind === 'lakeManor') target = lake.level + 3.6;
    else if (def.kind === 'docks') target = 2.7;
    else if (def.kind === 'lighthouse') target = 5.5;
    else target = Math.max(3.4, discStats(def.x, def.z, def.r * 0.65).avg);
    poi.y = target;
    const reach = def.r * 1.55 + 8;
    const ix0 = Math.max(0, Math.floor((def.x - reach + HALF) / CELL));
    const ix1 = Math.min(N, Math.ceil((def.x + reach + HALF) / CELL));
    const iz0 = Math.max(0, Math.floor((def.z - reach + HALF) / CELL));
    const iz1 = Math.min(N, Math.ceil((def.z + reach + HALF) / CELL));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = -HALF + ix * CELL;
        const z = -HALF + iz * CELL;
        const d = Math.hypot(x - def.x, z - def.z);
        const w = 1 - smoothstep(def.r * 0.8, def.r * 1.5, d);
        if (w <= 0) continue;
        const i = iz * NV + ix;
        H[i] = lerp(H[i], target, w);
      }
    }
    if (def.kind === 'oasis') {
      const pr = 30;
      waterBodies.push({ type: 'pond', x: def.x, z: def.z, r: pr, y: target - 0.9 });
      const rr = pr * 1.4;
      for (let iz = Math.floor((def.z - rr + HALF) / CELL); iz <= Math.ceil((def.z + rr + HALF) / CELL); iz++) {
        for (let ix = Math.floor((def.x - rr + HALF) / CELL); ix <= Math.ceil((def.x + rr + HALF) / CELL); ix++) {
          const x = -HALF + ix * CELL;
          const z = -HALF + iz * CELL;
          const rn = Math.hypot(x - def.x, z - def.z) / pr;
          if (rn >= 1.4) continue;
          const i = iz * NV + ix;
          const bed = target - 3.4 + 3.4 * smoothstep(0.3, 1.05, rn);
          H[i] = lerp(H[i], bed, 1 - smoothstep(1.0, 1.4, rn));
        }
      }
    }
    if (def.kind === 'snowVillage') waterBodies.push({ type: 'ice', x: def.x, z: def.z, r: 26, y: target + 0.06 });
    pois.push(poi);
  }

  // ---------------------------------------------------------------- road network
  const NAV = 64;
  const NAVC = (HALF * 2) / NAV;
  const nodeX = (i) => -HALF + (i + 0.5) * NAVC;
  const navBase = new Float32Array(NAV * NAV);
  const navOpen = new Uint8Array(NAV * NAV);
  for (let j = 0; j < NAV; j++) {
    for (let i = 0; i < NAV; i++) {
      const x = nodeX(i);
      const z = nodeX(j);
      const h = hAt(x, z);
      const k = j * NAV + i;
      const open = h > 2 && maskAt(x, z) > 0.04 && lakeRn(x, z) > 1.2 && craterDist(x, z) > 150 && h < 105;
      navOpen[k] = open ? 1 : 0;
      if (!open) continue;
      const slope = (Math.abs(hAt(x + 50, z) - hAt(x - 50, z)) + Math.abs(hAt(x, z + 50) - hAt(x, z - 50))) / 100;
      let c = 1 + 16 * slope;
      if (riverMargin(x, z) < 14) c += 30;
      if (h > 60) c += (h - 60) * 0.08;
      navBase[k] = c;
    }
  }
  const roadUsed = new Uint8Array(NAV * NAV);
  function nearestOpen(x, z) {
    const ci = clamp(Math.floor((x + HALF) / NAVC), 0, NAV - 1);
    const cj = clamp(Math.floor((z + HALF) / NAVC), 0, NAV - 1);
    if (navOpen[cj * NAV + ci]) return cj * NAV + ci;
    for (let r = 1; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= NAV || j >= NAV) continue;
          if (navOpen[j * NAV + i]) return j * NAV + i;
        }
      }
    }
    return -1;
  }
  function astar(from, to) {
    const g = new Float32Array(NAV * NAV).fill(Infinity);
    const prev = new Int32Array(NAV * NAV).fill(-1);
    const heap = new MinHeap();
    g[from] = 0;
    heap.push(from, 0);
    const tx = to % NAV;
    const tz = Math.floor(to / NAV);
    while (heap.size) {
      const cur = heap.pop();
      if (cur === to) break;
      const cx = cur % NAV;
      const cz = Math.floor(cur / NAV);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= NAV || nz >= NAV) continue;
          const n = nz * NAV + nx;
          if (!navOpen[n]) continue;
          let c = Math.hypot(dx, dz) * NAVC * 0.5 * (navBase[cur] + navBase[n]);
          if (roadUsed[n]) c *= 0.35;
          const ng = g[cur] + c;
          if (ng < g[n]) {
            g[n] = ng;
            prev[n] = cur;
            heap.push(n, ng + Math.hypot(nx - tx, nz - tz) * NAVC * 0.3);
          }
        }
      }
    }
    if (prev[to] < 0 && from !== to) return null;
    const out = [];
    for (let c = to; c !== -1; c = prev[c]) out.push(c);
    return out.reverse();
  }

  const roadPois = pois.filter((p) => !p.noRoad);
  const edgeKey = new Set();
  const edges = [];
  const addEdge = (a, b) => {
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    edges.push([a, b]);
  };
  {
    const inTree = new Set([0]);
    while (inTree.size < roadPois.length) {
      let best = null;
      for (const a of inTree) {
        for (let b = 0; b < roadPois.length; b++) {
          if (inTree.has(b)) continue;
          const d = Math.hypot(roadPois[a].x - roadPois[b].x, roadPois[a].z - roadPois[b].z);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      inTree.add(best.b);
      addEdge(best.a, best.b);
    }
    roadPois.forEach((p, a) => {
      roadPois
        .map((q, b) => ({ b, d: a === b ? Infinity : Math.hypot(p.x - q.x, p.z - q.z) }))
        .sort((u, v) => u.d - v.d)
        .slice(0, 2)
        .forEach((n) => addEdge(a, n.b));
    });
  }

  const roadLines = [];
  for (const [ai, bi] of edges) {
    const a = roadPois[ai];
    const b = roadPois[bi];
    const na = nearestOpen(a.x, a.z);
    const nb = nearestOpen(b.x, b.z);
    if (na < 0 || nb < 0) continue;
    const path = astar(na, nb);
    if (!path) continue;
    path.forEach((n) => { roadUsed[n] = 1; });
    let pts = [[a.x, a.z]];
    for (const n of path) pts.push([nodeX(n % NAV), nodeX(Math.floor(n / NAV))]);
    pts.push([b.x, b.z]);
    pts = chaikin(pts, 3);
    pts = resample(pts, 6);
    // stop roads at the edge of each POI pad (towns carry their own street grid)
    let s0 = 0;
    while (s0 < pts.length - 2 && Math.hypot(pts[s0][0] - a.x, pts[s0][1] - a.z) < a.r * 0.78) s0++;
    let s1 = pts.length - 1;
    while (s1 > s0 + 1 && Math.hypot(pts[s1][0] - b.x, pts[s1][1] - b.z) < b.r * 0.78) s1--;
    pts = pts.slice(s0, s1 + 1);
    if (pts.length < 3) continue;
    roadLines.push({ from: a.id, to: b.id, pts });
  }

  // Heights along each road, smoothed, with bridge runs across the river.
  const roads = [];
  const bridges = [];
  for (const line of roadLines) {
    const n = line.pts.length;
    const raw = line.pts.map((p) => hAt(p[0], p[1]));
    const wet = line.pts.map((p) => riverMargin(p[0], p[1]) < 3.5);
    const wide = wet.slice();
    for (let i = 0; i < n; i++) if (wet[i]) for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < n) wide[i + k] = true;
    const smooth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let k = -7; k <= 7; k++) {
        const j = i + k;
        if (j < 0 || j >= n || wide[j]) continue;
        s += raw[j];
        c++;
      }
      smooth[i] = c ? s / c : raw[i];
    }
    for (let i = 0; i < n; i++) {
      if (!wide[i]) continue;
      let a = i;
      while (a >= 0 && wide[a]) a--;
      let b = i;
      while (b < n && wide[b]) b++;
      const ya = a >= 0 ? smooth[a] : b < n ? smooth[b] : raw[i];
      const yb = b < n ? smooth[b] : ya;
      smooth[i] = lerp(ya, yb, (i - a) / Math.max(1, b - a));
    }
    const halfW = 4.2;
    for (let i = 0; i < n; i++) {
      if (wide[i]) continue;
      const [px, pz] = line.pts[i];
      const reach = halfW + 10;
      for (let iz = Math.max(0, Math.floor((pz - reach + HALF) / CELL)); iz <= Math.min(N, Math.ceil((pz + reach + HALF) / CELL)); iz++) {
        for (let ix = Math.max(0, Math.floor((px - reach + HALF) / CELL)); ix <= Math.min(N, Math.ceil((px + reach + HALF) / CELL)); ix++) {
          const d = Math.hypot(-HALF + ix * CELL - px, -HALF + iz * CELL - pz);
          if (d > reach) continue;
          const idx = iz * NV + ix;
          if (riverD[idx] - riverHW[idx] < 2) continue;
          H[idx] = lerp(H[idx], smooth[i], 1 - smoothstep(halfW, reach, d));
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (!wet[i]) continue;
      let b = i;
      while (b + 1 < n && wet[b + 1]) b++;
      const i0 = Math.max(0, i - 2);
      const i1 = Math.min(n - 1, b + 2);
      bridges.push({
        x0: line.pts[i0][0], z0: line.pts[i0][1],
        x1: line.pts[i1][0], z1: line.pts[i1][1],
        y: (smooth[i0] + smooth[i1]) / 2, width: halfW * 2 + 2
      });
      i = b;
    }
    roads.push({
      from: line.from,
      to: line.to,
      width: halfW * 2,
      points: line.pts.map((p, i) => ({ x: p[0], z: p[1], y: smooth[i], bridge: wet[i] }))
    });
  }

  // ---------------------------------------------------------------- lava flow (descent from the crater rim)
  const lavaFlow = [];
  {
    let x = vol.x + Math.cos(0.9) * 98;
    let z = vol.z + Math.sin(0.9) * 98;
    for (let i = 0; i < 160; i++) {
      lavaFlow.push({ x, z });
      let bestH = hAt(x, z);
      let bx = x;
      let bz = z;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const nx = x + Math.cos(a) * 7;
        const nz = z + Math.sin(a) * 7;
        const h = hAt(nx, nz) - 0.01 * Math.hypot(nx - vol.x, nz - vol.z);
        if (h < bestH) { bestH = h; bx = nx; bz = nz; }
      }
      if (bx === x && bz === z) break;
      x = bx;
      z = bz;
      if (hAt(x, z) < 14 || Math.hypot(x - vol.x, z - vol.z) > 330) break;
    }
  }

  // ---------------------------------------------------------------- public API
  const heightAt = (x, z) => sampleGrid(H, x, z);
  const normalAt = (x, z, out = { x: 0, y: 1, z: 0 }) => {
    const e = 2;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    const len = Math.hypot(dx, 2 * e, dz);
    out.x = -dx / len;
    out.y = (2 * e) / len;
    out.z = -dz / len;
    return out;
  };
  const slopeAt = (x, z) => 1 - normalAt(x, z).y;
  const biomeAt = (x, z) => {
    const w = biomeWeights(x, z, new Float32Array(5));
    let best = 0;
    for (let b = 1; b < 5; b++) if (w[b] > w[best]) best = b;
    return best;
  };
  const biomeWeightsAt = (x, z, out = new Float32Array(5)) => biomeWeights(x, z, out);

  const stats = {
    landAreaKm2: 0,
    worldKm: C.WORLD / 1000,
    biomeShare: [0, 0, 0, 0, 0],
    roadKm: roads.reduce((s, r) => s + r.points.length * 6, 0) / 1000,
    bridges: bridges.length,
    riverKm: (river.length * 8) / 1000
  };
  {
    let land = 0;
    for (let i = 0; i < V; i++) {
      if (H[i] > 0) {
        land++;
        let b = 0;
        for (let k = 1; k < 5; k++) if (biomeW[i * 5 + k] > biomeW[i * 5 + b]) b = k;
        stats.biomeShare[b]++;
      }
    }
    stats.landAreaKm2 = (land * CELL * CELL) / 1e6;
    stats.biomeShare = stats.biomeShare.map((c) => c / Math.max(1, land));
  }

  return {
    seed, heights: H, biomeW, heightAt, normalAt, slopeAt, biomeAt, biomeWeightsAt, maskAt,
    isLand: (x, z) => heightAt(x, z) > 0,
    lakeRn, lakeRadius, lake, riverMargin, river, roads, bridges, pois, waterBodies, lavaFlow,
    volcano: vol, stats
  };
}
