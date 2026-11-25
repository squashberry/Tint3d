// WorldStreamer — culling, LOD, streaming and pooling for Splat Island.
//
//  * Frustum culling      three.js culls every cell mesh against the camera frustum (all cells carry bounding spheres).
//  * Distance culling     small props vanish beyond a tier-dependent range; far landmarks and house cells are released.
//  * LOD                  houses: full interior -> exterior shell -> box+roof; trees: full -> low-poly; terrain: 3 index LODs.
//  * Occlusion culling    software terrain-horizon test (ray march over the heightfield) hides cells behind hills; when the
//                         camera is inside a house everything beyond a short radius is dropped (interior/room culling).
//  * Streaming            house geometry is generated on demand per 128 m cell, time-sliced to a per-frame budget; colliders
//                         are produced only near players; instance buffers of far prop cells are freed.
//  * Pooling              cell meshes and loot pickups come from ObjectPools (no allocation churn while moving).
//  * Governor             a frame-time governor shrinks all ranges when the frame rate drops and recovers when it is healthy.

import * as THREE from 'three';
import { buildHouse, newBuilders, collectHouse, houseHeight } from './houses.js';
import { ObjectPool } from './pool.js';
import { makePropTemplates, makePropTemplatesLOD1, CHUNKS as PROP_CHUNKS } from './props.js';
import { geometryFromBuilder } from './mesh.js';
import { MeshBuilder } from './meshBuilder.js';
import * as C from './config.js';

const { HALF, WORLD } = C;

// Ranges follow the game's QualityManager tiers (low / medium / high / veryhigh / max).
export const PROFILES = {
  low: { houseL0: 70, houseL1: 420, houseL2: 1300, treeL0: 170, treeL1: 750, small: 95, loot: 28, terrain: [650, 1500], static: 1300, budgetMs: 2.0, clouds: 14 },
  medium: { houseL0: 90, houseL1: 560, houseL2: 1800, treeL0: 230, treeL1: 1050, small: 140, loot: 34, terrain: [850, 1900], static: 1800, budgetMs: 2.5, clouds: 26 },
  high: { houseL0: 115, houseL1: 760, houseL2: 2400, treeL0: 310, treeL1: 1450, small: 200, loot: 42, terrain: [1100, 2400], static: 2400, budgetMs: 3.0, clouds: 42 },
  veryhigh: { houseL0: 140, houseL1: 980, houseL2: 3200, treeL0: 400, treeL1: 1950, small: 270, loot: 48, terrain: [1400, 3000], static: 3200, budgetMs: 3.5, clouds: 58 },
  max: { houseL0: 170, houseL1: 1250, houseL2: 4200, treeL0: 520, treeL1: 2600, small: 350, loot: 56, terrain: [1800, 3800], static: 4200, budgetMs: 4.0, clouds: 76 }
};

const HC = 128; // house cell size
const NXH = Math.ceil(WORLD / HC);
const SC = 320; // landmark cell size
const NXS = Math.ceil(WORLD / SC);
const PCELL = WORLD / PROP_CHUNKS;
const TREES = new Set(['pine', 'pineSnow', 'oak', 'palm', 'dead']);
const LAYERS = ['solid', 'glass', 'glow'];

const aabbDist = (px, pz, x0, z0, x1, z1) => Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(z0 - pz, 0, pz - z1));

export class WorldStreamer {
  constructor({ T, houses, staticBuilder, propData, lootPoints, terrainChunks, parent, tier = 'medium' }) {
    this.T = T;
    this.tier = tier;
    this.prof = PROFILES[tier] || PROFILES.medium;
    this.scale = 1;
    this.interiorScale = 1;
    this.interiorLoot = 1;
    this.governor = true;
    this.frame = 0;
    this.stats = {};
    this._cam = new THREE.Vector3();
    this._frozen = null;
    this._ema = 1 / 60;
    this._govT = 0;
    this.inside = null;
    this.job = null;
    this.group = new THREE.Group();
    this.group.name = 'streamed';
    parent.add(this.group);
    this.terrainChunks = terrainChunks || [];

    this.mats = {
      solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      prop: new THREE.MeshLambertMaterial({ vertexColors: true })
    };
    this.houseGroup = new THREE.Group();
    this.houseGroup.name = 'houses';
    this.propGroup = new THREE.Group();
    this.propGroup.name = 'props';
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'landmarks';
    this.group.add(this.houseGroup, this.propGroup, this.staticGroup);

    this.pools = {};
    for (const L of LAYERS) {
      this.pools[L] = new ObjectPool(
        () => { const m = new THREE.Mesh(undefined, this.mats[L]); m.matrixAutoUpdate = false; m.renderOrder = L === 'glass' ? 2 : 0; return m; },
        (m) => { m.visible = false; m.geometry = null; if (m.parent) m.parent.remove(m); },
        0
      );
    }
    this.colCells = new Map();
    this._buildHouseCells(houses);
    this._buildStaticCells(staticBuilder);
    this._buildPropCells(propData);
    this._buildLoot(lootPoints || []);
  }

