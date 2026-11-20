// THREE.js scene objects for Splat Island: terrain chunks, water, roads, buildings, props.

import * as THREE from 'three';
import { MeshBuilder } from './meshBuilder.js';
import { makeNoise, hexToLinear, clamp, lerp, smoothstep } from './noise.js';
import { makePropTemplates } from './props.js';
import * as C from './config.js';

const { HALF, N, NV, CELL } = C;
const CHUNK_CELLS = 64;

const lin = (hex) => hexToLinear(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BIOME_COLORS = [
  [lin(0x86d65a), lin(0x6cbf4b)], // meadow
  [lin(0x3f9a4a), lin(0x2f8040)], // forest
  [lin(0xf6faff), lin(0xd9ebf7)], // snow
  [lin(0xeccb83), lin(0xd7a75f)], // desert
  [lin(0x4d4752), lin(0x37323c)] // volcano ash
];
const ROCK = lin(0x8b909c);
const ROCK_RED = lin(0xc9774a);
const SAND = lin(0xf0dca0);
const SHALLOW = lin(0x59d6c9);
const DEEP = lin(0x1f78b4);
const PAD_GROUND = { town: 0xa8adb8, factory: 0x8d939d, docks: 0x9a9fa8, bazaar: 0xd9bd8a, raceway: 0x9aa0aa, lodge: 0xe8eef5, sawmill: 0xb59a74 };

export function terrainColors(T, seed) {
  const nz = makeNoise(seed + 5);
  const H = T.heights;
  const out = new Float32Array(NV * NV * 3);
  const w = [0, 0, 0, 0, 0];
  for (let iz = 0; iz < NV; iz++) {
    for (let ix = 0; ix < NV; ix++) {
      const i = iz * NV + ix;
      const x = -HALF + ix * CELL;
      const z = -HALF + iz * CELL;
      const h = H[i];
      const gx = (H[iz * NV + Math.min(N, ix + 1)] - H[iz * NV + Math.max(0, ix - 1)]) / (2 * CELL);
      const gz = (H[Math.min(N, iz + 1) * NV + ix] - H[Math.max(0, iz - 1) * NV + ix]) / (2 * CELL);
      const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
      let sum = 0;
      for (let b = 0; b < 5; b++) {
        const v = T.biomeW[i * 5 + b] / 255;
        w[b] = v * v;
        sum += w[b];
      }
      const n1 = nz.fbm(x / 38, z / 38, 2) * 0.5 + 0.5;
      let c = [0, 0, 0];
      for (let b = 0; b < 5; b++) {
        const bc = mix3(BIOME_COLORS[b][0], BIOME_COLORS[b][1], n1);
        const k = w[b] / sum;
        c[0] += bc[0] * k; c[1] += bc[1] * k; c[2] += bc[2] * k;
      }
      const snowW = w[2] / sum;
      const rockMix = smoothstep(lerp(0.2, 0.34, snowW), lerp(0.38, 0.55, snowW), slope);
      c = mix3(c, w[3] / sum > 0.5 ? ROCK_RED : ROCK, rockMix);
      if (h < 3.4) c = mix3(c, SAND, 1 - smoothstep(1.4, 3.4, h));
      if (h < 0.4) c = mix3(mix3(SAND, SHALLOW, smoothstep(0.2, -3, h)), DEEP, smoothstep(-2, -14, h));
      const shade = 0.93 + 0.14 * (nz.fbm(x / 9 + 50, z / 9, 2) * 0.5 + 0.5);
      out[i * 3] = c[0] * shade;
      out[i * 3 + 1] = c[1] * shade;
      out[i * 3 + 2] = c[2] * shade;
    }
  }
  for (const poi of T.pois) {
    const hex = PAD_GROUND[poi.kind];
    if (!hex) continue;
    const pc = lin(hex);
    const reach = poi.r;
    for (let iz = Math.max(0, Math.floor((poi.z - reach + HALF) / CELL)); iz <= Math.min(N, Math.ceil((poi.z + reach + HALF) / CELL)); iz++) {
      for (let ix = Math.max(0, Math.floor((poi.x - reach + HALF) / CELL)); ix <= Math.min(N, Math.ceil((poi.x + reach + HALF) / CELL)); ix++) {
        const d = Math.hypot(-HALF + ix * CELL - poi.x, -HALF + iz * CELL - poi.z);
        const k = 1 - smoothstep(reach * 0.62, reach * 0.9, d);
        if (k <= 0) continue;
        const i = (iz * NV + ix) * 3;
        const m = mix3([out[i], out[i + 1], out[i + 2]], pc, k * 0.85);
        out[i] = m[0]; out[i + 1] = m[1]; out[i + 2] = m[2];
      }
    }
  }
  return out;
}

function buildTerrainChunks(T, colors, mat) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const H = T.heights;
  const n = CHUNK_CELLS + 1;
  const idx = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
  let k = 0;
  for (let lz = 0; lz < CHUNK_CELLS; lz++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      const i00 = lz * n + lx;
      const i10 = i00 + 1;
      const i01 = i00 + n;
      const i11 = i01 + 1;
      idx[k++] = i00; idx[k++] = i01; idx[k++] = i10;
      idx[k++] = i10; idx[k++] = i01; idx[k++] = i11;
    }
  }
  for (let cz = 0; cz < N / CHUNK_CELLS; cz++) {
    for (let cx = 0; cx < N / CHUNK_CELLS; cx++) {
      const pos = new Float32Array(n * n * 3);
      const nor = new Float32Array(n * n * 3);
      const col = new Float32Array(n * n * 3);
      for (let lz = 0; lz < n; lz++) {
        for (let lx = 0; lx < n; lx++) {
          const ix = cx * CHUNK_CELLS + lx;
          const iz = cz * CHUNK_CELLS + lz;
          const gi = iz * NV + ix;
          const o = (lz * n + lx) * 3;
          pos[o] = -HALF + ix * CELL;
          pos[o + 1] = H[gi];
          pos[o + 2] = -HALF + iz * CELL;
          const gx = (H[iz * NV + Math.min(N, ix + 1)] - H[iz * NV + Math.max(0, ix - 1)]) / (2 * CELL);
          const gz = (H[Math.min(N, iz + 1) * NV + ix] - H[Math.max(0, iz - 1) * NV + ix]) / (2 * CELL);
          const l = Math.sqrt(gx * gx + 1 + gz * gz);
          nor[o] = -gx / l; nor[o + 1] = 1 / l; nor[o + 2] = -gz / l;
          col[o] = colors[gi * 3]; col[o + 1] = colors[gi * 3 + 1]; col[o + 2] = colors[gi * 3 + 2];
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `terrain_${cx}_${cz}`;
      group.add(mesh);
    }
  }
  return group;
}

function geometryFromBuilder(b) {
  const a = b.toArrays();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

// Flat ribbon along a polyline. Winding faces up.
function ribbon(points, widthAt, yAt, colorAt) {
  const pos = [];
  const col = [];
  const idx = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const w = widthAt(i) / 2;
    const y = yAt(i);
    pos.push(p.x - tz * w, y, p.z + tx * w, p.x + tz * w, y, p.z - tx * w);
    const c = colorAt ? colorAt(i) : [1, 1, 1];
    col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    if (i < n - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  return { pos, col, idx };
}

function mergeRibbons(list) {
  const pos = [];
  const col = [];
  const idx = [];
  for (const r of list) {
    const base = pos.length / 3;
    for (const v of r.pos) pos.push(v);
    for (const v of r.col) col.push(v);
    for (const i of r.idx) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

function lakeGeometry(T) {
  const seg = 72;
  const pos = [C.LAKE.x, 0, C.LAKE.z];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const r = T.lakeRadius(a) * 0.985;
    pos.push(C.LAKE.x + Math.cos(a) * r, 0, C.LAKE.z + Math.sin(a) * r);
  }
  const idx = [];
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildIslandObject(T, P, S, seed = 20260) {
  const root = new THREE.Group();
  root.name = 'SplatIsland';
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const terrainMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  root.add(buildTerrainChunks(T, terrainColors(T, seed), terrainMat));

  const seaMat = track(new THREE.MeshStandardMaterial({ color: 0x3fc1da, transparent: true, opacity: 0.8, roughness: 0.3, metalness: 0 }));
  const sea = new THREE.Mesh(track(new THREE.PlaneGeometry(60000, 60000)), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.name = 'sea';
  root.add(sea);
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(60000, 60000)), track(new THREE.MeshBasicMaterial({ color: 0x1b6aa5 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -17;
  floor.name = 'oceanFloor';
  root.add(floor);

  const inlandMat = track(new THREE.MeshStandardMaterial({ color: 0x4cc9ea, transparent: true, opacity: 0.86, roughness: 0.25 }));
  const lake = new THREE.Mesh(track(lakeGeometry(T)), inlandMat);
  lake.position.y = C.LAKE.level;
  lake.name = 'lake';
  root.add(lake);

  const riverGeo = mergeRibbons([ribbon(T.river, (i) => T.river[i].hw * 1.9, (i) => T.river[i].bed + 1.5, null)]);
  const river = new THREE.Mesh(track(riverGeo), inlandMat);
  river.name = 'river';
  root.add(river);

  const iceMat = track(new THREE.MeshLambertMaterial({ color: 0xcfeaf7 }));
  const lavaMat = track(new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
  for (const wb of T.waterBodies) {
    const m = new THREE.Mesh(track(new THREE.CircleGeometry(wb.r, 40)), wb.type === 'lava' ? lavaMat : wb.type === 'ice' ? iceMat : inlandMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(wb.x, wb.y, wb.z);
    m.name = wb.type;
    root.add(m);
  }
  if (T.lavaFlow.length > 2) {
    const flow = ribbon(T.lavaFlow, (i) => lerp(9, 4, i / T.lavaFlow.length), (i) => T.heightAt(T.lavaFlow[i].x, T.lavaFlow[i].z) + 0.3, null);
    const m = new THREE.Mesh(track(mergeRibbons([flow])), lavaMat);
    m.name = 'lavaFlow';
    root.add(m);
  }

  // roads
  const roadMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const asphalt = lin(0x4d515c);
  const dirt = lin(0xc9a572);
  const snowRoad = lin(0x6a717e);
  const trackCol = lin(0x3b3f48);
  const w5 = new Float32Array(5);
  const roadColor = (x, z) => {
    T.biomeWeightsAt(x, z, w5);
    return mix3(mix3(asphalt, dirt, clamp(w5[3] * 1.6, 0, 1)), snowRoad, clamp(w5[2] * 1.4, 0, 1));
  };
  const ribbons = [];
  for (const r of T.roads) {
    ribbons.push(ribbon(r.points, () => r.width, (i) => (r.points[i].bridge ? r.points[i].y + 0.05 : T.heightAt(r.points[i].x, r.points[i].z) + 0.14), (i) => roadColor(r.points[i].x, r.points[i].z)));
  }
  for (const lr of P.localRoads) {
    const pts = lr.pts.map((p) => ({ x: p[0], z: p[1] }));
    const c = lr.kind === 'track' ? trackCol : asphalt;
    ribbons.push(ribbon(pts, () => lr.width, (i) => T.heightAt(pts[i].x, pts[i].z) + 0.16, () => c));
  }
  const roads = new THREE.Mesh(track(mergeRibbons(ribbons)), roadMat);
  roads.name = 'roads';
  root.add(roads);

  // buildings & landmarks (one merged mesh)
  const buildings = new THREE.Mesh(track(geometryFromBuilder(P.mb)), track(new THREE.MeshLambertMaterial({ vertexColors: true })));
  buildings.name = 'buildings';
  root.add(buildings);

  // vegetation, instanced per spatial chunk
  const templates = makePropTemplates(seed);
  const propGeos = {};
  for (const k in templates) propGeos[k] = track(geometryFromBuilder(templates[k]));
  const propMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const propGroup = new THREE.Group();
  propGroup.name = 'props';
  for (const inst of S.instances) {
    const im = new THREE.InstancedMesh(propGeos[inst.type], propMat, inst.count);
    im.instanceMatrix.array.set(inst.matrices);
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(inst.colors, 3);
    im.name = `${inst.type}_${inst.chunk}`;
    im.computeBoundingSphere();
    propGroup.add(im);
  }
  root.add(propGroup);

  // animated windmill + turbines
  const spinners = [];
  const bladeMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  let seedPhase = 1;
  for (const d of P.dynamic) {
    const b = new MeshBuilder();
    const arms = d.type === 'windmill' ? 4 : 3;
    const R = d.radius;
    for (let k = 0; k < arms; k++) {
      const a = (k / arms) * Math.PI * 2;
      if (d.type === 'windmill') {
        b.beam(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0, 0.7, 0x7a5232);
        for (const off of [1.8, 3.6]) {
          const mx = Math.cos(a) * R * 0.62 - Math.sin(a) * off;
          const my = Math.sin(a) * R * 0.62 + Math.cos(a) * off;
          b.beam(mx, my, 0.2, mx + Math.cos(a) * R * 0.36, my + Math.sin(a) * R * 0.36, 0.2, 0.25, 0xf2ede0);
        }
      } else {
        b.beam(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0, 0.6, 0xf5f7fa);
      }
    }
    b.blob(0, 0, 0.2, 1.1, 1.1, 1.1, 0x3a3f4a, () => 0.5, 0, 0);
    const mesh = new THREE.Mesh(track(geometryFromBuilder(b)), bladeMat);
    mesh.position.set(d.x, d.y, d.z);
    mesh.name = d.type;
    mesh.userData.speed = d.type === 'windmill' ? 0.35 : 0.9;
    mesh.userData.phase = (seedPhase++ * 1.7) % 6.28;
    root.add(mesh);
    spinners.push(mesh);
  }

  const lava0 = new THREE.Color(0xff5a1f);
  const lava1 = new THREE.Color(0xffa23a);
  const tmp = new THREE.Color();
  function update(t) {
    for (const s of spinners) s.rotation.z = s.userData.phase + t * s.userData.speed;
    tmp.copy(lava0).lerp(lava1, 0.5 + 0.5 * Math.sin(t * 2.2));
    lavaMat.color.copy(tmp);
    seaMat.color.setHSL(0.5 + 0.004 * Math.sin(t * 0.4), 0.65, 0.55 + 0.01 * Math.sin(t * 0.9));
  }
  function dispose() { for (const d of disposables) d.dispose?.(); }
  return { group: root, update, dispose };
}
