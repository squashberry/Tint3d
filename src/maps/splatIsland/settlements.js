// Settlement planner: the 6 main towns, ~12 hamlets and ~46 single houses hidden in the bush.
// Pure data (plus terrain pad stamping). Output feeds the streaming system; no geometry is built here.

import { mulberry32, lerp, smoothstep } from './noise.js';
import * as C from './config.js';
import { makeSpec, houseRadius, collectHouse } from './houses.js';

const { HALF, N, NV, CELL } = C;
const DIRT = 0xb59a74;
const ASPHALT = 0x4d515c;

export function stampPad(T, x, z, r, h) {
  const rr = r * 1.6;
  for (let iz = Math.max(0, Math.floor((z - rr + HALF) / CELL)); iz <= Math.min(N, Math.ceil((z + rr + HALF) / CELL)); iz++) {
    for (let ix = Math.max(0, Math.floor((x - rr + HALF) / CELL)); ix <= Math.min(N, Math.ceil((x + rr + HALF) / CELL)); ix++) {
      const w = 1 - smoothstep(r * 0.7, rr, Math.hypot(-HALF + ix * CELL - x, -HALF + iz * CELL - z));
      if (w > 0) { const i = iz * NV + ix; T.heights[i] = lerp(T.heights[i], h, w); }
    }
  }
}

const sideRot = [0, Math.PI, Math.PI / 2, -Math.PI / 2]; // +z, -z, +x, -x block sides: front faces outwards

