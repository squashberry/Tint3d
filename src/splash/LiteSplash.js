// Lightweight splash for weak GPUs/CPUs (old integrated graphics, low core counts, reduced motion).
// No WebGL, no per-frame JavaScript painting: the paint-bomb flight, the splat and the logo are CSS
// transform/opacity animations that the browser composites on its own, so they keep moving even while
// the game module is busy loading. Progress is still the real loading progress.
export class LiteSplash {
  constructor({ root, tracker }) {
    this.root = root;
    this.tracker = tracker;
    this.startedAt = performance.now();
    this.disposed = false;
    this.leaving = false;
  }

  start() {
    const root = this.root;
    document.body.classList.add('splash-on');
    root.classList.remove('boot');
    root.classList.add('lite');
    root.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
    root.querySelector('#splash-skip')?.remove();
    root.querySelector('#splash-sound')?.remove();
    const stage = document.createElement('div');
    stage.className = 'lite-stage';
    stage.innerHTML = '<i class="bomb"></i><i class="splat s1"></i><i class="splat s2"></i><i class="splat s3"></i><i class="splat s4"></i><i class="splat s5"></i><i class="drip d1"></i><i class="drip d2"></i><i class="drip d3"></i><i class="drip d4"></i>';
    root.insertBefore(stage, root.firstChild);
    this.fill = root.querySelector('#splash-fill');
    this.label = root.querySelector('#splash-label');
    this.drop = root.querySelector('#splash-drop');
    this.timer = setInterval(() => this.tick(), 160);
  }

  tick() {
    if (this.disposed) return;
    const progress = this.tracker.progress;
    this.fill.style.transform = `scaleX(${Math.max(0.02, progress)})`;
    const text = progress < 0.3 ? 'Preparing the paint...' : progress < 0.62 ? 'Loading the arena...' : progress < 0.93 ? 'Getting things colourful...' : 'Almost ready...';
    if (this.label.textContent !== text) this.label.textContent = text;
    const shown = (performance.now() - this.startedAt) / 1000;
    if (!this.leaving && this.tracker.ready && shown > 2.6) {
      this.leaving = true;
      this.drop.classList.add('fall');
      setTimeout(() => this.root.classList.add('leaving'), 900);
      setTimeout(() => this.dispose(), 1600);
    }
  }

  fail() { this.tracker.force(); this.dispose(); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    document.body.classList.remove('splash-on');
    this.root.remove();
    window.dispatchEvent(new Event('tint3d:splash-done'));
  }
}
