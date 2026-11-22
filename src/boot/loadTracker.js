// Real loading progress for the splash screen. Asset loaders call begin()/end(); nothing here is faked.
// Progress is a high-water mark (it never moves backwards when new assets are registered).
class LoadTracker {
  constructor() {
    this.seq = 0;
    this.begun = 0;
    this.finished = 0;
    this.pending = new Map();
    this.stages = { boot: false, main: false };
    this.lastChange = performance.now();
    this.high = 0.04;
    this.forced = false;
  }

  begin(name) {
    const id = ++this.seq;
    this.pending.set(id, name);
    this.begun++;
    this.lastChange = performance.now();
    return id;
  }

  end(id) {
    if (this.pending.delete(id)) {
      this.finished++;
      this.lastChange = performance.now();
    }
  }

  /** Convenience: track a promise from start to settle. */
  track(promise, name) {
    const id = this.begin(name);
    const done = () => this.end(id);
    promise.then(done, done);
    return promise;
  }

  setStage(name) {
    this.stages[name] = true;
    this.lastChange = performance.now();
  }

  /** The game is ready once the module graph evaluated and every registered asset settled. */
  get ready() {
    if (this.forced) return true;
    return this.stages.main && this.pending.size === 0 && this.begun > 0 && performance.now() - this.lastChange > 350;
  }

  get progress() {
    if (this.ready) { this.high = 1; return 1; }
    const assets = this.begun ? this.finished / this.begun : 0;
    const value = 0.06 + (this.stages.boot ? 0.1 : 0) + (this.stages.main ? 0.2 : 0) + 0.62 * assets * (this.stages.main ? 1 : 0.4);
    this.high = Math.max(this.high, Math.min(0.985, value));
    return this.high;
  }

  /** Last-resort escape hatch so a stuck request can never trap the player on the splash screen. */
  force() { this.forced = true; }
}

export const loadTracker = new LoadTracker();
