// Vegetation, rocks and tree colliders for Splat Island (pure data, no THREE).

import { MeshBuilder } from './meshBuilder.js';
import { mulberry32, makeNoise, clamp, lerp } from './noise.js';
import * as C from './config.js';

export const PROP_TYPES = ['pine', 'pineSnow', 'oak', 'palm', 'cactus', 'dead', 'rock', 'bush'];
export const CHUNKS = 12; // props are bucketed into CHUNKS x CHUNKS cells (streamed + distance culled)

export function makePropTemplates(seed = 5) {
  const rand = mulberry32(seed);
  const t = {};
  const trunk = 0x6b4a32;

  let m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.38, 2.4, trunk, 6, 0.3);
  m.cone(0, 1.4, 0, 2.7, 4.2, 0x2f7d4a, 8);
  m.cone(0, 3.6, 0, 2.1, 3.8, 0x37894f, 8);
  m.cone(0, 5.6, 0, 1.5, 3.4, 0x3f9657, 8);
  t.pine = m;

  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.38, 2.4, trunk, 6, 0.3);
  m.cone(0, 1.4, 0, 2.7, 4.2, 0x3a6e57, 8);
  m.cone(0, 3.6, 0, 2.1, 3.8, 0xe6f1f7, 8);
  m.cone(0, 5.6, 0, 1.5, 3.4, 0xffffff, 8);
  t.pineSnow = m;

  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.5, 3.4, trunk, 6, 0.35);
  m.blob(0, 5.4, 0, 3.1, 2.7, 3.1, 0x58b04a, rand, 0.16, 1);
  m.blob(1.7, 4.4, 0.6, 2, 1.8, 2, 0x66bd55, rand, 0.16, 1);
  m.blob(-1.6, 4.6, -0.8, 2.1, 1.8, 2.1, 0x4ea642, rand, 0.16, 1);
  t.oak = m;

  m = new MeshBuilder();
  m.beam(0, 0, 0, 0.9, 6.2, 0.3, 0.55, 0x9a7a52);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    m.beam(0.9, 6.2, 0.3, 0.9 + Math.cos(a) * 3.3, 5.1 - (k % 2) * 0.5, 0.3 + Math.sin(a) * 3.3, 0.32, 0x4fae52);
  }
  m.blob(0.9, 6.2, 0.3, 0.55, 0.55, 0.55, 0x7a5a3a, rand, 0.1, 0);
  t.palm = m;

  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.6, 4.6, 0x5fa05a, 8, 0.5);
  m.blob(0, 4.7, 0, 0.55, 0.5, 0.55, 0x5fa05a, rand, 0.05, 0);
  m.cyl(0.95, 1.7, 0, 0.3, 1.9, 0x5fa05a, 6, 0.26);
  m.hcyl(0.45, 1.5, 0, 0.3, 1, 0, 0x5fa05a, 6);
  m.cyl(-0.95, 2.4, 0, 0.3, 1.6, 0x5fa05a, 6, 0.26);
  m.hcyl(-0.45, 2.2, 0, 0.3, 1, 0, 0x5fa05a, 6);
  t.cactus = m;

  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.42, 5.2, 0x4a3a34, 6, 0.16);
  m.beam(0, 2.8, 0, 1.8, 4.6, 0.4, 0.26, 0x4a3a34);
  m.beam(0, 3.6, 0, -1.6, 5.4, -0.6, 0.22, 0x4a3a34);
  m.beam(0, 4.4, 0, 0.3, 6.2, 1.2, 0.18, 0x4a3a34);
  t.dead = m;

  m = new MeshBuilder();
  m.blob(0, 0.5, 0, 1.5, 1.0, 1.3, 0x8d919b, rand, 0.3, 0);
  m.blob(1.1, 0.3, 0.5, 0.8, 0.6, 0.7, 0x9a9ea8, rand, 0.3, 0);
  t.rock = m;

  m = new MeshBuilder();
  m.blob(0, 0.55, 0, 1.0, 0.75, 1.0, 0x5aa84a, rand, 0.2, 1);
  m.blob(0.7, 0.4, 0.3, 0.6, 0.5, 0.6, 0x6bb857, rand, 0.2, 1);
  t.bush = m;
  return t;
}

