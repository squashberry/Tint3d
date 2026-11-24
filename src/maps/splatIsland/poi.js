// Builds every landmark, town, bridge and minor structure on Splat Island.
// Output is plain data (a merged static mesh builder, colliders, loot points…).

import { MeshBuilder } from './meshBuilder.js';
import { mulberry32, lerp, smoothstep } from './noise.js';
import * as C from './config.js';

const PASTEL = [0xf4a6a0, 0xf7d58b, 0x9fd8d0, 0xc6b3e6, 0xf2ede0, 0x9cc9f2, 0xf5b9d0, 0xb8e08f];
const ROOFS = [0xc4503f, 0x5a6f8c, 0x3f7a62, 0x8a5a3c, 0x44495a, 0x9a4f6e];
const CONTAINER = [0xe4572e, 0x29a0b1, 0xf2b134, 0x6c5ce7, 0x3fa34d, 0xd6336c, 0x1c7ed6];
const WOOD = 0x8a5d3b;
const DARK = 0x2b3340;
const GLASS = 0x7fb7d6;

export function buildPOIs(T, seed = 99) {
  const rand = mulberry32(seed);
  const mb = new MeshBuilder();
  const colliders = [];
  const loot = [];
  const localRoads = [];
  const dynamic = [];
  const clearings = [];
  const landmarks = [];
  const xf = MeshBuilder.xf;
  const gy = (x, z) => T.heightAt(x, z);
  const rr = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const addCollider = (poi, x, z, w, d, rot, y0, y1) =>
    colliders.push({ kind: 'box', poi: poi.id, x, z, hx: w / 2, hz: d / 2, rot, y0, y1 });
  const addLoot = (poi, x, y, z, type = 'floor') => loot.push({ poi: poi.id, tier: poi.tier || 1, type, x, y, z });

  function baseY(x, z, w, d, rot) {
    let lo = 1e9;
    let hi = -1e9;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const p = xf(x, z, rot, (a * w) / 2, 0, (b * d) / 2);
      const h = gy(p[0], p[2]);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return { lo, hi };
  }

  // Generic building: foundation + body + roof + door + windows + collider + loot.
  function house(poi, x, z, rot, w, d, h, o = {}) {
    const { lo, hi } = baseY(x, z, w, d, rot);
    const y = o.y ?? hi;
    mb.box(x, lo - 1.2, z, w + 0.5, y - lo + 1.2, d + 0.5, rot, o.base ?? 0x7d7f86);
    mb.box(x, y, z, w, h, d, rot, o.wall ?? pick(PASTEL));
    const roof = o.roof ?? 'gable';
    const roofColor = o.roofColor ?? pick(ROOFS);
    if (roof === 'gable') mb.gable(x, y + h, z, w, d, o.roofH ?? Math.max(1.6, w * 0.38), rot, roofColor);
    else if (roof === 'hip') mb.pyramid(x, y + h, z, w, d, o.roofH ?? Math.max(1.6, Math.min(w, d) * 0.4), rot, roofColor);
    else if (roof === 'flat') mb.box(x, y + h, z, w + 0.6, 0.5, d + 0.6, rot, roofColor);
    if (o.floors !== 0 && h > 3.5) {
      const fl = o.floors ?? Math.max(1, Math.floor(h / 3.4));
      for (let k = 1; k < fl; k++) mb.box(x, y + (h / fl) * k - 0.15, z, w + 0.25, 0.3, d + 0.25, rot, o.trim ?? 0xffffff, 0.92);
    }
    const dp = xf(x, z, rot, 0, 0, d / 2 + 0.06);
    mb.box(dp[0], y, dp[2], Math.min(2, w * 0.3), Math.min(2.4, h * 0.7), 0.16, rot, o.door ?? 0x4a3526);
    if (w > 6 && h > 3) {
      const fl = Math.max(1, Math.floor(h / 3.4));
      for (const side of [1, -1]) {
        for (const k of [-1, 1]) {
          const wp = xf(x, z, rot, k * w * 0.3, 0, side * (d / 2 + 0.05));
          for (let f = 0; f < fl; f++) {
            if (side === 1 && f === 0) continue;
            mb.box(wp[0], y + (h / fl) * f + (h / fl) * 0.32, wp[2], 1.5, 1.4, 0.14, rot, GLASS);
          }
        }
      }
    }
    addCollider(poi, x, z, w, d, rot, y, y + h + 2);
    const fd = xf(x, z, rot, 0, 0, d / 2 + 1.6);
    addLoot(poi, fd[0], y + 0.1, fd[2], 'floor');
    const ch = xf(x, z, rot, w * 0.22, 0, -d * 0.2);
    addLoot(poi, ch[0], y + 0.1, ch[2], 'chest');
    return { x, z, y, w, d, h, rot };
  }

  // Tall tower with floor bands and a stepped crown.
  function tower(poi, x, z, rot, w, d, h, wall) {
    const s = house(poi, x, z, rot, w, d, h * 0.72, { wall, roof: 'none', floors: Math.floor((h * 0.72) / 3.4) });
    const y = s.y + h * 0.72;
    const w2 = w * 0.66;
    const d2 = d * 0.66;
    mb.box(x, y, z, w2, h * 0.28, d2, rot, wall, 0.96);
    for (let k = 1; k < Math.floor((h * 0.28) / 3.4); k++) mb.box(x, y + k * 3.4 - 0.15, z, w2 + 0.25, 0.3, d2 + 0.25, rot, 0xffffff, 0.92);
    mb.box(x, y + h * 0.28, z, w2 + 0.8, 0.6, d2 + 0.8, rot, DARK);
    mb.box(x + w2 * 0.2, y + h * 0.28 + 0.6, z, 0.4, h * 0.1, 0.4, rot, 0xdddddd);
    addCollider(poi, x, z, w2, d2, rot, y, y + h * 0.28);
    addLoot(poi, x, y + h * 0.28 + 0.7, z, 'chest');
    return s;
  }

  function lamp(x, z) {
    const y = gy(x, z);
    mb.cyl(x, y, z, 0.12, 4.2, 0x3a3f4a, 5);
    mb.box(x, y + 4.1, z, 0.7, 0.25, 0.7, 0, 0xfff1b0);
  }

  function container(poi, x, z, rot, y, color) {
    mb.box(x, y, z, 12, 2.5, 2.5, rot, color);
    for (let k = -4; k <= 4; k++) {
      const p = xf(x, z, rot, k * 1.3, 0, 1.27);
      mb.box(p[0], y + 0.2, p[2], 0.1, 2.1, 0.06, rot, 0x000000, 0.45 + 0.3 * (k & 1));
    }
    addCollider(poi, x, z, 12, 2.5, rot, y, y + 2.5);
  }

  // ------------------------------------------------------------------ POI builders
  const builders = {
    townCity(poi) {
      const { x, z, y } = poi;
      mb.cyl(x, y, z, 5.5, 0.9, 0xcfd3dc, 20);
      mb.cyl(x, y + 0.5, z, 4.6, 0.5, 0x58c6e8, 20);
      mb.cyl(x, y, z, 1.0, 3.4, 0xcfd3dc, 8);
      for (let k = 0; k < 5; k++) mb.blob(x + Math.cos(k * 1.26) * 1.2, y + 3.8 + (k % 2) * 0.8, z + Math.sin(k * 1.26) * 1.2, 1.0, 0.8, 1.0, [0xff6b81, 0x2ec4b6, 0xffd166, 0x7b61ff, 0x4dabf7][k], rand);
      addCollider(poi, x, z, 11, 11, 0, y, y + 4);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; lamp(x + Math.cos(a) * 20, z + Math.sin(a) * 20); }
    },

    townDesert(poi) {
      const { x, z, y } = poi;
      mb.cyl(x, y, z, 2.6, 1.2, 0xcfc3a5, 14);
      mb.cyl(x, y + 1.0, z, 2.0, 0.5, 0x3a8dbf, 14);
      const awn = [[0xe4572e, 0xf7f0e0], [0x2a9d8f, 0xf7f0e0], [0xf2b134, 0xf7f0e0], [0x6c5ce7, 0xf7f0e0]];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const sx = x + Math.cos(a) * 17;
        const sz = z + Math.sin(a) * 17;
        const sy = gy(sx, sz);
        const c = awn[k % 4];
        for (const [ox, oz] of [[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]]) mb.box(sx + ox, sy, sz + oz, 0.2, 2.6, 0.2, 0, 0x5a3d28);
        mb.box(sx, sy + 2.6, sz, 5.4, 0.2, 3.8, a, c[0]);
        mb.box(sx, sy + 2.62, sz, 5.4, 0.2, 1.3, a, c[1]);
        mb.box(sx, sy, sz, 3.6, 1.1, 1.4, a, 0x8a5d3b);
        addCollider(poi, sx, sz, 3.6, 1.4, a, sy, sy + 1.1);
        addLoot(poi, sx, sy + 1.2, sz + 2.4, 'floor');
      }
      for (const s of [-1, 1]) {
        const mx = x + s * 50;
        const mz = z - 46;
        const g = gy(mx, mz);
        mb.cyl(mx, g, mz, 3.2, 26, 0xf3e2c0, 12, 2.6);
        mb.cyl(mx, g + 26, mz, 3.8, 0.8, 0xe4572e, 12);
        mb.cone(mx, g + 26.8, mz, 3, 6, 0x2a9d8f, 12);
        addCollider(poi, mx, mz, 7, 7, 0, g, g + 30);
      }
    },

    townSnow(poi) {
      const { x, z } = poi;
      for (let k = 0; k < 9; k++) {
        const a = rand() * Math.PI * 2;
        const rd = rr(32, 46);
        const sx = x + Math.cos(a) * rd;
        const sz = z + Math.sin(a) * rd;
        const sy = gy(sx, sz);
        mb.blob(sx, sy + 0.8, sz, 0.9, 0.9, 0.9, 0xffffff, rand, 0.04);
        mb.blob(sx, sy + 2.0, sz, 0.65, 0.65, 0.65, 0xffffff, rand, 0.04);
        mb.cone(sx, sy + 1.9, sz + 0.6, 0.12, 0.7, 0xff8c42, 5);
      }
      for (let k = 0; k < 8; k++) lamp(x + Math.cos(k * 0.785) * 50, z + Math.sin(k * 0.785) * 50);
    },

    townForest(poi) {
      const { x, z, y } = poi;
      mb.cyl(x + 4, y, z + 3, 2.0, 0.5, 0x4a4f5c, 10);
      mb.cone(x + 4, y + 0.4, z + 3, 0.9, 1.8, 0xff8c42, 6);
      const tx = x - 5;
      const tz = z - 4;
      for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) mb.box(tx + ox, y, tz + oz, 0.5, 11, 0.5, 0, 0x5a3d28);
      mb.box(tx, y + 10.5, tz, 6, 0.4, 6, 0, 0x7a5232);
      mb.box(tx, y + 10.9, tz, 4.4, 2.6, 4.4, 0, 0x8a5d3b);
      mb.pyramid(tx, y + 13.5, tz, 4.4, 4.4, 2.2, 0, 0x3f7a62, 0.5);
      addCollider(poi, tx, tz, 6, 6, 0, y, y + 15);
      addLoot(poi, tx, y + 11, tz, 'chest');
    },

    townSuburb(poi) {
      const { x, z } = poi;
      for (let lx = -90; lx <= 90; lx += 30) for (const zz of [-30, 30]) lamp(x + lx, z + zz - 4.2);
    },

    town(poi) {
      const S = 44;
      const lines = [-2, -1, 0, 1, 2];
      for (const k of lines) {
        localRoads.push({ pts: [[poi.x + k * S, poi.z - 2 * S - 12], [poi.x + k * S, poi.z + 2 * S + 12]], width: 7 });
        localRoads.push({ pts: [[poi.x - 2 * S - 12, poi.z + k * S], [poi.x + 2 * S + 12, poi.z + k * S]], width: 7 });
      }
      for (let bi = -2; bi < 2; bi++) {
        for (let bj = -2; bj < 2; bj++) {
          const cx = poi.x + (bi + 0.5) * S;
          const cz = poi.z + (bj + 0.5) * S;
          const central = Math.abs(bi + 0.5) < 1.1 && Math.abs(bj + 0.5) < 1.1;
          if (Math.hypot(cx - poi.x, cz - poi.z) > poi.r * 0.9) continue;
          const wall = pick(PASTEL);
          if (central) tower(poi, cx, cz, 0, rr(20, 26), rr(20, 26), rr(30, 54), wall);
          else if (rand() < 0.45) house(poi, cx, cz, 0, rr(24, 30), rr(22, 28), rr(11, 21), { wall, roof: 'flat', roofColor: DARK });
          else for (const [ox, oz] of [[-10, -9], [10, 9]]) house(poi, cx + ox, cz + oz, rand() < 0.5 ? 0 : Math.PI / 2, rr(11, 15), rr(10, 13), rr(6, 8.5), { wall: pick(PASTEL) });
        }
      }
      const y = poi.y;
      mb.cyl(poi.x, y, poi.z, 8, 0.9, 0xcfd3dc, 20);
      mb.cyl(poi.x, y + 0.5, poi.z, 6.8, 0.5, 0x58c6e8, 20);
      mb.cyl(poi.x, y, poi.z, 1.2, 3.4, 0xcfd3dc, 8);
      for (let k = 0; k < 5; k++) mb.blob(poi.x + Math.cos(k * 1.26) * 1.4, y + 3.8 + (k % 2) * 0.8, poi.z + Math.sin(k * 1.26) * 1.4, 1.1, 0.9, 1.1, [0xff6b81, 0x2ec4b6, 0xffd166, 0x7b61ff, 0x4dabf7][k], rand);
      addCollider(poi, poi.x, poi.z, 16, 16, 0, y, y + 4);
      for (const k of lines) for (const e of [-1, 1]) { lamp(poi.x + k * S + e * 5, poi.z - 8); lamp(poi.x - 8, poi.z + k * S + e * 5); }
    },

    lakeManor(poi) {
      const { x, z, y } = poi;
      house(poi, x, z, 0, 18, 12, 8, { wall: 0xf1e8d4, roofColor: 0x7a2f3a, roofH: 5, y, floors: 2 });
      house(poi, x - 14, z + 1, 0, 9, 10, 6, { wall: 0xe8dfc9, roofColor: 0x7a2f3a, y, floors: 1 });
      house(poi, x + 14, z + 1, 0, 9, 10, 6, { wall: 0xe8dfc9, roofColor: 0x7a2f3a, y, floors: 1 });
      mb.cyl(x + 5, y, z - 9, 3.2, 14, 0xd8cfb8, 12);
      mb.cone(x + 5, y + 14, z - 9, 4.2, 5.5, 0x2a9d8f, 12);
      addCollider(poi, x + 5, z - 9, 6.4, 6.4, 0, y, y + 18);
      for (let k = -2; k <= 2; k++) mb.cyl(x + k * 3.2, y, z + 6.6, 0.35, 4.2, 0xffffff, 6);
      const pierY = C.LAKE.level + 0.45;
      mb.box(x + 40, pierY, z + 2, 26, 0.35, 3.6, 0, WOOD);
      for (let k = 0; k < 6; k++) { mb.cyl(x + 29 + k * 5, C.LAKE.level - 3, z + 0.4, 0.3, 3.9, 0x5a3d28, 5); mb.cyl(x + 29 + k * 5, C.LAKE.level - 3, z + 3.6, 0.3, 3.9, 0x5a3d28, 5); }
      mb.box(x + 44, C.LAKE.level - 0.2, z + 6.5, 7.5, 1.1, 2.6, 0.2, 0xd96c3c);
      mb.box(x + 44, C.LAKE.level + 0.8, z + 6.5, 3, 0.8, 2, 0.2, 0xf1e8d4);
      addCollider(poi, x + 40, z + 2, 26, 3.6, 0, pierY - 0.3, pierY + 0.4);
      addLoot(poi, x + 50, pierY + 0.4, z + 2, 'floor');
      addLoot(poi, x, y + 8.2, z, 'chest');
    },

    crater(poi) {
      const { x, z } = poi;
      let rim = 1e9;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        rim = Math.min(rim, gy(x + Math.cos(a) * 90, z + Math.sin(a) * 90));
      }
      const deckY = rim - 0.6;
      mb.box(x, deckY, z, 196, 0.6, 4, 0, 0x4a4f5c);
      for (const s of [-1, 1]) mb.box(x, deckY + 0.6, z + s * 1.95, 196, 0.9, 0.15, 0, 0xe4572e);
      for (const px of [-60, -30, 0, 30, 60]) {
        const g = Math.min(gy(x + px, z), poi.craterFloor);
        mb.cyl(x + px, g - 4, z, 0.9, deckY - g + 4, 0x3a3f4a, 7);
      }
      mb.box(x, deckY + 0.6, z, 6, 3.2, 6, 0, 0x3a3f4a);
      mb.pyramid(x, deckY + 3.8, z, 6, 6, 2.2, 0, 0xe4572e);
      addCollider(poi, x, z, 196, 4, 0, deckY - 0.1, deckY + 0.7);
      addCollider(poi, x, z, 6, 6, 0, deckY, deckY + 4);
      for (const px of [-75, -40, 40, 75]) addLoot(poi, x + px, deckY + 0.7, z, 'chest');
      for (let k = 0; k < 16; k++) {
        const a = rand() * Math.PI * 2;
        const r = rr(62, 84);
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        mb.cone(sx, gy(sx, sz) - 0.5, sz, rr(1.4, 3), rr(6, 14), 0x241f2b, 5);
      }
    },

    factory(poi) {
      const { x, z, y } = poi;
      house(poi, x, z - 10, 0, 60, 30, 14, { wall: 0x8da2b5, roof: 'none', floors: 0, base: 0x6b7280 });
      for (let k = -2; k <= 2; k++) mb.gable(x + k * 12, y + 14, z - 10, 12, 30, 3.6, 0, 0xc4503f, 0);
      house(poi, x - 56, z + 36, 0, 26, 18, 10, { wall: 0xc9b38f, roof: 'gable', roofColor: 0x6b4b3a });
      house(poi, x + 50, z + 40, 0, 24, 16, 9, { wall: 0xa7c0a0, roof: 'gable', roofColor: 0x4a5b63 });
      house(poi, x + 6, z + 36, 0, 14, 12, 6, { wall: 0xe6e2d6, roof: 'flat', roofColor: DARK });
      for (let k = 0; k < 3; k++) {
        const cx = x - 40 + k * 22;
        const cz = z - 56;
        for (let s = 0; s < 5; s++) mb.cyl(cx, y + s * 9, cz, 3, 9, s % 2 ? 0xf2f2f2 : 0xe4572e, 10, 2.9);
        mb.cyl(cx, y + 45, cz, 3.2, 0.6, 0x222222, 10);
        addCollider(poi, cx, cz, 6, 6, 0, y, y + 46);
      }
      for (let k = 0; k < 4; k++) {
        const cx = x + 55 - (k % 2) * 18;
        const cz = z - 52 + Math.floor(k / 2) * 18;
        mb.cyl(cx, y, cz, 7, 12, 0xcfd6dd, 14);
        mb.cyl(cx, y + 12, cz, 6.8, 1.6, 0x9aa5b1, 14, 3);
        addCollider(poi, cx, cz, 14, 14, 0, y, y + 13);
      }
      mb.hcyl(x - 30, y + 6, z + 8, 0.8, 46, 0, 0xe4572e, 6);
      mb.hcyl(x - 30, y + 7.8, z + 8, 0.8, 46, 0, 0xf2b134, 6);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          const cx = x - 78 + j * 3.2;
          const cz = z + 12 - i * 8.4;
          const stack = 1 + Math.floor(rand() * 3);
          for (let s = 0; s < stack; s++) container(poi, cx + 6, cz, Math.PI / 2, y + s * 2.5, pick(CONTAINER));
        }
      }
      for (const sx of [-1, 1]) mb.box(x + 40 + sx * 8, y, z + 4, 1.4, 22, 1.4, 0, 0xf2b134);
      mb.box(x + 40, y + 22, z + 4, 20, 2, 2.4, 0, 0xf2b134);
      mb.box(x + 40, y + 20, z + 4, 2, 2, 2, 0, 0xe4572e);
      for (const [px, pz] of [[-22, 8], [26, -42], [-10, 52]]) addLoot(poi, x + px, y + 0.2, z + pz, 'chest');
    },

    lodge(poi) {
      const { x, z, y } = poi;
      house(poi, x, z, 0, 28, 18, 7, { wall: 0x6b4a32, roof: 'none', floors: 0, base: 0x6f737b });
      mb.gable(x, y + 7, z, 28, 18, 12, 0, 0xf4f8ff, 1.2);
      mb.box(x - 8, y + 12, z, 2.4, 11, 2.4, 0, 0x8a8f99);
      mb.box(x, y + 0.3, z + 11.5, 28, 0.5, 5, 0, 0x7a5a40);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + 0.6;
        house(poi, x + Math.cos(a) * 46, z + Math.sin(a) * 46, a + Math.PI / 2, 9, 8, 4.5, { wall: pick([0xc4503f, 0x3f7a62, 0x5a6f8c, 0xd9a441]), roof: 'gable', roofColor: 0xf4f8ff });
      }
      const poles = [];
      for (let k = 0; k < 7; k++) {
        const px = x - 60 - k * 36;
        const pz = z - 30 + k * 4;
        const gH = gy(px, pz);
        mb.box(px, gH - 0.5, pz, 0.9, 11.5, 0.9, 0, 0x3a3f4a);
        mb.box(px, gH + 10.5, pz, 4, 0.4, 0.5, 0, 0x3a3f4a);
        poles.push([px, gH + 10.8, pz]);
      }
      for (let k = 0; k < poles.length - 1; k++) {
        const a = poles[k];
        const b = poles[k + 1];
        mb.beam(a[0], a[1], a[2] - 1.6, b[0], b[1], b[2] - 1.6, 0.18, 0x2b3340);
        mb.beam(a[0], a[1], a[2] + 1.6, b[0], b[1], b[2] + 1.6, 0.18, 0x2b3340);
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[2] + b[2]) / 2;
        const my = (a[1] + b[1]) / 2;
        mb.box(mx, my - 2.4, mz + 1.6, 1.6, 0.4, 1.4, 0, 0xe4572e);
        mb.box(mx, my - 1.9, mz + 1.6, 0.1, 1.9, 0.1, 0, 0x2b3340);
      }
      addLoot(poi, x, y + 7.2, z, 'chest');
    },

    snowVillage(poi) {
      const { x, z } = poi;
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.2;
        house(poi, x + Math.cos(a) * 58, z + Math.sin(a) * 58, Math.atan2(-Math.cos(a), -Math.sin(a)), rr(9, 12), rr(8, 10), rr(5, 6.5), {
          wall: pick([0xd96c6c, 0x6c9bd9, 0xe3b34a, 0x7bbf8a, 0xc59ad9]), roof: 'hip', roofColor: 0xf4f8ff
        });
      }
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7 + 0.9;
        const ix = x + Math.cos(a) * 78;
        const iz = z + Math.sin(a) * 78;
        const iy = gy(ix, iz);
        mb.blob(ix, iy + 0.5, iz, 3.2, 2.5, 3.2, 0xf4f8ff, rand, 0.05, 1);
        mb.box(ix + 0.4, iy, iz + 2.9, 1.6, 1.8, 1.4, 0, 0x6aa8c7);
        addCollider(poi, ix, iz, 6, 6, 0, iy, iy + 3);
      }
      house(poi, x + 6, z - 84, 0, 12, 16, 8, { wall: 0xe8dfc9, roof: 'gable', roofColor: 0x5a6f8c, roofH: 6 });
      mb.box(x + 6, poi.y + 14, z - 84, 3, 10, 3, 0, 0xe8dfc9);
      mb.pyramid(x + 6, poi.y + 24, z - 84, 3, 3, 6, 0, 0x5a6f8c);
      for (let k = 0; k < 6; k++) {
        const a = rand() * Math.PI * 2;
        const sx = x + Math.cos(a) * rr(30, 44);
        const sz = z + Math.sin(a) * rr(30, 44);
        const sy = gy(sx, sz);
        mb.blob(sx, sy + 0.8, sz, 0.9, 0.9, 0.9, 0xffffff, rand, 0.04);
        mb.blob(sx, sy + 2.0, sz, 0.65, 0.65, 0.65, 0xffffff, rand, 0.04);
        mb.cone(sx, sy + 1.9, sz + 0.6, 0.12, 0.7, 0xff8c42, 5);
      }
    },

    bazaar(poi) {
      const { x, z } = poi;
      const sand = [0xe3c48f, 0xd8b27a, 0xeccf9d, 0xcfa56b];
      const awn = [[0xe4572e, 0xf7f0e0], [0x2a9d8f, 0xf7f0e0], [0xf2b134, 0xf7f0e0], [0x6c5ce7, 0xf7f0e0]];
      for (let gx = -2; gx <= 2; gx++) {
        for (let gz = -2; gz <= 2; gz++) {
          if (gx === 0 && gz === 0) continue;
          const cx = x + gx * 30 + rr(-3, 3);
          const cz = z + gz * 30 + rr(-3, 3);
          if (Math.hypot(cx - x, cz - z) > poi.r * 0.88) continue;
          if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1 && rand() < 0.55) {
            const a = pick(awn);
            const sy = gy(cx, cz);
            for (const [ox, oz] of [[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]]) mb.box(cx + ox, sy, cz + oz, 0.2, 2.6, 0.2, 0, 0x5a3d28);
            mb.box(cx, sy + 2.6, cz, 5.4, 0.2, 3.8, 0.05, a[0]);
            mb.box(cx, sy + 2.62, cz, 5.4, 0.2, 1.3, 0.05, a[1]);
            mb.box(cx, sy, cz, 3.6, 1.1, 1.4, 0, 0x8a5d3b);
            addCollider(poi, cx, cz, 3.6, 1.4, 0, sy, sy + 1.1);
            addLoot(poi, cx, sy + 1.2, cz + 2.4, 'floor');
          } else {
            house(poi, cx, cz, rand() < 0.5 ? 0 : Math.PI / 2, rr(12, 18), rr(11, 16), rr(5, 11), { wall: pick(sand), roof: 'flat', roofColor: 0xb98f5a, trim: 0xf3e2c0 });
          }
        }
      }
      const y = poi.y;
      mb.cyl(x, y, z, 3.4, 1.3, 0xcfc3a5, 14);
      mb.cyl(x, y + 1.0, z, 2.6, 0.5, 0x3a8dbf, 14);
      for (const s of [-1, 1]) {
        const mx = x + s * 52;
        const mz = z - 56;
        const g = gy(mx, mz);
        mb.cyl(mx, g, mz, 3.2, 26, 0xf3e2c0, 12, 2.6);
        mb.cyl(mx, g + 26, mz, 3.8, 0.8, 0xe4572e, 12);
        mb.cone(mx, g + 26.8, mz, 3, 6, 0x2a9d8f, 12);
        addCollider(poi, mx, mz, 7, 7, 0, g, g + 30);
      }
      mb.blob(x + 36, y + 9.5, z + 40, 9, 6, 9, 0x2a9d8f, rand, 0.03, 1);
      house(poi, x + 36, z + 40, 0, 14, 14, 9.5, { wall: 0xf3e2c0, roof: 'none', floors: 0 });
      addLoot(poi, x + 36, y + 16, z + 40, 'chest');
    },

    raceway(poi) {
      const { x, z } = poi;
      const a = 118;
      const b = 66;
      const pts = [];
      const n = 72;
      for (let k = 0; k <= n; k++) {
        const t = (k / n) * Math.PI * 2;
        pts.push([x + Math.cos(t) * a, z + Math.sin(t) * b]);
      }
      localRoads.push({ pts, width: 16, kind: 'track' });
      for (let k = 0; k < n; k++) {
        const t0 = (k / n) * Math.PI * 2;
        for (const s of [-1, 1]) {
          const ra = a + s * 10;
          const rb = b + s * 10;
          const px = x + Math.cos(t0) * ra;
          const pz = z + Math.sin(t0) * rb;
          const rot = -Math.atan2(Math.cos(t0) * rb, -Math.sin(t0) * ra);
          mb.box(px, gy(px, pz), pz, 10, 0.9, 0.5, rot, k % 2 ? 0xe4572e : 0xf2f2f2);
        }
      }
      const gz = z - b - 26;
      for (let s = 0; s < 6; s++) mb.box(x, poi.y + s * 1.3, gz - s * 2.4, 74, 1.3, 2.6, 0, s % 2 ? 0x8f98a8 : 0xb4bccb);
      for (const px of [-36, 0, 36]) mb.box(x + px, poi.y, gz - 12.5, 1.2, 13.5, 1.2, 0, 0x4a4f5c);
      mb.box(x, poi.y + 13.5, gz - 8, 78, 0.8, 16, 0, 0xe4572e);
      addCollider(poi, x, gz - 7, 74, 16, 0, poi.y, poi.y + 8);
      for (let k = 0; k < 6; k++) {
        house(poi, x - 55 + k * 22, z + b + 24, 0, 16, 11, 5, { wall: 0xdfe3ea, roof: 'flat', roofColor: pick(CONTAINER), floors: 0, door: pick(CONTAINER) });
      }
      mb.box(x - 114, poi.y, z + 4, 1, 12, 1, 0, 0x3a3f4a);
      mb.box(x - 114, poi.y, z - 6, 1, 12, 1, 0, 0x3a3f4a);
      for (let k = 0; k < 10; k++) mb.box(x - 114, poi.y + 11 + (k % 2) * 1.1, z - 5.5 + k * 1.1, 1, 1.1, 1.1, 0, k % 2 ? 0x111111 : 0xffffff);
      for (const [px, pz] of [[-60, b + 30], [10, b + 30], [0, -b - 40], [30, 0]]) addLoot(poi, x + px, poi.y + 0.2, z + pz, 'chest');
    },

    oasis(poi) {
      const { x, z } = poi;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.4;
        const tx = x + Math.cos(a) * 48;
        const tz = z + Math.sin(a) * 48;
        const ty = gy(tx, tz);
        mb.box(tx, ty, tz, 6, 2.2, 6, a, 0xf3e2c0);
        mb.pyramid(tx, ty + 2.2, tz, 6, 6, 3, a, pick([0xe4572e, 0x2a9d8f, 0xf2b134, 0x6c5ce7]), 0.5);
        addCollider(poi, tx, tz, 6, 6, a, ty, ty + 4);
        addLoot(poi, tx, ty + 0.1, tz, 'floor');
      }
      house(poi, x + 4, z - 56, 0, 12, 9, 4.5, { wall: 0xd8b27a, roof: 'flat', roofColor: 0xb98f5a });
      addLoot(poi, x + 4, poi.y + 4.8, z - 56, 'chest');
    },

    cabins(poi) {
      const { x, z } = poi;
      mb.cyl(x, poi.y, z, 2.2, 0.5, 0x4a4f5c, 10);
      mb.cone(x, poi.y + 0.4, z, 0.9, 1.8, 0xff8c42, 6);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rr(-0.2, 0.2);
        const r = rr(26, 62);
        house(poi, x + Math.cos(a) * r, z + Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), rr(7, 10), rr(6, 8), rr(3.8, 5), {
          wall: pick([0x8a5d3b, 0x7a5232, 0x9a6b44]), roof: 'gable', roofColor: pick([0x3f7a62, 0x5b4636, 0x44495a]), floors: 0
        });
      }
      const tx = x + 48;
      const tz = z - 40;
      const ty = poi.y;
      for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) mb.box(tx + ox, ty, tz + oz, 0.5, 11, 0.5, 0, 0x5a3d28);
      mb.box(tx, ty + 10.5, tz, 6, 0.4, 6, 0, 0x7a5232);
      mb.box(tx, ty + 10.9, tz, 4.4, 2.6, 4.4, 0, 0x8a5d3b);
      mb.pyramid(tx, ty + 13.5, tz, 4.4, 4.4, 2.2, 0, 0x3f7a62, 0.5);
      addCollider(poi, tx, tz, 6, 6, 0, ty, ty + 15);
      addLoot(poi, tx, ty + 11, tz, 'chest');
      for (let k = 0; k < 4; k++) {
        const a = rand() * Math.PI * 2;
        const px = x + Math.cos(a) * rr(20, 40);
        const pz = z + Math.sin(a) * rr(20, 40);
        mb.pyramid(px, gy(px, pz), pz, 4, 4, 2.6, a, pick([0x3f7a62, 0xc4503f, 0xd9a441]), 0.2);
      }
    },

    sawmill(poi) {
      const { x, z } = poi;
      house(poi, x, z, 0, 40, 18, 9, { wall: 0x8a5d3b, roof: 'gable', roofColor: 0x4a4f5c, roofH: 6, floors: 0 });
      house(poi, x + 30, z + 22, 0, 14, 10, 5, { wall: 0x9a6b44, roof: 'gable', roofColor: 0x3f7a62, floors: 0 });
      mb.box(x - 30, poi.y, z + 34, 18, 4, 10, 0, 0x7a5232);
      mb.gable(x - 30, poi.y + 4, z + 34, 18, 10, 2.5, Math.PI / 2, 0x5b4636);
      for (let r = 0; r < 4; r++) {
        for (let layer = 0; layer < 3; layer++) {
          for (let k = 0; k < 4 - layer; k++) {
            mb.hcyl(x - 42, poi.y + layer * 1.35, z - 36 + k * 1.5 + layer * 0.75 + r * 6.5, 0.7, 9, 0, pick([0x8a5d3b, 0x7a5232, 0x9a6b44]), 7);
          }
        }
      }
      mb.beam(x - 24, poi.y + 3, z + 14, x - 8, poi.y + 8, z + 10, 1.2, 0x6b7280);
      for (let k = 0; k < 3; k++) mb.cone(x + 38 + k * 6, poi.y, z - 16 + (k % 2) * 4, rr(3, 4.5), rr(3, 4), 0xd8b98a, 8);
      mb.cyl(x + 12, poi.y + 9, z - 12, 1.6, 22, 0x6b7280, 8);
      mb.cyl(x + 12, poi.y + 31, z - 12, 2.2, 1.2, 0x3a3f4a, 8);
      addCollider(poi, x + 12, z - 12, 3.2, 3.2, 0, poi.y, poi.y + 31);
      addLoot(poi, x + 2, poi.y + 0.2, z + 12, 'chest');
    },

    mansion(poi) {
      const { x, z, y } = poi;
      house(poi, x, z, 0, 36, 20, 14, { wall: 0x6e6a84, roof: 'gable', roofColor: 0x2d2a3a, roofH: 9, floors: 3, trim: 0x57536b });
      house(poi, x, z + 18, 0, 14, 12, 9, { wall: 0x77728f, roof: 'gable', roofColor: 0x2d2a3a, floors: 2 });
      for (const [ox, oz] of [[-19, -11], [19, -11], [-19, 11], [19, 11]]) {
        mb.cyl(x + ox, y, z + oz, 4, 20, 0x6e6a84, 10);
        mb.cone(x + ox, y + 20, z + oz, 5.2, 8, 0x2d2a3a, 10);
        addCollider(poi, x + ox, z + oz, 8, 8, 0, y, y + 28);
      }
      for (let k = -9; k <= 9; k++) for (const pz of [z - 40, z + 40]) { const px = x + k * 5; mb.box(px, gy(px, pz), pz, 0.3, 2.6, 0.3, 0, 0x1f1d28); }
      for (let k = -7; k <= 7; k++) for (const px of [x - 46, x + 46]) { const pz = z + k * 5.4; mb.box(px, gy(px, pz), pz, 0.3, 2.6, 0.3, 0, 0x1f1d28); }
      for (let k = 0; k < 14; k++) {
        const gx = x + 56 + (k % 4) * 5;
        const gz = z - 24 + Math.floor(k / 4) * 6;
        mb.box(gx, gy(gx, gz), gz, 1.4, 1.8, 0.4, 0.1, 0x9a9aa8);
      }
      addLoot(poi, x, y + 0.2, z + 6, 'chest');
      addLoot(poi, x, y + 4.4, z - 4, 'chest');
    },

    farm(poi) {
      const { x, z, y } = poi;
      house(poi, x - 30, z - 10, 0.1, 22, 14, 6.5, { wall: 0xc4503f, roof: 'gable', roofColor: 0x6b4b3a, roofH: 6, floors: 0, door: 0xf2f2f2 });
      house(poi, x + 34, z - 20, -0.1, 18, 12, 5.5, { wall: 0xb94a3a, roof: 'gable', roofColor: 0x6b4b3a, roofH: 5, floors: 0, door: 0xf2f2f2 });
      house(poi, x + 4, z + 14, 0, 12, 9, 4.2, { wall: 0xf2ede0, roof: 'gable', roofColor: 0x3f7a62 });
      for (let k = 0; k < 3; k++) {
        const sx = x - 6 + k * 9;
        const sz = z - 38;
        mb.cyl(sx, y, sz, 3.6, 14, 0xcfd6dd, 12);
        mb.blob(sx, y + 14, sz, 3.7, 2.6, 3.7, 0x9aa5b1, rand, 0.02, 1);
        addCollider(poi, sx, sz, 7.2, 7.2, 0, y, y + 17);
      }
      const colors = [0x7fbf5a, 0xe3c55a, 0x8a6a45, 0x6fb04f, 0xd9b04a, 0x9a7a52];
      for (let f = 0; f < 6; f++) {
        const fx = x + ((f % 3) - 1) * 56;
        const fz = z + 66 + Math.floor(f / 3) * 40 - 30;
        for (let s = 0; s < 10; s++) mb.box(fx, y + 0.02, fz - 17 + s * 3.4, 40, 0.15, 2.4, 0, colors[(f + (s % 2) * 2) % 6]);
      }
      for (let k = 0; k < 6; k++) mb.hcyl(x + 18 + (k % 3) * 2.6, y + (k > 2 ? 2.2 : 0), z + 28, 1.1, 2, 0, 0xe3c55a, 8);
      mb.box(x - 16, y, z + 22, 3.2, 1.6, 2.2, 0, 0x3f7a62);
      mb.box(x - 16, y + 1.6, z + 22, 1.6, 1.2, 1.6, 0, 0x3f7a62);
      addLoot(poi, x - 30, y + 0.2, z + 3, 'chest');
      addLoot(poi, x + 34, y + 0.2, z - 8, 'chest');
    },

    windmill(poi) {
      const { x, z, y } = poi;
      mb.cyl(x, y, z, 6.4, 22, 0xf2ede0, 12, 4);
      mb.cone(x, y + 22, z, 5.2, 6, 0xc4503f, 12);
      mb.box(x, y + 3, z + 6.2, 2.2, 3.4, 0.5, 0, 0x4a3526);
      addCollider(poi, x, z, 12.8, 12.8, 0, y, y + 28);
      mb.box(x, y + 20.6, z + 5.4, 1.4, 1.4, 2, 0, 0x3a3f4a);
      dynamic.push({ type: 'windmill', x, y: y + 20.6, z: z + 6.6, rot: 0, radius: 16 });
      house(poi, x - 36, z + 20, 0.4, 10, 8, 4.2, { wall: 0xf2ede0, roofColor: 0x6b4b3a });
      house(poi, x + 34, z + 26, -0.5, 10, 8, 4.2, { wall: 0xe8dfc9, roofColor: 0x3f7a62 });
      for (let k = 0; k < 5; k++) {
        const tx = x - 120 + k * 60;
        const tz = z - 90 + (k % 2) * 16;
        const ty = gy(tx, tz);
        mb.cyl(tx, ty, tz, 1.2, 40, 0xf5f7fa, 8, 0.7);
        mb.box(tx, ty + 39.5, tz + 0.8, 1.8, 1.8, 4.4, 0, 0xe3e7ee);
        dynamic.push({ type: 'turbine', x: tx, y: ty + 40.4, z: tz + 3.2, rot: 0, radius: 15 });
        addCollider(poi, tx, tz, 2.4, 2.4, 0, ty, ty + 40);
      }
      addLoot(poi, x - 36, y + 0.2, z + 26, 'chest');
      addLoot(poi, x + 8, y + 0.2, z + 12, 'floor');
    },

    docks(poi) {
      const rot = Math.atan2(poi.coast[0], poi.coast[1]);
      const L = (lx, lz) => { const p = xf(poi.x, poi.z, rot, lx, 0, lz); return [p[0], p[2]]; };
      const y = poi.y;
      for (const [lx, lz, w, d] of [[-52, -52, 42, 16], [52, -52, 42, 16], [-10, -80, 30, 14]]) {
        const [px, pz] = L(lx, lz);
        house(poi, px, pz, rot, w, d, 9, { wall: pick([0x8da2b5, 0xb08968, 0x9db4a0]), roof: 'gable', roofColor: pick(ROOFS), roofH: 3.5, floors: 0, y });
      }
      for (let i = 0; i < 8; i++) {
        const [px, pz] = L(-70 + (i % 4) * 14, -14 + Math.floor(i / 4) * 5);
        const stack = 1 + Math.floor(rand() * 3);
        for (let s = 0; s < stack; s++) container(poi, px, pz, rot, y + s * 2.5, pick(CONTAINER));
      }
      for (const plx of [-42, 0, 42]) {
        const [px, pz] = L(plx, 52);
        mb.box(px, y + 0.1, pz, 8, 0.5, 100, rot, 0x8a6d4b);
        for (let k = 0; k < 10; k++) for (const s of [-3.6, 3.6]) {
          const [qx, qz] = L(plx + s, 8 + k * 10);
          mb.cyl(qx, -5, qz, 0.45, y + 5, 0x4a3526, 5);
        }
        addCollider(poi, px, pz, 8, 100, rot, y - 0.2, y + 0.7);
      }
      for (const plx of [-42, 42]) {
        for (const sx of [-1, 1]) {
          const [qx, qz] = L(plx + sx * 5.2, 66);
          mb.box(qx, y, qz, 1.3, 24, 1.3, rot, 0xf2b134);
        }
        const [bx, bz] = L(plx, 66);
        mb.box(bx, y + 24, bz, 13.5, 2, 2.4, rot, 0xf2b134);
        const [jx, jz] = L(plx, 80);
        mb.box(jx, y + 24.2, jz, 2, 1.6, 30, rot, 0xe4572e);
        addCollider(poi, bx, bz, 13, 3, rot, y, y + 26);
      }
      const [sx, sz] = L(-21, 70);
      mb.box(sx, -3, sz, 15, 7.4, 62, rot, 0x9c2f3a);
      mb.box(sx, 4.4, sz, 15.4, 0.8, 62, rot, 0x3a3f4a);
      const [cx2, cz2] = L(-21, 52);
      mb.box(cx2, 5.2, cz2, 11, 9, 12, rot, 0xf2f2f2);
      mb.cyl(cx2, 14, cz2, 2, 5, 0xe4572e, 8);
      for (let k = 0; k < 4; k++) {
        const [kx, kz] = L(-21, 72 + k * 4.2);
        for (let s = 0; s < 2; s++) mb.box(kx, 5.2 + s * 2.4, kz, 10, 2.4, 3.8, rot, pick(CONTAINER));
      }
      addCollider(poi, sx, sz, 15, 62, rot, -3, 6);
      for (const [lx, lz] of [[-30, -30], [20, -30], [0, 30], [-40, 60], [40, 60], [-21, 52]]) {
        const [qx, qz] = L(lx, lz);
        addLoot(poi, qx, y + 0.8, qz, 'chest');
      }
    },

    lighthouse(poi) {
      const { x, z, y } = poi;
      for (let s = 0; s < 5; s++) mb.cyl(x, y + s * 7, z, lerp(4.6, 3.1, s / 5), 7, s % 2 ? 0xf2f2f2 : 0xc4503f, 14, lerp(4.6, 3.1, (s + 1) / 5));
      mb.cyl(x, y + 35, z, 4.4, 0.8, 0x2b3340, 14);
      mb.cyl(x, y + 35.8, z, 2.2, 3.6, 0xfff1b0, 10);
      mb.cone(x, y + 39.4, z, 3.2, 3.2, 0xc4503f, 10);
      addCollider(poi, x, z, 9.2, 9.2, 0, y, y + 42);
      house(poi, x + 12, z + 6, 0.3, 10, 8, 4.4, { wall: 0xf2ede0, roofColor: 0xc4503f });
      addLoot(poi, x, y + 36, z, 'chest');
      addLoot(poi, x + 12, y + 0.2, z + 12, 'floor');
    },

    radio(poi) {
      const { x, z, y } = poi;
      const H = 56;
      const segs = 5;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs;
          const t1 = (s + 1) / segs;
          mb.beam(x + sx * lerp(6, 0.8, t0), y + H * t0, z + sz * lerp(6, 0.8, t0), x + sx * lerp(6, 0.8, t1), y + H * t1, z + sz * lerp(6, 0.8, t1), 0.55, s % 2 ? 0xf2f2f2 : 0xe4572e);
        }
      }
      for (let s = 1; s < segs; s++) {
        const h = y + (H * s) / segs;
        const w = lerp(6, 0.8, s / segs);
        mb.box(x, h, z - w, w * 2, 0.3, 0.3, 0, 0xdddddd);
        mb.box(x, h, z + w, w * 2, 0.3, 0.3, 0, 0xdddddd);
        mb.box(x - w, h, z, 0.3, 0.3, w * 2, 0, 0xdddddd);
        mb.box(x + w, h, z, 0.3, 0.3, w * 2, 0, 0xdddddd);
      }
      mb.cyl(x, y + H, z, 0.35, 8, 0xe4572e, 6);
      mb.cyl(x + 1.2, y + H * 0.78, z, 1.6, 0.4, 0xf2f2f2, 12);
      addCollider(poi, x, z, 12, 12, 0, y, y + H);
      house(poi, x + 20, z + 8, 0, 9, 7, 3.6, { wall: 0xdfe3ea, roof: 'flat', roofColor: DARK, floors: 0 });
      house(poi, x - 18, z + 14, 0.5, 6, 6, 3.2, { wall: 0xc9b38f, roof: 'flat', roofColor: DARK, floors: 0 });
      addLoot(poi, x, y + 0.2, z + 9, 'chest');
      addLoot(poi, x + 20, y + 0.2, z + 15, 'floor');
    }
  };

  for (const poi of T.pois) {
    clearings.push({ x: poi.x, z: poi.z, r: poi.r * (poi.kind === 'cabins' || poi.kind === 'oasis' ? 1.1 : 1.0), poi: poi.id, kind: poi.kind });
    const fn = builders[poi.kind];
    if (fn) fn(poi);
    landmarks.push({ id: poi.id, name: poi.name, kind: poi.kind, x: poi.x, z: poi.z, y: poi.y, tier: poi.tier });
  }

  // ------------------------------------------------------------------ bridges
  for (const br of T.bridges) {
    const dx = br.x1 - br.x0;
    const dz = br.z1 - br.z0;
    const len = Math.hypot(dx, dz) + 6;
    const cx = (br.x0 + br.x1) / 2;
    const cz = (br.z0 + br.z1) / 2;
    const rot = Math.atan2(dx, dz); // local +Z runs along the span
    mb.box(cx, br.y - 0.9, cz, br.width, 0.9, len, rot, 0x6b7280);
    for (const s of [-1, 1]) {
      const p = xf(cx, cz, rot, s * (br.width / 2 - 0.2), 0, 0);
      mb.box(p[0], br.y, p[2], 0.3, 1.0, len, rot, 0xe4572e);
    }
    for (const k of [-0.35, 0.35]) {
      const p = xf(cx, cz, rot, 0, 0, len * k);
      mb.box(p[0], br.y - 5, p[2], br.width - 1, 4.2, 1.3, rot, 0x5a606c);
    }
    colliders.push({ kind: 'box', poi: 'bridge', x: cx, z: cz, hx: br.width / 2, hz: len / 2, rot, y0: br.y - 1, y1: br.y + 0.1 });
  }

  // ------------------------------------------------------------------ minor landmarks
  const minor = [];
  {
    const placed = T.pois.map((p) => ({ x: p.x, z: p.z, r: p.r + 60 }));
    let tries = 0;
    while (minor.length < 44 && tries < 4000) {
      tries++;
      const x = rr(-1400, 1400);
      const z = rr(-1400, 1400);
      if (T.maskAt(x, z) < 0.14) continue;
      if (T.lakeRn(x, z) < 1.7) continue;
      if (T.riverMargin(x, z) < 45) continue;
      if (Math.hypot(x - C.VOLCANO.x, z - C.VOLCANO.z) < 190) continue;
      if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) continue;
      if (minor.some((p) => Math.hypot(x - p.x, z - p.z) < 170)) continue;
      const h = gy(x, z);
      if (h < 4) continue;
      let lo = 1e9;
      let hi = -1e9;
      for (let k = 0; k < 8; k++) {
        const hh = gy(x + Math.cos(k * 0.785) * 12, z + Math.sin(k * 0.785) * 12);
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
      if (hi - lo > 5) continue;
      minor.push({ x, z, y: Math.max(4, h) });
    }
    const kinds = ['camp', 'shed', 'watchtower', 'ruin', 'hut', 'camp', 'shed'];
    minor.forEach((m, i) => {
      m.kind = kinds[i % kinds.length];
      m.id = 'minor' + i;
      const rad = 16;
      for (let iz = Math.floor((m.z - rad * 1.6 + C.HALF) / C.CELL); iz <= Math.ceil((m.z + rad * 1.6 + C.HALF) / C.CELL); iz++) {
        for (let ix = Math.floor((m.x - rad * 1.6 + C.HALF) / C.CELL); ix <= Math.ceil((m.x + rad * 1.6 + C.HALF) / C.CELL); ix++) {
          if (ix < 0 || iz < 0 || ix > C.N || iz > C.N) continue;
          const w = 1 - smoothstep(rad * 0.7, rad * 1.6, Math.hypot(-C.HALF + ix * C.CELL - m.x, -C.HALF + iz * C.CELL - m.z));
          if (w > 0) T.heights[iz * C.NV + ix] = lerp(T.heights[iz * C.NV + ix], m.y, w);
        }
      }
    });
    for (const m of minor) {
      const p = { id: m.id, tier: 1 };
      const y = m.y;
      if (m.kind === 'camp') {
        mb.cyl(m.x, y, m.z, 1.1, 0.4, 0x4a4f5c, 8);
        mb.cone(m.x, y + 0.3, m.z, 0.5, 1.1, 0xff8c42, 5);
        for (let k = 0; k < 2; k++) {
          const a = k * 2.4 + rand();
          mb.pyramid(m.x + Math.cos(a) * 5, y, m.z + Math.sin(a) * 5, 3.6, 3.6, 2.4, a, pick([0x3f7a62, 0xc4503f, 0xd9a441]), 0.2);
        }
        addLoot(p, m.x + 2, y + 0.2, m.z + 2, 'chest');
      } else if (m.kind === 'shed') {
        house(p, m.x, m.z, rand() * 3, 7, 6, 3.4, { wall: pick([0x9a6b44, 0xa7a79a, 0xb08968]), roof: 'gable', roofColor: pick(ROOFS), floors: 0, y });
      } else if (m.kind === 'hut') {
        house(p, m.x, m.z, rand() * 3, 5.5, 5.5, 3, { wall: 0xd8b98a, roof: 'hip', roofColor: 0x8a5a3c, floors: 0, y });
        house(p, m.x + 10, m.z + 4, rand() * 3, 4, 4, 2.6, { wall: 0xc9a77a, roof: 'hip', roofColor: 0x8a5a3c, floors: 0, y });
      } else if (m.kind === 'watchtower') {
        for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) mb.box(m.x + ox, y, m.z + oz, 0.4, 9, 0.4, 0, 0x6b4b3a);
        mb.box(m.x, y + 8.6, m.z, 5, 0.4, 5, 0, 0x7a5232);
        mb.box(m.x, y + 9, m.z, 3.6, 2.4, 3.6, 0, 0x8a5d3b);
        mb.pyramid(m.x, y + 11.4, m.z, 3.6, 3.6, 1.8, 0, 0x5b4636, 0.5);
        addCollider(p, m.x, m.z, 5, 5, 0, y, y + 13);
        addLoot(p, m.x, y + 9.1, m.z, 'chest');
      } else {
        for (let k = 0; k < 5; k++) {
          const a = k * 1.25;
          mb.box(m.x + Math.cos(a) * 5, y, m.z + Math.sin(a) * 5, rr(3, 6), rr(1.6, 4.2), 0.8, -a + 1.57, 0xa7a79a);
        }
        addLoot(p, m.x, y + 0.2, m.z, 'chest');
      }
      clearings.push({ x: m.x, z: m.z, r: 13, poi: m.id, kind: m.kind });
      landmarks.push({ id: m.id, name: m.kind, kind: m.kind, x: m.x, z: m.z, y, tier: 1, minor: true });
    }
  }

  return { mb, colliders, loot, localRoads, dynamic, clearings, landmarks, minor };
}
