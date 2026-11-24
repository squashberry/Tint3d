// Generic object pool — reuse meshes, tracers, loot items and pickups instead of allocating/disposing every time.
//
//   const tracers = new ObjectPool(() => makeTracerMesh(), (m) => { m.visible = false; }, 32);
//   const t = tracers.acquire(); t.visible = true; ...; tracers.release(t);

export class ObjectPool {
  constructor(create, reset = () => {}, prewarm = 0) {
    this.create = create;
    this.reset = reset;
    this.free = [];
    this.live = new Set();
    for (let i = 0; i < prewarm; i++) { const o = create(); reset(o); this.free.push(o); }
  }
  acquire() {
    const o = this.free.pop() || this.create();
    this.live.add(o);
    return o;
  }
  release(o) {
    if (!this.live.delete(o)) return;
    this.reset(o);
    this.free.push(o);
  }
  releaseAll() { for (const o of [...this.live]) this.release(o); }
  get inUse() { return this.live.size; }
  get idle() { return this.free.length; }
}
