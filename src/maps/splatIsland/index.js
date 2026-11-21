// Splat Island — battle-royale map for Tint3d.
//
//   import { createSplatIsland } from './maps/splatIsland/index.js';
//   const island = createSplatIsland();          // generate data + THREE objects
//   scene.add(island.group);                      // add to your scene
//   island.update(elapsedSeconds);                // animates windmills, lava, water
//   island.heightAt(x, z);                        // ground height for characters
//
// Pass { headless: true } to skip THREE objects (server / tests).

import { generateTerrain } from './terrain.js';
import { buildPOIs } from './poi.js';
import { scatterProps } from './props.js';
import { buildIslandObject } from './mesh.js';
import { mulberry32 } from './noise.js';
import * as C from './config.js';

export * as config from './config.js';
export { renderMinimap, worldToMap } from './minimap.js';

class SpatialHash {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insert(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
      for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
        const k = this.key(ix, iz);
        let b = this.map.get(k);
        if (!b) this.map.set(k, (b = []));
        b.push(item);
      }
    }
  }
  query(minX, minZ, maxX, maxZ, out) {
    const c = this.cell;
    const seen = new Set();
    for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
      for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
        const b = this.map.get(this.key(ix, iz));
        if (!b) continue;
        for (const it of b) if (!seen.has(it)) { seen.add(it); out.push(it); }
      }
    }
    return out;
  }
}

export function createSplatIsland(opts = {}) {
  const { seed = 20260, headless = false } = opts;
  const terrain = generateTerrain({ seed });
  const built = buildPOIs(terrain, seed + 1);
  const scatter = scatterProps(terrain, built, seed + 2);

  // ---- collision data: oriented boxes (buildings, bridges…) and tree/rock circles
  const hash = new SpatialHash(32);
  for (const b of built.colliders) {
    const c = Math.abs(Math.cos(b.rot));
    const s = Math.abs(Math.sin(b.rot));
    const ex = b.hx * c + b.hz * s;
    const ez = b.hx * s + b.hz * c;
    hash.insert(b, b.x - ex, b.z - ez, b.x + ex, b.z + ez);
  }
  const tc = scatter.treeColliders;
  for (let i = 0; i < tc.length; i += 3) {
    const item = { kind: 'circle', x: tc[i], z: tc[i + 1], r: tc[i + 2] };
    hash.insert(item, item.x - item.r, item.z - item.r, item.x + item.r, item.z + item.r);
  }
  const queryColliders = (x, z, r = 2, out = []) => hash.query(x - r, z - r, x + r, z + r, out);

  // ---- battle-royale helpers
  function randomLandPoint(rand = Math.random, { minHeight = 4, maxSlope = 0.08, margin = 0.12 } = {}) {
    for (let i = 0; i < 400; i++) {
      const x = (rand() * 2 - 1) * C.HALF * 0.9;
      const z = (rand() * 2 - 1) * C.HALF * 0.9;
      if (terrain.maskAt(x, z) < margin) continue;
      if (terrain.heightAt(x, z) < minHeight || terrain.slopeAt(x, z) > maxSlope) continue;
      if (scatter.blockedAt(x, z) && rand() < 0.9) continue;
      return { x, y: terrain.heightAt(x, z), z };
    }
    return { x: 0, y: terrain.heightAt(0, 0), z: 0 };
  }
  function busRoute(rand = Math.random) {
    const a = rand() * Math.PI * 2;
    const d = [Math.cos(a), Math.sin(a)];
    const off = (rand() * 2 - 1) * 450;
    const p = [-d[1], d[0]];
    const alt = 420;
    return {
      altitude: alt,
      speed: 70,
      start: { x: -d[0] * 1900 + p[0] * off, y: alt, z: -d[1] * 1900 + p[1] * off },
      end: { x: d[0] * 1900 + p[0] * off, y: alt, z: d[1] * 1900 + p[1] * off }
    };
  }
  // Nested storm circles that always contain the final circle.
  function stormPlan(seedValue = 1) {
    const rand = mulberry32(seedValue);
    const final = randomLandPoint(rand, { minHeight: 5, maxSlope: 0.06, margin: 0.16 });
    const radii = [1800, 1050, 640, 360, 190, 90, 35];
    const times = [0, 150, 120, 100, 80, 60, 45];
    const dmg = [1, 1, 2, 4, 7, 10, 10];
    const circles = [];
    let cx = 0;
    let cz = 0;
    radii.forEach((r, i) => {
      if (i > 0) {
        const k = r / radii[i - 1];
        cx = final.x + (cx - final.x) * k;
        cz = final.z + (cz - final.z) * k;
      }
      circles.push({ x: cx, z: cz, radius: r, shrinkSeconds: times[i], damagePerSecond: dmg[i] });
    });
    return { final, circles };
  }

  const view = headless ? null : buildIslandObject(terrain, built, scatter, seed);

  return {
    seed,
    group: view?.group ?? null,
    update: view?.update ?? (() => {}),
    dispose: view?.dispose ?? (() => {}),

    // terrain queries
    heightAt: terrain.heightAt,
    normalAt: terrain.normalAt,
    slopeAt: terrain.slopeAt,
    biomeAt: terrain.biomeAt,
    isLand: terrain.isLand,
    inWater: (x, z) => terrain.heightAt(x, z) < 0 || terrain.lakeRn(x, z) < 0.97 || terrain.riverMargin(x, z) < -1,
    isInsideWorld: (x, z) => Math.abs(x) <= C.HALF && Math.abs(z) <= C.HALF,

    // map content
    pois: terrain.pois,
    landmarks: built.landmarks,
    loot: built.loot,
    colliders: built.colliders,
    treeColliders: scatter.treeColliders,
    queryColliders,
    roads: terrain.roads,
    localRoads: built.localRoads,
    bridges: terrain.bridges,
    river: terrain.river,
    lake: terrain.lake,
    waterBodies: terrain.waterBodies,
    volcano: terrain.volcano,
    stats: { ...terrain.stats, buildings: built.colliders.length, trees: scatter.treeColliders.length / 3, props: scatter.counts, lootPoints: built.loot.length, landmarks: built.landmarks.length },

    // battle-royale helpers
    randomLandPoint,
    busRoute,
    stormPlan,

    // raw data for minimap / debugging
    terrain,
    built
  };
}