  setTier(tier) { if (tier !== this.tier) { this.tier = tier; this.prof = PROFILES[tier] || PROFILES.medium; } }
  freeze(camera) { this._frozen = camera ? camera.position.clone() : null; }
  get frozen() { return !!this._frozen; }

  // ------------------------------------------------------------------ houses
  _buildHouseCells(houses) {
    this.cells = new Map();
    for (const h of houses) {
      const cx = Math.floor((h.x + HALF) / HC);
      const cz = Math.floor((h.z + HALF) / HC);
      const key = cz * NXH + cx;
      let r = this.cells.get(key);
      if (!r) {
        r = { key, cx, cz, x0: -HALF + cx * HC, z0: -HALF + cz * HC, x1: -HALF + (cx + 1) * HC, z1: -HALF + (cz + 1) * HC, houses: [], lod: -1, want: -1, meshes: {}, cache: {}, owned: null, occ: 0, hidden: false, ax: 0, az: 0, top: 0, colUsed: 0 };
        this.cells.set(key, r);
      }
      r.houses.push(h);
    }
    for (const r of this.cells.values()) {
      let ax = 0, az = 0, top = 0;
      for (const h of r.houses) { ax += h.x; az += h.z; top = Math.max(top, h.y + houseHeight(h)); }
      r.ax = ax / r.houses.length; r.az = az / r.houses.length; r.top = top;
    }
    this.recList = [...this.cells.values()];
    for (const r of this.recList) this._buildNow(r, 2); // cheap LOD2 for every cell, built once
  }

  _geosFromBuilders(b) {
    const g = {};
    for (const L of LAYERS) g[L] = b[L].vertexCount ? geometryFromBuilder(b[L]) : null;
    return g;
  }
  _buildNow(rec, lod) {
    const b = newBuilders();
    for (const h of rec.houses) buildHouse(h, lod, b);
    rec.cache[lod] = this._geosFromBuilders(b);
    return rec.cache[lod];
  }

  _apply(rec, lod, geos, owned) {
    const prevOwned = rec.owned;
    for (const L of LAYERS) {
      const geo = geos[L];
      let m = rec.meshes[L];
      if (!geo) { if (m) { this.pools[L].release(m); delete rec.meshes[L]; } continue; }
      if (!m) { m = this.pools[L].acquire(); rec.meshes[L] = m; this.houseGroup.add(m); }
      m.geometry = geo;
      m.visible = !rec.hidden;
      m.castShadow = L === 'solid' && lod <= 1;
      m.receiveShadow = L === 'solid';
    }
    if (prevOwned) for (const L of LAYERS) if (prevOwned[L] && prevOwned[L] !== geos[L]) prevOwned[L].dispose();
    rec.owned = owned ? geos : null;
    rec.lod = lod;
  }
  _release(rec) {
    for (const L of LAYERS) if (rec.meshes[L]) { this.pools[L].release(rec.meshes[L]); delete rec.meshes[L]; }
    if (rec.owned) { for (const L of LAYERS) rec.owned[L]?.dispose(); rec.owned = null; }
    rec.lod = -1;
  }