export function makePropTemplatesLOD1(seed = 5) {
  const rand = mulberry32(seed + 1);
  const t = {};
  const trunk = 0x6b4a32;
  let m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.35, 1.8, trunk, 5, 0.3);
  m.cone(0, 1.2, 0, 2.4, 6.6, 0x34874f, 6);
  t.pine = m;
  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.35, 1.8, trunk, 5, 0.3);
  m.cone(0, 1.2, 0, 2.4, 4.6, 0x3a6e57, 6);
  m.cone(0, 4.2, 0, 1.7, 3.0, 0xf2f8fb, 6);
  t.pineSnow = m;
  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.45, 3.2, trunk, 5, 0.35);
  m.blob(0, 5.2, 0, 3.3, 2.9, 3.3, 0x5ab04b, rand, 0.15, 0);
  t.oak = m;
  m = new MeshBuilder();
  m.beam(0, 0, 0, 0.9, 6.2, 0.3, 0.6, 0x9a7a52);
  m.cone(0.9, 5.2, 0.3, 3.3, 1.8, 0x4fae52, 6);
  t.palm = m;
  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.6, 4.6, 0x5fa05a, 5, 0.5);
  t.cactus = m;
  m = new MeshBuilder();
  m.cyl(0, 0, 0, 0.42, 5.2, 0x4a3a34, 4, 0.16);
  t.dead = m;
  m = new MeshBuilder();
  m.blob(0, 0.5, 0, 1.6, 1.0, 1.4, 0x8d919b, rand, 0.3, 0);
  t.rock = m;
  m = new MeshBuilder();
  m.blob(0, 0.55, 0, 1.2, 0.85, 1.2, 0x5aa84a, rand, 0.2, 0);
  t.bush = m;
  return t;
}