export function planSettlements(T, seed = 77) {
  const rand = mulberry32(seed);
  const rr = (a, b) => a + (b - a) * rand();
  const houses = [];
  const streets = [];
  const hamlets = [];
  const bushRings = [];
  const placed = []; // circles for overlap tests
  let idc = 0;

  const free = (x, z, r) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
  const add = (kind, style, x, z, y, rot, o = {}) => {
    const spec = makeSpec(rand, kind, style, x, z, y, rot, { id: 'h' + idc++, ...o });
    const r = houseRadius(spec) + 1.5;
    if (o.check !== false && !free(x, z, r)) return null;
    placed.push({ x, z, r });
    houses.push(spec);
    return spec;
  };
  const world = (cx, cz, ang, lx, lz) => [cx + lx * Math.cos(ang) + lz * Math.sin(ang), cz - lx * Math.sin(ang) + lz * Math.cos(ang)];
  const street = (pts, width = 7, color = ASPHALT) => streets.push({ pts, width, color, kind: 'street' });
  const circlePts = (cx, cz, r, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);

  // fit a kind into a lot, downgrading when the lot is too small
  const KIND_MIN = { tower: [18, 14], apartment: [16, 11], warehouse: [18, 12], villa: [12, 9.6], shop: [11, 8.6], house: [9.6, 8], farmhouse: [10, 8], lodge: [10, 8], adobe: [8, 7], cottage: [7.6, 6.6], cabin: [6.6, 5.6] };
  const DOWN = { tower: 'apartment', apartment: 'house', warehouse: 'shop', villa: 'house', shop: 'cottage', house: 'cottage', farmhouse: 'cottage', lodge: 'cabin', adobe: 'cabin', cottage: 'cabin' };
  const fit = (kind, lotW, lotD) => {
    let k = kind;
    while (k && KIND_MIN[k] && (KIND_MIN[k][0] > lotW || KIND_MIN[k][1] > lotD)) k = DOWN[k];
    return k;
  };

  // ---------------------------------------------------------------- block grid towns
  function gridTown(poi, cfg) {
    const ang0 = cfg.ang0 ?? 0;
    const S = cfg.S;
    const range = Math.ceil(cfg.maxR / S) + 1;
    const cx = poi.x;
    const cz = poi.z;
    // streets
    for (let k = -range; k <= range; k++) {
      const off = k * S;
      const L = Math.sqrt(Math.max(0, (cfg.maxR + 8) ** 2 - off * off));
      if (L < 10) continue;
      street([world(cx, cz, ang0, off, -L), world(cx, cz, ang0, off, L)], cfg.streetW || 7);
      street([world(cx, cz, ang0, -L, off), world(cx, cz, ang0, L, off)], cfg.streetW || 7);
    }
    for (let bx = -range; bx < range; bx++) {
      for (let bz = -range; bz < range; bz++) {
        const lx = (bx + 0.5) * S;
        const lz = (bz + 0.5) * S;
        const dist = Math.hypot(lx, lz) / cfg.maxR;
        if (dist > 1 - 0.08) continue;
        if (cfg.skipBlock?.(lx, lz, dist, rand)) continue;
        for (let side = 0; side < 4; side++) {
          const edgeLen = S - 9;
          const n = cfg.lots(dist, side);
          if (!n) continue;
          for (let i = 0; i < n; i++) {
            const t = (-(n - 1) / 2 + i) * (edgeLen / n);
            let kind = cfg.kindFor(dist, rand, lx, lz);
            const lotW = edgeLen / n - 1.6;
            const lotD = S / 2 - 5.5;
            kind = fit(kind, lotW, lotD);
            if (!kind) continue;
            const probe = makeSpec(rand, kind, cfg.style, 0, 0, 0, 0, { w: undefined });
            const w = Math.min(probe.w, lotW);
            const d = Math.min(probe.d, lotD);
            const inset = S / 2 - 4.4 - d / 2 - 0.5;
            let ox = 0;
            let oz = 0;
            if (side === 0) { ox = t; oz = inset; } else if (side === 1) { ox = t; oz = -inset; } else if (side === 2) { ox = inset; oz = t; } else { ox = -inset; oz = t; }
            const [wx, wz] = world(cx, cz, ang0, lx + ox, lz + oz);
            if (Math.hypot(wx - cx, wz - cz) > cfg.maxR) continue;
            if (cfg.accept && !cfg.accept(lx + ox, lz + oz)) continue;
            add(kind, cfg.style, wx, wz, poi.y, sideRot[side] + ang0, { w, d, tier: poi.tier, town: poi.id });
          }
        }
      }
    }
  }

  const roster = (table) => (rnd) => { let r = rnd(); for (const [p, k] of table) { if (r < p) return k; r -= p; } return table[table.length - 1][1]; };

  for (const poi of T.pois) {
    const maxR = poi.r * 0.78;
    if (poi.kind === 'townCity') {
      const mix = (dist, rnd) => (dist < 0.3 ? (rnd() < 0.7 ? 'tower' : 'apartment') : dist < 0.62 ? roster([[0.3, 'apartment'], [0.25, 'shop'], [0.3, 'house'], [0.15, 'cottage']])(rnd) : roster([[0.5, 'house'], [0.25, 'cottage'], [0.15, 'shop'], [0.1, 'villa']])(rnd));
      gridTown(poi, { style: 'city', S: 46, maxR, lots: (d) => (d < 0.46 ? 1 : 2), kindFor: mix, skipBlock: (lx, lz, d, rnd) => d > 0.5 && rnd() < 0.16 });
    } else if (poi.kind === 'townDesert') {
      gridTown(poi, { style: 'desert', S: 38, maxR, ang0: 0.12, streetW: 6, lots: () => 2, kindFor: roster([[0.45, 'adobe'], [0.25, 'shop'], [0.2, 'house'], [0.1, 'cottage']]), skipBlock: (lx, lz, d) => d < 0.26 });
    } else if (poi.kind === 'townSuburb') {
      const base = { kind: poi.kind };
      void base;
      // two long streets, houses on both sides
      for (const zs of [-30, 30]) street([world(poi.x, poi.z, 0, -maxR, zs), world(poi.x, poi.z, 0, maxR, zs)], 7);
      street(circlePts(poi.x + maxR - 4, poi.z, 22, 20), 6);
      for (const [zs, side] of [[-30, -1], [-30, 1], [30, -1], [30, 1]]) {
        for (let x = -maxR + 12; x <= maxR - 12; x += 17.5) {
          const kind = roster([[0.35, 'cottage'], [0.4, 'house'], [0.15, 'villa'], [0.1, 'farmhouse']])(rand);
          const probe = makeSpec(rand, fit(kind, 16, 12), 'suburb', 0, 0, 0, 0);
          const lz = zs + side * (7 + probe.d / 2);
          const [wx, wz] = world(poi.x, poi.z, 0, x + rr(-1.5, 1.5), lz);
          if (Math.hypot(wx - poi.x, wz - poi.z) > maxR) continue;
          add(probe.kind, 'suburb', wx, wz, poi.y, side < 0 ? Math.PI : 0, { w: probe.w, d: probe.d, tier: poi.tier, town: poi.id });
        }
      }
    } else if (poi.kind === 'townSnow') {
      const rings = [[58, 10], [84, 14], [106, 18]];
      for (const [rad, n] of rings) {
        street(circlePts(poi.x, poi.z, rad - 11, 32), 6);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rad * 0.01;
          const kind = i === 0 && rad === 84 ? 'villa' : roster([[0.4, 'cabin'], [0.3, 'cottage'], [0.2, 'house'], [0.1, 'lodge']])(rand);
          const px = poi.x + Math.cos(a) * rad;
          const pz = poi.z + Math.sin(a) * rad;
          add(fit(kind, 14, 11), 'snow', px, pz, poi.y, Math.atan2(-(px - poi.x), -(pz - poi.z)), { tier: poi.tier, town: poi.id });
        }
      }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; street([[poi.x + Math.cos(a) * 30, poi.z + Math.sin(a) * 30], [poi.x + Math.cos(a) * 112, poi.z + Math.sin(a) * 112]], 5); }
    } else if (poi.kind === 'townForest') {
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + 0.5;
        const pts = [];
        for (let i = 0; i <= 8; i++) pts.push([poi.x + Math.cos(a + Math.sin(i * 0.8) * 0.25) * i * 15, poi.z + Math.sin(a + Math.sin(i * 0.8) * 0.25) * i * 15]);
        street(pts, 4.5, DIRT);
      }
      for (let i = 0; i < 420; i++) {
        const a = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand()) * maxR;
        const px = poi.x + Math.cos(a) * rad;
        const pz = poi.z + Math.sin(a) * rad;
        if (rad < 12) continue;
        const kind = roster([[0.62, 'cabin'], [0.16, 'lodge'], [0.22, 'cottage']])(rand);
        add(kind, 'forest', px, pz, poi.y, rand() * Math.PI * 2, { tier: poi.tier, town: poi.id });
      }
    } else if (poi.id === 'docks') {
      const sd = Math.hypot(poi.coast[0], poi.coast[1]);
      const sdx = poi.coast[0] / sd;
      const sdz = poi.coast[1] / sd;
      const ang0 = Math.atan2(sdx, sdz);
      gridTown({ ...poi, r: poi.r }, {
        style: 'harbor', S: 44, maxR: poi.r * 0.9, ang0, lots: () => 2,
        kindFor: (d, rnd, lx, lz) => (lz > -80 ? (rnd() < 0.6 ? 'warehouse' : 'shop') : roster([[0.45, 'house'], [0.3, 'cottage'], [0.15, 'apartment'], [0.1, 'shop']])(rnd)),
        accept: (lx, lz) => lz < -48 && Math.abs(lx) < 100,
        skipBlock: (lx, lz) => lz > -20
      });
    }
  }

  // ---------------------------------------------------------------- hamlets and hidden single houses
  const roadPts = [];
  for (const r of T.roads) for (let i = 0; i < r.points.length; i += 3) roadPts.push(r.points[i]);
  const bw = new Float32Array(5);
  const siteOk = (x, z, rad) => {
    if (T.maskAt(x, z) < 0.18) return false;
    const h = T.heightAt(x, z);
    if (h < 4 || h > 55) return false;
    if (T.lakeRn(x, z) < 1.8 || T.riverMargin(x, z) < rad + 25) return false;
    if (Math.hypot(x - C.VOLCANO.x, z - C.VOLCANO.z) < 330) return false;
    if (T.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad + 60)) return false;
    if (!free(x, z, rad)) return false;
    let lo = 1e9; let hi = -1e9;
    for (let k = 0; k < 8; k++) { const hh = T.heightAt(x + Math.cos(k * 0.785) * rad * 0.8, z + Math.sin(k * 0.785) * rad * 0.8); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
    return hi - lo < Math.max(4, rad * 0.13);
  };
  const biomeOf = (x, z) => { T.biomeWeightsAt(x, z, bw); let b = 0; for (let k = 1; k < 5; k++) if (bw[k] > bw[b]) b = k; return b; };
  const STYLE_BY_BIOME = ['suburb', 'forest', 'snow', 'desert', 'forest'];
  const nearestRoad = (x, z) => { let best = null; let bd = 1e9; for (const p of roadPts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd }; };
  const track = (x, z, maxD) => {
    const nr = nearestRoad(x, z);
    if (!nr.p || nr.d > maxD || nr.d < 25) return;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; const wob = Math.sin(t * Math.PI) * 14 * Math.sin(x * 0.01 + z * 0.013); pts.push([lerp(x, nr.p.x, t) + wob, lerp(z, nr.p.z, t) - wob]); }
    street(pts, 3.6, DIRT);
  };

  let tries = 0;
  while (hamlets.length < 12 && tries++ < 3000) {
    const x = rr(-1300, 1300);
    const z = rr(-1300, 1300);
    if (!siteOk(x, z, 62)) continue;
    if (hamlets.some((h) => Math.hypot(h.x - x, h.z - z) < 300)) continue;
    const b = biomeOf(x, z);
    if (b === 4) continue;
    const style = STYLE_BY_BIOME[b];
    const padH = Math.max(4, T.heightAt(x, z));
    stampPad(T, x, z, 56, padH);
    const th = rr(0, Math.PI);
    const dir = [Math.cos(th), Math.sin(th)];
    street([[x - dir[0] * 70, z - dir[1] * 70], [x + dir[0] * 70, z + dir[1] * 70]], 5, DIRT);
    const kinds = style === 'forest' || style === 'snow' ? [[0.6, 'cabin'], [0.25, 'cottage'], [0.15, 'house']] : style === 'desert' ? [[0.5, 'adobe'], [0.3, 'cottage'], [0.2, 'house']] : [[0.4, 'cottage'], [0.3, 'house'], [0.2, 'farmhouse'], [0.1, 'villa']];
    let count = 0;
    for (let s = -3; s <= 3; s++) {
      for (const side of [-1, 1]) {
        if (rand() < 0.22) continue;
        const kind = roster(kinds)(rand);
        const probe = makeSpec(rand, kind, style, 0, 0, 0, 0);
        const lx = s * 21 + rr(-2, 2);
        const lz = side * (6 + probe.d / 2 + rr(1, 3));
        const px = x + dir[0] * lx - dir[1] * lz;
        const pz = z + dir[1] * lx + dir[0] * lz;
        // face the lane: local +z towards the lane centre
        const toLane = [-(-dir[1] * side), -(dir[0] * side)];
        const rot = Math.atan2(-(-dir[1]) * side * -1, 1) * 0 + Math.atan2(dir[1] * side * -1 * -1, dir[0] * side * -1 * -1) * 0 + Math.atan2(toLane[0], toLane[1]);
        if (add(probe.kind, style, px, pz, padH, rot, { w: probe.w, d: probe.d, tier: 1, town: 'hamlet' + hamlets.length })) count++;
      }
    }
    hamlets.push({ x, z, style, count, id: 'hamlet' + hamlets.length });
    track(x, z, 650);
  }

  let singles = 0;
  tries = 0;
  while (singles < 46 && tries++ < 5000) {
    const x = rr(-1380, 1380);
    const z = rr(-1380, 1380);
    if (!siteOk(x, z, 16)) continue;
    if (houses.some((h) => h.hidden && Math.hypot(h.x - x, h.z - z) < 110)) continue;
    const b = biomeOf(x, z);
    if (b === 4) continue;
    const style = b === 0 ? 'farm' : STYLE_BY_BIOME[b];
    const kind = b === 0 ? (rand() < 0.5 ? 'farmhouse' : 'cottage') : b === 3 ? 'adobe' : rand() < 0.75 ? 'cabin' : 'cottage';
    const padH = Math.max(4, T.heightAt(x, z));
    stampPad(T, x, z, 15, padH);
    const s = add(kind, style, x, z, padH, rr(0, Math.PI * 2), { tier: 2, hidden: true, town: 'single' });
    if (s) { singles++; bushRings.push({ x, z, r: 15 + houseRadius(s) }); track(x, z, 260); }
  }

  const clearings = houses.map((h) => ({ x: h.x, z: h.z, r: houseRadius(h) + 3.5, poi: h.id, kind: 'house' }));
  // loot points from every plan (geometry-free pass)
  const loot = [];
  for (const h of houses) loot.push(...collectHouse(h).loot);
  const stats = { houses: houses.length, hamlets: hamlets.length, singles, towns: {} };
  for (const h of houses) stats.towns[h.town] = (stats.towns[h.town] || 0) + 1;
  return { houses, streets, hamlets, bushRings, clearings, loot, stats };
}
