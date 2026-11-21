// Grid navigation for bots: walkability map, A* with height-aware links and
// line-of-walk path smoothing. Pure logic: the game injects the world queries.

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, priority) {
    const items = this.items;
    items.push({ node, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].priority < items[m].priority) m = l;
        if (r < items.length && items[r].priority < items[m].priority) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.node;
  }
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];

export class NavGrid {
  /**
   * half: half arena size, cell: cell size in metres,
   * isWalkable(x, z, height): can a bot stand here, heightAt(x, z): surface height.
   */
  constructor({ half, cell, isWalkable, heightAt, maxStep = 0.5, maxJump = 1.7, maxDrop = 4 }) {
    this.maxJump = maxJump;
    this.maxDrop = maxDrop;
    this.half = half;
    this.cell = cell;
    this.size = Math.ceil((half * 2) / cell);
    this.isWalkable = isWalkable;
    this.heightAt = heightAt;
    this.maxStep = maxStep;
    this.walkable = new Uint8Array(this.size * this.size);
    this.height = new Float32Array(this.size * this.size);
    this.gScore = new Float32Array(this.size * this.size);
    this.cameFrom = new Int32Array(this.size * this.size);
    this.stamp = new Uint32Array(this.size * this.size);
    this.search = 0;
  }

  rebuild() {
    for (let gz = 0; gz < this.size; gz++) {
      for (let gx = 0; gx < this.size; gx++) {
        const [x, z] = this.cellCenter(gx, gz);
        const h = this.heightAt(x, z);
        const i = gz * this.size + gx;
        this.height[i] = h;
        this.walkable[i] = Math.abs(x) < this.half - 1.2 && Math.abs(z) < this.half - 1.2 && this.isWalkable(x, z, h) ? 1 : 0;
      }
    }
  }

  cellCenter(gx, gz) { return [-this.half + (gx + 0.5) * this.cell, -this.half + (gz + 0.5) * this.cell]; }
  toCell(x, z) {
    const gx = Math.floor((x + this.half) / this.cell);
    const gz = Math.floor((z + this.half) / this.cell);
    if (gx < 0 || gz < 0 || gx >= this.size || gz >= this.size) return -1;
    return gz * this.size + gx;
  }
  isCellWalkable(i) { return i >= 0 && this.walkable[i] === 1; }

  nearestWalkable(x, z, maxRadius = 8) {
    const start = this.toCell(x, z);
    if (this.isCellWalkable(start)) return start;
    const cx = Math.floor((x + this.half) / this.cell);
    const cz = Math.floor((z + this.half) / this.cell);
    const reach = Math.ceil(maxRadius / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= this.size || gz >= this.size) continue;
        const i = gz * this.size + gx;
        if (!this.walkable[i]) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /** Walk link (small step), jump link (climb up to maxJump) or drop link (fall down to maxDrop). */
  linkOk(a, b, allowVertical = false) {
    if (this.walkable[b] !== 1) return false;
    const dh = this.height[b] - this.height[a];
    if (Math.abs(dh) <= this.maxStep) return true;
    if (!allowVertical) return false;
    return dh > 0 ? dh <= this.maxJump : -dh <= this.maxDrop;
  }

  /** Returns [{x, z}] from start to goal (excluding the start), or null. */
  findPath(sx, sz, gx, gz, avoidCost = null) {
    const start = this.nearestWalkable(sx, sz);
    const goal = this.nearestWalkable(gx, gz);
    if (start < 0 || goal < 0) return null;
    const n = this.size;
    const search = ++this.search;
    const open = new MinHeap();
    this.gScore[start] = 0;
    this.stamp[start] = search;
    this.cameFrom[start] = -1;
    const goalX = goal % n;
    const goalZ = (goal / n) | 0;
    open.push(start, 0);
    let found = false;
    const closed = new Uint8Array(n * n);
    let guard = n * n * 4;
    while (open.size && guard-- > 0) {
      const current = open.pop();
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === goal) { found = true; break; }
      const cx = current % n;
      const cz = (current / n) | 0;
      for (const [dx, dz, cost] of NEIGHBOURS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const next = nz * n + nx;
        const orthogonal = dx === 0 || dz === 0;
        if (closed[next] || !this.linkOk(current, next, orthogonal)) continue;
        if (!orthogonal) {
          if (!this.linkOk(current, cz * n + nx) || !this.linkOk(current, nz * n + cx)) continue;
        }
        const rise = this.height[next] - this.height[current];
        let extra = avoidCost ? avoidCost(next) : 0;
        if (rise > this.maxStep) extra += 3 + rise * 1.5;
        else if (rise < -this.maxStep) extra += 0.8;
        const g = this.gScore[current] + cost + extra;
        if (this.stamp[next] !== search || g < this.gScore[next]) {
          this.stamp[next] = search;
          this.gScore[next] = g;
          this.cameFrom[next] = current;
          open.push(next, g + Math.hypot(nx - goalX, nz - goalZ));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1 && c !== start; c = this.cameFrom[c]) cells.push(c);
    cells.reverse();
    const points = cells.map((c) => {
      const [x, z] = this.cellCenter(c % n, (c / n) | 0);
      return { x, z, h: this.height[c] };
    });
    const smoothed = this.smooth(sx, sz, points);
    let previous = this.height[start];
    for (const p of smoothed) {
      p.rise = p.h - previous;
      p.jump = p.rise > this.maxStep;
      previous = p.h;
    }
    return smoothed;
  }

  /** Greedy string pulling: skip waypoints while the straight line stays walkable. */
  smooth(sx, sz, points) {
    if (points.length < 3) return points;
    const out = [];
    let from = { x: sx, z: sz };
    let i = 0;
    while (i < points.length) {
      let j = points.length - 1;
      while (j > i && !this.lineWalkable(from.x, from.z, points[j].x, points[j].z)) j--;
      out.push(points[j]);
      from = points[j];
      i = j + 1;
    }
    return out;
  }

  lineWalkable(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)));
    let previous = this.toCell(x0, z0);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = this.toCell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (i < 0 || !this.walkable[i]) return false;
      if (previous >= 0 && Math.abs(this.height[previous] - this.height[i]) > this.maxStep) return false;
      previous = i;
    }
    return true;
  }
}