export function scatterProps(T, P, seed = 7) {
  const rand = mulberry32(seed);
  const nz = makeNoise(seed + 31);
  const { HALF, NV, CELL } = C;
  const blocked = new Uint8Array(NV * NV);
  const disc = (x, z, r) => {
    const ix0 = Math.max(0, Math.floor((x - r + HALF) / CELL));
    const ix1 = Math.min(NV - 1, Math.ceil((x + r + HALF) / CELL));
    const iz0 = Math.max(0, Math.floor((z - r + HALF) / CELL));
    const iz1 = Math.min(NV - 1, Math.ceil((z + r + HALF) / CELL));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = -HALF + ix * CELL - x;
        const dz = -HALF + iz * CELL - z;
        if (dx * dx + dz * dz <= r * r) blocked[iz * NV + ix] = 1;
      }
    }
  };
  for (const c of P.clearings) disc(c.x, c.z, c.r);
  for (const r of T.roads) for (const p of r.points) disc(p.x, p.z, 7);
  for (const lr of P.localRoads) {
    for (let i = 0; i < lr.pts.length - 1; i++) {
      const [ax, az] = lr.pts[i];
      const [bx, bz] = lr.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
      for (let k = 0; k <= n; k++) disc(lerp(ax, bx, k / n), lerp(az, bz, k / n), lr.width * 0.5 + 3);
    }
  }
  for (const c of P.colliders) disc(c.x, c.z, Math.hypot(c.hx, c.hz) + 3);
  for (const wbody of T.waterBodies) disc(wbody.x, wbody.z, wbody.r + 5);
  for (const f of T.lavaFlow) disc(f.x, f.z, 8);

  const isBlocked = (x, z) => {
    const ix = Math.round((x + HALF) / CELL);
    const iz = Math.round((z + HALF) / CELL);
    if (ix < 0 || iz < 0 || ix >= NV || iz >= NV) return true;
    return blocked[iz * NV + ix] === 1;
  };

  const lists = {};
  PROP_TYPES.forEach((k) => { lists[k] = []; });
  const treeCol = [];
  const w5 = new Float32Array(5);

  const add = (type, x, z, scale, tintVar = 0.12, collide = 0) => {
    const y = T.heightAt(x, z);
    const tint = 1 + (rand() - 0.5) * 2 * tintVar;
    lists[type].push({ x, y: y - 0.15, z, rot: rand() * Math.PI * 2, sx: scale * (0.9 + rand() * 0.2), sy: scale * (0.85 + rand() * 0.3), tr: tint * (0.96 + rand() * 0.08), tg: tint, tb: tint * (0.96 + rand() * 0.08) });
    if (collide) treeCol.push(x, z, collide * scale);
  };

  const S = 10;
  for (let gz = -HALF; gz < HALF; gz += S) {
    for (let gx = -HALF; gx < HALF; gx += S) {
      const x = gx + rand() * S;
      const z = gz + rand() * S;
      if (T.maskAt(x, z) < 0.012) continue;
      const h = T.heightAt(x, z);
      if (h < 1.1) continue;
      if (isBlocked(x, z)) continue;
      if (T.slopeAt(x, z) > 0.24) continue;
      T.biomeWeightsAt(x, z, w5);
      let b = 0;
      for (let k = 1; k < 5; k++) if (w5[k] > w5[b]) b = k;
      const r = rand();
      const n = nz.fbm(x / 160, z / 160, 2);
      if (h < 3.2) {
        if (b !== 2 && b !== 4 && r < 0.035) add('palm', x, z, 0.9 + rand() * 0.5, 0.08, 0.5);
        continue;
      }
      if (b === 1) {
        const dens = n < -0.3 ? 0.12 : 0.5;
        if (r < dens) add(rand() < 0.72 ? 'pine' : rand() < 0.8 ? 'oak' : 'dead', x, z, 0.85 + rand() * 0.75, 0.1, 0.55);
      } else if (b === 0) {
        const dens = n > 0.2 ? 0.26 : 0.035;
        if (r < dens) add(rand() < 0.8 ? 'oak' : 'pine', x, z, 0.8 + rand() * 0.8, 0.1, 0.6);
      } else if (b === 2) {
        if (h < 80 && r < 0.2) add('pineSnow', x, z, 0.8 + rand() * 0.8, 0.05, 0.5);
      } else if (b === 3) {
        if (r < 0.012) {
          const q = rand();
          add(q < 0.6 ? 'cactus' : q < 0.78 ? 'palm' : 'dead', x, z, 0.8 + rand() * 0.6, 0.08, 0.5);
        }
      } else if (r < 0.03) add('dead', x, z, 0.8 + rand() * 0.6, 0.05, 0.4);
    }
  }
  const oasis = T.pois.find((p) => p.kind === 'oasis');
  if (oasis) {
    for (let k = 0; k < 16; k++) {
      const a = rand() * Math.PI * 2;
      const rr = 34 + rand() * 14;
      const x = oasis.x + Math.cos(a) * rr;
      const z = oasis.z + Math.sin(a) * rr;
      if (!T.waterBodies.some((w) => Math.hypot(x - w.x, z - w.z) < w.r + 2)) add('palm', x, z, 1.1 + rand() * 0.5, 0.06, 0.5);
    }
  }
  for (let gz = -HALF; gz < HALF; gz += 22) {
    for (let gx = -HALF; gx < HALF; gx += 22) {
      const x = gx + rand() * 22;
      const z = gz + rand() * 22;
      if (T.maskAt(x, z) < 0.012) continue;
      if (T.heightAt(x, z) < 1.5 || isBlocked(x, z)) continue;
      const slope = T.slopeAt(x, z);
      if (rand() < 0.1 + slope * 1.8) add('rock', x, z, 0.7 + rand() * (1 + slope * 4), 0.1, 1.2);
    }
  }
  for (let gz = -HALF; gz < HALF; gz += 14) {
    for (let gx = -HALF; gx < HALF; gx += 14) {
      const x = gx + rand() * 14;
      const z = gz + rand() * 14;
      if (T.maskAt(x, z) < 0.03) continue;
      if (T.heightAt(x, z) < 2.5 || isBlocked(x, z) || T.slopeAt(x, z) > 0.2) continue;
      T.biomeWeightsAt(x, z, w5);
      if (w5[0] + w5[1] > 0.6 && rand() < 0.1) add('bush', x, z, 0.8 + rand() * 0.7, 0.12);
    }
  }

  // dense undergrowth ring around the hidden single houses ("a few in the bushes")
  for (const ring of P.bushRings || []) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + rand() * 0.3;
      const rad = ring.r + 1 + rand() * 7;
      const x = ring.x + Math.cos(a) * rad;
      const z = ring.z + Math.sin(a) * rad;
      if (T.heightAt(x, z) < 2) continue;
      const q = rand();
      if (q < 0.6) { add('bush', x, z, 0.9 + rand() * 0.9, 0.12); continue; }
      T.biomeWeightsAt(x, z, w5);
      let b = 0;
      for (let j = 1; j < 5; j++) if (w5[j] > w5[b]) b = j;
      const type = b === 2 ? 'pineSnow' : b === 3 ? 'cactus' : b === 1 ? (rand() < 0.6 ? 'pine' : 'oak') : 'oak';
      add(type, x, z, 0.9 + rand() * 0.7, 0.1, 0.55);
    }
  }

  const out = [];
  const csize = C.WORLD / CHUNKS;
  for (const type of PROP_TYPES) {
    const buckets = new Map();
    for (const it of lists[type]) {
      const cx = clamp(Math.floor((it.x + HALF) / csize), 0, CHUNKS - 1);
      const cz = clamp(Math.floor((it.z + HALF) / csize), 0, CHUNKS - 1);
      const key = cz * CHUNKS + cx;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    for (const [key, items] of buckets) {
      const matrices = new Float32Array(items.length * 16);
      const colors = new Float32Array(items.length * 3);
      items.forEach((it, i) => {
        const c = Math.cos(it.rot);
        const s = Math.sin(it.rot);
        const o = i * 16;
        matrices[o] = it.sx * c; matrices[o + 2] = -it.sx * s;
        matrices[o + 5] = it.sy;
        matrices[o + 8] = it.sx * s; matrices[o + 10] = it.sx * c;
        matrices[o + 12] = it.x; matrices[o + 13] = it.y; matrices[o + 14] = it.z; matrices[o + 15] = 1;
        colors[i * 3] = it.tr; colors[i * 3 + 1] = it.tg; colors[i * 3 + 2] = it.tb;
      });
      out.push({ type, chunk: key, count: items.length, matrices, colors });
    }
  }
  const counts = {};
  PROP_TYPES.forEach((k) => { counts[k] = lists[k].length; });
  return { instances: out, counts, treeColliders: new Float32Array(treeCol), blockedAt: isBlocked };
}