  _ensureColliders(rec) {
    if (this.colCells.has(rec.key)) return;
    const arr = [];
    for (const h of rec.houses) { if (!h.__col) h.__col = collectHouse(h).colliders; for (const c of h.__col) arr.push(c); }
    this.colCells.set(rec.key, arr);
  }
  // Colliders (walls, floors, stairs) for houses near a point. Cells load around any point you ask about.
  queryColliders(x, z, r = 2, out = []) {
    const cx0 = Math.floor((x - r + HALF) / HC), cx1 = Math.floor((x + r + HALF) / HC);
    const cz0 = Math.floor((z - r + HALF) / HC), cz1 = Math.floor((z + r + HALF) / HC);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const rec = this.cells.get(cz * NXH + cx);
      if (!rec) continue;
      this._ensureColliders(rec);
      rec.colUsed = this.frame;
      for (const c of this.colCells.get(rec.key)) if (Math.hypot(c.x - x, c.z - z) <= r + Math.hypot(c.hx, c.hz)) out.push(c);
    }
    return out;
  }

  _findInside(p) {
    const cx = Math.floor((p.x + HALF) / HC);
    const cz = Math.floor((p.z + HALF) / HC);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const rec = this.cells.get((cz + dz) * NXH + (cx + dx));
      if (!rec) continue;
      for (const h of rec.houses) {
        const ddx = p.x - h.x, ddz = p.z - h.z;
        const c = Math.cos(h.rot), s = Math.sin(h.rot);
        const lx = ddx * c - ddz * s, lz = ddx * s + ddz * c;
        if (Math.abs(lx) < h.w / 2 && Math.abs(lz) < h.d / 2 && p.y > h.y - 0.5 && p.y < h.y + h.floors * 3.1 + 1) return h;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ landmarks (merged static builder split into cells)
  _buildStaticCells(mb) {
    this.staticCells = [];
    if (!mb) return;
    const buckets = new Map();
    const P = mb.pos, N = mb.nor, Cc = mb.col, I = mb.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
      const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
      const key = Math.min(NXS - 1, Math.max(0, Math.floor((cz + HALF) / SC))) * NXS + Math.min(NXS - 1, Math.max(0, Math.floor((cx + HALF) / SC)));
      let bk = buckets.get(key);
      if (!bk) { bk = { pos: [], nor: [], col: [], idx: [] }; buckets.set(key, bk); }
      for (const v of [a, b, c]) {
        bk.idx.push(bk.pos.length / 3);
        bk.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        bk.nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        bk.col.push(Cc[v * 3], Cc[v * 3 + 1], Cc[v * 3 + 2]);
      }
    }
    for (const bk of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bk.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bk.nor), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bk.col), 3));
      g.setIndex(new THREE.BufferAttribute(bk.pos.length / 3 > 65535 ? new Uint32Array(bk.idx) : new Uint16Array(bk.idx), 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats.solid);
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.staticGroup.add(m);
      const bs = g.boundingSphere;
      this.staticCells.push({ mesh: m, x: bs.center.x, z: bs.center.z, y: bs.center.y + bs.radius * 0.5, r: bs.radius, occ: 0 });
    }
  }

  // ------------------------------------------------------------------ props (instanced, per cell, 2 LODs)
  _buildPropCells(data) {
    this.pcells = new Map();
    const t0 = makePropTemplates(5);
    const t1 = makePropTemplatesLOD1(5);
    this.propGeo = [{}, {}];
    for (const k in t0) { this.propGeo[0][k] = geometryFromBuilder(t0[k]); this.propGeo[1][k] = geometryFromBuilder(t1[k]); }
    for (const inst of data?.instances || []) {
      let cell = this.pcells.get(inst.chunk);
      if (!cell) {
        const cx = inst.chunk % PROP_CHUNKS;
        const cz = Math.floor(inst.chunk / PROP_CHUNKS);
        cell = { key: inst.chunk, x0: -HALF + cx * PCELL, z0: -HALF + cz * PCELL, x1: -HALF + (cx + 1) * PCELL, z1: -HALF + (cz + 1) * PCELL, entries: [], occ: 0, hidden: false, seen: 0 };
        cell.cx = (cell.x0 + cell.x1) / 2; cell.cz = (cell.z0 + cell.z1) / 2;
        this.pcells.set(inst.chunk, cell);
      }
      cell.entries.push({ type: inst.type, tree: TREES.has(inst.type), count: inst.count, matrices: inst.matrices, colors: inst.colors, attrM: null, attrC: null, m: [null, null], lod: -1 });
    }
    this.pcellList = [...this.pcells.values()];
  }
  _propMesh(entry, lod) {
    let m = entry.m[lod];
    if (m) return m;
    if (!entry.attrM) { entry.attrM = new THREE.InstancedBufferAttribute(entry.matrices, 16); entry.attrC = new THREE.InstancedBufferAttribute(entry.colors, 3); }
    m = new THREE.InstancedMesh(this.propGeo[lod][entry.type], this.mats.prop, entry.count);
    m.instanceMatrix = entry.attrM;
    m.instanceColor = entry.attrC;
    m.matrixAutoUpdate = false;
    m.computeBoundingSphere();
    m.castShadow = lod === 0 && entry.tree;
    m.visible = false;
    this.propGroup.add(m);
    entry.m[lod] = m;
    return m;
  }

  // ------------------------------------------------------------------ loot (pooled pickups near the camera)
  _buildLoot(points) {
    this.loot = points.map((p, i) => ({ ...p, id: i, taken: false }));
    this.lootHash = new Map();
    for (const p of this.loot) {
      const k = Math.floor((p.z + HALF) / 48) * 100 + Math.floor((p.x + HALF) / 48);
      let a = this.lootHash.get(k);
      if (!a) this.lootHash.set(k, (a = []));
      a.push(p);
    }
    const chest = new MeshBuilder();
    chest.box(0, 0, 0, 0.9, 0.5, 0.6, 0, 0x8a5d3b);
    chest.box(0, 0.5, 0, 0.92, 0.2, 0.62, 0, 0xa8713f);
    chest.box(0, 0.2, 0.31, 0.12, 0.25, 0.04, 0, 0xffd23a);
    const ammo = new MeshBuilder();
    ammo.box(0, 0, 0, 0.55, 0.32, 0.35, 0, 0x2a9d8f);
    ammo.box(0, 0.32, 0, 0.45, 0.06, 0.28, 0, 0xf2f6fa);
    this.lootGeo = { chest: geometryFromBuilder(chest), floor: geometryFromBuilder(ammo) };
    this.lootMats = [null, 0x9aa5b1, 0x7b61ff, 0xffb42e].map((c) => (c ? new THREE.MeshLambertMaterial({ vertexColors: true, emissive: c, emissiveIntensity: 0.35 }) : null));
    this.lootGroup = new THREE.Group();
    this.lootGroup.name = 'lootPickups';
    this.group.add(this.lootGroup);
    this.lootPool = new ObjectPool(
      () => new THREE.Mesh(this.lootGeo.chest, this.lootMats[1]),
      (m) => { m.visible = false; if (m.parent) m.parent.remove(m); },
      32
    );
    this.lootShown = new Map();
    this._lootAcc = 1;
  }
  takeLoot(id) { const p = this.loot[id]; if (!p) return; p.taken = true; const m = this.lootShown.get(id); if (m) { this.lootPool.release(m); this.lootShown.delete(id); } }
  _updateLoot(cam, dt) {
    this._lootAcc += dt;
    if (this._lootAcc > 0.25) {
      this._lootAcc = 0;
      const R = this.prof.loot * this.scale * this.interiorLoot;
      const cand = [];
      const k0x = Math.floor((cam.x - R + HALF) / 48), k1x = Math.floor((cam.x + R + HALF) / 48);
      const k0z = Math.floor((cam.z - R + HALF) / 48), k1z = Math.floor((cam.z + R + HALF) / 48);
      for (let z = k0z; z <= k1z; z++) for (let x = k0x; x <= k1x; x++) {
        const a = this.lootHash.get(z * 100 + x);
        if (!a) continue;
        for (const p of a) { if (p.taken) continue; const d = Math.hypot(p.x - cam.x, p.z - cam.z); if (d < R && Math.abs(p.y - cam.y) < 18) cand.push([d, p]); }
      }
      cand.sort((a, b) => a[0] - b[0]);
      const want = new Set(cand.slice(0, 48).map((c) => c[1].id));
      for (const [id, m] of this.lootShown) if (!want.has(id)) { this.lootPool.release(m); this.lootShown.delete(id); }
      for (const id of want) {
        if (this.lootShown.has(id)) continue;
        const p = this.loot[id];
        const m = this.lootPool.acquire();
        m.geometry = this.lootGeo[p.type === 'chest' ? 'chest' : 'floor'];
        m.material = this.lootMats[Math.min(3, Math.max(1, p.tier || 1))];
        m.position.set(p.x, p.y, p.z);
        m.visible = true;
        this.lootGroup.add(m);
        this.lootShown.set(id, m);
      }
    }
    for (const m of this.lootShown.values()) m.rotation.y += dt * 1.2;
  }

  // ------------------------------------------------------------------ occlusion (terrain horizon)
  _occluded(cam, tx, ty, tz) {
    const dx = tx - cam.x;
    const dz = tz - cam.z;
    const margin = 2.0 + Math.hypot(dx, dz) * 0.004;
    for (let i = 1; i <= 14; i++) {
      const t = 0.08 + 0.84 * (i / 14);
      if (this.T.heightAt(cam.x + dx * t, cam.z + dz * t) > cam.y + (ty - cam.y) * t + margin) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ frame update
  update(camera, dt) {
    const cam = this._frozen ? this._cam.copy(this._frozen) : this._cam.copy(camera.position);
    this.frame++;
    this._ema += (dt - this._ema) * 0.05;
    this._govT += dt;
    if (this.governor && this._govT > 1) {
      this._govT = 0;
      if (this._ema > 0.026) this.scale = Math.max(0.55, this.scale * 0.88);
      else if (this._ema < 0.0185 && this.scale < 1) this.scale = Math.min(1, this.scale * 1.05);
    }
    const P = this.prof;
    const sc = this.scale;
    if (this.frame % 3 === 0 || this.frame < 3) this.inside = this._findInside(cam);
    const inside = this.inside;
    this.interiorScale = inside ? 0.4 : 1;
    this.interiorLoot = inside ? 1.4 : 1;
    const R0 = P.houseL0 * sc;
    const R1 = P.houseL1 * sc * this.interiorScale;
    const R2 = P.houseL2 * sc * this.interiorScale;
    const st = this.stats;
    const slice = this.frame % 6;

    // --- house cells: LOD selection
    if (this.frame % 2 === 0 || this.frame < 4) {
      let l0 = 0, l1 = 0, l2 = 0, hid = 0;
      for (const r of this.recList) {
        const d = aabbDist(cam.x, cam.z, r.x0, r.z0, r.x1, r.z1);
        let target = d < R0 ? 0 : d < R1 ? 1 : d < R2 ? 2 : -1;
        if (r.lod >= 0) { // hysteresis: keep the current level until clearly outside it
          const lim = [R0, R1, R2][r.lod] * 1.1;
          if (target > r.lod && d < lim) target = r.lod;
        }
        r.want = target;
        if (target < 0) { if (r.lod >= 0) this._release(r); }
        else if (target !== r.lod) {
          if (target >= 1 && r.cache[target]) this._apply(r, target, r.cache[target], false);
          else if (r.lod < 0) this._apply(r, 2, r.cache[2], false); // instant placeholder while the real LOD builds
        }
        if (d < R0 + 80) this._ensureColliders(r);
        else if (this.colCells.has(r.key) && d > R0 + 200 && this.frame - r.colUsed > 300) this.colCells.delete(r.key);
        if (r.lod === 0) l0++; else if (r.lod === 1) l1++; else if (r.lod === 2) l2++;
        if (r.hidden) hid++;
      }
      st.houseCells = this.recList.length; st.lod0 = l0; st.lod1 = l1; st.lod2 = l2; st.occludedHouseCells = hid;
    }
    // --- build jobs (time-sliced to the tier budget)
    if (!this.job) {
      let best = null, bd = 1e9;
      for (const r of this.recList) {
        if (r.want >= 0 && r.want !== r.lod && !(r.want >= 1 && r.cache[r.want])) {
          const d = aabbDist(cam.x, cam.z, r.x0, r.z0, r.x1, r.z1);
          if (d < bd) { bd = d; best = r; }
        }
      }
      if (best) this.job = { rec: best, lod: best.want, b: newBuilders(), i: 0 };
    }
    let spent = 0;
    if (this.job) {
      const t0 = performance.now();
      const j = this.job;
      while (performance.now() - t0 < P.budgetMs) {
        if (j.i < j.rec.houses.length) buildHouse(j.rec.houses[j.i++], j.lod, j.b);
        else {
          const geos = this._geosFromBuilders(j.b);
          if (j.lod !== 0) j.rec.cache[j.lod] = geos;
          this._apply(j.rec, j.lod, geos, j.lod === 0);
          this.job = null;
          break;
        }
      }
      spent = performance.now() - t0;
    }
    st.jobMs = spent;

    // --- occlusion for house cells (round-robin)
    for (let i = slice; i < this.recList.length; i += 6) {
      const r = this.recList[i];
      if (r.lod < 0) continue;
      const d = Math.hypot(r.ax - cam.x, r.az - cam.z);
      const occ = d > 130 && this._occluded(cam, r.ax, r.top, r.az);
      r.occ = occ ? Math.min(3, r.occ + 1) : Math.max(0, r.occ - 2);
      const hide = r.occ >= 2;
      if (hide !== r.hidden) { r.hidden = hide; for (const L of LAYERS) if (r.meshes[L]) r.meshes[L].visible = !hide; }
    }

    // --- props
    const tL0 = P.treeL0 * sc * (inside ? 0.5 : 1);
    const tL1 = P.treeL1 * sc * this.interiorScale;
    const sm = P.small * sc * (inside ? 0.5 : 1);
    for (let i = slice; i < this.pcellList.length; i += 6) {
      const c = this.pcellList[i];
      const d = aabbDist(cam.x, cam.z, c.x0, c.z0, c.x1, c.z1);
      let hidden = false;
      if (d > 160) {
        const occ = this._occluded(cam, c.cx, this.T.heightAt(c.cx, c.cz) + 14, c.cz);
        c.occ = occ ? Math.min(3, c.occ + 1) : Math.max(0, c.occ - 2);
        hidden = c.occ >= 2;
      } else c.occ = 0;
      c.hidden = hidden;
      let any = false;
      for (const e of c.entries) {
        const lod = hidden ? -1 : e.tree ? (d < tL0 ? 0 : d < tL1 ? 1 : -1) : d < sm ? 0 : -1;
        if (lod !== e.lod) {
          if (e.m[0]) e.m[0].visible = lod === 0;
          if (e.m[1]) e.m[1].visible = lod === 1;
          if (lod >= 0) this._propMesh(e, lod).visible = true;
          e.lod = lod;
        }
        if (lod >= 0) any = true;
      }
      if (any) c.seen = this.frame;
    }
    if (this.frame % 120 === 0) {
      for (const c of this.pcellList) {
        if (this.frame - c.seen <= 600) continue;
        for (const e of c.entries) for (let k = 0; k < 2; k++) if (e.m[k]) { this.propGroup.remove(e.m[k]); e.m[k].dispose(); e.m[k] = null; e.lod = -1; }
      }
    }
    let pm = 0, pv = 0;
    for (const c of this.pcellList) for (const e of c.entries) if (e.lod >= 0) { pm++; pv += e.count; }
    st.propMeshes = pm; st.propInstances = pv;

    // --- landmarks + terrain LOD
    const SR = P.static * sc;
    for (let i = slice; i < this.staticCells.length; i += 6) {
      const s = this.staticCells[i];
      const d = Math.max(0, Math.hypot(s.x - cam.x, s.z - cam.z) - s.r);
      let vis = d < SR;
      if (vis && d > 300) { const o = this._occluded(cam, s.x, s.y + 10, s.z); s.occ = o ? Math.min(3, s.occ + 1) : Math.max(0, s.occ - 2); vis = s.occ < 2; } else s.occ = 0;
      s.mesh.visible = vis;
    }
    let sv = 0;
    for (const s of this.staticCells) if (s.mesh.visible) sv++;
    st.landmarkCells = sv;
    const t0d = P.terrain[0] * sc;
    const t1d = P.terrain[1] * sc;
    for (let i = slice; i < this.terrainChunks.length; i += 6) {
      const ch = this.terrainChunks[i];
      const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
      const lod = d < t0d ? 0 : d < t1d ? 1 : 2;
      if (lod !== ch.lod) { ch.lod = lod; ch.mesh.geometry.setIndex(ch.lods[lod]); }
    }
    const lc = [0, 0, 0];
    for (const ch of this.terrainChunks) lc[ch.lod]++;
    st.terrainLod = lc;
    this._updateLoot(cam, dt);
    st.lootShown = this.lootShown.size;
    st.lootPoolIdle = this.lootPool.idle;
    st.scale = +sc.toFixed(2);
    st.tier = this.tier;
    st.inside = inside ? inside.id : null;
    st.colliderCells = this.colCells.size;
    st.frozen = !!this._frozen;
  }

  dispose() {
    for (const r of this.recList) { this._release(r); for (const k in r.cache) for (const L of LAYERS) r.cache[k][L]?.dispose(); }
    for (const c of this.pcellList) for (const e of c.entries) for (const m of e.m) m?.dispose();
    for (const s of this.staticCells) s.mesh.geometry.dispose();
    for (const lod of this.propGeo) for (const g of Object.values(lod)) g.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.group.parent?.remove(this.group);
  }
}
